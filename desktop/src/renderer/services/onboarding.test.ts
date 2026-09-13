import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import {
  ASSISTANT_NAME_SUGGESTIONS,
  AssistantVoice,
  DEFAULT_ASSISTANT_NAME,
  DEFAULT_ASSISTANT_VOICE,
  OnboardingStep,
  OnboardingStoreKey,
} from '../../shared/onboarding/constants';
import {
  nextOnboardingStep,
  onboardingService,
  previousOnboardingStep,
  PRIVACY_AGREED_STORE_KEY,
  resolveResumeStep,
  resolveStoredAssistantName,
  resolveStoredAssistantVoice,
  resolveStoredTimezone,
} from './onboarding';

describe('step resume', () => {
  test('reopens on the stored step', () => {
    expect(resolveResumeStep(1)).toBe(OnboardingStep.Welcome);
    expect(resolveResumeStep(3)).toBe(OnboardingStep.Voice);
    expect(resolveResumeStep('4')).toBe(OnboardingStep.Reach);
  });

  test('starts over when the store holds nothing usable', () => {
    expect(resolveResumeStep(undefined)).toBe(OnboardingStep.Welcome);
    expect(resolveResumeStep(null)).toBe(OnboardingStep.Welcome);
    expect(resolveResumeStep(0)).toBe(OnboardingStep.Welcome);
    expect(resolveResumeStep(7)).toBe(OnboardingStep.Welcome);
    expect(resolveResumeStep('later')).toBe(OnboardingStep.Welcome);
    expect(resolveResumeStep(2.5)).toBe(OnboardingStep.Welcome);
  });

  test('a person who closed the app on Done sees the last real step again', () => {
    expect(resolveResumeStep(OnboardingStep.Done)).toBe(OnboardingStep.Connections);
  });

  test('walks the steps in order and stops at the ends', () => {
    expect(nextOnboardingStep(OnboardingStep.Welcome)).toBe(OnboardingStep.Name);
    expect(nextOnboardingStep(OnboardingStep.Connections)).toBe(OnboardingStep.Done);
    expect(nextOnboardingStep(OnboardingStep.Done)).toBe(OnboardingStep.Done);
    expect(previousOnboardingStep(OnboardingStep.Name)).toBe(OnboardingStep.Welcome);
    expect(previousOnboardingStep(OnboardingStep.Welcome)).toBe(OnboardingStep.Welcome);
  });
});

describe('stored values', () => {
  test('tidies the name and falls back to the default', () => {
    expect(resolveStoredAssistantName('  Wren  ')).toBe('Wren');
    expect(resolveStoredAssistantName('')).toBe(DEFAULT_ASSISTANT_NAME);
    expect(resolveStoredAssistantName(42)).toBe(DEFAULT_ASSISTANT_NAME);
    expect(resolveStoredAssistantName('x'.repeat(40))).toHaveLength(24);
    expect(ASSISTANT_NAME_SUGGESTIONS).toContain(DEFAULT_ASSISTANT_NAME);
  });

  test('keeps only a known voice', () => {
    expect(resolveStoredAssistantVoice('warm')).toBe(AssistantVoice.Warm);
    expect(resolveStoredAssistantVoice('shouty')).toBe(DEFAULT_ASSISTANT_VOICE);
    expect(resolveStoredAssistantVoice(undefined)).toBe(DEFAULT_ASSISTANT_VOICE);
  });

  test('uses the machine zone when none is stored', () => {
    expect(resolveStoredTimezone('Europe/Paris', 'UTC')).toBe('Europe/Paris');
    expect(resolveStoredTimezone('', 'America/Chicago')).toBe('America/Chicago');
    expect(resolveStoredTimezone(null, 'America/Chicago')).toBe('America/Chicago');
  });
});

describe('the service against the store', () => {
  const values = new Map<string, unknown>();
  const applyProfile = vi.fn(async () => undefined);

  beforeEach(() => {
    values.clear();
    applyProfile.mockClear();
    vi.stubGlobal('window', {
      electron: {
        store: {
          get: vi.fn(async (key: string) => values.get(key)),
          set: vi.fn(async (key: string, value: unknown) => { values.set(key, value); }),
          remove: vi.fn(async (key: string) => { values.delete(key); }),
        },
        onboarding: { applyProfile },
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('is not completed until « Go to workspace »', async () => {
    expect(await onboardingService.isCompleted()).toBe(false);
    await onboardingService.markCompleted();
    expect(await onboardingService.isCompleted()).toBe(true);
    expect(values.get(OnboardingStoreKey.Completed)).toBe(true);
    expect(values.get(OnboardingStoreKey.Step)).toBe(OnboardingStep.Done);
  });

  test('reads the state back with defaults filled in', async () => {
    values.set(OnboardingStoreKey.Step, 3);
    values.set(OnboardingStoreKey.AssistantName, 'Pip');
    values.set(OnboardingStoreKey.AssistantVoice, 'sassy');
    const state = await onboardingService.readState();
    expect(state.completed).toBe(false);
    expect(state.step).toBe(OnboardingStep.Voice);
    expect(state.assistantName).toBe('Pip');
    expect(state.voice).toBe(AssistantVoice.Sassy);
    expect(state.timezone).not.toBe('');
  });

  test('stores what is decided under the contract keys', async () => {
    await onboardingService.saveStep(OnboardingStep.Reach);
    await onboardingService.saveAssistantName('  Sable ');
    await onboardingService.saveVoice(AssistantVoice.Direct);
    await onboardingService.saveTimezone('Europe/Paris');
    await onboardingService.agreeToPrivacy();
    expect(values.get(OnboardingStoreKey.Step)).toBe(OnboardingStep.Reach);
    expect(values.get(OnboardingStoreKey.AssistantName)).toBe('Sable');
    expect(values.get(OnboardingStoreKey.AssistantVoice)).toBe(AssistantVoice.Direct);
    expect(values.get(OnboardingStoreKey.Timezone)).toBe('Europe/Paris');
    expect(values.get(PRIVACY_AGREED_STORE_KEY)).toBe(true);
  });

  test('hands the tidied profile to the main process', async () => {
    const applied = await onboardingService.applyProfile({
      assistantName: ' Juno ',
      voice: AssistantVoice.Warm,
      timezone: 'Africa/Dakar',
    });
    expect(applied).toBe(true);
    expect(applyProfile).toHaveBeenCalledWith({
      assistantName: 'Juno',
      voice: AssistantVoice.Warm,
      timezone: 'Africa/Dakar',
    });
  });

  test('survives a missing bridge', async () => {
    vi.stubGlobal('window', { electron: { store: window.electron.store } });
    const applied = await onboardingService.applyProfile({
      assistantName: 'Juno',
      voice: AssistantVoice.Warm,
      timezone: 'Africa/Dakar',
    });
    expect(applied).toBe(false);
  });
});
