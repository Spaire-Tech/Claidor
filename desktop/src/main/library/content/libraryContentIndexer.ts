import fs from 'fs';
import path from 'path';

import {
  getLibraryDocumentKind,
  LIBRARY_SKIPPED_DIRECTORY_NAMES,
  type LibraryContentConfig,
  LibraryContentLimits,
  LibraryContentPhase,
  type LibraryContentStatus,
  type LibraryDocumentKind,
  type LibrarySearchRequest,
  type LibrarySearchResponse,
  type LibraryWorkerDocumentIndexedMessage,
  type LibraryWorkerReadyMessage,
} from '../../../shared/library/contentConstants';
import {
  buildLibraryPathKey,
  type LibraryContentStore,
} from './libraryContentStore';

/**
 * Keeps the personal library's index in step with the folders the person
 * chose (docs/maties/library.md).
 *
 * Owns a document worker (a separate process that reads, chunks and embeds
 * files), walks the folders on start and every half hour, watches them for
 * changes in between, and feeds a bounded queue to the worker two files at a
 * time. The store owns the database; this class never writes SQL.
 *
 * Modelled on LibraryIndexService (the artifact library) so the two behave
 * the same way: debounced watchers, a resumable state (the store's pending
 * rows are the cursor), plain-words status for the settings screen.
 */

/** What the indexer needs from the worker; the real client is documentWorkerClient.ts. */
export interface LibraryWorkerLike {
  readonly ready: boolean;
  start(): Promise<LibraryWorkerReadyMessage>;
  indexDocument(
    filePath: string,
    kind: LibraryDocumentKind,
    timeoutMs?: number,
  ): Promise<LibraryWorkerDocumentIndexedMessage>;
  embedQuery(text: string, timeoutMs?: number): Promise<Float32Array>;
  stop(): void;
}

export interface LibraryContentIndexerOptions {
  store: LibraryContentStore;
  getConfig: () => LibraryContentConfig;
  createWorker: (onExit: (code: number | undefined) => void) => LibraryWorkerLike;
  onStatus: (status: LibraryContentStatus) => void;
  getMetadata: <T>(key: string) => T | undefined;
  setMetadata: <T>(key: string, value: T) => void;
  /** Folders never entered even when inside a chosen folder (the app's own data). */
  excludedRoots?: string[];
  /** Test hook: how long to wait before a periodic rescan. */
  rescanIntervalMs?: number;
  /** Test hook: milliseconds between two status broadcasts. */
  statusThrottleMs?: number;
  /** Test hook: decides from the stats whether a file is a cloud placeholder. */
  detectCloudOnly?: (stats: fs.Stats) => boolean;
}

/**
 * A file synced by iCloud (or another cloud drive) that has not been
 * downloaded has its full size but no blocks on disk. Reading it makes
 * macOS start a download and, when that stalls, fail with « connection
 * timed out » after a long wait. Seen on the founder's Mac: thousands of
 * such files, three tries each, an hour lost. So they are set aside by
 * their stats and never read until their bytes arrive.
 */
export const isCloudPlaceholder = (stats: fs.Stats): boolean => (
  process.platform === 'darwin' && stats.size > 0 && stats.blocks === 0
);

/** Read errors that mean « the bytes are in the cloud, not here ». */
const CLOUD_READ_ERROR = /connection timed out|ETIMEDOUT|ENOTCONN|EDEADLK|dataless/i;

export const isCloudReadError = (message: string): boolean => CLOUD_READ_ERROR.test(message);

const LibraryContentMetadataKey = {
  Paused: 'library.content.paused',
  LastScanAt: 'library.content.lastScanAt',
} as const;

const WORKER_RESTART_LIMIT = 3;
const WORKER_RESTART_DELAY_MS = 2_000;
const SCAN_YIELD_EVERY = 200;

