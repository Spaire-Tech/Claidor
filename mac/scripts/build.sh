#!/bin/bash
# One command on a Mac: make the project, build the Mac app, and open it.
#
#   mac/scripts/build.sh            # build and open
#
# If the build fails, the errors are copied to the clipboard (and kept in
# mac/build/errors.txt), ready to paste to whoever is fixing them.
set -euo pipefail
cd "$(dirname "$0")/.."

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }

say "Checking Xcode and macOS"
if ! xcodebuild -version >/dev/null 2>&1; then
  XCODE=$(ls -d /Applications/Xcode*.app 2>/dev/null | sort -V | tail -1 || true)
  if [ -n "$XCODE" ]; then
    echo "Xcode is installed ($XCODE) but the Mac is pointed at the command line tools."
    echo "Switching to Xcode and accepting its licence: your Mac password, once."
    sudo xcode-select -s "$XCODE/Contents/Developer"
    sudo xcodebuild -license accept
    sudo xcodebuild -runFirstLaunch
  else
    echo "Xcode is not installed. The App Store opens on it: install it, open it once, then run this again."
    open "macappstore://apps.apple.com/app/xcode/id497799835" || true
    exit 1
  fi
fi
xcodebuild -version | head -1
major=$(xcodebuild -version | head -1 | sed -E 's/Xcode ([0-9]+).*/\1/')
if [ "$major" -lt 26 ]; then
  echo "This needs Xcode 26 or later (Liquid Glass). Update Xcode from the App Store, then run this again."
  exit 1
fi
os=$(sw_vers -productVersion | cut -d. -f1)
if [ "$os" -lt 26 ]; then
  echo "Note: this Mac runs macOS $(sw_vers -productVersion). The app builds here, but it opens only on macOS 26 or later."
fi

say "Making the Xcode project"
if ! command -v xcodegen >/dev/null 2>&1; then
  if ! command -v brew >/dev/null 2>&1; then
    echo "XcodeGen is needed, and Homebrew to install it: see https://brew.sh, then run this again."
    exit 1
  fi
  brew install xcodegen
fi
xcodegen generate --quiet

say "Building (the first time takes a few minutes)"
mkdir -p build
if ! xcodebuild -project SimeonMac.xcodeproj -scheme Simeon -configuration Debug \
    -destination 'platform=macOS' -derivedDataPath build build > build/build.log 2>&1; then
  # Each error with the lines the compiler printed under it (the code and its notes), paths from the repository.
  grep -E -A6 "^/.*: error:" build/build.log | sed -E "s#$(cd .. && pwd)/##g" > build/errors.txt || true
  [ -s build/errors.txt ] || tail -40 build/build.log > build/errors.txt
  pbcopy < build/errors.txt
  echo "The build failed. The errors (also copied to your clipboard, and in mac/build/errors.txt):"
  echo
  cat build/errors.txt
  echo
  echo "Paste them in the chat."
  exit 1
fi
echo "Built: mac/build/Build/Products/Debug/Simeon.app"

if [ "$(sw_vers -productVersion | cut -d. -f1)" -ge 26 ]; then
  say "Opening Simeon"
  open -n build/Build/Products/Debug/Simeon.app --args "$@"
fi
