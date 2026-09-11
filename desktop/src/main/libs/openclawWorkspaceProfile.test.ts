import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, test } from 'vitest';

import { AssistantVoice, type OnboardingProfile } from '../../shared/onboarding/constants';
import {
  applyProfileToWorkspace,
  buildIdentityMarkdown,
  buildUserMarkdown,
  identityNames,
  userFileIsBlank,
  withUserTimezone,
  WorkspaceProfileFile,
} from './openclawWorkspaceProfile';

const profile: OnboardingProfile = {
  assistantName: 'Juno',
  voice: AssistantVoice.Warm,
  timezone: 'Europe/Zurich',
};

const dirs: string[] = [];
const makeWorkspace = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maties-workspace-'));
  dirs.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('the identity file', () => {
  test('is the engine layout with the chosen name, vibe and the bird', () => {
    const markdown = buildIdentityMarkdown(profile);
    expect(markdown).toContain('- **Name:** Juno');
    expect(markdown).toContain('- **Vibe:** Warm and encouraging');
    expect(markdown).toContain('- **Emoji:** 🦜');
    expect(identityNames(markdown, 'Juno')).toBe(true);
    expect(identityNames(markdown, 'Pip')).toBe(false);
  });

  test('the old default sentence does not count as naming the assistant', () => {
    expect(identityNames('Your name is Maties, a personal assistant agent.', 'Maties')).toBe(false);
  });
});

describe('the user file', () => {
  test('carries the account name, the first name and the time zone', () => {
    const markdown = buildUserMarkdown({ name: 'Eva Martin' }, profile);
    expect(markdown).toContain('- **Name:** Eva Martin');
    expect(markdown).toContain('- **What to call them:** Eva');
    expect(markdown).toContain('- **Timezone:** Europe/Zurich');
    expect(userFileIsBlank(markdown)).toBe(false);
  });

  test('the engine template and an empty file count as blank', () => {
    expect(userFileIsBlank('')).toBe(true);
    expect(userFileIsBlank('# USER.md - About Your Human\n\n- **Name:**\n- **Timezone:**\n')).toBe(true);
  });

  test('a filled file keeps its lines and only the time zone moves', () => {
    const filled = '# USER.md\n\n- **Name:** Eva\n- **Timezone:** UTC\n- **Notes:** likes short answers\n';
    const next = withUserTimezone(filled, 'Europe/Zurich');
    expect(next).toContain('- **Timezone:** Europe/Zurich');
    expect(next).toContain('- **Notes:** likes short answers');
  });
});

describe('applying the profile to a workspace', () => {
  test('writes the three files and removes the questionnaire on a fresh workspace', () => {
    const dir = makeWorkspace();
    fs.writeFileSync(path.join(dir, WorkspaceProfileFile.Bootstrap), '# Bootstrap\n');
    const result = applyProfileToWorkspace(dir, profile, { name: 'Eva Martin' });
    expect(result).toEqual({ identityWritten: true, userWritten: true, soulWritten: true, bootstrapRemoved: true });
    expect(fs.existsSync(path.join(dir, WorkspaceProfileFile.Bootstrap))).toBe(false);
    expect(fs.readFileSync(path.join(dir, WorkspaceProfileFile.Identity), 'utf8')).toContain('- **Name:** Juno');
    expect(fs.readFileSync(path.join(dir, WorkspaceProfileFile.Soul), 'utf8')).toContain('You are Juno, Eva\'s Maty');
  });

  test('replaces the old default identity sentence and leaves a filled user file and soul alone', () => {
    const dir = makeWorkspace();
    fs.writeFileSync(path.join(dir, WorkspaceProfileFile.Identity), 'Your name is Maties, a personal assistant agent.');
    fs.writeFileSync(path.join(dir, WorkspaceProfileFile.User), '# USER.md\n\n- **Name:** Eva\n- **Timezone:** UTC\n- **Notes:** learned\n');
    fs.writeFileSync(path.join(dir, WorkspaceProfileFile.Soul), 'my own soul\n');
    const result = applyProfileToWorkspace(dir, profile, { name: 'Eva Martin' });
    expect(result.identityWritten).toBe(true);
    expect(result.soulWritten).toBe(false);
    expect(result.bootstrapRemoved).toBe(false);
    const user = fs.readFileSync(path.join(dir, WorkspaceProfileFile.User), 'utf8');
    expect(user).toContain('- **Notes:** learned');
    expect(user).toContain('- **Timezone:** Europe/Zurich');
    expect(fs.readFileSync(path.join(dir, WorkspaceProfileFile.Soul), 'utf8')).toBe('my own soul\n');
  });

  test('a second run changes nothing', () => {
    const dir = makeWorkspace();
    applyProfileToWorkspace(dir, profile, { name: 'Eva' });
    const again = applyProfileToWorkspace(dir, profile, { name: 'Eva' });
    expect(again).toEqual({ identityWritten: false, userWritten: false, soulWritten: false, bootstrapRemoved: false });
  });

  test('a new name rewrites the identity', () => {
    const dir = makeWorkspace();
    applyProfileToWorkspace(dir, profile, { name: 'Eva' });
    const renamed = applyProfileToWorkspace(dir, { ...profile, assistantName: 'Pip' }, { name: 'Eva' });
    expect(renamed.identityWritten).toBe(true);
    expect(fs.readFileSync(path.join(dir, WorkspaceProfileFile.Identity), 'utf8')).toContain('- **Name:** Pip');
  });
});
