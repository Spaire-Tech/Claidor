/**
 * The health probe carries the gateway token (29 September 2026).
 *
 * The host answers /health with 401 without the token. The coordinator's
 * probe sent only the connection's headers (the network token), so on a
 * cloud box every probe failed, and each failure dropped the connection
 * and made a new one: the reconnects and the lag of the first day on the
 * cloud computer (sixteen `sand.box.proxy.upstream_error ... path=health
 * status=401 authorization_sent=False` lines in half an hour).
 */
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function load(entry, name) {
  const dir = await mkdtemp(path.join(os.tmpdir(), `simeon-${name}-`));
  const outfile = path.join(dir, `${name}.mjs`);
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent" });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

/** A gateway that answers /health the way host/gateway-server.ts does. */
function startGateway(token) {
  const seen = [];
  const server = http.createServer((req, res) => {
    seen.push({ path: req.url, authorization: req.headers.authorization ?? null, network: req.headers["x-anyrun-network-token"] ?? null });
    if (req.url === "/health" && req.headers.authorization !== `Bearer ${token}`) {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, isBusy: false }));
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ seen, url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((done) => server.close(done)) })));
}

test("the health probe sends the gateway token and a healthy box keeps its connection", async () => {
  const { module, dispose } = await load("source/node-agent-coordinator/gateway/host-supervisor.ts", "host-supervisor");
  const gateway = await startGateway("gw-token");
  try {
    const connection = { baseUrl: gateway.url, token: "gw-token", headers: { "x-anyrun-network-token": "net" } };
    assert.deepEqual(module.healthHeaders(connection), { "x-anyrun-network-token": "net", authorization: "Bearer gw-token" });
    assert.deepEqual(module.healthHeaders({ baseUrl: gateway.url, headers: { a: "1" } }), { a: "1" }, "no token, the headers as they are");

    let now = 0;
    const timing = { clock: { monotonicNow: () => now }, healthProbeDeadline: { run: (fn) => fn(new AbortController().signal) } };
    let resolves = 0;
    const supervisor = new module.SandHostSupervisor({
      timing,
      resolveGatewayConnection: async () => { resolves += 1; return connection; },
      isTransportLive: () => false,
    });
    await supervisor.ensureConnection();
    assert.equal(resolves, 1, "the first call connects");
    // Past the five-second cache, with the event stream down: a probe.
    now += 10_000;
    const again = await supervisor.ensureConnection();
    assert.equal(again, connection);
    assert.equal(resolves, 1, "a healthy box is not connected to again");
    const probe = gateway.seen.find((request) => request.path === "/health");
    assert.equal(probe.authorization, "Bearer gw-token");
    assert.equal(probe.network, "net");
  } finally {
    await gateway.close();
    await dispose();
  }
});
