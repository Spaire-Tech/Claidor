import { describe, expect, test } from 'vitest';

import type { ScheduledTask, TaskState } from '../../../scheduledTask/types';
import type { Skill } from '../../types/skill';
import {
  AGENT_TABS,
  agentRoutines,
  agentSkills,
  AgentTab,
  agoLine,
  emptyLine,
  instructionsChanged,
  lastRunLine,
  subtitleLine,
} from './detail';

const skill = (id: string): Skill => ({
  id, name: id, description: '', enabled: true, isOfficial: true,
  isBuiltIn: true, updatedAt: 0, prompt: '', skillPath: `/skills/${id}`,
});

const state = (over: Partial<TaskState> = {}): TaskState => ({
  nextRunAtMs: null, lastRunAtMs: null, lastStatus: null, lastError: null,
  lastDurationMs: null, runningAtMs: null, consecutiveErrors: 0, ...over,
});

const task = (over: Partial<ScheduledTask> & { id: string }): ScheduledTask => ({
  name: over.id, description: '', enabled: true,
  schedule: { kind: 'every', everyMs: 3_600_000 },
  sessionTarget: 'main', wakeMode: 'always',
  payload: { kind: 'agentTurn', message: 'go' },
  delivery: { mode: 'silent' },
  agentId: null, sessionKey: null, state: state(),
  createdAt: '', updatedAt: '',
  ...over,
} as ScheduledTask);

const NOW = Date.parse('2026-03-10T12:00:00Z');

describe('the five tabs', () => {
  test('they are the five, in the order the plan names them', () => {
    expect(AGENT_TABS.map(one => one.label)).toEqual([
      'Instructions', 'Memories', 'Skills', 'Routines', 'Integrations',
    ]);
  });
});

describe('the skills an agent has', () => {
  test('it lists them in the order the agent names them', () => {
    const { have } = agentSkills([skill('pdf'), skill('xlsx'), skill('docx')], ['docx', 'pdf']);
    expect(have.map(one => one.id)).toEqual(['docx', 'pdf']);
  });

  test('a skill it names but does not have is reported, not dropped', () => {
    // The fault this guards: an agent whose instructions tell it to use a
    // skill that is not installed looks exactly like a working agent
    // until somebody asks it to do the job. Filtering the name away is
    // what makes that invisible.
    const { have, missing } = agentSkills([skill('pdf')], ['pdf', 'stock-analyzer']);
    expect(have.map(one => one.id)).toEqual(['pdf']);
    expect(missing).toEqual(['stock-analyzer']);
  });

  test('an agent with no skills has none, and nothing is missing', () => {
    expect(agentSkills([skill('pdf')], [])).toEqual({ have: [], missing: [] });
  });
});

describe('the routines that belong to an agent', () => {
  test('a named agent gets only its own', () => {
    const tasks = [task({ id: 'a', agentId: 'juno' }), task({ id: 'b', agentId: 'mira' })];
    expect(agentRoutines(tasks, 'juno').map(one => one.id)).toEqual(['a']);
  });

  test('main gets both the ones marked main and the ones marked nothing', () => {
    // The scheduler treats an unset agent as the main one, and both
    // shapes exist in stored tasks. Reading only one of them would hide
    // half of main's routines, which reads as "it has none".
    const tasks = [
      task({ id: 'unset', agentId: null }),
      task({ id: 'named', agentId: 'main' }),
      task({ id: 'other', agentId: 'juno' }),
    ];
    expect(agentRoutines(tasks, 'main').map(one => one.id)).toEqual(['unset', 'named']);
  });

  test('an agent with no routines gets an empty list, not everybody else\'s', () => {
    expect(agentRoutines([task({ id: 'a', agentId: 'juno' })], 'mira')).toEqual([]);
  });
});

