import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function load(entry, name) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), `caisra-${name}-`));
  const output = path.join(temporary, `${name}.mjs`);
  await build({
    entryPoints: [path.join(repoRoot, entry)],
    outfile: output,
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node22",
  });
  const module = await import(`${pathToFileURL(output).href}?${Date.now()}`);
  return { module, dispose: () => rm(temporary, { recursive: true, force: true }) };
}

test("host intro widgets and Allow cards become later-turn chat history", async () => {
  const loaded = await load("source/shared/grok-bot-transcript.ts", "grok-bot-transcript");
  try {
    const { chatMessageFromTranscriptEntry, mergeHostAndLocalChatHistory } = loaded.module;
    const widget = chatMessageFromTranscriptEntry({
      id: "t0s0",
      kind: "send-message",
      message: {
        type: "widget",
        widget: { prompt: "What first?", options: [{ label: "Research" }, { label: "Inbox" }] },
      },
    });
    assert.equal(widget.role, "assistant");
    assert.match(widget.content, /What first\?/);
    assert.match(widget.content, /Research/);
    const allow = chatMessageFromTranscriptEntry({
      id: "t1s0",
      kind: "send-message",
      message: {
        type: "local-tool-permission",
        ask: { action: "run-command", target: "du -sh ~", status: "pending" },
      },
    });
    assert.equal(allow.role, "assistant");
    assert.match(allow.content, /du -sh ~/);
    const merged = mergeHostAndLocalChatHistory({
      remoteEntries: [
        { id: "t0s0", kind: "send-message", message: { type: "text", content: "Hey — I'm Bass." } },
        { id: "t0u", kind: "message", role: "user", content: "hello" },
      ],
      localMessages: [
        { role: "user", content: "hello", id: "t0u" },
        { role: "assistant", content: "later", id: "t1s0" },
      ],
    });
    assert.deepEqual(merged.map(row => row.id), ["t0s0", "t0u", "t1s0"]);
    assert.equal(merged[0].content, "Hey — I'm Bass.");
  } finally {
    await loaded.dispose();
  }
});
