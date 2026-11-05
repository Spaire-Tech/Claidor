/**
 * The takeover card's picture says in the host log what became of it
 * (16 October 2026).
 *
 * In the founder's recording the "Your turn on the computer" card on the E2B
 * computer had no picture of the screen, and /tmp/sand-host.log said nothing
 * about it: the snapshot's failure or time-out was swallowed. Each snapshot
 * now leaves one line: ready, timeout, empty, ended (the hand-off was over
 * before the picture came) or the error, with how long it took.
 */
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function load(entry, name) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), `simeon-${name}-`));
  const output = path.join(temporary, `${name}.mjs`);
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile: output, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron"] });
  const module = await import(`${pathToFileURL(output).href}?${Date.now()}`);
  await rm(temporary, { recursive: true, force: true });
  return module;
}

const { BoxHandoffService } = await load("source/host/extensions/session/box-handoff-service.ts", "handoff-snapshot-log");

async function handOver(grabScreenshot, timeoutMs = 50) {
  const lines = [];
  const service = new BoxHandoffService({ grabScreenshot, timeoutMs, log: (line) => lines.push(line) });
  service.start({ agentId: "agent-1", instruction: "Sign in to your Apple Account" });
  for (let i = 0; i < 40 && lines.length === 0; i += 1) await new Promise((resolve) => setTimeout(resolve, 10));
  return { lines, pending: service.get("agent-1") };
}

test("a picture taken is on the card and in the log", async () => {
  const { lines, pending } = await handOver(async () => "UklGRg==");
  assert.equal(pending.snapshotDataUrl, "data:image/webp;base64,UklGRg==");
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^handoff snapshot=ready ms=\d+ agent=agent-1$/);
});

test("a picture that takes too long is logged as a time-out", async () => {
  const { lines, pending } = await handOver(() => new Promise(() => {}));
  assert.equal(pending.snapshotDataUrl, undefined);
  assert.match(lines[0], /^handoff snapshot=timeout ms=\d+ agent=agent-1$/);
});

test("a failed picture is logged with its error, and no picture is logged as empty", async () => {
  const failed = await handOver(async () => { throw new Error("no display\n:1"); });
  assert.match(failed.lines[0], /^handoff snapshot=error no display :1 ms=\d+ agent=agent-1$/);
  const empty = await handOver(async () => null);
  assert.match(empty.lines[0], /^handoff snapshot=empty ms=\d+ agent=agent-1$/);
});