const isSameOrUnder = (candidate: string, folder: string): boolean => {
  const relative = path.relative(folder, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
};

const isMissingError = (error: unknown): boolean => (
  error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT'
);

const errorMessage = (error: unknown): string => (
  error instanceof Error ? error.message : String(error)
);

const isPermanentFailure = (error: unknown): boolean => (
  !!error && typeof error === 'object' && 'permanent' in error && (error as { permanent?: boolean }).permanent === true
);

const yieldToLoop = (): Promise<void> => new Promise(resolve => setImmediate(resolve));

export class LibraryContentIndexer {
  private readonly store: LibraryContentStore;
  private readonly getConfig: () => LibraryContentConfig;
  private readonly createWorker: LibraryContentIndexerOptions['createWorker'];
  private readonly onStatus: (status: LibraryContentStatus) => void;
  private readonly getMetadata: LibraryContentIndexerOptions['getMetadata'];
  private readonly setMetadata: LibraryContentIndexerOptions['setMetadata'];
  private readonly excludedRoots: string[];
  private readonly rescanIntervalMs: number;
  private readonly statusThrottleMs: number;
  private readonly detectCloudOnly: (stats: fs.Stats) => boolean;

  private worker: LibraryWorkerLike | null = null;
  private workerRestarts = 0;
  private modelReady = false;
  private error: string | null = null;
  private stopped = true;
  private enabled = false;
  private paused = false;
  private scanning = false;
  private scanRequested = false;
  private lastScanAt: number | null = null;

  private readonly queue: string[] = [];
  private readonly queued = new Set<string>();
  private running = 0;

  private readonly watchers = new Map<string, fs.FSWatcher>();
  private readonly watchTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private watcherDegraded = false;
  private rescanTimer: ReturnType<typeof setTimeout> | null = null;
  private scanTimer: ReturnType<typeof setTimeout> | null = null;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private statusTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: LibraryContentIndexerOptions) {
    this.store = options.store;
    this.getConfig = options.getConfig;
    this.createWorker = options.createWorker;
    this.onStatus = options.onStatus;
    this.getMetadata = options.getMetadata;
    this.setMetadata = options.setMetadata;
    this.excludedRoots = (options.excludedRoots ?? []).map(root => path.resolve(root));
    this.rescanIntervalMs = options.rescanIntervalMs ?? LibraryContentLimits.RescanIntervalMs;
    this.statusThrottleMs = options.statusThrottleMs ?? LibraryContentLimits.StatusThrottleMs;
    this.detectCloudOnly = options.detectCloudOnly ?? isCloudPlaceholder;
    this.paused = this.getMetadata<boolean>(LibraryContentMetadataKey.Paused) === true;
    this.lastScanAt = this.getMetadata<number>(LibraryContentMetadataKey.LastScanAt) ?? null;
  }

  // ---------------------------------------------------------------- lifecycle

  start(): void {
    this.stopped = false;
    const config = this.getConfig();
    this.enabled = config.enabled;
    if (!this.enabled) {
      console.log('[LibraryContent] library is off; nothing to index');
      this.emitStatus();
      return;
    }
    console.log(`[LibraryContent] starting: ${config.folders.length} folder(s), paused=${this.paused}`);
    for (const document of this.store.listPending()) this.enqueue(document.id);
    void this.startWorker();
    this.rebuildWatchers(config);
    this.scheduleScan(0);
    this.scheduleRescan();
    this.emitStatus();
  }

  stop(): void {
    this.stopped = true;
    this.teardown();
  }

  /** Call after the settings changed. Starts, stops or re-scopes the index. */
  applyConfig(): void {
    if (this.stopped) return;
    const config = this.getConfig();
    if (!config.enabled) {
      if (this.enabled) console.log('[LibraryContent] library switched off');
      this.enabled = false;
      this.teardown();
      this.stopped = false;
      this.emitStatus();
      return;
    }
    if (!this.enabled) {
      this.start();
      return;
    }
    const removed = this.store.deleteOutside(config.folders, [...config.excludedFolders, ...this.excludedRoots]);
    if (removed > 0) console.log(`[LibraryContent] dropped ${removed} document(s) outside the chosen folders`);
    for (const id of [...this.queue]) {
      if (!this.store.getById(id)) this.dequeue(id);
    }
    this.rebuildWatchers(config);
    this.scheduleScan(0);
    this.emitStatus();
  }

  setPaused(paused: boolean): LibraryContentStatus {
    this.paused = paused;
    this.setMetadata(LibraryContentMetadataKey.Paused, paused);
    console.log(`[LibraryContent] ${paused ? 'paused' : 'resumed'}`);
    if (!paused) this.pump();
    return this.getStatus();
  }

  /** Throws the index away and reads every document again. */
  rebuild(): LibraryContentStatus {
    console.log('[LibraryContent] rebuilding the index');
    this.queue.length = 0;
    this.queued.clear();
    this.store.clearAll();
    if (this.enabled && !this.stopped) this.scheduleScan(0);
    return this.getStatus();
  }

  // ------------------------------------------------------------------- search

  async search(request: LibrarySearchRequest): Promise<LibrarySearchResponse> {
    const startedAt = Date.now();
    const counts = this.store.counts();
    if (!this.enabled) {
      return { hits: [], documentCount: counts.indexed, vectorsUsed: false, tookMs: Date.now() - startedAt };
    }
    let vector: Float32Array | null = null;
    if (this.worker?.ready) {
      try {
        vector = await this.worker.embedQuery(request.query, 15_000);
      } catch (error) {
        console.warn('[LibraryContent] could not embed the question; using keywords only:', errorMessage(error));
      }
    }
    const hits = this.store.search(request.query, vector, {
      folder: request.folder,
      limit: request.limit,
    });
    return {
      hits,
      documentCount: counts.indexed,
      vectorsUsed: vector !== null,
      tookMs: Date.now() - startedAt,
    };
  }

  // ------------------------------------------------------------------- status

  getStatus(): LibraryContentStatus {
    const config = this.getConfig();
    const counts = this.store.counts();
    return {
      phase: this.computePhase(),
      documentCount: counts.indexed,
      chunkCount: counts.chunks,
      queuedCount: this.enabled ? counts.pending : 0,
      failedCount: counts.failed,
      cloudOnlyCount: counts.cloudOnly,
      indexBytes: counts.indexBytes,
      ...(counts.lastIndexedAt ? { lastIndexedAt: counts.lastIndexedAt } : {}),
      ...(this.lastScanAt ? { lastScanAt: this.lastScanAt } : {}),
      modelReady: this.modelReady,
      ...(this.error ? { error: this.error } : {}),
      folders: config.folders,
    };
  }

  /** Test hook: how many documents wait in memory. */
  get queueLength(): number {
    return this.queue.length + this.running;
  }

  private computePhase(): LibraryContentStatus['phase'] {
    if (!this.enabled) return LibraryContentPhase.Off;
    if (this.error) return LibraryContentPhase.Error;
    if (this.paused) return LibraryContentPhase.Paused;
    if (!this.modelReady) return LibraryContentPhase.Starting;
    if (this.scanning) return LibraryContentPhase.Scanning;
    if (this.queue.length + this.running > 0) return LibraryContentPhase.Indexing;
    return LibraryContentPhase.Idle;
  }

  private emitStatus(): void {
    if (this.statusTimer) return;
    this.statusTimer = setTimeout(() => {
      this.statusTimer = null;
      try {
        this.onStatus(this.getStatus());
      } catch (error) {
        console.warn('[LibraryContent] status listener failed:', errorMessage(error));
      }
    }, this.statusThrottleMs);
  }

  // ------------------------------------------------------------------- worker

  private async startWorker(): Promise<void> {
    if (this.worker || this.stopped || !this.enabled) return;
    this.error = null;
    this.modelReady = false;
    const worker = this.createWorker(code => this.handleWorkerExit(worker, code));
    this.worker = worker;
    this.emitStatus();
    try {
      const ready = await worker.start();
      if (this.worker !== worker) return;
      if (!ready.ok) {
        this.error = ready.error || 'The document reader could not load its model.';
        console.error(`[LibraryContent] worker could not load the model: ${this.error}`);
        this.emitStatus();
        return;
      }
      this.modelReady = true;
      this.workerRestarts = 0;
      console.log(`[LibraryContent] worker ready, model loaded in ${ready.loadMs} ms`);
    } catch (error) {
      if (this.worker !== worker) return;
      this.error = `The document reader could not start (${errorMessage(error)}).`;
      console.error('[LibraryContent] worker failed to start:', errorMessage(error));
      this.emitStatus();
      return;
    }
    this.pump();
  }

  private handleWorkerExit(worker: LibraryWorkerLike, code: number | undefined): void {
    if (this.worker !== worker) return;
    this.worker = null;
    this.modelReady = false;
    if (this.stopped || !this.enabled) return;
    this.workerRestarts += 1;
    if (this.workerRestarts > WORKER_RESTART_LIMIT) {
      this.error = 'The document reader stopped several times in a row.';
      console.error(`[LibraryContent] worker exited (code ${code ?? 'unknown'}) too many times; giving up`);
      this.emitStatus();
      return;
    }
    const delay = WORKER_RESTART_DELAY_MS * this.workerRestarts;
    console.warn(`[LibraryContent] worker exited (code ${code ?? 'unknown'}); restarting in ${delay} ms`);
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      void this.startWorker();
    }, delay);
    this.emitStatus();
  }

  // -------------------------------------------------------------------- queue

  private enqueue(documentId: string): void {
    if (this.queued.has(documentId)) return;
    this.queued.add(documentId);
    this.queue.push(documentId);
    this.pump();
  }

  private dequeue(documentId: string): void {
    if (!this.queued.delete(documentId)) return;
    const index = this.queue.indexOf(documentId);
    if (index >= 0) this.queue.splice(index, 1);
  }

  private pump(): void {
    if (this.stopped || !this.enabled || this.paused || !this.worker?.ready) {
      this.emitStatus();
      return;
    }
    while (this.running < LibraryContentLimits.WorkerConcurrency && this.queue.length > 0) {
      const documentId = this.queue.shift()!;
      this.queued.delete(documentId);
      const document = this.store.getById(documentId);
      if (!document) continue;
      const worker = this.worker;
      this.running += 1;
      worker
        .indexDocument(document.filePath, document.kind, LibraryContentLimits.DocumentTimeoutMs)
        .then(result => {
          if (this.stopped) return;
          this.store.markIndexed(document.id, {
            title: result.title,
            pageCount: result.pageCount,
            textChars: result.textChars,
            chunks: result.chunks,
          });
          console.debug(
            `[LibraryContent] indexed ${document.fileName}: ${result.chunks.length} passage(s), `
            + `read ${result.extractMs} ms, embedded ${result.embedMs} ms`,
          );
        })
        .catch(error => {
          if (this.stopped) return;
          const message = errorMessage(error);
          if (isCloudReadError(message)) {
            this.store.markCloudOnly(document.id);
            console.debug(`[LibraryContent] ${document.fileName} is only in the cloud; set aside`);
            return;
          }
          const permanent = isPermanentFailure(error);
          this.store.markFailed(document.id, message, permanent);
          console.warn(`[LibraryContent] could not read ${document.fileName}${permanent ? '' : ' (will retry)'}: ${message}`);
        })
        .finally(() => {
          this.running -= 1;
          this.emitStatus();
          this.pump();
        });
    }
    this.emitStatus();
  }

  // --------------------------------------------------------------------- scan

  private scheduleScan(delayMs: number): void {
    if (this.stopped || !this.enabled) return;
    if (this.scanTimer) clearTimeout(this.scanTimer);
    this.scanTimer = setTimeout(() => {
      this.scanTimer = null;
      void this.scan();
    }, delayMs);
  }

  private scheduleRescan(): void {
    if (this.rescanTimer) clearTimeout(this.rescanTimer);
    this.rescanTimer = setTimeout(() => {
      this.rescanTimer = null;
      this.scheduleScan(0);
      this.scheduleRescan();
    }, this.rescanIntervalMs);
  }

  /** Test hook: waits for the current scan and any requested follow-up. */
  async scanNow(): Promise<void> {
    if (this.scanTimer) {
      clearTimeout(this.scanTimer);
      this.scanTimer = null;
    }
    await this.scan();
    while (this.scanning || this.scanRequested) await yieldToLoop();
  }

  private async scan(): Promise<void> {
    if (this.stopped || !this.enabled) return;
    if (this.scanning) {
      this.scanRequested = true;
      return;
    }
    this.scanning = true;
    this.emitStatus();
    const startedAt = Date.now();
    const config = this.getConfig();
    const excluded = [...config.excludedFolders, ...this.excludedRoots].map(folder => path.resolve(folder));
    const seen = new Set<string>();
    let visited = 0;
    try {
      for (const folder of config.folders) {
        if (this.stopped || !this.enabled) return;
        const resolved = path.resolve(folder);
        visited += await this.walk(resolved, resolved, excluded, seen);
      }
      const removed = this.store.deleteUnseen(config.folders, seen);
      this.lastScanAt = Date.now();
      this.setMetadata(LibraryContentMetadataKey.LastScanAt, this.lastScanAt);
      console.log(
        `[LibraryContent] scan done in ${Date.now() - startedAt} ms: ${seen.size} document(s) seen, `
        + `${visited} entries visited, ${removed} removed, ${this.queue.length} queued`,
      );
    } catch (error) {
      console.error('[LibraryContent] scan failed:', errorMessage(error));
    } finally {
      this.scanning = false;
      this.emitStatus();
      if (this.scanRequested) {
        this.scanRequested = false;
        this.scheduleScan(1_000);
      }
      this.pump();
    }
  }

  private async walk(directory: string, root: string, excluded: string[], seen: Set<string>): Promise<number> {
    if (this.stopped || !this.enabled) return 0;
    if (excluded.some(folder => isSameOrUnder(directory, folder))) return 0;
    if (directory !== root) {
      const name = path.basename(directory);
      if (name.startsWith('.') || LIBRARY_SKIPPED_DIRECTORY_NAMES.has(name)) return 0;
    }
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (!isMissingError(error)) {
        console.debug(`[LibraryContent] cannot read a folder: ${errorMessage(error)}`);
      }
      return 0;
    }
    let visited = 0;
    for (const entry of entries) {
      if (this.stopped || !this.enabled) return visited;
      const fullPath = path.join(directory, entry.name);
      visited += 1;
      if (entry.isDirectory()) {
        visited += await this.walk(fullPath, root, excluded, seen);
      } else if (entry.isFile()) {
        await this.considerFile(fullPath, seen);
      }
      if (visited % SCAN_YIELD_EVERY === 0) await yieldToLoop();
    }
    return visited;
  }

  /** Records one file if it is a kind the library reads; queues it when it changed. */
  private async considerFile(filePath: string, seen?: Set<string>): Promise<void> {
    const kind = getLibraryDocumentKind(path.extname(filePath));
    if (!kind) return;
    const name = path.basename(filePath);
    // Office lock files and hidden files.
    if (name.startsWith('~$') || name.startsWith('.')) return;
    let stats: fs.Stats;
    try {
      stats = await fs.promises.stat(filePath);
    } catch {
      return;
    }
    if (!stats.isFile()) return;
    seen?.add(buildLibraryPathKey(filePath));
    const { document, needsIndexing } = this.store.upsertSeenFile({
      filePath,
      kind,
      sizeBytes: stats.size,
      fileMtimeMs: Math.trunc(stats.mtimeMs),
      cloudOnly: this.detectCloudOnly(stats),
    });
    if (!needsIndexing) return;
    if (stats.size > LibraryContentLimits.MaxFileBytes) {
      this.store.markFailed(document.id, 'The file is larger than 50 MB.', true);
      return;
    }
    this.enqueue(document.id);
  }

  // ----------------------------------------------------------------- watchers

  private rebuildWatchers(config: LibraryContentConfig): void {
    for (const timer of this.watchTimers.values()) clearTimeout(timer);
    this.watchTimers.clear();
    for (const watcher of this.watchers.values()) watcher.close();
    this.watchers.clear();
    this.watcherDegraded = false;
    for (const folder of config.folders) this.addWatch(path.resolve(folder));
  }

  private addWatch(folder: string): void {
    if (this.stopped || this.watchers.has(folder)) return;
    try {
      const watcher = fs.watch(folder, { recursive: true }, (_eventType, changedName) => {
        const name = changedName?.toString();
        if (!name) {
          this.scheduleScan(LibraryContentLimits.WatchDebounceMs);
          return;
        }
        this.scheduleChange(path.join(folder, name));
      });
      watcher.on('error', error => {
        console.warn(`[LibraryContent] folder watcher failed; periodic scans will be used: ${errorMessage(error)}`);
        watcher.close();
        this.watchers.delete(folder);
        this.watcherDegraded = true;
      });
      this.watchers.set(folder, watcher);
    } catch (error) {
      console.warn(`[LibraryContent] cannot watch a folder; periodic scans will be used: ${errorMessage(error)}`);
      this.watcherDegraded = true;
    }
  }

  get watchersDegraded(): boolean {
    return this.watcherDegraded;
  }

  private scheduleChange(changedPath: string): void {
    const existing = this.watchTimers.get(changedPath);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.watchTimers.delete(changedPath);
      void this.handleChange(changedPath);
    }, LibraryContentLimits.WatchDebounceMs);
    this.watchTimers.set(changedPath, timer);
  }

  private async handleChange(changedPath: string): Promise<void> {
    if (this.stopped || !this.enabled) return;
    const config = this.getConfig();
    const excluded = [...config.excludedFolders, ...this.excludedRoots].map(folder => path.resolve(folder));
    if (excluded.some(folder => isSameOrUnder(changedPath, folder))) return;
    const segments = path.relative(path.dirname(changedPath), changedPath);
    if (segments.startsWith('.')) return;
    let stats: fs.Stats;
    try {
      stats = await fs.promises.stat(changedPath);
    } catch (error) {
      if (!isMissingError(error)) return;
      const removedFile = this.store.deleteByPathKey(buildLibraryPathKey(changedPath));
      const removedUnder = this.store.deleteUnseen([changedPath], new Set());
      if (removedFile || removedUnder > 0) {
        console.log(`[LibraryContent] removed ${removedFile ? 1 : 0}+${removedUnder} document(s) after a delete`);
        this.emitStatus();
      }
      return;
    }
    if (stats.isDirectory()) {
      const root = config.folders.map(folder => path.resolve(folder)).find(folder => isSameOrUnder(changedPath, folder));
      if (!root) return;
      const seen = new Set<string>();
      await this.walk(changedPath, root, excluded, seen);
      this.emitStatus();
      return;
    }
    if (stats.isFile()) {
      await this.considerFile(changedPath);
      this.emitStatus();
    }
  }

  // ------------------------------------------------------------------ private

  private teardown(): void {
    for (const timer of [this.rescanTimer, this.scanTimer, this.restartTimer, this.statusTimer]) {
      if (timer) clearTimeout(timer);
    }
    this.rescanTimer = null;
    this.scanTimer = null;
    this.restartTimer = null;
    this.statusTimer = null;
    for (const timer of this.watchTimers.values()) clearTimeout(timer);
    this.watchTimers.clear();
    for (const watcher of this.watchers.values()) watcher.close();
    this.watchers.clear();
    this.queue.length = 0;
    this.queued.clear();
    const worker = this.worker;
    this.worker = null;
    this.modelReady = false;
    this.error = null;
    this.workerRestarts = 0;
    this.scanRequested = false;
    worker?.stop();
  }
}
