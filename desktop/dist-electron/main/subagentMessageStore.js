"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubagentMessageStore = void 0;
class SubagentMessageStore {
    db;
    constructor(db) {
        this.db = db;
    }
    /**
     * Batch-insert messages for a subagent run.
     * Uses a transaction for performance on larger message lists.
     */
    insertMessages(runId, messages) {
        if (messages.length === 0)
            return;
        const stmt = this.db.prepare(`INSERT OR IGNORE INTO subagent_messages (id, run_id, type, content, metadata, created_at, sequence)
       VALUES (?, ?, ?, ?, ?, ?, ?)`);
        const insertAll = this.db.transaction(() => {
            for (const msg of messages) {
                stmt.run(msg.id, runId, msg.type, msg.content, msg.metadata ? JSON.stringify(msg.metadata) : null, msg.timestamp, msg.sequence);
            }
        });
        insertAll();
    }
    /**
     * Read all messages for a subagent run, ordered by sequence.
     */
    getMessages(runId) {
        return this.db
            .prepare(`
        SELECT
          id,
          run_id AS runId,
          type,
          content,
          metadata,
          created_at AS createdAt,
          sequence
        FROM subagent_messages
        WHERE run_id = ?
        ORDER BY sequence ASC
      `)
            .all(runId);
    }
    /**
     * Check if messages exist for a given run.
     */
    hasMessages(runId) {
        const row = this.db
            .prepare('SELECT 1 FROM subagent_messages WHERE run_id = ? LIMIT 1')
            .get(runId);
        return row !== undefined;
    }
    /**
     * Delete messages for specific runs (used when parent session is deleted).
     */
    deleteByRunIds(runIds) {
        if (runIds.length === 0)
            return;
        const placeholders = runIds.map(() => '?').join(',');
        this.db
            .prepare(`DELETE FROM subagent_messages WHERE run_id IN (${placeholders})`)
            .run(...runIds);
    }
    /**
     * Delete all messages belonging to subagent runs of a parent session.
     */
    deleteByParentSession(parentSessionId) {
        this.db
            .prepare(`DELETE FROM subagent_messages WHERE run_id IN
         (SELECT id FROM subagent_runs WHERE parent_session_id = ?)`)
            .run(parentSessionId);
    }
}
exports.SubagentMessageStore = SubagentMessageStore;
//# sourceMappingURL=subagentMessageStore.js.map