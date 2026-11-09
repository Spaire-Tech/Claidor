/**
 * The one line an agent's chat gets when Claude Code can't run its turn and
 * Simeon's models answer instead (9 November 2026, docs/your-own-models.md,
 * section 6, step C4): a notice in the person's language, written to the
 * agent's transcript whether its chat is open, running or at rest, and sent
 * to the apps (as the flight cards are, `flight-bookings.ts`).
 */
import { randomUUID } from "node:crypto";
import { say } from "../../../shared/say.js";
import type { ClaudeCodeFallback } from "../../claude-code/claude-code-agent-turn.js";
import type { TranscriptEntry } from "./transcript-hub.js";

const KEYS = {
  limited: "claudeCode.limited",
  signed_out: "claudeCode.signedOut",
  not_installed: "claudeCode.unavailable",
  failed: "claudeCode.unavailable",
} as const;

/** The notice's words for why Claude didn't answer, in the person's language. */
export function claudeCodeNoticeText(language: string | null | undefined, why: ClaudeCodeFallback): string {
  return say(language, KEYS[why]);
}

/** Writes the notice in `agentId`'s chat; nothing when the agent is gone. */
export async function appendClaudeCodeNotice(tm: any, agentId: string, why: ClaudeCodeFallback): Promise<void> {
  if (tm.sessions?.isAgentGone?.(agentId) === true) return;
  const entry: TranscriptEntry = {
    kind: "notice",
    id: `notice-claude-${randomUUID()}`,
    text: claudeCodeNoticeText(tm.userLanguage?.(), why),
    timestampMs: Date.now(),
  };
  const sessions = tm.sessions;
  if (sessions?.activeSession?.id === agentId && (sessions.inMemoryTranscriptAgentId == null || sessions.inMemoryTranscriptAgentId === agentId)) {
    tm.appendEntry(entry);
    void tm.roster?.emitAgentUpdate?.(agentId);
    return;
  }
  const live = sessions?.liveSessions?.get(agentId);
  if (live != null) live.db.appendTranscriptEntry(entry);
  else {
    const withDb = tm.sessionStore?.withAgentDb;
    if (typeof withDb !== "function") return;
    const written = await withDb.call(tm.sessionStore, agentId, (db: { appendTranscriptEntry(entry: TranscriptEntry): boolean }) => db.appendTranscriptEntry(entry));
    if (written === false) return;
  }
  tm.roster?.emit?.({ type: "appended", entry }, agentId);
  void tm.roster?.emitAgentUpdate?.(agentId);
}
