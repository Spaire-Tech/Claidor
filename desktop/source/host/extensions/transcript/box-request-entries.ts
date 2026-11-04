import { updateEntry } from "./transcript-store.js";
import type {
  TranscriptEntry,
  TranscriptManagerLike,
} from "./transcript-hub.js";
export class BoxRequestEntries {
  activeBoxRequest: {
    agentId: string;
    entryId: string;
    requestId: string;
  } | null = null;
  constructor(readonly tm: TranscriptManagerLike) {}
  trackBoxRequestEntry(entry: TranscriptEntry): void {
    if (
      entry.boxRequestId == null ||
      entry.boxResolution != null ||
      this.tm.sessions?.activeSession == null
    )
      return;
    const prior = this.activeBoxRequest;
    if (prior != null && prior.agentId === this.tm.sessions.activeSession.id) {
      void this.tm.resolveBoxRequestEntry(
        this.tm.sessions.activeSession.id,
        prior.requestId,
        "dismissed",
      );
    }
    this.activeBoxRequest = {
      agentId: this.tm.sessions.activeSession.id,
      entryId: entry.id,
      requestId: entry.boxRequestId as string,
    };
  }
  /**
   * The agent's latest "Your turn on the computer" line still unanswered,
   * read from its chat (4 November 2026): the hand-off itself is kept in
   * memory only, so after the computer started again its card still waits
   * while nothing on the computer does.
   */
  async newestOpenBoxRequestId(agentId: string): Promise<string | null> {
    if (this.tm.sessions?.isAgentGone(agentId)) return null;
    const liveSession =
      this.tm.sessions.activeSession?.id === agentId
        ? this.tm.sessions.activeSession
        : this.tm.sessions.liveSessions.get(agentId);
    let session: any;
    try {
      session =
        liveSession ?? (await this.tm.sessionStore.openSession(agentId));
    } catch {
      return null;
    }
    try {
      const entries: TranscriptEntry[] = session.db.getTranscriptEntries();
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        const entry = entries[index];
        if (
          entry != null &&
          entry.kind === "send-message" &&
          typeof entry.boxRequestId === "string" &&
          entry.boxResolution == null
        )
          return entry.boxRequestId;
      }
      return null;
    } finally {
      if (liveSession == null) {
        await session.agentStore.dispose();
        session.db.close();
      }
    }
  }

  async resolveBoxRequestEntry(
    agentId: string,
    requestId: string,
    resolution: string,
  ): Promise<void> {
    if (this.activeBoxRequest?.requestId === requestId)
      this.activeBoxRequest = null;
    if (this.tm.sessions?.isAgentGone(agentId)) return;
    const liveSession =
      this.tm.sessions.activeSession?.id === agentId
        ? this.tm.sessions.activeSession
        : this.tm.sessions.liveSessions.get(agentId);
    let session: any;
    try {
      session =
        liveSession ?? (await this.tm.sessionStore.openSession(agentId));
    } catch {
      return;
    }
    try {
      const target = session.db
        .getTranscriptEntries()
        .find(
          (entry: TranscriptEntry) =>
            entry.kind === "send-message" &&
            entry.boxRequestId === requestId &&
            entry.boxResolution == null,
        );
      if (target == null) return;
      const apply = (entry: TranscriptEntry): TranscriptEntry =>
        entry.kind === "send-message" && entry.boxResolution == null
          ? { ...entry, boxResolution: resolution }
          : entry;
      session.db.updateTranscriptEntry(target.id, apply);
      if (
        this.tm.sessions.activeSession?.id === agentId &&
        this.tm.sessions.inMemoryTranscriptAgentId === agentId
      ) {
        const updated = updateEntry(target.id, apply);
        if (updated != null)
          this.tm.roster.emit({ type: "updated", entry: updated });
      }
    } finally {
      if (liveSession == null) {
        await session.agentStore.dispose();
        session.db.close();
      }
    }
  }
}
