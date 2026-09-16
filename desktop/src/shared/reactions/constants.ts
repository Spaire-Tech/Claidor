/**
 * The agent putting an emoji on the person's message.
 *
 * **Why this exists.** The founder's chat-UI logic
 * (`docs/product/sources/caisra-chat-ui-logic.md`, §1 and §8) lists
 * `ReactToMessage`: *"Emoji tapback on a user message. Lightweight ack;
 * does not replace awaited delivery."* The person has had reactions
 * since 15 September (`renderer/design/thread/actions.ts`); the agent
 * had no way to make one. This is that way.
 *
 * **Which message.** The agent never sees message ids — it sees text —
 * so the tool takes no id. A tapback goes on the message being replied
 * to, which is the person's newest message in the conversation the
 * tool was called from. The session comes from the engine's tool
 * context, the way `AskUserQuestion` gets it; the tool lives in the same
 * plugin for that reason.
 *
 * **What it is not.** It is not a message and the engine never hears
 * back about it. It is drawn by the app and kept where the person's own
 * reactions are kept, beside the conversation.
 */

/** The tool's name, as the model sees it. */
export const REACT_TOOL = 'ReactToMessage';

/** The bridge route the plugin posts to. */
export const REACT_ROUTE = '/react';

/** main → renderer: draw this one. */
export const ReactionIpc = {
  Agent: 'reaction:agent',
} as const;
export type ReactionIpc = typeof ReactionIpc[keyof typeof ReactionIpc];

/** What the plugin posts. */
export interface ReactRequest {
  emoji: string;
  sessionKey?: string;
}

/** What the bridge tells the tool. */
export type ReactResult =
  | { behavior: 'reacted' }
  | { behavior: 'nothing'; reason: string };

/** What the renderer is handed: where to draw it, and what. */
export interface AgentReaction {
  /** The conversation's id in the renderer: the agent's id. */
  conversationId: string;
  /** The person's message the emoji goes on. */
  messageId: string;
  emoji: string;
  at: number;
}

/**
 * The tool's argument, checked: one emoji. A string back is the reason
 * it was refused, for the model.
 *
 * One grapheme rather than one code point, so a flag, a skin tone or a
 * family stays whole. Letters and digits are not reactions.
 */
export function parseReactInput(raw: unknown): { emoji: string } | string {
  const input = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};
  const text = typeof input.emoji === 'string' ? input.emoji.trim() : '';
  if (!text) return 'An emoji is required.';
  const first = firstGrapheme(text);
  if (first !== text) return 'One emoji only.';
  if (/^[\p{L}\p{N}\p{P}\s]+$/u.test(first)) return 'That is not an emoji.';
  return { emoji: first };
}

/** `Intl.Segmenter`, which the app's TypeScript lib target predates. */
type GraphemeSegmenter = new (
  locale: undefined,
  options: { granularity: 'grapheme' },
) => { segment(text: string): Iterable<{ segment: string }> };

function firstGrapheme(text: string): string {
  const Segmenter = (Intl as unknown as { Segmenter?: GraphemeSegmenter }).Segmenter;
  if (Segmenter) {
    const first = new Segmenter(undefined, { granularity: 'grapheme' }).segment(text)[Symbol.iterator]().next();
    return first.done ? '' : first.value.segment;
  }
  return Array.from(text)[0] ?? '';
}

/**
 * The message a tapback goes on: the person's newest. `messages` in the
 * order they were said. Undefined when the person has said nothing yet.
 */
export function latestPersonMessageId(
  messages: readonly { id: string; type: string }[],
): string | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].type === 'user') return messages[index].id;
  }
  return undefined;
}
