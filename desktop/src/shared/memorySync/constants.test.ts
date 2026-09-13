import { describe, expect, test } from 'vitest';

import { isSyncedMemoryName, SyncedMemoryFile } from './constants';

describe('isSyncedMemoryName', () => {
  test('accepts the two workspace documents that sync', () => {
    expect(isSyncedMemoryName(SyncedMemoryFile.Memory)).toBe(true);
    expect(isSyncedMemoryName(SyncedMemoryFile.User)).toBe(true);
  });

  test('accepts a daily note with a real date', () => {
    expect(isSyncedMemoryName('memory/2026-09-11.md')).toBe(true);
    expect(isSyncedMemoryName('memory/2024-02-29.md')).toBe(true);
  });

  test('rejects a daily note whose date does not exist', () => {
    expect(isSyncedMemoryName('memory/2026-02-30.md')).toBe(false);
    expect(isSyncedMemoryName('memory/2026-13-01.md')).toBe(false);
    expect(isSyncedMemoryName('memory/2026-00-10.md')).toBe(false);
    expect(isSyncedMemoryName('memory/2025-02-29.md')).toBe(false);
  });

  test('rejects the files the app owns', () => {
    expect(isSyncedMemoryName('IDENTITY.md')).toBe(false);
    expect(isSyncedMemoryName('SOUL.md')).toBe(false);
    expect(isSyncedMemoryName('AGENTS.md')).toBe(false);
  });

  test('rejects anything that could escape the workspace', () => {
    expect(isSyncedMemoryName('../MEMORY.md')).toBe(false);
    expect(isSyncedMemoryName('memory/../../MEMORY.md')).toBe(false);
    expect(isSyncedMemoryName('/MEMORY.md')).toBe(false);
    expect(isSyncedMemoryName('memory\\2026-09-11.md')).toBe(false);
    expect(isSyncedMemoryName('./MEMORY.md')).toBe(false);
    expect(isSyncedMemoryName('memory//2026-09-11.md')).toBe(false);
  });

  test('rejects near misses and non-strings', () => {
    expect(isSyncedMemoryName('memory.md')).toBe(false);
    expect(isSyncedMemoryName('memory/2026-09-11.txt')).toBe(false);
    expect(isSyncedMemoryName('memory/notes/2026-09-11.md')).toBe(false);
    expect(isSyncedMemoryName('MEMORY.MD')).toBe(false);
    expect(isSyncedMemoryName('')).toBe(false);
    expect(isSyncedMemoryName(undefined)).toBe(false);
    expect(isSyncedMemoryName(42)).toBe(false);
  });
});
