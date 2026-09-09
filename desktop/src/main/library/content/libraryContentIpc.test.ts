import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, test, vi } from 'vitest';

import { LibraryContentLimits } from '../../../shared/library/contentConstants';

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  shell: { openPath: vi.fn(), showItemInFolder: vi.fn() },
}));

const { normalizeLibraryConfigUpdate, normalizeLibraryFolders, normalizeLibrarySearchRequest } = await import('./libraryContentIpc');

describe('normalizeLibrarySearchRequest', () => {
  test('trims the question and applies the default limit', () => {
    expect(normalizeLibrarySearchRequest({ query: '  rent  ' })).toEqual({
      query: 'rent',
      limit: LibraryContentLimits.DefaultSearchResults,
    });
  });

  test('clamps the limit and keeps only an absolute folder', () => {
    expect(normalizeLibrarySearchRequest({ query: 'rent', limit: 999, folder: 'relative/path' })).toEqual({
      query: 'rent',
      limit: LibraryContentLimits.MaxSearchResults,
    });
    expect(normalizeLibrarySearchRequest({ query: 'rent', limit: 0, folder: path.resolve('/tmp/docs') })).toEqual({
      query: 'rent',
      limit: 1,
      folder: path.resolve('/tmp/docs'),
    });
  });

  test('rejects an empty or over-long question and a non-object', () => {
    expect(() => normalizeLibrarySearchRequest({ query: '   ' })).toThrow('empty');
    expect(() => normalizeLibrarySearchRequest({ query: 'x'.repeat(LibraryContentLimits.MaxQueryLength + 1) })).toThrow('longer');
    expect(() => normalizeLibrarySearchRequest('rent')).toThrow('Invalid');
  });
});

describe('normalizeLibraryFolders', () => {
  test('keeps absolute existing folders once, drops the rest', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'swen-folders-'));
    try {
      const folders = normalizeLibraryFolders(
        [root, `${root}${path.sep}`, 'relative', 42, path.join(root, 'missing')],
        { mustExist: true },
      );
      expect(folders).toEqual([root]);
      expect(normalizeLibraryFolders([path.join(root, 'missing')], { mustExist: false })).toEqual([path.join(root, 'missing')]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('caps the number of folders', () => {
    const many = Array.from({ length: LibraryContentLimits.MaxFolders + 5 }, (_, index) => path.resolve(`/f${index}`));
    expect(normalizeLibraryFolders(many, { mustExist: false })).toHaveLength(LibraryContentLimits.MaxFolders);
  });
});

describe('normalizeLibraryConfigUpdate', () => {
  test('accepts a partial update and rejects wrong types', () => {
    expect(normalizeLibraryConfigUpdate({ enabled: false })).toEqual({ enabled: false });
    expect(normalizeLibraryConfigUpdate({ excludedFolders: [path.resolve('/a')] })).toEqual({ excludedFolders: [path.resolve('/a')] });
    expect(() => normalizeLibraryConfigUpdate({ enabled: 'yes' })).toThrow('switch');
    expect(() => normalizeLibraryConfigUpdate({ folders: 'x' })).toThrow('folders');
    expect(() => normalizeLibraryConfigUpdate(null)).toThrow('Invalid');
  });
});
