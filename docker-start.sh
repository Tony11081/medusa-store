#!/bin/sh
set -u

LOG_DIR=/tmp/medusa-runtime
LOG_FILE="$LOG_DIR/start.log"

mkdir -p "$LOG_DIR"

npm run start >"$LOG_FILE" 2>&1 &
child_pid=$!

wait "$child_pid"
status=$?

cat "$LOG_FILE" >&2 || true

if [ "$status" -ne 0 ] && command -v busybox >/dev/null 2>&1; then
  cp "$LOG_FILE" "$LOG_DIR/index.html"
  exec busybox httpd -f -p 9000 -h "$LOG_DIR"
fi

exit "$status"
