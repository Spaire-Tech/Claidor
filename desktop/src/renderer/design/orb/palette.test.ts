import { describe, expect, test } from 'vitest';

import { ORB_PALETTES } from '../tokens';
import {
  hashAgentId,
  orbIdentity,
  paletteById,
  paletteForAgent,
  seedForAgent,
} from './palette';

describe('paletteForAgent', () => {
  test('is the same every time, because an orb is an agent&apos;s face', () => {
    // The property that matters most: a person recognises an agent by
    // colour before they read the name. If this ever varies between
    // launches, that recognition is gone.
    const first = paletteForAgent('agent-mira');
    for (let i = 0; i < 100; i += 1) {
      expect(paletteForAgent('agent-mira')).toBe(first);
    }
  });

  test('does not depend on position in a list', () => {
    const ids = ['juno', 'mira', 'perrin', 'sable'];
    const before = ids.map(paletteForAgent).map(p => p.id);
    const after = [...ids].reverse().map(paletteForAgent).map(p => p.id);
    expect(after).toEqual([...before].reverse());
  });

  test('spreads similar ids apart rather than clustering them', () => {
    // Agent ids are generated as `agent` + a timestamp in base 36, so
    // consecutive agents differ in one trailing character. Index-based or
    // weakly-hashed assignment would give a sidebar of near-identical
    // orbs, which is the whole thing fifteen palettes exist to prevent.
    const ids = Array.from({ length: 15 }, (_, i) => `agent${(1_000_000 + i).toString(36)}`);
    const chosen = new Set(ids.map(id => paletteForAgent(id).id));
    expect(chosen.size).toBeGreaterThanOrEqual(9);
  });

  test('uses the whole set given enough agents', () => {
    const ids = Array.from({ length: 600 }, (_, i) => `agent-${i}`);
    const chosen = new Set(ids.map(id => paletteForAgent(id).id));
    expect(chosen.size).toBe(ORB_PALETTES.length);
  });

  test('spreads roughly evenly rather than favouring a few', () => {
    const counts = new Map<string, number>();
    for (let i = 0; i < 1500; i += 1) {
      const id = paletteForAgent(`agent-${i}`).id;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    const expected = 1500 / ORB_PALETTES.length;
    for (const [id, n] of counts) {
      // Generous bounds: this is testing that nothing is starved or
      // hogged, not that a hash is a uniform generator.
      expect(n, id).toBeGreaterThan(expected * 0.4);
      expect(n, id).toBeLessThan(expected * 1.8);
    }
  });

  test('falls back to the first palette rather than failing on a blank id', () => {
    expect(paletteForAgent('')).toBe(ORB_PALETTES[0]);
    expect(paletteForAgent('   ')).toBe(ORB_PALETTES[0]);
  });
});

describe('seedForAgent', () => {
  test('is stable, and differs from the palette hash', () => {
    expect(seedForAgent('mira')).toBe(seedForAgent('mira'));
    expect(seedForAgent('mira')).not.toBe(hashAgentId('mira'));
  });

  test('separates two agents that happen to share a palette', () => {
    const sharing: string[] = [];
    for (let i = 0; sharing.length < 2 && i < 500; i += 1) {
      const id = `agent-${i}`;
      if (paletteForAgent(id).id === paletteForAgent('agent-0').id) sharing.push(id);
    }
    expect(sharing).toHaveLength(2);
    expect(seedForAgent(sharing[0])).not.toBe(seedForAgent(sharing[1]));
  });

  test('is spread wide, because the shader feeds it to sin()', () => {
    // Seeds a fraction apart make visibly similar noise, so a narrow
    // range would undo the point of having a seed at all.
    const seeds = Array.from({ length: 200 }, (_, i) => seedForAgent(`agent-${i}`));
    expect(Math.max(...seeds) - Math.min(...seeds)).toBeGreaterThan(5000);
    expect(new Set(seeds).size).toBeGreaterThan(180);
  });
});

describe('orbIdentity', () => {
  test('gives the element exactly what it reads', () => {
    const identity = orbIdentity('perrin');
    expect(identity.colors.split(',')).toHaveLength(5);
    expect(identity.colors).toBe(paletteForAgent('perrin').colors.join(','));
    expect(identity.seed).toBe(seedForAgent('perrin'));
  });

  test('an explicit palette wins over the derived one', () => {
    const identity = orbIdentity('perrin', 'jade');
    expect(identity.paletteId).toBe('jade');
    expect(identity.colors).toBe(paletteById('jade')?.colors.join(','));
    // The seed still comes from the agent, so two agents both set to
    // jade do not become identical.
    expect(identity.seed).toBe(seedForAgent('perrin'));
  });

  test('an unknown palette name falls back rather than rendering nothing', () => {
    expect(orbIdentity('perrin', 'chartreuse').paletteId)
      .toBe(paletteForAgent('perrin').id);
  });
});
