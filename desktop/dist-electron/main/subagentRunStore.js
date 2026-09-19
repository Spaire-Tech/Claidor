"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubagentRunStore = void 0;
class SubagentRunStore {
    db;
    constructor(db) {
        this.db = db;
    }
    insertSubagentRun(run) {
        this.db
            .prepare(`INSERT OR REPLACE INTO subagent_runs (
          id, parent_session_id, session_key, child_cowork_session_id, agent_id, task, label, status, created_at, ended_at
        )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(run.id, run.parentSessionId, run.sessionKey ?? null, run.childCoworkSessionId ?? null, run.agentId ?? null, run.task ?? null, run.label ?? null, run.status, run.createdAt, run.endedAt ?? null);
    }
    updateSubagentRunStatus(id, status, endedAt) {
        if (endedAt != null) {
            this.db.prepare('UPDATE subagent_runs SET status = ?, ended_at = ? WHERE id = ?')
                .run(status, endedAt, id);
        }
        else {
            this.db.prepare('UPDATE subagent_runs SET status = ? WHERE id = ?')
                .run(status, id);
        }
    }
    updateSubagentRunSessionKey(id, sessionKey) {
        this.db.prepare('UPDATE subagent_runs SET session_key = ? WHERE id = ?')
            .run(sessionKey, id);
    }
    updateSubagentRunChildSession(id, childCoworkSessionId) {
        this.db.prepare('UPDATE subagent_runs SET child_cowork_session_id = ? WHERE id = ?')
            .run(childCoworkSessionId, id);
    }
    clearChildSessionReference(childCoworkSessionId) {
        this.db.prepare('UPDATE subagent_runs SET child_cowork_session_id = NULL WHERE child_cowork_session_id = ?')
            .run(childCoworkSessionId);
    }
    listSubagentRuns(parentSessionId) {
        const rows = this.db
            .prepare(`SELECT * FROM subagent_runs WHERE parent_session_id = ? ORDER BY created_at ASC`)
            .all(parentSessionId);
        return rows.map((row) => ({
            id: row.id,
            parentSessionId: row.parent_session_id,
            sessionKey: row.session_key,
            childCoworkSessionId: row.child_cowork_session_id,
            agentId: row.agent_id,
            task: row.task,
            label: row.label,
            status: row.status,
            createdAt: row.created_at,
            endedAt: row.ended_at,
        }));
    }
    listSubagentRunsByAgent(agentId, limit, offset) {
        const rows = this.db
            .prepare(`
        SELECT
          sr.*,
          cs.agent_id AS parent_agent_id,
          cs.title AS parent_title,
          cs.updated_at AS parent_updated_at
        FROM subagent_runs sr
        LEFT JOIN cowork_sessions cs ON cs.id = sr.parent_session_id
        WHERE COALESCE(NULLIF(TRIM(sr.agent_id), ''), 'main') = ?
        ORDER BY sr.created_at DESC
        LIMIT ? OFFSET ?
      `)
            .all(agentId, limit, offset);
        return rows.map((row) => ({
            id: row.id,
            parentSessionId: row.parent_session_id,
            sessionKey: row.session_key,
            childCoworkSessionId: row.child_cowork_session_id,
            agentId: row.agent_id,
            task: row.task,
            label: row.label,
            status: row.status,
            createdAt: row.created_at,
            endedAt: row.ended_at,
            parentAgentId: row.parent_agent_id,
            parentTitle: row.parent_title,
            parentUpdatedAt: row.parent_updated_at,
        }));
    }
    countSubagentRunsByAgent(agentId) {
        const row = this.db
            .prepare(`
        SELECT COUNT(*) AS count
        FROM subagent_runs
        WHERE COALESCE(NULLIF(TRIM(agent_id), ''), 'main') = ?
      `)
            .get(agentId);
        return row?.count ?? 0;
    }
    getSubagentRun(id) {
        const row = this.db
            .prepare('SELECT * FROM subagent_runs WHERE id = ?')
            .get(id);
        if (!row)
            return null;
        return {
            id: row.id,
            parentSessionId: row.parent_session_id,
            sessionKey: row.session_key,
            childCoworkSessionId: row.child_cowork_session_id,
            agentId: row.agent_id,
            task: row.task,
            label: row.label,
            status: row.status,
            createdAt: row.created_at,
            endedAt: row.ended_at,
        };
    }
    markMessagesPersisted(id) {
        this.db.prepare('UPDATE subagent_runs SET messages_persisted = 1 WHERE id = ?')
            .run(id);
    }
    isMessagesPersisted(id) {
        const row = this.db
            .prepare('SELECT messages_persisted FROM subagent_runs WHERE id = ?')
            .get(id);
        return row?.messages_persisted === 1;
    }
    getRunStatus(id) {
        const row = this.db
            .prepare('SELECT status FROM subagent_runs WHERE id = ?')
            .get(id);
        return row?.status ?? null;
    }
    deleteSubagentRunsByParent(parentSessionId) {
        this.db.prepare('DELETE FROM subagent_runs WHERE parent_session_id = ?')
            .run(parentSessionId);
    }
    deleteSubagentRun(id) {
        this.db.prepare('DELETE FROM subagent_runs WHERE id = ?')
            .run(id);
    }
}
exports.SubagentRunStore = SubagentRunStore;
//# sourceMappingURL=subagentRunStore.js.map