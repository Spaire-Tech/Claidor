import { ipcMain, shell } from 'electron';
import fs from 'fs';
import path from 'path';

import {
  type LibraryContentConfig,
  LibraryContentIpc,
  LibraryContentLimits,
  type LibraryContentStatus,
  type LibrarySearchRequest,
  type LibrarySearchResponse,
} from '../../../shared/library/contentConstants';
import type { LibraryContentIndexer } from './libraryContentIndexer';
import type { LibraryContentStore } from './libraryContentStore';

/**
 * The renderer's door to the personal library (Settings → Library), and the
 * request checks shared with the bridge route the agent's tool calls.
 */

export interface LibraryContentIpcDependencies {
  indexer: LibraryContentIndexer;
  store: LibraryContentStore;
  getConfig: () => LibraryContentConfig;
  setConfig: (update: Partial<LibraryContentConfig>) => LibraryContentConfig;
  /** Opens the folder picker; null when the person cancelled. */
  pickFolder: () => Promise<string | null>;
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  !!value && typeof value === 'object' && !Array.isArray(value)
);

/** Absolute, normalised, de-duplicated folder paths; unknown input is dropped. */
export const normalizeLibraryFolders = (value: unknown, options: { mustExist: boolean }): string[] => {
  if (!Array.isArray(value)) return [];
  const folders: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    const trimmed = entry.trim();
    if (!trimmed || !path.isAbsolute(trimmed)) continue;
    const normalized = path.normalize(trimmed).replace(/[\\/]+$/, '') || path.normalize(trimmed);
    if (options.mustExist) {
      try {
        if (!fs.statSync(normalized).isDirectory()) continue;
      } catch {
        continue;
      }
    }
    if (!folders.includes(normalized)) folders.push(normalized);
    if (folders.length >= LibraryContentLimits.MaxFolders) break;
  }
  return folders;
};

export const normalizeLibraryConfigUpdate = (value: unknown): Partial<LibraryContentConfig> => {
  if (!isRecord(value)) throw new Error('Invalid library settings.');
  const update: Partial<LibraryContentConfig> = {};
  if (value.enabled !== undefined) {
    if (typeof value.enabled !== 'boolean') throw new Error('Invalid library switch.');
    update.enabled = value.enabled;
  }
  if (value.folders !== undefined) {
    if (!Array.isArray(value.folders)) throw new Error('Invalid library folders.');
    update.folders = normalizeLibraryFolders(value.folders, { mustExist: true });
  }
  if (value.excludedFolders !== undefined) {
    if (!Array.isArray(value.excludedFolders)) throw new Error('Invalid skipped folders.');
    update.excludedFolders = normalizeLibraryFolders(value.excludedFolders, { mustExist: false });
  }
  return update;
};

/** The same checks for the renderer and the bridge: a real question, a sane limit. */
export const normalizeLibrarySearchRequest = (value: unknown): LibrarySearchRequest => {
  if (!isRecord(value)) throw new Error('Invalid library search.');
  const query = typeof value.query === 'string' ? value.query.trim() : '';
  if (!query) throw new Error('The question is empty.');
  if (query.length > LibraryContentLimits.MaxQueryLength) {
    throw new Error(`The question is longer than ${LibraryContentLimits.MaxQueryLength} characters.`);
  }
  const folder = typeof value.folder === 'string' && value.folder.trim() && path.isAbsolute(value.folder.trim())
    ? path.normalize(value.folder.trim())
    : undefined;
  const rawLimit = typeof value.limit === 'number' && Number.isFinite(value.limit)
    ? Math.trunc(value.limit)
    : LibraryContentLimits.DefaultSearchResults;
  const limit = Math.max(1, Math.min(rawLimit, LibraryContentLimits.MaxSearchResults));
  return { query, ...(folder ? { folder } : {}), limit };
};

const requireIndexedFilePath = (store: LibraryContentStore, value: unknown): string => {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Invalid file path.');
  const document = store.getByFilePath(value.trim());
  if (!document) throw new Error('This file is not in the library.');
  return document.filePath;
};

export const registerLibraryContentIpcHandlers = (deps: LibraryContentIpcDependencies): void => {
  ipcMain.handle(LibraryContentIpc.GetStatus, (): LibraryContentStatus => deps.indexer.getStatus());

  ipcMain.handle(LibraryContentIpc.GetConfig, (): LibraryContentConfig => deps.getConfig());

  ipcMain.handle(LibraryContentIpc.SetConfig, (_event, value: unknown): LibraryContentConfig => {
    const update = normalizeLibraryConfigUpdate(value);
    const config = deps.setConfig(update);
    deps.indexer.applyConfig();
    return config;
  });

  ipcMain.handle(LibraryContentIpc.PickFolder, async (): Promise<string | null> => {
    const picked = await deps.pickFolder();
    if (!picked) return null;
    const [folder] = normalizeLibraryFolders([picked], { mustExist: true });
    return folder ?? null;
  });

  ipcMain.handle(LibraryContentIpc.SetPaused, (_event, value: unknown): LibraryContentStatus => {
    if (typeof value !== 'boolean') throw new Error('Invalid pause value.');
    return deps.indexer.setPaused(value);
  });

  ipcMain.handle(LibraryContentIpc.Rebuild, (): LibraryContentStatus => deps.indexer.rebuild());

  ipcMain.handle(LibraryContentIpc.Search, (_event, value: unknown): Promise<LibrarySearchResponse> => (
    deps.indexer.search(normalizeLibrarySearchRequest(value))
  ));

  ipcMain.handle(LibraryContentIpc.OpenFile, async (_event, value: unknown): Promise<void> => {
    const filePath = requireIndexedFilePath(deps.store, value);
    const error = await shell.openPath(filePath);
    if (error) throw new Error(error);
  });

  ipcMain.handle(LibraryContentIpc.RevealFile, (_event, value: unknown): void => {
    shell.showItemInFolder(requireIndexedFilePath(deps.store, value));
  });
};