describe('what happened last time', () => {
  test('a routine that has never fired says so', () => {
    // Not a dash. A routine that has not run yet and one that failed
    // silently look identical in a table of dashes, and they are not the
    // same thing.
    expect(lastRunLine(task({ id: 'a' }), NOW)).toBe('Not run yet');
  });

  test('running now beats whatever happened before', () => {
    expect(lastRunLine(
      task({ id: 'a', state: state({ runningAtMs: NOW - 1000, lastRunAtMs: NOW - 90_000, lastStatus: 'error' }) }),
      NOW,
    )).toBe('Running now');
  });

  test('a failure says failed', () => {
    expect(lastRunLine(
      task({ id: 'a', state: state({ lastRunAtMs: NOW - 7_200_000, lastStatus: 'error' }) }),
      NOW,
    )).toBe('Failed 2 hours ago');
  });

  test('a skip is neither a success nor a failure', () => {
    expect(lastRunLine(
      task({ id: 'a', state: state({ lastRunAtMs: NOW - 300_000, lastStatus: 'skipped' }) }),
      NOW,
    )).toBe('Skipped 5 minutes ago');
  });

  test('a success just says it ran', () => {
    expect(lastRunLine(
      task({ id: 'a', state: state({ lastRunAtMs: NOW - 60_000, lastStatus: 'success' }) }),
      NOW,
    )).toBe('Ran 1 minute ago');
  });
});

describe('how long ago', () => {
  test('under a minute is just now, not zero minutes', () => {
    expect(agoLine(NOW - 30_000, NOW)).toBe('just now');
  });

  test('a run recorded in the future is still just now, not minus one', () => {
    // A clock that has drifted would otherwise produce "-1 minutes ago",
    // which reads as a bug in the routine rather than in the clock.
    expect(agoLine(NOW + 5_000, NOW)).toBe('just now');
  });

  test('it counts singular and plural properly', () => {
    expect(agoLine(NOW - 60_000, NOW)).toBe('1 minute ago');
    expect(agoLine(NOW - 120_000, NOW)).toBe('2 minutes ago');
    expect(agoLine(NOW - 3_600_000, NOW)).toBe('1 hour ago');
    expect(agoLine(NOW - 86_400_000, NOW)).toBe('1 day ago');
    expect(agoLine(NOW - 3 * 86_400_000, NOW)).toBe('3 days ago');
  });
});

describe('a tab with nothing in it', () => {
  test('it says what would put something there', () => {
    for (const tab of AGENT_TABS) {
      const line = emptyLine(tab.id, 'Juno');
      expect(line.length).toBeGreaterThan(30);
      expect(line).not.toMatch(/^No /);
    }
  });

  test('it uses the agent\'s name', () => {
    expect(emptyLine(AgentTab.Memories, 'Juno')).toContain('Juno');
  });

  test('an agent with no name still reads as a sentence', () => {
    expect(emptyLine(AgentTab.Skills, '  ')).toContain('This agent has no skills');
  });
});

describe('the instructions box', () => {
  test('whitespace alone is not a change', () => {
    // Otherwise Save lights up because a trailing newline appeared, and
    // a button that offers to save nothing teaches you to ignore it.
    expect(instructionsChanged('You are Juno.', '  You are Juno.\n')).toBe(false);
  });

  test('a real edit is', () => {
    expect(instructionsChanged('You are Juno.', 'You are Juno. Be brief.')).toBe(true);
  });
});

describe('the line under the name', () => {
  test('its own description wins', () => {
    expect(subtitleLine('Reads the board deck', 4)).toBe('Reads the board deck');
  });

  test('without one, it counts the skills', () => {
    expect(subtitleLine('', 4)).toBe('4 skills');
    expect(subtitleLine(undefined, 1)).toBe('1 skill');
  });

  test('with neither, it says nothing at all', () => {
    // Rather than "No description", which is a line of text saying the
    // screen has a slot and nothing about the agent.
    expect(subtitleLine('', 0)).toBe('');
  });
});
