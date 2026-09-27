#!/usr/bin/env node
/**
 * Builds the app-window demo: copies the patched renderer from dist/renderer
 * (what `npm run package` ships) into dist/demo, bundles ./bridge.ts in front
 * of it, and allows that one script in the page's CSP.
 *
 *   node demo/build-demo.mjs [rendererDir] [outDir]
 */
import { build } from "esbuild";
import { cp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rendererDir = path.resolve(process.argv[2] ?? path.join(root, "dist/renderer"));
const outDir = path.resolve(process.argv[3] ?? path.join(root, "dist/demo"));

await rm(outDir, { recursive: true, force: true });
await cp(rendererDir, outDir, { recursive: true });
await build({
  entryPoints: [path.join(root, "demo/bridge.ts")],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2022",
  outfile: path.join(outDir, "demo-bridge.js"),
  define: { "process.platform": '"darwin"', "process.env": "{}" },
  logLevel: "warning",
});
const indexPath = path.join(outDir, "index.html");
const index = await readFile(indexPath, "utf8");
const marker = '<script type="module"';
if (!index.includes(marker)) throw new Error("renderer index.html has no module script to put the bridge before");
await writeFile(indexPath, index.replace(marker, `<script src="./demo-bridge.js"></script>\n    ${marker}`));
console.log(`demo built in ${path.relative(process.cwd(), outDir) || outDir}`);
