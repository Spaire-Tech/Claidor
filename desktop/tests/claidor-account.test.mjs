import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

// The account screens on Simeon Labs' server, offline: the profile and
// picture, the usage meters, the Usage & Billing gate, and sign-out's
// server revocation. Until 24 September 2026 every one of these went to a
// Cursor Connect RPC the server does not serve, or (the gate) was off.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadModule(entry, name) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), `simeon-${name}-`));
  const output = path.join(temporary, `${name}.mjs`);
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile: output, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron"], banner: { js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);' } });
  const module = await import(`${pathToFileURL(output).href}?${Date.now()}`);
  return { module, dispose: () => rm(temporary, { recursive: true, force: true }) };
}

function envelope(data, status = 200) {
  return new Response(JSON.stringify({ code: 0, data }), { status, headers: { "content-type": "application/json" } });
}

// `user_payload()` and `quota()` in `server/polar/desktop/service.py`.
const PROFILE = { id: "6d1e…", nickname: "Bass Fall", email: "bass@simeonlabs.com", avatarUrl: "https://lh3.googleusercontent.com/a/photo=s96-c", phone: null, accountMode: "personal" };
const QUOTA = { planName: "Free", subscriptionStatus: "free", creditsLimit: 2_000_000, creditsUsed: 500_000, creditsRemaining: 1_500_000, hasPaidCredits: false, mediaGenerationEntitled: false, shareEntitled: false, deploymentEntitled: false, periodStart: "2026-09-01T00:00:00+00:00", periodEnd: "2026-10-01T00:00:00+00:00" };

