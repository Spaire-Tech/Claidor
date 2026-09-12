/**
 * Which real voice speaks for each of the five styles.
 *
 * The onboarding Voice step offers five characters — Concise, Balanced,
 * Warm, Direct, Sassy — and until now its play button used the computer's
 * own speech synthesiser, with a comment saying so « until a Maties voice
 * from Claidor's servers replaces it ». This is that replacement.
 *
 * **Provisional, and deliberately so.** Nobody has chosen which ElevenLabs
 * voice suits « Sassy »; that wants ears on the actual recordings, and it
 * is the founder's call. Until then the five are assigned from the account's
 * own voice list in its own order, which has two properties worth having:
 * no voice id is invented anywhere in this codebase, and the same account
 * always hears the same voice for the same style. When the founder picks,
 * this function is replaced by their mapping and nothing else moves.
 */

import { ASSISTANT_VOICE_ORDER, AssistantVoice } from '../../shared/onboarding/constants';
import type { SpeechVoice } from '../../shared/speech/constants';

export type VoiceAssignment = Partial<Record<AssistantVoice, string>>;

/**
 * A voice id for each style, as far as the account's voices reach.
 *
 * With fewer voices than styles the list is reused in order rather than
 * leaving later styles silent: a style that says nothing reads as a
 * broken button, where a shared voice reads as two characters who happen
 * to sound alike.
 */
export const assignVoicesToStyles = (voices: readonly SpeechVoice[]): VoiceAssignment => {
  if (voices.length === 0) return {};
  const assignment: VoiceAssignment = {};
  ASSISTANT_VOICE_ORDER.forEach((style, index) => {
    assignment[style] = voices[index % voices.length].voiceId;
  });
  return assignment;
};

/** The voice for one style, or null when the account has none at all. */
export const voiceForStyle = (
  assignment: VoiceAssignment,
  style: AssistantVoice,
): string | null => assignment[style] ?? null;
