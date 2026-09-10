import type Database from 'better-sqlite3';
import crypto from 'crypto';
import path from 'path';

import {
  type LibraryChunkLocator,
  LibraryContentLimits,
  type LibraryDocumentKind,
  type LibrarySearchHit,
} from '../../../shared/library/contentConstants';

/**
 * The personal library's index, in the app's own SQLite database.
 *
 * One row per document, its passages, an FTS5 table for keywords and one
 * 384-number vector per passage. A question is answered by taking keyword
 * candidates from FTS5, scanning the vectors for the closest passages, and
 * blending the two scores (docs/swen/library.md).
 */

export const LibraryDocumentStatus = {
  /** Found on disk, waiting for the worker. */
  Pending: 'pending',
  Indexed: 'indexed',
  /** Could not be read; `attempts` says how many times we tried. */
  Failed: 'failed',
  /** Only in a cloud drive (iCloud) and not on this machine; read once it arrives. */
  CloudOnly: 'cloud_only',
} as const;
export type LibraryDocumentStatus = typeof LibraryDocumentStatus[keyof typeof LibraryDocumentStatus];

export interface LibraryDocumentFile {
  filePath: string;
  kind: LibraryDocumentKind;
  sizeBytes: number;
  fileMtimeMs: number;
  /** True when the file is a cloud placeholder with no bytes on this machine. */
  cloudOnly?: boolean;
}

export interface LibraryDocumentRecord {
  id: string;
  pathKey: string;
  filePath: string;
  fileName: string;
  folder: string;
  kind: LibraryDocumentKind;
  title: string;
  sizeBytes: number;
  fileMtimeMs: number;
  pageCount: number;
  chunkCount: number;
  status: LibraryDocumentStatus;
  attempts: number;
  error: string | null;
  indexedAt: number | null;
}

export interface LibraryIndexedChunk {
  ordinal: number;
  locator: LibraryChunkLocator;
  text: string;
  vector: Float32Array;
}

export interface LibraryIndexedDocument {
  title: string;
  pageCount: number;
  textChars: number;
  chunks: LibraryIndexedChunk[];
}

export interface LibraryContentCounts {
  indexed: number;
  pending: number;
  failed: number;
  cloudOnly: number;
  chunks: number;
  lastIndexedAt: number | null;
  /** Bytes of passage text and vectors, an estimate of the index size. */
  indexBytes: number;
}

export interface LibrarySearchOptions {
  folder?: string;
  limit?: number;
  /** Candidates from keywords before the rerank. */
  keywordCandidates?: number;
  /** Passages per document in the final list. */
  perDocument?: number;
}

interface DocumentRow {
  id: string;
  path_key: string;
  file_path: string;
  file_name: string;
  folder: string;
  kind: LibraryDocumentKind;
  title: string;
  size_bytes: number;
  file_mtime_ms: number;
  page_count: number;
  chunk_count: number;
  status: LibraryDocumentStatus;
  attempts: number;
  error: string | null;
  indexed_at: number | null;
}

interface ChunkRow {
  id: number;
  document_id: string;
  ordinal: number;
  locator: string;
  text: string;
  rank?: number;
}

interface VectorCache {
  chunkIds: Int32Array;
  matrix: Float32Array;
}

const KEYWORD_WEIGHT = 0.35;
const VECTOR_WEIGHT = 0.65;
const DIMENSIONS = LibraryContentLimits.EmbeddingDimensions;

/** The same key rule as the artifact library: case-folded, forward slashes on Windows. */
export const buildLibraryPathKey = (filePath: string): string => {
  const normalized = path.normalize(filePath);
  return process.platform === 'win32'
    ? normalized.replace(/\\/g, '/').toLowerCase()
    : normalized;
};

const escapeLike = (value: string): string => value.replace(/[\\%_]/g, match => `\\${match}`);

const STOP_WORDS: ReadonlySet<string> = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'to', 'in', 'on', 'at', 'for', 'by', 'with', 'from', 'about',
  'is', 'are', 'was', 'were', 'be', 'been', 'do', 'does', 'did', 'has', 'have', 'had', 'can', 'could',
  'will', 'would', 'should', 'may', 'might', 'it', 'its', 'this', 'that', 'these', 'those', 'there',
  'what', 'which', 'who', 'whom', 'whose', 'when', 'where', 'why', 'how', 'much', 'many', 'any', 'some',
  'my', 'me', 'our', 'we', 'you', 'your', 'i', 'us', 'them', 'they', 'their', 'he', 'she', 'his', 'her',
  'please', 'find', 'tell', 'show', 'look', 'up', 'out', 'into', 'as', 'if', 'so', 'not', 'no', 'yes',
  'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'et', 'ou', 'est', 'que', 'qui', 'dans', 'pour',
]);

