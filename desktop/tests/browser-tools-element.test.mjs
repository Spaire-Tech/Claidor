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
    assert.doesNotMatch(source, /npm", \["install"/, "it never installs anything from the network");
    assert.match(source, /if \(PLAYWRIGHT_ROOT\) roots\.push/, "the host's own copy is tried after the image's");
  } finally {
    await dispose();
  }
});

test("the packed playwright-core matches the pinned package, licence included", async () => {
  const { renderPlaywrightGen } = await import(pathToFileURL(path.join(repoRoot, "scripts/vendor-playwright-core.mjs")).href);
  const committed = await readFile(path.join(repoRoot, "source/host/runner/tools/sand-browser-playwright.gen.ts"), "utf8");
  const shas = (text) => [...text.matchAll(/"([^"]+)": \{\n    sha256: "([0-9a-f]{64})"/g)].map((m) => `${m[1]}=${m[2]}`);
  assert.deepEqual(shas(committed), shas(await renderPlaywrightGen()), "run npm run vendor:playwright-core");
  for (const name of ["package.json", "browsers.json", "LICENSE", "NOTICE", "ThirdPartyNotices.txt", "lib/playwright-core.cjs"]) assert.ok(committed.includes(`"${name}": {`), name);
});

test("the host writes its playwright-core beside the helper once, library last, and the helper is told where", async () => {
  const { module, dispose } = await load("source/host/runner/tools/sand-browser-tools.ts", "browser-tools-pw");
  try {
    const uploads = [];
    const commands = [];
    let present = false;
    const deps = {
      resourceAccessor: { get() { throw new Error("unused"); } },
      async getWindowIndex() { return 1; },
      getBoxId: () => "box",
      getDefaultViewId: () => "v",
      async uploadFile(_c, _b, p) { uploads.push(p); },
      async downloadFile() { return new Uint8Array(); },
      async executeShell(_c, input) {
        commands.push(input.command);
        if (input.command.startsWith("test -s")) return { case: "success", stdout: present ? "present\n" : "absent\n" };
        return { case: "success", stdout: '\n__SAND_BROWSER_RESULT__{"ok":true,"summary":"Done"}\n' };
      },
    };
    const dir = module.SAND_BROWSER_PLAYWRIGHT_BOX_DIR;
    assert.match(dir, /^\/tmp\/\.sand-browser\/playwright-core-1\.63\.0-[0-9a-f]{12}$/);
    const snapshot = module.createSandBrowserTools(deps).find((t) => t.name === "browser_snapshot");
    await snapshot.execute({}, {}, { toolCallId: "a" });
    const written = uploads.filter((p) => p.startsWith(dir));
    assert.equal(written.length, 6);
    assert.equal(written.at(-1), `${dir}/lib/playwright-core.cjs`, "the library is written last, so its presence means the folder is whole");
    const request = JSON.parse(Buffer.from(commands.find((c) => c.startsWith("node ")).split(" ").at(-1), "base64").toString("utf8"));
    assert.equal(request.playwrightRoot, dir);

    uploads.length = 0;
    present = true;
    await module.createSandBrowserTools(deps).find((t) => t.name === "browser_snapshot").execute({}, {}, { toolCallId: "b" });
    assert.deepEqual(uploads.filter((p) => p.startsWith(dir)), [], "a computer that has it is not written again");

    present = false;
    commands.length = 0;
    const failing = { ...deps, async uploadFile(_c, _b, p) { if (p.startsWith(dir)) throw new Error("disk full"); } };
    await module.createSandBrowserTools(failing).find((t) => t.name === "browser_snapshot").execute({}, {}, { toolCallId: "c" });
    const fallback = JSON.parse(Buffer.from(commands.find((c) => c.startsWith("node ")).split(" ").at(-1), "base64").toString("utf8"));
    assert.equal(fallback.playwrightRoot, undefined, "without our copy the helper still tries the image's own");
  } finally {
    await dispose();
  }
});

test("what the browser says when it cannot start is plain words", async () => {
  const { module, dispose } = await load("source/host/runner/tools/sand-browser-driver-source.ts", "driver-source-words");
  try {
    const source = module.SAND_BROWSER_DRIVER_SOURCE;
    assert.match(source, /The browser on this computer isn't ready yet: it could not be started/);
    assert.doesNotMatch(source, /new Error\([^)]*(playwright|CDP endpoint|on the box)/i);
    const tools = await readFile(path.join(repoRoot, "source/host/runner/tools/sand-browser-tools.ts"), "utf8");
    assert.doesNotMatch(tools, /Browser driver|browser driver on the box|The box has not assigned/);
    const glue = await readFile(path.join(repoRoot, "source/host/runner/prompt-collector-glue.ts"), "utf8");
    assert.match(glue, /Never name the libraries, ports, or programs behind the browser in your report/);
    assert.match(glue, /never pass on the names of the programs, libraries, or ports behind it/);
  } finally {
    await dispose();
  }
});

test("a failed page-state probe says why (7 October 2026: the bare sentence left the founder's log unreadable)", async () => {
  const tools = await load("source/host/runner/tools/sand-browser-tools.ts", "browser-tools-capture");
  try {
    const { captureFailureText } = tools.module;
    assert.equal(captureFailureText(new Error("Another action is waiting for Auto-review approval; no new side effect may start yet.")), "Another action is waiting for Auto-review approval; no new side effect may start yet.");
    assert.equal(captureFailureText({ message: "The box is not ready." }), "The box is not ready.");
    assert.equal(captureFailureText("rpc failed"), "rpc failed");
    assert.equal(captureFailureText(undefined), "the probe's shell gave no result");
    const source = await readFile(path.join(repoRoot, "source/host/runner/tools/sand-browser-tools.ts"), "utf8");
    // A cancelled turn is rethrown as the cancellation, not reported as a blocked review.
    assert.match(source, /if \(error instanceof Error && error\.name === "AbortError"\) throw error;\n\s*throw new SandBrowserAutoReviewBlockedError\(`Browser Auto-review could not capture the current page state: \$\{captureFailureText\(error\)\}`\);/);
    const computer = await readFile(path.join(repoRoot, "source/host/runner/tools/sand-computer-tool.ts"), "utf8");
    assert.match(computer, /Computer Auto-review could not capture the current page state: \$\{captureFailureText\(error\)\}/);
  } finally {
    await tools.dispose();
  }
});
