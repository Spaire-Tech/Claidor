import { describe, expect, test, vi } from 'vitest';

import { ExecPolicy } from './constants';
import {
  EXEC_POLICY_OPTIONS,
  execPolicyLabel,
  SETTINGS_TABS,
  settingsFor,
  type SettingsInput,
  SettingsRowKind,
  SettingsTab,
  tabForRow,
} from './rows';

const input = (over: Partial<SettingsInput> = {}): SettingsInput => ({
  accountName: 'Bass Fall',
  accountEmail: 'bass@example.com',
  computerName: 'Bass’s MacBook Pro',
  execPolicy: ExecPolicy.Ask,
  memoryEnabled: true,
  onSignOut: vi.fn(),
  onAddAccount: vi.fn(),
  onExecPolicy: vi.fn(),
  onMemory: vi.fn(),
  onWorkingDirectory: vi.fn(),
  onRefreshUsage: vi.fn(),
  onCheckUpdates: vi.fn(),
  ...over,
});

const rowsOf = (tab: SettingsTab, over: Partial<SettingsInput> = {}) =>
  settingsFor(tab, input(over)).flatMap(group => group.rows);

describe('the tabs', () => {
  test('are the canvas\'s four, in its order', () => {
    expect(SETTINGS_TABS).toEqual(['General', 'Computer', 'Usage & Billing', 'Updates']);
  });

  test('every tab has something on it', () => {
    // A tab that opens onto nothing is worse than no tab. If a future
    // change empties one, this is where it shows up.
    for (const tab of SETTINGS_TABS) {
      expect(settingsFor(tab, input()).length, tab).toBeGreaterThan(0);
    }
  });

  test('an empty group never reaches the screen', () => {
    const groups = settingsFor(SettingsTab.Usage, input());
    for (const group of groups) expect(group.rows.length, group.title).toBeGreaterThan(0);
  });

  test('the usage meter is there only once the server has answered', () => {
    expect(rowsOf(SettingsTab.Usage).some(one => one.id === 'usage')).toBe(false);
    const row = rowsOf(SettingsTab.Usage, {
      usage: { fraction: 0.74, value: '74%', desc: 'Ends in 6 days' },
    }).find(one => one.id === 'usage');
    if (row?.kind !== SettingsRowKind.Meter) throw new Error('not a meter');
    expect(row.fraction).toBeCloseTo(0.74);
    expect(row.value).toBe('74%');
  });

  test('and the tab says so rather than showing nothing', () => {
    // Found by the test above: with no quota the tab was blank. A tab
    // that opens onto nothing is worse than no tab.
    const row = rowsOf(SettingsTab.Usage).find(one => one.id === 'refresh-usage');
    expect(row?.desc).toContain('has not come back');
  });
});

describe('the Computer tab', () => {
  test('offers the three answers, and asking is one of them', () => {
    const row = rowsOf(SettingsTab.Computer).find(one => one.id === 'exec-policy');
    expect(row?.kind).toBe(SettingsRowKind.Select);
    expect(EXEC_POLICY_OPTIONS.map(one => one.value))
      .toEqual([ExecPolicy.Ask, ExecPolicy.Auto, ExecPolicy.Allow]);
  });

  test('every option says what happens, not what it is called', () => {
    for (const option of EXEC_POLICY_OPTIONS) {
      expect(option.hint, option.value).toBeTruthy();
      expect(option.hint!.length, option.value).toBeGreaterThan(20);
    }
  });

  test('picking one passes the policy up untouched', () => {
    const onExecPolicy = vi.fn();
    const row = rowsOf(SettingsTab.Computer, { onExecPolicy })
      .find(one => one.id === 'exec-policy');
    if (row?.kind !== SettingsRowKind.Select) throw new Error('not a select');
    row.onPick(ExecPolicy.Allow);
    expect(onExecPolicy).toHaveBeenCalledWith(ExecPolicy.Allow);
  });

  test('the computer is shown as a fact, not as something to type over', () => {
    const row = rowsOf(SettingsTab.Computer).find(one => one.id === 'computer-name');
    if (row?.kind !== SettingsRowKind.Field) throw new Error('not a field');
    expect(row.readOnly).toBe(true);
    expect(row.value).toBe('Bass’s MacBook Pro');
  });

  test('no computer name means no row, rather than an empty one', () => {
    expect(rowsOf(SettingsTab.Computer, { computerName: undefined })
      .some(one => one.id === 'computer-name')).toBe(false);
  });

  test('the working folder appears only when there is one', () => {
    expect(rowsOf(SettingsTab.Computer).some(one => one.id === 'working-directory')).toBe(false);
    const row = rowsOf(SettingsTab.Computer, { workingDirectory: '/Users/bass/Work' })
      .find(one => one.id === 'working-directory');
    expect(row?.desc).toBe('/Users/bass/Work');
  });
});

