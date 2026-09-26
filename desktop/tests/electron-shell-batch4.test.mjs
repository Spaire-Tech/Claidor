/**
 * The Electron shell, batch 4 cluster 4 (25 September 2026; ledger F-217,
 * F-223, F-228, F-230).
 *
 * Offline: a packaged Simeon that finds Grok Bot's `~/.cursor/sand` beside
 * an absent `~/.caisra` leaves it alone and takes `~/.caisra` (until today
 * it renamed Grok Bot's root into its own and could retire Grok Bot's idle
 * local-exec daemon); the existing-root resolver never answers
 * `~/.cursor/sand`; the main window is reloaded when its renderer dies;
 * the move-to-Applications dialog no longer promises updates; and the
 * packager writes the microphone usage description.
 */
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadMigration() {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "simeon-data-root-"));
  const outfile = path.join(temporary, "migration.mjs");
  await build({ entryPoints: [path.join(repoRoot, "source/electron-main/startup/startup-data-root-migration.ts")], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent" });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, temporary, dispose: () => rm(temporary, { recursive: true, force: true }) };
}

test("a packaged Simeon leaves Grok Bot's ~/.cursor/sand alone and takes ~/.caisra", async () => {
  const loaded = await loadMigration();
  try {
    const home = path.join(loaded.temporary, "home");
    const grokBotRoot = path.join(home, ".cursor", "sand");
    await mkdir(grokBotRoot, { recursive: true });
    // A real Grok Bot's idle local-exec daemon, the case that used to be "migrated".
    await writeFile(path.join(grokBotRoot, loaded.module.LOCAL_EXEC_DAEMON_DISCOVERY_FILENAME), JSON.stringify({ pid: 4242, startedAt: 1, inflightCount: 0 }));
    await writeFile(path.join(grokBotRoot, "agents.json"), "{}");
    const settlement = loaded.module.settleStartupDataRoot({
      isPackaged: true, isLabBuild: false, hasDataRootOverride: false, hasIsolatedUserData: false, homeDir: home,
      isProcessAlive: () => true, isSandHostProcess: () => false,
      rename: () => { throw new Error("rename must not be attempted"); },
    });
    assert.equal(settlement.route, "canonical");
    assert.equal(settlement.reason, "canonical-fresh");
    assert.equal(settlement.root, path.join(home, ".caisra"));
    assert.ok(existsSync(grokBotRoot), "Grok Bot's root is still there");
    assert.ok(existsSync(path.join(grokBotRoot, "agents.json")));
    assert.equal(existsSync(path.join(home, ".caisra", loaded.module.DATA_ROOT_MARKER_FILENAME)), true);
    // Never idle-legacy-writer, so the startup move check never retires that daemon.
    assert.notEqual(settlement.reason, "idle-legacy-writer");
    // The existing-root resolver answers ~/.caisra even when only ~/.cursor/sand exists.
    const other = path.join(loaded.temporary, "home2");
    await mkdir(path.join(other, ".cursor", "sand"), { recursive: true });
    assert.equal(loaded.module.resolveExistingSandProductionRootDir(other), path.join(other, ".caisra"));
  } finally {
    await loaded.dispose();
  }
});

test("the main window reloads when its renderer dies, the move dialog promises nothing, the packager writes the mic key", async () => {
  const main = await readFile(path.join(repoRoot, "source/electron-main/main.ts"), "utf8");
  assert.match(main, /export const RENDERER_RELOAD_REASONS: ReadonlySet<string> = new Set\(\["crashed", "oom", "abnormal-exit", "launch-failed", "integrity-failure"\]\);/);
  assert.match(main, /deps\.app\.on\("render-process-gone", \(_event, contents, details\) => \{\n\s*const window = mainWindow;\n\s*if \(window == null \|\| window\.webContents !== contents \|\| contents\.isDestroyed\(\)\) return;\n\s*if \(!RENDERER_RELOAD_REASONS\.has\(details\.reason\) \|\| rendererReloads >= MAX_RENDERER_RELOADS\) return;\n\s*rendererReloads \+= 1;\n\s*contents\.reload\(\);/);
  const move = await readFile(path.join(repoRoot, "source/electron-main/startup/startup-move-check.ts"), "utf8");
  assert.equal(move.includes("cannot install updates"), false);
  assert.match(move, /detail: "Simeon runs from the Applications folder\. It will reopen after moving\."/);
  const packager = await readFile(path.join(repoRoot, "scripts/package-macos.mjs"), "utf8");
  assert.match(packager, /\["-replace", "NSMicrophoneUsageDescription", "-string", "Simeon uses the microphone to take your dictation\.", infoPlist\]/);
});
