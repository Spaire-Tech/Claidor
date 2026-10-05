#!/usr/bin/env bash
# Runs the cloud computer's scripts on this machine, without Docker, and
# checks the contract the host relies on. Needs root and the desktop tools
# the image installs (Xvfb, x11vnc, websockify with /usr/share/novnc, xfwm4,
# picom, xdotool, ImageMagick, node), and the exec daemon bundle:
#
#   sudo SIMEON_BOX_EXEC_DAEMON=desktop/.build/box-exec-daemon/main.cjs box/test/smoke.sh
#
# It installs box/bin into /usr/local/bin and the wallpapers, creates the
# box user, starts start-simeon-box in the background on display :1, and
# then: waits for the desktop, the exec daemon (1337), the router (1339),
# the screen (5900, 6080); asks the daemon its capabilities directly and
# through the router; opens a fork window (:2), checks its daemon through
# the router with the right and a wrong owner token, stops it; kills the
# VNC server and watches the supervisor bring it back; runs box-doctor;
# stops the box with SIGTERM. Exit 0 when every check passes.
set -uo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
DAEMON="${SIMEON_BOX_EXEC_DAEMON:-$HERE/../desktop/.build/box-exec-daemon/main.cjs}"
LOG="${SIMEON_BOX_SMOKE_LOG:-/tmp/simeon-box-smoke.log}"
failures=0
pass() { printf 'PASS %s\n' "$*"; }
fail() { printf 'FAIL %s\n' "$*"; failures=$((failures + 1)); }
check() { local label="$1"; shift; if "$@"; then pass "$label"; else fail "$label"; fi; }
listening() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }
wait_for() { local label="$1" tries="$2"; shift 2; for _ in $(seq 1 "$tries"); do if "$@"; then pass "$label"; return 0; fi; sleep 0.5; done; fail "$label"; return 1; }
capabilities() {
  # ControlService.GetCapabilities over Connect, JSON: {"computerUseSupported":true}
  curl -sS --max-time 5 -X POST "$1/agent.v1.ControlService/GetCapabilities" -H "authorization: Bearer local" -H "content-type: application/json" "${@:2}" -d '{}'
}

export -f capabilities listening
[ "$(id -u)" = 0 ] || { echo "run as root"; exit 2; }
[ -f "$DAEMON" ] || { echo "no exec daemon bundle at $DAEMON (cd desktop && node scripts/build-box-exec-daemon.mjs)"; exit 2; }
for tool in Xvfb x11vnc websockify xfwm4 picom xdotool import xdpyinfo node hsetroot; do command -v "$tool" >/dev/null || { echo "missing $tool"; exit 2; }; done

