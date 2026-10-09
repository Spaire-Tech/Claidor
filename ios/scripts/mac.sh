#!/bin/bash
# One command on a Mac: make the project, build the app for the iPhone
# Simulator, photograph every screen on the demo's agents (light and dark),
# and leave the app open in the Simulator to try.
#
#   ios/scripts/mac.sh
#
# If the build fails, the errors are copied to the clipboard (and kept in
# ios/build/errors.txt), ready to paste to whoever is fixing them.
set -euo pipefail
cd "$(dirname "$0")/.."

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }

say "Checking Xcode"
if ! xcodebuild -version >/dev/null 2>&1; then
  XCODE=$(ls -d /Applications/Xcode*.app 2>/dev/null | sort -V | tail -1 || true)
  if [ -n "$XCODE" ]; then
    # Xcode is there, but the Mac points at the command line tools (what a Node or Electron build needs).
    echo "Xcode is installed ($XCODE) but the Mac is pointed at the command line tools."
    echo "Switching to Xcode and accepting its licence: your Mac password, once."
    sudo xcode-select -s "$XCODE/Contents/Developer"
    sudo xcodebuild -license accept
    sudo xcodebuild -runFirstLaunch
  else
    echo "Xcode is not installed. The App Store opens on it: install it (it is large), open it once, then run this again."
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
sudo -n true 2>/dev/null && sudo xcodebuild -runFirstLaunch >/dev/null 2>&1 || true
if ! xcrun simctl list runtimes | grep -q "iOS 2[6-9]"; then
  say "Downloading the iPhone Simulator (once, a few GB)"
  xcodebuild -downloadPlatform iOS
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
if ! xcodebuild -project Simeon.xcodeproj -scheme Simeon -configuration Debug \
    -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
    -derivedDataPath build CODE_SIGNING_ALLOWED=NO build > build/build.log 2>&1; then
  grep -E "error:" build/build.log | sed -E "s#^$(pwd)/##" | sort -u > build/errors.txt || true
  [ -s build/errors.txt ] || tail -40 build/build.log > build/errors.txt
  pbcopy < build/errors.txt
  echo "The build failed. $(wc -l < build/errors.txt | tr -d ' ') lines of errors are copied to your clipboard:"
  echo "paste them in the chat. (They are also in ios/build/errors.txt.)"
  exit 1
fi
echo "Built."

say "Photographing every screen, light and dark (about three minutes)"
scripts/screens.sh build/Build/Products/Debug-iphonesimulator/Simeon.app screens
open screens

say "Opening the app in the Simulator, on the demo"
# From inside the Xcode in use; by its bundle id when that path moves (a fresh Xcode is not always known to Launch Services yet).
SIMULATOR="$(xcode-select -p)/Applications/Simulator.app"
open "$SIMULATOR" 2>/dev/null || open -b com.apple.iphonesimulator 2>/dev/null || echo "Open the Simulator from Xcode: Xcode menu, Open Developer Tool, Simulator."
xcrun simctl ui booted appearance light || true
xcrun simctl launch booted com.simeonlabs.simeon.ios --demo >/dev/null
echo "Done. The screenshots are in ios/screens (the Finder window that opened): drag them into the chat."
