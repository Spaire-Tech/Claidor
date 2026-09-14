import { existsSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, test } from 'vitest';

import { VOICE_BRIEF } from '../shared/agent/voiceBrief';
import { PRESET_AGENTS } from './presetAgents';

const SKILLS_DIR = path.resolve(__dirname, '../../SKILLs');

describe('the twelve role agents', () => {
  test('there are twelve', () => {
    expect(PRESET_AGENTS).toHaveLength(12);
  });

  test('the roles are the ones the plan names', () => {
    expect(PRESET_AGENTS.map(a => a.nameEn)).toEqual([
      'Engineering Lead', 'Design Lead', 'Operations Manager', 'Product Manager',
      'Head of People', 'Marketing Lead', 'Financial Controller', 'Account Executive',
      'Data Analyst', 'Support Specialist', 'In-house Counsel', 'Research Scientist',
    ]);
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

  test('every id and avatar is distinct', () => {
    expect(new Set(PRESET_AGENTS.map(a => a.id)).size).toBe(PRESET_AGENTS.length);
    // Twelve agents wearing three icons would make the list unreadable.
    expect(new Set(PRESET_AGENTS.map(a => a.icon)).size).toBe(PRESET_AGENTS.length);
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
