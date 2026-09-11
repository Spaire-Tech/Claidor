import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import {
  BadMemoryName,
  collectMemoryChanges,
  dailyNoteName,
  isCloudWritable,
  isMemoryName,
  layOutMemory,
} from './memory.js';

let workspace = '';

beforeEach(async () => {
  workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'maty-memory-test-'));
});

afterEach(async () => {
  await fs.rm(workspace, { recursive: true, force: true });
});

describe('the memory file names', () => {
  test('are only the three the contract allows', () => {
    expect(isMemoryName('MEMORY.md')).toBe(true);
    expect(isMemoryName('USER.md')).toBe(true);
    expect(isMemoryName('memory/2026-09-11.md')).toBe(true);
    expect(isMemoryName('AGENTS.md')).toBe(false);
    expect(isMemoryName('memory/notes.md')).toBe(false);
  });

  test('cannot point outside the workspace', () => {
    expect(isMemoryName('../../etc/passwd')).toBe(false);
    expect(isMemoryName('memory/../../escape.md')).toBe(false);
    expect(isMemoryName('/etc/passwd')).toBe(false);
    expect(isMemoryName('memory/2026-09-11.md/../../x')).toBe(false);
  });

  test('say which of them the cloud may write back', () => {
    // The lists merge by union, so both sides may add to them.
    expect(isCloudWritable('MEMORY.md')).toBe(true);
    expect(isCloudWritable('memory/2026-09-11.md')).toBe(true);
    // The profile belongs to the app: a run at night never replaces it.
    expect(isCloudWritable('USER.md')).toBe(false);
  });
});

describe('the daily note', () => {
  test('is named for the day in the person\'s own zone', () => {
    const midnightInParis = new Date('2026-09-11T22:30:00Z');
    expect(dailyNoteName(midnightInParis, 'UTC')).toBe('memory/2026-09-11.md');
    expect(dailyNoteName(midnightInParis, 'Australia/Sydney')).toBe('memory/2026-09-12.md');
  });
});

describe('laying the memory out', () => {
  test('writes every file where the engine expects it', async () => {
    await layOutMemory(workspace, [
      { name: 'MEMORY.md', content: 'a durable fact\n', version: 7 },
      { name: 'memory/2026-09-11.md', content: 'a note\n', version: 1 },
    ]);
    expect(await fs.readFile(path.join(workspace, 'MEMORY.md'), 'utf8')).toBe('a durable fact\n');
    expect(await fs.readFile(path.join(workspace, 'memory', '2026-09-11.md'), 'utf8')).toBe('a note\n');
  });

  test('refuses the whole round when one name is wrong', async () => {
    await expect(
      layOutMemory(workspace, [
        { name: 'MEMORY.md', content: 'fine\n', version: 1 },
        { name: '../escape.md', content: 'not fine\n', version: 1 },
      ]),
    ).rejects.toBeInstanceOf(BadMemoryName);
    // Nothing was written: a client can never half-sync.
    await expect(fs.readFile(path.join(workspace, 'MEMORY.md'), 'utf8')).rejects.toThrow();
  });
});

describe('reading the memory back', () => {
  const laidOut = [
    { name: 'MEMORY.md', content: 'was\n', version: 7 },
    { name: 'USER.md', content: 'the person\n', version: 3 },
    { name: 'memory/2026-09-11.md', content: 'morning\n', version: 1 },
  ];

  test('sends back only what changed, with the version it started from', async () => {
    await layOutMemory(workspace, laidOut);
    await fs.writeFile(path.join(workspace, 'MEMORY.md'), 'was\nand now this\n', 'utf8');
    const changes = await collectMemoryChanges(workspace, laidOut);
    expect(changes).toEqual([{ name: 'MEMORY.md', content: 'was\nand now this\n', base_version: 7 }]);
  });

  test('sends back a note the run wrote for the first time, from version zero', async () => {
    await layOutMemory(workspace, laidOut);
    await fs.writeFile(path.join(workspace, 'memory', '2026-09-12.md'), 'tomorrow\n', 'utf8');
    const changes = await collectMemoryChanges(workspace, laidOut);
    expect(changes).toEqual([{ name: 'memory/2026-09-12.md', content: 'tomorrow\n', base_version: 0 }]);
  });

  test('never sends the profile back, even when the run rewrote it', async () => {
    await layOutMemory(workspace, laidOut);
    await fs.writeFile(path.join(workspace, 'USER.md'), 'rewritten at three in the morning\n', 'utf8');
    expect(await collectMemoryChanges(workspace, laidOut)).toEqual([]);
  });

  test('does not forward a deletion: memory is never taken away quietly', async () => {
    await layOutMemory(workspace, laidOut);
    await fs.rm(path.join(workspace, 'memory', '2026-09-11.md'));
    expect(await collectMemoryChanges(workspace, laidOut)).toEqual([]);
  });

  test('ignores anything the run left that is not a memory file', async () => {
    await layOutMemory(workspace, laidOut);
    await fs.writeFile(path.join(workspace, 'memory', 'scratch.txt'), 'junk\n', 'utf8');
    await fs.writeFile(path.join(workspace, 'AGENTS.md'), 'the instructions\n', 'utf8');
    expect(await collectMemoryChanges(workspace, laidOut)).toEqual([]);
  });
});
