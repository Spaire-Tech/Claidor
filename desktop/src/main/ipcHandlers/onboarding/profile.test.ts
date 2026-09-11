import { describe, expect, test } from 'vitest';

import {
  AssistantVoice,
  DEFAULT_ASSISTANT_NAME,
  DEFAULT_ASSISTANT_VOICE,
  OnboardingStoreKey,
} from '../../../shared/onboarding/constants';
import {
  isSupportedTimezone,
  type OnboardingProfileStore,
  readOnboardingProfile,
  resolveMachineTimezone,
  storeOnboardingProfile,
  validateOnboardingProfile,
} from './profile';

const createStore = (initial: Record<string, unknown> = {}): OnboardingProfileStore & { data: Map<string, unknown> } => {
  const data = new Map<string, unknown>(Object.entries(initial));
  return {
    data,
    get: <T,>(key: string) => data.get(key) as T | undefined,
    set: (key, value) => {
      data.set(key, value);
    },
  };
};

describe('readOnboardingProfile', () => {
  test('fills the defaults on a fresh profile', () => {
    const profile = readOnboardingProfile(createStore());

    expect(profile.assistantName).toBe(DEFAULT_ASSISTANT_NAME);
    expect(profile.voice).toBe(DEFAULT_ASSISTANT_VOICE);
    expect(profile.timezone).toBe(resolveMachineTimezone());
    expect(isSupportedTimezone(profile.timezone)).toBe(true);
  });

  test('returns what was stored, tidied', () => {
    const profile = readOnboardingProfile(createStore({
      [OnboardingStoreKey.AssistantName]: '  Wren   Sable ',
      [OnboardingStoreKey.AssistantVoice]: AssistantVoice.Sassy,
      [OnboardingStoreKey.Timezone]: 'Europe/Paris',
    }));

    expect(profile).toEqual({ assistantName: 'Wren Sable', voice: AssistantVoice.Sassy, timezone: 'Europe/Paris' });
  });

  test('falls back on values it cannot use', () => {
    const profile = readOnboardingProfile(createStore({
      [OnboardingStoreKey.AssistantName]: 42,
      [OnboardingStoreKey.AssistantVoice]: 'shouty',
      [OnboardingStoreKey.Timezone]: 'Mars/Olympus_Mons',
    }));

    expect(profile.assistantName).toBe(DEFAULT_ASSISTANT_NAME);
    expect(profile.voice).toBe(DEFAULT_ASSISTANT_VOICE);
    expect(profile.timezone).toBe(resolveMachineTimezone());
  });
});

describe('validateOnboardingProfile', () => {
  test('accepts a complete profile and tidies the name', () => {
    const result = validateOnboardingProfile({
      assistantName: '  Juno ',
      voice: AssistantVoice.Warm,
      timezone: 'America/Los_Angeles',
    });

    expect(result).toEqual({
      ok: true,
      profile: { assistantName: 'Juno', voice: AssistantVoice.Warm, timezone: 'America/Los_Angeles' },
    });
  });

  test('refuses an empty name', () => {
    const result = validateOnboardingProfile({ assistantName: '   ', voice: AssistantVoice.Direct, timezone: 'UTC' });

    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.error).toMatch(/name/i);
  });

  test('refuses a voice that is not one of the five', () => {
    const result = validateOnboardingProfile({ assistantName: 'Pip', voice: 'shouty', timezone: 'UTC' });

    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.error).toMatch(/voice/i);
  });

  test('refuses a time zone the runtime does not know', () => {
    const result = validateOnboardingProfile({ assistantName: 'Pip', voice: AssistantVoice.Balanced, timezone: 'Nowhere/Town' });

    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.error).toMatch(/time zone/i);
  });

  test('refuses a payload that is not an object', () => {
    expect(validateOnboardingProfile(null).ok).toBe(false);
    expect(validateOnboardingProfile('Juno').ok).toBe(false);
  });
});

describe('storeOnboardingProfile', () => {
  test('writes the three contract keys', () => {
    const store = createStore();
    storeOnboardingProfile(store, { assistantName: 'Marlow', voice: AssistantVoice.Concise, timezone: 'Asia/Tokyo' });

    expect(store.data.get(OnboardingStoreKey.AssistantName)).toBe('Marlow');
    expect(store.data.get(OnboardingStoreKey.AssistantVoice)).toBe(AssistantVoice.Concise);
    expect(store.data.get(OnboardingStoreKey.Timezone)).toBe('Asia/Tokyo');
  });
});

describe('isSupportedTimezone', () => {
  test('knows the IANA zones and refuses the rest', () => {
    expect(isSupportedTimezone('Europe/London')).toBe(true);
    expect(isSupportedTimezone('UTC')).toBe(true);
    expect(isSupportedTimezone('')).toBe(false);
    expect(isSupportedTimezone('Nowhere/Town')).toBe(false);
    expect(isSupportedTimezone(12)).toBe(false);
  });
});
