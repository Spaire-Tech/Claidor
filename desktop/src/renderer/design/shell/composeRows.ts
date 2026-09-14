import type { SidebarAgent } from './Sidebar';

/**
 * What the compose picker shows, decided without a render.
 *
 * The canvas puts the actions above the agents and filters both by the
 * same query, so typing "cre" finds "Create new agent" and typing a name
 * finds the agent. Keeping that here means the order and the shortcuts
 * are covered by tests rather than by looking at it.
 */

export const ComposeRowKind = {
  Action: 'action',
  Agent: 'agent',
} as const;
export type ComposeRowKind = typeof ComposeRowKind[keyof typeof ComposeRowKind];

export const ComposeAction = {
  NewAgent: 'new-agent',
} as const;
export type ComposeAction = typeof ComposeAction[keyof typeof ComposeAction];

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
 * "Create group chat" is deliberately not here. Groups are Stage 10, and
 * a button that opens nothing is worse than one that is not there yet —
 * the founder has already had to point that out once about the header.
 */
const ACTIONS: readonly { id: ComposeAction; label: string }[] = [
  { id: ComposeAction.NewAgent, label: 'Create new agent' },
];

export interface ComposeInput {
  agents: readonly SidebarAgent[];
  query: string;
}

export function composeRows({ agents, query }: ComposeInput): ComposeRow[] {
  const needle = query.trim().toLowerCase();
  const matches = (text: string): boolean => !needle || text.toLowerCase().includes(needle);

  const rows: ComposeRow[] = [
    ...ACTIONS
      .filter(action => matches(action.label))
      .map(action => ({ kind: ComposeRowKind.Action, id: action.id, label: action.label })),
    ...agents
      .filter(agent => matches(agent.name))
      .map(agent => ({ kind: ComposeRowKind.Agent, id: agent.id, label: agent.name })),
  ];

  // Numbered after filtering, so ⌘1 is always the first row on screen
  // rather than the first row of an unfiltered list you cannot see.
  return rows.map((row, index) =>
    index < MAX_SHORTCUTS ? { ...row, key: String(index + 1) } : row,
  );
}

/** The row a ⌘N press means, or undefined when there is no such row. */
export function rowForShortcut(rows: readonly ComposeRow[], digit: string): ComposeRow | undefined {
  return rows.find(row => row.key === digit);
}

/** True once the form has enough to create an agent. */
export const canCreate = (name: string): boolean => name.trim().length > 0;
