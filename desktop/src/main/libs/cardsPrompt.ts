import { CARD_FENCE } from '../../shared/cards/library';
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

const PREAMBLE = 'An answer with any shape to it belongs in a card, not in sentences. A set of places, the days of a plan, a comparison, figures, steps, anything you would otherwise write as a long list: put it in one fenced block, written in openui-lang, a small declarative language described below. The app draws the block in the conversation, between your texts.';

const RULES: readonly string[] = [
  `The fence is \`\`\`${CARD_FENCE} on its own line, the program, then \`\`\` on its own line. One card block per reply; a reply may also carry one artifact block after it, which is a different thing (see Artifacts).`,
  'A block is the normal way to answer, not a special occasion. If the answer has a shape — several things, a plan, a table, a set of numbers, anything you would write as more than about four bullets — it is a block. Reach for one first and write prose only when a block would be silly.',
  'Sentences are still sentences. A short reply, a yes or no, a clarification, an explanation with no parts to it: plain text, no block. Two lines of conversation do not become a card because they can.',
  'The block can be the whole answer, and your prose goes inside it as `TextContent`. Open with a `Header`, whose two arguments are not treated alike here: the app draws only the second one, so put the line that is worth reading there, and keep the first to a short plain name. `Header("14-Day Meal Plan", "Balanced breakfasts, lunches and dinners")` shows the second line only. Never restate their question back at them, and never write "showing 5 results".',
  'Compose it. A long answer is one Card holding several parts in order: a Header, a line or two of TextContent, a CalloutV2 for a caveat, a block of cards, an InlineHeader before each new section, a Table, Tabs, Steps, an Accordion, and FollowUpBlock at the end. One widget on its own is rarely the best answer to anything.',
  'Which part for what. Places, hotels, restaurants, products: CompositeCardBlock, each item an ImageTextLarge header, a TagBlock body, and a footer with the price as BoldText and a Button. Days of a plan, or picture-led options: VisualCardBlock, the picture as the card with a Tag on it. Figures: OverviewCardBlock, an IconText above a MetricIndicatorInline. Label and value down a list: EntityList. Anything with rows and columns, and any plan longer than about five items: Table. Ordered work: Steps. Alternatives the person might want: Accordion. Categories: Tabs.',
  'Offer the next move instead of asking for it. When you would otherwise ask a question with a handful of likely answers, answer first on your best assumption, say the assumption in one line, and put the alternatives under it as a ButtonGroup. A question that genuinely blocks the work still goes through the question tool, not into a card.',
  'Every block is complete on its own. The app draws each block by itself, in the message it came in, so a change is a whole new block, never only the changed lines.',
  'Pictures make a card, and a picture you already have the address of costs nothing. When your search results carried image URLs, use them: prefer the place\'s own site, then a reputable publication. Write the address into `src` exactly as you saw it.',
  'Never invent, guess or pattern-match an image address, and never use a placeholder service: a photograph of the wrong place is worse than none. When you have no real address for an item, leave `src` out. The card closes up around the text and still looks right, so a picture is never worth a detour, and never worth a lie.',
  'A Button whose action is {type: "continue_conversation", context: "..."} sends its context back to you as the person\'s next message; then do what it says. A block\'s own action does the same with the card they pressed. {type: "open_url", url: "..."} opens the page in their browser. Write actions as object literals; `Action([...])` and `@` builtins are part of the language this app does not run, and a button written that way does nothing.',
  'An Icon is a Lucide icon by name, kebab-case: "map-pin", "utensils", "calendar", "plane", "trophy".',
  'Never put a password, a key, or a command to run in a card. Those have their own cards in this app, which you reach through their tools.',
];

/**
 * OpenUI's generator appends every extra rule *after* its own
 * `## Final Verification` checklist, so a reader meets the closing
 * check and then eleven more rules with no heading over them. Ours read
 * as an afterthought and theirs as the conclusion, which is half of why
 * the rules in this section were ignored. The checklist is lifted out
 * and put back at the end, where a closing check belongs.
 */
const FINAL_VERIFICATION = /\n## Final Verification\n[\s\S]*?(?=\n\n)/;

export function buildManagedCardsPrompt(): string {
  for (const marker of Object.values(MARKERS)) {
    if (!CARD_PROMPT.includes(marker)) throw new Error(`The generated card prompt lost its ${marker} marker; regenerate it.`);
  }
  const check = CARD_PROMPT.match(FINAL_VERIFICATION);
  if (!check) throw new Error('OpenUI moved its Final Verification checklist; update this file.');
  const prompt = CARD_PROMPT
    .replace(FINAL_VERIFICATION, '')
    .replace(MARKERS.preamble, PREAMBLE)
    .replace(`- ${MARKERS.rules}`, `\n## Rules in this app\n\n- ${RULES.join('\n- ')}`)
    .trimEnd();
  return `## Cards\n\n${prompt}\n${check[0].trim()}\n`;
}
