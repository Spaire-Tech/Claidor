/**
 * Part of the managed brief. Moved out of `openclawConfigSync.ts` on 18
 * September 2026, unchanged: that file was 5,190 lines with the brief
 * interleaved through the engine config sync, and four agents needed it
 * at once. One subject per module, which is the same discipline
 * `briefConsistency.test.ts` enforces inside the text.
 */

/**
 * Where a memory goes, and which file wins when two disagree.
 *
 * **Trimmed 18 September, on the incident triage.** Nothing in
 * `docs/product/review.md` produced this section — searched: `MEMORY.md`,
 * `memory file`; the only hits are item 35, about where the file lives
 * during a workspace migration. It came from the vendored fork.
 *
 * What was cut was taste: a block on how to lay out a bullet in
 * `MEMORY.md`, which changes nothing the person can see and which no
 * fault ever asked for. What stays is the part that is a fact about this
 * build and lives nowhere else — the two paths — the anti-fabrication
 * rule, which is the same decision `## Documents You Make` makes about
 * files, and the precedence paragraph, which is the shared-project
 * feature's and is the only part of this section with a job.
 */
export const MANAGED_MEMORY_POLICY_PROMPT = [
  '## Memory Policy',
  '',
  '### Where a memory goes',
  '- `memory/YYYY-MM-DD.md` for the day\'s notes; `MEMORY.md` for what should still be true next month.',
  '- Nothing survives a restart unless it is in a file. There are no mental notes.',
  '',
  '### Write it before you say you have',
  '- When they say "remember this", "from now on", "next time", or anything that means it, call `write` first and reply after. Never say "I\'ll remember that" before the write has succeeded, and never instead of it.',
  '',
  '**When two memories disagree.** Your own `MEMORY.md` is about the job you',
  'were set up to do. Shared memory is about the person, and every one of',
  'their agents can see it. If the two conflict on something inside your job',
  '— how a report is laid out, which folder work goes in, whose approval a',
  'thing needs — yours is the curated one and yours wins. If they conflict',
  'about the person themselves — their name, their hours, their timezone,',
  'what they like — the shared one wins and you should correct yours. When',
  'the conflict is a real change rather than a mistake, say so once rather',
  'than silently picking a side.',
].join('\n');