/**
 * Turns a question into an FTS5 query: every word becomes a quoted prefix
 * term, joined with OR, so a passage matching any of them is a candidate
 * and bm25 ranks the ones matching more of them higher.
 */
export const buildLibraryFtsQuery = (query: string): string | null => {
  const words = query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .map(word => word.trim())
    .filter(word => word.length > 1);
  if (words.length === 0) return null;
  // Question words carry no meaning for the index; keep them only when
  // nothing else is left.
  const meaningful = words.filter(word => !STOP_WORDS.has(word));
  const unique = [...new Set(meaningful.length > 0 ? meaningful : words)].slice(0, 32);
  return unique.map(word => `"${word.replace(/"/g, '""')}"*`).join(' OR ');
};

const parseLocator = (raw: string): LibraryChunkLocator => {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as LibraryChunkLocator;
    }
  } catch {
    // fall through
  }
  return {};
};

const toRecord = (row: DocumentRow): LibraryDocumentRecord => ({
  id: row.id,
  pathKey: row.path_key,
  filePath: row.file_path,
  fileName: row.file_name,
  folder: row.folder,
  kind: row.kind,
  title: row.title,
  sizeBytes: row.size_bytes,
  fileMtimeMs: row.file_mtime_ms,
  pageCount: row.page_count,
  chunkCount: row.chunk_count,
  status: row.status,
  attempts: row.attempts,
  error: row.error,
  indexedAt: row.indexed_at,
});

const vectorToBuffer = (vector: Float32Array): Buffer => {
  if (vector.length !== DIMENSIONS) {
    throw new Error(`Vector has ${vector.length} numbers, expected ${DIMENSIONS}.`);
  }
  return Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength);
};

const bufferToVector = (buffer: Buffer): Float32Array => {
  // Copy byte for byte: a Buffer out of SQLite may not be 4-byte aligned.
  const aligned = new Float32Array(DIMENSIONS);
  const bytes = new Uint8Array(aligned.buffer);
  bytes.set(buffer.subarray(0, Math.min(buffer.byteLength, bytes.byteLength)));
  return aligned;
};

const isUnderFolder = (filePath: string, folder: string): boolean => {
  const relative = path.relative(folder, filePath);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
};

export class LibraryContentStore {
  private vectorCache: VectorCache | null = null;

  constructor(private readonly db: Database.Database) {}

  // ---------------------------------------------------------------- documents

  getByPathKey(pathKey: string): LibraryDocumentRecord | null {
    const row = this.db
      .prepare('SELECT * FROM library_documents WHERE path_key = ?')
      .get(pathKey) as DocumentRow | undefined;
    return row ? toRecord(row) : null;
  }

  getById(id: string): LibraryDocumentRecord | null {
    const row = this.db
      .prepare('SELECT * FROM library_documents WHERE id = ?')
      .get(id) as DocumentRow | undefined;
    return row ? toRecord(row) : null;
  }

  getByFilePath(filePath: string): LibraryDocumentRecord | null {
    return this.getByPathKey(buildLibraryPathKey(filePath));
  }

  listAll(): LibraryDocumentRecord[] {
    const rows = this.db.prepare('SELECT * FROM library_documents').all() as DocumentRow[];
    return rows.map(toRecord);
  }

