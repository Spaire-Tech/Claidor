import assert from "node:assert/strict";
import { mkdtemp, mkdir, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function load() {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "caisra-user-data-rename-"));
  const output = path.join(temporary, "bootstrap.mjs");
  await build({ entryPoints: [path.join(repoRoot, "source/electron-main/startup/desktop-user-data-bootstrap.ts")], outfile: output, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent" });
  return { module: await import(`${pathToFileURL(output).href}?${Date.now()}`), dispose: () => rm(temporary, { recursive: true, force: true }) };
}

test("the first launch as Simeon copies the Grok Bot user-data folder once, caches left behind", async () => {
  const { module, dispose } = await load();
  const home = await mkdtemp(path.join(os.tmpdir(), "caisra-appdata-"));
  try {
    const from = path.join(home, "Grok Bot"), to = path.join(home, "Simeon");
    await mkdir(path.join(from, "sand-client-persistence"), { recursive: true });
    await mkdir(path.join(from, "Cache"), { recursive: true });
    await writeFile(path.join(from, "secrets.json"), "{}");
    await writeFile(path.join(from, "sand-client-persistence", "state.json"), "1");
    await writeFile(path.join(from, "Cache", "big"), "x");
    // Chromium's single-instance lock, as the running app leaves it: three
    // symlinks naming its process and socket. Copied, they would point the
    // new app at the old app's process.
    await symlink("host.local-4242", path.join(from, "SingletonLock"));
    await symlink("/tmp/somewhere/SingletonSocket", path.join(from, "SingletonSocket"));
    await symlink("16324943520279540406", path.join(from, "SingletonCookie"));
    const first = module.migrateUserDataFromPreviousName({ userDataDir: to });
    assert.equal(first.outcome, "copied");
    assert.deepEqual((await readdir(to)).sort(), ["sand-client-persistence", "secrets.json"]);
    assert.deepEqual([...module.USER_DATA_SINGLETON_ENTRIES].sort(), ["SingletonCookie", "SingletonLock", "SingletonSocket"]);
    assert.equal(await readFile(path.join(to, "sand-client-persistence", "state.json"), "utf8"), "1");
    assert.ok((await readdir(from)).includes("secrets.json"), "the other app's folder is left as it was");
    assert.equal(module.migrateUserDataFromPreviousName({ userDataDir: to }).outcome, "already-there");
    assert.equal(module.migrateUserDataFromPreviousName({ userDataDir: path.join(home, "Other") }).outcome, "copied");
    assert.equal(module.migrateUserDataFromPreviousName({ userDataDir: path.join(home, "Grok Bot") }).outcome, "same-folder");
    await rm(from, { recursive: true, force: true });
    assert.equal(module.migrateUserDataFromPreviousName({ userDataDir: path.join(home, "Fresh") }).outcome, "nothing-to-copy");
    const failed = module.migrateUserDataFromPreviousName({ userDataDir: path.join(home, "X"), exists: (p) => p.endsWith("Grok Bot"), copy: () => { throw new Error("disk full"); } });
    assert.equal(failed.outcome, "failed");
    assert.equal(failed.error, "disk full");
  } finally {
    await rm(home, { recursive: true, force: true });
    await dispose();
  }
});

test("every packaged build names the app after the display name, so Electron's menu, About and data folder follow", async () => {
  const build = await readFile(path.join(repoRoot, "scripts/lib/build-asar.mjs"), "utf8");
  assert.match(build, /stagedPackage\.productName = reconstructedName;/);
  const config = await readFile(path.join(repoRoot, "scripts/lib/config.mjs"), "utf8");
  assert.match(config, /\|\| "Simeon";/);
  assert.match(config, /"Simeon\.app"/);
  const bootstrap = await readFile(path.join(repoRoot, "source/electron-main/startup/desktop-user-data-bootstrap.ts"), "utf8");
  assert.match(bootstrap, /migrateUserDataFromPreviousName\(\{ userDataDir: options\.app\.getPath\("userData"\) \}\)/);
});
