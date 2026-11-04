#!/usr/bin/env bash
# Step 0 of docs/agents-on-the-server/README.md: a stand-in for the
# computer's /usr/local/bin/start-window (box/bin/start-window), for a test
# machine with no screen. Like the real one, it gives window N its own hands
# program on 14000+N and writes the owner token the router on 1339 checks.
# Unlike it, it starts no desktop: there is no display :N.
#
#   stand-in-start-window.sh <N> [ownerToken]
#
# PROBE_HANDS_BUNDLE is the hands program bundled by itself (hands-daemon.ts).
set -uo pipefail
N="${1:-}"; OWNER_TOKEN="${2:-}"
if ! [[ "$N" =~ ^[0-9]+$ ]]; then echo "usage: start-window <N> [ownerToken]" >&2; exit 64; fi
if [ "$N" -le 1 ]; then exit 0; fi
EXEC_PORT=$((14000 + N)); WINDOW_DIR="/tmp/sand-window-$N"; TOKEN_FILE="/tmp/sand-window-tokens.d/$N"
mkdir -p "$WINDOW_DIR/terminals" /tmp/sand-window-tokens.d
if [ -n "$OWNER_TOKEN" ] && [ -s "$TOKEN_FILE" ] && [ "$(cat "$TOKEN_FILE")" != "$OWNER_TOKEN" ]; then exit 75; fi
[ -n "$OWNER_TOKEN" ] && printf '%s' "$OWNER_TOKEN" > "$TOKEN_FILE"
daemon_up() { (exec 3<>"/dev/tcp/127.0.0.1/$EXEC_PORT") 2>/dev/null; }
if daemon_up; then echo "sand window $N already up (daemon :$EXEC_PORT)"; exit 0; fi
PROBE_PORT="$EXEC_PORT" PROBE_TOKEN=local PROBE_WORKSPACE=/workspace setsid nohup node "${PROBE_HANDS_BUNDLE:?}" >> "$WINDOW_DIR/exec-daemon.log" 2>&1 &
for _ in $(seq 1 150); do daemon_up && { echo "sand window $N ready (daemon :$EXEC_PORT, no display)"; exit 0; }; sleep 0.1; done
echo "sand window $N: daemon on :$EXEC_PORT did not come up" >&2; exit 1
