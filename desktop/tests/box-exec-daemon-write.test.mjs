/**
 * The box's exec daemon writes files (2 October 2026). It answered every
 * write BOX_EXEC_UNSUPPORTED, so the browser driver the host stages in
 * /tmp/.sand-browser never landed (the browserUse child could not run at all)
 * and attachments never reached /workspace/uploads.
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
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

test("the daemon writes into the workspace and the box's temp folder, and refuses anywhere else", async () => {
  const daemon = await load("source/box-exec-daemon/server.ts", "box-exec-daemon");
  const workspace = await mkdtemp(path.join(os.tmpdir(), "simeon-ws-"));
  const outside = await mkdtemp(path.join(os.homedir(), ".simeon-outside-"));
  const handle = await daemon.module.startBoxExecDaemon({ workspaceRoot: workspace, port: 0, host: "127.0.0.1", authToken: "t" });
  try {
    const call = async (args) => {
      const response = await fetch(`${handle.url}/agent.v1.ExecService/Exec`, {
        method: "POST",
        headers: { authorization: "Bearer t", "content-type": "application/connect+json", "connect-protocol-version": "1" },
        body: envelope({ id: 1, writeArgs: args }),
      });
      const frames = decodeFrames(new Uint8Array(await response.arrayBuffer()));
      const result = frames.map((frame) => frame?.execClientMessage?.writeResult).find(Boolean);
      const thrown = frames.map((frame) => frame?.execClientControlMessage?.throw).find(Boolean);
      return result ?? { thrown };
    };

    const bytes = Buffer.from("console.log('driver')\n", "utf8").toString("base64");
    const driver = path.join(os.tmpdir(), `.sand-browser-test-${process.pid}`, "driver-v2.mjs");
    const staged = await call({ path: driver, fileBytes: bytes, toolCallId: "t1" });
    assert.equal(staged.success?.fileSize, 22, JSON.stringify(staged));
    assert.equal(await readFile(driver, "utf8"), "console.log('driver')\n");

    const upload = await call({ path: "/workspace/uploads/data.csv", fileText: "a,b\n1,2\n", toolCallId: "t2" });
    assert.equal(upload.success?.linesCreated, 3, JSON.stringify(upload));
    assert.equal(await readFile(path.join(workspace, "uploads/data.csv"), "utf8"), "a,b\n1,2\n");

    const escaped = await call({ path: path.join(outside, "x.txt"), fileText: "no", toolCallId: "t3" });
    assert.ok(escaped.rejected, JSON.stringify(escaped));

    await symlink(path.join(outside, "target.txt"), path.join(workspace, "link.txt"));
    const linked = await call({ path: "/workspace/link.txt", fileText: "no", toolCallId: "t4" });
    assert.ok(linked.rejected, JSON.stringify(linked));
    await assert.rejects(readFile(path.join(outside, "target.txt")), "a symlink in the workspace is not followed out of it");

    await writeFile(path.join(workspace, "kept.txt"), "old");
    const replaced = await call({ path: "kept.txt", fileText: "new", toolCallId: "t5" });
    assert.equal(replaced.success?.path, "kept.txt");
    assert.equal(await readFile(path.join(workspace, "kept.txt"), "utf8"), "new");
    await rm(path.dirname(driver), { recursive: true, force: true });
  } finally {
    await handle.stop();
    await rm(workspace, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
    await daemon.dispose();
  }
});

function envelope(message) {
  const body = Buffer.from(JSON.stringify(message), "utf8");
  const frame = Buffer.alloc(5 + body.length);
  frame.writeUInt8(0, 0);
  frame.writeUInt32BE(body.length, 1);
  body.copy(frame, 5);
  return frame;
}

function decodeFrames(bytes) {
  const frames = [];
  let offset = 0;
  while (offset + 5 <= bytes.length) {
    const flags = bytes[offset];
    const length = new DataView(bytes.buffer, bytes.byteOffset + offset + 1, 4).getUint32(0);
    const body = Buffer.from(bytes.subarray(offset + 5, offset + 5 + length)).toString("utf8");
    offset += 5 + length;
    if ((flags & 0x02) === 0) frames.push(JSON.parse(body));
  }
  return frames;
}
