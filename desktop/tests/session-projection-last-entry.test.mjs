/**
 * The sidebar row draws each agent's last entry from the host's session
 * summary. The pinned renderer reads an attachment entry as
 * { kind: "attachment", count, kinds: [{ kind, count }] } and calls
 * .filter on `kinds`. On 23 September 2026 the host sent kinds as an
 * object, and the first Markdown file an agent sent crashed the window
 * ("TypeError: n.filter is not a function") on every launch after.
 */
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadProjection() {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "simeon-session-projection-"));
  const output = path.join(temporary, "projection.mjs");
  await build({ entryPoints: [path.join(repoRoot, "source/host/extensions/session/session-projection.ts")], outfile: output, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent" });
  const module = await import(`${pathToFileURL(output).href}?${Date.now()}`);
  return { module, dispose: () => rm(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }) };
}

// What the renderer does with the entry (its `Yun`/`Zun`, verbatim in shape).
const KIND_NAMES = { image: "image", video: "video", audio: "audio file", pdf: "PDF", markdown: "Markdown file", table: "spreadsheet", json: "JSON file", text: "text file", document: "document", archive: "archive", file: "file" };
function rendererPreview(entry) {
  const kinds = (entry.kinds == null || entry.kinds.length === 0) ? [] : entry.kinds.filter((k) => k.count > 0).map((k) => KIND_NAMES[k.kind] != null ? k : { kind: "file", count: k.count });
  if (kinds.length === 0) return `Sent ${entry.count} file`;
  if (kinds.length === 1) return `Sent ${entry.count} ${KIND_NAMES[kinds[0].kind]}`;
  return `Sent ${entry.count} files · ${kinds.map((k) => `${k.count} ${KIND_NAMES[k.kind]}`).join(", ")}`;
}

test("an agent's sent Markdown file becomes a last entry the renderer can draw", async () => {
  const { module, dispose } = await loadProjection();
  try {
    const entries = [
      { id: "t1u", kind: "message", content: "make me a markdown of the plan" },
      { id: "t1s0", kind: "send-message", message: { type: "attachment", url: "/home/user/plan.md", file_name: "plan.md" }, batchId: "b1" },
    ];
    const entry = module.getLastEntryFromTranscript(entries);
    assert.deepEqual(entry, { kind: "attachment", count: 1, kinds: [{ kind: "markdown", count: 1 }] });
    assert.equal(rendererPreview(entry), "Sent 1 Markdown file");
  } finally {
    await dispose();
  }
});

test("a batch of mixed attachments counts each kind, in the renderer's vocabulary", async () => {
  const { module, dispose } = await loadProjection();
  try {
    const entries = [
      { id: "t2s0", kind: "send-message", message: { type: "attachment", url: "/x/a.png", file_name: "a.png" }, batchId: "b2" },
      { id: "t2s1", kind: "send-message", message: { type: "attachment", url: "/x/b.png", file_name: "b.png" }, batchId: "b2" },
      { id: "t2s2", kind: "send-message", message: { type: "attachment", url: "/x/report.pdf", file_name: "report.pdf" }, batchId: "b2" },
      { id: "t2s3", kind: "send-message", message: { type: "attachment", url: "/x/data.csv", file_name: "data.csv" }, batchId: "b2" },
      { id: "t2s4", kind: "send-message", message: { type: "attachment", url: "/x/blob.bin", file_name: "blob.bin" }, batchId: "b2" },
    ];
    const entry = module.getLastEntryFromTranscript(entries);
    assert.equal(entry.count, 5);
    assert.ok(Array.isArray(entry.kinds), "kinds is an array the renderer can filter");
    assert.deepEqual(entry.kinds, [{ kind: "image", count: 2 }, { kind: "pdf", count: 1 }, { kind: "table", count: 1 }, { kind: "file", count: 1 }]);
    assert.equal(rendererPreview(entry), "Sent 5 files · 2 image, 1 PDF, 1 spreadsheet, 1 file");
    // A user's own upload takes the same shape.
    const user = module.getLastEntryFromTranscript([{ id: "t3u", kind: "user-attachment", file_name: "notes.txt", file_path: "/x/notes.txt", batchId: "b3" }]);
    assert.deepEqual(user, { kind: "attachment", count: 1, kinds: [{ kind: "text", count: 1 }] });
  } finally {
    await dispose();
  }
});

