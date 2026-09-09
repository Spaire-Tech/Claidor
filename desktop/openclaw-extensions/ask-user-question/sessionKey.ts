const LEGACY_SWEN_SESSION_PREFIX = 'swen:';
const AGENT_SESSION_PREFIX = 'agent:';
const SWEN_SESSION_MARKER = 'swen';
const SUBAGENT_SESSION_MARKER = 'subagent';

export function isAskUserQuestionCandidateSessionKey(sessionKey: string | undefined | null): boolean {
  const raw = (sessionKey ?? '').trim();
  if (!raw) return false;

  if (raw.startsWith(LEGACY_SWEN_SESSION_PREFIX)) {
    return raw.slice(LEGACY_SWEN_SESSION_PREFIX.length).trim().length > 0;
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

  return source === SWEN_SESSION_MARKER || source === SUBAGENT_SESSION_MARKER;
}
