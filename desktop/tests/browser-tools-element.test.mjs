/**
 * The browser child's clicks say what they aim at (2 October 2026). Auto-review
 * refuses a click, a coordinate click or a drag without an `element` field, and
 * the tools never asked for one, so with the browserUse child on every first
 * click failed. The driver also finds playwright-core where the box put it.
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function load(entry, name) {
  const dir = await mkdtemp(path.join(os.tmpdir(), `simeon-${name}-`));
  const outfile = path.join(dir, `${name}.mjs`);
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron"], banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

test("click, coordinate click and drag require element, and the model is told what it is", async () => {
  const tools = await load("source/host/runner/tools/sand-browser-tools.ts", "browser-tools");
  const loop = await load("source/host/runner/tools/sand-loop-tool.ts", "loop-tool");
  try {
    const defs = tools.module.createSandBrowserTools({ getDefaultViewId: () => "v", getBoxId: () => "b" });
    const byName = Object.fromEntries(defs.map((def) => [def.name, def]));
    for (const name of ["browser_click", "browser_mouse_click_xy", "browser_drag"]) {
      assert.ok(byName[name].schema.required.includes("element"), name);
      assert.match(byName[name].description, /element/, name);
      const parameters = loop.module.browserToolParameters(byName[name].schema);
      assert.match(parameters.shape.element.description, /description of the target and why/, name);
      const refused = await byName[name].execute({}, { ref: "e1", x: 1, y: 2, sourceRef: "e1" }, { toolCallId: "t" }).catch((error) => error);
      assert.match(String(refused?.message ?? refused?.text ?? JSON.stringify(refused)), /element is required/, name);
    }
    assert.equal(byName.browser_type.schema.required.includes("element"), false, "typing is not asked for it");
  } finally {
    await Promise.all([tools.dispose(), loop.dispose()]);
  }
});

test("the browser child's brief names the element field", async () => {
  const glue = await readFile(path.join(repoRoot, "source/host/runner/prompt-collector-glue.ts"), "utf8");
  assert.match(glue, /Every browser_click, browser_mouse_click_xy and browser_drag carries `element`/);
});

test("the driver finds playwright-core outside its own folder", async () => {
  const { module, dispose } = await load("source/host/runner/tools/sand-browser-driver-source.ts", "driver-source");
  try {
    const source = module.SAND_BROWSER_DRIVER_SOURCE;
    assert.equal((source.match(/await import\("playwright-core"\)/g) ?? []).length, 1, "the bare import is tried once, inside requirePlaywright");
    assert.match(source, /const \{ chromium \} = await requirePlaywright\("playwright-core"\)/);
    assert.match(source, /requirePlaywright\("playwright-core\/lib\/utilsBundle"\)/);
    assert.match(source, /npm root -g/);
    assert.doesNotMatch(source, /npm", \["install"/, "it never installs anything on the box");
  } finally {
    await dispose();
  }
});
