import { describe, expect, test } from 'vitest';

import {
  formatBytes,
  MAX_COPY_BYTES,
  planCopyFromBox,
  planCopyToBox,
  resolveBoxPath,
} from './custody';

const workspaceRoot = '/home/user/workspace';
const file = (size = 10) => async () => ({ isFile: () => true, isDirectory: () => false, size });

describe('where a copy is allowed to land in the box', () => {
  test('a bare name goes into the workspace', () => {
    expect(resolveBoxPath(workspaceRoot, 'notes.txt'))
      .toEqual({ ok: true, path: '/home/user/workspace/notes.txt' });
  });

  test('a subfolder of the workspace is fine', () => {
    expect(resolveBoxPath(workspaceRoot, 'a/b/notes.txt'))
      .toEqual({ ok: true, path: '/home/user/workspace/a/b/notes.txt' });
  });

  /**
   * Without this, a destination like this writes outside the agent's workspace
   * and overwrites a path the person never looked at.
   */
  test('climbing out of the workspace is refused', () => {
    expect(resolveBoxPath(workspaceRoot, '../../etc/passwd')).toMatchObject({ ok: false });
    expect(resolveBoxPath(workspaceRoot, '/etc/passwd')).toMatchObject({ ok: false });
  });

  test('a path that only looks like the workspace is refused', () => {
    expect(resolveBoxPath(workspaceRoot, '/home/user/workspace-other/x'))
      .toMatchObject({ ok: false });
  });

  test('an empty destination is refused rather than guessed at', () => {
    expect(resolveBoxPath(workspaceRoot, '  ')).toMatchObject({ ok: false });
  });
});

describe('copying a file to the box', () => {
  test('is allowed for an ordinary file, and defaults to its own name', async () => {
    const plan = await planCopyToBox({
      localPath: '/Users/me/notes.txt',
      boxPath: '',
      workspaceRoot,
      stat: file(12),
    });
    expect(plan).toEqual({
      ok: true,
      localPath: '/Users/me/notes.txt',
      boxPath: '/home/user/workspace/notes.txt',
      bytes: 12,
    });
  });

  /**
   * "Copy my project" is a different decision from "copy this file", and not
   * one to guess at on the person's behalf.
   */
  test('a folder is refused, not silently flattened', async () => {
    const plan = await planCopyToBox({
      localPath: '/Users/me/project',
      boxPath: '',
      workspaceRoot,
      stat: async () => ({ isFile: () => false, isDirectory: () => true, size: 0 }),
    });
    expect(plan).toMatchObject({ ok: false });
    expect((plan as { reason: string }).reason).toMatch(/folder/i);
  });

  test('a file that is not there says so by name', async () => {
    const plan = await planCopyToBox({
      localPath: '/Users/me/gone.txt',
      boxPath: '',
      workspaceRoot,
      stat: async () => { throw new Error('ENOENT'); },
    });
    expect((plan as { reason: string }).reason).toContain('/Users/me/gone.txt');
  });

  test('a file too large to be meant is refused with both numbers', async () => {
    const plan = await planCopyToBox({
      localPath: '/Users/me/huge.bin',
      boxPath: '',
      workspaceRoot,
      stat: file(MAX_COPY_BYTES + 1),
    });
    expect((plan as { reason: string }).reason).toMatch(/100 MB/);
  });

  test('a relative source is refused, because it is ambiguous', async () => {
    expect(await planCopyToBox({ localPath: 'notes.txt', boxPath: '', workspaceRoot }))
      .toMatchObject({ ok: false });
  });

  test('a destination outside the workspace is refused before the file is read', async () => {
    const plan = await planCopyToBox({
      localPath: '/Users/me/notes.txt',
      boxPath: '/etc/passwd',
      workspaceRoot,
      stat: async () => { throw new Error('stat should not have been called'); },
    });
    expect(plan).toMatchObject({ ok: false });
  });
});

describe('copying a file back out of the box', () => {
  test('is allowed when nothing is in the way', async () => {
    expect(await planCopyFromBox({
      boxPath: 'notes.txt',
      localPath: '/Users/me/notes.txt',
      workspaceRoot,
      exists: async () => false,
    })).toEqual({
      ok: true,
      boxPath: '/home/user/workspace/notes.txt',
      localPath: '/Users/me/notes.txt',
    });
  });

  /**
   * A copy back is usually a new version of something. Losing the old one
   * silently is the kind of thing nobody forgives.
   */
  test('refuses to overwrite without being asked', async () => {
    const plan = await planCopyFromBox({
      boxPath: 'notes.txt',
      localPath: '/Users/me/notes.txt',
      workspaceRoot,
      exists: async () => true,
    });
    expect(plan).toMatchObject({ ok: false });
    expect((plan as { reason: string }).reason).toContain('/Users/me/notes.txt');
  });

  test('overwrites when it is asked to', async () => {
    expect(await planCopyFromBox({
      boxPath: 'notes.txt',
      localPath: '/Users/me/notes.txt',
      workspaceRoot,
      overwrite: true,
      exists: async () => true,
    })).toMatchObject({ ok: true });
  });

  test('a source outside the workspace is refused', async () => {
    expect(await planCopyFromBox({
      boxPath: '../../etc/passwd',
      localPath: '/Users/me/passwd',
      workspaceRoot,
      exists: async () => false,
    })).toMatchObject({ ok: false });
  });

  test('a relative destination is refused', async () => {
    expect(await planCopyFromBox({
      boxPath: 'notes.txt',
      localPath: 'notes.txt',
      workspaceRoot,
      exists: async () => false,
    })).toMatchObject({ ok: false });
  });
});

describe('sizes people read', () => {
  test('are in the unit that suits them', () => {
    expect(formatBytes(512)).toBe('512 bytes');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5 MB');
  });
});
