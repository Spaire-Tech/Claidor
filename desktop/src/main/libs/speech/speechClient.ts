/**
 * Asking Claidor to say something.
 *
 * The bearer token is not held here. The caller passes the app's existing
 * authenticated-request path (`fetchWithAuth`), which signs the request
 * and refreshes the token on a 401 — the same arrangement the memory sync
 * client uses, and for the same reason: one place knows about tokens.
 *
 * Nothing in this file knows an ElevenLabs key exists. That is the point
 * of the whole arrangement.
 */

import {
  type SpeakResult,
  SPEECH_TEXT_TO_SPEECH_ROUTE,
  SPEECH_VOICES_ROUTE,
  type SpeechVoice,
  type SpeechVoicesResult,
} from '../../../shared/speech/constants';

const SPEECH_REQUEST_TIMEOUT_MS = 30_000;

export interface SpeechClientDeps {
  /** The account protocol base URL, e.g. `https://api.claidor.com/desktop`. */
  getServerBaseUrl: () => string;
  fetchWithAuth: (url: string, options?: RequestInit) => Promise<Response>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

/**
 * The voices out of ElevenLabs' own listing shape, which is
 * `{ voices: [{ voice_id, name, description }] }`. Anything that does not
 * carry both an id and a name is dropped rather than shown half-named.
 */
export function readVoices(payload: unknown): SpeechVoice[] {
  if (!isRecord(payload) || !Array.isArray(payload.voices)) return [];
  const voices: SpeechVoice[] = [];
  for (const entry of payload.voices) {
    if (!isRecord(entry)) continue;
    const voiceId = typeof entry.voice_id === 'string' ? entry.voice_id.trim() : '';
    const name = typeof entry.name === 'string' ? entry.name.trim() : '';
    if (!voiceId || !name) continue;
    const description = typeof entry.description === 'string' && entry.description.trim()
      ? entry.description.trim()
      : undefined;
    voices.push({ voiceId, name, ...(description ? { description } : {}) });
  }
  return voices;
}

/**
 * The words to put on screen for a failed call. A 503 is the server
 * saying it has no speech key, which is « not switched on here » and not
 * a fault the person can act on by retrying.
 */
export function describeSpeechFailure(status: number): { error: string; unavailable: boolean } {
  if (status === 503) {
    return { error: 'The voice is not switched on for this account yet.', unavailable: true };
  }
  if (status === 402) {
    return { error: 'This month\'s credits are used up.', unavailable: false };
  }
  if (status === 401) {
    return { error: 'Sign in again to use the voice.', unavailable: false };
  }
  return { error: `The voice could not be reached (${status}).`, unavailable: false };
}

export class SpeechClient {
  constructor(private readonly deps: SpeechClientDeps) {}

  async listVoices(): Promise<SpeechVoicesResult> {
    try {
      const answer = await this.deps.fetchWithAuth(
        `${this.deps.getServerBaseUrl()}${SPEECH_VOICES_ROUTE}`,
        { method: 'GET', signal: AbortSignal.timeout(SPEECH_REQUEST_TIMEOUT_MS) },
      );
      if (!answer.ok) {
        const { error, unavailable } = describeSpeechFailure(answer.status);
        return { ok: false, voices: [], error, ...(unavailable ? { unavailable } : {}) };
      }
      return { ok: true, voices: readVoices(await answer.json()) };
    } catch (error) {
      console.error('[Speech] Could not list the voices:', error);
      return { ok: false, voices: [], error: 'The voice could not be reached.' };
    }
  }

  async speak(voiceId: string, text: string): Promise<SpeakResult> {
    if (!voiceId.trim() || !text.trim()) {
      return { ok: false, error: 'A voice and something to say are both needed.' };
    }
    try {
      const answer = await this.deps.fetchWithAuth(
        `${this.deps.getServerBaseUrl()}${SPEECH_TEXT_TO_SPEECH_ROUTE}/${encodeURIComponent(voiceId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
          signal: AbortSignal.timeout(SPEECH_REQUEST_TIMEOUT_MS),
        },
      );
      if (!answer.ok) {
        return { ok: false, ...describeSpeechFailure(answer.status) };
      }
      const audio = Buffer.from(await answer.arrayBuffer());
      return { ok: true, audioBase64: audio.toString('base64') };
    } catch (error) {
      console.error('[Speech] Could not speak:', error);
      return { ok: false, error: 'The voice could not be reached.' };
    }
  }
}
