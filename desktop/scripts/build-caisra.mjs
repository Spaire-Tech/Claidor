/**
 * Simeon clean build (`npm run build:clean-source` / `start:clean-source`).
 *
 * This emits `frontend/src` plus ignited electron-main/host into `dist/` and
 * launches with `electron .`. That reconstructed window is a recovered
 * skeleton: it has the 19 clouds and it does not have the 0.18.0 atom
 * stylesheet. The product `.app` is `npm run package`, which keeps the
 * checksum-pinned 0.18.0 renderer and ignites the recovered host.
 *
 * Vite marks the emitted script and stylesheet `crossorigin`. Over file://
 * that is fatal: `loadFile` gives the document origin `null`, and Chromium
 * refuses the stylesheet. This script and `buildProductionRenderer` strip it.
 *
 * The output layout is NOT arbitrary. The app resolves these paths itself at
 * runtime — see `executableReplacements` in scripts/lib/clean-build.mjs and
 * PRODUCTION_IPC_CONTRACT in source/electron-main/production-ipc-contract.ts,
 * which names dist/electron-preload/preload.cjs and dist/renderer/index.html
 * directly. Renaming or flattening any of it silently breaks the app at
 * launch rather than at build time.
 */

import { cp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import react from "@vitejs/plugin-react";

import { electronMainEntrySource, hostEntrySource, preloadEntrySource } from "./lib/caisra-entries.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outRoot = path.join(repoRoot, "dist");

/**
 * Left unbundled. Native addons and their loaders cannot be inlined, and
 * electron is supplied by the runtime. pdfjs-dist is not here on purpose:
 * the box receives host-main.cjs as one bind-mounted file and no
 * node_modules (source/electron-main/box/local-docker-host-connector.ts), so
 * the Read tool's PDF extractor (source/host/runner/pdf-text-extractor.ts)
 * only works if pdf.js travels inside the bundle.
 */
const EXTERNAL = [
  "electron",
  "tree-sitter",
  "tree-sitter-bash",
  "web-tree-sitter",
  "node-gyp-build",
  "node-addon-api",
  "piscina",
];

/** Entry -> output path, matching what the app expects to find. */
const PROCESSES = [
  ["source/electron-dev-controls/main.ts", "electron-dev-controls/main.cjs"],


  ["source/host/agent-isolation/agent-store-worker.ts", "host/agent-isolation/agent-store-worker.cjs"],
  ["source/host/agent-isolation/transcript-mirror-worker.ts", "host/agent-isolation/transcript-mirror-worker.cjs"],
  ["source/host/extensions/box-store-sync/box-store-vacuum-worker.ts", "host/extensions/box-store-sync/box-store-vacuum-worker.cjs"],
  ["source/host/extensions/content-search/search-index-worker.ts", "host/extensions/content-search/search-index-worker.cjs"],

  ["source/node-agent-coordinator/main.ts", "node-agent-coordinator/main.cjs"],
  ["source/box-exec-daemon/cli.ts", "box-exec-daemon/main.cjs"],
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

/**
 * Vite marks the emitted entry script and stylesheet `crossorigin`. Over http
 * that is free; over file:// it is fatal. Electron loads the renderer with
 * `loadFile` (source/electron-main/main.ts:343), which gives the document the
 * opaque origin `null`, and a `crossorigin` subresource from a null origin is
 * refused by CORS before it is ever parsed.
 *
 * Measured, headless Chromium on dist/renderer/index.html over file://:
 *
 *   with crossorigin      stylesheet blocked; font-family "Times New Roman";
 *                         --cursor-font-family-sans "" ; --sand-text-primary ""
 *   without crossorigin   stylesheet applied; font-family -apple-system, …;
 *                         --cursor-spacing-5-5 22px ; background rgb(24,24,24)
 *
 * The first column is the app the founder was looking at: correct markup, no
 * styling at all, browser default serif. One attribute.
 */
function stripCrossorigin() {
  return {
    name: "caisra-strip-crossorigin",
    enforce: "post",
    transformIndexHtml(html) {
      return html.replace(/\s+crossorigin(?:=("|')[^"']*\1)?/g, "");
    },
  };
}

async function buildRenderer() {
  const started = Date.now();
  await viteBuild({
    root: path.join(repoRoot, "frontend"),
    configFile: false,
    plugins: [react(), stripCrossorigin()],
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
  // The eighteen runtime assets the renderer asks for by name at runtime
  // (frontend/src/production/runtime-assets.ts resolves them relative to the
  // emitted bundle, so they have to sit beside it). Vite never sees them —
  // nothing imports them, the recovered source hard-codes the shipped
  // filenames — so nothing would emit them and nothing would warn. See
  // scripts/make-runtime-assets.mjs.
  const runtimeAssets = path.join(repoRoot, "frontend/runtime-assets");
  await cp(runtimeAssets, path.join(outRoot, "renderer/assets"), { recursive: true });
  const copied = (await readdir(runtimeAssets)).length;

  return { outfile: `renderer/index.html (+${copied} runtime assets)`, ms: Date.now() - started };
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
    ...Object.keys({ "preload": 0, "preload-dev-controls": 0, "preload-webview": 0, "preload-vnc": 0 }).map((name) => [
      { contents: preloadEntrySource(name), sourcefile: `scripts/build-entry/caisra-${name}.ts` },
      `electron-preload/${name}.cjs`,
    ]),
  ];

  const results = [];
  for (const proc of [...ignition, ...PROCESSES]) results.push(await bundleProcess(proc));
  const renderer = await buildRenderer();

  await writeFile(
    path.join(outRoot, "caisra-build.json"),
    `${JSON.stringify(
      {
        product: "Simeon",
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
  console.log(`\nSimeon clean build -> dist/ (no upstream binary)`);
}

await main();
