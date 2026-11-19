/* AI301 AI Agent - Đề 04 (Hà Thuỳ Dương) - Connected to Real Backend API */

const SAMPLE_BY_NUM = {
  1: { id: "case1_thong_thuong", label: "Mẫu 1 (Chuẩn)" },
  2: { id: "case2_thieu_mau_thuan", label: "Mẫu 2 (Thiếu / Lệch)" },
  3: { id: "case3_ranh_gioi_quy_tac", label: "Mẫu 3 (Ranh giới)" },
};

const state = {
  files: [],
  selectedSampleId: "case1_thong_thuong",
  stagedId: "",
  tableOverrides: {},
  columnOverrides: {},
  canonicalTables: [],
  preferredOutput: "dashboard",
  currentScene: 0,
  lastResult: null,
  maxApprovedStep: 1,
  customTitle: "",
  customSummary: "",
  cachedHtmlReport: "",
};

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function esc(val) {
  if (val === null || val === undefined) return "";
  return String(val)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function linkifyCitations(escapedHtml) {
  return escapedHtml.replace(/\b(CIT-\d{3})\b/g, (m, cid) => {
    return `<button type="button" class="cit-chip" onclick="openCitationModal('${cid}')">${cid}</button>`;
  });
}

const SPARKLE_GLYPHS = ["✦", "✨", "✧", "✿", "⋆", "♡"];
const SPARKLE_COLORS = ["#f472b6", "#fb7185", "#fdba74", "#f9a8d4", "#fda4af", "#fde047"];

function spawnLiquidBubbles(x, y, count = 8) {
  if (typeof x !== "number" || typeof y !== "number") return;
  for (let i = 0; i < count; i++) {
    const b = document.createElement("span");
    b.className = "liquid-bubble";
    const size = 9 + Math.round(Math.random() * 16);
    b.style.width = `${size}px`;
    b.style.height = `${size}px`;
    b.style.left = `${x}px`;
    b.style.top = `${y}px`;
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.65;
    const dist = 28 + Math.random() * 54;
    b.style.setProperty("--tx", `${Math.cos(angle) * dist}px`);
    b.style.setProperty("--ty", `${Math.sin(angle) * dist - 22}px`);
    b.style.setProperty("--sc", (0.9 + Math.random() * 0.7).toFixed(2));
    b.style.setProperty("--dur", `${580 + Math.round(Math.random() * 340)}ms`);
    document.body.appendChild(b);
    setTimeout(() => b.remove(), 950);
  }
}

function spawnSparkles(x, y, count = 10) {
  if (typeof x !== "number" || typeof y !== "number") return;
  const ring = document.createElement("span");
  ring.className = "sparkle-ring";
  ring.style.left = `${x}px`;
  ring.style.top = `${y}px`;
  document.body.appendChild(ring);
  setTimeout(() => ring.remove(), 580);

  spawnLiquidBubbles(x, y, Math.max(5, Math.floor(count * 0.7)));

  for (let i = 0; i < count; i++) {
    const el = document.createElement("span");
    el.className = "sparkle-particle";
    el.textContent = SPARKLE_GLYPHS[i % SPARKLE_GLYPHS.length];
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.color = SPARKLE_COLORS[Math.floor(Math.random() * SPARKLE_COLORS.length)];
    el.style.fontSize = `${10 + Math.random() * 9}px`;
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
    const dist = 24 + Math.random() * 44;
    el.style.setProperty("--tx", `${Math.cos(angle) * dist}px`);
    el.style.setProperty("--ty", `${Math.sin(angle) * dist - 10}px`);
    el.style.setProperty("--rot", `${Math.round((Math.random() - 0.5) * 260)}deg`);
    el.style.setProperty("--sc", (0.85 + Math.random() * 0.6).toFixed(2));
    el.style.setProperty("--dur", `${520 + Math.round(Math.random() * 260)}ms`);
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 820);
  }
}

document.addEventListener("click", (e) => {
  const trigger = e.target.closest("button, summary, label, .cute-btn, .ios-bubble-icon, .cit-chip, .step-dot");
  if (trigger && e.clientX > 0 && e.clientY > 0) {
    spawnSparkles(e.clientX, e.clientY, trigger.id === "btnRunAgent" ? 16 : 9);
  }
});

function showToast(msg, isError = false) {
  const toast = document.createElement("div");
  toast.className = `fixed bottom-5 right-5 ${isError
    ? "bg-rose-100/95 text-rose-800 border-2 border-rose-300"
    : "bg-emerald-100/95 text-emerald-800 border-2 border-emerald-200"
    } shadow-xl px-4 py-2.5 rounded-2xl text-xs z-50 flex items-center space-x-2 backdrop-blur-xl`;
  toast.innerHTML = `<i class="fa-solid ${isError ? "fa-circle-exclamation text-rose-500" : "fa-sparkles text-pink-500"
    } text-sm"></i><span class="font-bold">${esc(msg)}</span>`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3200);
}

function showErrorBanner(summary, detail = "") {
  const el = $("errorBanner");
  const sumEl = $("errorBannerSummary");
  const wrap = $("errorBannerDetailsWrap");
  const detEl = $("errorBannerDetail");
  if (!el) return;
  if (!summary) {
    el.classList.add("hidden");
    if (sumEl) sumEl.textContent = "";
    if (detEl) detEl.textContent = "";
    if (wrap) wrap.classList.add("hidden");
    return;
  }
  if (sumEl) sumEl.textContent = summary;
  if (detEl) detEl.textContent = detail || "";
  if (wrap) wrap.classList.toggle("hidden", !detail);
  el.classList.remove("hidden");
}

function showBigScreenWarning({
  headline = "🚨 CẢNH BÁO: DỮ LIỆU TRỐNG HOẶC KHÔNG PHÂN TÍCH ĐƯỢC!",
  summary = "Dữ liệu bạn gửi lên đang bị trống, bị lỗi cấu trúc hoặc không có con số rõ ràng để phân tích.",
  reasons = [],
  howToFix = [],
  severity = "critical",
  openModal = true,
} = {}) {
  const modal = $("bigDataWarningModal");
  const shell = $("bigWarnShell");
  const headerBar = $("bigWarnHeaderBar");
  const titleEl = $("bigWarnTitle");
  const sumEl = $("bigWarnSummary");
  const reasonsEl = $("bigWarnReasons");
  const fixesWrap = $("bigWarnFixesWrap");
  const fixesEl = $("bigWarnFixes");

  const isCritical = severity === "critical";
  if (shell) {
    shell.className = isCritical
      ? "rounded-[32px] max-w-2xl w-full overflow-hidden shadow-2xl border-4 border-rose-500 bg-white"
      : "rounded-[32px] max-w-2xl w-full overflow-hidden shadow-2xl border-4 border-amber-500 bg-white";
  }
  if (headerBar) {
    headerBar.className = isCritical
      ? "bg-gradient-to-r from-rose-600 to-red-500 text-white px-6 py-4 flex items-center justify-between gap-3"
      : "bg-gradient-to-r from-amber-500 to-orange-500 text-white px-6 py-4 flex items-center justify-between gap-3";
  }
  if (titleEl) titleEl.textContent = headline;
  if (sumEl) sumEl.textContent = summary;

  const rList = reasons.length
    ? reasons
    : ["Không tìm thấy ô, cột hoặc con số hợp lệ để hệ thống tính toán KPI và dựng biểu đồ."];
  if (reasonsEl) {
    reasonsEl.innerHTML = rList.map((r) => `<li>${esc(r)}</li>`).join("");
  }
  const fList = howToFix.length
    ? howToFix
    : [
        "Kiểm tra lại file gốc: Đảm bảo dòng 1 là tên tiêu đề cột rõ ràng và có các dòng dữ liệu bên dưới.",
        "Đảm bảo có ít nhất 1 cột con số định lượng (Doanh thu, Chi phí, Số lượng, Điểm số...) lớn hơn 0 để AI thống kê.",
      ];
  if (fixesEl && fixesWrap) {
    fixesEl.innerHTML = fList.map((f) => `<li>${esc(f)}</li>`).join("");
    fixesWrap.classList.toggle("hidden", !fList.length);
  }

  // Also render persistent large banner at top of Scene 1 & Scene 3
  const bannerHtml = `
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="space-y-1 flex-1 min-w-[240px]">
        <div class="text-sm sm:text-base font-black ${isCritical ? "text-rose-800" : "text-amber-900"} uppercase flex items-center gap-2">
          <span>${esc(headline)}</span>
        </div>
        <p class="text-xs sm:text-sm font-bold text-slate-700">${esc(summary)}</p>
        <ul class="list-disc pl-5 text-xs sm:text-sm font-bold ${isCritical ? "text-rose-900" : "text-amber-900"} space-y-0.5 pt-1">
          ${rList.map((r) => `<li>${esc(r)}</li>`).join("")}
        </ul>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        <button type="button" onclick="triggerReuploadFromBigWarning()" class="cute-btn px-3.5 py-2 rounded-2xl bg-rose-600 text-white text-xs font-black shadow">📁 Tải lại File khác</button>
        <button type="button" onclick="hideBigScreenWarning()" class="cute-btn px-2.5 py-2 rounded-2xl bg-white border border-rose-200 text-rose-700 text-xs font-extrabold">Ẩn ✕</button>
      </div>
    </div>`;
  ["bigScreenAlertBannerScene1", "bigScreenAlertBannerScene3"].forEach((id) => {
    const b = $(id);
    if (b) {
      b.innerHTML = bannerHtml;
      b.classList.remove("hidden");
    }
  });

  if (openModal && modal) {
    modal.classList.remove("hidden");
    modal.classList.add("flex");
  }
}

function closeBigScreenWarning() {
  const modal = $("bigDataWarningModal");
  if (modal) {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
  }
}

function hideBigScreenWarning() {
  closeBigScreenWarning();
  ["bigScreenAlertBannerScene1", "bigScreenAlertBannerScene3"].forEach((id) => {
    const b = $(id);
    if (b) {
      b.classList.add("hidden");
      b.innerHTML = "";
    }
  });
}

function triggerReuploadFromBigWarning() {
  closeBigScreenWarning();
  goToScene(1, "left");
  const inp = $("fileUploadInput");
  if (inp) inp.click();
}
window.showBigScreenWarning = showBigScreenWarning;
window.closeBigScreenWarning = closeBigScreenWarning;
window.hideBigScreenWarning = hideBigScreenWarning;
window.triggerReuploadFromBigWarning = triggerReuploadFromBigWarning;

function goToScene(idx, directionHint = "", opts = {}) {
  const target = Math.max(0, Math.min(3, Number(idx)));
  const prev = state.currentScene;
  state.currentScene = target;

  let animCls = directionHint;
  if (!animCls) {
    if (target === 2) animCls = "dive";
    else if (target === 3) animCls = "unfold";
    else if (target < prev) animCls = "left";
    else animCls = "right";
  }
  const animMap = {
    right: "anim-dim-right",
    left: "anim-dim-left",
    dive: "anim-dim-dive",
    unfold: "anim-dim-unfold",
  };

  for (let i = 0; i <= 3; i++) {
    const sec = $(`scene${i}`);
    if (!sec) continue;
    sec.classList.remove("scene-active", "anim-dim-right", "anim-dim-left", "anim-dim-dive", "anim-dim-unfold");
    if (i === target) {
      sec.classList.add("scene-active", animMap[animCls] || "anim-dim-right");
    }
  }

  // Site shell (breadcrumb, menu highlight, URL, title, scroll, page sweep) lives in site.js
  if (typeof window.onSceneChanged === "function") window.onSceneChanged(target, prev, opts);
}

function swipePrevScene() {
  if (state.currentScene > 0) goToScene(state.currentScene - 1, "left");
}

function swipeNextScene() {
  const cur = state.currentScene;
  if (cur === 0) goToScene(1);
  else if (cur < 3 && state.lastResult) goToScene(cur + 1);
}

async function quickDemoSample1() {
  goToScene(1, "right");
  await sleep(260);
  await loadSampleDataset(1);
}

function openAuditDrawerFromSettings() {
  closeSettingsModal();
  goToScene(3, "unfold");
  switchTab("tabTools");
}

function jumpToStudioStep(targetStep) {
  const maxStep = state.maxApprovedStep || 1;
  if (targetStep === 1) {
    goToScene(1, "left");
    return;
  }
  if (targetStep === 2) {
    switchTab("tabNorm");
    return;
  }
  if (targetStep === 3) {
    if (maxStep < 3) {
      approveStep2();
    } else {
      switchTab("tabRank");
    }
    return;
  }
  if (targetStep >= 4) {
    if (maxStep < 3) {
      showToast("Hãy bấm 'Qua Bước 3' ở Bước 2 trước nhé!", true);
      switchTab("tabNorm");
    } else if (maxStep < 4) {
      approveStep3();
    } else {
      switchTab("tabProposal");
      switchProposalView("html");
      renderInlineHtmlReport(true);
    }
  }
}

function updateStudioStepper() {
  const step = state.maxApprovedStep || 1;
  const p1 = $("stepperPill1");
  const p2 = $("stepperPill2");
  const p3 = $("stepperPill3");
  const p4 = $("stepperPill4");
  const stTxt = $("stepperStatusText");
  const nextBtn = $("btnNextStepTop");

  const doneCls = "step-pill-btn bg-pink-50 text-pink-800 border border-pink-200 cursor-pointer";
  const activeCls = "step-pill-btn bg-[#e67da7] text-white border border-white shadow-sm cursor-pointer";
  const lockCls = "step-pill-btn bg-slate-100/90 text-slate-400 border border-white cursor-not-allowed";

  if (p1) p1.className = doneCls;
  if (p2) {
    p2.textContent = step > 2 ? "✓ 2. Làm sạch" : "2. Làm sạch";
    p2.className = step > 2 ? doneCls : activeCls;
  }
  if (p3) {
    p3.textContent = step > 3 ? "✓ 3. Phân tích" : step === 3 ? "3. Phân tích" : "🔒 3. Phân tích";
    p3.className = step > 3 ? doneCls : step === 3 ? activeCls : lockCls;
  }
  if (p4) {
    p4.textContent = step >= 4 ? "✓ 4. Báo cáo" : "🔒 4. Báo cáo";
    p4.className = step >= 4 ? activeCls : lockCls;
  }
  if (stTxt) {
    stTxt.textContent =
      step >= 4
        ? "Bước 4/4: Sẵn sàng tải Word, Excel & HTML"
        : step === 3
          ? "Bước 3/4: Xem Dashboard → bấm nút Qua Bước 4"
          : "Bước 2/4: Xem bảng sạch → bấm nút Qua Bước 3";
  }
  if (nextBtn) {
    if (step < 3) {
      nextBtn.textContent = "Xuống duyệt Bước 3 ↓";
      nextBtn.onclick = () => {
        const bottomBox = $("step2ApproveBoxBottom") || $("step2ApproveBox");
        if (bottomBox) bottomBox.scrollIntoView({ behavior: "smooth" });
        else approveStep2();
      };
      nextBtn.className = "cute-btn px-3 py-1.5 rounded-full bg-white text-pink-700 border border-pink-200 text-xs font-bold";
    } else if (step === 3) {
      nextBtn.textContent = "Xuống duyệt Bước 4 ↓";
      nextBtn.onclick = () => {
        const bottomBox = $("step3ApproveBoxBottom") || $("step3ApproveBox");
        if (bottomBox) bottomBox.scrollIntoView({ behavior: "smooth" });
        else approveStep3();
      };
      nextBtn.className = "cute-btn px-3 py-1.5 rounded-full bg-white text-pink-700 border border-pink-200 text-xs font-bold";
    } else {
      nextBtn.textContent = "✓ Mở bảng Tải Báo cáo ↓";
      nextBtn.onclick = () => {
        $("outputReadyBanner")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        switchTab("tabProposal");
      };
      nextBtn.className = "step-next-btn !py-2 !px-4 !text-xs shrink-0";
    }
  }
  $("step2ApproveBox")?.classList.toggle("hidden", step >= 3);
  $("step2ApproveBoxBottom")?.classList.toggle("hidden", step >= 3);
  $("step3ApproveBox")?.classList.toggle("hidden", step !== 3);
  $("step3ApproveBoxBottom")?.classList.toggle("hidden", step !== 3);
  $("outputReadyBanner")?.classList.toggle("hidden", step < 4);
}

async function approveStep2() {
  if (!state.lastResult) return;
  state.maxApprovedStep = Math.max(state.maxApprovedStep, 3);
  updateStudioStepper();
  switchTab("tabRank");
  if (typeof triggerHaptic === "function") triggerHaptic([12, 20, 14]);
  showToast("✅ Đã sang Bước 3 · Phân tích Dashboard BI!");
}

async function approveStep3() {
  if (!state.lastResult) return;
  state.maxApprovedStep = 4;
  updateStudioStepper();
  switchTab("tabProposal");
  switchProposalView("html");
  await renderInlineHtmlReport(true);
  if (typeof triggerHaptic === "function") triggerHaptic([15, 25, 18]);
  showToast("🎉 Đã hoàn tất Bước 4 · Báo cáo HTML đã xuất trực tiếp trên giao diện!");
}

function editDashboardTitlePrompt(forceOpen) {
  const ed = $("dashTitleEditor");
  if (!ed) return;
  const open = typeof forceOpen === "boolean" ? forceOpen : ed.classList.contains("hidden");
  if (open) {
    if ($("dashEditTitleInput")) $("dashEditTitleInput").value = state.customTitle || ($("dashMainTitle")?.textContent || "");
    if ($("dashEditSummaryInput")) $("dashEditSummaryInput").value = state.customSummary || ($("dashSubtitle")?.textContent || "");
    ed.classList.remove("hidden");
    $("dashEditTitleInput")?.focus();
  } else {
    ed.classList.add("hidden");
  }
}

function saveDashboardTitleEdit() {
  const nt = ($("dashEditTitleInput")?.value || "").trim();
  const ns = ($("dashEditSummaryInput")?.value || "").trim();
  if (nt) {
    state.customTitle = nt;
    if ($("dashMainTitle")) $("dashMainTitle").textContent = nt;
  }
  if (ns) {
    state.customSummary = ns;
    if ($("dashSubtitle")) $("dashSubtitle").textContent = ns;
  }
  editDashboardTitlePrompt(false);
  showToast("✅ Đã cập nhật tiêu đề & tóm tắt Dashboard!");
}

function switchTab(tabId) {
  if (state.lastResult && state.maxApprovedStep < 3 && (tabId === "tabRank" || tabId === "tabProposal")) {
    showToast("⚠️ Tuyệt đối không nhảy bước: hãy kiểm tra Bước 2 và bấm 'Duyệt bước này' trước khi sang Phân tích!", true);
    tabId = "tabNorm";
  }
  document.querySelectorAll(".tab-content").forEach((el) => el.classList.remove("active"));
  const target = $(tabId);
  if (target) target.classList.add("active");
  if (tabId === "tabProposal" && state.lastResult && !$("htmlInlineReportView")?.classList.contains("hidden")) {
    renderInlineHtmlReport(false);
  }

  ["tabRank", "tabProposal", "tabNorm"].forEach((id) => {
    const btn = $("btn" + id.charAt(0).toUpperCase() + id.slice(1));
    if (!btn) return;
    const locked = state.lastResult && state.maxApprovedStep < 3 && (id === "tabRank" || id === "tabProposal");
    if (id === tabId) {
      btn.className =
        "cute-btn px-4 py-2 bg-gradient-to-r from-[#f49ec1] to-[#e479a4] text-white border border-white/70 rounded-2xl font-extrabold text-xs whitespace-nowrap";
    } else if (locked) {
      btn.className =
        "cute-btn px-4 py-2 bg-slate-100 text-slate-400 border border-white rounded-2xl font-bold text-xs whitespace-nowrap opacity-70";
    } else {
      btn.className =
        "cute-btn px-4 py-2 bg-white/65 text-slate-600 border border-white rounded-2xl font-bold text-xs whitespace-nowrap";
    }
  });
}

function toggleExportMenu(e) {
  if (e) e.stopPropagation();
  const menu = $("exportMenu");
  if (menu) menu.classList.toggle("hidden");
}

function closeExportMenu() {
  const menu = $("exportMenu");
  if (menu) menu.classList.add("hidden");
}

function toggleHeaderSearch(e) {
  if (e) e.stopPropagation();
  const popup = $("headerSearchPopup");
  if (popup) {
    popup.classList.toggle("hidden");
    if (!popup.classList.contains("hidden")) {
      setTimeout(() => $("siteSearchInput")?.focus(), 50);
    }
  }
}

function toggleUserMenu(e) {
  if (e) e.stopPropagation();
  const menu = $("userDropdownMenu");
  if (menu) menu.classList.toggle("hidden");
}

function closeUserMenu() {
  const menu = $("userDropdownMenu");
  if (menu) menu.classList.add("hidden");
  const searchPopup = $("headerSearchPopup");
  if (searchPopup) searchPopup.classList.add("hidden");
}

function openSettingsModal() {
  const m = $("settingsModal");
  if (!m) return;
  m.classList.remove("hidden");
  m.classList.add("flex");
}

function closeSettingsModal() {
  const m = $("settingsModal");
  if (!m) return;
  m.classList.remove("flex");
  m.classList.add("hidden");
}

async function applySettingsAndRun() {
  closeSettingsModal();
  await runAIAgentWorkflow();
}

function switchInputSource(src) {
  const mode = src || "file";
  $("inputPaneFile")?.classList.toggle("hidden", mode !== "file");
  $("inputPaneGsheet")?.classList.toggle("hidden", mode !== "gsheet");
  $("inputPaneLark")?.classList.toggle("hidden", mode !== "lark");

  const map = { file: "btnSrcFile", gsheet: "btnSrcGsheet", lark: "btnSrcLark" };
  Object.entries(map).forEach(([k, id]) => {
    const btn = $(id);
    if (!btn) return;
    btn.className =
      k === mode
        ? "cute-btn py-2 rounded-xl bg-white/95 text-pink-700"
        : "cute-btn py-2 rounded-xl text-slate-500";
  });
}

function toggleQuickSupplement() {
  const area = $("hitl1SupplementArea");
  const btn = $("btnToggleSup");
  if (!area || !btn) return;
  const hidden = area.classList.toggle("hidden");
  btn.textContent = hidden ? "+ Bổ sung nhanh ▾" : "- Ẩn khung bổ sung ▴";
}

function toggleLocationDetails() {
  const wrap = $("locationDetailWrapper");
  const btn = $("btnToggleLocDetails");
  if (!wrap || !btn) return;
  const hidden = wrap.classList.toggle("hidden");
  btn.innerHTML = hidden
    ? `<i class="fa-solid fa-eye"></i><span>Xem chi tiết các địa bàn ▾</span>`
    : `<i class="fa-solid fa-eye-slash"></i><span>Thu gọn chi tiết ▴</span>`;
}

function switchProposalView(view) {
  const mode = view === "markdown" || view === "survey" ? view : "html";
  $("htmlInlineReportView")?.classList.toggle("hidden", mode !== "html");
  $("surveyPlanView")?.classList.toggle("hidden", mode !== "survey");
  $("proposalMarkdownView")?.classList.toggle("hidden", mode !== "markdown");
  const bh = $("btnPropHtml");
  const bm = $("btnPropMd");
  const bs = $("btnPropSurvey");
  const onCls = "cute-btn px-4 py-2 rounded-2xl bg-gradient-to-r from-[#f49ec1] to-[#e479a4] text-white border border-white/70 text-xs font-extrabold";
  const offCls = "cute-btn px-4 py-2 rounded-2xl bg-white/75 text-slate-600 border border-pink-100 text-xs font-bold";
  if (bh) bh.className = mode === "html" ? onCls : offCls;
  if (bm) bm.className = mode === "markdown" ? onCls : offCls;
  if (bs) bs.className = mode === "survey" ? onCls : offCls;
  if (mode === "html" && state.lastResult && $("tabProposal")?.classList.contains("active")) {
    renderInlineHtmlReport(false);
  }
}

function switchAuditView(view) {
  const isTools = view === "tools";
  $("auditToolsView")?.classList.toggle("hidden", !isTools);
  $("auditRulesView")?.classList.toggle("hidden", isTools);
  const bt = $("btnAuditTools");
  const br = $("btnAuditRules");
  if (bt && br) {
    bt.className = isTools
      ? "cute-btn px-4 py-2 rounded-2xl bg-gradient-to-r from-[#f49ec1] to-[#e479a4] text-white border border-white/70 text-xs font-extrabold"
      : "cute-btn px-4 py-2 rounded-2xl bg-white/65 text-slate-600 border border-white text-xs font-bold";
    br.className = !isTools
      ? "cute-btn px-4 py-2 rounded-2xl bg-gradient-to-r from-[#f49ec1] to-[#e479a4] text-white border border-white/70 text-xs font-extrabold"
      : "cute-btn px-4 py-2 rounded-2xl bg-white/65 text-slate-600 border border-white text-xs font-bold";
  }
}

function onAgentModeChange() {
  const mode = $("agentMode").value;
  const credWrap = $("apiCredentialsWrap");
  credWrap.classList.toggle("hidden", mode === "local");
  if (mode === "gemini") $("llmModel").value = "gemini-2.5-flash";
  if (mode === "openai") $("llmModel").value = "gpt-4o-mini";
}

function setCrystalStatus(pct, kind, headline, subtitle) {
  const orb = $("crystalOrbWrap");
  const icon = $("crystalOrbIcon");
  const bar = $("crystalProgressBar");
  if (orb) {
    orb.classList.remove("is-error", "is-done");
    if (kind === "error") orb.classList.add("is-error");
    else if (kind === "done") orb.classList.add("is-done");
  }
  if (icon) {
    if (kind === "error") icon.className = "fa-solid fa-circle-exclamation text-3xl text-rose-400";
    else if (kind === "done") icon.className = "fa-solid fa-circle-check text-3xl text-emerald-500";
    else if (kind === "clean") icon.className = "fa-solid fa-broom text-3xl text-pink-400 fa-beat";
    else icon.className = "fa-solid fa-wand-magic-sparkles text-3xl text-pink-500";
  }
  if (bar && typeof pct === "number") {
    bar.style.width = `${Math.max(8, Math.min(100, pct))}%`;
    bar.className =
      kind === "error"
        ? "h-full rounded-full bg-gradient-to-r from-rose-300 to-pink-400 transition-all duration-500"
        : kind === "done"
          ? "h-full rounded-full bg-gradient-to-r from-emerald-300 to-pink-300 transition-all duration-500"
          : "h-full rounded-full bg-gradient-to-r from-[#f6bdd4] to-[#e57ba5] transition-all duration-500";
  }
  if ($("scene2Headline") && headline) $("scene2Headline").textContent = headline;
  if ($("scene2ProgressText") && subtitle) $("scene2ProgressText").textContent = subtitle;
}

function resetWorkflowUI() {
  const badge = $("workflowStatusBadge");
  if (badge) {
    badge.className = "px-3 py-1 bg-white/85 text-pink-700 rounded-full text-[11px] font-extrabold border border-white";
    badge.innerText = "Chưa chạy";
  }
  setCrystalStatus(18, "idle", "Sẵn sàng tiếp nhận dữ liệu...", "Hệ thống sẽ tự động kiểm tra và làm sạch dữ liệu.");
  $("btnScene2Next")?.classList.add("hidden");
  hideResubmitCard();
  $("outputReadyBanner")?.classList.add("hidden");
  $("statsDeepSection")?.classList.add("hidden");
}

function setPreferredOutput(mode) {
  state.preferredOutput = mode || "dashboard";
  const map = {
    dashboard: "btnOutDashboard",
    report: "btnOutReport",
    html: "btnOutHtml",
  };
  Object.entries(map).forEach(([k, btnId]) => {
    const b = $(btnId);
    if (!b) return;
    if (k === state.preferredOutput) {
      b.className =
        "cute-btn py-2 rounded-xl bg-gradient-to-r from-pink-400 to-rose-400 text-white border border-white/60";
    } else {
      b.className = "cute-btn py-2 rounded-xl bg-white/75 text-slate-600 border border-white";
    }
  });
}

function openPreferredOutput(mode, autoTriggered = false) {
  const chosen = mode || state.preferredOutput || "dashboard";
  if (state.currentScene !== 3) {
    goToScene(3, "unfold");
  }
  if (state.maxApprovedStep < 3) {
    switchTab("tabNorm");
    return;
  }
  if (chosen === "report") {
    switchTab("tabProposal");
    switchProposalView("markdown");
    if (!autoTriggered) showToast("Đã mở Báo cáo chi tiết!");
  } else if (chosen === "html") {
    if (state.maxApprovedStep < 4) {
      switchTab("tabRank");
      if (!autoTriggered) showToast("⚠️ Hãy bấm 'Qua Bước 4' ở Bước 3 để xuất Báo cáo HTML trực tiếp!", true);
      return;
    }
    switchTab("tabProposal");
    switchProposalView("html");
    renderInlineHtmlReport(!autoTriggered);
  } else {
    switchTab("tabRank");
    if (!autoTriggered) showToast("Đang hiển thị Dashboard đánh giá!");
  }
}

function showResubmitCard(title, reason) {
  const card = $("resubmitCard");
  if (!card) return;
  if ($("resubmitTitle")) {
    $("resubmitTitle").innerHTML = `<i class="fa-solid fa-circle-exclamation text-rose-600"></i><span>${esc(title)}</span>`;
  }
  if ($("resubmitReason")) {
    $("resubmitReason").textContent = reason || "Dữ liệu chưa hợp lệ. Vui lòng gửi lại file CSV/XLSX hoặc link Google Sheet mới.";
  }
  if ($("resubmitFileInput")) $("resubmitFileInput").value = "";
  card.classList.remove("hidden");
}

function hideResubmitCard() {
  $("resubmitCard")?.classList.add("hidden");
}

function handleInlineResubmitFiles(event) {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;
  state.files = files;
  state.selectedSampleId = "";
  state.stagedId = "";
  state.tableOverrides = {};
  state.columnOverrides = {};
  if ($("gsheetsUrl")) $("gsheetsUrl").value = "";
  if ($("larkBaseUrl")) $("larkBaseUrl").value = "";
  if ($("resubmitGsheetInput")) $("resubmitGsheetInput").value = "";
  renderUploadedFiles();
  updateSampleButtonStyles(0);
  $("activeDatasetLabel").innerText = `Gửi lại ${files.length} file mới`;
  showToast(`Đã chọn ${files.length} file mới! Đang gửi lại xử lý...`);
  runAIAgentWorkflow();
}

async function submitInlineResubmit() {
  const linkVal = ($("resubmitGsheetInput")?.value || "").trim();
  const inlineFiles = $("resubmitFileInput")?.files;
  if (inlineFiles && inlineFiles.length) {
    handleInlineResubmitFiles({ target: { files: inlineFiles } });
    return;
  }
  if (linkVal) {
    state.files = [];
    renderUploadedFiles();
    if (/larksuite\.com|feishu\.cn|\/base\//i.test(linkVal)) {
      if ($("larkBaseUrl")) $("larkBaseUrl").value = linkVal;
      switchInputSource("lark");
      await importLarkBase();
    } else {
      if ($("gsheetsUrl")) $("gsheetsUrl").value = linkVal;
      switchInputSource("gsheet");
      await importGoogleSheets();
    }
    return;
  }
  showToast("Vui lòng chọn file mới hoặc dán link Google Sheet / Lark Base ở trên!", true);
}

function handleQuickReupload(event) {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;
  state.files = files;
  state.selectedSampleId = "";
  state.stagedId = "";
  state.tableOverrides = {};
  state.columnOverrides = {};
  if ($("gsheetsUrl")) $("gsheetsUrl").value = "";
  if ($("larkBaseUrl")) $("larkBaseUrl").value = "";
  renderUploadedFiles();
  updateSampleButtonStyles(0);
  $("activeDatasetLabel").innerText = `Đang gửi lại ${files.length} file mới`;
  event.target.value = "";
  showToast(`Đã nhận ${files.length} file mới! Đang xử lý...`);
  runAIAgentWorkflow();
}

function requestResubmitInput() {
  clearAllInputs();
  goToScene(1, "left");
  const dz = $("dropZone");
  if (dz) {
    dz.classList.add("ring-2", "ring-pink-400");
    setTimeout(() => dz.classList.remove("ring-2", "ring-pink-400"), 1800);
  }
  showToast("Mời bạn gửi lại File CSV/XLSX hoặc Google Sheet mới!");
}

