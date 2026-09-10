/**
 * The personal library: the contract shared by the main process, the
 * document worker, the renderer and the OpenClaw extension.
 *
 * The library is an index of the person's own documents, built on the
 * machine (extraction, chunking and a small local embedding model) and kept
 * in the app's own SQLite database. Design note: docs/swen/library.md.
 *
 * Everything that crosses a process boundary is declared here so the pieces
 * agree without importing each other.
 */

/** IPC channels between the renderer and the main process. */
export const LibraryContentIpc = {
  GetStatus: 'libraryContent:getStatus',
  GetConfig: 'libraryContent:getConfig',
  SetConfig: 'libraryContent:setConfig',
  PickFolder: 'libraryContent:pickFolder',
  SetPaused: 'libraryContent:setPaused',
  Rebuild: 'libraryContent:rebuild',
  Search: 'libraryContent:search',
  OpenFile: 'libraryContent:openFile',
  RevealFile: 'libraryContent:revealFile',
  StatusChanged: 'libraryContent:statusChanged',
} as const;
export type LibraryContentIpc = typeof LibraryContentIpc[keyof typeof LibraryContentIpc];

/** The kinds of document the library reads. */
export const LibraryDocumentKind = {
  Word: 'word',
  Pdf: 'pdf',
  Spreadsheet: 'spreadsheet',
  Slides: 'slides',
  Text: 'text',
  Markdown: 'markdown',
  Csv: 'csv',
} as const;
export type LibraryDocumentKind = typeof LibraryDocumentKind[keyof typeof LibraryDocumentKind];

/** File extension (lower case, with the dot) to document kind. */
export const LIBRARY_DOCUMENT_EXTENSIONS: Readonly<Record<string, LibraryDocumentKind>> = {
  '.docx': LibraryDocumentKind.Word,
  '.pdf': LibraryDocumentKind.Pdf,
  '.xlsx': LibraryDocumentKind.Spreadsheet,
  '.xlsm': LibraryDocumentKind.Spreadsheet,
  '.xls': LibraryDocumentKind.Spreadsheet,
  '.pptx': LibraryDocumentKind.Slides,
  '.txt': LibraryDocumentKind.Text,
  '.md': LibraryDocumentKind.Markdown,
  '.markdown': LibraryDocumentKind.Markdown,
  '.csv': LibraryDocumentKind.Csv,
  '.tsv': LibraryDocumentKind.Csv,
};

export const getLibraryDocumentKind = (extension: string): LibraryDocumentKind | null => (
  LIBRARY_DOCUMENT_EXTENSIONS[extension.trim().toLowerCase()] ?? null
);

/** Folder names never entered while scanning. */
export const LIBRARY_SKIPPED_DIRECTORY_NAMES: ReadonlySet<string> = new Set([
  'node_modules', '.git', '.svn', '.hg', '.cowork-temp', '.venv', 'venv', '__pycache__',
  '.cache', '.Trash', '$RECYCLE.BIN', 'Library', '.npm', '.pnpm-store', 'dist', 'build',
  '.next', 'target', '.idea', '.vscode',
]);

export const LibraryContentLimits = {
  /** Files larger than this are recorded with an error and not read. */
  MaxFileBytes: 50 * 1024 * 1024,
  /** Extracted text beyond this is cut; a 2 MB text is already thousands of chunks. */
  MaxTextChars: 2_000_000,
  ChunkChars: 700,
  ChunkOverlapChars: 100,
  MaxChunksPerDocument: 3_000,
  EmbeddingDimensions: 384,
  /** Passages returned to the model per question. */
  DefaultSearchResults: 8,
  MaxSearchResults: 20,
  MaxQueryLength: 500,
  /** Keyword candidates fetched from FTS5 before the cosine rerank. */
  KeywordCandidateLimit: 200,
  /** Vectors scanned when keywords find nothing (whole index, capped). */
  VectorScanLimit: 20_000,
  WatchDebounceMs: 300,
  WorkerConcurrency: 2,
  /** How long one document may take in the worker before it is failed. */
  DocumentTimeoutMs: 120_000,
  /** How many times a failed document is retried across sessions. */
  MaxAttempts: 3,
  MaxFolders: 32,
  /** Full re-scan of the folders, in case a watcher missed something. */
  RescanIntervalMs: 30 * 60_000,
  StatusThrottleMs: 500,
} as const;

