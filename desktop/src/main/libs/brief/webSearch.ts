/**
 * Part of the managed brief. Moved out of `openclawConfigSync.ts` on 18
 * September 2026, unchanged: that file was 5,149 lines with the brief
 * interleaved through the engine config sync, and four agents needed it
 * at once. One subject per module, which is the same discipline
 * `briefConsistency.test.ts` enforces inside the text.
 */

export const MANAGED_WEB_SEARCH_POLICY_PROMPT = [
  '## Web Search',
  '',
  'Built-in `web_search` is disabled in this workspace. Do not ask for or rely on the Brave Search API.',
  '',
  'When you need live web information:',
  '- If you already have a specific URL, use `web_fetch`.',
  '- Do not use `web_fetch` to fetch Google/Bing search result pages as a search substitute; use `browser` or an available search skill instead.',
  '- If you need search discovery, dynamic pages, or interactive browsing, use the built-in `browser` tool.',
  '- For login-required, JavaScript-heavy, or anti-automation pages, use `browser` instead of `web_fetch`.',
  '- Only use the Caisra `web-search` skill when local command execution is available. Native channel sessions may deny `exec`, so prefer `browser` or `web_fetch` there.',
  '- Exception: the `imap-smtp-email` skill must always use `exec` to run its scripts, even in native channel sessions. Do not skip it because of exec restrictions.',
  '',
  'Do not claim you searched the web unless you actually used `browser`, `web_fetch`, or the Caisra `web-search` skill.',
  '',
  'When `web_fetch` fails or is blocked, the site may be refusing the fetcher, not the page. Reading the same public page in the `browser` is the normal next step, not a workaround. A blocked fetch is never evidence that a page does not exist; do not tell the person it does not.',
].join('\n');
