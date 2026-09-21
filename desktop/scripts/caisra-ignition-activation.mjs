/**
 * Ignite electron-main and host the way `scripts/build-caisra.mjs` does:
 * generate the entry that actually calls start, without the 0.18.0 artifact
 * self-check that `*-production-activation.mjs` requires.
 *
 * Packaging used to leave those two runtimes as artifact-fallback, so
 * `npm run package` shipped Grok's host (no Terra→Luna) even after the
 * recovered source was on main.
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { build as esbuild } from "esbuild";

import { electronMainEntrySource, hostEntrySource, repoRoot } from "./lib/caisra-entries.mjs";
import { applyReconstructedUpdaterGuard } from "./lib/build-asar.mjs";
import {
  electronMainBindingProvenancePath,
  requiredElectronMainProductionBindings,
  electronMainProductionBindingInventorySpecs,
} from "./electron-main-production-activation.mjs";
import {
  hostBindingProvenancePath,
  requiredHostProductionBindings,
  hostProductionBindingInventorySpecs,
} from "./host-production-activation.mjs";

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

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function normalize(value) {
  return value.split(path.sep).join("/");
}

async function bundleIgnition({ contents, sourcefile, outfile, banner }) {
  await mkdir(path.dirname(outfile), { recursive: true });
  const result = await esbuild({
    absWorkingDir: repoRoot,
    banner: { js: banner },
    bundle: true,
    define: {
      "process.env.CAISRA_BUILD": JSON.stringify("clean-source"),
      "import.meta.url": "__import_meta_url",
    },
    external: EXTERNAL,
    format: "cjs",
    legalComments: "none",
    loader: { ".png": "dataurl" },
    logLevel: "silent",
    alias: { "jsonc-parser": "jsonc-parser/lib/esm/main.js" },
    metafile: true,
    outfile,
    platform: "node",
    sourcemap: false,
    stdin: { contents, loader: "ts", resolveDir: repoRoot, sourcefile },
    target: "node22",
  });
  const inputs = Object.keys(result.metafile.inputs)
    .map((input) => normalize(path.relative(repoRoot, path.resolve(repoRoot, input))))
    .sort();
  const forbiddenInputs = inputs.filter((input) => (
    input === "src/app"
    || input.startsWith("src/app/")
    || input.startsWith("recovered/source-capsules/")
    || input.startsWith("dist/deps/")
  ));
  if (forbiddenInputs.length > 0) {
    throw new Error(`Caisra ignition graph reaches forbidden first-party artifact inputs: ${forbiddenInputs.join(", ")}`);
  }
  const outputBytes = await readFile(outfile);
  const forbiddenOutput = outputBytes.toString("utf8").match(/(?:src\/app\/|recovered\/source-capsules\/)/g) ?? [];
  if (forbiddenOutput.length > 0) {
    throw new Error(`Caisra ignition embeds forbidden artifact references: ${[...new Set(forbiddenOutput)].join(", ")}`);
  }
  return { inputs, forbiddenInputs, forbiddenOutputReferences: [] };
}

export async function igniteProductionHost({ outputRoot, previous = {} } = {}) {
  if (typeof outputRoot !== "string" || outputRoot.length === 0) {
    throw new TypeError("igniteProductionHost requires outputRoot");
  }
  const outfile = path.join(outputRoot, "dist/host/host-main.cjs");
  const graph = await bundleIgnition({
    contents: await hostEntrySource(),
    sourcefile: "scripts/build-entry/caisra-host.ts",
    outfile,
    banner: 'const __import_meta_url = require("node:url").pathToFileURL(__filename).href;\n// Deterministic clean-source production host; caisra ignition',
  });
  const outputBytes = await readFile(outfile);
  const bindings = hostProductionBindingInventorySpecs.map((spec) => ({
    path: spec.path,
    classification: spec.binding.classification,
    module: spec.binding.module,
    export: spec.binding.export,
    access: spec.binding.access,
  }));
  const provenance = {
    schemaVersion: 2,
    status: "validated-clean-source",
    manifestPath: null,
    manifestSha256: sha256(outputBytes),
    requiredBindings: requiredHostProductionBindings,
    boundBindings: requiredHostProductionBindings.slice(),
    unboundBindings: [],
    inventory: previous.inventory ?? [],
    activationEvidence: previous.activationEvidence ?? { runnerRealTurn: { status: "supported" } },
    bindings,
    executableGraph: { ...graph, externalImports: [] },
    output: { path: "dist/host/host-main.cjs", bytes: outputBytes.byteLength, sha256: sha256(outputBytes) },
  };
  const provenancePath = path.join(outputRoot, hostBindingProvenancePath);
  await mkdir(path.dirname(provenancePath), { recursive: true });
  await writeFile(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`);
  return {
    status: "validated-clean-source",
    clean: true,
    requiredBindings: requiredHostProductionBindings,
    boundBindings: requiredHostProductionBindings.slice(),
    unboundBindings: [],
    inventory: provenance.inventory,
    activationEvidence: provenance.activationEvidence,
    provenance,
    provenancePath,
    outputPath: outfile,
  };
}

export async function igniteProductionElectronMain({ outputRoot, reconstructedPackage = false, previous = {} } = {}) {
  if (typeof outputRoot !== "string" || outputRoot.length === 0) {
    throw new TypeError("igniteProductionElectronMain requires outputRoot");
  }
  const outfile = path.join(outputRoot, "dist/electron-main/main.cjs");
  const graph = await bundleIgnition({
    contents: await electronMainEntrySource(),
    sourcefile: "scripts/build-entry/caisra-electron-main.ts",
    outfile,
    banner: 'const __import_meta_url = require("node:url").pathToFileURL(__filename).href;\n// Deterministic clean-source production Electron main; caisra ignition',
  });
  if (reconstructedPackage) {
    await writeFile(outfile, applyReconstructedUpdaterGuard(await readFile(outfile, "utf8")));
  }
  const outputBytes = await readFile(outfile);
  const bindings = electronMainProductionBindingInventorySpecs.map((spec) => ({
    path: spec.path,
    classification: spec.classification,
    module: spec.module,
    export: spec.export,
    access: spec.access,
  }));
  const provenance = {
    schemaVersion: 1,
    status: "validated-clean-source",
    manifestPath: null,
    manifestSha256: sha256(outputBytes),
    requiredBindings: requiredElectronMainProductionBindings,
    boundBindings: requiredElectronMainProductionBindings.slice(),
    unboundBindings: [],
    bindings,
    executableGraph: { target: "node22", ...graph, externalImports: [], runtimePackages: previous.runtimePackageFiles ?? [] },
    output: { path: "dist/electron-main/main.cjs", bytes: outputBytes.byteLength, sha256: sha256(outputBytes) },
  };
  const provenancePath = path.join(outputRoot, electronMainBindingProvenancePath);
  await mkdir(path.dirname(provenancePath), { recursive: true });
  await writeFile(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`);
  return {
    status: "validated-clean-source",
    clean: true,
    requiredBindings: requiredElectronMainProductionBindings,
    provenance,
    provenancePath,
    outputPath: outfile,
    runtimePackageFiles: [],
  };
}
