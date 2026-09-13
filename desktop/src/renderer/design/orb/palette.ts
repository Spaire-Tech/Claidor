import { ORB_PALETTES, type OrbPalette } from '../tokens';

/**
 * Which orb an agent wears, and why it never changes.
 *
 * An agent's orb is its face. A person recognises Mira in a list of eight
 * by colour before they read the name, so the palette must be the same on
 * every launch, on every machine, and after any reordering of the list.
 * That rules out `Math.random()` at creation time unless the result is
 * stored, and it rules out index-in-list entirely.
 *
 * So: derive it from the agent's id, which is already stable and unique.
 * The founder asked for "a random for each agent"; this is random in the
 * way that matters — two agents rarely match, nobody can predict which
 * they get — and stable in the way that matters more.
 *
 * An explicitly chosen palette always wins, for the day the founder wants
 * to pick one.
 */

/**
 * FNV-1a, 32-bit. Chosen because it is four lines, has no dependencies,
 * and spreads short similar strings — `agent1`, `agent2` — into distant
 * buckets, which is exactly the input this gets.
 *
 * Not a security hash and not used as one.
 */
export function hashAgentId(id: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i);
    // The FNV prime, as shifts, so the maths stays in 32 bits.
    hash = (hash + (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24)) >>> 0;
  }
  return hash >>> 0;
}

/** The palette an agent wears. Same id, same palette, always. */
export function paletteForAgent(agentId: string): OrbPalette {
  const id = agentId.trim();
  if (!id) return ORB_PALETTES[0];
  return ORB_PALETTES[hashAgentId(id) % ORB_PALETTES.length];
}

/** A named palette, or undefined if the name is not one of ours. */
export function paletteById(paletteId: string): OrbPalette | undefined {
  return ORB_PALETTES.find(p => p.id === paletteId);
}

/**
 * The seed that decides the shape of one agent's clouds, as distinct from
 * their colour. Two agents sharing a palette still differ, which is what
 * keeps fifteen palettes enough for more than fifteen agents.
 *
 * Spread over a wide range because the shader feeds it into `sin()`: seeds
 * a fraction apart produce visibly similar noise.
 */
export function seedForAgent(agentId: string): number {
  return hashAgentId(`${agentId}:seed`) % 9973;
}

export interface OrbIdentity {
  readonly colors: string;
  readonly seed: number;
  readonly paletteId: string;
}

/**
 * Everything the orb needs for one agent, in the form the element takes.
 *
 * Pass `paletteId` to override the derived choice — a stored preference,
 * or a palette picked by hand.
 */
export function orbIdentity(agentId: string, paletteId?: string): OrbIdentity {
  const palette = (paletteId && paletteById(paletteId)) || paletteForAgent(agentId);
  return {
    colors: palette.colors.join(','),
    seed: seedForAgent(agentId),
    paletteId: palette.id,
  };
}