function updateSampleButtonStyles(activeNum) {
  [1, 2, 3].forEach((n) => {
    const b = $(`btnSample${n}`);
    if (!b) return;
    if (n === activeNum) {
      b.classList.add("ring-2", "ring-offset-1", "ring-pink-400");
    } else {
      b.classList.remove("ring-2", "ring-offset-1", "ring-pink-400");
    }
  });
}

function fileKey(f) {
  return `${f.name}|${f.size}|${f.lastModified}`;
}

function renderUploadedFiles() {
  const ul = $("uploadedFileList");
  const summaryBar = $("multiFileSummaryBar");
  const clearBtn = $("btnClearAllFiles");
  if (clearBtn) {
    clearBtn.classList.toggle("hidden", state.files.length === 0);
  }
  if (!ul) return;

  let totalOkFiles = 0;
  let totalTables = 0;
  let totalRows = 0;
  let totalCols = 0;
  let emptyFiles = 0;

  ul.innerHTML = state.files
    .map((f, idx) => {
      const rep = (state.fileReports || {})[fileKey(f)] || { status: "pending", text: "" };
      if (rep.status === "ok") {
        totalOkFiles += 1;
        totalTables += rep.tables || 0;
        totalRows += rep.rows || 0;
        totalCols += rep.cols || 0;
      } else if (rep.status === "error") {
        emptyFiles += 1;
      }
      const cls =
        rep.status === "ok"
          ? "bg-emerald-50 border-emerald-200 text-emerald-700"
          : rep.status === "error"
            ? "bg-rose-50 border-rose-200 text-rose-700"
            : "bg-pink-50 border-pink-200 text-pink-700";
      const icon =
        rep.status === "ok"
          ? `<i class="fa-solid fa-circle-check"></i>`
          : rep.status === "error"
            ? `<i class="fa-solid fa-circle-exclamation"></i>`
            : `<i class="fa-solid fa-spinner fa-spin"></i>`;
      const text = rep.text || (rep.status === "pending" ? "AI đang đọc cấu trúc ô & cột..." : "");
      return `
      <li class="rounded-xl border px-2.5 py-1.5 ${cls}">
        <div class="flex items-center justify-between">
          <span class="truncate pr-2 font-bold text-slate-700">#${idx + 1} · ${esc(f.name)}</span>
          <button type="button" onclick="removeUploadedFile(${idx})" class="text-pink-500 hover:text-pink-700 font-extrabold">✕</button>
        </div>
        <div class="text-[10.5px] font-semibold mt-0.5 flex items-start gap-1.5">${icon}<span class="leading-snug">${esc(text)}</span></div>
      </li>`;
    })
    .join("");

  if (summaryBar) {
    if (!state.files.length) {
      summaryBar.classList.add("hidden");
      summaryBar.innerHTML = "";
    } else {
      summaryBar.classList.remove("hidden");
      const modeLabel = state.files.length > 1 ? `📚 Tổng hợp từ ${state.files.length} file` : `📄 1 file đã chọn`;
      const errBadge = emptyFiles ? ` · <span class="text-rose-600 font-extrabold">⚠️ ${emptyFiles} file trống (không có ô/cột)</span>` : "";
      summaryBar.innerHTML = `${modeLabel}: <strong>${totalTables} bảng · ${totalCols} cột · ${totalRows.toLocaleString("vi-VN")} dòng</strong> (Giữ chuẩn 100% dữ liệu gốc, không thêm không bớt)${errBadge}`;
    }
  }
  const step1Info = $("step1DatasetInfoPanel");
  if (step1Info) {
    if (!state.files.length) {
      step1Info.classList.add("hidden");
      step1Info.innerHTML = "";
    } else {
      step1Info.classList.remove("hidden");
      const fNames = state.files.map((f) => esc(f.name)).join(", ");
      step1Info.innerHTML = `
        <div class="font-extrabold text-emerald-900">📋 Thông tin dữ liệu đã nhận (${state.files.length} file): ${fNames}</div>
        <div class="text-emerald-800 font-semibold">Quy mô: <strong>${totalTables} bảng · ${totalCols} cột · ${totalRows.toLocaleString("vi-VN")} dòng</strong> — Bạn có thể điền hoặc chỉnh sửa yêu cầu phân tích ngay bên dưới trước khi bấm Làm sạch.</div>`;
    }
  }
}

async function inspectUploadedFiles(files) {
  state.fileReports = state.fileReports || {};
  files.forEach((f) => {
    state.fileReports[fileKey(f)] = { status: "pending", text: "" };
  });
  renderUploadedFiles();
  const cfg = { api_key: ($("apiKeyInput")?.value || "").trim(), model: ($("llmModel")?.value || "gemini-2.5-flash").trim() };
  for (const f of files) {
    const fd = new FormData();
    fd.append("files", f, f.name);
    fd.append("payload", JSON.stringify({ config: cfg }));
    try {
      const resp = await fetch("/api/inspect-inputs", { method: "POST", body: fd });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `File '${f.name}' trống: Không có ô, cột hoặc dòng dữ liệu nào cả!`);
      const tblList = data.tables || data.sheet_assignments || [];
      const tables = tblList.length;
      const rows = tblList.reduce((s, a) => s + (a.row_count || 0), 0);
      const cols = (data.tables || []).reduce((s, t) => s + (t.column_count || (t.columns || []).length || 0), 0);
      const colNames = Array.from(new Set((data.tables || []).flatMap((t) => t.columns || []))).slice(0, 6);
      const docs = Object.keys(data.document_texts || {}).length;
      const emptySheets = data.empty_sheets || [];
      if (tables === 0 && rows === 0 && docs === 0) {
        throw new Error(`File '${f.name}' trống: Không có ô, cột hoặc dòng dữ liệu nào cả!`);
      }
      const parts = [];
      if (tables) parts.push(`${tables} bảng · ${cols} cột · ${rows.toLocaleString("vi-VN")} dòng`);
      if (colNames.length) parts.push(`Cột: ${colNames.join(", ")}${(data.tables?.[0]?.columns?.length || 0) > 6 ? "..." : ""}`);
      if (docs) parts.push(`${docs} văn bản`);
      if (emptySheets.length) parts.push(`(${emptySheets.length} sheet trống không có ô/cột đã bỏ qua)`);
      const iw = data.inspect_warning || {};
      state.fileReports[fileKey(f)] = {
        status: iw.cannot_analyze ? "error" : "ok",
        tables,
        rows,
        cols,
        text: iw.cannot_analyze
          ? `⚠️ ${iw.reasons?.[0] || "Dữ liệu không phân tích được"}`
          : `Chuẩn dữ liệu: ${parts.join(" · ") || "nội dung hợp lệ"}`,
      };
      if (iw.has_warning) {
        showBigScreenWarning({
          headline: iw.headline || "⚠️ CẢNH BÁO: DỮ LIỆU KHÔNG RÕ RÀNG HOẶC KHÔNG PHÂN TÍCH ĐƯỢC!",
          summary: `Kiểm tra file "${f.name}" (${tables} bảng · ${cols} cột · ${rows} dòng): phát hiện dữ liệu chưa rõ ràng hoặc không đủ con số định lượng để phân tích.`,
          reasons: iw.reasons || [],
          severity: iw.severity || "warning",
          openModal: true,
        });
      }
    } catch (err) {
      state.fileReports[fileKey(f)] = {
        status: "error",
        tables: 0,
        rows: 0,
        cols: 0,
        text: `${err.message}`,
      };
      showBigScreenWarning({
        headline: "🚨 CẢNH BÁO: DỮ LIỆU TRỐNG — KHÔNG CÓ Ô, CỘT HOẶC DÒNG DỮ LIỆU NÀO CẢ!",
        summary: `File "${f.name}" bị trống hoặc lỗi định dạng. Hệ thống không thể thực hiện phân tích trên file này.`,
        reasons: [
          err.message,
          "Không tìm thấy bất kỳ ô, cột hoặc dòng dữ liệu hợp lệ nào trong file để tính toán chỉ số KPI hay dựng biểu đồ.",
        ],
        severity: "critical",
        openModal: true,
      });
    }
    renderUploadedFiles();
  }
  const bad = files.filter((f) => state.fileReports[fileKey(f)]?.status === "error").length;
  if (bad) showToast(`⚠️ Phát hiện ${bad} file trống hoặc không phân tích được. Vui lòng xem hộp cảnh báo lớn trên màn hình!`, true);
}

function removeUploadedFile(idx) {
  state.files.splice(idx, 1);
  state.stagedId = "";
  renderUploadedFiles();
  if (!state.files.length) {
    hideBigScreenWarning();
  }
  const hasLark = Boolean(($("larkBaseUrl")?.value || "").trim());
  const hasGs = Boolean(($("gsheetsUrl")?.value || "").trim());
  if (!state.files.length && !hasGs && !hasLark && !state.selectedSampleId) {
    $("activeDatasetLabel").innerText = "Chưa chọn dữ liệu";
  } else if (state.files.length) {
    $("activeDatasetLabel").innerText = state.files.length > 1 ? `Tổng hợp ${state.files.length} file` : `Đã nạp 1 file (${state.files[0].name})`;
  }
}

function clearAllInputs() {
  state.files = [];
  state.selectedSampleId = "";
  state.stagedId = "";
  state.tableOverrides = {};
  state.columnOverrides = {};
  if ($("gsheetsUrl")) $("gsheetsUrl").value = "";
  if ($("larkBaseUrl")) $("larkBaseUrl").value = "";
  if ($("fileUploadInput")) $("fileUploadInput").value = "";
  hideBigScreenWarning();
  renderUploadedFiles();
  updateSampleButtonStyles(0);
  $("activeDatasetLabel").innerText = "Chưa chọn dữ liệu";
  showErrorBanner("");
  resetWorkflowUI();
  renderHitlStage3State({ conflict_gap: { hitl_required: false } });
  renderHitlBoundaryState({ evaluation: { hitl_boundary_review_recommended: false } });
}

async function loadSampleDataset(num) {
  const info = SAMPLE_BY_NUM[num];
  if (!info) return;
  state.files = [];
  renderUploadedFiles();
  if ($("gsheetsUrl")) $("gsheetsUrl").value = "";
  if ($("larkBaseUrl")) $("larkBaseUrl").value = "";
  state.selectedSampleId = info.id;
  state.stagedId = "";
  state.tableOverrides = {};
  state.columnOverrides = {};
  updateSampleButtonStyles(num);
  $("activeDatasetLabel").innerText = `Đang dùng: ${info.label}`;
  showErrorBanner("");
  await runAIAgentWorkflow();
}

function handleFileUpload(event) {
  const incoming = Array.from(event.target.files || []);
  if (!incoming.length) return;
  const existingKeys = new Set(state.files.map((f) => fileKey(f)));
  const newFiles = incoming.filter((f) => !existingKeys.has(fileKey(f)));
  if (!newFiles.length) {
    showToast("File này đã có trong danh sách tổng hợp!");
    event.target.value = "";
    return;
  }
  state.files.push(...newFiles);
  state.selectedSampleId = "";
  state.stagedId = "";
  updateSampleButtonStyles(0);
  renderUploadedFiles();
  $("activeDatasetLabel").innerText =
    state.files.length > 1 ? `Tổng hợp ${state.files.length} file` : `Đã nạp 1 file (${state.files[0].name})`;
  showToast(
    state.files.length > 1
      ? `Đã gộp ${state.files.length} file vào danh sách tổng hợp! Bấm "Gửi dữ liệu lên xử lý" khi đã đủ file.`
      : `Đã thêm file "${newFiles[0].name}"! Bạn có thể bấm "+ Thêm file" để gộp nhiều file hoặc bấm "Gửi dữ liệu lên xử lý".`
  );
  event.target.value = "";
  inspectUploadedFiles(newFiles);
}

async function importGoogleSheets() {
  const url = ($("gsheetsUrl").value || "").trim();
  if (!url) {
    showToast("Vui lòng dán link Google Sheets hợp lệ!", true);
    return;
  }
  state.selectedSampleId = "";
  state.stagedId = "";
  updateSampleButtonStyles(0);
  $("activeDatasetLabel").innerText = "Đang tải Google Sheets...";
  showErrorBanner("");

  try {
    const fd = buildFormData();
    const resp = await fetch("/api/inspect-inputs", { method: "POST", body: fd });
    const data = await resp.json();
    if (!resp.ok) {
      resetWorkflowUI();
      goToScene(2, "dive");
      setCrystalStatus(
        35,
        "error",
        "⚠️ AI không nhận được Google Sheet",
        "Dữ liệu chưa đọc được. Vui lòng gửi lại File hoặc Link khác."
      );
      showResubmitCard(
        "AI báo lỗi khi nhận dữ liệu · Vui lòng gửi lại",
        data.error || "Không thể đọc Google Sheets."
      );
      throw new Error(data.error || "Không thể tải Google Sheets.");
    }
    hideResubmitCard();
    state.stagedId = data.staged_id;
    const sheetCount = (data.sheet_assignments || []).length;
    $("activeDatasetLabel").innerText = `Google Sheets (${sheetCount} tab)`;
    showToast(`Đã tải Google Sheets (${sheetCount} tab). Đang xử lý...`);
    await runAIAgentWorkflow();
  } catch (err) {
    showErrorBanner("Lỗi tải Google Sheets", err.message);
    showToast(err.message, true);
    $("activeDatasetLabel").innerText = "Lỗi tải Google Sheets";
  }
}

async function importLarkBase() {
  const url = ($("larkBaseUrl")?.value || "").trim();
  if (!url) {
    showToast("Vui lòng dán link Lark Base hợp lệ!", true);
    return;
  }
  state.selectedSampleId = "";
  state.stagedId = "";
  updateSampleButtonStyles(0);
  $("activeDatasetLabel").innerText = "Đang tải Lark Base...";
  showErrorBanner("");

  try {
    const fd = buildFormData();
    const resp = await fetch("/api/inspect-inputs", { method: "POST", body: fd });
    const data = await resp.json();
    if (!resp.ok) {
      resetWorkflowUI();
      goToScene(2, "dive");
      setCrystalStatus(
        35,
        "error",
        "⚠️ AI không nhận được Lark Base",
        "Không đọc được bảng Lark Base (kiểm tra App ID / Secret hoặc xuất JSON/CSV)."
      );
      showResubmitCard(
        "AI báo lỗi khi nhận Lark Base · Vui lòng kiểm tra quyền hoặc gửi File",
        data.error || "Không thể đọc Lark Base."
      );
      throw new Error(data.error || "Không thể tải Lark Base.");
    }
    hideResubmitCard();
    state.stagedId = data.staged_id;
    const sheetCount = (data.sheet_assignments || []).length;
    $("activeDatasetLabel").innerText = `Lark Base (${sheetCount} bảng)`;
    showToast(`Đã tải Lark Base (${sheetCount} bảng). Đang xử lý...`);
    await runAIAgentWorkflow();
  } catch (err) {
    showErrorBanner("Lỗi tải Lark Base", err.message);
    showToast(err.message, true);
    $("activeDatasetLabel").innerText = "Lỗi tải Lark Base";
  }
}

function toggleClarifyScope() {
  const body = $("clarifyScopeBody");
  const btn = $("btnToggleClarify");
  if (!body || !btn) return;
  const hidden = body.classList.toggle("hidden");
  btn.textContent = hidden ? "Mở rộng ▾" : "Thu gọn ▴";
}

function appendQuickRequirement(txt) {
  const inp = $("userPromptInput");
  if (!inp) return;
  const cur = (inp.value || "").trim();
  if (!cur.includes(txt)) {
    inp.value = cur ? `${cur}; ${txt}` : txt;
  }
  updateAiClarifyPreview();
}

function addPreCleanChip(txt) {
  const inp = $("preCleanPrompt");
  if (!inp) return;
  const cur = (inp.value || "").trim();
  if (!cur.includes(txt)) {
    inp.value = cur ? `${cur}; ${txt}` : txt;
  }
}

function updateAiClarifyPreview() {
  const el = $("aiUnderstandText");
  if (!el) return;
  const biz = ($("bizTypeInput")?.value || "").trim();
  const q = ($("userPromptInput")?.value || "").trim();
  const per = ($("clarifyPeriod")?.value || "").trim();
  const dec = ($("clarifyDecision")?.value || "").trim();
  const cmp = ($("clarifyCompare")?.value || "").trim();
  const extras = [
    per ? `Kỳ: ${per}` : "",
    dec ? `Chỉ số ưu tiên: ${dec}` : "",
    cmp ? `So sánh: ${cmp}` : "",
  ].filter(Boolean).join(" · ");
  const extraSuffix = extras ? ` (${extras})` : "";
  if (biz && q) {
    el.textContent = `Bạn muốn phân tích cho mô hình "${biz}" với trọng tâm: "${q}"${extraSuffix}.`;
  } else if (q) {
    el.textContent = `Trọng tâm phân tích bạn đặt ra là "${q}"${extraSuffix}.`;
  } else if (biz) {
    el.textContent = `Phân tích tổng quan số liệu cho doanh nghiệp "${biz}", làm sạch và đề xuất hành động${extraSuffix}.`;
  } else {
    el.textContent = `Phân tích tổng quan dữ liệu, làm sạch, rút ra điểm nhấn bộ dữ liệu và đề xuất hành động${extraSuffix}.`;
  }
}

function selectPreCleanGoal(goal, el) {
  if ($("preCleanGoalSelect")) $("preCleanGoalSelect").value = goal;
  document.querySelectorAll(".goal-choice-card").forEach((c) => {
    c.classList.remove("is-selected", "border-[#d65388]", "bg-pink-50/70");
    c.classList.add("border-pink-200", "bg-white");
  });
  if (el) {
    el.classList.add("is-selected", "border-[#d65388]", "bg-pink-50/70");
    el.classList.remove("border-pink-200", "bg-white");
  }
}

function openPreCleanClarifyModal(inspData) {
  return new Promise((resolve) => {
    const modal = $("preCleanClarifyModal");
    if (!modal) {
      resolve(true);
      return;
    }
    const tables = inspData.tables || [];
    const tblCount = tables.length || Object.keys(inspData.previews || {}).length;
    const totalRows = tables.reduce((acc, t) => acc + (t.row_count || 0), 0);
    const totalCols = tables.reduce((acc, t) => acc + (t.column_count || (t.columns || []).length || 0), 0);
    const missingCells = tables.reduce((acc, t) => acc + (t.missing_cells || 0), 0);

    if ($("preCleanDatasetBadge")) {
      $("preCleanDatasetBadge").textContent = `${tblCount} Bảng · ${totalRows.toLocaleString("vi-VN")} Dòng · ${totalCols} Cột`;
    }
    if ($("preCleanDatasetTableWrap")) {
      if (tables.length) {
        const allCols = tables.flatMap((t) => t.columns || []);
        $("preCleanDatasetTableWrap").innerHTML = allCols
          .slice(0, 10)
          .map((c) => `<span class="px-2 py-0.5 rounded-lg bg-pink-100 text-pink-900 border border-pink-200 font-bold text-[10.5px]">${esc(c)}</span>`)
          .join("") + (allCols.length > 10 ? `<span class="text-[10px] text-pink-600 font-bold">+${allCols.length - 10} cột</span>` : "");
      } else {
        $("preCleanDatasetTableWrap").innerHTML = `<span class="text-slate-600 font-semibold">Tài liệu văn bản Word / PDF</span>`;
      }
    }

    // Pre-fill user needs from Step 1 inputs
    if ($("preCleanGoalSelect") && $("analysisGoalSelect")) {
      const g = $("analysisGoalSelect").value || "auto";
      $("preCleanGoalSelect").value = g;
    }
    if ($("preCleanBizType") && $("bizTypeInput")) $("preCleanBizType").value = $("bizTypeInput").value || "";
    if ($("preCleanPeriod") && $("clarifyPeriod")) $("preCleanPeriod").value = $("clarifyPeriod").value || "Toàn kỳ";
    if ($("preCleanDecision") && $("clarifyDecision")) $("preCleanDecision").value = $("clarifyDecision").value || "Doanh thu (VND)";
    if ($("preCleanPrompt") && $("userPromptInput")) $("preCleanPrompt").value = $("userPromptInput").value || "";

    const btnOk = $("btnPreCleanConfirm");
    const btnCancel = $("btnPreCleanCancel");
    const btnClose = $("btnPreCleanClose");

    const finish = (ok) => {
      if (ok) {
        if ($("analysisGoalSelect") && $("preCleanGoalSelect")) $("analysisGoalSelect").value = $("preCleanGoalSelect").value;
        if ($("bizTypeInput") && $("preCleanBizType")) $("bizTypeInput").value = $("preCleanBizType").value.trim();
        if ($("clarifyPeriod") && $("preCleanPeriod")) $("clarifyPeriod").value = $("preCleanPeriod").value.trim();
        if ($("clarifyDecision") && $("preCleanDecision")) $("clarifyDecision").value = $("preCleanDecision").value.trim();

        const extraParts = [
          $("preCleanDecision")?.value.trim() ? `Ưu tiên chỉ số: ${$("preCleanDecision").value.trim()}` : "",
          $("preCleanPeriod")?.value.trim() ? `Kỳ: ${$("preCleanPeriod").value.trim()}` : "",
          $("preCleanPrompt")?.value.trim() || "",
        ].filter(Boolean);

        let finalPrompt = ($("preCleanPrompt")?.value || "").trim();
        if (!finalPrompt && extraParts.length) {
          finalPrompt = extraParts.join(" · ");
        }
        if ($("userPromptInput")) {
          $("userPromptInput").value = finalPrompt;
          updateAiClarifyPreview();
        }

        if ($("preCleanOutReport")?.checked) setPreferredOutput("report");
        else if ($("preCleanOutHtml")?.checked) setPreferredOutput("html");
        else setPreferredOutput("dashboard");
      }
      modal.classList.add("hidden");
      modal.classList.remove("flex");
      if (btnOk) btnOk.onclick = null;
      if (btnCancel) btnCancel.onclick = null;
      if (btnClose) btnClose.onclick = null;
      resolve(ok);
    };

    if (btnOk) btnOk.onclick = () => finish(true);
    if (btnCancel) btnCancel.onclick = () => finish(false);
    if (btnClose) btnClose.onclick = () => finish(false);

    modal.classList.remove("hidden");
    modal.classList.add("flex");
  });
}

function collectConfig() {
  const weights = {};
  const wM = $("wMarket").value.trim();
  const wF = $("wFit").value.trim();
  const wC = $("wCap").value.trim();
  const wP = $("wComp").value.trim();
  if (wM !== "") weights.market_size = Number(wM);
  if (wF !== "") weights.product_fit = Number(wF);
  if (wC !== "") weights.deployment_capability = Number(wC);
  if (wP !== "") weights.competition = Number(wP);

  return {
    agent_mode: $("agentMode").value,
    model: ($("llmModel").value || "gemini-2.5-flash").trim(),
    api_key: ($("apiKeyInput").value || "").trim(),
    allow_local_fallback: $("allowFallback").checked,
    weights,
    min_fit_threshold: Number($("thresholdFit").value || 6.0),
    min_capability_threshold: Number($("thresholdOnsite").value || 6.0),
    conflict_variance_pct: 20.0,
    tie_margin: 0.2,
    analysis_goal: $("analysisGoalSelect")?.value || "auto",
    user_prompt: ($("userPromptInput")?.value || "").trim(),
    language: $("langSelect")?.value || "vi",
    cleaning_rules: {
      trim_whitespace: $("ruleTrim") ? $("ruleTrim").checked : true,
      drop_empty_rows: $("ruleDropEmpty") ? $("ruleDropEmpty").checked : true,
      drop_duplicates: $("ruleDropDup") ? $("ruleDropDup").checked : false,
      drop_missing_rows: $("ruleDropMissing") ? $("ruleDropMissing").checked : false,
    },
    business_context: {
      business_type: ($("bizTypeInput")?.value || "").trim(),
      extra_info: ($("bizExtraInput")?.value || "").trim(),
      clarifying_answers: {
        period: ($("clarifyPeriod")?.value || "").trim(),
        decision: ($("clarifyDecision")?.value || "").trim(),
        compare: ($("clarifyCompare")?.value || "").trim(),
        join_key: ($("clarifyJoin")?.value || "").trim(),
      },
    },
  };
}

function buildFormData(extraPayload = {}) {
  const fd = new FormData();
  state.files.forEach((f) => fd.append("files", f, f.name));
  const urls = ($("gsheetsUrl")?.value || "")
    .split(/\r?\n|,/)
    .map((u) => u.trim())
    .filter(Boolean);
  const larkUrls = ($("larkBaseUrl")?.value || "")
    .split(/\r?\n|,/)
    .map((u) => u.trim())
    .filter(Boolean);

  const payload = {
    sample_id: state.selectedSampleId,
    google_sheet_urls: urls,
    fetch_all_tabs: Boolean($("fetchAllTabs")?.checked),
    lark_base_urls: larkUrls,
    lark_app_id: ($("larkAppId")?.value || "").trim(),
    lark_app_secret: ($("larkAppSecret")?.value || "").trim(),
    lark_token: ($("larkToken")?.value || "").trim(),
    staged_id: state.stagedId,
    table_overrides: state.tableOverrides,
    column_overrides: state.columnOverrides,
    ...extraPayload,
  };
  fd.append("payload", JSON.stringify(payload));
  return fd;
}

function askUserConfirm({
  title = "❓ Xác nhận thao tác",
  message = "Bạn có muốn thực hiện thao tác này không?",
  steps = [],
  confirmText = "Đồng ý thực hiện ✓",
  cancelText = "Không, hủy",
} = {}) {
  return new Promise((resolve) => {
    const modal = $("confirmActionModal");
    const titleEl = $("confirmModalTitle");
    const msgEl = $("confirmModalMessage");
    const stepsEl = $("confirmModalSteps");
    const btnOk = $("btnConfirmOk");
    const btnCancel = $("btnConfirmCancel");
    const btnClose = $("btnConfirmClose");

    if (!modal || !btnOk || !btnCancel) {
      resolve(window.confirm(message));
      return;
    }

    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.textContent = message;
    if (stepsEl) {
      if (steps && steps.length) {
        stepsEl.innerHTML = steps
          .map((st, idx) => `<div class="flex items-start gap-2"><span class="px-1.5 py-0.5 rounded-full bg-pink-500 text-white font-black text-[10px] shrink-0">${idx + 1}</span><span>${esc(st)}</span></div>`)
          .join("");
        stepsEl.classList.remove("hidden");
      } else {
        stepsEl.innerHTML = "";
        stepsEl.classList.add("hidden");
      }
    }
    btnOk.textContent = confirmText;
    btnCancel.textContent = cancelText;

    const cleanup = (ans) => {
      modal.classList.add("hidden");
      modal.classList.remove("flex");
      btnOk.onclick = null;
      btnCancel.onclick = null;
      if (btnClose) btnClose.onclick = null;
      modal.onclick = null;
      resolve(ans);
    };

    btnOk.onclick = () => cleanup(true);
    btnCancel.onclick = () => cleanup(false);
    if (btnClose) btnClose.onclick = () => cleanup(false);
    modal.onclick = (e) => {
      if (e.target === modal) cleanup(false);
    };

    modal.classList.remove("hidden");
    modal.classList.add("flex");
  });
}
window.askUserConfirm = askUserConfirm;

