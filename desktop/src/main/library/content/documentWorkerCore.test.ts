import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import type { LibraryTextSection } from '../../../shared/library/chunker';
import {
  LibraryContentLimits,
  LibraryDocumentKind,
  LibraryWorkerMessageType,
} from '../../../shared/library/contentConstants';
import {
  handleLibraryWorkerRequest,
  isPermanentLibraryError,
  type LibraryWorkerCoreDeps,
  MODEL_NOT_LOADED_ERROR,
  NO_TEXT_FOUND_ERROR,
} from './documentWorkerCore';
import { extractLibraryDocument } from './extractors';

const DIMS = LibraryContentLimits.EmbeddingDimensions;

/** A deterministic stand-in for the model: a unit vector seeded by the text length. */
const fakeEmbed = async (texts: string[]): Promise<Float32Array[]> => texts.map((text) => {
  const vector = new Float32Array(DIMS);
  vector[text.length % DIMS] = 1;
  return vector;
});

const depsWith = (
  sections: LibraryTextSection[] | Error,
  overrides: Partial<LibraryWorkerCoreDeps> = {},
): LibraryWorkerCoreDeps => ({
  extract: async () => {
    if (sections instanceof Error) throw sections;
    return { sections, pageCount: sections.length };
  },
  embed: fakeEmbed,
  ...overrides,
});

const longText = (prefix: string): string => (
  Array.from({ length: 30 }, (_, index) => `${prefix} sentence ${index + 1} about the rent.`).join(' ')
);

let fixtureDir = '';

beforeAll(async () => {
  fixtureDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'swen-library-worker-'));
});

afterAll(async () => {
  if (fixtureDir) await fs.promises.rm(fixtureDir, { recursive: true, force: true });
});

