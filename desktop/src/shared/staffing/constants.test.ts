import { describe, expect, test } from 'vitest';

import {
  buildAgentInstructions,
  CREATE_AGENT_LIMITS,
  describeBrief,
  parseCreateAgentInput,
} from './constants';

const good = {
  name: 'Projects Manager',
  label: 'Project ops',
  job: 'Runs projects; specialists claim tasks.',
  antiJobs: ["Won't do specialist work itself"],
};

describe('what the tool accepts', () => {
  test('a full brief comes through cleaned', () => {
    const parsed = parseCreateAgentInput({ ...good, voice: '  Short.  Decision-shaped. ' });
    expect(parsed).toEqual({ ...good, voice: 'Short. Decision-shaped.' });
  });

  test('every part of the brief is required except the voice', () => {
    expect(parseCreateAgentInput({ ...good, name: '' })).toMatch(/name is required/);
    expect(parseCreateAgentInput({ ...good, label: ' ' })).toMatch(/label is required/);
    expect(parseCreateAgentInput({ ...good, job: undefined })).toMatch(/job is required/);
    // One job, one voice, explicit anti-jobs: a brief with none is not a brief.
    expect(parseCreateAgentInput({ ...good, antiJobs: [] })).toMatch(/anti-job is required/);
    expect(parseCreateAgentInput({ ...good, antiJobs: ['', '  '] })).toMatch(/anti-job is required/);
    expect(parseCreateAgentInput({ ...good, antiJobs: 'no' })).toMatch(/anti-job is required/);
    expect(parseCreateAgentInput(null)).toMatch(/name is required/);
  });

  test('a runaway brief is cut rather than refused', () => {
    const parsed = parseCreateAgentInput({
      ...good,
      name: 'x'.repeat(200),
      antiJobs: Array.from({ length: 20 }, (_, i) => `no ${i}`),
    });
    if (typeof parsed === 'string') throw new Error(parsed);
    expect(parsed.name).toHaveLength(CREATE_AGENT_LIMITS.name);
    expect(parsed.antiJobs).toHaveLength(CREATE_AGENT_LIMITS.antiJobs);
  });
});

describe('the agent it makes', () => {
  test('its instructions carry the job, the anti-jobs and the standing rule', () => {
    const text = buildAgentInstructions({ ...good, voice: 'Short.' });
    expect(text).toContain('Your job: Runs projects; specialists claim tasks.');
    expect(text).toContain("- Won't do specialist work itself");
    expect(text).toContain('How you sound: Short.');
    expect(text).toContain('Never send, post or spend without the person saying yes.');
  });

  test('no voice, no voice line', () => {
    expect(buildAgentInstructions(good)).not.toContain('How you sound');
  });

  test('the card shows the brief as written, nothing invented', () => {
    expect(describeBrief({ ...good, voice: 'Short.' })).toBe(
      "Job: Runs projects; specialists claim tasks.\nDoes not:\n- Won't do specialist work itself\nVoice: Short.",
    );
  });
});
