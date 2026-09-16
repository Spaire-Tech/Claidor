import { app } from 'electron';

import { resolveClaudeCli } from './claudeCodeCli';

/**
 * Whether this app runs its turns through the Claude Code app on this
 * computer instead of a model API.
 *
 * The founder: *"i asked you to use my claude code sign in for me. i
 * never asked you to add anything on settings … when i ask for claude
 * sign to be used, its for you to switch the mechanic in the code, but
 * thats not visible to others."* So there is no setting. The decision
 * is made here, once, from two facts nobody has to type:
 *
 * - **A development build** (`npm run electron:dev`, not a packaged app)
 *   with Claude Code installed runs on Claude Code. That is the founder
 *   developing on their own Mac, under their own plan.
 * - **A packaged build never does.** A client's app runs on the account
 *   allowance through the metered proxy, whatever is installed beside it.
 *
 * `CAISRA_CLAUDE_CODE=1` forces it on and `=0` forces it off, for the
 * one day either is needed; neither is a screen. The decision is logged
 * at `[ClaudeCode]` so the log says which way it went and why.
 *
 * Nothing here reads or copies Claude Code's credentials. The engine
 * spawns the installed `claude` command and Claude Code signs itself in.
 */

export const CLAUDE_CODE_ENV = 'CAISRA_CLAUDE_CODE';

export interface ClaudeCodeDecision {
  enabled: boolean;
  /** The absolute path of the `claude` command, when one was found. */
  command: string | null;
  /** One sentence for the log. */
  reason: string;
}

const isOn = (value: string): boolean => ['1', 'true', 'on', 'yes'].includes(value);
const isOff = (value: string): boolean => ['0', 'false', 'off', 'no'].includes(value);

/** Pure, so the rule is tested without Electron or a filesystem. */
export function decideClaudeCodeMode(input: {
  env: NodeJS.ProcessEnv;
  packaged: boolean;
  command: string | null;
}): ClaudeCodeDecision {
  const flag = input.env[CLAUDE_CODE_ENV]?.trim().toLowerCase() ?? '';
  if (isOff(flag)) {
    return { enabled: false, command: input.command, reason: `${CLAUDE_CODE_ENV}=${flag}` };
  }
  if (isOn(flag)) {
    return {
      enabled: true,
      command: input.command,
      reason: input.command
        ? `${CLAUDE_CODE_ENV}=${flag}, claude at ${input.command}`
        : `${CLAUDE_CODE_ENV}=${flag}, but no claude command was found; the engine will try a bare \`claude\``,
    };
  }
  if (input.packaged) {
    return { enabled: false, command: input.command, reason: 'packaged build; the account allowance carries the models' };
  }
  if (!input.command) {
    return { enabled: false, command: null, reason: 'development build, but Claude Code is not installed here' };
  }
  return { enabled: true, command: input.command, reason: `development build, claude at ${input.command}` };
}

let decided: ClaudeCodeDecision | undefined;

/** The decision for this process, made on first ask and logged once. */
export function claudeCodeMode(): ClaudeCodeDecision {
  if (!decided) {
    decided = decideClaudeCodeMode({
      env: process.env,
      packaged: app.isPackaged,
      command: resolveClaudeCli(),
    });
    console.log(`[ClaudeCode] ${decided.enabled ? 'on' : 'off'}: ${decided.reason}`);
  }
  return decided;
}
