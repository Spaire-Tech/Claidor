import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Where the Claude Code command lives on this computer, and which models
 * it is asked for.
 *
 * The engine can run a turn through the installed Claude Code app
 * instead of calling a model API itself (`agents.defaults.model.primary
 * = "claude-cli/<model>"`; the engine's own planner does exactly this).
 * It defaults the command to `claude`, which is fine from a terminal and
 * wrong from a macOS app: a GUI process starts with a bare PATH and
 * never sees Homebrew or the user's npm prefix. So the app finds the
 * binary itself and hands the engine the absolute path.
 *
 * The order: an override (`CAISRA_CLAUDE_CLI`), then `which`, then the
 * places Claude Code's own installers put it. Pure list, injectable
 * existence check, so it is tested without a filesystem.
 *
 * Whether the mechanic is on at all is `claudeCodeMode.ts`.
 */

export const CLAUDE_CLI_ENV = 'CAISRA_CLAUDE_CLI';

/** The engine's provider id for "run this through the Claude Code CLI". */
export const CLAUDE_CLI_PROVIDER = 'claude-cli';

/**
 * The model a job runs on. Opus: Caisra is an agent holding a strict
 * contract, and the founder wants the product judged on the model that
 * holds it.
 */
export const CLAUDE_CODE_STRONG_MODEL = 'claude-opus-5';

/** The model a plain question runs on; see `turnRouting.ts`. */
export const CLAUDE_CODE_FAST_MODEL = 'claude-sonnet-5';

/** Every model a turn may be routed to; the engine is told to allow each. */
export const CLAUDE_CODE_MODELS: readonly string[] = [CLAUDE_CODE_STRONG_MODEL, CLAUDE_CODE_FAST_MODEL];

export const claudeCliModelRef = (model: string): string => `${CLAUDE_CLI_PROVIDER}/${model}`;

export function claudeCliCandidates(options: {
  home: string;
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
  /** What `which claude` (or `where`) answered, already split into lines. */
  lookup?: readonly string[];
}): string[] {
  const exe = options.platform === 'win32' ? 'claude.exe' : 'claude';
  const home = options.home;
  const override = options.env[CLAUDE_CLI_ENV]?.trim();
  const fromLookup = (options.lookup ?? []).map(one => one.trim()).filter(Boolean);
  const usual = options.platform === 'win32'
    ? [
      path.join(home, '.claude', 'local', exe),
      path.join(home, 'AppData', 'Roaming', 'npm', 'claude.cmd'),
      path.join(home, 'AppData', 'Roaming', 'npm', exe),
    ]
    : [
      path.join(home, '.claude', 'local', 'claude'),
      '/opt/homebrew/bin/claude',
      '/usr/local/bin/claude',
      path.join(home, '.npm-global', 'bin', 'claude'),
      path.join(home, '.local', 'bin', 'claude'),
      path.join(home, '.volta', 'bin', 'claude'),
      path.join(home, '.bun', 'bin', 'claude'),
    ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const candidate of [...(override ? [override] : []), ...fromLookup, ...usual]) {
    if (!seen.has(candidate)) { seen.add(candidate); out.push(candidate); }
  }
  return out;
}

/** The first candidate that exists, or null. */
export function findClaudeCli(
  candidates: readonly string[],
  exists: (file: string) => boolean = file => {
    try { return fs.statSync(file).isFile(); } catch { return false; }
  },
): string | null {
  return candidates.find(exists) ?? null;
}

/** `which claude`, from this process's PATH plus the usual macOS additions. */
export function lookupClaudeOnPath(env: NodeJS.ProcessEnv = process.env): string[] {
  const checker = process.platform === 'win32' ? 'where' : 'which';
  const extra = process.platform === 'win32' ? [] : ['/opt/homebrew/bin', '/usr/local/bin', path.join(os.homedir(), '.local', 'bin')];
  const PATH = [env.PATH ?? '', ...extra].filter(Boolean).join(path.delimiter);
  try {
    const result = spawnSync(checker, ['claude'], { encoding: 'utf8', env: { ...env, PATH }, timeout: 5_000, windowsHide: true });
    if (result.status !== 0 || !result.stdout) return [];
    return result.stdout.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

/** Everything above in one call. */
export function resolveClaudeCli(env: NodeJS.ProcessEnv = process.env): string | null {
  return findClaudeCli(claudeCliCandidates({
    home: os.homedir(), platform: process.platform, env, lookup: lookupClaudeOnPath(env),
  }));
}
