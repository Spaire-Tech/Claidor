import { existsSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, test } from 'vitest';

import { ROLES } from '../onboarding/script';
import { CREATE_AGENT_LIMITS } from './constants';
import {
  SOMETHING_ELSE_ALTERNATES,
  STARTER_TEAMS,
  strongBySlug,
  STRONGS,
} from './strongs';

/** The anatomies, relative to this file: desktop/src/shared/staffing → repo root. */
const ANATOMIES = path.resolve(__dirname, '../../../../docs/product/agents-anatomies/agents');

const slugs = STRONGS.map(one => one.slug);
const roleLabels = ROLES.map(role => role.label);

describe('the catalogue', () => {
  test('twenty-three, each slug once', () => {
    expect(STRONGS).toHaveLength(23);
    expect(new Set(slugs).size).toBe(23);
  });

  test('every slug has an anatomy on disk', () => {
    for (const slug of slugs) {
      expect(existsSync(path.join(ANATOMIES, slug, 'agent.md')), slug).toBe(true);
    }
  });

  test('every field fits what create_agent takes', () => {
    for (const one of STRONGS) {
      expect(one.name.length, `${one.slug} name`).toBeLessThanOrEqual(CREATE_AGENT_LIMITS.name);
      expect(one.label.length, `${one.slug} label`).toBeLessThanOrEqual(CREATE_AGENT_LIMITS.label);
      expect(one.job.length, `${one.slug} job`).toBeLessThanOrEqual(CREATE_AGENT_LIMITS.job);
      expect(one.cardAntiJob.length, `${one.slug} cardAntiJob`).toBeLessThanOrEqual(CREATE_AGENT_LIMITS.label);
      expect(one.antiJobs.length, `${one.slug} antiJobs`).toBeGreaterThan(0);
      expect(one.antiJobs.length, `${one.slug} antiJobs`).toBeLessThanOrEqual(CREATE_AGENT_LIMITS.antiJobs);
      for (const antiJob of one.antiJobs) {
        expect(antiJob.length, `${one.slug}: ${antiJob}`).toBeLessThanOrEqual(CREATE_AGENT_LIMITS.antiJob);
      }
      if (one.voice !== undefined) {
        expect(one.voice.length, `${one.slug} voice`).toBeLessThanOrEqual(CREATE_AGENT_LIMITS.voice);
      }
    }
  });

  test('nothing is blank, and the card line starts with "won\'t"', () => {
    for (const one of STRONGS) {
      for (const field of [one.name, one.author, one.label, one.job, one.cardAntiJob, ...one.antiJobs]) {
        expect(field.trim(), one.slug).toBe(field);
        expect(field, one.slug).not.toBe('');
      }
      expect(one.cardAntiJob, one.slug).toMatch(/^won't /);
    }
  });

  test('exactly four are about the other product and do not translate', () => {
    const stuck = STRONGS.filter(one => !one.translates).map(one => one.slug).sort();
    expect(stuck).toEqual(['dr-eggbot-v2', 'engineer-bot', 'skippy', 'tinkabot']);
  });

  test('the seven Slack users say so', () => {
    for (const slug of [
      'cooper', 'customer-call-coach', 'event-request-desk', 'follow-through-agent',
      'haggle-bot', 'office-ops-desk', 'stalk-bot',
    ]) {
      expect(strongBySlug(slug)?.connectors, slug).toContain('Slack');
    }
  });

  test('strongBySlug finds one and not another', () => {
    expect(strongBySlug('projects-manager')?.name).toBe('Projects Manager');
    expect(strongBySlug('yodo')).toBeUndefined();
  });
});

describe('the starter teams', () => {
  test('one row per work type, all ten, none extra', () => {
    expect(Object.keys(STARTER_TEAMS).sort()).toEqual([...roleLabels].sort());
  });

  test('defaults are two or three strongs that exist', () => {
    for (const [label, team] of Object.entries(STARTER_TEAMS)) {
      expect(team.defaults.length, label).toBeGreaterThanOrEqual(2);
      expect(team.defaults.length, label).toBeLessThanOrEqual(3);
      for (const slug of team.defaults) expect(strongBySlug(slug), `${label}: ${slug}`).toBeDefined();
    }
  });

  test('alternates are three or four strongs that exist and are not already defaults', () => {
    for (const [label, team] of Object.entries(STARTER_TEAMS)) {
      expect(team.alternates.length, label).toBeGreaterThanOrEqual(3);
      expect(team.alternates.length, label).toBeLessThanOrEqual(4);
      expect(new Set(team.alternates).size, label).toBe(team.alternates.length);
      for (const slug of team.alternates) {
        expect(strongBySlug(slug), `${label}: ${slug}`).toBeDefined();
        expect(team.defaults, `${label}: ${slug}`).not.toContain(slug);
      }
    }
  });

  test('the page\'s "+ X if …" strongs lead the alternates', () => {
    expect(STARTER_TEAMS['Engineering / Tech'].alternates[0]).toBe('projects-manager');
    expect(STARTER_TEAMS['Design / Creative'].alternates[0]).toBe('image-gen-bot');
    expect(STARTER_TEAMS['Slacker (my kind)'].alternates[0]).toBe('office-ops-desk');
  });

  test('"Something else" offers the four most general', () => {
    expect(SOMETHING_ELSE_ALTERNATES).toHaveLength(4);
    for (const slug of SOMETHING_ELSE_ALTERNATES) expect(strongBySlug(slug), slug).toBeDefined();
  });
});
