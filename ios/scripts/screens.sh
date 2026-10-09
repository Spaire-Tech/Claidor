#!/bin/bash
# The native iPhone app's screens in the iPhone Simulator, light and dark,
# on the demo's agents (no account needed): one PNG per screen in OUT.
#
#   ios/scripts/screens.sh <path to Simeon.app> <out folder>
#
# Run by .github/workflows/ios_native.yml after the build; on a Mac, after
# a Simulator build (ios/README.md), the same.
set -euo pipefail

APP="$1"
OUT="$2"
BUNDLE=com.simeonlabs.simeon.ios
mkdir -p "$OUT"

# The newest iPhone the Simulator has (an iPhone 17 Pro on Xcode 26).
DEVICE=$(xcrun simctl list devices available -j | python3 -c '
import json, sys, re
devices = json.load(sys.stdin)["devices"]
best = None
for runtime, items in devices.items():
    m = re.search(r"iOS-(\d+)-(\d+)", runtime)
    if not m: continue
    version = (int(m.group(1)), int(m.group(2)))
    for d in items:
        if not d["name"].startswith("iPhone"): continue
        pro = " Pro" in d["name"] and "Max" not in d["name"]
        key = (version, pro, d["name"])
        if best is None or key > best[0]: best = (key, d["udid"])
print(best[1] if best else "")
')
if [ -z "$DEVICE" ]; then echo "No iPhone in the Simulator" >&2; exit 1; fi
xcrun simctl list devices | grep "$DEVICE" || true

xcrun simctl boot "$DEVICE" 2>/dev/null || true
xcrun simctl bootstatus "$DEVICE" -b
xcrun simctl status_bar "$DEVICE" override --time "9:41" --batteryState charged --batteryLevel 100 --cellularMode active --cellularBars 4 --wifiBars 3 || true
xcrun simctl install "$DEVICE" "$APP"

# name:screen:seconds to wait before the picture
SCREENS=(
  "1-home::5"
  "2-chat-simeon:chat:simeon:5"
  "3-chat-theo:chat:theo:5"
  "4-group:chat:launch-squad:5"
  "5-new-agent:new-agent:4"
  "6-new-group:new-group:4"
  "7-search:search:4"
  "8-settings:settings:4"
  "9-agent-page:agent:simeon:5"
  "10-call-pill:call:theo:11"
  "11-call-full:call-full:theo:11"
  # Every card the Mac draws, in one chat (`--gallery`, never on a real account).
  "12-cards:chat:cards:6"
  # The list with two agents pinned (`--screen=pins` pins Theo and the Launch squad in the demo).
  "13-pins:pins:4"
)

for theme in light dark; do
  xcrun simctl ui "$DEVICE" appearance "$theme"
  for item in "${SCREENS[@]}"; do
    name="${item%%:*}"
    rest="${item#*:}"
    wait="${rest##*:}"
    screen="${rest%:*}"
    xcrun simctl terminate "$DEVICE" "$BUNDLE" 2>/dev/null || true
    if [ "$screen" = "chat:cards" ]; then
      xcrun simctl launch "$DEVICE" "$BUNDLE" --gallery "--screen=$screen" "--theme=$theme" >/dev/null
    elif [ -n "$screen" ]; then
      xcrun simctl launch "$DEVICE" "$BUNDLE" --demo "--screen=$screen" "--theme=$theme" >/dev/null
    else
      xcrun simctl launch "$DEVICE" "$BUNDLE" --demo "--theme=$theme" >/dev/null
    fi
    sleep "$wait"
    xcrun simctl io "$DEVICE" screenshot "$OUT/$theme-$name.png" >/dev/null
    echo "took $theme-$name"
  done
done
xcrun simctl terminate "$DEVICE" "$BUNDLE" 2>/dev/null || true