# --- Install as the Dockerfile does -------------------------------------------
id box >/dev/null 2>&1 || useradd --create-home --shell /bin/bash box
install -m 755 "$HERE"/bin/* /usr/local/bin/
mkdir -p /usr/share/backgrounds/simeon /etc/opt/chrome/policies/managed /home/box/box-exec-daemon /home/box/sand-host
cp "$HERE"/wallpapers/*.png /usr/share/backgrounds/simeon/
cp "$HERE"/etc/chrome-policies/*.json /etc/opt/chrome/policies/managed/
cp "$DAEMON" /home/box/box-exec-daemon/main.cjs
[ -f /etc/simeon-box-version ] || echo smoke > /etc/simeon-box-version
rm -rf /tmp/sand-desktop /tmp/sand-supervisor

# --- Boot -----------------------------------------------------------------------
: > "$LOG"
DISPLAY=:1 SAND_HOST_PORT=1340 SAND_DATA_ROOT=/home/box/sand-data setsid /usr/local/bin/start-simeon-box >> "$LOG" 2>&1 &
BOX_PID=$!
cleanup() { kill -TERM "$BOX_PID" 2>/dev/null; sleep 3; pkill -f simeon-supervisor.mjs 2>/dev/null; pkill -f "Xvfb :1 " 2>/dev/null; pkill -f "Xvfb :2 " 2>/dev/null; }
trap cleanup EXIT

wait_for "display :1 answers" 60 bash -c "xdpyinfo -display :1 >/dev/null 2>&1"
wait_for "exec daemon listens on 1337" 40 listening 1337
wait_for "window router listens on 1339" 40 listening 1339
wait_for "x11vnc listens on 5900" 40 listening 5900
wait_for "websockify listens on 6080" 40 listening 6080
wait_for "fork websockify listens on 6081" 40 listening 6081
wait_for "xfwm4 runs" 40 bash -c "pgrep -x xfwm4 >/dev/null"
wait_for "picom runs" 40 bash -c "pgrep -x picom >/dev/null"
wait_for "desktop health file written" 30 test -s /tmp/sand-supervisor/desktop-health.json
wait_for "health file names d1/xvfb up" 30 grep -q '"name":"d1/xvfb","up":true' /tmp/sand-supervisor/desktop-health.json
wait_for "health file names d1/x11vnc up" 30 grep -q '"name":"d1/x11vnc","up":true' /tmp/sand-supervisor/desktop-health.json
check "status file says the exec daemon runs" grep -q '"execDaemonRunning":true' /tmp/sand-supervisor/status.json
check "noVNC page served on 6080" curl -sS --max-time 5 -o /dev/null -f http://127.0.0.1:6080/vnc.html
check "daemon says computer use is supported" bash -c "capabilities http://127.0.0.1:1337 | grep -q '\"computerUseSupported\":true'"
check "router forwards display 1 to the primary daemon" bash -c "capabilities http://127.0.0.1:1339 -H 'x-sand-display: 1' | grep -q computerUseSupported"
check "daemon refuses a wrong bearer" bash -c "curl -sS -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:1337/agent.v1.ControlService/Ping -H 'authorization: Bearer nope' -H 'content-type: application/json' -d '{}' | grep -qx 401"

# --- A screenshot through the real wire ----------------------------------------
check "a screenshot comes back as WebP" node "$HERE/test/screenshot-check.mjs"

# --- A fork window ----------------------------------------------------------
check "start-window 2 with an owner token" bash -c "/usr/local/bin/start-window 2 token-abc >> '$LOG' 2>&1"
wait_for "display :2 answers" 40 bash -c "xdpyinfo -display :2 >/dev/null 2>&1"
wait_for "fork daemon listens on 14002" 40 listening 14002
check "fork token files written" bash -c "[ \"\$(cat /tmp/sand-window-tokens.d/2)\" = token-abc ] && grep -q '^2: localhost:5902$' /tmp/sand-novnc-tokens.d/2"
check "router forwards display 2 with the owner token" bash -c "capabilities http://127.0.0.1:1339 -H 'x-sand-display: 2' -H 'x-sand-window-owner: token-abc' | grep -q computerUseSupported"
check "router refuses display 2 with another token" bash -c "curl -sS -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:1339/agent.v1.ControlService/Ping -H 'x-sand-display: 2' -H 'x-sand-window-owner: other' -H 'authorization: Bearer local' -H 'content-type: application/json' -d '{}' | grep -qx 403"
check "start-window 2 again with another token exits 75" bash -c "/usr/local/bin/start-window 2 token-other >> '$LOG' 2>&1; [ \$? -eq 75 ]"
check "start-window 2 again with the same token says already up" bash -c "/usr/local/bin/start-window 2 token-abc | grep -q 'already up'"
wait_for "health file lists d2/xvfb" 20 grep -q '"name":"d2/xvfb"' /tmp/sand-supervisor/desktop-health.json
check "stop-window 2" bash -c "/usr/local/bin/stop-window 2 | grep -q 'stopped'"
wait_for "display :2 gone" 20 bash -c '! xdpyinfo -display :2 >/dev/null 2>&1'
wait_for "fork daemon gone" 20 bash -c '! listening 14002'
check "fork token files removed" bash -c "[ ! -e /tmp/sand-window-tokens.d/2 ] && [ ! -e /tmp/sand-novnc-tokens.d/2 ]"

# --- The supervisor restarts a dead piece ------------------------------------
x11vnc_pid="$(cat /tmp/sand-desktop/d1/x11vnc.pid)"
kill -9 "$x11vnc_pid"
wait_for "x11vnc restarted by the supervisor" 40 bash -c "[ -s /tmp/sand-desktop/d1/x11vnc.pid ] && [ \"\$(cat /tmp/sand-desktop/d1/x11vnc.pid)\" != '$x11vnc_pid' ] && listening 5900"
wait_for "health file counts the restart" 20 grep -q '"name":"d1/x11vnc","up":true,"crashloop":false,"restartsInWindow":1' /tmp/sand-supervisor/desktop-health.json

# --- The command mailbox -------------------------------------------------------
echo '{"id":"ping-1","kind":"ping"}' > /tmp/sand-supervisor/command.json
wait_for "ping command acknowledged" 20 test -s /tmp/sand-supervisor/acks/ping-1

# --- The doctor and the wallpaper ------------------------------------------------
/usr/local/bin/box-doctor > /tmp/simeon-box-doctor.log 2>&1
check "box-doctor reports PASS xvfb" grep -q '^\[box-doctor\] PASS xvfb:' /tmp/simeon-box-doctor.log
check "box-doctor reports PASS exec-daemon" grep -q '^\[box-doctor\] PASS exec-daemon:' /tmp/simeon-box-doctor.log
check "box-doctor prints a summary" grep -q '^\[box-doctor\] SUMMARY: ' /tmp/simeon-box-doctor.log
check "wallpaper tone plan parses" bash -c "node /usr/local/bin/sand-wallpaper-tone.mjs /nonexistent | grep -Eq '^[abc] [0-9]+$'"
check "desktop :1 is painted (root window not black)" bash -c "import -display :1 -window root -resize 1x1 txt:- | grep -vq '#000000'"

# --- Stop -------------------------------------------------------------------------
kill -TERM "$BOX_PID"
wait_for "supervisor stopped on SIGTERM" 30 bash -c "! kill -0 $BOX_PID 2>/dev/null"
wait_for "display :1 gone after stop" 30 bash -c '! xdpyinfo -display :1 >/dev/null 2>&1'
trap - EXIT

echo
if [ "$failures" -eq 0 ]; then echo "smoke: every check passed (log $LOG)"; exit 0; fi
echo "smoke: $failures check(s) failed (log $LOG, doctor /tmp/simeon-box-doctor.log)"
exit 1
