#!/usr/bin/env node
/**
 * Builds Simeon on the web: the patched window (the same renderer the Mac
 * app ships, as the website already hosts it) with ./bridge.ts in front of
 * it, served by the web app at app.simeonlabs.com/app.
 *
 *   node web/build-web.mjs [--renderer <dir>] [--out <dir>]
 *
 * rendererDir defaults to the renderer under sites/simeonlabs.com/public/app
 * (one folder, named after its content); outDir to
 * clients/apps/web/public/app. The bridge is bundled for the browser with
 * `node:crypto` shimmed (the gateway client's one Node import) and the
 * app's version stamped in for the broker's client-version header.
 */
import { build } from "esbuild";
import { cp, readFile, readdir, rm, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repo = path.resolve(root, "..");

async function defaultRenderer() {
  const hosted = path.join(repo, "sites/simeonlabs.com/public/app");
  const folders = (await readdir(hosted, { withFileTypes: true })).filter((entry) => entry.isDirectory() && entry.name !== "assets").map((entry) => entry.name);
  if (folders.length !== 1) throw new Error(`expected one renderer folder under ${hosted}, found ${folders.join(", ") || "none"}`);
  return path.join(hosted, folders[0]);
}

const argv = process.argv.slice(2);
const flag = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const positional = argv.filter((a, i) => !a.startsWith("--") && !argv[i - 1]?.startsWith("--"));
const rendererDir = path.resolve(flag("--renderer") ?? positional[0] ?? await defaultRenderer());
const outDir = path.resolve(flag("--out") ?? positional[1] ?? path.join(repo, "clients/apps/web/public/app"));
const version = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")).version;

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
await cp(path.join(rendererDir, "assets"), path.join(outDir, "assets"), { recursive: true });
await build({
  entryPoints: [path.join(root, "web/bridge.ts")],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2022",
  outfile: path.join(outDir, "web-bridge.js"),
  define: { "process.platform": '"darwin"', "process.env": "{}", __SIMEON_WEB_VERSION__: JSON.stringify(version) },
  alias: { "node:crypto": path.join(root, "web/shims/node-crypto.ts") },
  logLevel: "warning",
});

const index = await readFile(path.join(rendererDir, "index.html"), "utf8");
// The renderer's own policy, opened to Simeon Labs' server: the API, the box
// through its proxy (same host), and a developer's API on loopback.
const api = "https://api.simeonlabs.com http://127.0.0.1:8000 http://localhost:8000";
const csp = `default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; worker-src 'self' blob:; font-src 'self' data:; img-src 'self' data: blob: https: ${api}; media-src 'self' blob: ${api}; connect-src 'self' blob: ${api} wss://api.simeonlabs.com ws://127.0.0.1:8000; frame-src 'self' ${api}; base-uri 'self';`;
let page = index
  .replace(/<meta\s+http-equiv="Content-Security-Policy"\s+content="[^"]*"\s*\/>/s, `<meta http-equiv="Content-Security-Policy" content="${csp}" />`)
  .replace(/<title>[^<]*<\/title>/, "<title>Simeon</title>")
  // The website's demo scripts and its stand-in desktop are not for this page.
  .replace(/\s*<style>body::before[^<]*<\/style>/, "")
  .replace(/\s*<script src="\.\/scroll-guard\.js"><\/script>/, "")
  .replace(/\s*<script src="\.\/demo-bridge\.js"><\/script>/, "")
  .replace(/\s*<script src="\.\/demo-gate\.js"><\/script>/, "");
const marker = '<script type="module"';
if (!page.includes(marker)) throw new Error("renderer index.html has no module script to put the bridge before");
// A browser has no desktop behind the window: a plain light ground, and the
// sidebar's material drawn flat, as the website's demo does.
const ground = `<style>html,body{height:100%;margin:0;background:#f5f5f7}body::before{content:"";position:fixed;inset:0;z-index:-1;background:linear-gradient(160deg,#e9e9ee,#d9d9df)}html body .sand-agents-sidebar{background-color:var(--cursor-bg-chrome)!important;-webkit-backdrop-filter:none!important;backdrop-filter:none!important}</style>\n    `;
page = page.replace(marker, `${ground}<script src="/app/web-bridge.js"></script>\n    ${marker}`);
// The page is served at /app, with no trailing slash, so its references
// are absolute: `./assets/…` would resolve to the site's root.
page = page.replace(/(src|href)="\.\/assets\//g, '$1="/app/assets/');
await writeFile(path.join(outDir, "index.html"), page);

// Where a connected app's sign-in lands (`/desktop/mcp-oauth/callback` on
// the server sends the person here): the bridge alone, which hands the box
// the code and says to come back (`bridge.ts`, `finishConnectedAppSignIn`).
const connected = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <title>Simeon</title>
    <style>
      :root{color-scheme:light dark}
      body{margin:0;min-height:100vh;display:grid;place-items:center;font:16px/1.5 -apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,sans-serif;background:#f5f5f7;color:#1d1d1f}
      .card{background:#fff;border-radius:18px;padding:36px 40px;text-align:center;max-width:360px;box-shadow:0 0 0 .5px rgba(20,30,60,.08),0 1px 2px rgba(20,30,60,.05)}
      h1{font-size:20px;font-weight:600;margin:0 0 6px}p{margin:0;opacity:.7}
      @media (prefers-color-scheme:dark){body{background:#1c1c1e;color:#f5f5f7}.card{background:#2c2c2e}}
    </style>
  </head>
  <body>
    <div class="card"><h1 id="title">Connecting…</h1><p id="body">One moment.</p></div>
    <script src="/app/web-bridge.js"></script>
  </body>
</html>
`;
await writeFile(path.join(outDir, "connected.html"), connected);
console.log(`Simeon on the web built in ${path.relative(process.cwd(), outDir) || outDir} from ${path.relative(process.cwd(), rendererDir)}`);
