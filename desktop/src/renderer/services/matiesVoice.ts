/**
 * Maty's real voice, played in the app.
 *
 * The app asks Claidor to speak and gets back MPEG audio; Claidor holds
 * the ElevenLabs key and the app holds none (`docs/maties/plan.md`, step
 * 1). Everything here is about turning that answer into a sound and
 * stopping it again.
 *
 * The computer's own synthesiser stays as the fallback rather than being
 * deleted. The voice can be absent for ordinary reasons — no key on the
 * server yet, no network, an exhausted allowance — and a play button that
 * goes quiet on those days is a worse screen than one that still says the
 * sentence in a plainer voice.
 */

import type { AssistantVoice } from '../../shared/onboarding/constants';
import type { SpeechVoice } from '../../shared/speech/constants';
import {
  assignVoicesToStyles,
  type VoiceAssignment,
  voiceForStyle,
} from './speechVoiceAssignment';

let currentAudio: HTMLAudioElement | null = null;
let currentObjectUrl: string | null = null;

/** The voices the account has, fetched once per app run. */
let cachedAssignment: VoiceAssignment | null = null;
let pendingAssignment: Promise<VoiceAssignment> | null = null;

const speechBridge = () =>
  (typeof window === 'undefined' ? undefined : window.electron?.speech);

const base64ToBlob = (base64: string): Blob => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: 'audio/mpeg' });
};

/** Stops whatever Maty was saying, and releases the audio behind it. */
export const stopMatiesVoice = (): void => {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  if (currentObjectUrl) {
    // Without this every sample leaks a blob for the life of the window.
    URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = null;
  }
};

export const listMatiesVoices = async (): Promise<SpeechVoice[]> => {
  const bridge = speechBridge();
  if (!bridge) return [];
  const result = await bridge.listVoices();
  return result.ok ? result.voices : [];
};

/** The style-to-voice assignment, fetched once and remembered. */
export const resolveVoiceAssignment = async (): Promise<VoiceAssignment> => {
  if (cachedAssignment) return cachedAssignment;
  if (!pendingAssignment) {
    pendingAssignment = listMatiesVoices()
      .then(voices => {
        cachedAssignment = assignVoicesToStyles(voices);
        return cachedAssignment;
      })
      .finally(() => {
        pendingAssignment = null;
      });
  }
  return pendingAssignment;
};

/**
 * Says the sentence in Maty's own voice for that style. False means it
 * could not — no bridge, no voice for the account, or the server refused
 * — and the caller should fall back rather than leave the button silent.
 */
export const speakAsMaty = async (
  style: AssistantVoice,
  sentence: string,
): Promise<boolean> => {
  const bridge = speechBridge();
  if (!bridge || !sentence.trim()) return false;
  const voiceId = voiceForStyle(await resolveVoiceAssignment(), style);
  if (!voiceId) return false;

  const result = await bridge.speak(voiceId, sentence);
  if (!result.ok || !result.audioBase64) return false;

  stopMatiesVoice();
  try {
    const url = URL.createObjectURL(base64ToBlob(result.audioBase64));
    const audio = new Audio(url);
    currentAudio = audio;
    currentObjectUrl = url;
    audio.addEventListener('ended', stopMatiesVoice, { once: true });
    await audio.play();
    return true;
  } catch (error) {
    console.warn('[Voice] the audio would not play:', error);
    stopMatiesVoice();
    return false;
  }
};

/** For tests: forget the account's voices so the next call fetches again. */
export const forgetVoiceAssignment = (): void => {
  cachedAssignment = null;
  pendingAssignment = null;
};
