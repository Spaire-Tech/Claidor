/**
 * Caisra clean build.
 *
 * Builds the five processes straight from source with no dependency on any
 * shipped upstream binary. The reconstruction's own pipeline
 * (scripts/build.mjs -> buildFidelityReconstructedAsar) deliberately starts
 * from the extracted 0.18.0 app and overlays reconstructed pieces onto it,
 * because its goal was byte-fidelity with that release. That is not our goal
 * and not our right, so this script does not use it, does not read
 * research-archives/, and never calls bootstrap-runtime.mjs.
 *
 *   source/host/main.ts             -> dist/caisra/host-main.cjs
 *   source/electron-main/main.ts    -> dist/caisra/main.cjs
 *   source/electron-preload/*.ts    -> dist/caisra/preload.cjs
 *   source/box-exec-daemon/cli.ts   -> dist/caisra/box-exec-daemon.cjs
 *   source/local-exec-daemon/*.ts   -> dist/caisra/local-exec-daemon.cjs
 *   frontend/src/main.tsx           -> dist/caisra/renderer/
 */

import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import react from "@vitejs/plugin-react";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outRoot = path.join(repoRoot, "dist", "caisra");

/**
 * Left unbundled. Native addons and their loaders cannot be inlined, and
 * electron is supplied by the runtime.
 */
const EXTERNAL = [
  "electron",
  "tree-sitter",
  "tree-sitter-bash",
  "web-tree-sitter",
  "node-gyp-build",
  "node-addon-api",
  "piscina",
  "pdfjs-dist",
];

const PROCESSES = [
  { name: "host", entry: "source/host/main.ts", outfile: "host-main.cjs" },
  { name: "electron-main", entry: "source/electron-main/main.ts", outfile: "main.cjs" },
  { name: "preload", entry: "source/electron-preload/preload.ts", outfile: "preload.cjs" },
  { name: "box-exec-daemon", entry: "source/box-exec-daemon/cli.ts", outfile: "box-exec-daemon.cjs" },
  { name: "local-exec-daemon", entry: "source/local-exec-daemon/main.ts", outfile: "local-exec-daemon.cjs" },
];

async function bundleProcess({ name, entry, outfile }) {
  const started = Date.now();
  const result = await esbuild({
    entryPoints: [path.join(repoRoot, entry)],
    bundle: true,
    platform: "node",
    target: "node26",
    format: "cjs",
    outfile: path.join(outRoot, outfile),
    external: EXTERNAL,
    sourcemap: "linked",
    logLevel: "error",
    metafile: true,
    define: { "process.env.CAISRA_BUILD": JSON.stringify("clean-source") },
  });
  const bytes = Object.entries(result.metafile.outputs)
    .filter(([file]) => !file.endsWith(".map"))
    .reduce((sum, [, o]) => sum + o.bytes, 0);
  return { name, outfile, bytes, ms: Date.now() - started };
}

async function buildRenderer() {
  const started = Date.now();
  await viteBuild({
    root: path.join(repoRoot, "frontend"),
    configFile: false,
    plugins: [react()],
    // Electron loads the renderer over file://, so every emitted asset
    // reference has to stay relative to index.html.
    base: "./",
    build: {
      outDir: path.join(outRoot, "renderer"),
      emptyOutDir: true,
      sourcemap: true,
    },
    logLevel: "error",
  });
  return { name: "renderer", outfile: "renderer/", ms: Date.now() - started };
}

async function main() {
  await rm(outRoot, { recursive: true, force: true });
  await mkdir(outRoot, { recursive: true });

  const processResults = [];
  for (const proc of PROCESSES) {
    processResults.push(await bundleProcess(proc));
  }
  const rendererResult = await buildRenderer();

  await writeFile(
    path.join(outRoot, "build.json"),
    `${JSON.stringify(
      {
        product: "Caisra",
        mode: "clean-source",
        upstreamBinaryUsed: false,
        builtAt: new Date().toISOString(),
        processes: processResults,
        renderer: rendererResult,
      },
      null,
      2,
    )}\n`,
  );

  for (const r of [...processResults, rendererResult]) {
    const size = r.bytes == null ? "" : `${(r.bytes / 1_048_576).toFixed(1)} MB`.padStart(9);
    console.log(`  ${r.name.padEnd(18)} ${r.outfile.padEnd(24)} ${size}  ${r.ms}ms`);
  }
  console.log(`\nCaisra clean build -> ${path.relative(repoRoot, outRoot)} (no upstream binary)`);
}

await main();
