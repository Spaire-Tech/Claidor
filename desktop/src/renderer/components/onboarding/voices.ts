import {
  ASSISTANT_VOICE_ORDER,
  AssistantVoice,
} from '../../../shared/onboarding/constants';

/**
 * The five voices of the Voice step (docs/maties/onboarding.md, screen 3):
 * the founder's names and lines, the exact gradients of his orbs, and, until
 * a Maties voice from Claidor's servers replaces it, how the computer's own
 * speech reads the sample sentence.
 */
export interface VoiceDefinition {
  id: AssistantVoice;
  /** i18n key of the name (« Concise »). */
  nameKey: string;
  /** i18n key of the line under the name. */
  lineKey: string;
  /** i18n key of the sentence the play disc reads aloud. */
  sampleKey: string;
  /** The three mesh layers: the base, the coloured bloom, the highlight. */
  gradients: readonly [string, string, string];
  /** Speech parameters for `window.speechSynthesis`. */
  speech: { rate: number; pitch: number };
}

const VOICE_BY_ID: Record<AssistantVoice, VoiceDefinition> = {
  [AssistantVoice.Concise]: {
    id: AssistantVoice.Concise,
    nameKey: 'matiesOnboardingVoiceConciseName',
    lineKey: 'matiesOnboardingVoiceConciseLine',
    sampleKey: 'matiesOnboardingVoiceConciseSample',
    gradients: [
      'linear-gradient(160deg, #05302c 0%, #031c1b 55%, #010a0a 100%)',
      'radial-gradient(58% 56% at 34% 36%, #16e0c6 0%, rgba(22,224,198,.62) 42%, rgba(2,22,20,0) 76%)',
      'radial-gradient(34% 32% at 30% 32%, #c8fff2 0%, rgba(200,255,242,0) 70%)',
    ],
    speech: { rate: 1.05, pitch: 0.95 },
  },
  [AssistantVoice.Balanced]: {
    id: AssistantVoice.Balanced,
    nameKey: 'matiesOnboardingVoiceBalancedName',
    lineKey: 'matiesOnboardingVoiceBalancedLine',
    sampleKey: 'matiesOnboardingVoiceBalancedSample',
    gradients: [
      'linear-gradient(160deg, #143408 0%, #0a1e05 55%, #030a02 100%)',
      'radial-gradient(58% 56% at 32% 32%, #9ce62f 0%, rgba(156,230,47,.6) 42%, rgba(8,24,6,0) 76%)',
      'radial-gradient(34% 32% at 28% 28%, #eaffb5 0%, rgba(234,255,181,0) 70%)',
    ],
    speech: { rate: 0.92, pitch: 1 },
  },
  [AssistantVoice.Warm]: {
    id: AssistantVoice.Warm,
    nameKey: 'matiesOnboardingVoiceWarmName',
    lineKey: 'matiesOnboardingVoiceWarmLine',
    sampleKey: 'matiesOnboardingVoiceWarmSample',
    gradients: [
      'linear-gradient(160deg, #451802 0%, #260d02 55%, #0c0401 100%)',
      'radial-gradient(58% 56% at 34% 66%, #ffab12 0%, rgba(255,171,18,.62) 42%, rgba(32,11,2,0) 76%)',
      'radial-gradient(34% 32% at 30% 68%, #ffe9a8 0%, rgba(255,233,168,0) 70%)',
    ],
    speech: { rate: 0.95, pitch: 1.1 },
  },
  [AssistantVoice.Direct]: {
    id: AssistantVoice.Direct,
    nameKey: 'matiesOnboardingVoiceDirectName',
    lineKey: 'matiesOnboardingVoiceDirectLine',
    sampleKey: 'matiesOnboardingVoiceDirectSample',
    gradients: [
      'linear-gradient(160deg, #032840 0%, #021626 55%, #01070d 100%)',
      'radial-gradient(58% 56% at 68% 30%, #23bdf5 0%, rgba(35,189,245,.62) 42%, rgba(2,16,28,0) 76%)',
      'radial-gradient(34% 32% at 70% 26%, #ccf2ff 0%, rgba(204,242,255,0) 70%)',
    ],
    speech: { rate: 1.12, pitch: 0.85 },
  },
  [AssistantVoice.Sassy]: {
    id: AssistantVoice.Sassy,
    nameKey: 'matiesOnboardingVoiceSassyName',
    lineKey: 'matiesOnboardingVoiceSassyLine',
    sampleKey: 'matiesOnboardingVoiceSassySample',
    gradients: [
      'linear-gradient(160deg, #3d0a06 0%, #210503 55%, #0a0201 100%)',
      'radial-gradient(58% 56% at 32% 34%, #ff4d3a 0%, rgba(255,77,58,.62) 42%, rgba(26,4,3,0) 76%)',
      'radial-gradient(34% 32% at 28% 30%, #ffd0b8 0%, rgba(255,208,184,0) 70%)',
    ],
    speech: { rate: 1.08, pitch: 1.2 },
  },
};

export const VOICES: readonly VoiceDefinition[] = ASSISTANT_VOICE_ORDER.map((id) => VOICE_BY_ID[id]);

export const getVoiceDefinition = (id: AssistantVoice): VoiceDefinition => VOICE_BY_ID[id];

/** The index in `VOICES` `offset` places from `index`, wrapping around. */
export const wrapVoiceIndex = (index: number, offset: number): number => {
  const count = VOICES.length;
  return ((index + offset) % count + count) % count;
};

const englishVoices = (synthesis: SpeechSynthesis): SpeechSynthesisVoice[] => {
  const voices = synthesis.getVoices();
  const english = voices.filter((voice) => /^en([-_]|$)/i.test(voice.lang));
  return english.length > 0 ? english : voices;
};

/**
 * Reads one sample sentence aloud with the computer's own speech. Stops
 * whatever was being said first. Returns false when the runtime has no
 * speech, so the disc can stay put and do nothing.
 */
export const speakVoiceSample = (
  voice: VoiceDefinition,
  sentence: string,
  onEnded?: () => void,
): boolean => {
  const synthesis = typeof window === 'undefined' ? undefined : window.speechSynthesis;
  if (!synthesis || typeof SpeechSynthesisUtterance === 'undefined') return false;
  try {
    synthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(sentence);
    // The fallback has to report its end too, or the play button stays
    // showing « playing » forever on the days the real voice is absent —
    // which are exactly the days somebody is already confused.
    if (onEnded) {
      utterance.addEventListener('end', onEnded, { once: true });
      utterance.addEventListener('error', onEnded, { once: true });
    }
    utterance.lang = 'en-US';
    utterance.rate = voice.speech.rate;
    utterance.pitch = voice.speech.pitch;
    const candidates = englishVoices(synthesis);
    if (candidates.length > 0) {
      // A different system voice per style, so the five sound apart even
      // where rate and pitch make little difference.
      utterance.voice = candidates[VOICES.indexOf(voice) % candidates.length];
    }
    synthesis.speak(utterance);
    return true;
  } catch (error) {
    console.warn('[Onboarding] speech could not start:', error);
    return false;
  }
};

export const stopVoiceSample = (): void => {
  try {
    window.speechSynthesis?.cancel();
  } catch {
    // No speech to stop.
  }
};
