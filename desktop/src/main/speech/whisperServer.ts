import { type ChildProcess, spawn } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import net from 'net';
import path from 'path';

import {
  SPEECH_MODEL,
  SpeechReadiness as Readiness,
  type SpeechReadiness,
  type SpeechStatus,
} from '../../shared/speech/constants';
import { pcm16ToWav } from './dictation';

/**
 * The recogniser: whisper.cpp's `whisper-server`, kept warm on a loopback
 * port, asked for text over HTTP.
 *
 * Why a server and not the CLI: the model takes a second or two to load,
 * and a partial every 1.5 s cannot pay that each time. The server loads
 * once and answers `/inference` in a fraction of a second for a
 * twenty-second clip on an Apple chip.
 *
 * The binary is built by `scripts/build-whisper.sh` from the pinned
 * release and shipped under `resources/whisper/<platform>-<arch>/`. The
 * model is not shipped — 148 MB in every installer for a feature some
 * people never touch — but fetched on first use and kept in the app's
 * data directory. Both are found, never guessed: when either is missing
 * the status says which, in one sentence a person can act on.
 */

export type WhisperServerDeps = {
  /** Where packaged resources live (`process.resourcesPath` when packaged). */
  resourcesDir: string;
  /** The app's data directory; the model goes under `speech/models`. */
  userDataDir: string;
  platform?: NodeJS.Platform;
  arch?: string;
  /** Overrides for development: a binary and a model already on this machine. */
  env?: NodeJS.ProcessEnv;
  onStatus?: (status: SpeechStatus) => void;
  fetchImpl?: typeof fetch;
};

export const WHISPER_BINARY_ENV = 'CAISRA_WHISPER_SERVER';
export const WHISPER_MODEL_ENV = 'CAISRA_WHISPER_MODEL';

/** Where the binary is looked for, in order. Exported for the test. */
export function whisperBinaryCandidates(deps: Pick<WhisperServerDeps, 'resourcesDir' | 'platform' | 'arch' | 'env'>): string[] {
  const platform = deps.platform ?? process.platform;
  const arch = deps.arch ?? process.arch;
  const exe = platform === 'win32' ? 'whisper-server.exe' : 'whisper-server';
  const fromEnv = deps.env?.[WHISPER_BINARY_ENV]?.trim();
  return [
    ...(fromEnv ? [fromEnv] : []),
    path.join(deps.resourcesDir, 'whisper', `${platform}-${arch}`, exe),
    path.join(deps.resourcesDir, 'whisper', platform, exe),
  ];
}

export function whisperModelPath(deps: Pick<WhisperServerDeps, 'userDataDir' | 'env'>): string {
  const fromEnv = deps.env?.[WHISPER_MODEL_ENV]?.trim();
  return fromEnv || path.join(deps.userDataDir, 'speech', 'models', SPEECH_MODEL.name);
}

/** Parse what `/inference` returns. Exported for the test. */
export function parseInference(body: string): string {
  const parsed = JSON.parse(body) as { text?: unknown; error?: unknown };
  if (typeof parsed.error === 'string' && parsed.error) throw new Error(parsed.error);
  if (typeof parsed.text !== 'string') throw new Error('The recogniser answered without text.');
  return parsed.text.replace(/\s+/g, ' ').trim();
}

