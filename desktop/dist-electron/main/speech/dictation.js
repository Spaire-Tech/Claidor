"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Dictation = void 0;
exports.pcm16ToWav = pcm16ToWav;
const constants_1 = require("../../shared/speech/constants");
class Dictation {
    transcribe;
    id;
    chunks = [];
    bytes = 0;
    lastPartialAt = 0;
    partialRunning = false;
    stopped = false;
    sampleRate;
    maxBytes;
    windowBytes;
    partialIntervalMs;
    now;
    constructor(id, transcribe, options = {}) {
        this.transcribe = transcribe;
        this.id = id;
        this.sampleRate = options.sampleRate ?? constants_1.SPEECH_SAMPLE_RATE;
        this.maxBytes = (options.maxSeconds ?? constants_1.SPEECH_MAX_SECONDS) * this.sampleRate * 2;
        this.windowBytes = (options.partialWindowSeconds ?? constants_1.SPEECH_PARTIAL_WINDOW_SECONDS) * this.sampleRate * 2;
        this.partialIntervalMs = options.partialIntervalMs ?? constants_1.SPEECH_PARTIAL_INTERVAL_MS;
        this.now = options.now ?? (() => Date.now());
        this.lastPartialAt = this.now();
    }
    /** Seconds of audio held. */
    get seconds() {
        return this.bytes / (this.sampleRate * 2);
    }
    get full() {
        return this.bytes >= this.maxBytes;
    }
    /**
     * Take a chunk. Returns false once the cap is reached, so the caller can
     * stop the microphone rather than recording into the void.
     */
    push(chunk) {
        if (this.stopped || this.full)
            return false;
        const room = this.maxBytes - this.bytes;
        const taken = chunk.length > room ? chunk.subarray(0, room) : chunk;
        this.chunks.push(taken);
        this.bytes += taken.length;
        return !this.full;
    }
    /**
     * A partial pass over the tail, when one is due and none is running.
     * Resolves to the text, or null when nothing was attempted or the
     * dictation ended meanwhile.
     */
    async partial() {
        if (this.stopped || this.partialRunning)
            return null;
        if (this.now() - this.lastPartialAt < this.partialIntervalMs)
            return null;
        if (this.bytes < this.sampleRate * 2)
            return null; // under a second: nothing to say yet
        this.partialRunning = true;
        this.lastPartialAt = this.now();
        try {
            const text = await this.transcribe(this.tail());
            return this.stopped ? null : text.trim();
        }
        finally {
            this.partialRunning = false;
        }
    }
    /** The final pass over everything. Partials after this are dropped. */
    async stop() {
        this.stopped = true;
        if (this.bytes === 0)
            return '';
        const text = await this.transcribe(Buffer.concat(this.chunks));
        return text.trim();
    }
    cancel() {
        this.stopped = true;
        this.chunks.length = 0;
        this.bytes = 0;
    }
    tail() {
        const all = Buffer.concat(this.chunks);
        return all.length > this.windowBytes ? all.subarray(all.length - this.windowBytes) : all;
    }
}
exports.Dictation = Dictation;
/** A 44-byte RIFF header for PCM16 mono, so the recogniser gets a WAV. */
function pcm16ToWav(pcm16, sampleRate = constants_1.SPEECH_SAMPLE_RATE) {
    const header = Buffer.alloc(44);
    header.write('RIFF', 0, 'ascii');
    header.writeUInt32LE(36 + pcm16.length, 4);
    header.write('WAVE', 8, 'ascii');
    header.write('fmt ', 12, 'ascii');
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20); // PCM
    header.writeUInt16LE(1, 22); // mono
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(sampleRate * 2, 28);
    header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34);
    header.write('data', 36, 'ascii');
    header.writeUInt32LE(pcm16.length, 40);
    return Buffer.concat([header, pcm16]);
}
//# sourceMappingURL=dictation.js.map