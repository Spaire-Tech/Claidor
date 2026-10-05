import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

// 5 October 2026: a user turn that ends on plain assistant text with no
// SendMessage is delivered by the host as the turn's message instead of
// discarded and nudged (a whole hidden turn, OpenAI log of 3–4 October).

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadModule() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "simeon-plain-text-reply-"));
  const outfile = path.join(dir, "plain-text-reply.mjs");
  await build({ entryPoints: [path.join(repoRoot, "source/host/runner/plain-text-reply.ts")], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent" });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

test("plain text at the end of a visible user turn is the reply; hidden turns, subagents, sent turns and data are not", async () => {
  const { module, dispose } = await loadModule();
  try {
    const { plainTextReplyToDeliver, PLAIN_TEXT_REPLY_MAX_CHARS } = module;
    const base = { text: "  Anytime, Bass.  ", sentMessageCount: 0, reacted: false, hidden: false, isSubagentRunner: false };
    assert.equal(plainTextReplyToDeliver(base), "Anytime, Bass.");
    assert.equal(plainTextReplyToDeliver({ ...base, hidden: true }), null, "a routine or a nudge keeps its silence");
    assert.equal(plainTextReplyToDeliver({ ...base, isSubagentRunner: true }), null);
    assert.equal(plainTextReplyToDeliver({ ...base, sentMessageCount: 1 }), null, "the model already spoke through SendMessage");
    assert.equal(plainTextReplyToDeliver({ ...base, reacted: true }), null);
    assert.equal(plainTextReplyToDeliver({ ...base, text: "   " }), null);
    assert.equal(plainTextReplyToDeliver({ ...base, text: '{"final":true}' }), null, "JSON is not a reply");
    assert.equal(plainTextReplyToDeliver({ ...base, text: "<thinking>hm</thinking>" }), null);
    assert.equal(plainTextReplyToDeliver({ ...base, text: 'SendMessage({"type":"text"})' }), null, "a tool call written as text is not a reply");
    assert.equal(plainTextReplyToDeliver({ ...base, text: "x".repeat(PLAIN_TEXT_REPLY_MAX_CHARS + 1) }), null);
  } finally {
    await dispose();
  }
});
