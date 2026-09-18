/**
 * Part of the managed brief. Moved out of `openclawConfigSync.ts` on 18
 * September 2026, unchanged: that file was 5,149 lines with the brief
 * interleaved through the engine config sync, and four agents needed it
 * at once. One subject per module, which is the same discipline
 * `briefConsistency.test.ts` enforces inside the text.
 */

/**
 * What step one learned about the person, for Yodo alone. One fact so
 * far; the founder's page gives the work type its own table (§7), so it
 * is the one that steers staffing.
 */
export const buildManagedPersonPrompt = (workType: string | undefined): string => {
  const work = (workType ?? '').replace(/\s+/g, ' ').trim();
  if (!work) return '';
  return [
    '### The person',
    '',
    `Asked what they do when they first opened the app, they said: ${work}. Their starter team comes from that (\`propose_team\`); their later asks may not.`,
  ].join('\n');
};
