import path from 'path';

import { chunkLibrarySections, deriveLibraryTitle } from '../../../shared/library/chunker';
import {
  type LibraryDocumentKind,
  type LibraryWorkerChunk,
  type LibraryWorkerFailedMessage,
  LibraryWorkerMessageType,
  type LibraryWorkerReadyMessage,
  type LibraryWorkerRequest,
  type LibraryWorkerResponse,
} from '../../../shared/library/contentConstants';
import type { LibraryEmbedFunction } from './embeddingModel';
import type { LibraryExtractionResult } from './extractors';

/**
 * The document worker's request handling, kept free of process plumbing so
 * it runs under plain Node in the tests with a fake embedder.
 */

export interface LibraryWorkerCoreDeps {
  extract: (filePath: string, kind: LibraryDocumentKind) => Promise<LibraryExtractionResult>;
  /** Null until the model is loaded. */
  embed: LibraryEmbedFunction | null;
  /** Loads the model from the folder; required for `init`. */
  loadModel?: (modelDir: string) => Promise<LibraryEmbedFunction>;
  /** Called after a successful `init` with the embedder to keep. */
  onModelLoaded?: (embed: LibraryEmbedFunction) => void;
  now?: () => number;
}

export const NO_TEXT_FOUND_ERROR = 'no text found';
export const MODEL_NOT_LOADED_ERROR = 'model not loaded';

/** Failures that trying again later cannot fix. */
const PERMANENT_ERROR_PATTERNS: readonly RegExp[] = [
  /^too large/i,
  /^unsupported/i,
  /^corrupt file/i,
  /^no text found/i,
  /^bad request/i,
  /end of central directory/i,
  /not a valid zip/i,
  /invalid pdf structure/i,
  /unexpected (?:token|end of (?:xml|data|input))/i,
];

export const isPermanentLibraryError = (message: string): boolean => (
  PERMANENT_ERROR_PATTERNS.some(pattern => pattern.test(message))
);

export const errorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message || error.name;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
};

const failed = (requestId: string, error: unknown, permanent?: boolean): LibraryWorkerFailedMessage => {
  const message = errorMessage(error);
  return {
    type: LibraryWorkerMessageType.Failed,
    requestId,
    error: message,
    permanent: permanent ?? isPermanentLibraryError(message),
  };
};

const requestIdOf = (request: unknown): string => {
  const candidate = (request as { requestId?: unknown } | null)?.requestId;
  return typeof candidate === 'string' ? candidate : '';
};

const handleInit = async (
  modelDir: string,
  deps: LibraryWorkerCoreDeps,
  now: () => number,
): Promise<LibraryWorkerReadyMessage> => {
  const started = now();
  if (!deps.loadModel) {
    return { type: LibraryWorkerMessageType.Ready, ok: false, loadMs: 0, error: 'no model loader' };
  }
  try {
    const embed = await deps.loadModel(modelDir);
    deps.onModelLoaded?.(embed);
    return { type: LibraryWorkerMessageType.Ready, ok: true, loadMs: now() - started };
  } catch (error) {
    return {
      type: LibraryWorkerMessageType.Ready,
      ok: false,
      loadMs: now() - started,
      error: errorMessage(error),
    };
  }
};

const handleIndexDocument = async (
  requestId: string,
  filePath: string,
  kind: LibraryDocumentKind,
  deps: LibraryWorkerCoreDeps,
  now: () => number,
): Promise<LibraryWorkerResponse> => {
  if (!deps.embed) return failed(requestId, MODEL_NOT_LOADED_ERROR, false);
  if (typeof filePath !== 'string' || !filePath) return failed(requestId, 'bad request: missing filePath', true);
  const extractStarted = now();
  const { sections, pageCount } = await deps.extract(filePath, kind);
  const extractMs = now() - extractStarted;
  if (sections.length === 0) return failed(requestId, NO_TEXT_FOUND_ERROR, true);
  const textChars = sections.reduce((total, section) => total + section.text.length, 0);
  const pieces = chunkLibrarySections(sections);
  const embedStarted = now();
  const vectors = pieces.length > 0 ? await deps.embed(pieces.map(piece => piece.text)) : [];
  const embedMs = now() - embedStarted;
  if (vectors.length !== pieces.length) {
    return failed(requestId, `embedder returned ${vectors.length} vectors for ${pieces.length} chunks`, false);
  }
  const chunks: LibraryWorkerChunk[] = pieces.map((piece, index) => ({
    ordinal: piece.ordinal,
    locator: piece.locator,
    text: piece.text,
    vector: vectors[index] instanceof Float32Array ? vectors[index] : Float32Array.from(vectors[index]),
  }));
  return {
    type: LibraryWorkerMessageType.DocumentIndexed,
    requestId,
    title: deriveLibraryTitle(sections, path.basename(filePath)),
    pageCount,
    textChars,
    chunks,
    extractMs,
    embedMs,
  };
};

const handleEmbedQuery = async (
  requestId: string,
  text: string,
  deps: LibraryWorkerCoreDeps,
): Promise<LibraryWorkerResponse> => {
  if (!deps.embed) return failed(requestId, MODEL_NOT_LOADED_ERROR, false);
  if (typeof text !== 'string' || !text.trim()) return failed(requestId, 'bad request: empty query', true);
  const [vector] = await deps.embed([text]);
  if (!vector) return failed(requestId, 'embedder returned no vector', false);
  return {
    type: LibraryWorkerMessageType.QueryEmbedded,
    requestId,
    vector: vector instanceof Float32Array ? vector : Float32Array.from(vector),
  };
};

/**
 * Turns one request into its reply. Never throws: any failure becomes a
 * `failed` reply (or a `ready` with ok false for `init`).
 */
export const handleLibraryWorkerRequest = async (
  request: LibraryWorkerRequest | unknown,
  deps: LibraryWorkerCoreDeps,
): Promise<LibraryWorkerResponse> => {
  const now = deps.now ?? (() => Date.now());
  const requestId = requestIdOf(request);
  try {
    if (typeof request !== 'object' || request === null) {
      return failed(requestId, 'bad request: not an object', true);
    }
    const message = request as LibraryWorkerRequest;
    switch (message.type) {
      case LibraryWorkerMessageType.Init:
        return await handleInit(message.modelDir, deps, now);
      case LibraryWorkerMessageType.IndexDocument:
        return await handleIndexDocument(requestId, message.filePath, message.kind, deps, now);
      case LibraryWorkerMessageType.EmbedQuery:
        return await handleEmbedQuery(requestId, message.text, deps);
      default:
        return failed(requestId, `bad request: unknown type ${String((message as { type?: unknown }).type)}`, true);
    }
  } catch (error) {
    return failed(requestId, error);
  }
};
