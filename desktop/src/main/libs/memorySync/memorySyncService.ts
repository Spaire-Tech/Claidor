/**
 * The whole round trip: read the workspace, send it, write back what changed,
 * remember the versions. One run at a time, and never a word to the person —
 * a failure is logged and tried again on the next occasion.
 */

import {
  type MemorySyncReason,
  type MemorySyncResponse,
} from '../../../shared/memorySync/constants';
import {
  buildMemorySyncRequest,
  type MemorySyncClientDeps,
  type MemorySyncVersionStore,
  mergeMemorySyncVersions,
  postMemorySync,
  readMemorySyncVersions,
  writeMemorySyncVersions,
} from './memorySyncClient';
import { readWorkspaceMemoryFiles, writeWorkspaceMemoryFile } from './workspaceMemoryFiles';

const TAG = '[MemorySync]';

export interface MemorySyncResult {
  /** How many files the app sent up. */
  pushed: number;
  /** How many files came down differing from the disk and were written back. */
  pulled: number;
  /** True when the round trip did not run at all. */
  skipped: boolean;
  error?: string;
}

export interface MemorySyncServiceDeps extends MemorySyncClientDeps {
  /** The main agent's workspace, or null while the engine has no state dir. */
  getWorkspaceDir: () => string | null;
  /** False when nobody is signed in: the sync never runs then. */
  isSignedIn: () => boolean;
  getVersionStore: () => MemorySyncVersionStore;
}

export interface MemorySyncService {
  sync(reason: MemorySyncReason): Promise<MemorySyncResult>;
  isRunning(): boolean;
}

function skippedResult(): MemorySyncResult {
  return { pushed: 0, pulled: 0, skipped: true };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function writeBackChangedFiles(
  workspaceDir: string,
  response: MemorySyncResponse,
): number {
  let pulled = 0;
  for (const file of response.files) {
    // `changed` is Claidor's view of the answer it sent; the write itself is
    // still guarded by a content comparison against the disk, so a file this
    // computer has never held is written and an identical one is not.
    if (writeWorkspaceMemoryFile(workspaceDir, file.name, file.content)) {
      pulled += 1;
    }
  }
  return pulled;
}

export function createMemorySyncService(deps: MemorySyncServiceDeps): MemorySyncService {
  let inFlight: Promise<MemorySyncResult> | null = null;

  const runSync = async (reason: MemorySyncReason): Promise<MemorySyncResult> => {
    if (!deps.isSignedIn()) {
      return skippedResult();
    }
    const workspaceDir = deps.getWorkspaceDir();
    if (!workspaceDir) {
      return skippedResult();
    }

    const files = readWorkspaceMemoryFiles(workspaceDir);
    const store = deps.getVersionStore();
    const versions = readMemorySyncVersions(store);
    const request = buildMemorySyncRequest(files, versions);

    let response: MemorySyncResponse;
    try {
      response = await postMemorySync(deps, request);
    } catch (error) {
      // Nothing is written and the versions do not move: the next occasion
      // sends the same bundle again.
      return {
        pushed: 0,
        pulled: 0,
        skipped: false,
        error: errorMessage(error),
      };
    }

    const pulled = writeBackChangedFiles(workspaceDir, response);
    try {
      writeMemorySyncVersions(store, mergeMemorySyncVersions(versions, response));
    } catch (error) {
      console.warn(`${TAG} failed to remember the versions after a sync (reason=${reason}):`, error);
    }
    return { pushed: request.files.length, pulled, skipped: false };
  };

  return {
    isRunning: () => inFlight !== null,
    sync: (reason: MemorySyncReason): Promise<MemorySyncResult> => {
      // The lock: a second caller joins the run already in flight rather than
      // reading and writing the same workspace underneath it.
      if (inFlight) {
        return inFlight;
      }
      const promise = runSync(reason)
        .catch((error): MemorySyncResult => ({
          pushed: 0,
          pulled: 0,
          skipped: false,
          error: errorMessage(error),
        }))
        .finally(() => {
          if (inFlight === promise) {
            inFlight = null;
          }
        });
      inFlight = promise;
      return promise;
    },
  };
}

/** Log one round trip. Never surfaced to the person. */
export function logMemorySyncResult(reason: MemorySyncReason, result: MemorySyncResult): void {
  if (result.error) {
    console.warn(`${TAG} sync failed (reason=${reason}): ${result.error}`);
    return;
  }
  if (result.skipped) {
    console.debug(`${TAG} sync skipped (reason=${reason})`);
    return;
  }
  console.log(
    `${TAG} sync done (reason=${reason}, pushed=${result.pushed}, pulled=${result.pulled})`,
  );
}
