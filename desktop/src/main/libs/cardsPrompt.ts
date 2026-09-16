import { generateSystemPrompt } from '@openuidev/lang-core';

import { CARD_FENCE, CARD_LIBRARY, ROW_ADVICE } from '../../shared/cards/library';

/**
 * The section of the brief that teaches an agent the answer cards.
 *
 * Generated from the one list in `shared/cards/library.ts`, so a
 * component added there is taught here and drawn in the thread with no
 * third place to update. OpenUI writes the grammar and the signatures;
 * the opening line and the rules are ours, because its own opening
 * says the whole reply must be code, and here a reply is texts with a
 * card between them.
 *
 * OpenUI's core sends a pseudonymous record of every generated prompt
 * to their analytics unless told not to. It is told not to, here, in
 * the only process that generates one.
 */
export function buildManagedCardsPrompt(): string {
  process.env.OPENUI_TELEMETRY_DISABLED = '1';
  const generated = generateSystemPrompt({
    library: CARD_LIBRARY.toSpec(),
    promptOptions: {
      inlineMode: true,
      toolCalls: false,
      bindings: false,
      preamble: [
        'Some answers are better as cards than as sentences: a few places to choose from, the days of a plan, a set of figures, a comparison. For those, put one fenced block in your reply, written in openui-lang, a small declarative language described below. The app draws the block as cards, in its own design, between your texts.',
      ].join('\n'),
      additionalRules: [
        `The fence is \`\`\`${CARD_FENCE} on its own line, the program, then \`\`\` on its own line. One block per reply at most.`,
        'Your texts stay texts. Say what you have to say in plain sentences before or after the block; the block is the set of things, not the answer to a question.',
        'Use a block only when the answer is a set of things: places, options, steps, figures, a comparison. A question, an explanation, a yes or no, a plan in prose: no block.',
        'Pictures are what make a card. For a place, a landmark, a building, a dish, a company, a person with a page: fetch `https://en.wikipedia.org/api/rest_v1/page/summary/<Title_With_Underscores>` with `web_fetch` and use `originalimage.source` (or `thumbnail.source`) as the image. One fetch per tile, in parallel where you can. If the page has no image, or there is no page, leave the argument out: a card with no picture is fine, a card with a wrong one is not.',
        'An image argument must be a real https URL you have actually seen in a tool result in this conversation. Never invent, guess or "typical" one.',
        `A Row scrolls past ${ROW_ADVICE} items; three to six Tiles is a good Row. Put the person's likely first choice first.`,
        'A Tile\'s action label ("Book", "Choose", "Open") sends that choice back to you as their next message; then do what it says.',
        'Never put a password, a key, a command to run, or a question that needs an answer in a card. Those have their own cards in this app, which you reach through their tools.',
      ],
    },
  });
  return `## Cards\n\n${generated.trim()}`;
}
