#!/bin/sh
set -eu

LOG_DIR=/tmp/medusa-runtime
LOG_FILE="$LOG_DIR/start.log"
PORT="${PORT:-9000}"
APP_DIR="${MEDUSA_APP_DIR:-/app}"
BUILD_DIR="${MEDUSA_BUILD_DIR:-$APP_DIR/.medusa/server}"
CLI_PATH="${MEDUSA_CLI_PATH:-$APP_DIR/node_modules/.bin/medusa}"

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

if [ -d "$BUILD_DIR" ] && [ -f "$BUILD_DIR/medusa-config.js" ]; then
  RUNTIME_DIR="$BUILD_DIR"
else
  RUNTIME_DIR="$APP_DIR"
fi

write_env_file() {
  target_dir="$1"
  target_file="$target_dir/.env"

  append_if_set() {
    key="$1"
    value="$2"

    if [ -n "$value" ]; then
      printf '%s=%s\n' "$key" "$value"
    fi
  }

  {
    append_if_set "DATABASE_URL" "${DATABASE_URL:-}"
    append_if_set "JWT_SECRET" "${JWT_SECRET:-}"
    append_if_set "COOKIE_SECRET" "${COOKIE_SECRET:-}"
    append_if_set "STORE_CORS" "${STORE_CORS:-}"
    append_if_set "ADMIN_CORS" "${ADMIN_CORS:-}"
    append_if_set "AUTH_CORS" "${AUTH_CORS:-}"
    append_if_set "REDIS_URL" "${REDIS_URL:-}"
    printf 'MEDUSA_DISABLE_ADMIN=%s\n' "${MEDUSA_DISABLE_ADMIN:-false}"
  } >"$target_file"
}

write_env_file "$RUNTIME_DIR"
cd "$RUNTIME_DIR"

run_step "Running Medusa database setup" "$CLI_PATH" db:setup --no-interactive --execute-all-links

if [ -n "${MEDUSA_ADMIN_EMAIL:-}" ] && [ -n "${MEDUSA_ADMIN_PASSWORD:-}" ]; then
  run_step \
    "Ensuring Medusa admin user" \
    sh -lc \
    "\"$CLI_PATH\" user -e \"${MEDUSA_ADMIN_EMAIL}\" -p \"${MEDUSA_ADMIN_PASSWORD}\" || true"
fi

printf '\n==> Starting Medusa from %s\n' "$RUNTIME_DIR" >>"$LOG_FILE"
"$CLI_PATH" start >>"$LOG_FILE" 2>&1 &
child_pid=$!

wait "$child_pid"
status=$?

if [ "$status" -ne 0 ]; then
  printf '\n==> Medusa exited with status %s\n' "$status" >>"$LOG_FILE"
  serve_logs "$status"
fi

exit 0
