/**
 * What to read when something in this app stops working.
 *
 * **Why this file exists.** On the night of 14 September the built-in
 * browser opened a window on the founder's own machine instead of the
 * panel in the app. Asked why, the agent gave three explanations in a
 * row, each stated with confidence, and all three were invented. The
 * founder believed the first one, acted on it, and lost an evening.
 *
 * The cause was not reasoning. It was that nothing told the agent where
 * the evidence lives — and the one line that *would* have settled it,
 * `[OpenClawConfigSync] browser profile=…`, was sitting in a log file
 * the agent had never been told about. Worse, the comment I had written
 * above `logger.ts` named the wrong directory, so even the human
 * investigation looked in an empty folder three times
 * (`docs/product/review.md` §24).
 *
 * `grok-bot-agent-reference.md` §19 and §20 ship the same idea as
 * `debugging-the-box.md`. We have no box, so this is the shape without
 * it: the app's own paths, the lines worth grepping, and — the part that
 * matters — permission to come back with "it failed and here is the log
 * line" instead of a theory.
 *
 * Generated rather than written, so the paths cannot go stale the way
 * that comment did.
 */

/** Where the file lands, relative to the agent's workspace. */
export const WHEN_THINGS_FAIL_PATH = 'reference/when-things-fail.md';

export interface FailureReferenceInput {
  /** The app's own name, as `app.setName()` set it. */
  appName: string;
  /** The real main-log directory, asked of the logger rather than assumed. */
  logDir: string;
  /** Where the engine writes its gateway capture logs. */
  gatewayLogDir?: string;
  /** The generated engine config, for when the question is "what did we ask it to do". */
  engineConfigPath?: string;
}

export function buildFailureReference(input: FailureReferenceInput): string {
  const { appName, logDir, gatewayLogDir, engineConfigPath } = input;

  const lines: string[] = [
    `# When something in ${appName} does not work`,
    '',
    'Generated on every startup, so these paths are this machine\'s, not an',
    'example.',
    '',
    '## The rule',
    '',
    '**Read the log before you explain.** If something failed and you have',
    'not looked, you do not know why, and saying it anyway is the most',
    'expensive thing you can do — a confident wrong answer sends the person',
    'off to fix something that was never broken.',
    '',
    'It is always acceptable to say: *"That failed. Here is the line from',
    'the log, and I do not yet know what causes it."* That is a useful',
    'message. A theory is not.',
    '',
    '## Where the evidence is',
    '',
    `- **The app\'s log** — \`${logDir}\`, one file per day, named \`main-YYYY-MM-DD.log\`.`,
    '  Almost everything below is in here.',
  ];

  if (gatewayLogDir) {
    lines.push(
      `- **The engine\'s own log** — \`${gatewayLogDir}\`. Read this when the app log`,
      '  says a call was made and nothing came back.',
    );
  }
  if (engineConfigPath) {
    lines.push(
      `- **What the engine was actually told** — \`${engineConfigPath}\`. This is`,
      '  generated; editing it by hand is pointless because the next sync',
      '  overwrites it. Read it to find out what the app asked for.',
    );
  }

  lines.push(
    '',
    '## Lines worth searching for',
    '',
    'Grep the day\'s log. Do not read it end to end; these files run to tens',
    'of megabytes.',
    '',
    '| If this is failing | Search for | What it tells you |',
    '|---|---|---|',
    '| A model or provider call | `desktop.proxy.upstream_refused` | The provider\'s own sentence for why it refused. This has settled arguments that two hours of reasoning could not. |',
    '| The browser opening in the wrong place | `browser profile=` | Which browser profile the engine was configured with. `lobster-in-app` is the one inside the app. |',
    '| Anything about the engine\'s configuration | `[OpenClawConfigSync]` | Every decision the app made when it last wrote the engine\'s config. |',
    '| The engine not starting, or dying | `[OpenClaw]` | Startup, readiness, restarts and crashes. |',
    '| A connected app or MCP server | `[MCP]`, `[Connections]` | Connection attempts, auth state, and tool discovery. |',
    '| A scheduled job | `[Cron]`, `[ScheduledTask]` | Whether it fired at all, which is usually the question. |',
    '',
    '## How to work it out',
    '',
    '1. **Find the moment.** Get the timestamp of when it failed from the',
    '   person — "just now" is enough — and look at that part of the day\'s',
    '   log rather than the whole thing.',
    '2. **Search, do not read.** Use the table above. The first matching line',
    '   is usually the answer.',
    '3. **Quote it.** When you report back, give the line. A person can see',
    '   at a glance whether it matches what they did, and they cannot do that',
    '   with a paraphrase.',
    '4. **If the log says nothing**, say the log says nothing. That is itself',
    '   a fact worth having: it usually means the thing never ran, which is a',
    '   different problem from the thing failing.',
    '',
    '## What not to do',
    '',
    '- Do not guess at a cause and present it as the cause.',
    '- Do not offer three possibilities in a row. Find which one it is, or',
    '  say you have not.',
    '- Do not tell the person to reinstall, reset, clear data or change a',
    '  setting until you have read something that points at it. Those are',
    '  expensive and they usually do not help.',
    '- Do not describe a setting or a screen to check without reading',
    '  `reference/app-ui.md` first. If the control is not in that file, it is',
    '  not in this app.',
    '',
  );

  return lines.join('\n');
}
