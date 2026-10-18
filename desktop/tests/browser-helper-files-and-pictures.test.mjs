/**
 * Sage's browser helper on a job application (18 October 2026). The first
 * try died on a screenshot error and left Chrome's own file window open on
 * the person's screen: the helper had clicked the résumé field, and no
 * browser tool can work that window. The second hit what it called an
 * image-size error partway through the form: every screenshot stayed in the
 * conversation, and Claude refuses a picture over 2000 pixels on a side
 * once a request holds more than twenty, or over 8000 or 5 MB at any time;
 * a full-page screenshot of a long form is several thousand pixels tall.
 *
 * Now the helper attaches files with browser_upload_file (the window is
 * caught before it opens, and any other caught window is closed and said),
 * a full-page screenshot keeps at most 2000 pixels, and on Claude the
 * latest twenty tool pictures stay while one Claude would refuse becomes a
 * line of text.
 */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHROMIUM = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", process.env.SIMEON_TEST_CHROMIUM ?? ""].find((candidate) => candidate.length > 0 && existsSync(candidate));

async function load(entry, name) {
  const dir = await mkdtemp(path.join(os.tmpdir(), `simeon-${name}-`));
  const outfile = path.join(dir, `${name}.mjs`);
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron"], banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

/** The start of a PNG of this size: enough for the size to be read. */
function pngOf(width, height, bytes = 64) {
  const out = Buffer.alloc(Math.max(bytes, 33));
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(out, 0);
  out.writeUInt32BE(13, 8);
  out.write("IHDR", 12, "latin1");
  out.writeUInt32BE(width, 16);
  out.writeUInt32BE(height, 20);
  return out.toString("base64");
}

/** A helper's conversation: one browser step per screenshot, each picture named by its step. */
function helperSteps(pictures) {
  const messages = [{ role: "user", content: [{ type: "text", text: "Fill in the application" }] }];
  pictures.forEach((picture, index) => {
    messages.push({ role: "assistant", content: [{ type: "tool-call", toolCallId: `b${index + 1}`, toolName: "browser_fill", args: {} }] });
    messages.push({ role: "tool", content: [{ type: "tool-result", toolCallId: `b${index + 1}`, toolName: "browser_fill", result: undefined, experimental_content: [{ type: "text", text: "Filled" }, { type: "image", data: picture, mimeType: "image/png" }] }] });
  });
  return messages;
}

const imagesSent = (messages) => messages.flatMap((message) => Array.isArray(message.content) ? message.content.filter((part) => part.type === "image").map((part) => part.image) : []);
const textSent = (messages) => messages.flatMap((message) => Array.isArray(message.content) ? message.content.filter((part) => part.type === "text").map((part) => part.text) : []).join("\n");

test("on Claude the latest twenty tool pictures stay, older ones going five at a time; GPT keeps them all", async () => {
  const { module, dispose } = await load("source/host/extensions/inference/provider-session.ts", "claude-pictures");
  try {
    const { toCoreMessages, SIMEON_CLAUDE_KEPT_TOOL_IMAGES } = module;
    assert.equal(SIMEON_CLAUDE_KEPT_TOOL_IMAGES, 20);
    const steps = (count) => helperSteps(Array.from({ length: count }, (_, index) => `STEP${index + 1}`));
    const names = (count, wire) => imagesSent(toCoreMessages(steps(count), wire));
    assert.equal(names(24, "anthropic").length, 24, "under twenty-five, nothing goes");
    assert.deepEqual(names(25, "anthropic"), Array.from({ length: 20 }, (_, index) => `STEP${index + 6}`));
    assert.equal(names(29, "anthropic").length, 24);
    assert.deepEqual(names(30, "anthropic"), Array.from({ length: 20 }, (_, index) => `STEP${index + 11}`));
    assert.equal(names(60, "openai").length, 60, "the GPT wire keeps every one, as before");
    assert.match(textSent(toCoreMessages(steps(25), "anthropic")), /Not shown again: only the latest screenshots are kept/);
  } finally {
    await dispose();
  }
});

test("a picture Claude would refuse becomes a line of text; one it takes is sent as it was", async () => {
  const { module, dispose } = await load("source/host/extensions/inference/provider-session.ts", "claude-picture-limits");
  try {
    const { toCoreMessages, claudeImageRefusal } = module;
    const screen = pngOf(1280, 800);
    const longPage = pngOf(1280, 5400);
    const huge = pngOf(1280, 9000);
    // A few pictures: up to 8000 a side.
    let sent = toCoreMessages(helperSteps([screen, longPage, huge]), "anthropic");
    assert.deepEqual(imagesSent(sent), [screen, longPage]);
    assert.match(textSent(sent), /A picture of 1280×9000 pixels, 0 KB was left out: Claude takes none over 8000 pixels on a side or 5 MB/);
    // More than twenty: 2000 a side, as Claude counts them.
    const many = [...Array.from({ length: 21 }, () => screen), longPage];
    sent = toCoreMessages(helperSteps(many), "anthropic");
    assert.equal(imagesSent(sent).length, 21);
    assert.ok(imagesSent(sent).every((image) => image === screen));
    assert.match(textSent(sent), /A picture of 1280×5400 pixels.*over 2000 pixels on a side/);
    // Over 5 MB at any count.
    const heavy = pngOf(1280, 800, 5 * 1024 * 1024 + 1);
    assert.match(claudeImageRefusal(heavy, 8000), /5120 KB was left out/);
    assert.equal(claudeImageRefusal(screen, 2000), undefined);
    // An address or a picture whose size can't be read is left to Claude.
    assert.equal(claudeImageRefusal("https://example.com/a.png", 2000), undefined);
    assert.equal(claudeImageRefusal(Buffer.from("not a picture").toString("base64"), 2000), undefined);
    // The GPT wire is not touched.
    assert.deepEqual(imagesSent(toCoreMessages(helperSteps([screen, longPage, huge]), "openai")), [screen, longPage, huge]);
  } finally {
    await dispose();
  }
});

test("the helper's browser_upload_file is offered with its ref, paths and purpose, and Auto-review sees the files", async () => {
  const { module, dispose } = await load("source/host/runner/tools/sand-browser-tools.ts", "upload-tool");
  try {
    const tools = module.createSandBrowserTools({ getBoxId: () => "box", getDefaultViewId: () => "view" });
    const upload = tools.find((tool) => tool.name === "browser_upload_file");
    assert.ok(upload, "offered to the browser helper");
    assert.equal(upload.op, "upload_file");
    assert.deepEqual(upload.schema.required, ["ref", "paths", "element"]);
    assert.match(upload.description, /Never browser_click an upload button/);
    assert.match(upload.description, /\/workspace\/uploads/);
    const action = module.toBrowserReviewAction("upload_file", { ref: "e4", element: "Résumé field", paths: ["/workspace/uploads/cv.pdf"] }, "view");
    assert.deepEqual(action.values, ["/workspace/uploads/cv.pdf"]);
    assert.deepEqual(module.toBrowserReviewAction("upload_file", { ref: "e4", paths: "/workspace/uploads/cv.pdf" }, "view").values, ["/workspace/uploads/cv.pdf"]);
    const screenshot = tools.find((tool) => tool.name === "browser_take_screenshot");
    assert.match(screenshot.description, /up to 2000 pixels/);
  } finally {
    await dispose();
  }
});

// A job application as the stores draw them: a styled button for the hidden
// résumé field, a plain cover-letter field, and a page far taller than 2000.
const APPLICATION = `<!doctype html><html><body style="margin:0">
  <h1>Apply</h1>
  <input id="cv" type="file" style="display:none" onchange="document.getElementById('cv-name').textContent = 'Résumé: ' + this.files[0].name">
  <button onclick="document.getElementById('cv').click()">Upload résumé</button>
  <p id="cv-name">No résumé</p>
  <label for="letter">Cover letter</label><input id="letter" type="file" onchange="document.getElementById('letter-name').textContent = 'Letter: ' + this.files[0].name">
  <p id="letter-name">No letter</p>
  <button onclick="this.textContent = 'Saved'">Save</button>
  <div style="height: 5200px"></div>
  <p>End of the form</p>
</body></html>`;

test("the helper attaches files without Chrome's file window, says when a click opened one, and a full-page shot keeps 2000 pixels", { skip: CHROMIUM === undefined ? "no Chromium here" : false, timeout: 90_000 }, async (t) => {
  // The driver attaches files from /workspace only, as on the box; a Mac has none to make.
  const madeWorkspace = !existsSync("/workspace");
  try {
    await mkdir("/workspace/uploads", { recursive: true });
  } catch {
    t.skip("no /workspace here");
    return;
  }
  const { createServer } = await import("node:http");
  const { spawn } = await import("node:child_process");
  const { module, dispose } = await load("source/host/runner/tools/sand-browser-driver-source.ts", "driver-upload");
  const { readImageFileDimensions } = (await load("source/shared/media/image-dimensions.ts", "dimensions")).module;
  const site = createServer((request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(APPLICATION);
  });
  await new Promise((resolve) => site.listen(0, "127.0.0.1", resolve));
  const dir = await mkdtemp(path.join(os.tmpdir(), "simeon-driver-upload-"));
  const driverDir = path.join(repoRoot, `.tmp-driver-upload-${process.pid}`);
  const driver = path.join(driverDir, "driver.mjs");
  const port = 9300 + (process.pid % 250);
  const display = 800 + (process.pid % 90);
  // The person's attachment, where the box keeps them, and a file outside the workspace.
  const workspaceFile = "/workspace/uploads/simeon-test-cv.pdf";
  const chrome = spawn(CHROMIUM, ["--headless=new", "--no-sandbox", "--no-first-run", `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(dir, "profile")}`, "about:blank"], { stdio: "ignore" });
  const drive = async (request) => {
    const encoded = Buffer.from(JSON.stringify({ display, cdpPort: port, viewId: "test", ...request })).toString("base64");
    const child = spawn(process.execPath, [driver, encoded], { stdio: ["ignore", "pipe", "inherit"] });
    let out = "";
    child.stdout.on("data", (chunk) => { out += chunk; });
    await new Promise((resolve) => child.on("exit", resolve));
    const marker = out.lastIndexOf(module.SAND_BROWSER_RESULT_MARKER);
    return JSON.parse(out.slice(marker + module.SAND_BROWSER_RESULT_MARKER.length).trim());
  };
  try {
    await mkdir(driverDir, { recursive: true });
    await writeFile(driver, module.SAND_BROWSER_DRIVER_SOURCE);
    await writeFile(workspaceFile, "%PDF-1.4 test");
    const outside = path.join(dir, "secret.txt");
    await writeFile(outside, "not for a page");
    for (let tries = 0; tries < 50; tries += 1) {
      if (await fetch(`http://127.0.0.1:${port}/json/version`).then(() => true, () => false)) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal((await drive({ op: "navigate", url: `http://127.0.0.1:${site.address().port}/` })).ok, true);
    const read = async () => {
      const snapshot = await drive({ op: "snapshot" });
      assert.equal(snapshot.ok, true, JSON.stringify(snapshot));
      return snapshot.data;
    };
    const refOf = (text, label) => {
      const line = text.split("\n").find((one) => one.includes(label) && one.includes("[ref="));
      assert.ok(line, `${label} is read:\n${text}`);
      return /\[ref=([a-z0-9]+)\]/.exec(line)[1];
    };
    let page = await read();
    const uploadButton = refOf(page, 'button "Upload résumé"');

    // A plain click on the upload button: the window is caught, closed, and said.
    const clicked = await drive({ op: "click", ref: uploadButton, element: "Upload résumé button" });
    assert.equal(clicked.ok, true, JSON.stringify(clicked));
    assert.match(clicked.summary, /That opened a file picker, which was closed with nothing chosen\. To attach a file there, call browser_upload_file/);
    // A click that opens none says nothing of it.
    const saved = await drive({ op: "click", ref: refOf(page, 'button "Save"'), element: "Save button" });
    assert.equal(saved.ok, true);
    assert.doesNotMatch(saved.summary, /file picker/);

    // Through the styled button, then straight into a file field.
    const attached = await drive({ op: "upload_file", ref: uploadButton, element: "Upload résumé button", paths: [workspaceFile] });
    assert.equal(attached.ok, true, JSON.stringify(attached));
    assert.equal(attached.summary, "Attached simeon-test-cv.pdf to Upload résumé button");
    page = await read();
    const letter = await drive({ op: "upload_file", ref: refOf(page, "Cover letter"), element: "Cover letter field", paths: "uploads/simeon-test-cv.pdf" });
    assert.equal(letter.ok, true, JSON.stringify(letter));
    page = await read();
    assert.match(page, /Résumé: simeon-test-cv\.pdf/);
    assert.match(page, /Letter: simeon-test-cv\.pdf/);

    // Refused: nothing there, outside the workspace, nothing asked, a button that opens no window.
    const missing = await drive({ op: "upload_file", ref: uploadButton, element: "Upload résumé button", paths: ["/workspace/uploads/nothing-here.pdf"] });
    assert.equal(missing.ok, false);
    assert.match(missing.error, /No file at \/workspace\/uploads\/nothing-here\.pdf on your computer/);
    const outsideTry = await drive({ op: "upload_file", ref: uploadButton, element: "Upload résumé button", paths: [outside] });
    assert.equal(outsideTry.ok, false);
    assert.match(outsideTry.error, /Only files in \/workspace can be attached to a page/);
    assert.match((await drive({ op: "upload_file", ref: uploadButton, element: "Upload résumé button", paths: [] })).error, /needs paths/);
    const noWindow = await drive({ op: "upload_file", ref: refOf(page, 'button "Saved"'), element: "Save button", paths: [workspaceFile] });
    assert.equal(noWindow.ok, false);
    assert.match(noWindow.error, /opened no file picker/);

    // A full-page shot of the long form keeps 2000 pixels, from where the page is scrolled.
    const screenshotPath = path.join(dir, "full.png");
    const shot = await drive({ op: "screenshot", fullPage: true, screenshotPath });
    assert.equal(shot.ok, true, JSON.stringify(shot));
    assert.equal(shot.screenshot, true);
    assert.match(shot.summary, /The page is \d+×\d+ pixels; the picture shows 2000 of them, from 0 to 2000\. Scroll and take another/);
    const size = readImageFileDimensions(await readFile(screenshotPath));
    assert.equal(size.height, 2000);
    assert.ok(size.width <= 2000);
    // The visible window, as every action returns, is untouched.
    const windowPath = path.join(dir, "window.png");
    const plain = await drive({ op: "screenshot", screenshotPath: windowPath });
    assert.doesNotMatch(plain.summary, /picture shows/);
    assert.ok(readImageFileDimensions(await readFile(windowPath)).height < 2000);
  } finally {
    chrome.kill("SIGKILL");
    site.close();
    await rm(driverDir, { recursive: true, force: true });
    await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    await rm(workspaceFile, { force: true });
    if (madeWorkspace) await rm("/workspace", { recursive: true, force: true });
    await rm(`/tmp/.sand-browser/views-${display}.json`, { force: true });
    await dispose();
  }
});
