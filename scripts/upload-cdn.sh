#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# Upload Spaire CDN assets to Cloudflare R2
#
# Prerequisites:
#   1. npm install -g wrangler
#   2. Set environment variables below (or export before running)
#
# Usage:
#   ./scripts/upload-cdn.sh
# ============================================================

CLOUDFLARE_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-a2492d824e26542c6a4455d350f05850}"
BUCKET_NAME="${R2_BUCKET_NAME:-spaire-cdn}"

# Check wrangler is installed
if ! command -v wrangler &> /dev/null; then
  echo "Error: wrangler CLI not found. Install with: npm install -g wrangler"
  exit 1
fi

# Check authentication
echo "Checking Cloudflare authentication..."
if ! CLOUDFLARE_ACCOUNT_ID="$CLOUDFLARE_ACCOUNT_ID" wrangler whoami &> /dev/null; then
  echo "Not authenticated. Run: wrangler login"
  echo "Or set CLOUDFLARE_API_TOKEN environment variable."
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

EMBED_JS="$ROOT_DIR/clients/packages/checkout/dist/embed.global.js"
SETUP_CHECKOUT_MD="$ROOT_DIR/.claude/commands/setup-checkout.md"
SETUP_BILLING_MD="$ROOT_DIR/.claude/commands/setup-usage-billing.md"

# Verify files exist
for f in "$EMBED_JS" "$SETUP_CHECKOUT_MD" "$SETUP_BILLING_MD"; do
  if [ ! -f "$f" ]; then
    echo "Error: File not found: $f"
    echo "Run 'cd clients/packages/checkout && pnpm build' first."
    exit 1
  fi
done

export CLOUDFLARE_ACCOUNT_ID

echo ""
echo "Uploading to R2 bucket: $BUCKET_NAME"
echo "==========================================="

# 1. Embed script (cache 1 hour at browser, 1 day at CDN edge)
echo ""
echo "[1/3] Uploading checkout/embed.js ..."
wrangler r2 object put "$BUCKET_NAME/checkout/embed.js" \
  --file "$EMBED_JS" \
  --content-type "application/javascript" \
  --cache-control "public, max-age=3600, s-maxage=86400" \
  --remote

# 2. Setup checkout command
echo ""
echo "[2/3] Uploading claude/commands/setup-checkout.md ..."
wrangler r2 object put "$BUCKET_NAME/claude/commands/setup-checkout.md" \
  --file "$SETUP_CHECKOUT_MD" \
  --content-type "text/markdown" \
  --cache-control "public, max-age=300" \
  --remote

# 3. Setup usage billing command
echo ""
echo "[3/3] Uploading claude/commands/setup-usage-billing.md ..."
wrangler r2 object put "$BUCKET_NAME/claude/commands/setup-usage-billing.md" \
  --file "$SETUP_BILLING_MD" \
  --content-type "text/markdown" \
  --cache-control "public, max-age=300" \
  --remote

echo ""
echo "==========================================="
echo "All files uploaded successfully!"
echo ""
echo "Verify with:"
echo "  curl -I https://cdn.spairehq.com/checkout/embed.js"
echo "  curl -I https://cdn.spairehq.com/claude/commands/setup-checkout.md"
echo "  curl -I https://cdn.spairehq.com/claude/commands/setup-usage-billing.md"
