import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import {
  collectSyncedMemoryNames,
  readWorkspaceMemoryFiles,
  resolveWorkspaceMemoryPath,
  writeWorkspaceMemoryFile,
} from './workspaceMemoryFiles';

let workspaceDir: string;

const writeWorkspaceFile = (relativePath: string, content: string): void => {
  const filePath = path.join(workspaceDir, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
};

beforeEach(() => {
  workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-sync-workspace-'));
});

afterEach(() => {
  fs.rmSync(workspaceDir, { recursive: true, force: true });
});

describe('collectSyncedMemoryNames', () => {
  test('keeps only real daily notes, oldest first, after the two documents', () => {
    expect(collectSyncedMemoryNames([
      '2026-09-11.md',
      'scratch.txt',
      '2026-09-10.md',
      '2026-02-30.md',
      'notes.md',
    ])).toEqual([
      'MEMORY.md',
      'USER.md',
      'memory/2026-09-10.md',
      'memory/2026-09-11.md',
    ]);
  });
});

describe('resolveWorkspaceMemoryPath', () => {
  test('resolves an accepted name inside the workspace', () => {
    expect(resolveWorkspaceMemoryPath('/ws', 'memory/2026-09-11.md'))
      .toBe(path.join('/ws', 'memory', '2026-09-11.md'));
  });

  test('refuses a name that is not on the list', () => {
    expect(resolveWorkspaceMemoryPath('/ws', 'IDENTITY.md')).toBeNull();
    expect(resolveWorkspaceMemoryPath('/ws', '../MEMORY.md')).toBeNull();
  });
});

describe('readWorkspaceMemoryFiles', () => {
  test('reads the memory files and ignores the app-owned ones', () => {
    writeWorkspaceFile('MEMORY.md', '- a durable fact\n');
    writeWorkspaceFile('USER.md', 'A short profile\n');
    writeWorkspaceFile('memory/2026-09-10.md', 'yesterday\n');
    writeWorkspaceFile('memory/2026-09-11.md', 'today\n');
    writeWorkspaceFile('memory/scratch.txt', 'ignored\n');
    writeWorkspaceFile('IDENTITY.md', 'the app owns this\n');
    writeWorkspaceFile('SOUL.md', 'the app owns this\n');
    writeWorkspaceFile('AGENTS.md', 'the app owns this\n');

    expect(readWorkspaceMemoryFiles(workspaceDir)).toEqual([
      { name: 'MEMORY.md', content: '- a durable fact\n' },
      { name: 'USER.md', content: 'A short profile\n' },
      { name: 'memory/2026-09-10.md', content: 'yesterday\n' },
      { name: 'memory/2026-09-11.md', content: 'today\n' },
    ]);
  });

  test('leaves out files the workspace does not have', () => {
    writeWorkspaceFile('MEMORY.md', 'facts\n');
    expect(readWorkspaceMemoryFiles(workspaceDir)).toEqual([
      { name: 'MEMORY.md', content: 'facts\n' },
    ]);
  });

  test('returns nothing for a workspace that does not exist yet', () => {
    expect(readWorkspaceMemoryFiles(path.join(workspaceDir, 'missing'))).toEqual([]);
  });
});

describe('writeWorkspaceMemoryFile', () => {
  test('writes a file the workspace does not have, creating memory/', () => {
    expect(writeWorkspaceMemoryFile(workspaceDir, 'memory/2026-09-11.md', 'today\n')).toBe(true);
    expect(fs.readFileSync(path.join(workspaceDir, 'memory', '2026-09-11.md'), 'utf8'))
      .toBe('today\n');
  });

  test('does not touch a file whose content already matches', () => {
    writeWorkspaceFile('MEMORY.md', 'facts\n');
    const before = fs.statSync(path.join(workspaceDir, 'MEMORY.md')).mtimeMs;

    expect(writeWorkspaceMemoryFile(workspaceDir, 'MEMORY.md', 'facts\n')).toBe(false);
    expect(fs.statSync(path.join(workspaceDir, 'MEMORY.md')).mtimeMs).toBe(before);
  });

  test('writes when the content differs', () => {
    writeWorkspaceFile('MEMORY.md', 'facts\n');
    expect(writeWorkspaceMemoryFile(workspaceDir, 'MEMORY.md', 'more facts\n')).toBe(true);
    expect(fs.readFileSync(path.join(workspaceDir, 'MEMORY.md'), 'utf8')).toBe('more facts\n');
  });

  test('refuses a name that is not on the list', () => {
    expect(writeWorkspaceMemoryFile(workspaceDir, 'IDENTITY.md', 'no')).toBe(false);
    expect(writeWorkspaceMemoryFile(workspaceDir, '../escaped.md', 'no')).toBe(false);
    expect(fs.existsSync(path.join(workspaceDir, 'IDENTITY.md'))).toBe(false);
  });
});
