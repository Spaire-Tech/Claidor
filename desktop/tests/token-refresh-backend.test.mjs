/**
 * A token refresh goes to the configured backend (Claidor), never to Cursor's
 * default host. Found in the 24 September audit: `getValidAccessToken()` with
 * no backend named (dictation, avatar generation) defaulted to
 * `https://api2.cursor.sh`, so when the access token was within five minutes
 * of expiry the refresh went there, got a non-2xx, and the service revoked
 * the credentials: the person was signed out by pressing the mic or
 * "Generate".
 */
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function load(entry, name) {
  const dir = await mkdtemp(path.join(os.tmpdir(), `caisra-${name}-`));
  const outfile = path.join(dir, `${name}.mjs`);
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron"], banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

function jwt(payload) {
  const enc = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${enc({ alg: "HS256", typ: "JWT" })}.${enc(payload)}.sig`;
}

test("a refresh with no backend named goes to SAND_BACKEND_URL, not api2.cursor.sh", async () => {
  const previous = process.env.SAND_BACKEND_URL;
  process.env.SAND_BACKEND_URL = "https://api.simeonlabs.com";
  const { module, dispose } = await load("source/electron-main/account/cursor-auth.ts", "cursor-auth");
  try {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const expiring = jwt({ sub: "user|1", exp: nowSeconds + 60 });
    const fresh = jwt({ sub: "user|1", exp: nowSeconds + 3600 });
    const store = new Map([["cursor-access-token", expiring], ["cursor-refresh-token", "claidor_da_refresh"]]);
    const requests = [];
    const service = new module.SandCursorAuthService({
      openExternal: () => {},
      secrets: {
        readSecret: async (key) => store.get(key) ?? null,
        writeSecret: async (key, value) => { store.set(key, value); },
        deleteSecret: async (key) => { store.delete(key); },
        isEncryptedStorageAvailable: () => true,
      },
      fetchOAuthToken: async (url) => {
        requests.push(String(url));
        return new Response(JSON.stringify({ access_token: fresh, refresh_token: "claidor_da_refresh" }), { status: 200, headers: { "content-type": "application/json" } });
      },
    });
    const token = await service.getValidAccessToken();
    assert.equal(token, fresh);
    assert.equal(requests.length, 1);
    assert.equal(new URL(requests[0]).origin, "https://api.simeonlabs.com");
    assert.equal(new URL(requests[0]).pathname, "/oauth/token");
    assert.equal(store.get("cursor-access-token"), fresh, "the fresh token is stored");
  } finally {
    if (previous === undefined) delete process.env.SAND_BACKEND_URL; else process.env.SAND_BACKEND_URL = previous;
    await dispose();
  }
});
