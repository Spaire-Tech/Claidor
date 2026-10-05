#!/usr/bin/env node
/**
 * The window router on 1339: one door for every exec daemon in the box.
 *
 *   simeon-window-router.mjs [listenPort=1339] [primaryPort=1337] [forkBase=14000]
 *
 * A request without x-sand-display, or with 1, goes to the primary exec
 * daemon. One with x-sand-display: N (N >= 2) goes to the fork window's
 * daemon on forkBase+N, and only when x-sand-window-owner matches the token
 * start-window wrote in /tmp/sand-window-tokens.d/N; otherwise 403. A
 * daemon that does not answer is a 502. The host (loopback-sand-box.ts)
 * dials this port with those two headers; the request itself, bearer and
 * all, passes through unchanged.
 */
import { timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import http from "node:http";

const listenPort = Number.parseInt(process.argv[2] ?? "1339", 10) || 1339;
const primaryPort = Number.parseInt(process.argv[3] ?? "1337", 10) || 1337;
const forkBase = Number.parseInt(process.argv[4] ?? "14000", 10) || 14000;
const TOKEN_DIR = "/tmp/sand-window-tokens.d";

function sameToken(offered, expected) {
  if (typeof offered !== "string" || offered.length === 0 || expected.length === 0) return false;
  const a = Buffer.from(offered);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function route(request) {
  const raw = request.headers["x-sand-display"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const display = Number.parseInt(value ?? "1", 10);
  if (!Number.isInteger(display) || display <= 1) return { port: primaryPort, display: 1 };
  let bound = "";
  try { bound = readFileSync(`${TOKEN_DIR}/${display}`, "utf8").trim(); } catch {}
  const owner = request.headers["x-sand-window-owner"];
  if (!sameToken(Array.isArray(owner) ? owner[0] : owner, bound)) return { forbidden: true, display };
  return { port: forkBase + display, display };
}

const server = http.createServer((request, response) => {
  const target = route(request);
  if (target.forbidden) {
    response.writeHead(403, { "content-type": "text/plain" });
    response.end(`sand-window-router: forbidden (display :${target.display} owner-token mismatch)`);
    return;
  }
  const upstream = http.request({ host: "127.0.0.1", port: target.port, method: request.method, path: request.url, headers: request.headers }, reply => {
    response.writeHead(reply.statusCode ?? 502, reply.headers);
    reply.pipe(response);
  });
  upstream.on("error", error => {
    if (response.headersSent) { response.destroy(); return; }
    response.writeHead(502, { "content-type": "text/plain" });
    response.end(`sand-window-router upstream error: ${error.message}`);
  });
  request.pipe(upstream);
});
server.timeout = 0;
server.keepAliveTimeout = 0;
server.listen(listenPort, "0.0.0.0", () => {
  process.stdout.write(`simeon-window-router listening pid=${process.pid} port=${listenPort} primary=${primaryPort} fork_base=${forkBase} (owner-token enforced)\n`);
});
