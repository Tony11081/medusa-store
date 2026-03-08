#!/bin/sh
set -eu

LOG_DIR=/tmp/medusa-runtime
LOG_FILE="$LOG_DIR/start.log"
PORT="${PORT:-9000}"

mkdir -p "$LOG_DIR"
: >"$LOG_FILE"

tail -n +1 -F "$LOG_FILE" >&2 &
tail_pid=$!

cleanup() {
  kill "$tail_pid" >/dev/null 2>&1 || true
}

serve_logs() {
  cleanup

  if command -v busybox >/dev/null 2>&1; then
    cp "$LOG_FILE" "$LOG_DIR/index.html"
    exec busybox httpd -f -p "$PORT" -h "$LOG_DIR"
  fi

  exit "${1:-1}"
}

run_step() {
  step_name="$1"
  shift

  printf '\n==> %s\n' "$step_name" >>"$LOG_FILE"

  if "$@" >>"$LOG_FILE" 2>&1; then
    return 0
  fi

  status=$?
  printf '\n==> %s failed with status %s\n' "$step_name" "$status" >>"$LOG_FILE"
  serve_logs "$status"
}

trap cleanup EXIT INT TERM

run_step "Running Medusa database setup" npx medusa db:setup --no-interactive --execute-all-links

printf '\n==> Starting Medusa\n' >>"$LOG_FILE"
npm run start >>"$LOG_FILE" 2>&1 &
child_pid=$!

wait "$child_pid"
status=$?

if [ "$status" -ne 0 ]; then
  printf '\n==> Medusa exited with status %s\n' "$status" >>"$LOG_FILE"
  serve_logs "$status"
fi

exit 0