  listPending(limit = 1_000): LibraryDocumentRecord[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM library_documents
         WHERE status = ? AND attempts < ?
         ORDER BY updated_at ASC
         LIMIT ?`,
      )
      .all(LibraryDocumentStatus.Pending, LibraryContentLimits.MaxAttempts, limit) as DocumentRow[];
    return rows.map(toRecord);
  }

  /**
   * Records a file seen on disk. Returns the document and whether it needs
   * (re)indexing: a new file, or one whose size or modified time changed.
   * A file that failed permanently is not retried until it changes.
   */
  upsertSeenFile(file: LibraryDocumentFile): { document: LibraryDocumentRecord; needsIndexing: boolean } {
    const pathKey = buildLibraryPathKey(file.filePath);
    const now = Date.now();
    const existing = this.getByPathKey(pathKey);
    if (file.cloudOnly) {
      // Nothing to read yet. Remember the file so the count is honest, and
      // read it when a later scan finds its bytes on the machine.
      if (existing) {
        if (existing.status !== LibraryDocumentStatus.CloudOnly) {
          this.markCloudOnly(existing.id);
        }
        return { document: this.getById(existing.id)!, needsIndexing: false };
      }
      const id = this.insertDocument(pathKey, file, LibraryDocumentStatus.CloudOnly, now);
      return { document: this.getById(id)!, needsIndexing: false };
    }
    if (existing) {
      const unchanged = existing.sizeBytes === file.sizeBytes && existing.fileMtimeMs === file.fileMtimeMs;
      if (unchanged && existing.status === LibraryDocumentStatus.Indexed) {
        return { document: existing, needsIndexing: false };
      }
      if (unchanged && existing.status === LibraryDocumentStatus.Failed) {
        const retryable = existing.attempts < LibraryContentLimits.MaxAttempts;
        return { document: existing, needsIndexing: retryable };
      }
      if (unchanged && existing.status === LibraryDocumentStatus.Pending) {
        return { document: existing, needsIndexing: true };
      }
      this.db
        .prepare(
          `UPDATE library_documents
           SET file_path = ?, file_name = ?, folder = ?, kind = ?, size_bytes = ?, file_mtime_ms = ?,
               status = ?, attempts = 0, error = NULL, updated_at = ?
           WHERE id = ?`,
        )
        .run(
          file.filePath,
          path.basename(file.filePath),
          path.dirname(file.filePath),
          file.kind,
          file.sizeBytes,
          file.fileMtimeMs,
          LibraryDocumentStatus.Pending,
          now,
          existing.id,
        );
      return { document: this.getById(existing.id)!, needsIndexing: true };
    }
    const id = this.insertDocument(pathKey, file, LibraryDocumentStatus.Pending, now);
    return { document: this.getById(id)!, needsIndexing: true };
  }

  private insertDocument(
    pathKey: string,
    file: LibraryDocumentFile,
    status: LibraryDocumentStatus,
    now: number,
  ): string {
    const id = crypto.randomUUID();
    this.db
      .prepare(
        `INSERT INTO library_documents (
           id, path_key, file_path, file_name, folder, kind, title, size_bytes, file_mtime_ms,
           status, attempts, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      )
      .run(
        id,
        pathKey,
        file.filePath,
        path.basename(file.filePath),
        path.dirname(file.filePath),
        file.kind,
        path.basename(file.filePath),
        file.sizeBytes,
        file.fileMtimeMs,
        status,
        now,
        now,
      );
    return id;
  }

  /** The file is a cloud placeholder: keep the row, drop any passages, do not retry. */
  markCloudOnly(id: string): void {
    const now = Date.now();
    this.db.transaction(() => {
      this.deleteChunks(id);
      this.db
        .prepare(
          `UPDATE library_documents
           SET status = ?, attempts = 0, error = NULL, chunk_count = 0, updated_at = ?
           WHERE id = ?`,
        )
        .run(LibraryDocumentStatus.CloudOnly, now, id);
    })();
    this.vectorCache = null;
  }

  /** Replaces the document's passages and vectors and marks it indexed. */
  markIndexed(id: string, indexed: LibraryIndexedDocument): void {
    const now = Date.now();
    const insertChunk = this.db.prepare(
      'INSERT INTO library_chunks (document_id, ordinal, locator, text) VALUES (?, ?, ?, ?)',
    );
    const insertVector = this.db.prepare(
      'INSERT INTO library_chunk_vectors (chunk_id, document_id, vector) VALUES (?, ?, ?)',
    );
    this.db.transaction(() => {
      this.deleteChunks(id);
      for (const chunk of indexed.chunks) {
        const result = insertChunk.run(id, chunk.ordinal, JSON.stringify(chunk.locator ?? {}), chunk.text);
        insertVector.run(result.lastInsertRowid, id, vectorToBuffer(chunk.vector));
      }
      this.db
        .prepare(
          `UPDATE library_documents
           SET title = ?, page_count = ?, chunk_count = ?, text_chars = ?, status = ?,
               attempts = 0, error = NULL, indexed_at = ?, updated_at = ?
           WHERE id = ?`,
        )
        .run(
          indexed.title || '',
          indexed.pageCount,
          indexed.chunks.length,
          indexed.textChars,
          LibraryDocumentStatus.Indexed,
          now,
          now,
          id,
        );
    })();
    this.vectorCache = null;
  }

