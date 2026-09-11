/**
 * The workspace half of the shared memory: reading the synced files out of the
 * main agent's workspace, and writing back only what actually differs.
 *
 * Everything that can be decided without the disk is a pure function here; the
 * file system part is deliberately small.
 */

import fs from 'fs';
import path from 'path';

import {
  isSyncedMemoryName,
  MEMORY_SYNC_DAILY_DIRECTORY,
  MEMORY_SYNC_FILE_EXTENSION,
  SyncedMemoryFile,
} from '../../../shared/memorySync/constants';

const TAG = '[MemorySync]';

export interface WorkspaceMemoryFile {
  name: string;
  content: string;
}

/**
 * Resolve a synced name to a path inside the workspace.
 * Returns null for anything the name rule rejects.
 */
export function resolveWorkspaceMemoryPath(
  workspaceDir: string,
  name: string,
): string | null {
  if (!isSyncedMemoryName(name)) {
    return null;
  }
  return path.join(workspaceDir, ...name.split('/'));
}

/**
 * The synced names a workspace offers, given the raw listing of its `memory/`
 * directory. Stable order: the durable facts, the profile, then the daily
 * notes oldest first.
 */
export function collectSyncedMemoryNames(dailyEntries: string[]): string[] {
  const dailyNames = dailyEntries
    .filter(entry => entry.endsWith(MEMORY_SYNC_FILE_EXTENSION))
    .map(entry => `${MEMORY_SYNC_DAILY_DIRECTORY}/${entry}`)
    .filter(name => isSyncedMemoryName(name))
    .sort();
  return [SyncedMemoryFile.Memory, SyncedMemoryFile.User, ...dailyNames];
}

function listDailyEntries(workspaceDir: string): string[] {
  const dailyDir = path.join(workspaceDir, MEMORY_SYNC_DAILY_DIRECTORY);
  try {
    return fs.readdirSync(dailyDir, { withFileTypes: true })
      .filter(entry => entry.isFile())
      .map(entry => entry.name);
  } catch {
    // A workspace with no daily notes yet simply has no directory.
    return [];
  }
}

function readFileIfPresent(filePath: string): string | null {
  try {
    if (!fs.statSync(filePath).isFile()) {
      return null;
    }
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Read every synced file the workspace has. Missing files are left out; the
 * app-owned files are never looked at.
 */
export function readWorkspaceMemoryFiles(workspaceDir: string): WorkspaceMemoryFile[] {
  const files: WorkspaceMemoryFile[] = [];
  for (const name of collectSyncedMemoryNames(listDailyEntries(workspaceDir))) {
    const filePath = resolveWorkspaceMemoryPath(workspaceDir, name);
    if (!filePath) continue;
    const content = readFileIfPresent(filePath);
    if (content === null) continue;
    files.push({ name, content });
  }
  return files;
}

/**
 * Write one synced file back into the workspace, but only when the content
 * differs from what is on disk. Returns true when the file was written.
 */
export function writeWorkspaceMemoryFile(
  workspaceDir: string,
  name: string,
  content: string,
): boolean {
  const filePath = resolveWorkspaceMemoryPath(workspaceDir, name);
  if (!filePath) {
    console.warn(`${TAG} refused to write an unaccepted memory file name: ${name}`);
    return false;
  }
  if (readFileIfPresent(filePath) === content) {
    return false;
  }
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
    return true;
  } catch (error) {
    console.error(`${TAG} failed to write ${name} into the workspace:`, error);
    return false;
  }
}
