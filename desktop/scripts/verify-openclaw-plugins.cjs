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
 * It runs the runtime's own CLI through `openclaw.mjs`, the same entry
 * file the app forks as its gateway, rather than reimplementing plugin
 * discovery. Reimplementing it would be a second thing that can disagree
 * with the engine, and the whole failure being guarded against was two
 * things quietly disagreeing.
 *
 * **Why `doctor --lint` and not `plugins list --json`.** The obvious
 * command is the wrong one, and this was found by trying it: `plugins
 * list` reads manifests and reports `status: enabled ? "loaded" :
 * "disabled"` — it never imports a plugin, so it can never say « error ».
 * Pointed at a runtime with a deliberately broken extension it reported
 * 24 plugins, none in error. `doctor` performs a real load; the same
 * broken extension produced « [plugins] zz-broken-test failed to load …
 * Cannot find module ». So the load is real and the message is the
 * engine's own.
 *
 * Doctor prints that line and leaves the failure out of its JSON
 * findings — the engine, too, notices and does not say. Reading its
 * output is therefore the check, and this file is where that quiet is
 * turned into a red build.
 *
 * **Doctor's own exit code is not a health signal, and must not be read
 * as one.** It is `exitCodeFromFindings`: 1 when any finding meets the
 * severity floor, and the floor defaults to `info`. A healthy runtime
 * exits 1 — ours does, over unavailable optional skills and a missing
 * command owner. An earlier draft of this file failed the build on a
 * non-zero exit and would have been red on every green runtime. Proof
 * the engine really ran is `checksRun` in its JSON, below, not `$?`.
 *
 * Usage:
 *   node scripts/verify-openclaw-plugins.cjs [runtimeRoot]
 *
 * Exit codes: 0 every plugin loaded; 1 a plugin is in error, or the
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
    [entry, 'doctor', '--lint', '--json'],
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

  // A signal means we killed it, which for spawnSync means the timeout
  // above elapsed. Say so, rather than reporting whatever partial output
  // it managed to print.
  if (result.signal) {
    fail(
      `the engine was killed with ${result.signal} after ${TIMEOUT_MS / 1000}s`,
      `--- stdout ---\n${(result.stdout || '').slice(-2000)}\n--- stderr ---\n${(result.stderr || '').slice(-2000)}`,
    );
  }

  const output = `${result.stdout || ''}\n${result.stderr || ''}`;

  // The engine's own words when a plugin will not import. Matched on the
  // subsystem tag as well as the phrase so an ordinary sentence containing
  // « failed to load » — a skill, a model, a channel — is not mistaken for
  // this.
  // Keyed by plugin id, because the engine reports the same failure more
  // than once per run — the registry is loaded by several of doctor's
  // checks — and « 2 plugins could not load » for one broken plugin would
  // send whoever reads this looking for a second one.
  const failures = new Map();
  for (const match of output.matchAll(/\[plugins\][^\n]*?(\S+) failed to load[^\n]*/g)) {
    if (!failures.has(match[1])) failures.set(match[1], match[0].trim());
  }

  if (failures.size > 0) {
    const lines = [...failures.values()].map((line) => `  - ${line}`).join('\n');
    fail(
      `${failures.size} plugin(s) could not load`,
      `${lines}\n\nPlugin loading is all-or-nothing: any one of these takes every\n`
      + 'other plugin down with it, and the app loses the browser and the\n'
      + 'internet. Either install what the plugin needs, or take it off the\n'
      + 'keep-list in scripts/prune-openclaw-runtime.cjs.',
    );
  }

  // Proof the load actually happened, rather than the command doing
  // nothing and printing nothing: doctor always reports how many checks it
  // ran. This is the only structural guard, because doctor's exit code
  // says nothing about health (see the header). It catches both an engine
  // that died before it could report, and an engine whose output shape
  // changed — in which case the plugin-failure message this file greps for
  // may never appear again, and silence here would mean « all clear ».
  if (!/"checksRun"\s*:\s*[1-9]/.test(output)) {
    fail(
      `the engine exited ${result.status} without reporting any checks`,
      'Either it died before doctor could run, or doctor\'s output has '
      + 'changed. This file greps that output for plugin load failures, so '
      + 'until it is re-read against the engine its silence proves nothing.\n'
      + `--- stdout ---\n${(result.stdout || '').slice(-2000)}\n`
      + `--- stderr ---\n${(result.stderr || '').slice(-2000)}`,
    );
  }

  // Channels are a separate subsystem and they fail soft: a channel whose
  // setup entry will not resolve is logged and skipped, and the other
  // channels carry on. So these are reported, not fatal — a gate that is
  // red on the state we inherited is a gate people learn to ignore. As of
  // 13 September the packaged runtime prints exactly one, telegram's setup
  // entry, which the unpruned source build does not. It is upstream's
  // packaging, not ours, and it is written down in
  // docs/maties/before-you-build.md.
  const channelFailures = new Set(
    [...output.matchAll(/\[channels\][^\n]*(?:failed to load|missing)[^\n]*/g)]
      .map((match) => match[0].trim()),
  );
  for (const line of channelFailures) {
    console.warn(`[verify-openclaw-plugins] channel warning: ${line}`);
  }

  console.log('[verify-openclaw-plugins] every plugin loaded');
}

main();
