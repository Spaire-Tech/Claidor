/**
 * Quieter agents (2 October 2026; the founder: "how talkative the AI is, its too much. I'm okay
 * with sending a first message saying on it or something - then its the actual thing. He can
 * talk when he really got something to say"). The opening acknowledgement and delivering the
 * result stay; the cadence rules and the six-call nudge that made every task a play-by-play go.
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function load(entry, name) {
  const dir = await mkdtemp(path.join(os.tmpdir(), `simeon-${name}-`));
  const outfile = path.join(dir, `${name}.mjs`);
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron"] });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

const call = (name = "Shell") => ({ role: "assistant", content: [{ type: "tool-call", toolName: name }] });
const result = () => ({ role: "tool", content: [] });

test("the silence nudge waits for 25 calls, fires once per stretch, and asks rather than demands", async () => {
  const { module, dispose } = await load("source/host/runner/send-message-reminder-middleware.ts", "reminder");
  try {
    assert.equal(module.DEFAULT_SEND_MESSAGE_REMINDER_THRESHOLD, 25);
    assert.match(module.SEND_MESSAGE_REMINDER_MESSAGE, /If you have nothing worth saying, keep working and say nothing/);
    const messages = [{ role: "user", content: "find me a flight" }, { role: "assistant", content: [{ type: "tool-call", toolName: "SendMessage" }] }];
    const executor = { getMessages: () => messages, getState: () => messages, clearMessages() {}, appendMessages(m) { messages.push(...(Array.isArray(m) ? m : [m])); }, stream() { return "ok"; } };
    const middleware = module.createSendMessageReminderMiddleware({ earlyResultThreshold: Number.MAX_SAFE_INTEGER })(executor);
    const nudges = () => messages.filter((m) => m.providerOptions?.cursor?.sandSendMessageReminder === true).length;
    for (let i = 0; i < 25; i += 1) { messages.push(call(), result()); middleware.stream(); }
    assert.equal(nudges(), 0, "25 quiet calls draw no nudge");
    messages.push(call(), result()); middleware.stream();
    assert.equal(nudges(), 1, "the 26th does");
    for (let i = 0; i < 10; i += 1) { messages.push(call(), result()); middleware.stream(); }
    assert.equal(nudges(), 1, "and not again on every step after it");
    for (let i = 0; i < 20; i += 1) { messages.push(call(), result()); middleware.stream(); }
    assert.equal(nudges(), 2, "a second long stretch of silence draws a second one");
  } finally {
    await dispose();
  }
});

test("the brief keeps 'reply first' and 'deliver the result', and drops the cadence rules", async () => {
  const prompt = await readFile(path.join(repoRoot, "source/host/runner/system-prompt.ts"), "utf8");
  assert.match(prompt, /1\. Reply first\./);
  assert.match(prompt, /ack \\u2260 delivery/);
  assert.match(prompt, /3\. Work quietly\./);
  assert.match(prompt, /speak only when you have something worth saying/);
  for (const gone of ["Work out loud", "steady cadence", "err toward a quick update", "frequent one-liners are exactly right", "acknowledge the request and name your first step"]) {
    assert.equal(prompt.includes(gone), false, gone);
  }
  const tool = await readFile(path.join(repoRoot, "source/host/runner/tools/send-message-tool.ts"), "utf8");
  assert.match(tool, /Leave out the play-by-play/);
});
