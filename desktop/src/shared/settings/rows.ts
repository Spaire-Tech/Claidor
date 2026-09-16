import { ExecPolicy } from './constants';

/**
 * Settings, as data.
 *
 * The screen is a rail of four tabs and a column of grouped rows, and the
 * rows come in exactly five kinds. That is the canvas's structure, and
 * keeping it as data rather than as markup is what makes the interesting
 * half — which rows exist, what they say, what they are worth showing —
 * testable without rendering anything.
 *
 * **What is not here, and why.** The canvas draws rows this product does
 * not have anything behind: a second computer, an egress tunnel, hardware
 * security keys, auto-review rules in plain words, plan management, an
 * update track, and a shared cloud computer to update or reset. Every one
 * of those would be a control that looks like the others and does
 * nothing, which is the thing the founder has already objected to twice.
 * They are listed in `docs/product/review.md` under item 5 so the
 * omissions are a decision on the record rather than a gap.
 */

export const SettingsTab = {
  General: 'General',
  Computer: 'Computer',
  Usage: 'Usage & Billing',
  Updates: 'Updates',
} as const;
export type SettingsTab = typeof SettingsTab[keyof typeof SettingsTab];

/** In the canvas's order, which is also the order of how often you need them. */
export const SETTINGS_TABS: readonly SettingsTab[] = [
  SettingsTab.General,
  SettingsTab.Computer,
  SettingsTab.Usage,
  SettingsTab.Updates,
];

export const SettingsRowKind = {
  Select: 'select',
  Toggle: 'toggle',
  Button: 'button',
  Field: 'field',
  Meter: 'meter',
} as const;
export type SettingsRowKind = typeof SettingsRowKind[keyof typeof SettingsRowKind];

export interface SelectOption {
  value: string;
  label: string;
  /** One line under the label in the menu. Not every option needs one. */
  hint?: string;
}

interface RowBase {
  /** Unique within its tab, for React and for tests. */
  id: string;
  label: string;
  desc?: string;
}

export interface SelectRow extends RowBase {
  kind: typeof SettingsRowKind.Select;
  value: string;
  options: readonly SelectOption[];
  onPick: (value: string) => void;
}

export interface ToggleRow extends RowBase {
  kind: typeof SettingsRowKind.Toggle;
  on: boolean;
  onToggle: () => void;
}

export interface ButtonRow extends RowBase {
  kind: typeof SettingsRowKind.Button;
  /** What the button says. The label is what the row is about. */
  action: string;
  tone?: 'primary' | 'danger';
  busy?: boolean;
  onPress: () => void;
}

export interface FieldRow extends RowBase {
  kind: typeof SettingsRowKind.Field;
  value: string;
  /** A fact rather than a setting — shown, not editable. */
  readOnly?: boolean;
  /** An API key. Masked until somebody asks to see it. */
  secret?: boolean;
  placeholder?: string;
  onSave?: (value: string) => void;
}

export interface MeterRow extends RowBase {
  kind: typeof SettingsRowKind.Meter;
  /** 0–1. */
  fraction: number;
  /** "74%", "All used". */
  value: string;
  desc: string;
}

export type SettingsRow = SelectRow | ToggleRow | ButtonRow | FieldRow | MeterRow;

export interface SettingsGroup {
  title: string;
  rows: readonly SettingsRow[];
}

/** What the screen needs to know, and what it can do about it. */
export interface SettingsInput {
  accountName: string;
  accountEmail?: string;
  /** This machine, as the person would recognise it. */
  computerName?: string;
  /** Where the agent works, when a conversation is open. */
  workingDirectory?: string;
  execPolicy: ExecPolicy;
  memoryEnabled: boolean;
  /** 0–1 and a phrase, from the account's quota. Absent while unknown. */
  usage?: { fraction: number; value: string; desc: string };
  version?: string;
  /** "You're up to date", "Downloading…", whatever the updater last said. */
  updateNote?: string;
  checkingUpdate?: boolean;
  onSignOut: () => void;
  onAddAccount: () => void;
  onExecPolicy: (policy: ExecPolicy) => void;
  onMemory: (enabled: boolean) => void;
  onWorkingDirectory: () => void;
  onRefreshUsage: () => void;
  onCheckUpdates: () => void;
}

/**
 * The three answers to "how much may it do on this computer".
 *
 * The wording matters more than usual: this is the sentence somebody
 * reads once and then lives with for months. Each says what happens, not
 * what it is called.
 */
export const EXEC_POLICY_OPTIONS: readonly SelectOption[] = [
  {
    value: ExecPolicy.Ask,
    label: 'Ask every time',
    hint: 'Nothing runs on this computer until you say so.',
  },
  {
    value: ExecPolicy.Auto,
    label: 'Check, then ask',
    hint: 'It runs everyday commands and asks you about risky ones.',
  },
  {
    value: ExecPolicy.Allow,
    label: 'Allow automatically',
    hint: 'It runs commands without asking. You will not be shown them.',
  },
];

/**
 * The tab a row sits on, for a deep link the agent wrote
 * (`caisra://settings/<row>`), or undefined for a row that does not
 * exist. Found by building each tab rather than kept as a second table,
 * so a row that moves takes its link with it.
 */