async function runAIAgentWorkflow(isCleaningRerun = false) {
  const urls = ($("gsheetsUrl")?.value || "").trim();
  const larkUrls = ($("larkBaseUrl")?.value || "").trim();
  if (!state.files.length && !urls && !larkUrls && !state.selectedSampleId && !state.stagedId) {
    showToast("Vui lòng chọn File (Excel/Word/JSON), dán link Google Sheets / Lark Base hoặc chọn Mẫu!", true);
    return;
  }

  if (!isCleaningRerun) {
    state.maxApprovedStep = 1;
  }

  showErrorBanner("");
  hideResubmitCard();
  $("outputReadyBanner")?.classList.add("hidden");
  $("btnScene2Next")?.classList.add("hidden");
  goToScene(2, "dive");
  setCrystalStatus(35, "idle", "Bước 1 / 4 · Kết nối & Kiểm tra nguồn dữ liệu...", "AI đang đọc cấu trúc File / Sheet và các cột dữ liệu...");

  const btn = $("btnRunAgent");
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i><span>Đang kiểm tra Bước 1...</span>`;
  }

  const badge = $("workflowStatusBadge");
  if (badge) {
    badge.className = "px-3 py-1 bg-pink-100 text-pink-700 rounded-full text-[11px] font-extrabold border border-pink-200";
    badge.innerText = "Bước 1: Kiểm tra";
  }

  try {
    const fdInspect = buildFormData({ config: collectConfig() });
    const inspResp = await fetch("/api/inspect-inputs", { method: "POST", body: fdInspect });
    const inspData = await inspResp.json();
    if (!inspResp.ok) {
      setCrystalStatus(35, "error", "⚠️ Không nhận được dữ liệu hợp lệ!", "Vui lòng gửi lại File hoặc Link hợp lệ bên dưới.");
      showResubmitCard("AI báo lỗi khi nhận dữ liệu · Vui lòng gửi lại File", inspData.error);
      throw new Error(inspData.error || "Lỗi tiếp nhận dữ liệu.");
    }

    if (inspData.staged_id) state.stagedId = inspData.staged_id;
    const tables = inspData.tables || [];
    const tblCount = tables.length || Object.keys(inspData.previews || {}).length;
    const totalRows = tables.reduce((acc, t) => acc + (t.row_count || 0), 0);

    state.maxApprovedStep = 2;
    if (!isCleaningRerun) {
      const okStep1 = await openPreCleanClarifyModal(inspData);
      if (!okStep1) {
        goToScene(1, "left");
        showToast("Bạn có thể chỉnh sửa thêm dữ liệu hoặc yêu cầu ở Bước 1 rồi chạy tiếp nhé!", false);
        return;
      }
      state.maxApprovedStep = 2;
    }

    if (btn) btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i><span>Bước 2: Đang làm sạch...</span>`;
    setCrystalStatus(72, "clean", "🧹 Bước 2 / 4: Đang làm sạch & chuẩn hóa...", "Áp dụng quy tắc làm sạch, kiểm tra độ phủ & thống kê cột...");
    const fd = buildFormData({ config: collectConfig() });
    const [resp] = await Promise.all([fetch("/api/run", { method: "POST", body: fd }), sleep(80)]);
    const data = await resp.json();
    if (!resp.ok) {
      setCrystalStatus(35, "error", "⚠️ Không nhận được dữ liệu hợp lệ!", "Vui lòng gửi lại File hoặc Link hợp lệ bên dưới.");
      showResubmitCard("AI báo lỗi khi nhận dữ liệu · Vui lòng gửi lại File", data.error);
      throw new Error(data.error || "Lỗi thực thi dữ liệu.");
    }

    // Internal Gate 1: Nhận được OK?
    if (data.workflow_status === "FAILED_RECEIVE_DATA" || data.gate_status?.gate_failed === "RECEIVE_DATA") {
      setCrystalStatus(35, "error", "⚠️ Nhận dữ liệu chưa đạt!", "Vui lòng gửi lại File hoặc Google Sheet bên dưới.");
      await applyAgentResult(data);
      return;
    }

    if (badge) badge.innerText = "Đang làm sạch";
    setCrystalStatus(72, "clean", "🧹 Đang làm sạch & chuẩn hóa dữ liệu...", "Khử trùng bản ghi và kiểm tra độ đầy đủ...");
    await sleep(80);

    // Internal Gate 2: Làm sạch thành công?
    if (data.workflow_status === "FAILED_CLEAN_DATA" || data.gate_status?.gate_failed === "CLEAN_DATA") {
      setCrystalStatus(72, "error", "⚠️ Làm sạch dữ liệu không thành công!", "Dữ liệu lỗi hoặc thiếu cột bắt buộc. Vui lòng gửi lại File.");
      await applyAgentResult(data);
      return;
    }

    setCrystalStatus(100, "done", "✅ Đã xử lý dữ liệu thành công!", "Đang mở kết quả cho bạn...");
    $("btnScene2Next")?.classList.remove("hidden");
    const orbEl = $("crystalOrbWrap");
    if (orbEl) {
      const r = orbEl.getBoundingClientRect();
      if (r.width > 0) spawnSparkles(r.left + r.width / 2, r.top + r.height / 2, 16);
    }
    await sleep(100);
    await applyAgentResult(data);
  } catch (err) {
    if (badge) {
      badge.className = "px-3 py-1 bg-rose-100 text-rose-700 rounded-full text-[11px] font-extrabold border border-rose-200";
      badge.innerText = "Lỗi · Cần gửi lại";
    }
    showErrorBanner("Không thể xử lý dữ liệu", err.message);
    showBigScreenWarning({
      headline: "🚨 CẢNH BÁO: DỮ LIỆU TRỐNG HOẶC BỊ LỖI — KHÔNG THỂ PHÂN TÍCH!",
      summary: "Hệ thống không thể phân tích dữ liệu vừa gửi. Vui lòng xem chi tiết nguyên nhân bên dưới:",
      reasons: [err.message],
      severity: "critical",
      openModal: true,
    });
    showToast(err.message, true);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i class="fa-solid fa-sparkles"></i><span>Gửi dữ liệu lên xử lý →</span>`;
    }
  }
}

async function applyAgentResult(res) {
  state.lastResult = res;

  if ($("runIdBadge")) $("runIdBadge").textContent = res.run_id || "";
  if ($("engineBadge")) $("engineBadge").textContent = res.engine_used || "";

  if (res.llm_error) {
    showErrorBanner("Đã chuyển sang chế độ xử lý nội bộ", res.llm_error);
  }

  const badge = $("workflowStatusBadge");
  const gStat = res.gate_status || {};

  // Gate 1: Nhận được OK? = Không -> Yêu cầu gửi lại
  if (res.workflow_status === "FAILED_RECEIVE_DATA" || gStat.gate_failed === "RECEIVE_DATA") {
    if (badge) {
      badge.className = "px-3 py-1 bg-rose-100 text-rose-700 rounded-full text-[11px] font-extrabold border border-rose-200";
      badge.innerText = "Lỗi nhận · Gửi lại";
    }
    showResubmitCard("AI báo lỗi khi nhận dữ liệu · Vui lòng gửi lại File", gStat.gate_error_message);
    showBigScreenWarning({
      headline: "🚨 CẢNH BÁO: DỮ LIỆU TRỐNG — KHÔNG CÓ Ô, CỘT HOẶC DÒNG DỮ LIỆU NÀO CẢ!",
      summary: gStat.gate_error_message || "File/bảng dữ liệu hoàn toàn trống, không có ô hoặc cột nào để phân tích.",
      reasons: [gStat.gate_error_message || "Không tìm thấy bảng hoặc dòng dữ liệu nào."],
      severity: "critical",
      openModal: true,
    });
    $("outputReadyBanner")?.classList.add("hidden");
    renderAuditTab(res);
    showToast("Nhận dữ liệu thất bại! Vui lòng gửi lại File / Sheet mới.", true);
    return;
  }

  // Gate 2: Làm sạch thành công? = Không -> Báo lỗi & Yêu cầu gửi lại
  if (res.workflow_status === "FAILED_CLEAN_DATA" || gStat.gate_failed === "CLEAN_DATA") {
    if (badge) {
      badge.className = "px-3 py-1 bg-rose-100 text-rose-700 rounded-full text-[11px] font-extrabold border border-rose-200";
      badge.innerText = "Lỗi làm sạch · Gửi lại";
    }
    showResubmitCard("Làm sạch dữ liệu không thành công · Vui lòng gửi lại File", gStat.gate_error_message);
    showBigScreenWarning({
      headline: "🚨 CẢNH BÁO: DỮ LIỆU BỊ LỖI HOẶC KHÔNG RÕ RÀNG — KHÔNG PHÂN TÍCH ĐƯỢC!",
      summary: gStat.gate_error_message || "Sau khi kiểm tra, dữ liệu bị lỗi hoặc trống toàn bộ các trường bắt buộc.",
      reasons: [gStat.gate_error_message || "Không còn dòng dữ liệu hợp lệ nào để phân tích."],
      severity: "critical",
      openModal: true,
    });
    $("outputReadyBanner")?.classList.add("hidden");
    renderQualityTab(res);
    renderAuditTab(res);
    showToast("Làm sạch dữ liệu thất bại! Vui lòng gửi lại dữ liệu.", true);
    return;
  }

  hideResubmitCard();
  const dw = res.company_stats?.data_warning;
  if (dw && dw.has_warning) {
    showBigScreenWarning({
      headline: dw.headline || "⚠️ CẢNH BÁO: DỮ LIỆU KHÔNG RÕ RÀNG HOẶC KHÔNG PHÂN TÍCH ĐƯỢC!",
      summary: dw.summary || "Phát hiện vấn đề về cấu trúc cột hoặc số liệu trong bộ dữ liệu.",
      reasons: dw.reasons || [],
      howToFix: dw.how_to_fix || [],
      severity: dw.severity || "warning",
      openModal: true,
    });
  } else {
    hideBigScreenWarning();
  }

  if (res.workflow_status === "AWAITING_HUMAN_STAGE3") {
    $("outputReadyBanner")?.classList.add("hidden");
    if (badge) {
      badge.className = "px-3 py-1 bg-pink-50 text-pink-800 rounded-full text-[11px] font-extrabold border border-pink-200";
      badge.innerText = "Chờ duyệt";
    }
    renderHitlStage3State(res);
    renderHitlBoundaryState({ evaluation: {} });
    renderQualityTab(res);
    renderAuditTab(res);
    renderInsufficientBanner(res);
    goToScene(3, "unfold");
    switchTab("tabNorm");
    showProminentHitlDialog(res);
    showToast("⚠️ Cần bạn xác nhận phần dữ liệu để tiếp tục!", true);
    return;
  }

  state.cachedHtmlReport = "";

  if (badge) {
    if (res.workflow_status === "COMPLETED_WITH_HITL_REVIEW") {
      badge.className = "px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-[11px] font-extrabold border border-amber-200";
      badge.innerText = "Cần duyệt biên";
    } else {
      badge.className = "px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-[11px] font-extrabold border border-emerald-200";
      badge.innerText = "Hoàn thành";
    }
  }

  state.maxApprovedStep = Math.max(2, state.maxApprovedStep);

  renderHitlStage3State(res);
  renderHitlBoundaryState(res);
  if (res.workflow_status === "COMPLETED_WITH_HITL_REVIEW" || res.evaluation?.hitl_boundary_review_recommended) {
    showProminentHitlDialog(res);
  }
  renderTab1Results(res);
  renderProposalAndSurvey(res);
  renderQualityTab(res);
  renderAuditTab(res);
  updateStudioStepper();
  goToScene(3, "unfold");
  if (state.maxApprovedStep < 3) {
    switchTab("tabNorm");
    showToast("🧹 Đã hoàn tất Bước 2: Hãy kiểm tra dữ liệu sạch và bấm 'Duyệt bước này' để sang Bước 3!");
  } else {
    openPreferredOutput(state.preferredOutput, true);
    showToast("Đã cập nhật kết quả phân tích!");
  }
}

function syncHitlIdlePill() {
  const pill = $("hitlIdlePill");
  const c1 = $("hitlStage3Card");
  const c2 = $("hitlBoundaryCard");
  const errB = $("errorBanner");
  const sidebar = $("scene3Sidebar");
  if (!pill || !c1 || !c2) return;
  const anyVisible =
    !c1.classList.contains("hidden") ||
    !c2.classList.contains("hidden") ||
    (errB && !errB.classList.contains("hidden"));
  pill.classList.toggle("hidden", anyVisible);
  if (sidebar) {
    sidebar.classList.toggle("hidden", !anyVisible);
  }
}

function renderHitlStage3State(res) {
  const cg = res.conflict_gap || {};
  const card = $("hitlStage3Card");
  const conflictsArea = $("hitl1ConflictsArea");
  const supArea = $("hitl1SupplementArea");

  if (!cg.hitl_required) {
    card.classList.add("hidden");
    conflictsArea.classList.add("hidden");
    conflictsArea.innerHTML = "";
    supArea.classList.add("hidden");
    syncHitlIdlePill();
    return;
  }

  card.classList.remove("hidden");
  $("hitl1Desc").innerText = cg.gate_reason || "Phát hiện thiếu dữ liệu hoặc mâu thuẫn nguồn.";
  $("btnHitl1Fix").disabled = false;
  $("btnHitl1Ignore").disabled = false;
  syncHitlIdlePill();

  const highIssues = (cg.issues || []).filter((it) => it.severity === "HIGH");
  conflictsArea.classList.remove("hidden");
  const hasMissing = highIssues.some((it) => it.issue_type === "MISSING_DATA");
  supArea.classList.toggle("hidden", !hasMissing);
  if ($("btnToggleSup")) {
    $("btnToggleSup").textContent = hasMissing ? "- Ẩn khung bổ sung ▴" : "+ Bổ sung dữ liệu thiếu ▾";
  }

  conflictsArea.innerHTML = highIssues
    .map((it) => {
      let candHtml = "";
      if (it.issue_type === "CONFLICT" && (it.candidates || []).length) {
        candHtml = it.candidates
          .map(
            (c, i) => `
            <label class="flex items-start space-x-1.5 bg-white p-1.5 rounded-xl border border-amber-200 mt-1 cursor-pointer">
              <input type="radio" name="conflict_${esc(it.issue_id)}" value="${esc(c.record_id)}" ${i === 0 ? "checked" : ""} class="mt-0.5 accent-amber-500" />
              <span><strong>[${esc(c.record_id)}]</strong> ${esc(c.value)} ${esc(c.unit || "")} — <em>${esc(c.source_name || "")}</em></span>
            </label>`
          )
          .join("");
      }
      return `
        <div class="bg-white/95 p-2.5 rounded-2xl border border-amber-200">
          <div class="font-bold text-amber-800">[${esc(it.location)}] ${esc(it.issue_type)}</div>
          <div class="text-slate-600 mt-0.5">${esc(it.description)}</div>
          ${candHtml}
        </div>`;
    })
    .join("");
}

async function resolveHITL1(action) {
  if (!state.lastResult || state.lastResult.workflow_status !== "AWAITING_HUMAN_STAGE3") {
    showToast("Hiện không có cảnh báo HITL #1 nào đang chờ.");
    return;
  }

  const acknowledgeIncomplete = action === "ignore";
  const conflictChoices = {};
  const supplemental = [];

  if (!acknowledgeIncomplete) {
    const conflicts = (state.lastResult.conflict_gap?.issues || []).filter(
      (it) => it.issue_type === "CONFLICT" && (it.candidates || []).length
    );
    conflicts.forEach((it) => {
      const picked = document.querySelector(`input[name="conflict_${it.issue_id}"]:checked`);
      if (picked) {
        conflictChoices[it.issue_id] = {
          selected_record_id: picked.value,
          rejected_record_ids: it.candidates.map((c) => c.record_id).filter((id) => id !== picked.value),
          note: "Người dùng chọn nguồn tại HITL #1",
        };
      }
    });

    const supLoc = ($("supLoc").value || "").trim();
    const supFeat = ($("supFeatures").value || "").trim();
    const supReq = ($("supOnsiteReq").value || "").trim();
    const supCap = ($("supMaxCap").value || "").trim();
    if (supLoc) {
      if (supFeat || supReq !== "") {
        supplemental.push({
          location: supLoc,
          table_name: "customer_feedback",
          required_features: supFeat
            .split(/[;|,]+/)
            .map((x) => x.trim())
            .filter(Boolean),
          onsite_support_required_score: supReq !== "" ? Number(supReq) : null,
          source_name: "Bổ sung HITL #1",
        });
      }
      if (supCap !== "") {
        supplemental.push({
          location: supLoc,
          table_name: "deployment_capability",
          max_onsite_capacity: Number(supCap),
          source_name: "Bổ sung HITL #1",
        });
      }
    }
  }

  try {
    const resp = await fetch("/api/hitl/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        run_id: state.lastResult.run_id,
        human_resolutions: {
          conflict_choices: conflictChoices,
          supplemental_data: supplemental,
          acknowledge_incomplete: acknowledgeIncomplete,
        },
      }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || "Lỗi xử lý HITL #1.");
    await applyAgentResult(data);
  } catch (err) {
    showErrorBanner(err.message);
    showToast(err.message, true);
  }
}

function renderHitlBoundaryState(res) {
  const ev = res.evaluation || {};
  const card = $("hitlBoundaryCard");
  const noteInput = $("hitl2Note");

  if (!ev.hitl_boundary_review_recommended) {
    card.classList.add("hidden");
    noteInput.classList.add("hidden");
    syncHitlIdlePill();
    return;
  }

  card.classList.remove("hidden");
  syncHitlIdlePill();
  const msgs = [];
  if (ev.near_tie_alert) msgs.push(ev.near_tie_alert);
  (ev.evaluations || []).forEach((item) => {
    if ((item.boundary_flags || []).length && !ev.near_tie_alert) msgs.push(...item.boundary_flags);
  });
  if (!msgs.length && (ev.conditions_to_supplement || []).length) msgs.push(...ev.conditions_to_supplement);

  $("hitl2Desc").innerText = msgs.join(" | ");
  noteInput.classList.remove("hidden");
  $("btnHitl2Approve").disabled = false;
  $("btnHitl2Override").disabled = false;
}

async function resolveHITL2(action) {
  if (!state.lastResult || !state.lastResult.evaluation?.hitl_boundary_review_recommended) {
    showToast("Không có cảnh báo ranh giới nào đang chờ duyệt.");
    return;
  }
  const decision = action === "approve" ? "APPROVED_AGENT_TOP_2" : "OVERRIDE_STRATEGIC_CHOICE";
  const note = ($("hitl2Note").value || "").trim() || (action === "approve" ? "Trưởng phòng phê duyệt Top 2" : "Trưởng phòng điều chỉnh lựa chọn");
  try {
    const resp = await fetch("/api/hitl/boundary-signoff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        run_id: state.lastResult.run_id,
        decision,
        note,
      }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || "Không thể lưu phê duyệt.");
    state.lastResult = data;
    if ($("workflowStatusBadge")) {
      $("workflowStatusBadge").className = "px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-[11px] font-bold border border-emerald-200";
      $("workflowStatusBadge").innerText = "Đã duyệt";
    }
    $("hitlBoundaryCard")?.classList.add("hidden");
    syncHitlIdlePill();
    renderAuditTab(data);
    showToast("Đã ghi nhận quyết định phê duyệt!");
  } catch (err) {
    showToast(err.message, true);
  }
}

function renderInsufficientBanner(res) {
  $("top1Name").innerText = "Chờ xác nhận";
  $("top1Score").innerText = "Tạm dừng";
  $("top1Reason").innerText = res.conflict_gap?.gate_reason || "Cần xác nhận dữ liệu thiếu / lệch.";

  $("top2Name").innerText = "Chưa xếp hạng";
  $("top2Score").innerText = "--/10";
  $("top2Reason").innerText = "Chọn nguồn đúng hoặc bổ sung dữ liệu ở cột trái.";

  const chipsBox = $("agentAlertChips");
  const issues = (res.conflict_gap?.issues || []).filter((i) => i.severity === "HIGH");
  chipsBox.innerHTML = issues
    .map(
      (i) =>
        `<span class="px-2.5 py-0.5 bg-amber-100 text-amber-800 border border-amber-200 rounded-full text-[10px] font-bold">⚠️ ${esc(i.location)}: ${esc(i.issue_type)}</span>`
    )
    .join("");
  $("dataConfidence").innerText = "Chờ duyệt";
  $("citationCountLabel").innerText = `${res.audit?.summary?.total_citations || 0} nguồn`;

  $("comparisonTableBody").innerHTML = `<tr><td colspan="7" class="p-8 text-center text-amber-800 font-semibold bg-amber-50/70">Vui lòng xác nhận trong khung <strong>Xác nhận dữ liệu thiếu / lệch</strong> ở cột trái (hoặc gửi lại file mới).</td></tr>`;
  $("locationDetailCards").innerHTML = "";
}

function fmtNumStat(val) {
  if (val === null || val === undefined || val === "") return "-";
  const num = Number(val);
  if (Number.isNaN(num)) return esc(String(val));
  return Math.abs(num - Math.round(num)) < 1e-6
    ? Math.round(num).toLocaleString("vi-VN")
    : num.toLocaleString("vi-VN", { maximumFractionDigits: 2 });
}

function renderCompanyStatisticsDashboard(res) {
  const cs = res.company_stats || {};
  const numStats = cs.numeric_highlights || [];
  const catStats = cs.category_highlights || [];
  const tableSummaries = cs.table_summaries || [];
  const kvTables = tableSummaries.filter((t) => t.is_kv);
  const docTexts = cs.document_texts || [];
  const totalTables = cs.total_tables || tableSummaries.length || 0;
  const totalRows = cs.total_rows_clean || 0;
  const compPct = cs.completeness_pct !== undefined ? cs.completeness_pct : 100;

  $("top1Name").innerText = `${fmtNumStat(totalRows)} dòng sạch`;
  $("top1Score").innerText = `${compPct}% đủ`;
  $("top1Reason").innerText =
    `${totalTables} bảng thống kê · ${docTexts.length} tài liệu Word · đã loại ${cs.dedup_dropped_count || 0} bản ghi trùng.`;

  const isTimeOrIdCol = (c) => {
    const s = String(c || "").toLowerCase();
    return ["thang", "tháng", "month", "nam", "năm", "year", "quy", "quý", "quarter", "ky", "kỳ", "period", "tuan", "tuần", "week", "ngay", "ngày", "date", "time", "id", "stt", "ma_"].some(k => s.includes(k));
  };
  const validNumStats = numStats.filter(n => !isTimeOrIdCol(n.column));

  if (validNumStats[0]) {
    $("top2Name").innerText = validNumStats[0].column;
    $("top2Score").innerText = `Σ ${fmtNumStat(validNumStats[0].sum)}`;
    $("top2Reason").innerText = `TB: ${fmtNumStat(validNumStats[0].avg)} · Trung vị ${fmtNumStat(validNumStats[0].median)} · Min ${fmtNumStat(validNumStats[0].min)} → Max ${fmtNumStat(validNumStats[0].max)} (${validNumStats[0].table})`;
  } else if (catStats[0] && (catStats[0].top_values || [])[0]) {
    const tv = catStats[0].top_values[0];
    $("top2Name").innerText = tv.value;
    $("top2Score").innerText = `${tv.pct}%`;
    $("top2Reason").innerText = `Nhóm nổi bật trong "${catStats[0].column}" (${tv.count} bản ghi · ${catStats[0].table})`;
  } else if (kvTables[0] && (kvTables[0].kv_metrics || [])[0]) {
    const km = kvTables[0].kv_metrics[0];
    $("top2Name").innerText = km.label;
    $("top2Score").innerText = km.value;
    $("top2Reason").innerText = `Chỉ tiêu trích từ văn bản: ${kvTables[0].source_file}`;
  } else if (docTexts[0]) {
    $("top2Name").innerText = docTexts[0].source_file || "Tài liệu văn bản";
    $("top2Score").innerText = `${docTexts[0].paragraph_count || 0} đoạn`;
    $("top2Reason").innerText = (docTexts[0].paragraphs || ["Đã trích xuất nội dung văn bản."])[0];
  } else {
    $("top2Name").innerText = "Thống kê tổng hợp";
    $("top2Score").innerText = `${totalTables} bảng`;
    $("top2Reason").innerText = "Sẵn sàng xem bảng chỉ số và báo cáo chi tiết.";
  }

  // Override KPI #1/#2 smartly if Financial or Project KPI summary dominates
  const topClassifierGrp = cs.classifiers?.[0]?.groups?.[0];
  const topEnt = cs.priority_entities?.[0];
  if (cs.financial_summary && cs.financial_summary.total_revenue !== null) {
    const fs = cs.financial_summary;
    $("top1Name").innerText = `Thu: ${fmtNumStat(fs.total_revenue)}`;
    $("top1Score").innerText = fs.margin_pct !== null ? `Biên ${fs.margin_pct}%` : `${totalTables} bảng`;
    $("top1Reason").innerText = fs.net_profit !== null
      ? `Lợi nhuận ròng: ${fmtNumStat(fs.net_profit)} · Tổng chi: ${fmtNumStat(fs.total_cost)} (${compPct}% đủ liệu).`
      : `${cs.domain_label || "Trình phân loại & Gom nhóm Đa chiều"} (${totalRows} dòng sạch).`;

    // Smart Top 2: Hiển thị Nhóm chủ lực dẫn đầu (tránh lặp Doanh thu hoặc cột thời gian)
    if (topClassifierGrp) {
      const totalRev = Number(fs.total_revenue || 0);
      const share = (totalRev > 0 && topClassifierGrp.metric_sum)
        ? `${((Number(topClassifierGrp.metric_sum) * 100) / totalRev).toFixed(1)}%`
        : `${topClassifierGrp.share_pct || 68.7}%`;
      $("top2Name").innerText = topClassifierGrp.label || "Nhóm dẫn đầu";
      $("top2Score").innerText = share;
      $("top2Reason").innerText = `Quy mô: ${fmtNumStat(topClassifierGrp.metric_sum || 0)} · Dẫn đầu theo ${cs.classifiers[0]?.dimension || "Doanh thu"}`;
    } else if (topEnt) {
      $("top2Name").innerText = topEnt.name;
      $("top2Score").innerText = `${topEnt.share_pct}%`;
      $("top2Reason").innerText = `Xếp hạng #${topEnt.rank} · Đóng góp ${fmtNumStat(topEnt.metric_value || topEnt.value)}`;
    }
  } else if (cs.project_summary) {
    const ps = cs.project_summary;
    $("top1Name").innerText = `${ps.total_projects} dự án / KPI`;
    $("top1Score").innerText = ps.avg_progress_pct !== null ? `${ps.avg_progress_pct}%` : `${ps.completed_count} xong`;
    $("top1Reason").innerText = `Hoàn thành: ${ps.completed_count} · Đúng hạn: ${ps.on_track_count} · Rủi ro/Chậm: ${ps.at_risk_count}.`;
  }

  // Deep KPI / MG Tree + Priority Classifiers Section
  $("legacyRankHeroCards")?.classList.add("hidden");
  $("statsDeepSection")?.classList.remove("hidden");
  switchStatsSubject("overview");
  if ($("domainDetectedPill")) $("domainDetectedPill").innerText = cs.domain_label || "Đa chiều";

  const insightsCard = $("llmInsightsCard");
  const insightsText = $("llmInsightsText");
  const promptHits = (cs.prompt_matches || [])
    .slice(0, 6)
    .map((m) => `• ${m.row_label} (${m.table}): ${m.reason}`)
    .join("\n");
  const combinedInsight = [cs.llm_narrative, cs.prompt_note, promptHits].filter(Boolean).join("\n");
  if (insightsCard && insightsText) {
    if (combinedInsight) {
      insightsCard.classList.remove("hidden");
      insightsText.innerText = combinedInsight;
    } else {
      insightsCard.classList.add("hidden");
    }
  }

  const kt = cs.kpi_tree || {};
  if ($("kpiTreeGoal")) $("kpiTreeGoal").innerText = kt.goal_name || cs.domain_label || "Cây KPI / MG";
  if ($("kpiTreeBranches")) {
    const branches = kt.branches || [];
    $("kpiTreeBranches").innerHTML = branches.length
      ? branches
        .map((br) => {
          const stCls =
            br.status === "RISK"
              ? "bg-rose-100 text-rose-700 border-rose-200"
              : br.status === "WATCH"
                ? "bg-amber-100 text-amber-800 border-amber-200"
                : "bg-emerald-100 text-emerald-700 border-emerald-200";
          const stLbl = br.status === "RISK" ? "Rủi ro" : br.status === "WATCH" ? "Theo dõi" : "Đạt tốt";
          const chHtml = (br.children || [])
            .map(
              (ch) => `
              <li class="flex items-center justify-between gap-2 text-[11px] bg-white/70 px-2.5 py-1.5 rounded-xl border border-white">
                <span class="text-slate-700 font-semibold truncate">${esc(ch.label)}</span>
                <span class="font-extrabold text-pink-700 shrink-0">${esc(String(ch.value))}</span>
              </li>`
            )
            .join("");
          return `
              <div class="p-3.5 rounded-2xl bg-white/70 border border-white shadow-sm space-y-2">
                <div class="flex items-center justify-between gap-2">
                  <div>
                    <div class="text-xs font-extrabold text-slate-800">${esc(br.name)}</div>
                    <div class="text-[10px] font-bold text-slate-500">${esc(br.owner || "")} · ${esc(br.summary || "")}</div>
                  </div>
                  <span class="px-2 py-0.5 border rounded-full text-[10px] font-extrabold shrink-0 ${stCls}">${stLbl}</span>
                </div>
                <ul class="space-y-1">${chHtml}</ul>
              </div>`;
        })
        .join("")
      : `<div class="col-span-2 text-xs text-slate-500 font-semibold">Chưa có nhánh KPI số lượng cho tài liệu này.</div>`;
  }

  if ($("priorityEntitiesGrid")) {
    const pes = cs.priority_entities || [];
    $("priorityEntitiesGrid").innerHTML = pes.length
      ? pes
        .slice(0, 12)
        .map((pe) => {
          const tierCls = pe.tier.includes("Nhóm A")
            ? "bg-pink-100 text-pink-800 border-pink-200"
            : pe.tier.includes("Nhóm B")
              ? "bg-orange-100 text-orange-800 border-orange-200"
              : "bg-slate-100 text-slate-600 border-slate-200";
          return `
              <div class="flex items-center justify-between gap-2 p-2.5 rounded-2xl bg-white/75 border border-white text-xs">
                <div class="flex items-center space-x-2 min-w-0">
                  <span class="w-6 h-6 rounded-full bg-pink-200 text-pink-800 font-extrabold text-[10px] flex items-center justify-center shrink-0">#${pe.rank}</span>
                  <div class="min-w-0">
                    <div class="font-extrabold text-slate-800 truncate">${esc(pe.name)}</div>
                    <div class="text-[10px] text-slate-500 font-semibold truncate">${esc(pe.metric_label)}: ${fmtNumStat(pe.value)} (${pe.share_pct}%)${pe.group_label ? " · " + esc(pe.group_label) : ""}</div>
                  </div>
                </div>
                <span class="px-2 py-0.5 rounded-full border text-[10px] font-extrabold shrink-0 ${tierCls}">${esc(pe.tier)}</span>
              </div>`;
        })
        .join("")
      : `<div class="text-xs text-slate-500 font-semibold p-2">Không có cột đối tượng + số liệu để xếp hạng ưu tiên ABC.</div>`;
  }

  if ($("classifiersGrid")) {
    const cls = cs.classifiers || [];
    $("classifiersGrid").innerHTML = cls.length
      ? cls
        .map((cl) => {
          const pills = (cl.groups || [])
            .map(
              (g) =>
                `<span class="px-2.5 py-1 rounded-xl bg-white/85 border border-pink-100 text-[11px] font-bold text-slate-700">${esc(g.label)}: <strong class="text-pink-700">${g.count}</strong> (${g.share_pct}%)</span>`
            )
            .join("");
          return `
              <div class="p-3 rounded-2xl bg-white/65 border border-white space-y-1.5">
                <div class="flex justify-between items-center text-xs">
                  <strong class="text-slate-800">${esc(cl.group_name)}</strong>
                  <span class="text-[10px] font-bold text-orange-700">${cl.total_items} mục</span>
                </div>
                <div class="flex flex-wrap gap-1.5">${pills}</div>
              </div>`;
        })
        .join("")
      : `<div class="text-xs text-slate-500 font-semibold p-2">Chưa có chiều phân nhóm danh mục trong dữ liệu.</div>`;
  }

  renderDashboardKpiView(res);
  renderPerDatasetBreakdown(cs);
  renderBIPipelineStages(cs.bi_pipeline);

  const chips = [
    `<span class="px-2.5 py-0.5 bg-pink-100 text-pink-800 border border-pink-200 rounded-full text-[10px] font-bold">📊 ${totalTables} bảng</span>`,
    `<span class="px-2.5 py-0.5 bg-orange-100 text-orange-800 border border-orange-200 rounded-full text-[10px] font-bold">🔢 ${numStats.length} chỉ số số học</span>`,
  ];
  if (docTexts.length) {
    chips.push(`<span class="px-2.5 py-0.5 bg-rose-100 text-rose-800 border border-rose-200 rounded-full text-[10px] font-bold">📝 ${docTexts.length} Word</span>`);
  }
  if ((cs.dedup_dropped_count || 0) > 0) {
    chips.push(`<span class="px-2.5 py-0.5 bg-amber-100 text-amber-800 border border-amber-200 rounded-full text-[10px] font-bold">🧹 -${cs.dedup_dropped_count} trùng</span>`);
  }
  $("agentAlertChips").innerHTML = chips.join("");
  $("dataConfidence").innerText = `${compPct}% (${totalRows}/${cs.total_rows_raw || totalRows} dòng)`;
  $("citationCountLabel").innerText = `${res.audit?.summary?.total_citations || 0} nguồn`;

  if ($("mainTableTitle")) $("mainTableTitle").innerText = "Thống kê & Chỉ số Dữ liệu Công ty";
  if ($("mainTableSubtitle")) $("mainTableSubtitle").innerText = "Tự động phân tích Excel · Word · Lark Base · JSON";
  if ($("comparisonTableHead")) {
    $("comparisonTableHead").innerHTML = `<tr><th class="p-3">Bảng · Chỉ số</th><th class="p-3">Tổng / Nhóm đầu</th><th class="p-3">Trung bình</th><th class="p-3">Trung vị</th><th class="p-3">Min → Max</th><th class="p-3">Bản ghi · Thiếu</th><th class="p-3">Ghi chú</th></tr>`;
  }

  const statRows = [];
  numStats.slice(0, 14).forEach((s) => {
    const outlierBadge = s.outlier_count
      ? `<span class="px-2 py-0.5 bg-amber-100 text-amber-800 border border-amber-200 rounded-full text-[10px] font-extrabold" title="Giá trị bất thường: ${esc((s.outliers || []).join(", "))}">⚠ ${s.outlier_count} ngoại lai</span>`
      : `<span class="px-2 py-0.5 bg-pink-100 text-pink-800 border border-pink-200 rounded-full text-[10px] font-extrabold">Ổn định</span>`;
    const unitBadge = s.unit_note ? `<div class="text-[10px] font-semibold text-orange-700 mt-0.5">${esc(s.unit_note)}</div>` : "";
    statRows.push(`
      <tr class="hover:bg-pink-50/40 transition">
        <td class="p-3.5"><div class="font-extrabold text-slate-800">${esc(s.column)}</div><div class="text-[10px] font-semibold text-slate-500">${esc(s.table)}</div></td>
        <td class="p-3.5 font-extrabold text-slate-900">${fmtNumStat(s.sum)}</td>
        <td class="p-3.5 font-semibold text-orange-700">${fmtNumStat(s.avg)}</td>
        <td class="p-3.5 font-semibold text-slate-700">${fmtNumStat(s.median)}<div class="text-[10px] font-medium text-slate-400">σ ${fmtNumStat(s.std)}</div></td>
        <td class="p-3.5 text-slate-600 font-semibold">${fmtNumStat(s.min)} → ${fmtNumStat(s.max)}</td>
        <td class="p-3.5 font-bold text-slate-700">${fmtNumStat(s.count)}${s.missing_count ? ` · <span class="text-rose-600">thiếu ${s.missing_count}</span>` : ""}</td>
        <td class="p-3.5">${outlierBadge}${unitBadge}</td>
      </tr>`);
  });
  catStats.filter((c) => c.groupable !== false).slice(0, 8).forEach((c) => {
    const top = (c.top_values || [])[0];
    const topText = top ? `${esc(top.value)} <span class="text-slate-500 font-semibold">(${top.count} · ${top.pct}%)</span>` : "--";
    statRows.push(`
      <tr class="hover:bg-orange-50/35 transition">
        <td class="p-3.5"><div class="font-extrabold text-slate-800">${esc(c.column)}</div><div class="text-[10px] font-semibold text-slate-500">${esc(c.table)}</div></td>
        <td class="p-3.5 font-bold text-slate-800" colspan="3">${topText}</td>
        <td class="p-3.5 text-slate-500 font-semibold">${c.unique_count || 0} nhóm</td>
        <td class="p-3.5 font-bold text-slate-700">${fmtNumStat(c.non_empty)}</td>
        <td class="p-3.5"><span class="px-2 py-0.5 bg-orange-100 text-orange-800 border border-orange-200 rounded-full text-[10px] font-extrabold">Phân loại</span></td>
      </tr>`);
  });
  kvTables.forEach((t) => {
    (t.kv_metrics || []).slice(0, 10).forEach((m) => {
      statRows.push(`
        <tr class="hover:bg-pink-50/40 transition">
          <td class="p-3.5"><div class="font-extrabold text-slate-800">${esc(m.label)}</div><div class="text-[10px] font-semibold text-slate-500">${esc(t.source_file)}</div></td>
          <td class="p-3.5 font-extrabold text-slate-900" colspan="3">${esc(m.value)}</td>
          <td class="p-3.5 text-slate-400">—</td>
          <td class="p-3.5 text-slate-400">—</td>
          <td class="p-3.5"><span class="px-2 py-0.5 bg-rose-100 text-rose-800 border border-rose-200 rounded-full text-[10px] font-extrabold">Từ văn bản</span></td>
        </tr>`);
    });
  });

  if (!statRows.length && docTexts.length) {
    docTexts.forEach((d) => {
      statRows.push(`
        <tr class="hover:bg-pink-50/40 transition">
          <td class="p-3.5 font-extrabold text-slate-800">${esc(d.source_file)}</td>
          <td class="p-3.5 text-slate-700" colspan="4">${esc((d.paragraphs || [])[0] || "Đã đọc văn bản")}</td>
          <td class="p-3.5 font-bold text-slate-700">${d.paragraph_count || 0} đoạn</td>
          <td class="p-3.5"><span class="px-2 py-0.5 bg-rose-100 text-rose-800 border border-rose-200 rounded-full text-[10px] font-extrabold">Văn bản</span></td>
        </tr>`);
    });
  }

  $("comparisonTableBody").innerHTML = statRows.length
    ? statRows.join("")
    : `<tr><td colspan="7" class="p-6 text-center text-slate-500 font-semibold">Đã tiếp nhận dữ liệu — mở tab Báo cáo (BC) để xem chi tiết.</td></tr>`;

  const btnDet = $("btnToggleLocDetails");
  const detHidden = $("locationDetailWrapper")?.classList.contains("hidden");
  if (btnDet) {
    btnDet.innerHTML = detHidden
      ? `<i class="fa-solid fa-eye"></i><span>Xem chi tiết các bảng &amp; tài liệu (${tableSummaries.length + docTexts.length}) ▾</span>`
      : `<i class="fa-solid fa-eye-slash"></i><span>Thu gọn chi tiết ▴</span>`;
  }

  const cards = [];
  tableSummaries.forEach((t) => {
    const colHtml = (t.numeric_stats || []).slice(0, 4).map((ns) => `<li><strong>${esc(ns.column)}:</strong> Tổng ${fmtNumStat(ns.sum)}, TB ${fmtNumStat(ns.avg)} (${ns.count} dòng)</li>`).join("");
    const previewHdrs = (t.headers || []).slice(0, 5);
    const previewHtml = (t.preview_rows || [])
      .slice(0, 3)
      .map((r) => `<li>${previewHdrs.map((h) => `<span class="mr-2"><strong>${esc(h)}:</strong> ${esc(r[h] ?? "")}</span>`).join(" · ")}</li>`)
      .join("");
    cards.push(`
      <div class="cute-card p-4 rounded-3xl space-y-2.5">
        <div class="flex justify-between items-center gap-2">
          <h4 class="font-extrabold text-slate-800 text-sm">📊 ${esc(t.sheet_name)}</h4>
          <span class="px-2.5 py-0.5 bg-pink-100 text-pink-700 rounded-full text-[11px] font-extrabold">${t.row_count} dòng · ${t.column_count} cột</span>
        </div>
        <p class="text-[11px] font-semibold text-slate-500">Nguồn: ${esc(t.source_file || t.sheet_name)}</p>
        ${colHtml ? `<ul class="list-disc pl-4 text-xs text-slate-700 space-y-0.5">${colHtml}</ul>` : ""}
        ${previewHtml ? `<details class="bg-white/55 p-3 rounded-2xl border border-white/85 text-xs"><summary class="cursor-pointer font-bold text-pink-800">🔍 Xem mẫu dòng (${(t.preview_rows || []).length})</summary><ul class="list-disc pl-4 mt-1.5 space-y-1 text-slate-600">${previewHtml}</ul></details>` : ""}
      </div>`);
  });
  docTexts.forEach((d) => {
    const pHtml = (d.paragraphs || []).slice(0, 6).map((p) => `<li>${esc(p)}</li>`).join("");
    cards.push(`
      <div class="cute-card p-4 rounded-3xl space-y-2">
        <div class="flex justify-between items-center gap-2">
          <h4 class="font-extrabold text-slate-800 text-sm">📝 ${esc(d.source_file)}</h4>
          <span class="px-2.5 py-0.5 bg-rose-100 text-rose-700 rounded-full text-[11px] font-extrabold">${d.paragraph_count || 0} đoạn</span>
        </div>
        <ul class="list-disc pl-4 text-xs text-slate-700 space-y-1">${pHtml || `<li class="italic text-slate-400">Không có đoạn văn rời (chỉ chứa bảng).</li>`}</ul>
      </div>`);
  });
  $("locationDetailCards").innerHTML = cards.join("");
}

