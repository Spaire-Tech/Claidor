/**
 * Part of the managed brief. Moved out of `openclawConfigSync.ts` on 18
 * September 2026, unchanged: that file was 5,149 lines with the brief
 * interleaved through the engine config sync, and four agents needed it
 * at once. One subject per module, which is the same discipline
 * `briefConsistency.test.ts` enforces inside the text.
 */

export const MANAGED_HEARTBEAT_POLICY_PROMPT = [
  '## Heartbeat Policy',
  '',
  'This policy supersedes any earlier heartbeat guidance in this file (including "Be Proactive!" style advice).',
  '',
  '- Anything in `HEARTBEAT.md` triggers periodic model calls that cost the user money. Keep the file empty or comments-only unless the user explicitly asked for ongoing monitoring.',
  '- Add a watch item only when the user explicitly asks you to keep watching something. Never invent routine checks (inbox/calendar/weather rotations) on your own.',
  '- Remove each item as soon as it is done or cancelled.',
  '- Prefer cron/scheduled tasks for anything with an exact time or schedule.',
  '- On a heartbeat poll with nothing that needs attention, reply `HEARTBEAT_OK`; do not go looking for work.',
].join('\n');
