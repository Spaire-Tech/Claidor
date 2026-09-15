import { describe, expect, test } from 'vitest';

import type { PresetAgent } from '../../types/agent';
import { AGENT_TABS, agentBody, installedPresetIds, matchingRoles, roleMeta } from './roles';

const role = (over: Partial<PresetAgent> & { id: string }): PresetAgent => ({
  name: over.id, nameEn: over.id, avatar: 0, icon: '', description: '', descriptionEn: '',
  identity: '', identityEn: '', systemPrompt: '', systemPromptEn: '', skillIds: [],
  ...over,
});

const ROLES: readonly PresetAgent[] = [
  role({
    id: 'engineering-lead', name: '工程负责人', nameEn: 'Engineering Lead',
    description: '写代码、审查、发布', descriptionEn: 'Writes, reviews and ships code',
  }),
  role({
    id: 'design-lead', name: '设计负责人', nameEn: 'Design Lead',
    description: '界面与素材', descriptionEn: 'Interfaces and artwork',
  }),
  role({
    id: 'financial-controller', name: '财务总监', nameEn: 'Financial Controller',
    description: '账目与预测', descriptionEn: 'Books, budgets and forecasts',
  }),
];

describe('searching the roles', () => {
  test('an empty box shows everybody', () => {
    expect(matchingRoles(ROLES, '')).toHaveLength(3);
    // Spaces are an empty box too. Somebody who typed and deleted should
    // not be left looking at nothing.
    expect(matchingRoles(ROLES, '   ')).toHaveLength(3);
  });

  test('it matches the name, whichever case', () => {
    expect(matchingRoles(ROLES, 'design').map(one => one.id)).toEqual(['design-lead']);
    expect(matchingRoles(ROLES, 'DESIGN').map(one => one.id)).toEqual(['design-lead']);
  });

  test('it matches what the role does, not only what it is called', () => {
    // "who deals with money" is how somebody actually looks for this.
    expect(matchingRoles(ROLES, 'budgets').map(one => one.id)).toEqual(['financial-controller']);
  });

  test('it matches the Chinese name, because the app has one', () => {
    expect(matchingRoles(ROLES, '设计').map(one => one.id)).toEqual(['design-lead']);
    expect(matchingRoles(ROLES, '账目').map(one => one.id)).toEqual(['financial-controller']);
  });

  test('nothing matching is empty, not everything', () => {
    // The bug this guards is a filter that falls back to the full list
    // when it finds nothing, which reads as "here they all are".
    expect(matchingRoles(ROLES, 'astronaut')).toEqual([]);
  });
});

describe('which roles are already here', () => {
  test('a preset agent marks its role', () => {
    const installed = installedPresetIds([
      { id: 'design-lead', source: 'preset' },
    ]);
    expect(installed.has('design-lead')).toBe(true);
    expect(installed.has('engineering-lead')).toBe(false);
  });

  test('an agent somebody made does not', () => {
    // Agents created by hand are named by the person, and one of them
    // could be called anything. Counting them would put "Added" beside a
    // role nobody had added.
    const installed = installedPresetIds([
      { id: 'design-lead', source: 'custom' },
      { id: 'main', source: 'custom' },
    ]);
    expect(installed.size).toBe(0);
  });

  test('no agents at all means none of them', () => {
    expect(installedPresetIds([]).size).toBe(0);
  });
});

describe('the role page', () => {
  const role = (over: Partial<PresetAgent> = {}): PresetAgent => ({
    id: 'engineering-lead',
    name: '工程主管',
    nameEn: 'Engineering Lead',
    avatar: 4,
    icon: '',
    description: '',
    descriptionEn: 'Standups, code review, incidents.',
    identity: '',
    identityEn: '',
    systemPrompt: '',
    systemPromptEn: '',
    skillIds: ['Standups', 'Code review'],
    ...over,
  });

  test('the five tabs are the canvas\'s, with the canvas\'s notes', () => {
    // I once wrote in the review that these do not appear in the canvas.
    // They do, exactly, and the notes are half of what makes the rail
    // readable rather than a list of nouns.
    expect(AGENT_TABS.map(t => [t.id, t.note])).toEqual([
      ['Instructions', 'How this agent works'],
      ['Memories', 'Facts it already knows'],
      ['Skills', 'Playbooks it can run'],
      ['Routines', 'Jobs that run on their own'],
      ['Integrations', 'Connectors it can use'],
    ]);
  });

  test('the meta line counts the skills and says where it came from', () => {
    expect(roleMeta(role())).toBe('2 skills · Official');
  });

  test('one skill is not "1 skills"', () => {
    expect(roleMeta(role({ skillIds: ['Standups'] }))).toBe('1 skill · Official');
  });

  test('a role with no skills says nothing about them', () => {
    expect(roleMeta(role({ skillIds: [] }))).toBe('Official');
  });

  test('the meta line ships no product name', () => {
    // The canvas reads "… · by Swens". The product has no name yet, and
    // shipping a placeholder in a string is how one becomes a brand.
    expect(roleMeta(role())).not.toMatch(/by /);
  });

  test('Instructions is the role\'s own description', () => {
    expect(agentBody(role(), 'Instructions')).toBe('Standups, code review, incidents.');
  });

  test('every other tab says something, in the agent\'s name', () => {
    for (const tab of ['Memories', 'Skills', 'Routines', 'Integrations'] as const) {
      const body = agentBody(role(), tab);
      expect(body.length, tab).toBeGreaterThan(40);
      expect(body, tab).toContain('Engineering Lead');
    }
  });

  test('the Skills tab counts playbooks, singular when there is one', () => {
    expect(agentBody(role({ skillIds: ['Standups'] }), 'Skills')).toContain('1 playbook');
    expect(agentBody(role(), 'Skills')).toContain('2 playbooks');
  });
});
