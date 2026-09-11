/**
 * The main workspace's identity files, written from the onboarding
 * (docs/maties/onboarding.md). The engine seeds a brand-new workspace with
 * a first-run questionnaire (`BOOTSTRAP.md`: « what is my name, my vibe, my
 * emoji, what should I call you ») and fills `IDENTITY.md` and `USER.md`
 * from the answers. Maties asks those questions on its own screens, so
 * here the answers are written in the engine's own format and the
 * questionnaire is removed. Pure builders plus one file step, so the
 * builders can be tested without a workspace.
 */

import fs from 'fs';
import path from 'path';

import {
  type AssistantVoice,
  AssistantVoice as AssistantVoiceValue,
  type OnboardingProfile,
} from '../../shared/onboarding/constants';
import { ASSISTANT_VOICE_INSTRUCTIONS } from './openclawVoicePrompt';

export const WorkspaceProfileFile = {
  Identity: 'IDENTITY.md',
  User: 'USER.md',
  Soul: 'SOUL.md',
  Bootstrap: 'BOOTSTRAP.md',
} as const;
export type WorkspaceProfileFile = typeof WorkspaceProfileFile[keyof typeof WorkspaceProfileFile];

/** The bird is the default face until the cast exists (plan step 4). */
export const ASSISTANT_EMOJI = '🦜';

/** How the assistant comes across, one line per voice, for the engine's « Vibe » line. */
export const ASSISTANT_VIBES: Record<AssistantVoice, string> = {
  [AssistantVoiceValue.Concise]: 'Sharp and brief. Says only what matters.',
  [AssistantVoiceValue.Balanced]: 'Even and clear. Complete without hurry.',
  [AssistantVoiceValue.Warm]: 'Warm and encouraging. Keeps you moving.',
  [AssistantVoiceValue.Direct]: 'Decisive. Gets to the point and stops.',
  [AssistantVoiceValue.Sassy]: 'Playful and witty, with a little bite. Never unkind.',
};

export interface PersonForWorkspace {
  /** The account's display name; empty when signed out. */
  name: string;
}

const IDENTITY_NAME_LINE = /^- \*\*Name:\*\*[ \t]*(.*)$/m;
const USER_NAME_LINE = /^- \*\*Name:\*\*[ \t]*(.*)$/m;
const USER_TIMEZONE_LINE = /^- \*\*Timezone:\*\*.*$/m;

/** `IDENTITY.md` in the engine's own layout, from the profile. */
export const buildIdentityMarkdown = (profile: OnboardingProfile): string => [
  '# IDENTITY.md - Who Am I?',
  '',
  `- **Name:** ${profile.assistantName}`,
  '- **Creature:** An AI assistant, a Maty: the assistant that lives on this computer.',
  `- **Vibe:** ${ASSISTANT_VIBES[profile.voice]}`,
  `- **Emoji:** ${ASSISTANT_EMOJI}`,
  '',
  'Chosen on the Maties setup screens. Change it in the app, not here.',
  '',
].join('\n');

const firstName = (name: string): string => name.trim().split(/\s+/)[0] ?? '';

/** `USER.md` in the engine's own layout, from the account and the profile. */
export const buildUserMarkdown = (person: PersonForWorkspace, profile: OnboardingProfile): string => {
  const name = person.name.trim();
  return [
    '# USER.md - About Your Human',
    '',
    `- **Name:** ${name}`,
    `- **What to call them:** ${firstName(name)}`,
    '- **Pronouns:** _(optional)_',
    `- **Timezone:** ${profile.timezone}`,
    '- **Notes:**',
    '',
    '## Context',
    '',
    '_(What do they care about? What projects are they working on? Build this over time.)_',
    '',
  ].join('\n');
};

/** `SOUL.md` when the workspace has none: who the assistant is, in the chosen voice. */
export const buildSoulMarkdown = (person: PersonForWorkspace, profile: OnboardingProfile): string => {
  const who = person.name.trim() ? `${firstName(person.name)}'s` : 'the person\'s';
  return [
    `# SOUL.md - ${profile.assistantName}`,
    '',
    `You are ${profile.assistantName}, ${who} Maty: their assistant on this computer.`,
    'You work with their files, their programs and their browser, and you ask',
    'before anything that cannot be undone: deleting, sending, paying.',
    '',
    ASSISTANT_VOICE_INSTRUCTIONS[profile.voice],
    '',
  ].join('\n');
};

/** True when an `IDENTITY.md` already carries this name on its Name line. */
export const identityNames = (identityMarkdown: string, assistantName: string): boolean => {
  const match = IDENTITY_NAME_LINE.exec(identityMarkdown);
  return Boolean(match && match[1].trim() === assistantName.trim());
};

/** True when a `USER.md` has no name yet (the engine's template, or nothing). */
export const userFileIsBlank = (userMarkdown: string): boolean => {
  if (!userMarkdown.trim()) return true;
  const match = USER_NAME_LINE.exec(userMarkdown);
  return !match || !match[1].trim();
};

/** A `USER.md` the engine or the person already filled keeps its lines; only the time zone is refreshed. */
export const withUserTimezone = (userMarkdown: string, timezone: string): string => {
  if (!USER_TIMEZONE_LINE.test(userMarkdown)) return userMarkdown;
  return userMarkdown.replace(USER_TIMEZONE_LINE, `- **Timezone:** ${timezone}`);
};

const readFile = (filePath: string): string => {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
};

const writeIfChanged = (filePath: string, content: string): boolean => {
  if (readFile(filePath) === content) return false;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  return true;
};

export interface WorkspaceProfileResult {
  identityWritten: boolean;
  userWritten: boolean;
  soulWritten: boolean;
  bootstrapRemoved: boolean;
}

/**
 * Makes the main workspace agree with the onboarding: `IDENTITY.md` names
 * the assistant as chosen (rewritten whenever it does not), `USER.md` gets
 * the person's name when it has none and the time zone always, `SOUL.md`
 * is written only when missing, and the engine's questionnaire
 * (`BOOTSTRAP.md`) is removed so the first conversation is not an
 * interview.
 */
export const applyProfileToWorkspace = (
  workspaceDir: string,
  profile: OnboardingProfile,
  person: PersonForWorkspace,
): WorkspaceProfileResult => {
  const identityPath = path.join(workspaceDir, WorkspaceProfileFile.Identity);
  const userPath = path.join(workspaceDir, WorkspaceProfileFile.User);
  const soulPath = path.join(workspaceDir, WorkspaceProfileFile.Soul);
  const bootstrapPath = path.join(workspaceDir, WorkspaceProfileFile.Bootstrap);

  const identityWritten = identityNames(readFile(identityPath), profile.assistantName)
    ? false
    : writeIfChanged(identityPath, buildIdentityMarkdown(profile));

  const existingUser = readFile(userPath);
  const userWritten = userFileIsBlank(existingUser)
    ? writeIfChanged(userPath, buildUserMarkdown(person, profile))
    : writeIfChanged(userPath, withUserTimezone(existingUser, profile.timezone));

  const soulWritten = readFile(soulPath).trim()
    ? false
    : writeIfChanged(soulPath, buildSoulMarkdown(person, profile));

  let bootstrapRemoved = false;
  if (fs.existsSync(bootstrapPath)) {
    fs.rmSync(bootstrapPath, { force: true });
    bootstrapRemoved = true;
  }

  return { identityWritten, userWritten, soulWritten, bootstrapRemoved };
};
