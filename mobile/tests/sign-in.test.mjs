/**
 * The phone signs in exactly as the Mac does (`mobile/src/core/sign-in.ts`):
 * the same verifier, the same challenge, the same link, the same poll. The
 * Mac's own code is bundled here and compared byte for byte, and so is the
 * server's derivation, through a known vector (RFC 7636's, which
 * `challenge_for` in `server/simeon/desktop/service.py` reproduces).
 */
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import test from "node:test";

import { loadModule } from "./lib/bundle.mjs";

/** expo-crypto's surface, from Node's: random bytes, SHA-256 as standard base64, a v4 uuid. */
const nodeCrypto = {
  randomBytes: (count) => new Uint8Array(randomBytes(count)),
  sha256Base64: async (text) => createHash("sha256").update(text).digest("base64"),
  randomUUID: () => randomUUID(),
};

/** The Mac's login module, with its one network dependency stood in for. */
const stubUndici = { name: "stub-undici", setup(build) {
  build.onResolve({ filter: /^undici$/ }, () => ({ path: "undici", namespace: "stub" }));
  build.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "export class ProxyAgent {}; export const fetch = (...a) => globalThis.fetch(...a);", loader: "js" }));
} };

test("base64url is Node's, padding and all left off", async (t) => {
  const { module, dispose } = await loadModule("mobile/src/core/sign-in.ts", "sign-in-b64");
  t.after(dispose);
  for (let length = 0; length < 70; length += 1) {
    const bytes = randomBytes(length);
    assert.equal(module.base64UrlFromBytes(new Uint8Array(bytes)), bytes.toString("base64url"), `${length} bytes`);
  }
  assert.equal(module.base64UrlFromBase64("ab+/cd=="), "ab-_cd");
});

test("the challenge is the server's: RFC 7636's vector, as `challenge_for` computes it", async (t) => {
  const { module, dispose } = await loadModule("mobile/src/core/sign-in.ts", "sign-in-vector");
  t.after(dispose);
  assert.equal(await module.challengeFor("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk", nodeCrypto), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
});

test("the verifier, the challenge and the link are the Mac's, byte for byte", async (t) => {
  const phone = await loadModule("mobile/src/core/sign-in.ts", "sign-in-phone");
  const mac = await loadModule("desktop/source/packages/simeon-config/auth/login.ts", "sign-in-mac", { plugins: [stubUndici] });
  t.after(phone.dispose);
  t.after(mac.dispose);
  for (let round = 0; round < 20; round += 1) {
    const ours = await phone.module.createLoginMetadata(nodeCrypto);
    assert.match(ours.verifier, /^[A-Za-z0-9_-]{43}$/, "32 bytes, base64url, unpadded");
    assert.match(ours.challenge, /^[A-Za-z0-9_-]{43}$/);
    assert.match(ours.uuid, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    // The Mac's own generator: its verifier through the phone's derivation gives the Mac's challenge.
    const theirs = mac.module.generateAuthParams("simeon-ios", "https://api.simeonlabs.com");
    assert.equal(await phone.module.challengeFor(theirs.verifier, nodeCrypto), theirs.challenge);
    assert.equal(phone.module.loginUrl("https://api.simeonlabs.com", theirs), theirs.loginUrl, "the same link, parameter for parameter");
  }
  const link = new URL(phone.module.loginUrl("https://api.simeonlabs.com", { challenge: "c", uuid: "u" }));
  assert.equal(link.pathname, "/loginDeepControl");
  assert.equal(link.searchParams.get("mode"), "login");
  assert.equal(link.searchParams.get("redirectTarget"), "simeon-ios", "the phone's scheme, never the Mac's `simeon`");
});

function answers(sequence) {
  const calls = [];
  return {
    calls,
    fetch: async (url, init) => {
      calls.push({ url, init });
      const next = sequence.shift() ?? { status: 404 };
      if (next.throws) throw new Error("offline");
      return { status: next.status, ok: next.status >= 200 && next.status < 300, json: async () => next.body ?? {} };
    },
  };
}

test("the poll: POSTs the verifier in the body, waits on 404 with the Mac's backoff, stops at the pair", async (t) => {
  const { module, dispose } = await loadModule("mobile/src/core/sign-in.ts", "sign-in-poll");
  t.after(dispose);
  const waits = [];
  const server = answers([{ status: 404 }, { status: 404 }, { throws: true }, { status: 404 }, { status: 200, body: { accessToken: "simeon_da_x", refreshToken: "simeon_dr_y" } }]);
  const outcome = await module.pollForTokens({ api: "https://api.test", uuid: "u-1", verifier: "v-1", clientVersion: "ios-0.1.0", fetch: server.fetch, wait: async (ms) => { waits.push(ms); } });
  assert.deepEqual(outcome, { kind: "tokens", tokens: { accessToken: "simeon_da_x", refreshToken: "simeon_dr_y" } });
  assert.equal(server.calls.length, 5);
  for (const call of server.calls) {
    assert.equal(call.url, "https://api.test/auth/poll", "nothing in the query string: the verifier stays out of access logs");
    assert.equal(call.init.method, "POST");
    assert.deepEqual(JSON.parse(call.init.body), { uuid: "u-1", verifier: "v-1" });
    assert.equal(call.init.headers["content-type"], "application/json");
    assert.equal(call.init.headers["x-simeon-client-version"], "ios-0.1.0");
  }
  assert.deepEqual(waits.map(Math.round), [1000, 1200, 1440, 1728], "1 s, growing by 1.2 (`pollAuthenticationStatus`)");
  assert.equal(module.pollDelayMs(40), 10_000, "never more than 10 s");
});

test("the poll gives up as the Mac does, and stops when told", async (t) => {
  const { module, dispose } = await loadModule("mobile/src/core/sign-in.ts", "sign-in-poll-end");
  t.after(dispose);
  const base = { api: "https://api.test", uuid: "u", verifier: "v", clientVersion: "ios-0.1.0", wait: async () => {} };
  assert.deepEqual(await module.pollForTokens({ ...base, fetch: answers([{ status: 500 }, { status: 404 }, { status: 502 }, { status: 503 }, { status: 500 }]).fetch }), { kind: "gave-up" }, "three errors in a row; a 404 between resets the count");
  assert.deepEqual(await module.pollForTokens({ ...base, fetch: answers([{ status: 403, body: { error: "sign_in_policy_violation" } }]).fetch }), { kind: "refused" });
  assert.deepEqual(await module.pollForTokens({ ...base, fetch: answers([{ status: 200, body: { accessToken: "a" } }]).fetch }), { kind: "gave-up" }, "a 200 without a pair is not a sign-in");
  assert.deepEqual(await module.pollForTokens({ ...base, fetch: answers([]).fetch, maxAttempts: 3 }), { kind: "gave-up" });
  let left = 2;
  const server = answers([]);
  assert.deepEqual(await module.pollForTokens({ ...base, fetch: server.fetch, keepGoing: () => left-- > 0 }), { kind: "stopped" });
  assert.equal(server.calls.length, 2);
});
