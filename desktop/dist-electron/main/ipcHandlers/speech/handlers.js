"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerSpeechIpcHandlers = registerSpeechIpcHandlers;
const electron_1 = require("electron");
const constants_1 = require("../../../shared/speech/constants");
const dictation_1 = require("../../speech/dictation");
/**
 * The bridge between the composer's microphone and the recogniser.
 *
 * One dictation at a time. Chunks arrive as bytes; every so often a
 * partial pass runs and its text goes back to the window that is
 * recording; stop runs the final pass and answers with the text.
 */
function registerSpeechIpcHandlers(getServer) {
    let current = null;
    const send = (sender, event) => {
        if (!sender.isDestroyed())
            sender.send(constants_1.SpeechIpc.Event, event);
    };
    const endCurrent = () => {
        if (!current)
            return;
        clearInterval(current.partialTimer);
        current = null;
    };
    electron_1.ipcMain.handle(constants_1.SpeechIpc.Status, async () => getServer().getStatus());
    electron_1.ipcMain.handle(constants_1.SpeechIpc.Start, async (event) => {
        const server = getServer();
        const sender = event.sender;
        if (current) {
            current.dictation.cancel();
            endCurrent();
        }
        const sessionId = `dictation-${Date.now().toString(36)}`;
        const dictation = new dictation_1.Dictation(sessionId, pcm => server.transcribe(pcm));
        const partialTimer = setInterval(() => {
            void dictation.partial().then(text => {
                if (text !== null && current?.dictation === dictation) {
                    send(sender, { kind: constants_1.SpeechEventKind.Partial, sessionId, text });
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
            send(sender, { kind: constants_1.SpeechEventKind.Error, sessionId, message });
        });
        console.log(`[Speech] dictation ${sessionId} started`);
        return { sessionId };
    });
    electron_1.ipcMain.on(constants_1.SpeechIpc.Chunk, (_event, sessionId, chunk) => {
        if (!current || current.dictation.id !== sessionId)
            return;
        const buffer = Buffer.from(chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk));
        if (!current.dictation.push(buffer)) {
            console.log(`[Speech] dictation ${sessionId} reached its cap`);
        }
    });
    electron_1.ipcMain.handle(constants_1.SpeechIpc.Stop, async (event, sessionId) => {
        if (!current || current.dictation.id !== sessionId)
            return { text: '' };
        const { dictation } = current;
        endCurrent();
        try {
            const text = await dictation.stop();
            send(event.sender, { kind: constants_1.SpeechEventKind.Final, sessionId, text });
            console.log(`[Speech] dictation ${sessionId} finished: ${dictation.seconds.toFixed(1)}s, ${text.length} chars`);
            return { text };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            send(event.sender, { kind: constants_1.SpeechEventKind.Error, sessionId, message });
            throw error;
        }
    });
    electron_1.ipcMain.handle(constants_1.SpeechIpc.Cancel, async (_event, sessionId) => {
        if (!current || current.dictation.id !== sessionId)
            return;
        current.dictation.cancel();
        endCurrent();
    });
}
//# sourceMappingURL=handlers.js.map