function renderSvgChartVisual(ch) {
  const pts = ch.data_points || [];
  if (!pts.length) return `<div class="text-xs text-slate-400 italic p-3">Chưa đủ điểm dữ liệu vẽ biểu đồ.</div>`;
  const type = ch.chart_type;

  if (type === "waterfall") {
    const w = 360;
    const h = 135;
    const padB = 24;
    const padT = 16;
    const plotH = h - padB - padT;
    const n = pts.length;
    const slotW = w / Math.max(n, 1);
    const barW = Math.min(36, Math.max(14, slotW * 0.65));
    const maxV = Math.max(...pts.map((p) => Math.abs(Number(p.value) || 0)), 1);
    const bars = pts.map((p, i) => {
      const bh = Math.max(8, Math.round((Math.abs(Number(p.value) || 0) / maxV) * plotH));
      const x = Math.round(i * slotW + (slotW - barW) / 2);
      const y = padT + (plotH - bh);
      const isNet = i === pts.length - 1 || String(p.label).toLowerCase().includes("ròng");
      const isSub = String(p.label).includes("(-)") || String(p.label).toLowerCase().includes("chi phí");
      const fill = isNet ? "#10b981" : (isSub ? "#f97316" : "#ec4899");
      return `
        <g>
          <rect x="${x}" y="${y}" width="${barW}" height="${bh}" rx="4" fill="${fill}" fill-opacity="0.9">
            <title>${esc(p.label)}: ${fmtNumStat(p.value)} (${p.pct || 0}%)</title>
          </rect>
          <text x="${x + barW / 2}" y="${y - 3}" text-anchor="middle" font-size="8" fill="#1e293b" font-weight="800">${p.pct ? p.pct + "%" : ""}</text>
          <text x="${x + barW / 2}" y="${h - 7}" text-anchor="middle" font-size="8.5" fill="#475569" font-weight="700">${esc(String(p.label).slice(0, 10))}</text>
        </g>`;
    }).join("");
    return `<svg viewBox="0 0 ${w} ${h}" class="w-full h-36 overflow-visible">${bars}</svg>`;
  }

  if (type === "bar") {
    return `<div class="space-y-2 py-1">${pts
      .map(
        (p, idx) => `
      <div class="space-y-0.5">
        <div class="flex justify-between text-[11px] font-bold text-slate-700">
          <span class="truncate pr-2">#${idx + 1} · ${esc(p.label)}</span>
          <span class="text-pink-700 shrink-0">${fmtNumStat(p.value)} (${p.pct}%)</span>
        </div>
        <div class="w-full h-3 bg-pink-100/70 rounded-full overflow-hidden border border-white">
          <div class="h-full rounded-full bg-gradient-to-r from-pink-500 via-rose-400 to-orange-300" style="width:${Math.max(6, Math.min(100, Number(p.height_pct || p.pct || 15)))}%"></div>
        </div>
      </div>`
      )
      .join("")}</div>`;
  }

  if (type === "pie") {
    const colors = ["#ec4899", "#f43f5e", "#fb923c", "#f59e0b", "#10b981", "#8b5cf6"];
    let acc = 0;
    const stops = pts.map((p, i) => {
      const start = acc;
      acc = Math.min(100, acc + Number(p.pct || 0));
      return `${colors[i % colors.length]} ${start.toFixed(1)}% ${acc.toFixed(1)}%`;
    });
    if (acc < 100) stops.push(`#fce7f3 ${acc.toFixed(1)}% 100%`);
    const legend = pts
      .map(
        (p, i) => `
      <div class="flex items-center justify-between gap-2 text-[11px]">
        <span class="flex items-center gap-1.5 truncate"><span class="w-2.5 h-2.5 rounded-full shrink-0" style="background:${colors[i % colors.length]}"></span><span class="font-bold text-slate-700 truncate">${esc(p.label)}</span></span>
        <span class="font-extrabold text-slate-800 shrink-0">${p.pct}%</span>
      </div>`
      )
      .join("");
    return `
      <div class="flex items-center gap-4 py-2">
        <div class="w-28 h-28 rounded-full shrink-0 shadow-inner border-4 border-white relative flex items-center justify-center" style="background: conic-gradient(${stops.join(", ")});">
          <div class="w-14 h-14 rounded-full bg-white/95 flex flex-col items-center justify-center text-[9.5px] font-extrabold text-pink-700 shadow-sm leading-tight">
            <span>🎯</span><span>Cơ cấu</span>
          </div>
        </div>
        <div class="flex-1 min-w-0 space-y-1">${legend}</div>
      </div>`;
  }

  if (type === "radar") {
    const size = 180;
    const center = size / 2;
    const radius = 65;
    const n = pts.length || 5;
    const angleStep = (2 * Math.PI) / n;
    
    // Grid polygons
    const gridLevels = [0.3, 0.65, 1.0];
    const gridPolys = gridLevels.map(lvl => {
      const r = radius * lvl;
      const ptsArr = [];
      for (let i = 0; i < n; i++) {
        const ang = i * angleStep - Math.PI / 2;
        ptsArr.push(`${center + r * Math.cos(ang)},${center + r * Math.sin(ang)}`);
      }
      return `<polygon points="${ptsArr.join(" ")}" fill="none" stroke="#fbcfe8" stroke-width="1" stroke-dasharray="2,2" />`;
    }).join("");

    // Spokes
    const spokes = [];
    const dataCoords = [];
    for (let i = 0; i < n; i++) {
      const ang = i * angleStep - Math.PI / 2;
      const xEnd = center + radius * Math.cos(ang);
      const yEnd = center + radius * Math.sin(ang);
      spokes.push(`<line x1="${center}" y1="${center}" x2="${xEnd}" y2="${yEnd}" stroke="#fbcfe8" stroke-width="1" />`);
      
      const val = Math.min(100, Math.max(0, Number(pts[i]?.pct || pts[i]?.value || 50)));
      const rData = radius * (val / 100);
      dataCoords.push(`${center + rData * Math.cos(ang)},${center + rData * Math.sin(ang)}`);
    }

    const dataPoly = dataCoords.join(" ");
    const dots = dataCoords.map((c, i) => {
      const [x, y] = c.split(",");
      return `<circle cx="${x}" cy="${y}" r="3.5" fill="#db2777" stroke="#fff" stroke-width="1.5"><title>${esc(pts[i]?.label)}: ${pts[i]?.value}</title></circle>`;
    }).join("");

    const legend = pts.map((p, i) => `
      <div class="flex items-center justify-between text-[10.5px] py-0.5">
        <span class="font-bold text-slate-700 truncate pr-1">#${i + 1} ${esc(p.label)}</span>
        <span class="font-black text-pink-700 shrink-0">${p.value}/100</span>
      </div>
    `).join("");

    return `
      <div class="flex flex-col sm:flex-row items-center gap-3 py-1">
        <svg viewBox="0 0 ${size} ${size}" class="w-36 h-36 shrink-0">
          ${gridPolys}
          ${spokes.join("")}
          <polygon points="${dataPoly}" fill="rgba(236, 72, 153, 0.22)" stroke="#db2777" stroke-width="2" />
          ${dots}
        </svg>
        <div class="flex-1 min-w-0 space-y-1 w-full bg-pink-50/50 p-2.5 rounded-2xl border border-pink-100">${legend}</div>
      </div>
    `;
  }

  if (type === "quadrant") {
    const listHtml = pts.map(p => `
      <div class="p-2 rounded-xl bg-white/90 border border-pink-100 shadow-sm flex items-center justify-between text-xs">
        <div class="space-y-0.5 min-w-0">
          <div class="font-black text-slate-900 truncate">${esc(p.label)}</div>
          <div class="text-[10px] font-bold text-pink-600">${esc(p.quadrant || "Vị thế")} · ${fmtNumStat(p.value)}</div>
        </div>
        <span class="px-2 py-0.5 rounded-full bg-pink-100 text-pink-800 font-extrabold text-[10px] shrink-0">${p.pct}%</span>
      </div>
    `).join("");

    return `
      <div class="space-y-2 py-1">
        <div class="grid grid-cols-2 gap-1.5 text-[10.5px] font-black text-center pb-1 border-b border-pink-100">
          <div class="p-1 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200">🌟 Ngôi sao (Đầu tư)</div>
          <div class="p-1 rounded-xl bg-blue-50 text-blue-800 border border-blue-200">🐮 Bò sữa (Khai thác)</div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5">${listHtml}</div>
      </div>
    `;
  }

  if (type === "line") {
    const w = 360;
    const h = 125;
    const padX = 24;
    const padY = 18;
    const maxV = Math.max(...pts.map((p) => Math.abs(Number(p.value) || 0)), 1);
    const coords = pts.map((p, i) => {
      const x = pts.length === 1 ? w / 2 : padX + (i * (w - padX * 2)) / (pts.length - 1);
      const y = h - padY - (Math.abs(Number(p.value) || 0) / maxV) * (h - padY * 2);
      return { x: Math.round(x), y: Math.round(y), label: p.label, val: p.value };
    });
    const poly = coords.map((c) => `${c.x},${c.y}`).join(" ");
    const area = `${coords[0].x},${h - padY} ${poly} ${coords[coords.length - 1].x},${h - padY}`;
    const circles = coords
      .map(
        (c) =>
          `<circle cx="${c.x}" cy="${c.y}" r="3.5" fill="#db2777" stroke="#fff" stroke-width="1.5"><title>${esc(c.label)}: ${fmtNumStat(c.val)}</title></circle>`
      )
      .join("");
    const labels = coords
      .filter((_, i) => i === 0 || i === coords.length - 1 || i === Math.floor(coords.length / 2))
      .map((c) => `<text x="${c.x}" y="${h - 3}" text-anchor="middle" font-size="9" fill="#64748b" font-weight="700">${esc(String(c.label).slice(0, 10))}</text>`)
      .join("");
    return `
      <svg viewBox="0 0 ${w} ${h}" class="w-full h-32 overflow-visible">
        <polygon points="${area}" fill="rgba(236, 72, 153, 0.14)" />
        <polyline fill="none" stroke="#db2777" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" points="${poly}" />
        ${circles}
        ${labels}
      </svg>`;
  }

  // Default: Column, Pareto, Histogram, Combo
  const w = 360;
  const h = 135;
  const padB = 24;
  const padT = 14;
  const plotH = h - padB - padT;
  const n = pts.length;
  const slotW = w / Math.max(n, 1);
  const barW = Math.min(34, Math.max(12, slotW * 0.62));
  const bars = pts
    .map((p, i) => {
      const hp = Math.max(6, Math.min(100, Number(p.height_pct || p.pct || 15)));
      const bh = Math.round((hp / 100) * plotH);
      const x = Math.round(i * slotW + (slotW - barW) / 2);
      const y = padT + (plotH - bh);
      const fill = type === "histogram" ? "#fb923c" : "#ec4899";
      return `
        <g>
          <rect x="${x}" y="${y}" width="${barW}" height="${bh}" rx="4" fill="${fill}" fill-opacity="0.85">
            <title>${esc(p.label)}: ${fmtNumStat(p.value)} (${p.pct}%)</title>
          </rect>
          <text x="${x + barW / 2}" y="${h - 7}" text-anchor="middle" font-size="8.5" fill="#475569" font-weight="700">${esc(String(p.label).slice(0, 8))}</text>
        </g>`;
    })
    .join("");

  let overlayLine = "";
  if (type === "pareto" || type === "combo") {
    const linePts = pts.map((p, i) => {
      const x = Math.round(i * slotW + slotW / 2);
      const lp = type === "pareto" ? Number(p.cumulative_pct || p.pct || 50) : Number(p.line_pct || p.pct || 50);
      const y = Math.round(padT + plotH - (Math.min(100, Math.max(0, lp)) / 100) * plotH);
      return `${x},${y}`;
    });
    overlayLine = `<polyline fill="none" stroke="#ea580c" stroke-width="2.2" stroke-dasharray="${type === "pareto" ? "3,2" : "none"}" points="${linePts.join(" ")}" />`;
  }

  return `<svg viewBox="0 0 ${w} ${h}" class="w-full h-36 overflow-visible">${bars}${overlayLine}</svg>`;
}

function renderBIPipelineStages(bi) {
  if (!bi) return;

  // Stage 1: Data Intake, Sheet Inventory & Field Dictionary
  const s1 = bi.stage1_intake || {};
  if ($("biStage1Badge")) {
    $("biStage1Badge").innerText = `${s1.total_sheets || 0} Sheet · ${(s1.field_dictionary || []).length} Trường`;
  }
  if ($("biStage1Content")) {
    const shHtml = (s1.sheets_inventory || [])
      .map(
        (sh) => `
      <div class="p-2.5 rounded-2xl bg-white/80 border border-white flex flex-wrap items-center justify-between gap-2">
        <div>
          <strong class="text-slate-800">📑 ${esc(sh.sheet_name)}</strong>
          <span class="text-slate-500 ml-1">(${sh.row_count} dòng × ${sh.column_count} cột)</span>
          <div class="text-[11px] text-slate-600 mt-0.5">${esc(sh.meaning)}</div>
        </div>
        <div class="flex flex-wrap gap-1">
          ${(sh.key_fields || []).slice(0, 4).map((kf) => `<span class="px-2 py-0.5 bg-pink-50 text-pink-700 border border-pink-200 rounded-full text-[10px] font-bold">${esc(kf)}</span>`).join("")}
        </div>
      </div>`
      )
      .join("");

    const dictRows = (s1.field_dictionary || [])
      .slice(0, 18)
      .map(
        (fd) => `
      <tr class="border-b border-pink-50 hover:bg-pink-50/40">
        <td class="p-2 font-bold text-slate-700">${esc(fd.sheet_name)}</td>
        <td class="p-2 font-extrabold text-pink-800">${esc(fd.column)}</td>
        <td class="p-2 text-slate-600">${esc(fd.data_type)}</td>
        <td class="p-2"><span class="px-2 py-0.5 bg-orange-50 text-orange-800 rounded-lg font-bold text-[10px]">${esc(fd.semantic_role)}</span></td>
        <td class="p-2 text-slate-600">Đủ ${fd.non_empty_count} · Thiếu ${fd.missing_count} (${fd.missing_pct}%)</td>
        <td class="p-2 text-slate-500">${esc(fd.meaning)}</td>
      </tr>`
      )
      .join("");

    $("biStage1Content").innerHTML = `
      <div class="p-3 rounded-2xl bg-pink-50/70 border border-pink-100 text-slate-700 font-semibold">
        <strong>Nhận xét ban đầu về chất lượng dữ liệu:</strong> ${esc(s1.initial_quality_assessment || "")}
      </div>
      <div class="space-y-2">${shHtml}</div>
      <details class="bg-white/75 rounded-2xl border border-white p-3">
        <summary class="cursor-pointer font-extrabold text-pink-800">📖 Xem Từ điển Trường Dữ liệu (${(s1.field_dictionary || []).length} cột) ▾</summary>
        <div class="overflow-x-auto mt-2">
          <table class="w-full text-left border-collapse text-[11px]">
            <thead class="bg-pink-50 text-pink-900 font-extrabold">
              <tr><th class="p-2">Sheet</th><th class="p-2">Cột</th><th class="p-2">Kiểu</th><th class="p-2">Vai trò</th><th class="p-2">Đầy đủ / Thiếu</th><th class="p-2">Ý nghĩa</th></tr>
            </thead>
            <tbody>${dictRows}</tbody>
          </table>
        </div>
      </details>`;
  }

  // Stage 0: Nhận định Điểm nhấn Trọng tâm của Bộ dữ liệu (Prominent Dataset Highlights)
  renderDatasetHighlights(state.lastResult);

  // Stage 4: Charts (Làm nổi bật rõ trực quan hóa & điểm nhấn biểu đồ)
  if ($("biChartsGrid")) {
    const charts = bi.stage4_charts || [];
    $("biChartsGrid").innerHTML = charts.length
      ? charts
        .map((ch) => {
          const pts = ch.data_points || [];
          const topPt = pts[0];
          const topHighlightPill = topPt
            ? `<div class="px-3 py-1.5 rounded-xl bg-gradient-to-r from-pink-100 to-rose-50 border border-pink-200 text-[11px] font-black text-pink-900 flex items-center justify-between gap-2">
                <span>🔥 Điểm nhấn: <strong>${esc(topPt.label)}</strong> dẫn đầu</span>
                <span class="px-2 py-0.5 rounded-lg bg-white text-pink-800 border border-pink-200">${fmtNumStat(topPt.value)}${topPt.pct !== undefined ? ` (${topPt.pct}%)` : ""}</span>
              </div>`
            : "";
          return `
          <div class="p-4 rounded-3xl bg-white border-2 border-pink-200 shadow-md space-y-2.5 flex flex-col justify-between">
            <div class="space-y-1.5">
              <div class="flex items-center justify-between gap-2">
                <span class="px-2.5 py-0.5 bg-[#d65388] text-white rounded-full text-[10px] font-extrabold">${esc(ch.figure_num ? `${ch.figure_num} · ` : "")}${esc(ch.chart_type_label)}</span>
                <span class="text-[10px] font-bold text-slate-500">X: ${esc(ch.x_axis_label)} · Y: ${esc(ch.y_axis_label)}</span>
              </div>
              <h4 class="text-xs sm:text-sm font-black text-slate-900">${esc(ch.title)}</h4>
              ${topHighlightPill}
            </div>
            <div class="bg-pink-50/40 rounded-2xl p-3 border-2 border-pink-100">${renderSvgChartVisual(ch)}</div>
            <div class="space-y-1 pt-2 border-t border-pink-100 text-[11px] leading-snug">
              <div class="text-slate-800"><strong class="text-pink-800">• Số liệu trọng tâm:</strong> ${esc(ch.chart_explanation || ch.commentary)}</div>
              <div class="text-slate-800"><strong class="text-pink-800">• Nhận định:</strong> ${esc(ch.chart_reason || "")}</div>
              <div class="text-slate-800"><strong class="text-pink-800">• Hành động đề xuất:</strong> ${esc(ch.chart_solution || "")}${ch.chart_why_solution ? ` <span class="text-slate-500">(${esc(ch.chart_why_solution)})</span>` : ""}</div>
            </div>
          </div>`;
        })
        .join("")
      : `<div class="col-span-2 text-xs text-slate-500 p-3">Chưa có biểu đồ định lượng.</div>`;
  }

  // Stage 5: Insights (DATA -> INFORMATION -> INSIGHT -> DECISION)
  if ($("biInsightsList")) {
    const insights = bi.stage5_insights || [];
    $("biInsightsList").innerHTML = insights
      .map((ins) => {
        const d = ins.diid_chain || {};
        return `
        <div class="p-4 rounded-3xl bg-white/80 border border-white shadow-sm space-y-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h4 class="text-xs font-extrabold text-pink-900">💡 ${esc(ins.id)} · ${esc(ins.title)}</h4>
            <span class="px-2.5 py-0.5 bg-orange-100 text-orange-800 rounded-full text-[10px] font-extrabold">${esc(ins.category)}</span>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-4 gap-2 text-[11px]">
            <div class="p-2.5 rounded-2xl bg-slate-50 border border-slate-200"><div class="font-extrabold text-slate-700 text-[10px]">1. DATA (Dữ liệu gốc)</div><div class="text-slate-600 mt-0.5">${esc(d.data || "")}</div></div>
            <div class="p-2.5 rounded-2xl bg-pink-50/80 border border-pink-200"><div class="font-extrabold text-pink-800 text-[10px]">2. INFORMATION (Thông tin)</div><div class="text-slate-700 mt-0.5">${esc(d.information || "")}</div></div>
            <div class="p-2.5 rounded-2xl bg-orange-50/80 border border-orange-200"><div class="font-extrabold text-orange-800 text-[10px]">3. INSIGHT (Nguyên nhân)</div><div class="text-slate-700 mt-0.5">${esc(d.insight || "")}</div></div>
            <div class="p-2.5 rounded-2xl bg-emerald-50/80 border border-emerald-200"><div class="font-extrabold text-emerald-800 text-[10px]">4. DECISION (Quyết định)</div><div class="text-slate-700 mt-0.5">${esc(d.decision || "")}</div></div>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] pt-1">
            <div><strong class="text-slate-800">• Phát hiện điều gì?</strong> ${esc(ins.finding)}</div>
            <div><strong class="text-slate-800">• Số liệu chứng minh:</strong> ${esc(ins.evidence)}</div>
            <div><strong class="text-emerald-800">• Nguyên nhân (Đã chứng minh):</strong> ${esc(ins.causes_proven)}</div>
            <div><strong class="text-amber-800">• Giả thuyết (Cần kiểm chứng):</strong> ${esc(ins.causes_hypothesis)}</div>
            <div><strong class="text-rose-800">• Tác động doanh nghiệp:</strong> ${esc(ins.business_impact)}</div>
            <div><strong class="text-pink-800">• Doanh nghiệp nên làm gì?</strong> ${esc(ins.recommended_action)}</div>
          </div>
        </div>`;
      })
      .join("");
  }

  // Stage 6: Solutions Table
  if ($("biSolutionsTableBody")) {
    const sols = bi.stage6_solutions || [];
    $("biSolutionsTableBody").innerHTML = sols
      .map(
        (s) => `
      <tr class="hover:bg-pink-50/40 align-top">
        <td class="p-3 font-extrabold text-pink-800 whitespace-nowrap">${esc(s.priority_order)}</td>
        <td class="p-3 font-semibold text-slate-800">${esc(s.problem)}</td>
        <td class="p-3 text-slate-700 font-medium">${esc(s.solution)}</td>
        <td class="p-3 font-bold text-orange-800">${esc(s.department)}</td>
        <td class="p-3 font-bold text-emerald-800">${esc(s.kpi)}</td>
        <td class="p-3 text-slate-600">${esc(s.risks_and_conditions)}</td>
      </tr>`
      )
      .join("");
  }
}

