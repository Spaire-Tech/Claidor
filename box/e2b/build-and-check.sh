#!/usr/bin/env bash
# Build Simeon's cloud computer as an E2B template and measure a test
# computer made from it, from a Mac (or any machine) with this repository
# (16 October 2026). The build itself runs on E2B's machines; this only
# sends it the files box/Dockerfile copies in. The same as the GitHub
# workflow `.github/workflows/e2b_template.yml`, without GitHub.
#
#   git pull
#   bash box/e2b/build-and-check.sh            # template "simeon-box"
#
# It asks for the E2B API key (the one on Render) without showing it, keeps
# it only for this run, and never writes it anywhere. It uses uv, which
# fetches the Python it needs (3.12) into its own cache; uv is installed for
# this user first if it is missing.
set -euo pipefail

cd "$(dirname "$0")/../.."
NAME="${1:-simeon-box}"

if ! command -v uv >/dev/null 2>&1; then
  echo "Installing uv (runs Python tools without touching the system Python)..."
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="$HOME/.local/bin:$PATH"
fi

if [ -z "${E2B_API_KEY:-}" ]; then
  printf 'E2B API key (not shown, not saved): '
  read -rs E2B_API_KEY
  echo
  export E2B_API_KEY
fi
if [ -z "$E2B_API_KEY" ]; then
  echo "No key given." >&2
  exit 2
fi

run() {
  uv run --quiet --no-project --python 3.12 \
    --with "e2b==2.56.0" --with "httpx>=0.27" \
    python "$@"
}

echo "== Building the template \"$NAME\" on E2B (this can take a while)"
run box/e2b/build_template.py "$NAME"

echo
echo "== Making a test computer from it and measuring it"
run box/e2b/check_template.py "$NAME"
echo
echo "Done. Send the measurements above (the JSON) back; they hold no key."
