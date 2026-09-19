"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhisperServer = exports.WHISPER_MODEL_ENV = exports.WHISPER_BINARY_ENV = void 0;
exports.whisperBinaryCandidates = whisperBinaryCandidates;
exports.whisperModelPath = whisperModelPath;
exports.parseInference = parseInference;
const child_process_1 = require("child_process");
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const net_1 = __importDefault(require("net"));
const path_1 = __importDefault(require("path"));
const constants_1 = require("../../shared/speech/constants");
const dictation_1 = require("./dictation");
exports.WHISPER_BINARY_ENV = 'CAISRA_WHISPER_SERVER';
exports.WHISPER_MODEL_ENV = 'CAISRA_WHISPER_MODEL';
/** Where the binary is looked for, in order. Exported for the test. */
function whisperBinaryCandidates(deps) {
    const platform = deps.platform ?? process.platform;
    const arch = deps.arch ?? process.arch;
    const exe = platform === 'win32' ? 'whisper-server.exe' : 'whisper-server';
    const fromEnv = deps.env?.[exports.WHISPER_BINARY_ENV]?.trim();
    return [
        ...(fromEnv ? [fromEnv] : []),
        path_1.default.join(deps.resourcesDir, 'whisper', `${platform}-${arch}`, exe),
        path_1.default.join(deps.resourcesDir, 'whisper', platform, exe),
    ];
}
function whisperModelPath(deps) {
    const fromEnv = deps.env?.[exports.WHISPER_MODEL_ENV]?.trim();
    return fromEnv || path_1.default.join(deps.userDataDir, 'speech', 'models', constants_1.SPEECH_MODEL.name);
}
/** Parse what `/inference` returns. Exported for the test. */
function parseInference(body) {
    const parsed = JSON.parse(body);
    if (typeof parsed.error === 'string' && parsed.error)
        throw new Error(parsed.error);
    if (typeof parsed.text !== 'string')
        throw new Error('The recogniser answered without text.');
    return parsed.text.replace(/\s+/g, ' ').trim();
}
class WhisperServer {
    deps;
    child = null;
    port = 0;
    starting = null;
    status = { readiness: constants_1.SpeechReadiness.NeedsModel };
    fetchImpl;
    constructor(deps) {
        this.deps = deps;
        this.fetchImpl = deps.fetchImpl ?? fetch;
        this.status = this.binaryPath()
            ? (fs_1.default.existsSync(this.modelPath()) ? { readiness: constants_1.SpeechReadiness.Starting } : { readiness: constants_1.SpeechReadiness.NeedsModel })
            : { readiness: constants_1.SpeechReadiness.Unavailable, message: 'This build has no speech recogniser for this computer.' };
        if (this.status.readiness === constants_1.SpeechReadiness.Starting)
            this.status = { readiness: constants_1.SpeechReadiness.NeedsModel };
    }
    getStatus() {
        return this.child && this.status.readiness === constants_1.SpeechReadiness.Ready ? this.status : this.status;
    }
    binaryPath() {
        return whisperBinaryCandidates(this.deps).find(candidate => fs_1.default.existsSync(candidate)) ?? null;
    }
    modelPath() {
        return whisperModelPath(this.deps);
    }
    /** Bring the recogniser up: fetch the model if needed, then start. Idempotent. */
    async ensureReady() {
        if (this.child && this.status.readiness === constants_1.SpeechReadiness.Ready)
            return;
        if (this.starting)
            return this.starting;
        this.starting = this.bringUp().finally(() => { this.starting = null; });
        return this.starting;
    }
    async transcribe(pcm16, language = 'auto') {
        await this.ensureReady();
        const form = new FormData();
        const wav = (0, dictation_1.pcm16ToWav)(pcm16);
        // A Buffer may sit on a SharedArrayBuffer; Blob wants a plain one.
        const bytes = wav.buffer.slice(wav.byteOffset, wav.byteOffset + wav.byteLength);
        form.append('file', new Blob([bytes], { type: 'audio/wav' }), 'audio.wav');
        form.append('response_format', 'json');
        form.append('language', language);
        form.append('temperature', '0');
        const response = await this.fetchImpl(`http://127.0.0.1:${this.port}/inference`, { method: 'POST', body: form });
        const body = await response.text();
        if (!response.ok)
            throw new Error(`The recogniser refused (${response.status}): ${body.slice(0, 200)}`);
        return parseInference(body);
    }
    async dispose() {
        const child = this.child;
        this.child = null;
        if (!child)
            return;
        child.kill();
        await new Promise(resolve => {
            const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 2_000);
            child.once('exit', () => { clearTimeout(timer); resolve(); });
        });
    }
    setStatus(status) {
        this.status = status;
        this.deps.onStatus?.(status);
    }
    async bringUp() {
        const binary = this.binaryPath();
        if (!binary) {
            this.setStatus({ readiness: constants_1.SpeechReadiness.Unavailable, message: 'This build has no speech recogniser for this computer.' });
            throw new Error('whisper-server is not in this build.');
        }
        const model = this.modelPath();
        if (!fs_1.default.existsSync(model)) {
            await this.downloadModel(model);
        }
        this.setStatus({ readiness: constants_1.SpeechReadiness.Starting });
        try {
            await this.spawnServer(binary, model);
            this.setStatus({ readiness: constants_1.SpeechReadiness.Ready });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.setStatus({ readiness: constants_1.SpeechReadiness.Error, message: `The speech recogniser did not start: ${message}` });
            throw error;
        }
    }
    async downloadModel(model) {
        fs_1.default.mkdirSync(path_1.default.dirname(model), { recursive: true });
        const partial = `${model}.part`;
        this.setStatus({ readiness: constants_1.SpeechReadiness.Downloading, progress: 0 });
        let response;
        try {
            response = await this.fetchImpl(constants_1.SPEECH_MODEL.url);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.setStatus({ readiness: constants_1.SpeechReadiness.Error, message: `Could not fetch the voice model: ${message}` });
            throw error;
        }
        if (!response.ok || !response.body) {
            this.setStatus({ readiness: constants_1.SpeechReadiness.Error, message: `Could not fetch the voice model (${response.status}).` });
            throw new Error(`model download failed: ${response.status}`);
        }
        const total = Number(response.headers.get('content-length')) || constants_1.SPEECH_MODEL.approximateBytes;
        const hash = crypto_1.default.createHash('sha1');
        const out = fs_1.default.createWriteStream(partial);
        let received = 0;
        let lastReported = -1;
        const reader = response.body.getReader();
        try {
            for (;;) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                if (!value)
                    continue;
                hash.update(value);
                received += value.length;
                await new Promise((resolve, reject) => {
                    out.write(value, error => (error ? reject(error) : resolve()));
                });
                const progress = Math.min(0.999, received / total);
                // A status per percent, not per packet.
                if (Math.floor(progress * 100) !== lastReported) {
                    lastReported = Math.floor(progress * 100);
                    this.setStatus({ readiness: constants_1.SpeechReadiness.Downloading, progress });
                }
            }
        }
        finally {
            await new Promise(resolve => { out.end(resolve); });
        }
        const digest = hash.digest('hex');
        if (digest !== constants_1.SPEECH_MODEL.sha1) {
            fs_1.default.rmSync(partial, { force: true });
            this.setStatus({ readiness: constants_1.SpeechReadiness.Error, message: 'The voice model download did not match its checksum; try again.' });
            throw new Error(`model checksum mismatch: ${digest}`);
        }
        fs_1.default.renameSync(partial, model);
    }
    async spawnServer(binary, model) {
        this.port = await freePort();
        const child = (0, child_process_1.spawn)(binary, [
            '--model', model,
            '--host', '127.0.0.1',
            '--port', String(this.port),
            '--language', 'auto',
            '--threads', String(Math.max(2, Math.min(8, (require('os').cpus().length || 4) - 1))),
            '--no-timestamps',
        ], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
        this.child = child;
        child.stderr?.on('data', (data) => {
            const line = data.toString().trim();
            if (line)
                console.debug(`[Speech] whisper-server: ${line.slice(0, 200)}`);
        });
        child.once('exit', (code, signal) => {
            if (this.child === child) {
                this.child = null;
                this.setStatus({ readiness: constants_1.SpeechReadiness.Error, message: `The speech recogniser stopped (${signal ?? code}).` });
            }
        });
        // Up when it answers on the port. The model load is what we are waiting for.
        const deadline = Date.now() + 60_000;
        for (;;) {
            if (child.exitCode !== null)
                throw new Error(`whisper-server exited with ${child.exitCode}`);
            try {
                const response = await this.fetchImpl(`http://127.0.0.1:${this.port}/`, { method: 'GET' });
                if (response.status > 0)
                    return;
            }
            catch {
                // not yet
            }
            if (Date.now() > deadline)
                throw new Error('whisper-server did not answer within 60 s');
            await new Promise(resolve => { setTimeout(resolve, 200); });
        }
    }
}
exports.WhisperServer = WhisperServer;
function freePort() {
    return new Promise((resolve, reject) => {
        const server = net_1.default.createServer();
        server.unref();
        server.on('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            const port = typeof address === 'object' && address ? address.port : 0;
            server.close(() => resolve(port));
        });
    });
}
//# sourceMappingURL=whisperServer.js.map