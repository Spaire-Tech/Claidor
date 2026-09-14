import { spawn } from 'node:child_process';

/**
 * Running one of the engine's own CLI commands.
 *
 * `mcp login`, `mcp logout` and `mcp reload` are the only callers of the
 * engine's OAuth code (`openclaw/src/agents/mcp-oauth.ts`); there is no
 * gateway route for any of it. So the app runs the same entry file the
 * gateway runs, with the same state dir, and reads what it prints.
 *
 * Short-lived and captured, so `spawn` rather than `utilityProcess.fork`:
 * the fork is for the long-running gateway and gives no simple way to
 * read stdout to completion.
 */

export interface OpenClawCliEnvironment {
  /** The resolved runtime entry — what `startGateway` forks. */
  entry: string;
  /** The runtime root, which is the entry's working directory. */
  runtimeRoot: string;
  baseDir: string;
  stateDir: string;
  configPath: string;
}

export interface CliResult {
  code: number | null;
  /** stdout and stderr together: the CLI writes to both and order matters. */
  output: string;
}

/** Nothing here should take minutes. A hang is a failure, not patience. */
export const CLI_TIMEOUT_MS = 60_000;

export function runOpenClawCli(
  environment: OpenClawCliEnvironment,
  args: readonly string[],
  timeoutMs: number = CLI_TIMEOUT_MS,
): Promise<CliResult> {
  return new Promise<CliResult>(resolve => {
    const child = spawn(
      process.execPath,
      [environment.entry, ...args],
      {
        cwd: environment.runtimeRoot,
        env: {
          ...process.env,
          // The state dir is the whole point: it is where the engine keeps
          // the OAuth tokens, so a command run against a different one
          // would sign somebody into nothing.
          OPENCLAW_HOME: environment.baseDir,
          OPENCLAW_STATE_DIR: environment.stateDir,
          OPENCLAW_CONFIG_PATH: environment.configPath,
          OPENCLAW_NO_RESPAWN: '1',
          ELECTRON_RUN_AS_NODE: '1',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      },
    );

    let output = '';
    const take = (chunk: Buffer): void => { output += chunk.toString('utf8'); };
    child.stdout?.on('data', take);
    child.stderr?.on('data', take);

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      output += '\nThe engine did not answer in time.';
    }, timeoutMs);

    child.once('error', error => {
      clearTimeout(timer);
      resolve({ code: null, output: `${output}\n${error.message}`.trim() });
    });
    child.once('close', code => {
      clearTimeout(timer);
      resolve({ code, output });
    });
  });
}
