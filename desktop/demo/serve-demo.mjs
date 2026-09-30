#!/usr/bin/env node
/**
 * `npm run demo`: builds the app-window demo from the patched renderer that
 * `npm run package` staged, serves it on 127.0.0.1 only, and opens it in the
 * browser. The window is still the upstream pinned renderer, so this stays a
 * private preview on your own machine: nothing here publishes anything.
 */
import { execFileSync, spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const candidates = [
  process.env.SIMEON_DEMO_RENDERER,
  path.join(root, ".build/fidelity/app/dist/renderer"),
  path.join(root, ".build/app/dist/renderer"),
].filter(Boolean);
const isPatched = (dir) => {
  try {
    const assets = path.join(dir, "assets");
    return existsSync(path.join(dir, "index.html"))
      && readFileSync(path.join(dir, "index.html"), "utf8").includes("assets/")
      && readdirSync(assets).some((name) => name.endsWith(".css")
        && readFileSync(path.join(assets, name), "utf8").includes("Simeon: the person's bubble"));
  } catch { return false; }
};
const renderer = candidates.find(isPatched);
if (renderer == null) {
  console.error("No patched Simeon window found. Run `npm run package` first (it stages .build/fidelity/app/dist/renderer).");
  process.exit(1);
}

const outDir = path.join(root, "dist/demo");
execFileSync(process.execPath, [path.join(root, "demo/build-demo.mjs"), renderer, outDir], { stdio: "inherit" });

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".woff": "font/woff", ".json": "application/json", ".wasm": "application/wasm", ".mp4": "video/mp4", ".webm": "video/webm" };
const port = Number(process.env.SIMEON_DEMO_PORT ?? 4173);
createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
  const file = path.join(outDir, pathname === "/" ? "index.html" : pathname);
  if (!file.startsWith(outDir)) { response.writeHead(403).end(); return; }
  try {
    const body = await readFile(file);
    response.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" }).end(body);
  } catch {
    response.writeHead(404).end();
  }
}).listen(port, "127.0.0.1", () => {
  const url = `http://127.0.0.1:${port}/`;
  console.log(`Simeon demo: ${url}  (Ctrl+C to stop)`);
  if (process.platform === "darwin" && process.env.SIMEON_DEMO_NO_OPEN !== "1") spawn("open", [url], { stdio: "ignore", detached: true }).unref();
});
