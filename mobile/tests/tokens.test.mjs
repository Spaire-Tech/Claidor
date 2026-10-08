/**
 * The pair on the phone (`mobile/src/core/tokens.ts`) and the page's half
 * of it (`desktop/web/api.ts`) must agree: the same expiry read off the
 * same envelope, the same global, the same refresh answers.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { loadModule, runInPage } from "./lib/bundle.mjs";

function envelope(claims) {
  return `simeon_da_h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.s`;
}

test("the expiry off the envelope is the page's, and an hour when there is none", async (t) => {
  const phone = await loadModule("mobile/src/core/tokens.ts", "tokens-phone");
  const page = await loadModule("desktop/web/api.ts", "tokens-page");
  t.after(phone.dispose);
  t.after(page.dispose);
  const now = 1_759_900_000_000;
  for (const token of [envelope({ exp: 1_759_903_600, sub: "u", email: "bass@simeonlabs.com" }), envelope({ exp: 1_759_903_600, email: "zoë@example.com" }), envelope({ sub: "no-exp" }), "simeon_da_opaque", "earlier_da_h.e30.s", "garbage"]) {
    assert.equal(phone.module.expiryOfAccessToken(token, now), page.module.expiryOfAccessToken(token, now), token);
  }
  assert.equal(phone.module.expiryOfAccessToken("simeon_da_opaque", now), now + 3_600_000);
  assert.equal(phone.module.NATIVE_TOKENS_GLOBAL, page.module.NATIVE_TOKENS_GLOBAL, "where the app injects is where the page reads");
  assert.equal(phone.module.REFRESH_AHEAD_MS, page.module.REFRESH_AHEAD_MS);
});

test("a stored pair: parsed whole or not at all, refreshed with five minutes left", async (t) => {
  const { module, dispose } = await loadModule("mobile/src/core/tokens.ts", "tokens-store");
  t.after(dispose);
  const now = 1_000_000;
  const access = envelope({ exp: 4_600 });
  assert.deepEqual(module.parseSession(JSON.stringify({ accessToken: access, refreshToken: "r" }), now), { accessToken: access, refreshToken: "r", expiresAtMs: 4_600_000 });
  assert.equal(module.parseSession("{", now), null);
  assert.equal(module.parseSession(JSON.stringify({ accessToken: access }), now), null);
  assert.equal(module.parseSession(null, now), null);
  const session = module.sessionFromPair({ accessToken: access, refreshToken: "r" }, now);
  assert.equal(module.needsRefresh(session, 4_600_000 - 5 * 60_000 - 1), false);
  assert.equal(module.needsRefresh(session, 4_600_000 - 5 * 60_000), true);
  const request = module.refreshRequest("https://api.test", session);
  assert.equal(request.url, "https://api.test/oauth/token");
  assert.deepEqual(JSON.parse(request.init.body), { grant_type: "refresh_token", refresh_token: "r" }, "the page's own refresh body");
});

test("the refresh answer, read as the page reads it", async (t) => {
  const { module, dispose } = await loadModule("mobile/src/core/tokens.ts", "tokens-refresh");
  t.after(dispose);
  const next = envelope({ exp: 9_000 });
  assert.deepEqual(module.readRefreshAnswer(200, { access_token: next, refresh_token: "r2" }, 0), { kind: "refreshed", session: { accessToken: next, refreshToken: "r2", expiresAtMs: 9_000_000 } });
  assert.deepEqual(module.readRefreshAnswer(200, { shouldLogout: true, error: "invalid_grant" }, 0), { kind: "ended" }, "a spent token: sign in again");
  assert.deepEqual(module.readRefreshAnswer(400, { error: "invalid_request" }, 0), { kind: "ended" });
  assert.deepEqual(module.readRefreshAnswer(503, null, 0), { kind: "kept" }, "a deploy is not a sign-out");
  assert.deepEqual(module.readRefreshAnswer(429, null, 0), { kind: "kept" });
  assert.deepEqual(module.readRefreshAnswer(null, null, 0), { kind: "kept" }, "offline");
});

test("the injected pair reaches the window's own origin and no other", async (t) => {
  const { module, dispose } = await loadModule("mobile/src/core/tokens.ts", "tokens-inject");
  t.after(dispose);
  const session = { accessToken: "simeon_da_a.b.c", refreshToken: "simeon_dr_d", expiresAtMs: 123 };
  const script = module.tokensInjection(session, "https://app.simeonlabs.com");
  const ours = { location: { origin: "https://app.simeonlabs.com" } };
  assert.equal(runInPage(script, ours), undefined);
  assert.deepEqual(ours.__simeonNativeTokens, session);
  const elsewhere = { location: { origin: "https://evil.example" } };
  runInPage(script, elsewhere);
  assert.equal(elsewhere.__simeonNativeTokens, undefined, "a page from elsewhere gets nothing");
  const signedOut = { location: { origin: "https://app.simeonlabs.com" } };
  runInPage(module.tokensInjection(null, "https://app.simeonlabs.com"), signedOut);
  assert.equal(signedOut.__simeonNativeTokens, null);
});

test("what the app injects, the page's own store reads", async (t) => {
  const phone = await loadModule("mobile/src/core/tokens.ts", "tokens-roundtrip-phone");
  const page = await loadModule("desktop/web/api.ts", "tokens-roundtrip-page");
  t.after(phone.dispose);
  t.after(page.dispose);
  const session = phone.module.sessionFromPair({ accessToken: envelope({ exp: 4_600 }), refreshToken: "simeon_dr_x" }, 0);
  const posted = [];
  const window = { location: { origin: "https://app.simeonlabs.com" }, ReactNativeWebView: { postMessage: (data) => posted.push(JSON.parse(data)) } };
  runInPage(phone.module.tokensInjection(session, "https://app.simeonlabs.com"), window);
  const store = page.module.nativeTokenStore(page.module.nativeShellOf(window), window, () => 0);
  assert.deepEqual(store.read(), session);
});
