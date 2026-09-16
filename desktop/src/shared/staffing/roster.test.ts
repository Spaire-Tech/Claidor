import { describe, expect, test } from 'vitest';

import { ROLES } from '../onboarding/script';
import { CREATE_AGENT_LIMITS, parseCreateAgentInput } from './constants';
import {
  briefOf,
  buildRoster,
  checkRosterAnswer,
  parseProposeTeamInput,
  ROSTER_LIMITS,
  RosterBehavior,
  rosterOption,
} from './roster';
import { STARTER_TEAMS, strongBySlug,STRONGS } from './strongs';

describe('what the tool may ask', () => {
  test('a work type alone, or a work type with two or three picks', () => {
    expect(parseProposeTeamInput({ workType: 'Founder / Business Owner' })).toEqual({ workType: 'Founder / Business Owner' });
    expect(parseProposeTeamInput({ workType: 'I run a bakery', picks: ['projects-manager', 'office-ops-desk'] }))
      .toEqual({ workType: 'I run a bakery', picks: ['projects-manager', 'office-ops-desk'] });
  });

  test('no work type, one pick, four picks, or a stranger is refused with the reason', () => {
    expect(parseProposeTeamInput({})).toMatch(/work type is required/);
    expect(parseProposeTeamInput({ workType: 'Finance', picks: ['haggle-bot'] })).toMatch(/2 or 3/);
    expect(parseProposeTeamInput({ workType: 'Finance', picks: ['haggle-bot', 'cooper', 'echo', 'pg'] })).toMatch(/2 or 3/);
    expect(parseProposeTeamInput({ workType: 'Finance', picks: ['haggle-bot', 'nobody'] })).toMatch(/Not in the twenty-three: nobody/);
  });
});

describe('the card, from the founder\'s table', () => {
  test('a founder gets Projects Manager, Outbound Prospecting and GTM Loop Closer, checked', () => {
    const roster = buildRoster({ workType: 'Founder / Business Owner' });
    expect(typeof roster).not.toBe('string');
    if (typeof roster === 'string') return;
    expect(roster.team.map(one => one.name)).toEqual(['Projects Manager', 'Outbound Prospecting', 'GTM Loop Closer']);
    expect(roster.team.every(one => one.antiJob.toLowerCase().startsWith('won')))
      .toBe(true);
    expect(roster.alternates.length).toBeGreaterThanOrEqual(3);
    expect(roster.alternates.length).toBeLessThanOrEqual(ROSTER_LIMITS.alternates);
    const onTeam = new Set(roster.team.map(one => one.slug));
    expect(roster.alternates.some(one => onTeam.has(one.slug))).toBe(false);
  });

  test('every one of the ten work types builds a card of two or three', () => {
    for (const role of ROLES) {
      const roster = buildRoster({ workType: role.label });
      expect(typeof roster, role.label).not.toBe('string');
      if (typeof roster === 'string') continue;
      expect(roster.team.length).toBeGreaterThanOrEqual(ROSTER_LIMITS.min);
      expect(roster.team.length).toBeLessThanOrEqual(ROSTER_LIMITS.max);
      expect(roster.team.map(one => one.slug)).toEqual(STARTER_TEAMS[role.label].defaults);
    }
  });

  test("Yodo's own picks replace the table's team, and the lane's alternates stay", () => {
    const roster = buildRoster({ workType: 'Founder / Business Owner', picks: ['projects-manager', 'cooper'] });
    if (typeof roster === 'string') throw new Error(roster);
    expect(roster.team.map(one => one.slug)).toEqual(['projects-manager', 'cooper']);
    expect(roster.alternates.map(one => one.slug)).not.toContain('projects-manager');
    expect(roster.alternates.map(one => one.slug)).not.toContain('cooper');
  });

  test("the person's own words with no picks are sent back for one clarifying line", () => {
    expect(buildRoster({ workType: 'I run a bakery' })).toMatch(/not one of the ten work types/);
  });
});

describe('the brief a strong is stood up with', () => {
  test('is a create_agent brief, and every one of the twenty-three passes the same check', () => {
    for (const strong of STRONGS) {
      const brief = briefOf(strong);
      expect(parseCreateAgentInput(brief), strong.slug).toEqual(brief);
      expect(brief.job.length).toBeLessThanOrEqual(CREATE_AGENT_LIMITS.job);
    }
  });

  test('the row carries the card\'s one-line anti-job, not the whole list', () => {
    const strong = strongBySlug('pg')!;
    const row = rosterOption(strong);
    expect(row.antiJob).toBe(strong.cardAntiJob);
    expect(row.job).toBe(strong.job);
  });
});

describe("the card's answer, checked against the card", () => {
  const roster = buildRoster({ workType: 'Founder / Business Owner' });
  if (typeof roster === 'string') throw new Error(roster);
  const team = roster.team.map(one => one.slug);
  const spare = roster.alternates[0].slug;

  test('two or three rows that were on the card', () => {
    expect(checkRosterAnswer({ behavior: 'standUp', slugs: team }, roster)).toEqual({ behavior: RosterBehavior.StandUp, slugs: team });
    expect(checkRosterAnswer({ behavior: 'standUp', slugs: [team[0], spare] }, roster)).toEqual({ behavior: RosterBehavior.StandUp, slugs: [team[0], spare] });
  });

  test('one row, four rows, or a row that was never offered is refused', () => {
    expect(checkRosterAnswer({ behavior: 'standUp', slugs: [team[0]] }, roster)).toMatch(/2 or 3, not 1/);
    expect(checkRosterAnswer({ behavior: 'standUp', slugs: [...team, spare] }, roster)).toMatch(/not 4/);
    expect(checkRosterAnswer({ behavior: 'standUp', slugs: [team[0], 'skippy'] }, roster)).toMatch(/Not on the card: skippy/);
  });

  test('something else needs a line; not now is not now', () => {
    expect(checkRosterAnswer({ behavior: 'somethingElse', text: '  someone for grants  ' }, roster))
      .toEqual({ behavior: RosterBehavior.SomethingElse, text: 'someone for grants' });
    expect(checkRosterAnswer({ behavior: 'somethingElse', text: '' }, roster)).toMatch(/needs a line/);
    expect(checkRosterAnswer({ behavior: 'decline' }, roster)).toEqual({ behavior: RosterBehavior.Decline });
    expect(checkRosterAnswer({ behavior: 'anything' }, roster)).toMatch(/Not an answer/);
  });
});
