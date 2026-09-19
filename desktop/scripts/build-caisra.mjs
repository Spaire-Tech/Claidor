/**
 * Caisra clean build.
 *
 * Builds every process straight from source with no dependency on any shipped
 * upstream binary. The reconstruction's own pipeline (scripts/build.mjs ->
 * buildFidelityReconstructedAsar) deliberately starts from the extracted
 * 0.18.0 app and overlays reconstructed pieces onto it, because its goal was
 * byte-fidelity with that release. That is not our goal and not our right, so
 * this script does not use it, does not read research-archives/, and never
 * calls bootstrap-runtime.mjs.
 *
 * The output layout is NOT arbitrary. The app resolves these paths itself at
 * runtime — see `executableReplacements` in scripts/lib/clean-build.mjs and
 * PRODUCTION_IPC_CONTRACT in source/electron-main/production-ipc-contract.ts,
 * which names dist/electron-preload/preload.cjs and dist/renderer/index.html
 * directly. Renaming or flattening any of it silently breaks the app at
 * launch rather than at build time.
 */

import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import react from "@vitejs/plugin-react";

import { electronMainEntrySource, hostEntrySource } from "./lib/caisra-entries.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outRoot = path.join(repoRoot, "dist");

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

/** Entry -> output path, matching what the app expects to find. */
const PROCESSES = [
  ["source/electron-dev-controls/main.ts", "electron-dev-controls/main.cjs"],

  ["source/electron-preload/preload.ts", "electron-preload/preload.cjs"],
  ["source/electron-preload/preload-dev-controls.ts", "electron-preload/preload-dev-controls.cjs"],
  ["source/electron-preload/preload-webview.ts", "electron-preload/preload-webview.cjs"],
  ["source/electron-preload/preload-vnc.ts", "electron-preload/preload-vnc.cjs"],

  ["source/host/agent-isolation/agent-store-worker.ts", "host/agent-isolation/agent-store-worker.cjs"],
  ["source/host/agent-isolation/transcript-mirror-worker.ts", "host/agent-isolation/transcript-mirror-worker.cjs"],
  ["source/host/extensions/box-store-sync/box-store-vacuum-worker.ts", "host/extensions/box-store-sync/box-store-vacuum-worker.cjs"],
  ["source/host/extensions/content-search/search-index-worker.ts", "host/extensions/content-search/search-index-worker.cjs"],

  ["source/node-agent-coordinator/main.ts", "node-agent-coordinator/main.cjs"],
  ["source/box-exec-daemon/main.ts", "box-exec-daemon/main.cjs"],
  ["source/local-exec-daemon/main.ts", "local-exec-daemon/main.cjs"],
];

/**
 * `entry` is either a path under source/, or {contents} for the two generated
 * ignition entries — electron-main and host both export a start function and
 * neither calls it, so the entry that calls it has to be generated. See
 * scripts/lib/caisra-entries.mjs.
 */
async function bundleProcess([entry, outfile]) {
  const started = Date.now();
  const input = typeof entry === "string"
    ? { entryPoints: [path.join(repoRoot, entry)] }
    : { stdin: { contents: entry.contents, loader: "ts", resolveDir: repoRoot, sourcefile: entry.sourcefile } };
  const result = await esbuild({
    ...input,
    bundle: true,
    platform: "node",
    // Not node26, even though package.json pins that. The source uses TC39
    // explicit resource management (`using x = ...`), which a node26 target
    // passes through untouched and any older runtime fails to parse. Naming an
    // older target makes esbuild downlevel it, so the bundles load on whatever
    // Node the machine happens to have and on whatever Node Electron ships.
    target: "node22",
    format: "cjs",
    outfile: path.join(outRoot, outfile),
    external: EXTERNAL,
    // jsonc-parser's default entry is a UMD bundle whose factory takes
    // `require` as a parameter, so esbuild cannot see through its
    // require("./impl/format") and the bundle throws MODULE_NOT_FOUND at load.
    // Its package declares lib/esm/main.js as the module entry; use that.
    alias: { "jsonc-parser": "jsonc-parser/lib/esm/main.js" },
    sourcemap: "linked",
    logLevel: "error",
    metafile: true,
    // The source uses import.meta.url in several places — most importantly
    // coordinator/production-root-provider.ts, which passes it as
    // electronMainModuleUrl so the coordinator can locate dist/electron-main
    // and fork from there. In a cjs bundle import.meta is empty, so that
    // arrives as "" and validateProductionPorts throws "Production coordinator
    // requires electronMainModuleUrl." esbuild warns about this; the upstream
    // activation scripts answer it with exactly this banner and define, and so
    // does this build.
    banner: { js: 'const __import_meta_url = require("node:url").pathToFileURL(__filename).href;' },
    define: {
      "process.env.CAISRA_BUILD": JSON.stringify("clean-source"),
      "import.meta.url": "__import_meta_url",
    },
  });
  const bytes = Object.entries(result.metafile.outputs)
    .filter(([file]) => !file.endsWith(".map"))
    .reduce((sum, [, o]) => sum + o.bytes, 0);
  return { outfile, bytes, ms: Date.now() - started };
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
  return { outfile: "renderer/index.html", ms: Date.now() - started };
}

async function main() {
  await rm(outRoot, { recursive: true, force: true });
  await mkdir(outRoot, { recursive: true });

  const ignition = [
    [
      { contents: await electronMainEntrySource(), sourcefile: "scripts/build-entry/caisra-electron-main.ts" },
      "electron-main/main.cjs",
    ],
    [
      { contents: await hostEntrySource(), sourcefile: "scripts/build-entry/caisra-host.ts" },
      "host/host-main.cjs",
    ],
  ];

  const results = [];
  for (const proc of [...ignition, ...PROCESSES]) results.push(await bundleProcess(proc));
  const renderer = await buildRenderer();

  await writeFile(
    path.join(outRoot, "caisra-build.json"),
    `${JSON.stringify(
      {
        product: "Caisra",
        mode: "clean-source",
        upstreamBinaryUsed: false,
        builtAt: new Date().toISOString(),
        outputs: [...results, renderer],
      },
      null,
      2,
    )}\n`,
  );

  for (const r of [...results, renderer]) {
    const size = r.bytes == null ? "" : `${(r.bytes / 1_048_576).toFixed(1)} MB`.padStart(9);
    console.log(`  ${r.outfile.padEnd(58)} ${size}  ${String(r.ms).padStart(5)}ms`);
  }
  console.log(`\nCaisra clean build -> dist/ (no upstream binary)`);
}

await main();
