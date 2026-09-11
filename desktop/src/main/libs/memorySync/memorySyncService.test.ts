import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { MemorySyncReason } from '../../../shared/memorySync/constants';
import {
  MEMORY_SYNC_VERSIONS_STORE_KEY,
  type MemorySyncVersionStore,
} from './memorySyncClient';
import { createMemorySyncService, type MemorySyncServiceDeps } from './memorySyncService';

let workspaceDir: string;
let values: Record<string, unknown>;

const store: MemorySyncVersionStore = {
  get: <T>(key: string) => values[key] as T | undefined,
  set: <T>(key: string, value: T) => {
    values[key] = value;
  },
};

const writeWorkspaceFile = (relativePath: string, content: string): void => {
  const filePath = path.join(workspaceDir, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
};

const readWorkspaceFile = (relativePath: string): string =>
  fs.readFileSync(path.join(workspaceDir, ...relativePath.split('/')), 'utf8');

const jsonResponse = (body: unknown): Response => new Response(JSON.stringify(body), {
  status: 200,
  headers: { 'Content-Type': 'application/json' },
});

const createService = (
  fetchWithAuth: MemorySyncServiceDeps['fetchWithAuth'],
  overrides: Partial<MemorySyncServiceDeps> = {},
) => createMemorySyncService({
  getServerBaseUrl: () => 'https://api.example/desktop',
  fetchWithAuth,
  isSignedIn: () => true,
  getVersionStore: () => store,
  getWorkspaceDir: () => workspaceDir,
  ...overrides,
});

beforeEach(() => {
  workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-sync-service-'));
  values = {};
});

afterEach(() => {
  fs.rmSync(workspaceDir, { recursive: true, force: true });
});

describe('createMemorySyncService', () => {
  test('sends the workspace, writes back what differs, and remembers the versions', async () => {
    writeWorkspaceFile('MEMORY.md', 'local facts\n');
    writeWorkspaceFile('memory/2026-09-11.md', 'today\n');
    writeWorkspaceFile('IDENTITY.md', 'the app owns this\n');

    const fetchWithAuth = vi.fn(async () => jsonResponse({
      code: 0,
      data: {
        files: [
          { name: 'MEMORY.md', content: 'merged facts\n', version: 8, changed: true },
          { name: 'memory/2026-09-11.md', content: 'today\n', version: 1, changed: false },
          { name: 'USER.md', content: 'a profile\n', version: 4, changed: true },
        ],
        deleted: [],
      },
    }));

    const result = await createService(fetchWithAuth).sync(MemorySyncReason.EngineStarted);

    expect(result).toEqual({ pushed: 2, pulled: 2, skipped: false });
    const [, options] = fetchWithAuth.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(options.body))).toEqual({
      files: [
        { name: 'MEMORY.md', content: 'local facts\n', base_version: 0 },
        { name: 'memory/2026-09-11.md', content: 'today\n', base_version: 0 },
      ],
    });
    expect(readWorkspaceFile('MEMORY.md')).toBe('merged facts\n');
    expect(readWorkspaceFile('USER.md')).toBe('a profile\n');
    expect(readWorkspaceFile('IDENTITY.md')).toBe('the app owns this\n');
    expect(values[MEMORY_SYNC_VERSIONS_STORE_KEY]).toEqual({
      'MEMORY.md': 8,
      'USER.md': 4,
      'memory/2026-09-11.md': 1,
    });
  });

  test('sends the versions it last saw on the next run', async () => {
    writeWorkspaceFile('MEMORY.md', 'facts\n');
    values[MEMORY_SYNC_VERSIONS_STORE_KEY] = { 'MEMORY.md': 7 };

    const fetchWithAuth = vi.fn(async () => jsonResponse({
      files: [{ name: 'MEMORY.md', content: 'facts\n', version: 7, changed: false }],
      deleted: [],
    }));

    await createService(fetchWithAuth).sync(MemorySyncReason.Periodic);

    const [, options] = fetchWithAuth.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(options.body)).files[0].base_version).toBe(7);
  });

  test('writes nothing and moves no version when the request fails', async () => {
    writeWorkspaceFile('MEMORY.md', 'local facts\n');
    values[MEMORY_SYNC_VERSIONS_STORE_KEY] = { 'MEMORY.md': 7 };

    const fetchWithAuth = vi.fn(async () => new Response('', { status: 500 }));
    const result = await createService(fetchWithAuth).sync(MemorySyncReason.Periodic);

    expect(result.error).toMatch(/500/);
    expect(result).toMatchObject({ pushed: 0, pulled: 0, skipped: false });
    expect(readWorkspaceFile('MEMORY.md')).toBe('local facts\n');
    expect(values[MEMORY_SYNC_VERSIONS_STORE_KEY]).toEqual({ 'MEMORY.md': 7 });
  });

  test('writes nothing when the network throws', async () => {
    writeWorkspaceFile('MEMORY.md', 'local facts\n');
    const fetchWithAuth = vi.fn(async () => {
      throw new Error('offline');
    });

    const result = await createService(fetchWithAuth).sync(MemorySyncReason.Quit);

    expect(result).toEqual({ pushed: 0, pulled: 0, skipped: false, error: 'offline' });
    expect(readWorkspaceFile('MEMORY.md')).toBe('local facts\n');
    expect(values[MEMORY_SYNC_VERSIONS_STORE_KEY]).toBeUndefined();
  });

  test('never runs without a signed-in account', async () => {
    writeWorkspaceFile('MEMORY.md', 'local facts\n');
    const fetchWithAuth = vi.fn(async () => jsonResponse({ files: [], deleted: [] }));

    const result = await createService(fetchWithAuth, { isSignedIn: () => false })
      .sync(MemorySyncReason.Periodic);

    expect(result).toEqual({ pushed: 0, pulled: 0, skipped: true });
    expect(fetchWithAuth).not.toHaveBeenCalled();
  });

  test('never runs without a workspace', async () => {
    const fetchWithAuth = vi.fn(async () => jsonResponse({ files: [], deleted: [] }));

    const result = await createService(fetchWithAuth, { getWorkspaceDir: () => null })
      .sync(MemorySyncReason.EngineStarted);

    expect(result).toEqual({ pushed: 0, pulled: 0, skipped: true });
    expect(fetchWithAuth).not.toHaveBeenCalled();
  });

  test('two runs never overlap', async () => {
    writeWorkspaceFile('MEMORY.md', 'facts\n');
    let release: (() => void) | null = null;
    const started = new Promise<void>(resolve => {
      release = resolve;
    });

    const fetchWithAuth = vi.fn(async () => {
      await started;
      return jsonResponse({ files: [], deleted: [] });
    });

    const service = createService(fetchWithAuth);
    const first = service.sync(MemorySyncReason.Periodic);
    const second = service.sync(MemorySyncReason.ConversationFinished);
    expect(service.isRunning()).toBe(true);
    release?.();

    await Promise.all([first, second]);
    expect(fetchWithAuth).toHaveBeenCalledTimes(1);
    expect(service.isRunning()).toBe(false);
  });
});