  markFailed(id: string, error: string, permanent: boolean): void {
    const now = Date.now();
    this.db.transaction(() => {
      this.deleteChunks(id);
      this.db
        .prepare(
          `UPDATE library_documents
           SET status = ?, attempts = CASE WHEN ? THEN ? ELSE attempts + 1 END,
               error = ?, chunk_count = 0, updated_at = ?
           WHERE id = ?`,
        )
        .run(
          LibraryDocumentStatus.Failed,
          permanent ? 1 : 0,
          LibraryContentLimits.MaxAttempts,
          error.slice(0, 500),
          now,
          id,
        );
    })();
    this.vectorCache = null;
  }

  /** Puts every failed document that may still succeed back in the queue. */
  requeueFailed(): number {
    const result = this.db
      .prepare(
        `UPDATE library_documents SET status = ?, updated_at = ?
         WHERE status = ? AND attempts < ?`,
      )
      .run(LibraryDocumentStatus.Pending, Date.now(), LibraryDocumentStatus.Failed, LibraryContentLimits.MaxAttempts);
    return result.changes;
  }

  deleteByPathKey(pathKey: string): boolean {
    const existing = this.getByPathKey(pathKey);
    if (!existing) return false;
    this.deleteById(existing.id);
    return true;
  }

  deleteById(id: string): void {
    this.db.transaction(() => {
      this.deleteChunks(id);
      this.db.prepare('DELETE FROM library_documents WHERE id = ?').run(id);
    })();
    this.vectorCache = null;
  }

  /**
   * Removes documents that are no longer inside the indexed folders, or that
   * are inside an excluded one. Returns how many were removed.
   */
  deleteOutside(folders: string[], excludedFolders: string[]): number {
    const normalizedFolders = folders.map(folder => path.normalize(folder));
    const normalizedExcluded = excludedFolders.map(folder => path.normalize(folder));
    let removed = 0;
    for (const document of this.listAll()) {
      const inside = normalizedFolders.some(folder => isUnderFolder(document.filePath, folder));
      const excluded = normalizedExcluded.some(folder => isUnderFolder(document.filePath, folder));
      if (!inside || excluded) {
        this.deleteById(document.id);
        removed += 1;
      }
    }
    return removed;
  }

  /** Removes documents under `folders` whose path key is not in `seen`. */
  deleteUnseen(folders: string[], seen: Set<string>): number {
    const normalizedFolders = folders.map(folder => path.normalize(folder));
    let removed = 0;
    for (const document of this.listAll()) {
      const inside = normalizedFolders.some(folder => isUnderFolder(document.filePath, folder));
      if (inside && !seen.has(document.pathKey)) {
        this.deleteById(document.id);
        removed += 1;
      }
    }
    return removed;
  }

  clearAll(): void {
    this.db.transaction(() => {
      this.db.exec('DELETE FROM library_chunk_vectors');
      this.db.exec('DELETE FROM library_chunks');
      this.db.exec('DELETE FROM library_documents');
    })();
    this.vectorCache = null;
  }

  counts(): LibraryContentCounts {
    const statusRows = this.db
      .prepare('SELECT status, COUNT(*) AS count FROM library_documents GROUP BY status')
      .all() as Array<{ status: LibraryDocumentStatus; count: number }>;
    const byStatus = new Map(statusRows.map(row => [row.status, row.count]));
    const chunkRow = this.db
      .prepare('SELECT COUNT(*) AS count, COALESCE(SUM(LENGTH(text)), 0) AS bytes FROM library_chunks')
      .get() as { count: number; bytes: number };
    const vectorRow = this.db
      .prepare('SELECT COALESCE(SUM(LENGTH(vector)), 0) AS bytes FROM library_chunk_vectors')
      .get() as { bytes: number };
    const lastRow = this.db
      .prepare('SELECT MAX(indexed_at) AS last FROM library_documents WHERE status = ?')
      .get(LibraryDocumentStatus.Indexed) as { last: number | null };
    const failed = statusRows
      .filter(row => row.status === LibraryDocumentStatus.Failed)
      .reduce((sum, row) => sum + row.count, 0);
    return {
      indexed: byStatus.get(LibraryDocumentStatus.Indexed) ?? 0,
      pending: byStatus.get(LibraryDocumentStatus.Pending) ?? 0,
      failed,
      cloudOnly: byStatus.get(LibraryDocumentStatus.CloudOnly) ?? 0,
      chunks: chunkRow.count,
      lastIndexedAt: lastRow.last ?? null,
      // The FTS index roughly doubles the text; count it once more.
      indexBytes: chunkRow.bytes * 2 + vectorRow.bytes,
    };
  }

