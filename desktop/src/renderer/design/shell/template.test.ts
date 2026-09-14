import { describe, expect, test } from 'vitest';

import {
  agentTemplate,
  TEMPLATE_VERSION,
  templateBase64,
  templateFileName,
  templateJson,
} from './template';

describe('agentTemplate', () => {
  test('carries what somebody would need to have the same agent', () => {
    expect(agentTemplate({
      name: '  Mira  ',
      description: ' Inbox triage. ',
      instructions: ' Terse, factual. ',
      skillIds: ['inbox', 'calendar'],
      opening: '  inbox is unusable, do something  ',
    })).toEqual({
      kind: 'agent',
      version: TEMPLATE_VERSION,
      name: 'Mira',
      description: 'Inbox triage.',
      instructions: 'Terse, factual.',
      skills: ['inbox', 'calendar'],
      example: 'inbox is unusable, do something',
    });
  });

  test('a conversation that has not started carries no example', () => {
    expect(agentTemplate({ name: 'Juno', opening: '   ' })).not.toHaveProperty('example');
    expect(agentTemplate({ name: 'Juno' })).not.toHaveProperty('example');
  });

  test('missing parts are empty, never undefined', () => {
    const template = agentTemplate({ name: 'Juno' });
    expect(template.description).toBe('');
    expect(template.instructions).toBe('');
    expect(template.skills).toEqual([]);
  });

  test('the skills list is a copy, so the store cannot be edited through it', () => {
    const skillIds = ['a'];
    const template = agentTemplate({ name: 'Juno', skillIds });
    template.skills.push('b');
    expect(skillIds).toEqual(['a']);
  });
});

describe('templateJson', () => {
  test('is indented and ends in a newline, because somebody will open it', () => {
    const json = templateJson(agentTemplate({ name: 'Juno' }));
    expect(json.endsWith('}\n')).toBe(true);
    expect(json).toContain('\n  "kind": "agent"');
    expect(JSON.parse(json).name).toBe('Juno');
  });
});

describe('templateBase64', () => {
  test('decodes back to the file', () => {
    const template = agentTemplate({ name: 'Juno' });
    expect(Buffer.from(templateBase64(template), 'base64').toString('utf8'))
      .toBe(templateJson(template));
  });

  test('an agent named outside Latin-1 does not throw', () => {
    // `btoa` alone throws on this, which would have been a crash on
    // somebody's real agent rather than a file.
    const template = agentTemplate({ name: 'Café', description: '—' });
    expect(Buffer.from(templateBase64(template), 'base64').toString('utf8'))
      .toContain('Café');
  });
});

describe('templateFileName', () => {
  test('names the file after the agent', () => {
    expect(templateFileName('Mira')).toBe('Mira.faiser-agent.json');
  });

  test('anything a file system objects to becomes a hyphen', () => {
    // And a hyphen left at the end is then trimmed, so the name does not
    // read as though something were cut off it.
    expect(templateFileName('Q4/Q1 "board"')).toBe('Q4-Q1 -board.faiser-agent.json');
  });

  test('an agent named in punctuation alone still gets a file', () => {
    expect(templateFileName('///')).toBe('Agent.faiser-agent.json');
    expect(templateFileName('   ')).toBe('Agent.faiser-agent.json');
  });
});
