import crypto from 'crypto';
import { type UtilityProcess, utilityProcess } from 'electron';

import {
  LibraryContentLimits,
  type LibraryDocumentKind,
  type LibraryWorkerDocumentIndexedMessage,
  type LibraryWorkerInitMessage,
  LibraryWorkerMessageType,
  type LibraryWorkerReadyMessage,
  type LibraryWorkerRequest,
  type LibraryWorkerResponse,
} from '../../../shared/library/contentConstants';

/**
 * The main process side of the library document worker: forks the
 * utilityProcess, sends requests and matches replies by requestId.
 * Only the library indexer talks to it.
 */

const LOG_TAG = '[LibraryWorker]';
const SERVICE_NAME = 'Maties Library Worker';
const DEFAULT_QUERY_TIMEOUT_MS = 30_000;

export interface LibraryDocumentWorkerClientOptions {
  modelDir: string;
  /** Absolute path to the built worker script (dist-electron/documentWorker.js). */
  workerEntryPath: string;
  onExit?: (code: number | undefined) => void;
}

/** The error a request rejects with; `permanent` mirrors the worker's verdict. */
export class LibraryWorkerRequestError extends Error {
  permanent: boolean;

  constructor(message: string, permanent: boolean) {
    super(message);
    this.name = 'LibraryWorkerRequestError';
    this.permanent = permanent;
  }
}

interface PendingRequest {
  resolve: (response: LibraryWorkerResponse) => void;
  reject: (error: LibraryWorkerRequestError) => void;
  timer: NodeJS.Timeout | null;
}

const isWorkerResponse = (value: unknown): value is LibraryWorkerResponse => (
  typeof value === 'object' && value !== null && typeof (value as { type?: unknown }).type === 'string'
);

const pipeOutput = (stream: NodeJS.ReadableStream | null | undefined, log: (line: string) => void): void => {
  if (!stream) return;
  let rest = '';
  stream.setEncoding?.('utf8');
  stream.on('data', (chunk: string | Buffer) => {
    rest += chunk.toString();
    const lines = rest.split(/\r?\n/);
    rest = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      log(line.startsWith(LOG_TAG) ? line : `${LOG_TAG} ${line}`);
    }
  });
  stream.on('end', () => {
    if (rest.trim()) log(rest.startsWith(LOG_TAG) ? rest : `${LOG_TAG} ${rest}`);
  });
};

export class LibraryDocumentWorkerClient {
  private readonly options: LibraryDocumentWorkerClientOptions;
  private child: UtilityProcess | null = null;
  private readonly pending = new Map<string, PendingRequest>();
  private readyPromise: Promise<LibraryWorkerReadyMessage> | null = null;
  private isReady = false;

  constructor(options: LibraryDocumentWorkerClientOptions) {
    this.options = options;
  }

  /** True once the worker replied `ready` with ok and the process is still alive. */
  get ready(): boolean {
    return this.isReady && this.child !== null;
  }

  /**
   * Forks the worker, sends `init` and resolves with the ready message (ok
   * false means the model failed; the promise still resolves). Rejects only
   * when the process could not be forked or exited before replying.
   */
  start(): Promise<LibraryWorkerReadyMessage> {
    if (this.readyPromise) return this.readyPromise;
    this.readyPromise = new Promise<LibraryWorkerReadyMessage>((resolve, reject) => {
      let settled = false;
      let child: UtilityProcess;
      try {
        child = utilityProcess.fork(this.options.workerEntryPath, [], {
          serviceName: SERVICE_NAME,
          stdio: 'pipe',
          env: { ...process.env },
        });
      } catch (error) {
        this.readyPromise = null;
        reject(error instanceof Error ? error : new Error(String(error)));
        return;
      }
      this.child = child;
      pipeOutput(child.stdout, (line) => console.log(line));
      pipeOutput(child.stderr, (line) => console.error(line));

      child.on('spawn', () => {
        const init: LibraryWorkerInitMessage = {
          type: LibraryWorkerMessageType.Init,
          modelDir: this.options.modelDir,
        };
        this.send(init);
      });

      child.on('message', (message: unknown) => {
        if (!isWorkerResponse(message)) {
          console.warn(`${LOG_TAG} ignoring a reply that is not a worker message`);
          return;
        }
        if (message.type === LibraryWorkerMessageType.Ready) {
          this.isReady = message.ok;
          if (!settled) {
            settled = true;
            resolve(message);
          }
          return;
        }
        this.settle(message);
      });

      child.on('exit', (code) => {
        if (this.child === child) this.child = null;
        this.isReady = false;
        this.rejectAll(`worker exited (code ${code ?? 'unknown'})`);
        if (!settled) {
          settled = true;
          this.readyPromise = null;
          reject(new Error(`worker exited before it was ready (code ${code ?? 'unknown'})`));
        }
        this.options.onExit?.(code);
      });
    });
    return this.readyPromise;
  }

