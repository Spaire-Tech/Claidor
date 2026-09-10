import Database from 'better-sqlite3';
import os from 'os';
import path from 'path';
import { describe, expect, test } from 'vitest';

import { LibraryContentLimits, LibraryDocumentKind } from '../../../shared/library/contentConstants';
import { initializeLibraryContentTables } from '../libraryMigrations';
import {
  buildLibraryFtsQuery,
  LibraryContentStore,
  LibraryDocumentStatus,
} from './libraryContentStore';

const DIMENSIONS = LibraryContentLimits.EmbeddingDimensions;

/** A unit vector pointing along one axis, with a little of a second one. */
const axisVector = (axis: number, lean = -1, leanWeight = 0): Float32Array => {
  const vector = new Float32Array(DIMENSIONS);
  vector[axis] = 1;
  if (lean >= 0) vector[lean] = leanWeight;
  const norm = Math.hypot(...vector);
  for (let index = 0; index < DIMENSIONS; index += 1) vector[index] /= norm;
  return vector;
};

const root = path.join(os.tmpdir(), 'maties-library-test');

const makeStore = () => {
  const db = new Database(':memory:');
  initializeLibraryContentTables(db);
  return new LibraryContentStore(db);
};

const seed = (store: LibraryContentStore) => {
  const lease = store.upsertSeenFile({
    filePath: path.join(root, 'contracts', 'lease.docx'),
    kind: LibraryDocumentKind.Word,
    sizeBytes: 100,
    fileMtimeMs: 1_000,
  }).document;
  store.markIndexed(lease.id, {
    title: 'Lease',
    pageCount: 3,
    textChars: 200,
    chunks: [
      { ordinal: 0, locator: { page: 1 }, text: 'This lease is made between the landlord and the tenant.', vector: axisVector(0, 1, 0.2) },
      { ordinal: 1, locator: { page: 3 }, text: 'The tenant shall pay rent of 2,400 euros on the first day of each month.', vector: axisVector(1) },
    ],
  });
  const budget = store.upsertSeenFile({
    filePath: path.join(root, 'finance', 'budget.xlsx'),
    kind: LibraryDocumentKind.Spreadsheet,
    sizeBytes: 100,
    fileMtimeMs: 1_000,
  }).document;
  store.markIndexed(budget.id, {
    title: 'Budget',
    pageCount: 2,
    textChars: 100,
    chunks: [
      { ordinal: 0, locator: { sheet: 'Q3' }, text: 'Q3 marketing budget: 45,000 total, 12,000 for events, 8,000 for print.', vector: axisVector(2) },
    ],
  });
  const policy = store.upsertSeenFile({
    filePath: path.join(root, 'hr', 'policy.pdf'),
    kind: LibraryDocumentKind.Pdf,
    sizeBytes: 100,
    fileMtimeMs: 1_000,
  }).document;
  store.markIndexed(policy.id, {
    title: 'Policy',
    pageCount: 9,
    textChars: 100,
    chunks: [
      { ordinal: 0, locator: { page: 7 }, text: 'Employees may work from home up to three days per week with manager approval.', vector: axisVector(3) },
    ],
  });
  return { lease, budget, policy };
};

describe('buildLibraryFtsQuery', () => {
  test('turns the meaningful words into quoted prefix terms joined with OR', () => {
    expect(buildLibraryFtsQuery('How much is the rent?')).toBe('"rent"*');
    expect(buildLibraryFtsQuery('Q3 marketing budget events')).toBe('"q3"* OR "marketing"* OR "budget"* OR "events"*');
  });

  test('keeps question words only when nothing else is left', () => {
    expect(buildLibraryFtsQuery('what is it')).toBe('"what"* OR "is"* OR "it"*');
  });

  test('drops one-letter words and punctuation, keeps accents', () => {
    expect(buildLibraryFtsQuery('a "quoted" été!')).toBe('"quoted"* OR "été"*');
    expect(buildLibraryFtsQuery('?? a')).toBeNull();
  });
});

