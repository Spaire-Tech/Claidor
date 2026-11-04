#!/bin/bash
# The Mac's browser (step 4b of docs/app-browser/README.md) put into a built Simeon.app and signed:
#
#   mac/scripts/browser-helper.sh <Simeon.app> <signing identity, or - for this Mac only> [--timestamp]
#
# 1. The helper's code (windows/src/helper/macBrowser.ts), bundled by windows/scripts/build-mac-helper.mjs.
# 2. Electron's own app (windows/node_modules/electron), renamed "Simeon Browser" with its helpers, as
#    Contents/Helpers/Simeon Browser.app (com.simeonlabs.simeon.browser, no Dock icon), the code in
#    Contents/Resources/app.
# 3. Everything in it signed inside out with the identity, the hardened runtime and Simeon/Browser.entitlements,
#    then Simeon.app signed again over it, its own entitlements kept. Run by build.sh and release.sh.
set -euo pipefail
APP="$1"
IDENTITY="$2"
TIMESTAMP="${3:-}"
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
WINDOWS="$ROOT/windows"
ENTITLEMENTS="$ROOT/mac/Simeon/Browser.entitlements"
NAME="Simeon Browser"
ID="com.simeonlabs.simeon.browser"

if [ ! -d "$WINDOWS/node_modules/electron/dist/Electron.app" ] || [ ! -d "$WINDOWS/node_modules/esbuild" ]; then
  echo "Fetching Electron for the browser (windows/node_modules, once)"
  (cd "$WINDOWS" && npm ci --no-audit --no-fund >/dev/null && npm run electron:install >/dev/null)
fi
CODE="$ROOT/mac/build/mac-helper"
rm -rf "$CODE"
(cd "$WINDOWS" && node scripts/build-mac-helper.mjs "$CODE" >/dev/null)

HELPERS="$APP/Contents/Helpers"
BROWSER="$HELPERS/$NAME.app"
rm -rf "$BROWSER"
mkdir -p "$HELPERS"
ditto "$WINDOWS/node_modules/electron/dist/Electron.app" "$BROWSER"
plist() { /usr/libexec/PlistBuddy -c "$2" "$1" 2>/dev/null || true; }
set_key() { plist "$1" "Delete :$2"; /usr/libexec/PlistBuddy -c "Add :$2 $3 $4" "$1"; }

# The app: its name, id and executable, no Dock icon, Electron's sample app gone, ours in its place.
mv "$BROWSER/Contents/MacOS/Electron" "$BROWSER/Contents/MacOS/$NAME"
INFO="$BROWSER/Contents/Info.plist"
set_key "$INFO" CFBundleExecutable string "$NAME"
set_key "$INFO" CFBundleIdentifier string "$ID"
set_key "$INFO" CFBundleName string "$NAME"
set_key "$INFO" CFBundleDisplayName string "$NAME"
set_key "$INFO" LSUIElement bool true
rm -f "$BROWSER/Contents/Resources/default_app.asar"
mkdir -p "$BROWSER/Contents/Resources/app"
cp "$CODE/main.js" "$CODE/package.json" "$BROWSER/Contents/Resources/app/"

# Electron's helpers take the app's name ("<name> Helper (GPU).app"), which is how Electron finds them.
FRAMEWORKS="$BROWSER/Contents/Frameworks"
for suffix in "" " (GPU)" " (Renderer)" " (Plugin)"; do
  old="$FRAMEWORKS/Electron Helper$suffix.app"
  new="$FRAMEWORKS/$NAME Helper$suffix.app"
  [ -d "$old" ] || continue
  mv "$old" "$new"
  mv "$new/Contents/MacOS/Electron Helper$suffix" "$new/Contents/MacOS/$NAME Helper$suffix"
  tail=$(echo "$suffix" | tr -d ' ()' | tr '[:upper:]' '[:lower:]')
  set_key "$new/Contents/Info.plist" CFBundleExecutable string "$NAME Helper$suffix"
  set_key "$new/Contents/Info.plist" CFBundleName string "$NAME Helper$suffix"
  set_key "$new/Contents/Info.plist" CFBundleDisplayName string "$NAME Helper$suffix"
  set_key "$new/Contents/Info.plist" CFBundleIdentifier string "$ID.helper${tail:+.$tail}"
done

# Signed inside out: the libraries and tools, the frameworks, the helpers, then the app.
sign() {
  local said
  said=$(codesign --force --sign "$IDENTITY" --options runtime --entitlements "$ENTITLEMENTS" ${TIMESTAMP:+--timestamp} "$1" 2>&1) || { echo "$said"; exit 1; }
}
while IFS= read -r -d '' file; do sign "$file"; done < <(find "$FRAMEWORKS" -type f \( -name '*.dylib' -o -name chrome_crashpad_handler -o -name app_shim_loader -o -name ShipIt \) -print0)
for framework in "$FRAMEWORKS"/*.framework; do sign "$framework"; done
for helper in "$FRAMEWORKS"/*.app; do sign "$helper"; done
sign "$BROWSER"

# Simeon.app again over its new part, with its own entitlements, flags and requirements.
said=$(codesign --force --sign "$IDENTITY" --options runtime --preserve-metadata=entitlements,requirements,flags ${TIMESTAMP:+--timestamp} "$APP" 2>&1) || { echo "$said"; exit 1; }
codesign --verify --deep --strict "$APP"
echo "The browser is in $(basename "$APP")/Contents/Helpers/$NAME.app, signed."