describe('handleLibraryWorkerRequest', () => {
  test('indexDocument extracts, chunks and embeds every chunk', async () => {
    const embedded: string[][] = [];
    const deps = depsWith(
      [{ locator: { page: 1 }, text: longText('Alpha') }, { locator: { page: 2 }, text: 'Short page.' }],
      { embed: async (texts) => { embedded.push(texts); return fakeEmbed(texts); } },
    );
    const response = await handleLibraryWorkerRequest({
      type: LibraryWorkerMessageType.IndexDocument,
      requestId: 'r1',
      filePath: '/tmp/lease.docx',
      kind: LibraryDocumentKind.Word,
    }, deps);
    expect(response.type).toBe(LibraryWorkerMessageType.DocumentIndexed);
    if (response.type !== LibraryWorkerMessageType.DocumentIndexed) return;
    expect(response.requestId).toBe('r1');
    expect(response.title).toBe(`${longText('Alpha').slice(0, 117)}…`);
    expect(response.title).toHaveLength(118);
    expect(response.pageCount).toBe(2);
    expect(response.textChars).toBe(longText('Alpha').length + 'Short page.'.length);
    expect(response.chunks.length).toBeGreaterThan(2);
    expect(embedded).toHaveLength(1);
    expect(embedded[0]).toEqual(response.chunks.map(chunk => chunk.text));
    response.chunks.forEach((chunk, index) => {
      expect(chunk.ordinal).toBe(index);
      expect(chunk.vector).toBeInstanceOf(Float32Array);
      expect(chunk.vector).toHaveLength(DIMS);
    });
    expect(response.chunks[response.chunks.length - 1]).toMatchObject({ locator: { page: 2 }, text: 'Short page.' });
    expect(response.extractMs).toBeGreaterThanOrEqual(0);
    expect(response.embedMs).toBeGreaterThanOrEqual(0);
  });

  test('a document without text fails permanently', async () => {
    const response = await handleLibraryWorkerRequest({
      type: LibraryWorkerMessageType.IndexDocument,
      requestId: 'r2',
      filePath: '/tmp/scan.pdf',
      kind: LibraryDocumentKind.Pdf,
    }, depsWith([]));
    expect(response).toEqual({
      type: LibraryWorkerMessageType.Failed,
      requestId: 'r2',
      error: NO_TEXT_FOUND_ERROR,
      permanent: true,
    });
  });

  test('extraction errors become failed replies with the right permanence', async () => {
    const permanent = await handleLibraryWorkerRequest({
      type: LibraryWorkerMessageType.IndexDocument,
      requestId: 'r3',
      filePath: '/tmp/big.pdf',
      kind: LibraryDocumentKind.Pdf,
    }, depsWith(new Error('too large: 99 bytes, limit 1')));
    expect(permanent).toMatchObject({ type: LibraryWorkerMessageType.Failed, requestId: 'r3', permanent: true });
    expect((permanent as { error: string }).error).toMatch(/^too large/);

    const transient = await handleLibraryWorkerRequest({
      type: LibraryWorkerMessageType.IndexDocument,
      requestId: 'r4',
      filePath: '/tmp/locked.docx',
      kind: LibraryDocumentKind.Word,
    }, depsWith(new Error('EBUSY: resource busy or locked')));
    expect(transient).toEqual({
      type: LibraryWorkerMessageType.Failed,
      requestId: 'r4',
      error: 'EBUSY: resource busy or locked',
      permanent: false,
    });
  });

  test('requests before the model is loaded fail without being permanent', async () => {
    const response = await handleLibraryWorkerRequest({
      type: LibraryWorkerMessageType.EmbedQuery,
      requestId: 'r5',
      text: 'rent',
    }, depsWith([], { embed: null }));
    expect(response).toEqual({
      type: LibraryWorkerMessageType.Failed,
      requestId: 'r5',
      error: MODEL_NOT_LOADED_ERROR,
      permanent: false,
    });
  });

  test('embedQuery returns one vector', async () => {
    const response = await handleLibraryWorkerRequest({
      type: LibraryWorkerMessageType.EmbedQuery,
      requestId: 'r6',
      text: 'how much is the rent',
    }, depsWith([]));
    expect(response.type).toBe(LibraryWorkerMessageType.QueryEmbedded);
    if (response.type !== LibraryWorkerMessageType.QueryEmbedded) return;
    expect(response.requestId).toBe('r6');
    expect(response.vector).toBeInstanceOf(Float32Array);
    expect(response.vector[20]).toBe(1);
  });

  test('init loads the model through the dependency and reports the time', async () => {
    let kept: unknown = null;
    const deps = depsWith([], {
      embed: null,
      loadModel: async (modelDir) => {
        expect(modelDir).toBe('/models');
        return fakeEmbed;
      },
      onModelLoaded: (embed) => { kept = embed; },
    });
    const ready = await handleLibraryWorkerRequest({ type: LibraryWorkerMessageType.Init, modelDir: '/models' }, deps);
    expect(ready).toMatchObject({ type: LibraryWorkerMessageType.Ready, ok: true });
    expect((ready as { loadMs: number }).loadMs).toBeGreaterThanOrEqual(0);
    expect(kept).toBe(fakeEmbed);

    const failed = await handleLibraryWorkerRequest(
      { type: LibraryWorkerMessageType.Init, modelDir: '/missing' },
      depsWith([], { embed: null, loadModel: async () => { throw new Error('no such folder'); } }),
    );
    expect(failed).toMatchObject({ type: LibraryWorkerMessageType.Ready, ok: false, error: 'no such folder' });
  });

  test('bad messages never throw', async () => {
    const notAnObject = await handleLibraryWorkerRequest('hello', depsWith([]));
    expect(notAnObject).toMatchObject({ type: LibraryWorkerMessageType.Failed, requestId: '', permanent: true });
    const unknownType = await handleLibraryWorkerRequest({ type: 'dance', requestId: 'r7' }, depsWith([]));
    expect(unknownType).toMatchObject({ type: LibraryWorkerMessageType.Failed, requestId: 'r7', permanent: true });
    const throwingEmbed = await handleLibraryWorkerRequest(
      { type: LibraryWorkerMessageType.EmbedQuery, requestId: 'r8', text: 'x' },
      depsWith([], { embed: async () => { throw new Error('onnx exploded'); } }),
    );
    expect(throwingEmbed).toEqual({
      type: LibraryWorkerMessageType.Failed,
      requestId: 'r8',
      error: 'onnx exploded',
      permanent: false,
    });
  });

  test('runs a real Markdown file through the real extractor', async () => {
    const filePath = path.join(fixtureDir, 'minutes.md');
    await fs.promises.writeFile(filePath, '# Minutes\n\nDecision: the office moves in November.\n\n## Actions\n\nSarah owns the move.\n');
    const response = await handleLibraryWorkerRequest({
      type: LibraryWorkerMessageType.IndexDocument,
      requestId: 'r9',
      filePath,
      kind: LibraryDocumentKind.Markdown,
    }, { extract: extractLibraryDocument, embed: fakeEmbed });
    expect(response.type).toBe(LibraryWorkerMessageType.DocumentIndexed);
    if (response.type !== LibraryWorkerMessageType.DocumentIndexed) return;
    expect(response.title).toBe('Minutes');
    expect(response.chunks.map(chunk => chunk.locator)).toEqual([{ heading: 'Minutes' }, { heading: 'Actions' }]);
  });
});

describe('isPermanentLibraryError', () => {
  test('recognises the permanent failures', () => {
    expect(isPermanentLibraryError('too large: 1 bytes')).toBe(true);
    expect(isPermanentLibraryError('unsupported document kind: image')).toBe(true);
    expect(isPermanentLibraryError('corrupt file: End of data reached')).toBe(true);
    expect(isPermanentLibraryError("Can't find end of central directory")).toBe(true);
    expect(isPermanentLibraryError('ENOENT: no such file')).toBe(false);
    expect(isPermanentLibraryError('timed out')).toBe(false);
  });
});
