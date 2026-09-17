/**
 * Settings, as data.
 *
 * Ported from the founder's `desktop/src/shared/settings/rows.ts`, with its
 * wording kept to the word. The screen is a rail of four tabs and a column of
 * grouped rows, and the rows come in exactly five kinds. Keeping that as data
 * rather than as markup is what makes the interesting half — which rows exist,
 * what they say, whether they are worth showing — testable without rendering
 * anything.
 *
 * **What is not here, and why.** The canvas draws rows this product has nothing
 * behind: a second computer, an egress tunnel, hardware keys, plan management,
 * an update track. Every one would be a control that looks like the others and
 * does nothing, which is the thing the founder has objected to more than once.
 *
 * **And what is deliberately not here.** No Models group. There was one for a
 * day, offering "your account's allowance" or your own provider key, and the
 * founder: *"i told you only use my claude code account. i told you to remove
 * that settings for api keys."* And on keys in general: *"my users should never
 * put a key. everything happens under the hood. not a setting."* Which models
 * run is decided in code, through the metered proxy.
 */

/**
 * The three answers to "how much may it do on this computer".
 *
 * The wording matters more than usual: this is the sentence somebody reads once
 * and then lives with for months. Each says what happens, not what it is
 * called.
 */
export const ExecPolicy = {
  /** Ask before anything that is not already allowed. The default. */
  Ask: "ask",
  /** The same, but the agent reviews its own action first. */
  Auto: "auto",
  /** Never ask. */
  Allow: "allow",
} as const;
export type ExecPolicy = (typeof ExecPolicy)[keyof typeof ExecPolicy];

export const DEFAULT_EXEC_POLICY: ExecPolicy = ExecPolicy.Ask;

export const SettingsTab = {
  General: "General",
  Computer: "Computer",
  Usage: "Usage & Billing",
  Updates: "Updates",
} as const;
export type SettingsTab = (typeof SettingsTab)[keyof typeof SettingsTab];

/** In the canvas's order, which is also the order of how often you need them. */
export const SETTINGS_TABS: readonly SettingsTab[] = [
  SettingsTab.General,
  SettingsTab.Computer,
  SettingsTab.Usage,
  SettingsTab.Updates,
];

export const SettingsRowKind = {
  Select: "select",
  Toggle: "toggle",
  Button: "button",
  Field: "field",
  Meter: "meter",
} as const;
export type SettingsRowKind = (typeof SettingsRowKind)[keyof typeof SettingsRowKind];

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
}

export interface ToggleRow extends RowBase {
  kind: typeof SettingsRowKind.Toggle;
  on: boolean;
}

export interface ButtonRow extends RowBase {
  kind: typeof SettingsRowKind.Button;
  /** What the button says. The label is what the row is about. */
  action: string;
  tone?: "primary" | "danger";
  busy?: boolean;
}

