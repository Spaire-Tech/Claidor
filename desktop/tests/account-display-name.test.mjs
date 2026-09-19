import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadProfile() {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "caisra-account-name-"));
  const output = path.join(temporary, "cursor-profile.mjs");
  await build({
    entryPoints: [path.join(repoRoot, "source/electron-main/account/cursor-profile.ts")],
    outfile: output,
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node22",
  });
  const module = await import(`${pathToFileURL(output).href}?${Date.now()}`);
  return { module, dataDir: temporary, dispose: () => rm(temporary, { recursive: true, force: true }) };
}

test("saving a name keeps it locally when the profile RPC is unimplemented", async () => {
  const loaded = await loadProfile();
  const previousRoot = process.env.SAND_DATA_ROOT;
  try {
    process.env.SAND_DATA_ROOT = loaded.dataDir;
    const calls = [];
    const deps = {
      createClient: () => ({
        updateUserName: async (request) => {
          calls.push(request);
          const error = new Error("[unimplemented]");
          error.code = 12;
          throw error;
        },
        getMe: async () => { throw new Error("[unimplemented]"); },
        getTeams: async () => ({ teams: [] }),
      }),
    };

    await loaded.module.updateCursorProfileName(async () => "token", "Bass Fall", deps);
    assert.deepEqual(calls, [{ firstName: "Bass", lastName: "Fall" }]);
    assert.equal((await readFile(path.join(loaded.dataDir, "account-display-name"), "utf8")).trim(), "Bass Fall");

    const profile = await loaded.module.fetchCursorProfile(async () => "token", deps);
    assert.equal(profile.displayName, "Bass Fall");
  } finally {
    if (previousRoot === undefined) delete process.env.SAND_DATA_ROOT;
    else process.env.SAND_DATA_ROOT = previousRoot;
    await loaded.dispose();
  }
});

test("a real profile-name failure still throws after the local write", async () => {
  const loaded = await loadProfile();
  const previousRoot = process.env.SAND_DATA_ROOT;
  try {
    process.env.SAND_DATA_ROOT = loaded.dataDir;
    await assert.rejects(
      () => loaded.module.updateCursorProfileName(async () => "token", "Bass", {
        createClient: () => ({
          updateUserName: async () => { throw new Error("dashboard unavailable"); },
        }),
      }),
      /dashboard unavailable/,
    );
    assert.equal(loaded.module.readLocalAccountDisplayName(loaded.dataDir), "Bass");
  } finally {
    if (previousRoot === undefined) delete process.env.SAND_DATA_ROOT;
    else process.env.SAND_DATA_ROOT = previousRoot;
    await loaded.dispose();
  }
});
