import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadName() {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "caisra-account-name-"));
  const output = path.join(temporary, "account-display-name.mjs");
  await build({
    entryPoints: [path.join(repoRoot, "source/electron-main/account/account-display-name.ts")],
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
  const loaded = await loadName();
  try {
    const calls = [];
    const unimplemented = Object.assign(new Error("[unimplemented]"), { code: 12 });
    await loaded.module.persistAccountDisplayName("Bass Fall", async () => {
      calls.push("remote");
      throw unimplemented;
    }, loaded.dataDir);
    assert.deepEqual(calls, ["remote"]);
    assert.equal((await readFile(path.join(loaded.dataDir, "account-display-name"), "utf8")).trim(), "Bass Fall");
    assert.equal(loaded.module.readLocalAccountDisplayName(loaded.dataDir), "Bass Fall");
  } finally {
    await loaded.dispose();
  }
});

test("a real profile-name failure still throws after the local write", async () => {
  const loaded = await loadName();
  try {
    await assert.rejects(
      () => loaded.module.persistAccountDisplayName("Bass", async () => { throw new Error("dashboard unavailable"); }, loaded.dataDir),
      /dashboard unavailable/,
    );
    assert.equal(loaded.module.readLocalAccountDisplayName(loaded.dataDir), "Bass");
  } finally {
    await loaded.dispose();
  }
});
