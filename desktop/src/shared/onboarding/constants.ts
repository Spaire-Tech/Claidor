/**
 * Onboarding (docs/maties/onboarding.md): the six screens a person sees
 * once, and the three things they decide there that the rest of the app
 * reads: the assistant's name, its voice, the time zone.
 *
 * Shared between the renderer (the screens) and the main process (which
 * writes the name into the main agent, the voice into the engine's managed
 * instructions, and keeps the time zone).
 */

/** Keys in the `kv` table. */
export const OnboardingStoreKey = {
  /** `true` once « Go to workspace » was pressed. */
  Completed: 'onboarding.v1.completed',
  /** The step the person was on, so a closed app reopens there (1-based). */
  Step: 'onboarding.v1.step',
  /** The assistant's name (« Juno »). */
  AssistantName: 'assistant.name',
  /** One of `AssistantVoice`. */
  AssistantVoice: 'assistant.voice',
  /** An IANA time zone (« America/Los_Angeles »). */
  Timezone: 'app.timezone',
  /** Connection ids the person asked to be told about (« Soon » cards). */
  WantedConnections: 'connections.wanted',
} as const;
export type OnboardingStoreKey = typeof OnboardingStoreKey[keyof typeof OnboardingStoreKey];

/** How the assistant writes and, later, speaks. The five orbs of step 3. */
export const AssistantVoice = {
  Concise: 'concise',
  Balanced: 'balanced',
  Warm: 'warm',
  Direct: 'direct',
  Sassy: 'sassy',
} as const;
export type AssistantVoice = typeof AssistantVoice[keyof typeof AssistantVoice];

export const ASSISTANT_VOICE_ORDER: readonly AssistantVoice[] = [
  AssistantVoice.Concise,
  AssistantVoice.Balanced,
  AssistantVoice.Warm,
  AssistantVoice.Direct,
  AssistantVoice.Sassy,
];

export const DEFAULT_ASSISTANT_VOICE: AssistantVoice = AssistantVoice.Concise;

/** Names « Suggest another name » cycles through; the first is the default. */
export const ASSISTANT_NAME_SUGGESTIONS: readonly string[] = ['Juno', 'Marlow', 'Wren', 'Sable', 'Pip'];
export const DEFAULT_ASSISTANT_NAME = ASSISTANT_NAME_SUGGESTIONS[0];

/** The assistant's own address: `<name>@maties.ai` (the domain is the founder's placeholder). */
export const ASSISTANT_EMAIL_DOMAIN = 'maties.ai';

export const ONBOARDING_STEP_COUNT = 6;

export const OnboardingStep = {
  Welcome: 1,
  Name: 2,
  Voice: 3,
  Reach: 4,
  Connections: 5,
  Done: 6,
} as const;
export type OnboardingStep = typeof OnboardingStep[keyof typeof OnboardingStep];

/** What the person decided, handed to the main process on « Finish setup ». */
export interface OnboardingProfile {
  assistantName: string;
  voice: AssistantVoice;
  /** IANA time zone. */
  timezone: string;
}

/** IPC channels (renderer ↔ main). */
export const OnboardingIpcChannel = {
  /** Read the profile as stored (name, voice, time zone), with defaults filled in. */
  GetProfile: 'onboarding:get-profile',
  /** Store the profile, rename the main agent, resync the engine. */
  ApplyProfile: 'onboarding:apply-profile',
} as const;
export type OnboardingIpcChannel = typeof OnboardingIpcChannel[keyof typeof OnboardingIpcChannel];

/** The assistant's address for a name: lower case letters and digits only. */
export const assistantEmailFor = (name: string): string => {
  const local = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  return `${local || 'maty'}@${ASSISTANT_EMAIL_DOMAIN}`;
};

/** A typed name, tidied: trimmed, one line, at most 24 characters. */
export const normalizeAssistantName = (name: string): string => (
  name.replace(/\s+/g, ' ').trim().slice(0, 24)
);

export const isAssistantVoice = (value: unknown): value is AssistantVoice => (
  typeof value === 'string' && (ASSISTANT_VOICE_ORDER as readonly string[]).includes(value)
);
