import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

// Every attachment said "Couldn't attach" (7 October 2026). The stage step named
// its file with `crypto.randomUUID` taken off the global Web Crypto object and
// called on its own, which throws "Value of 'this' must be of type Crypto"; the
// unit tests injected their own randomUUID and never ran that line. This test
// stages and commits through the production wiring, with nothing injected.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("a file staged through the production attachment wiring is written, then uploaded to the computer", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "simeon-attach-stage-"));
  const previousHome = process.env.HOME;
  try {
    const output = path.join(temporary, "gateway.mjs");
    await build({ entryPoints: [path.join(repoRoot, "source/electron-main/adapters/attachment-gateway.ts")], outfile: output, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron"], banner: { js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);' } });
    process.env.HOME = temporary;
    const { createProductionAttachmentGatewayBinding } = await import(`${pathToFileURL(output).href}?${Date.now()}`);
    const electron = { app: { getPath: () => temporary }, BrowserWindow: function BrowserWindow() {}, dialog: { showSaveDialog() {}, showMessageBox() {} }, nativeImage: { createFromBuffer() {}, createFromDataURL() {} } };
    const uploads = [];
    const legs = { readAttachmentImage: async () => null, readAttachmentText: async () => null, readAttachmentChunk: async () => null, uploadAttachment: async (request) => { uploads.push(request); return { path: `/home/box/uploads/${request.filename}` }; } };
    const port = createProductionAttachmentGatewayBinding(electron).create({ coordinatorLegs: { legs }, getMainWindow: () => null, readTelemetry: () => null });

    const bytes = new TextEncoder().encode("%PDF-1.7 declarations page");
    const staged = await port.stageBytes("declarations page.pdf", bytes);
    assert.equal(staged.ok, true, `staged: ${JSON.stringify(staged)}`);
    assert.match(staged.path, /attachment-staging[\\/]\d+-[0-9a-f-]{36}\.pdf$/);
    assert.deepEqual(new Uint8Array(await readFile(staged.path)), bytes);

    const committed = await port.commitStaged([staged.path], ["declarations page.pdf"]);
    assert.deepEqual(committed, ["/home/box/uploads/declarations page.pdf"]);
    assert.equal(Buffer.from(uploads[0].bytesBase64, "base64").toString(), "%PDF-1.7 declarations page");

    // Two files staged in the same millisecond still get two names.
    const [first, second] = await Promise.all([port.stageBytes("a.png", new Uint8Array([1])), port.stageBytes("b.png", new Uint8Array([2]))]);
    assert.notEqual(first.path, second.path);
    assert.ok(existsSync(first.path) && existsSync(second.path));
  } finally {
    if (previousHome === undefined) delete process.env.HOME; else process.env.HOME = previousHome;
    await rm(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});

test("the stage step takes randomUUID from node:crypto, never off the global object", async () => {
  const source = await readFile(path.join(repoRoot, "source/electron-main/attachments/attachments.ts"), "utf8");
  assert.match(source, /^import \{ randomUUID \} from "node:crypto";$/m);
  assert.doesNotMatch(source, /\?\? crypto\.randomUUID\)/);
});
