"use strict";
/**
 * Speech recognition on this computer.
 *
 * The app inherited a voice input that asked our server for a recognition
 * session; the server never had one (it was NetEase's), so the microphone
 * did nothing. This replaces it with whisper.cpp running on the machine:
 * no server, no quota, nothing leaves the computer. The renderer records
 * 16 kHz mono PCM and streams it to the main process; the main process
 * keeps a `whisper-server` warm on a loopback port and asks it for text.
 *
 * "Text arrives as texts and only speech streams" (`direction.md` §5): the
 * person sees what they said appear in the composer while they speak,
 * and the final words land there when they stop. Sending is theirs.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SpeechEventKind = exports.SpeechReadiness = exports.WHISPER_CPP_VERSION = exports.SPEECH_MODEL = exports.SPEECH_PARTIAL_INTERVAL_MS = exports.SPEECH_PARTIAL_WINDOW_SECONDS = exports.SPEECH_MAX_SECONDS = exports.SPEECH_SAMPLE_RATE = exports.SpeechIpc = void 0;
exports.SpeechIpc = {
    /** renderer → main: begin a dictation; replies with the session id. */
    Start: 'speech:start',
    /** renderer → main: a chunk of PCM16 16 kHz mono, as bytes. */
    Chunk: 'speech:chunk',
    /** renderer → main: the person stopped; replies with the final text. */
    Stop: 'speech:stop',
    /** renderer → main: throw the recording away. */
    Cancel: 'speech:cancel',
    /** renderer → main: is the recogniser ready, downloading, or missing? */
    Status: 'speech:status',
    /** main → renderer: readiness changes, download progress, partial text. */
    Event: 'speech:event',
};
exports.SPEECH_SAMPLE_RATE = 16_000;
/** The longest a single dictation may run. Whisper is not a meeting recorder. */
exports.SPEECH_MAX_SECONDS = 120;
/**
 * How much recent audio a partial result is taken from. Whisper is not a
 * streaming model; a partial is a fresh pass over the tail, so the tail is
 * kept short enough to come back in well under a second.
 */
exports.SPEECH_PARTIAL_WINDOW_SECONDS = 20;
/** How often a partial is attempted while recording. */
exports.SPEECH_PARTIAL_INTERVAL_MS = 1_500;
/**
 * The model. `base` is multilingual (the founder speaks French and
 * English), 148 MB, and fast enough on an Apple chip to keep up with
 * speech. It is fetched once, on first use, from the whisper.cpp release
 * files on Hugging Face, and kept under the app's data directory.
 */
exports.SPEECH_MODEL = {
    name: 'ggml-base.bin',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin',
    /** Bytes, for the progress bar; the download's own Content-Length wins when present. */
    approximateBytes: 147_951_465,
    /** SHA-1 as published in whisper.cpp's models/download-ggml-model.sh. */
    sha1: '465707469ff3a37a2b9b8d8f89f2f99de7299dac',
};
/** The pinned whisper.cpp release the binary is built from. */
exports.WHISPER_CPP_VERSION = 'v1.8.3';
exports.SpeechReadiness = {
    /** No binary for this platform: the build did not ship one. */
    Unavailable: 'unavailable',
    /** Binary present, model not yet on disk. */
    NeedsModel: 'needs-model',
    /** Fetching the model. */
    Downloading: 'downloading',
    /** Starting the recogniser. */
    Starting: 'starting',
    Ready: 'ready',
    Error: 'error',
};
exports.SpeechEventKind = {
    Status: 'status',
    /** Text so far, for the composer to mirror. */
    Partial: 'partial',
    /** The recording ended; `text` is what was said. */
    Final: 'final',
    Error: 'error',
};
//# sourceMappingURL=constants.js.map