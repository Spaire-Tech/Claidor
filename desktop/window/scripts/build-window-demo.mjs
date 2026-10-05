#!/usr/bin/env node
/**
 * Builds Simeon's own window and puts the demo's fake bridge in front of
 * it, so the window runs in a browser with no app, no cloud and no account
 * (the same bridge and scripted backend the pinned window's demo uses):
 *
 *   node window/scripts/build-window-demo.mjs          → dist/window-demo
 *   node window/scripts/build-window-demo.mjs --serve  → … and serve it on 127.0.0.1:4174
 *
 * `?onboarding` opens it as a new account (the sign-in screen first);
 * `?theme=dark` forces dark.
 */
import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const built = path.join(root, ".build/window");
const outDir = path.join(root, "dist/window-demo");

execFileSync(process.execPath, [path.join(root, "node_modules/vite/bin/vite.js"), "build", "--config", path.join(root, "window/vite.config.ts"), "--logLevel", "warn"], { stdio: "inherit", cwd: root });
execFileSync(process.execPath, [path.join(root, "demo/build-demo.mjs"), built, outDir], { stdio: "inherit", cwd: root });

if (process.argv.includes("--serve")) {
  const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".json": "application/json", ".map": "application/json" };
  const port = Number(process.env.SIMEON_WINDOW_DEMO_PORT ?? 4174);
  createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const file = path.join(outDir, url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname));
    if (!file.startsWith(outDir)) { response.writeHead(403).end(); return; }
    try {
      const body = readFileSync(file);
      response.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  }).listen(port, "127.0.0.1", () => {
    const url = `http://127.0.0.1:${port}/`;
    console.log(`Simeon window demo: ${url}  (Ctrl+C to stop)`);
    if (process.platform === "darwin" && process.env.SIMEON_DEMO_NO_OPEN !== "1") spawn("open", [url], { stdio: "ignore", detached: true }).unref();
  });
} else {
  console.log(`window demo built in ${path.relative(process.cwd(), outDir) || outDir}`);
}
