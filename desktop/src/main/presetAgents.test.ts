import { existsSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, test } from 'vitest';

import { isAvatarIndex } from '../shared/agent/avatars';
import { VOICE_BRIEF } from '../shared/agent/voiceBrief';
import { PRESET_AGENTS, presetToCreateRequest } from './presetAgents';

const SKILLS_DIR = path.resolve(__dirname, '../../SKILLs');

describe('the twelve role agents, and the one that runs them', () => {
  test('there are twelve roles', () => {
    expect(PRESET_AGENTS.filter(a => a.id !== 'chief-of-staff')).toHaveLength(12);
  });

  test('the roles are the ones the plan names, with the coordinator first', () => {
    // `direction.md` §6 names twelve. Chief of Staff is a thirteenth and
    // is not one of them: it does no work of its own, it decides which of
    // the twelve should. Added from `grok-bot.md` §3.2 rather than
    // replacing anything, and recorded in §6.
    expect(PRESET_AGENTS.map(a => a.nameEn)).toEqual([
      'Chief of Staff',
      'Engineering Lead', 'Design Lead', 'Operations Manager', 'Product Manager',
      'Head of People', 'Marketing Lead', 'Financial Controller', 'Account Executive',
      'Data Analyst', 'Support Specialist', 'In-house Counsel', 'Research Scientist',
    ]);
  });

  test('the coordinator is told to check who exists before handing work out', () => {
    // The failure mode is inventing a teammate, or handing something to
    // an agent whose remit it is not — both of which look like work
    // happening until somebody reads the result.
    const chief = PRESET_AGENTS.find(a => a.id === 'chief-of-staff');
    expect(chief?.systemPromptEn).toMatch(/Do not invent a teammate/);
    expect(chief?.systemPromptEn).toMatch(/Hand over the whole task/);
  });

  test('the coordinator does not fan out by default', () => {
    // Six answers to read and one decision still to make is worse than
    // one answer.
    const chief = PRESET_AGENTS.find(a => a.id === 'chief-of-staff');
    expect(chief?.systemPromptEn).toMatch(/One at a time unless they asked otherwise/);
  });

  test('the coordinator interrupts for decisions, not for progress', () => {
    const chief = PRESET_AGENTS.find(a => a.id === 'chief-of-staff');
    expect(chief?.systemPromptEn).toMatch(/Interrupt them for decisions, not for progress/);
    expect(chief?.systemPromptEn).toMatch(/Still working on it.* is not/);
  });

  test('every named skill is a skill that exists', () => {
    // The one that matters. Naming a skill that is not on disk gives an
    // agent instructions for a tool it does not have, and it would look
    // exactly like a working agent until somebody asked it to do the job.
    const missing: string[] = [];
    for (const agent of PRESET_AGENTS) {
      for (const skillId of agent.skillIds) {
        if (!existsSync(path.join(SKILLS_DIR, skillId))) {
          missing.push(`${agent.id} → ${skillId}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  test('every id and icon is distinct', () => {
    expect(new Set(PRESET_AGENTS.map(a => a.id)).size).toBe(PRESET_AGENTS.length);
    // Twelve agents wearing three icons would make the list unreadable.
    expect(new Set(PRESET_AGENTS.map(a => a.icon)).size).toBe(PRESET_AGENTS.length);
  });

  test('every face is one of the twenty-five, and no two roles share one', () => {
    for (const agent of PRESET_AGENTS) {
      expect(isAvatarIndex(agent.avatar), `${agent.id} wears ${agent.avatar}`).toBe(true);
    }
    expect(new Set(PRESET_AGENTS.map(a => a.avatar)).size).toBe(PRESET_AGENTS.length);
  });

  test('the faces are the ones the canvas gives each role', () => {
    // `docs/product/design/canvas-2026-09-15-files.html`, AGENTS: a seed
    // per role, and `seed = index * 5 + 2`. The founder's complaint was
    // "you forgot to put the avatars. its the old ones there" — this is
    // the mapping, so it cannot drift back.
    const bySeed = Object.fromEntries(PRESET_AGENTS.map(a => [a.id, a.avatar * 5 + 2]));
    expect(bySeed).toMatchObject({
      'engineering-lead': 22, 'design-lead': 92, 'operations-manager': 62,
      'product-manager': 42, 'head-of-people': 7, 'marketing-lead': 87,
      'financial-controller': 57, 'account-executive': 12, 'data-analyst': 107,
      'support-specialist': 77, 'in-house-counsel': 47, 'research-scientist': 82,
    });
  });

  test('installing a role passes its face on, so the agent wears what the card showed', () => {
    const lead = PRESET_AGENTS.find(a => a.id === 'engineering-lead')!;
    expect(presetToCreateRequest(lead).avatar).toBe(lead.avatar);
  });

  test('every one carries the voice brief, unparaphrased', () => {
    for (const agent of PRESET_AGENTS) {
      expect(agent.systemPrompt).toContain(VOICE_BRIEF);
      expect(agent.systemPromptEn).toContain(VOICE_BRIEF);
    }
  });

  test('no product name reaches an agent', () => {
    const written = JSON.stringify(PRESET_AGENTS).toLowerCase();
    for (const forbidden of ['faiser', 'maties', 'swens', 'lobsterai', 'claidor']) {
      expect(written).not.toContain(forbidden);
    }
  });

  test('each says who it is and how it works', () => {
    for (const agent of PRESET_AGENTS) {
      expect(agent.identityEn.startsWith('You are ')).toBe(true);
      expect(agent.systemPromptEn).toContain('## How you work');
      expect(agent.descriptionEn.length).toBeGreaterThan(20);
      expect(agent.nameEn).toBeTruthy();
      expect(agent.name).toBeTruthy();
    }
  });
});
