/** Runs git with the agents' git environment (`process-env.ts`) and hands back what it printed. */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createGitProcessEnv } from "./process-env.js";

const run = promisify(execFile);

/** git's own options that take the next argument as their value: that argument is not the command. */
const TAKES_A_VALUE = new Set(["-c", "-C", "--git-dir", "--work-tree"]);

/** The git command among the arguments ("status" in `-C /repo status`): the first that is neither an option nor an option's value. */
function commandIn(args: readonly string[]): string | undefined {
  let valueNext = false;
  for (const arg of args) {
    if (valueNext) {
      valueNext = false;
    } else if (TAKES_A_VALUE.has(arg)) {
      valueNext = true;
    } else if (!arg.startsWith("-")) {
      return arg;
    }
  }
  return undefined;
}

export interface GitExecFileOptions {
  readonly cwd?: string | undefined;
  readonly env?: NodeJS.ProcessEnv | undefined;
  readonly encoding?: BufferEncoding | undefined;
  readonly timeout?: number | undefined;
  readonly killSignal?: NodeJS.Signals | number | undefined;
}

export async function gitExecFile(
  file: string,
  args: readonly string[],
  options?: GitExecFileOptions,
): Promise<{ stdout: string; stderr: string }> {
  const { env, encoding = "utf8", ...others } = options ?? {};
  const { stdout, stderr } = await run(file, [...args], {
    ...others,
    encoding,
    env: createGitProcessEnv({ command: commandIn(args), optionsEnv: env }),
  });
  return { stdout: String(stdout), stderr: String(stderr) };
}
