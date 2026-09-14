import { describe, expect, test } from 'vitest';

import { systemPromptFor, VOICE_BRIEF, VOICES } from '../agents/voices';
import {
  canCreate,
  ComposeAction,
  ComposeRowKind,
  composeRows,
  MAX_SHORTCUTS,
  rowForShortcut,
} from './compose';
import type { SidebarAgent } from './Sidebar';

const agent = (id: string, name = id): SidebarAgent => ({
  id, name, preview: '', when: '',
});

describe('the compose picker', () => {
  test('offers to make a new agent before it offers the old ones', () => {
    const rows = composeRows({ agents: [agent('juno', 'Juno')], query: '' });
    expect(rows[0]).toMatchObject({
      kind: ComposeRowKind.Action,
      id: ComposeAction.NewAgent,
    });
    expect(rows[1]).toMatchObject({ kind: ComposeRowKind.Agent, id: 'juno' });
  });

  test('filters agents and actions by the same query', () => {
    const agents = [agent('juno', 'Juno'), agent('mira', 'Mira')];
    expect(composeRows({ agents, query: 'mir' }).map(r => r.id)).toEqual(['mira']);
    // "Create new agent" is findable by typing at it, like everything else.
    expect(composeRows({ agents, query: 'creat' }).map(r => r.id))
      .toEqual([ComposeAction.NewAgent]);
  });

  test('numbers the rows you can see, not the ones you filtered away', () => {
    const agents = [agent('juno', 'Juno'), agent('mira', 'Mira')];
    const rows = composeRows({ agents, query: 'mira' });
    // Mira is the only row, so she is ⌘1 — not ⌘3 because of her position
    // in a list that is no longer on screen.
    expect(rows[0].key).toBe('1');
    expect(rowForShortcut(rows, '1')?.id).toBe('mira');
    expect(rowForShortcut(rows, '2')).toBeUndefined();
  });

  test('stops handing out shortcuts after the ninth row', () => {
    const many = Array.from({ length: 20 }, (_, i) => agent(`a${i}`, `Agent ${i}`));
    const rows = composeRows({ agents: many, query: '' });
    expect(rows.filter(r => r.key)).toHaveLength(MAX_SHORTCUTS);
    expect(rows[MAX_SHORTCUTS].key).toBeUndefined();
  });

  test('has no group row, because groups are not built', () => {
    // A button that opens nothing is worse than one that is not there.
    const rows = composeRows({ agents: [], query: '' });
    expect(JSON.stringify(rows).toLowerCase()).not.toContain('group');
  });

  test('a name is all it takes to create one', () => {
    expect(canCreate('')).toBe(false);
    expect(canCreate('   ')).toBe(false);
    expect(canCreate('Perrin')).toBe(true);
  });
});

describe('the instructions a new agent is created with', () => {
  test('carry the voice brief verbatim, every time', () => {
    // Even with no voice picked: the brief is the house style, not a
    // setting, and paraphrasing it is how the app stops sounding human.
    expect(systemPromptFor({ name: 'Perrin' })).toContain(VOICE_BRIEF);
    expect(systemPromptFor({ name: 'Perrin', voiceId: 'warm' })).toContain(VOICE_BRIEF);
  });

  test('name the agent, its remit and how it speaks', () => {
    const prompt = systemPromptFor({
      name: 'Perrin',
      label: 'Research',
      description: 'Reads the deck before the call.',
      voiceId: 'concise',
    });
    expect(prompt).toContain('You are Perrin.');
    expect(prompt).toContain('Your remit is research.');
    expect(prompt).toContain('Reads the deck before the call.');
    expect(prompt).toContain('Your voice is concise');
  });

  test('leave out what was left blank rather than saying nothing twice', () => {
    const prompt = systemPromptFor({ name: 'Perrin', label: '  ', description: '' });
    expect(prompt).not.toContain('Your remit is');
    expect(prompt).not.toContain('described your job as');
  });

  test('ship no product name', () => {
    const prompt = systemPromptFor({ name: 'Perrin', voiceId: 'warm' }).toLowerCase();
    for (const forbidden of ['faiser', 'maties', 'swens', 'lobsterai', 'claidor']) {
      expect(prompt).not.toContain(forbidden);
    }
  });

  test('there are seven voices, as the direction says', () => {
    expect(VOICES).toHaveLength(7);
    expect(VOICES.map(v => v.name)).toEqual([
      'Concise', 'Balanced', 'Warm', 'Direct', 'Sassy', 'Curious', 'Formal',
    ]);
  });
});
