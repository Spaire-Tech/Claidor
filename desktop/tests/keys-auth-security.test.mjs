/**
 * Keys, sign-in and local security (25 September 2026,
 * design-audit-ledger.md clusters `box-token-scope`, `sign-in-copy` and
 * `local-security`).
 *
 * The box borrows the Mac's session token and the Mac's hourly refresh
 * used to kill it at once (server side: a grace now; see
 * server/tests/desktop/test_endpoints.py); sign-out forgot neither the
 * token file nor the keep-fresh timer nor the box's renewal credential; a
 * 503 from a deploy signed the person out; the daemon on the Mac read
 * `~/.ssh` as readily as a spreadsheet; the box's fetch followed redirects
 * into the local network; the host log carried tool arguments verbatim;
 * credential files were written with the umask; the exec daemon and the
 * fork router were published on the Mac's loopback with a fixed bearer;
 * and the person still read "Claidor" in sign-in errors.
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile, stat, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = (file) => readFile(path.join(repoRoot, "source", file), "utf8");

async function load(entry, name) {
  const dir = await mkdtemp(path.join(os.tmpdir(), `caisra-${name}-`));
  const outfile = path.join(dir, `${name}.mjs`);
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron"], banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

test("the daemon refuses the places that hold keys and sign-ins, whatever the permission says", async () => {
  const { module, dispose } = await load("source/shared/sensitive-local-paths.ts", "sensitive-paths");
  try {
    const home = "/Users/bass";
    const reason = (action, target) => module.sensitiveLocalPathReason({ action, target }, home);
    assert.match(reason("read-file", "~/.ssh/id_ed25519"), /does not read, write or run anything under ~\/\.ssh/);
    assert.match(reason("read-file", "/Users/bass/.caisra/local-docker-credential/inference.json"), /~\/\.caisra/);
    assert.match(reason("list-directory", ".aws"), /~\/\.aws/);
    assert.match(reason("write-file", "$HOME/.config/gcloud/credentials.db"), /~\/\.config\/gcloud/);
    assert.match(reason("read-file", "~/Documents/../.gnupg/secring.gpg"), /~\/\.gnupg/, "dot-dot is resolved before the check");
    assert.match(reason("read-file", "/Users/bass/Library/Application Support/Google/Chrome/Default/Cookies"), /Chrome/);
    assert.match(reason("read-file", "/etc/shadow"), /\/etc\/shadow/);
    assert.match(reason("run-command", "cat ~/.ssh/id_rsa | pbcopy"), /~\/\.ssh/);
    assert.match(reason("run-command", "security dump-keychain ~/Library/Keychains/login.keychain-db"), /Keychains/);
    assert.match(reason("run-command", "cp $HOME/.netrc /tmp"), /~\/\.netrc/);
    assert.match(reason("run-command", "ls .kube/config"), /~\/\.kube/);
    assert.equal(reason("read-file", "~/Documents/budget.xlsx"), undefined);
    assert.equal(reason("read-file", "~/.sshfs/notes.txt"), undefined, "a prefix is not the folder");
    assert.equal(reason("run-command", "ls ~/Documents && echo done"), undefined);
    assert.equal(reason("run-command", "git status"), undefined);
    assert.equal(reason("send-input", "y"), undefined);
  } finally {
    await dispose();
  }
  const daemon = await src("host/local-exec/local-exec-daemon.ts");
  assert.match(daemon, /if \(describes != null\) \{ const sensitive = sensitiveLocalPathReason\(describes, homedir\(\)\); if \(sensitive !== undefined\) return sensitive; \} const permission = settingsStore\.getLocalToolPermission\(\);/, "the check runs before Always allow is consulted");
});

test("web fetch checks every redirect hop, and the Mac-local hatch is covered by the same check", async () => {
  const { module, dispose } = await load("source/shared/node/web-fetch.ts", "web-fetch-redirects");
  try {
    const calls = [];
    const fetchImpl = async (url) => {
      calls.push(url);
      if (url === "https://example.com/start") return new Response("", { status: 302, headers: { location: "http://127.0.0.1:1337/exec" } });
      if (url === "https://example.com/hop") return new Response("", { status: 301, headers: { location: "/final" } });
      if (url === "https://example.com/final") return new Response("<html><body><p>landed</p></body></html>", { status: 200, headers: { "content-type": "text/html" } });
      if (url === "https://example.com/loop") return new Response("", { status: 302, headers: { location: "/loop" } });
      throw new Error(`unexpected ${url}`);
    };
    const bounced = await module.fetchWebPage("https://example.com/start", { fetch: fetchImpl });
    assert.match(bounced.error, /redirected to 127\.0\.0\.1\. Cannot fetch from localhost/);
    assert.deepEqual(calls, ["https://example.com/start"], "the local hop is never requested");
    const landed = await module.fetchWebPage("https://example.com/hop", { fetch: fetchImpl });
    assert.equal(landed.content, "landed");
    const looped = await module.fetchWebPage("https://example.com/loop", { fetch: fetchImpl });
    assert.match(looped.error, /redirected more than 5 times/);
    assert.match((await module.fetchWebPage("http://localhost:6080/vnc.html", { fetch: fetchImpl })).error, /Cannot fetch from localhost/);
    assert.match((await module.fetchWebPage("http://169.254.169.254/latest/meta-data", { fetch: fetchImpl })).error, /private address/);
    assert.equal(module.localNetworkRejection(new URL("https://simeonlabs.com/")), undefined);
  } finally {
    await dispose();
  }
});

test("sign-out forgets the box's credential and stops the box; a 5xx on refresh is not a sign-out", async () => {
  const { module, dispose } = await load("source/electron-main/box/local-docker-host-connector.ts", "local-docker-forget");
  try {
    const dir = await mkdtemp(path.join(os.tmpdir(), "caisra-forget-"));
    const settingsPath = path.join(dir, "settings.json");
    const file = path.join(dir, "local-docker-credential", "inference.json");
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify({ accessToken: "claidor_da_x", expiresAtMs: 1 }));
    const lines = [];
    module.rememberBoxRenewalCredential("claidor_db_y");
    await module.forgetInferenceCredential(settingsPath, { log: (line) => lines.push(line) });
    await assert.rejects(() => stat(file), /ENOENT/);
    assert.match(lines.join("\n"), /inference credential forgotten \(signed out\)/);
    await rm(dir, { recursive: true, force: true });
  } finally {
    await dispose();
  }
  const oauth = await src("electron-main/adapters/account-oauth.ts");
  assert.match(oauth, /if \(settlement\.kind !== "signed_out"\) return;/);
  assert.match(oauth, /await forgetInferenceCredential\(settingsPath\);\n\s*if \(runtime === "local-docker"\) await stopLocalDockerBox\(\);/);
  const auth = await load("source/electron-main/account/cursor-auth.ts", "cursor-auth-transient");
  try {
    for (const status of [500, 502, 503, 429, 408]) assert.equal(auth.module.isTransientRefreshStatus(status), true, String(status));
    for (const status of [400, 401, 403, 404]) assert.equal(auth.module.isTransientRefreshStatus(status), false, String(status));
  } finally {
    await auth.dispose();
  }
  const cursorAuth = await src("electron-main/account/cursor-auth.ts");
  assert.match(cursorAuth, /if \(isTransientRefreshStatus\(response\.status\)\) throw new SandAuthRefreshTransientError\(response\.status\); this\.advanceAuthOperationEpoch\(\);/);
});

test("the person's name comes from the profile route, and the person never reads Claidor", async () => {
  const { module, dispose } = await load("source/host/extensions/auth/user-full-name-service.ts", "full-name");
  try {
    assert.equal(module.USER_PROFILE_PATH, "/desktop/api/user/profile");
    assert.equal(module.fullNameFromProfileBody({ code: 0, data: { nickname: "Bass Fall", email: "b@x" } }), "Bass Fall");
    assert.equal(module.fullNameFromProfileBody({ code: 40101, message: "expired" }), undefined);
    assert.equal(module.fullNameFromProfileBody({ code: 0, data: { nickname: "  " } }), undefined);
  } finally {
    await dispose();
  }
  const service = await src("host/extensions/auth/user-full-name-service.ts");
  assert.doesNotMatch(service, /new GetMeRequest|dashboard_connect\.js/);
  for (const [file, gone] of [
    ["electron-main/account/cursor-auth.ts", "Sign in to Claidor"], ["electron-main/account/cursor-auth.ts", "Claidor sign-in expired"],
    ["electron-main/account/cursor-auth-wiring.ts", "Sign in to Claidor"], ["packages/cursor-config/auth/login.ts", "Claidor API"],
    ["host/extensions/inference/provider-session.ts", "Sign in to Claidor"], ["host/extensions/transcript/agent-run-error.ts", "Sign in to Claidor"],
    ["host/runner/box-reference-docs.ts", "Sign In with Claidor"], ["node-agent-coordinator/main.ts", "Sign in to Claidor"],
    ["host/extensions/auth/auth-service.ts", "no desktop required"],
  ]) assert.ok(!(await src(file)).includes(gone), `${file} no longer says ${gone}`);
});

test("credential files are owner-only, the host log carries no inline secret, and only the gateway and the screen are published", async () => {
  for (const file of ["shared/node/vendor-mcp/installs.ts", "shared/node/account-mcp/store.ts"]) {
    const text = await src(file);
    assert.match(text, /mkdirSync\(dirname\(path\), \{ recursive: true, mode: 0o700 \}\)/, file);
    assert.match(text, /\{ encoding: "utf8", mode: 0o600 \}/, file);
  }
  const secrets = await src("electron-main/secrets/secret-store.ts");
  assert.equal((secrets.match(/mode: 0o600/g) ?? []).length, 2);
  const { module, dispose } = await load("source/host/runner/tool-call-log.ts", "tool-call-log");
  try {
    const line = module.formatToolCallLogLine({ name: "Shell", callId: "c1", outcome: "result=error detail=curl -H 'Authorization: Bearer sk-live-abcdefghijklmnop' failed" });
    assert.ok(!line.includes("sk-live-abcdefghijklmnop"), line);
  } finally {
    await dispose();
  }
  const session = await load("source/host/extensions/inference/provider-session.ts", "provider-session-log");
  try {
    const summary = session.module.summarizeToolCalls([{ toolName: "Shell", args: { command: "export OPENAI_API_KEY=sk-proj-secretsecretsecret && run" } }]);
    assert.ok(!summary.includes("sk-proj-secretsecretsecret"), summary);
    assert.match(summary, /Shell\(/);
  } finally {
    await session.dispose();
  }
  const docker = await src("electron-main/box/local-docker-host-connector.ts");
  assert.doesNotMatch(docker, /1337:1337|1339:1339|8790:8790/);
  assert.match(docker, /"--publish", "127\.0\.0\.1:1340:1340"/);
  const gateway = await src("host/gateway-server.ts");
  assert.match(gateway, /url\.pathname === GATEWAY_HEALTH_PATH && deps\.authToken != null && !isAuthorized\(req, deps\.authToken\)\) return respondError\(res, 401, "unauthorized"\)/);
  assert.match(await src("electron-main/main-edge.ts"), /openCloudAgent: async \(raw\) => \{ if \(!isCloudAgentsServed\(\)\) return;/);
});
