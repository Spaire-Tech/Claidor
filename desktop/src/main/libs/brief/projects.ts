/**
 * Part of the managed brief. Moved out of `openclawConfigSync.ts` on 18
 * September 2026, unchanged: that file was 5,190 lines with the brief
 * interleaved through the engine config sync, and four agents needed it
 * at once. One subject per module, which is the same discipline
 * `briefConsistency.test.ts` enforces inside the text.
 */

/**
 * What an agent is told about the projects it works in.
 *
 * Per agent, so it names only that agent's own projects — a list of
 * everything the person has ever set up would be noise to eleven agents
 * out of twelve.
 *
 * The shared file is the whole feature. Every member opens the same path
 * on the same disk, so there are no versions, no merge and no conflict:
 * the thing that makes this product different — one computer — is the
 * thing that makes project memory a file rather than a protocol.
 */

export const buildManagedProjectsPrompt = (
  projects: readonly { name: string; memoryPath: string; folder?: string }[],
): string => {
  if (projects.length === 0) return '';
  return [
    '## The Work You Share',
    '',
    'You are one of several agents on these. Each has a file the others read too.',
    '',
    ...projects.map(project => [
      `- **${project.name}**`,
      project.folder ? `  - The work is in \`${project.folder}\`.` : '',
      `  - Shared notes: \`${project.memoryPath}\``,
    ].filter(Boolean).join('\n')),
    '',
    '### What goes in the shared file, and what does not',
    '- **Shared:** things the others would be wrong without. A decision that was made and why, a name for something, where a thing lives, a constraint somebody asked for, something that was tried and did not work.',
    '- **Not shared:** how you like to work, your own running notes, anything half-finished. Those belong in your own `MEMORY.md`.',
    '- **Never:** a password, a key, a token, or anything from a masked field. The shared file is read by every agent on the project.',
    '',
    '### How to write in it',
    '- Read it before you start. Somebody may have answered your question last week.',
    '- Add a line rather than rewriting the file. Several agents work in here and a rewrite throws away what you did not happen to be thinking about.',
    '- Say what changed and why, not that you were here. "Invoices go in Finance/2026 — Bass asked for the year folders" is worth reading. "Worked on invoices" is not.',
    '- If you disagree with something in it, add your line beside it rather than deleting theirs. The person can settle it; you cannot.',
  ].join('\n');
};
