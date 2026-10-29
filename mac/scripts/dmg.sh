#!/bin/bash
# The disk image people download (29 October 2026): Simeon and an Applications link in a window with the clay
# faces (mac/dmg/background.png and @2x, made by mac/dmg/background.cjs), each icon where the picture leaves
# it a place.
#
#   mac/scripts/dmg.sh <Simeon.app> <out.dmg>   # what release.sh runs; the image is left unsigned
#   mac/scripts/dmg.sh                          # from build.sh's app, to look at: mac/build/Simeon.dmg, opened
#
# Finder lays the window out, so the first time macOS asks to let Terminal control Finder: allow it (or in
# System Settings › Privacy & Security › Automation). A Simeon disk already open is ejected first, as Finder
# would not know which of the two to lay out.
set -euo pipefail
cd "$(dirname "$0")/.."
MAC=$(pwd)

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
fail() { printf '\n\033[31m%s\033[0m\n' "$*"; exit 1; }

[ "$(uname)" = "Darwin" ] || fail "A disk image is made on a Mac."
APP="${1:-$MAC/build/Build/Products/Debug/Simeon.app}"
DMG="${2:-$MAC/build/Simeon.dmg}"
LOOK=$([ $# -eq 0 ] && echo 1 || echo 0)
[ -d "$APP" ] || fail "There is no app at $APP (mac/scripts/build.sh makes one)."

NAME="Simeon"
# The window, in points: its place on the screen and its size (the picture's), and each icon's centre, as
# mac/dmg/background.cjs draws around them.
WINDOW_X=200
WINDOW_Y=120
WIDTH=720
HEIGHT=480
APP_AT="210, 215"
APPLICATIONS_AT="510, 215"

WORK=$(mktemp -d "${TMPDIR:-/tmp}/simeon-dmg.XXXXXX")
DEVICE=""
cleanup() {
  [ -n "$DEVICE" ] && hdiutil detach "$DEVICE" -force -quiet 2>/dev/null || true
  rm -rf "$WORK"
}
trap cleanup EXIT

say "Making the disk image"
STAGE="$WORK/stage"
mkdir -p "$STAGE/.background"
ditto "$APP" "$STAGE/Simeon.app"
ln -s /Applications "$STAGE/Applications"
# One file with both sizes, so a Retina screen shows the @2x picture.
tiffutil -cathidpicheck "$MAC/dmg/background.png" "$MAC/dmg/background@2x.png" -out "$STAGE/.background/background.tiff" > /dev/null
# The disk's own icon on the desktop: the app's.
ICON_FILE=$(/usr/libexec/PlistBuddy -c "Print :CFBundleIconFile" "$APP/Contents/Info.plist" 2>/dev/null || true)
ICON="$APP/Contents/Resources/${ICON_FILE%.icns}.icns"
if [ -n "$ICON_FILE" ] && [ -f "$ICON" ]; then
  cp "$ICON" "$STAGE/.VolumeIcon.icns"
fi

if [ -d "/Volumes/$NAME" ]; then
  echo "Ejecting the Simeon disk that is open."
  hdiutil detach "/Volumes/$NAME" -quiet || fail "The Simeon disk that is open could not be ejected. Eject it in Finder, then run this again."
fi
SIZE=$(( $(du -sm "$STAGE" | cut -f1) + 20 ))
hdiutil create -volname "$NAME" -srcfolder "$STAGE" -fs HFS+ -format UDRW -size "${SIZE}m" -ov "$WORK/edit.dmg" > /dev/null
ATTACHED=$(hdiutil attach "$WORK/edit.dmg" -readwrite -noverify -noautoopen)
DEVICE=$(grep -E '^/dev/' <<<"$ATTACHED" | head -1 | awk '{print $1}')
MOUNT=$(grep -E '/Volumes/' <<<"$ATTACHED" | tail -1 | sed -E 's#^.*(/Volumes/.*)$#\1#')
[ "$MOUNT" = "/Volumes/$NAME" ] || fail "The disk opened at $MOUNT, not /Volumes/$NAME."
if [ -f "$MOUNT/.VolumeIcon.icns" ] && xcrun --find SetFile > /dev/null 2>&1; then
  xcrun SetFile -a C "$MOUNT"
fi

say "Laying out the window (Finder)"
osascript > /dev/null <<APPLESCRIPT || fail "Finder could not lay out the window. If macOS asked, allow Terminal to control Finder (System Settings › Privacy & Security › Automation), then run this again."
tell application "Finder"
  tell disk "$NAME"
    open
    tell container window
      set current view to icon view
      set toolbar visible to false
      set statusbar visible to false
      set bounds to {$WINDOW_X, $WINDOW_Y, $((WINDOW_X + WIDTH)), $((WINDOW_Y + HEIGHT))}
    end tell
    set viewOptions to icon view options of container window
    tell viewOptions
      set arrangement to not arranged
      set icon size to 128
      set text size to 13
      set shows item info to false
      set shows icon preview to false
    end tell
    set background picture of viewOptions to file ".background:background.tiff"
    -- Hidden files, when Finder shows them, stay out of sight past the window's right edge.
    set position of every item of container window to {$((WIDTH + 200)), 100}
    set position of item "Simeon.app" of container window to {$APP_AT}
    set position of item "Applications" of container window to {$APPLICATIONS_AT}
    update without registering applications
    close
    open
    delay 1
    close
  end tell
  delay 2
end tell
APPLESCRIPT
# Finder writes the layout into .DS_Store when it is ready.
for _ in $(seq 1 30); do
  [ -f "$MOUNT/.DS_Store" ] && break
  sleep 1
done
[ -f "$MOUNT/.DS_Store" ] || fail "Finder did not save the window's layout."
rm -rf "$MOUNT/.fseventsd"
sync

for attempt in 1 2 3 4 5; do
  hdiutil detach "$DEVICE" -quiet && DEVICE="" && break
  [ "$attempt" = 5 ] || sleep 2
done
[ -z "$DEVICE" ] || { hdiutil detach "$DEVICE" -force -quiet; DEVICE=""; }

mkdir -p "$(dirname "$DMG")"
rm -f "$DMG"
hdiutil convert "$WORK/edit.dmg" -format UDZO -imagekey zlib-level=9 -o "$DMG" > /dev/null
echo "Made: $DMG"
if [ "$LOOK" = 1 ]; then
  open "$DMG"
fi
