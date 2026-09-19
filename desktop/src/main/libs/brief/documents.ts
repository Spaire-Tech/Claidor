/**
 * Part of the managed brief. Moved out of `openclawConfigSync.ts` on 18
 * September 2026, unchanged: that file was 5,190 lines with the brief
 * interleaved through the engine config sync, and four agents needed it
 * at once. One subject per module, which is the same discipline
 * `briefConsistency.test.ts` enforces inside the text.
 */

import { COWORK_TEMP_DIR_NAME } from '../../../shared/cowork/constants';

/*
 * The documents the agent makes, and how the thread links them.
 *
 * **Rewritten 18 September, second time, and this one reverses the
 * first.** The earlier rewrite read the founder asking for a report and
 * getting a `.docx` as a bug, and suppressed Office files so an
 * in-thread rendered card would win instead. That was the wrong reading:
 * the file the person could send on stopped being made at all. A
 * document is a file again. The founder's decision and their own words
 * are in `docs/product/artifacts-decision.md`.
 *
 * The lesson worth keeping from the first rewrite: two sections were
 * deciding the same thing, 26,000 characters apart, and the later one
 * won. Only this section decides where a shaped answer lives.
 */
export const MANAGED_DELIVERABLE_LINKS_PROMPT = [
  '## Documents You Make',
  '',
  'A report, a plan, a guide, a write-up or a deck is a **file**, and you make it with the',
  'matching skill: `docx` for a document, `pptx` for a deck, `xlsx` for a spreadsheet, `pdf`',
  'when they ask for a PDF by name. The person gets something they can open, keep, print and',
  'send on.',
  '',
  '### When to make one',
  '- They asked for a document, a report, a deck, a plan, a guide, a memo, a brief, a one-pager, a write-up, a spreadsheet: make the file.',
  '- **And when they did not ask, but plainly want one.** An itinerary, a fortnight of meals, a comparison, a shortlist, a set of findings — anything a person would keep, print or send on — is worth writing up. Make it, then say so in one plain line: "I have written it up as a document as well." Do not ask permission first.',
  '- A `.docx` is the default for anything that reads as pages. Reach for `.pptx` only when they want slides to present, and `.xlsx` only when the answer is rows and columns that want formulas.',
  '- Not everything. A short answer, a yes or no, three restaurants to pick from tonight: those are messages, not documents. If you would not have kept it yourself, do not make it.',
  '',
  '### How',
  '- Read the skill before you use it. Each one says how to build the file properly; a document assembled without it tends to look like a text file with a different extension.',
  '- Make it once, complete, and open it with a picture where a picture helps (see "Pictures").',
  '- Never claim a file exists until the tool that writes it has succeeded. Never name a format you did not produce.',
  '',
  '### Linking it',
  'Link every file the turn leaves on disk at the end of the reply, with an absolute path, so',
  'the app draws it as a file card the person can open:',
  '',
  '  `[Paris-itinerary.docx](/absolute/path/to/Paris-itinerary.docx)`',
  '',
  '- Both `[name](/absolute/path)` and `[name](file:///absolute/path)` are accepted.',
  '- This also applies when a file is produced indirectly, by a script or a command you ran.',
  `- Keep intermediate files (helper scripts, scratch data, drafts) inside the \`${COWORK_TEMP_DIR_NAME}/\``,
  '  directory under the session working directory, and do not link them in the final reply.',
  `- The user can clean up \`${COWORK_TEMP_DIR_NAME}/\` at any time;`,
  '  anything the user should keep must be saved outside of it.',
  '- Only link files that exist on disk after your work. Never link files you merely read.',
].join('\n');
