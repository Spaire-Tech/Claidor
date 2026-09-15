import { describe, expect, test, vi } from 'vitest';

import { APP_UI_MAP_PATH, buildAppUiMap, MAP_PLACEHOLDERS } from './appUiMap';
import { ExecPolicy } from './constants';
import { SETTINGS_TABS, settingsFor, type SettingsInput } from './rows';

const full = (over: Partial<SettingsInput> = {}): SettingsInput => ({
  accountName: 'Bass Fall',
  computerName: 'Bass’s MacBook Pro',
  workingDirectory: '/Users/bass/Work',
  execPolicy: ExecPolicy.Ask,
  memoryEnabled: true,
  modelChoice: 'openai',
  modelApiKey: '',
  composioApiKey: '',
  claudeCodeModel: '',
  usage: { fraction: 0.5, value: '50%', desc: 'Ends in 6 days' },
  version: '2026.9.4',
  onSignOut: vi.fn(),
  onAddAccount: vi.fn(),
  onExecPolicy: vi.fn(),
  onMemory: vi.fn(),
  onModelChoice: vi.fn(),
  onModelApiKey: vi.fn(),
  onComposioApiKey: vi.fn(),
  onClaudeCodeModel: vi.fn(),
  onWorkingDirectory: vi.fn(),
  onRefreshUsage: vi.fn(),
  onCheckUpdates: vi.fn(),
  ...over,
});

const everyRowId = (): string[] =>
  SETTINGS_TABS.flatMap(tab =>
    settingsFor(tab, full()).flatMap(group => group.rows.map(row => row.id)),
  );

const map = (): string => buildAppUiMap('Caisra');

describe('the map cannot drift from the app', () => {
  // This is the whole point of generating it. Grok Bot ships the same
  // document as prose and has to hedge that rows may not exist; ours is
  // rendered from `settingsFor()`, the function that draws the screen,
  // and this test is what keeps that true.
  test('every row the app can draw is on the map', () => {
    const text = map();
    for (const id of everyRowId()) {
      expect(text, id).toContain(`\`${id}\``);
    }
  });

  test('every row the map names exists in the app', () => {
    const named = [...map().matchAll(/^- `([a-z-]+)`/gm)].map(one => one[1]);
    expect(named.length).toBeGreaterThan(0);
    const real = new Set(everyRowId());
    for (const id of named) {
      expect(real.has(id), `the map names "${id}" and the app has no such row`).toBe(true);
    }
  });

  test('every tab is a heading, in the app’s own order', () => {
    const headings = [...map().matchAll(/^### (.+)$/gm)].map(one => one[1]);
    expect(headings).toEqual([...SETTINGS_TABS]);
  });

  test('a row that appears only sometimes is still described', () => {
    // `settingsFor` leaves these out when their value is missing. The map
    // has to carry them anyway, or the agent will tell somebody a control
    // does not exist when it is one working folder away.
    const sparse = SETTINGS_TABS.flatMap(tab =>
      settingsFor(tab, full({
        computerName: undefined,
        workingDirectory: undefined,
        usage: undefined,
      })).flatMap(group => group.rows.map(row => row.id)),
    );
    for (const id of ['computer-name', 'working-directory', 'usage']) {
      expect(sparse, id).not.toContain(id);
      expect(map(), id).toContain(`\`${id}\``);
      expect(map(), id).toMatch(new RegExp(`\`${id}\`[^\\n]*Appears `));
    }
  });
});

describe('the map states nothing it cannot know', () => {
  // Found by reading the generated file rather than the code. Every row
  // is drawn from a sample person, and the sample was showing through:
  // "Version 0", "OpenAI API key". An agent reading those back would be
  // stating a fact about the app that is not true — which is the exact
  // failure the map exists to stop.
  test('no sample value reaches the page', () => {
    const text = map();
    for (const placeholder of MAP_PLACEHOLDERS) {
      expect(text, placeholder).not.toContain(placeholder);
    }
  });

  test('it does not claim a version, a provider, or a folder', () => {
    const text = map();
    expect(text).not.toMatch(/Version \d/);
    expect(text).not.toMatch(/OpenAI API key/);
    expect(text).toContain('the version this app is on');
    expect(text).toContain("the chosen provider's API key");
  });
});

describe('what the map tells the agent', () => {
  test('it says to admit ignorance rather than invent a path', () => {
    // The rule and the facts ship together. A ban on inventing click
    // paths is not actionable without the paths.
    expect(map()).toMatch(/say you do not know/i);
    expect(map()).toMatch(/Do not describe a menu, a tab, a gear icon/i);
  });

  test('it names the only way into Settings, and rules out the rest', () => {
    const text = map();
    expect(text).toMatch(/account button at the bottom of the sidebar/i);
    expect(text).toMatch(/no gear icon/i);
    expect(text).toMatch(/no keyboard shortcut/i);
  });

  test('it says there is one computer and it is the person’s own', () => {
    // direction.md section 10. The differentiator is not "no cloud", it
    // is that the file is worked on where it lives, and an agent that
    // offers to pick a computer has already given that away.
    const text = map();
    expect(text).toMatch(/There is one,/);
    expect(text).toMatch(/where they live/);
    expect(text).toMatch(/nothing is copied to a machine of yours/i);
  });

  test('it lists what this app does not have, so the agent stops looking', () => {
    const text = map();
    for (const absent of ['theme', 'microphone', 'hardware acceleration', 'security keys']) {
      expect(text.toLowerCase(), absent).toContain(absent);
    }
  });

  test('it says where an agent is edited and deleted, and that the agent cannot do it', () => {
    // Found by the audit against Grok Bot's contract (§12, §17): the map
    // described Settings and the computer icon and nothing else, so an
    // agent asked "how do I rename you" or "delete you" was back to
    // guessing. The panel and the trash icon are real
    // (`design/agent/AgentPanel.tsx`, `design/shell/Sidebar.tsx`); the
    // map has to say so.
    const text = map();
    expect(text).toMatch(/its name in the conversation\s+header/i);
    expect(text).toMatch(/trash icon/i);
    expect(text).toMatch(/"Delete" \/ "Keep"/);
    expect(text).toMatch(/no archive and no hide/i);
    expect(text).toMatch(/You cannot delete an agent yourself/i);
  });

  test('it carries the app’s own name rather than "the app"', () => {
    expect(buildAppUiMap('Caisra')).toContain('# Caisra, as it actually is');
    expect(buildAppUiMap('Something Else')).toContain('# Something Else, as it actually is');
  });

  test('it lands somewhere the agent can read from its workspace', () => {
    expect(APP_UI_MAP_PATH).toBe('reference/app-ui.md');
    expect(APP_UI_MAP_PATH.startsWith('/')).toBe(false);
  });
});
