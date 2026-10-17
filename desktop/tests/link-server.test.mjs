/**
 * Link's sign-in through Simeon Labs' own client (17 October 2026): the
 * server client (source/shared/node/link-wallet/link-server.ts) against a
 * local HTTP server playing Simeon's API, the CLI given the server's access
 * token per command (`link-cli.ts`), and the tools' sign-in, status and
 * sign-out switched to the server with Link's device code kept for a server
 * without the client (`link-tools.ts`).
 */
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function load(entry, name) {
  const dir = await mkdtemp(path.join(os.tmpdir(), `simeon-${name}-`));
  const outfile = path.join(dir, `${name}.mjs`);
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron"], banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

/** Simeon's API as far as Link goes: answers from `state`, every request written down. */
async function fakeApi(state) {
  const requests = [];
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      requests.push({ method: request.method, url: request.url, authorization: request.headers.authorization, body: body.length > 0 ? JSON.parse(body) : undefined });
      const answer = state.answer(request.method, request.url, body.length > 0 ? JSON.parse(body) : undefined);
      response.writeHead(answer.status, { "content-type": "application/json" });
      response.end(JSON.stringify(answer.body));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return { url: `http://127.0.0.1:${port}`, requests, close: () => new Promise((resolve) => server.close(resolve)) };
}

test("the server client: status, the sign-in link, a token kept until near its end, a refresh, disconnect", async (t) => {
  const { module, dispose } = await load("source/shared/node/link-wallet/link-server.ts", "link-server");
  t.after(dispose);
  const { createLinkServer, LINK_TOKEN_MARGIN_MS } = module;
  let clock = 1_000_000;
  let issued = 0;
  const state = {
    connected: true,
    configured: true,
    answer(method, url, body) {
      if (method === "GET" && url === "/desktop/api/link/status") return { status: 200, body: { configured: this.configured, connected: this.connected, scope: "payment_methods.agentic userinfo:read" } };
      if (method === "POST" && url === "/desktop/api/link/start") return this.configured ? { status: 200, body: { configured: true, url: "https://api.simeonlabs.com/desktop/apps/start?t=abc&e=1&s=sig" } } : { status: 503, body: { error: "Link can't be connected here yet.", configured: false } };
      if (method === "POST" && url === "/desktop/api/link/token") {
        if (!this.connected) return { status: 200, body: { connected: false } };
        issued += 1;
        return { status: 200, body: { connected: true, accessToken: `liwltoken_${issued}${body?.refresh === true ? "_refreshed" : ""}`, expiresAtMs: clock + 60 * 60_000, scope: "payment_methods.agentic" } };
      }
      if (method === "DELETE" && url === "/desktop/api/link") { const was = this.connected; this.connected = false; return { status: 200, body: { disconnected: was, revoked: was } }; }
      return { status: 404, body: { detail: "Not Found" } };
    },
  };
  const api = await fakeApi(state);
  t.after(api.close);
  const server = createLinkServer({ backendUrl: () => `${api.url}/`, accessToken: async () => "simeon_da_box", now: () => clock });

  assert.deepEqual(await server.status(), { configured: true, connected: true });
  assert.equal(server.knownConnected(), true);
  assert.equal(api.requests[0].authorization, "Bearer simeon_da_box", "the box's own bearer");

  assert.deepEqual(await server.start(), { url: "https://api.simeonlabs.com/desktop/apps/start?t=abc&e=1&s=sig" });

  // One token for every command until two minutes before its end; commands started together ask once.
  const [a, b] = await Promise.all([server.accessToken(), server.accessToken()]);
  assert.equal(a, "liwltoken_1");
  assert.equal(b, "liwltoken_1");
  clock += 60 * 60_000 - LINK_TOKEN_MARGIN_MS - 1;
  assert.equal(await server.accessToken(), "liwltoken_1");
  clock += 2;
  assert.equal(await server.accessToken(), "liwltoken_2");
  // After Link refused one: the server is asked to refresh.
  assert.equal(await server.accessToken(true), "liwltoken_3_refreshed");
  assert.deepEqual(api.requests.filter((r) => r.url === "/desktop/api/link/token").map((r) => r.body), [{}, {}, { refresh: true }]);

  assert.equal(await server.disconnect(), true);
  assert.equal(server.knownConnected(), false);
  assert.equal(await server.accessToken(), undefined, "no connection, no token");
  assert.deepEqual(await server.status(), { configured: true, connected: false });

  // A server without the client: the sign-in says so, for the device code to take over.
  state.configured = false;
  assert.deepEqual(await server.start(), { configured: false });

  // A server from before this (no route) reads the same; none at all is an error, and no bearer asks nothing.
  const before = createLinkServer({ backendUrl: () => `${api.url}/old`, accessToken: async () => "simeon_da_box" });
  assert.deepEqual(await before.start(), { configured: false });
  assert.equal(await before.status(), undefined);
  const nowhere = createLinkServer({ backendUrl: () => "http://127.0.0.1:9", accessToken: async () => "simeon_da_box" });
  assert.ok("error" in (await nowhere.start()));
  const asked = api.requests.length;
  const unsigned = createLinkServer({ backendUrl: () => api.url, accessToken: async () => null });
  assert.equal(await unsigned.status(), undefined);
  assert.equal(api.requests.length, asked);
});

test("each Link command but auth's runs with the server's token, never refreshing it itself, and once more after Link refuses it", async (t) => {
  const { module, dispose } = await load("source/shared/node/link-wallet/link-cli.ts", "link-cli-token");
  t.after(dispose);
  const root = await mkdtemp(path.join(os.tmpdir(), "simeon-link-token-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const ran = [];
  let refuse = 0;
  const asks = [];
  const cli = module.createLinkCli({
    rootDir: () => root,
    // A token in the computer's own environment is never the CLI's.
    env: { PATH: "/usr/bin", LINK_ACCESS_TOKEN: "stray", LINK_REFRESH_TOKEN: "stray_refresh", LINK_NO_REFRESH: "" },
    exists: (file) => file === "/usr/local/bin/link-cli",
    serverToken: async (refresh) => { asks.push(refresh); return refresh ? "liwltoken_fresh" : "liwltoken_held"; },
    exec: async (_file, args, options) => {
      ran.push({ args, env: options.env });
      // As 0.27.1 answers a 401 with LINK_NO_REFRESH set (measured against a stand-in for Link's API).
      if (refuse > 0 && args[0] !== "auth") { refuse -= 1; return { code: 1, stdout: JSON.stringify({ code: "UNKNOWN", message: "Access token expired. Update LINK_ACCESS_TOKEN and retry." }), stderr: "" }; }
      return { code: 0, stdout: JSON.stringify(args[0] === "auth" ? { authenticated: false } : { id: "user" }), stderr: "" };
    },
  });

  assert.deepEqual(await cli.run(["user-info", "retrieve"]), { ok: true, value: { id: "user" } });
  assert.equal(ran[0].env.LINK_ACCESS_TOKEN, "liwltoken_held");
  assert.equal(ran[0].env.LINK_NO_REFRESH, "1");
  assert.equal(ran[0].env.LINK_REFRESH_TOKEN, undefined, "the refresh token stays on the server");

  // auth (status, login, logout) is this computer's own file: no token.
  await cli.run(["auth", "status"]);
  assert.equal(ran[1].env.LINK_ACCESS_TOKEN, undefined);
  assert.equal(ran[1].env.LINK_REFRESH_TOKEN, undefined);
  assert.deepEqual(asks, [false]);

  // Link refused the token: the server refreshes it, the command runs once more, and no more than once.
  refuse = 1;
  assert.deepEqual(await cli.run(["sources", "list"]), { ok: true, value: { id: "user" } });
  assert.deepEqual(asks, [false, false, true]);
  assert.equal(ran.at(-1).env.LINK_ACCESS_TOKEN, "liwltoken_fresh");
  // Refused twice: what every tool says for a Link not connected.
  refuse = 2;
  assert.deepEqual(await cli.run(["balances", "list"]), { ok: false, code: "NOT_AUTHENTICATED", message: "Link isn't connected any more." });
  assert.deepEqual(asks, [false, false, true, false, true]);
  // Another failure is Link's own answer, not retried.
  ran.length = 0;
  const other = module.createLinkCli({ rootDir: () => root, env: {}, exists: (file) => file === "/usr/local/bin/link-cli", serverToken: async () => "liwltoken_held", exec: async (_file, args, options) => { ran.push({ args, env: options.env }); return { code: 1, stdout: JSON.stringify({ code: "INVALID_INPUT", message: "--amount is required" }), stderr: "" }; } });
  assert.deepEqual(await other.run(["spend-request", "create"]), { ok: false, code: "INVALID_INPUT", message: "--amount is required" });
  assert.equal(ran.length, 1);

  // No connection held by the server: the CLI's own sign-in file, as before.
  const own = module.createLinkCli({ rootDir: () => root, env: {}, exists: (file) => file === "/usr/local/bin/link-cli", serverToken: async () => undefined, exec: async (_file, args, options) => { ran.push({ args, env: options.env }); return { code: 0, stdout: "{}", stderr: "" }; } });
  await own.run(["user-info", "retrieve"]);
  assert.equal(ran.at(-1).env.LINK_ACCESS_TOKEN, undefined);
  assert.equal(ran.at(-1).env.LINK_NO_REFRESH, undefined);
});

test("the tools sign in through the server, read connected from it, and disconnect there; the device code stays for a server without the client", async (t) => {
  const tools = await load("source/shared/node/link-wallet/link-tools.ts", "link-tools-server");
  const runner = await load("source/shared/node/link-wallet/link-cli.ts", "link-cli-server");
  t.after(tools.dispose);
  t.after(runner.dispose);
  const root = await mkdtemp(path.join(os.tmpdir(), "simeon-link-tools-server-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const commands = [];
  const cli = runner.module.createLinkCli({
    rootDir: () => root,
    env: {},
    exists: (file) => file === "/usr/local/bin/link-cli",
    exec: async (_file, args) => {
      const command = args.slice(0, args.indexOf("--auth"));
      commands.push(command.join(" "));
      if (command[0] === "auth" && command[1] === "login") return { code: 0, stdout: JSON.stringify([{ verification_url: "https://app.link.com/device/setup?code=a-b-c", phrase: "a-b-c" }]), stderr: "" };
      return { code: 0, stdout: JSON.stringify({ authenticated: false }), stderr: "" };
    },
  });
  const server = {
    configured: true,
    connected: false,
    reachable: true,
    disconnects: 0,
    async status() { return this.reachable ? { configured: this.configured, connected: this.connected } : undefined; },
    async start() { if (!this.reachable) return { error: "Simeon's server could not be reached." }; return this.configured ? { url: "https://api.simeonlabs.com/desktop/apps/start?t=x" } : { configured: false }; },
    async accessToken() { return this.connected ? "liwltoken_held" : undefined; },
    async disconnect() { this.disconnects += 1; this.connected = false; return true; },
    knownConnected() { return this.connected; },
  };
  const link = tools.module.createLinkTools({ cli, rootDir: () => root, server });

  // Simeon's own client: the server's link, no device code started.
  assert.deepEqual(await link.startSignIn(false), { url: "https://api.simeonlabs.com/desktop/apps/start?t=x", phrase: "", via: "server" });
  assert.equal(commands.some((command) => command.startsWith("auth login")), false);
  assert.equal(link.hasSignIn(), false);

  // Connected is the server's word; the CLI is not asked.
  server.connected = true;
  commands.length = 0;
  assert.deepEqual(await link.signInStatus(), { authenticated: true, pending: false });
  assert.deepEqual(commands, []);
  assert.equal(link.hasSignIn(), true);

  // Disconnect: the server revokes and forgets; this computer's own sign-in, if any, is logged out.
  await link.signOut();
  assert.equal(server.disconnects, 1);
  assert.deepEqual(commands, ["auth logout"]);

  // Not connected at the server: an older device-code sign-in on this computer still counts.
  commands.length = 0;
  assert.deepEqual(await link.signInStatus(), { authenticated: false, pending: false });
  assert.deepEqual(commands, ["auth status"]);

  // A server without the client: Link's device code, as before.
  server.configured = false;
  assert.deepEqual(await link.startSignIn(false), { url: "https://app.link.com/device/setup?code=a-b-c", phrase: "a-b-c", via: "device" });

  // A server that can't be reached says so; no device code is started behind its back.
  server.configured = true;
  server.reachable = false;
  commands.length = 0;
  assert.deepEqual(await link.startSignIn(false), { error: "Simeon's server could not be reached." });
  assert.deepEqual(commands, []);
});
