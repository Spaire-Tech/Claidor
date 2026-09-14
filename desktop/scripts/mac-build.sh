#!/usr/bin/env bash
#
# Build the desktop app on a Mac, without GitHub.
#
# The macOS workflow does five things: check out, install Node, install
# pnpm, `npm install`, `npm run dist:mac:<arch>`. None of them need
# GitHub, and GitHub charges ten times the rate for a macOS runner. This
# is the same build, on your own machine, for nothing.
#
#   cd desktop && npm run mac:build
#
# Stops at the first failure rather than carrying on and producing half
# an app.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$here"

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
stop() { printf '\n\033[31m%s\033[0m\n\n' "$*" >&2; exit 1; }

# --- the three things that have to be true --------------------------------

[ "$(uname -s)" = "Darwin" ] || stop \
  "This builds a Mac app and has to run on a Mac. You are on $(uname -s)."

command -v node >/dev/null 2>&1 || stop \
  "Node is not installed. The app needs Node 24 (>=24.15.0 <25).
Install it from https://nodejs.org or with: brew install node@24"

# `package.json` pins >=24.15.0 <25. A 22 or a 25 fails somewhere in the
# middle of a twenty-minute build, which is a bad place to find out.
node_version="$(node -p 'process.versions.node')"
node_major="${node_version%%.*}"
node_minor="$(printf '%s' "$node_version" | cut -d. -f2)"
if [ "$node_major" != "24" ] || [ "$node_minor" -lt 15 ]; then
  stop "Node $node_version is not what this builds with: it needs 24.15.0 or later, below 25.
If you use nvm:  nvm install 24 && nvm use 24"
fi

if ! command -v pnpm >/dev/null 2>&1; then
  say "Installing pnpm (the OpenClaw engine builds with it)"
  npm install -g pnpm@10
fi

# --- which Mac ------------------------------------------------------------

case "$(uname -m)" in
  arm64) target="dist:mac:arm64"; arch="Apple Silicon" ;;
  x86_64) target="dist:mac:x64"; arch="Intel" ;;
  *) stop "Unknown processor: $(uname -m)" ;;
esac

# --- build ----------------------------------------------------------------

# No certificate yet, so ask electron-builder for an unsigned app rather
# than letting it fail looking for one. Same two settings the workflow uses.
export CSC_IDENTITY_AUTO_DISCOVERY="false"
export ELECTRON_BUILDER_ALLOW_UNRESOLVED_DEPENDENCIES="true"
# The renderer bundle needs more heap than Node gives by default.
export NODE_OPTIONS="--max-old-space-size=6144"

say "Installing dependencies — a few minutes the first time"
npm install --no-audit --no-fund

say "Building for $arch. This takes about twenty minutes; most of it is the engine."
npm run "$target"

# --- where it went --------------------------------------------------------

say "Done. What was built:"
ls -la release 2>/dev/null | grep -v '\.blockmap' || stop \
  "The build finished but release/ is empty, which should not happen. Read the output above."

cat <<'NOTE'

The app is unsigned, because there is no Apple certificate yet. macOS
will call it damaged on first launch — that is the quarantine flag, not
the app. Either right-click the app and choose Open, or run:

    xattr -dr com.apple.quarantine /Applications/<the app>.app

To just run it without building an installer at all, which is faster and
has no quarantine problem:

    npm run electron:dev:openclaw   # first time — builds the engine too
    npm run electron:dev            # after that

NOTE
