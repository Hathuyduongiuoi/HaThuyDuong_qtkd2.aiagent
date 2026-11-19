"""Web server & REST API for Hung Phat Market Expansion AI Agent (AI301 - Project 04)."""

from __future__ import annotations

import argparse
import email.parser
import gzip
import html as html_lib
import json
import mimetypes
import os
import re
import socket
import threading
import traceback
import uuid
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import unquote, urlparse

from agent.auth_analytics import (
    SESSION_COOKIE_NAME,
    SESSION_TTL_SEC,
    authenticate_user,
    create_session_token,
    get_admin_dashboard_stats,
    get_site_settings,
    get_user_personal_stats,
    is_owner_identity,
    log_analytics_event,
    parse_cookie_header,
    register_user,
    request_password_reset_otp,
    reset_password_with_otp,
    toggle_user_lock,
    update_site_settings,
    verify_session_token,
)
from agent.exporters import (
    export_analysis_excel_bytes,
    export_cleaned_excel_bytes,
    export_report_docx_bytes,
)
from agent.llm_client import chat_with_assistant, extract_table_and_text_with_gemini_vision
from agent.models import CANONICAL_TABLES, TABLE_LABELS_VI
from agent.orchestrator import MarketEvaluationOrchestrator
from agent.parsers import (
    COLUMN_ALIASES,
    classify_sheets_to_canonical,
    fetch_google_sheet_url,
    fetch_lark_base_url,
    parse_csv_bytes,
    parse_docx_bytes,
    parse_html_tables_bytes,
    parse_json_records_bytes,
    parse_legacy_office_via_textutil,
    parse_markdown_or_text_bytes,
    parse_number,
    parse_ods_bytes,
    parse_odt_bytes,
    parse_pdf_bytes,
    parse_xls_bytes,
    parse_xlsx_bytes,
    parse_xml_records_bytes,
    parse_zip_archive_bytes,
)
from agent.skills.skill_evaluate_rank import DEFAULT_CRITERIA
from agent.skills.skill_company_stats import _is_non_metric_col


ROOT_DIR = Path(__file__).resolve().parent
WEB_DIR = ROOT_DIR / "web"
SAMPLES_DIR = ROOT_DIR / "data" / "samples"
_RUNTIME_DIR = Path("/tmp/htd_runtime") if os.environ.get("VERCEL") else (ROOT_DIR / ".htd_data")
_RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
AUDIT_DIR = _RUNTIME_DIR / "audit_logs"
AUDIT_DIR.mkdir(parents=True, exist_ok=True)
SESSION_CACHE_DIR = Path("/tmp/htd_sessions")
SESSION_CACHE_DIR.mkdir(parents=True, exist_ok=True)
if (ROOT_DIR / "contact_requests.jsonl").is_file() and not (_RUNTIME_DIR / "contact_requests.jsonl").is_file():
    try:
        (ROOT_DIR / "contact_requests.jsonl").replace(_RUNTIME_DIR / "contact_requests.jsonl")
    except Exception:
        pass
CONTACT_FILE = _RUNTIME_DIR / "contact_requests.jsonl"
_CONTACT_LOCK = threading.Lock()


def _prune_old_audit_files(keep: int = 5) -> None:
    """Keep audit_logs/ compact so local workspace stays cleanly under 100 files."""
    try:
        jsons = sorted(AUDIT_DIR.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
        for old in jsons[keep:]:
            old.unlink(missing_ok=True)
    except Exception:
        pass


def _save_run_session(run_id: str) -> None:
    if not run_id or run_id not in ORCHESTRATOR.sessions:
        return
    sess = ORCHESTRATOR.sessions[run_id]
    snap = {
        "last_response": sess.get("last_response") or {},
        "cleaned_sheets": sess.get("cleaned_sheets") or {},
        "raw_sheets": sess.get("raw_sheets") or {},
    }
    try:
        (SESSION_CACHE_DIR / f"{run_id}.session.json").write_text(
            json.dumps(snap, ensure_ascii=False, default=str),
            encoding="utf-8",
        )
        _prune_old_audit_files(5)
    except Exception:
        pass


def _get_run_session(run_id: str) -> Optional[Dict[str, Any]]:
    if run_id in ORCHESTRATOR.sessions:
        return ORCHESTRATOR.sessions[run_id]
    snap_path = SESSION_CACHE_DIR / f"{run_id}.session.json"
    if snap_path.is_file():
        try:
            sess = json.loads(snap_path.read_text(encoding="utf-8"))
            if isinstance(sess, dict):
                ORCHESTRATOR.sessions[run_id] = sess
                return sess
        except Exception:
            pass
    return None

# Clean, keyword-rich URLs served by the single-page shell (index.html)
SPA_ROUTES = {
    "/hathuyduong2403": "Hà Thuỳ Dương",
    "/gioi-thieu": "Giới thiệu",
    "/quy-trinh": "Quy trình",
    "/dich-vu": "Dịch vụ",
    "/phan-hoi": "Phản hồi",
    "/lien-he": "Liên hệ",
    "/gui-du-lieu": "Gửi dữ liệu",
    "/xu-ly": "Nhận & làm sạch dữ liệu",
    "/ket-qua": "Kết quả phân tích",
    "/faq": "Hỏi đáp",
    "/chinh-sach-bao-mat": "Chính sách bảo mật",
    "/dieu-khoan": "Điều khoản sử dụng",
}
SITEMAP_PATHS = ["/", "/gioi-thieu", "/quy-trinh", "/dich-vu", "/gui-du-lieu", "/lien-he", "/faq", "/chinh-sach-bao-mat", "/dieu-khoan"]


def build_sitemap_xml(base_url: str) -> str:
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    items = []
    for p in SITEMAP_PATHS:
        prio = "1.0" if p == "/" else "0.8" if p in ("/dich-vu", "/gui-du-lieu", "/gioi-thieu") else "0.5"
        items.append(
            f"  <url><loc>{html_lib.escape(base_url + p)}</loc><lastmod>{today}</lastmod>"
            f"<changefreq>weekly</changefreq><priority>{prio}</priority></url>"
        )
    return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + "\n".join(items) + "\n</urlset>\n"


def build_robots_txt(base_url: str) -> str:
    return (
        "User-agent: *\n"
        "Allow: /\n"
        "Disallow: /api/\n"
        f"Sitemap: {base_url}/sitemap.xml\n"
    )


def save_contact_request(payload: Dict[str, Any]) -> None:
    """Validate and append a contact form submission to contact_requests.jsonl."""
    if str(payload.get("website") or "").strip():
        return  # honeypot filled: silently drop bot submissions
    name = str(payload.get("name") or "").strip()[:120]
    contact = str(payload.get("contact") or "").strip()[:160]
    message = str(payload.get("message") or "").strip()[:2000]
    topic = str(payload.get("topic") or "").strip()[:120]
    if not name:
        raise ValueError("Vui lòng nhập họ và tên.")
    is_email = bool(re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]{2,}", contact))
    is_phone = len(re.sub(r"\D", "", contact)) >= 8
    if not (is_email or is_phone):
        raise ValueError("Vui lòng nhập email hoặc số điện thoại hợp lệ.")
    record = {
        "received_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "name": name,
        "contact": contact,
        "topic": topic,
        "message": message,
    }
    with _CONTACT_LOCK:
        with CONTACT_FILE.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(record, ensure_ascii=False) + "\n")


def load_dotenv_file(env_path: Path) -> None:
    """Load simple KEY=VALUE entries from .env into os.environ if not already set."""
    if not env_path.is_file():
        return
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        k = k.strip()
        v = v.strip().strip('"').strip("'")
        if k and k not in os.environ:
            os.environ[k] = v


load_dotenv_file(ROOT_DIR / ".env")

ORCHESTRATOR = MarketEvaluationOrchestrator(log_dir=AUDIT_DIR)
STAGED_INPUTS: Dict[str, Dict[str, Any]] = {}


SAMPLE_CATALOG = [
    {
        "id": "case1_thong_thuong",
        "title": "Kịch bản 1: Thông thường (Có bẫy trùng nguồn & quá tải triển khai)",
        "description": (
            "4 địa bàn (Bình Dương, Đà Nẵng, Hải Phòng, Cần Thơ). Có số liệu lặp cùng nguồn tại Hải Phòng, "
            "lệch kỳ quý/năm tại Cần Thơ, Hải Phòng quy mô lớn nhất nhưng quá tải hỗ trợ tại chỗ, Cần Thơ không khớp sản phẩm."
        ),
        "file": "case1_thong_thuong.xlsx",
    },
    {
        "id": "case2_thieu_mau_thuan",
        "title": "Kịch bản 2: Thiếu dữ liệu & Mâu thuẫn (Kích hoạt HITL Bước 2)",
        "description": (
            "Nghệ An thiếu phản hồi khách hàng & năng lực triển khai; Đà Nẵng mâu thuẫn 50% quy mô thị trường "
            "và mâu thuẫn yêu cầu tại chỗ giữa 2 nguồn. Agent dừng tại Bước 2 để con người xử lý."
        ),
        "file": "case2_thieu_mau_thuan.xlsx",
    },
    {
        "id": "case3_ranh_gioi_quy_tac",
        "title": "Kịch bản 3: Tại ranh giới quy tắc (Fit=6.00 vs 5.95 & Sát điểm #2/#3)",
        "description": (
            "Đà Nẵng đạt đúng ngưỡng Fit=6.00 và Capability=6.00; Hải Phòng rớt sát ngưỡng (5.95 < 6.0); "
            "Đà Nẵng (#2) chỉ hơn Khánh Hòa (#3) 0.13 điểm -> kích hoạt Kiểm tra ranh giới (HITL #2)."
        ),
        "file": "case3_ranh_gioi_quy_tac.xlsx",
    },
]


def parse_multipart_form(content_type: str, body: bytes) -> Tuple[Dict[str, List[str]], List[Dict[str, Any]]]:
    """Parse multipart/form-data cleanly using stdlib email.parser."""
    header_bytes = f"Content-Type: {content_type}\r\nMIME-Version: 1.0\r\n\r\n".encode("latin-1")
    msg = email.parser.BytesParser().parsebytes(header_bytes + body)
    fields: Dict[str, List[str]] = {}
    files: List[Dict[str, Any]] = []

    if not msg.is_multipart():
        return fields, files

    for part in msg.get_payload():
        name = part.get_param("name", header="content-disposition")
        if not name:
            continue
        filename = part.get_filename()
        payload = part.get_payload(decode=True) or b""
        if filename is not None and filename != "":
            files.append(
                {
                    "field": name,
                    "filename": os.path.basename(filename),
                    "content": payload,
                }
            )
        else:
            fields.setdefault(name, []).append(payload.decode("utf-8", errors="replace"))
    return fields, files


def _dispatch_uploaded_file_bytes(
    content: bytes,
    fname: str,
    gemini_key: str = "",
    gemini_model: str = "gemini-2.5-flash",
) -> Tuple[Dict[str, List[Dict[str, Any]]], Dict[str, List[str]]]:
    """Dispatch any uploaded document, spreadsheet, PDF, archive, or image into sheets & text paragraphs."""
    ext = Path(fname).suffix.lower()
    sheets_out: Dict[str, List[Dict[str, Any]]] = {}
    docs_out: Dict[str, List[str]] = {}

    if ext in (".csv", ".tsv"):
        sheets_out = parse_csv_bytes(content, filename=fname)
    elif ext in (".txt", ".md", ".markdown", ".log", ".yaml", ".yml"):
        s_map, paras = parse_markdown_or_text_bytes(content, filename=fname)
        sheets_out = s_map
        if paras:
            docs_out[fname] = paras
    elif ext in (".xlsx", ".xlsm"):
        sheets_out = parse_xlsx_bytes(content, filename=fname)
    elif ext == ".xls":
        s_map, paras = parse_xls_bytes(content, filename=fname)
        sheets_out = s_map
        if paras:
            docs_out[fname] = paras
    elif ext == ".ods":
        sheets_out = parse_ods_bytes(content, filename=fname)
    elif ext == ".docx":
        s_map, paras = parse_docx_bytes(content, filename=fname)
        sheets_out = s_map
        if paras:
            docs_out[fname] = paras
    elif ext == ".odt":
        s_map, paras = parse_odt_bytes(content, filename=fname)
        sheets_out = s_map
        if paras:
            docs_out[fname] = paras
    elif ext in (".doc", ".rtf", ".webarchive"):
        s_map, paras = parse_legacy_office_via_textutil(content, filename=fname)
        sheets_out = s_map
        if paras:
            docs_out[fname] = paras
    elif ext in (".html", ".htm", ".mhtml"):
        s_map, paras = parse_html_tables_bytes(content, filename=fname)
        sheets_out = s_map
        if paras:
            docs_out[fname] = paras
    elif ext == ".xml":
        s_map, paras = parse_xml_records_bytes(content, filename=fname)
        sheets_out = s_map
        if paras:
            docs_out[fname] = paras
    elif ext == ".json":
        sheets_out = parse_json_records_bytes(content, filename=fname)
    elif ext == ".pdf":
        s_map, paras = parse_pdf_bytes(content, filename=fname)
        if not s_map and not paras and gemini_key:
            s_map, paras = extract_table_and_text_with_gemini_vision(
                gemini_key, gemini_model, content, "application/pdf", fname
            )
        sheets_out = s_map
        if paras:
            docs_out[fname] = paras
    elif ext in (".png", ".jpg", ".jpeg", ".webp", ".gif"):
        if not gemini_key:
            raise ValueError(
                f"File ảnh '{fname}' cần Gemini API Key (trong Cài đặt hoặc .env) để AI Vision trích xuất bảng và số liệu."
            )
        mime_map = {
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".webp": "image/webp",
            ".gif": "image/gif",
        }
        s_map, paras = extract_table_and_text_with_gemini_vision(
            gemini_key, gemini_model, content, mime_map[ext], fname
        )
        sheets_out = s_map
        if paras:
            docs_out[fname] = paras
    elif ext == ".zip":
        return parse_zip_archive_bytes(
            content,
            filename=fname,
            dispatch_fn=lambda b, inner_fn: _dispatch_uploaded_file_bytes(b, inner_fn, gemini_key, gemini_model),
        )
    else:
        # Unknown extension: auto-sniff ZIP / JSON / HTML / XML / Markdown-CSV text cleanly
        if content.startswith(b"PK\x03\x04"):
            try:
                sheets_out = parse_xlsx_bytes(content, filename=fname)
                return sheets_out, docs_out
            except Exception:
                return parse_zip_archive_bytes(
                    content,
                    filename=fname,
                    dispatch_fn=lambda b, inner_fn: _dispatch_uploaded_file_bytes(b, inner_fn, gemini_key, gemini_model),
                )
        head = content.lstrip()[:128].lower()
        if b"\x00" in content[:4096] and not content.startswith(b"\xff\xfe") and not content.startswith(b"\xfe\xff"):
            raise ValueError(
                f"Định dạng file '{fname}' chưa hỗ trợ (file nhị phân). Hãy gửi Excel (.xlsx/.xls/.csv), Word (.docx), "
                "PDF, JSON/Lark, XML, HTML, Markdown, ZIP hoặc ảnh."
            )
        if head.startswith(b"{") or head.startswith(b"["):
            sheets_out = parse_json_records_bytes(content, filename=fname)
        elif b"<html" in head or b"<table" in head:
            s_map, paras = parse_html_tables_bytes(content, filename=fname)
            sheets_out = s_map
            if paras:
                docs_out[fname] = paras
        elif head.startswith(b"<?xml"):
            s_map, paras = parse_xml_records_bytes(content, filename=fname)
            sheets_out = s_map
            if paras:
                docs_out[fname] = paras
        else:
            s_map, paras = parse_markdown_or_text_bytes(content, filename=fname)
            sheets_out = s_map
            if paras:
                docs_out[fname] = paras

    return sheets_out, docs_out