  // ------------------------------------------------------------------- search

  /**
   * Finds the passages closest to a question. `queryVector` may be null while
   * the model is loading; keywords alone are used then.
   */
  search(query: string, queryVector: Float32Array | null, options: LibrarySearchOptions = {}): LibrarySearchHit[] {
    const limit = Math.max(1, Math.min(options.limit ?? LibraryContentLimits.DefaultSearchResults, LibraryContentLimits.MaxSearchResults));
    const perDocument = Math.max(1, options.perDocument ?? 3);
    const folder = options.folder ? path.normalize(options.folder) : null;

    const keywordScores = new Map<number, number>();
    const ftsQuery = buildLibraryFtsQuery(query);
    if (ftsQuery) {
      const rows = this.keywordCandidates(ftsQuery, folder, options.keywordCandidates ?? LibraryContentLimits.KeywordCandidateLimit);
      // bm25 is negative in FTS5; the most negative is the best match.
      const best = rows.length > 0 ? Math.min(...rows.map(row => row.rank ?? 0)) : 0;
      for (const row of rows) {
        const normalized = best < 0 ? (row.rank ?? 0) / best : 0;
        keywordScores.set(row.id, Math.max(0, Math.min(1, normalized)));
      }
    }

    const vectorScores = new Map<number, number>();
    if (queryVector && queryVector.length === DIMENSIONS) {
      const cache = this.loadVectors();
      const allowed = folder ? this.chunkIdsUnderFolder(folder) : null;
      const top: Array<{ id: number; score: number }> = [];
      const keep = Math.max(limit * 4, 32);
      for (let index = 0; index < cache.chunkIds.length; index += 1) {
        const chunkId = cache.chunkIds[index];
        if (allowed && !allowed.has(chunkId)) continue;
        let dot = 0;
        const offset = index * DIMENSIONS;
        for (let dimension = 0; dimension < DIMENSIONS; dimension += 1) {
          dot += cache.matrix[offset + dimension] * queryVector[dimension];
        }
        // A passage with nothing in common is not an answer, however short the list.
        if (dot <= 0) continue;
        if (top.length < keep) {
          top.push({ id: chunkId, score: dot });
          if (top.length === keep) top.sort((a, b) => a.score - b.score);
        } else if (dot > top[0].score) {
          top[0] = { id: chunkId, score: dot };
          top.sort((a, b) => a.score - b.score);
        }
      }
      for (const entry of top) vectorScores.set(entry.id, Math.max(0, entry.score));
      // Keyword candidates also get their true cosine score.
      for (const chunkId of keywordScores.keys()) {
        if (vectorScores.has(chunkId)) continue;
        const vector = this.getVector(chunkId);
        if (!vector) continue;
        let dot = 0;
        for (let dimension = 0; dimension < DIMENSIONS; dimension += 1) dot += vector[dimension] * queryVector[dimension];
        vectorScores.set(chunkId, Math.max(0, dot));
      }
    }

    const candidateIds = new Set<number>([...keywordScores.keys(), ...vectorScores.keys()]);
    if (candidateIds.size === 0) return [];
    const vectorsUsed = vectorScores.size > 0;
    const scored = [...candidateIds].map(chunkId => {
      const keyword = keywordScores.get(chunkId) ?? 0;
      const vector = vectorScores.get(chunkId) ?? 0;
      const score = vectorsUsed ? VECTOR_WEIGHT * vector + KEYWORD_WEIGHT * keyword : keyword;
      return { chunkId, score };
    });
    scored.sort((a, b) => b.score - a.score);

    const hits: LibrarySearchHit[] = [];
    const perDocumentCount = new Map<string, number>();
    for (const entry of scored) {
      if (hits.length >= limit) break;
      const chunk = this.getChunk(entry.chunkId);
      if (!chunk) continue;
      const seen = perDocumentCount.get(chunk.document_id) ?? 0;
      if (seen >= perDocument) continue;
      const document = this.getById(chunk.document_id);
      if (!document) continue;
      perDocumentCount.set(chunk.document_id, seen + 1);
      hits.push({
        documentId: document.id,
        filePath: document.filePath,
        fileName: document.fileName,
        kind: document.kind,
        locator: parseLocator(chunk.locator),
        text: chunk.text,
        score: Math.round(Math.max(0, Math.min(1, entry.score)) * 1000) / 1000,
        modifiedAt: document.fileMtimeMs,
      });
    }
    return hits;
  }

