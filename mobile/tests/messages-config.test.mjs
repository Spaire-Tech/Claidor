/**
 * The page's messages to the app and where the app finds Simeon
 * (`mobile/src/core/messages.ts`, `mobile/src/core/config.ts`), held to
 * the page's side of each (`desktop/web/api.ts`).
 */
import assert from "node:assert/strict";
import test from "node:test";

import { loadModule } from "./lib/bundle.mjs";

test("every message the page can send, the app reads; anything else it ignores", async (t) => {
  const phone = await loadModule("mobile/src/core/messages.ts", "messages-phone");
  const page = await loadModule("desktop/web/api.ts", "messages-page");
  t.after(phone.dispose);
  t.after(page.dispose);
  const read = (message) => phone.module.parsePageMessage(JSON.stringify(message), 0);
  const { NATIVE_MESSAGE } = page.module;
  const pair = { accessToken: "simeon_da_a", refreshToken: "simeon_dr_b", expiresAtMs: 5 };
  assert.deepEqual(read({ type: NATIVE_MESSAGE.tokens, tokens: pair }), { type: "simeon.tokens", tokens: pair });
  for (const reason of ["logout", "expired", "no-session"]) assert.deepEqual(read({ type: NATIVE_MESSAGE.signedOut, reason }), { type: "simeon.signed-out", reason });
  assert.deepEqual(read({ type: NATIVE_MESSAGE.signedOut, reason: "?" }), { type: "simeon.signed-out", reason: "no-session" });
  assert.deepEqual(read({ type: NATIVE_MESSAGE.open, url: "https://x.test", purpose: "sign-in" }), { type: "simeon.open", url: "https://x.test", purpose: "sign-in" });
  assert.deepEqual(read({ type: NATIVE_MESSAGE.open, url: "https://x.test" }), { type: "simeon.open", url: "https://x.test", purpose: "link" });
  assert.deepEqual(read({ type: NATIVE_MESSAGE.mcpAuth }), { type: "simeon.mcp-auth" });
  assert.deepEqual(read({ type: NATIVE_MESSAGE.theme, preference: "dark", resolved: "dark" }), { type: "simeon.theme", preference: "dark", resolved: "dark" });
  assert.deepEqual(read({ type: NATIVE_MESSAGE.ready }), { type: "simeon.ready" });
  for (const name of Object.values(NATIVE_MESSAGE)) assert.notEqual(read({ type: name, tokens: pair, reason: "logout", url: "https://x.test", resolved: "light" }), null, `${name} is read`);
  // Not ours, or not whole.
  assert.equal(read({ type: "simeon.tokens", tokens: { accessToken: "a" } }), null);
  assert.equal(read({ type: "simeon.open" }), null);
  assert.equal(read({ type: "simeon.theme", resolved: "sepia" }), null);
  assert.equal(read({ type: "something-else" }), null);
  assert.equal(phone.module.parsePageMessage("not json", 0), null);
  assert.equal(phone.module.parsePageMessage("navigationStateChange", 0), null);
});

test("where Simeon is: the defaults, the overrides, and `?api=` only when the page would guess wrong", async (t) => {
  const phone = await loadModule("mobile/src/core/config.ts", "config-phone");
  const page = await loadModule("desktop/web/api.ts", "config-page");
  t.after(phone.dispose);
  t.after(page.dispose);
  const { resolveShellConfig, apiThePageWouldUse } = phone.module;
  assert.deepEqual(resolveShellConfig({}), { api: "https://api.simeonlabs.com", app: "https://app.simeonlabs.com/app", appOrigin: "https://app.simeonlabs.com", pageUrl: "https://app.simeonlabs.com/app" });
  const staging = resolveShellConfig({ api: "https://api.staging.simeonlabs.com/", app: "https://app.staging.simeonlabs.com/app" });
  assert.equal(staging.api, "https://api.staging.simeonlabs.com");
  assert.equal(staging.pageUrl, "https://app.staging.simeonlabs.com/app", "the page finds its API itself");
  const standIn = resolveShellConfig({ api: "http://127.0.0.1:4174", app: "http://127.0.0.1:4174/app" });
  assert.equal(standIn.pageUrl, "http://127.0.0.1:4174/app?api=http%3A%2F%2F127.0.0.1%3A4174");
  assert.equal(new URL(standIn.pageUrl).searchParams.get("api"), "http://127.0.0.1:4174");
  assert.equal(standIn.appOrigin, "http://127.0.0.1:4174");
  assert.equal(resolveShellConfig({ api: "javascript:alert(1)", app: "ftp://x" }).api, "https://api.simeonlabs.com", "only http(s) is taken");
  // The guess is the page's own (`resolveApiBase`).
  for (const app of ["https://app.simeonlabs.com/app", "https://app.staging.simeonlabs.com/app", "http://localhost:3000/app", "http://127.0.0.1:4174/app", "https://simeon.example/app"]) {
    const url = new URL(app);
    assert.equal(apiThePageWouldUse(url), page.module.resolveApiBase({ hostname: url.hostname, search: "", protocol: url.protocol }), app);
  }
  assert.equal(page.module.resolveApiBase({ hostname: "127.0.0.1", search: new URL(standIn.pageUrl).search, protocol: "http:" }), "http://127.0.0.1:4174", "the page reads the app's ?api=");
});
