import { ExecPolicy } from './constants';
import { ACCOUNT_MODELS } from './models';
import {
  SETTINGS_TABS,
  settingsFor,
  type SettingsGroup,
  type SettingsInput,
  SettingsRowKind,
} from './rows';

/**
 * The map of this app, written for the agent.
 *
 * **Why.** Asked "where do I turn that off", the agent has until now had
 * nothing to answer from. It guessed — three confident, wrong
 * explanations for the browser in one night (`docs/product/review.md`
 * §22), and the founder was told each of them by their own agent. A ban
 * on inventing click-paths is not enough on its own; it has to come with
 * the paths.
 *
 * **Why generated.** Grok Bot ships the same idea as hand-written prose
 * (`docs/product/sources/grok-bot-app-ui.md`), which is why theirs has
 * to hedge: *"Some rows exist only on some accounts, builds, or states;
 * if the user cannot find a row, say so."* That hedge exists because
 * prose drifts from the app.
 *
 * Ours cannot drift, because Settings is already data. `settingsFor()`
 * is the function that draws the screen, and this renders its output.
 * A row added, renamed or removed changes both at once. A row that is
 * conditional in the app is conditional here for the same reason.
 *
 * Written to `reference/app-ui.md` in each agent workspace by
 * `openclawConfigSync.ts`, and named in the managed prompt.
 */

/** Where the file lands, relative to the agent's workspace. */
export const APP_UI_MAP_PATH = 'reference/app-ui.md';

/**
 * Values that exist only to make the conditional rows appear.
 *
 * None of them is true of anybody's app, so none may reach the finished
 * map. Exported so `appUiMap.test.ts` can assert exactly that.
 */
export const MAP_PLACEHOLDERS = ['PLACEHOLDER-NAME', 'PLACEHOLDER-DIR', 'PLACEHOLDER-VERSION'] as const;

/**
 * A person with everything switched on.
 *
 * The map has to describe every row the app can draw, including the ones
 * that only appear once a value exists — the working folder, the usage
 * meter, the API key field. So the input here is deliberately the
 * fullest one, and the conditional rows are marked rather than hidden.
 */
const EVERY_ROW: SettingsInput = {
  accountName: MAP_PLACEHOLDERS[0],
  computerName: 'this computer',
  workingDirectory: MAP_PLACEHOLDERS[1],
  execPolicy: ExecPolicy.Ask,
  memoryEnabled: true,
  modelChoice: 'openai',
  modelApiKey: '',
  usage: { fraction: 0, value: '', desc: '' },
  version: MAP_PLACEHOLDERS[2],
  onSignOut: noop,
  onAddAccount: noop,
  onExecPolicy: noop,
  onMemory: noop,
  onModelChoice: noop,
  onModelApiKey: noop,
  onWorkingDirectory: noop,
  onRefreshUsage: noop,
  onCheckUpdates: noop,
};

function noop(): void {
  /* the map never presses anything */
}

/**
 * Rows the app only draws once something is true, and the condition in
 * plain words. Anything not named here is always on its tab.
 *
 * Keyed by row id, so a renamed row loses its note and the test says so
 * rather than the map quietly describing a row that no longer exists.
 */
const ONLY_WHEN: Record<string, string> = {
  'computer-name': 'once the app knows the computer\'s name',
  'working-directory': 'once a conversation has a working folder',
  usage: 'once the account\'s usage has come back from the server',
  'model-api-key': 'only when a provider other than the account is chosen',
};

/**
 * Rows whose label is made of live data.
 *
 * `EVERY_ROW` has to supply *some* value for every field or the
 * conditional rows vanish, and those values then show up in the label —
 * "Version 0", "OpenAI API key", the placeholder account name. None of
 * those are true of the app in general, and an agent repeating them back
 * would be inventing a fact. So these rows are described rather than
 * quoted, and `appUiMap.test.ts` checks that no placeholder leaks.
 */
const DESCRIBED_INSTEAD: Record<string, string> = {
  'sign-out': 'the person\'s own name',
  version: 'the version this app is on',
  'model-api-key': 'the chosen provider\'s API key',
  'refresh-usage': 'the usage figure',
};

/** What each row is for, in the words the agent should use. */
function rowLine(row: SettingsGroup['rows'][number]): string {
  const only = ONLY_WHEN[row.id];
  const control =
    row.kind === SettingsRowKind.Select ? 'a menu'
      : row.kind === SettingsRowKind.Toggle ? 'a switch'
        : row.kind === SettingsRowKind.Button ? `a button marked "${row.action}"`
          : row.kind === SettingsRowKind.Field ? (row.readOnly ? 'shown, not editable' : 'a box to type in')
            : 'a bar showing how much is used';

  const described = DESCRIBED_INSTEAD[row.id];
  return [
    `- \`${row.id}\` — ${described ?? `"${row.label}"`}, ${control}.`,
    only ? ` Appears ${only}.` : '',
  ].join('');
}

/**
 * The whole map, as markdown.
 *
 * `appName` is the app's own name so the file never says "the app" where
 * a person would say "Faiser", and never hard-codes it either.
 */
export function buildAppUiMap(appName: string): string {
  const lines: string[] = [
    `# ${appName}, as it actually is`,
    '',
    'This file is generated from the code that draws Settings, so it is',
    'correct for the build you are running in.',
    '',
    '**Use only what is on this page.** If somebody asks where a control',
    'is and it is not here, say you do not know and that you cannot find',
    'it in this version. Do not describe a menu, a tab, a gear icon or a',
    'keyboard shortcut that is not written below. A wrong path costs the',
    'person more than an honest "I am not sure".',
    '',
    '## Getting to Settings',
    '',
    'The account button at the bottom of the sidebar, with the person\'s',
    'name on it. That is the only way in. There is no gear icon, no',
    'Preferences item in the menu bar, and no keyboard shortcut.',
    '',
    '## The tabs',
    '',
    `Four, in this order: ${SETTINGS_TABS.map(one => `**${one}**`).join(', ')}.`,
    '',
  ];

  for (const tab of SETTINGS_TABS) {
    lines.push(`### ${tab}`, '');
    for (const group of settingsFor(tab, EVERY_ROW)) {
      lines.push(`**${group.title}**`, '');
      for (const row of group.rows) lines.push(rowLine(row));
      lines.push('');
    }
  }

  lines.push(
    '## What is not in this app',
    '',
    'Say so plainly if asked for any of these, rather than hunting for',
    'them:',
    '',
    '- A second computer, or a choice of which computer. There is one,',
    '  and it is the one the person is sitting at. Their files are worked',
    '  on where they live; nothing is copied to a machine of yours.',
    '- Any cloud computer to update or reset.',
    '- A theme or appearance setting, an accent colour, a language',
    '  setting, a microphone setting, hardware acceleration, a network',
    '  debugger, notification sounds, security keys, or auto-review rules.',
    '- Anything about a plan, a trial, or payment beyond the usage figure',
    '  on Usage & Billing.',
    '',
    '## Elsewhere in the app',
    '',
    '- **The computer icon** in the conversation header opens the panel:',
    '  the browser you drive, the files you have made, what you have',
    '  delegated, and what the person gave you.',
    '- **Models** live in Settings → General, not in the conversation.',
    `  \`${ACCOUNT_MODELS}\` means the account's own monthly allowance; the`,
    '  other choices are the person\'s own provider key, billed to them.',
    '',
  );

  return lines.join('\n');
}
