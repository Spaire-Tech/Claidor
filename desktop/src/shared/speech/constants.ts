/**
 * The voice, as both processes name it.
 *
 * Maties has no API-key screen and will not get one: the app asks Claidor
 * to say something and Claidor holds the ElevenLabs key
 * (`server/polar/desktop/speech.py`, `docs/maties/plan.md` step 1). These
 * are the route names and the wire shapes for that conversation.
 */

/** Paths under the account protocol base, e.g. `https://api.claidor.com/desktop`. */
export const SPEECH_VOICES_ROUTE = '/api/speech/v1/voices';
export const SPEECH_TEXT_TO_SPEECH_ROUTE = '/api/speech/v1/text-to-speech';

export const SpeechIpc = {
  ListVoices: 'speech:listVoices',
  Speak: 'speech:speak',
} as const;
export type SpeechIpc = typeof SpeechIpc[keyof typeof SpeechIpc];

/** One voice as ElevenLabs lists it, reduced to what the app shows. */
export interface SpeechVoice {
  voiceId: string;
  name: string;
  /** ElevenLabs' own one-line description, where it gives one. */
  description?: string;
}

export interface SpeechVoicesResult {
  ok: boolean;
  voices: SpeechVoice[];
  /**
   * Why there are none. Separated from an empty list on purpose: « the
   * voice is not switched on here » and « this account has no voices »
   * want different words on screen, and collapsing them is how a missing
   * key comes to read as a broken feature.
   */
  error?: string;
  /** True when the server has no speech key at all. */
  unavailable?: boolean;
}

export interface SpeakResult {
  ok: boolean;
  /** MPEG audio, base64, for the renderer to play. Absent on failure. */
  audioBase64?: string;
  error?: string;
}
