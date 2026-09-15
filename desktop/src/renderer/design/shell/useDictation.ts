import { useCallback, useEffect, useRef, useState } from 'react';

import {
  SPEECH_PARTIAL_INTERVAL_MS,
  type SpeechEvent,
  SpeechEventKind,
  SpeechReadiness,
  type SpeechStatus,
} from '../../../shared/speech/constants';
import { startRealtimeVoiceRecording } from '../../services/voiceInput/realtimeAudioRecorder';

/**
 * The microphone in the composer.
 *
 * Press once: recording starts and the words appear as they are
 * recognised. Press again: the final text lands and stays in the draft
 * for the person to read, fix and send. Nothing is sent on their behalf.
 *
 * The recogniser runs on this computer. The first press on a fresh
 * install fetches the model, and the composer says so, with a percent,
 * in place of "Listening". `state.note` is that sentence; the composer
 * shows it as the placeholder while the draft is empty.
 */
export interface DictationState {
  listening: boolean;
  /** What has been recognised so far, or the final text once stopped. */
  text: string;
  /** One line for the composer: "Listening", "Downloading the voice model… 42%", or what went wrong. */
  note?: string;
  /** The final text landed; bumps so the composer can seed the draft once per dictation. */
  finalAt: number;
}

export interface DictationHandle extends DictationState {
  toggle: () => void;
}

const noteFor = (status: SpeechStatus, listening: boolean): string | undefined => {
  switch (status.readiness) {
    case SpeechReadiness.Unavailable:
      return status.message ?? 'This build has no speech recogniser for this computer.';
    case SpeechReadiness.Downloading:
      return `Downloading the voice model, once… ${Math.round((status.progress ?? 0) * 100)}%`;
    case SpeechReadiness.Starting:
      return 'Starting the recogniser…';
    case SpeechReadiness.Error:
      return status.message ?? 'The speech recogniser is not working.';
    default:
      return listening ? 'Listening…' : undefined;
  }
};

export function useDictation(): DictationHandle {
  const [state, setState] = useState<DictationState>({ listening: false, text: '', finalAt: 0 });
  const session = useRef<{ id: string; stop: () => Promise<void>; cancel: () => void } | null>(null);
  const status = useRef<SpeechStatus>({ readiness: SpeechReadiness.Ready });

  useEffect(() => {
    const speech = window.electron?.speech;
    if (!speech) return undefined;
    void speech.status().then(initial => { status.current = initial; }).catch(() => undefined);
    return speech.onEvent((event: SpeechEvent) => {
      if (event.kind === SpeechEventKind.Status) {
        status.current = event.status;
        setState(prev => ({ ...prev, note: noteFor(event.status, prev.listening) }));
      } else if (event.kind === SpeechEventKind.Partial) {
        if (session.current?.id === event.sessionId) {
          setState(prev => ({ ...prev, text: event.text }));
        }
      } else if (event.kind === SpeechEventKind.Error) {
        setState(prev => ({ ...prev, listening: false, note: event.message }));
        session.current?.cancel();
        session.current = null;
      }
    });
  }, []);

  const stop = useCallback(async () => {
    const current = session.current;
    if (!current) return;
    session.current = null;
    setState(prev => ({ ...prev, listening: false, note: 'Finishing…' }));
    try {
      await current.stop();
    } catch (error) {
      // Too short to hold any words: the draft stays as it was.
      setState(prev => ({ ...prev, note: error instanceof Error ? error.message : String(error) }));
      await window.electron?.speech?.cancel(current.id);
      return;
    }
    try {
      const result = await window.electron?.speech?.stop(current.id);
      const text = result?.text ?? '';
      setState({ listening: false, text, finalAt: Date.now() });
    } catch (error) {
      setState(prev => ({ ...prev, listening: false, note: error instanceof Error ? error.message : String(error) }));
    }
  }, []);

  const start = useCallback(async () => {
    const speech = window.electron?.speech;
    if (!speech) {
      setState(prev => ({ ...prev, note: 'Speech needs the desktop app.' }));
      return;
    }
    if (status.current.readiness === SpeechReadiness.Unavailable) {
      setState(prev => ({ ...prev, note: noteFor(status.current, false) }));
      return;
    }
    const { sessionId } = await speech.start();
    setState({ listening: true, text: '', note: noteFor(status.current, true), finalAt: 0 });
    try {
      const recording = await startRealtimeVoiceRecording({
        chunkIntervalMillis: Math.min(1_000, SPEECH_PARTIAL_INTERVAL_MS),
        onPcmChunk: chunk => speech.chunk(sessionId, chunk),
      });
      session.current = { id: sessionId, stop: recording.stop, cancel: recording.cancel };
    } catch (error) {
      await speech.cancel(sessionId);
      setState({ listening: false, text: '', note: error instanceof Error ? error.message : String(error), finalAt: 0 });
    }
  }, []);

  const toggle = useCallback(() => {
    if (session.current) void stop();
    else void start();
  }, [start, stop]);

  return { ...state, toggle };
}
