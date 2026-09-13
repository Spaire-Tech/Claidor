'use strict';

/**
 * Start the engine and refuse the build if any plugin failed to load.
 *
 * Why this exists, in one paragraph. On 12 September the app lost the
 * internet — not the in-app browser panel, any browsing at all. The cause
 * was three extension names added to the keep-list in
 * `prune-openclaw-runtime.cjs`, one of which declares dependencies our
 * packaging never installs. Plugin loading in this engine is
 * all-or-nothing: `maybeThrowOnPluginLoadError` throws for the whole
 * registry the moment a single plugin is in an error state, so one
 * extension that cannot load takes `browser`, `memory-core` and every
 * other plugin with it. Every test passed. Every type checked. The lint
 * was clean. The founder found it by opening the app.
 *
 * So this asks the built runtime the one question none of those ask:
 * given the runtime we actually packaged, does the plugin registry load
 * without a single plugin in error?
 *
 * It runs the runtime's own CLI — `openclaw plugins list --json`, the same
 * entry file the app forks as its gateway — rather than reimplementing
 * discovery. Reimplementing it would be a second thing that can disagree
 * with the engine, and the whole failure being guarded against was two
 * things quietly disagreeing.
 *
 * Usage:
 *   node scripts/verify-openclaw-plugins.cjs [runtimeRoot]
 *
 * Exit codes: 0 every plugin loaded; 1 something is in error, or the
 * registry could not be read at all.
 */

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

/** How long the engine gets to enumerate its plugins before we give up. */
const TIMEOUT_MS = 180_000;
const MAX_OUTPUT_BYTES = 32 * 1024 * 1024;

function fail(message, detail) {
  console.error(`\n[verify-openclaw-plugins] FAILED: ${message}`);
  if (detail) console.error(detail);
  process.exit(1);
}

/**
 * The engine prints its JSON to stdout, but the runtime also logs to
 * stdout on the way up. Take the last balanced top-level object rather
 * than assuming the whole stream is JSON.
 */
function parseTrailingJson(text) {
  const start = text.indexOf('{');
  if (start === -1) return null;
  for (let from = start; from !== -1; from = text.indexOf('{', from + 1)) {
    try {
      return JSON.parse(text.slice(from));
    } catch {
      // Not the start of the payload; keep looking.
    }
  }
  return null;
}

function main() {
  const runtimeRoot = path.resolve(
    process.argv[2] || path.join(__dirname, '..', 'vendor', 'openclaw-runtime', 'current'),
  );
  const entry = path.join(runtimeRoot, 'openclaw.mjs');

  if (!fs.existsSync(entry)) {
    fail(
      `no engine at ${entry}`,
      'Build a runtime first, e.g. `npm run openclaw:runtime:host`.',
    );
  }

  console.log(`[verify-openclaw-plugins] asking the engine at ${runtimeRoot}`);

  const result = spawnSync(
    process.execPath,
    [entry, 'plugins', 'list', '--json'],
    {
      cwd: runtimeRoot,
      encoding: 'utf8',
      timeout: TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', NO_COLOR: '1' },
    },
  );

  if (result.error) {
    fail(`the engine could not be started: ${result.error.message}`, result.stderr);
  }

  const report = parseTrailingJson(result.stdout || '');
  if (!report || !Array.isArray(report.plugins)) {
    // A non-zero exit with no JSON is itself the answer: the registry did
    // not load. That is the exact shape of the bug this guards against,
    // so it must fail rather than be treated as « nothing to check ».
    fail(
      'the engine did not report a plugin registry',
      `exit=${result.status}\n--- stdout ---\n${(result.stdout || '').slice(-4000)}\n--- stderr ---\n${(result.stderr || '').slice(-4000)}`,
    );
  }

  const broken = report.plugins.filter((plugin) => plugin && plugin.status === 'error');
  const total = report.plugins.length;

  if (broken.length > 0) {
    const lines = broken
      .map((plugin) => `  - ${plugin.id ?? '(unnamed)'}: ${plugin.error ?? 'unknown load error'}`)
      .join('\n');
    fail(
      `${broken.length} of ${total} plugins could not load`,
      `${lines}\n\nPlugin loading is all-or-nothing: any one of these takes every\n`
      + 'other plugin down with it, and the app loses the browser and the\n'
      + 'internet. Either install what the plugin needs, or take it off the\n'
      + 'keep-list in scripts/prune-openclaw-runtime.cjs.',
    );
  }

  if (total === 0) {
    fail(
      'the engine reported no plugins at all',
      'An empty registry means discovery did not run. It is never the '
      + 'correct answer for this build, which keeps two dozen extensions.',
    );
  }

  console.log(`[verify-openclaw-plugins] ${total} plugins, none in error`);
}

main();
