/**
 * The brain (docs/agents-on-the-server/README.md, step 1a): an engine off
 * the computer reaches the computer's hands through one address,
 * SIMEON_HANDS_URL, with the headers in SIMEON_HANDS_HEADERS. Neither set,
 * the engine on the computer dials http://host:port as it always has.
 */
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function load() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "simeon-hands-route-"));
  const outfile = path.join(dir, "hands-route.mjs");
  await build({ entryPoints: [path.join(repoRoot, "source/host/box/box-remote-accessor.ts")], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent" });
  try {
    return await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

const module = await load();
const endpoint = { host: "127.0.0.1", port: 1339, authToken: "local", headers: { "x-sand-display": "2", "x-sand-window-owner": "owner" } };

async function headersSent(route) {
  let options;
  module.createBoxTransport(endpoint, (given) => { options = given; return {}; }, route);
  const set = [];
  const request = { header: { set: (name, value) => set.push([name.toLowerCase(), value]) } };
  await options.interceptors[0](async () => "sent")(request);
  return { options, headers: Object.fromEntries(set) };
}

test("neither set: the hands are dialled at host and port, as before", async () => {
  assert.equal(module.boxHandsRouteFromEnv({}), null);
  const { options, headers } = await headersSent(null);
  assert.equal(options.baseUrl, "http://127.0.0.1:1339");
  assert.deepEqual(headers, { authorization: "Bearer local", "x-sand-display": "2", "x-sand-window-owner": "owner" });
});

test("set: every call goes to the address, with the route's headers and the call's own", async () => {
  const route = module.boxHandsRouteFromEnv({
    SIMEON_HANDS_URL: "https://api.example.com/sand-box/brain/hands/",
    SIMEON_HANDS_HEADERS: JSON.stringify({ "x-simeon-brain-token": "brain-secret", "x-simeon-brain-user": "u1" }),
  });
  assert.deepEqual(route, { baseUrl: "https://api.example.com/sand-box/brain/hands", headers: { "x-simeon-brain-token": "brain-secret", "x-simeon-brain-user": "u1" } });
  const { options, headers } = await headersSent(route);
  assert.equal(options.baseUrl, "https://api.example.com/sand-box/brain/hands");
  assert.deepEqual(headers, {
    "x-simeon-brain-token": "brain-secret",
    "x-simeon-brain-user": "u1",
    authorization: "Bearer local",
    "x-sand-display": "2",
    "x-sand-window-owner": "owner",
  });
});

test("http only to this machine (the probe's stand-in)", () => {
  assert.equal(module.boxHandsRouteFromEnv({ SIMEON_HANDS_URL: "http://127.0.0.1:41500/hands" }).baseUrl, "http://127.0.0.1:41500/hands");
  assert.throws(() => module.boxHandsRouteFromEnv({ SIMEON_HANDS_URL: "http://api.example.com/hands" }), /must be https/);
});

test("a half-set or malformed route is refused, and the message never shows a value", () => {
  const secret = "do-not-print-me";
  const cases = [
    [{ SIMEON_HANDS_HEADERS: JSON.stringify({ "x-simeon-brain-token": secret }) }, /without SIMEON_HANDS_URL/],
    [{ SIMEON_HANDS_URL: "not a url" }, /not a URL/],
    [{ SIMEON_HANDS_URL: "https://api.example.com/hands?token=" + secret }, /no query/],
    [{ SIMEON_HANDS_URL: "https://api.example.com/hands", SIMEON_HANDS_HEADERS: secret }, /not JSON/],
    [{ SIMEON_HANDS_URL: "https://api.example.com/hands", SIMEON_HANDS_HEADERS: JSON.stringify([secret]) }, /JSON object/],
    [{ SIMEON_HANDS_URL: "https://api.example.com/hands", SIMEON_HANDS_HEADERS: JSON.stringify({ "x-simeon-brain-token": 7 }) }, /header names to strings/],
    [{ SIMEON_HANDS_URL: "https://api.example.com/hands", SIMEON_HANDS_HEADERS: JSON.stringify({ Authorization: secret }) }, /may not set authorization/],
    [{ SIMEON_HANDS_URL: "https://api.example.com/hands", SIMEON_HANDS_HEADERS: JSON.stringify({ "x-sand-display": "3" }) }, /may not set x-sand-display/],
  ];
  for (const [env, message] of cases) {
    assert.throws(() => module.boxHandsRouteFromEnv(env), (error) => error.name === "BoxHandsRouteError" && message.test(error.message) && !error.message.includes(secret));
  }
});
