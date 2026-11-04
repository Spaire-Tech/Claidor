// Step 0 of docs/agents-on-the-server/README.md: the engine bundled by itself,
// the way scripts/build-simeon.mjs bundles it, to start it outside a
// computer. It builds host/host-main.cjs and the files the engine loads next
// to it: its worker threads and the agent coordinator (the turn loop). The
// computer's hands program is not built here; the probe starts it apart
// (hands-daemon.ts).
// Usage: node scripts/agents-on-the-server/build-host.mjs <out dir>
import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const outRoot = path.resolve(process.argv[2] ?? "probe-engine");
const { hostEntrySource } = await import(path.join(repoRoot, "scripts/lib/simeon-entries.mjs"));

// The same entries and outputs as PROCESSES in scripts/build-simeon.mjs.
const ENTRIES = [
  [{ contents: await hostEntrySource(), sourcefile: "host-entry.ts" }, "host/host-main.cjs"],
  ["source/host/agent-isolation/agent-store-worker.ts", "host/agent-isolation/agent-store-worker.cjs"],
  ["source/host/agent-isolation/transcript-mirror-worker.ts", "host/agent-isolation/transcript-mirror-worker.cjs"],
  ["source/host/extensions/box-store-sync/box-store-vacuum-worker.ts", "host/extensions/box-store-sync/box-store-vacuum-worker.cjs"],
  ["source/host/extensions/content-search/search-index-worker.ts", "host/extensions/content-search/search-index-worker.cjs"],
  ["source/node-agent-coordinator/main.ts", "node-agent-coordinator/main.cjs"],
];

const started = Date.now();
await Promise.all(ENTRIES.map(([entry, outfile]) => build({
  ...(typeof entry === "string"
    ? { entryPoints: [path.join(repoRoot, entry)] }
    : { stdin: { contents: entry.contents, loader: "ts", resolveDir: repoRoot, sourcefile: entry.sourcefile } }),
  bundle: true, platform: "node", target: "node22", format: "cjs", outfile: path.join(outRoot, outfile),
  external: ["electron", "tree-sitter", "tree-sitter-bash", "web-tree-sitter", "node-gyp-build", "node-addon-api", "piscina"],
  alias: { "jsonc-parser": "jsonc-parser/lib/esm/main.js" },
  logLevel: "error",
  banner: { js: 'const __import_meta_url = require("node:url").pathToFileURL(__filename).href;' },
  define: { "process.env.SIMEON_BUILD": JSON.stringify("clean-source"), "import.meta.url": "__import_meta_url" },
})));
console.log(`built the engine (${ENTRIES.length} files) into ${outRoot} in ${Date.now() - started} ms`);