export interface FieldRow extends RowBase {
  kind: typeof SettingsRowKind.Field;
  value: string;
  /** A fact rather than a setting: shown, not editable. */
  readOnly?: boolean;
  placeholder?: string;
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

/** What the screen needs to know. What it can do about it is the app's. */
export interface SettingsInput {
  accountName: string;
  accountEmail?: string;
  /** This machine, as the person would recognise it. */
  computerName?: string;
  /** Where an agent works, when it works on this machine. */
  workingDirectory?: string;
  execPolicy: ExecPolicy;
  memoryEnabled: boolean;
  /** 0–1 and a phrase, from the account's quota. Absent while unknown. */
  usage?: { fraction: number; value: string; desc: string };
  version?: string;
  /** "You're up to date", "Downloading…", whatever the updater last said. */
  updateNote?: string;
  checkingUpdate?: boolean;
}

export const EXEC_POLICY_OPTIONS: readonly SelectOption[] = [
  {
    value: ExecPolicy.Ask,
    label: "Ask every time",
    hint: "Nothing runs on this computer until you say so.",
  },
  {
    value: ExecPolicy.Auto,
    label: "Check, then ask",
    hint: "It runs everyday commands and asks you about risky ones.",
  },
  {
    value: ExecPolicy.Allow,
    label: "Allow automatically",
    hint: "It runs commands without asking. You will not be shown them.",
  },
];

export function execPolicyLabel(policy: ExecPolicy): string {
  return EXEC_POLICY_OPTIONS.find((one) => one.value === policy)?.label ?? "Ask every time";
}

/** The groups on one tab. Empty groups never reach the screen. */
export function settingsFor(tab: SettingsTab, input: SettingsInput): readonly SettingsGroup[] {
  return build(tab, input).filter((group) => group.rows.length > 0);
}

/**
 * Which tab a row sits on, for a deep link the agent wrote, or nothing for a
 * row that does not exist. Found by building each tab rather than kept as a
 * second table, so a row that moves takes its link with it.
 */
export function tabForRow(rowId: string, input: SettingsInput): SettingsTab | undefined {
  return SETTINGS_TABS.find((tab) =>
    settingsFor(tab, input).some((group) => group.rows.some((row) => row.id === rowId)),
  );
}

function build(tab: SettingsTab, input: SettingsInput): SettingsGroup[] {
  switch (tab) {
    case SettingsTab.Computer:
      return [
        {
          title: "This computer",
          rows: [
            ...(input.computerName
              ? [
                  {
                    kind: SettingsRowKind.Field,
                    id: "computer-name",
                    label: "Current computer",
                    desc: "The one you are using now. It is the only one — an agent here works on your disk, where your files already are.",
                    value: input.computerName,
                    readOnly: true,
                  } satisfies FieldRow,
                ]
              : []),
            {
              kind: SettingsRowKind.Select,
              id: "exec-policy",
              label: "Running things on this computer",
              desc: "Opening files, running commands, driving the browser.",
              value: input.execPolicy,
              options: EXEC_POLICY_OPTIONS,
            },
            ...(input.workingDirectory
              ? [
                  {
                    kind: SettingsRowKind.Button,
                    id: "working-directory",
                    label: "Working folder",
                    desc: input.workingDirectory,
                    action: "Change",
                  } satisfies ButtonRow,
                ]
              : []),
          ],
        },
      ];

    case SettingsTab.Usage:
      return [
        {
          title: "Usage",
          rows: [
            ...(input.usage
              ? [
                  {
                    kind: SettingsRowKind.Meter,
                    id: "usage",
                    label: "Usage",
                    fraction: input.usage.fraction,
                    value: input.usage.value,
                    desc: input.usage.desc,
                  } satisfies MeterRow,
                ]
              : []),
            // Always here, so the tab is never blank. A figure that has not
            // arrived is a thing you want to be able to ask for again, and a
            // tab that opens onto nothing is worse than no tab.
            {
              kind: SettingsRowKind.Button,
              id: "refresh-usage",
              label: input.usage ? "Check again" : "Usage",
              desc: input.usage
                ? "Asks the server for the current figure."
                : "The figure has not come back from the server yet.",
              action: "Refresh",
            } satisfies ButtonRow,
          ],
        },
      ];

    case SettingsTab.Updates:
      return [
        {
          title: "Updates",
          rows: [
            {
              kind: SettingsRowKind.Button,
              id: "version",
              label: input.version ? `Version ${input.version}` : "Version",
              ...(input.updateNote ? { desc: input.updateNote } : {}),
              action: "Check for updates",
              ...(input.checkingUpdate ? { busy: true } : {}),
            } satisfies ButtonRow,
          ],
        },
      ];

    default:
      return [
        {
          title: "Account",
          rows: [
            {
              kind: SettingsRowKind.Button,
              id: "sign-out",
              label: input.accountName,
              ...(input.accountEmail ? { desc: input.accountEmail } : {}),
              action: "Sign out",
            } satisfies ButtonRow,
            {
              kind: SettingsRowKind.Button,
              id: "add-account",
              label: "Add account",
              desc: "One account at a time — signing in as somebody else replaces this one.",
              action: "Add",
            } satisfies ButtonRow,
          ],
        },
        {
          title: "Agents",
          rows: [
            {
              kind: SettingsRowKind.Toggle,
              id: "memory",
              label: "Memory",
              desc: "Your agents keep what you tell them — team names, where files live, how you like things written — and use it without being reminded.",
              on: input.memoryEnabled,
            } satisfies ToggleRow,
          ],
        },
      ];
  }
}

/**
 * What the account row says about credits.
 *
 * Kept apart from the menu that draws it because the interesting cases are
 * arithmetic, not layout: no quota yet, a limit of zero, and somebody who has
 * run out, which the canvas never draws because its mock sits at 74%.
 */
export interface Quota {
  planName?: string;
  creditsLimit?: number;
  creditsUsed?: number;
}

export interface UsageLine {
  /** "Usage", or the plan's name when the server gave one. */
  title: string;
  /** "74%", or empty while there is nothing to show. */
  value: string;
  /** 0–1, for the bar. Undefined when there is nothing to draw. */
  fraction?: number;
  /** True once there is nothing left. */
  spent: boolean;
}

/**
 * A percentage only when one can honestly be computed.
 *
 * A missing quota is not zero percent — it is not knowing, and drawing an empty
 * bar for it would tell somebody their account is fine when nobody has asked
 * the server yet.
 */
export function usageLine(quota: Quota | null | undefined): UsageLine {
  const title = quota?.planName?.trim() || "Usage";
  const limit = quota?.creditsLimit;
  const used = quota?.creditsUsed;

  if (typeof limit !== "number" || typeof used !== "number" || limit <= 0) {
    return { title, value: "", spent: false };
  }

  const fraction = Math.min(1, Math.max(0, used / limit));
  const spent = used >= limit;
  return {
    title,
    // Rounded, but never up to 100% while something is left, and never down to
    // 99% once it is gone.
    value: spent ? "All used" : `${Math.min(99, Math.floor(fraction * 100))}%`,
    fraction,
    spent,
  };
}
