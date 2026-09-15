import { ipcMain, type WebContents } from 'electron';

import {
  type SpeechEvent,
  SpeechEventKind,
  SpeechIpc,
  type SpeechStartResult,
  type SpeechStatus,
  type SpeechStopResult,
} from '../../../shared/speech/constants';
import { Dictation } from '../../speech/dictation';
import type { WhisperServer } from '../../speech/whisperServer';

/**
 * The bridge between the composer's microphone and the recogniser.
 *
 * One dictation at a time. Chunks arrive as bytes; every so often a
 * partial pass runs and its text goes back to the window that is
 * recording; stop runs the final pass and answers with the text.
 */
export function registerSpeechIpcHandlers(getServer: () => WhisperServer): void {
  let current: { dictation: Dictation; sender: WebContents; partialTimer: NodeJS.Timeout } | null = null;

  const send = (sender: WebContents, event: SpeechEvent): void => {
    if (!sender.isDestroyed()) sender.send(SpeechIpc.Event, event);
  };

  const endCurrent = (): void => {
    if (!current) return;
    clearInterval(current.partialTimer);
    current = null;
  };

  ipcMain.handle(SpeechIpc.Status, async (): Promise<SpeechStatus> => getServer().getStatus());

  ipcMain.handle(SpeechIpc.Start, async (event): Promise<SpeechStartResult> => {
    const server = getServer();
    const sender = event.sender;
    if (current) {
      current.dictation.cancel();
      endCurrent();
    }
    const sessionId = `dictation-${Date.now().toString(36)}`;
    const dictation = new Dictation(sessionId, pcm => server.transcribe(pcm));
    const partialTimer = setInterval(() => {
      void dictation.partial().then(text => {
        if (text !== null && current?.dictation === dictation) {
          send(sender, { kind: SpeechEventKind.Partial, sessionId, text });
        }
      }).catch(error => {
        const message = error instanceof Error ? error.message : String(error);
        console.warn('[Speech] partial failed:', message);
      });
    }, 300);
    current = { dictation, sender, partialTimer };
    // Bring the model up while the first words are being spoken; the
    // status events tell the composer what is happening meanwhile.
    server.ensureReady().catch(error => {
      const message = error instanceof Error ? error.message : String(error);
      send(sender, { kind: SpeechEventKind.Error, sessionId, message });
    });
    console.log(`[Speech] dictation ${sessionId} started`);
    return { sessionId };
  });

  ipcMain.on(SpeechIpc.Chunk, (_event, sessionId: string, chunk: ArrayBuffer | Uint8Array) => {
    if (!current || current.dictation.id !== sessionId) return;
    const buffer = Buffer.from(chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk));
    if (!current.dictation.push(buffer)) {
      console.log(`[Speech] dictation ${sessionId} reached its cap`);
    }
  });

  ipcMain.handle(SpeechIpc.Stop, async (event, sessionId: string): Promise<SpeechStopResult> => {
    if (!current || current.dictation.id !== sessionId) return { text: '' };
    const { dictation } = current;
    endCurrent();
    try {
      const text = await dictation.stop();
      send(event.sender, { kind: SpeechEventKind.Final, sessionId, text });
      console.log(`[Speech] dictation ${sessionId} finished: ${dictation.seconds.toFixed(1)}s, ${text.length} chars`);
      return { text };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      send(event.sender, { kind: SpeechEventKind.Error, sessionId, message });
      throw error;
    }
  });

  ipcMain.handle(SpeechIpc.Cancel, async (_event, sessionId: string): Promise<void> => {
    if (!current || current.dictation.id !== sessionId) return;
    current.dictation.cancel();
    endCurrent();
  });
}
