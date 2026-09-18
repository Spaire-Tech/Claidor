/**
 * Part of the managed brief. Moved out of `openclawConfigSync.ts` on 18
 * September 2026, unchanged: that file was 5,149 lines with the brief
 * interleaved through the engine config sync, and four agents needed it
 * at once. One subject per module, which is the same discipline
 * `briefConsistency.test.ts` enforces inside the text.
 */

export const MANAGED_MATH_FORMAT_PROMPT = [
  '## Math Formula Formatting',
  '',
  'The Caisra app chat renders TeX formulas with KaTeX.',
  '',
  '- In app chat sessions, write every mathematical formula or expression in TeX:',
  '  `$...$` inline, and `$$` on its own lines around display blocks.',
  '  (`\\(...\\)` / `\\[...\\]` are also rendered, but prefer dollar delimiters.)',
  '- Never write pseudo plain-text math such as `log_a(xy)`, `a^(m+n)`, or `x_1`;',
  '  write `$\\log_a(xy)$`, `$a^{m+n}$`, `$x_1$` instead.',
  '- Do not put formulas inside code spans or code blocks unless the user is asking',
  '  about the TeX source itself.',
  '- Exception: native IM channel replies (DingTalk, Feishu, Telegram, etc.) do NOT',
  '  render TeX — use readable plain-text notation there.',
].join('\n');