export function tabForRow(rowId: string, input: SettingsInput): SettingsTab | undefined {
  return SETTINGS_TABS.find(tab =>
    settingsFor(tab, input).some(group => group.rows.some(row => row.id === rowId)));
}

export function execPolicyLabel(policy: ExecPolicy): string {
  return EXEC_POLICY_OPTIONS.find(one => one.value === policy)?.label ?? 'Ask every time';
}

/** The groups on one tab. Empty groups never reach the screen. */
export function settingsFor(
  tab: SettingsTab,
  input: SettingsInput,
): readonly SettingsGroup[] {
  const groups = build(tab, input);
  return groups.filter(group => group.rows.length > 0);
}

function build(tab: SettingsTab, input: SettingsInput): SettingsGroup[] {
  switch (tab) {
    case SettingsTab.Computer:
      return [
        {
          title: 'This computer',
          rows: [
            ...(input.computerName
              ? [{
                kind: SettingsRowKind.Field,
                id: 'computer-name',
                label: 'Current computer',
                desc: 'The one you are using now. It is the only one — an agent here works on your disk, where your files already are.',
                value: input.computerName,
                readOnly: true,
              } satisfies FieldRow]
              : []),
            {
              kind: SettingsRowKind.Select,
              id: 'exec-policy',
              label: 'Running things on this computer',
              desc: 'Opening files, running commands, driving the browser.',
              value: input.execPolicy,
              options: EXEC_POLICY_OPTIONS,
              onPick: value => input.onExecPolicy(value as ExecPolicy),
            },
            ...(input.workingDirectory
              ? [{
                kind: SettingsRowKind.Button,
                id: 'working-directory',
                label: 'Working folder',
                desc: input.workingDirectory,
                action: 'Change',
                onPress: input.onWorkingDirectory,
              } satisfies ButtonRow]
              : []),
          ],
        },
      ];

    case SettingsTab.Usage:
      return [
        {
          title: 'Usage',
          rows: [
            ...(input.usage
              ? [{
                kind: SettingsRowKind.Meter,
                id: 'usage',
                label: 'Usage',
                fraction: input.usage.fraction,
                value: input.usage.value,
                desc: input.usage.desc,
              } satisfies MeterRow]
              : []),
            // Always here, so the tab is never blank. A figure that has
            // not arrived is a thing you want to be able to ask for
            // again, and a tab that opens onto nothing is worse than no
            // tab — which is what this looked like before a test said so.
            {
              kind: SettingsRowKind.Button,
              id: 'refresh-usage',
              label: input.usage ? 'Check again' : 'Usage',
              desc: input.usage
                ? 'Asks the server for the current figure.'
                : 'The figure has not come back from the server yet.',
              action: 'Refresh',
              onPress: input.onRefreshUsage,
            } satisfies ButtonRow,
          ],
        },
      ];

    case SettingsTab.Updates:
      return [
        {
          title: 'Updates',
          rows: [{
            kind: SettingsRowKind.Button,
            id: 'version',
            label: input.version ? `Version ${input.version}` : 'Version',
            ...(input.updateNote ? { desc: input.updateNote } : {}),
            action: 'Check for updates',
            ...(input.checkingUpdate ? { busy: true } : {}),
            onPress: input.onCheckUpdates,
          } satisfies ButtonRow],
        },
      ];

    case SettingsTab.General:
    default:
      return [
        {
          title: 'Account',
          rows: [
            {
              kind: SettingsRowKind.Button,
              id: 'sign-out',
              label: input.accountName,
              ...(input.accountEmail ? { desc: input.accountEmail } : {}),
              action: 'Sign out',
              onPress: input.onSignOut,
            } satisfies ButtonRow,
            {
              kind: SettingsRowKind.Button,
              id: 'add-account',
              label: 'Add account',
              desc: 'One account at a time — signing in as somebody else replaces this one.',
              action: 'Add',
              onPress: input.onAddAccount,
            } satisfies ButtonRow,
          ],
        },
        // No "Models" group, and no "Apps" group with a Composio key. There
        // was a Models group for a day — "Your account's allowance" or your
        // own provider key — and the founder, 16 September: "i told you only
        // use my claude code account. i told you to remove that settings for
        // api keys. or allowance or whatever that is." And, of keys in
        // general: "my users should never put a key. everything happens
        // under the hood. not a setting." So which models run is decided in
        // code — the account's models through the metered proxy, or the
        // Claude Code sign-in in a development build
        // (`main/libs/claudeCodeMode.ts`) — and the Composio key is
        // Claidor's, on the server (`polar/desktop/composio.py`).
        {
          title: 'Agents',
          rows: [{
            kind: SettingsRowKind.Toggle,
            id: 'memory',
            label: 'Memory',
            desc: 'Your agents keep what you tell them — team names, where files live, how you like things written — and use it without being reminded.',
            on: input.memoryEnabled,
            onToggle: () => input.onMemory(!input.memoryEnabled),
          } satisfies ToggleRow],
        },
      ];
  }
}
