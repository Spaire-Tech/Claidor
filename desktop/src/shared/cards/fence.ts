import { CARD_FENCE } from './library';

/**
 * Finding the card blocks in a reply.
 *
 * A reply is text with, sometimes, one or more fenced `openui-lang`
 * blocks in it. The text on either side becomes bubbles as it always
 * did; each block becomes a card item in its place. Nothing here knows
 * the language: that is the renderer's parser. This only knows where
 * the fences are.
 */

export type CardSegment =
  | { kind: 'text'; text: string }
  | { kind: 'card'; program: string };

/**
 * A fence line with the card language, or the bare `openui` the model
 * sometimes writes, closed by the next fence line. Anchored to line
 * starts so a fence inside a sentence is not one.
 */
const CARD_BLOCK = new RegExp(
  `^[ \\t]*\`\`\`[ \\t]*(?:${CARD_FENCE}|openui)[ \\t]*\\r?\\n([\\s\\S]*?)^[ \\t]*\`\`\`[ \\t]*$`,
  'gim',
);

/** The reply in order: text, card, text. Empty text between fences is dropped. */
export function splitCardSegments(content: string): CardSegment[] {
  const out: CardSegment[] = [];
  let last = 0;
  for (const match of content.matchAll(CARD_BLOCK)) {
    const before = content.slice(last, match.index).trim();
    if (before) out.push({ kind: 'text', text: before });
    const program = match[1].trim();
    if (program) out.push({ kind: 'card', program });
    last = match.index + match[0].length;
  }
  const after = content.slice(last).trim();
  if (after) out.push({ kind: 'text', text: after });
  return out;
}

/** The reply without its card blocks, for a preview line. */
export function stripCards(content: string): string {
  return splitCardSegments(content)
    .filter((one): one is Extract<CardSegment, { kind: 'text' }> => one.kind === 'text')
    .map(one => one.text)
    .join('\n\n');
}

/** Whether a reply carries a card block at all. */
export function hasCards(content: string): boolean {
  return splitCardSegments(content).some(one => one.kind === 'card');
}
