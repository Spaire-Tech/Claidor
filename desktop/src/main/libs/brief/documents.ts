/**
 * Part of the managed brief. Moved out of `openclawConfigSync.ts` on 18
 * September 2026, unchanged: that file was 5,149 lines with the brief
 * interleaved through the engine config sync, and four agents needed it
 * at once. One subject per module, which is the same discipline
 * `briefConsistency.test.ts` enforces inside the text.
 */

import { COWORK_TEMP_DIR_NAME } from '../../../shared/cowork/constants';

/*
 * Linking a file the turn actually made, so the thread can draw it as a
 * file card (`shared/thread/links.ts`).
 *
 * **Rewritten 18 September.** Inherited from upstream, this section
 * opened: "When a turn creates or updates user-facing deliverable files
 * (documents, spreadsheets, presentations, HTML pages, images…) you
 * MUST list each deliverable… `[report.docx](/absolute/path/…)`". It
 * sat 26,000 characters after the `## Artifacts` section, which says a
 * report is a card. The founder asked for a report and got a `.docx`,
 * twice, and I read that as the card path failing and falling back. It
 * was not failing. This section was winning, because it came later and
 * shouted.
 *
 * The link convention stays: it is what makes a file card. What goes is
 * the instruction to treat making an Office document as the normal way
 * to answer.
 */
export const MANAGED_DELIVERABLE_LINKS_PROMPT = [
  '## Files You Made',
  '',
  'A report, a deck, a plan or a summary is a card in the conversation, not a file on disk.',
  'Write it as an artifact block and the person can read it, open it full size and save it',
  'themselves. Do not reach for a document generator, a script or a shell command to produce',
  'one, and never make a `.docx`, `.xlsx` or `.pptx` unless the person asked for that file in',
  'those words, or asked for something they plainly need to send on to somebody else.',
  '',
  'When a turn really does leave a file on disk, link it at the end of the reply with an',
  'absolute path, so the app can draw it as a file card:',
  '',
  '  `[notes.pdf](/absolute/path/to/notes.pdf)`',
  '',
  '- Both `[name](/absolute/path)` and `[name](file:///absolute/path)` are accepted.',
  '- This also applies when a file is produced indirectly, by a script or a command you ran.',
  `- Keep intermediate files (helper scripts, scratch data, drafts) inside the \`${COWORK_TEMP_DIR_NAME}/\``,
  '  directory under the session working directory, and do not link them in the final reply.',
  `- The user can clean up \`${COWORK_TEMP_DIR_NAME}/\` at any time;`,
  '  anything the user should keep must be saved outside of it.',
  '- Only link files that exist on disk after your work. Never link files you merely read.',
].join('\n');
