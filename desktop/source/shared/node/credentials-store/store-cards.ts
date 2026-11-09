// The Credentials Store's cards in the chat (9 November 2026, the founder:
// "the agent needs to know. and recommend it when needed. it also needs to
// have a card for everything in the store"):
//
//   - The ask (`mode: "request"`): the agent asks the person to save a login,
//     a card or their contact info in the Credentials Store. The card's
//     button opens the store's form for that kind, its website or name
//     already written; once saved, the card says Saved and the agent is
//     woken to carry on. Never a password or a card number in the chat.
//   - The note (`mode: "used"` / `"saved"`): what the agent did with the
//     store, said once in the chat: a saved login it signed in with, a new
//     login it saved at a sign-up.
//
// The ask ends the agent's turn; dismissing it is a decline.

export const STORE_ENTRY_MESSAGE_TYPE = "store-entry";

export type StoreEntryKind = "login" | "card" | "contact";

export interface StoreEntryMessage {
  readonly type: typeof STORE_ENTRY_MESSAGE_TYPE;
  readonly store: {
    readonly mode: "request" | "used" | "saved";
    readonly kind: StoreEntryKind;
    /** What it is: "Amazon", a site, a card's name. */
    readonly title: string;
    /** A login's website, written into the form ("amazon.com"). */
    readonly website?: string;
    /** One line, why it helps ("so I can sign in to Amazon for you"). */
    readonly reason?: string;
  };
}

export type StoreEntryState = "open" | "saved" | "dismissed";

/** Stamped on the ask's entry as the person answers it. */
export interface StoreEntryFields {
  readonly storeState?: StoreEntryState;
}

const WHAT: Readonly<Record<StoreEntryKind, string>> = { login: "a login", card: "a card", contact: "their contact info" };

/** What the tool returns once the ask is in the chat: the turn ends on it (`WAITING_CARDS`). */
export function storeRequestShownNote(title: string): string {
  return `The Credentials Store card for "${title}" is in the chat. Your turn ends here: you'll be told when the user saves it. Don't write a message after this.`;
}

export function buildStoreSavedWakePrompt(entryId: string, store: StoreEntryMessage["store"]): string {
  return `[The user saved ${WHAT[store.kind]} for "${store.title}" in their Credentials Store (entry ${entryId}). Call ListStoredCredentials and carry on with what you were doing; use it as its hints say.]`;
}

export function buildStoreDismissedWakePrompt(entryId: string, store: StoreEntryMessage["store"]): string {
  return `[The user dismissed saving ${WHAT[store.kind]} for "${store.title}" in their Credentials Store (entry ${entryId}). Don't ask again for it. Carry on without it if the task allows; if the task needs it, end your turn without a message.]`;
}
