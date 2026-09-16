import { CARD_FENCE, CARD_ROOT } from '../../shared/cards/library';
import { CARD_PROMPT } from '../../shared/cards/prompt.generated';

/**
 * The section of the brief that teaches an agent the answer cards.
 *
 * OpenUI's own prompt for its chat library, generated from the package
 * the renderer draws with (`scripts/generate-artifact-prompts.mjs`, so
 * the signatures the agent reads are the components the thread has),
 * with two things ours: the opening, because theirs says the whole
 * reply must be code and here a reply is texts with a block between
 * them; and the rules, which are about this app — the fence, when a
 * block is worth it, where a picture may come from, and what a card
 * must never carry.
 */

/** The two markers the generator leaves in the prompt for our words. Same strings as the generator's. */
const MARKERS = { preamble: '@@CAISRA_PREAMBLE@@', rules: '@@CAISRA_RULES@@' } as const;

const PREAMBLE = 'Some answers are better as cards than as sentences: a few places to choose from, the days of a plan, a set of figures, a comparison. For those, put one fenced block in your reply, written in openui-lang, a small declarative language described below. The app draws the block as cards between your texts.';

const RULES: readonly string[] = [
  `The fence is \`\`\`${CARD_FENCE} on its own line, the program, then \`\`\` on its own line. One block per reply at most.`,
  'Your texts stay texts. Say what you have to say in plain sentences before or after the block; the block is the set of things, not the answer to a question.',
  'Use a block only when the answer is a set of things: places, options, days, figures, a comparison. A question, an explanation, a yes or no, a plan in prose: no block.',
  `Every block is one \`root = ${CARD_ROOT}([...])\`; its children stack. Start with a Header(title, subtitle) when the set has a name, and end with a ButtonGroup of what the person can do next if there is something to do.`,
  'Every block is complete on its own. The app draws each block by itself, in the message it came in, so a change is a whole new block, never only the changed lines.',
  'Which block for what. Places, hotels, restaurants, products: CompositeCardBlock, each item with an ImageTextLarge header (picture, name, one line), a TagBlock in the body, and a footer with the price as BoldText and a Button. The days of a plan, or a set of options: VisualCardBlock, the picture as the card, a Tag ("Day 1") on it. Figures: OverviewCardBlock, an IconText on top and a MetricIndicatorInline under it. Highlights: EntityList, a label on the left and its value on the right. A comparison on the same points: Table. Steps in order: Steps.',
  'Pictures are what make a card. For a place, a landmark, a building, a dish, a company, a person with a page: fetch `https://en.wikipedia.org/api/rest_v1/page/summary/<Title_With_Underscores>` with `web_fetch` and use `originalimage.source` (or `thumbnail.source`) as the src. One fetch per item, in parallel where you can. If the page has no image, or there is no page, leave src out: a card with no picture is fine, a card with a wrong one is not.',
  'A src must be a real https URL you have actually seen in a tool result in this conversation. Never invent, guess or "typical" one.',
  'A Button whose action is {type: "continue_conversation", context: "..."} sends its context back to you as the person\'s next message; then do what it says. A block\'s own action does the same with the card they pressed. {type: "open_url", url: "..."} opens the page in their browser.',
  'An Icon is a Lucide icon by name, kebab-case: "map-pin", "utensils", "calendar", "plane", "trophy".',
  'Never put a password, a key, a command to run, a form, or a question that needs an answer in a card. Those have their own cards in this app, which you reach through their tools.',
];

export function buildManagedCardsPrompt(): string {
  for (const marker of Object.values(MARKERS)) {
    if (!CARD_PROMPT.includes(marker)) throw new Error(`The generated card prompt lost its ${marker} marker; regenerate it.`);
  }
  const prompt = CARD_PROMPT
    .replace(MARKERS.preamble, PREAMBLE)
    // OpenUI appends extra rules as one list item at the very end, after
    // its verification list; ours get their own heading there.
    .replace(`- ${MARKERS.rules}`, `## Rules in this app\n- ${RULES.join('\n- ')}`);
  return `## Cards\n\n${prompt.trim()}`;
}
