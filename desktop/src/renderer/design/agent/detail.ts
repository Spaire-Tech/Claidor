import type { ScheduledTask } from '../../../scheduledTask/types';
import { AgentId } from '../../../shared/agent';
import type { Skill } from '../../types/skill';

/**
 * What the agent's five tabs decide, without any of the drawing.
 *
 * The tabs read five different subsystems and every one of them can be
 * empty, stale or missing a thing it names. Those are the cases a
 * screenshot never shows and a person hits on day two, so they live here
 * where a test can hold them.
 */

export const AgentTab = {
  Instructions: 'instructions',
  Memories: 'memories',
  Skills: 'skills',
  Routines: 'routines',
  Integrations: 'integrations',
} as const;
export type AgentTab = typeof AgentTab[keyof typeof AgentTab];

export interface AgentTabDef {
  id: AgentTab;
  label: string;
}

/** In the order `plan.md` names them. */
export const AGENT_TABS: readonly AgentTabDef[] = [
  { id: AgentTab.Instructions, label: 'Instructions' },
  { id: AgentTab.Memories, label: 'Memories' },
  { id: AgentTab.Skills, label: 'Skills' },
  { id: AgentTab.Routines, label: 'Routines' },
  { id: AgentTab.Integrations, label: 'Integrations' },
];

export interface AgentSkills {
  /** The skills this agent has, in the order the app lists them. */
  have: readonly Skill[];
  /**
   * Skill ids the agent names that are not installed.
   *
   * Shown rather than filtered away. An agent whose instructions tell it
   * to use a skill it does not have looks exactly like a working agent
   * until somebody asks it to do the job, and silently dropping the name
   * is what makes that invisible.
   */
  missing: readonly string[];
}

export function agentSkills(
  installed: readonly Skill[],
  skillIds: readonly string[],
): AgentSkills {
  const byId = new Map(installed.map(skill => [skill.id, skill]));
  const have: Skill[] = [];
  const missing: string[] = [];
  for (const id of skillIds) {
    const skill = byId.get(id);
    if (skill) have.push(skill);
    else missing.push(id);
  }
  return { have, missing };
}

/**
 * The routines that belong to this agent.
 *
 * A task for the main agent may carry `agentId: 'main'` or `null` — the
 * scheduler treats an unset agent as the main one, and both shapes exist
 * in stored tasks. Reading only one of them would hide half of main's
 * routines, which would read as "it has none".
 */
export function agentRoutines(
  tasks: readonly ScheduledTask[],
  agentId: string,
): readonly ScheduledTask[] {
  if (agentId === AgentId.Main) {
    return tasks.filter(task => !task.agentId || task.agentId === AgentId.Main);
  }
  return tasks.filter(task => task.agentId === agentId);
}

/**
 * What happened the last time a routine ran.
 *
 * Never-run is its own sentence rather than a dash: a routine that has
 * not fired yet and a routine that failed silently look identical in a
 * table of dashes, and they are not the same thing at all.
 */
export function lastRunLine(task: ScheduledTask, now: number = Date.now()): string {
  const { lastRunAtMs, lastStatus, runningAtMs } = task.state;
  if (runningAtMs) return 'Running now';
  if (!lastRunAtMs) return 'Not run yet';

  const when = agoLine(lastRunAtMs, now);
  if (lastStatus === 'error') return `Failed ${when}`;
  if (lastStatus === 'skipped') return `Skipped ${when}`;
  return `Ran ${when}`;
}

/**
 * "4 minutes ago", and never "0 minutes ago" or a negative one.
 *
 * A clock that has drifted, or a run recorded a beat in the future,
 * would otherwise produce "-1 minutes ago", which reads as a bug in the
 * routine rather than in the clock.
 */
export function agoLine(at: number, now: number = Date.now()): string {
  const ms = now - at;
  if (ms < 60_000) return 'just now';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes} ${plural(minutes, 'minute')} ago`;
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 24) return `${hours} ${plural(hours, 'hour')} ago`;
  const days = Math.floor(ms / 86_400_000);
  return `${days} ${plural(days, 'day')} ago`;
}

const plural = (n: number, word: string): string => (n === 1 ? word : `${word}s`);

/**
 * What a tab says when it has nothing in it.
 *
 * Named after the agent, and saying what would put something there. "No
 * items" tells somebody the screen loaded and nothing else.
 */
export function emptyLine(tab: AgentTab, agentName: string): string {
  const name = agentName.trim() || 'This agent';
  switch (tab) {
    case AgentTab.Instructions:
      return `${name} has no instructions yet. Whatever you write here, it reads before every reply.`;
    case AgentTab.Memories:
      return `${name} has not noted anything down yet. Things worth keeping turn up here as you work.`;
    case AgentTab.Skills:
      return `${name} has no skills yet. A skill is a way of doing one job — writing a document, reading a spreadsheet, searching the web.`;
    case AgentTab.Routines:
      return `${name} has no routines. A routine is work that happens on a schedule without you asking.`;
    case AgentTab.Integrations:
      return 'Nothing is connected yet. An integration lets an agent reach something outside this computer.';
  }
}

/** Whether the instructions box has anything worth saving. */
export function instructionsChanged(saved: string, draft: string): boolean {
  return draft.trim() !== saved.trim();
}

/**
 * The line under the agent's name.
 *
 * Its own description if it has one. Otherwise nothing — a placeholder
 * like "No description" is a line of text that says the screen has a
 * slot, and tells you nothing about the agent.
 */
export function subtitleLine(description: string | undefined, skillCount: number): string {
  const said = description?.trim();
  if (said) return said;
  if (skillCount > 0) return `${skillCount} ${plural(skillCount, 'skill')}`;
  return '';
}
