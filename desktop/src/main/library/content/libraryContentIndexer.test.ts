import Database from 'better-sqlite3';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import {
  type LibraryContentConfig,
  LibraryContentLimits,
  LibraryContentPhase,
  type LibraryContentStatus,
  type LibraryDocumentKind,
  type LibraryWorkerDocumentIndexedMessage,
  type LibraryWorkerReadyMessage,
} from '../../../shared/library/contentConstants';
import { initializeLibraryContentTables } from '../libraryMigrations';
import { LibraryContentIndexer, type LibraryWorkerLike } from './libraryContentIndexer';
import { LibraryContentStore } from './libraryContentStore';

const DIMENSIONS = LibraryContentLimits.EmbeddingDimensions;

const unitVector = (seed: number): Float32Array => {
  const vector = new Float32Array(DIMENSIONS);
  vector[seed % DIMENSIONS] = 1;
  return vector;
};

/** A worker that "reads" a file by splitting its text on blank lines. */
class FakeWorker implements LibraryWorkerLike {
  ready = false;
  indexed: string[] = [];
  failWith: Map<string, { message: string; permanent: boolean }> = new Map();
  private onExit: ((code: number | undefined) => void) | null = null;
  constructor(private readonly options: { startOk?: boolean; delayMs?: number } = {}) {}

  attachExit(onExit: (code: number | undefined) => void): void {
    this.onExit = onExit;
  }

  async start(): Promise<LibraryWorkerReadyMessage> {
    if (this.options.startOk === false) {
      return { type: 'ready', ok: false, error: 'model missing', loadMs: 1 };
    }
    this.ready = true;
    return { type: 'ready', ok: true, loadMs: 1 };
  }

  async indexDocument(filePath: string, _kind: LibraryDocumentKind): Promise<LibraryWorkerDocumentIndexedMessage> {
    if (this.options.delayMs) await new Promise(resolve => setTimeout(resolve, this.options.delayMs));
    const failure = this.failWith.get(path.basename(filePath));
    if (failure) {
      const error = new Error(failure.message) as Error & { permanent: boolean };
      error.permanent = failure.permanent;
      throw error;
    }
    const text = fs.readFileSync(filePath, 'utf8');
    const pieces = text.split(/\n\s*\n/).map(piece => piece.trim()).filter(Boolean);
    this.indexed.push(path.basename(filePath));
    return {
      type: 'documentIndexed',
      requestId: 'r',
      title: pieces[0] ?? path.basename(filePath),
      pageCount: 0,
      textChars: text.length,
      chunks: pieces.map((piece, ordinal) => ({ ordinal, locator: {}, text: piece, vector: unitVector(piece.length) })),
      extractMs: 1,
      embedMs: 1,
    };
  }

  async embedQuery(text: string): Promise<Float32Array> {
    return unitVector(text.length);
  }

  stop(): void {
    this.ready = false;
  }

  crash(): void {
    this.ready = false;
    this.onExit?.(1);
  }
}

const waitFor = async (condition: () => boolean, timeoutMs = 5_000): Promise<void> => {
  const startedAt = Date.now();
  while (!condition()) {
    if (Date.now() - startedAt > timeoutMs) throw new Error('timed out waiting');
    await new Promise(resolve => setTimeout(resolve, 20));
  }
};

