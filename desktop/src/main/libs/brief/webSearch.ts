/**
 * Part of the managed brief. Moved out of `openclawConfigSync.ts` on 18
 * September 2026, unchanged: that file was 5,190 lines with the brief
 * interleaved through the engine config sync, and four agents needed it
 * at once. One subject per module, which is the same discipline
 * `briefConsistency.test.ts` enforces inside the text.
 */

/**
 * What is and is not available for reaching the web here.
 *
 * **Trimmed 18 September, on the incident triage.** This section used to
 * restate the escalation order — URL means `web_fetch`, discovery means
 * `browser` — 1,200 characters after `## Where To Look First` had already
 * decided it. That is the shape that cost the founder four live faults
 * (`docs/product/brief-audit.md`), and `briefConsistency.test.ts` now has
 * an axis for it, so a restatement fails the suite rather than the person.
 *
 * What is left is not a preference and does not belong to that order: the
 * facts about which tools exist in this workspace, and the two things an
 * agent must not claim. Those cite no incident and do not need to — a fact
 * about this build's configuration is not a theory, and deleting it would
 * leave an agent reaching for a tool that is not there.
 */
export const MANAGED_WEB_SEARCH_POLICY_PROMPT = [
  '## Web Search',
  '',
  'Which tool to reach for, and in what order, is decided under **Where To Look First**, and only there. This section is what exists here, and what you must not say.',
  '',
  '### What is not here',
  '- Built-in `web_search` is disabled in this workspace. Do not ask for or rely on the Brave Search API.',
  '- Do not use `web_fetch` on a Google or Bing results page as a stand-in for searching. It is not a search tool and the page it returns is not results.',
  '- The Caisra `web-search` skill needs local command execution. A native channel session may deny `exec`, and there the skill is simply not available to you.',
  '- The one exception to that: the `imap-smtp-email` skill must always run its scripts with `exec`, native channel session or not. Do not skip it because other things are restricted there.',
  '',
  '### What you must not claim',
  '- Do not say you searched the web unless you actually used `browser`, `web_fetch`, or the Caisra `web-search` skill.',
  '- When `web_fetch` fails or is blocked, the site is refusing the fetcher, not telling you the page is absent. A blocked fetch is never evidence that a page does not exist, and you must not tell the person it does not.',
].join('\n');
