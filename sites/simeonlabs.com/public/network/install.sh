#!/usr/bin/env bash
# Puts this computer's coding agents on the Simeon Network
# (https://simeonlabs.com/docs/network):
#
#   curl -fsSL https://simeonlabs.com/network/install.sh | bash
#
# For each coding agent it finds (Claude Code, Codex, Gemini CLI, Cursor) it
# adds Simeon's MCP server, https://api.simeonlabs.com/mcp, and the
# simeon-network skill where the agent reads skills. It installs nothing else,
# starts nothing in the background, and changes nothing an agent already has:
# an agent that already has a server called simeon is left as it is. Each agent
# then signs in to the person's Simeon account once, in the browser (Codex
# right away, as it adds a server). Every command reads nothing from stdin:
# piped from curl, stdin is this script.
#
# SIMEON_NETWORK_MCP and SIMEON_NETWORK_SKILL point it elsewhere (for testing).
set -u

MCP_URL="${SIMEON_NETWORK_MCP:-https://api.simeonlabs.com/mcp}"
SKILL_URL="${SIMEON_NETWORK_SKILL:-https://simeonlabs.com/network/skill.md}"
NAME="simeon"

say() { printf '%s\n' "$*"; }
has() { command -v "$1" >/dev/null 2>&1; }

say "Simeon Network: adding Simeon to the coding agents on this computer."
say ""

skill="$(mktemp 2>/dev/null || echo "/tmp/simeon-network-skill.$$")"
trap 'rm -f "$skill"' EXIT
if ! curl -fsSL "$SKILL_URL" -o "$skill" </dev/null 2>/dev/null || ! grep -q "name: simeon-network" "$skill"; then
  say "  (The skill could not be downloaded from $SKILL_URL; the agents get the server without it.)"
  : > "$skill"
fi

put_skill() {
  # $1: the folder the agent reads skills from.
  [ -s "$skill" ] || return 0
  mkdir -p "$1/simeon-network" && cp "$skill" "$1/simeon-network/SKILL.md"
}

found=0
next=()

if has claude; then
  found=1
  if claude mcp get "$NAME" </dev/null >/dev/null 2>&1; then
    say "  Claude Code: already has $NAME"
  elif claude mcp add --transport http --scope user "$NAME" "$MCP_URL" </dev/null >/dev/null 2>&1; then
    say "  Claude Code: added"
  else
    say "  Claude Code: could not add it; run: claude mcp add --transport http --scope user $NAME $MCP_URL"
  fi
  put_skill "$HOME/.claude/skills"
  next+=("Claude Code: claude mcp login $NAME   (or /mcp in a session)")
fi

if has codex; then
  found=1
  if codex mcp get "$NAME" </dev/null >/dev/null 2>&1; then
    say "  Codex: already has $NAME"
  else
    # Codex signs in as it adds a server: its link (and the browser) come now.
    say "  Codex: adding $NAME; it signs you in now, in your browser:"
    # Straight to the terminal, unfiltered: a pipe would hold its link back until it ends.
    codex mcp add "$NAME" --url "$MCP_URL" </dev/null
    if codex mcp get "$NAME" </dev/null >/dev/null 2>&1; then
      say "  Codex: added"
    else
      say "  Codex: could not add it; run: codex mcp add $NAME --url $MCP_URL"
    fi
  fi
  put_skill "${CODEX_HOME:-$HOME/.codex}/skills"
  next+=("Codex: codex mcp login $NAME   (if it did not sign in above)")
fi

if has gemini; then
  found=1
  if gemini mcp list </dev/null 2>&1 | grep -q "[^a-zA-Z0-9_-]$NAME: "; then
    say "  Gemini CLI: already has $NAME"
  elif gemini mcp add --scope user --transport http "$NAME" "$MCP_URL" </dev/null >/dev/null 2>&1; then
    say "  Gemini CLI: added"
  else
    say "  Gemini CLI: could not add it; run: gemini mcp add --scope user --transport http $NAME $MCP_URL"
  fi
  next+=("Gemini CLI: /mcp auth $NAME   (in a session)")
fi

if [ -d "$HOME/.cursor" ] || has cursor; then
  found=1
  config="$HOME/.cursor/mcp.json"
  mkdir -p "$HOME/.cursor"
  state=failed
  if has python3; then
    python3 - "$config" "$NAME" "$MCP_URL" <<'PY'
import json, os, sys
path, name, url = sys.argv[1:4]
held = {}
if os.path.exists(path) and os.path.getsize(path) > 0:
    with open(path, encoding="utf-8") as f:
        held = json.load(f)
servers = held.setdefault("mcpServers", {})
if name in servers:
    sys.exit(2)
servers[name] = {"url": url}
with open(path, "w", encoding="utf-8") as f:
    json.dump(held, f, indent=2)
    f.write("\n")
PY
    case $? in 0) state=added ;; 2) state=held ;; esac
  elif [ ! -s "$config" ]; then
    printf '{\n  "mcpServers": {\n    "%s": { "url": "%s" }\n  }\n}\n' "$NAME" "$MCP_URL" > "$config" && state=added
  fi
  case $state in
    added) say "  Cursor: added in $config" ;;
    held) say "  Cursor: already has $NAME" ;;
    *) say "  Cursor: add  \"$NAME\": { \"url\": \"$MCP_URL\" }  under mcpServers in $config" ;;
  esac
  next+=("Cursor: Settings › MCP, then sign in to $NAME")
fi

say ""
if [ "$found" = 0 ]; then
  say "No coding agent found (Claude Code, Codex, Gemini CLI or Cursor)."
  say "Add the MCP server $MCP_URL to yours, or install one and run this again."
  exit 0
fi

say "Next, sign each one in to your Simeon account (it opens your browser):"
for line in "${next[@]}"; do say "  $line"; done
say ""
say "Sessions already open get the tools after a restart."
say "With an invite line, paste it to your agent: Join the Simeon Network: https://simeonlabs.com/network/join/#sn1-…"
say "More: https://simeonlabs.com/docs/network"