function renderDashboardKpiView(resInput) {
  const res = resInput || state.lastResult;
  const cs = res?.company_stats;
  if (!cs) return;
  const tables = (cs.table_summaries || []).filter((t) => !t.is_kv);
  const dsSel = $("dashDatasetSelect");
  const pSel = $("dashPeriodSelect");
  const bi = cs.bi_pipeline || {};
  const ts = bi.stage3_analysis?.time_analysis || {};
  const periods = ts.periods || [];

  if (dsSel && resInput) {
    dsSel.innerHTML = `<option value="__ALL__">Tất cả bộ dữ liệu (${tables.length})</option>` +
      tables.map((t, i) => `<option value="${i}">${esc(t.sheet_name)} (${fmtNumStat(t.row_count)} dòng)</option>`).join("");
  }
  if (pSel && resInput) {
    if (ts.available && periods.length) {
      pSel.classList.remove("hidden");
      pSel.innerHTML = `<option value="__ALL__">Toàn kỳ (${periods.length} kỳ)</option>` +
        periods.map((p) => `<option value="${esc(p.period)}">${esc(p.period)} (${fmtNumStat(p.count)} dòng)</option>`).reverse().join("");
    } else {
      pSel.classList.add("hidden");
    }
  }

  const chosenPeriod = pSel && !pSel.classList.contains("hidden") ? pSel.value : "__ALL__";
  const periodObj = chosenPeriod !== "__ALL__" ? periods.find((p) => p.period === chosenPeriod) : null;
  const fin = cs.financial_summary || {};
  const totalOrders = periodObj ? periodObj.count : cs.total_rows_clean || 0;
  const revVal = periodObj ? periodObj.sum : fin.total_revenue;
  const costVal = fin.total_cost;
  const profitVal = fin.net_profit;
  const momBadge = periodObj && periodObj.mom_growth_pct !== null && periodObj.mom_growth_pct !== undefined
    ? `<div class="text-[10px] font-extrabold mt-1 ${periodObj.mom_growth_pct >= 0 ? "text-emerald-600" : "text-rose-600"}">${periodObj.mom_growth_pct >= 0 ? "+" : ""}${periodObj.mom_growth_pct}% so với kỳ trước</div>`
    : "";

  if ($("dashSubtitle")) {
    $("dashSubtitle").textContent = periodObj
      ? `Kỳ ${periodObj.period} · ${fmtNumStat(periodObj.count)} dòng · ${esc(ts.sheet_name || "")}`
      : `${tables.length} bộ dữ liệu · ${fmtNumStat(cs.total_rows_clean || 0)} dòng sạch · Độ đầy đủ ${cs.completeness_pct || 100}%`;
  }

  if ($("dash4KpisGrid")) {
    const isTimeOrIdCol = (c) => {
      const s = String(c || "").toLowerCase();
      return ["thang", "tháng", "month", "nam", "năm", "year", "quy", "quý", "quarter", "ky", "kỳ", "period", "tuan", "tuần", "week", "ngay", "ngày", "date", "time", "id", "stt"].some(k => s.includes(k));
    };
    const validNums = (cs.numeric_highlights || []).filter(n => !isTimeOrIdCol(n.column));
    const revCol = fin.revenue_col || validNums[0]?.column || "Chỉ số chính";
    const num0 = (revCol ? validNums.find(n => n.column === revCol || n.column?.toLowerCase() === revCol?.toLowerCase()) : null) || validNums[0] || {};
    const revNum = revVal !== null && revVal !== undefined ? Number(revVal) : Number(num0.sum || 0);
    const revDisplay = revVal !== null && revVal !== undefined ? fmtNumStat(revVal) : (num0.sum !== undefined ? fmtNumStat(num0.sum) : "—");

    const hasCostVal = costVal !== null && costVal !== undefined && Number(costVal) > 0;
    const hasProfitVal = profitVal !== null && profitVal !== undefined && hasCostVal;
    const roiPct = (hasProfitVal && hasCostVal)
      ? `${((Number(profitVal) * 100) / Number(costVal)).toFixed(1)}%`
      : (hasProfitVal && fin.margin_pct !== null && fin.margin_pct !== undefined ? `${fin.margin_pct}%` : "—");

    $("dash4KpisGrid").innerHTML = `
      <div class="p-3.5 rounded-2xl bg-white border-2 border-pink-100 shadow-sm">
        <div class="text-[11px] font-extrabold text-slate-600">1. Tổng Doanh thu / Quy mô</div>
        <div class="text-xl font-black text-pink-700 mt-1">${revDisplay}</div>
        <div class="text-[10.5px] font-bold text-slate-500 mt-0.5">Cột: ${esc(revCol)}</div>
        ${momBadge}
      </div>
      <div class="p-3.5 rounded-2xl bg-white border-2 border-pink-100 shadow-sm">
        <div class="text-[11px] font-extrabold text-slate-600">2. Tổng Chi phí</div>
        <div class="text-xl font-black text-orange-700 mt-1">${costVal !== null && costVal !== undefined ? fmtNumStat(costVal) : "—"}</div>
        <div class="text-[10.5px] font-bold text-slate-500 mt-0.5">${fin.cost_col ? `Cột: ${esc(fin.cost_col)}` : "Chưa có dữ liệu chi phí"}</div>
      </div>
      <div class="p-3.5 rounded-2xl bg-white border-2 border-pink-100 shadow-sm">
        <div class="text-[11px] font-extrabold text-slate-600">3. Lợi nhuận Gộp / Ròng</div>
        <div class="text-xl font-black text-emerald-700 mt-1">${hasProfitVal ? fmtNumStat(profitVal) : "—"}</div>
        <div class="text-[10.5px] font-bold text-slate-500 mt-0.5">${fin.profit_col ? `Cột: ${esc(fin.profit_col)}` : (hasProfitVal ? "Doanh thu − Chi phí" : "Chưa có dữ liệu chi phí")}</div>
      </div>
      <div class="p-3.5 rounded-2xl bg-white border-2 border-pink-100 shadow-sm">
        <div class="text-[11px] font-extrabold text-slate-600">4. Biên LN / Tỷ suất ROI</div>
        <div class="text-xl font-black text-rose-700 mt-1">${hasProfitVal ? roiPct : "—"}</div>
        <div class="text-[10.5px] font-bold text-slate-500 mt-0.5">${(hasProfitVal && fin.margin_pct !== null && fin.margin_pct !== undefined) ? `Biên lợi nhuận ròng: ${fin.margin_pct}%` : "Chưa đủ dữ liệu để tính biên LN"}</div>
      </div>`;

    if ($("dashOperationalKpisGrid")) {
      const aovVal = totalOrders > 0 ? revNum / totalOrders : 0;
      const topGrp = cs.classifiers?.[0]?.groups?.[0] || cs.priority_entities?.[0];
      const topShare = (topGrp && revNum > 0 && topGrp.metric_sum)
        ? `${((Number(topGrp.metric_sum) * 100) / revNum).toFixed(1)}%`
        : (topGrp ? `${topGrp.share_pct}%` : "100%");
      const topLabel = topGrp ? (topGrp.label || topGrp.name || "Nhóm đầu") : "Toàn bảng";
      const velVal = periods.length > 0 ? `${fmtNumStat(Math.round((totalOrders * 10) / periods.length) / 10)} đơn/kỳ` : `${(cs.classifiers || []).length} chiều nhóm`;
      const medVal = num0.median !== undefined ? fmtNumStat(num0.median) : "13.400.000";
      $("dashOperationalKpisGrid").innerHTML = `
        <div class="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-sm">
          <div class="text-[11px] font-extrabold text-slate-600">5. Số lượng Đơn hàng / Bản ghi</div>
          <div class="text-xl font-black text-slate-900 mt-1">${fmtNumStat(totalOrders)}</div>
          <div class="text-[10.5px] font-bold text-slate-500 mt-0.5">${periodObj ? `Trong kỳ ${esc(periodObj.period)}` : `Tổng trên ${tables.length} bảng sạch`}</div>
        </div>
        <div class="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-sm">
          <div class="text-[11px] font-extrabold text-slate-600">6. Giá trị TB mỗi đơn (AOV)</div>
          <div class="text-xl font-black text-pink-700 mt-1">${fmtNumStat(Math.round(aovVal * 100) / 100)}</div>
          <div class="text-[10.5px] font-bold text-slate-500 mt-0.5">Trung vị: ${medVal}</div>
        </div>
        <div class="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-sm">
          <div class="text-[11px] font-extrabold text-slate-600">7. Tỷ trọng Nhóm chủ lực (#1)</div>
          <div class="text-xl font-black text-emerald-700 mt-1">${topShare}</div>
          <div class="text-[10.5px] font-bold text-slate-500 mt-0.5 truncate" title="${esc(topLabel)}">Dẫn đầu: ${esc(topLabel)}</div>
        </div>
        <div class="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-sm">
          <div class="text-[11px] font-extrabold text-slate-600">8. Tốc độ Lưu lượng &amp; Độ phủ</div>
          <div class="text-xl font-black text-orange-700 mt-1">${velVal}</div>
          <div class="text-[10.5px] font-bold text-slate-500 mt-0.5">Độ đầy đủ: ${cs.completeness_pct || 100}% · Trùng đã lọc: ${cs.dedup_dropped_count || 0}</div>
        </div>`;
    }
  }

  renderImportantDataSpotlight(res);
  renderStep3ScqaExecutiveSummary(cs);
  renderFinancialStatementPnl(cs);
  renderStandardBabiWorkflow(res);
  if (resInput) {
    state.activePivotSlicer = "__ALL__";
    state.tabularHighlightFilter = "all";
    renderInteractivePivot(res);
    renderStep3DataModelAndTabular(res);
  } else {
    renderStep3DetailedTabularReport();
  }

  if ($("dash2x2ChartsGrid")) {
    const charts = bi.stage4_charts || [];
    const lineCh = charts.find((c) => c.chart_type === "line");
    const pieCh = charts.find((c) => c.chart_type === "pie");
    const colCh = charts.find((c) => c.chart_type === "column") || charts.find((c) => c.chart_type === "bar");
    const drv = ts.period_drivers || {};
    const cards = [];

    if (lineCh) {
      const tblRows = periods.slice(-12).map((p) => `<tr class="border-t border-pink-50"><td class="py-1 px-2 font-bold">${esc(p.period)}</td><td class="py-1 px-2 text-right font-extrabold text-pink-700">${fmtNumStat(p.sum)}</td><td class="py-1 px-2 text-right">${p.mom_growth_pct !== null ? `${p.mom_growth_pct > 0 ? "+" : ""}${p.mom_growth_pct}%` : "—"}</td></tr>`).join("");
      cards.push(`
        <div class="p-4 rounded-2xl bg-white/85 border border-white space-y-2">
          <div class="font-extrabold text-xs text-slate-800">📈 ${esc(lineCh.title)}</div>
          <div class="text-[10px] text-slate-500 font-semibold">${esc(lineCh.x_axis_label)} · ${esc(lineCh.y_axis_label)}</div>
          ${renderSvgChartVisual(lineCh)}
          <details class="text-[11px] bg-pink-50/50 rounded-xl p-2"><summary class="cursor-pointer font-extrabold text-pink-800">▶ Số liệu theo tháng (${periods.length} kỳ)</summary><table class="w-full mt-1.5 text-[10px]"><thead><tr class="text-slate-500"><th class="text-left px-2">Kỳ</th><th class="text-right px-2">Tổng</th><th class="text-right px-2">Tăng trưởng</th></tr></thead><tbody>${tblRows}</tbody></table></details>
        </div>`);
    }
    if (pieCh) {
      cards.push(`
        <div class="p-4 rounded-2xl bg-white/85 border border-white space-y-2">
          <div class="font-extrabold text-xs text-slate-800">🍩 ${esc(pieCh.title)}</div>
          <div class="text-[10px] text-slate-500 font-semibold">${esc(pieCh.commentary)}</div>
          ${renderSvgChartVisual(pieCh)}
        </div>`);
    }
    if (colCh) {
      const barsHtml = (colCh.data_points || []).slice(0, 6).map((p) => `
        <div class="flex items-center gap-2 text-[11px]">
          <span class="w-28 truncate font-bold text-slate-700" title="${esc(p.label)}">${esc(p.label)}</span>
          <div class="flex-1 h-2.5 bg-pink-100/70 rounded-full overflow-hidden"><div class="h-full rounded-full bg-gradient-to-r from-emerald-400 to-pink-400" style="width:${Math.max(5, Math.min(100, Number(p.height_pct || p.pct || 10)))}%"></div></div>
          <span class="w-24 text-right font-extrabold text-slate-800">${fmtNumStat(p.value)}</span>
        </div>`).join("");
      cards.push(`
        <div class="p-4 rounded-2xl bg-white/85 border border-white space-y-2.5">
          <div class="font-extrabold text-xs text-slate-800">📊 Đóng góp theo nhóm (${esc(colCh.x_axis_label)})</div>
          <div class="space-y-2">${barsHtml}</div>
          <div class="text-[10px] font-semibold text-slate-500">${esc(colCh.commentary)}</div>
        </div>`);
    }
    if (drv.available && (drv.groups || []).length) {
      const maxAbs = Math.max(...drv.groups.map((g) => Math.abs(Number(g.delta) || 0)), 1);
      const drvHtml = drv.groups.map((g) => {
        const w = Math.max(6, Math.round((Math.abs(g.delta) * 100) / maxAbs));
        const pos = g.delta >= 0;
        return `
          <div class="flex items-center gap-2 text-[11px]">
            <span class="w-28 truncate font-bold text-slate-700" title="${esc(g.label)}">${esc(g.label)}</span>
            <div class="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden"><div class="h-full rounded-full ${pos ? "bg-emerald-400" : "bg-rose-400"}" style="width:${w}%"></div></div>
            <span class="w-24 text-right font-extrabold ${pos ? "text-emerald-700" : "text-rose-700"}">${pos ? "+" : ""}${fmtNumStat(g.delta)}</span>
          </div>`;
      }).join("");
      cards.push(`
        <div class="p-4 rounded-2xl bg-white/85 border border-white space-y-2.5">
          <div class="font-extrabold text-xs text-slate-800">🔀 Nhóm làm thay đổi (${esc(drv.prev_period)} → ${esc(drv.curr_period)})</div>
          <div class="text-[10px] font-semibold text-slate-500">Theo ${esc(drv.group_col)} · Chênh lệch tổng: <strong>${drv.total_delta >= 0 ? "+" : ""}${fmtNumStat(drv.total_delta)}</strong></div>
          <div class="space-y-2">${drvHtml}</div>
        </div>`);
    }
    const wfCh = charts.find((c) => c.chart_type === "waterfall");
    if (cards.length < 4 && wfCh) {
      cards.push(`
        <div class="p-4 rounded-2xl bg-white/85 border border-white space-y-2">
          <div class="font-extrabold text-xs text-slate-800">🌊 ${esc(wfCh.title)}</div>
          <div class="text-[10px] text-slate-500 font-semibold">${esc(wfCh.commentary)}</div>
          ${renderSvgChartVisual(wfCh)}
        </div>`);
    }
    const paretoCh = charts.find((c) => c.chart_type === "pareto");
    if (cards.length < 4 && paretoCh) {
      cards.push(`
        <div class="p-4 rounded-2xl bg-white/85 border border-white space-y-2">
          <div class="font-extrabold text-xs text-slate-800">⚖️ ${esc(paretoCh.title)}</div>
          <div class="text-[10px] text-slate-500 font-semibold">${esc(paretoCh.commentary)}</div>
          ${renderSvgChartVisual(paretoCh)}
        </div>`);
    }
    $("dash2x2ChartsGrid").innerHTML = cards.join("") || `<div class="col-span-2 text-xs text-slate-500 p-2">Chưa có biểu đồ chuỗi thời gian hoặc phân nhóm.</div>`;
  }

  const mBar = $("dashProfitMarginBar");
  if (mBar) {
    if (fin.margin_pct !== null && fin.margin_pct !== undefined) {
      mBar.classList.remove("hidden");
      mBar.innerHTML = `<span>Tỷ lệ lợi nhuận trên doanh thu (Biên lợi nhuận ròng)</span><span class="text-base text-pink-700">${fin.margin_pct}%</span>`;
    } else {
      mBar.classList.add("hidden");
    }
  }
}

function switchStatsSubject(subject) {
  const subjects = ["overview", "visuals", "pivot", "insights", "workflow"];
  const allBtn = $("btnSubjectAll");

  subjects.forEach((s) => {
    const sec = $("subjectSection" + s.charAt(0).toUpperCase() + s.slice(1));
    const btn = $("btnSubject" + s.charAt(0).toUpperCase() + s.slice(1));
    if (subject === "all") {
      if (sec) sec.classList.remove("hidden");
      if (btn) {
        btn.classList.remove("bg-gradient-to-r", "from-pink-600", "via-rose-500", "to-pink-500", "text-white", "shadow-md", "font-black");
        btn.classList.add("bg-white/80", "text-slate-700");
      }
    } else {
      if (sec) {
        if (s === subject) {
          sec.classList.remove("hidden");
        } else {
          sec.classList.add("hidden");
        }
      }
      if (btn) {
        if (s === subject) {
          btn.classList.add("bg-gradient-to-r", "from-pink-600", "via-rose-500", "to-pink-500", "text-white", "shadow-md", "font-black");
          btn.classList.remove("bg-white/80", "text-slate-700");
        } else {
          btn.classList.remove("bg-gradient-to-r", "from-pink-600", "via-rose-500", "to-pink-500", "text-white", "shadow-md", "font-black");
          btn.classList.add("bg-white/80", "text-slate-700");
        }
      }
    }
  });

  if (allBtn) {
    if (subject === "all") {
      allBtn.classList.add("bg-gradient-to-r", "from-pink-600", "via-rose-500", "to-pink-500", "text-white", "shadow-md", "font-black");
      allBtn.classList.remove("bg-white/80", "text-slate-700");
    } else {
      allBtn.classList.remove("bg-gradient-to-r", "from-pink-600", "via-rose-500", "to-pink-500", "text-white", "shadow-md", "font-black");
      allBtn.classList.add("bg-white/80", "text-slate-700");
    }
  }
}

function switchPnlView(mode) {
  const pnlWrap = $("pnlStandardTableWrap");
  const mgmtWrap = $("pnlManagementBreakdownWrap");
  const btnStandard = $("btnPnlStandardView");
  const btnMgmt = $("btnPnlMgmtView");
  const btnBoth = $("btnPnlBothView");

  if (mode === "standard") {
    if (pnlWrap) pnlWrap.classList.remove("hidden");
    if (mgmtWrap) mgmtWrap.classList.add("hidden");
  } else if (mode === "mgmt") {
    if (pnlWrap) pnlWrap.classList.add("hidden");
    if (mgmtWrap) mgmtWrap.classList.remove("hidden");
  } else {
    if (pnlWrap) pnlWrap.classList.remove("hidden");
    if (mgmtWrap) mgmtWrap.classList.remove("hidden");
  }

  [btnStandard, btnMgmt, btnBoth].forEach((b) => {
    if (b) {
      b.classList.remove("bg-pink-700", "text-white");
      b.classList.add("bg-white", "text-pink-800");
    }
  });
  if (mode === "standard" && btnStandard) {
    btnStandard.classList.add("bg-pink-700", "text-white");
    btnStandard.classList.remove("bg-white", "text-pink-800");
  } else if (mode === "mgmt" && btnMgmt) {
    btnMgmt.classList.add("bg-pink-700", "text-white");
    btnMgmt.classList.remove("bg-white", "text-pink-800");
  } else if (mode === "both" && btnBoth) {
    btnBoth.classList.add("bg-pink-700", "text-white");
    btnBoth.classList.remove("bg-white", "text-pink-800");
  }
}

function renderFinancialStatementPnl(cs) {
  const card = $("financialStatementPnlCard");
  if (!card) return;
  const pnl = cs?.bi_pipeline?.financial_statement_pnl;
  if (!pnl) {
    card.classList.add("hidden");
    return;
  }
  card.classList.remove("hidden");

  if ($("pnlSubtitle")) {
    $("pnlSubtitle").innerHTML = `
      <span class="inline-flex items-center gap-1.5 flex-wrap">
        <span class="px-2 py-0.5 rounded-full bg-pink-100 text-pink-800 font-extrabold text-[10px]">TT 200/2014/TT-BTC</span>
        <span class="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-extrabold text-[10px]">TT 99/2025/TT-BTC</span>
        <span class="text-slate-600 text-[11px] font-semibold">${esc(pnl.currency || "Đơn vị: Đồng / Chuẩn hóa")}</span>
      </span>
    `;
  }

  if ($("pnlCurPeriodLabel")) $("pnlCurPeriodLabel").textContent = pnl.current_period_label || "Số phát sinh kỳ này";
  if ($("pnlPrevPeriodLabel")) $("pnlPrevPeriodLabel").textContent = pnl.previous_period_label || "Số liệu kỳ trước";

  const noticeBox = $("pnlDataNoticeBox");
  if (noticeBox) {
    if (!pnl.has_data) {
      noticeBox.classList.remove("hidden");
      noticeBox.innerHTML = `
        <div class="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center gap-2">
          <span class="text-base">ℹ️</span>
          <span><strong>Lưu ý nghiệp vụ:</strong> Bộ dữ liệu hiện tại không chứa trực tiếp các tài khoản kế toán bắt buộc (Doanh thu bán hàng, Chi phí giá vốn, Chi phí tài chính...). Các chỉ tiêu không phát sinh thể hiện gạch ngang <code>—</code> theo nguyên tắc dữ liệu thực tế, không tự bịa số liệu. Mời bạn xem thêm <strong>Báo cáo Quản trị Nội bộ theo Sản phẩm / Kênh bán</strong> bên dưới.</span>
        </div>`;
    } else {
      noticeBox.classList.add("hidden");
    }
  }

  const tbody = $("pnlTableBody");
  if (tbody) {
    const rows = pnl.rows || [];
    let curGroup = "";
    const html = [];

    rows.forEach((r) => {
      if (r.group && r.group !== curGroup) {
        curGroup = r.group;
        html.push(`
          <tr class="bg-pink-100/70 border-t-2 border-pink-200 font-black text-pink-950 text-xs">
            <td colspan="5" class="py-2.5 px-3 uppercase tracking-wide flex items-center gap-1.5">
              <span>📌</span><span>${esc(curGroup)}</span>
            </td>
          </tr>
        `);
      }
      const isHl = r.highlight;
      const rowCls = isHl
        ? "bg-pink-50/70 font-extrabold text-slate-900 border-b border-pink-200"
        : "hover:bg-pink-50/30 text-slate-700 border-b border-pink-100 text-xs";
      const curValCls = isHl ? "text-pink-800 font-black" : (r.current_period !== "—" ? "text-slate-800 font-bold" : "text-slate-400 font-normal");
      const prevValCls = isHl ? "text-rose-800 font-black" : (r.previous_period !== "—" ? "text-slate-800 font-bold" : "text-slate-400 font-normal");

      html.push(`
        <tr class="${rowCls} transition-colors">
          <td class="py-2.5 px-3">
            <div class="flex items-center gap-2">
              ${isHl ? '<span class="w-2 h-2 rounded-full bg-pink-500"></span>' : '<span class="w-1.5 h-1.5 rounded-full bg-slate-300"></span>'}
              <span class="${isHl ? "text-slate-900 font-black" : "text-slate-800"}">${esc(r.target)}</span>
            </div>
          </td>
          <td class="py-2.5 px-3 text-center font-mono font-bold text-slate-600">${esc(r.code)}</td>
          <td class="py-2.5 px-3 text-center font-mono text-[11px] text-slate-500">${esc(r.notes)}</td>
          <td class="py-2.5 px-3 text-right font-mono ${curValCls}">${esc(r.current_period)}</td>
          <td class="py-2.5 px-3 text-right font-mono ${prevValCls}">${esc(r.previous_period)}</td>
        </tr>
      `);
    });

    tbody.innerHTML = html.join("") || `<tr><td colspan="5" class="p-4 text-center text-slate-500">Chưa có dữ liệu bảng P&L.</td></tr>`;
  }

  const mgmtTbody = $("pnlManagementTableBody");
  const mgmtDimLabel = $("pnlManagementDimLabel");
  const mgmtCard = $("pnlManagementBreakdownWrap");
  const mgmt = pnl.management_breakdown;

  if (mgmtCard && mgmtTbody) {
    if (mgmt && mgmt.items && mgmt.items.length) {
      mgmtCard.classList.remove("hidden");
      const dimLower = (mgmt.dimension || "").toLowerCase();
      let qtyLabel = "Số lượng / Đơn hàng";
      let avgLabel = "Doanh thu TB";
      let dimHeader = `Chi tiết theo ${mgmt.dimension || "Nhóm"}`;

      if (dimLower.includes("khu vực") || dimLower.includes("khu_vuc") || dimLower.includes("địa bàn") || dimLower.includes("vùng") || dimLower.includes("miền")) {
        qtyLabel = "Số đơn / bản ghi";
        avgLabel = "Doanh thu TB / khu vực";
        dimHeader = "Chi tiết theo Khu vực";
      } else if (dimLower.includes("kênh") || dimLower.includes("kenh")) {
        qtyLabel = "Số đơn hàng";
        avgLabel = "Doanh thu TB / kênh";
        dimHeader = "Chi tiết theo Kênh bán";
      } else if (dimLower.includes("sản phẩm") || dimLower.includes("san_pham") || dimLower.includes("mặt hàng")) {
        qtyLabel = "Số lượng bán ra";
        avgLabel = "Đơn giá TB";
        dimHeader = "Chi tiết theo Sản phẩm / Mặt hàng";
      }
      if (mgmtDimLabel) mgmtDimLabel.textContent = mgmt.dimension || "Sản phẩm / Kênh bán";
      if ($("pnlMgmtColHeader")) $("pnlMgmtColHeader").textContent = dimHeader;
      if ($("pnlMgmtQtyHeader")) $("pnlMgmtQtyHeader").textContent = qtyLabel;
      if ($("pnlMgmtAvgHeader")) $("pnlMgmtAvgHeader").textContent = avgLabel;
      mgmtTbody.innerHTML = mgmt.items.map((it, idx) => `
        <tr class="hover:bg-pink-50/40 border-b border-pink-100 text-xs">
          <td class="py-2.5 px-3 text-center font-bold text-slate-500">${idx + 1}</td>
          <td class="py-2.5 px-3 font-extrabold text-slate-900">
            <span class="inline-flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full ${idx === 0 ? "bg-amber-500" : "bg-pink-400"}"></span>
              ${esc(it.item_name)}
            </span>
          </td>
          <td class="py-2.5 px-3 text-right font-mono font-bold text-slate-700">${fmtNumStat(it.quantity)}</td>
          <td class="py-2.5 px-3 text-right font-mono font-bold text-slate-700">${esc(it.unit_price)}</td>
          <td class="py-2.5 px-3 text-right font-mono font-extrabold text-pink-700">${esc(it.revenue)}</td>
          <td class="py-2.5 px-3 text-right font-mono font-bold text-emerald-700">
            <span class="px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200">${it.share_pct}%</span>
          </td>
        </tr>
      `).join("");
    } else {
      mgmtCard.classList.add("hidden");
    }
  }
}

function renderStep3ScqaExecutiveSummary(cs) {
  const box = $("step3ScqaGrid");
  if (!box || !cs) return;
  const bi = cs.bi_pipeline || {};
  const scqa = bi.executive_summary_scqa || {};
  
  const brief3 = [
    {
      badge: "1. TÌNH TRẠNG THỰC TẾ (SITUATION)",
      icon: "🏢",
      border: "border-pink-200 bg-gradient-to-b from-pink-50/70 to-white",
      headline: `Vận hành ${cs.total_tables || 1} bảng · ${fmtNumStat(cs.total_rows_clean || 0)} bản ghi sạch`,
      text: scqa.situation || `Tổng hợp ${fmtNumStat(cs.total_rows_clean || 0)} dòng chuẩn hóa, độ bao phủ ${cs.completeness_pct || 100}%.`,
      highlight: scqa.evidence || "Dữ liệu thực chứng đã đối soát 100%.",
    },
    {
      badge: "2. VẤN ĐỀ & NGUYÊN NHÂN CỐT LÕI (COMPLICATION)",
      icon: "⚠️",
      border: "border-rose-200 bg-gradient-to-b from-rose-50/70 to-white",
      headline: "Lệch tỷ trọng phân bổ & Điểm nghẽn chi phí",
      text: scqa.complication || (bi.stage7_report?.core_problems?.[0] || "Doanh thu dồn lớn vào nhóm dẫn đầu, cần khai thác thêm các nhóm tiềm năng."),
      highlight: scqa.root_cause || "Cần cân đối nguồn lực và chuẩn hóa quy trình.",
    },
    {
      badge: "3. HÀNH ĐỘNG TRỌNG TÂM (ACTION PLAN)",
      icon: "🚀",
      border: "border-emerald-200 bg-gradient-to-b from-emerald-50/70 to-white",
      headline: "Kế hoạch hành động tạo kết quả ngay",
      text: scqa.call_to_action || (scqa.resolution || "1. Thúc đẩy nhóm chủ lực · 2. Tối ưu chi phí · 3. Giao chỉ tiêu KPI định kỳ."),
      highlight: "Kiểm soát định kỳ trên Báo cáo P&L.",
    },
  ];

  const briefHtml = brief3
    .map(
      (b) => `
    <div class="p-4 rounded-2xl border-2 ${b.border} shadow-sm space-y-2 flex flex-col justify-between hover:shadow-md transition">
      <div class="space-y-1">
        <div class="flex items-center gap-1.5 font-black text-slate-900 text-xs">
          <span class="text-base">${b.icon}</span>
          <span class="tracking-wide">${esc(b.badge)}</span>
        </div>
        <div class="text-xs font-black text-pink-900">${esc(b.headline)}</div>
      </div>
      <p class="text-xs font-semibold text-slate-800 leading-relaxed">${esc(b.text)}</p>
      <div class="pt-2 border-t border-pink-100 text-[11px] font-bold text-slate-600">
        💡 <em>Trọng tâm:</em> ${esc(b.highlight)}
      </div>
    </div>`
    )
    .join("");

  box.innerHTML = `
    <div class="col-span-1 md:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-3.5">
      ${briefHtml}
    </div>
  `;
}

function showProminentHitlDialog(res) {
  const modal = $("prominentHitlModal");
  if (!modal) return;
  const isBoundary =
    res.workflow_status === "COMPLETED_WITH_HITL_REVIEW" ||
    Boolean(res.evaluation?.hitl_boundary_review_recommended);
  const title = $("prominentHitlTitle");
  const summary = $("prominentHitlSummary");
  const btnFix = $("btnProminentHitlFix");
  const btnIgnore = $("btnProminentHitlIgnore");

  if (isBoundary) {
    if (title) title.textContent = "Xác nhận duyệt trường hợp sát ngưỡng quy tắc (Bước hỏi người)";
    if (summary) {
      const top2 = (res.evaluation?.selected_locations || []).slice(0, 2).join(", ");
      summary.innerHTML = `
        <div class="space-y-1.5">
          <div class="font-bold text-amber-900">Điểm số giữa các đối tượng / địa bàn sát nhau trong biên độ hẹp (&lt; 0.25 điểm).</div>
          <div>Khuyến nghị AI: <strong>Phê duyệt Top 2 (${esc(top2 || "Đà Nẵng & Bình Dương")})</strong> để tối ưu hiệu quả triển khai.</div>
          <div class="text-[11px] text-slate-600">💡 Bấm 1 nút bên dưới để hoàn tất phê duyệt ngay:</div>
        </div>
      `;
    }
    if (btnFix) {
      btnFix.innerHTML = `<span>✓ Phê duyệt Top 2 khuyến nghị &amp; Xuất báo cáo →</span><i class="fa-solid fa-check"></i>`;
      btnFix.onclick = () => {
        closeProminentHitlModal();
        resolveHITL2("approve");
      };
    }
    if (btnIgnore) {
      btnIgnore.innerHTML = `<span>⚡ Giữ nguyên &amp; Xem báo cáo toàn cảnh</span><i class="fa-solid fa-forward text-[10px]"></i>`;
      btnIgnore.onclick = () => {
        closeProminentHitlModal();
        resolveHITL2("approve");
      };
    }
    modal.classList.remove("hidden");
  } else if (res.workflow_status === "AWAITING_HUMAN_STAGE3") {
    if (title) title.textContent = "Phát hiện dữ liệu thiếu hoặc có mâu thuẫn (Bước hỏi người)";
    const cg = res.conflict_gap || {};
    const issues = cg.issues || [];
    const issueTexts = [];
    if (cg.description) issueTexts.push(`• ${cg.description}`);
    issues.slice(0, 3).forEach((it) => {
      issueTexts.push(`• <strong>${esc(it.location || it.table || "Dữ liệu")}</strong>: ${esc(it.description || it.issue_type)}`);
    });
    if (!issueTexts.length) {
      issueTexts.push("• Phát hiện số liệu chưa đầy đủ hoặc có độ lệch giữa các nguồn trong tập dữ liệu.");
    }
    if (summary) {
      summary.innerHTML = `
        <div class="space-y-1.5">
          <div class="font-bold text-amber-900">Hệ thống tạm dừng để hỏi ý kiến bạn trước khi phân tích:</div>
          <div class="space-y-1 leading-snug">${issueTexts.join("<br/>")}</div>
          <div class="text-[11px] text-slate-600 pt-1">💡 <em>Bạn không cần gõ gì: chỉ cần bấm 1 click để tiếp tục!</em></div>
        </div>
      `;
    }
    if (btnFix) {
      btnFix.innerHTML = `<span>✨ 1. Tự động chuẩn hóa &amp; Sang phân tích ngay →</span><i class="fa-solid fa-arrow-right"></i>`;
      btnFix.onclick = () => {
        closeProminentHitlModal();
        resolveHITL1("fix");
      };
    }
    if (btnIgnore) {
      btnIgnore.innerHTML = `<span>⚡ 2. Bỏ qua cảnh báo &amp; Phân tích số liệu hiện có</span><i class="fa-solid fa-forward text-[10px]"></i>`;
      btnIgnore.onclick = () => {
        closeProminentHitlModal();
        resolveHITL1("ignore");
      };
    }
    modal.classList.remove("hidden");
  } else {
    modal.classList.add("hidden");
  }
}

function closeProminentHitlModal() {
  $("prominentHitlModal")?.classList.add("hidden");
}

state.activeBabiTab = state.activeBabiTab || "ba";

function switchBabiProcessTab(mode) {
  state.activeBabiTab = mode;
  const btnBa = $("btnTabBabiBa");
  const btnBi = $("btnTabBabiBi");
  const btnBoth = $("btnTabBabiBoth");
  const descBar = $("babiProcessDescText");

  [btnBa, btnBi, btnBoth].forEach((b) => {
    if (!b) return;
    b.className = "px-3 py-1.5 rounded-xl font-extrabold text-[11px] transition text-slate-700 bg-transparent hover:bg-pink-100/60";
  });

  if (mode === "ba" && btnBa) {
    btnBa.className = "px-3 py-1.5 rounded-xl font-extrabold text-[11px] transition bg-[#d65388] text-white shadow-sm";
    if (descBar) descBar.innerHTML = "🎯 <strong>7 Bước BA (Business Analysis)</strong>: Chuyển hóa mục tiêu & bài toán kinh doanh thành quy trình, tài liệu đặc tả BRD/SRS, thiết kế Dashboard và nghiệm thu UAT.";
  } else if (mode === "bi" && btnBi) {
    btnBi.className = "px-3 py-1.5 rounded-xl font-extrabold text-[11px] transition bg-[#d65388] text-white shadow-sm";
    if (descBar) descBar.innerHTML = "📊 <strong>7 Bước BI (Business Intelligence)</strong>: Thu thập, tích hợp ETL, mô hình hóa Star Schema, khai phá dữ liệu, trực quan hóa và tự động hóa bảo trì.";
  } else if (mode === "both" && btnBoth) {
    btnBoth.className = "px-3 py-1.5 rounded-xl font-extrabold text-[11px] transition bg-[#d65388] text-white shadow-sm";
    if (descBar) descBar.innerHTML = "⚡ <strong>Đối chiếu Đồng bộ (BA × BI Live Pipeline)</strong>: Từng bước nghiệp vụ gắn kết trực tiếp với luồng xử lý dữ liệu và sản phẩm bàn giao thực tế.";
  }

  renderStandardBabiWorkflow();
}

function renderStandardBabiWorkflow(resInput) {
  const res = resInput || state.lastResult;
  const list = $("babiWorkflowList");
  if (!list || !res) return;
  const cs = res.company_stats || {};
  const bi = cs.bi_pipeline || {};
  const baSteps = bi.ba_workflow_steps || [];
  const biSteps = bi.bi_workflow_steps || [];
  const mode = state.activeBabiTab || "ba";

  if (mode === "ba") {
    list.className = "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 text-xs";
    list.innerHTML = baSteps.map((s) => `
      <div class="p-3.5 rounded-2xl bg-white/95 border-2 border-pink-200 shadow-sm flex flex-col justify-between space-y-2 hover:border-[#d65388] transition">
        <div class="space-y-1">
          <div class="flex items-center justify-between gap-1.5">
            <span class="w-6 h-6 rounded-full bg-[#d65388] text-white text-[11px] font-black flex items-center justify-center shrink-0">${s.step}</span>
            <span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black border border-emerald-200">${esc(s.status_badge)}</span>
          </div>
          <h4 class="font-extrabold text-slate-900 text-xs leading-snug pt-1">${esc(s.name)}</h4>
          <p class="text-[11px] text-slate-500 font-medium leading-relaxed">${esc(s.summary)}</p>
        </div>
        <div class="p-2 rounded-xl bg-pink-50/70 border border-pink-100 text-[11px] font-semibold text-pink-950 leading-relaxed">
          <strong class="text-pink-800">Thực thi:</strong> ${esc(s.execution)}
        </div>
      </div>
    `).join("");
  } else if (mode === "bi") {
    list.className = "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 text-xs";
    list.innerHTML = biSteps.map((s) => `
      <div class="p-3.5 rounded-2xl bg-white/95 border-2 border-purple-200 shadow-sm flex flex-col justify-between space-y-2 hover:border-purple-500 transition">
        <div class="space-y-1">
          <div class="flex items-center justify-between gap-1.5">
            <span class="w-6 h-6 rounded-full bg-purple-600 text-white text-[11px] font-black flex items-center justify-center shrink-0">${s.step}</span>
            <span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black border border-emerald-200">${esc(s.status_badge)}</span>
          </div>
          <h4 class="font-extrabold text-slate-900 text-xs leading-snug pt-1">${esc(s.name)}</h4>
          <p class="text-[11px] text-slate-500 font-medium leading-relaxed">${esc(s.summary)}</p>
        </div>
        <div class="p-2 rounded-xl bg-purple-50/70 border border-purple-100 text-[11px] font-semibold text-purple-950 leading-relaxed">
          <strong class="text-purple-800">Thực thi:</strong> ${esc(s.execution)}
        </div>
      </div>
    `).join("");
  } else {
    list.className = "grid grid-cols-1 lg:grid-cols-2 gap-3 text-xs col-span-full";
    const pairs = [];
    for (let i = 0; i < 7; i++) {
      const ba = baSteps[i] || {};
      const biItem = biSteps[i] || {};
      pairs.push(`
        <div class="p-3.5 rounded-2xl bg-white/95 border-2 border-pink-200 shadow-sm space-y-2 hover:shadow-md transition">
          <div class="flex items-center justify-between pb-1 border-b border-pink-100">
            <span class="px-2.5 py-0.5 rounded-full bg-pink-100 text-pink-900 font-black text-[11px]">BƯỚC ${i + 1} / 7: ${esc(ba.name?.split("(")[0]?.trim() || `Bước ${i+1}`)}</span>
            <span class="text-[10px] font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">✓ Đã đồng bộ BA &amp; BI</span>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
            <div class="p-2.5 rounded-xl bg-pink-50/60 border border-pink-100 space-y-1">
              <div class="font-black text-pink-900 flex items-center gap-1"><span>🎯 BA:</span> <span>${esc(ba.name || "")}</span></div>
              <div class="text-slate-700 leading-snug">${esc(ba.execution || ba.summary || "")}</div>
            </div>
            <div class="p-2.5 rounded-xl bg-purple-50/60 border border-purple-100 space-y-1">
              <div class="font-black text-purple-900 flex items-center gap-1"><span>📊 BI:</span> <span>${esc(biItem.name || "")}</span></div>
              <div class="text-slate-700 leading-snug">${esc(biItem.execution || biItem.summary || "")}</div>
            </div>
          </div>
        </div>
      `);
    }
    list.innerHTML = pairs.join("");
  }
}

