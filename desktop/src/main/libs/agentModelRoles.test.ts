import { ModelRole, OpenClawProviderId } from '@shared/providers';
import { describe, expect, test } from 'vitest';

import {
  type AgentModelRoleRefs,
  buildAgentModelRoleDefaults,
  resolveAgentModelRoleRefs,
  type RoledServerModel,
} from './agentModelRoles';

const SERVER = OpenClawProviderId.LobsteraiServer;

// The catalogue as the server serves it today: one model per role, plus
// priced-but-roleless entries that must not reach the config.
const CATALOGUE: RoledServerModel[] = [
  { modelId: 'claude-sonnet-5', role: ModelRole.Fallback },
  { modelId: 'claude-opus-5' },
  { modelId: 'claude-haiku-4-5-20251001' },
  { modelId: 'gpt-5.6-terra', role: ModelRole.Primary },
  { modelId: 'gpt-6-astra' },
  { modelId: 'gpt-5.6-luna', role: ModelRole.Cheap },
];

describe('resolveAgentModelRoleRefs', () => {
  test('reads one ref per role from the catalogue', () => {
    expect(resolveAgentModelRoleRefs(CATALOGUE, SERVER)).toEqual({
      primary: `${SERVER}/gpt-5.6-terra`,
      cheap: `${SERVER}/gpt-5.6-luna`,
      fallback: `${SERVER}/claude-sonnet-5`,
    });
  });

  test('ignores models the server gave no role', () => {
    const refs = resolveAgentModelRoleRefs(CATALOGUE, SERVER);
    const written = Object.values(refs).join(' ');
    expect(written).not.toContain('astra');
    expect(written).not.toContain('opus');
    expect(written).not.toContain('haiku');
  });

  test('keeps the first when a role is sent twice, so order expresses preference', () => {
    expect(resolveAgentModelRoleRefs([
      { modelId: 'first', role: ModelRole.Cheap },
      { modelId: 'second', role: ModelRole.Cheap },
    ], SERVER).cheap).toBe(`${SERVER}/first`);
  });

  test('omits a role the catalogue does not carry', () => {
    // What an Anthropic key going missing on the server looks like here.
    const refs = resolveAgentModelRoleRefs(
      CATALOGUE.filter(m => m.role !== ModelRole.Fallback),
      SERVER,
    );
    expect(refs.fallback).toBeUndefined();
    expect(refs.primary).toBe(`${SERVER}/gpt-5.6-terra`);
  });

  test('returns nothing without a provider id or models', () => {
    expect(resolveAgentModelRoleRefs(CATALOGUE, '')).toEqual({});
    expect(resolveAgentModelRoleRefs([], SERVER)).toEqual({});
  });

  test('skips a blank model id rather than writing a dangling ref', () => {
    expect(resolveAgentModelRoleRefs([
      { modelId: '   ', role: ModelRole.Cheap },
      { modelId: 'real', role: ModelRole.Cheap },
    ], SERVER).cheap).toBe(`${SERVER}/real`);
  });
});

describe('buildAgentModelRoleDefaults', () => {
  const refs: AgentModelRoleRefs = resolveAgentModelRoleRefs(CATALOGUE, SERVER);

  test('sends every piece of machinery to the cheap model', () => {
    const defaults = buildAgentModelRoleDefaults(refs);
    const cheap = `${SERVER}/gpt-5.6-luna`;

    expect(defaults.subagents).toEqual({ model: cheap });
    expect(defaults.compaction.model).toBe(cheap);
    expect(defaults.compaction.memoryFlush).toEqual({ model: cheap });
    expect(defaults.heartbeat.model).toBe(cheap);
  });

  test('stands the fallback behind the primary without naming it elsewhere', () => {
    const defaults = buildAgentModelRoleDefaults(refs);
    expect(defaults.model.fallbacks).toEqual([`${SERVER}/claude-sonnet-5`]);
  });

  test('writes nothing at all when no role has a model', () => {
    const defaults = buildAgentModelRoleDefaults({});
    expect(defaults.model).toEqual({});
    expect(defaults.compaction).toEqual({});
    expect(defaults.heartbeat).toEqual({});
    expect(defaults.subagents).toBeUndefined();
  });

  test('a missing fallback leaves the cheap slots intact, and the reverse', () => {
    const noFallback = buildAgentModelRoleDefaults({ primary: 'p/a', cheap: 'p/b' });
    expect(noFallback.model).toEqual({});
    expect(noFallback.subagents).toEqual({ model: 'p/b' });

    const noCheap = buildAgentModelRoleDefaults({ primary: 'p/a', fallback: 'p/c' });
    expect(noCheap.model.fallbacks).toEqual(['p/c']);
    expect(noCheap.subagents).toBeUndefined();
    expect(noCheap.compaction).toEqual({});
    expect(noCheap.heartbeat).toEqual({});
  });
});
