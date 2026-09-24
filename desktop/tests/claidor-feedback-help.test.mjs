import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

// Send Feedback and the Help menu, offline. Until 24 September 2026 feedback
// went to Cursor's `/sand/feedback` (404 on Simeon Labs' server) and Help
// Center opened cursor.com.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadModule(entry, name) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), `simeon-${name}-`));
  const output = path.join(temporary, `${name}.mjs`);
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile: output, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron"] });
  const module = await import(`${pathToFileURL(output).href}?${Date.now()}`);
  return { module, dispose: () => rm(temporary, { recursive: true, force: true }) };
}

// A readable envelope token the way the server mints it: the `sub` is the
// account slot the renderer sends back with the feedback.
function envelopeToken(sub) {
  const part = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `claidor_da_${part({ alg: "HS256", typ: "JWT" })}.${part({ sub, email: "bass@simeonlabs.com", exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;
}

test("feedback posts to /desktop/api/feedback with the fields the server reads", async () => {
  const loaded = await loadModule("source/electron-main/feedback/feedback-report.ts", "feedback-report");
  try {
    const { submitFeedbackReport, CLAIDOR_FEEDBACK_PATH } = loaded.module;
    assert.equal(CLAIDOR_FEEDBACK_PATH, "feedback");
    const requests = [];
    const deps = {
      getAccessToken: async () => envelopeToken("user-1"),
      getMachineId: async () => "machine-1",
      appVersion: "0.18.0",
      platform: "darwin-arm64",
      osVersion: "15.6",
      backendUrl: "https://api.simeonlabs.com",
      fetchImpl: async (input, init) => { requests.push({ url: String(input), method: init?.method, headers: new Headers(init?.headers), body: JSON.parse(init?.body) }); return new Response(JSON.stringify({ code: 0, data: { received: true } }), { status: 200 }); },
    };
    const payload = { accountSlot: "user-1", message: "The picker is empty.", submissionId: "7c9e6679-7425-40de-944b-e07fc1f90ae7" };
    assert.deepEqual(await submitFeedbackReport(deps, payload), { ok: true });
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "https://api.simeonlabs.com/desktop/api/feedback");
    assert.equal(requests[0].method, "POST");
    assert.match(requests[0].headers.get("authorization"), /^Bearer claidor_da_/);
    assert.equal(requests[0].headers.get("content-type"), "application/json");
    assert.equal(requests[0].body.message, "The picker is empty.");
    assert.equal(requests[0].body.category, "app");
    assert.equal(requests[0].body.appVersion, "0.18.0");
    assert.equal(requests[0].body.platform, "darwin-arm64");
    assert.equal(requests[0].body.submissionId, payload.submissionId);

    // The status mapping the renderer reads is unchanged.
    for (const [status, code] of [[400, "invalid-feedback"], [402, "subscription-required"], [403, "access-denied"], [429, "rate-limited"], [500, "unavailable"]]) {
      assert.deepEqual(await submitFeedbackReport({ ...deps, fetchImpl: async () => new Response("", { status }) }, payload), { ok: false, code });
    }
    assert.deepEqual(await submitFeedbackReport({ ...deps, fetchImpl: async () => { throw new Error("offline"); } }, payload), { ok: false, code: "unavailable" });
    assert.deepEqual(await submitFeedbackReport(deps, { ...payload, accountSlot: "someone-else" }), { ok: false, code: "not-signed-in" });
    assert.deepEqual(await submitFeedbackReport(deps, { message: "" }), { ok: false, code: "invalid-feedback" });

    const source = await readFile(path.join(repoRoot, "source/electron-main/feedback/feedback-report.ts"), "utf8");
    assert.equal(source.includes('new URL("/sand/feedback"'), false);
    assert.match(source, /claidorApiUrl\(CLAIDOR_FEEDBACK_PATH/);
  } finally {
    await loaded.dispose();
  }
});

test("the server route the app posts to exists, takes the same body and logs the person", async () => {
  const endpoints = await readFile(path.join(repoRoot, "../server/polar/desktop/endpoints.py"), "utf8");
  assert.match(endpoints, /@router\.post\("\/api\/feedback", name="desktop:feedback"\)/);
  assert.match(endpoints, /desktop_session: DesktopSession = Depends\(get_desktop_session\)/);
  assert.match(endpoints, /"desktop\.feedback\.received"/);
  assert.match(endpoints, /_ok\(\{"received": True\}\)/);
  for (const field of ["category", "message", "appVersion", "platform"]) assert.match(endpoints, new RegExp(`^    ${field}: `, "m"));
});

test("Help Center opens simeonlabs.com; the cloud-agent link still builds on the website URL", async () => {
  const loaded = await loadModule("source/electron-main/application-menu.ts", "application-menu");
  try {
    const { buildApplicationMenuTemplate, HELP_CENTER_URL } = loaded.module;
    assert.equal(HELP_CENTER_URL, "https://simeonlabs.com");
    const opened = [];
    const template = buildApplicationMenuTemplate(
      { platform: "darwin", applyWindowShortcut: () => {}, canUseDevTools: () => false, emitOpenAbout: () => {}, emitOpenFeedback: () => {} },
      { appName: "Simeon", buildFromTemplate: (items) => items, setApplicationMenu: () => {}, openExternal: async (url) => { opened.push(url); } },
    );
    const help = template.find((item) => item.role === "help");
    assert.ok(help, "a Help menu");
    const center = help.submenu.find((item) => item.label === "Help Center");
    center.click();
    assert.deepEqual(opened, ["https://simeonlabs.com"]);
    const source = await readFile(path.join(repoRoot, "source/electron-main/application-menu.ts"), "utf8");
    assert.equal(source.includes('openExternal("https://cursor.com/help")'), false);
    assert.match(source, /openExternal\(HELP_CENTER_URL\)/);
    // `openCloudAgent` is left as it was: cloud agents are not served here.
    const edge = await readFile(path.join(repoRoot, "source/electron-main/main-edge.ts"), "utf8");
    assert.match(edge, /openCloudAgent: async \(raw\)/);
  } finally {
    await loaded.dispose();
  }
});