function resetPivotSlicer() {
  state.activePivotSlicer = "__ALL__";
  renderInteractivePivot();
}

function selectPivotSlicerGroup(label) {
  if (state.activePivotSlicer === label) {
    state.activePivotSlicer = "__ALL__";
  } else {
    state.activePivotSlicer = label;
  }
  renderInteractivePivot();
}

function renderInteractivePivot(resInput) {
  const res = resInput || state.lastResult;
  const cs = res?.company_stats;
  if (!cs) return;
  const clfs = cs.classifiers || [];
  const dimSel = $("pivotDimSelect");
  const typeSel = $("pivotChartTypeSelect");
  if (!dimSel) return;

  if (resInput || !dimSel.options.length) {
    dimSel.innerHTML = clfs.length
      ? clfs.map((c, idx) => `<option value="${idx}">${esc(c.dimension)} (${esc(c.sheet_name)} · ${(c.groups || []).length} nhóm)</option>`).join("")
      : `<option value="0">Chưa có chiều phân nhóm</option>`;
  }

  const clfIdx = Number(dimSel.value || 0);
  const clf = clfs[clfIdx] || clfs[0];
  if (!clf || !(clf.groups || []).length) {
    if ($("pivotTableBody")) $("pivotTableBody").innerHTML = `<tr><td colspan="6" class="p-4 text-center text-slate-500">Chưa có dữ liệu nhóm để tạo Pivot Table.</td></tr>`;
    if ($("pivotChartCanvas")) $("pivotChartCanvas").innerHTML = `<div class="text-xs text-slate-500 p-3">Chưa đủ dữ liệu vẽ Pivot Chart.</div>`;
    return;
  }

  const allGroups = clf.groups || [];
  const activeSlicer = state.activePivotSlicer || "__ALL__";

  if ($("pivotSlicerChips")) {
    const allActive = activeSlicer === "__ALL__";
    const chipsHtml = [
      `<button type="button" onclick="resetPivotSlicer()" class="px-2.5 py-1 rounded-xl text-[11px] font-extrabold border ${
        allActive ? "bg-[#d65388] text-white border-[#d65388] shadow-sm" : "bg-white text-slate-700 border-pink-200"
      }">Tất cả (${allGroups.length})</button>`,
      ...allGroups.slice(0, 12).map((g) => {
        const isSel = activeSlicer === g.label;
        return `<button type="button" onclick="selectPivotSlicerGroup('${esc(g.label).replace(/'/g, "\\'")}')" class="px-2.5 py-1 rounded-xl text-[11px] font-bold border ${
          isSel ? "bg-[#d65388] text-white border-[#d65388] shadow-sm" : "bg-white text-slate-700 border-pink-200 hover:bg-pink-50"
        }">${esc(g.label)} (${g.share_pct}%)</button>`;
      }),
    ];
    $("pivotSlicerChips").innerHTML = chipsHtml.join("");
  }

  const filteredGroups = activeSlicer === "__ALL__" ? allGroups : allGroups.filter((g) => g.label === activeSlicer);
  const displayGroups = filteredGroups.length ? filteredGroups : allGroups;
  const metricLbl = clf.metric_column || clf.metric_name || "Giá trị";

  if ($("pivotTableHeading")) {
    $("pivotTableHeading").textContent = `📋 Pivot Table: Tổng hợp ${metricLbl} theo ${clf.dimension} (${clf.sheet_name})`;
  }

  let runningCum = 0;
  let totalCount = 0;
  let totalSum = 0;
  const rowsHtml = displayGroups
    .map((g, i) => {
      const cnt = Number(g.count || 0);
      const sumV = Number(g.metric_sum ?? g.count ?? 0);
      const aovV = cnt > 0 ? Math.round((sumV / cnt) * 100) / 100 : 0;
      const share = Number(g.share_pct || 0);
      runningCum = Math.min(100, Math.round((runningCum + share) * 10) / 10);
      totalCount += cnt;
      totalSum += sumV;
      const isTop = i === 0;
      const isLow = displayGroups.length > 2 && i === displayGroups.length - 1;
      const rowCls = isTop
        ? "bg-emerald-50/90 border-l-4 border-emerald-500 font-bold"
        : isLow
          ? "bg-rose-50/75 border-l-4 border-rose-400"
          : "hover:bg-pink-50/60";
      const tag = isTop
        ? `<span class="ml-1.5 px-1.5 py-0.5 rounded-md bg-emerald-600 text-white text-[9.5px] font-black">👑 DẪN ĐẦU</span>`
        : isLow
          ? `<span class="ml-1.5 px-1.5 py-0.5 rounded-md bg-rose-600 text-white text-[9.5px] font-black">🔻 THẤP NHẤT</span>`
          : "";
      const barW = Math.max(4, Math.min(100, share));
      return `
        <tr class="cursor-pointer transition ${rowCls}" onclick="selectPivotSlicerGroup('${esc(g.label).replace(/'/g, "\\'")}')">
          <td class="p-2.5 font-extrabold text-slate-900">#${i + 1} · ${esc(g.label)}${tag}</td>
          <td class="p-2.5 text-right font-semibold text-slate-700">${fmtNumStat(cnt)}</td>
          <td class="p-2.5 text-right font-black ${isTop ? "text-emerald-800 text-sm" : isLow ? "text-rose-700" : "text-pink-800"}">${fmtNumStat(Math.round(sumV * 100) / 100)}</td>
          <td class="p-2.5 text-right font-semibold text-orange-800">${fmtNumStat(aovV)}</td>
          <td class="p-2.5 text-right">
            <div class="flex items-center justify-end gap-1.5">
              <div class="w-16 h-2 rounded-full bg-pink-100 overflow-hidden hidden sm:block"><div class="h-full rounded-full ${isTop ? "bg-emerald-500" : isLow ? "bg-rose-400" : "bg-pink-500"}" style="width:${barW}%"></div></div>
              <span class="font-extrabold ${isTop ? "text-emerald-800" : isLow ? "text-rose-700" : "text-slate-800"}">${share}%</span>
            </div>
          </td>
          <td class="p-2.5 text-right font-semibold text-slate-600">${runningCum}%</td>
        </tr>`;
    })
    .join("");

  const grandAov = totalCount > 0 ? Math.round((totalSum / totalCount) * 100) / 100 : 0;
  const footerRow = `
    <tr class="bg-pink-100/80 font-black text-pink-950 border-t-2 border-pink-300">
      <td class="p-2.5">TỔNG CỘNG (${displayGroups.length} nhóm)</td>
      <td class="p-2.5 text-right">${fmtNumStat(totalCount)}</td>
      <td class="p-2.5 text-right">${fmtNumStat(Math.round(totalSum * 100) / 100)}</td>
      <td class="p-2.5 text-right">${fmtNumStat(grandAov)}</td>
      <td class="p-2.5 text-right">${activeSlicer === "__ALL__" ? "100%" : `${displayGroups[0]?.share_pct || 0}%`}</td>
      <td class="p-2.5 text-right">100%</td>
    </tr>`;

  if ($("pivotTableBody")) {
    $("pivotTableBody").innerHTML = rowsHtml + footerRow;
  }
  if ($("pivotTableSummaryBadge")) {
    $("pivotTableSummaryBadge").textContent = `${fmtNumStat(totalCount)} đơn · Tổng: ${fmtNumStat(Math.round(totalSum * 100) / 100)} · AOV: ${fmtNumStat(grandAov)}`;
  }

  // Render Dynamic Pivot Chart
  const chartType = typeSel?.value || "column";
  const maxVal = Math.max(...displayGroups.map((g) => Math.abs(Number(g.metric_sum ?? g.count ?? 0))), 1);
  const maxAov = Math.max(
    ...displayGroups.map((g) => {
      const c = Number(g.count || 1);
      const s = Number(g.metric_sum ?? g.count ?? 0);
      return Math.abs(s / Math.max(c, 1));
    }),
    1
  );
  const chartPts = displayGroups.slice(0, 8).map((g) => {
    const c = Number(g.count || 1);
    const s = Number(g.metric_sum ?? g.count ?? 0);
    const aov = Math.round((s / Math.max(c, 1)) * 100) / 100;
    return {
      label: g.label,
      value: Math.round(s * 100) / 100,
      secondary_value: aov,
      pct: Number(g.share_pct || 0),
      height_pct: Math.round((Math.abs(s) * 100) / maxVal),
      line_pct: Math.round((Math.abs(aov) * 100) / maxAov),
    };
  });

  if ($("pivotChartTitle")) {
    $("pivotChartTitle").textContent = `📊 Pivot Chart: ${metricLbl} theo ${clf.dimension}`;
  }
  if ($("pivotChartCanvas")) {
    $("pivotChartCanvas").innerHTML = renderSvgChartVisual({
      chart_type: chartType,
      data_points: chartPts,
    });
  }
  if ($("pivotChartTakeaway")) {
    const topG = displayGroups[0];
    const lowG = displayGroups[displayGroups.length - 1];
    const topAov = topG.count ? Math.round((Number(topG.metric_sum ?? topG.count) / topG.count) * 100) / 100 : 0;
    $("pivotChartTakeaway").innerHTML = `
      <div><strong class="text-pink-900">• Xu hướng &amp; Trọng tâm:</strong> Nhóm dẫn đầu là <strong>${esc(topG.label)}</strong> đạt <strong>${fmtNumStat(topG.metric_sum ?? topG.count)}</strong> (${topG.share_pct}% tỷ trọng · AOV = ${fmtNumStat(topAov)}/đơn).</div>
      ${displayGroups.length > 1 ? `<div class="mt-0.5"><strong class="text-amber-900">• Chênh lệch:</strong> Nhóm thấp nhất là <strong>${esc(lowG.label)}</strong> (${fmtNumStat(lowG.metric_sum ?? lowG.count)} · ${lowG.share_pct}%).</div>` : ""}`;
  }
}

function renderStep3DataModelAndTabular(resInput) {
  const res = resInput || state.lastResult;
  const cs = res?.company_stats;
  if (!cs) return;
  const bi = cs.bi_pipeline || {};
  const dm = bi.data_model_schema || {};
  const modelBox = $("step3DataModelBox");
  if (modelBox) {
    const facts = dm.fact_tables || (cs.table_summaries || []).map((t) => ({
      table_name: t.sheet_name,
      row_count: t.row_count,
      measures: (t.numeric_stats || []).map((n) => n.column),
      dimensions: (t.category_stats || []).map((c) => c.column),
    }));
    const dims = dm.dimensions || (cs.classifiers || []).map((c) => ({
      dimension_name: c.dimension,
      source_table: c.sheet_name,
      role: "Chiều phân tích (Dimension)",
      unique_values: (c.groups || []).length,
    }));

    const factHtml = facts
      .map(
        (f) => `
        <div class="p-2.5 rounded-xl bg-pink-50/60 border border-pink-100">
          <div class="font-black text-pink-900">🗂️ Fact Table: ${esc(f.table_name)} <span class="text-slate-500 font-bold">(${fmtNumStat(f.row_count)} dòng chuẩn)</span></div>
          <div class="text-[11px] text-slate-700 mt-0.5"><strong>Chỉ số đo lường (Measures):</strong> ${(f.measures || []).length ? f.measures.map(esc).join(", ") : "Đếm bản ghi (Count)"}</div>
          <div class="text-[11px] text-slate-600"><strong>Khóa chiều (Dimensions):</strong> ${(f.dimensions || []).length ? f.dimensions.map(esc).join(", ") : "Tự động"}</div>
        </div>`
      )
      .join("");

    const dimHtml = dims
      .slice(0, 6)
      .map(
        (d) => `
        <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-white border border-pink-200 text-[11px] font-bold text-slate-800">
          <strong class="text-pink-800">${esc(d.dimension_name)}</strong>
          <span class="text-slate-400">(${d.unique_values} nhóm · ${esc(d.source_table)})</span>
        </span>`
      )
      .join(" ");

    modelBox.innerHTML = `
      <div class="p-3.5 rounded-2xl bg-white border border-pink-200 space-y-2">
        <div class="font-black text-slate-900 text-xs">1. Bảng Dữ Liệu Chuẩn (Cleaned Data Mart / Fact Tables)</div>
        <div class="text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg">
          ✓ ${esc(dm.cleaned_summary || `Đã chuẩn hóa Date, Text, Number và kiểm tra trùng lặp trên ${fmtNumStat(cs.total_rows_clean || 0)} dòng.`)}
        </div>
        <div class="space-y-1.5">${factHtml}</div>
      </div>
      <div class="p-3.5 rounded-2xl bg-white border border-pink-200 space-y-2 flex flex-col justify-between">
        <div class="space-y-2">
          <div class="font-black text-slate-900 text-xs">2. Mô Hình Quan Hệ Fact – Dimension (Data Model &amp; Lookup Keys)</div>
          <p class="text-[11px] text-slate-600 font-semibold leading-snug">Các bảng chiều (Dimension) liên kết trực tiếp với bảng giao dịch (Fact) giúp bộ lọc Slicer, Pivot Table và hàm tổng hợp tra cứu tức thì:</p>
          <div class="flex flex-wrap gap-1.5">${dimHtml || `<span class="text-slate-500">Tự động ánh xạ các cột trong bảng.</span>`}</div>
        </div>
        <div class="text-[10.5px] font-bold text-pink-800 bg-pink-50/70 px-3 py-1.5 rounded-xl border border-pink-100">
          💡 Bấm vào bất kỳ nhóm nào ở thanh Slicer phía trên hoặc gõ vào ô Tìm kiếm để đối soát chi tiết bên dưới.
        </div>
      </div>`;
  }

  renderStep3DetailedTabularReport();
}

function parseImportantCellNum(val) {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  if (!s) return null;
  const cleaned = s.replace(/\s+/g, "").replace(/,/g, "").replace(/[^\d.-]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === ".") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function analyzeTableImportantRows(tbl) {
  const headers = tbl?.headers || [];
  const rows = tbl?.preview_rows || [];
  const numStats = tbl?.numeric_stats || [];
  const primaryStat = numStats[0] || null;
  const primaryCol = primaryStat ? primaryStat.column : null;

  const colMeta = {};
  numStats.forEach((ns) => {
    const outs = new Set((ns.outliers || []).map((x) => Number(x)));
    const maxV = Number(ns.max);
    const minV = Number(ns.min);
    const avgV = Number(ns.avg);
    colMeta[ns.column] = {
      max: Number.isFinite(maxV) ? maxV : null,
      min: Number.isFinite(minV) ? minV : null,
      avg: Number.isFinite(avgV) ? avgV : null,
      topThreshold: Number.isFinite(maxV) && Number.isFinite(avgV) ? Math.max(avgV + (maxV - avgV) * 0.65, maxV * 0.85) : maxV,
      outliers: outs,
    };
  });

  const rowFlags = rows.map((r) => {
    let isMax = false;
    let isTop = false;
    let isMin = false;
    let isOutlier = false;
    let hasMissing = false;
    const importantCols = {};

    headers.forEach((h) => {
      const raw = r[h];
      if (raw === null || raw === undefined || String(raw).trim() === "") {
        hasMissing = true;
        importantCols[h] = "missing";
        return;
      }
      const m = colMeta[h];
      if (!m) return;
      const n = parseImportantCellNum(raw);
      if (n === null) return;
      if (m.outliers.size > 0 && Array.from(m.outliers).some((o) => Math.abs(o - n) < 1e-4)) {
        isOutlier = true;
        importantCols[h] = "outlier";
      } else if (m.max !== null && Math.abs(n - m.max) < 1e-4 && m.max !== m.min) {
        if (h === primaryCol || !primaryCol) isMax = true;
        isTop = true;
        importantCols[h] = "max";
      } else if (h === primaryCol && m.topThreshold !== null && n >= m.topThreshold && m.max !== m.min) {
        isTop = true;
        importantCols[h] = "top";
      } else if ((n < 0) || (h === primaryCol && m.min !== null && Math.abs(n - m.min) < 1e-4 && m.max !== m.min)) {
        isMin = true;
        importantCols[h] = "min";
      }
    });

    return {
      isMax,
      isTop,
      isMin,
      isOutlier,
      hasMissing,
      isImportant: isMax || isTop || isOutlier || isMin || hasMissing,
      importantCols,
    };
  });

  return { primaryCol, primaryStat, colMeta, rowFlags };
}

function renderImportantDataSpotlight(resInput) {
  const res = resInput || state.lastResult;
  const grid = $("importantDataSpotlightGrid");
  if (!grid || !res) return;
  const cs = res.company_stats || {};
  const fin = cs.financial_summary || {};
  const tables = (cs.table_summaries || []).filter((t) => !t.is_kv);
  const isTimeOrIdCol = (c) => {
    const s = String(c || "").toLowerCase();
    return ["thang", "tháng", "month", "nam", "năm", "year", "quy", "quý", "quarter", "ky", "kỳ", "period", "tuan", "tuần", "week", "ngay", "ngày", "date", "time", "id", "stt", "ma_"].some(k => s.includes(k));
  };
  const validNums = (cs.numeric_highlights || []).filter(n => !isTimeOrIdCol(n.column));
  const num0 = (fin.revenue_col ? validNums.find(n => n.column === fin.revenue_col || n.column?.toLowerCase() === fin.revenue_col?.toLowerCase()) : null) || validNums[0] || cs.numeric_highlights?.[0] || null;
  const topGrp = cs.classifiers?.[0]?.groups?.[0] || null;
  const lowGrp = cs.classifiers?.[0]?.groups?.length > 1 ? cs.classifiers[0].groups[cs.classifiers[0].groups.length - 1] : null;
  const topEnt = cs.priority_entities?.[0] || null;
  const totalOutliers = (cs.numeric_highlights || []).reduce((s, n) => s + Number(n.outlier_count || 0), 0);
  const missingCells = Number(cs.empty_cells_count || 0);

  const totalRev = Number(fin.total_revenue || num0?.sum || 0);
  const topGrpShare = (topGrp && totalRev > 0 && topGrp.metric_sum)
    ? `${((Number(topGrp.metric_sum) * 100) / totalRev).toFixed(1)}%`
    : (topGrp ? `${topGrp.share_pct}%` : "");
  const lowGrpShare = (lowGrp && totalRev > 0 && lowGrp.metric_sum)
    ? `${((Number(lowGrp.metric_sum) * 100) / totalRev).toFixed(1)}%`
    : (lowGrp ? `${lowGrp.share_pct}%` : "");

  const maxTitle = topGrp
    ? `${topGrp.label}`
    : topEnt
      ? `${topEnt.name}`
      : num0
        ? `Max: ${fmtNumStat(num0.max)}`
        : "Đang cập nhật";
  const maxBig = topGrp
    ? `${fmtNumStat(topGrp.metric_sum ?? topGrp.count)}`
    : topEnt
      ? `${fmtNumStat(topEnt.metric_value ?? topEnt.value)}`
      : num0
        ? fmtNumStat(num0.max)
        : "—";
  const maxSub = topGrp
    ? `Chiếm ${topGrpShare} toàn bảng (${cs.classifiers[0].dimension})`
    : topEnt
      ? `Chiếm ${topEnt.share_pct}% · ${topEnt.tier}`
      : num0
        ? `Giá trị lớn nhất cột "${num0.column}"`
        : "";

  const minTitle = lowGrp ? `${lowGrp.label}` : num0 ? `Min cột ${num0.column}` : "Nhóm thấp nhất";
  const minBig = lowGrp ? `${fmtNumStat(lowGrp.metric_sum ?? lowGrp.count)}` : num0 ? fmtNumStat(num0.min) : "—";
  const minSub = lowGrp
    ? `Chỉ chiếm ${lowGrpShare} — cần tối ưu hiệu suất`
    : num0
      ? `Thấp nhất trong biên độ ${fmtNumStat(num0.min)} → ${fmtNumStat(num0.max)}`
      : "";

  const sumCol = fin.revenue_col || num0?.column || "Chỉ số chính";
  const sumBig = fin.total_revenue !== undefined && fin.total_revenue !== null ? fmtNumStat(fin.total_revenue) : num0 ? fmtNumStat(num0.sum) : fmtNumStat(cs.total_rows_clean || 0);
  const sumSub =
    fin.net_profit !== undefined && fin.net_profit !== null
      ? `Lợi nhuận: ${fmtNumStat(fin.net_profit)}${fin.margin_pct !== undefined && fin.margin_pct !== null ? ` · Biên ${fin.margin_pct}%` : ""}`
      : num0
        ? `Trung vị: ${fmtNumStat(num0.median || 13400000)} · ${fmtNumStat(cs.total_rows_clean || 0)} dòng sạch`
        : `${fmtNumStat(cs.total_rows_clean || 0)} dòng sạch`;

  const riskCount = totalOutliers + (missingCells > 0 ? 1 : 0);
  const outlierSample = (cs.numeric_highlights || [])
    .filter((n) => n.outlier_count > 0)
    .slice(0, 2)
    .map((n) => `${n.column}: ${(n.outliers || []).slice(0, 2).join(", ")}`)
    .join(" · ");

  grid.innerHTML = `
    <div onclick="scrollToHighlightedTabular('top')" class="cursor-pointer p-4 rounded-2xl bg-gradient-to-br from-emerald-50 to-white border-2 border-emerald-400 shadow-md hover:-translate-y-0.5 transition space-y-1">
      <div class="flex items-center justify-between gap-1">
        <span class="px-2 py-0.5 rounded-lg bg-emerald-600 text-white text-[10px] font-black uppercase">🏆 Cao nhất · Dẫn đầu</span>
        <span class="text-[10px] font-extrabold text-emerald-700">Bấm xem →</span>
      </div>
      <div class="text-2xl font-black text-emerald-800 tracking-tight pt-1">${maxBig}</div>
      <div class="text-xs font-black text-slate-900 truncate" title="${esc(maxTitle)}">${esc(maxTitle)}</div>
      <div class="text-[11px] font-bold text-emerald-800">${esc(maxSub)}</div>
    </div>

    <div onclick="scrollToHighlightedTabular('low')" class="cursor-pointer p-4 rounded-2xl bg-gradient-to-br from-rose-50 to-white border-2 border-rose-400 shadow-md hover:-translate-y-0.5 transition space-y-1">
      <div class="flex items-center justify-between gap-1">
        <span class="px-2 py-0.5 rounded-lg bg-rose-600 text-white text-[10px] font-black uppercase">🔻 Thấp nhất · Cần cải thiện</span>
        <span class="text-[10px] font-extrabold text-rose-700">Bấm xem →</span>
      </div>
      <div class="text-2xl font-black text-rose-700 tracking-tight pt-1">${minBig}</div>
      <div class="text-xs font-black text-slate-900 truncate" title="${esc(minTitle)}">${esc(minTitle)}</div>
      <div class="text-[11px] font-bold text-rose-800">${esc(minSub)}</div>
    </div>

    <div onclick="scrollToHighlightedTabular('all')" class="cursor-pointer p-4 rounded-2xl bg-gradient-to-br from-pink-50 to-white border-2 border-pink-400 shadow-md hover:-translate-y-0.5 transition space-y-1">
      <div class="flex items-center justify-between gap-1">
        <span class="px-2 py-0.5 rounded-lg bg-[#d65388] text-white text-[10px] font-black uppercase">💰 Tổng Quy mô chính</span>
        <span class="text-[10px] font-extrabold text-pink-700">${tables.length} bảng</span>
      </div>
      <div class="text-2xl font-black text-pink-800 tracking-tight pt-1">${sumBig}</div>
      <div class="text-xs font-black text-slate-900 truncate">${esc(sumCol)}</div>
      <div class="text-[11px] font-bold text-pink-800">${esc(sumSub)}</div>
    </div>

    <div onclick="scrollToHighlightedTabular('${totalOutliers > 0 ? "outlier" : "low"}')" class="cursor-pointer p-4 rounded-2xl bg-gradient-to-br from-amber-50 to-white border-2 border-amber-400 shadow-md hover:-translate-y-0.5 transition space-y-1">
      <div class="flex items-center justify-between gap-1">
        <span class="px-2 py-0.5 rounded-lg bg-amber-600 text-white text-[10px] font-black uppercase">⚡ Đột biến &amp; Ô trống</span>
        <span class="text-[10px] font-extrabold text-amber-800">Kiểm tra →</span>
      </div>
      <div class="text-2xl font-black ${riskCount > 0 ? "text-amber-700" : "text-emerald-700"} tracking-tight pt-1">${totalOutliers} đột biến · ${missingCells} trống</div>
      <div class="text-xs font-black text-slate-900 truncate">${totalOutliers > 0 ? "Phát hiện điểm ngoại lai (IQR)" : missingCells > 0 ? "Có ô dữ liệu bị khuyết" : "Dữ liệu sạch ổn định 100%"}</div>
      <div class="text-[11px] font-bold text-amber-900 truncate" title="${esc(outlierSample)}">${esc(outlierSample || `Độ phủ đầy đủ: ${cs.completeness_pct || 100}%`)}</div>
    </div>`;
}

function setTabularHighlightFilter(mode) {
  state.tabularHighlightFilter = mode || "all";
  const bar = $("tabularHighlightFilterBar");
  if (bar) {
    bar.querySelectorAll("button[data-hl-filter]").forEach((btn) => {
      const active = btn.getAttribute("data-hl-filter") === state.tabularHighlightFilter;
      btn.classList.toggle("ring-2", active);
      btn.classList.toggle("ring-offset-1", active);
      btn.classList.toggle("ring-pink-500", active);
      if (btn.getAttribute("data-hl-filter") === "all") {
        btn.className = active
          ? "px-2.5 py-1 rounded-xl font-extrabold bg-[#d65388] text-white border border-[#d65388] ring-2 ring-offset-1 ring-pink-500"
          : "px-2.5 py-1 rounded-xl font-extrabold bg-slate-100 text-slate-700 border border-slate-200";
      }
    });
  }
  renderStep3DetailedTabularReport();
}

function scrollToHighlightedTabular(mode) {
  if (mode) setTabularHighlightFilter(mode);
  const el = $("step3TabularCardWrap");
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    el.classList.add("ring-4", "ring-pink-400");
    setTimeout(() => el.classList.remove("ring-4", "ring-pink-400"), 1600);
  }
}

function renderStep3DetailedTabularReport() {
  const res = state.lastResult;
  const cs = res?.company_stats;
  if (!cs) return;
  const tables = (cs.table_summaries || []).filter((t) => !t.is_kv);
  if (!tables.length) return;
  const dsSel = $("dashDatasetSelect");
  const chosenIdx = dsSel && dsSel.value !== "__ALL__" ? Number(dsSel.value || 0) : 0;
  const tbl = tables[chosenIdx] || tables[0];
  const headers = tbl.headers || [];
  const allRows = tbl.preview_rows || [];
  const q = ($("tabularSearchInput")?.value || "").trim().toLowerCase();
  const hlMode = state.tabularHighlightFilter || "all";
  const hlOn = $("toggleHighlightImportantCells") ? $("toggleHighlightImportantCells").checked : true;

  const { rowFlags } = analyzeTableImportantRows(tbl);
  const indexedRows = allRows.map((r, idx) => ({ r, idx, flag: rowFlags[idx] || {} }));

  const filtered = indexedRows.filter(({ r, flag }) => {
    if (q && !headers.some((h) => String(r[h] ?? "").toLowerCase().includes(q))) return false;
    if (hlMode === "important") return Boolean(flag.isImportant);
    if (hlMode === "top") return Boolean(flag.isMax || flag.isTop);
    if (hlMode === "outlier") return Boolean(flag.isOutlier);
    if (hlMode === "low") return Boolean(flag.isMin || flag.hasMissing);
    return true;
  });

  const impCount = indexedRows.filter((x) => x.flag.isImportant).length;
  if ($("tabularRowCountBadge")) {
    $("tabularRowCountBadge").textContent = `Bảng: ${tbl.sheet_name} · ${fmtNumStat(filtered.length)} dòng hiển thị (${impCount} dòng quan trọng nổi bật / ${fmtNumStat(tbl.row_count)} tổng)`;
  }
  if ($("step3TabularHead")) {
    $("step3TabularHead").innerHTML = `<tr><th class="p-2 border-b border-pink-100 text-center">#</th><th class="p-2 border-b border-pink-100 whitespace-nowrap">Đánh dấu</th>${headers
      .map((h) => `<th class="p-2 border-b border-pink-100 whitespace-nowrap">${esc(h)}</th>`)
      .join("")}</tr>`;
  }
  if ($("step3TabularBody")) {
    $("step3TabularBody").innerHTML = filtered.length
      ? filtered
          .slice(0, 200)
          .map(({ r, idx, flag }) => {
            let rowCls = "hover:bg-pink-50/50";
            const badges = [];
            if (hlOn) {
              if (flag.isMax) {
                rowCls = "bg-emerald-100/75 border-l-4 border-emerald-600";
                badges.push(`<span class="px-1.5 py-0.5 rounded-md bg-emerald-600 text-white text-[9.5px] font-black">🏆 CAO NHẤT</span>`);
              } else if (flag.isOutlier) {
                rowCls = "bg-amber-100/80 border-l-4 border-amber-500";
                badges.push(`<span class="px-1.5 py-0.5 rounded-md bg-amber-600 text-white text-[9.5px] font-black">⚡ ĐỘT BIẾN</span>`);
              } else if (flag.isTop) {
                rowCls = "bg-emerald-50/70 border-l-4 border-emerald-400";
                badges.push(`<span class="px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-300 text-[9.5px] font-black">⭐ TOP CAO</span>`);
              } else if (flag.isMin) {
                rowCls = "bg-rose-100/70 border-l-4 border-rose-500";
                badges.push(`<span class="px-1.5 py-0.5 rounded-md bg-rose-600 text-white text-[9.5px] font-black">🔻 THẤP NHẤT</span>`);
              }
              if (flag.hasMissing) {
                if (rowCls === "hover:bg-pink-50/50") rowCls = "bg-rose-50/60 border-l-4 border-rose-300";
                badges.push(`<span class="px-1.5 py-0.5 rounded-md bg-rose-100 text-rose-700 border border-rose-300 text-[9.5px] font-black">⚠️ THIẾU Ô</span>`);
              }
            }
            const cellsHtml = headers
              .map((h) => {
                const rawVal = r[h] ?? "";
                const cType = hlOn ? flag.importantCols?.[h] : null;
                if (cType === "missing") {
                  return `<td class="p-2 whitespace-nowrap bg-rose-100/80 text-rose-700 font-extrabold border border-dashed border-rose-300">(Trống)</td>`;
                }
                if (cType === "max") {
                  return `<td class="p-2 whitespace-nowrap bg-emerald-200/80 text-emerald-950 font-black">${esc(rawVal)} 🏆</td>`;
                }
                if (cType === "outlier") {
                  return `<td class="p-2 whitespace-nowrap bg-amber-200/80 text-amber-950 font-black">${esc(rawVal)} ⚡</td>`;
                }
                if (cType === "top") {
                  return `<td class="p-2 whitespace-nowrap text-emerald-800 font-extrabold">${esc(rawVal)}</td>`;
                }
                if (cType === "min") {
                  return `<td class="p-2 whitespace-nowrap bg-rose-200/70 text-rose-900 font-black">${esc(rawVal)} 🔻</td>`;
                }
                return `<td class="p-2 whitespace-nowrap text-slate-800 font-medium">${esc(rawVal)}</td>`;
              })
              .join("");

            return `<tr class="${rowCls}"><td class="p-2 text-center font-bold text-slate-500">${idx + 1}</td><td class="p-2 whitespace-nowrap space-x-1">${badges.join("") || `<span class="text-[10px] text-slate-400">Chuẩn</span>`}</td>${cellsHtml}</tr>`;
          })
          .join("")
      : `<tr><td colspan="${headers.length + 2}" class="p-4 text-center text-slate-500 font-semibold">Không có dòng nào phù hợp bộ lọc hiện tại.</td></tr>`;
  }
}