describe('the General tab', () => {
  test('names the person and their address', () => {
    const row = rowsOf(SettingsTab.General).find(one => one.id === 'sign-out');
    expect(row?.label).toBe('Bass Fall');
    expect(row?.desc).toBe('bass@example.com');
  });

  test('no address means no second line, not an empty one', () => {
    const row = rowsOf(SettingsTab.General, { accountEmail: undefined })
      .find(one => one.id === 'sign-out');
    expect(row).not.toHaveProperty('desc');
  });

  test('there is no models row and no key field, anywhere', () => {
    // The founder, 16 September: "i told you to remove that settings for
    // api keys. or allowance or whatever that is." And: "my users should
    // never put a key. everything happens under the hood. not a setting."
    for (const tab of SETTINGS_TABS) {
      const rows = rowsOf(tab);
      expect(rows.some(one => one.id === 'model-choice')).toBe(false);
      expect(rows.some(one => one.id === 'model-api-key')).toBe(false);
      expect(rows.some(one => /api key|allowance/i.test(one.label))).toBe(false);
      expect(rows.some(one => one.kind === SettingsRowKind.Field && one.secret)).toBe(false);
    }
    expect(settingsFor(SettingsTab.General, input()).some(group => group.title === 'Models')).toBe(false);
  });

  test('the memory toggle sends the opposite of what it shows', () => {
    const onMemory = vi.fn();
    const row = rowsOf(SettingsTab.General, { memoryEnabled: true, onMemory })
      .find(one => one.id === 'memory');
    if (row?.kind !== SettingsRowKind.Toggle) throw new Error('not a toggle');
    expect(row.on).toBe(true);
    row.onToggle();
    expect(onMemory).toHaveBeenCalledWith(false);
  });
});

describe('the Updates tab', () => {
  test('says which version, when it knows', () => {
    expect(rowsOf(SettingsTab.Updates, { version: '2026.9.4' })[0].label)
      .toBe('Version 2026.9.4');
  });

  test('says just "Version" rather than "Version undefined"', () => {
    expect(rowsOf(SettingsTab.Updates)[0].label).toBe('Version');
  });

  test('a check in flight marks the row busy', () => {
    const row = rowsOf(SettingsTab.Updates, { checkingUpdate: true })[0];
    if (row.kind !== SettingsRowKind.Button) throw new Error('not a button');
    expect(row.busy).toBe(true);
  });
});

describe('tabForRow', () => {
  // A settings pill in the thread (`caisra://settings/<row>`) opens
  // Settings on the tab the row sits on, so the link follows the row.
  test('finds the tab a row sits on', () => {
    expect(tabForRow('exec-policy', input())).toBe(SettingsTab.Computer);
    expect(tabForRow('memory', input())).toBe(SettingsTab.General);
    expect(tabForRow('refresh-usage', input())).toBe(SettingsTab.Usage);
    expect(tabForRow('version', input())).toBe(SettingsTab.Updates);
  });

  test('a row that is only there in some states follows the state', () => {
    // The usage meter is built once the figure has come back; before
    // that a link to it has no tab, and Settings opens where it opens.
    expect(tabForRow('usage', input())).toBeUndefined();
    expect(tabForRow('usage', input({ usage: { fraction: 0.2, value: '20%', desc: 'of this month' } })))
      .toBe(SettingsTab.Usage);
  });

  test('a row that does not exist has no tab', () => {
    expect(tabForRow('no-such-row', input())).toBeUndefined();
  });
});

describe('execPolicyLabel', () => {
  test('is the label a person picked', () => {
    expect(execPolicyLabel(ExecPolicy.Ask)).toBe('Ask every time');
    expect(execPolicyLabel(ExecPolicy.Allow)).toBe('Allow automatically');
  });
});