def load_inputs_from_sources(
    uploaded_files: List[Dict[str, Any]],
    google_sheet_urls: List[str],
    sample_id: str = "",
    fetch_all_tabs: bool = True,
    lark_base_urls: Optional[List[str]] = None,
    lark_app_id: str = "",
    lark_app_secret: str = "",
    lark_token: str = "",
    document_texts_out: Optional[Dict[str, List[str]]] = None,
    gemini_key: str = "",
    gemini_model: str = "gemini-2.5-flash",
) -> Tuple[Dict[str, List[Dict[str, Any]]], List[Dict[str, Any]]]:
    """Load and merge raw sheets from Excel, Word, PDF, OpenDocument, HTML, XML, Markdown, JSON, ZIP, Images, Google Sheets, and Lark Base."""
    raw_sheets: Dict[str, List[Dict[str, Any]]] = {}
    source_meta: List[Dict[str, Any]] = []
    lark_base_urls = lark_base_urls or []
    eff_gemini_key = (gemini_key or os.environ.get("GEMINI_API_KEY") or "").strip()

    def merge_sheets(new_sheets: Dict[str, List[Dict[str, Any]]], origin_label: str, kind: str) -> None:
        stem = Path(origin_label).stem if origin_label else ""
        for s_name, rows in new_sheets.items():
            key = s_name
            if len(uploaded_files) > 1 and s_name.strip().lower() in ("sheet1", "sheet 1", "trang_tinh1", "trang tính 1") and stem:
                key = stem
            suffix = 2
            base_key = key
            while key in raw_sheets:
                if stem and not base_key.startswith(stem):
                    cand = f"{stem}_{base_key}"
                    if cand not in raw_sheets:
                        key = cand
                        break
                key = f"{base_key}_{suffix}"
                suffix += 1
            raw_sheets[key] = rows
            cols = [str(k) for k in (rows[0].keys() if rows else []) if not str(k).startswith("_")]
            source_meta.append(
                {
                    "source": origin_label,
                    "type": kind,
                    "sheet_name": key,
                    "rows": len(rows),
                    "columns": len(cols),
                    "column_names": cols,
                }
            )

    if sample_id:
        sample_path = SAMPLES_DIR / f"{sample_id}.xlsx"
        if not sample_path.exists():
            raise ValueError(f"Không tìm thấy bộ dữ liệu mẫu '{sample_id}'.")
        parsed = parse_xlsx_bytes(sample_path.read_bytes(), filename=sample_path.name)
        merge_sheets(parsed, sample_path.name, "sample_xlsx")

    for f in uploaded_files:
        fname = f["filename"]
        content = f["content"]
        ext = Path(fname).suffix.lower().lstrip(".") or "text"
        if not content or not content.strip():
            raise ValueError(
                f"File '{fname}' trống: Không có ô, cột hoặc dòng dữ liệu nào cả! "
                "Vui lòng kiểm tra lại và tải lên file có dữ liệu."
            )
        s_map, d_map = _dispatch_uploaded_file_bytes(content, fname, eff_gemini_key, gemini_model)
        has_rows = any(bool(rows) for rows in s_map.values())
        has_text = any(bool(p) for p in d_map.values())
        if ext in ("csv", "tsv", "xlsx", "xlsm", "ods", "json") and not has_rows:
            raise ValueError(
                f"File '{fname}' trống: Không có ô, cột hoặc dòng dữ liệu nào cả! "
                "Vui lòng kiểm tra lại và tải lên file có dữ liệu."
            )
        if not has_rows and not has_text:
            hint = (
                " (PDF/ảnh dạng scan cần Gemini API Key để AI đọc chữ)"
                if ext in ("pdf", "png", "jpg", "jpeg", "webp", "gif")
                else ""
            )
            raise ValueError(
                f"File '{fname}' trống: Không có ô, cột hoặc dòng dữ liệu nào cả{hint}! "
                "Vui lòng kiểm tra lại và gửi file có dữ liệu."
            )
        if s_map:
            non_empty_s = {k: v for k, v in s_map.items() if v}
            for empty_k, empty_v in s_map.items():
                if not empty_v:
                    source_meta.append(
                        {
                            "source": fname,
                            "type": ext,
                            "sheet_name": empty_k,
                            "rows": 0,
                            "columns": 0,
                            "empty": True,
                            "note": f"Sheet '{empty_k}' trong file '{fname}' trống: không có ô, cột nào cả.",
                        }
                    )
            merge_sheets(non_empty_s, fname, ext)
        elif d_map:
            # Synthesize a structured table from readable document paragraphs so all 4 studio steps work seamlessly
            syn_sheets: Dict[str, List[Dict[str, Any]]] = {}
            for d_name, paras in d_map.items():
                if not paras:
                    continue
                s_key = f"{Path(d_name).stem}_NoiDung"
                syn_sheets[s_key] = [
                    {
                        "_row_number": idx + 1,
                        "_source_file": fname,
                        "_sheet_name": s_key,
                        "Dong": idx + 1,
                        "Noi_Dung": ln,
                    }
                    for idx, ln in enumerate(paras)
                    if str(ln).strip()
                ]
            if syn_sheets:
                merge_sheets(syn_sheets, fname, f"{ext}_text")
        if document_texts_out is not None and d_map:
            for d_name, paras in d_map.items():
                document_texts_out[d_name] = paras

    for url in google_sheet_urls:
        clean_url = url.strip()
        if not clean_url:
            continue
        if "larksuite.com" in clean_url.lower() or "feishu.cn" in clean_url.lower():
            parsed = fetch_lark_base_url(
                clean_url,
                lark_app_id=lark_app_id or os.environ.get("LARK_APP_ID", ""),
                lark_app_secret=lark_app_secret or os.environ.get("LARK_APP_SECRET", ""),
                lark_token=lark_token or os.environ.get("LARK_ACCESS_TOKEN", ""),
                fetch_all_tabs=fetch_all_tabs,
            )
            merge_sheets(parsed, clean_url, "lark_base")
        else:
            parsed = fetch_google_sheet_url(clean_url, fetch_all_tabs=fetch_all_tabs)
            merge_sheets(parsed, clean_url, "google_sheet")

    for l_url in lark_base_urls:
        clean_l = l_url.strip()
        if not clean_l:
            continue
        parsed = fetch_lark_base_url(
            clean_l,
            lark_app_id=lark_app_id or os.environ.get("LARK_APP_ID", ""),
            lark_app_secret=lark_app_secret or os.environ.get("LARK_APP_SECRET", ""),
            lark_token=lark_token or os.environ.get("LARK_ACCESS_TOKEN", ""),
            fetch_all_tabs=fetch_all_tabs,
        )
        merge_sheets(parsed, clean_l, "lark_base")

    has_doc_text = bool(document_texts_out and any(v for v in document_texts_out.values()))
    if not raw_sheets and not has_doc_text:
        raise ValueError("Chưa có dữ liệu đầu vào nào được nạp (vui lòng tải Excel, Word .docx, JSON, Google Sheet hoặc Lark Base).")

    return raw_sheets, source_meta


def _render_md_to_clean_html(md_raw: str) -> str:
    """Convert Markdown report cleanly into Vietnamese-typed editorial HTML (no raw ## or ** tokens)."""
    lines = str(md_raw or "").splitlines()
    out: List[str] = []
    in_list = False
    in_table = False

    def close_blocks() -> None:
        nonlocal in_list, in_table
        if in_list:
            out.append("</ul>")
            in_list = False
        if in_table:
            out.append("</tbody></table>")
            in_table = False

    def fmt_inline(txt: str) -> str:
        s = html_lib.escape(txt)
        s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
        s = re.sub(r"`([^`]+)`", r"<code>\1</code>", s)
        return s

    for raw in lines:
        ln = raw.strip()
        if not ln:
            close_blocks()
            continue
        if ln.startswith("|") and ln.endswith("|"):
            if not ln.replace("|", "").replace("-", "").replace(":", "").strip():
                continue
            cells = [fmt_inline(c.strip()) for c in ln.split("|")[1:-1]]
            if not in_table:
                close_blocks()
                out.append("<table><thead><tr>" + "".join(f"<th>{c}</th>" for c in cells) + "</tr></thead><tbody>")
                in_table = True
            else:
                out.append("<tr>" + "".join(f"<td>{c}</td>" for c in cells) + "</tr>")
            continue
        close_blocks()
        if ln.startswith("### "):
            out.append(f"<h3>{fmt_inline(ln[4:])}</h3>")
        elif ln.startswith("## "):
            out.append(f"<h2>{fmt_inline(ln[3:])}</h2>")
        elif ln.startswith("# "):
            out.append(f"<h1>{fmt_inline(ln[2:])}</h1>")
        elif ln.startswith("- "):
            if not in_list:
                out.append("<ul>")
                in_list = True
            out.append(f"<li>{fmt_inline(ln[2:])}</li>")
        else:
            out.append(f"<p>{fmt_inline(ln)}</p>")
    close_blocks()
    return "\n".join(out)


def _fmt_num_html(val: Any) -> str:
    if val is None or val == "":
        return "-"
    try:
        num = float(val)
        if abs(num - round(num)) < 1e-6:
            return f"{int(round(num)):,}".replace(",", ".")
        return f"{num:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    except (TypeError, ValueError):
        return html_lib.escape(str(val))


def _render_report_chart_svg(ch: Dict[str, Any]) -> str:
    """Render a crisp standalone SVG chart for the A4 HTML report."""
    pts = (ch.get("data_points") or [])[:8]
    if not pts:
        return "<div style='padding:12px;text-align:center;color:#64748b;'>Không có điểm dữ liệu biểu đồ.</div>"
    ctype = str(ch.get("chart_type") or "column")
    w, h = 620, 220
    pad_l, pad_r, pad_t, pad_b = 48, 28, 28, 42
    plot_w = w - pad_l - pad_r
    plot_h = h - pad_t - pad_b

    if ctype == "line":
        vals = [float(p.get("value") or 0) for p in pts]
        lo, hi = min(vals), max(vals)
        span = (hi - lo) if hi > lo else 1.0
        coords = []
        circles = []
        for i, p in enumerate(pts):
            x = round(pad_l + (i * plot_w / max(len(pts) - 1, 1)), 1)
            v = float(p.get("value") or 0)
            y = round(pad_t + plot_h - ((v - lo) / span) * (plot_h - 16), 1)
            coords.append(f"{x},{y}")
            lbl = html_lib.escape(str(p.get("label") or "")[:10])
            v_str = _fmt_num_html(v)
            circles.append(
                f"<circle cx='{x}' cy='{y}' r='4.5' fill='#b83b6e' stroke='#fff' stroke-width='1.5'/>"
                f"<text x='{x}' y='{max(14, y - 8)}' text-anchor='middle' font-size='10' font-family='Times New Roman, serif' font-weight='bold' fill='#7a2048'>{v_str}</text>"
                f"<text x='{x}' y='{h - 12}' text-anchor='middle' font-size='10' font-family='Times New Roman, serif' fill='#334155'>{lbl}</text>"
            )
        poly = " ".join(coords)
        area = f"{pad_l},{pad_t + plot_h} {poly} {pad_l + plot_w},{pad_t + plot_h}"
        return (
            f"<svg viewBox='0 0 {w} {h}' style='width:100%;height:auto;max-height:230px;display:block;margin:0 auto;'>"
            f"<line x1='{pad_l}' y1='{pad_t + plot_h}' x2='{w - pad_r}' y2='{pad_t + plot_h}' stroke='#cbd5e1' stroke-width='1'/>"
            f"<polygon points='{area}' fill='rgba(229,123,165,0.15)'/>"
            f"<polyline fill='none' stroke='#d65f90' stroke-width='2.6' points='{poly}'/>"
            + "".join(circles)
            + "</svg>"
        )

    slot_w = plot_w / max(len(pts), 1)
    bar_w = min(46.0, max(18.0, slot_w * 0.58))
    bars_svg = [
        f"<line x1='{pad_l}' y1='{pad_t + plot_h}' x2='{w - pad_r}' y2='{pad_t + plot_h}' stroke='#94a3b8' stroke-width='1.2'/>",
        f"<line x1='{pad_l}' y1='{pad_t}' x2='{pad_l}' y2='{pad_t + plot_h}' stroke='#94a3b8' stroke-width='1.2'/>",
    ]
    line_coords = []
    for i, p in enumerate(pts):
        hp = max(6.0, min(100.0, float(p.get("height_pct") or p.get("pct") or 20.0)))
        bh = round((hp / 100.0) * (plot_h - 14), 1)
        x = round(pad_l + i * slot_w + (slot_w - bar_w) / 2.0, 1)
        y = round(pad_t + plot_h - bh, 1)
        lbl = html_lib.escape(str(p.get("label") or "")[:11])
        v_txt = _fmt_num_html(p.get("value"))
        pct_txt = f" ({p.get('pct')}%)" if p.get("pct") is not None else ""
        fill_col = "#f7c6da" if i == 0 else "#fde8f1"
        bars_svg.append(
            f"<rect x='{x}' y='{y}' width='{bar_w}' height='{bh}' rx='4' fill='{fill_col}' stroke='#e5a4bf' stroke-width='0.8'/>"
            f"<text x='{x + bar_w / 2:.1f}' y='{max(13, y - 6)}' text-anchor='middle' font-size='9.5' font-family='Times New Roman, serif' font-weight='bold' fill='#000000'>{v_txt}{pct_txt}</text>"
            f"<text x='{x + bar_w / 2:.1f}' y='{h - 14}' text-anchor='middle' font-size='10' font-family='Times New Roman, serif' fill='#000000'>{lbl}</text>"
        )
        if ctype in ("pareto", "combo"):
            lp = float(p.get("cumulative_pct") if ctype == "pareto" else (p.get("line_pct") or p.get("pct") or 50.0))
            ly = round(pad_t + plot_h - (min(100.0, max(0.0, lp)) / 100.0) * (plot_h - 14), 1)
            lx = round(x + bar_w / 2.0, 1)
            line_coords.append((lx, ly, round(lp, 1)))

    if line_coords:
        pts_str = " ".join(f"{lx},{ly}" for lx, ly, _ in line_coords)
        bars_svg.append(f"<polyline fill='none' stroke='#111111' stroke-width='2.2' stroke-dasharray='4,2' points='{pts_str}'/>")
        for lx, ly, lp_val in line_coords:
            bars_svg.append(f"<circle cx='{lx}' cy='{ly}' r='3.5' fill='#111111'/>")

    return f"<svg viewBox='0 0 {w} {h}' style='width:100%;height:auto;max-height:230px;display:block;margin:0 auto;'>{''.join(bars_svg)}</svg>"