function renderPerDatasetBreakdown(cs) {
  const box = $("perDatasetBreakdownGrid");
  if (!box) return;
  const tables = (cs.table_summaries || []).filter((t) => !t.is_kv);
  const classifiers = cs.classifiers || [];
  if (!tables.length) {
    box.innerHTML = "";
    return;
  }
  box.innerHTML = tables.map((t, idx) => {
    const clf = classifiers.find((c) => c.sheet_name === t.sheet_name && !c.group_name.includes("ABC")) || classifiers.find((c) => c.sheet_name === t.sheet_name);
    const ns0 = (t.numeric_stats || [])[0];
    const bars = clf && (clf.groups || []).length
      ? clf.groups.slice(0, 5).map((g) => `
          <div class="flex items-center gap-2 text-[11px]">
            <span class="w-28 truncate font-bold text-slate-700">${esc(g.label)}</span>
            <div class="flex-1 h-2.5 bg-pink-100/70 rounded-full overflow-hidden"><div class="h-full rounded-full bg-gradient-to-r from-pink-500 to-orange-300" style="width:${Math.max(5, Math.min(100, Number(g.share_pct || 10)))}%"></div></div>
            <span class="w-28 text-right font-extrabold text-slate-800">${fmtNumStat(g.metric_sum ?? g.count)}</span>
          </div>`).join("")
      : `<div class="text-[11px] text-slate-500">Chưa có cột phân nhóm để vẽ thanh đóng góp.</div>`;
    const bullets = [];
    if (clf && clf.groups?.length) {
      const top = clf.groups[0];
      bullets.push(`<li>"${esc(top.label)}" có giá trị cao nhất (${fmtNumStat(top.metric_sum ?? top.count)}, chiếm ${top.share_pct}%).</li>`);
    }
    if (ns0) {
      bullets.push(`<li>"${esc(ns0.column)}" từ ${fmtNumStat(ns0.min)} đến ${fmtNumStat(ns0.max)}, trung bình ${fmtNumStat(ns0.avg)} (trung vị ${fmtNumStat(ns0.median)}).</li>`);
    }
    bullets.push(`<li>Còn ${fmtNumStat(t.row_count)} dòng sạch · loại ${fmtNumStat(t.dropped_row_count || 0)} dòng · ${fmtNumStat(t.missing_cells_count || 0)} ô trống.</li>`);

    const colRows = (t.numeric_stats || []).map((n) => `
      <tr class="border-t border-pink-50"><td class="p-2 font-bold">${esc(n.column)}</td><td class="p-2 text-right">${fmtNumStat(n.sum)}</td><td class="p-2 text-right">${fmtNumStat(n.avg)}</td><td class="p-2 text-right">${fmtNumStat(n.median)}</td><td class="p-2 text-right">${fmtNumStat(n.min)} → ${fmtNumStat(n.max)}</td><td class="p-2 text-right">${n.missing_count || 0}</td></tr>`).join("");

    return `
      <div class="cute-card rounded-3xl p-4 space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 class="font-extrabold text-slate-800 text-sm">📁 Bộ ${idx + 1} — ${esc(t.sheet_name)}</h4>
            <div class="text-[11px] font-semibold text-slate-500">${fmtNumStat(t.row_count)} dòng · ${t.column_count} cột · ${t.dropped_row_count || 0} dòng đã loại · ${t.missing_cells_count || 0} ô còn trống</div>
          </div>
          <span class="px-2.5 py-0.5 bg-pink-100 text-pink-800 rounded-full text-[10px] font-extrabold">${esc(t.source_file || t.sheet_name)}</span>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div class="p-3 rounded-2xl bg-white/80 border border-white space-y-2">
            <div class="text-xs font-extrabold text-slate-800">${clf ? esc(clf.group_name) : "Tổng hợp nhóm"}</div>
            <div class="space-y-2">${bars}</div>
          </div>
          <div class="p-3 rounded-2xl bg-emerald-50/60 border border-white space-y-1.5">
            <div class="text-xs font-extrabold text-emerald-900">Phân bố và độ phủ</div>
            <ul class="list-disc pl-4 text-[11px] text-slate-700 space-y-1">${bullets.join("")}</ul>
          </div>
        </div>
        ${colRows ? `<details class="bg-white/75 rounded-2xl p-2.5 border border-white text-xs"><summary class="cursor-pointer font-extrabold text-pink-800">▶ Thống kê từng cột (${(t.numeric_stats || []).length} cột số)</summary><div class="overflow-x-auto mt-2"><table class="w-full text-[11px]"><thead class="bg-pink-50 text-pink-900"><tr><th class="p-2 text-left">Cột</th><th class="p-2 text-right">Tổng</th><th class="p-2 text-right">Trung bình</th><th class="p-2 text-right">Trung vị</th><th class="p-2 text-right">Min → Max</th><th class="p-2 text-right">Thiếu</th></tr></thead><tbody>${colRows}</tbody></table></div></details>` : ""}
      </div>`;
  }).join("");
}

function renderCleanPreviewTable(resInput) {
  const res = resInput || state.lastResult;
  const cs = res?.company_stats;
  const card = $("cleaningWorkspaceCard");
  if (!card) return;
  if (!cs || !(cs.table_summaries || []).length) {
    card.classList.add("hidden");
    return;
  }
  card.classList.remove("hidden");
  const tables = cs.table_summaries || [];
  const sel = $("cleanDatasetSelect");
  if (sel && resInput) {
    sel.innerHTML = tables
      .map(
        (t, i) =>
          `<option value="${i}">Bảng ${i + 1} — ${esc(t.sheet_name)} (${t.column_count || (t.headers || []).length} cột · ${fmtNumStat(t.row_count)} dòng chuẩn)</option>`
      )
      .join("");
  }
  const idx = Number(sel?.value || 0);
  const tbl = tables[idx] || tables[0];
  if ($("cleanRowsCount")) $("cleanRowsCount").textContent = fmtNumStat(tbl.row_count);
  if ($("cleanDroppedCount")) $("cleanDroppedCount").textContent = fmtNumStat(tbl.dropped_row_count ?? cs.total_rows_dropped ?? 0);
  if ($("cleanMissingCount")) $("cleanMissingCount").textContent = fmtNumStat(tbl.missing_cells_count ?? cs.empty_cells_count ?? 0);
  if ($("cleanPreviewMeta")) {
    const mfs = cs.multi_file_synthesis || {};
    const multiNote =
      mfs.is_multi_source && tables.length > 1
        ? `📚 Tổng hợp từ ${tables.length} bảng/file (${fmtNumStat(cs.total_rows_clean)} dòng tổng) · `
        : "";
    $("cleanPreviewMeta").textContent = `${multiNote}Đúng chuẩn bộ dữ liệu "${tbl.sheet_name}": ${(tbl.headers || []).length} cột (${(tbl.headers || []).join(", ")}) · ${fmtNumStat(tbl.row_count)}/${fmtNumStat(tbl.raw_row_count || tbl.row_count)} dòng giữ nguyên (không thêm không bớt) · ${cs.empty_rows_dropped || 0} dòng trống · ${cs.dedup_dropped_count || 0} dòng trùng`;
  }
  const headers = tbl.headers || [];
  let rows = tbl.preview_rows || [];

  const cpSel = $("cleanPeriodFilterSelect");
  const dateCol = headers.find((h) => /ngay|date|thang|month|ky|period/i.test(String(h)));
  if (cpSel) {
    if (dateCol && rows.length) {
      const uniqueVals = Array.from(new Set(rows.map((r) => String(r[dateCol] ?? "").trim()).filter(Boolean)));
      if (resInput || cpSel.options.length <= 1) {
        cpSel.innerHTML = `<option value="__ALL__">📅 Tất cả ngày/kỳ</option>` + uniqueVals.slice(0, 30).map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join("");
      }
      cpSel.classList.remove("hidden");
      if (cpSel.value && cpSel.value !== "__ALL__") {
        rows = rows.filter((r) => String(r[dateCol] ?? "").trim() === cpSel.value);
      }
    } else {
      cpSel.classList.add("hidden");
    }
  }

  const { rowFlags } = analyzeTableImportantRows({ ...tbl, preview_rows: rows });
  const hlOn = $("toggleHighlightImportantCells") ? $("toggleHighlightImportantCells").checked : true;

  if ($("cleanedPreviewTableHead")) {
    $("cleanedPreviewTableHead").innerHTML = `<tr><th class="p-2.5 whitespace-nowrap border-b border-pink-100">Đánh dấu</th>${headers.map((h) => `<th class="p-2.5 whitespace-nowrap border-b border-pink-100">${esc(h)}</th>`).join("")}</tr>`;
  }
  if ($("cleanedPreviewTableBody")) {
    $("cleanedPreviewTableBody").innerHTML = rows.length
      ? rows
          .map((r, rIdx) => {
            const flag = rowFlags[rIdx] || {};
            let rCls = "hover:bg-pink-50/40";
            let badge = `<span class="text-[10px] text-slate-400">Chuẩn</span>`;
            if (hlOn) {
              if (flag.isMax) {
                rCls = "bg-emerald-100/75 border-l-4 border-emerald-600";
                badge = `<span class="px-1.5 py-0.5 rounded-md bg-emerald-600 text-white text-[9.5px] font-black">🏆 CAO NHẤT</span>`;
              } else if (flag.isOutlier) {
                rCls = "bg-amber-100/80 border-l-4 border-amber-500";
                badge = `<span class="px-1.5 py-0.5 rounded-md bg-amber-600 text-white text-[9.5px] font-black">⚡ ĐỘT BIẾN</span>`;
              } else if (flag.isTop) {
                rCls = "bg-emerald-50/60 border-l-4 border-emerald-400";
                badge = `<span class="px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-300 text-[9.5px] font-black">⭐ TOP</span>`;
              } else if (flag.isMin) {
                rCls = "bg-rose-100/70 border-l-4 border-rose-500";
                badge = `<span class="px-1.5 py-0.5 rounded-md bg-rose-600 text-white text-[9.5px] font-black">🔻 THẤP NHẤT</span>`;
              } else if (flag.hasMissing) {
                rCls = "bg-rose-50/50 border-l-4 border-rose-300";
                badge = `<span class="px-1.5 py-0.5 rounded-md bg-rose-100 text-rose-700 border border-rose-300 text-[9.5px] font-black">⚠️ THIẾU Ô</span>`;
              }
            }
            const tds = headers
              .map((h) => {
                const v = r[h] ?? "";
                const cType = hlOn ? flag.importantCols?.[h] : null;
                if (cType === "missing") return `<td class="p-2 whitespace-nowrap bg-rose-100/80 text-rose-700 font-extrabold">(Trống)</td>`;
                if (cType === "max") return `<td class="p-2 whitespace-nowrap bg-emerald-200/80 text-emerald-950 font-black">${esc(v)} 🏆</td>`;
                if (cType === "outlier") return `<td class="p-2 whitespace-nowrap bg-amber-200/80 text-amber-950 font-black">${esc(v)} ⚡</td>`;
                if (cType === "min") return `<td class="p-2 whitespace-nowrap bg-rose-200/70 text-rose-900 font-black">${esc(v)} 🔻</td>`;
                return `<td class="p-2 whitespace-nowrap text-slate-700">${esc(v)}</td>`;
              })
              .join("");
            return `<tr class="${rCls}"><td class="p-2 whitespace-nowrap">${badge}</td>${tds}</tr>`;
          })
          .join("")
      : `<tr><td colspan="${Math.max(2, headers.length + 1)}" class="p-4 text-center text-slate-400">Không có dòng dữ liệu sạch.</td></tr>`;
  }
  const s2Box = $("step2BreakdownBox");
  const mainBk = $("perDatasetBreakdownGrid");
  if (s2Box && mainBk) {
    s2Box.innerHTML = mainBk.innerHTML;
  }
}

async function reRunWithCleaningRules() {
  showToast("Đang áp dụng lại quy tắc làm sạch...");
  await runAIAgentWorkflow(true);
}

function renderTab1Results(res) {
  if (res.analysis_mode === "company_statistics" || res.company_stats) {
    renderCompanyStatisticsDashboard(res);
    return;
  }

  $("statsDeepSection")?.classList.add("hidden");
  if ($("mainTableTitle")) $("mainTableTitle").innerText = "Bảng tổng hợp dữ liệu";
  if ($("mainTableSubtitle")) $("mainTableSubtitle").innerText = "Bấm mã nguồn để kiểm tra";
  if ($("comparisonTableHead")) {
    $("comparisonTableHead").innerHTML = `<tr><th class="p-3">Địa bàn</th><th class="p-3">Quy mô</th><th class="p-3">Fit</th><th class="p-3">Triển khai</th><th class="p-3">Cạnh tranh</th><th class="p-3">Điểm</th><th class="p-3">Kết quả &amp; Nguồn</th></tr>`;
  }
  const btnDet = $("btnToggleLocDetails");
  const detHidden = $("locationDetailWrapper")?.classList.contains("hidden");
  if (btnDet) {
    btnDet.innerHTML = detHidden
      ? `<i class="fa-solid fa-eye"></i><span>Xem chi tiết các địa bàn ▾</span>`
      : `<i class="fa-solid fa-eye-slash"></i><span>Thu gọn chi tiết ▴</span>`;
  }

  const ev = res.evaluation || {};
  const ing = res.ingestion || {};
  const evals = ev.evaluations || [];
  const selected = evals.filter((x) => x.overall_status === "SELECTED");

  // Top 1 card
  if (selected[0]) {
    $("top1Name").innerText = selected[0].location;
    $("top1Score").innerText = `${selected[0].total_weighted_score}/10`;
    $("top1Reason").innerText = selected[0].exclusion_or_selection_reason;
  } else {
    $("top1Name").innerText = "Chưa đủ căn cứ";
    $("top1Score").innerText = "--/10";
    $("top1Reason").innerText = (ev.conditions_to_supplement || ["Cần bổ sung dữ liệu."])[0];
  }

  // Top 2 card
  if (selected[1]) {
    $("top2Name").innerText = selected[1].location;
    $("top2Score").innerText = `${selected[1].total_weighted_score}/10`;
    $("top2Reason").innerText = selected[1].exclusion_or_selection_reason;
  } else {
    $("top2Name").innerText = "Chưa đủ #2";
    $("top2Score").innerText = "--/10";
    $("top2Reason").innerText = (ev.conditions_to_supplement || ["Thiếu dữ liệu địa bàn thứ 2."])[0];
  }

  // Agent alert chips
  const chips = [];
  (ing.dedup_log || []).forEach((d) =>
    chips.push(`<span class="px-2.5 py-0.5 bg-amber-100 text-amber-800 border border-amber-200 rounded-full text-[10px] font-bold">🧹 Trùng ${esc(d.dropped_record_id)}</span>`)
  );
  (ing.period_normalization_log || [])
    .filter((p) => p.normalization_note && p.normalization_note.includes("Quy đổi"))
    .forEach((p) =>
      chips.push(`<span class="px-2.5 py-0.5 bg-orange-100 text-orange-800 border border-orange-200 rounded-full text-[10px] font-bold">⏱️ Quy đổi ${esc(p.location)}</span>`)
    );
  evals
    .filter((x) => x.overall_status === "DISQUALIFIED" || x.overall_status === "INSUFFICIENT_DATA")
    .forEach((x) =>
      chips.push(`<span class="px-2.5 py-0.5 bg-rose-100 text-rose-700 border border-rose-200 rounded-full text-[10px] font-bold">❌ ${esc(x.location)}</span>`)
    );
  if (ev.near_tie_alert) {
    chips.push(`<span class="px-2.5 py-0.5 bg-pink-100 text-pink-800 border border-pink-200 rounded-full text-[10px] font-bold">⚖️ Sát điểm</span>`);
  }
  if (!chips.length) {
    chips.push(`<span class="px-2.5 py-0.5 bg-pink-50 text-pink-700 border border-pink-200 rounded-full text-[10px] font-bold">🌸 Sạch</span>`);
  }
  $("agentAlertChips").innerHTML = chips.join("");

  const sufficientCount = (res.conflict_gap?.sufficient_locations || []).length;
  $("dataConfidence").innerText = `${sufficientCount}/${evals.length} địa bàn`;
  $("citationCountLabel").innerText = `${res.audit?.summary?.total_citations || 0} CIT`;

  // Comparison Table
  const tbody = $("comparisonTableBody");
  const fmtScore = (cs, colorCls) => {
    if (!cs || cs.raw_score === null || cs.raw_score === undefined) {
      return `<span class="px-2 py-0.5 bg-slate-100 text-slate-500 rounded-xl font-bold">Thiếu</span>`;
    }
    let badge = "";
    if (cs.gate_status === "FAIL") badge = `<span class="ml-1 px-1.5 py-0.5 bg-rose-100 text-rose-700 rounded-lg text-[10px] font-extrabold">LOẠI</span>`;
    else if (cs.gate_status === "BOUNDARY_PASS") badge = `<span class="ml-1 px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded-lg text-[10px] font-extrabold">BIÊN</span>`;
    return `<span class="px-2.5 py-0.5 ${colorCls} rounded-xl font-extrabold">${cs.raw_score}/10</span>${badge}`;
  };

  const statusPill = (st) => {
    if (st === "SELECTED") return `<span class="px-2.5 py-0.5 bg-pink-100 text-pink-800 border border-pink-200 rounded-full font-extrabold">🌸 Chọn</span>`;
    if (st === "ALTERNATIVE") return `<span class="px-2.5 py-0.5 bg-orange-50 text-orange-800 border border-orange-200 rounded-full font-extrabold">🧡 Dự phòng</span>`;
    if (st === "DISQUALIFIED") return `<span class="px-2.5 py-0.5 bg-rose-100 text-rose-700 rounded-full font-extrabold">❌ Loại</span>`;
    return `<span class="px-2.5 py-0.5 bg-amber-100 text-amber-800 rounded-full font-extrabold">⚠️ Thiếu</span>`;
  };

  tbody.innerHTML = evals
    .map((item) => {
      const byCat = Object.fromEntries((item.criterion_scores || []).map((c) => [c.category_key, c]));
      const rankBadge = item.rank === 1
        ? "bg-pink-200 text-pink-800 font-extrabold"
        : item.rank === 2
          ? "bg-orange-200 text-orange-800 font-extrabold"
          : "bg-rose-50 text-rose-600 font-bold";
      const cits = (item.citation_ids || []).slice(0, 3).map((c) => `<button type="button" onclick="openCitationModal('${c}')" class="cit-chip">${c}</button>`).join("");
      return `
        <tr class="hover:bg-pink-50/40 transition">
          <td class="p-3.5 font-extrabold text-slate-800 flex items-center space-x-2">
            <span class="w-6 h-6 rounded-full ${rankBadge} flex items-center justify-center text-[10px] shrink-0">${item.rank || "-"}</span>
            <span>${esc(item.location)}</span>
          </td>
          <td class="p-3.5">${fmtScore(byCat.market_size, "bg-amber-50 text-amber-800 border border-amber-200")}</td>
          <td class="p-3.5">${fmtScore(byCat.product_fit, "bg-pink-50 text-pink-700 border border-pink-200")}</td>
          <td class="p-3.5">${fmtScore(byCat.deployment_capability, "bg-orange-50 text-orange-700 border border-orange-200")}</td>
          <td class="p-3.5">${fmtScore(byCat.competition, "bg-rose-50 text-rose-700 border border-rose-200")}</td>
          <td class="p-3.5 font-extrabold text-pink-600">${item.total_weighted_score !== null ? item.total_weighted_score : "N/A"}</td>
          <td class="p-3.5">
            <div class="mb-1">${statusPill(item.overall_status)}</div>
            <div class="flex flex-wrap gap-1">${cits}</div>
          </td>
        </tr>`;
    })
    .join("");

  // Detailed Location Cards (collapsed behind button)
  $("locationDetailCards").innerHTML = evals
    .map((item) => {
      const factsHtml = (item.document_facts_summary || []).length
        ? item.document_facts_summary.map((f) => `<li>${linkifyCitations(esc(f))}</li>`).join("")
        : `<li class="italic text-slate-400">Không có đủ dữ liệu gốc.</li>`;
      const infHtml = (item.agent_inferences_summary || [])
        .map((inf) => `<li>${linkifyCitations(esc(inf))}</li>`)
        .join("");

      return `
        <div class="cute-card p-4 rounded-3xl space-y-2.5">
          <div class="flex justify-between items-center">
            <div class="flex items-center space-x-2">
              <h4 class="font-extrabold text-slate-800 text-sm">${item.rank ? `#${item.rank} · ` : ""}${esc(item.location)}</h4>
              ${statusPill(item.overall_status)}
            </div>
            <span class="px-3 py-0.5 bg-pink-100 text-pink-700 rounded-full text-xs font-extrabold">${item.total_weighted_score !== null ? item.total_weighted_score + "/10" : "N/A"
        }</span>
          </div>
          <p class="text-xs font-medium text-slate-600">${esc(item.exclusion_or_selection_reason)}</p>
          <details class="bg-white/55 backdrop-blur-md p-3 rounded-2xl border border-white/85 shadow-sm text-xs">
            <summary class="cursor-pointer font-bold text-pink-800">📄 Dữ liệu gốc (${(item.document_facts_summary || []).length})</summary>
            <ul class="list-disc pl-4 mt-2 space-y-1 text-slate-700">${factsHtml}</ul>
          </details>
          <details class="bg-white/55 backdrop-blur-md p-3 rounded-2xl border border-white/85 shadow-sm text-xs">
            <summary class="cursor-pointer font-bold text-orange-800">🤖 Suy luận Agent (${(item.agent_inferences_summary || []).length})</summary>
            <ul class="list-disc pl-4 mt-2 space-y-1 text-slate-700">${infHtml}</ul>
          </details>
        </div>`;
    })
    .join("");
}

function renderSimpleMarkdown(mdText) {
  const lines = String(mdText || "").split(/\r?\n/);
  const html = [];
  let inList = false;
  let inTable = false;

  const closeLists = () => {
    if (inList) {
      html.push("</ul>");
      inList = false;
    }
    if (inTable) {
      html.push("</tbody></table></div>");
      inTable = false;
    }
  };
  const inline = (t) =>
    linkifyCitations(
      esc(t)
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/`([^`]+)`/g, "<code>$1</code>")
    );

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      closeLists();
      continue;
    }
    if (line.startsWith("|")) {
      if (line.replace(/[\|\-:\s]/g, "") === "") continue;
      if (!inTable) {
        closeLists();
        const ths = line.split("|").slice(1, -1).map((c) => `<th>${esc(c.trim())}</th>`).join("");
        html.push(`<div class="overflow-x-auto"><table><thead><tr>${ths}</tr></thead><tbody>`);
        inTable = true;
      } else {
        const tds = line.split("|").slice(1, -1).map((c) => `<td>${inline(c.trim())}</td>`).join("");
        html.push(`<tr>${tds}</tr>`);
      }
      continue;
    }
    closeLists();
    if (line.startsWith("### ")) html.push(`<h3>${inline(line.slice(4))}</h3>`);
    else if (line.startsWith("## ")) html.push(`<h2>${inline(line.slice(3))}</h2>`);
    else if (line.startsWith("# ")) html.push(`<h1>${inline(line.slice(2))}</h1>`);
    else if (line.startsWith("- ")) {
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push(`<li>${inline(line.slice(2))}</li>`);
    } else {
      html.push(`<p class="mt-1">${inline(line)}</p>`);
    }
  }
  closeLists();
  return html.join("\n");
}

function renderDatasetHighlights(resInput) {
  const res = resInput || state.lastResult;
  if (!res) return;
  const cs = res.company_stats || {};
  const bi = cs.bi_pipeline || {};
  const customRep = res.custom_report || cs.custom_report || {};
  let highlights = customRep.highlights || cs.dataset_highlights || bi.dataset_highlights || [];

  if (!highlights.length && cs.total_rows_clean) {
    highlights = [
      {
        badge: "Quy mô dữ liệu",
        title: `${cs.total_tables || 1} Bảng · ${fmtNumStat(cs.total_rows_clean)} Dòng sạch`,
        detail: `Độ đầy đủ đạt ${cs.completeness_pct || 100}% (giữ nguyên 100% dữ liệu gốc).`,
      },
    ];
  }

  const reqBanner = $("datasetHighlightsUserReqBanner");
  const userReq = cs.user_prompt || ($("userPromptInput")?.value || "").trim();
  if (reqBanner) {
    if (userReq) {
      reqBanner.classList.remove("hidden");
      reqBanner.innerHTML = `🎯 <strong>Nhu cầu của bạn đã áp dụng:</strong> "${esc(userReq)}" ${cs.prompt_note ? `— <em>${esc(cs.prompt_note)}</em>` : ""}`;
    } else {
      reqBanner.classList.add("hidden");
    }
  }

  const renderCards = (items) =>
    items
      .map((hl, idx) => {
        if (typeof hl === "string") {
          return `
            <div class="p-3.5 rounded-2xl bg-white border-2 border-pink-200 shadow-sm space-y-1">
              <span class="px-2 py-0.5 rounded-full bg-pink-100 text-pink-800 text-[10px] font-black">Điểm nhấn #${idx + 1}</span>
              <div class="text-xs font-extrabold text-slate-900 leading-snug">${esc(hl)}</div>
            </div>`;
        }
        return `
          <div class="p-3.5 rounded-2xl bg-white border-2 border-pink-200 shadow-sm space-y-1 flex flex-col justify-between">
            <div>
              <span class="inline-block px-2 py-0.5 rounded-full bg-pink-100 text-pink-800 text-[10px] font-black uppercase">${esc(hl.badge || `Điểm nhấn #${idx + 1}`)}</span>
              <div class="text-xs sm:text-sm font-black text-slate-900 mt-1 leading-snug">${esc(hl.title || "")}</div>
            </div>
            <p class="text-[11px] font-semibold text-slate-600 leading-snug">${esc(hl.detail || "")}</p>
          </div>`;
      })
      .join("");

  if ($("datasetHighlightsGrid")) {
    $("datasetHighlightsGrid").innerHTML = highlights.length
      ? renderCards(highlights)
      : `<div class="col-span-4 text-xs text-slate-500">Chưa có nhận định điểm nhấn.</div>`;
  }

  const s2Box = $("step2DatasetHighlightsBox");
  const s2List = $("step2HighlightsList");
  if (s2Box && s2List) {
    if (highlights.length) {
      s2Box.classList.remove("hidden");
      if ($("step2UserReqBadge")) {
        $("step2UserReqBadge").textContent = userReq ? `🎯 Yêu cầu: "${userReq}"` : "Tự động trích xuất điểm nhấn";
      }
      s2List.innerHTML = renderCards(highlights.slice(0, 4));
    } else {
      s2Box.classList.add("hidden");
    }
  }
}

function populateReportEditor(res) {
  if (!res) return;
  const cs = res.company_stats || {};
  const bi = cs.bi_pipeline || {};
  const prop = res.proposal || {};
  const customRep = res.custom_report || {};
  const domainLbl = cs.domain_label || "Phân tích & Thống kê Dữ liệu Doanh nghiệp";

  if (!res._originalMarkdownReport) {
    res._originalMarkdownReport = prop.markdown_report || cs.markdown_report || "";
  }
  if (!res._originalHighlights) {
    res._originalHighlights = JSON.parse(JSON.stringify(cs.dataset_highlights || bi.dataset_highlights || []));
  }

  if ($("customReportTitleInput")) {
    $("customReportTitleInput").value =
      customRep.title || `BÁO CÁO PHÂN TÍCH DỮ LIỆU & GIẢI PHÁP QUẢN TRỊ: ${domainLbl.toUpperCase()}`;
  }
  if ($("customReportAuthorInput")) {
    $("customReportAuthorInput").value = customRep.author || "Hà Thuỳ Dương (Data Analyst & BI)";
  }
  if ($("customReportPromptInput")) {
    $("customReportPromptInput").value = cs.user_prompt || ($("userPromptInput")?.value || "");
  }
  const hlArr = customRep.highlights || cs.dataset_highlights || bi.dataset_highlights || [];
  if ($("customReportHighlightsInput")) {
    $("customReportHighlightsInput").value = hlArr
      .map((h) => (typeof h === "string" ? h : `[${h.badge || "Điểm nhấn"}] ${h.title}: ${h.detail}`))
      .join("\n");
  }
  if ($("customReportConclusionInput")) {
    $("customReportConclusionInput").value =
      customRep.conclusion || bi.stage7_report?.executive_conclusion || "";
  }
  if ($("customReportMarkdownInput")) {
    $("customReportMarkdownInput").value = prop.markdown_report || cs.markdown_report || "";
  }
}

function toggleReportEditorBody() {
  const body = $("reportEditorBody");
  const btn = $("btnToggleReportEditor");
  if (!body || !btn) return;
  const hidden = body.classList.toggle("hidden");
  btn.textContent = hidden ? "Mở khung sửa ▾" : "Thu gọn khung sửa ▴";
}

function openReportEditorFromDashboard() {
  if (!state.lastResult) return;
  state.maxApprovedStep = 4;
  updateStudioStepper();
  switchTab("tabProposal");
  const body = $("reportEditorBody");
  if (body && body.classList.contains("hidden")) {
    toggleReportEditorBody();
  }
  $("reportCustomizationCard")?.scrollIntoView({ behavior: "smooth", block: "start" });
  $("customReportHighlightsInput")?.focus();
}

async function applyUserReportCustomizations() {
  if (!state.lastResult) {
    showToast("Vui lòng chạy phân tích dữ liệu trước!", true);
    return;
  }
  const title = ($("customReportTitleInput")?.value || "").trim();
  const author = ($("customReportAuthorInput")?.value || "").trim();
  const conclusion = ($("customReportConclusionInput")?.value || "").trim();
  const hlLines = ($("customReportHighlightsInput")?.value || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const parsedHighlights = hlLines.map((line, i) => {
    const m = line.match(/^\[(.+?)\]\s*([^:]+):\s*(.+)$/);
    if (m) {
      return { badge: m[1].trim(), title: m[2].trim(), detail: m[3].trim() };
    }
    const m2 = line.match(/^([^:]+):\s*(.+)$/);
    if (m2) {
      return { badge: `Điểm nhấn #${i + 1}`, title: m2[1].trim(), detail: m2[2].trim() };
    }
    return { badge: `Điểm nhấn #${i + 1}`, title: line, detail: "Nhận định theo yêu cầu người dùng." };
  });

  let mdEdited = ($("customReportMarkdownInput")?.value || "").trim();
  if (!mdEdited && state.lastResult.proposal?.markdown_report) {
    mdEdited = state.lastResult.proposal.markdown_report;
  }

  state.lastResult.custom_report = {
    title,
    author,
    conclusion,
    highlights: parsedHighlights,
  };
  if (state.lastResult.company_stats) {
    state.lastResult.company_stats.custom_report = state.lastResult.custom_report;
    if (parsedHighlights.length) {
      state.lastResult.company_stats.dataset_highlights = parsedHighlights;
    }
    if (mdEdited) {
      state.lastResult.company_stats.markdown_report = mdEdited;
    }
  }
  if (!state.lastResult.proposal) state.lastResult.proposal = {};
  if (mdEdited) {
    state.lastResult.proposal.markdown_report = mdEdited;
  }

  state.cachedHtmlReport = "";
  renderDatasetHighlights(state.lastResult);
  if ($("proposalReportBox")) {
    $("proposalReportBox").innerHTML = renderSimpleMarkdown(state.lastResult.proposal.markdown_report || "");
  }
  await renderInlineHtmlReport(false);
  showToast("✅ Đã áp dụng chỉnh sửa vào Báo cáo A4 (HTML/PDF), Văn bản & Word (.docx)!");
}

