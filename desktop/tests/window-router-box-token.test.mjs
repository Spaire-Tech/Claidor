/**
 * The computer's window router (box/bin/simeon-window-router.mjs) on a
 * computer whose agents run on the brain (SIMEON_ENGINE_ROLE=hands,
 * docs/agents-on-the-server/README.md, step 1b): every call must carry the
 * computer's own gateway token in x-simeon-box-token, which is taken off
 * before the call goes on. In any other role nothing changes.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ROUTER = path.join(repoRoot, "box/bin/simeon-window-router.mjs");

async function listen(server) {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return server.address().port;
}

async function freePort() {
  const server = http.createServer();
  const port = await listen(server);
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function withRouter(env, run) {
  const seen = [];
  const hands = http.createServer((request, response) => {
    seen.push({ path: request.url, headers: request.headers });
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("hands");
  });
  const handsPort = await listen(hands);
  const routerPort = await freePort();
  const child = spawn(process.execPath, [ROUTER, String(routerPort), String(handsPort), "14000"], { env: { PATH: process.env.PATH, ...env }, stdio: ["ignore", "pipe", "pipe"] });
  let banner = "";
  await new Promise((resolve, reject) => {
    child.stdout.on("data", (chunk) => { banner += chunk; if (banner.includes("listening")) resolve(); });
    child.on("exit", (code) => reject(new Error(`router exited ${code}`)));
  });
  const call = (headers) => new Promise((resolve, reject) => {
    const request = http.request({ host: "127.0.0.1", port: routerPort, path: "/agent.v1.ControlService/Ping", method: "POST", headers }, (response) => {
      let body = "";
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => resolve({ status: response.statusCode, body }));
    });
    request.on("error", reject);
    request.end();
  });
  try {
    await run({ call, seen, banner });
  } finally {
    child.kill();
    await new Promise((resolve) => hands.close(resolve));
  }
}

test("on a computer whose agents run on the brain, a call needs the computer's own token", async () => {
  await withRouter({ SIMEON_ENGINE_ROLE: "hands", SAND_GATEWAY_TOKEN: "box-secret" }, async ({ call, seen, banner }) => {
    assert.match(banner, /box token required: agents on the brain/);
    assert.deepEqual(await call({ authorization: "Bearer local" }), { status: 401, body: "sand-window-router: box token refused" });
    assert.equal((await call({ authorization: "Bearer local", "x-simeon-box-token": "wrong" })).status, 401);
    assert.equal(seen.length, 0, "nothing reached the hands program");
    assert.deepEqual(await call({ authorization: "Bearer local", "x-simeon-box-token": "box-secret" }), { status: 200, body: "hands" });
    assert.equal(seen.length, 1);
    assert.equal(seen[0].headers["x-simeon-box-token"], undefined, "the token is taken off before the call goes on");
    assert.equal(seen[0].headers.authorization, "Bearer local", "the hands program's own bearer passes unchanged");
  });
});

test("a computer in the hands role without a token of its own refuses every call", async () => {
  await withRouter({ SIMEON_ENGINE_ROLE: "hands" }, async ({ call, seen }) => {
    assert.equal((await call({ "x-simeon-box-token": "" })).status, 401);
    assert.equal(seen.length, 0);
  });
});

test("in any other role nothing changes: the engine inside the computer dials the router itself", async () => {
  await withRouter({ SAND_GATEWAY_TOKEN: "box-secret" }, async ({ call, seen, banner }) => {
    assert.doesNotMatch(banner, /box token required/);
    assert.deepEqual(await call({ authorization: "Bearer local" }), { status: 200, body: "hands" });
    assert.equal(seen.length, 1);
  });
});
