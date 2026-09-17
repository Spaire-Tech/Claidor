#!/usr/bin/env node
/**
 * Writes the generated halves of the brief that teach an agent OpenUI's
 * libraries, from the libraries `@openuidev/thesys` ships, so the words
 * the agent reads are the words the renderer understands, at the same
 * version:
 *
 * - `src/shared/artifacts/prompts.generated.ts`: the slide deck and the
 *   report, component signatures only.
 * - `src/shared/cards/prompt.generated.ts`: the answer cards, the whole
 *   prompt OpenUI generates for its chat library, with two markers where
 *   our own opening and rules go (`main/libs/cardsPrompt.ts`).
 *
 * Generated rather than built at runtime because the package pulls the
 * whole renderer with it (charts, maths, an editor), which has no place
 * in the main process. A test regenerates and compares, so the files
 * cannot drift from the package.
 *
 *   node scripts/generate-artifact-prompts.mjs
 */
import { writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.OPENUI_TELEMETRY_DISABLED = '1';
const { generateSystemPrompt, createParser } = await import('@openuidev/lang-core');
const { chatLibrary, presentationLibrary, reportLibrary } = await import('@openuidev/thesys');
const { CARD_EXAMPLES, checkCardExamples } = await import('./cardExamples.mjs');

/** Where our words go in the generated card prompt. `cardsPrompt.ts` replaces them. */
export const CARD_PROMPT_MARKERS = { preamble: '@@CAISRA_PREAMBLE@@', rules: '@@CAISRA_RULES@@' };

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const version = JSON.parse(readFileSync(path.join(root, 'node_modules/@openuidev/thesys/package.json'), 'utf8')).version;

/** The part of a generated prompt that is about this library and not about the language: the signatures. */
export function signaturesOf(prompt) {
  const start = prompt.indexOf('## Component Signatures');
  const end = prompt.indexOf('## Hoisting & Streaming');
  if (start < 0 || end < 0) throw new Error('OpenUI changed its prompt layout; update this script.');
  return prompt.slice(start, end).trim();
}

/**
 * The viewers (`<Presentation>` and `<Report>`) parse a program whose root
 * is `SlideShow(title, subtitle?, slides)` or `ReportView(title, subtitle?,
 * pages)`: the shape OpenUI Cloud emits. The exported libraries name
 * their roots `Presentation(metadata, slides)` and `Report(metadata,
 * pages)` instead, so the root line is rewritten to the viewers' and the
 * rest is theirs verbatim. The harness renders both to prove the shape.
 */
export const VIEWER_ROOTS = {
  presentation: {
    from: /^Presentation\(metadata:.*$/m,
    to: 'SlideShow(title: string, subtitle?: string, slides: Slide[]) — The deck. Root of every deck; slides render progressively as they stream.',
  },
  report: {
    from: /^Report\(metadata:.*$/m,
    to: 'ReportView(title: string, subtitle?: string, pages: Page[]) — The report. Root of every report; pages stack vertically and render as they stream.',
  },
};

function withViewerRoot(signatures, kind) {
  const { from, to } = VIEWER_ROOTS[kind];
  if (!from.test(signatures)) throw new Error(`OpenUI changed the ${kind} root signature; update this script.`);
  return signatures.replace(from, to);
}

export function build() {
  const options = { toolCalls: false, bindings: false };
  const presentation = withViewerRoot(signaturesOf(generateSystemPrompt({ library: presentationLibrary.toSpec(), promptOptions: options })), 'presentation');
  const report = withViewerRoot(signaturesOf(generateSystemPrompt({ library: reportLibrary.toSpec(), promptOptions: options })), 'report');
  return { version, presentation, report };
}

/**
 * The answer cards: OpenUI's whole prompt for its chat library, with
 * their own chat rules and four worked examples in ours
 * (`cardExamples.mjs`), and a marker where this app's rules are
 * appended. The signatures, the grammar and the streaming advice are
 * theirs verbatim.
 *
 * **What changed on 18 September, and why.** This used to pass
 * `inlineMode: true` and replace `examples` and `additionalRules` with
 * two markers. Three things followed from that, all bad:
 *
 * - Inline mode injects a section written for OpenUI's *dashboard
 *   editor*: "If the user asks a QUESTION … Do NOT output any
 *   openui-lang code. The existing dashboard stays unchanged." There is
 *   no dashboard in a messages app and every message is a question, so
 *   that one section forbade cards outright. It is gone.
 * - Replacing `examples` meant passing none. The model read the grammar
 *   and 12,000 characters of signatures and never saw one finished
 *   answer.
 * - Replacing `additionalRules` threw away all thirteen of OpenUI's own
 *   (`openuiChatAdditionalRules`), including "Every response is a
 *   single Card", "Use FollowUpBlock at the END" and "Use SectionBlock
 *   to group long responses".
 *
 * Their thirteen are adapted rather than copied, because they name
 * components from `openuiChatLibrary` and we render with the thesys
 * `chatLibrary` superset: no `Stack` here either way, `Tabs` and the
 * blocks' own `"carousel"` layout instead of a `Carousel` component,
 * `List` for `ListBlock`, `SectionBlock` present under its own name.
 * The picture rule is deliberately not theirs; see `cardsPrompt.ts`.
 */
// OpenUI's generator emits one rule of its own above ours: "Choose
// components that best represent the content (tables for comparisons,
// charts for trends, forms for input, etc.)". Forms are pruned from the
// signatures here and forbidden two rules later — a password, a key and
// a question all have their own cards, reached through their own tools —
// so that clause recommends something the model cannot write and must
// not want. Dropped (18 September audit).
const OPENUI_RULES_DROPPED = [
  'Choose components that best represent the content',
];

const CHAT_RULES = [
  'Every response is a single `root = Card([...])`; its children stack vertically on their own. Card takes no layout arguments.',
  'Card is the only container. There is no Stack here. Use `Tabs` to switch between sections, and a card block\'s `"carousel"` layout for horizontal scroll.',
  'Use `FollowUpBlock` at the END of a Card to suggest what the person can do or ask next.',
  'Use `List` when presenting a set of options or steps the person can read down.',
  'Use `SectionBlock` to group a long answer into collapsible sections; each `SectionBlockItem` needs a unique value, a trigger label and its content.',
  'When asked about data you cannot look up, say so rather than inventing figures. Never present a guess as a fact inside a card, where it reads as checked.',
  'Every item in a card block must have the same shape as its siblings: if one has a picture, a tag and a price, they all do.',
  'Define one reference per part on its own line and keep the parts shallow. Deeply nested inline calls stream badly and are hard to correct.',
];

/**
 * Components the brief does not teach, and why.
 *
 * OpenUI's own reliability guidance puts this first: *"Simplify the
 * component schema… Remove overlapping components and use
 * componentGroups to group related components."* The signatures were
 * the largest section of the whole brief at 12,400 characters, and a
 * third of it was a form system this app forbids in the very next
 * breath: the rules say never put a form or a question that needs an
 * answer in a card, because those have their own cards reached through
 * their own tools. Teaching eighteen form components and then banning
 * them is a contradiction the model has to resolve for itself.
 *
 * The renderer still draws every one of these. They are only untaught,
 * so nothing that already works stops working.
 */
const CARDS_NOT_TAUGHT = new Set([
  // A form belongs to `ask_user_input` and the question card, never to an answer.
  'Form', 'FormControl', 'Input', 'TextArea', 'Select', 'SelectItem',
  'Chips', 'ChipItem', 'OptionCard', 'OptionCards',
  'CheckBoxGroup', 'CheckBoxItem', 'RadioGroup', 'RadioItem',
  'SwitchGroup', 'SwitchItem', 'DatePicker', 'Slider',
  // Editing a table writes state back, which needs the v0.5 runtime this app does not wire.
  'EditableTable',
  // Overlapping with Composite/Overview/Visual, which the rules name by job.
  'ContextCardBlock', 'ContextCardItem', 'SnippetCardBlock', 'SnippetCardItem',
  // Bar, line, area and pie cover an answer; these are dashboard shapes.
  'RadarChart', 'ScatterChart', 'RadialChart', 'SegmentedBar',
]);

export function buildCards() {
  const full = chatLibrary.toSpec();
  const kept = Object.fromEntries(
    Object.entries(full.components).filter(([name]) => !CARDS_NOT_TAUGHT.has(name)),
  );
  const missing = [...CARDS_NOT_TAUGHT].filter(name => !(name in full.components));
  if (missing.length) throw new Error(`These are not in the chat library any more; drop them from CARDS_NOT_TAUGHT: ${missing.join(', ')}`);
  const spec = { ...full, components: kept };
  const faults = checkCardExamples(program => createParser(spec.schema, spec.root).parse(program));
  if (faults.length) {
    throw new Error(`The card examples are not valid programs for this library:\n  - ${faults.join('\n  - ')}`);
  }
  let prompt = generateSystemPrompt({
    library: spec,
    promptOptions: {
      toolCalls: false,
      bindings: false,
      preamble: CARD_PROMPT_MARKERS.preamble,
      examples: CARD_EXAMPLES,
      additionalRules: [...CHAT_RULES, CARD_PROMPT_MARKERS.rules],
    },
  });
  for (const marker of Object.values(CARD_PROMPT_MARKERS)) {
    if (!prompt.includes(marker)) throw new Error(`OpenUI dropped the ${marker} marker; update this script.`);
  }
  for (const dropped of OPENUI_RULES_DROPPED) {
    const line = new RegExp(`^- ${dropped.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*$\n?`, 'm');
    if (!line.test(prompt)) throw new Error(`OpenUI no longer emits "${dropped}"; drop it from OPENUI_RULES_DROPPED.`);
    prompt = prompt.replace(line, '');
  }
  if (/## Inline Mode/.test(prompt)) {
    throw new Error('Inline mode came back into the generated prompt; it tells the model to answer questions in plain text.');
  }
  return { version, root: chatLibrary.root, prompt };
}

export function render({ version, presentation, report }) {
  const quote = text => JSON.stringify(text);
  return [
    '// Generated by scripts/generate-artifact-prompts.mjs from @openuidev/thesys. Do not edit.',
    '',
    `export const ARTIFACT_LIBRARY_VERSION = ${quote(version)};`,
    '',
    '/** The slide deck library, as OpenUI teaches it: component signatures only. */',
    `export const PRESENTATION_SIGNATURES = ${quote(presentation)};`,
    '',
    '/** The report library, the same way. */',
    `export const REPORT_SIGNATURES = ${quote(report)};`,
    '',
  ].join('\n');
}

/**
 * The one thing ours in a card block: the typeface. OpenUI's stylesheet
 * writes its typography tokens (`--openui-text-body-default: 400 16px/1.5
 * "Inter", sans-serif`, thirty-odd of them) on `:root` with the face baked
 * into the `font` shorthand, so overriding `--openui-font-body` under the
 * block changes nothing. This reads every such token from their
 * stylesheet and redeclares it under `.caisra-cards` with the thread's
 * face in place of Inter and each size moved onto the thread's scale
 * (`CARD_TYPE_SCALE`); weights and leading ratios are theirs.
 */

/**
 * Their sizes onto ours. The thread is set at 14 (a message) with 13.5
 * for buttons and rows, 13 small, 12.5 captions, 16 a section title;
 * their chat scale starts at 16 and reads a size too large beside the
 * bubbles. The founder, on the first full-size shots: *"the layout is
 * disastrous, the proportions"*.
 */
export const CARD_TYPE_SCALE = { 32: 25.5, 28: 20.5, 24: 20, 18: 16, 16: 14, 14: 13, 12: 12.5, 11: 12 };

export function buildCardsCss() {
  const css = readFileSync(path.join(root, 'node_modules/@openuidev/react-ui/dist/styles/index.css'), 'utf8');
  const tokens = new Map();
  for (const match of css.matchAll(/(--openui-text-[a-z0-9-]+):\s*([^;}]*"Inter"[^;}]*)/g)) {
    const value = match[2].trim()
      .replace(/"Inter",\s*sans-serif/, 'var(--fsr-font-ui)')
      .replace(/\b(\d+)px\b/, (whole, px) => {
        const ours = CARD_TYPE_SCALE[Number(px)];
        if (ours === undefined) throw new Error(`OpenUI uses a ${px}px size the scale does not map; update CARD_TYPE_SCALE.`);
        return `${ours}px`;
      });
    tokens.set(match[1], value);
  }
  if (tokens.size === 0) throw new Error('OpenUI changed how its stylesheet names the face; update this script.');
  return { version, tokens: Object.fromEntries([...tokens].sort(([a], [b]) => a.localeCompare(b))) };
}

export function renderCardsCss({ version, tokens }) {
  return [
    '/* Generated by scripts/generate-artifact-prompts.mjs from @openuidev/react-ui ' + version + '. Do not edit. */',
    '/* OpenUI\'s typography tokens, each with the thread\'s face in place of Inter and its size on the thread\'s scale (`cards.css`). */',
    '.caisra-cards {',
    ...Object.entries(tokens).map(([name, value]) => `  ${name}: ${value};`),
    '}',
    '',
  ].join('\n');
}

export function renderCards({ version, root, prompt }) {
  const quote = text => JSON.stringify(text);
  return [
    '// Generated by scripts/generate-artifact-prompts.mjs from @openuidev/thesys. Do not edit.',
    '',
    `export const CARD_LIBRARY_VERSION = ${quote(version)};`,
    '',
    '/** The root component of every card block, as OpenUI names it. */',
    `export const CARD_ROOT = ${quote(root)};`,
    '',
    '/** The whole prompt OpenUI generates for its chat library, inline mode, with our two markers in it. */',
    `export const CARD_PROMPT = ${quote(prompt)};`,
    '',
  ].join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = path.join(root, 'src/shared/artifacts/prompts.generated.ts');
  writeFileSync(out, render(build()));
  const { presentation, report } = build();
  console.log(`wrote ${path.relative(root, out)}: presentation ${presentation.length} chars, report ${report.length} chars, thesys ${version}`);
  const cardsOut = path.join(root, 'src/shared/cards/prompt.generated.ts');
  const cards = buildCards();
  writeFileSync(cardsOut, renderCards(cards));
  console.log(`wrote ${path.relative(root, cardsOut)}: cards ${cards.prompt.length} chars, root ${cards.root}`);
  const cssOut = path.join(root, 'src/renderer/design/thread/cards.generated.css');
  const css = buildCardsCss();
  writeFileSync(cssOut, renderCardsCss(css));
  console.log(`wrote ${path.relative(root, cssOut)}: ${Object.keys(css.tokens).length} typography tokens`);
}