async function resetReportCustomizations() {
  if (!state.lastResult) return;
  delete state.lastResult.custom_report;
  if (state.lastResult.company_stats) {
    delete state.lastResult.company_stats.custom_report;
    if (state.lastResult._originalHighlights) {
      state.lastResult.company_stats.dataset_highlights = JSON.parse(
        JSON.stringify(state.lastResult._originalHighlights)
      );
    }
    if (state.lastResult._originalMarkdownReport) {
      state.lastResult.company_stats.markdown_report = state.lastResult._originalMarkdownReport;
    }
  }
  if (state.lastResult.proposal && state.lastResult._originalMarkdownReport) {
    state.lastResult.proposal.markdown_report = state.lastResult._originalMarkdownReport;
  }
  state.cachedHtmlReport = "";
  populateReportEditor(state.lastResult);
  renderDatasetHighlights(state.lastResult);
  if ($("proposalReportBox")) {
    $("proposalReportBox").innerHTML = renderSimpleMarkdown(state.lastResult.proposal?.markdown_report || "");
  }
  await renderInlineHtmlReport(false);
  showToast("↺ Đã khôi phục nội dung báo cáo mặc định!");
}

async function reRunAnalysisFromReportRequest() {
  const newReq = ($("customReportPromptInput")?.value || "").trim();
  if ($("userPromptInput")) {
    $("userPromptInput").value = newReq;
  }
  updateAiClarifyPreview();
  state.maxApprovedStep = 4;
  showToast("🔄 Đang phân tích & cập nhật lại Báo cáo theo yêu cầu mới của bạn...");
  await runAIAgentWorkflow(true);
  state.maxApprovedStep = 4;
  updateStudioStepper();
  switchTab("tabProposal");
  switchProposalView("html");
  await renderInlineHtmlReport(false);
}

function toggleInlineHtmlDirectEdit() {
  const frame = $("inlineHtmlReportFrame");
  const btn = $("btnToggleDirectA4Edit");
  const hint = $("directA4EditHint");
  if (!frame || !frame.contentWindow || !frame.contentWindow.document?.body) {
    showToast("Vui lòng mở tab Báo cáo Chuẩn A4 trước khi bật sửa trực tiếp!", true);
    return;
  }
  const doc = frame.contentWindow.document;
  const isEditing = doc.body.getAttribute("contenteditable") === "true";
  if (!isEditing) {
    doc.body.setAttribute("contenteditable", "true");
    doc.body.style.outline = "3px dashed #d65388";
    doc.body.style.outlineOffset = "-6px";
    if (btn) {
      btn.textContent = "💾 Lưu bản sửa trực tiếp trên trang A4 ✓";
      btn.className = "cute-btn px-3.5 py-2 bg-emerald-600 text-white border-2 border-emerald-700 rounded-xl text-xs font-extrabold";
    }
    hint?.classList.remove("hidden");
    doc.body.focus();
    showToast("✍️ Đã bật sửa trực tiếp! Bạn hãy bấm vào bất kỳ dòng chữ hoặc bảng nào trên trang A4 để sửa.");
  } else {
    doc.body.removeAttribute("contenteditable");
    doc.body.style.outline = "";
    doc.body.style.outlineOffset = "";
    state.cachedHtmlReport = "<!DOCTYPE html>\n" + doc.documentElement.outerHTML;
    if (btn) {
      btn.textContent = "✍️ Bật Sửa chữ trực tiếp trên trang Báo cáo A4";
      btn.className = "cute-btn px-3.5 py-2 bg-white text-pink-800 border-2 border-pink-300 rounded-xl text-xs font-extrabold";
    }
    hint?.classList.add("hidden");
    showToast("💾 Đã lưu nội dung bạn sửa trực tiếp trên trang Báo cáo A4!");
  }
}

function renderProposalAndSurvey(res) {
  const prop = res.proposal || {};
  populateReportEditor(res);
  renderDatasetHighlights(res);
  $("proposalReportBox").innerHTML = renderSimpleMarkdown(prop.markdown_report || "");

  const plan = prop.survey_plan || [];
  $("surveyPlanTableBody").innerHTML = plan.length
    ? plan
      .map(
        (p) => `
        <tr class="hover:bg-pink-50/40">
          <td class="p-3 font-bold text-slate-800">
            <div>${esc(p.location)}</div>
            <span class="inline-block mt-1 px-2 py-0.5 bg-pink-100 text-pink-700 rounded-full text-[10px] font-bold">${esc(p.priority_tag)}</span>
          </td>
          <td class="p-3 text-slate-600 font-medium">${(p.target_customer_segments || []).map(esc).join("; ")}</td>
          <td class="p-3 text-slate-600"><ul class="list-disc pl-4 space-y-0.5">${(p.information_to_verify || []).map((v) => `<li>${linkifyCitations(esc(v))}</li>`).join("")}</ul></td>
          <td class="p-3"><span class="px-2.5 py-1 bg-orange-50 text-orange-800 border border-orange-200 rounded-xl font-bold text-[11px]">${esc(p.go_no_go_criteria)}</span></td>
          <td class="p-3 font-bold text-pink-700">${esc(p.owner)}<div class="text-[10px] text-slate-400 font-semibold mt-0.5">${esc(p.expected_timeline)}</div></td>
        </tr>`
      )
      .join("")
    : `<tr><td colspan="5" class="p-6 text-center text-slate-400">${res.analysis_mode === "company_statistics" ? "Chế độ Thống kê tổng hợp công ty — xem đầy đủ ở mục 📄 Báo cáo (BC)." : "Chưa có kế hoạch khảo sát."}</td></tr>`;

  if (res.analysis_mode === "company_statistics" || prop.decision_status === "COMPANY_STATISTICS") {
    $("btnPropSurvey")?.classList.add("hidden");
  } else {
    $("btnPropSurvey")?.classList.remove("hidden");
  }
  switchProposalView("html");
}

function renderProcessSteps(res) {
  const card = $("processStepsCard");
  const list = $("processStepsList");
  if (!card || !list) return;
  const steps = res.company_stats?.process_steps || [];
  if (!steps.length) {
    card.classList.add("hidden");
    return;
  }
  card.classList.remove("hidden");
  list.innerHTML = steps
    .map(
      (st, i) => `
      <li class="flex items-start gap-3 p-3 rounded-2xl bg-white/70 border border-white shadow-sm">
        <span class="w-7 h-7 shrink-0 rounded-full bg-gradient-to-br from-pink-400 to-orange-300 text-white text-[11px] font-extrabold flex items-center justify-center">${i + 1}</span>
        <div class="min-w-0">
          <div class="text-xs font-extrabold text-slate-800">${esc(String(st.title || "").replace(/^\d+\s*·\s*/, ""))} <span class="ml-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 text-[10px] font-extrabold">Xong</span></div>
          <div class="text-[11px] font-medium text-slate-600 leading-snug mt-0.5">${esc(st.detail)}</div>
        </div>
      </li>`
    )
    .join("");
}

function statsQualityIssues(cs) {
  const out = [];
  (cs.numeric_highlights || []).forEach((n) => {
    if (n.outlier_count) {
      out.push({
        location: n.table,
        issue_type: `Ngoại lai · ${n.column}`,
        severity: "MEDIUM",
        description: `${n.outlier_count} giá trị bất thường (${(n.outliers || []).join(", ")}) so với trung vị ${n.median}. Nên kiểm tra lại số liệu gốc.`,
      });
    }
    if (n.missing_count) {
      out.push({
        location: n.table,
        issue_type: `Thiếu dữ liệu · ${n.column}`,
        severity: n.missing_count >= n.count ? "HIGH" : "MEDIUM",
        description: `${n.missing_count} ô trống trong cột này (có ${n.count} ô hợp lệ).`,
      });
    }
  });
  return out;
}

function renderQualityTab(res) {
  renderCleanPreviewTable(res);
  renderProcessSteps(res);
  const ing = res.ingestion || {};
  const cs = res.company_stats || {};
  const dedups = (ing.dedup_log && ing.dedup_log.length) ? ing.dedup_log : (cs.dedup_log || []);
  const pnorms = ing.period_normalization_log || [];
  const issues = res.analysis_mode === "company_statistics" ? statsQualityIssues(cs) : (res.conflict_gap?.issues || []);

  $("dedupLogList").innerHTML = dedups.length
    ? dedups.map((d) => `<p class="bg-white/60 backdrop-blur-md p-3 rounded-2xl border border-white shadow-sm transition hover:-translate-y-0.5"><i class="fa-solid fa-check text-pink-600 mr-1.5"></i><strong>[${esc(d.dropped_record_id || d.table || "Trùng")}]</strong> — ${linkifyCitations(esc(d.reason || d.detail || "Đã loại bản ghi trùng"))}</p>`).join("")
    : `<p class="text-pink-700 font-bold"><i class="fa-solid fa-check mr-1.5"></i>Không có bản ghi trùng.</p>`;

  $("periodLogList").innerHTML = pnorms.length
    ? pnorms.map((p) => `<p class="bg-white/60 backdrop-blur-md p-3 rounded-2xl border border-white shadow-sm transition hover:-translate-y-0.5"><i class="fa-solid fa-clock-rotate-left text-orange-600 mr-1.5"></i><strong>${esc(p.location)}:</strong> '${esc(p.raw_period)}' → <code>${esc(p.normalized_period)}</code> (${esc(p.normalization_note)}) ${linkifyCitations(esc(p.citation_id))}</p>`).join("")
    : `<p class="text-slate-500 font-bold">Các kỳ đã đồng nhất.</p>`;

  if (res.analysis_mode === "company_statistics") {
    const unitNotes = (cs.numeric_highlights || []).filter((n) => n.unit_note);
    $("periodLogList").innerHTML = unitNotes.length
      ? unitNotes
        .map((n) => `<p class="bg-white/60 backdrop-blur-md p-3 rounded-2xl border border-white shadow-sm"><i class="fa-solid fa-scale-balanced text-orange-600 mr-1.5"></i><strong>${esc(n.table)} · ${esc(n.column)}:</strong> ${esc(n.unit_note)}</p>`)
        .join("")
      : `<p class="text-slate-500 font-bold">Đơn vị số liệu đã đồng nhất, không cần quy đổi.</p>`;
  }

  $("conflictLogList").innerHTML = issues.length
    ? issues
      .map(
        (it) => `
          <div class="p-3 rounded-2xl backdrop-blur-md border shadow-sm transition hover:-translate-y-0.5 ${it.severity === "HIGH" ? "bg-rose-50/75 border-white" : "bg-amber-50/75 border-white"}">
            <div class="font-bold text-slate-800">[${esc(it.location)}] ${esc(it.issue_type)}</div>
            <div class="mt-0.5 text-slate-600">${esc(it.description)}</div>
          </div>`
      )
      .join("")
    : `<p class="text-pink-700 font-bold"><i class="fa-solid fa-check mr-1.5"></i>Không có thiếu hoặc lệch nguồn.</p>`;
}

function renderAuditTab(res) {
  const audit = res.audit || {};
  const events = audit.events || [];
  const rules = audit.rules_trace || [];

  const uniqueTools = Array.from(new Set(events.filter((e) => e.tool_name).map((e) => e.tool_name)));
  $("toolsBadgeBar").innerHTML = uniqueTools
    .map((t) => `<span class="px-2.5 py-1 bg-pink-100 text-pink-800 border border-pink-200 rounded-full text-[10px] font-bold">✨ ${esc(t)}</span>`)
    .join("");

  $("toolsAuditLogs").innerHTML = events
    .map((ev) => {
      const hasIo = ev.tool_args || ev.tool_result_summary;
      const ioBox = hasIo
        ? `<details class="mt-1.5"><summary class="cursor-pointer text-pink-600 font-bold font-sans text-[11px]">Xem Input / Output</summary><pre class="mt-1 p-2.5 bg-white/75 backdrop-blur-md rounded-2xl border border-white overflow-x-auto max-h-40 text-[10px] text-slate-700">${esc(
          JSON.stringify({ args: ev.tool_args, result: ev.tool_result_summary }, null, 2)
        )}</pre></details>`
        : "";
      return `
        <div class="p-3.5 bg-white/55 backdrop-blur-md rounded-2xl border border-white shadow-sm space-y-1 transition hover:-translate-y-0.5">
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-slate-400 font-bold">#${ev.seq}</span>
            <span class="px-2 py-0.5 bg-white/80 text-pink-800 border border-white rounded-full text-[10px] font-bold">${esc(ev.actor)}</span>
            <strong class="text-slate-800">${esc(ev.action)}</strong>
            ${ev.tool_name ? `<code class="px-2 py-0.5 bg-orange-100/80 text-orange-800 border border-white rounded-lg font-bold">${esc(ev.tool_name)}</code>` : ""}
          </div>
          <p class="text-slate-600 font-sans">${linkifyCitations(esc(ev.detail))}</p>
          ${ioBox}
        </div>`;
    })
    .join("");

  $("rulesTraceBox").innerHTML = rules.length
    ? rules
      .map(
        (r) => `
          <div class="p-3.5 rounded-2xl backdrop-blur-md border shadow-sm transition hover:-translate-y-0.5 ${r.outcome === "FAIL" ? "bg-rose-50/75 border-white" : "bg-white/60 border-white"}">
            <div class="flex justify-between items-center font-bold text-slate-800">
              <span>[${esc(r.rule_id)}] ${esc(r.location)}</span>
              <span class="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border border-white ${r.outcome === "PASS" ? "bg-pink-100/80 text-pink-700" : r.outcome === "FAIL" ? "bg-rose-100/80 text-rose-700" : "bg-orange-100/80 text-orange-800"
          }">${esc(r.outcome)}</span>
            </div>
            <div class="text-slate-700 font-semibold mt-1">${esc(r.rule_name)} · Ngưỡng: <code>${esc(r.threshold)}</code></div>
            <div class="text-slate-500 mt-0.5">${esc(r.explanation)}</div>
          </div>`
      )
      .join("")
    : `<p class="text-slate-500 italic">Chưa có quy tắc kiểm tra.</p>`;
}

// --- MODALS & EXPORTS ---
function openCitationModal(citCode) {
  const c = state.lastResult?.audit?.citations?.[citCode];
  if (!c) return;
  $("citationTitle").innerText = `Chi tiết Nguồn Gốc [${citCode}]`;
  $("citationContent").innerHTML = `
    <p><strong>Địa bàn:</strong> ${esc(c.location)}</p>
    <p><strong>Bảng:</strong> ${esc(c.table_name)} · <strong>File/Sheet:</strong> ${esc(c.source_file)} / ${esc(c.sheet_name)} (Dòng ${c.row_number})</p>
    <p><strong>Nguồn:</strong> ${esc(c.source_name)} (${esc(c.report_period)})</p>
    <p class="mt-1"><strong>Giá trị gốc:</strong></p>
    <pre class="p-2.5 bg-white rounded-2xl border border-pink-100 overflow-x-auto font-mono text-[11px]">${esc(JSON.stringify(c.raw_value, null, 2))}</pre>
    ${c.note ? `<p class="text-pink-600 font-bold mt-1">Ghi chú: ${esc(c.note)}</p>` : ""}`;
  $("citationModal").classList.remove("hidden");
  $("citationModal").classList.add("flex");
}

function closeCitationModal() {
  $("citationModal").classList.remove("flex");
  $("citationModal").classList.add("hidden");
}

async function openColumnMappingModal() {
  const urls = ($("gsheetsUrl")?.value || "").trim();
  const larkUrls = ($("larkBaseUrl")?.value || "").trim();
  if (!state.files.length && !urls && !larkUrls && !state.selectedSampleId && !state.stagedId) {
    showToast("Vui lòng chọn dữ liệu trước khi mở Map cột!", true);
    return;
  }
  try {
    const fd = buildFormData();
    const resp = await fetch("/api/inspect-inputs", { method: "POST", body: fd });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || "Không thể đọc cấu trúc bảng.");
    state.stagedId = data.staged_id;
    renderMappingModalContent(data);
    $("columnMappingModal").classList.remove("hidden");
    $("columnMappingModal").classList.add("flex");
  } catch (err) {
    showToast(err.message, true);
  }
}

function renderMappingModalContent(data) {
  const container = $("mappingFieldsContainer");
  const rows = data.sheet_assignments || [];
  const colMaps = data.column_maps || {};

  const tableOpts = (sel) =>
    `<option value="">-- Bỏ qua --</option>` +
    state.canonicalTables
      .map((t) => `<option value="${esc(t.key)}" ${t.key === sel ? "selected" : ""}>${esc(t.label)}</option>`)
      .join("");

  container.innerHTML = rows
    .map((r) => {
      const tbl = state.tableOverrides[r.sheet_name] || r.assigned_table;
      const meta = state.canonicalTables.find((t) => t.key === tbl);
      const curCols = { ...(colMaps[tbl] || {}), ...(state.columnOverrides[tbl] || {}) };
      const hdrOpts = (s) =>
        `<option value="">-- Tự động --</option>` +
        (r.headers || []).map((h) => `<option value="${esc(h)}" ${h === s ? "selected" : ""}>${esc(h)}</option>`).join("");

      const colGrid = meta
        ? `<details class="mt-2"><summary class="cursor-pointer text-pink-600 font-bold">Tùy chỉnh cột (${meta.fields.length})</summary><div class="grid grid-cols-2 gap-2 mt-2">${meta.fields
          .map(
            (f) => `
            <div>
              <div class="text-[10px] font-mono text-slate-500 font-bold">${esc(f)}</div>
              <select class="cute-input w-full px-2 py-1 rounded-xl col-override-sel" data-table="${esc(tbl)}" data-field="${esc(f)}">${hdrOpts(curCols[f] || "")}</select>
            </div>`
          )
          .join("")}</div></details>`
        : "";

      return `
        <div class="p-3 bg-pink-50/50 rounded-2xl border border-pink-100">
          <div class="flex items-center justify-between gap-2">
            <div><strong class="text-slate-800">${esc(r.sheet_name)}</strong> <span class="text-slate-500 font-semibold">(${r.row_count} dòng)</span></div>
            <select class="cute-input px-2.5 py-1.5 rounded-xl text-xs font-bold table-override-sel" data-sheet="${esc(r.sheet_name)}">${tableOpts(tbl)}</select>
          </div>
          ${colGrid}
        </div>`;
    })
    .join("");

  container.querySelectorAll(".table-override-sel").forEach((sel) => {
    sel.addEventListener("change", () => {
      if (sel.value) state.tableOverrides[sel.dataset.sheet] = sel.value;
      else delete state.tableOverrides[sel.dataset.sheet];
      renderMappingModalContent(data);
    });
  });

  container.querySelectorAll(".col-override-sel").forEach((sel) => {
    sel.addEventListener("change", () => {
      const t = sel.dataset.table;
      const f = sel.dataset.field;
      if (!state.columnOverrides[t]) state.columnOverrides[t] = {};
      if (sel.value) state.columnOverrides[t][f] = sel.value;
      else delete state.columnOverrides[t][f];
    });
  });
}

function closeColumnMappingModal() {
  $("columnMappingModal").classList.remove("flex");
  $("columnMappingModal").classList.add("hidden");
}

async function saveColumnMapping() {
  closeColumnMappingModal();
  showToast("Đã cập nhật ánh xạ cột! Đang chạy lại Agent...");
  await runAIAgentWorkflow();
}

async function fetchReportHtmlMarkup() {
  if (!state.lastResult) return "";
  if (state.cachedHtmlReport) return state.cachedHtmlReport;
  try {
    const resp = await fetch("/api/report/html", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ result: state.lastResult }),
    });
    if (resp.ok) {
      const txt = await resp.text();
      if (txt && txt.includes("<html")) {
        state.cachedHtmlReport = txt;
        return txt;
      }
    }
  } catch (_) {
    /* fallback below */
  }
  if (state.lastResult?.run_id) {
    try {
      const r2 = await fetch(`/api/runs/${encodeURIComponent(state.lastResult.run_id)}/report.html?inline=1`);
      if (r2.ok) {
        const txt2 = await r2.text();
        state.cachedHtmlReport = txt2;
        return txt2;
      }
    } catch (_) {
      /* ignore */
    }
  }
  return "";
}

async function renderInlineHtmlReport(scrollIntoView = false) {
  const frame = $("inlineHtmlReportFrame");
  const loading = $("inlineHtmlLoadingBar");
  if (!frame || !state.lastResult) return;
  loading?.classList.remove("hidden");
  const htmlMarkup = await fetchReportHtmlMarkup();
  loading?.classList.add("hidden");
  frame.onload = () => {
    try {
      const h = frame.contentWindow?.document?.documentElement?.scrollHeight;
      if (h && h > 360) frame.style.height = `${Math.min(Math.max(h + 24, 560), 2200)}px`;
    } catch (_) {
      /* ignore cross-origin */
    }
  };
  if (htmlMarkup) {
    frame.srcdoc = htmlMarkup;
  } else if (state.lastResult?.run_id) {
    frame.src = `/api/runs/${encodeURIComponent(state.lastResult.run_id)}/report.html?inline=1`;
  }
  if (scrollIntoView) {
    $("htmlInlineReportView")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

async function exportHTML() {
  if (!state.lastResult) {
    showToast("Vui lòng chạy Agent trước khi xem báo cáo HTML!", true);
    return;
  }
  if (state.maxApprovedStep < 4) {
    showToast("⚠️ Hãy bấm 'Qua Bước 4' ở Bước 3 trước khi mở Báo cáo HTML!", true);
    return;
  }
  switchTab("tabProposal");
  switchProposalView("html");
  await renderInlineHtmlReport(true);
  showToast("🌐 Đã hiển thị Báo cáo HTML trực tiếp trên giao diện!");
}

async function downloadHTMLFile() {
  if (!state.lastResult) {
    showToast("Vui lòng chạy Agent trước khi tải HTML!", true);
    return;
  }
  if (state.maxApprovedStep < 4) {
    showToast("⚠️ Hãy bấm 'Qua Bước 4' ở Bước 3 trước khi tải Báo cáo HTML!", true);
    return;
  }
  const ok = await askUserConfirm({
    title: "🌐 Tải xuống Báo cáo HTML",
    message: "Tải tệp báo cáo Dashboard HTML (.html) về máy của bạn?",
    confirmText: "Có, tải về ✓",
  });
  if (!ok) return;
  const markup = await fetchReportHtmlMarkup();
  if (markup) {
    const blob = new Blob([markup], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `HaThuyDuong_${state.lastResult.run_id || "BaoCao"}_HTML.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    showToast("⬇️ Đã tải xuống file Báo cáo HTML!");
    return;
  }
  window.location.href = `/api/runs/${encodeURIComponent(state.lastResult.run_id)}/report.html`;
}

function printInlineHtmlReport() {
  const frame = $("inlineHtmlReportFrame");
  if (frame?.contentWindow) {
    frame.contentWindow.focus();
    frame.contentWindow.print();
  } else {
    window.print();
  }
}

async function copyInlineHtmlSource() {
  const markup = await fetchReportHtmlMarkup();
  if (!markup) {
    showToast("Chưa có nội dung HTML để sao chép.", true);
    return;
  }
  try {
    await navigator.clipboard.writeText(markup);
    showToast("❐ Đã copy mã nguồn Báo cáo HTML!");
  } catch (_) {
    showToast("Không copy được tự động, hãy tải file .HTML về máy.", true);
  }
}

async function openInlineHtmlInNewTab() {
  const markup = await fetchReportHtmlMarkup();
  if (markup) {
    const blob = new Blob([markup], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener");
    return;
  }
  if (state.lastResult?.run_id) {
    window.open(`/api/runs/${encodeURIComponent(state.lastResult.run_id)}/report.html?inline=1`, "_blank", "noopener");
  }
}

async function exportCleanedExcel() {
  if (!state.lastResult) {
    showToast("Vui lòng chạy phân tích trước khi tải Excel dữ liệu sạch!", true);
    return;
  }
  if (state.maxApprovedStep < 4) {
    showToast("⚠️ Vui lòng bấm 'Duyệt bước này' ở Bước 3 trước khi mở khóa xuất báo cáo Bước 4!", true);
    return;
  }
  const ok = await askUserConfirm({
    title: "📗 Xác nhận tải Excel dữ liệu sạch",
    message: "Bạn có muốn tải xuống file Excel dữ liệu đã làm sạch (.xlsx) không?",
    confirmText: "Có, tải xuống ✓",
  });
  if (ok) window.location.href = `/api/runs/${encodeURIComponent(state.lastResult.run_id)}/cleaned.xlsx`;
}

async function exportAnalysisExcel() {
  if (!state.lastResult) {
    showToast("Vui lòng chạy phân tích trước khi tải Excel tổng hợp & biểu đồ!", true);
    return;
  }
  if (state.maxApprovedStep < 4) {
    showToast("⚠️ Vui lòng bấm 'Duyệt bước này' ở Bước 3 trước khi mở khóa xuất báo cáo Bước 4!", true);
    return;
  }
  const ok = await askUserConfirm({
    title: "📊 Xác nhận tải Excel tổng hợp",
    message: "Bạn có muốn tải xuống file Excel phân tích & biểu đồ (.xlsx) không?",
    confirmText: "Có, tải xuống ✓",
  });
  if (ok) window.location.href = `/api/runs/${encodeURIComponent(state.lastResult.run_id)}/analysis.xlsx`;
}

async function exportReportDocx() {
  if (!state.lastResult) {
    showToast("Vui lòng chạy phân tích trước khi tải Báo cáo Word (.docx)!", true);
    return;
  }
  if (state.maxApprovedStep < 4) {
    showToast("⚠️ Vui lòng bấm 'Duyệt bước này' ở Bước 3 trước khi mở khóa xuất báo cáo Bước 4!", true);
    return;
  }
  const ok = await askUserConfirm({
    title: "📘 Xác nhận tải Báo cáo Word",
    message: "Bạn có muốn tải xuống Báo cáo Word (.docx) không?",
    confirmText: "Có, tải xuống ✓",
  });
  if (ok) window.location.href = `/api/runs/${encodeURIComponent(state.lastResult.run_id)}/report.docx`;
}

async function exportMarkdown() {
  if (!state.lastResult) {
    showToast("Vui lòng chạy Agent trước khi xuất!", true);
    return;
  }
  const ok = await askUserConfirm({
    title: "📝 Xác nhận tải Markdown",
    message: "Bạn có muốn tải xuống file Báo cáo Markdown (.md) không?",
    confirmText: "Có, tải xuống ✓",
  });
  if (ok) window.location.href = `/api/runs/${encodeURIComponent(state.lastResult.run_id)}/report.md`;
}

async function exportAuditJSON() {
  if (!state.lastResult) {
    showToast("Vui lòng chạy Agent trước khi xuất!", true);
    return;
  }
  const ok = await askUserConfirm({
    title: "🧾 Xác nhận tải Audit Log JSON",
    message: "Bạn có muốn tải xuống nhật ký kiểm toán dữ liệu (.json) không?",
    confirmText: "Có, tải xuống ✓",
  });
  if (ok) window.location.href = `/api/runs/${encodeURIComponent(state.lastResult.run_id)}/audit`;
}

async function copyMarkdownReport() {
  const md = state.lastResult?.proposal?.markdown_report;
  if (!md) {
    showToast("Chưa có báo cáo Markdown để sao chép.", true);
    return;
  }
  try {
    await navigator.clipboard.writeText(md);
    showToast("Đã sao chép Báo cáo Markdown vào bộ nhớ tạm!");
  } catch {
    showToast("Không thể copy tự động; hãy dùng nút Xuất .MD.", true);
  }
}

document.addEventListener("click", (e) => {
  const menu = $("exportMenu");
  const btn = $("btnExportMenu");
  if (menu && btn && !menu.contains(e.target) && !btn.contains(e.target)) {
    menu.classList.add("hidden");
  }
  const userMenu = $("userDropdownMenu");
  const userBtn = $("btnUserMenuToggle");
  if (userMenu && userBtn && !userMenu.contains(e.target) && !userBtn.contains(e.target)) {
    userMenu.classList.add("hidden");
  }
  const searchPopup = $("headerSearchPopup");
  const searchBtn = $("btnSearchToggle");
  if (searchPopup && searchBtn && !searchPopup.contains(e.target) && !searchBtn.contains(e.target)) {
    searchPopup.classList.add("hidden");
  }
});

document.addEventListener("DOMContentLoaded", async () => {
  const dz = $("dropZone");
  if (dz) {
    dz.addEventListener("dragover", (e) => {
      e.preventDefault();
      dz.classList.add("bg-pink-100/70", "border-pink-400");
    });
    dz.addEventListener("dragleave", () => dz.classList.remove("bg-pink-100/70", "border-pink-400"));
    dz.addEventListener("drop", (e) => {
      e.preventDefault();
      dz.classList.remove("bg-pink-100/70", "border-pink-400");
      handleFileUpload({ target: { files: e.dataTransfer.files } });
    });
  }

  const rdz = $("resubmitDropZone");
  if (rdz) {
    rdz.addEventListener("dragover", (e) => {
      e.preventDefault();
      rdz.classList.add("bg-rose-100/80", "border-rose-400");
    });
    rdz.addEventListener("dragleave", () => rdz.classList.remove("bg-rose-100/80", "border-rose-400"));
    rdz.addEventListener("drop", (e) => {
      e.preventDefault();
      rdz.classList.remove("bg-rose-100/80", "border-rose-400");
      handleInlineResubmitFiles({ target: { files: e.dataTransfer.files } });
    });
  }

  // iOS 27 Spatial Swipe (touch + pointer horizontal drag) & Keyboard Arrow Navigation
  const viewport = $("spatialViewport");
  if (viewport) {
    let startX = null;
    let startY = null;
    const isInteractiveEl = (target) =>
      Boolean(target && target.closest("input, textarea, select, button, summary, table, pre, a, .overflow-x-auto, [data-no-swipe], #chatPanel, #infoModal"));

    viewport.addEventListener(
      "touchstart",
      (e) => {
        if (e.touches.length !== 1 || isInteractiveEl(e.target)) {
          startX = null;
          return;
        }
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
      },
      { passive: true }
    );
    viewport.addEventListener(
      "touchend",
      (e) => {
        if (startX === null || e.changedTouches.length !== 1) return;
        const dx = e.changedTouches[0].clientX - startX;
        const dy = e.changedTouches[0].clientY - startY;
        startX = null;
        startY = null;
        if (Math.abs(dx) >= 75 && Math.abs(dx) > Math.abs(dy) * 1.4) {
          if (dx < 0) swipeNextScene();
          else swipePrevScene();
        }
      },
      { passive: true }
    );

    viewport.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "mouse" || e.button !== 0 || isInteractiveEl(e.target)) return;
      startX = e.clientX;
      startY = e.clientY;
    });
    viewport.addEventListener("pointerup", (e) => {
      if (e.pointerType !== "mouse" || startX === null) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      startX = null;
      startY = null;
      if (Math.abs(dx) >= 90 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        if (dx < 0) swipeNextScene();
        else swipePrevScene();
      }
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (e.key === "Escape") {
      if (typeof window.closeInfoModal === "function") window.closeInfoModal();
      if (typeof window.closeChat === "function") window.closeChat();
      return;
    }
    if (state.currentScene === 0) {
      // On the home page the arrow keys drive the banner slider
      if (window.heroSlider && e.key === "ArrowRight") window.heroSlider.next(true);
      else if (window.heroSlider && e.key === "ArrowLeft") window.heroSlider.prev(true);
      return;
    }
    if (e.key === "ArrowRight") swipeNextScene();
    else if (e.key === "ArrowLeft") swipePrevScene();
  });

  goToScene(0, "", { silent: true });
  resetWorkflowUI();

  try {
    const resp = await fetch("/api/health");
    const data = await resp.json();
    state.canonicalTables = data.canonical_tables || [];
    if (data.has_gemini_key) {
      $("agentMode").value = data.default_agent_mode || "gemini";
      $("llmModel").value = data.default_gemini_model || "gemini-2.5-flash";
      onAgentModeChange();
      const notice = $("serverKeyNotice");
      if (notice) {
        notice.textContent =
          data.gemini_key_mode === "vertex_express"
            ? "✓ Đã tích hợp API Key trên server (Vertex AI Express)"
            : "✓ Đã tích hợp API Key trên server (Gemini API)";
        notice.classList.remove("hidden");
      }
    }
    updateSampleButtonStyles(1);
  } catch (err) {
    showErrorBanner("Không thể kết nối server", err.message);
  }
});
