#!/bin/bash
# Tự động cập nhật app "tuhoc" (chạy bằng PM2, không dùng Docker) khi nhánh main trên GitHub có commit mới.
# Cron gọi script này 2 phút/lần (xem README.deploy.md mục "Tự cập nhật với PM2").
#
#   deploy/auto-deploy-pm2.sh           # chỉ làm gì đó khi GitHub có commit mới
#   deploy/auto-deploy-pm2.sh --force   # chạy lại các bước cài đặt dù không có commit mới
#
# An toàn:
# - Chỉ ĐỌC từ GitHub (repo công khai) — VPS không cần giữ mật khẩu/khoá GitHub nào.
# - Chỉ cập nhật kiểu fast-forward: nếu code trên VPS bị sửa tay khác với GitHub thì DỪNG, không ghi đè.
# - Lỗi ở bước nào thì dừng ở bước đó, KHÔNG khởi động lại app — bản đang chạy vẫn tiếp tục chạy.
set -euo pipefail
cd "$(dirname "$0")/.."   # luôn chạy từ thư mục gốc repo, bất kể cron gọi từ đâu

APP_NAME="${APP_NAME:-tuhoc}"
LOG_FILE="deploy-cron.log"
log() { echo "$(date '+%F %T') $1" >> "$LOG_FILE"; }

exec 200>/tmp/tuhoc-dk-autodeploy-pm2.lock
flock -n 200 || exit 0   # lần chạy trước chưa xong thì bỏ qua lần này

git fetch origin main --quiet
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

if [ "$LOCAL" = "$REMOTE" ] && [ "${1:-}" != "--force" ]; then
  exit 0   # không có gì mới — im lặng thoát, không ghi log cho đỡ rác
fi

trap 'log "LỖI — dừng lại, app vẫn chạy bản cũ. Xem các dòng phía trên."' ERR

if [ "$LOCAL" != "$REMOTE" ]; then
  log "Có code mới (${LOCAL:0:7} -> ${REMOTE:0:7}), đang cập nhật..."
  if ! git merge --ff-only origin/main >> "$LOG_FILE" 2>&1; then
    log "Code trên VPS khác với GitHub (có sửa tay?) — KHÔNG cập nhật. Kiểm tra bằng: git status; git log --oneline -5"
    exit 1
  fi
else
  log "Chạy lại cài đặt (--force) ở ${LOCAL:0:7}..."
fi

npm install --omit=dev --no-audit --no-fund >> "$LOG_FILE" 2>&1
node -r dotenv/config src/migrate.js >> "$LOG_FILE" 2>&1
pm2 restart "$APP_NAME" --update-env >> "$LOG_FILE" 2>&1
log "Cập nhật xong — đang chạy $(git rev-parse --short HEAD)."
