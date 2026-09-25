/**
 * Cards and files (25 September 2026, design-audit-ledger.md clusters
 * `box-handoff`, `attachment-topology` and `attachment-limits`).
 *
 * The host runs inside the box, so an attached file's ingested path is a
 * box path; the note told the agent it lived on the user's computer and
 * sent it to ExternalRead and CopyToBox for a file the Mac does not hold.
 * The staged copy was named by its hash. A file over the limit became a
 * dead card while the agent read "sent". An attachment could be made of
 * the box's credential mount. The PDF text cache never invalidated. Link
 * previews sent every pasted hostname to Google. CopyFromBox dropped files
 * in the home folder root. And the box hand-off tool, ordered by the
 * brief, was never offered by the production toolset.
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = (file) => readFile(path.join(repoRoot, "source", file), "utf8");

async function load(entry, name) {
  const dir = await mkdtemp(path.join(os.tmpdir(), `caisra-${name}-`));
  const outfile = path.join(dir, `${name}.mjs`);
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron"], banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

test("the attached-files note says the file is on the box, under its name, and never sends the agent to the Mac for it", async () => {
  const { module, dispose } = await load("source/host/runner/system-prompt.ts", "attached-note");
  try {
    const paths = ["/home/box/sand-data/agents/a1/attachments/abc123.xlsx"];
    const note = module.buildAttachedFilesNote(paths, new Map([[paths[0], "/workspace/uploads/budget.xlsx"]]), new Map([[paths[0], 2048]]), new Map([[paths[0], "budget.xlsx"]]));
    assert.match(note, /Each is on your computer \(the box\) at the path shown: open it with Read/);
    assert.match(note, /- budget\.xlsx: \/home\/box\/sand-data\/agents\/a1\/attachments\/abc123\.xlsx \(2\.0 KB\) \(also at \/workspace\/uploads\/budget\.xlsx\)/);
    assert.match(note, /never hand them to ExternalRead, ExternalShell or CopyToBox/);
    assert.doesNotMatch(note, /live on the user's computer|read them with ExternalRead/);
    assert.match(module.DEFAULT_SAND_SYSTEM_PROMPT, /are copied onto your computer \(the box\) when they attach them/);
    assert.match(module.DEFAULT_SAND_SYSTEM_PROMPT, /up to 25 MB, 200 MB for a video; a larger file goes to the user with CopyFromBox/);
  } finally {
    await dispose();
  }
});

test("staging keeps the original name, avoids collisions, and reports a failed upload", async () => {
  const { module, dispose } = await load("source/host/extensions/attachments/box-staging.ts", "box-staging");
  try {
    const dir = await mkdtemp(path.join(os.tmpdir(), "caisra-staging-src-"));
    const { writeFile } = await import("node:fs/promises");
    const a = path.join(dir, "1111.csv"); const b = path.join(dir, "2222.csv");
    await writeFile(a, "a"); await writeFile(b, "b");
    const uploaded = [];
    const lines = [];
    const deps = { ctx: {}, box: { runState: async () => "running" }, resolveOwnerDir: () => "/owner", report: (line) => lines.push(line), upload: async (_ctx, _box, _id, files) => { uploaded.push(...files.map((file) => file.boxPath)); } };
    const staged = await module.stageAttachmentsIntoBox(deps, "a1", [a, b], new Map([[a, "data.csv"], [b, "data.csv"]]));
    assert.deepEqual([...staged.values()], ["/workspace/uploads/data.csv", "/workspace/uploads/data-2.csv"]);
    assert.deepEqual(uploaded, ["/workspace/uploads/data.csv", "/workspace/uploads/data-2.csv"]);
    const failing = { ...deps, upload: async () => { throw new Error("writeArgs unsupported"); } };
    assert.deepEqual([...(await module.stageAttachmentsIntoBox(failing, "a1", [a])).entries()], []);
    assert.match(lines.join("\n"), /staging into \/workspace\/uploads failed \(1 file\(s\)\): writeArgs unsupported/);
    await rm(dir, { recursive: true, force: true });
  } finally {
    await dispose();
  }
});

test("an attachment is never the credential mount or a sign-in file, and a too-large file is a tool error", async () => {
  const { module, dispose } = await load("source/host/extensions/attachments/attachments-service.ts", "attachments-service");
  try {
    assert.match(module.attachmentSourceRefusal("/run/grok-bot/inference.json", "/home/box/sand-data"), /holds credentials or the system/);
    assert.match(module.attachmentSourceRefusal("/proc/self/environ", "/home/box/sand-data"), /holds credentials or the system/);
    assert.match(module.attachmentSourceRefusal("/home/box/sand-data/secrets/store.json", "/home/box/sand-data"), /secret store is never sent/);
    assert.match(module.attachmentSourceRefusal("/home/box/sand-data/vendor-mcp-installs.json", "/home/box/sand-data"), /holds sign-ins/);
    assert.equal(module.attachmentSourceRefusal("/workspace/report.docx", "/home/box/sand-data"), null);
  } finally {
    await dispose();
  }
  const send = await src("host/runner/tools/send-message-tool.ts");
  assert.match(send, /if \(error instanceof AttachmentTooLargeError\) throw new SandToolInputError\(/);
  const service = await src("host/extensions/attachments/attachments-service.ts");
  assert.doesNotMatch(service, /fetchImageAsDataUrl\(googleFaviconUrl\(hostname\)\)/);
  assert.match(service, /fetchImageAsDataUrl\(`\$\{fetched\.finalUrl\.origin\}\/favicon\.ico`\)/);
  const read = await src("packages/agent/tools/core/read/read.ts");
  assert.match(read, /const cacheKey = createHash\("sha256"\)\.update\(output\.value\)\.digest\("hex"\);/);
  assert.match(read, /PDF_TEXT_CACHE_MAX_ENTRIES = 32/);
  assert.match(await src("electron-main/attachments/attachment-manager.ts"), /isWithinDesktopAttachmentStaging\(filePath\) \? await readDesktopImageAttachment\(filePath, deps\) : null/);
  assert.match(await src("host/runner/tools/sand-file-transfer-tools.ts"), /posix\.join\("Downloads", posix\.basename\(boxPath\)\)/);
});

test("the production toolset offers request_box_help, bound to the session's hand-off service", async () => {
  const composition = await src("host/host-runner-composition.ts");
  assert.match(composition, /createRequestBoxHelpToolInputs: turn => \(\{\n\s*dependencies: \{\n\s*getAgentId: \(\) => session\.id,\n\s*endTurn: \(\) => \{ turn\.endThisRunAwaitingUser\?\.\("request_box_help"\); \},/);
  assert.match(composition, /const start = method\(extensions\.api\("session"\), "startHandoff"\);/);
  assert.match(await src("host/runner/tools/box-help-tool.ts"), /"acme\.okta\.com"/);
  assert.doesNotMatch(await src("shared/local-tool-permission-machinery.ts"), /Settings → Agent → Execution on Local Computer/);
});
