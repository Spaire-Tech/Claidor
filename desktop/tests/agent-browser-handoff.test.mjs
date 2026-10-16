/**
 * The agent's own browser step, its own screen, and a quicker helper step
 * (15 October 2026). The founder's Apple sign-in took 3 minutes and 17 model
 * calls: the agent had no way to open a page or see its screen, so it sent a
 * browserUse helper to open the sign-in page, slept on it, and sent another
 * to check. These tests hold the four changes:
 *
 * - OpenPage: the main agent opens an address in its own Chrome, in front,
 *   and nothing else; the prompt says to hand over in the same turn.
 * - Screenshot is offered to the main agent by default again
 *   (`SAND_AGENT_SCREENSHOT_TOOL=0` withholds it), and only its latest few
 *   pictures stay in its conversation.
 * - The browser driver asks `npm root -g` only when the usual folders have no
 *   playwright-core, and once per step.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = (file) => readFile(path.join(repoRoot, "source", file), "utf8");

async function load(entry, name) {
  const dir = await mkdtemp(path.join(os.tmpdir(), `simeon-${name}-`));
  const outfile = path.join(dir, `${name}.mjs`);
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron"], banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  try {
    return await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

const MARKER = "__SAND_BROWSER_RESULT__";

/** Browser dependencies that record every command the driver would run on the computer. */
function fakeBrowser() {
  const commands = [];
  const dependencies = {
    resourceAccessor: { get() { throw new Error("no resources in this test"); } },
    getWindowIndex: async () => 1,
    getBoxId: () => "box-1",
    getDefaultViewId: () => "agent-1",
    uploadFile: async () => {},
    downloadFile: async () => new Uint8Array(),
    async executeShell(_context, input) {
      commands.push(input.command);
      if (input.command.startsWith("test -s")) return { case: "success", stdout: "present\n" };
      const request = JSON.parse(Buffer.from(input.command.split(" ").at(-1), "base64").toString("utf8"));
      return { case: "success", stdout: `\n${MARKER}${JSON.stringify({ ok: true, summary: `Navigated to ${request.url}`, url: request.url, title: "Sign in" })}\n` };
    },
  };
  const requests = () => commands
    .filter((command) => command.startsWith("node "))
    .map((command) => JSON.parse(Buffer.from(command.split(" ").at(-1), "base64").toString("utf8")));
  return { dependencies, commands, requests };
}

test("OpenPage opens the address in front, takes no screenshot, and says to hand over in the same turn", async () => {
  const tools = await load("source/host/runner/tools/sand-browser-tools.ts", "open-page");
  const fake = fakeBrowser();
  const tool = tools.createSandOpenPageTool(fake.dependencies);
  assert.equal(tool.name, "OpenPage");
  assert.deepEqual(tool.schema.required, ["url"]);
  const output = await tool.execute({}, { url: " https://appleid.apple.com/sign-in " }, { toolCallId: "call-1" });
  assert.equal(output.isError, undefined, output.text);
  const [request] = fake.requests();
  assert.equal(request.op, "navigate");
  assert.equal(request.url, "https://appleid.apple.com/sign-in", "the address is trimmed");
  assert.equal(request.front, true, "the page is brought to the front, where the person looks");
  assert.equal(request.viewId, "agent-1", "the agent's own tab, the one its browserUse helper drives");
  assert.equal(request.screenshotPath, undefined, "no picture piles up in the agent's conversation");
  assert.match(output.text, /The page is open in front on your computer\. If the person has to act on it, call request_box_help now, in this same turn\./);
  assert.deepEqual(tool.render(output), { kind: "text", text: output.text });
});

test("OpenPage refuses anything but one http(s) address, without touching the computer", async () => {
  const tools = await load("source/host/runner/tools/sand-browser-tools.ts", "open-page-refuse");
  for (const url of ["", "appleid.apple.com", "javascript:alert(1)", "file:///etc/passwd", "https://a.com https://b.com", 42]) {
    const fake = fakeBrowser();
    const output = await tools.createSandOpenPageTool(fake.dependencies).execute({}, { url }, { toolCallId: "call-1" });
    assert.equal(output.isError, true, String(url));
    assert.match(output.text, /OpenPage needs one full address starting with https:\/\/ \(or http:\/\/\)\./);
    assert.deepEqual(fake.commands, [], `${String(url)}: nothing ran`);
  }
});

test("the driver brings an opened page to the front only when asked", async () => {
  const { SAND_BROWSER_DRIVER_SOURCE: driver } = await load("source/host/runner/tools/sand-browser-driver-source.ts", "driver-front");
  const navigate = driver.slice(driver.indexOf("navigate: async"), driver.indexOf("snapshot: async"));
  assert.equal((navigate.match(/if \(request\.front === true\) await page\.bringToFront\(\)\.catch\(\(\) => \{\}\);/g) ?? []).length, 2, "a new tab and the reused tab");
});

