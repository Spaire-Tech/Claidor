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
  assert.equal(lines[0].text, "line 24");
  assert.equal(prompt.VOICE_CALL_TRANSCRIPT_LINES, 6, "a short prompt, so each reply starts sooner");
});

test("the voice is the agent itself: first person, its recent chat, the upstream app's tools, no hand-off", () => {
  const text = prompt.buildVoiceCallPrompt({ agent: { name: "Ada", title: "Chief of staff", description: "Runs my week." }, transcript: prompt.transcriptLinesFromEntries(entries) });
  assert.match(text, /You are Ada, Chief of staff, one of the person's Simeon agents, on a live phone call with the person\./);
  assert.match(text, /What you are for, in their words: Runs my week\./);
  assert.match(text, /You are Ada yourself\. Speak in the first person/);
  assert.match(text, /never talk about a hand-off, a second voice or a system behind you/);
  assert.doesNotMatch(text, /Never mention another agent/, "teammates can be named and reached");
  assert.match(text, /Acknowledge it once, in a few words that fit what they asked, never the same phrase twice in a call/);
  assert.match(text, /Set each thing going once\./);
  assert.match(text, /If it repeats something you already told them, or is not about anything they asked, say nothing about it/);
  assert.match(text, /You have no teammates yet/);
  assert.match(text, /Them: Can you draft the agenda\?\nYou: Drafted\. It's in the doc\./);
  assert.match(text, /contractions/);
  assert.match(text, /Never use lists, headings, markdown/);
  assert.match(text, /Your work runs behind the call while you talk\. .*call send_task/);
  assert.match(text, /put their words in quote/);
  assert.match(text, /Never say something is done, sent, booked or found until a note tells you your work came back with it/);
  assert.match(text, /call recall_text_messages/);
  assert.match(text, /stay silent with skip_turn/);
  assert.match(text, /say a short, natural goodbye in your own words and call end_call/);
  assert.match(text, /If the line goes quiet, check in lightly once/);
  // The voice never speaks of "the agent" as someone else.
  assert.doesNotMatch(text, /the agent|hand_to_agent|check_on_agent/i);
  const team = prompt.buildVoiceCallPrompt({ agent: { name: "Don" }, transcript: [], personName: "Bass", teammates: [{ name: "Lena", title: "Research" }, { name: "Dawn" }, { name: "Don" }, { name: "  " }] });
  assert.match(team, /Your teammates, other agents on Bass's team that you can message, ask and hand work to: Lena \(Research\), Dawn\./);
  assert.match(team, /Never say you can't reach a teammate\./);
  assert.match(prompt.SEND_TASK_ACCEPTED, /^Sent\. If you have not acknowledged it yet/);
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
  assert.equal(prompt.VOICE_CALL_DEFAULT_VOICE_ID, "r1KmysJdVYZjJCm4mL3b");
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
  // The call's record is its transcript, word for word (2 October 2026).
  assert.equal(prompt.callRecordText(168, []), "Voice chat · 02:48");
  const record = prompt.callRecordText(150, [{ speaker: "user", text: "Hey." }, { speaker: "agent", text: "Hey, Bass.\nWhat's up?" }, { speaker: "user", text: prompt.WORK_CAME_BACK_NUDGE }, { speaker: "agent", text: "  " }], "conv_123");
  assert.equal(record, "Voice chat · 02:30\n\n> Hey.\nHey, Bass. What's up?\n\nCall id: conv_123");
  assert.deepEqual(prompt.parseCallRecord(record), { duration: "02:30", lines: [{ speaker: "user", text: "Hey." }, { speaker: "agent", text: "Hey, Bass. What's up?" }], conversationId: "conv_123" });
  assert.deepEqual(prompt.parseCallRecord("Voice call · 0:43\n\nYou asked me to book it."), { duration: "0:43", lines: [{ speaker: "agent", text: "You asked me to book it." }], conversationId: null });
  assert.equal(prompt.parseCallRecord("We talked about the voice chat · 02:30"), null);
  const long = prompt.callRecordText(60, Array.from({ length: 400 }, (_, i) => ({ speaker: "agent", text: `line ${i} ${"x".repeat(60)}` })));
  assert.ok(long.length <= prompt.CALL_RECORD_MAX_CHARS + 40);
  assert.match(long, /\n…$/);
  assert.equal(prompt.formatChipDuration(3723), "1:02:03");
});

test("what the voice's tools answer, and what its work coming back says, are its own", () => {
  assert.equal(prompt.SEND_TASK_ACCEPTED, "Sent. If you have not acknowledged it yet, do so in a few words, then carry on with them. What it turns up comes back to you here.");
  assert.equal(prompt.workCameBackUpdate(["Sent it to Dana.", "She's in at ten."]), "Your work came back: Sent it to Dana. She's in at ten. Tell them now, briefly, in your own words, as yours.");
  assert.equal(prompt.WORK_CAME_BACK_NUDGE, "(Your work just came back. Tell me what it found.)");
  assert.equal(prompt.recallTextMessagesAnswer([]), "There are no text messages between you yet.");
  assert.equal(prompt.recallTextMessagesAnswer([{ speaker: "person", text: "Hi" }, { speaker: "agent", text: "Hey" }]), "Your latest text messages, oldest first:\nThem: Hi\nYou: Hey");
});

test("the voice calls the person by the name they gave, never by one made from their e-mail", () => {
  const named = prompt.buildVoiceCallOverrides({ agent: { name: "Ada" }, transcript: [{ speaker: "person", text: "Hi" }], pick: 0, personName: " Bass " });
  assert.match(named.agent.prompt.prompt, /one of Bass's Simeon agents, on a live phone call with Bass\./);
  assert.match(named.agent.prompt.prompt, /Call them Bass now and then/);
  assert.match(named.agent.prompt.prompt, /^Bass: Hi$/m);
  assert.equal(named.agent.firstMessage, "Hey Bass, it's Ada. What's up?");
  const unnamed = prompt.buildVoiceCallOverrides({ agent: { name: "Ada" }, transcript: [{ speaker: "person", text: "Hi" }], pick: 0 });
  assert.doesNotMatch(unnamed.agent.prompt.prompt, /Call them/);
  assert.match(unnamed.agent.prompt.prompt, /^Them: Hi$/m);
  assert.equal(unnamed.agent.firstMessage, "Hey, it's Ada. What's up?");
});