/** What the indexer is doing right now. */
export const LibraryContentPhase = {
  /** The library is switched off in Settings. */
  Off: 'off',
  /** The embedding model is loading in the worker. */
  Starting: 'starting',
  /** Walking the folders to find documents. */
  Scanning: 'scanning',
  /** Documents are queued and being read. */
  Indexing: 'indexing',
  /** Everything known is indexed. */
  Idle: 'idle',
  /** The person pressed Pause; watchers still record changes. */
  Paused: 'paused',
  /** The worker could not start (model missing, crash). */
  Error: 'error',
} as const;
export type LibraryContentPhase = typeof LibraryContentPhase[keyof typeof LibraryContentPhase];

/** Persisted settings. Stored on CoworkConfig as libraryEnabled / libraryFolders / libraryExcludedFolders. */
export interface LibraryContentConfig {
  enabled: boolean;
  /** Absolute folder paths that are indexed, recursively. */
  folders: string[];
  /** Absolute folder paths inside the above that are skipped. */
  excludedFolders: string[];
}

export interface LibraryContentStatus {
  phase: LibraryContentPhase;
  documentCount: number;
  chunkCount: number;
  /** Documents waiting for the worker. */
  queuedCount: number;
  /** Documents that could not be read after the retries. */
  failedCount: number;
  /** Documents that are only in a cloud drive (iCloud) and not on this machine. */
  cloudOnlyCount: number;
  /** Bytes used by the index tables, when known. */
  indexBytes?: number;
  /** When the last document finished, epoch ms. */
  lastIndexedAt?: number;
  /** When the last full scan finished, epoch ms. */
  lastScanAt?: number;
  modelReady: boolean;
  /** Set with phase Error; plain words for the person. */
  error?: string;
  folders: string[];
}

/** Where a passage sits inside its document. Only one of the fields is set, if any. */
export interface LibraryChunkLocator {
  page?: number;
  sheet?: string;
  slide?: number;
  heading?: string;
}

/** « page 3 », « sheet Budget », « slide 7 », « under Scope », or ''. */
export const formatLibraryLocator = (locator: LibraryChunkLocator | null | undefined): string => {
  if (!locator) return '';
  if (typeof locator.page === 'number') return `page ${locator.page}`;
  if (typeof locator.slide === 'number') return `slide ${locator.slide}`;
  if (locator.sheet) return `sheet ${locator.sheet}`;
  if (locator.heading) return `under ${locator.heading}`;
  return '';
};

export interface LibrarySearchRequest {
  query: string;
  /** Only passages from files under this folder (absolute path). */
  folder?: string;
  /** 1..MaxSearchResults; defaults to DefaultSearchResults. */
  limit?: number;
}

export interface LibrarySearchHit {
  documentId: string;
  filePath: string;
  fileName: string;
  kind: LibraryDocumentKind;
  locator: LibraryChunkLocator;
  /** The passage itself. */
  text: string;
  /** 0..1, higher is closer. Cosine similarity when a vector is available. */
  score: number;
  /** Epoch ms of the file when it was indexed. */
  modifiedAt: number;
}

export interface LibrarySearchResponse {
  hits: LibrarySearchHit[];
  /** Documents in the index at the time of the search. */
  documentCount: number;
  /** False while the model is still loading or the library is off; hits are keyword-only then. */
  vectorsUsed: boolean;
  /** Milliseconds spent, for the log line. */
  tookMs: number;
}

/** The bridge route the OpenClaw extension calls (McpBridgeServer). */
export const LIBRARY_BRIDGE_SEARCH_PATH = '/library/search';
/** The tool name the model sees. */
export const LIBRARY_SEARCH_TOOL_NAME = 'search_library';
/** The extension folder under openclaw-extensions/ and its plugin id. */
export const LIBRARY_SEARCH_PLUGIN_ID = 'search-library';

