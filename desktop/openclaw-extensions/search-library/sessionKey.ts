// Mirrors openclaw-extensions/ask-user-question/sessionKey.ts: the tool is
// offered to Maties desktop sessions (and their subagents) only, never to chat
// channel sessions. Extensions compile on their own and cannot import from src/.
const LEGACY_MATIES_SESSION_PREFIX = 'maties:';
const AGENT_SESSION_PREFIX = 'agent:';
const MATIES_SESSION_MARKER = 'maties';
const SUBAGENT_SESSION_MARKER = 'subagent';

export function isSearchLibraryCandidateSessionKey(sessionKey: string | undefined | null): boolean {
  const raw = (sessionKey ?? '').trim();
  if (!raw) return false;

  if (raw.startsWith(LEGACY_MATIES_SESSION_PREFIX)) {
    return raw.slice(LEGACY_MATIES_SESSION_PREFIX.length).trim().length > 0;
  }

  if (!raw.startsWith(AGENT_SESSION_PREFIX)) {
    return false;
  }

  const parts = raw.split(':');
  if (parts.length < 4 || parts[0] !== 'agent') {
    return false;
  }

  const agentId = parts[1]?.trim() ?? '';
  const source = parts[2]?.trim() ?? '';
  const rest = parts.slice(3).join(':').trim();
  if (!agentId || !rest) {
    return false;
  }

  return source === MATIES_SESSION_MARKER || source === SUBAGENT_SESSION_MARKER;
}
