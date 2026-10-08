/**
 * Each agent's own voice (8 October 2026, the founder: "each agent should be
 * assigned a different voice … if the agent is named like a woman, like
 * Maya, default to a woman voice, not always the same, and vice versa for
 * men"; "Jon is Simeon main default voice").
 *
 * Offline, this holds:
 * - a name's gender comes from the baby-name lists, titles count, and a
 *   name that is neither (Jordan) or unknown (Sage) has none;
 * - the Chief of Staff gets Simeon's voice and nobody else does;
 * - others get the voice fewest agents have among their gender's, women
 *   spread over the four women's voices before one repeats;
 * - the Mac's copy of the voice genders and Simeon's voice id are the
 *   server's.
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadModule(entry, name) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), `simeon-${name}-`));
  const output = path.join(temporary, `${name}.mjs`);
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile: output, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent" });
  const module = await import(`${pathToFileURL(output).href}?${Date.now()}`);
  await rm(temporary, { recursive: true, force: true });
  return module;
}

const voices = await loadModule("source/shared/voice-call/agent-voices.ts", "agent-voices");
const ALL = Object.keys(voices.CURATED_VOICE_GENDERS).map((id) => ({ id }));
const WOMEN = new Set(Object.entries(voices.CURATED_VOICE_GENDERS).filter(([, gender]) => gender === "female").map(([id]) => id));

test("a name's gender: the lists, titles, and none for a neutral or unknown name", () => {
  for (const name of ["Maya", "Nina", "Ava", "Zoë", "Ana Lucía", "Fatou", "Isla", "Ms Taylor", "Dr. Amara"]) assert.equal(voices.nameGender(name), "female", name);
  for (const name of ["Leo", "Simeon", "Jon", "Mark", "Bassirou", "Theo", "Mr. Kim", "Sir Elton"]) assert.equal(voices.nameGender(name), "male", name);
  for (const name of ["Jordan", "Taylor", "Riley", "Sage", "Atlas", "", "  "]) assert.equal(voices.nameGender(name), null, name);
});

test("the Chief of Staff speaks in Simeon's voice, and no other agent is given it", () => {
  assert.equal(voices.pickAgentVoice({ agentId: "coo", name: "Simeon", isChiefOfStaff: true, voices: ALL, takenVoiceIds: [] }), voices.SIMEON_VOICE_ID);
  for (let index = 0; index < 40; index++) {
    const picked = voices.pickAgentVoice({ agentId: `agent-${index}`, name: index % 2 ? "Leo" : "Jordan", isChiefOfStaff: false, voices: ALL, takenVoiceIds: [] });
    assert.notEqual(picked, voices.SIMEON_VOICE_ID);
  }
  // Without Simeon's voice in the account, the Chief of Staff gets another like anyone else.
  const withoutSimeon = ALL.filter((voice) => voice.id !== voices.SIMEON_VOICE_ID);
  assert.ok(withoutSimeon.some((voice) => voice.id === voices.pickAgentVoice({ agentId: "coo", name: "Simeon", isChiefOfStaff: true, voices: withoutSimeon, takenVoiceIds: [] })));
});

test("women's names spread over the women's voices before one repeats; men's over the men's", () => {
  const taken = [];
  for (const [index, name] of ["Maya", "Nina", "Ava", "Eve"].entries()) {
    const picked = voices.pickAgentVoice({ agentId: `w${index}`, name, isChiefOfStaff: false, voices: ALL, takenVoiceIds: taken });
    assert.ok(WOMEN.has(picked), `${name} got a woman's voice`);
    assert.ok(!taken.includes(picked), `${name} got one nobody has`);
    taken.push(picked);
  }
  const fifth = voices.pickAgentVoice({ agentId: "w5", name: "Hannah", isChiefOfStaff: false, voices: ALL, takenVoiceIds: taken });
  assert.ok(WOMEN.has(fifth), "a fifth woman shares a woman's voice rather than taking a man's");
  const men = [];
  for (const [index, name] of ["Leo", "Mark", "Adam", "Omar", "Felix", "Hugo", "Max"].entries()) {
    const picked = voices.pickAgentVoice({ agentId: `m${index}`, name, isChiefOfStaff: false, voices: ALL, takenVoiceIds: men });
    assert.ok(!WOMEN.has(picked) && picked !== voices.SIMEON_VOICE_ID, `${name} got a man's voice`);
    assert.ok(!men.includes(picked), `${name} got one nobody has`);
    men.push(picked);
  }
  // Not always the same: two women hired with nothing taken land on different voices for different ids.
  const firsts = new Set(["a", "b", "c", "d", "e", "f"].map((id) => voices.pickAgentVoice({ agentId: id, name: "Maya", isChiefOfStaff: false, voices: ALL, takenVoiceIds: [] })));
  assert.ok(firsts.size > 1, "the agent's id varies the first pick");
  // Only men's voices in the account: a woman's name still gets a voice.
  const menOnly = ALL.filter((voice) => !WOMEN.has(voice.id));
  assert.ok(menOnly.some((voice) => voice.id === voices.pickAgentVoice({ agentId: "x", name: "Maya", isChiefOfStaff: false, voices: menOnly, takenVoiceIds: [] })));
  assert.equal(voices.pickAgentVoice({ agentId: "x", name: "Maya", isChiefOfStaff: false, voices: [], takenVoiceIds: [] }), null);
  // The server's gender wins over the Mac's copy.
  assert.equal(voices.voiceGender({ id: "XcXEQzuLXRU9RcfWzEJt", gender: "male" }), "male");
  assert.equal(voices.voiceGender({ id: "XcXEQzuLXRU9RcfWzEJt" }), "female");
});

test("the Mac's voice genders and Simeon's voice are the server's", async () => {
  const server = await readFile(path.join(repoRoot, "..", "server", "simeon", "desktop", "voice.py"), "utf8");
  assert.match(server, new RegExp(`SIMEON_VOICE_ID = "${voices.SIMEON_VOICE_ID}"`));
  assert.match(server, /\(SIMEON_VOICE_ID, "Simeon"\),/);
  const block = server.slice(server.indexOf("CURATED_VOICE_GENDERS: dict[str, str] = {"), server.indexOf("VOICES_CACHE_SECONDS"));
  const serverGenders = {};
  for (const match of block.matchAll(/^\s+(?:"([A-Za-z0-9]+)"|(VOICE_DEFAULT_VOICE_ID|SIMEON_VOICE_ID)): "(female|male)",/gm)) {
    const id = match[1] ?? (match[2] === "SIMEON_VOICE_ID" ? voices.SIMEON_VOICE_ID : "ljX1ZrXuDIIRVcmiVSyR");
    serverGenders[id] = match[3];
  }
  assert.deepEqual(serverGenders, { ...voices.CURATED_VOICE_GENDERS });
});