  /**
   * Reads, chunks and embeds one file. Rejects with the worker's error
   * message; the Error carries `permanent`. A timeout rejects as not permanent.
   */
  async indexDocument(
    filePath: string,
    kind: LibraryDocumentKind,
    timeoutMs: number = LibraryContentLimits.DocumentTimeoutMs,
  ): Promise<LibraryWorkerDocumentIndexedMessage> {
    const requestId = crypto.randomUUID();
    const response = await this.request({
      type: LibraryWorkerMessageType.IndexDocument,
      requestId,
      filePath,
      kind,
    }, requestId, timeoutMs);
    if (response.type !== LibraryWorkerMessageType.DocumentIndexed) {
      throw new LibraryWorkerRequestError(`unexpected reply ${response.type}`, false);
    }
    return response;
  }

  async embedQuery(text: string, timeoutMs: number = DEFAULT_QUERY_TIMEOUT_MS): Promise<Float32Array> {
    const requestId = crypto.randomUUID();
    const response = await this.request({
      type: LibraryWorkerMessageType.EmbedQuery,
      requestId,
      text,
    }, requestId, timeoutMs);
    if (response.type !== LibraryWorkerMessageType.QueryEmbedded) {
      throw new LibraryWorkerRequestError(`unexpected reply ${response.type}`, false);
    }
    return response.vector instanceof Float32Array ? response.vector : Float32Array.from(response.vector);
  }

  /** Kills the process; every pending request rejects with « worker stopped ». */
  stop(): void {
    const child = this.child;
    this.child = null;
    this.isReady = false;
    this.readyPromise = null;
    this.rejectAll('worker stopped');
    if (child) {
      try {
        child.kill();
      } catch (error) {
        console.warn(`${LOG_TAG} could not kill the worker`, error);
      }
    }
  }

  private request(
    message: LibraryWorkerRequest,
    requestId: string,
    timeoutMs: number,
  ): Promise<LibraryWorkerResponse> {
    return new Promise<LibraryWorkerResponse>((resolve, reject) => {
      if (!this.child) {
        reject(new LibraryWorkerRequestError('worker not running', false));
        return;
      }
      const timer = timeoutMs > 0
        ? setTimeout(() => {
          if (this.pending.delete(requestId)) {
            reject(new LibraryWorkerRequestError(`timed out after ${timeoutMs} ms`, false));
          }
        }, timeoutMs)
        : null;
      this.pending.set(requestId, { resolve, reject, timer });
      if (!this.send(message)) {
        this.pending.delete(requestId);
        if (timer) clearTimeout(timer);
        reject(new LibraryWorkerRequestError('worker not running', false));
      }
    });
  }

  private send(message: LibraryWorkerRequest): boolean {
    if (!this.child) return false;
    try {
      this.child.postMessage(message);
      return true;
    } catch (error) {
      console.error(`${LOG_TAG} could not send a request to the worker`, error);
      return false;
    }
  }

  private settle(message: Exclude<LibraryWorkerResponse, LibraryWorkerReadyMessage>): void {
    const entry = this.pending.get(message.requestId);
    if (!entry) {
      console.warn(`${LOG_TAG} reply for unknown request ${message.requestId || '(none)'}`);
      return;
    }
    this.pending.delete(message.requestId);
    if (entry.timer) clearTimeout(entry.timer);
    if (message.type === LibraryWorkerMessageType.Failed) {
      entry.reject(new LibraryWorkerRequestError(message.error, message.permanent === true));
      return;
    }
    entry.resolve(message);
  }

  private rejectAll(reason: string): void {
    const entries = Array.from(this.pending.values());
    this.pending.clear();
    for (const entry of entries) {
      if (entry.timer) clearTimeout(entry.timer);
      entry.reject(new LibraryWorkerRequestError(reason, false));
    }
  }
}