// ---------------------------------------------------------------------------
// The document worker (a utilityProcess owned by the main process).
// Messages are structured-cloned, so Float32Array travels as itself.

export const LibraryWorkerMessageType = {
  /** main → worker: load the model from this folder. */
  Init: 'init',
  /** worker → main: model loaded (or failed with an error). */
  Ready: 'ready',
  /** main → worker: read, chunk and embed one file. */
  IndexDocument: 'indexDocument',
  /** worker → main: the chunks with their vectors. */
  DocumentIndexed: 'documentIndexed',
  /** main → worker: embed one query string. */
  EmbedQuery: 'embedQuery',
  /** worker → main: the query vector. */
  QueryEmbedded: 'queryEmbedded',
  /** worker → main: a request failed. */
  Failed: 'failed',
} as const;
export type LibraryWorkerMessageType =
  typeof LibraryWorkerMessageType[keyof typeof LibraryWorkerMessageType];

export interface LibraryWorkerInitMessage {
  type: typeof LibraryWorkerMessageType.Init;
  /** Folder that contains Xenova/bge-small-en-v1.5/… */
  modelDir: string;
}

export interface LibraryWorkerReadyMessage {
  type: typeof LibraryWorkerMessageType.Ready;
  ok: boolean;
  error?: string;
  /** Milliseconds to load the model. */
  loadMs: number;
}

export interface LibraryWorkerIndexDocumentMessage {
  type: typeof LibraryWorkerMessageType.IndexDocument;
  requestId: string;
  filePath: string;
  kind: LibraryDocumentKind;
}

export interface LibraryWorkerChunk {
  ordinal: number;
  locator: LibraryChunkLocator;
  text: string;
  vector: Float32Array;
}

export interface LibraryWorkerDocumentIndexedMessage {
  type: typeof LibraryWorkerMessageType.DocumentIndexed;
  requestId: string;
  title: string;
  /** Pages, sheets or slides; 0 when the kind has none. */
  pageCount: number;
  /** Characters of text extracted before chunking. */
  textChars: number;
  chunks: LibraryWorkerChunk[];
  extractMs: number;
  embedMs: number;
}

export interface LibraryWorkerEmbedQueryMessage {
  type: typeof LibraryWorkerMessageType.EmbedQuery;
  requestId: string;
  text: string;
}

export interface LibraryWorkerQueryEmbeddedMessage {
  type: typeof LibraryWorkerMessageType.QueryEmbedded;
  requestId: string;
  vector: Float32Array;
}

export interface LibraryWorkerFailedMessage {
  type: typeof LibraryWorkerMessageType.Failed;
  requestId: string;
  error: string;
  /** True when trying again later cannot help (unsupported content, corrupt file). */
  permanent?: boolean;
}

export type LibraryWorkerRequest =
  | LibraryWorkerInitMessage
  | LibraryWorkerIndexDocumentMessage
  | LibraryWorkerEmbedQueryMessage;

export type LibraryWorkerResponse =
  | LibraryWorkerReadyMessage
  | LibraryWorkerDocumentIndexedMessage
  | LibraryWorkerQueryEmbeddedMessage
  | LibraryWorkerFailedMessage;

/** Model files shipped inside the installer, relative to the model folder. */
export const LIBRARY_EMBEDDING_MODEL_ID = 'Xenova/bge-small-en-v1.5';
export const LIBRARY_EMBEDDING_MODEL_FILES = [
  'config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'onnx/model_quantized.onnx',
] as const;

export const isLibraryDocumentKind = (value: unknown): value is LibraryDocumentKind => (
  typeof value === 'string'
  && Object.values(LibraryDocumentKind).includes(value as LibraryDocumentKind)
);

export const isLibraryContentPhase = (value: unknown): value is LibraryContentPhase => (
  typeof value === 'string'
  && Object.values(LibraryContentPhase).includes(value as LibraryContentPhase)
);
