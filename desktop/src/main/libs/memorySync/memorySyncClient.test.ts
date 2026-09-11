import { describe, expect, test, vi } from 'vitest';

import {
  buildMemorySyncRequest,
  MEMORY_SYNC_VERSIONS_STORE_KEY,
  type MemorySyncVersions,
  type MemorySyncVersionStore,
  mergeMemorySyncVersions,
  parseMemorySyncResponse,
  postMemorySync,
  readMemorySyncVersions,
  writeMemorySyncVersions,
} from './memorySyncClient';

function createStore(initial: Record<string, unknown> = {}): MemorySyncVersionStore & {
  values: Record<string, unknown>;
} {
  const values: Record<string, unknown> = { ...initial };
  return {
    values,
    get: <T>(key: string) => values[key] as T | undefined,
    set: <T>(key: string, value: T) => {
      values[key] = value;
    },
  };
}

describe('version bookkeeping', () => {
  test('reads the last-seen versions from one kv key', () => {
    const store = createStore({
      [MEMORY_SYNC_VERSIONS_STORE_KEY]: { 'MEMORY.md': 7, 'memory/2026-09-11.md': 1 },
    });
    expect(readMemorySyncVersions(store)).toEqual({
      'MEMORY.md': 7,
      'memory/2026-09-11.md': 1,
    });
  });

  test('drops entries a reinstall or a bad write could leave behind', () => {
    const store = createStore({
      [MEMORY_SYNC_VERSIONS_STORE_KEY]: {
        'MEMORY.md': 7,
        'IDENTITY.md': 3,
        '../escaped.md': 2,
        'USER.md': -1,
        'memory/2026-02-30.md': 4,
      },
    });
    expect(readMemorySyncVersions(store)).toEqual({ 'MEMORY.md': 7 });
  });

  test('an empty store simply re-merges from nothing', () => {
    expect(readMemorySyncVersions(createStore())).toEqual({});
  });

  test('writes the versions back under the same key', () => {
    const store = createStore();
    writeMemorySyncVersions(store, { 'MEMORY.md': 8 });
    expect(store.values[MEMORY_SYNC_VERSIONS_STORE_KEY]).toEqual({ 'MEMORY.md': 8 });
  });

  test('remembers what came down and forgets what was deleted', () => {
    const previous: MemorySyncVersions = {
      'MEMORY.md': 7,
      'USER.md': 2,
      'memory/2026-09-10.md': 5,
    };
    expect(mergeMemorySyncVersions(previous, {
      files: [
        { name: 'MEMORY.md', content: 'merged', version: 8, changed: true },
        { name: 'memory/2026-09-11.md', content: 'today', version: 1, changed: false },
      ],
      deleted: ['memory/2026-09-10.md'],
    })).toEqual({
      'MEMORY.md': 8,
      'USER.md': 2,
      'memory/2026-09-11.md': 1,
    });
  });
});

describe('buildMemorySyncRequest', () => {
  test('sends every file with the version it last saw, 0 when unseen', () => {
    expect(buildMemorySyncRequest(
      [
        { name: 'MEMORY.md', content: 'facts' },
        { name: 'memory/2026-09-11.md', content: 'today' },
      ],
      { 'MEMORY.md': 7 },
    )).toEqual({
      files: [
        { name: 'MEMORY.md', content: 'facts', base_version: 7 },
        { name: 'memory/2026-09-11.md', content: 'today', base_version: 0 },
      ],
    });
  });

  test('never sends a file that is not on the list', () => {
    expect(buildMemorySyncRequest([{ name: 'IDENTITY.md', content: 'mine' }], {}))
      .toEqual({ files: [] });
  });
});

describe('parseMemorySyncResponse', () => {
  test('reads the bare answer', () => {
    expect(parseMemorySyncResponse({
      files: [{ name: 'MEMORY.md', content: 'merged', version: 8, changed: true }],
      deleted: [],
    })).toEqual({
      files: [{ name: 'MEMORY.md', content: 'merged', version: 8, changed: true }],
      deleted: [],
    });
  });

  test('reads the account protocol envelope', () => {
    expect(parseMemorySyncResponse({
      code: 0,
      data: {
        files: [{ name: 'USER.md', content: 'profile', version: 3, changed: false }],
        deleted: ['memory/2026-09-10.md'],
      },
    })).toEqual({
      files: [{ name: 'USER.md', content: 'profile', version: 3, changed: false }],
      deleted: ['memory/2026-09-10.md'],
    });
  });

  test('drops files and deletions whose names are not on the list', () => {
    expect(parseMemorySyncResponse({
      files: [
        { name: 'IDENTITY.md', content: 'no', version: 1, changed: true },
        { name: '../escaped.md', content: 'no', version: 1, changed: true },
        { name: 'MEMORY.md', content: 'yes', version: 2, changed: true },
      ],
      deleted: ['SOUL.md', 'USER.md'],
    })).toEqual({
      files: [{ name: 'MEMORY.md', content: 'yes', version: 2, changed: true }],
      deleted: ['USER.md'],
    });
  });

  test('throws on a refusal or a shapeless answer', () => {
    expect(() => parseMemorySyncResponse({ code: 40100, message: 'expired' })).toThrow(/expired/);
    expect(() => parseMemorySyncResponse({ ok: true })).toThrow();
    expect(() => parseMemorySyncResponse('nope')).toThrow();
  });
});

describe('postMemorySync', () => {
  test('posts the bundle to the account protocol route', async () => {
    const fetchWithAuth = vi.fn(async () => new Response(JSON.stringify({
      code: 0,
      data: { files: [], deleted: [] },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    const response = await postMemorySync(
      { getServerBaseUrl: () => 'https://api.example/desktop', fetchWithAuth },
      { files: [{ name: 'MEMORY.md', content: 'facts', base_version: 7 }] },
    );

    expect(response).toEqual({ files: [], deleted: [] });
    const [url, options] = fetchWithAuth.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.example/desktop/api/memory/sync');
    expect(options.method).toBe('POST');
    expect(JSON.parse(String(options.body))).toEqual({
      files: [{ name: 'MEMORY.md', content: 'facts', base_version: 7 }],
    });
  });

  test('throws when the request is rejected', async () => {
    const fetchWithAuth = vi.fn(async () => new Response('', { status: 503 }));
    await expect(postMemorySync(
      { getServerBaseUrl: () => 'https://api.example/desktop', fetchWithAuth },
      { files: [] },
    )).rejects.toThrow(/503/);
  });
});
