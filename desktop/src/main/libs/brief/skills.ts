/**
 * Part of the managed brief. Moved out of `openclawConfigSync.ts` on 18
 * September 2026, unchanged: that file was 5,149 lines with the brief
 * interleaved through the engine config sync, and four agents needed it
 * at once. One subject per module, which is the same discipline
 * `briefConsistency.test.ts` enforces inside the text.
 */

export const buildManagedSkillCreationPrompt = (skillsDirPath: string): string => [
  '## Skill Creation',
  '',
  'When the user asks you to create a new skill, you MUST place it under the Caisra skills directory:',
  '',
  `  ${skillsDirPath}/<skill-name>/SKILL.md`,
  '',
  'Do NOT create skills under the workspace `skills/` subdirectory.',
].join('\n');
