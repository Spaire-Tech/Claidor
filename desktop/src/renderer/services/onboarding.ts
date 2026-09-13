import {
  ASSISTANT_VOICE_ORDER,
  type AssistantVoice,
  DEFAULT_ASSISTANT_NAME,
  DEFAULT_ASSISTANT_VOICE,
  isAssistantVoice,
  normalizeAssistantName,
  ONBOARDING_STEP_COUNT,
  type OnboardingProfile,
  OnboardingStep,
  OnboardingStoreKey,
} from '../../shared/onboarding/constants';

/**
 * The onboarding flow's memory (docs/maties/onboarding.md): the step the
 * person was on, so a closed app reopens there; the name, voice and time
 * zone as they are decided; « completed » once « Go to workspace » was
 * pressed. Everything lives in the `kv` table under the contract's keys.
 */

/** The privacy agreement the app has always kept; Continue on Welcome sets it. */
export const PRIVACY_AGREED_STORE_KEY = 'privacy_agreed';

export interface OnboardingDraft {
  assistantName: string;
  voice: AssistantVoice;
  /** IANA time zone; empty until the machine's zone is read. */
  timezone: string;
}

export interface OnboardingState extends OnboardingDraft {
  completed: boolean;
  step: OnboardingStep;
}

const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  OnboardingStep.Welcome,
  OnboardingStep.Name,
  OnboardingStep.Voice,
  OnboardingStep.Reach,
  OnboardingStep.Connections,
  OnboardingStep.Done,
];

export const isOnboardingStep = (value: unknown): value is OnboardingStep => (
  typeof value === 'number' && (ONBOARDING_STEPS as readonly number[]).includes(value)
);

/**
 * Where a reopened app lands. Anything that is not a step in 1..6 starts
 * over at Welcome. The Done step is not resumed: its « Go to workspace »
 * is what completes the flow, and a person who closed the app there sees
 * the last real step again rather than a dead end.
 */
export const resolveResumeStep = (stored: unknown): OnboardingStep => {
  const numeric = typeof stored === 'string' ? Number(stored) : stored;
  if (!isOnboardingStep(numeric)) return OnboardingStep.Welcome;
  if (numeric === OnboardingStep.Done) return OnboardingStep.Connections;
  return numeric;
};

export const nextOnboardingStep = (step: OnboardingStep): OnboardingStep => (
  ONBOARDING_STEPS[Math.min(ONBOARDING_STEPS.indexOf(step) + 1, ONBOARDING_STEP_COUNT - 1)]
);

export const previousOnboardingStep = (step: OnboardingStep): OnboardingStep => (
  ONBOARDING_STEPS[Math.max(ONBOARDING_STEPS.indexOf(step) - 1, 0)]
);

export const resolveStoredAssistantName = (stored: unknown): string => {
  const name = typeof stored === 'string' ? normalizeAssistantName(stored) : '';
  return name || DEFAULT_ASSISTANT_NAME;
};

export const resolveStoredAssistantVoice = (stored: unknown): AssistantVoice => (
  isAssistantVoice(stored) ? stored : DEFAULT_ASSISTANT_VOICE
);

export const resolveStoredTimezone = (stored: unknown, machineTimezone: string): string => (
  typeof stored === 'string' && stored.trim() ? stored.trim() : machineTimezone
);

/** The machine's own zone, or UTC when the runtime cannot say. */
export const getMachineTimezone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

const readStore = async (key: string): Promise<unknown> => {
  try {
    return await window.electron.store.get(key);
  } catch (error) {
    console.warn(`[Onboarding] could not read ${key} from the store:`, error);
    return undefined;
  }
};

const writeStore = async (key: string, value: unknown): Promise<void> => {
  try {
    await window.electron.store.set(key, value);
  } catch (error) {
    console.warn(`[Onboarding] could not write ${key} to the store:`, error);
  }
};

class OnboardingService {
  async isCompleted(): Promise<boolean> {
    return (await readStore(OnboardingStoreKey.Completed)) === true;
  }

  async readState(): Promise<OnboardingState> {
    const [completed, step, name, voice, timezone] = await Promise.all([
      readStore(OnboardingStoreKey.Completed),
      readStore(OnboardingStoreKey.Step),
      readStore(OnboardingStoreKey.AssistantName),
      readStore(OnboardingStoreKey.AssistantVoice),
      readStore(OnboardingStoreKey.Timezone),
    ]);
    return {
      completed: completed === true,
      step: resolveResumeStep(step),
      assistantName: resolveStoredAssistantName(name),
      voice: resolveStoredAssistantVoice(voice),
      timezone: resolveStoredTimezone(timezone, getMachineTimezone()),
    };
  }

  async saveStep(step: OnboardingStep): Promise<void> {
    await writeStore(OnboardingStoreKey.Step, step);
  }

  async saveAssistantName(name: string): Promise<void> {
    await writeStore(OnboardingStoreKey.AssistantName, resolveStoredAssistantName(name));
  }

  async saveVoice(voice: AssistantVoice): Promise<void> {
    if (!ASSISTANT_VOICE_ORDER.includes(voice)) return;
    await writeStore(OnboardingStoreKey.AssistantVoice, voice);
  }

  async saveTimezone(timezone: string): Promise<void> {
    await writeStore(OnboardingStoreKey.Timezone, timezone);
  }

  /** Continue on Welcome counts as agreeing to the privacy policy. */
  async agreeToPrivacy(): Promise<void> {
    await window.electron.store.set(PRIVACY_AGREED_STORE_KEY, true);
  }

  /**
   * « Finish setup »: the main process stores the profile, renames the main
   * agent and resyncs the engine. The draft is already in the store, so a
   * bridge that is not there yet (or fails) does not lose what was decided.
   */
  async applyProfile(profile: OnboardingProfile): Promise<boolean> {
    const bridge = window.electron.onboarding;
    if (!bridge?.applyProfile) {
      console.warn('[Onboarding] the profile bridge is unavailable; the profile stays in the store only.');
      return false;
    }
    try {
      await bridge.applyProfile({
        assistantName: resolveStoredAssistantName(profile.assistantName),
        voice: resolveStoredAssistantVoice(profile.voice),
        timezone: profile.timezone,
      });
      return true;
    } catch (error) {
      console.error('[Onboarding] applying the profile failed:', error);
      return false;
    }
  }

  /** « Go to workspace »: after this the flow never shows again. */
  async markCompleted(): Promise<void> {
    await writeStore(OnboardingStoreKey.Completed, true);
    await writeStore(OnboardingStoreKey.Step, OnboardingStep.Done);
  }
}

export const onboardingService = new OnboardingService();
