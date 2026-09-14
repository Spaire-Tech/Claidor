import { describe, expect, test } from 'vitest';

import type { PresetAgent } from '../../types/agent';
import { installedPresetIds, matchingRoles } from './roles';

const role = (over: Partial<PresetAgent> & { id: string }): PresetAgent => ({
  name: over.id, nameEn: over.id, icon: '', description: '', descriptionEn: '',
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
