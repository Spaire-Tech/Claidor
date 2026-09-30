/**
 * Voice calls (30 September 2026): the per-call persona, the greeting, the
 * banner's status lines and the record the call leaves in the chat, all from
 * source/shared/voice-call/voice-call-prompt.ts.
 */
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadModule(entry, name) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), `simeon-${name}-`));
  const output = path.join(temporary, `${name}.mjs`);
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile: output, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron"] });
  const module = await import(`${pathToFileURL(output).href}?${Date.now()}`);
  await rm(temporary, { recursive: true, force: true });
  return module;
}

const prompt = await loadModule("source/shared/voice-call/voice-call-prompt.ts", "voice-call-prompt");

const entries = [
  { kind: "message", id: "m1", role: "user", content: "Can you   draft the agenda?" },
  { kind: "tool-call", id: "t1", name: "Shell" },
  { kind: "send-message", id: "s1", message: { type: "text", content: "Drafted. It's in the doc." } },
  { kind: "send-message", id: "s2", message: { type: "attachment", url: "file:///x.pdf" } },
  { kind: "message", id: "m2", role: "assistant", content: "internal" },
];

test("the chat becomes the latest person and agent lines, oldest first, cards and tools left out", () => {
  assert.deepEqual(prompt.transcriptLinesFromEntries(entries), [
    { speaker: "person", text: "Can you draft the agenda?" },
    { speaker: "agent", text: "Drafted. It's in the doc." },
  ]);
  const many = Array.from({ length: 30 }, (_, index) => ({ kind: "message", id: `m${index}`, role: "user", content: `line ${index}` }));
  const lines = prompt.transcriptLinesFromEntries(many);
  assert.equal(lines.length, prompt.VOICE_CALL_TRANSCRIPT_LINES);
  assert.equal(lines.at(-1).text, "line 29");
  assert.equal(lines[0].text, "line 10");
});

test("the persona names the agent, carries its recent chat and the firm rules", () => {
  const text = prompt.buildVoiceCallPrompt({ agent: { name: "Ada", title: "Chief of staff", description: "Runs my week." }, transcript: prompt.transcriptLinesFromEntries(entries) });
  assert.match(text, /You are Ada, Chief of staff, one of the person's Simeon agents, and you are on a live phone call with them\./);
  assert.match(text, /Runs my week\./);
  assert.match(text, /Person: Can you draft the agenda\?\nAda: Drafted\. It's in the doc\./);
  assert.match(text, /contractions/);
  assert.match(text, /Never use lists, headings, markdown/);
  assert.match(text, /You do not do tasks yourself\. .*call hand_to_agent/);
  assert.match(text, /Never say something is done, sent, booked or found unless the agent reported it/);
  assert.match(text, /call check_on_agent/);
  assert.match(text, /say a short, natural goodbye in your own words and call end_call/);
  assert.match(text, /If the line goes quiet, check in lightly once/);
  const empty = prompt.buildVoiceCallPrompt({ agent: { name: "Ada" }, transcript: [] });
  assert.match(empty, /have not written to each other yet/);
});

test("the greeting has the agent's name and varies with the pick", () => {
  const greetings = new Set([0, 0.2, 0.4, 0.6, 0.8, 0.99].map((pick) => prompt.buildFirstMessage("Ada", pick)));
  assert.ok(greetings.size >= 5);
  for (const greeting of greetings) assert.match(greeting, /Ada/);
  assert.equal(prompt.buildFirstMessage("Ada", Number.NaN), prompt.buildFirstMessage("Ada", 0));
});

test("the overrides carry the prompt, greeting, language and the agent's voice, else no voice", () => {
  const withVoice = prompt.buildVoiceCallOverrides({ agent: { name: "Ada" }, transcript: [], voiceId: "abc123", pick: 0 });
  assert.equal(withVoice.tts.voiceId, "abc123");
  assert.equal(withVoice.agent.language, "en");
  assert.match(withVoice.agent.prompt.prompt, /You are Ada/);
  assert.match(withVoice.agent.firstMessage, /Ada/);
  // No voice chosen: the platform agent's own, which the server picked from
  // the workspace's voices (a voice it lacks fails the call: voice_not_found).
  assert.equal(prompt.buildVoiceCallOverrides({ agent: { name: "Ada" }, transcript: [], voiceId: "  ", pick: 0 }).tts, undefined);
  assert.equal(prompt.VOICE_CALL_DEFAULT_VOICE_ID, "cjVigY5qzO86Huf0OWal");
});

test("the status line reads the task, then the agent's own activity", () => {
  assert.equal(prompt.workingLabel("Send the agenda to Dana and Marcus."), "Sending the agenda to Dana and Marcus…");
  assert.equal(prompt.workingLabel("please book a table for two"), "Booking a table for two…");
  assert.equal(prompt.workingLabel("Write a summary"), "Writing a summary…");
  assert.equal(prompt.workingLabel("set a reminder"), "Setting a reminder…");
  assert.equal(prompt.workingLabel("The agenda, to Dana"), "Working on it…");
  assert.equal(prompt.describeAgentActivity({ kind: "thinking" }), null);
  assert.equal(prompt.describeAgentActivity({ kind: "tool", tool: "WebSearch", callId: "1" }), "Searching the web…");
  assert.equal(prompt.describeAgentActivity({ kind: "tool", tool: "CallMcpTool", detail: "gmail", callId: "1" }), "Using Gmail…");
  assert.equal(prompt.describeAgentActivity({ kind: "tool", tool: "Read", detail: "notes.md", callId: "1" }), "Reading notes.md…");
  assert.equal(prompt.describeAgentActivity({ kind: "tool", tool: "Mystery", callId: "1" }), "Working on it…");
});

test("the call's record and durations read like the banner", () => {
  assert.equal(prompt.formatCallDuration(12), "0:12");
  assert.equal(prompt.formatCallDuration(168), "2:48");
  assert.equal(prompt.formatCallDuration(3723), "1:02:03");
  assert.equal(prompt.callRecordText(168, null), "Voice call · 2:48");
  assert.equal(prompt.callRecordText(168, "  Talked about the agenda. "), "Voice call · 2:48\n\nTalked about the agenda.");
});

test("check_on_agent and the hand-off result say what the agent reported, and nothing it did not", () => {
  assert.equal(prompt.checkOnAgentAnswer({ isWorking: true, activity: "Searching the web…", replies: [], lastMessage: null }), "The agent is still working on it: searching the web. It has not reported anything yet.");
  assert.match(prompt.checkOnAgentAnswer({ isWorking: false, activity: null, replies: ["Sent."], lastMessage: null }), /^The agent finished\. It said: Sent\.$/);
  assert.match(prompt.checkOnAgentAnswer({ isWorking: false, activity: null, replies: [], lastMessage: "Hi" }), /not working on anything right now\. Its last message was: Hi/);
  assert.match(prompt.handOffResultUpdate(["Sent it to Dana."]), /It reported: Sent it to Dana\./);
  assert.match(prompt.handOffResultUpdate([]), /did not send a message/);
  assert.equal(prompt.HAND_OFF_ACCEPTED, "Accepted. The agent is working on it.");
});
