/**
 * A connector's large result on the box (7 October 2026, the founder's inbox
 * log). Over the threshold the text goes to a file and the model sees the
 * path. When the file cannot be written the result used to go to the model
 * whole, with no limit; it is now cut at 40,000 bytes with a notice.
 */
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadSpiller() {
  const scratch = await mkdtemp(path.join(os.tmpdir(), "simeon-spill-"));
  const entry = path.join(scratch, "entry.ts");
  const source = (relative) => JSON.stringify(path.join(repoRoot, "source", relative));
  await writeFile(entry, [
    `export { createSandMcpTextSpiller } from ${source("host/runner/large-output-spill.ts")};`,
    `export { McpResult, McpSuccess, McpToolResultContentItem, McpTextContent } from ${source("packages/proto/generated/agent/v1/mcp_exec_pb.ts")};`,
  ].join("\n"));
  const out = path.join(scratch, "spill.mjs");
  await build({ entryPoints: [entry], outfile: out, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron"], banner: { js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);' } });
  const module = await import(`${pathToFileURL(out).href}?${Date.now()}`);
  return { module, scratch };
}

function result(m, text) {
  return new m.McpResult({ result: { case: "success", value: new m.McpSuccess({ content: [new m.McpToolResultContentItem({ content: { case: "text", value: new m.McpTextContent({ text }) } })] }) } });
}

const textOf = (r) => r.result.value.content.map((item) => item.content.value.text).join("");

test("a large result goes to a file, and when the file cannot be written it is cut with a notice", async () => {
  const { module: m, scratch } = await loadSpiller();
  try {
    const big = "x".repeat(60_000);
    const uploads = [];
    const spill = m.createSandMcpTextSpiller({ thresholdBytes: 1_000, uploadTextFile: async (_ctx, file, data) => { uploads.push([file, data.byteLength]); } });
    const written = await spill({}, result(m, big));
    assert.equal(uploads.length, 1);
    assert.match(written.result.value.content[0].content.value.outputLocation.filePath, /^\.sand\/tools\/.+\.txt$/);

    const failing = m.createSandMcpTextSpiller({ thresholdBytes: 1_000, uploadTextFile: async () => { throw new Error("box offline"); } });
    const cut = textOf(await failing({}, result(m, big)));
    // Cut at the box's 40,000 byte limit for inline MCP text, with the notice after it.
    assert.ok(cut.length > 40_000 && cut.length < 41_000, `cut to 40,000 bytes, got ${cut.length}`);
    assert.match(cut, /Output truncated: the full MCP tool output was 60000 bytes/);

    const small = await failing({}, result(m, "short"));
    assert.equal(textOf(small), "short");
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});
