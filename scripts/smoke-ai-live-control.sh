#!/usr/bin/env bash
set -euo pipefail

STORE_BASE_URL="${STORE_BASE_URL:-http://23.94.38.181:38000}"
API_BASE_URL="${API_BASE_URL:-http://medusa-store-ga7di9-4e3642-23-94-38-181.traefik.me}"
PUBLISHABLE_KEY="${PUBLISHABLE_KEY:-pk_5472dbd7d48adfb5a84a8afeddcd42e7cbaeb4472f1051d798314512f4872fb1}"
REGION_ID="${REGION_ID:-reg_01KK6SYAG4ANA6V91PM92MX62S}"

workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT

retry_curl() {
  local attempts="${1}"
  shift

  local try
  for try in $(seq 1 "$attempts"); do
    if curl "$@"; then
      return 0
    fi

    if [ "$try" -lt "$attempts" ]; then
      sleep 1
    fi
  done

  return 1
}

check_http() {
  local label="$1"
  local url="$2"
  local headers="$workdir/headers-$(echo "$label" | tr ' ' '-')"
  local headers_follow="$headers-follow"

  retry_curl 5 -sS -D "$headers" -o /dev/null "$url"
  local status
  status="$(awk 'toupper($1) ~ /^HTTP/ { code=$2 } END { print code }' "$headers")"

  if [ "$status" = "307" ]; then
    local cookie
    cookie="$(awk 'BEGIN{IGNORECASE=1} /^set-cookie:/ {split($2, parts, ";"); print parts[1]; exit}' "$headers")"

    if [ -n "$cookie" ]; then
      retry_curl 5 -sS -H "Cookie: $cookie" -D "$headers_follow" -o /dev/null "$url"
      status="$(awk 'toupper($1) ~ /^HTTP/ { code=$2 } END { print code }' "$headers_follow")"
    fi
  fi

  if [ "$status" != "200" ]; then
    echo "[FAIL] $label -> HTTP $status ($url)"
    exit 1
  fi

  echo "[OK] $label -> HTTP 200"
}

check_http "Homepage" "$STORE_BASE_URL/gb"
check_http "Category Tops" "$STORE_BASE_URL/gb/categories/tops"
check_http "Category Bottoms" "$STORE_BASE_URL/gb/categories/bottoms"
check_http "Product Tee" "$STORE_BASE_URL/gb/products/ai-studio-tee"
check_http "Product Hoodie" "$STORE_BASE_URL/gb/products/ai-utility-hoodie"

products_json="$workdir/products.json"
retry_curl 5 -sS "$API_BASE_URL/store/products?limit=20&region_id=$REGION_ID" \
  -H "x-publishable-api-key: $PUBLISHABLE_KEY" > "$products_json"

product_count="$(node -e 'const fs=require("fs"); const data=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); console.log(data.count || 0);' "$products_json")"
if [ "$product_count" -lt 6 ]; then
  echo "[FAIL] Product count too low: $product_count"
  exit 1
fi
echo "[OK] Catalog count -> $product_count products"

tee_variant_id="$(node -e 'const fs=require("fs"); const data=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); const product=(data.products||[]).find((item)=>item.handle==="ai-studio-tee"); const variant=product?.variants?.[0]?.id; if(!variant){process.exit(1)} console.log(variant);' "$products_json")"

cart_json="$workdir/cart.json"
retry_curl 5 -sS -X POST "$API_BASE_URL/store/carts" \
  -H "x-publishable-api-key: $PUBLISHABLE_KEY" \
  -H "Content-Type: application/json" \
  --data-binary '{}' > "$cart_json"

cart_id="$(node -e 'const fs=require("fs"); const data=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); const cart=data.cart?.id; if(!cart){process.exit(1)} console.log(cart);' "$cart_json")"
echo "[OK] Cart created -> $cart_id"

line_item_json="$workdir/line-item.json"
retry_curl 5 -sS -X POST "$API_BASE_URL/store/carts/$cart_id/line-items" \
  -H "x-publishable-api-key: $PUBLISHABLE_KEY" \
  -H "Content-Type: application/json" \
  --data-binary "{\"variant_id\":\"$tee_variant_id\",\"quantity\":1}" > "$line_item_json"

line_item_count="$(node -e 'const fs=require("fs"); const data=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); const count=data.cart?.items?.length || 0; console.log(count);' "$line_item_json")"
if [ "$line_item_count" -lt 1 ]; then
  echo "[FAIL] Cart add-item did not persist"
  exit 1
fi
echo "[OK] Cart add-item -> $line_item_count item(s)"

echo "Smoke test passed."
