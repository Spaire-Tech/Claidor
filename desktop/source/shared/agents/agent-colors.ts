/**
 * The colour a new agent is drawn in (7 October 2026). Every agent is the
 * butterfly mark in one of the window's palettes (`AGENT_MARK_PALETTES`). One
 * with no colour stored is drawn in a colour hashed from its id: the window's
 * own fallback, the upstream app's (`sle` in the shipped renderer, kept by
 * `AGENT_COLOR_RESOLVER` in scripts/lib/router-renderer-patch.mjs). Nothing
 * stored a colour for an agent another agent created, so a team's colours
 * were left to the hash, which can repeat: in the founder's staffing log
 * Leo, Nina and Ava all hashed to the same slot, Ocean, the colour Simeon
 * himself is stored with (a one in a hundred draw; the hash is even, about
 * 10% per slot over random ids). Asked to tell them apart, the main agent
 * messaged each teammate to draw its own picture, which two refused and two
 * paid an image or a shell script for.
 *
 * A new agent without a colour now gets the one fewest agents are drawn in,
 * counting an agent without one as the colour its id hashes to, in the order
 * below.
 */
import { AGENT_MARK_PALETTES } from "../voice-call/agent-mark.js";

/**
 * Every palette id once, in the order a new agent takes them. Measured, not
 * chosen by eye: starting from Ocean (the Chief of Staff's), each next one is
 * the palette farthest from all before it, distance being the mean CIE Lab
 * ΔE over the three stops the butterfly is painted with (Ember 82, Moss 59,
 * Dusk 54, Lagoon 50, Sand 43, Mint 39, Rose 33, Slate 31, Berry 26, Sage 24,
 * Peach 22).
 */
export const AGENT_COLOR_ASSIGNMENT_ORDER: readonly string[] = Object.freeze([
  "red", // Ember
  "green", // Moss
  "yellow", // Dusk
  "violet", // Lagoon
  "brown", // Sand
  "mint", // Mint
  "gray", // Rose
  "black", // Slate
  "magenta", // Berry
  "cyan", // Sage
  "orange", // Peach
  "blue", // Ocean
]);

// The window's hash, as shipped: FNV-1a of the id, one draw of its seeded
// generator, a slot among ten. The patched window indexes the palettes in
// `AGENT_MARK_PALETTES` order, so the slots are the first ten of them.
const WINDOW_FALLBACK_SLOTS = 10;
function windowIdHash(id: string): number {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index++) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
function windowFirstDraw(seed: number): number {
  let state = (seed + 1831565813) | 0;
  let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
  mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
  return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
}

/** The colour the window draws an agent in when none is stored. */
export function windowFallbackColor(agentId: string): string {
  const slot = Math.floor(windowFirstDraw(windowIdHash(agentId)) * WINDOW_FALLBACK_SLOTS);
  return AGENT_MARK_PALETTES[slot]!.id;
}

/** The colour an agent is drawn in: its stored one if known, else its id's. */
export function drawnAgentColor(agentId: string, stored: string | null | undefined): string {
  const trimmed = stored?.trim() ?? "";
  return AGENT_MARK_PALETTES.some((palette) => palette.id === trimmed) ? trimmed : windowFallbackColor(agentId);
}

/** The colour fewest of `existing` are drawn in; ties go to the earlier in the assignment order. */
export function pickAgentColor(existing: Iterable<{ readonly id: string; readonly color?: string | null }>): string {
  const counts = new Map<string, number>(AGENT_COLOR_ASSIGNMENT_ORDER.map((id) => [id, 0]));
  for (const agent of existing) {
    const drawn = drawnAgentColor(agent.id, agent.color);
    counts.set(drawn, (counts.get(drawn) ?? 0) + 1);
  }
  let best = AGENT_COLOR_ASSIGNMENT_ORDER[0]!;
  for (const id of AGENT_COLOR_ASSIGNMENT_ORDER) {
    if ((counts.get(id) ?? 0) < (counts.get(best) ?? 0)) best = id;
  }
  return best;
}

/** The colour names an agent may use: the labels the window shows (Ember, Moss, …). */
export const AGENT_COLOR_LABELS: readonly string[] = Object.freeze(AGENT_MARK_PALETTES.map((palette) => palette.label));

/**
 * The palette id for a label ("Ember" → "red"), any case; null for anything
 * else. Labels only: the stored ids are the upstream's names and do not match
 * what is drawn ("yellow" is Dusk, periwinkle to peach).
 */
export function agentColorIdFromName(name: string): string | null {
  const wanted = name.trim().toLowerCase();
  return AGENT_MARK_PALETTES.find((entry) => entry.label.toLowerCase() === wanted)?.id ?? null;
}