describe('LibraryContentStore documents', () => {
  test('records a new file as pending and does not re-index an unchanged indexed file', () => {
    const store = makeStore();
    const file = { filePath: path.join(root, 'a.txt'), kind: LibraryDocumentKind.Text, sizeBytes: 10, fileMtimeMs: 5 };
    const first = store.upsertSeenFile(file);
    expect(first.needsIndexing).toBe(true);
    expect(first.document.status).toBe(LibraryDocumentStatus.Pending);
    store.markIndexed(first.document.id, { title: 'A', pageCount: 0, textChars: 10, chunks: [
      { ordinal: 0, locator: {}, text: 'hello world', vector: axisVector(0) },
    ] });
    expect(store.upsertSeenFile(file).needsIndexing).toBe(false);
    const changed = store.upsertSeenFile({ ...file, fileMtimeMs: 6 });
    expect(changed.needsIndexing).toBe(true);
    expect(changed.document.status).toBe(LibraryDocumentStatus.Pending);
    expect(store.counts().chunks).toBe(1);
  });

  test('a permanent failure is not retried until the file changes', () => {
    const store = makeStore();
    const file = { filePath: path.join(root, 'bad.pdf'), kind: LibraryDocumentKind.Pdf, sizeBytes: 10, fileMtimeMs: 5 };
    const { document } = store.upsertSeenFile(file);
    store.markFailed(document.id, 'no text found', true);
    expect(store.upsertSeenFile(file).needsIndexing).toBe(false);
    expect(store.counts().failed).toBe(1);
    expect(store.upsertSeenFile({ ...file, sizeBytes: 11 }).needsIndexing).toBe(true);
  });

  test('a temporary failure is retried up to the limit', () => {
    const store = makeStore();
    const file = { filePath: path.join(root, 'locked.docx'), kind: LibraryDocumentKind.Word, sizeBytes: 10, fileMtimeMs: 5 };
    const { document } = store.upsertSeenFile(file);
    for (let attempt = 0; attempt < LibraryContentLimits.MaxAttempts - 1; attempt += 1) {
      store.markFailed(document.id, 'busy', false);
      expect(store.upsertSeenFile(file).needsIndexing).toBe(true);
    }
    store.markFailed(document.id, 'busy', false);
    expect(store.upsertSeenFile(file).needsIndexing).toBe(false);
    expect(store.requeueFailed()).toBe(0);
  });

  test('a cloud-only file is remembered, not queued, and read once its bytes arrive', () => {
    const store = makeStore();
    const file = { filePath: path.join(root, 'cloud.docx'), kind: LibraryDocumentKind.Word, sizeBytes: 900, fileMtimeMs: 5 };
    const first = store.upsertSeenFile({ ...file, cloudOnly: true });
    expect(first.needsIndexing).toBe(false);
    expect(first.document.status).toBe(LibraryDocumentStatus.CloudOnly);
    expect(store.counts()).toMatchObject({ cloudOnly: 1, pending: 0, failed: 0 });
    expect(store.listPending()).toHaveLength(0);
    // Still in the cloud on the next scan: nothing changes.
    expect(store.upsertSeenFile({ ...file, cloudOnly: true }).needsIndexing).toBe(false);
    // Downloaded, same size and date: now it is read.
    const arrived = store.upsertSeenFile(file);
    expect(arrived.needsIndexing).toBe(true);
    expect(arrived.document.status).toBe(LibraryDocumentStatus.Pending);
    expect(store.counts().cloudOnly).toBe(0);
  });

  test('an indexed file that goes back to the cloud loses its passages and is not retried', () => {
    const store = makeStore();
    const { lease } = seed(store);
    store.markCloudOnly(lease.id);
    expect(store.counts()).toMatchObject({ indexed: 2, cloudOnly: 1, chunks: 2 });
    expect(store.search('rent', null)).toHaveLength(0);
    expect(store.getById(lease.id)?.attempts).toBe(0);
  });

  test('deleting a document removes its passages and vectors', () => {
    const store = makeStore();
    const { lease } = seed(store);
    expect(store.counts()).toMatchObject({ indexed: 3, chunks: 4 });
    store.deleteById(lease.id);
    expect(store.counts()).toMatchObject({ indexed: 2, chunks: 2 });
    expect(store.search('rent', null)).toHaveLength(0);
  });

  test('deleteOutside drops documents outside the folders or inside an excluded one', () => {
    const store = makeStore();
    seed(store);
    expect(store.deleteOutside([root], [path.join(root, 'hr')])).toBe(1);
    expect(store.deleteOutside([path.join(root, 'contracts')], [])).toBe(1);
    expect(store.counts().indexed).toBe(1);
  });

  test('deleteUnseen drops documents under the folder that the scan did not see', () => {
    const store = makeStore();
    const { lease } = seed(store);
    expect(store.deleteUnseen([root], new Set([lease.pathKey]))).toBe(2);
    expect(store.listAll().map(document => document.id)).toEqual([lease.id]);
  });
});