test("a card's preview is what it says, never its type's name (a question card's push read \"widget\")", async () => {
  const { module, dispose } = await loadProjection();
  try {
    const last = (message) => module.getLastMessageFromTranscript([{ id: "m1", kind: "send-message", message }]).preview;
    assert.equal(last({ type: "widget", widget: { prompt: "Which flight do you want?", options: [] } }), "Which flight do you want?");
    assert.equal(last({ type: "widget", widget: {} }), "Has a question for you");
    assert.equal(last({ type: "secret-request", secretRequest: { label: "Stripe API key" } }), "Stripe API key");
    assert.equal(last({ type: "email-draft", draft: { subject: "Intro to Dana", body: "Hi" } }), "Intro to Dana");
    assert.equal(last({ type: "auto-review-approval", approval: { summary: "Send the email" } }), "Approval required: Send the email");
    assert.equal(last({ type: "connectors", connectors: ["Gmail", "Slack"] }), "Connect Gmail, Slack");
    assert.equal(last({ type: "cloud-agent", title: "Research" }), "Research");
    for (const type of ["widget", "secret-request", "permission-request", "local-tool-permission", "connector", "listener-connect", "slack-draft", "something-new"]) {
      assert.notEqual(last({ type }), type, `${type} is not shown as its name`);
    }
  } finally {
    await dispose();
  }
});

test("agents talking to each other read as that in the chat list, not as if said to the person", async () => {
  const { module, dispose } = await loadProjection();
  try {
    const last = (...entries) => module.getLastEntryFromTranscript(entries)?.text;
    const asked = { id: "u1", kind: "message", role: "user", content: "Plan the launch" };
    const toTheo = { id: "a1", kind: "message", role: "assistant", content: "Can you **check** the venue?", toAgent: { id: "theo", name: "Theo", kind: "agent" } };
    const fromTheo = { id: "u2", kind: "message", role: "user", content: "Booked for Thursday.", fromAgent: { id: "theo", name: "Theo" } };
    // The founder, 15 October 2026: "the chat preview shows as if its talking to me".
    assert.equal(last(asked, toTheo), "To Theo: Can you **check** the venue?");
    assert.equal(last(asked, toTheo, fromTheo), "From Theo: Booked for Thursday.");
    assert.equal(last(asked, toTheo, fromTheo, { id: "s1", kind: "send-message", message: { type: "text", content: "The venue is booked." } }), "The venue is booked.", "the agent's own message to the person stays as it is");
    assert.equal(last(asked), "Plan the launch", "and so does the person's");
    // A post the agent made in a group, as its own chat keeps it ("Messaged Launch squad").
    assert.equal(last({ id: "a2", kind: "message", role: "assistant", content: "Ready.", toAgent: { id: "g1", name: "Launch squad", kind: "group" } }), "To Launch squad: Ready.");
    assert.equal(last({ id: "a3", kind: "message", role: "assistant", content: "Hi", toAgent: { id: "x" } }), "To another agent: Hi");
    // A group's members and another person in a shared room are named.
    assert.equal(last({ id: "g2", kind: "send-message", message: { type: "text", content: "Venue confirmed." }, author: { id: "theo", name: "Theo" } }), "Theo: Venue confirmed.");
    assert.equal(last({ id: "r1", kind: "message", role: "user", content: "Looks good", fromUser: { name: "Dana", authId: "a" } }), "Dana: Looks good");
    // A call written before calls were one line was the person's, and an empty line stays empty.
    assert.equal(last({ id: "c1", kind: "message", role: "user", content: "What's on today?", fromAgent: { id: "voice-call:abc123:42", name: "Bass" } }), "What's on today?");
    assert.equal(last({ id: "g3", kind: "send-message", message: { type: "text", content: "" }, author: { id: "theo", name: "Theo" } }), "");
  } finally {
    await dispose();
  }
});