def render_standalone_html_report(res: Dict[str, Any]) -> str:
    """Build a standard A4 (210x297mm, Times New Roman 13-14pt, justified, 1.27cm indent, Roman i/ii & Arabic 1,2,3 page numbers) report with pure black text."""
    prop = res.get("proposal") or {}
    md_html = _render_md_to_clean_html(prop.get("markdown_report") or "")
    run_id = html_lib.escape(str(res.get("run_id") or "HP-REPORT"))
    status_txt = html_lib.escape(str(res.get("workflow_status") or "COMPLETED"))
    now_str = datetime.now().strftime("%d/%m/%Y %H:%M")

    common_a4_css = """
  @page { size: A4 portrait; margin: 2.2cm 1.8cm 2.2cm 3.2cm; }
  * { box-sizing: border-box; }
  body {
    font-family: "Times New Roman", Times, Georgia, serif;
    font-size: 13.5pt;
    line-height: 1.45;
    color: #000000;
    background: #f4f5f7;
    margin: 0;
    padding: 18px 10px 36px;
  }
  .report-toolbar {
    max-width: 210mm;
    margin: 0 auto 14px;
    padding: 10px 16px;
    border-radius: 16px;
    background: rgba(255,255,255,0.92);
    backdrop-filter: blur(20px);
    border: 1.5px solid #f48fb1;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 11.5px;
    color: #c23b75;
  }
  .print-btn {
    padding: 7px 14px;
    border-radius: 999px;
    border: 1.5px solid #e0538c;
    background: linear-gradient(135deg, #f48fb1, #e0538c);
    color: #fff;
    font-weight: 800;
    font-size: 11.5px;
    cursor: pointer;
  }
  .a4-sheet {
    width: 210mm;
    min-height: 297mm;
    margin: 0 auto 22px;
    padding: 2.2cm 1.8cm 2.2cm 3.2cm;
    background: #ffffff;
    color: #000000;
    border: 1px solid #d1d5db;
    box-shadow: 0 14px 36px -14px rgba(0, 0, 0, 0.14);
    position: relative;
    page-break-after: always;
  }
  .a4-sheet:last-of-type { page-break-after: auto; }
  .page-num {
    position: absolute;
    bottom: 1.1cm;
    right: 1.8cm;
    left: 3.2cm;
    display: flex;
    justify-content: space-between;
    border-top: 1px solid #000000;
    padding-top: 4px;
    font-size: 11pt;
    color: #000000;
    font-style: italic;
  }
  h1.doc-title {
    font-size: 16pt;
    font-weight: bold;
    text-align: center;
    text-transform: uppercase;
    color: #000000;
    margin: 8px 0 6px;
    line-height: 1.35;
  }
  h2.chapter-title {
    font-size: 14pt;
    font-weight: bold;
    text-transform: uppercase;
    color: #000000;
    margin: 18px 0 8px;
    padding-bottom: 4px;
    border-bottom: 1.5px solid #000000;
  }
  h3.sec-title {
    font-size: 13.5pt;
    font-weight: bold;
    color: #000000;
    margin: 14px 0 6px;
  }
  p.doc-p {
    margin: 0 0 8px;
    text-indent: 1.27cm;
    text-align: justify;
    font-size: 13.5pt;
    line-height: 1.45;
    color: #000000;
  }
  .toc-list { list-style: none; padding: 0; margin: 10px 0 18px; font-size: 13pt; color: #000000; }
  .toc-list li { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px dotted #6b7280; color: #000000; }
  table.doc-table {
    width: 100%;
    border-collapse: collapse;
    margin: 8px 0 14px;
    font-size: 11.5pt;
    line-height: 1.35;
    color: #000000;
  }
  table.doc-table th, table.doc-table td {
    border: 1px solid #000000;
    padding: 6px 8px;
    text-align: left;
    vertical-align: top;
    color: #000000;
  }
  table.doc-table th {
    background: #f3f4f6;
    color: #000000;
    font-weight: bold;
    text-align: center;
  }
  .table-caption, .fig-caption {
    font-size: 12pt;
    font-weight: bold;
    text-align: center;
    margin: 10px 0 4px;
    color: #000000;
  }
  .source-note {
    font-size: 11.5pt;
    font-style: italic;
    color: #000000;
    margin: 2px 0 12px;
    text-align: right;
  }
  .chart-figure-box {
    border: 1px solid #000000;
    border-radius: 8px;
    padding: 12px 14px;
    margin: 12px 0 16px;
    background: #ffffff;
    color: #000000;
    page-break-inside: avoid;
  }
  .chart-analysis-grid {
    margin-top: 10px;
    padding-top: 8px;
    border-top: 1px dashed #6b7280;
    font-size: 12.5pt;
    line-height: 1.42;
    text-align: justify;
    color: #000000;
  }
  .chart-analysis-grid div { margin-bottom: 5px; color: #000000; }
  .report-box { font-size: 13pt; line-height: 1.45; text-align: justify; color: #000000; }
  .report-box p { text-indent: 1.27cm; text-align: justify; margin: 0 0 8px; color: #000000; }
  .report-box h1, .report-box h2, .report-box h3 { color: #000000; margin: 14px 0 6px; font-size: 13.5pt; }
  .report-box table { width: 100%; border-collapse: collapse; font-size: 11.5pt; margin: 8px 0 14px; color: #000000; }
  .report-box th, .report-box td { border: 1px solid #000000; padding: 5px 7px; color: #000000; }
  .report-box th { background: #f3f4f6; color: #000000; }
  code { font-family: "Times New Roman", serif; font-weight: bold; color: #000000; }
  @media (max-width: 860px) {
    .a4-sheet { width: 100%; min-height: auto; padding: 20px 16px 48px; }
    .page-num { left: 16px; right: 16px; bottom: 10px; }
  }
  @media print {
    body { background: #fff; padding: 0; }
    .no-print { display: none !important; }
    .a4-sheet { width: 100%; min-height: auto; margin: 0; padding: 0; border: none; box-shadow: none; }
  }
"""

    if res.get("analysis_mode") == "company_statistics":
        cs = res.get("company_stats") or {}
        bi = cs.get("bi_pipeline") or {}
        stage1 = bi.get("stage1_intake") or {}
        stage2 = bi.get("stage2_cleaning") or {}
        stage4_charts = bi.get("stage4_charts") or []
        stage5_insights = bi.get("stage5_insights") or []
        stage6_solutions = bi.get("stage6_solutions") or []

        domain_lbl = html_lib.escape(str(cs.get("domain_label") or "Thống Kê & Tổng Hợp Dữ Liệu Doanh Nghiệp"))
        custom_rep = res.get("custom_report") or cs.get("custom_report") or {}
        custom_title_raw = str(custom_rep.get("title") or "").strip()
        custom_author_raw = str(custom_rep.get("author") or "Hà Thuỳ Dương (Data Analyst & BI)").strip()
        custom_conclusion_raw = str(custom_rep.get("conclusion") or "").strip()
        doc_h1_title = (
            html_lib.escape(custom_title_raw.upper())
            if custom_title_raw
            else f"BÁO CÁO PHÂN TÍCH DỮ LIỆU, KIỂM ĐỊNH CHẤT LƯỢNG VÀ ĐỀ XUẤT GIẢI PHÁP QUẢN TRỊ: {domain_lbl.upper()}"
        )
        author_display = html_lib.escape(custom_author_raw)
        raw_highlights = custom_rep.get("highlights") or cs.get("dataset_highlights") or bi.get("dataset_highlights") or []
        hl_items_html = []
        for hl in raw_highlights:
            if isinstance(hl, dict):
                b_txt = html_lib.escape(str(hl.get("badge") or "Điểm nhấn"))
                t_txt = html_lib.escape(str(hl.get("title") or ""))
                d_txt = html_lib.escape(str(hl.get("detail") or ""))
                hl_items_html.append(f"<li><strong>[{b_txt}] {t_txt}:</strong> {d_txt}</li>")
            elif str(hl).strip():
                hl_items_html.append(f"<li>{html_lib.escape(str(hl).strip())}</li>")
        highlights_box_html = (
            f"""<div style="border:2px solid #000000;background:#fafafa;padding:12px 16px;border-radius:8px;margin:10px 0 14px;">
  <div style="font-size:13pt;font-weight:bold;text-transform:uppercase;margin-bottom:6px;">★ NHẬN ĐỊNH ĐIỂM NHẤN TRỌNG TÂM CỦA BỘ DỮ LIỆU</div>
  <ul style="margin:0 0 0 20px;padding:0;font-size:12.5pt;line-height:1.45;">{''.join(hl_items_html)}</ul>
</div>"""
            if hl_items_html
            else ""
        )
        custom_conclusion_html = (
            f"""<div style="border:1.5px solid #000000;background:#ffffff;padding:12px 16px;border-radius:8px;margin:10px 0 14px;">
  <div style="font-size:13pt;font-weight:bold;text-transform:uppercase;margin-bottom:4px;">★ NHẬN ĐỊNH &amp; YÊU CẦU BỔ SUNG CỦA NGƯỜI DÙNG</div>
  <p class="doc-p" style="text-indent:0;margin:0;">{html_lib.escape(custom_conclusion_raw)}</p>
</div>"""
            if custom_conclusion_raw
            else ""
        )
        sheet_names = ", ".join(html_lib.escape(str(s.get("sheet_name") or "")) for s in (stage1.get("sheets_inventory") or [])[:5]) or "Tệp dữ liệu nguồn"

        priority_rows = "".join(
            f"<tr><td style='text-align:center;'>#{pe.get('rank')}</td><td><strong>{html_lib.escape(str(pe.get('name') or ''))}</strong></td>"
            f"<td style='text-align:center;'>{html_lib.escape(str(pe.get('tier') or ''))}</td><td style='text-align:right;'><strong>{_fmt_num_html(pe.get('value'))}</strong></td>"
            f"<td style='text-align:right;'>{pe.get('share_pct')}%</td><td>{html_lib.escape(str(pe.get('group_label') or pe.get('status_badge') or '-'))}</td></tr>"
            for pe in (cs.get("priority_entities") or [])[:15]
        )
        valid_numerics = [n for n in (cs.get("numeric_highlights") or []) if not _is_non_metric_col(str(n.get("column", "")))]
        num_rows = "".join(
            f"<tr><td><strong>{html_lib.escape(str(n.get('table') or ''))}</strong></td>"
            f"<td>{html_lib.escape(str(n.get('column') or ''))}</td>"
            f"<td style='text-align:right;'>{_fmt_num_html(n.get('count'))}</td>"
            f"<td style='text-align:right;'><strong>{_fmt_num_html(n.get('sum'))}</strong></td>"
            f"<td style='text-align:right;'>{_fmt_num_html(n.get('avg'))}</td>"
            f"<td style='text-align:right;'>{_fmt_num_html(n.get('median'))}</td>"
            f"<td style='text-align:right;'>{_fmt_num_html(n.get('std'))}</td>"
            f"<td style='text-align:right;'>{_fmt_num_html(n.get('min'))} → {_fmt_num_html(n.get('max'))}</td></tr>"
            for n in valid_numerics
        )
        mfs = cs.get("multi_file_synthesis") or {}
        fb_list = mfs.get("file_breakdown") or cs.get("table_summaries") or []
        file_inv_rows = "".join(
            f"<tr><td style='text-align:center;'>{idx_f}</td>"
            f"<td><strong>{html_lib.escape(str(fb.get('source_file') or fb.get('sheet_name') or ''))}</strong></td>"
            f"<td>{html_lib.escape(str(fb.get('sheet_name') or ''))}</td>"
            f"<td style='text-align:right;'><strong>{_fmt_num_html(fb.get('column_count') or len(fb.get('headers') or []))} cột</strong></td>"
            f"<td>{html_lib.escape(', '.join(str(h) for h in (fb.get('headers') or [])))}</td>"
            f"<td style='text-align:right;'><strong>{_fmt_num_html(fb.get('row_count', 0))} dòng</strong></td></tr>"
            for idx_f, fb in enumerate(fb_list, start=1)
        )
        dw = cs.get("data_warning") or {}
        dw_html = ""
        if dw.get("has_warning"):
            dw_reasons = "".join(f"<li>{html_lib.escape(str(r))}</li>" for r in (dw.get("reasons") or []))
            dw_fixes = "".join(f"<li>{html_lib.escape(str(fx))}</li>" for fx in (dw.get("how_to_fix") or []))
            dw_border = "#dc2626" if dw.get("cannot_analyze") else "#d97706"
            dw_bg = "#fef2f2" if dw.get("cannot_analyze") else "#fffbeb"
            dw_color = "#991b1b" if dw.get("cannot_analyze") else "#92400e"
            dw_html = f"""<div style="border:2.5px solid {dw_border};background:{dw_bg};color:{dw_color};padding:14px 18px;border-radius:10px;margin:12px 0 16px;">
  <div style="font-size:14.5pt;font-weight:bold;text-transform:uppercase;margin-bottom:6px;">{html_lib.escape(str(dw.get('headline') or '⚠️ CẢNH BÁO CHẤT LƯỢNG DỮ LIỆU'))}</div>
  <div style="font-size:12.5pt;margin-bottom:6px;">{html_lib.escape(str(dw.get('summary') or ''))}</div>
  <div style="font-size:12.5pt;"><strong>Chi tiết vấn đề phát hiện từ dữ liệu:</strong><ul style="margin:4px 0 6px 20px;">{dw_reasons}</ul></div>
  {f'<div style="font-size:12.5pt;"><strong>Hướng dẫn khắc phục:</strong><ul style="margin:4px 0 0 20px;">{dw_fixes}</ul></div>' if dw_fixes else ''}
</div>"""
        sol_rows = "".join(
            f"<tr><td><strong>{html_lib.escape(str(s.get('priority_order') or ''))}</strong></td>"
            f"<td>{html_lib.escape(str(s.get('problem') or ''))}</td>"
            f"<td>{html_lib.escape(str(s.get('solution') or ''))}</td>"
            f"<td><strong>{html_lib.escape(str(s.get('department') or ''))}</strong></td>"
            f"<td>{html_lib.escape(str(s.get('kpi') or ''))}</td>"
            f"<td>{html_lib.escape(str(s.get('risks_and_conditions') or ''))}</td></tr>"
            for s in stage6_solutions
        )

        charts_blocks_html = []
        for idx_c, ch in enumerate(stage4_charts, start=1):
            fig_lbl = html_lib.escape(str(ch.get("figure_num") or f"Hình 2.{idx_c}"))
            c_title = html_lib.escape(str(ch.get("title") or ""))
            c_type = html_lib.escape(str(ch.get("chart_type_label") or ""))
            c_exp = html_lib.escape(str(ch.get("chart_explanation") or ch.get("commentary") or ""))
            c_rsn = html_lib.escape(str(ch.get("chart_reason") or "Phản ánh phân bổ thực tế của dữ liệu sạch."))
            c_sol = html_lib.escape(str(ch.get("chart_solution") or "Tập trung nguồn lực cho nhóm dẫn đầu và tối ưu nhóm thấp."))
            c_why = html_lib.escape(str(ch.get("chart_why_solution") or ch.get("business_meaning") or ""))
            c_src = html_lib.escape(str(ch.get("source_citation") or f"{sheet_names} ({run_id})"))
            svg_markup = _render_report_chart_svg(ch)
            charts_blocks_html.append(
                f"""<div class="chart-figure-box">
  <div class="fig-caption">{fig_lbl}: {c_title} ({c_type})</div>
  <div style="font-size:11pt;text-align:center;color:#000000;margin-bottom:4px;">Trục X: {html_lib.escape(str(ch.get('x_axis_label') or ''))} · Trục Y: {html_lib.escape(str(ch.get('y_axis_label') or ''))}</div>
  {svg_markup}
  <div class="chart-analysis-grid">
    <div><strong>• Số liệu trọng tâm:</strong> {c_exp}</div>
    <div><strong>• Nhận định &amp; Nguyên nhân:</strong> {c_rsn}</div>
    <div><strong>• Hành động đề xuất:</strong> {c_sol} <em>({c_why})</em></div>
  </div>
  <div class="source-note" style="margin-bottom:2px;">Nguồn: {c_src}</div>
</div>"""
            )

        insights_html = "".join(
            f"""<div style="margin-bottom:12px;">
  <h3 class="sec-title">3.{idx_i}. {html_lib.escape(str(ins.get('title') or ''))} ({html_lib.escape(str(ins.get('id') or ''))})</h3>
  <p class="doc-p"><strong>Thực trạng &amp; bằng chứng số liệu:</strong> {html_lib.escape(str(ins.get('finding') or ''))} Dẫn chứng cụ thể: {html_lib.escape(str(ins.get('evidence') or ''))} [Nguồn: {sheet_names}].</p>
  <p class="doc-p"><strong>Nguyên nhân thực chứng &amp; giả thuyết kiểm định:</strong> {html_lib.escape(str(ins.get('causes_proven') or ''))} Bên cạnh đó, giả thuyết quản trị đặt ra là: {html_lib.escape(str(ins.get('causes_hypothesis') or ''))}</p>
  <p class="doc-p"><strong>Tác động quản trị &amp; định hướng xử lý:</strong> {html_lib.escape(str(ins.get('business_impact') or ''))} Khuyến nghị thực thi: {html_lib.escape(str(ins.get('recommended_action') or ''))}</p>
</div>"""
            for idx_i, ins in enumerate(stage5_insights, start=1)
        )

        return f"""<!DOCTYPE html>
<html lang="vi"><head><meta charset="UTF-8" /><title>Báo cáo Phân tích Dữ liệu Chuẩn A4 — {domain_lbl} ({run_id})</title>
<style>{common_a4_css}</style></head>
<body>
  <div class="report-toolbar no-print">
    <div>
      <h1>🌸 Hà Thuỳ Dương · Báo Cáo Phân Tích Dữ Liệu Chuẩn A4 ({domain_lbl})</h1>
      <div>Chuẩn A4 (210×297mm) · Phông Times New Roman 13.5pt · Lề Trái 3,2cm / Phải 1,8cm / Trên-Dưới 2,2cm · Giãn dòng 1,45 · Thụt đầu dòng 1,27cm · Căn đều Justify · Đánh số trang La Mã (i, ii) &amp; Ả-rập (1, 2, 3...)</div>
    </div>
    <button type="button" class="print-btn" onclick="window.print()">🖨 In chuẩn A4 / Lưu PDF</button>
  </div>

  <!-- TRANG i: PHẦN MỞ ĐẦU, CAM KẾT TÍNH XÁC THỰC & MỤC LỤC (ĐÁNH SỐ LA MÃ i) -->
  <section class="a4-sheet">
    <div style="text-align:center;border-bottom:2px double #000000;padding-bottom:12px;margin-bottom:16px;">
      <div style="font-size:12pt;font-weight:bold;text-transform:uppercase;">BÁO CÁO NGHIÊN CỨU &amp; PHÂN TÍCH DỮ LIỆU QUẢN TRỊ DOANH NGHIỆP (BI)</div>
      <h1 class="doc-title">{doc_h1_title}</h1>
      <div style="font-size:12pt;margin-top:6px;">
        <strong>Chuyên viên thực hiện:</strong> {author_display} · <strong>Mã hồ sơ kiểm toán:</strong> <code>{run_id}</code> · <strong>Ngày lập:</strong> {now_str}
      </div>
    </div>

    <h3 class="sec-title">I. LỜI CAM ĐOAN TÍNH XÁC THỰC &amp; ĐIỂM NHẤN TRỌNG TÂM</h3>
    {dw_html}
    {highlights_box_html}
    <p class="doc-p">Báo cáo này được xây dựng hoàn toàn dựa trên dữ liệu thực nghiệm do đơn vị cung cấp tại nguồn dữ liệu <em>{sheet_names}</em> (mã phiên kiểm toán <code>{run_id}</code>). Toàn bộ số liệu thống kê, bảng biểu và biểu đồ trực quan trong báo cáo đều phản ánh trung thực kết quả sau quy trình làm sạch chuẩn hóa, tuyệt đối không suy diễn cảm tính hoặc tự tạo số liệu giả định.</p>
    <p class="doc-p">Văn phong trình bày tuân thủ nghiêm ngặt quy chuẩn báo cáo khoa học và quản trị: khách quan, logic, có trích dẫn nguồn dữ liệu rõ ràng cho từng bảng số liệu và hình vẽ; nội dung phân tích được tổng hợp độc lập từ dữ liệu gốc của đơn vị (đảm bảo tỷ lệ trùng lặp học thuật dưới 15% theo tiêu chuẩn kiểm định).</p>

    <h3 class="sec-title">II. MỤC LỤC BÁO CÁO</h3>
    <ul class="toc-list">
      <li><span>Phần mở đầu: Cam kết tính xác thực, Mục lục &amp; Danh mục bảng biểu</span><span>Trang i</span></li>
      <li><span>CHƯƠNG 1: Mở đầu, Phạm vi dữ liệu và Quy trình Tiền xử lý – Làm sạch dữ liệu</span><span>Trang 1</span></li>
      <li><span>CHƯƠNG 2: Phân tích Thống kê Mô tả và Hệ thống Biểu đồ Trực quan (Kèm giải thích chi tiết)</span><span>Trang 2</span></li>
      <li><span>CHƯƠNG 3: Phân tích Chuyên sâu (DATA → INFORMATION → INSIGHT → DECISION) &amp; Xếp hạng ABC</span><span>Trang 3</span></li>
      <li><span>CHƯƠNG 4: Đề xuất Giải pháp Quản trị, Lộ trình Thực thi KPI &amp; Danh mục Nguồn trích dẫn</span><span>Trang 4</span></li>
    </ul>

    <h3 class="sec-title">III. DANH MỤC BẢNG BIỂU VÀ HÌNH VẼ TRONG BÁO CÁO</h3>
    <ul class="toc-list">
      <li><span>Bảng 1.1: Tổng hợp kết quả kiểm định chất lượng và làm sạch dữ liệu đầu vào</span><span>Trang 1</span></li>
      <li><span>Bảng 2.1: Thống kê mô tả các chỉ số định lượng (Tổng, Trung bình, Trung vị, Độ lệch chuẩn)</span><span>Trang 1</span></li>
      <li><span>Hệ thống Hình 2.1 – Hình 2.{len(stage4_charts)}: Biểu đồ trực quan kèm giải thích, nguyên nhân &amp; giải pháp</span><span>Trang 2</span></li>
      <li><span>Bảng 3.1: Phân hạng ưu tiên Pareto ABC theo tỷ trọng đóng góp</span><span>Trang 3</span></li>
      <li><span>Bảng 4.1: Kế hoạch hành động (Action Plan), đơn vị phụ trách và chỉ số KPI đo lường</span><span>Trang 4</span></li>
    </ul>

    <div class="page-num"><span>Hồ sơ phân tích dữ liệu: {run_id}</span><span>Trang i</span></div>
  </section>

  <!-- TRANG 1: CHƯƠNG 1 & BẢNG THỐNG KÊ MÔ TẢ (ĐÁNH SỐ Ả-RẬP 1) -->
  <section class="a4-sheet">
    <h2 class="chapter-title">CHƯƠNG 1: MỞ ĐẦU, PHẠM VI DỮ LIỆU VÀ QUY TRÌNH TIỀN XỬ LÝ – LÀM SẠCH DỮ LIỆU</h2>
    <h3 class="sec-title">1.1. Đặt vấn đề và phạm vi nguồn dữ liệu nghiên cứu</h3>
    <p class="doc-p">Trong quản trị doanh nghiệp hiện đại, chất lượng quyết định phụ thuộc trực tiếp vào độ chính xác và tính đầy đủ của dữ liệu đầu vào. Nghiên cứu này tiến hành tiếp nhận và kiểm định bộ dữ liệu thuộc lĩnh vực <strong>{domain_lbl}</strong> gồm <strong>{_fmt_num_html(cs.get('total_tables', 0))} bảng dữ liệu nguồn</strong> ({sheet_names}) với tổng cộng <strong>{_fmt_num_html(cs.get('total_rows_raw', cs.get('total_rows_clean', 0)))} bản ghi gốc</strong>.</p>
    <p class="doc-p">Trước khi đưa vào mô hình phân tích thống kê và trực quan hóa, dữ liệu bắt buộc phải trải qua cổng kiểm định chất lượng và làm sạch đa tầng nhằm loại bỏ các bản ghi trùng lặp, xử lý dòng trống, chuẩn hóa định dạng ngày tháng – số học và nhận diện các giá trị ngoại lai (Outliers) theo phương pháp khoảng tứ phân vị (IQR).</p>

    <div class="table-caption">Bảng 1.1: Tổng hợp kết quả kiểm định chất lượng và tiền xử lý làm sạch dữ liệu</div>
    <table class="doc-table">
      <thead>
        <tr><th>STT</th><th>Chỉ tiêu kiểm định &amp; Làm sạch dữ liệu</th><th>Kết quả ghi nhận</th><th>Đánh giá tính xác thực</th></tr>
      </thead>
      <tbody>
        <tr><td style="text-align:center;">1</td><td>Tổng số bảng dữ liệu nguồn tiếp nhận</td><td style="text-align:right;"><strong>{_fmt_num_html(cs.get('total_tables', 0))} bảng</strong></td><td>Đầy đủ cấu trúc trường khóa</td></tr>
        <tr><td style="text-align:center;">2</td><td>Tổng số bản ghi sau khi làm sạch (N hợp lệ)</td><td style="text-align:right;"><strong>{_fmt_num_html(cs.get('total_rows_clean', 0))} dòng</strong></td><td>Đã xác thực người dùng duyệt</td></tr>
        <tr><td style="text-align:center;">3</td><td>Số bản ghi trùng lặp / dòng trống đã loại bỏ</td><td style="text-align:right;">{_fmt_num_html(cs.get('total_rows_dropped', 0))} dòng</td><td>Loại bỏ nhiễu tránh tính trùng</td></tr>
        <tr><td style="text-align:center;">4</td><td>Số ô chuẩn hóa định dạng số &amp; ngày tháng</td><td style="text-align:right;">{_fmt_num_html(cs.get('numeric_cells_standardized', 0))} ô</td><td>Đồng nhất đơn vị tính toán</td></tr>
        <tr><td style="text-align:center;">5</td><td>Tỷ lệ độ phủ đầy đủ dữ liệu (Completeness)</td><td style="text-align:right;"><strong>{cs.get('completeness_pct', 100)}%</strong></td><td>Đạt chuẩn phân tích thống kê BI</td></tr>
      </tbody>
    </table>
    <div class="source-note">Nguồn: Trích xuất từ nhật ký làm sạch dữ liệu tự động phiên {run_id} ({sheet_names}).</div>

    <div class="table-caption">Bảng 1.2: Danh mục File / Bảng nguồn và cấu trúc Cột – Dòng chuẩn thực tế (Không thêm không bớt)</div>
    <table class="doc-table">
      <thead>
        <tr><th>STT</th><th>Tệp nguồn (File)</th><th>Tên Bảng / Sheet</th><th>Số cột</th><th>Danh sách tên cột nguyên bản trong file</th><th>Số dòng dữ liệu</th></tr>
      </thead>
      <tbody>{file_inv_rows or '<tr><td colspan="6" style="text-align:center;">Không có bảng dữ liệu.</td></tr>'}</tbody>
    </table>
    <div class="source-note">Nguồn: Đọc nguyên bản 100% cấu trúc cột và dòng từ bộ dữ liệu người dùng tải lên.</div>

    <h3 class="sec-title">1.2. Thống kê mô tả các biến số định lượng trọng tâm</h3>
    <p class="doc-p">Trên tập dữ liệu sạch gồm {_fmt_num_html(cs.get('total_rows_clean', 0))} bản ghi đã được phê duyệt, hệ thống tiến hành tính toán đồng thời các tham số thống kê mô tả gồm: Tổng quy mô (Sum), Giá trị trung bình cộng (Mean), Trung vị (Median) phản ánh điểm giữa phân phối, Độ lệch chuẩn (Standard Deviation) đo lường mức độ biến thiên và biên độ Giá trị nhỏ nhất – lớn nhất (Min – Max).</p>
    <div class="table-caption">Bảng 2.1: Thống kê mô tả các chỉ số định lượng trên tập dữ liệu sạch</div>
    <table class="doc-table">
      <thead>
        <tr><th>Bảng nguồn</th><th>Chỉ tiêu định lượng</th><th>Số dòng (N)</th><th>Tổng (Sum)</th><th>Trung bình</th><th>Trung vị</th><th>Độ lệch chuẩn</th><th>Biên độ (Min → Max)</th></tr>
      </thead>
      <tbody>{num_rows or '<tr><td colspan="8" style="text-align:center;">Không có biến định lượng.</td></tr>'}</tbody>
    </table>
    <div class="source-note">Nguồn: Tổng hợp trực tiếp từ dữ liệu sạch phiên {run_id} (N = {_fmt_num_html(cs.get('total_rows_clean', 0))} bản ghi).</div>

    <div class="page-num"><span>Báo cáo Phân tích Dữ liệu — {domain_lbl}</span><span>Trang 1</span></div>
  </section>

  <!-- TRANG 2: CHƯƠNG 2 - HỆ THỐNG BIỂU ĐỒ TRỰC QUAN & PHÂN TÍCH TRỌNG TÂM (ĐÁNH SỐ Ả-RẬP 2) -->
  <section class="a4-sheet">
    <h2 class="chapter-title">CHƯƠNG 2: PHÂN TÍCH TRỌNG TÂM HỆ THỐNG BIỂU ĐỒ TRỰC QUAN</h2>
    <p class="doc-p">Mỗi biểu đồ dưới đây tóm lược ngắn gọn 3 trọng tâm cốt lõi: <strong>Số liệu trọng tâm</strong> (nhóm cao nhất – thấp nhất, xu hướng chính), <strong>Nhận định &amp; Nguyên nhân</strong> và <strong>Hành động đề xuất</strong>.</p>
    {''.join(charts_blocks_html) or '<p class="doc-p">Chưa có biểu đồ định lượng.</p>'}
    <div class="page-num"><span>Báo cáo Phân tích Dữ liệu — {domain_lbl}</span><span>Trang 2</span></div>
  </section>

  <!-- TRANG 3: CHƯƠNG 3 - PHÂN TÍCH CHUYÊN SÂU INSIGHT & PARETO ABC (ĐÁNH SỐ Ả-RẬP 3) -->
  <section class="a4-sheet">
    <h2 class="chapter-title">CHƯƠNG 3: PHÂN TÍCH CHUYÊN SÂU (DATA → INFORMATION → INSIGHT → DECISION)</h2>
    <p class="doc-p">Áp dụng mô hình chuyển hóa tri thức quản trị từ Dữ liệu thô (Data) sang Thông tin (Information), Phát hiện nguyên nhân cốt lõi (Insight) và Quyết định hành động (Decision), các phát hiện trọng tâm được chứng minh bằng số liệu cụ thể như sau:</p>
    {insights_html or '<p class="doc-p">Đang tổng hợp nhận định chuyên sâu.</p>'}
    {f"<h3 class='sec-title'>Bảng xếp hạng Ưu tiên Pareto ABC theo mức độ đóng góp</h3><div class='table-caption'>Bảng 3.1: Phân hạng ưu tiên ABC đối với các đối tượng dẫn đầu</div><table class='doc-table'><thead><tr><th>Hạng</th><th>Tên đối tượng / Đơn vị</th><th>Phân hạng ABC</th><th>Giá trị đạt được</th><th>Tỷ trọng (%)</th><th>Phân nhóm</th></tr></thead><tbody>{priority_rows}</tbody></table><div class='source-note'>Nguồn: Phân tích xếp hạng Pareto 80/20 trên tập dữ liệu sạch ({run_id}).</div>" if priority_rows else ""}
    <div class="page-num"><span>Báo cáo Phân tích Dữ liệu — {domain_lbl}</span><span>Trang 3</span></div>
  </section>

  <!-- TRANG 4: CHƯƠNG 4 - ĐỀ XUẤT GIẢI PHÁP, KẾT LUẬN & TRÍCH DẪN NGUỒN (ĐÁNH SỐ Ả-RẬP 4) -->
  <section class="a4-sheet">
    <h2 class="chapter-title">CHƯƠNG 4: ĐỀ XUẤT GIẢI PHÁP QUẢN TRỊ, LỘ TRÌNH THỰC THI VÀ KẾT LUẬN</h2>
    <p class="doc-p">Từ các bằng chứng thống kê và phân tích nguyên nhân tại Chương 2 và Chương 3, báo cáo đề xuất hệ thống giải pháp thực thi gắn liền với đơn vị chịu trách nhiệm, chỉ số đo lường hiệu quả (KPI) và điều kiện kiểm soát rủi ro cụ thể trong Bảng 4.1 dưới đây:</p>
    <div class="table-caption">Bảng 4.1: Ma trận giải pháp đề xuất, đơn vị phụ trách và chỉ số KPI mục tiêu</div>
    <table class="doc-table">
      <thead>
        <tr><th>Thứ tự ưu tiên</th><th>Vấn đề trọng tâm cần giải quyết</th><th>Giải pháp thực thi cụ thể</th><th>Đơn vị phụ trách</th><th>Chỉ số KPI đo lường</th><th>Rủi ro &amp; Điều kiện thực hiện</th></tr>
      </thead>
      <tbody>{sol_rows or '<tr><td colspan="6" style="text-align:center;">Đang cập nhật bảng giải pháp.</td></tr>'}</tbody>
    </table>
    <div class="source-note">Nguồn: Tổng hợp đề xuất từ mô hình phân tích BI Hà Thuỳ Dương (Phiên {run_id}).</div>

    <h3 class="sec-title">4.2. Kết luận Quản trị và Định hướng Hành động</h3>
    {custom_conclusion_html}
    <p class="doc-p">Báo cáo khuyến nghị doanh nghiệp duy trì cơ chế giám sát định kỳ trên hệ thống Dashboard BI trực quan, kiểm soát biến động doanh thu giữa các kênh bán và chuẩn hóa thu thập chi phí định kỳ để hạch toán biên lợi nhuận ròng hoàn chỉnh.</p>

    <h3 class="sec-title">DANH MỤC NGUỒN DỮ LIỆU VÀ TRÍCH DẪN PHƯƠNG PHÁP (REFERENCES)</h3>
    <p class="doc-p">[1] Nguồn dữ liệu thực nghiệm nội bộ: <em>{sheet_names}</em> ({_fmt_num_html(cs.get('total_rows_clean', 0))} bản ghi hợp lệ sau làm sạch, độ phủ {cs.get('completeness_pct', 100)}%, mã kiểm toán <code>{run_id}</code>).</p>
    <p class="doc-p">[2] Phương pháp kiểm định ngoại lai và chuẩn hóa: Phương pháp khoảng tứ phân vị Tukey IQR (Interquartile Range) và quy luật phân bổ trọng yếu Pareto 80/20 (Phân hạng ABC).</p>
    <div class="page-num"><span>Báo cáo Phân tích Dữ liệu — {domain_lbl}</span><span>Trang 4</span></div>
  </section>
</body></html>"""

    ev = res.get("evaluation") or {}
    evals = ev.get("evaluations") or []
    selected = [x for x in evals if x.get("overall_status") == "SELECTED"]
    prop = res.get("proposal") or {}
    survey_plan = prop.get("survey_plan") or []
    md_html = _render_md_to_clean_html(prop.get("markdown_report") or "")
    run_id = html_lib.escape(str(res.get("run_id") or ""))
    status_txt = html_lib.escape(str(res.get("workflow_status") or ""))

    max_sc = max((float(r.get("total_weighted_score") or 0) for r in evals), default=10.0) or 10.0
    exp_chart = {
        "chart_type": "column",
        "data_points": [
            {
                "label": str(r.get("location") or ""),
                "value": float(r.get("total_weighted_score") or 0),
                "pct": round(float(r.get("total_weighted_score") or 0) * 10.0, 1),
                "height_pct": round(float(r.get("total_weighted_score") or 0) * 100.0 / max_sc, 1),
            }
            for r in evals[:8]
        ],
    }
    exp_svg = _render_report_chart_svg(exp_chart)
    top_loc = selected[0].get("location", "Địa bàn dẫn đầu") if selected else (evals[0].get("location", "Địa bàn #1") if evals else "Địa bàn")
    top_sc = selected[0].get("total_weighted_score", "-") if selected else (evals[0].get("total_weighted_score", "-") if evals else "-")

    rows_html = "".join(
        f"<tr>"
        f"<td><strong>#{r.get('rank') or '-'} {html_lib.escape(str(r.get('location') or ''))}</strong></td>"
        f"<td style='text-align:right;'><strong>{r.get('total_weighted_score') if r.get('total_weighted_score') is not None else 'N/A'}</strong></td>"
        f"<td style='text-align:center;'>{html_lib.escape(str(r.get('overall_status') or ''))}</td>"
        f"<td>{html_lib.escape(str(r.get('exclusion_or_selection_reason') or ''))}</td>"
        f"</tr>"
        for r in evals
    )
    survey_html = "".join(
        f"<tr>"
        f"<td><strong>{html_lib.escape(str(s.get('location') or ''))}</strong><br><small>{html_lib.escape(str(s.get('priority_tag') or ''))}</small></td>"
        f"<td>{html_lib.escape(', '.join(s.get('target_customer_segments') or []))}</td>"
        f"<td>{html_lib.escape('; '.join(s.get('information_to_verify') or []))}</td>"
        f"<td>{html_lib.escape(str(s.get('go_no_go_criteria') or ''))}</td>"
        f"<td>{html_lib.escape(str(s.get('owner') or ''))}</td>"
        f"</tr>"
        for s in survey_plan
    )

    return f"""<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Hà Thuỳ Dương · Báo Cáo Phân Tích Dữ Liệu Chuẩn A4 ({run_id})</title>
<style>{common_a4_css}</style>
</head>
<body>
  <div class="report-toolbar no-print">
    <div>
      <h1>🌸 Hà Thuỳ Dương · Báo Cáo Phân Tích Dữ Liệu Chuẩn A4</h1>
      <div>Chuẩn A4 (210×297mm) · Phông Times New Roman 13.5pt · Lề Trái 3,2cm / Phải 1,8cm / Trên-Dưới 2,2cm · Giãn dòng 1,45 · Thụt đầu dòng 1,27cm · Căn đều Justify · Đánh số trang La Mã (i) &amp; Ả-rập (1, 2)</div>
    </div>
    <button type="button" class="print-btn" onclick="window.print()">🖨 In chuẩn A4 / Lưu PDF</button>
  </div>

  <!-- TRANG i: PHẦN MỞ ĐẦU, CAM KẾT TÍNH XÁC THỰC & MỤC LỤC (ĐÁNH SỐ LA MÃ i) -->
  <section class="a4-sheet">
    <div style="text-align:center;border-bottom:2px double #000000;padding-bottom:12px;margin-bottom:16px;">
      <div style="font-size:12pt;font-weight:bold;text-transform:uppercase;">BÁO CÁO NGHIÊN CỨU &amp; ĐÁNH GIÁ MỞ RỘNG THỊ TRƯỜNG CHUẨN BI</div>
      <h1 class="doc-title">BÁO CÁO PHÂN TÍCH DỮ LIỆU ĐA CHIỀU, XẾP HẠNG ĐỊA BÀN VÀ KẾ HOẠCH TRIỂN KHAI</h1>
      <div style="font-size:12pt;margin-top:6px;">
        <strong>Chuyên viên thực hiện:</strong> Hà Thuỳ Dương (Data Analyst &amp; BI) · <strong>Mã phiên kiểm toán:</strong> <code>{run_id}</code> · <strong>Trạng thái:</strong> {status_txt} · <strong>Ngày lập:</strong> {now_str}
      </div>
    </div>
    <h3 class="sec-title">I. LỜI CAM ĐOAN TÍNH XÁC THỰC VÀ NGUYÊN TẮC TRÍCH DẪN</h3>
    <p class="doc-p">Toàn bộ số liệu, bảng điểm trọng số và biểu đồ so sánh trong báo cáo được trích xuất trực tiếp từ 6 bảng dữ liệu chuẩn hóa của hệ thống kiểm toán ({run_id}), có gắn mã trích dẫn nguồn cụ thể cho từng nhận định. Báo cáo được biên soạn độc lập với văn phong khoa học, khách quan, đảm bảo tỷ lệ trùng lặp dưới 15%.</p>
    <h3 class="sec-title">II. MỤC LỤC BÁO CÁO</h3>
    <ul class="toc-list">
      <li><span>Phần mở đầu: Cam kết tính xác thực &amp; Mục lục báo cáo</span><span>Trang i</span></li>
      <li><span>CHƯƠNG 1: Phân tích Biểu đồ Điểm Trọng số &amp; Bảng Xếp hạng Địa bàn</span><span>Trang 1</span></li>
      <li><span>CHƯƠNG 2: Kế hoạch Khảo sát Thực địa (Go / No-Go) &amp; Báo cáo Đề xuất Chi tiết</span><span>Trang 2</span></li>
    </ul>
    <div class="page-num"><span>Hồ sơ phân tích: {run_id}</span><span>Trang i</span></div>
  </section>

  <!-- TRANG 1: CHƯƠNG 1 - BIỂU ĐỒ TRỰC QUAN & BẢNG SO SÁNH ĐỊA BÀN (ĐÁNH SỐ Ả-RẬP 1) -->
  <section class="a4-sheet">
    <h2 class="chapter-title">CHƯƠNG 1: HỆ THỐNG BIỂU ĐỒ ĐÁNH GIÁ VÀ BẢNG XẾP HẠNG ĐỊA BÀN MỤC TIÊU</h2>
    <p class="doc-p">Dựa trên bộ dữ liệu đã qua kiểm định làm sạch và chuẩn hóa đơn vị kỳ thời gian, hệ thống tiến hành chấm điểm trọng số đa tiêu chí (Quy mô thị trường, Mức độ phù hợp sản phẩm Fit, Năng lực triển khai Onsite và Mức độ cạnh tranh) đối với toàn bộ {len(evals)} địa bàn nghiên cứu.</p>
    <div class="chart-figure-box">
      <div class="fig-caption">Hình 1.1: Biểu đồ so sánh Tổng điểm trọng số (/10) giữa các địa bàn nghiên cứu</div>
      <div style="font-size:11pt;text-align:center;color:#475569;margin-bottom:6px;">Trục hoành (X): Địa bàn khảo sát · Trục tung (Y): Điểm tổng hợp có trọng số (Thang điểm 10)</div>
      {exp_svg}
      <div class="source-note">Nguồn: Tổng hợp từ 6 bảng dữ liệu chuẩn hóa phiên {run_id} (N = {len(evals)} địa bàn).</div>
      <div class="chart-analysis-grid">
        <div><strong>• Số liệu trọng tâm:</strong> Dẫn đầu là <strong>{html_lib.escape(str(top_loc))}</strong> đạt <strong>{top_sc}/10 điểm</strong> trên tổng số {len(evals)} địa bàn khảo sát.</div>
        <div><strong>• Nhận định &amp; Nguyên nhân:</strong> Chênh lệch điểm đến từ quy mô nhu cầu, mức độ phù hợp sản phẩm (Fit) và năng lực triển khai Onsite.</div>
        <div><strong>• Hành động đề xuất:</strong> Ưu tiên triển khai trước tại <strong>{html_lib.escape(str(top_loc))}</strong> và thẩm định thực địa (Go/No-Go) để đạt tỷ lệ thành công ≥ 85%.</div>
      </div>
    </div>
    <div class="table-caption">Bảng 1.1: Bảng tổng hợp kết quả chấm điểm và phân loại các địa bàn nghiên cứu</div>
    <table class="doc-table"><thead><tr><th>Địa bàn</th><th>Tổng điểm</th><th>Kết luận</th><th>Lý do &amp; Bằng chứng dữ liệu</th></tr></thead><tbody>{rows_html or '<tr><td colspan="4">Chưa có đánh giá.</td></tr>'}</tbody></table>
    <div class="source-note">Nguồn: Kết quả mô hình đánh giá đa tiêu chí phiên {run_id}.</div>
    <div class="page-num"><span>Báo cáo Phân tích Dữ liệu — Phiên {run_id}</span><span>Trang 1</span></div>
  </section>

  <!-- TRANG 2: CHƯƠNG 2 - KẾ HOẠCH KHẢO SÁT & BÁO CÁO CHI TIẾT (ĐÁNH SỐ Ả-RẬP 2) -->
  <section class="a4-sheet">
    <h2 class="chapter-title">CHƯƠNG 2: KẾ HOẠCH KHẢO SÁT THỰC ĐỊA (GO / NO-GO) VÀ BÁO CÁO CHI TIẾT</h2>
    <p class="doc-p">Nhằm đảm bảo tính xác thực thực tiễn trước khi giải ngân ngân sách mở rộng thị trường, các địa bàn được lựa chọn cần thực hiện quy trình khảo sát xác minh theo ma trận tiêu chí Go / No-Go tại Bảng 2.1 dưới đây:</p>
    <div class="table-caption">Bảng 2.1: Kế hoạch khảo sát thực địa và tiêu chí ra quyết định (Go / No-Go)</div>
    <table class="doc-table"><thead><tr><th>Địa bàn</th><th>Nhóm khách hàng</th><th>Thông tin cần xác minh</th><th>Tiêu chí Go / No-Go</th><th>Đơn vị phụ trách</th></tr></thead><tbody>{survey_html or '<tr><td colspan="5">Chưa có kế hoạch.</td></tr>'}</tbody></table>
    <div class="source-note">Nguồn: Ma trận kế hoạch khảo sát trích xuất từ phiên {run_id}.</div>
    <h3 class="sec-title">2.2. Nội dung Báo cáo Phân tích &amp; Trích dẫn Nguồn Kiểm toán</h3>
    <div class="report-box">{md_html}</div>
    <div class="page-num"><span>Báo cáo Phân tích Dữ liệu — Phiên {run_id}</span><span>Trang 2</span></div>
  </section>
</body>
</html>"""


