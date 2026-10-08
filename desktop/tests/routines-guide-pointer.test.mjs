/**
 * An agent with no routines gets a pointer to the routines guide, not the
 * guide (8 October 2026). The guide, about 16,000 characters, went out on
 * every call of every agent (as in the upstream app); in the founder's
 * staffing log none of the five agents had a routine.
 *
 * Offline, this holds:
 * - the pointer is short, names the agent's folder, time zone and the guide's
 *   path, and says to read the guide before making or changing a routine;
 * - the guide is written to the box's reference folder with the rest;
 * - the prompt sends the pointer with no routines and the guide with one.
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function bundle(entry, name) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), `simeon-${name}-`));
  const outfile = path.join(temporary, `${name}.mjs`);
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron"] });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(temporary, { recursive: true, force: true }) };
}

const FOLDER = "/home/box/agent-data/agents/nina/automations";

test("the pointer is short and says where the guide is and when to read it", async () => {
  const loaded = await bundle("source/host/automations/automation.ts", "routines-pointer");
  try {
    const { renderAutomationsPointerSystemPrompt, renderAutomationsSystemPrompt } = loaded.module;
    const pointer = renderAutomationsPointerSystemPrompt(FOLDER, "America/Los_Angeles", "/home/box/reference/routines.md");
    const guide = renderAutomationsSystemPrompt([], FOLDER, "America/Los_Angeles", { omitList: true });
    assert.ok(pointer.length < 1_000, `pointer ${pointer.length} chars`);
    assert.ok(guide.length > 15_000, `guide ${guide.length} chars`);
    assert.match(pointer, /You have none yet\. They live in a folder at \/home\/box\/agent-data\/agents\/nina\/automations\./);
    assert.match(pointer, /Before you create, change or explain a routine, read the full routines guide at \/home\/box\/reference\/routines\.md with Read/);
    assert.match(pointer, /timezone America\/Los_Angeles/);
    assert.equal(renderAutomationsPointerSystemPrompt(null, undefined, "/x"), "", "no folder, no section, as for the guide");
  } finally {
    await loaded.dispose();
  }
});

test("the guide is written to the box's reference folder with the other references", async () => {
  const loaded = await bundle("source/host/runner/box-reference-docs.ts", "routines-reference");
  const folder = await mkdtemp(path.join(os.tmpdir(), "simeon-reference-"));
  try {
    const { writeSandBoxReferenceDocs, ROUTINES_GUIDE_REFERENCE_PATH } = loaded.module;
    assert.equal(ROUTINES_GUIDE_REFERENCE_PATH, "/home/box/reference/routines.md");
    const written = await writeSandBoxReferenceDocs(folder);
    assert.ok(written.includes(path.join(folder, "routines.md")), written.join(", "));
    const doc = await readFile(path.join(folder, "routines.md"), "utf8");
    assert.match(doc, /^# Routines\n/);
    assert.match(doc, /To make one: update_state with target "routine", action "create"/);
    assert.match(doc, /your routines folder \(named in the Routines section of your prompt\)/);
  } finally {
    await rm(folder, { recursive: true, force: true });
    await loaded.dispose();
  }
});

test("the prompt sends the pointer with no routines and the whole guide with one", async () => {
  const assembly = await readFile(path.join(repoRoot, "source/host/runner/system-prompt-assembly.ts"), "utf8");
  assert.match(assembly, /const rendered = automations\.length === 0\n\s*\? renderAutomationsPointerSystemPrompt\(location, timeZone, ROUTINES_GUIDE_REFERENCE_PATH\)\n\s*: renderAutomationsSystemPrompt\(automations, location, timeZone, \{ omitList: true \}\);/);
});
