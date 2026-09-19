"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.McpStore = void 0;
const crypto_1 = __importDefault(require("crypto"));
class McpStore {
    db;
    constructor(db) {
        this.db = db;
    }
    parseJsonValue(value, fallback) {
        if (!value)
            return fallback;
        try {
            return JSON.parse(value);
        }
        catch {
            return fallback;
        }
    }
    deserializeLaunchResolution(row) {
        if (!row)
            return undefined;
        return {
            serverId: row.server_id,
            resolverKind: row.resolver_kind,
            sourceFingerprint: row.source_fingerprint,
            status: row.status,
            packageName: row.package_name || undefined,
            requestedVersion: row.requested_version || undefined,
            resolvedVersion: row.resolved_version || undefined,
            installDir: row.install_dir || undefined,
            command: row.command || undefined,
            args: this.parseJsonValue(row.args_json, []),
            env: this.parseJsonValue(row.env_json, undefined),
            error: row.error || undefined,
            installedAt: row.installed_at || undefined,
            resolvedAt: row.resolved_at || undefined,
            lastProbeAt: row.last_probe_at || undefined,
            lastProbeStatus: row.last_probe_status || undefined,
            updatedAt: row.updated_at,
        };
    }
    getLaunchResolution(serverId) {
        const row = this.db
            .prepare('SELECT * FROM mcp_launch_resolutions WHERE server_id = ?')
            .get(serverId);
        return this.deserializeLaunchResolution(row);
    }
    upsertLaunchResolution(resolution) {
        const now = resolution.updatedAt || Date.now();
        this.db
            .prepare(`
        INSERT INTO mcp_launch_resolutions (
          server_id, resolver_kind, source_fingerprint, status,
          package_name, requested_version, resolved_version, install_dir,
          command, args_json, env_json, error,
          installed_at, resolved_at, last_probe_at, last_probe_status, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(server_id) DO UPDATE SET
          resolver_kind = excluded.resolver_kind,
          source_fingerprint = excluded.source_fingerprint,
          status = excluded.status,
          package_name = excluded.package_name,
          requested_version = excluded.requested_version,
          resolved_version = excluded.resolved_version,
          install_dir = excluded.install_dir,
          command = excluded.command,
          args_json = excluded.args_json,
          env_json = excluded.env_json,
          error = excluded.error,
          installed_at = excluded.installed_at,
          resolved_at = excluded.resolved_at,
          last_probe_at = excluded.last_probe_at,
          last_probe_status = excluded.last_probe_status,
          updated_at = excluded.updated_at
      `)
            .run(resolution.serverId, resolution.resolverKind, resolution.sourceFingerprint, resolution.status, resolution.packageName ?? null, resolution.requestedVersion ?? null, resolution.resolvedVersion ?? null, resolution.installDir ?? null, resolution.command ?? null, resolution.args ? JSON.stringify(resolution.args) : null, resolution.env ? JSON.stringify(resolution.env) : null, resolution.error ?? null, resolution.installedAt ?? null, resolution.resolvedAt ?? null, resolution.lastProbeAt ?? null, resolution.lastProbeStatus ?? null, now);
    }
    deleteLaunchResolution(serverId) {
        this.db.prepare('DELETE FROM mcp_launch_resolutions WHERE server_id = ?').run(serverId);
    }
    deserializeRow(row) {
        let config = {};
        try {
            config = JSON.parse(row.config_json);
        }
        catch {
            // Invalid JSON, use defaults
        }
        return {
            id: row.id,
            name: row.name,
            description: row.description,
            enabled: row.enabled === 1,
            transportType: row.transport_type,
            command: config.command,
            args: config.args,
            env: config.env,
            url: config.url,
            headers: config.headers,
            isBuiltIn: config.isBuiltIn === true,
            githubUrl: config.githubUrl,
            registryId: config.registryId,
            auth: config.auth,
            oauthScope: config.oauthScope,
            launchResolution: this.getLaunchResolution(row.id),
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }
    serializeConfig(data) {
        const config = {};
        if (data.command !== undefined)
            config.command = data.command;
        if (data.args !== undefined)
            config.args = data.args;
        if (data.env !== undefined && Object.keys(data.env).length > 0)
            config.env = data.env;
        if (data.url !== undefined)
            config.url = data.url;
        if (data.headers !== undefined && Object.keys(data.headers).length > 0)
            config.headers = data.headers;
        if (data.isBuiltIn)
            config.isBuiltIn = true;
        if (data.githubUrl)
            config.githubUrl = data.githubUrl;
        if (data.registryId)
            config.registryId = data.registryId;
        if (data.auth)
            config.auth = data.auth;
        if (data.oauthScope)
            config.oauthScope = data.oauthScope;
        return JSON.stringify(config);
    }
    normalizeTransportConfig(data) {
        if (data.transportType === 'stdio') {
            return {
                ...data,
                url: undefined,
                headers: undefined,
            };
        }
        return {
            ...data,
            command: undefined,
            args: undefined,
            env: undefined,
        };
    }
    listServers() {
        const rows = this.db
            .prepare('SELECT id, name, description, enabled, transport_type, config_json, created_at, updated_at FROM mcp_servers ORDER BY created_at ASC')
            .all();
        return rows.map((row) => this.deserializeRow(row));
    }
    getServer(id) {
        const row = this.db
            .prepare('SELECT id, name, description, enabled, transport_type, config_json, created_at, updated_at FROM mcp_servers WHERE id = ?')
            .get(id);
        if (!row)
            return null;
        return this.deserializeRow(row);
    }
    createServer(data) {
        const id = crypto_1.default.randomUUID();
        const now = Date.now();
        const normalized = this.normalizeTransportConfig(data);
        const configJson = this.serializeConfig(normalized);
        this.db
            .prepare(`INSERT INTO mcp_servers (id, name, description, enabled, transport_type, config_json, created_at, updated_at)
       VALUES (?, ?, ?, 1, ?, ?, ?, ?)`)
            .run(id, normalized.name, normalized.description, normalized.transportType, configJson, now, now);
        return this.getServer(id);
    }
    updateServer(id, data) {
        const existing = this.getServer(id);
        if (!existing)
            return null;
        const now = Date.now();
        const merged = this.normalizeTransportConfig({
            name: data.name ?? existing.name,
            description: data.description ?? existing.description,
            transportType: data.transportType ?? existing.transportType,
            command: data.command !== undefined ? data.command : existing.command,
            args: data.args !== undefined ? data.args : existing.args,
            env: data.env !== undefined ? data.env : existing.env,
            url: data.url !== undefined ? data.url : existing.url,
            headers: data.headers !== undefined ? data.headers : existing.headers,
            isBuiltIn: data.isBuiltIn !== undefined ? data.isBuiltIn : existing.isBuiltIn,
            githubUrl: data.githubUrl !== undefined ? data.githubUrl : existing.githubUrl,
            registryId: data.registryId !== undefined ? data.registryId : existing.registryId,
            // These two were missing from this list, and the list is the whole
            // of what survives an update: everything not named here is dropped
            // on the next write. So a connection updated rather than created —
            // which is what happens on every re-connect — lost its `auth`, the
            // config sync then rendered it without one, and the engine refused
            // the login with `MCP server "x" is not configured with auth:
            // "oauth"`. Connecting worked once and never again.
            auth: data.auth !== undefined ? data.auth : existing.auth,
            oauthScope: data.oauthScope !== undefined ? data.oauthScope : existing.oauthScope,
        });
        const configJson = this.serializeConfig(merged);
        this.db
            .prepare(`UPDATE mcp_servers SET name = ?, description = ?, transport_type = ?, config_json = ?, updated_at = ? WHERE id = ?`)
            .run(merged.name, merged.description, merged.transportType, configJson, now, id);
        return this.getServer(id);
    }
    deleteServer(id) {
        const existing = this.getServer(id);
        if (!existing)
            return false;
        this.db.prepare('DELETE FROM mcp_servers WHERE id = ?').run(id);
        this.deleteLaunchResolution(id);
        return true;
    }
    setEnabled(id, enabled) {
        const existing = this.getServer(id);
        if (!existing)
            return false;
        const now = Date.now();
        this.db
            .prepare('UPDATE mcp_servers SET enabled = ?, updated_at = ? WHERE id = ?')
            .run(enabled ? 1 : 0, now, id);
        return true;
    }
    getEnabledServers() {
        const rows = this.db
            .prepare('SELECT id, name, description, enabled, transport_type, config_json, created_at, updated_at FROM mcp_servers WHERE enabled = 1 ORDER BY created_at ASC')
            .all();
        return rows.map((row) => this.deserializeRow(row));
    }
}
exports.McpStore = McpStore;
//# sourceMappingURL=mcpStore.js.map