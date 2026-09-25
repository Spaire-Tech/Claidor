/**
 * An agent's avatar reaches the roster (24 September 2026, night). The
 * founder: "upload and image generation none of them work." Audited in
 * docs/product/avatar-audit-2026-09-24.md: the picture landed as
 * avatar.png in the agent's directory and `buildSummary` never read it,
 * because it read only through an optional `readAvatar` callback that no
 * caller passed. Every roster row said avatarDataUrl: null.
 */
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function load(entry, name) {
  const dir = await mkdtemp(path.join(os.tmpdir(), `caisra-${name}-`));
  const outfile = path.join(dir, `${name}.mjs`);
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", packages: "external" });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

// The smallest valid PNG: an 8-byte signature and a few chunks; the sniffer
// reads the signature, the roster reads the bytes.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

test("a roster row carries the agent's avatar.png as a data URL, with no callback asked of the caller", async () => {
  const { module, dispose } = await load("source/host/extensions/session/session-summaries.ts", "session-summaries");
  const root = await mkdtemp(path.join(os.tmpdir(), "caisra-avatar-roster-"));
  try {
    const agentDir = path.join(root, "agent-1");
    await mkdir(agentDir, { recursive: true });
    await writeFile(path.join(agentDir, "profile.json"), JSON.stringify({ name: "Simeon", description: "chief of staff" }));
    const dbPath = path.join(agentDir, "store.db");
    const before = await module.buildSummary({ extras: null, dbPath, dirName: "agent-1", includeBlank: true });
    assert.equal(before.avatarDataUrl, null, "no picture yet");
    await writeFile(path.join(agentDir, "avatar.png"), PNG);
    const after = await module.buildSummary({ extras: null, dbPath, dirName: "agent-1", includeBlank: true });
    assert.ok(after.avatarDataUrl?.startsWith("data:image/png;base64,"), `the row carries the picture: ${after.avatarDataUrl?.slice(0, 40)}`);
    assert.match(after.avatarVersion, /^[0-9a-f]{16}$/, "and a version the renderer can cache on");
    assert.equal(after.name, "Simeon");
  } finally {
    await rm(root, { recursive: true, force: true });
    await dispose();
  }
});

test("the gateway's avatar write refuses what is not an image, and answers with the picture when it is", async () => {
  const { module, dispose } = await load("source/host/extensions/session/session-mutations.ts", "session-mutations");
  const root = await mkdtemp(path.join(os.tmpdir(), "caisra-avatar-write-"));
  try {
    const agentDir = path.join(root, "agent-1");
    await mkdir(agentDir, { recursive: true });
    await writeFile(path.join(agentDir, "profile.json"), JSON.stringify({ name: "Simeon", description: "" }));
    const dbPath = path.join(agentDir, "store.db");
    let profile = { description: "", avatarPath: null };
    const db = {
      getSandProfile: () => profile,
      setSandProfile: (value) => { profile = value; return true; },
      get: () => undefined,
      getTranscriptEntries: () => [],
      getUnreadState: () => ({ lastActivityAt: 0, lastViewedAt: 0, isManuallyUnread: false, unreadCount: 0 }),
    };
    const host = { memory: { agentHasContent: () => false } };
    await assert.rejects(() => module.setAgentAvatarBytes(host, db, dbPath, "agent-1", Buffer.from("not a picture")), /not a recognized image/);
    await assert.rejects(() => module.setAgentAvatarBytes(host, db, dbPath, "agent-1", new Uint8Array(0)), /non-empty image/);
    const summary = await module.setAgentAvatarBytes(host, db, dbPath, "agent-1", PNG);
    assert.ok(summary.avatarDataUrl?.startsWith("data:image/png;base64,"), "the reply to the upload carries the picture");
    const cleared = await module.setAgentAvatarBytes(host, db, dbPath, "agent-1", null);
    assert.equal(cleared.avatarDataUrl, null, "clearing removes it");
  } finally {
    await rm(root, { recursive: true, force: true });
    await dispose();
  }
});

test("the composition tells the roster when the agent changes its own avatar", async () => {
  const { readFile } = await import("node:fs/promises");
  const composition = await readFile(path.join(repoRoot, "source/host/host-runner-composition.ts"), "utf8");
  assert.match(composition, /onAvatarChanged: \(\) => \{\n\s*void method\(transcript, "emitAgentUpdate"\)\?\.\(session\.id\);/);
  const manager = await readFile(path.join(repoRoot, "source/host/extensions/transcript/transcript-manager.ts"), "utf8");
  assert.match(manager, /\["emitAgentUpdate", "roster"\],/, "the transcript API delegates emitAgentUpdate to the roster");
});
