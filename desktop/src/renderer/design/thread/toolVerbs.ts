/**
 * What the agent is doing, in words a person would use.
 *
 * The engine names its tools `bash`, `web_search`, `sessions_spawn`,
 * `mcp__gmail__send_message`. The voice brief says never to dump tool
 * names at anyone, and the design has one line for this — an orb and a
 * shimmering verb that disappears when the work is done. So every tool
 * becomes a short present-participle phrase, or it becomes the honest
 * generic one.
 *
 * Two rules hold this together:
 *
 * - **A verb is what a person would say they were doing**, not what the
 *   tool is called. `bash` is "Running commands". `glob` is "Looking
 *   through files" — nobody says they are globbing.
 * - **Unknown is not a failure.** New tools arrive with plugins and
 *   connectors, and the generic "Working" is a perfectly good sentence.
 *   Falling back to the raw tool name would be the one thing the voice
 *   brief forbids.
 */

/** The line the person sees while a tool runs. */
export const GENERIC_VERB = 'Working';

/**
 * Exact tool names. Taken from the engine's own tools rather than
 * guessed: `src/agents/tools/` in OpenClaw.
 */
const VERBS: Readonly<Record<string, string>> = {
  // Files
  read: 'Reading',
  write: 'Writing',
  edit: 'Editing',
  glob: 'Looking through files',
  grep: 'Searching your files',
  // The computer
  bash: 'Running commands',
  // The web
  web_search: 'Searching the web',
  web_fetch: 'Reading a page',
  // The agent's own browser
  browser_navigate: 'Opening a page',
  browser_click: 'Clicking through',
  browser_type: 'Filling something in',
  browser_screenshot: 'Taking a look',
  browser_actions: 'Using the browser',
  // Memory
  memory_search: 'Checking what it remembers',
  memory_get: 'Checking what it remembers',
  memory_query: 'Checking what it remembers',
  // Delegation
  sessions_spawn: 'Handing work to another agent',
  sessions_send: 'Talking to another agent',
  sessions_list: 'Checking on its other work',
  sessions_history: 'Catching up on a conversation',
  // Making things
  image_generate: 'Making an image',
  skill_workshop: 'Writing down how to do this',
  todo: 'Planning',
  // Scheduling
  cron_create: 'Setting up a routine',
  cron_list: 'Checking its routines',
};

/**
 * Prefixes, for families where every member means the same thing to a
 * person. Longest match wins, so `browser_navigate` above beats
 * `browser_` here.
 */
const PREFIXES: readonly (readonly [string, string])[] = [
  ['browser_', 'Using the browser'],
  ['memory_', 'Checking what it remembers'],
  ['sessions_', 'Working with another agent'],
  ['image_', 'Making an image'],
  ['cron_', 'Working on a routine'],
  ['skill_', 'Working on a skill'],
];

/**
 * Connector tools arrive as `mcp__<server>__<tool>` and there is no list
 * of them: a person installs Gmail and a dozen appear. The server name is
 * the only part worth saying, and it is the part a person recognises.
 */
const MCP_PATTERN = /^mcp__([^_]+(?:_[^_]+)*?)__/;

/** `gmail` → `Gmail`, `google-calendar` → `Google Calendar`. */
function serviceName(raw: string): string {
  return raw
    .split(/[-_]/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/**
 * The line to show while `toolName` runs.
 *
 * Always a sentence. Never a tool name, never an identifier, never empty.
 */
export function verbForTool(toolName: string | undefined | null): string {
  const name = (toolName ?? '').trim().toLowerCase();
  if (!name) return GENERIC_VERB;

  const exact = VERBS[name];
  if (exact) return exact;

  const mcp = MCP_PATTERN.exec(name);
  if (mcp) {
    const service = serviceName(mcp[1]);
    return service ? `Working in ${service}` : GENERIC_VERB;
  }

  // Longest prefix first, so a family default never beats a specific one.
  const matches = PREFIXES
    .filter(([prefix]) => name.startsWith(prefix))
    .sort((a, b) => b[0].length - a[0].length);
  return matches[0]?.[1] ?? GENERIC_VERB;
}

/** Every verb the module can produce. For the test that keeps them clean. */
export function allVerbs(): readonly string[] {
  return [...new Set([...Object.values(VERBS), ...PREFIXES.map(p => p[1]), GENERIC_VERB])];
}
