/**
 * The environment git runs in for the agents: English output whatever the
 * machine's language, no pager, the git command named for whoever watches the
 * process, and four settings pinned so that a checkout's own configuration
 * cannot run hooks or attribute filters, start a file watcher, or be taken
 * for a bare repository.
 */
import { devNull } from "node:os";

/** Settings forced on every git command, given as git's own GIT_CONFIG_KEY_n and GIT_CONFIG_VALUE_n pairs. */
const PINNED: ReadonlyArray<readonly [key: string, value: string]> = [
  ["safe.bareRepository", "explicit"],
  ["core.fsmonitor", "false"],
  ["core.hooksPath", devNull],
  ["core.attributesFile", devNull],
];

/** How many settings the environment already carries; anything that is not a count is none. */
function settingsGiven(env: NodeJS.ProcessEnv): number {
  const raw = env.GIT_CONFIG_COUNT;
  if (raw === undefined || raw === "") return 0;
  const count = Number.parseInt(String(raw), 10);
  return Number.isFinite(count) && count >= 0 ? count : 0;
}

function pin(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const out = { ...env };
  const given = settingsGiven(env);
  const pinnedValue = new Map(PINNED);
  const overwritten = new Set<string>();
  // A pinned setting the caller already listed keeps its place and takes the pinned value.
  for (let slot = 0; slot < given; slot += 1) {
    const key = out[`GIT_CONFIG_KEY_${slot}`];
    if (key === undefined || !pinnedValue.has(key)) continue;
    out[`GIT_CONFIG_VALUE_${slot}`] = pinnedValue.get(key);
    overwritten.add(key);
  }
  // The others follow the caller's own.
  let next = given;
  for (const [key, value] of PINNED) {
    if (overwritten.has(key)) continue;
    out[`GIT_CONFIG_KEY_${next}`] = key;
    out[`GIT_CONFIG_VALUE_${next}`] = value;
    next += 1;
  }
  if (next !== given) out.GIT_CONFIG_COUNT = String(next);
  return out;
}

export function createGitProcessEnv(options: {
  readonly spawnerEnv?: NodeJS.ProcessEnv | undefined;
  readonly optionsEnv?: NodeJS.ProcessEnv | undefined;
  readonly command?: string | undefined;
}): NodeJS.ProcessEnv {
  // Later wins: the machine's, the spawner's, the fixed three, then the caller's own.
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...options.spawnerEnv,
    LC_ALL: "en_US.UTF-8",
    LANG: "en_US.UTF-8",
    GIT_PAGER: "cat",
    ...options.optionsEnv,
  };
  // The command is named for the process's watchers; a name left from an earlier command never stays.
  if (options.command === undefined) delete env.VSCODE_GIT_COMMAND;
  else env.VSCODE_GIT_COMMAND = options.command;
  return pin(env);
}