  // ------------------------------------------------------------------ private

  private deleteChunks(documentId: string): void {
    this.db.prepare('DELETE FROM library_chunk_vectors WHERE document_id = ?').run(documentId);
    this.db.prepare('DELETE FROM library_chunks WHERE document_id = ?').run(documentId);
  }

  private keywordCandidates(ftsQuery: string, folder: string | null, limit: number): ChunkRow[] {
    try {
      if (folder) {
        return this.db
          .prepare(
            `SELECT c.id, c.document_id, c.ordinal, c.locator, c.text, bm25(library_chunks_fts) AS rank
             FROM library_chunks_fts
             JOIN library_chunks c ON c.id = library_chunks_fts.rowid
             JOIN library_documents d ON d.id = c.document_id
             WHERE library_chunks_fts MATCH ?
               AND (d.file_path LIKE ? ESCAPE '\\')
             ORDER BY rank
             LIMIT ?`,
          )
          .all(ftsQuery, `${escapeLike(folder)}${path.sep}%`, limit) as ChunkRow[];
      }
      return this.db
        .prepare(
          `SELECT c.id, c.document_id, c.ordinal, c.locator, c.text, bm25(library_chunks_fts) AS rank
           FROM library_chunks_fts
           JOIN library_chunks c ON c.id = library_chunks_fts.rowid
           WHERE library_chunks_fts MATCH ?
           ORDER BY rank
           LIMIT ?`,
        )
        .all(ftsQuery, limit) as ChunkRow[];
    } catch (error) {
      // A query FTS5 cannot parse is not worth failing the search over.
      console.warn('[LibraryContent] keyword search failed', error instanceof Error ? error.message : error);
      return [];
    }
  }

  private chunkIdsUnderFolder(folder: string): Set<number> {
    const rows = this.db
      .prepare(
        `SELECT c.id FROM library_chunks c
         JOIN library_documents d ON d.id = c.document_id
         WHERE d.file_path LIKE ? ESCAPE '\\'`,
      )
      .all(`${escapeLike(folder)}${path.sep}%`) as Array<{ id: number }>;
    return new Set(rows.map(row => row.id));
  }

  private getChunk(chunkId: number): ChunkRow | null {
    const row = this.db
      .prepare('SELECT id, document_id, ordinal, locator, text FROM library_chunks WHERE id = ?')
      .get(chunkId) as ChunkRow | undefined;
    return row ?? null;
  }

  private getVector(chunkId: number): Float32Array | null {
    const row = this.db
      .prepare('SELECT vector FROM library_chunk_vectors WHERE chunk_id = ?')
      .get(chunkId) as { vector: Buffer } | undefined;
    return row ? bufferToVector(row.vector) : null;
  }

  /** All vectors as one matrix, loaded once and dropped on any write. */
  private loadVectors(): VectorCache {
    if (this.vectorCache) return this.vectorCache;
    const rows = this.db
      .prepare('SELECT chunk_id, vector FROM library_chunk_vectors ORDER BY chunk_id LIMIT ?')
      .all(LibraryContentLimits.VectorScanLimit) as Array<{ chunk_id: number; vector: Buffer }>;
    const chunkIds = new Int32Array(rows.length);
    const matrix = new Float32Array(rows.length * DIMENSIONS);
    rows.forEach((row, index) => {
      chunkIds[index] = row.chunk_id;
      matrix.set(bufferToVector(row.vector), index * DIMENSIONS);
    });
    this.vectorCache = { chunkIds, matrix };
    return this.vectorCache;
  }
}
