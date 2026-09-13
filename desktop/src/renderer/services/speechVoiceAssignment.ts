/**
 * Which real voice speaks for each of the five styles.
 *
 * The onboarding Voice step offers five characters — Concise, Balanced,
 * Warm, Direct, Sassy — and its play button used to read the sample with
 * the computer's own synthesiser, « until a Maties voice from Claidor's
 * servers replaces it ». This is that replacement.
 *
 * Two of the five are chosen. The founder listened and picked them, and
 * they are pinned here by id: a chosen voice must not move when the
 * account's voice list changes order or gains a voice.
 *
 * The other three are not chosen yet, and nothing here pretends
 * otherwise. Choosing a voice means hearing it, and no voice id is
 * invented anywhere in this codebase — a made-up id fails as a puzzling
 * error from ElevenLabs rather than as the missing decision it is. So the
 * unchosen styles take what the account has left, in its own order,
 * skipping the two already spoken for, which is deterministic and never
 * silently steals a pinned voice. When the founder names the other three,
 * they join PINNED_VOICES and this comment gets shorter.
 */

import { ASSISTANT_VOICE_ORDER, AssistantVoice } from '../../shared/onboarding/constants';
import type { SpeechVoice } from '../../shared/speech/constants';

export type VoiceAssignment = Partial<Record<AssistantVoice, string>>;

/**
 * The styles whose voice the founder has chosen, by ElevenLabs voice id.
 * The names are here for the next person to read, not for matching: ids
 * are what ElevenLabs answers to, and a voice can be renamed.
 */
export const PINNED_VOICES: Partial<Record<AssistantVoice, string>> = {
  /** Siren. */
  [AssistantVoice.Sassy]: 'eXpIbVcVbLo8ZJQDlDnl',
  /** Luke. */
  [AssistantVoice.Warm]: 'RNnkVeW25AwKYxZgnHBH',
};

/**
 * A voice id for each style: the pinned ones as chosen, the rest from
 * what the account has left.
 *
 * With fewer voices than styles the remainder is reused in order rather
 * than leaving later styles silent: a style that says nothing reads as a
 * broken button, where a shared voice reads as two characters who happen
 * to sound alike.
 */
export const assignVoicesToStyles = (voices: readonly SpeechVoice[]): VoiceAssignment => {
  const assignment: VoiceAssignment = { ...PINNED_VOICES };
  const unchosen = ASSISTANT_VOICE_ORDER.filter(style => !assignment[style]);
  if (unchosen.length === 0) return assignment;

  // A pinned voice speaks for its own style and no other, so it is taken
  // out of the pool before the rest are handed out. Without this the
  // account's first voice could be both Warm and Concise while a third
  // voice went unused.
  const pinned = new Set(Object.values(PINNED_VOICES));
  const spare = voices.filter(voice => !pinned.has(voice.voiceId));
  const pool = spare.length > 0 ? spare : voices;
  if (pool.length === 0) return assignment;

  unchosen.forEach((style, index) => {
    assignment[style] = pool[index % pool.length].voiceId;
  });
  return assignment;
};

/** The voice for one style, or null when the account has none at all. */
export const voiceForStyle = (
  assignment: VoiceAssignment,
  style: AssistantVoice,
): string | null => assignment[style] ?? null;
