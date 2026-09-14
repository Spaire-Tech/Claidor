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
    // Four palettes and a hash: neighbouring ids must not land on the
    // same disc, or a sidebar of agents reads as one colour.
    const ids = ['agent-1', 'agent-2', 'agent-3', 'agent-4'];
    const chosen = new Set(ids.map(id => paletteForAgent(id).id));
    expect(chosen.size).toBeGreaterThan(1);
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

  test('two agents on the same palette get the same orb, as the canvas does', () => {
    // With four palettes this is common, and it is what the design says:
    // an orb is a palette, and the palette carries its seed. Making them
    // differ would mean inventing a seed the founder never chose.
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const pairs = new Map<string, number>();
    for (const id of ids) pairs.set(paletteForAgent(id).id, seedForAgent(id));
    for (const [paletteId, seed] of pairs) {
      expect(seed).toBe(paletteById(paletteId)?.seed);
    }
  });

  test('is one of the canvas\'s four, not a number we made up', () => {
    // It used to be `hash(id) % 9973`, which gave every agent a shape
    // nobody had seen. Now it can only be 11, 22, 33 or 44.
    const allowed = new Set(ORB_PALETTES.map(one => one.seed));
    for (const id of ['juno', 'mira', 'perrin', 'sable', 'main', '']) {
      expect(allowed.has(seedForAgent(id)), id).toBe(true);
    }
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
    const identity = orbIdentity('perrin', 'fuchsia');
    expect(identity.paletteId).toBe('fuchsia');
    expect(identity.colors).toBe(paletteById('fuchsia')?.colors.join(','));
    // The seed still comes from the agent, so two agents both set to
    // jade do not become identical.
    expect(identity.seed).toBe(seedForAgent('perrin'));
  });

  test('an unknown palette name falls back rather than rendering nothing', () => {
    expect(orbIdentity('perrin', 'chartreuse').paletteId)
      .toBe(paletteForAgent('perrin').id);
  });
});
