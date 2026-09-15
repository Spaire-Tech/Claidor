/**
 * What the hover cluster beside a message does, as values.
 *
 * From the evening canvas of 15 September: rest the pointer on a bubble
 * and three round buttons appear beside it — react, reply, more. React
 * opens six emoji; one of them becomes a small chip at the bubble's
 * foot, and picking it again takes it off. Reply puts the first line of
 * the message into the composer in quotes. More opens a menu with one
 * row, which copies the message's id.
 *
 * The decisions live here, tested, and `MessageActions.tsx` draws them.
 */

/** The canvas's six, in its order. */
export const REACTION_EMOJIS: readonly string[] = ['\u{1F44D}', '❤️', '\u{1F602}', '\u{1F62E}', '\u{1F622}', '\u{1F64F}'];

/** Message id → the emoji on it. Absent means none. */
export type Reactions = Readonly<Record<string, string>>;

/**
 * One reaction per message, and picking the same one again clears it —
 * the canvas's `st.reactions[mkey] === ch ? "" : ch`. Returns a new map
 * without the key rather than an empty string, so a stored file does not
 * fill up with blanks.
 */
export function toggleReaction(reactions: Reactions, messageId: string, emoji: string): Reactions {
  const next: Record<string, string> = { ...reactions };
  if (next[messageId] === emoji) delete next[messageId];
  else next[messageId] = emoji;
  return next;
}

/** How long a reply quote may be before it is cut, in characters. */
export const QUOTE_LENGTH = 52;

/**
 * The reply seed: the message's first 52 characters in curly quotes and
 * a trailing space, so typing continues the sentence. Chips are
 * unwrapped (`[[a.xlsx]]` → `a.xlsx`) because a quote is prose, and the
 * newlines a real answer carries become spaces for the same reason.
 */
export function replyQuote(text: string): string {
  const flat = text.replace(/\[\[(.+?)\]\]/g, '$1').replace(/\s+/g, ' ').trim();
  const cut = flat.length > QUOTE_LENGTH ? `${flat.slice(0, QUOTE_LENGTH)}…` : flat;
  return `“${cut}” `;
}

/**
 * The id worth copying.
 *
 * A reply that arrives as three bubbles is three items with ids like
 * `<message>:1`, `<message>:2`; a file card is `<message>:f0`. The thing
 * a person can hand to support is the engine's message id, which is
 * everything before the first colon.
 */
export function messageIdOf(itemId: string): string {
  const colon = itemId.indexOf(':');
  return colon < 0 ? itemId : itemId.slice(0, colon);
}

/** Where a conversation's reactions are kept, in the renderer's own storage. */
export function reactionsKey(conversationId: string): string {
  return `fsr-reactions:${conversationId}`;
}

/** A minimal storage: `localStorage`, or anything shaped like it in a test. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Read a conversation's reactions. A missing or damaged entry is no
 * reactions, not an error: this is decoration on a thread, and a thread
 * that fails to open over a bad JSON string would be the wrong priority.
 */
export function loadReactions(storage: KeyValueStorage | undefined, conversationId: string): Reactions {
  if (!storage) return {};
  try {
    const raw = storage.getItem(reactionsKey(conversationId));
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const clean: Record<string, string> = {};
    for (const [id, emoji] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof emoji === 'string' && emoji) clean[id] = emoji;
    }
    return clean;
  } catch {
    return {};
  }
}

export function saveReactions(storage: KeyValueStorage | undefined, conversationId: string, reactions: Reactions): void {
  if (!storage) return;
  try {
    storage.setItem(reactionsKey(conversationId), JSON.stringify(reactions));
  } catch {
    // Storage full or refused. The chip still shows for this session.
  }
}
