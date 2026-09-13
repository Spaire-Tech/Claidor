/**
 * The onboarding profile (docs/maties/onboarding.md): the assistant's name,
 * its voice and the time zone, read from and written to the `kv` table.
 * Pure helpers, so they can be tested without Electron.
 */

import {
  DEFAULT_ASSISTANT_NAME,
  DEFAULT_ASSISTANT_VOICE,
  isAssistantVoice,
  normalizeAssistantName,
  type OnboardingProfile,
  OnboardingStoreKey,
} from '../../../shared/onboarding/constants';
import { t } from '../../i18n';

/** The slice of `SqliteStore` the profile needs. */
export interface OnboardingProfileStore {
  get<T = unknown>(key: string): T | undefined;
  set<T = unknown>(key: string, value: T): void;
}

export type OnboardingProfileValidation =
  | { ok: true; profile: OnboardingProfile }
  | { ok: false; error: string };

/** The machine's IANA zone, as the runtime resolves it; UTC when it cannot. */
export const resolveMachineTimezone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

/** True when the runtime accepts the value as an IANA time zone. */
export const isSupportedTimezone = (value: unknown): value is string => {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: value });
    return true;
  } catch {
    return false;
  }
};

/** The profile as stored, with the defaults filled in for what was never chosen. */
export const readOnboardingProfile = (store: OnboardingProfileStore): OnboardingProfile => {
  const storedName = store.get<unknown>(OnboardingStoreKey.AssistantName);
  const storedVoice = store.get<unknown>(OnboardingStoreKey.AssistantVoice);
  const storedTimezone = store.get<unknown>(OnboardingStoreKey.Timezone);

  const assistantName = typeof storedName === 'string' ? normalizeAssistantName(storedName) : '';

  return {
    assistantName: assistantName || DEFAULT_ASSISTANT_NAME,
    voice: isAssistantVoice(storedVoice) ? storedVoice : DEFAULT_ASSISTANT_VOICE,
    timezone: isSupportedTimezone(storedTimezone) ? storedTimezone : resolveMachineTimezone(),
  };
};

/** Checks a payload from the renderer and tidies it into a profile. */
export const validateOnboardingProfile = (payload: unknown): OnboardingProfileValidation => {
  const candidate = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;

  const assistantName = typeof candidate.assistantName === 'string'
    ? normalizeAssistantName(candidate.assistantName)
    : '';
  if (!assistantName) {
    return { ok: false, error: t('onboardingNameRequired') };
  }

  const voice = candidate.voice;
  if (!isAssistantVoice(voice)) {
    return { ok: false, error: t('onboardingVoiceUnknown') };
  }

  const timezone = typeof candidate.timezone === 'string' ? candidate.timezone.trim() : '';
  if (!isSupportedTimezone(timezone)) {
    return { ok: false, error: t('onboardingTimezoneUnknown') };
  }

  return { ok: true, profile: { assistantName, voice, timezone } };
};

/** Writes the three keys. The main agent and the engine are handled by the caller. */
export const storeOnboardingProfile = (store: OnboardingProfileStore, profile: OnboardingProfile): void => {
  store.set(OnboardingStoreKey.AssistantName, profile.assistantName);
  store.set(OnboardingStoreKey.AssistantVoice, profile.voice);
  store.set(OnboardingStoreKey.Timezone, profile.timezone);
};
