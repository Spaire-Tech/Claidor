/**
 * One line the host writes in an agent's chat (its transcript), whether the
 * chat is open, running or at rest, and sent to the apps: the Claude Code
 * notice (`claude-code-notice.ts`) and the line when an agent's model
 * changes (`model-change-line.ts`). It wakes no one: the chat's log is the
 * person's, the model never reads it.
 */
import type { TranscriptEntry } from "./transcript-hub.js";

/** Writes `entry` in `agentId`'s chat; nothing when the agent is gone. True when it was written. */
export async function appendChatLine(tm: any, agentId: string, entry: TranscriptEntry): Promise<boolean> {
  if (tm.sessions?.isAgentGone?.(agentId) === true) return false;
  const sessions = tm.sessions;
  if (sessions?.activeSession?.id === agentId && (sessions.inMemoryTranscriptAgentId == null || sessions.inMemoryTranscriptAgentId === agentId)) {
    tm.appendEntry(entry);
    void tm.roster?.emitAgentUpdate?.(agentId);
    return true;
  }
  const live = sessions?.liveSessions?.get(agentId);
  if (live != null) live.db.appendTranscriptEntry(entry);
  else {
    const withDb = tm.sessionStore?.withAgentDb;
    if (typeof withDb !== "function") return false;
    const written = await withDb.call(tm.sessionStore, agentId, (db: { appendTranscriptEntry(entry: TranscriptEntry): boolean }) => db.appendTranscriptEntry(entry));
    if (written === false) return false;
  }
  tm.roster?.emit?.({ type: "appended", entry }, agentId);
  void tm.roster?.emitAgentUpdate?.(agentId);
  return true;
}