test("the profile comes from /desktop/api/user/profile and fills the CursorProfile the menu reads", async () => {
  const loaded = await loadModule("source/electron-main/account/cursor-profile.ts", "cursor-profile");
  const requests = [];
  try {
    const { fetchCursorProfile, cursorProfileFromClaidor } = loaded.module;
    const profile = await fetchCursorProfile(async () => "claidor_da_me", {
      backendUrl: "https://api.simeonlabs.com",
      fetch: async (input, init) => { requests.push({ url: String(input), method: init?.method, headers: new Headers(init?.headers) }); return envelope(PROFILE); },
    });
    assert.equal(requests[0].url, "https://api.simeonlabs.com/desktop/api/user/profile");
    assert.equal(requests[0].method, "GET");
    assert.equal(requests[0].headers.get("authorization"), "Bearer claidor_da_me");
    // The local rename, when there is one, still wins; here there is none
    // on this machine, so the server's nickname shows.
    assert.equal(profile.email, "bass@simeonlabs.com");
    assert.equal(profile.profilePictureUrl, "https://lh3.googleusercontent.com/a/photo=s96-c");
    assert.equal(profile.isAnysphereUser, false);
    assert.ok(profile.displayName === "Bass Fall" || typeof profile.displayName === "string");

    assert.deepEqual(cursorProfileFromClaidor(PROFILE, undefined), { displayName: "Bass Fall", email: "bass@simeonlabs.com", profilePictureUrl: "https://lh3.googleusercontent.com/a/photo=s96-c", isAnysphereUser: false });
    assert.deepEqual(cursorProfileFromClaidor({ ...PROFILE, name: "Bassirou Fall" }, undefined).displayName, "Bassirou Fall");
    assert.deepEqual(cursorProfileFromClaidor(PROFILE, "Simeon's Person").displayName, "Simeon's Person");
    assert.equal(cursorProfileFromClaidor({ ...PROFILE, avatarUrl: null }, undefined).profilePictureUrl, undefined);

    // A refusal is reported and degrades the way it always did.
    const failures = [];
    const refused = await fetchCursorProfile(async () => "x", { backendUrl: "https://api.simeonlabs.com", fetch: async () => new Response("{}", { status: 401 }), reportFailure: (area, leg) => failures.push(`${area}/${leg}`) });
    assert.ok(refused === null || refused.email === undefined);
    assert.deepEqual(failures, ["cursor-profile/claidor-profile"]);

    const source = await readFile(path.join(repoRoot, "source/electron-main/account/cursor-profile.ts"), "utf8");
    assert.equal(/client\.getMe\(/.test(source), false);
    assert.equal(/client\.getTeams\(/.test(source), false);
    assert.match(source, /updateUserName\(/, "the local rename keeps its swallowed UpdateUserName");
  } finally {
    await loaded.dispose();
  }
});

test("the picture the server names is fetched over https and handed to the menu as a data URL", async () => {
  const loaded = await loadModule("source/electron-main/account/cursor-avatar.ts", "cursor-avatar");
  try {
    const { resolveCursorAvatarDataUrl, clearCursorAvatarCacheForTesting } = loaded.module;
    clearCursorAvatarCacheForTesting();
    const fetched = [];
    const dataUrl = await resolveCursorAvatarDataUrl("6d1e-not-github", {
      preferredUrl: PROFILE.avatarUrl,
      fetchImpl: async (url) => { fetched.push(String(url)); return new Response(new Uint8Array([137, 80, 78, 71]), { status: 200, headers: { "content-type": "image/png" } }); },
    });
    assert.deepEqual(fetched, [PROFILE.avatarUrl]);
    assert.equal(dataUrl, `data:image/png;base64,${Buffer.from([137, 80, 78, 71]).toString("base64")}`);
    // A user id that is not a GitHub subject draws nothing on its own.
    clearCursorAvatarCacheForTesting();
    assert.equal(await resolveCursorAvatarDataUrl("6d1e-not-github", { fetchImpl: async () => { throw new Error("must not fetch"); } }), null);
  } finally {
    await loaded.dispose();
  }
});

test("usage comes from /desktop/api/user/quota, in the shapes the header and Settings read", async () => {
  const loaded = await loadModule("source/electron-main/account/cursor-profile.ts", "cursor-profile");
  const requests = [];
  try {
    const { fetchSandWeeklyUsage, fetchSandUsageSummary, weeklyUsageFromClaidorQuota, usageSummaryFromClaidorQuota } = loaded.module;
    const deps = { backendUrl: "https://api.simeonlabs.com", fetch: async (input) => { requests.push(String(input)); return envelope(QUOTA); } };
    const weekly = await fetchSandWeeklyUsage(async () => "claidor_da_usage", deps);
    assert.deepEqual(weekly, { percentUsed: 25, nextResetMs: Date.parse("2026-10-01T00:00:00+00:00"), hasNonZeroIncludedLimit: true, onDemand: null });
    const summary = await fetchSandUsageSummary(async () => "claidor_da_usage", deps);
    assert.deepEqual(summary, {
      isEnterprise: false,
      sandUsagePercent: 25,
      sandUsageResetTimestampMs: Date.parse("2026-10-01T00:00:00+00:00"),
      hasAvailableUsage: true,
      isSandTrial: false,
      hasEndedSandTrial: false,
      hasNonZeroIncludedLimit: true,
      canCancelSandTrial: false,
      onDemand: null,
      upgradeCta: null,
    });
    assert.deepEqual(requests, ["https://api.simeonlabs.com/desktop/api/user/quota", "https://api.simeonlabs.com/desktop/api/user/quota"]);

    // Exhausted, over, and a limit of nothing.
    assert.equal(usageSummaryFromClaidorQuota({ ...QUOTA, creditsUsed: 2_000_000, creditsRemaining: 0 }).hasAvailableUsage, false);
    assert.equal(weeklyUsageFromClaidorQuota({ ...QUOTA, creditsUsed: 3_000_000 }).percentUsed, 100);
    assert.deepEqual(weeklyUsageFromClaidorQuota({ ...QUOTA, creditsLimit: 0, creditsUsed: 0 }), { percentUsed: 0, nextResetMs: Date.parse("2026-10-01T00:00:00+00:00"), hasNonZeroIncludedLimit: false, onDemand: null });
    assert.equal(weeklyUsageFromClaidorQuota({ planName: "Free" }), null);
    assert.equal(usageSummaryFromClaidorQuota({ planName: "Free" }).sandUsagePercent, null);

    // The header's read degrades to null; Settings' read throws so the
    // renderer can show the sentence.
    const failures = [];
    assert.equal(await fetchSandWeeklyUsage(async () => "x", { backendUrl: "https://api.simeonlabs.com", fetch: async () => new Response("", { status: 503 }), reportFailure: (area, leg) => failures.push(`${area}/${leg}`) }), null);
    assert.deepEqual(failures, ["cursor-usage/claidor-quota"]);
    await assert.rejects(() => fetchSandUsageSummary(async () => "x", { backendUrl: "https://api.simeonlabs.com", fetch: async () => new Response(JSON.stringify({ error: { message: "Allowance service is down." } }), { status: 503 }) }), /Allowance service is down/);
  } finally {
    await loaded.dispose();
  }
});

test("sand_usage_page is on by Simeon's default, over the bundled table, under the environment and a local override", async () => {
  const loaded = await loadModule("source/shared/node/experiments/simeon-gate-defaults.ts", "simeon-gate-defaults");
  try {
    const { SIMEON_FEATURE_GATE_DEFAULTS, simeonGateDefault, withSimeonGateDefaults, applySimeonGateDefaults } = loaded.module;
    assert.equal(SIMEON_FEATURE_GATE_DEFAULTS.sand_usage_page, true);
    assert.equal(simeonGateDefault("sand_usage_page", {}), true);
    assert.equal(simeonGateDefault("sand_usage_page", { SAND_FEATURE_GATE_OVERRIDES: "sand_usage_page=0" }), false);
    assert.equal(simeonGateDefault("sand_box_egress_tunnel", {}), undefined);

    // The service as the adapter wraps it: a bundled table that says off.
    let overrides = {};
    const listeners = new Set();
    const bundled = { checkFeatureGate: (name) => name === "sand_box_egress_tunnel", getSnapshot: () => ({ isInitialized: false, featureGates: { sand_usage_page: false, sand_box_egress_tunnel: true } }), subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); }, getFeatureFlagOverridesRecord: () => overrides, refreshNow: async () => "refreshed", dispose() { this.disposed = true; } };
    const service = applySimeonGateDefaults(bundled, {});
    assert.equal(service.checkFeatureGate("sand_usage_page"), true);
    assert.equal(service.checkFeatureGate("sand_box_egress_tunnel"), true, "a gate not in the table reaches the service");
    assert.deepEqual(service.getSnapshot().featureGates, { sand_usage_page: true, sand_box_egress_tunnel: true, sand_auto_review: true, sand_product_analytics: false, sand_notify_bus: true });
    const seen = [];
    service.subscribe((snapshot) => seen.push(snapshot.featureGates.sand_usage_page));
    for (const listener of listeners) listener(bundled.getSnapshot());
    assert.deepEqual(seen, [true]);
    assert.equal(await service.refreshNow(), "refreshed", "other methods pass through, bound to the service");
    service.dispose();
    assert.equal(bundled.disposed, true);

    // A local override from the flags panel wins over the default.
    overrides = { sand_usage_page: false };
    assert.equal(service.checkFeatureGate("sand_usage_page"), false);
    assert.equal(service.getSnapshot().featureGates.sand_usage_page, false);
    assert.equal(withSimeonGateDefaults({ featureGates: { sand_usage_page: false } }, {}, {}).featureGates.sand_usage_page, true);
    assert.equal(withSimeonGateDefaults({ featureGates: { sand_usage_page: false } }, { SAND_FEATURE_GATE_OVERRIDES: "sand_usage_page=0" }, {}).featureGates.sand_usage_page, false);
    assert.equal(withSimeonGateDefaults(null, {}, {}), null);

    const edge = await readFile(path.join(repoRoot, "source/electron-main/adapters/account-edge.ts"), "utf8");
    assert.match(edge, /simeonGateDefault\("sand_usage_page"/);
    const adapter = await readFile(path.join(repoRoot, "source/electron-main/adapters/experiments.ts"), "utf8");
    assert.match(adapter, /applySimeonGateDefaults\(new SandExperimentService\(options\)/);
    const generated = await readFile(path.join(repoRoot, "source/shared/node/experiments/experiment-config.gen.ts"), "utf8");
    assert.match(generated, /sand_usage_page: \{\s*client: true,\s*default: false/, "the generated table is not edited");
  } finally {
    await loaded.dispose();
  }
});

test("sign-out posts the departing bearer to /desktop/api/auth/logout, best effort, before the keychain is emptied", async () => {
  const signOut = await loadModule("source/electron-main/account/claidor-sign-out.ts", "claidor-sign-out");
  try {
    const { revokeClaidorSession, CLAIDOR_SIGN_OUT_TIMEOUT_MS } = signOut.module;
    assert.equal(CLAIDOR_SIGN_OUT_TIMEOUT_MS, 5_000);
    const requests = [];
    assert.equal(await revokeClaidorSession("claidor_da_bye", { backendUrl: "https://api.simeonlabs.com", fetch: async (input, init) => { requests.push({ url: String(input), method: init?.method, headers: new Headers(init?.headers), signal: init?.signal }); return envelope({}); } }), true);
    assert.equal(requests[0].url, "https://api.simeonlabs.com/desktop/api/auth/logout");
    assert.equal(requests[0].method, "POST");
    assert.equal(requests[0].headers.get("authorization"), "Bearer claidor_da_bye");
    assert.ok(requests[0].signal instanceof AbortSignal);

    // Failure never throws: a refusal, a dead network, a hang past the deadline.
    const failures = [];
    assert.equal(await revokeClaidorSession("t", { backendUrl: "https://api.simeonlabs.com", fetch: async () => new Response("", { status: 500 }), reportFailure: (error) => failures.push(error.message) }), false);
    assert.equal(await revokeClaidorSession("t", { backendUrl: "https://api.simeonlabs.com", fetch: async () => { throw new Error("ECONNREFUSED"); }, reportFailure: (error) => failures.push(error.message) }), false);
    assert.equal(await revokeClaidorSession("t", { backendUrl: "https://api.simeonlabs.com", timeoutMs: 20, fetch: (_input, init) => new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason))), reportFailure: (error) => failures.push(error.message) }), false);
    assert.equal(await revokeClaidorSession("", { fetch: async () => { throw new Error("must not fetch"); } }), false);
    assert.deepEqual(failures, ["Sign-out on Simeon Labs' server answered 500.", "ECONNREFUSED", "Sign-out on Simeon Labs' server timed out."]);
  } finally {
    await signOut.dispose();
  }

  // The auth service calls it with the token still in hand, then deletes;
  // a revoke that throws changes nothing about the local sign-out.
  const auth = await loadModule("source/electron-main/account/cursor-auth.ts", "cursor-auth");
  try {
    const { SandCursorAuthService, ACCESS_TOKEN_SECRET_KEY, REFRESH_TOKEN_SECRET_KEY } = auth.module;
    const order = [];
    const makeSecrets = () => {
      const store = new Map([[ACCESS_TOKEN_SECRET_KEY, "claidor_da_live"], [REFRESH_TOKEN_SECRET_KEY, "claidor_dr_live"]]);
      return { store, readSecret: async (key) => store.get(key) ?? null, writeSecret: async (key, value) => { store.set(key, value); }, deleteSecret: async (key) => { order.push(`delete:${key}`); store.delete(key); }, isEncryptedStorageAvailable: () => true };
    };
    const secrets = makeSecrets();
    const service = new SandCursorAuthService({ openExternal: async () => {}, secrets, revokeSession: async (token) => { order.push(`revoke:${token}:${secrets.store.has(ACCESS_TOKEN_SECRET_KEY) ? "still-stored" : "gone"}`); } });
    const status = await service.logout();
    assert.equal(status.kind, "logged-out");
    assert.deepEqual(order, ["revoke:claidor_da_live:still-stored", `delete:${ACCESS_TOKEN_SECRET_KEY}`, `delete:${REFRESH_TOKEN_SECRET_KEY}`]);
    assert.equal(secrets.store.size, 0);

    const reported = [];
    const failing = makeSecrets();
    const throwing = new SandCursorAuthService({ openExternal: async () => {}, secrets: failing, revokeSession: async () => { throw new Error("server down"); }, reportFailure: (operation, error) => reported.push(`${operation}:${error.message}`) });
    assert.equal((await throwing.logout()).kind, "logged-out");
    assert.equal(failing.store.size, 0);
    assert.deepEqual(reported, ["session-revoke:server down"]);

    const wiring = await readFile(path.join(repoRoot, "source/electron-main/account/cursor-auth-wiring.ts"), "utf8");
    assert.match(wiring, /revokeSession: deps\.revokeSession \?\? \(\(accessToken\) => revokeClaidorSession\(/);
  } finally {
    await auth.dispose();
  }
});
