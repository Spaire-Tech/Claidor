/**
 * A card in any agent's chat, read and stamped from the host rather than a
 * turn (28 October 2026): the open session's transcript when the agent is
 * live, else its saved one. Shared by the in-chat form (`user-forms.ts`) and
 * the 1Password cards (`onepassword-cards.ts`); a stamp goes to the apps with
 * the agent's id.
 */
import { getTranscript, updateEntry } from "./transcript-store.js";
import type { TranscriptEntry, TranscriptManagerLike } from "./transcript-hub.js";

/** Fields to set on the entry; `undefined` removes one. */
export type CardPatch = { readonly [field: string]: unknown };

function liveSession(tm: TranscriptManagerLike, agentId: string): any {
  return tm.sessions?.activeSession?.id === agentId ? tm.sessions.activeSession : (tm.sessions?.liveSessions?.get?.(agentId) ?? null);
}

async function entries(tm: TranscriptManagerLike, agentId: string): Promise<TranscriptEntry[]> {
  if (tm.sessions?.isAgentGone?.(agentId) === true) return [];
  const live = liveSession(tm, agentId);
  if (live != null) return live.db.getTranscriptEntries() as TranscriptEntry[];
  return await Promise.resolve(tm.sessionStore?.readAgentTranscriptEntries?.(agentId) ?? []) as TranscriptEntry[];
}

/** The card, when the entry is one `isCard` accepts. */
export async function readCard<T extends TranscriptEntry>(tm: TranscriptManagerLike, agentId: string, entryId: string, isCard: (entry: unknown) => entry is T): Promise<T | null> {
  const found = (await entries(tm, agentId)).find((entry) => entry.id === entryId);
  return isCard(found) ? found : null;
}

/** Writes a change to the card and sends it to the apps; null from `change`, or no change, leaves it as it is and returns null. */
export async function stampCard<T extends TranscriptEntry>(tm: TranscriptManagerLike, agentId: string, entryId: string, isCard: (entry: unknown) => entry is T, change: (entry: T) => CardPatch | null): Promise<TranscriptEntry | null> {
  const applyTo = (entry: TranscriptEntry): TranscriptEntry => {
    if (!isCard(entry)) return entry;
    const patch = change(entry);
    if (patch == null) return entry;
    const next = { ...entry } as Record<string, unknown>;
    for (const [field, value] of Object.entries(patch)) {
      if (value === undefined) delete next[field];
      else next[field] = value;
    }
    return next as TranscriptEntry;
  };
  let result: TranscriptEntry | null;
  const live = liveSession(tm, agentId);
  if (live != null) {
    const current = (live.db.getTranscriptEntries() as TranscriptEntry[]).find((entry) => entry.id === entryId);
    if (current == null) return null;
    const next = applyTo(current);
    if (next === current) return null;
    live.db.updateTranscriptEntry(entryId, () => next);
    const sessions = tm.sessions;
    const inMemory = sessions?.activeSession?.id === agentId && (sessions.inMemoryTranscriptAgentId == null || sessions.inMemoryTranscriptAgentId === agentId) ? updateEntry(entryId, () => next) : null;
    result = inMemory ?? next;
  } else {
    const withDb = tm.sessionStore?.withAgentDb;
    if (typeof withDb === "function") {
      result = await withDb.call(tm.sessionStore, agentId, (db: { getTranscriptEntries(): TranscriptEntry[]; updateTranscriptEntry(id: string, update: (entry: TranscriptEntry) => TranscriptEntry): void }) => {
        const current = db.getTranscriptEntries().find((entry) => entry.id === entryId);
        if (current == null) return null;
        const next = applyTo(current);
        if (next === current) return null;
        db.updateTranscriptEntry(entryId, () => next);
        return next;
      });
    } else {
      const current = getTranscript().find((entry) => entry.id === entryId);
      if (current == null) return null;
      const next = applyTo(current);
      result = next === current ? null : updateEntry(entryId, () => next);
    }
    if (result == null) return null;
  }
  tm.roster.emit({ type: "updated", entry: result }, agentId);
  void tm.roster.emitAgentUpdate?.(agentId);
  return result;
}
