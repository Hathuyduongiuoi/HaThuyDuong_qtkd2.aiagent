#!/bin/zsh
cd "$(dirname "$0")"
echo "Đang khởi động Hà Thuỳ Dương BI trên http://localhost:8000..."
python3 -B app.py --host 127.0.0.1 --port 8000 --open || python3 -B app.py --host 127.0.0.1 --port 8001 --open
