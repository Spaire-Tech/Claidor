/**
 * The request to Claidor: every memory file the app has, each with the version
 * it last saw, answered by the merged truth.
 *
 * The bearer token is not held here. The caller passes the app's existing
 * authenticated-request path (`fetchWithAuth`), which already signs the
 * request and refreshes the token on a 401.
 */

import {
  isSyncedMemoryName,
  MEMORY_SYNC_ROUTE,
  MEMORY_SYNC_UNSEEN_VERSION,
  type MemorySyncRequest,
  type MemorySyncRequestFile,
  type MemorySyncResponse,
  type MemorySyncResponseFile,
} from '../../../shared/memorySync/constants';
import type { WorkspaceMemoryFile } from './workspaceMemoryFiles';

/** One kv key holds the whole bookkeeping, so a reinstall re-merges rather than loses. */
export const MEMORY_SYNC_VERSIONS_STORE_KEY = 'memory.sync.versions';

const MEMORY_SYNC_REQUEST_TIMEOUT_MS = 20_000;

/** Name to the version the app last saw from Claidor for that name. */
export type MemorySyncVersions = Record<string, number>;

/** The slice of the app's kv store this module needs. */
export interface MemorySyncVersionStore {
  get<T = unknown>(key: string): T | undefined;
  set<T = unknown>(key: string, value: T): void;
}

export interface MemorySyncClientDeps {
  /** The account protocol base URL, e.g. `https://api.claidor.com/desktop`. */
  getServerBaseUrl: () => string;
  fetchWithAuth: (url: string, options?: RequestInit) => Promise<Response>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function readVersionNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return Math.floor(value);
}

/** Keep only accepted names and sane versions, whatever the store holds. */
export function sanitizeMemorySyncVersions(value: unknown): MemorySyncVersions {
  if (!isRecord(value)) {
    return {};
  }
  const versions: MemorySyncVersions = {};
  for (const [name, raw] of Object.entries(value)) {
    const version = readVersionNumber(raw);
    if (version === null || !isSyncedMemoryName(name)) continue;
    versions[name] = version;
  }
  return versions;
}

export function readMemorySyncVersions(store: MemorySyncVersionStore): MemorySyncVersions {
  try {
    return sanitizeMemorySyncVersions(store.get(MEMORY_SYNC_VERSIONS_STORE_KEY));
  } catch (error) {
    console.warn('[MemorySync] failed to read the last-seen versions:', error);
    return {};
  }
}

export function writeMemorySyncVersions(
  store: MemorySyncVersionStore,
  versions: MemorySyncVersions,
): void {
  store.set(MEMORY_SYNC_VERSIONS_STORE_KEY, versions);
}

/** Pure: pair every file the app has with the version it last saw for it. */
export function buildMemorySyncRequest(
  files: WorkspaceMemoryFile[],
  versions: MemorySyncVersions,
): MemorySyncRequest {
  const requestFiles: MemorySyncRequestFile[] = files
    .filter(file => isSyncedMemoryName(file.name))
    .map(file => ({
      name: file.name,
      content: file.content,
      base_version: versions[file.name] ?? MEMORY_SYNC_UNSEEN_VERSION,
    }));
  return { files: requestFiles };
}

/**
 * Pure: the versions to remember after an answer — what Claidor now holds,
 * minus what it says it deleted.
 */
export function mergeMemorySyncVersions(
  previous: MemorySyncVersions,
  response: MemorySyncResponse,
): MemorySyncVersions {
  const versions: MemorySyncVersions = { ...previous };
  for (const file of response.files) {
    versions[file.name] = file.version;
  }
  for (const name of response.deleted) {
    delete versions[name];
  }
  return versions;
}

function parseResponseFile(value: unknown): MemorySyncResponseFile | null {
  if (!isRecord(value) || !isSyncedMemoryName(value.name)) {
    return null;
  }
  if (typeof value.content !== 'string') {
    return null;
  }
  const version = readVersionNumber(value.version);
  if (version === null) {
    return null;
  }
  return {
    name: value.name,
    content: value.content,
    version,
    changed: value.changed === true,
  };
}

/**
 * Pure: read the answer. Claidor's account protocol wraps its payloads in
 * `{ code, data }`, so both the wrapped and the bare body are accepted.
 */
export function parseMemorySyncResponse(body: unknown): MemorySyncResponse {
  if (!isRecord(body)) {
    throw new Error('Memory sync answer was not an object');
  }
  const code = readVersionNumber(body.code);
  if (code !== null && code !== 0) {
    const message = typeof body.message === 'string' && body.message
      ? body.message
      : `code ${code}`;
    throw new Error(`Memory sync was refused: ${message}`);
  }
  const payload = isRecord(body.data) ? body.data : body;
  if (!Array.isArray(payload.files)) {
    throw new Error('Memory sync answer carried no files');
  }
  const files: MemorySyncResponseFile[] = [];
  for (const entry of payload.files) {
    const file = parseResponseFile(entry);
    if (file) files.push(file);
  }
  const deleted = Array.isArray(payload.deleted)
    ? payload.deleted.filter((name): name is string => isSyncedMemoryName(name))
    : [];
  return { files, deleted };
}

/** A refusal answers `{ code, message }`; anything else logs as the status alone. */
async function readRefusalMessage(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (isRecord(body) && typeof body.message === 'string' && body.message) {
      return ` (${body.message})`;
    }
  } catch {
    // The status on its own is enough for the log.
  }
  return '';
}

export function getMemorySyncUrl(serverBaseUrl: string): string {
  return `${serverBaseUrl}${MEMORY_SYNC_ROUTE}`;
}

/** Send the bundle and return the merged truth. Throws on any failure. */
export async function postMemorySync(
  deps: MemorySyncClientDeps,
  request: MemorySyncRequest,
): Promise<MemorySyncResponse> {
  const response = await deps.fetchWithAuth(getMemorySyncUrl(deps.getServerBaseUrl()), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(MEMORY_SYNC_REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(
      `Memory sync request failed with HTTP ${response.status}${await readRefusalMessage(response)}`,
    );
  }
  return parseMemorySyncResponse(await response.json());
}
