/**
 * Where the pinned 0.18.0 renderer is on this machine, for the tests that
 * read its real bytes (marks, palette, bubble and style anchors).
 *
 * The bytes are not in the repository: `npm run bootstrap` hydrates them
 * into `src/app/dist/renderer` (`scripts/preflight-bootstrap.mjs` names
 * that path as the payload every build reads). Until 26 September 2026 the
 * tests looked only at `GROK_BOT_PINNED_RENDERER`, which nothing in the
 * build loop sets, so they skipped on every Mac that had just bootstrapped
 * (ledger F-451) and a stale anchor was caught only at package time. Now
 * the variable still wins when set, and bootstrap's own path is the
 * default; the tests skip only when neither holds a renderer.
 */
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const BOOTSTRAPPED_RENDERER = path.join(repoRoot, "src", "app", "dist", "renderer");

export function resolvePinnedRenderer(env = process.env) {
  const configured = env.GROK_BOT_PINNED_RENDERER?.trim();
  if (configured) return configured;
  return existsSync(path.join(BOOTSTRAPPED_RENDERER, "index.html")) ? BOOTSTRAPPED_RENDERER : undefined;
}

export const PINNED_RENDERER_SKIP = "no pinned renderer: set GROK_BOT_PINNED_RENDERER or run npm run bootstrap";

/** The pinned renderer's main chunk and stylesheet, read from `assets/`. */
export async function readPinnedRendererAssets(pinned) {
  const assets = path.join(pinned, "assets");
  const names = await readdir(assets);
  const chunkName = names.find((name) => name === "index-UbX-y3il.js") ?? names.find((name) => /^index-.*\.js$/.test(name));
  const chunk = await readFile(path.join(assets, chunkName), "utf8");
  const chunkNames = names.filter((name) => name.endsWith(".js"));
  const chunks = await Promise.all(chunkNames.map((name) => readFile(path.join(assets, name), "utf8")));
  const cssName = names.find((name) => name.endsWith(".css"));
  const css = cssName === undefined ? "" : await readFile(path.join(assets, cssName), "utf8");
  return { assets, chunkName, chunk, chunks, cssName, css };
}
