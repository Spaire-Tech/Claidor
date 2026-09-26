/**
 * The box desktop's stream behind Grok Bot's network token (ledger F-135,
 * 26 September 2026).
 *
 * Offline, against a fake websockify: the guard refuses a page or a
 * WebSocket without the token, passes one with it (header or query) and
 * strips the header before websockify; the starter retries a busy port and
 * never fails the host; the local connection hands the app Grok Bot's
 * `vncProxy`, and the coordinator's own rewrite turns the box's bare
 * stream URLs into token-carrying ones; the container publishes the guard,
 * not websockify.
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TOKEN = "a".repeat(64);

async function load() {
  const temporary = await mkdtemp(path.join(repoRoot, ".tmp-box-stream-guard-"));
  const outfile = path.join(temporary, "entry.mjs");
  await build({ entryPoints: [path.join(repoRoot, "tests/fixtures/box-stream-guard-entry.ts")], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, temporary, dispose: () => rm(temporary, { recursive: true, force: true }) };
}

async function fakeWebsockify() {
  const seen = [];
  const server = http.createServer((request, response) => {
    seen.push({ url: request.url, headers: request.headers });
    response.writeHead(200, { "content-type": "text/html" });
    response.end("<title>noVNC</title>");
  });
  const sockets = new Set();
  server.on("upgrade", (request, socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    seen.push({ url: request.url, headers: request.headers, upgrade: true });
    socket.write("HTTP/1.1 101 Switching Protocols\r\nupgrade: websocket\r\nconnection: Upgrade\r\n\r\n");
    socket.on("data", (chunk) => socket.write(chunk));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { port: server.address().port, seen, close: () => new Promise((resolve) => { for (const socket of sockets) socket.destroy(); server.closeAllConnections(); server.close(resolve); }) };
}

function get(port, pathname, headers = {}) {
  return new Promise((resolve, reject) => {
    const request = http.get({ host: "127.0.0.1", port, path: pathname, headers }, (response) => {
      let body = "";
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => resolve({ status: response.statusCode, body }));
    });
    request.on("error", reject);
  });
}

function upgrade(port, pathname) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, "127.0.0.1", () => {
      socket.write(`GET ${pathname} HTTP/1.1\r\nhost: 127.0.0.1\r\nupgrade: websocket\r\nconnection: Upgrade\r\nsec-websocket-key: dGhlIHNhbXBsZSBub25jZQ==\r\nsec-websocket-version: 13\r\n\r\n`);
    });
    let received = "";
    let echoed = false;
    socket.on("data", (chunk) => {
      received += chunk.toString();
      if (!echoed && received.startsWith("HTTP/1.1 101")) { echoed = true; socket.write("ping-from-novnc"); return; }
      if (received.includes("ping-from-novnc") || received.startsWith("HTTP/1.1 401")) { socket.destroy(); resolve(received); }
    });
    socket.on("error", reject);
    socket.on("close", () => resolve(received));
  });
}

test("the guard refuses the page and the socket without the token and passes them with it", async () => {
  const loaded = await load();
  const upstream = await fakeWebsockify();
  const lines = [];
  const guard = await loaded.module.startBoxStreamGuard({ token: TOKEN, routes: [{ listenPort: 0, targetPort: upstream.port }], bindHost: "127.0.0.1", log: (line) => lines.push(line) });
  try {
    const port = guard.ports[0];
    assert.equal((await get(port, "/vnc.html")).status, 401, "a drive-by page gets nothing");
    assert.equal((await get(port, "/vnc.html", { "x-anyrun-network-token": "b".repeat(64) })).status, 401, "a wrong token gets nothing");
    const withHeader = await get(port, "/app/ui.js", { "x-anyrun-network-token": TOKEN });
    assert.equal(withHeader.status, 200);
    assert.equal(upstream.seen.at(-1).headers["x-anyrun-network-token"], undefined, "the token does not travel on to websockify");
    const withQuery = await get(port, `/vnc.html?network_token=${TOKEN}&autoconnect=true`);
    assert.equal(withQuery.status, 200);
    assert.match(withQuery.body, /noVNC/);
    const refusedSocket = await upgrade(port, "/websockify");
    assert.match(refusedSocket, /^HTTP\/1\.1 401/, "the WebSocket a drive-by page opens is refused");
    const socket = await upgrade(port, `/websockify?token=3&network_token=${TOKEN}`);
    assert.match(socket, /^HTTP\/1\.1 101/);
    assert.match(socket, /ping-from-novnc/, "frames pass both ways once the token matched");
    const forwarded = upstream.seen.find((entry) => entry.upgrade);
    assert.equal(forwarded.url, `/websockify?token=3&network_token=${TOKEN}`, "websockify's own display token is left as it was");
    assert.ok(lines.some((line) => line.includes("box-stream guarded")));
    assert.ok(lines.some((line) => line.includes("box-stream refused")));
  } finally {
    await guard.close();
    await upstream.close();
    await loaded.dispose();
  }
});

test("a port that will not bind leaves no other listener open", async () => {
  const loaded = await load();
  const blocker = net.createServer();
  await new Promise((resolve) => blocker.listen(0, "127.0.0.1", resolve));
  const busy = blocker.address().port;
  const free = net.createServer();
  await new Promise((resolve) => free.listen(0, "127.0.0.1", resolve));
  const firstPort = free.address().port;
  await new Promise((resolve) => free.close(resolve));
  try {
    await assert.rejects(loaded.module.startBoxStreamGuard({ token: TOKEN, routes: [{ listenPort: firstPort, targetPort: 1 }, { listenPort: busy, targetPort: 1 }], bindHost: "127.0.0.1" }), /EADDRINUSE/);
    const again = net.createServer();
    await new Promise((resolve, reject) => { again.once("error", reject); again.listen(firstPort, "127.0.0.1", resolve); });
    await new Promise((resolve) => again.close(resolve));
  } finally {
    await new Promise((resolve) => blocker.close(resolve));
    await loaded.dispose();
  }
});

test("the starter reads the token file, retries a busy port, and never fails the host", async () => {
  const loaded = await load();
  const { startBoxStreamGuardFromEnv, readBoxStreamNetworkToken } = loaded.module;
  try {
    assert.equal(await startBoxStreamGuardFromEnv({ env: {}, log: () => {} }), undefined, "no token file: no guard, nothing thrown");
    const file = path.join(loaded.temporary, "box-stream-token");
    await writeFile(file, "short\n");
    assert.equal(readBoxStreamNetworkToken({ SAND_BOX_STREAM_TOKEN_FILE: file }), undefined, "a token under 32 characters is refused");
    await writeFile(file, `${TOKEN}\n`);
    assert.equal(readBoxStreamNetworkToken({ SAND_BOX_STREAM_TOKEN_FILE: file }), TOKEN);
    let calls = 0;
    const started = await startBoxStreamGuardFromEnv({ env: { SAND_BOX_STREAM_TOKEN_FILE: file }, log: () => {}, retryDelayMs: 1, start: async (options) => { calls += 1; assert.equal(options.token, TOKEN); if (calls < 3) throw new Error("EADDRINUSE"); return { ports: [16080], close: async () => {} }; } });
    assert.equal(calls, 3);
    assert.deepEqual(started.ports, [16080]);
    const lines = [];
    const gaveUp = await startBoxStreamGuardFromEnv({ env: { SAND_BOX_STREAM_TOKEN_FILE: file }, log: (line) => lines.push(line), retryDelayMs: 1, maxAttempts: 2, start: async () => { throw new Error("EADDRINUSE"); } });
    assert.equal(gaveUp, undefined);
    assert.match(lines.at(-1), /box-stream guard could not start \(EADDRINUSE\)/);
  } finally {
    await loaded.dispose();
  }
});

test("the local connection carries Grok Bot's vncProxy and the coordinator rewrites the box's bare URLs through it", async () => {
  const loaded = await load();
  const { localDockerVncProxy, proxifyBoxVncUrl, proxifyForeverBoxStatus, readOrCreateStreamToken, streamTokenFingerprint, localDockerContainerNeedsReplace, LOCAL_DOCKER_SCHEMA_VERSION, LOCAL_DOCKER_STREAM_PUBLISH, PERSISTED_GATEWAY_DESCRIPTOR_VERSION } = loaded.module;
  try {
    const proxy = localDockerVncProxy(TOKEN);
    assert.equal(proxy.forkBaseUrl, "http://127.0.0.1:6081");
    const primary = new URL(proxy.primaryUrl);
    assert.equal(primary.origin, "http://127.0.0.1:6080");
    assert.equal(primary.pathname, "/vnc.html");
    assert.equal(primary.searchParams.get("network_token"), TOKEN);
    assert.match(primary.searchParams.get("path"), new RegExp(`^websockify\\?network_token=${TOKEN}&`));
    // The URL the host inside the box reports, rewritten by Grok Bot's own coordinator code.
    assert.equal(proxifyBoxVncUrl("http://127.0.0.1:6080/vnc.html", proxy), proxy.primaryUrl);
    const fork = new URL(proxifyBoxVncUrl(`http://127.0.0.1:6081/vnc.html?path=${encodeURIComponent("websockify?token=3")}`, proxy));
    assert.equal(fork.origin, "http://127.0.0.1:6081");
    assert.match(fork.searchParams.get("path"), new RegExp(`^websockify\\?token=3&network_token=${TOKEN}&`));
    const status = proxifyForeverBoxStatus({ vncUrl: "http://127.0.0.1:6080/vnc.html", windows: [{ vncUrl: `http://127.0.0.1:6081/vnc.html?path=${encodeURIComponent("websockify?token=2")}` }] }, proxy);
    assert.equal(status.vncUrl, proxy.primaryUrl);
    assert.match(status.windows[0].vncUrl, /network_token/);
    // The token is one per install, 0600, stable, and a container made with another is replaced.
    const settingsPath = path.join(loaded.temporary, "data", "settings.json");
    const first = await readOrCreateStreamToken(settingsPath);
    assert.match(first, /^[0-9a-f]{64}$/);
    assert.equal(await readOrCreateStreamToken(settingsPath), first);
    const mode = (await stat(path.join(loaded.temporary, "data", "local-docker-credential", "box-stream-token"))).mode & 0o777;
    assert.equal(mode, 0o600);
    const fingerprint = streamTokenFingerprint(first);
    assert.equal(localDockerContainerNeedsReplace({ schemaVersion: LOCAL_DOCKER_SCHEMA_VERSION, hostSha256: "h", streamTokenSha256: fingerprint }, "h", fingerprint), false);
    assert.equal(localDockerContainerNeedsReplace({ schemaVersion: LOCAL_DOCKER_SCHEMA_VERSION, hostSha256: "h", streamTokenSha256: "other" }, "h", fingerprint), true);
    assert.deepEqual([...LOCAL_DOCKER_STREAM_PUBLISH], ["127.0.0.1:6080:16080", "127.0.0.1:6081:16081"]);
    assert.equal(PERSISTED_GATEWAY_DESCRIPTOR_VERSION, 2, "a cached connection from before has no vncProxy and is read as absent once");
    const connector = await readFile(path.join(repoRoot, "source/electron-main/box/local-docker-host-connector.ts"), "utf8");
    assert.doesNotMatch(connector, /"--publish", "127\.0\.0\.1:6080:6080"/, "websockify is never published bare");
    assert.match(connector, /return \{ baseUrl: LOCAL_DOCKER_GATEWAY_URL, token, vncProxy: localDockerVncProxy\(streamToken\) \};/);
    assert.match(connector, /"--env", `SAND_BOX_STREAM_TOKEN_FILE=\$\{LOCAL_DOCKER_STREAM_TOKEN_FILE\}`/);
    assert.doesNotMatch(connector, /SAND_BOX_STREAM_NETWORK_TOKEN=/, "the stream token is never an env var");
    const main = await readFile(path.join(repoRoot, "source/host/main.ts"), "utf8");
    assert.match(main, /void startBoxStreamGuardFromEnv\(\{ log: line => log\.log\(line\) \}\);/);
  } finally {
    await loaded.dispose();
  }
});
