import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function load() {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "caisra-grok-persona-"));
  const ours = path.join(temporary, "persona.mjs");
  await build({ entryPoints: [path.join(repoRoot, "source/shared/agent/grok-persona.ts")], outfile: ours, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent" });
  const theirs = path.join(temporary, "character.mjs");
  await build({ stdin: { contents: 'export { PERSONA_SHAPE_PATHS, resolvePersonaColor, resolvePersonaShape } from "./frontend/src/recovered/features/onboarding/signed-in/character";', resolveDir: repoRoot, loader: "ts" }, outfile: theirs, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", jsx: "automatic" });
  return { ours: await import(`${pathToFileURL(ours).href}?${Date.now()}`), theirs: await import(`${pathToFileURL(theirs).href}?${Date.now()}`), dispose: () => rm(temporary, { recursive: true, force: true }) };
}

test("the shape and colour defaults are the shipped renderer's, id for id", async () => {
  const { ours, theirs, dispose } = await load();
  try {
    for (let index = 0; index < 200; index += 1) {
      const id = index % 2 === 0 ? `agent-${index}` : `${crypto.randomUUID()}`;
      assert.equal(ours.resolvePersonaColor(id), theirs.resolvePersonaColor(id), id);
      assert.equal(ours.resolvePersonaShape(id), theirs.resolvePersonaShape(id), id);
    }
    assert.equal(ours.resolvePersonaColor("x", "blue"), "blue");
    assert.equal(ours.resolvePersonaShape("x", "hex"), "hex");
    assert.equal(ours.resolvePersonaColor("x", "pinkish"), theirs.resolvePersonaColor("x", "pinkish"), "junk falls to the hash");
  } finally {
    await dispose();
  }
});

test("every shipped shape path is recognised, and only those", async () => {
  const { ours, theirs, dispose } = await load();
  try {
    for (const [shape, d] of Object.entries(theirs.PERSONA_SHAPE_PATHS)) {
      assert.equal(ours.shapeFromPath(d), shape);
      assert.equal(ours.shapeFromPath(d.replace(/ /g, "\n  ")), shape, "whitespace does not matter");
      assert.equal(ours.shapeFromPath(`${d.slice(0, 60)}Z`), shape, "the head of the path decides");
    }
    assert.equal(ours.shapeFromPath("M0 0L10 10Z"), null);
    assert.equal(ours.shapeFromPath(null), null);
  } finally {
    await dispose();
  }
});

test("a gradient stop names its colour, and a face source names its agent and cell", async () => {
  const { ours, dispose } = await load();
  try {
    assert.equal(ours.colorFromStops("#2A92FE", "#0E74E0"), "blue");
    assert.equal(ours.colorFromStops("#0e74e0"), "blue", "either stop, either case");
    assert.equal(ours.colorFromStops("#FFFFFF", "#000000"), "black");
    assert.equal(ours.colorFromStops("rgb(1,2,3)", null, "#123456"), null);
    assert.deepEqual(ours.parseSourceId("sand-agent-mark-source-agent-perrin"), { agentId: "agent-perrin", shape: null });
    assert.deepEqual(ours.parseSourceId("agent-perrin-hex"), { agentId: "agent-perrin", shape: "hex" });
    assert.deepEqual(ours.parseSourceId("c0ffee-teardrop"), { agentId: "c0ffee", shape: "teardrop" });
    assert.deepEqual(ours.parseSourceId("sand-agent-mark-source-"), { agentId: null, shape: null });
    assert.deepEqual(ours.parseSourceId(null), { agentId: null, shape: null });
  } finally {
    await dispose();
  }
});