class AgentHTTPHandler(BaseHTTPRequestHandler):
    """HTTP Request Handler for Hung Phat AI Agent Web App."""

    server_version = "HungPhatAIAgent/1.0"

    def log_message(self, format: str, *args: Any) -> None:  # noqa: A002
        # Keep terminal logs crisp and readable
        print(f"[HTTP] {self.address_string()} - {format % args}")

    def _client_ip(self) -> str:
        fwd = (self.headers.get("X-Forwarded-For") or "").split(",")[0].strip()
        if fwd:
            return fwd
        return self.client_address[0] if self.client_address else ""

    def _session_cookie(self, tok: str, max_age: int) -> str:
        sec_flag = "; Secure" if (self.headers.get("X-Forwarded-Proto") == "https" or os.environ.get("VERCEL")) else ""
        return f"{SESSION_COOKIE_NAME}={tok}; HttpOnly; Path=/; SameSite=Lax; Max-Age={max_age}{sec_flag}"

    def _current_user(self) -> Optional[Dict[str, Any]]:
        tok = parse_cookie_header(self.headers.get("Cookie") or "", SESSION_COOKIE_NAME)
        return verify_session_token(tok)

    def _is_admin(self, user: Optional[Dict[str, Any]]) -> bool:
        return bool(
            user
            and user.get("role") == "admin"
            and is_owner_identity(str(user.get("username") or ""), str(user.get("phone") or ""))
        )

    def _send_json(self, payload: Any, status: int = HTTPStatus.OK, extra_headers: Optional[List[Tuple[str, str]]] = None) -> None:
        raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        for hk, hv in (extra_headers or []):
            self.send_header(hk, hv)
        self.end_headers()
        self.wfile.write(raw)

    def _send_bytes(
        self,
        data: bytes,
        content_type: str,
        status: int = HTTPStatus.OK,
        download_name: Optional[str] = None,
        cache: str = "no-cache",
    ) -> None:
        compressible = (
            not download_name
            and len(data) > 1024
            and any(t in content_type for t in ("text/", "javascript", "json", "xml", "svg"))
            and "gzip" in (self.headers.get("Accept-Encoding") or "")
        )
        if compressible:
            data = gzip.compress(data, compresslevel=6)
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        if compressible:
            self.send_header("Content-Encoding", "gzip")
            self.send_header("Vary", "Accept-Encoding")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        self.send_header("X-Frame-Options", "SAMEORIGIN")
        if not download_name:
            self.send_header("Cache-Control", cache)
        if download_name:
            self.send_header("Content-Disposition", f'attachment; filename="{download_name}"')
        self.end_headers()
        self.wfile.write(data)

    def _read_body(self) -> bytes:
        length = int(self.headers.get("Content-Length") or 0)
        if length > 50 * 1024 * 1024:
            raise ValueError("Kích thước dữ liệu tải lên vượt quá 50MB.")
        return self.rfile.read(length) if length > 0 else b""

    def _extract_request_payload(self) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
        ctype = self.headers.get("Content-Type") or ""
        body = self._read_body()
        if "multipart/form-data" in ctype:
            fields, files = parse_multipart_form(ctype, body)
            parsed_json: Dict[str, Any] = {}
            if "payload" in fields and fields["payload"]:
                parsed_json = json.loads(fields["payload"][0])
            else:
                for k, vals in fields.items():
                    parsed_json[k] = vals[0] if len(vals) == 1 else vals
            return parsed_json, files
        if body:
            return json.loads(body.decode("utf-8")), []
        return {}, []

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = unquote(parsed.path)

        try:
            if path == "/api/health":
                gem_key = os.environ.get("GEMINI_API_KEY", "").strip()
                oai_key = os.environ.get("OPENAI_API_KEY", "").strip()
                self._send_json(
                    {
                        "status": "ok",
                        "has_gemini_key": bool(gem_key),
                        "has_openai_key": bool(oai_key),
                        "gemini_key_mode": "vertex_express" if gem_key.startswith("AQ.") else ("ai_studio" if gem_key else ""),
                        "default_agent_mode": os.environ.get("DEFAULT_AGENT_MODE", "gemini" if gem_key else "local"),
                        "default_gemini_model": os.environ.get("DEFAULT_GEMINI_MODEL", "gemini-2.5-flash"),
                        "samples": SAMPLE_CATALOG,
                        "default_criteria": DEFAULT_CRITERIA,
                        "canonical_tables": [
                            {"key": k, "label": TABLE_LABELS_VI[k], "fields": list(COLUMN_ALIASES[k].keys())}
                            for k in CANONICAL_TABLES
                        ],
                    }
                )
                return

            if path == "/api/samples":
                self._send_json({"samples": SAMPLE_CATALOG})
                return

            if path.startswith("/api/samples/") and path.endswith("/download"):
                parts = path.strip("/").split("/")
                if len(parts) == 4:
                    sample_id = parts[2]
                    fpath = SAMPLES_DIR / f"{sample_id}.xlsx"
                    if fpath.exists():
                        self._send_bytes(
                            fpath.read_bytes(),
                            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                            download_name=fpath.name,
                        )
                        return
                self._send_json({"error": "Không tìm thấy file mẫu."}, status=HTTPStatus.NOT_FOUND)
                return

            if path.startswith("/api/runs/") and path.endswith("/audit"):
                run_id = path.strip("/").split("/")[2]
                audit_path = AUDIT_DIR / f"{run_id}.json"
                if audit_path.exists():
                    self._send_bytes(
                        audit_path.read_bytes(),
                        "application/json; charset=utf-8",
                        download_name=f"{run_id}_audit.json",
                    )
                    return
                sess = _get_run_session(run_id)
                if sess:
                    audit_data = (sess.get("last_response") or {}).get("audit") or {}
                    self._send_bytes(
                        json.dumps(audit_data, ensure_ascii=False, indent=2).encode("utf-8"),
                        "application/json; charset=utf-8",
                        download_name=f"{run_id}_audit.json",
                    )
                    return
                self._send_json({"error": f"Không tìm thấy Audit Log cho phiên '{run_id}'."}, status=HTTPStatus.NOT_FOUND)
                return

            if path.startswith("/api/runs/") and path.endswith("/report.md"):
                run_id = path.strip("/").split("/")[2]
                sess = _get_run_session(run_id)
                if sess:
                    proposal = (sess.get("last_response") or {}).get("proposal") or {}
                    md = proposal.get("markdown_report") or "# Chưa có báo cáo hoàn chỉnh (Phiên đang chờ HITL)."
                    self._send_bytes(
                        md.encode("utf-8"),
                        "text/markdown; charset=utf-8",
                        download_name=f"{run_id}_BaoCao_DeXuat.md",
                    )
                    return
                self._send_json({"error": f"Không tìm thấy phiên '{run_id}'."}, status=HTTPStatus.NOT_FOUND)
                return

            if path.startswith("/api/runs/") and path.endswith("/report.html"):
                run_id = path.strip("/").split("/")[2]
                sess = _get_run_session(run_id)
                if sess:
                    html_out = render_standalone_html_report(sess["last_response"])
                    is_inline = "inline=1" in (parsed.query or "")
                    self._send_bytes(
                        html_out.encode("utf-8"),
                        "text/html; charset=utf-8",
                        download_name=None if is_inline else f"HaThuyDuong_{run_id}_BaoCao.html",
                    )
                    return
                self._send_json({"error": f"Không tìm thấy phiên '{run_id}'."}, status=HTTPStatus.NOT_FOUND)
                return

            if path.startswith("/api/runs/") and path.endswith("/cleaned.xlsx"):
                run_id = path.strip("/").split("/")[2]
                sess = _get_run_session(run_id)
                if sess:
                    xlsx_bytes = export_cleaned_excel_bytes(
                        sess["last_response"],
                        sess.get("cleaned_sheets") or sess.get("raw_sheets") or {},
                    )
                    self._send_bytes(
                        xlsx_bytes,
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        download_name=f"HaThuyDuong_{run_id}_DuLieu_DaLamSach.xlsx",
                    )
                    return
                self._send_json({"error": f"Không tìm thấy phiên '{run_id}'."}, status=HTTPStatus.NOT_FOUND)
                return

            if path.startswith("/api/runs/") and path.endswith("/analysis.xlsx"):
                run_id = path.strip("/").split("/")[2]
                sess = _get_run_session(run_id)
                if sess:
                    xlsx_bytes = export_analysis_excel_bytes(sess["last_response"])
                    self._send_bytes(
                        xlsx_bytes,
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        download_name=f"HaThuyDuong_{run_id}_TongHop_BieuDo_PhanTich.xlsx",
                    )
                    return
                self._send_json({"error": f"Không tìm thấy phiên '{run_id}'."}, status=HTTPStatus.NOT_FOUND)
                return

            if path.startswith("/api/runs/") and path.endswith("/report.docx"):
                run_id = path.strip("/").split("/")[2]
                sess = _get_run_session(run_id)
                if sess:
                    docx_bytes = export_report_docx_bytes(sess["last_response"])
                    self._send_bytes(
                        docx_bytes,
                        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                        download_name=f"HaThuyDuong_{run_id}_BaoCao_PhanTich_BI.docx",
                    )
                    return
                self._send_json({"error": f"Không tìm thấy phiên '{run_id}'."}, status=HTTPStatus.NOT_FOUND)
                return

            if path == "/favicon.ico":
                self.send_response(HTTPStatus.NO_CONTENT)
                self.send_header("Content-Length", "0")
                self.end_headers()
                return

            if path == "/sitemap.xml":
                host = self.headers.get("Host") or "localhost:8000"
                proto = "https" if (self.headers.get("X-Forwarded-Proto") == "https") else "http"
                self._send_bytes(build_sitemap_xml(f"{proto}://{host}").encode("utf-8"), "application/xml; charset=utf-8", cache="public, max-age=3600")
                return

            if path == "/robots.txt":
                host = self.headers.get("Host") or "localhost:8000"
                proto = "https" if (self.headers.get("X-Forwarded-Proto") == "https") else "http"
                self._send_bytes(build_robots_txt(f"{proto}://{host}").encode("utf-8"), "text/plain; charset=utf-8", cache="public, max-age=3600")
                return

            if path == "/api/auth/me":
                self._send_json({"user": self._current_user()})
                return

            if path == "/api/user/my-stats":
                user = self._current_user()
                if not user:
                    self._send_json({"error": "Vui lòng đăng nhập để xem thống kê cá nhân."}, status=HTTPStatus.UNAUTHORIZED)
                    return
                self._send_json(get_user_personal_stats(user["username"]))
                return

            if path == "/api/site-settings":
                self._send_json(get_site_settings())
                return

            if path in ("/admin", "/admin/"):
                user = self._current_user()
                if user and not self._is_admin(user):
                    denied_html = (
                        "<!DOCTYPE html><html lang='vi'><head><meta charset='UTF-8'>"
                        "<title>403 · Không có quyền truy cập</title></head>"
                        "<body style='font-family:sans-serif;background:#fff4f8;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;'>"
                        "<div style='background:#fff;padding:32px;border-radius:24px;max-width:440px;text-align:center;box-shadow:0 20px 50px rgba(229,123,165,.22);border:1.5px solid #fbcfe8;'>"
                        "<h1 style='color:#9d416a;margin:0 0 10px;'>🔒 403 · Chỉ dành cho Admin</h1>"
                        "<p style='color:#475569;font-size:14px;'>Chỉ tài khoản Quản trị viên chủ sở hữu (<strong>Hà Thuỳ Dương</strong>) mới xem được thông tin mọi người tại đây.</p>"
                        "<a href='/' style='display:inline-block;margin-top:14px;padding:10px 20px;border-radius:14px;background:#e57ba5;color:#fff;text-decoration:none;font-weight:700;'>← Quay về trang chủ</a>"
                        "</div></body></html>"
                    )
                    self._send_bytes(denied_html.encode("utf-8"), "text/html; charset=utf-8", status=HTTPStatus.FORBIDDEN)
                    return
                admin_file = (WEB_DIR / "admin.html").resolve()
                if admin_file.is_file():
                    self._send_bytes(admin_file.read_bytes(), "text/html; charset=utf-8")
                    return

            if path == "/api/admin/stats":
                user = self._current_user()
                if not self._is_admin(user):
                    self._send_json({"error": "Chỉ tài khoản Quản trị (Admin) mới có quyền xem thống kê tất cả mọi người."}, status=HTTPStatus.FORBIDDEN)
                    return
                self._send_json(get_admin_dashboard_stats(CONTACT_FILE, AUDIT_DIR))
                return

            # Static files or clean SPA routes
            clean_path = path.rstrip("/") or "/"
            if clean_path in SPA_ROUTES:
                rel_path = "index.html"
            else:
                rel_path = "index.html" if path in ("/", "") else path.lstrip("/")
            if rel_path == "index.html":
                u = self._current_user()
                log_analytics_event(
                    "page_view",
                    path=clean_path,
                    user_agent=self.headers.get("User-Agent") or "",
                    ip=self._client_ip(),
                    username=u["username"] if u else "guest",
                )
            target = (WEB_DIR / rel_path).resolve()
            if not str(target).startswith(str(WEB_DIR.resolve())) or not target.is_file():
                self._send_json({"error": "Not found"}, status=HTTPStatus.NOT_FOUND)
                return
            mime, _ = mimetypes.guess_type(str(target))
            ctype = mime or "application/octet-stream"
            if ctype.startswith("text/") or ctype in ("application/javascript", "application/json", "application/xml"):
                ctype = f"{ctype}; charset=utf-8"
            self._send_bytes(target.read_bytes(), ctype)
        except Exception as exc:
            self._send_json({"error": str(exc)}, status=HTTPStatus.INTERNAL_SERVER_ERROR)

    def do_POST(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = unquote(parsed.path)

        try:
            payload, files = self._extract_request_payload()

            if path == "/api/auth/register":
                user = register_user(
                    display_name=str(payload.get("display_name") or ""),
                    username=str(payload.get("username") or ""),
                    phone=str(payload.get("phone") or ""),
                    password=str(payload.get("password") or ""),
                )
                tok = create_session_token(user["username"], user["display_name"], user["role"], user.get("phone", ""))
                cookie = self._session_cookie(tok, SESSION_TTL_SEC)
                log_analytics_event("register", path="/api/auth/register", user_agent=self.headers.get("User-Agent") or "", ip=self._client_ip(), username=user["username"])
                self._send_json({"user": user}, extra_headers=[("Set-Cookie", cookie)])
                return

            if path == "/api/auth/login":
                user = authenticate_user(
                    identifier=str(payload.get("username") or ""),
                    password=str(payload.get("password") or ""),
                )
                tok = create_session_token(user["username"], user["display_name"], user["role"], user.get("phone", ""))
                cookie = self._session_cookie(tok, SESSION_TTL_SEC)
                log_analytics_event("login", path="/api/auth/login", user_agent=self.headers.get("User-Agent") or "", ip=self._client_ip(), username=user["username"])
                self._send_json({"user": user}, extra_headers=[("Set-Cookie", cookie)])
                return

            if path == "/api/auth/forgot-password":
                res = request_password_reset_otp(phone=str(payload.get("phone") or ""))
                self._send_json(res)
                return

            if path == "/api/auth/reset-password":
                res = reset_password_with_otp(
                    phone=str(payload.get("phone") or ""),
                    otp_code=str(payload.get("otp_code") or ""),
                    new_password=str(payload.get("new_password") or ""),
                )
                self._send_json(res)
                return

            if path == "/api/auth/logout":
                cookie = self._session_cookie("", 0)
                self._send_json({"ok": True}, extra_headers=[("Set-Cookie", cookie)])
                return

            if path == "/api/admin/users/lock":
                user = self._current_user()
                if not self._is_admin(user):
                    self._send_json({"error": "Chỉ Quản trị viên (Admin) mới có quyền khóa/mở khóa tài khoản."}, status=HTTPStatus.FORBIDDEN)
                    return
                res = toggle_user_lock(
                    username=str(payload.get("username") or ""),
                    locked=bool(payload.get("locked")),
                )
                self._send_json(res)
                return

            if path == "/api/admin/settings":
                user = self._current_user()
                if not self._is_admin(user):
                    self._send_json({"error": "Chỉ Quản trị viên (Admin) mới có quyền thay đổi cài đặt hệ thống."}, status=HTTPStatus.FORBIDDEN)
                    return
                saved = update_site_settings(payload if isinstance(payload, dict) else {})
                self._send_json({"ok": True, "settings": saved})
                return

            if path == "/api/contact":
                save_contact_request(payload)
                self._send_json({"ok": True, "message": "Đã nhận yêu cầu tư vấn."})
                return

            if path == "/api/chat":
                msg = str(payload.get("message") or "").strip()
                if not msg:
                    self._send_json({"reply": "Bạn hãy nhập câu hỏi nhé!"})
                    return
                gem_key = os.environ.get("GEMINI_API_KEY", "").strip()
                gem_model = os.environ.get("DEFAULT_GEMINI_MODEL", "gemini-2.5-flash").strip()
                reply = ""
                if gem_key:
                    try:
                        reply = chat_with_assistant(
                            message=msg,
                            history=payload.get("history") or [],
                            api_key=gem_key,
                            model=gem_model,
                            lang=str(payload.get("lang") or "vi"),
                        )
                    except Exception:
                        reply = ""
                u = self._current_user()
                log_analytics_event("chat_message", path="/api/chat", user_agent=self.headers.get("User-Agent") or "", ip=self._client_ip(), username=u["username"] if u else "guest")
                self._send_json({"reply": reply, "used_ai": bool(reply)})
                return

            if path == "/api/report/html":
                res_obj = payload.get("result") if isinstance(payload, dict) else None
                if not isinstance(res_obj, dict) or not res_obj.get("run_id"):
                    self._send_json({"error": "Thiếu dữ liệu báo cáo để dựng HTML."}, status=HTTPStatus.BAD_REQUEST)
                    return
                r_id = str(res_obj.get("run_id") or "")
                sess = _get_run_session(r_id)
                if sess:
                    sess["last_response"] = res_obj
                    _save_run_session(r_id)
                html_out = render_standalone_html_report(res_obj)
                self._send_bytes(html_out.encode("utf-8"), "text/html; charset=utf-8")
                return

            if path == "/api/inspect-inputs":
                urls = payload.get("google_sheet_urls") or []
                if isinstance(urls, str):
                    urls = [u.strip() for u in urls.splitlines() if u.strip()]
                lark_urls = payload.get("lark_base_urls") or []
                if isinstance(lark_urls, str):
                    lark_urls = [u.strip() for u in lark_urls.splitlines() if u.strip()]
                sample_id = str(payload.get("sample_id") or "").strip()
                fetch_all_tabs = bool(payload.get("fetch_all_tabs", True))
                doc_texts: Dict[str, List[str]] = {}

                cfg_inspect = payload.get("config") or {}
                raw_sheets, source_meta = load_inputs_from_sources(
                    uploaded_files=files,
                    google_sheet_urls=urls,
                    sample_id=sample_id,
                    fetch_all_tabs=fetch_all_tabs,
                    lark_base_urls=lark_urls,
                    lark_app_id=str(payload.get("lark_app_id") or ""),
                    lark_app_secret=str(payload.get("lark_app_secret") or ""),
                    lark_token=str(payload.get("lark_token") or ""),
                    document_texts_out=doc_texts,
                    gemini_key=str(cfg_inspect.get("api_key") or ""),
                    gemini_model=str(cfg_inspect.get("model") or "gemini-2.5-flash"),
                )
                staged_id = f"STG-{uuid.uuid4().hex[:8].upper()}"
                STAGED_INPUTS[staged_id] = {
                    "raw_sheets": raw_sheets,
                    "source_meta": source_meta,
                    "document_texts": doc_texts,
                }
                schema_info = classify_sheets_to_canonical(raw_sheets)
                previews = {
                    s_name: [
                        {k: v for k, v in r.items() if not str(k).startswith("_")}
                        for r in rows[:3]
                    ]
                    for s_name, rows in raw_sheets.items()
                }
                tables_summary = [
                    {
                        "sheet_name": s_name,
                        "source_file": str((rows[0].get("_source_file") if rows else "") or s_name),
                        "row_count": len(rows),
                        "column_count": len([k for k in (rows[0].keys() if rows else []) if not str(k).startswith("_")]),
                        "columns": [k for k in (rows[0].keys() if rows else []) if not str(k).startswith("_")],
                        "missing_cells": sum(
                            1
                            for r in rows
                            for k, v in r.items()
                            if not str(k).startswith("_") and (v is None or str(v).strip() == "")
                        ),
                    }
                    for s_name, rows in raw_sheets.items()
                ]
                empty_sheets = [m for m in source_meta if m.get("empty")]
                insp_reasons: List[str] = []
                insp_cannot_analyze = False
                insp_severity = "ok"
                total_insp_rows = sum(t["row_count"] for t in tables_summary)
                total_insp_cells = sum(t["row_count"] * max(1, t["column_count"]) for t in tables_summary)
                total_insp_missing = sum(t["missing_cells"] for t in tables_summary)
                any_numeric_col = False
                any_non_zero_num = False
                unnamed_insp_cols: List[str] = []
                num_hdr_insp_cols: List[str] = []

                for s_name, rows in raw_sheets.items():
                    cols = [str(k) for k in (rows[0].keys() if rows else []) if not str(k).startswith("_")]
                    for c_name in cols:
                        cs_trim = c_name.strip()
                        if re.fullmatch(r"(?i)(cot|col)[_\s]*\d+", cs_trim):
                            unnamed_insp_cols.append(f"{s_name}: {cs_trim}")
                        elif parse_number(cs_trim) is not None and re.fullmatch(r"[-+]?[\d.,\s%]+", cs_trim):
                            num_hdr_insp_cols.append(f"{s_name}: '{cs_trim}'")
                        parsed_nums = [parse_number(r.get(c_name)) for r in rows]
                        valid_nums = [v for v in parsed_nums if v is not None]
                        if valid_nums and len(valid_nums) >= max(1, len(rows) // 3):
                            any_numeric_col = True
                            if any(abs(v) > 0 for v in valid_nums):
                                any_non_zero_num = True

                if total_insp_rows == 0 and not doc_texts:
                    insp_cannot_analyze = True
                    insp_severity = "critical"
                    insp_reasons.append("Dữ liệu hoàn toàn trống: Không có ô, cột hoặc dòng dữ liệu nào cả.")
                else:
                    if not any_numeric_col and not doc_texts:
                        insp_cannot_analyze = True
                        insp_severity = "critical"
                        insp_reasons.append(
                            "Không phân tích được số liệu: Bảng dữ liệu không có cột con số định lượng nào hợp lệ (chỉ toàn chữ hoặc ký tự lỗi) nên không thể tính toán chỉ số KPI hay vẽ biểu đồ."
                        )
                    elif any_numeric_col and not any_non_zero_num:
                        insp_cannot_analyze = True
                        insp_severity = "critical"
                        insp_reasons.append(
                            "Tất cả các con số trong dữ liệu đều bằng 0: Không thể tính tỷ trọng, phân nhóm hay phân tích xu hướng từ các số 0."
                        )
                    if 0 < total_insp_rows <= 1 and not doc_texts:
                        insp_cannot_analyze = True
                        if insp_severity != "critical":
                            insp_severity = "warning"
                        insp_reasons.append(
                            f"Dữ liệu chỉ có {total_insp_rows} dòng duy nhất: Quá ít dữ liệu để so sánh, xếp hạng hoặc vẽ biểu đồ phân tích."
                        )
                    if num_hdr_insp_cols:
                        insp_cannot_analyze = True
                        insp_severity = "critical"
                        insp_reasons.append(
                            f"Thiếu dòng tiêu đề cột: Dòng đầu tiên đang là con số ({', '.join(num_hdr_insp_cols[:4])}) thay vì tên cột, khiến hệ thống không xác định được ý nghĩa của các con số."
                        )
                    if unnamed_insp_cols:
                        if insp_severity == "ok":
                            insp_severity = "warning"
                        insp_reasons.append(
                            f"Phát hiện {len(unnamed_insp_cols)} cột không có tên tiêu đề rõ ràng ({', '.join(unnamed_insp_cols[:4])})."
                        )
                    if total_insp_cells > 0 and (total_insp_missing * 100.0 / total_insp_cells) > 35.0:
                        if insp_severity == "ok":
                            insp_severity = "warning"
                        miss_pct = round(total_insp_missing * 100.0 / total_insp_cells, 1)
                        insp_reasons.append(
                            f"Dữ liệu bị bỏ trống nhiều ({total_insp_missing} ô trống, chiếm {miss_pct}% tổng số ô)."
                        )
                    for es in empty_sheets[:3]:
                        if insp_severity == "ok":
                            insp_severity = "warning"
                        insp_reasons.append(str(es.get("note") or f"Sheet '{es.get('sheet_name')}' trống: không có ô, cột nào cả."))

                inspect_warning = {
                    "has_warning": bool(insp_reasons),
                    "severity": insp_severity,
                    "cannot_analyze": insp_cannot_analyze,
                    "headline": (
                        "🚨 CẢNH BÁO: KHÔNG PHÂN TÍCH ĐƯỢC VỚI NHỮNG CON SỐ & DỮ LIỆU HIỆN TẠI!"
                        if insp_cannot_analyze
                        else "⚠️ CẢNH BÁO: DỮ LIỆU CÓ CỘT CHƯA RÕ RÀNG HOẶC BỊ KHUYẾT THIẾU!"
                        if insp_reasons
                        else ""
                    ),
                    "reasons": insp_reasons,
                }
                self._send_json(
                    {
                        "staged_id": staged_id,
                        "tables": tables_summary,
                        "empty_sheets": empty_sheets,
                        "inspect_warning": inspect_warning,
                        "source_metadata": source_meta,
                        "sheet_assignments": schema_info["sheet_assignments"],
                        "column_maps": schema_info["column_maps"],
                        "previews": previews,
                        "document_texts": {k: len(v) for k, v in doc_texts.items()},
                    }
                )
                return

            if path == "/api/run":
                staged_id = str(payload.get("staged_id") or "").strip()
                doc_texts: Dict[str, List[str]] = {}
                if staged_id and staged_id in STAGED_INPUTS and not files and not payload.get("google_sheet_urls") and not payload.get("lark_base_urls") and not payload.get("sample_id"):
                    raw_sheets = STAGED_INPUTS[staged_id]["raw_sheets"]
                    source_meta = STAGED_INPUTS[staged_id]["source_meta"]
                    doc_texts = STAGED_INPUTS[staged_id].get("document_texts") or {}
                else:
                    urls = payload.get("google_sheet_urls") or []
                    if isinstance(urls, str):
                        urls = [u.strip() for u in urls.splitlines() if u.strip()]
                    lark_urls = payload.get("lark_base_urls") or []
                    if isinstance(lark_urls, str):
                        lark_urls = [u.strip() for u in lark_urls.splitlines() if u.strip()]
                    sample_id = str(payload.get("sample_id") or "").strip()
                    fetch_all_tabs = bool(payload.get("fetch_all_tabs", True))
                    cfg = payload.get("config") or {}
                    raw_sheets, source_meta = load_inputs_from_sources(
                        uploaded_files=files,
                        google_sheet_urls=urls,
                        sample_id=sample_id,
                        fetch_all_tabs=fetch_all_tabs,
                        lark_base_urls=lark_urls,
                        lark_app_id=str(payload.get("lark_app_id") or ""),
                        lark_app_secret=str(payload.get("lark_app_secret") or ""),
                        lark_token=str(payload.get("lark_token") or ""),
                        document_texts_out=doc_texts,
                        gemini_key=str(cfg.get("api_key") or ""),
                        gemini_model=str(cfg.get("model") or "gemini-2.5-flash"),
                    )

                result = ORCHESTRATOR.start_run(
                    raw_sheets=raw_sheets,
                    source_metadata=source_meta,
                    config=payload.get("config") or {},
                    table_overrides=payload.get("table_overrides") or {},
                    column_overrides=payload.get("column_overrides") or {},
                    human_resolutions=payload.get("human_resolutions") or {},
                    document_texts=doc_texts,
                )
                _save_run_session(str(result.get("run_id") or ""))
                u = self._current_user()
                log_analytics_event("analysis_run", path="/api/run", user_agent=self.headers.get("User-Agent") or "", ip=self._client_ip(), username=u["username"] if u else "guest", extra={"run_id": result.get("run_id")})
                self._send_json(result)
                return

            if path == "/api/hitl/resolve":
                run_id = str(payload.get("run_id") or "").strip()
                if not run_id:
                    raise ValueError("Thiếu run_id để xử lý HITL.")
                extra_sheets: Dict[str, List[Dict[str, Any]]] = {}
                urls = payload.get("google_sheet_urls") or []
                if isinstance(urls, str):
                    urls = [u.strip() for u in urls.splitlines() if u.strip()]
                if files or urls:
                    extra_sheets, _ = load_inputs_from_sources(
                        uploaded_files=files,
                        google_sheet_urls=urls,
                        fetch_all_tabs=bool(payload.get("fetch_all_tabs", True)),
                    )

                result = ORCHESTRATOR.resume_with_human_input(
                    run_id=run_id,
                    human_resolutions=payload.get("human_resolutions") or {},
                    extra_sheets=extra_sheets,
                )
                _save_run_session(str(result.get("run_id") or ""))
                u = self._current_user()
                log_analytics_event("analysis_run", path="/api/run", user_agent=self.headers.get("User-Agent") or "", ip=self._client_ip(), username=u["username"] if u else "guest", extra={"run_id": result.get("run_id")})
                self._send_json(result)
                return

            if path == "/api/hitl/boundary-signoff":
                run_id = str(payload.get("run_id") or "").strip()
                decision = str(payload.get("decision") or "APPROVED_TOP_2").strip()
                chosen = payload.get("chosen_locations")
                note = str(payload.get("note") or "").strip()
                result = ORCHESTRATOR.record_boundary_decision(
                    run_id=run_id,
                    decision=decision,
                    chosen_locations=chosen,
                    note=note,
                )
                _save_run_session(str(result.get("run_id") or ""))
                u = self._current_user()
                log_analytics_event("analysis_run", path="/api/run", user_agent=self.headers.get("User-Agent") or "", ip=self._client_ip(), username=u["username"] if u else "guest", extra={"run_id": result.get("run_id")})
                self._send_json(result)
                return

            self._send_json({"error": f"Endpoint không tồn tại: {path}"}, status=HTTPStatus.NOT_FOUND)

        except ValueError as exc:
            self._send_json(
                {
                    "error": str(exc),
                    "gate_failed": "RECEIVE_DATA",
                    "requires_resubmit": True,
                },
                status=HTTPStatus.BAD_REQUEST,
            )
        except KeyError as exc:
            self._send_json({"error": str(exc)}, status=HTTPStatus.NOT_FOUND)
        except Exception as exc:
            traceback.print_exc()
            self._send_json({"error": f"Lỗi xử lý hệ thống: {exc}"}, status=HTTPStatus.INTERNAL_SERVER_ERROR)


# Vercel Python serverless entrypoints (supports both BaseHTTPRequestHandler `handler` and WSGI `app`)
handler = AgentHTTPHandler


def app(environ: Dict[str, Any], start_response: Any) -> List[bytes]:
    """Zero-dependency WSGI adapter around AgentHTTPHandler for Vercel Python framework."""
    import http.client
    import io

    try:
        class _WSGIHandler(AgentHTTPHandler):
            def __init__(self) -> None:
                self.command = str(environ.get("REQUEST_METHOD", "GET")).upper()
                qs = str(environ.get("QUERY_STRING", "") or "")
                path_info = str(environ.get("PATH_INFO", "/") or "/")
                self.path = f"{path_info}?{qs}" if qs else path_info
                self.request_version = str(environ.get("SERVER_PROTOCOL", "HTTP/1.1"))
                self.client_address = (str(environ.get("REMOTE_ADDR", "127.0.0.1")), 0)

                hdrs = http.client.HTTPMessage()
                if environ.get("CONTENT_TYPE"):
                    hdrs["Content-Type"] = str(environ["CONTENT_TYPE"])
                if environ.get("CONTENT_LENGTH"):
                    hdrs["Content-Length"] = str(environ["CONTENT_LENGTH"])
                for k, v in environ.items():
                    if k.startswith("HTTP_") and v is not None:
                        name = k[5:].replace("_", "-").title()
                        hdrs[name] = str(v)
                self.headers = hdrs

                try:
                    clen = int(environ.get("CONTENT_LENGTH") or 0)
                except (TypeError, ValueError):
                    clen = 0
                stream = environ.get("wsgi.input")
                if stream is not None and clen > 0:
                    raw_in = stream.read(clen)
                elif stream is not None and self.command == "POST":
                    raw_in = stream.read()
                else:
                    raw_in = b""
                if isinstance(raw_in, str):
                    raw_in = raw_in.encode("utf-8")
                self.rfile = io.BytesIO(raw_in or b"")
                self.wfile = io.BytesIO()
                self._wsgi_status = 200
                self._wsgi_headers: List[Tuple[str, str]] = []

            def send_response(self, code: int, message: Optional[str] = None) -> None:
                self._wsgi_status = int(code)

            def send_header(self, keyword: str, value: str) -> None:
                self._wsgi_headers.append((str(keyword), str(value)))

            def end_headers(self) -> None:
                return None

        h = _WSGIHandler()
        if h.command == "POST":
            h.do_POST()
        else:
            h.do_GET()

        try:
            phrase = HTTPStatus(h._wsgi_status).phrase
        except ValueError:
            phrase = "OK"
        start_response(f"{h._wsgi_status} {phrase}", h._wsgi_headers)
        return [h.wfile.getvalue()]
    except Exception as exc:
        err_bytes = json.dumps({"error": f"Server error: {exc}"}, ensure_ascii=False).encode("utf-8")
        start_response("500 Internal Server Error", [("Content-Type", "application/json; charset=utf-8"), ("Content-Length", str(len(err_bytes)))])
        return [err_bytes]


class _ReuseThreadingHTTPServer(ThreadingHTTPServer):
    allow_reuse_address = True


class _ReuseIPv6HTTPServer(_ReuseThreadingHTTPServer):
    address_family = socket.AF_INET6


def create_server(host: str = "127.0.0.1", port: int = 8000) -> ThreadingHTTPServer:
    AUDIT_DIR.mkdir(parents=True, exist_ok=True)
    return _ReuseThreadingHTTPServer((host, port), AgentHTTPHandler)


def main() -> None:
    import webbrowser

    env_port = os.environ.get("PORT", "").strip()
    default_port = int(env_port) if env_port.isdigit() else 8000
    default_host = "0.0.0.0" if env_port else "127.0.0.1"

    parser = argparse.ArgumentParser(description="Ha Thuy Duong - Data Analyst & BI Server")
    parser.add_argument("--host", default=default_host)
    parser.add_argument("--port", type=int, default=default_port)
    parser.add_argument("--open", action="store_true", help="Tự động mở trình duyệt mặc định")
    args = parser.parse_args()

    listen_host = "127.0.0.1" if args.host == "localhost" else args.host
    chosen_port = args.port
    server = None
    for cand_port in range(args.port, args.port + 15):
        try:
            server = create_server(host=listen_host, port=cand_port)
            chosen_port = cand_port
            break
        except OSError:
            continue
    if server is None:
        raise OSError(f"Không tìm thấy cổng trống từ {args.port} đến {args.port + 14}.")

    # Also bind IPv6 loopback (::1) on macOS so http://localhost:<port> always resolves cleanly
    ipv6_server = None
    if listen_host in ("127.0.0.1", "0.0.0.0") and getattr(socket, "has_ipv6", False):
        try:
            v6_addr = "::" if listen_host == "0.0.0.0" else "::1"
            ipv6_server = _ReuseIPv6HTTPServer((v6_addr, chosen_port), AgentHTTPHandler)
            threading.Thread(target=ipv6_server.serve_forever, daemon=True).start()
        except OSError:
            ipv6_server = None

    url_localhost = f"http://localhost:{chosen_port}"
    url_ip = f"http://{listen_host}:{chosen_port}"
    print(f"Hung Phat AI Agent Web App đang chạy tại: {url_localhost} ({url_ip})", flush=True)
    if args.open:
        threading.Timer(0.6, lambda: webbrowser.open(f"{url_localhost}/gui-du-lieu")).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nĐang dừng server...")
        server.shutdown()
        if ipv6_server is not None:
            ipv6_server.shutdown()


if __name__ == "__main__":
    main()