test("the main agent is offered OpenPage beside request_box_help; the helpers are not", async () => {
  const toolset = await src("host/runner/tools/turn-toolset.ts");
  assert.match(toolset, /export function createTurnOpenPageToolFactory\(\n\s*input: TurnBrowserToolFactoryInput,\n\): \(\) => TurnTool \{\n\s*return \(\) => \{\n\s*const tool = createSandOpenPageTool\(input\.dependencies\);\n\s*return asTurnTool\(adaptBrowserTool\(tool, openPageToolParameters\(tool\.schema\)\)\);/);
  assert.match(toolset, /browser: createTurnBrowserToolFactory\(input\.browser\),\n\s*openPage: createTurnOpenPageToolFactory\(input\.browser\),/);
  const mainAgent = toolset.slice(toolset.indexOf("    !host.isSubagentRunner\n    && host.remoteBoxHasDesktop"), toolset.indexOf("const purchases = factories.purchases?.();"));
  assert.match(mainAgent, /const openPage = factories\.openPage\?\.\(\);\n\s*if \(openPage !== undefined\) tools\.push\(openPage\);\n\s*const requestBoxHelp = factories\.requestBoxHelp\?\.\(\);/);
  assert.equal((toolset.match(/factories\.openPage\?\.\(\)/g) ?? []).length, 1, "offered in one place only: the main agent's block");
  const browserUse = toolset.slice(toolset.indexOf("    host.isBrowserUseSubagent\n"), toolset.indexOf("    !host.isSubagentRunner\n    && host.remoteBoxHasDesktop"));
  assert.doesNotMatch(browserUse, /openPage/);
});

test("OpenPage goes on the wire with one required string url; the helpers' browser tools keep their shape", async () => {
  const loop = await load("source/host/runner/tools/sand-loop-tool.ts", "open-page-wire");
  const tools = await load("source/host/runner/tools/sand-browser-tools.ts", "open-page-wire-tools");
  const tool = tools.createSandOpenPageTool(fakeBrowser().dependencies);
  const wired = loop.adaptBrowserTool(tool, loop.openPageToolParameters(tool.schema));
  assert.equal(wired.name, "OpenPage");
  const schema = wired.parameters.jsonSchema;
  assert.equal(schema.type, "object");
  assert.deepEqual(schema.required, ["url"]);
  assert.equal(schema.properties.url.type, "string");
  assert.match(schema.properties.url.description, /full address to open, starting with https:\/\//);
  assert.deepEqual(Object.keys(schema.properties), ["url"]);
  assert.equal(typeof wired.serializeError, "function", "a failure is a result the model reads, not a crash");
  const navigate = loop.adaptBrowserTool(tools.createSandBrowserTools(fakeBrowser().dependencies).find((entry) => entry.name === "browser_navigate"));
  assert.deepEqual(navigate.parameters.jsonSchema.properties.url, {}, "the helper's browser_navigate is unchanged");
});

test("the brief says to open the page and hand over in the same turn, and never to sleep on a helper", async () => {
  const glue = await src("host/runner/prompt-collector-glue.ts");
  assert.match(glue, /const openPageOffered = host\.openPageToolOffered\?\.\(\) === true;/);
  assert.match(glue, /call OpenPage with the address and then request_box_help in the same turn: no subagent to open it first, and none to check it opened\./);
  assert.match(glue, /- To wait for a subagent, end your turn: its result wakes you the moment it finishes\. Never sleep with AwaitShell to wait for one\./);
  assert.equal((glue.match(/\.\.\.handOffLines,/g) ?? []).length, 1);
  assert.match(glue, /If the page isn't open on your desktop yet, open it with OpenPage first, in the same turn\./);
  const composition = await src("host/host-runner-composition.ts");
  assert.match(composition, /openPageToolOffered: \(\) => createTurnToolProjections !== undefined,/);
  const runnerGlue = await src("host/runner/runner-prompt-glue.ts");
  assert.match(runnerGlue, /get openPageToolOffered\(\) \{ return owner\.openPageToolOffered; \},/);
  const boxHelp = await src("host/runner/tools/box-help-tool.ts");
  assert.match(boxHelp, /when you hold OpenPage, open it with that in this same turn rather than sending a subagent\./);
});

test("Screenshot is offered to the main agent by default; SAND_AGENT_SCREENSHOT_TOOL=0 withholds it", async () => {
  const before = process.env.SAND_AGENT_SCREENSHOT_TOOL;
  try {
    delete process.env.SAND_AGENT_SCREENSHOT_TOOL;
    const on = await load("source/host/runner/system-prompt.ts", "screenshot-on");
    assert.equal(on.AGENT_SCREENSHOT_TOOL_OFFERED, true);
    assert.match(on.DEFAULT_SAND_SYSTEM_PROMPT, /read-only Screenshot/);
    process.env.SAND_AGENT_SCREENSHOT_TOOL = "0";
    const off = await load("source/host/runner/system-prompt.ts", "screenshot-off");
    assert.equal(off.AGENT_SCREENSHOT_TOOL_OFFERED, false);
    assert.doesNotMatch(off.DEFAULT_SAND_SYSTEM_PROMPT, /read-only Screenshot tool|Screenshot views of the box/);
  } finally {
    if (before === undefined) delete process.env.SAND_AGENT_SCREENSHOT_TOOL;
    else process.env.SAND_AGENT_SCREENSHOT_TOOL = before;
  }
});

test("only the agent's latest Screenshot pictures stay, dropped five at a time; helpers' and the person's stay", async () => {
  const { toCoreMessages, SIMEON_KEPT_AGENT_SCREENSHOTS, SIMEON_TOOL_IMAGE_DROP_BATCH } = await load("source/host/extensions/inference/provider-session.ts", "agent-shots");
  assert.equal(SIMEON_KEPT_AGENT_SCREENSHOTS, 3);
  assert.equal(SIMEON_TOOL_IMAGE_DROP_BATCH, 5);
  const history = (looks) => {
    const messages = [{ role: "user", content: [{ type: "text", text: "Look at this" }, { type: "image", image: "PERSON", mimeType: "image/png" }] }];
    messages.push({ role: "assistant", content: [{ type: "tool-call", toolCallId: "computer", toolName: "Computer", args: {} }] });
    messages.push({ role: "tool", content: [{ type: "tool-result", toolCallId: "computer", toolName: "Computer", result: undefined, experimental_content: [{ type: "image", data: "HELPER", mimeType: "image/webp" }] }] });
    for (let look = 1; look <= looks; look += 1) {
      messages.push({ role: "assistant", content: [{ type: "tool-call", toolCallId: `s${look}`, toolName: "Screenshot", args: {} }] });
      messages.push({ role: "tool", content: [{ type: "tool-result", toolCallId: `s${look}`, toolName: "Screenshot", result: undefined, experimental_content: [{ type: "image", data: `LOOK${look}`, mimeType: "image/webp" }] }] });
    }
    return messages;
  };
  const images = (looks, wire) => toCoreMessages(history(looks), wire).flatMap((message) => Array.isArray(message.content) ? message.content.filter((part) => part.type === "image").map((part) => part.image) : []);
  for (const wire of ["openai", "anthropic"]) {
    assert.deepEqual(images(7, wire), ["PERSON", "HELPER", "LOOK1", "LOOK2", "LOOK3", "LOOK4", "LOOK5", "LOOK6", "LOOK7"], `${wire}: fewer than eight, all stay`);
    assert.deepEqual(images(8, wire), ["PERSON", "HELPER", "LOOK6", "LOOK7", "LOOK8"], `${wire}: the eighth drops the oldest five`);
    assert.deepEqual(images(12, wire), ["PERSON", "HELPER", "LOOK6", "LOOK7", "LOOK8", "LOOK9", "LOOK10", "LOOK11", "LOOK12"]);
    assert.deepEqual(images(13, wire), ["PERSON", "HELPER", "LOOK11", "LOOK12", "LOOK13"]);
  }
  const dropped = JSON.stringify(toCoreMessages(history(8)));
  assert.match(dropped, /Not shown again: only the latest screenshots are kept; take a new one if you need to look\./);
  // Between drops each request starts with the one before, so the cache holds.
  for (let looks = 8; looks <= 11; looks += 1) {
    const before = JSON.stringify(toCoreMessages(history(looks)));
    const after = JSON.stringify(toCoreMessages(history(looks + 1)));
    assert.ok(after.startsWith(before.slice(0, -1)), `look ${looks + 1} keeps look ${looks}'s history`);
  }
});

/**
 * Runs the real driver against a fake Chrome (an HTTP server with one page
 * target) and a fake playwright-core whose connect fails with a message
 * naming the copy that was found; a fake `npm` on PATH writes a line each
 * time it is asked.
 */
async function runDriver({ nodePath, npmPrints, playwrightRoot }) {
  const { SAND_BROWSER_DRIVER_SOURCE } = await load("source/host/runner/tools/sand-browser-driver-source.ts", "driver-run");
  const dir = await mkdtemp(path.join(os.tmpdir(), "simeon-driver-"));
  const fakePackage = async (folder, label) => {
    await mkdir(path.join(folder, "playwright-core", "lib"), { recursive: true });
    await writeFile(path.join(folder, "playwright-core", "package.json"), JSON.stringify({ name: "playwright-core", main: "index.js" }));
    await writeFile(path.join(folder, "playwright-core", "index.js"), `module.exports = { chromium: { connectOverCDP: async () => { throw new Error("FAKE CONNECT from ${label}"); } } };`);
    await writeFile(path.join(folder, "playwright-core", "lib", "utilsBundle.js"), "const { EventEmitter } = require('node:events'); module.exports = { ws: class extends EventEmitter { constructor() { super(); setImmediate(() => this.emit('error', new Error('no socket'))); } close() {} } };");
  };
  const server = http.createServer((request, response) => {
    response.setHeader("content-type", "application/json");
    if (request.url === "/json/version") response.end(JSON.stringify({ webSocketDebuggerUrl: "ws://127.0.0.1:9/devtools/browser/x" }));
    else if (request.url === "/json/list") response.end(JSON.stringify([{ id: "page-1", type: "page", url: "about:blank" }]));
    else { response.statusCode = 404; response.end("{}"); }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const driverPath = path.join(dir, "driver.mjs");
    await writeFile(driverPath, SAND_BROWSER_DRIVER_SOURCE);
    const bin = path.join(dir, "bin");
    await mkdir(bin);
    const marker = path.join(dir, "npm-calls");
    // What `npm root -g` prints is the global node_modules folder itself.
    const npmGlobal = path.join(dir, "npm-global", "node_modules");
    await fakePackage(npmGlobal, "npm global");
    await writeFile(path.join(bin, "npm"), `#!/bin/sh\necho called >> "${marker}"\n${npmPrints ? `echo "${npmGlobal}"` : ""}\n`);
    await chmod(path.join(bin, "npm"), 0o755);
    let modules = "";
    if (nodePath) {
      modules = path.join(dir, "node-path");
      await fakePackage(modules, "NODE_PATH");
    }
    let hostCopy;
    if (playwrightRoot) {
      hostCopy = path.join(dir, "host-copy");
      await mkdir(path.join(hostCopy, "lib"), { recursive: true });
      await writeFile(path.join(hostCopy, "lib", "playwright-core.cjs"), "const { EventEmitter } = require('node:events'); module.exports = { core: { chromium: { connectOverCDP: async () => { throw new Error('FAKE CONNECT from host copy'); } } }, utilsBundle: { ws: class extends EventEmitter { constructor() { super(); setImmediate(() => this.emit('error', new Error('no socket'))); } close() {} } } };");
    }
    const request = { op: "tabs", action: "list", display: 99, cdpPort: server.address().port, viewId: "agent-1", ...(hostCopy === undefined ? {} : { playwrightRoot: hostCopy }) };
    const child = spawn(process.execPath, [driverPath, Buffer.from(JSON.stringify(request)).toString("base64")], {
      cwd: dir,
      env: { PATH: `${bin}:${process.env.PATH}`, NODE_PATH: modules, HOME: dir },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    await new Promise((resolve) => child.on("exit", resolve));
    const line = stdout.split("\n").find((entry) => entry.startsWith(MARKER));
    assert.ok(line, `the driver answered: ${stdout}`);
    const npmCalls = await readFile(marker, "utf8").then((text) => text.trim().split("\n").filter(Boolean).length, () => 0);
    return { result: JSON.parse(line.slice(MARKER.length)), npmCalls };
  } finally {
    server.close();
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

test("a browser step finds playwright-core in the usual folders without asking npm", async () => {
  const { result, npmCalls } = await runDriver({ nodePath: true, npmPrints: true, playwrightRoot: true });
  assert.equal(result.error, "FAKE CONNECT from NODE_PATH");
  assert.equal(npmCalls, 0, "npm root -g never ran");
});

test("npm's global folder is asked only when the usual folders fail, once per step, before the host's own copy", async () => {
  const fromNpm = await runDriver({ nodePath: false, npmPrints: true, playwrightRoot: true });
  assert.equal(fromNpm.result.error, "FAKE CONNECT from npm global", "the image's copy still wins over the host's");
  assert.equal(fromNpm.npmCalls, 1, "asked once, though the step loaded playwright-core twice (the tab check and the connect)");
  const fromHost = await runDriver({ nodePath: false, npmPrints: false, playwrightRoot: true });
  assert.equal(fromHost.result.error, "FAKE CONNECT from host copy");
  assert.equal(fromHost.npmCalls, 1);
});
