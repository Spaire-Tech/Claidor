import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function load() {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "caisra-routed-tools-"));
  const output = path.join(temporary, "routed-agent-tools.mjs");
  await build({
    entryPoints: [path.join(repoRoot, "source/host/extensions/transcript/routed-agent-tools.ts")],
    outfile: output,
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node22",
  });
  const module = await import(`${pathToFileURL(output).href}?${Date.now()}`);
  return { module, dispose: () => rm(temporary, { recursive: true, force: true }) };
}

test("CopyToBox on the host only asks; it does not read the Mac path", async () => {
  const loaded = await load();
  try {
    const asks = [];
    const { executeRoutedAgentTool, isRoutedLocalToolAskOpen } = loaded.module;
    const host = {
      transcript: { appendSendMessage: async () => ({ id: "t0s0" }) },
      localToolPermission: {
        subscribe() { return () => {}; },
        authorize: async (_scope, request) => {
          asks.push(request);
          return { allowed: true };
        },
      },
    };
    const result = await executeRoutedAgentTool(host, {
      agentId: "agent-1",
      name: "CopyToBox",
      args: { computer_path: "/Users/bass/secret.txt", box_path: "/workspace/uploads/secret.txt" },
      toolCallId: "call-1",
    });
    assert.deepEqual(result, { allowed: true });
    assert.deepEqual(asks, [{ action: "read-file", target: "/Users/bass/secret.txt" }]);
    assert.equal(isRoutedLocalToolAskOpen("agent-1"), false);
  } finally {
    await loaded.dispose();
  }
});

test("WriteBoxFile lands bytes on the box after Mac has already read them", async () => {
  const loaded = await load();
  const workspace = await mkdtemp(path.join(os.tmpdir(), "caisra-box-write-"));
  try {
    const { executeRoutedAgentTool } = loaded.module;
    const dest = path.join(workspace, "uploads", "note.txt");
    const result = await executeRoutedAgentTool({
      transcript: { appendSendMessage: async () => ({ id: "t0s0" }) },
      localToolPermission: { subscribe() { return () => {}; }, authorize: async () => ({ allowed: true }) },
    }, {
      agentId: "agent-1",
      name: "WriteBoxFile",
      args: { path: dest, bytesBase64: Buffer.from("hello from mac").toString("base64") },
    });
    assert.match(String(result), /Copied onto your box/);
    assert.equal(await readFile(dest, "utf8"), "hello from mac");
  } finally {
    await rm(workspace, { recursive: true, force: true });
    await loaded.dispose();
  }
});

test("CopyFromBox authorizes then returns box bytes, not a Mac write", async () => {
  const loaded = await load();
  const workspace = await mkdtemp(path.join(os.tmpdir(), "caisra-box-read-"));
  try {
    const boxPath = path.join(workspace, "from-box.txt");
    await mkdir(workspace, { recursive: true });
    await writeFile(boxPath, "box bytes");
    const { executeRoutedAgentTool } = loaded.module;
    const result = await executeRoutedAgentTool({
      transcript: { appendSendMessage: async () => ({ id: "t0s0" }) },
      localToolPermission: {
        subscribe() { return () => {}; },
        authorize: async () => ({ allowed: true }),
      },
    }, {
      agentId: "agent-1",
      name: "CopyFromBox",
      args: { box_path: boxPath, computer_path: "/Users/bass/Downloads/from-box.txt" },
    });
    assert.equal(result.allowed, true);
    assert.equal(Buffer.from(result.bytesBase64, "base64").toString("utf8"), "box bytes");
    assert.equal(result.boxPath, boxPath);
  } finally {
    await rm(workspace, { recursive: true, force: true });
    await loaded.dispose();
  }
});
