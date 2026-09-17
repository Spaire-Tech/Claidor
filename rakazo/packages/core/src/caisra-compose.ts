/**
 * Starting something: what the compose picker shows, and the seven voices.
 *
 * Ported from the founder's `desktop/src/renderer/design/shell/composeRows.ts`
 * and `agents/voices.ts`. The canvas puts the actions above the agents and
 * filters both by the same query, so typing "cre" finds "Create new agent" and
 * typing a name finds the agent. Keeping that here means the order and the
 * shortcuts are covered by tests rather than by looking at it.
 */

export const ComposeRowKind = {
  Action: "action",
  Agent: "agent",
} as const;
export type ComposeRowKind = (typeof ComposeRowKind)[keyof typeof ComposeRowKind];

export const ComposeAction = {
  NewAgent: "new-agent",
} as const;
export type ComposeAction = (typeof ComposeAction)[keyof typeof ComposeAction];

export interface ComposeRow {
  kind: ComposeRowKind;
  /** The agent's id, or the action's id. */
  id: string;
  label: string;
  /** `1`–`9`, shown as ⌘N. Absent past the ninth row. */
  key?: string;
}

/** ⌘1–⌘9. The tenth row and beyond are clickable but have no shortcut. */
export const MAX_SHORTCUTS = 9;

/**
 * "Create group chat" is deliberately not here. Groups are later work, and a
 * button that opens nothing is worse than one that is not there yet.
 */
const ACTIONS: readonly { id: ComposeAction; label: string }[] = [
  { id: ComposeAction.NewAgent, label: "Create new agent" },
];

export interface ComposeInput {
  agents: readonly { id: string; name: string }[];
  query: string;
}

export function composeRows({ agents, query }: ComposeInput): ComposeRow[] {
  const needle = query.trim().toLowerCase();
  const matches = (text: string) => !needle || text.toLowerCase().includes(needle);

  const rows: ComposeRow[] = [
    ...ACTIONS.filter((action) => matches(action.label)).map((action) => ({
      kind: ComposeRowKind.Action,
      id: action.id,
      label: action.label,
    })),
    ...agents
      .filter((agent) => matches(agent.name))
      .map((agent) => ({ kind: ComposeRowKind.Agent, id: agent.id, label: agent.name })),
  ];

  // Numbered after filtering, so ⌘1 is always the first row on screen rather
  // than the first row of an unfiltered list you cannot see.
  return rows.map((row, index) =>
    index < MAX_SHORTCUTS ? { ...row, key: String(index + 1) } : row,
  );
}

/** The row a ⌘N press means, or nothing when there is no such row. */
export function rowForShortcut(rows: readonly ComposeRow[], digit: string): ComposeRow | undefined {
  return rows.find((row) => row.key === digit);
}

/** True once the form has enough to create an agent. The name is all it needs. */
export const canCreate = (name: string): boolean => name.trim().length > 0;

/**
 * The seven voices.
 *
 * A voice names a manner, not a speaker. Picking one changes how the agent
 * writes today; it will also choose how it sounds once speech exists, which is
 * why the choice is made at creation rather than hidden in a settings tab.
 *
 * **The five colours belong to the voice**, not to the agent. The first desktop
 * build drew every voice from the agent's face, which made "pick a voice with a
 * different colour, get a default blue": the sphere was never the voice's to
 * begin with. The seed travels with the palette because the canvas pairs them.
 */
export interface Voice {
  id: string;
  /** Shown in the picker. */
  name: string;
  /** One line under the name. */
  description: string;
  /** Keeps a voice's sphere the same every time it is drawn. */
  seed: number;
  colors: readonly [string, string, string, string, string];
}

/** The founder's order. */
export const VOICES: readonly Voice[] = [
  {
    id: "concise",
    name: "Concise",
    description: "Says only what matters",
    seed: 101,
    colors: ["#4f9a2e", "#2a7fa8", "#c9b755", "#e8f0d8", "#4f9c7a"],
  },
  {
    id: "balanced",
    name: "Balanced",
    description: "Even and unhurried",
    seed: 202,
    colors: ["#2f6ab8", "#3f93ad", "#6a56b0", "#dbe6f5", "#4a7fc4"],
  },
  {
    id: "warm",
    name: "Warm",
    description: "Encouraging and reassuring",
    seed: 303,
    colors: ["#c07a28", "#bf6a4a", "#c9a03d", "#f5e4d2", "#c4854a"],
  },
  {
    id: "direct",
    name: "Direct",
    description: "Straight to the point",
    seed: 404,
    colors: ["#3a4a63", "#2a6f8f", "#5a6f8f", "#dfe6ef", "#44607f"],
  },
  {
    id: "sassy",
    name: "Sassy",
    description: "Dry, with a bit of edge",
    seed: 505,
    colors: ["#bf4a86", "#c07a28", "#8f5cad", "#f2dae5", "#c45f92"],
  },
  {
    id: "curious",
    name: "Curious",
    description: "Asks before assuming",
    seed: 606,
    colors: ["#6d4bb8", "#3f66b8", "#a85fa0", "#e2d8f2", "#7d5cc4"],
  },
  {
    id: "formal",
    name: "Formal",
    description: "Measured and precise",
    seed: 707,
    colors: ["#33506e", "#4a6b85", "#6b7f96", "#e3e9f0", "#3d5c7d"],
  },
];

export const DEFAULT_VOICE_ID = "balanced";

/** The voice with this id, or nothing. An empty id is "no voice yet". */
export function voiceById(id: string | undefined): Voice | undefined {
  if (!id) return undefined;
  return VOICES.find((one) => one.id === id);
}
