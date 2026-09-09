import { app } from 'electron';
import fs from 'fs';
import path from 'path';

import {
  LIBRARY_EMBEDDING_MODEL_FILES,
  LIBRARY_EMBEDDING_MODEL_ID,
} from '../../../shared/library/contentConstants';

/** Where the library's embedding model and worker script live on disk. */

const MODEL_RESOURCE_DIR = 'embedding-model';
const WORKER_SCRIPT = 'documentWorker.js';

/**
 * The folder that contains Xenova/bge-small-en-v1.5/…
 *
 * Packaged: the extra resource next to the app. In development the app
 * path depends on how Electron was started (the project folder, or
 * `dist-electron` when main.js is passed directly), so the first folder
 * that holds the model wins; the project's `resources/` is the last resort.
 */
export const resolveLibraryModelDir = (): string => {
  if (app.isPackaged) return path.join(process.resourcesPath, MODEL_RESOURCE_DIR);
  const candidates = [
    path.join(app.getAppPath(), 'resources', MODEL_RESOURCE_DIR),
    path.join(app.getAppPath(), '..', 'resources', MODEL_RESOURCE_DIR),
    path.join(__dirname, '..', 'resources', MODEL_RESOURCE_DIR),
  ].map(candidate => path.resolve(candidate));
  return candidates.find(isLibraryModelPresent) ?? candidates[0];
};

/** The built worker script, next to main.js or under dist-electron in development. */
export const resolveLibraryWorkerEntryPath = (): string => {
  const sibling = path.join(__dirname, WORKER_SCRIPT);
  if (fs.existsSync(sibling)) return sibling;
  return path.join(app.getAppPath(), 'dist-electron', WORKER_SCRIPT);
};

/** The model files that are missing from the folder, relative to it. */
export const listMissingLibraryModelFiles = (modelDir: string): string[] => (
  LIBRARY_EMBEDDING_MODEL_FILES.filter((file) => {
    const fullPath = path.join(modelDir, ...LIBRARY_EMBEDDING_MODEL_ID.split('/'), ...file.split('/'));
    try {
      return !fs.statSync(fullPath).isFile();
    } catch {
      return true;
    }
  })
);

export const isLibraryModelPresent = (modelDir: string): boolean => (
  listMissingLibraryModelFiles(modelDir).length === 0
);
