/**
 * Each agent's own voice (8 October 2026, the founder: "each agent should be
 * assigned a different voice … if the agent is named like a woman, like
 * Maya, default to a woman voice, not always the same, and vice versa for
 * men"). Until then an agent nobody had given a voice spoke in the default,
 * so every agent on a call sounded alike.
 *
 * An agent without a voice gets one the first time it needs it (a call, or
 * its voice picker), and keeps it:
 * - the Chief of Staff gets Simeon's own voice (listed as Jon until then),
 *   which no other agent is given;
 * - any other agent gets the voice fewest agents have, among the voices of
 *   its name's gender when the name has one (Maya, Nina: a woman's; Leo,
 *   Jon: a man's), among all of them otherwise (Jordan, Sage);
 * - between voices equally free, the agent's id decides, so two agents
 *   hired together do not land on the same one.
 */
import { MEN_NAMES, WOMEN_NAMES } from "./name-genders.js";

export type VoiceGender = "female" | "male";

/** The Chief of Staff's voice, `SIMEON_VOICE_ID` in server/simeon/desktop/voice.py. */
export const SIMEON_VOICE_ID = "Cz0K1kOv9tD8l0b5Qu53";

/**
 * Each curated voice's gender, for a server that does not send one yet:
 * `CURATED_VOICE_GENDERS` in server/simeon/desktop/voice.py (a test holds
 * the two equal).
 */
export const CURATED_VOICE_GENDERS: Readonly<Record<string, VoiceGender>> = Object.freeze({
  ljX1ZrXuDIIRVcmiVSyR: "male", // Michael
  "1t1EeRixsJrKbiF1zwM6": "male", // Jerry
  XcXEQzuLXRU9RcfWzEJt: "female", // Veda
  s3TPKV1kjDlVtZbl4Ksh: "male", // Adam
  UgBBYS2sOqTuMpoF3BR0: "male", // Mark
  "6OzrBCQf8cjERkYgzSg8": "male", // Jamal
  Cz0K1kOv9tD8l0b5Qu53: "male", // Simeon
  WI5pMmcGGS32yI7yttoP: "female", // Amanda
  snyKKuaGYk1VUEh42zbW: "male", // Chris
  gfRt6Z3Z8aTbpLfexQ7N: "male", // Boyd
  NHRgOEwqx5WZNClv5sat: "female", // Chelsea
  "5u41aNhyCU6hXOcjPPv0": "female", // Hope
});

const TITLES: Readonly<Record<string, VoiceGender | null>> = Object.freeze({
  mrs: "female", ms: "female", miss: "female", madam: "female", lady: "female",
  mr: "male", sir: "male", lord: "male",
  dr: null, doctor: null, prof: null, professor: null, captain: null, coach: null,
});

let women: ReadonlySet<string> | null = null;
let men: ReadonlySet<string> | null = null;

/** "female", "male", or null when the name is neither or unknown. */
export function nameGender(name: string): VoiceGender | null {
  women ??= new Set(WOMEN_NAMES.split(" ").filter((word) => word.length > 0));
  men ??= new Set(MEN_NAMES.split(" ").filter((word) => word.length > 0));
  const words = name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .match(/[a-z]+/g) ?? [];
  for (const word of words) {
    if (word in TITLES) {
      const titled = TITLES[word];
      if (titled != null) return titled;
      continue;
    }
    return women.has(word) ? "female" : men.has(word) ? "male" : null;
  }
  return null;
}

function stableHash(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export interface VoiceChoice {
  readonly id: string;
  readonly gender?: VoiceGender | null;
}

/** A voice's gender: the server's, else the curated list's. */
export function voiceGender(voice: VoiceChoice): VoiceGender | null {
  return voice.gender ?? CURATED_VOICE_GENDERS[voice.id] ?? null;
}

/**
 * The voice an agent without one gets, among `voices` (those the account
 * has); null when there is none to give. `takenVoiceIds` are the other
 * agents' voices.
 */
export function pickAgentVoice(args: {
  readonly agentId: string;
  readonly name: string;
  readonly isChiefOfStaff: boolean;
  readonly voices: readonly VoiceChoice[];
  readonly takenVoiceIds: readonly string[];
}): string | null {
  if (args.isChiefOfStaff && args.voices.some((voice) => voice.id === SIMEON_VOICE_ID)) return SIMEON_VOICE_ID;
  const others = args.voices.filter((voice) => voice.id !== SIMEON_VOICE_ID);
  const gender = nameGender(args.name);
  const matching = gender == null ? [] : others.filter((voice) => voiceGender(voice) === gender);
  const pool = matching.length > 0 ? matching : others;
  if (pool.length === 0) return null;
  const counts = new Map<string, number>();
  for (const id of args.takenVoiceIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  const fewest = Math.min(...pool.map((voice) => counts.get(voice.id) ?? 0));
  const free = pool.filter((voice) => (counts.get(voice.id) ?? 0) === fewest);
  return free[stableHash(args.agentId) % free.length]!.id;
}
