/**
 * GetMcpTools reads a blank field as left out (1 October 2026).
 *
 * An agent asked {"server":"gmail","toolName":"","pattern":""} to list
 * Gmail's tools. The empty toolName counted as set, so the tool looked up a
 * tool named "" and answered "not found"; the agent then guessed tool names
 * until one worked. A model that fills in every field sends "" for the ones
 * it means to leave out, so blank strings are dropped before the arguments
 * are read, and the not-found error says how to list the server's tools.
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = path.join(repoRoot, "source/packages/agent/tools/mcp/get-mcp-tools.ts");

async function load() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "simeon-get-mcp-tools-"));
  const outfile = path.join(dir, "get-mcp-tools.mjs");
  await build({ entryPoints: [SOURCE], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["jsonc-parser"], banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

test("blank fields are dropped, so the request lists the server's tools", async () => {
  const { module, dispose } = await load();
  try {
    const { dropBlankArgs } = module;
    assert.deepEqual(dropBlankArgs({ server: "gmail", toolName: "", pattern: "" }, false), { server: "gmail" });
    assert.deepEqual(dropBlankArgs({ server: "gmail", toolName: "  ", pattern: "FETCH" }, false), { server: "gmail", pattern: "FETCH" });
    assert.deepEqual(dropBlankArgs({ server: "", toolName: "", pattern: "" }, false), {}, "all blank is the catalog");
    assert.deepEqual(dropBlankArgs({ server: "gmail", toolName: "GMAIL_FETCH_EMAILS" }, false), { server: "gmail", toolName: "GMAIL_FETCH_EMAILS" });
  } finally {
    await dispose();
  }
});

test("in dynamic mode the namespace is the server, and a blank one is dropped too", async () => {
  const { module, dispose } = await load();
  try {
    const { dropBlankArgs } = module;
    assert.deepEqual(dropBlankArgs({ namespace: "gmail", toolName: "" }, true), { namespace: "gmail", server: "gmail" });
    assert.deepEqual(dropBlankArgs({ namespace: "", toolName: "", pattern: "x" }, true), { pattern: "x" });
    assert.equal(dropBlankArgs("not an object", false), "not an object");
  } finally {
    await dispose();
  }
});

test("the tool parses with the blank-dropping step and its not-found error says how to list tools", async () => {
  const source = await readFile(SOURCE, "utf8");
  assert.match(source, /z\.preprocess\(raw => dropBlankArgs\(raw, dynamic\)/);
  assert.match(source, /not found on server "\$\{args\.server\}"\. Call this tool with \{"server":"\$\{args\.server\}"\} alone to list its tools/);
});