describe('LibraryContentIndexer', () => {
  let root: string;
  let store: LibraryContentStore;
  let config: LibraryContentConfig;
  let indexer: LibraryContentIndexer | null;
  let workers: FakeWorker[];
  let statuses: LibraryContentStatus[];
  let metadata: Map<string, unknown>;
  let workerOptions: { startOk?: boolean; delayMs?: number };

  const makeIndexer = () => {
    indexer = new LibraryContentIndexer({
      store,
      getConfig: () => config,
      createWorker: onExit => {
        const worker = new FakeWorker(workerOptions);
        worker.attachExit(onExit);
        workers.push(worker);
        return worker;
      },
      onStatus: status => statuses.push(status),
      getMetadata: <T>(key: string) => metadata.get(key) as T | undefined,
      setMetadata: (key, value) => metadata.set(key, value),
      excludedRoots: [path.join(root, 'app-data')],
      rescanIntervalMs: 60_000,
      statusThrottleMs: 5,
    });
    return indexer;
  };

  const write = (relative: string, text: string) => {
    const filePath = path.join(root, relative);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, text);
    return filePath;
  };

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'swen-indexer-'));
    const db = new Database(':memory:');
    initializeLibraryContentTables(db);
    store = new LibraryContentStore(db);
    config = { enabled: true, folders: [root], excludedFolders: [] };
    workers = [];
    statuses = [];
    metadata = new Map();
    workerOptions = {};
    indexer = null;
  });

  afterEach(() => {
    indexer?.stop();
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('scans the folders, indexes the documents and answers a question', async () => {
    write('contracts/lease.txt', 'Lease agreement\n\nThe tenant pays rent of 2,400 euros each month.');
    write('notes/todo.md', '# Todo\n\nCall the landlord about the rent.');
    write('photo.png', 'not a document');
    write('node_modules/pkg/readme.md', 'skipped');
    write('.hidden/secret.md', 'skipped');
    write('app-data/swen.md', 'skipped');
    write('contracts/~$lease.txt', 'lock file');
    const subject = makeIndexer();
    subject.start();
    await subject.scanNow();
    await waitFor(() => store.counts().indexed === 2);
    expect(workers[0].indexed.sort()).toEqual(['lease.txt', 'todo.md']);
    expect(store.counts()).toMatchObject({ indexed: 2, pending: 0, failed: 0 });

    const response = await subject.search({ query: 'rent', limit: 5 });
    expect(response.vectorsUsed).toBe(true);
    expect(response.documentCount).toBe(2);
    expect(response.hits.map(hit => hit.fileName)).toContain('lease.txt');

    await waitFor(() => subject.getStatus().phase === LibraryContentPhase.Idle);
    expect(subject.getStatus()).toMatchObject({ documentCount: 2, modelReady: true, folders: [root] });
    expect(statuses.length).toBeGreaterThan(0);
  });

  test('does not read an unchanged file twice, reads a changed one again, forgets a deleted one', async () => {
    const lease = write('lease.txt', 'Rent is 2,400 euros.');
    const subject = makeIndexer();
    subject.start();
    await subject.scanNow();
    await waitFor(() => store.counts().indexed === 1);
    await subject.scanNow();
    await waitFor(() => subject.queueLength === 0);
    expect(workers[0].indexed).toEqual(['lease.txt']);

    fs.writeFileSync(lease, 'Rent is 2,600 euros.');
    const future = Date.now() + 5_000;
    fs.utimesSync(lease, new Date(future), new Date(future));
    await subject.scanNow();
    await waitFor(() => workers[0].indexed.length === 2);
    await waitFor(() => store.counts().indexed === 1);
    expect(store.search('2,600', null)[0]?.text).toContain('2,600');

    fs.rmSync(lease);
    await subject.scanNow();
    expect(store.counts().indexed).toBe(0);
  });

  test('records failures: a permanent one is not retried, a temporary one is', async () => {
    write('broken.txt', 'x');
    write('busy.txt', 'y');
    const subject = makeIndexer();
    subject.start();
    await waitFor(() => workers.length === 1);
    workers[0].failWith.set('broken.txt', { message: 'no text found', permanent: true });
    workers[0].failWith.set('busy.txt', { message: 'locked', permanent: false });
    await subject.scanNow();
    await waitFor(() => store.counts().failed === 2);
    const broken = store.getByFilePath(path.join(root, 'broken.txt'))!;
    const busy = store.getByFilePath(path.join(root, 'busy.txt'))!;
    expect(broken.attempts).toBe(LibraryContentLimits.MaxAttempts);
    expect(busy.attempts).toBe(1);
    expect(busy.error).toBe('locked');

    workers[0].failWith.delete('busy.txt');
    await subject.scanNow();
    await waitFor(() => store.counts().indexed === 1);
    expect(store.counts().failed).toBe(1);
    expect(subject.getStatus().failedCount).toBe(1);
  });

  test('pause holds the queue and resume drains it', async () => {
    write('a.txt', 'A');
    write('b.txt', 'B');
    const subject = makeIndexer();
    subject.setPaused(true);
    subject.start();
    await subject.scanNow();
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(store.counts()).toMatchObject({ indexed: 0, pending: 2 });
    expect(subject.getStatus().phase).toBe(LibraryContentPhase.Paused);
    expect(metadata.get('library.content.paused')).toBe(true);
    subject.setPaused(false);
    await waitFor(() => store.counts().indexed === 2);
  });

  test('switching the library off stops the worker and reports Off; on again resumes', async () => {
    write('a.txt', 'A');
    const subject = makeIndexer();
    subject.start();
    await subject.scanNow();
    await waitFor(() => store.counts().indexed === 1);
    config = { ...config, enabled: false };
    subject.applyConfig();
    expect(subject.getStatus().phase).toBe(LibraryContentPhase.Off);
    expect(workers[0].ready).toBe(false);
    expect((await subject.search({ query: 'A' })).hits).toHaveLength(0);
    config = { ...config, enabled: true };
    subject.applyConfig();
    await subject.scanNow();
    await waitFor(() => workers.length === 2 && workers[1].ready);
    expect(subject.getStatus().phase).not.toBe(LibraryContentPhase.Off);
  });

  test('narrowing the folders drops documents outside them', async () => {
    write('keep/a.txt', 'A');
    write('drop/b.txt', 'B');
    const subject = makeIndexer();
    subject.start();
    await subject.scanNow();
    await waitFor(() => store.counts().indexed === 2);
    config = { ...config, folders: [path.join(root, 'keep')] };
    subject.applyConfig();
    await subject.scanNow();
    expect(store.listAll().map(document => document.fileName)).toEqual(['a.txt']);
    config = { ...config, folders: [root], excludedFolders: [path.join(root, 'keep')] };
    subject.applyConfig();
    await subject.scanNow();
    await waitFor(() => store.counts().indexed === 1);
    expect(store.listAll().map(document => document.fileName)).toEqual(['b.txt']);
  });

  test('rebuild clears the index and reads everything again', async () => {
    write('a.txt', 'A');
    const subject = makeIndexer();
    subject.start();
    await subject.scanNow();
    await waitFor(() => store.counts().indexed === 1);
    subject.rebuild();
    expect(store.counts().indexed).toBe(0);
    await subject.scanNow();
    await waitFor(() => store.counts().indexed === 1);
    expect(workers[0].indexed).toEqual(['a.txt', 'a.txt']);
  });

  test('a worker that cannot load its model reports the error in plain words', async () => {
    workerOptions = { startOk: false };
    write('a.txt', 'A');
    const subject = makeIndexer();
    subject.start();
    await waitFor(() => subject.getStatus().phase === LibraryContentPhase.Error);
    expect(subject.getStatus().error).toBe('model missing');
    const response = await subject.search({ query: 'A' });
    expect(response.vectorsUsed).toBe(false);
  });

  test('a crashed worker is started again and the queue continues', async () => {
    write('a.txt', 'A');
    const subject = makeIndexer();
    subject.start();
    await subject.scanNow();
    await waitFor(() => store.counts().indexed === 1);
    workers[0].crash();
    write('b.txt', 'B');
    await waitFor(() => workers.length === 2 && workers[1].ready, 10_000);
    await subject.scanNow();
    await waitFor(() => store.counts().indexed === 2);
    expect(workers[1].indexed).toEqual(['b.txt']);
  }, 15_000);

  test('the pending rows in the store are the cursor: a restart picks them up', async () => {
    write('a.txt', 'A');
    workerOptions = { delayMs: 200 };
    const first = makeIndexer();
    first.start();
    await first.scanNow();
    first.stop();
    expect(store.counts().pending).toBe(1);
    workerOptions = {};
    const second = makeIndexer();
    second.start();
    await waitFor(() => store.counts().indexed === 1);
  });
});