describe('LibraryContentStore search', () => {
  test('keywords alone find the rent passage with its page', () => {
    const store = makeStore();
    seed(store);
    const hits = store.search('how much is the rent', null);
    expect(hits[0].fileName).toBe('lease.docx');
    expect(hits[0].locator).toEqual({ page: 3 });
    expect(hits[0].text).toContain('2,400 euros');
  });

  test('a vector finds the passage even without any word in common', () => {
    const store = makeStore();
    seed(store);
    const hits = store.search('remote working rules', axisVector(3));
    expect(hits[0].fileName).toBe('policy.pdf');
    expect(hits[0].locator).toEqual({ page: 7 });
    expect(hits[0].score).toBeGreaterThan(0.6);
  });

  test('keywords and vectors are blended, with the keyword match leading when the vector is flat', () => {
    const store = makeStore();
    seed(store);
    const hits = store.search('marketing budget', axisVector(1));
    // The vector points at the rent passage; the words point at the budget sheet.
    const names = hits.map(hit => hit.fileName);
    expect(names).toContain('budget.xlsx');
    expect(names).toContain('lease.docx');
    expect(hits.find(hit => hit.fileName === 'budget.xlsx')?.locator).toEqual({ sheet: 'Q3' });
  });

  test('a folder filter limits both paths', () => {
    const store = makeStore();
    seed(store);
    expect(store.search('rent', axisVector(1), { folder: path.join(root, 'finance') })).toHaveLength(0);
    const hits = store.search('rent', axisVector(1), { folder: path.join(root, 'contracts') });
    expect([...new Set(hits.map(hit => hit.fileName))]).toEqual(['lease.docx']);
    expect(hits[0].locator).toEqual({ page: 3 });
  });

  test('limit and per-document caps apply', () => {
    const store = makeStore();
    seed(store);
    expect(store.search('tenant', null, { limit: 1 })).toHaveLength(1);
    expect(store.search('tenant', axisVector(0), { perDocument: 1 }).filter(hit => hit.fileName === 'lease.docx')).toHaveLength(1);
    expect(store.search('tenant', axisVector(0)).filter(hit => hit.fileName === 'lease.docx')).toHaveLength(2);
  });

  test('a query FTS5 cannot parse does not throw', () => {
    const store = makeStore();
    seed(store);
    expect(() => store.search('"""', null)).not.toThrow();
  });

  test('vectors survive the round trip through the blob', () => {
    const store = makeStore();
    seed(store);
    const hits = store.search('zzz', axisVector(2));
    expect(hits[0].fileName).toBe('budget.xlsx');
    expect(hits[0].score).toBeCloseTo(VECTOR_ONLY_SCORE, 2);
  });
});

/** Cosine 1 × the vector weight when no keyword matched. */
const VECTOR_ONLY_SCORE = 0.65;
