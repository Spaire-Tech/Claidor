"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LibraryLocalStore = exports.decodeLibraryLocalCursor = exports.encodeLibraryLocalCursor = void 0;
const crypto_1 = __importDefault(require("crypto"));
const constants_1 = require("../../shared/library/constants");
const VISIBLE_TASK_RELATION_PREDICATE = `EXISTS (
  SELECT 1
  FROM library_artifact_sessions visible_relation
  JOIN cowork_sessions visible_session ON visible_session.id = visible_relation.session_id
  WHERE visible_relation.artifact_id = a.id
)`;
const escapeLike = (value) => value.replace(/[\\%_]/g, match => `\\${match}`);
const encodeLibraryLocalCursor = (cursor) => (Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url'));
exports.encodeLibraryLocalCursor = encodeLibraryLocalCursor;
const decodeLibraryLocalCursor = (cursor) => {
    if (!cursor)
        return null;
    try {
        const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
            return null;
        const value = parsed;
        if (!Number.isSafeInteger(value.sortTime) || typeof value.itemId !== 'string')
            return null;
        if (!value.itemId || value.itemId.length > 200)
            return null;
        return { sortTime: value.sortTime, itemId: value.itemId };
    }
    catch {
        return null;
    }
};
exports.decodeLibraryLocalCursor = decodeLibraryLocalCursor;
class LibraryLocalStore {
    db;
    constructor(db) {
        this.db = db;
    }
    list(options = {}) {
        const pageSize = Math.max(1, Math.min(options.pageSize ?? constants_1.LibraryLimits.DefaultPageSize, constants_1.LibraryLimits.MaxPageSize));
        const keyword = options.keyword?.trim().slice(0, constants_1.LibraryLimits.MaxKeywordLength) ?? '';
        const cursor = (0, exports.decodeLibraryLocalCursor)(options.cursor);
        const where = [VISIBLE_TASK_RELATION_PREDICATE];
        const params = [];
        if (options.category && options.category !== constants_1.LibraryCategory.All) {
            where.push('a.category = ?');
            params.push(options.category);
        }
        if (keyword) {
            const pattern = `%${escapeLike(keyword)}%`;
            where.push(`(
        a.file_name LIKE ? ESCAPE '\\' COLLATE NOCASE
        OR a.extension LIKE ? ESCAPE '\\' COLLATE NOCASE
      )`);
            params.push(pattern, pattern);
        }
        if (options.favoritesOnly) {
            where.push(`EXISTS (
        SELECT 1 FROM library_favorites f
        WHERE f.owner_scope = ? AND f.item_kind = ? AND f.item_id = a.id
      )`);
            params.push(constants_1.LibraryFavoriteScope.LocalDevice, constants_1.LibraryItemKind.LocalArtifact);
        }
        const baseWhere = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
        const countRow = this.db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN a.availability <> ? THEN 1 ELSE 0 END), 0) AS total,
        COALESCE(SUM(CASE WHEN a.availability = ? THEN 1 ELSE 0 END), 0) AS available,
        COALESCE(SUM(CASE WHEN a.availability = ? THEN 1 ELSE 0 END), 0) AS missing
      FROM library_local_artifacts a
      ${baseWhere}
    `).get(constants_1.LibraryAvailability.Missing, constants_1.LibraryAvailability.Available, constants_1.LibraryAvailability.Missing, ...params);
        const pageWhere = [...where];
        const pageParams = [...params];
        pageWhere.push('a.availability <> ?');
        pageParams.push(constants_1.LibraryAvailability.Missing);
        if (cursor) {
            pageWhere.push('(a.sort_time_ms < ? OR (a.sort_time_ms = ? AND a.id < ?))');
            pageParams.push(cursor.sortTime, cursor.sortTime, cursor.itemId);
        }
        const pageWhereSql = pageWhere.length > 0 ? `WHERE ${pageWhere.join(' AND ')}` : '';
        const rows = this.db.prepare(`
      SELECT a.*
      FROM library_local_artifacts a
      ${pageWhereSql}
      ORDER BY a.sort_time_ms DESC, a.id DESC
      LIMIT ?
    `).all(...pageParams, pageSize + 1);
        const hasMore = rows.length > pageSize;
        const pageRows = hasMore ? rows.slice(0, pageSize) : rows;
        const list = this.hydrateVisibleRows(pageRows);
        const last = pageRows[pageRows.length - 1];
        const counts = {
            total: Number(countRow.total),
            available: Number(countRow.available),
            missing: Number(countRow.missing),
        };
        return {
            list,
            hasMore,
            counts,
            ...(hasMore && last
                ? { nextCursor: (0, exports.encodeLibraryLocalCursor)({ sortTime: last.sort_time_ms, itemId: last.id }) }
                : {}),
        };
    }
    getDetail(itemId) {
        const row = this.db.prepare(`
      SELECT a.*
      FROM library_local_artifacts a
      WHERE a.id = ?
        AND a.availability <> ?
        AND ${VISIBLE_TASK_RELATION_PREDICATE}
    `).get(itemId, constants_1.LibraryAvailability.Missing);
        if (!row)
            return null;
        const item = this.hydrateVisibleRows([row])[0];
        if (!item)
            return null;
        const sessions = this.readRelations([itemId]).map(this.toSessionRelation);
        return { item, sessions };
    }
    getVisibleItem(itemId) {
        const row = this.db.prepare(`
      SELECT a.*
      FROM library_local_artifacts a
      WHERE a.id = ?
        AND a.availability <> ?
        AND ${VISIBLE_TASK_RELATION_PREDICATE}
    `).get(itemId, constants_1.LibraryAvailability.Missing);
        if (!row)
            return null;
        return this.hydrateVisibleRows([row])[0] ?? null;
    }
    getVisibleItems(itemIds) {
        if (itemIds.length === 0)
            return { items: [], unavailableItemIds: [] };
        const placeholders = itemIds.map(() => '?').join(',');
        const rows = this.db.prepare(`
      SELECT a.*
      FROM library_local_artifacts a
      WHERE a.id IN (${placeholders})
        AND a.availability <> ?
        AND ${VISIBLE_TASK_RELATION_PREDICATE}
    `).all(...itemIds, constants_1.LibraryAvailability.Missing);
        const items = this.hydrateVisibleRows(rows);
        const visibleItemIds = new Set(items.map(item => item.itemId));
        return {
            items,
            unavailableItemIds: itemIds.filter(itemId => !visibleItemIds.has(itemId)),
        };
    }
    getItem(itemId) {
        const row = this.db.prepare('SELECT * FROM library_local_artifacts WHERE id = ?')
            .get(itemId);
        return row ? this.hydrateRows([row])[0] : null;
    }
    resolvePath(itemId) {
        const row = this.db.prepare('SELECT file_path FROM library_local_artifacts WHERE id = ?')
            .get(itemId);
        return row?.file_path ?? null;
    }
    sessionExists(sessionId) {
        return Boolean(this.db.prepare('SELECT 1 FROM cowork_sessions WHERE id = ?').get(sessionId));
    }
    getSessionCwd(sessionId) {
        const row = this.db.prepare('SELECT cwd FROM cowork_sessions WHERE id = ?').get(sessionId);
        return row?.cwd ?? null;
    }
    resolveCloudSession(sessionId, clientSourceKey) {
        if (sessionId) {
            const session = this.db.prepare(`
        SELECT id, title, agent_id, updated_at FROM cowork_sessions WHERE id = ?
      `).get(sessionId);
            if (session) {
                return {
                    sessionId: session.id,
                    title: session.title,
                    agentId: session.agent_id ?? 'main',
                    lastRelatedAt: session.updated_at,
                };
            }
        }
        if (!clientSourceKey)
            return undefined;
        const artifact = this.db.prepare(`
      SELECT id FROM library_local_artifacts
      WHERE client_source_key = ?
      ORDER BY sort_time_ms DESC, id DESC
      LIMIT 1
    `).get(clientSourceKey);
        if (!artifact)
            return undefined;
        const relation = this.readRelations([artifact.id])[0];
        return relation ? this.toSessionRef(relation) : undefined;
    }
    upsertFile(file, candidate) {
        const now = Date.now();
        const existing = this.db.prepare('SELECT id, first_seen_at FROM library_local_artifacts WHERE path_key = ?').get(file.pathKey);
        const itemId = existing?.id ?? crypto_1.default.randomUUID();
        const firstSeenAt = existing?.first_seen_at ?? now;
        const committed = this.db.transaction(() => {
            if (candidate && !this.sessionExists(candidate.sessionId))
                return false;
            this.db.prepare(`
        INSERT INTO library_local_artifacts (
          id, path_key, file_path, file_name, extension, artifact_type, category,
          file_identity, client_source_key, size_bytes, file_mtime_ms, sort_time_ms,
          availability, origin, first_seen_at, last_seen_at, last_verified_at,
          missing_since, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
        ON CONFLICT(path_key) DO UPDATE SET
          file_path = excluded.file_path,
          file_name = excluded.file_name,
          extension = excluded.extension,
          artifact_type = excluded.artifact_type,
          category = excluded.category,
          file_identity = excluded.file_identity,
          client_source_key = COALESCE(excluded.client_source_key, library_local_artifacts.client_source_key),
          size_bytes = excluded.size_bytes,
          file_mtime_ms = excluded.file_mtime_ms,
          sort_time_ms = excluded.sort_time_ms,
          availability = excluded.availability,
          origin = CASE
            WHEN excluded.origin = ? THEN excluded.origin
            ELSE library_local_artifacts.origin
          END,
          last_seen_at = excluded.last_seen_at,
          last_verified_at = excluded.last_verified_at,
          missing_since = NULL,
          updated_at = excluded.updated_at
      `).run(itemId, file.pathKey, file.filePath, file.fileName, file.extension, file.artifactType, file.category, file.fileIdentity ?? null, file.clientSourceKey ?? null, file.sizeBytes ?? null, file.fileMtimeMs ?? null, file.fileMtimeMs ?? firstSeenAt, file.availability, file.origin, firstSeenAt, now, file.verifiedAt, firstSeenAt, now, constants_1.LibraryOrigin.Manual);
            if (candidate) {
                this.db.prepare(`
          INSERT INTO library_artifact_sessions (
            artifact_id, session_id, relation_kind, first_related_at, last_related_at,
            last_message_id, session_artifact_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(artifact_id, session_id) DO UPDATE SET
            relation_kind = CASE
              WHEN library_artifact_sessions.relation_kind = ?
                OR excluded.relation_kind = ? THEN ?
              WHEN library_artifact_sessions.relation_kind = ?
                OR excluded.relation_kind = ? THEN ?
              ELSE ?
            END,
            last_related_at = MAX(library_artifact_sessions.last_related_at, excluded.last_related_at),
            last_message_id = CASE
              WHEN excluded.last_related_at >= library_artifact_sessions.last_related_at
              THEN excluded.last_message_id ELSE library_artifact_sessions.last_message_id
            END,
            session_artifact_id = CASE
              WHEN excluded.last_related_at >= library_artifact_sessions.last_related_at
              THEN excluded.session_artifact_id ELSE library_artifact_sessions.session_artifact_id
            END,
            updated_at = excluded.updated_at
        `).run(itemId, candidate.sessionId, candidate.relationKind, candidate.relatedAt, candidate.relatedAt, candidate.messageId ?? null, candidate.sessionArtifactId ?? null, now, now, constants_1.LibraryRelationKind.Created, constants_1.LibraryRelationKind.Created, constants_1.LibraryRelationKind.Created, constants_1.LibraryRelationKind.Modified, constants_1.LibraryRelationKind.Modified, constants_1.LibraryRelationKind.Modified, constants_1.LibraryRelationKind.Referenced);
            }
            if (file.origin === constants_1.LibraryOrigin.Manual) {
                this.db.prepare(`
          INSERT INTO library_manual_sources (path_key, file_path, added_at)
          VALUES (?, ?, ?)
          ON CONFLICT(path_key) DO UPDATE SET
            file_path = excluded.file_path,
            added_at = excluded.added_at
        `).run(file.pathKey, file.filePath, now);
            }
            return true;
        })();
        if (!committed)
            return null;
        const item = candidate ? this.getVisibleItem(itemId) : this.getItem(itemId);
        if (!item)
            throw new Error('Failed to read indexed library item.');
        return item;
    }
    setFavorite(input) {
        const now = Date.now();
        if (input.favorite) {
            this.db.prepare(`
        INSERT INTO library_favorites (owner_scope, item_kind, item_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(owner_scope, item_kind, item_id) DO UPDATE SET updated_at = excluded.updated_at
      `).run(input.ownerScope, input.itemKind, input.itemId, now, now);
            return;
        }
        this.db.prepare(`
      DELETE FROM library_favorites
      WHERE owner_scope = ? AND item_kind = ? AND item_id = ?
    `).run(input.ownerScope, input.itemKind, input.itemId);
    }
    getFavoriteIds(ownerScope, itemKinds) {
        if (itemKinds.length === 0)
            return new Set();
        const placeholders = itemKinds.map(() => '?').join(',');
        const rows = this.db.prepare(`
      SELECT item_kind, item_id FROM library_favorites
      WHERE owner_scope = ? AND item_kind IN (${placeholders})
    `).all(ownerScope, ...itemKinds);
        return new Set(rows.map(row => `${row.item_kind}:${row.item_id}`));
    }
    deletePermanently(itemId) {
        return this.db.transaction(() => {
            const row = this.db.prepare('SELECT path_key FROM library_local_artifacts WHERE id = ?').get(itemId);
            this.db.prepare('DELETE FROM library_artifact_sessions WHERE artifact_id = ?').run(itemId);
            this.db.prepare(`
        DELETE FROM library_favorites WHERE item_kind = ? AND item_id = ?
      `).run(constants_1.LibraryItemKind.LocalArtifact, itemId);
            if (row) {
                this.db.prepare('DELETE FROM library_manual_sources WHERE path_key = ?').run(row.path_key);
            }
            const result = this.db.prepare('DELETE FROM library_local_artifacts WHERE id = ?').run(itemId);
            return result.changes > 0;
        })();
    }
    markMissing(itemId, verifiedAt = Date.now()) {
        return this.db.transaction(() => {
            const result = this.db.prepare(`
        UPDATE library_local_artifacts
        SET availability = ?, missing_since = COALESCE(missing_since, ?),
            last_verified_at = ?, updated_at = ?
        WHERE id = ? AND availability <> ?
      `).run(constants_1.LibraryAvailability.Missing, verifiedAt, verifiedAt, verifiedAt, itemId, constants_1.LibraryAvailability.Missing);
            if (result.changes > 0) {
                this.db.prepare(`
          DELETE FROM library_favorites WHERE item_kind = ? AND item_id = ?
        `).run(constants_1.LibraryItemKind.LocalArtifact, itemId);
            }
            else {
                this.db.prepare(`
          UPDATE library_local_artifacts SET last_verified_at = ? WHERE id = ?
        `).run(verifiedAt, itemId);
            }
            return result.changes > 0;
        })();
    }
    markPermissionDenied(itemId, verifiedAt = Date.now()) {
        const result = this.db.prepare(`
      UPDATE library_local_artifacts
      SET availability = ?, last_verified_at = ?, missing_since = NULL, updated_at = ?
      WHERE id = ? AND availability <> ?
    `).run(constants_1.LibraryAvailability.PermissionDenied, verifiedAt, verifiedAt, itemId, constants_1.LibraryAvailability.PermissionDenied);
        if (result.changes === 0) {
            this.db.prepare(`
        UPDATE library_local_artifacts SET last_verified_at = ? WHERE id = ?
      `).run(verifiedAt, itemId);
        }
        return result.changes > 0;
    }
    refreshFile(itemId, values) {
        const verifiedAt = values.verifiedAt ?? Date.now();
        const result = this.db.prepare(`
      UPDATE library_local_artifacts
      SET availability = ?, size_bytes = ?, file_mtime_ms = ?, sort_time_ms = ?,
          last_seen_at = ?, last_verified_at = ?, missing_since = NULL, updated_at = ?
      WHERE id = ?
        AND (
          availability <> ?
          OR size_bytes IS NOT ?
          OR file_mtime_ms IS NOT ?
          OR missing_since IS NOT NULL
        )
    `).run(constants_1.LibraryAvailability.Available, values.sizeBytes, values.fileMtimeMs, values.fileMtimeMs, verifiedAt, verifiedAt, verifiedAt, itemId, constants_1.LibraryAvailability.Available, values.sizeBytes, values.fileMtimeMs);
        if (result.changes === 0) {
            this.db.prepare(`
        UPDATE library_local_artifacts SET last_verified_at = ? WHERE id = ?
      `).run(verifiedAt, itemId);
        }
        return result.changes > 0;
    }
    listTracked(limit, verifiedBefore) {
        const sqlLimit = limit ? 'LIMIT ?' : '';
        const rows = this.db.prepare(`
      SELECT
        a.id AS item_id,
        a.file_path,
        a.availability,
        a.last_verified_at,
        CASE WHEN EXISTS (
          SELECT 1 FROM library_favorites f
          WHERE f.owner_scope = ? AND f.item_kind = ? AND f.item_id = a.id
        ) THEN 1 ELSE 0 END AS is_favorite
      FROM library_local_artifacts a
      ${verifiedBefore === undefined ? '' : 'WHERE a.last_verified_at < ?'}
      ORDER BY a.last_verified_at ASC
      ${sqlLimit}
    `).all(constants_1.LibraryFavoriteScope.LocalDevice, constants_1.LibraryItemKind.LocalArtifact, ...(verifiedBefore === undefined ? [] : [verifiedBefore]), ...(limit ? [limit] : []));
        return rows.map(row => ({
            itemId: row.item_id,
            filePath: row.file_path,
            availability: row.availability,
            lastVerifiedAt: row.last_verified_at,
            isFavorite: row.is_favorite === 1,
        }));
    }
    findRelocationCandidates(fileIdentity) {
        const rows = this.db.prepare(`
      SELECT id AS item_id, file_path
      FROM library_local_artifacts
      WHERE file_identity = ?
      ORDER BY last_verified_at DESC, id DESC
      LIMIT 10
    `).all(fileIdentity);
        return rows.map(row => ({ itemId: row.item_id, filePath: row.file_path }));
    }
    relocateFile(itemId, file) {
        const now = Date.now();
        return this.db.transaction(() => {
            const previous = this.db.prepare(`
        SELECT path_key FROM library_local_artifacts WHERE id = ?
      `).get(itemId);
            if (!previous)
                return false;
            const result = this.db.prepare(`
        UPDATE library_local_artifacts
        SET path_key = ?, file_path = ?, file_name = ?, extension = ?,
            artifact_type = ?, category = ?, file_identity = ?, client_source_key = ?,
            size_bytes = ?, file_mtime_ms = ?, sort_time_ms = ?, availability = ?,
            last_seen_at = ?, last_verified_at = ?, missing_since = NULL, updated_at = ?
        WHERE id = ?
          AND NOT EXISTS (
            SELECT 1 FROM library_local_artifacts other
            WHERE other.path_key = ? AND other.id <> ?
          )
      `).run(file.pathKey, file.filePath, file.fileName, file.extension, file.artifactType, file.category, file.fileIdentity ?? null, file.clientSourceKey ?? null, file.sizeBytes ?? null, file.fileMtimeMs ?? null, file.fileMtimeMs ?? now, file.availability, file.verifiedAt, file.verifiedAt, now, itemId, file.pathKey, itemId);
            if (result.changes === 0)
                return false;
            const manual = this.db.prepare(`
        SELECT added_at FROM library_manual_sources WHERE path_key = ?
      `).get(previous.path_key);
            if (manual) {
                this.db.prepare('DELETE FROM library_manual_sources WHERE path_key = ?')
                    .run(previous.path_key);
                this.db.prepare(`
          INSERT INTO library_manual_sources (path_key, file_path, added_at)
          VALUES (?, ?, ?)
          ON CONFLICT(path_key) DO UPDATE SET
            file_path = excluded.file_path
        `).run(file.pathKey, file.filePath, manual.added_at);
            }
            return true;
        })();
    }
    cleanupExpiredMissing(retentionMs, now = Date.now()) {
        const rows = this.db.prepare(`
      SELECT id FROM library_local_artifacts
      WHERE availability = ? AND missing_since IS NOT NULL AND missing_since < ?
    `).all(constants_1.LibraryAvailability.Missing, now - retentionMs);
        for (const row of rows)
            this.deletePermanently(row.id);
        return rows.length;
    }
    cleanupOrphanRelations() {
        const result = this.db.prepare(`
      DELETE FROM library_artifact_sessions
      WHERE artifact_id NOT IN (SELECT id FROM library_local_artifacts)
         OR session_id NOT IN (SELECT id FROM cowork_sessions)
    `).run();
        return result.changes;
    }
    countByAvailability() {
        const row = this.db.prepare(`
      SELECT
        COUNT(*) AS tracked,
        COALESCE(SUM(CASE WHEN availability = ? THEN 1 ELSE 0 END), 0) AS available,
        COALESCE(SUM(CASE WHEN availability = ? THEN 1 ELSE 0 END), 0) AS missing
      FROM library_local_artifacts
    `).get(constants_1.LibraryAvailability.Available, constants_1.LibraryAvailability.Missing);
        return {
            tracked: Number(row.tracked),
            available: Number(row.available),
            missing: Number(row.missing),
        };
    }
    hydrateVisibleRows(rows) {
        const items = this.hydrateRows(rows);
        const visibleItems = items.filter((item) => (Boolean(item.latestSession) && item.relatedSessionCount > 0));
        if (visibleItems.length !== items.length) {
            console.warn('[Library] Ignored local artifacts without a valid task relation.', { count: items.length - visibleItems.length });
        }
        return visibleItems;
    }
    hydrateRows(rows) {
        if (rows.length === 0)
            return [];
        const itemIds = rows.map(row => row.id);
        const relationRows = this.readRelations(itemIds);
        const latestByArtifact = new Map();
        const relationCountByArtifact = new Map();
        for (const relation of relationRows) {
            relationCountByArtifact.set(relation.artifact_id, (relationCountByArtifact.get(relation.artifact_id) ?? 0) + 1);
            if (!latestByArtifact.has(relation.artifact_id)) {
                latestByArtifact.set(relation.artifact_id, this.toSessionRef(relation));
            }
        }
        const favoriteIds = this.getFavoriteIds(constants_1.LibraryFavoriteScope.LocalDevice, [constants_1.LibraryItemKind.LocalArtifact]);
        return rows.map(row => ({
            itemKind: constants_1.LibraryItemKind.LocalArtifact,
            itemId: row.id,
            title: row.file_name,
            category: row.category,
            sortTime: row.sort_time_ms,
            createdAt: row.created_at,
            isFavorite: favoriteIds.has(`${constants_1.LibraryItemKind.LocalArtifact}:${row.id}`),
            ...(latestByArtifact.get(row.id) ? { latestSession: latestByArtifact.get(row.id) } : {}),
            filePath: row.file_path,
            artifactType: row.artifact_type,
            extension: row.extension,
            ...(row.size_bytes === null ? {} : { sizeBytes: row.size_bytes }),
            ...(row.file_mtime_ms === null ? {} : { fileMtimeMs: row.file_mtime_ms }),
            availability: row.availability,
            origin: row.origin,
            relatedSessionCount: relationCountByArtifact.get(row.id) ?? 0,
            ...(row.client_source_key ? { clientSourceKey: row.client_source_key } : {}),
        }));
    }
    readRelations(itemIds) {
        if (itemIds.length === 0)
            return [];
        const placeholders = itemIds.map(() => '?').join(',');
        return this.db.prepare(`
      SELECT
        r.artifact_id,
        r.session_id,
        r.relation_kind,
        r.first_related_at,
        r.last_related_at,
        r.last_message_id,
        r.session_artifact_id,
        s.title,
        s.agent_id,
        s.updated_at AS session_updated_at
      FROM library_artifact_sessions r
      JOIN cowork_sessions s ON s.id = r.session_id
      WHERE r.artifact_id IN (${placeholders})
      ORDER BY r.artifact_id, r.last_related_at DESC, s.updated_at DESC, r.session_id DESC
    `).all(...itemIds);
    }
    toSessionRef(row) {
        return {
            sessionId: row.session_id,
            title: row.title,
            agentId: row.agent_id ?? 'main',
            lastRelatedAt: row.last_related_at,
            ...(row.last_message_id ? { lastMessageId: row.last_message_id } : {}),
            ...(row.session_artifact_id ? { sessionArtifactId: row.session_artifact_id } : {}),
        };
    }
    toSessionRelation = (row) => ({
        ...this.toSessionRef(row),
        relationKind: row.relation_kind ?? constants_1.LibraryRelationKind.Referenced,
        firstRelatedAt: row.first_related_at,
    });
}
exports.LibraryLocalStore = LibraryLocalStore;
//# sourceMappingURL=libraryLocalStore.js.map