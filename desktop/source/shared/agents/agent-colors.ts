/**
 * The colour a new agent is drawn in (7 October 2026). Every agent is the
 * butterfly mark in one of the window's palettes (`AGENT_MARK_PALETTES`),
 * and one with no colour stored is drawn in the default, Ocean. Nothing
 * gave a new agent a colour, so a team hired together came out all blue
 * and the person asked for them to be told apart; the main agent then
 * asked each teammate to draw its own picture, which two refused and two
 * paid an image or a shell script for (the founder's staffing log).
 *
 * A new agent without a colour now gets the one fewest agents have, in the
 * order below: after the default, the palettes whose middle stops differ
 * most in hue come first (coral, green, pink, lilac), so the first few
 * hires are easy to tell apart.
 */
import { AGENT_MARK_PALETTES, DEFAULT_AGENT_MARK_COLOR } from "../voice-call/agent-mark.js";

/** Every palette id once, the most distinct from the default and each other first. */
export const AGENT_COLOR_ASSIGNMENT_ORDER: readonly string[] = Object.freeze([
  "red", // Ember
  "green", // Moss
  "magenta", // Berry
  "violet", // Lagoon
  "brown", // Sand
  "black", // Slate
  "cyan", // Sage
  "yellow", // Dusk
  "mint", // Mint
  "orange", // Peach
  "gray", // Rose
  "blue", // Ocean, the default
]);

/** The palette id a stored colour is drawn in: itself if known, else the default. */
export function drawnAgentColor(color: string | null | undefined): string {
  const trimmed = color?.trim() ?? "";
  return AGENT_MARK_PALETTES.some((palette) => palette.id === trimmed) ? trimmed : DEFAULT_AGENT_MARK_COLOR;
}

/** The colour fewest of `existing` are drawn in; ties go to the earlier in the assignment order. */
export function pickAgentColor(existing: Iterable<string | null | undefined>): string {
  const counts = new Map<string, number>(AGENT_COLOR_ASSIGNMENT_ORDER.map((id) => [id, 0]));
  for (const color of existing) {
    const drawn = drawnAgentColor(color);
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