export class WhisperServer {
  private child: ChildProcess | null = null;
  private port = 0;
  private starting: Promise<void> | null = null;
  private status: SpeechStatus = { readiness: Readiness.NeedsModel };
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly deps: WhisperServerDeps) {
    this.fetchImpl = deps.fetchImpl ?? fetch;
    this.status = this.binaryPath()
      ? (fs.existsSync(this.modelPath()) ? { readiness: Readiness.Starting } : { readiness: Readiness.NeedsModel })
      : { readiness: Readiness.Unavailable, message: 'This build has no speech recogniser for this computer.' };
    if (this.status.readiness === Readiness.Starting) this.status = { readiness: Readiness.NeedsModel };
  }

  getStatus(): SpeechStatus {
    return this.child && this.status.readiness === Readiness.Ready ? this.status : this.status;
  }

  binaryPath(): string | null {
    return whisperBinaryCandidates(this.deps).find(candidate => fs.existsSync(candidate)) ?? null;
  }

  modelPath(): string {
    return whisperModelPath(this.deps);
  }

  /** Bring the recogniser up: fetch the model if needed, then start. Idempotent. */
  async ensureReady(): Promise<void> {
    if (this.child && this.status.readiness === Readiness.Ready) return;
    if (this.starting) return this.starting;
    this.starting = this.bringUp().finally(() => { this.starting = null; });
    return this.starting;
  }

  async transcribe(pcm16: Buffer, language = 'auto'): Promise<string> {
    await this.ensureReady();
    const form = new FormData();
    const wav = pcm16ToWav(pcm16);
    // A Buffer may sit on a SharedArrayBuffer; Blob wants a plain one.
    const bytes = wav.buffer.slice(wav.byteOffset, wav.byteOffset + wav.byteLength) as ArrayBuffer;
    form.append('file', new Blob([bytes], { type: 'audio/wav' }), 'audio.wav');
    form.append('response_format', 'json');
    form.append('language', language);
    form.append('temperature', '0');
    const response = await this.fetchImpl(`http://127.0.0.1:${this.port}/inference`, { method: 'POST', body: form });
    const body = await response.text();
    if (!response.ok) throw new Error(`The recogniser refused (${response.status}): ${body.slice(0, 200)}`);
    return parseInference(body);
  }

  async dispose(): Promise<void> {
    const child = this.child;
    this.child = null;
    if (!child) return;
    child.kill();
    await new Promise<void>(resolve => {
      const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 2_000);
      child.once('exit', () => { clearTimeout(timer); resolve(); });
    });
  }

  private setStatus(status: SpeechStatus): void {
    this.status = status;
    this.deps.onStatus?.(status);
  }

  private async bringUp(): Promise<void> {
    const binary = this.binaryPath();
    if (!binary) {
      this.setStatus({ readiness: Readiness.Unavailable, message: 'This build has no speech recogniser for this computer.' });
      throw new Error('whisper-server is not in this build.');
    }
    const model = this.modelPath();
    if (!fs.existsSync(model)) {
      await this.downloadModel(model);
    }
    this.setStatus({ readiness: Readiness.Starting });
    try {
      await this.spawnServer(binary, model);
      this.setStatus({ readiness: Readiness.Ready });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.setStatus({ readiness: Readiness.Error, message: `The speech recogniser did not start: ${message}` });
      throw error;
    }
  }

  private async downloadModel(model: string): Promise<void> {
    fs.mkdirSync(path.dirname(model), { recursive: true });
    const partial = `${model}.part`;
    this.setStatus({ readiness: Readiness.Downloading, progress: 0 });
    let response: Response;
    try {
      response = await this.fetchImpl(SPEECH_MODEL.url);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.setStatus({ readiness: Readiness.Error, message: `Could not fetch the voice model: ${message}` });
      throw error;
    }
    if (!response.ok || !response.body) {
      this.setStatus({ readiness: Readiness.Error, message: `Could not fetch the voice model (${response.status}).` });
      throw new Error(`model download failed: ${response.status}`);
    }
    const total = Number(response.headers.get('content-length')) || SPEECH_MODEL.approximateBytes;
    const hash = crypto.createHash('sha1');
    const out = fs.createWriteStream(partial);
    let received = 0;
    let lastReported = -1;
    const reader = response.body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        hash.update(value);
        received += value.length;
        await new Promise<void>((resolve, reject) => {
          out.write(value, error => (error ? reject(error) : resolve()));
        });
        const progress = Math.min(0.999, received / total);
        // A status per percent, not per packet.
        if (Math.floor(progress * 100) !== lastReported) {
          lastReported = Math.floor(progress * 100);
          this.setStatus({ readiness: Readiness.Downloading, progress });
        }
      }
    } finally {
      await new Promise<void>(resolve => { out.end(resolve); });
    }
    const digest = hash.digest('hex');
    if (digest !== SPEECH_MODEL.sha1) {
      fs.rmSync(partial, { force: true });
      this.setStatus({ readiness: Readiness.Error, message: 'The voice model download did not match its checksum; try again.' });
      throw new Error(`model checksum mismatch: ${digest}`);
    }
    fs.renameSync(partial, model);
  }

  private async spawnServer(binary: string, model: string): Promise<void> {
    this.port = await freePort();
    const child = spawn(binary, [
      '--model', model,
      '--host', '127.0.0.1',
      '--port', String(this.port),
      '--language', 'auto',
      '--threads', String(Math.max(2, Math.min(8, (require('os').cpus().length || 4) - 1))),
      '--no-timestamps',
    ], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    this.child = child;
    child.stderr?.on('data', (data: Buffer) => {
      const line = data.toString().trim();
      if (line) console.debug(`[Speech] whisper-server: ${line.slice(0, 200)}`);
    });
    child.once('exit', (code, signal) => {
      if (this.child === child) {
        this.child = null;
        this.setStatus({ readiness: Readiness.Error, message: `The speech recogniser stopped (${signal ?? code}).` });
      }
    });
    // Up when it answers on the port. The model load is what we are waiting for.
    const deadline = Date.now() + 60_000;
    for (;;) {
      if (child.exitCode !== null) throw new Error(`whisper-server exited with ${child.exitCode}`);
      try {
        const response = await this.fetchImpl(`http://127.0.0.1:${this.port}/`, { method: 'GET' });
        if (response.status > 0) return;
      } catch {
        // not yet
      }
      if (Date.now() > deadline) throw new Error('whisper-server did not answer within 60 s');
      await new Promise(resolve => { setTimeout(resolve, 200); });
    }
  }
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

export type { SpeechReadiness };
