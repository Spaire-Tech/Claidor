#!/usr/bin/env bash
# Build Simeon's cloud computer for Azure Container Apps Sandboxes and measure
# a test computer made from it, from a Mac with this repository (12 November
# 2026). The build runs in Azure (`az acr build`); nothing is built on the Mac.
#
#   git pull
#   az login
#   bash box/azure/build.sh                    # the registry "simeoncomputers"
#   bash box/azure/build.sh simeoncomputers2   # another registry name
#   bash box/azure/build.sh --check-only simeon-box-<…>   # measure only
#
# 1. Builds box/azure/Dockerfile (box2's image with simeon-vm-init) into the
#    registry, tagged with this commit.
# 2. Makes the sandbox group's disk image from it (box/azure/disk_image.py),
#    named simeon-box-<commit>-<time>, and prints the line for Render
#    (SIMEON_AZURE_DISK_IMAGE). A new name on Render gives each person a new
#    computer at their next start, as a new image does on Docker.
# 3. Makes one test computer from it and measures it
#    (box/azure/check_sandbox.py, about 20 minutes), then removes it.
#
# It signs in as you (`az login`); your account needs the role "Container
# Apps SandboxGroup Data Owner" on the sandbox group (docs/ops/box-host/
# azure-plan.md, Step 0). No secret is asked for, written or printed. It uses
# uv, which fetches the Python it needs into its own cache; uv is installed
# for this user first if it is missing.
set -euo pipefail

cd "$(dirname "$0")/../.."

CHECK_ONLY=""
if [ "${1:-}" = "--check-only" ]; then
  CHECK_ONLY="${2:?the disk image name to measure}"
fi
REGISTRY="${1:-${SIMEON_AZURE_REGISTRY:-simeoncomputers}}"

if ! command -v az >/dev/null 2>&1; then
  echo "Install the Azure command line first: brew install azure-cli" >&2
  exit 2
fi
if ! az account show >/dev/null 2>&1; then
  echo "Sign in to Azure first: az login" >&2
  exit 2
fi
if ! command -v uv >/dev/null 2>&1; then
  echo "Installing uv (runs Python tools without touching the system Python)..."
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="$HOME/.local/bin:$PATH"
fi

run() {
  uv run --quiet --no-project --python 3.12 \
    --with "httpx==0.28.1" --with "websockets==14.1" \
    python "$@"
}

if [ -n "$CHECK_ONLY" ]; then
  echo "== Measuring a test computer made from $CHECK_ONLY"
  run box/azure/check_sandbox.py "$CHECK_ONLY"
  exit $?
fi

COMMIT=$(git rev-parse --short=12 HEAD)
NAME="simeon-box-$COMMIT-$(date -u +%Y%m%d%H%M)"

echo "== Building the image in Azure (registry $REGISTRY, simeon-box:$COMMIT)"
(cd box && az acr build --registry "$REGISTRY" --image "simeon-box:$COMMIT" \
  --file azure/Dockerfile .)
DIGEST=$(az acr repository show --name "$REGISTRY" --image "simeon-box:$COMMIT" \
  --query digest -o tsv)
IMAGE_URL="$REGISTRY.azurecr.io/simeon-box@$DIGEST"

echo
echo "== Making the disk image $NAME from $IMAGE_URL"
run box/azure/disk_image.py "$IMAGE_URL" "$NAME" "$REGISTRY"

echo
echo "== Making a test computer from it and measuring it (about 20 minutes)"
run box/azure/check_sandbox.py "$NAME"
echo
echo "Done. Send the measurements above (the JSON) back; they hold no secret."
