/**
 * The Credentials Store's card, the host's side (9 November 2026; the card is
 * described in `shared/node/credentials-store/store-cards.ts`).
 *
 *   - `answerStoreEntry` with `saved: true` (the apps, once the person saved
 *     the login, card or contact info in the store's form the card opened):
 *     the card says Saved and its agent is woken to carry on.
 *   - `answerStoreEntry` without it (the card's X): a decline; the agent is
 *     woken to carry on without it, and may stay silent.
 *
 * Nothing saved passes through here: the apps save it with the server, and
 * the agent reads it from the store.
 */
import { HOST_LOG_PREFIX, logHostLine } from "../../../shared/host-log.js";
import { say } from "../../../shared/say.js";
import {
  STORE_ENTRY_MESSAGE_TYPE,
  buildStoreDismissedWakePrompt,
  buildStoreSavedWakePrompt,
  type StoreEntryFields,
  type StoreEntryMessage,
} from "../../../shared/node/credentials-store/store-cards.js";
import { stampCard } from "./card-entries.js";
import type { TranscriptEntry, TranscriptManagerLike } from "./transcript-hub.js";

type StoreEntry = TranscriptEntry & StoreEntryFields & { readonly message: StoreEntryMessage };

/** The store's ask (`mode: "request"`); its notes wait on nothing and take no answer. */
export function isStoreRequestEntry(entry: unknown): entry is StoreEntry {
  const record = entry as { kind?: unknown; message?: { type?: unknown; store?: { mode?: unknown } } } | null | undefined;
  return record?.kind === "send-message" && record.message?.type === STORE_ENTRY_MESSAGE_TYPE && record.message.store?.mode === "request";
}

export class StoreCards {
  private readonly log: (line: string) => void;

  constructor(private readonly tm: TranscriptManagerLike, options: { readonly log?: (line: string) => void } = {}) {
    this.log = options.log ?? ((line) => logHostLine(`${HOST_LOG_PREFIX} ${line}`));
  }

  /** Saved (`saved: true`) or the X; `{ accepted: false }` for a card already answered or gone. */
  async answerStoreEntry(args: { readonly agentId: string; readonly entryId: string; readonly saved?: unknown }): Promise<{ readonly accepted: boolean }> {
    const saved = args.saved === true;
    let store: StoreEntryMessage["store"] | undefined;
    const stamped = await stampCard(this.tm, args.agentId, args.entryId, isStoreRequestEntry, (entry) => {
      if ((entry.storeState ?? "open") !== "open") return null;
      store = entry.message.store;
      return { storeState: saved ? "saved" : "dismissed" };
    });
    if (stamped == null || store == null) return { accepted: false };
    this.log(`[credentials] ${args.agentId}/${args.entryId}: ${store.kind} ${saved ? "saved" : "dismissed"}`);
    const prompt = saved ? buildStoreSavedWakePrompt(args.entryId, store) : buildStoreDismissedWakePrompt(args.entryId, store);
    void Promise.resolve()
      .then(() => this.tm.backgroundWakes.runHiddenPromptWake(args.agentId, saved ? "store-entry-saved" : "store-entry-dismissed", prompt, say(this.tm.userLanguage?.(), "tray.resumeAfterFormFailed"), saved ? undefined : { isSilenceAllowed: true }))
      .catch((error: unknown) => this.log(`[credentials] wake for ${args.agentId}/${args.entryId} failed: ${error instanceof Error ? error.message : String(error)}`));
    return { accepted: true };
  }
}
