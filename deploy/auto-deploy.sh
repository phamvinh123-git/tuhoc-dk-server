#!/bin/bash
# Tự động kiểm tra GitHub (nhánh main) có commit mới không — nếu có thì pull về và chạy lại
# "docker compose up -d --build" để deploy. Chạy định kỳ qua cron (xem README.deploy.md mục
# "Tự động deploy khi có code mới" để biết cách thiết lập cron).
#
# An toàn khi chạy lặp lại / chạy chồng lấn: dùng flock để tránh 2 lần chạy cùng lúc nếu lần trước
# chưa xong mà cron đã gọi lần tiếp theo.
set -euo pipefail
cd "$(dirname "$0")/.."   # luôn chạy từ thư mục gốc repo, bất kể cron gọi script từ đâu

exec 200>/tmp/tuhoc-dk-autodeploy.lock
flock -n 200 || exit 0   # đang có lần chạy khác dở dang thì bỏ qua lần này, đợi lần cron kế tiếp

LOG_FILE="deploy-cron.log"
log() { echo "$(date '+%F %T') $1" >> "$LOG_FILE"; }

git fetch origin main --quiet
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

# Không có gì mới -> im lặng thoát, không ghi log mỗi lần chạy cho đỡ rác file log.
[ "$LOCAL" = "$REMOTE" ] && exit 0

log "Phát hiện code mới (${LOCAL:0:7} -> ${REMOTE:0:7}), đang deploy..."
git pull origin main --quiet

if docker compose up -d --build >> "$LOG_FILE" 2>&1; then
  log "Deploy thành công."
else
  log "LỖI khi deploy — xem chi tiết ở log phía trên dòng này."
fi
