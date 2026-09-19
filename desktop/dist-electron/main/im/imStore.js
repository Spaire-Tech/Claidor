"use strict";
/**
 * IM Gateway Store
 * SQLite operations for IM configuration storage
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.IMStore = void 0;
const node_crypto_1 = require("node:crypto");
const platform_1 = require("../../shared/platform");
const types_1 = require("./types");
function mapSessionMappingRow(row) {
    return {
        imConversationId: row.im_conversation_id,
        platform: row.platform,
        coworkSessionId: row.cowork_session_id,
        agentId: row.agent_id || 'main',
        ...(row.openclaw_session_key ? { openClawSessionKey: row.openclaw_session_key } : {}),
        createdAt: row.created_at,
        lastActiveAt: row.last_active_at,
    };
}
function deriveNimRuntimeAccountIdForInstance(inst) {
    const nimToken = inst.nimToken?.trim();
    if (nimToken) {
        const delimiter = nimToken.includes('|') ? '|' : '-';
        const parts = nimToken.split(delimiter).map((part) => part.trim());
        if (parts.length === 3 && parts[0] && parts[1]) {
            return `${parts[0]}:${parts[1]}`;
        }
    }
    if (inst.appKey?.trim() && inst.account?.trim()) {
        return `${inst.appKey.trim()}:${inst.account.trim()}`;
    }
    return null;
}
function normalizeNimLegacyConversationPrefix(runtimeAccountId) {
    return runtimeAccountId.replace(/:/g, '-');
}
class IMStore {
    db;
    constructor(db) {
        this.db = db;
        this.initializeTables();
        this.migrateDefaults();
    }
    initializeTables() {
        this.db
            .prepare(`
      CREATE TABLE IF NOT EXISTS im_config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `)
            .run();
        // IM session mappings table for Cowork mode
        this.db
            .prepare(`
      CREATE TABLE IF NOT EXISTS im_session_mappings (
        im_conversation_id TEXT NOT NULL,
        platform TEXT NOT NULL,
        cowork_session_id TEXT NOT NULL,
        agent_id TEXT NOT NULL DEFAULT 'main',
        openclaw_session_key TEXT,
        created_at INTEGER NOT NULL,
        last_active_at INTEGER NOT NULL,
        PRIMARY KEY (im_conversation_id, platform, agent_id)
      );
    `)
            .run();
        // Migration: Add agent_id column to im_session_mappings
        const mappingCols = this.db.pragma('table_info(im_session_mappings)');
        const mappingColNames = mappingCols.map(r => r.name);
        if (!mappingColNames.includes('agent_id')) {
            this.db
                .prepare("ALTER TABLE im_session_mappings ADD COLUMN agent_id TEXT NOT NULL DEFAULT 'main'")
                .run();
        }
        if (!mappingColNames.includes('openclaw_session_key')) {
            this.db
                .prepare('ALTER TABLE im_session_mappings ADD COLUMN openclaw_session_key TEXT')
                .run();
        }
        this.ensureAgentScopedSessionMappingPrimaryKey(mappingCols);
        this.db
            .prepare('CREATE INDEX IF NOT EXISTS idx_im_session_mappings_openclaw_session_key ON im_session_mappings(openclaw_session_key) WHERE openclaw_session_key IS NOT NULL')
            .run();
        this.db
            .prepare('CREATE INDEX IF NOT EXISTS idx_im_session_mappings_cowork_session_id ON im_session_mappings(cowork_session_id)')
            .run();
    }
    ensureAgentScopedSessionMappingPrimaryKey(mappingCols) {
        const pkCols = mappingCols
            .filter(col => typeof col.pk === 'number' && col.pk > 0)
            .sort((a, b) => (a.pk ?? 0) - (b.pk ?? 0))
            .map(col => col.name);
        // Test fakes and some old sqlite adapters may not expose pk metadata. In
        // that case skip the rebuild; real SQLite returns pk ordinals here.
        if (pkCols.length === 0 || pkCols.includes('agent_id')) {
            return;
        }
        const migrate = this.db.transaction(() => {
            this.db.prepare('DROP TABLE IF EXISTS im_session_mappings_agent_scope_new').run();
            this.db
                .prepare(`
        CREATE TABLE im_session_mappings_agent_scope_new (
          im_conversation_id TEXT NOT NULL,
          platform TEXT NOT NULL,
          cowork_session_id TEXT NOT NULL,
          agent_id TEXT NOT NULL DEFAULT 'main',
          openclaw_session_key TEXT,
          created_at INTEGER NOT NULL,
          last_active_at INTEGER NOT NULL,
          PRIMARY KEY (im_conversation_id, platform, agent_id)
        );
      `)
                .run();
            this.db
                .prepare(`
        INSERT OR REPLACE INTO im_session_mappings_agent_scope_new (
          im_conversation_id,
          platform,
          cowork_session_id,
          agent_id,
          openclaw_session_key,
          created_at,
          last_active_at
        )
        SELECT
          im_conversation_id,
          platform,
          cowork_session_id,
          COALESCE(NULLIF(agent_id, ''), 'main'),
          openclaw_session_key,
          created_at,
          last_active_at
        FROM im_session_mappings;
      `)
                .run();
            this.db.prepare('DROP TABLE im_session_mappings').run();
            this.db
                .prepare('ALTER TABLE im_session_mappings_agent_scope_new RENAME TO im_session_mappings')
                .run();
        });
        migrate();
    }
    /**
     * Migrate existing IM configs to ensure stable defaults.
     */
    migrateDefaults() {
        const platforms = platform_1.PlatformRegistry.platforms;
        for (const platform of platforms) {
            const row = this.db.prepare('SELECT value FROM im_config WHERE key = ?').get(platform);
            if (!row)
                continue;
            try {
                const config = JSON.parse(row.value);
                if (config.debug === undefined || config.debug === false) {
                    config.debug = true;
                    const now = Date.now();
                    this.db
                        .prepare('UPDATE im_config SET value = ?, updated_at = ? WHERE key = ?')
                        .run(JSON.stringify(config), now, platform);
                }
            }
            catch {
                // Ignore parse errors
            }
        }
        const settingsRow = this.db
            .prepare('SELECT value FROM im_config WHERE key = ?')
            .get('settings');
        if (settingsRow) {
            try {
                const settings = JSON.parse(settingsRow.value);
                // Keep IM and desktop behavior aligned: skills auto-routing should be on by default.
                // Historical renderer default could persist `skillsEnabled: false` unintentionally.
                if (settings.skillsEnabled !== true) {
                    settings.skillsEnabled = true;
                    const now = Date.now();
                    this.db
                        .prepare('UPDATE im_config SET value = ?, updated_at = ? WHERE key = ?')
                        .run(JSON.stringify(settings), now, 'settings');
                }
            }
            catch {
                // Ignore parse errors
            }
        }
        // Migrate feishu renderMode from 'text' to 'card' (previous renderer default was incorrect)
        const feishuRow = this.db.prepare('SELECT value FROM im_config WHERE key = ?').get('feishu');
        if (feishuRow) {
            try {
                const feishuConfig = JSON.parse(feishuRow.value);
                if (feishuConfig.renderMode === 'text') {
                    feishuConfig.renderMode = 'card';
                    const now = Date.now();
                    this.db
                        .prepare('UPDATE im_config SET value = ?, updated_at = ? WHERE key = ?')
                        .run(JSON.stringify(feishuConfig), now, 'feishu');
                }
            }
            catch {
                // Ignore parse errors
            }
        }
        // Migrate old native Telegram config to new OpenClaw format
        const oldTelegramRow = this.db
            .prepare('SELECT value FROM im_config WHERE key = ?')
            .get('telegram');
        const newTelegramRow = this.db
            .prepare('SELECT value FROM im_config WHERE key = ?')
            .get('telegramOpenClaw');
        if (oldTelegramRow && !newTelegramRow) {
            try {
                const oldConfig = JSON.parse(oldTelegramRow.value);
                if (oldConfig.botToken) {
                    const hasAllowList = Array.isArray(oldConfig.allowedUserIds) && oldConfig.allowedUserIds.length > 0;
                    const newConfig = {
                        ...types_1.DEFAULT_TELEGRAM_OPENCLAW_CONFIG,
                        enabled: oldConfig.enabled ?? false,
                        botToken: oldConfig.botToken,
                        allowFrom: oldConfig.allowedUserIds ?? [],
                        dmPolicy: hasAllowList ? 'allowlist' : 'pairing',
                        debug: oldConfig.debug ?? true,
                    };
                    const now = Date.now();
                    this.db
                        .prepare('INSERT OR REPLACE INTO im_config (key, value, created_at, updated_at) VALUES (?, ?, ?, ?)')
                        .run('telegramOpenClaw', JSON.stringify(newConfig), now, now);
                    this.db.prepare('DELETE FROM im_config WHERE key = ?').run('telegram');
                    console.log('[IMStore] Migrated old Telegram config to OpenClaw format');
                }
            }
            catch {
                // Ignore parse errors
            }
        }
        // Migrate single telegramOpenClaw config to multi-instance format
        const oldTelegramSingleRow = this.db
            .prepare('SELECT value FROM im_config WHERE key = ?')
            .get('telegramOpenClaw');
        const existingTelegramInstances = this.db
            .prepare('SELECT key FROM im_config WHERE key LIKE ?')
            .all('telegram:%');
        if (oldTelegramSingleRow && !existingTelegramInstances.length) {
            try {
                const oldConfig = JSON.parse(oldTelegramSingleRow.value);
                const instanceId = (0, node_crypto_1.randomUUID)();
                const instanceConfig = {
                    ...types_1.DEFAULT_TELEGRAM_OPENCLAW_CONFIG,
                    ...oldConfig,
                    instanceId,
                    instanceName: 'Telegram Bot 1',
                };
                const now = Date.now();
                this.db
                    .prepare('INSERT INTO im_config (key, value, updated_at) VALUES (?, ?, ?)')
                    .run(`telegram:${instanceId}`, JSON.stringify(instanceConfig), now);
                this.db.prepare('DELETE FROM im_config WHERE key = ?').run('telegramOpenClaw');
                // Migrate session mappings
                this.db
                    .prepare('UPDATE im_session_mappings SET platform = ? WHERE platform = ?')
                    .run(`telegram:${instanceId}`, 'telegram');
                // Migrate agent bindings
                const settingsRow = this.db
                    .prepare('SELECT value FROM im_config WHERE key = ?')
                    .get('settings');
                if (settingsRow) {
                    try {
                        const settings = JSON.parse(settingsRow.value);
                        if (settings.platformAgentBindings?.['telegram']) {
                            settings.platformAgentBindings[`telegram:${instanceId}`] =
                                settings.platformAgentBindings['telegram'];
                            delete settings.platformAgentBindings['telegram'];
                            this.db
                                .prepare('UPDATE im_config SET value = ?, updated_at = ? WHERE key = ?')
                                .run(JSON.stringify(settings), now, 'settings');
                        }
                    }
                    catch {
                        // Ignore parse errors
                    }
                }
                console.log('[IMStore] Migrated single Telegram config to multi-instance format');
            }
            catch {
                // Ignore parse errors
            }
        }
        // Migrate old native Discord config to new OpenClaw format
        const oldDiscordRow = this.db
            .prepare('SELECT value FROM im_config WHERE key = ?')
            .get('discord');
        const newDiscordRow = this.db
            .prepare('SELECT value FROM im_config WHERE key = ?')
            .get('discordOpenClaw');
        if (oldDiscordRow && !newDiscordRow) {
            try {
                const oldConfig = JSON.parse(oldDiscordRow.value);
                if (oldConfig.botToken) {
                    const newConfig = {
                        ...types_1.DEFAULT_DISCORD_OPENCLAW_CONFIG,
                        enabled: oldConfig.enabled ?? false,
                        botToken: oldConfig.botToken,
                        debug: oldConfig.debug ?? true,
                    };
                    const now = Date.now();
                    this.db
                        .prepare('INSERT OR REPLACE INTO im_config (key, value, updated_at) VALUES (?, ?, ?)')
                        .run('discordOpenClaw', JSON.stringify(newConfig), now);
                    this.db.prepare('DELETE FROM im_config WHERE key = ?').run('discord');
                    console.log('[IMStore] Migrated old Discord config to OpenClaw format');
                }
            }
            catch {
                // Ignore parse errors
            }
        }
        // Migrate single discordOpenClaw config to multi-instance format
        const oldDiscordSingleRow = this.db
            .prepare('SELECT value FROM im_config WHERE key = ?')
            .get('discordOpenClaw');
        const existingDiscordInstances = this.db
            .prepare('SELECT key FROM im_config WHERE key LIKE ?')
            .all('discord:%');
        if (oldDiscordSingleRow && !existingDiscordInstances.length) {
            try {
                const oldConfig = JSON.parse(oldDiscordSingleRow.value);
                const instanceId = (0, node_crypto_1.randomUUID)();
                const instanceConfig = {
                    ...types_1.DEFAULT_DISCORD_OPENCLAW_CONFIG,
                    ...oldConfig,
                    instanceId,
                    instanceName: 'Discord Bot 1',
                };
                const now = Date.now();
                this.db
                    .prepare('INSERT INTO im_config (key, value, updated_at) VALUES (?, ?, ?)')
                    .run(`discord:${instanceId}`, JSON.stringify(instanceConfig), now);
                this.db.prepare('DELETE FROM im_config WHERE key = ?').run('discordOpenClaw');
                // Migrate session mappings
                this.db
                    .prepare('UPDATE im_session_mappings SET platform = ? WHERE platform = ?')
                    .run(`discord:${instanceId}`, 'discord');
                // Migrate agent bindings
                const settingsRow4 = this.db
                    .prepare('SELECT value FROM im_config WHERE key = ?')
                    .get('settings');
                if (settingsRow4) {
                    try {
                        const settings = JSON.parse(settingsRow4.value);
                        if (settings.platformAgentBindings?.['discord']) {
                            settings.platformAgentBindings[`discord:${instanceId}`] =
                                settings.platformAgentBindings['discord'];
                            delete settings.platformAgentBindings['discord'];
                            this.db
                                .prepare('UPDATE im_config SET value = ?, updated_at = ? WHERE key = ?')
                                .run(JSON.stringify(settings), now, 'settings');
                        }
                    }
                    catch {
                        // Ignore parse errors
                    }
                }
                console.log('[IMStore] Migrated single Discord config to multi-instance format');
            }
            catch {
                // Ignore parse errors
            }
        }
        // Migrate old native Feishu config to new OpenClaw format
        const oldFeishuRow2 = this.db
            .prepare('SELECT value FROM im_config WHERE key = ?')
            .get('feishu');
        const newFeishuRow = this.db
            .prepare('SELECT value FROM im_config WHERE key = ?')
            .get('feishuOpenClaw');
        if (oldFeishuRow2 && !newFeishuRow) {
            try {
                const oldConfig = JSON.parse(oldFeishuRow2.value);
                if (oldConfig.appId) {
                    const newConfig = {
                        ...types_1.DEFAULT_FEISHU_OPENCLAW_CONFIG,
                        enabled: oldConfig.enabled ?? false,
                        appId: oldConfig.appId,
                        appSecret: oldConfig.appSecret ?? '',
                        domain: oldConfig.domain || 'feishu',
                        debug: oldConfig.debug ?? true,
                    };
                    const now = Date.now();
                    this.db
                        .prepare('INSERT OR REPLACE INTO im_config (key, value, updated_at) VALUES (?, ?, ?)')
                        .run('feishuOpenClaw', JSON.stringify(newConfig), now);
                    this.db.prepare('DELETE FROM im_config WHERE key = ?').run('feishu');
                    console.log('[IMStore] Migrated old Feishu config to OpenClaw format');
                }
            }
            catch {
                // Ignore parse errors
            }
        }
        // Migrate old native DingTalk config to new OpenClaw format
        const oldDingtalkRow = this.db
            .prepare('SELECT value FROM im_config WHERE key = ?')
            .get('dingtalk');
        const newDingtalkRow = this.db
            .prepare('SELECT value FROM im_config WHERE key = ?')
            .get('dingtalkOpenClaw');
        if (oldDingtalkRow && !newDingtalkRow) {
            try {
                const oldConfig = JSON.parse(oldDingtalkRow.value);
                if (oldConfig.clientId) {
                    const newConfig = {
                        ...types_1.DEFAULT_DINGTALK_OPENCLAW_CONFIG,
                        enabled: oldConfig.enabled ?? false,
                        clientId: oldConfig.clientId,
                        clientSecret: oldConfig.clientSecret ?? '',
                        debug: oldConfig.debug ?? false,
                    };
                    const now = Date.now();
                    this.db
                        .prepare('INSERT OR REPLACE INTO im_config (key, value, updated_at) VALUES (?, ?, ?)')
                        .run('dingtalkOpenClaw', JSON.stringify(newConfig), now);
                    this.db.prepare('DELETE FROM im_config WHERE key = ?').run('dingtalk');
                    console.log('[IMStore] Migrated old DingTalk config to OpenClaw format');
                }
            }
            catch {
                // Ignore parse errors
            }
        }
        // Migrate old native WeCom config to new OpenClaw format
        const oldWecomRow = this.db
            .prepare('SELECT value FROM im_config WHERE key = ?')
            .get('wecom');
        const newWecomRow = this.db
            .prepare('SELECT value FROM im_config WHERE key = ?')
            .get('wecomOpenClaw');
        if (oldWecomRow && !newWecomRow) {
            try {
                const oldConfig = JSON.parse(oldWecomRow.value);
                if (oldConfig.botId) {
                    const newConfig = {
                        ...types_1.DEFAULT_WECOM_CONFIG,
                        enabled: oldConfig.enabled ?? false,
                        botId: oldConfig.botId,
                        secret: oldConfig.secret ?? '',
                        debug: oldConfig.debug ?? true,
                    };
                    const now = Date.now();
                    this.db
                        .prepare('INSERT OR REPLACE INTO im_config (key, value, updated_at) VALUES (?, ?, ?)')
                        .run('wecomOpenClaw', JSON.stringify(newConfig), now);
                    this.db.prepare('DELETE FROM im_config WHERE key = ?').run('wecom');
                    console.log('[IMStore] Migrated old WeCom config to OpenClaw format');
                }
            }
            catch {
                // Ignore parse errors
            }
        }
        // Migrate popo configs that have token but no connectionMode:
        // These are existing webhook users from before connectionMode was introduced.
        // Preserve their setup by explicitly setting connectionMode to 'webhook'.
        const popoRow = this.db.prepare('SELECT value FROM im_config WHERE key = ?').get('popo');
        if (popoRow) {
            try {
                const popoConfig = JSON.parse(popoRow.value);
                if (popoConfig.token && !popoConfig.connectionMode) {
                    popoConfig.connectionMode = 'webhook';
                    const now = Date.now();
                    this.db
                        .prepare('UPDATE im_config SET value = ?, updated_at = ? WHERE key = ?')
                        .run(JSON.stringify(popoConfig), now, 'popo');
                    console.log('[IMStore] Migrated popo config: inferred connectionMode=webhook from existing token');
                }
            }
            catch {
                // Ignore parse errors
            }
        }
        // Migrate single popo config to multi-instance format
        const oldPopoSingleRow = this.db
            .prepare('SELECT value FROM im_config WHERE key = ?')
            .get('popo');
        const existingPopoInstances = this.db
            .prepare('SELECT key FROM im_config WHERE key LIKE ?')
            .all('popo:%');
        if (oldPopoSingleRow && !existingPopoInstances.length) {
            try {
                const oldPopoConfig = JSON.parse(oldPopoSingleRow.value);
                const popoInstanceId = (0, node_crypto_1.randomUUID)();
                const popoInstanceConfig = {
                    ...types_1.DEFAULT_POPO_CONFIG,
                    ...oldPopoConfig,
                    instanceId: popoInstanceId,
                    instanceName: 'POPO Bot 1',
                };
                const now = Date.now();
                this.db
                    .prepare('INSERT INTO im_config (key, value, updated_at) VALUES (?, ?, ?)')
                    .run(`popo:${popoInstanceId}`, JSON.stringify(popoInstanceConfig), now);
                this.db.prepare('DELETE FROM im_config WHERE key = ?').run('popo');
                // Migrate session mappings
                this.db
                    .prepare('UPDATE im_session_mappings SET platform = ? WHERE platform = ?')
                    .run(`popo:${popoInstanceId}`, 'popo');
                // Migrate agent bindings
                const settingsRowPopo = this.db
                    .prepare('SELECT value FROM im_config WHERE key = ?')
                    .get('settings');
                if (settingsRowPopo) {
                    try {
                        const settings = JSON.parse(settingsRowPopo.value);
                        if (settings.platformAgentBindings?.['popo']) {
                            settings.platformAgentBindings[`popo:${popoInstanceId}`] =
                                settings.platformAgentBindings['popo'];
                            delete settings.platformAgentBindings['popo'];
                            this.db
                                .prepare('UPDATE im_config SET value = ?, updated_at = ? WHERE key = ?')
                                .run(JSON.stringify(settings), now, 'settings');
                        }
                    }
                    catch {
                        // Ignore parse errors
                    }
                }
                console.log('[IMStore] Migrated single POPO config to multi-instance format');
            }
            catch {
                // Ignore parse errors
            }
        }
        // Migrate 'xiaomifeng' config key to 'netease-bee'
        const oldXmfRow = this.db
            .prepare('SELECT value FROM im_config WHERE key = ?')
            .get('xiaomifeng');
        const newBeeRow = this.db
            .prepare('SELECT value FROM im_config WHERE key = ?')
            .get('netease-bee');
        if (oldXmfRow && !newBeeRow) {
            try {
                const oldConfig = JSON.parse(oldXmfRow.value);
                const now = Date.now();
                this.db
                    .prepare('INSERT INTO im_config (key, value, updated_at) VALUES (?, ?, ?)')
                    .run('netease-bee', JSON.stringify({ ...types_1.DEFAULT_NETEASE_BEE_CONFIG, ...oldConfig }), now);
                this.db.prepare('DELETE FROM im_config WHERE key = ?').run('xiaomifeng');
                console.log('[IMStore] Migrated xiaomifeng config to netease-bee');
            }
            catch {
                // Ignore parse errors
            }
        }
        // Migrate single QQ config to multi-instance format
        const oldQQRow = this.db.prepare('SELECT value FROM im_config WHERE key = ?').get('qq');
        const existingQQInstances = this.db
            .prepare('SELECT key FROM im_config WHERE key LIKE ?')
            .all('qq:%');
        if (oldQQRow && !existingQQInstances.length) {
            try {
                const oldConfig = JSON.parse(oldQQRow.value);
                const instanceId = crypto.randomUUID();
                const instanceConfig = {
                    ...types_1.DEFAULT_QQ_CONFIG,
                    ...oldConfig,
                    instanceId,
                    instanceName: 'QQ Bot 1',
                };
                const now = Date.now();
                this.db
                    .prepare('INSERT INTO im_config (key, value, updated_at) VALUES (?, ?, ?)')
                    .run(`qq:${instanceId}`, JSON.stringify(instanceConfig), now);
                this.db.prepare('DELETE FROM im_config WHERE key = ?').run('qq');
                // Migrate session mappings
                this.db
                    .prepare('UPDATE im_session_mappings SET platform = ? WHERE platform = ?')
                    .run(`qq:${instanceId}`, 'qq');
                // Migrate agent bindings
                const settingsRow2 = this.db
                    .prepare('SELECT value FROM im_config WHERE key = ?')
                    .get('settings');
                if (settingsRow2) {
                    const settings = JSON.parse(settingsRow2.value);
                    if (settings.platformAgentBindings?.['qq']) {
                        settings.platformAgentBindings[`qq:${instanceId}`] =
                            settings.platformAgentBindings['qq'];
                        delete settings.platformAgentBindings['qq'];
                        this.db
                            .prepare('UPDATE im_config SET value = ?, updated_at = ? WHERE key = ?')
                            .run(JSON.stringify(settings), now, 'settings');
                    }
                }
                console.log('[IMStore] Migrated single QQ config to multi-instance format');
            }
            catch {
                // Ignore parse errors
            }
        }
        // Migrate single Feishu config to multi-instance format
        const oldFeishuSingleRow = this.db
            .prepare('SELECT value FROM im_config WHERE key = ?')
            .get('feishuOpenClaw');
        const existingFeishuInstances = this.db
            .prepare('SELECT key FROM im_config WHERE key LIKE ?')
            .all('feishu:%');
        if (oldFeishuSingleRow && !existingFeishuInstances.length) {
            try {
                const oldConfig = JSON.parse(oldFeishuSingleRow.value);
                const instanceId = crypto.randomUUID();
                const instanceConfig = {
                    ...types_1.DEFAULT_FEISHU_OPENCLAW_CONFIG,
                    ...oldConfig,
                    instanceId,
                    instanceName: 'Feishu Bot 1',
                };
                const now = Date.now();
                this.db
                    .prepare('INSERT INTO im_config (key, value, updated_at) VALUES (?, ?, ?)')
                    .run(`feishu:${instanceId}`, JSON.stringify(instanceConfig), now);
                this.db.prepare('DELETE FROM im_config WHERE key = ?').run('feishuOpenClaw');
                // Migrate session mappings
                this.db
                    .prepare('UPDATE im_session_mappings SET platform = ? WHERE platform = ?')
                    .run(`feishu:${instanceId}`, 'feishu');
                // Migrate agent bindings
                const settingsRow3 = this.db
                    .prepare('SELECT value FROM im_config WHERE key = ?')
                    .get('settings');
                if (settingsRow3) {
                    const settings = JSON.parse(settingsRow3.value);
                    if (settings.platformAgentBindings?.['feishu']) {
                        settings.platformAgentBindings[`feishu:${instanceId}`] =
                            settings.platformAgentBindings['feishu'];
                        delete settings.platformAgentBindings['feishu'];
                        this.db
                            .prepare('UPDATE im_config SET value = ?, updated_at = ? WHERE key = ?')
                            .run(JSON.stringify(settings), now, 'settings');
                    }
                }
                console.log('[IMStore] Migrated single Feishu config to multi-instance format');
            }
            catch {
                // Ignore parse errors
            }
        }
        // Migrate single DingTalk config to multi-instance format
        const oldDingtalkSingleRow = this.db
            .prepare('SELECT value FROM im_config WHERE key = ?')
            .get('dingtalkOpenClaw');
        const existingDingtalkInstances = this.db
            .prepare('SELECT key FROM im_config WHERE key LIKE ?')
            .all('dingtalk:%');
        if (oldDingtalkSingleRow && !existingDingtalkInstances.length) {
            try {
                const oldDtConfig = JSON.parse(oldDingtalkSingleRow.value);
                const instanceId = crypto.randomUUID();
                const instanceConfig = {
                    ...types_1.DEFAULT_DINGTALK_OPENCLAW_CONFIG,
                    ...oldDtConfig,
                    instanceId,
                    instanceName: 'DingTalk Bot 1',
                };
                const now = Date.now();
                this.db
                    .prepare('INSERT INTO im_config (key, value, updated_at) VALUES (?, ?, ?)')
                    .run(`dingtalk:${instanceId}`, JSON.stringify(instanceConfig), now);
                this.db.prepare('DELETE FROM im_config WHERE key = ?').run('dingtalkOpenClaw');
                // Migrate session mappings
                this.db
                    .prepare('UPDATE im_session_mappings SET platform = ? WHERE platform = ?')
                    .run(`dingtalk:${instanceId}`, 'dingtalk');
                // Migrate agent bindings
                const settingsRow4 = this.db
                    .prepare('SELECT value FROM im_config WHERE key = ?')
                    .get('settings');
                if (settingsRow4) {
                    const settings = JSON.parse(settingsRow4.value);
                    if (settings.platformAgentBindings?.['dingtalk']) {
                        settings.platformAgentBindings[`dingtalk:${instanceId}`] =
                            settings.platformAgentBindings['dingtalk'];
                        delete settings.platformAgentBindings['dingtalk'];
                        this.db
                            .prepare('UPDATE im_config SET value = ?, updated_at = ? WHERE key = ?')
                            .run(JSON.stringify(settings), now, 'settings');
                    }
                }
                console.log('[IMStore] Migrated single DingTalk config to multi-instance format');
            }
            catch {
                // Ignore parse errors
            }
        }
        // Migrate single WeCom config to multi-instance format
        const oldWecomSingleRow = this.db.prepare('SELECT value FROM im_config WHERE key = ?').get('wecomOpenClaw');
        const existingWecomInstances = this.db
            .prepare('SELECT key FROM im_config WHERE key LIKE ?')
            .all('wecom:%');
        if (oldWecomSingleRow && !existingWecomInstances.length) {
            try {
                const oldConfig = JSON.parse(oldWecomSingleRow.value);
                const instanceId = crypto.randomUUID();
                const instanceConfig = {
                    ...types_1.DEFAULT_WECOM_CONFIG,
                    ...oldConfig,
                    instanceId,
                    instanceName: 'WeCom Bot 1',
                };
                const now = Date.now();
                this.db
                    .prepare('INSERT INTO im_config (key, value, updated_at) VALUES (?, ?, ?)')
                    .run(`wecom:${instanceId}`, JSON.stringify(instanceConfig), now);
                this.db.prepare('DELETE FROM im_config WHERE key = ?').run('wecomOpenClaw');
                // Migrate session mappings
                this.db
                    .prepare('UPDATE im_session_mappings SET platform = ? WHERE platform = ?')
                    .run(`wecom:${instanceId}`, 'wecom');
                // Migrate agent bindings
                const settingsRowWecom = this.db
                    .prepare('SELECT value FROM im_config WHERE key = ?')
                    .get('settings');
                if (settingsRowWecom) {
                    const settings = JSON.parse(settingsRowWecom.value);
                    if (settings.platformAgentBindings?.['wecom']) {
                        settings.platformAgentBindings[`wecom:${instanceId}`] =
                            settings.platformAgentBindings['wecom'];
                        delete settings.platformAgentBindings['wecom'];
                        this.db
                            .prepare('UPDATE im_config SET value = ?, updated_at = ? WHERE key = ?')
                            .run(JSON.stringify(settings), now, 'settings');
                    }
                }
                console.log('[IMStore] Migrated single WeCom config to multi-instance format');
            }
            catch {
                // Ignore parse errors
            }
        }
    }
    getConfigValue(key) {
        const row = this.db.prepare('SELECT value FROM im_config WHERE key = ?').get(key);
        if (!row)
            return undefined;
        const value = row.value;
        try {
            return JSON.parse(value);
        }
        catch (error) {
            console.warn(`Failed to parse im_config value for ${key}`, error);
            return undefined;
        }
    }
    setConfigValue(key, value) {
        const now = Date.now();
        this.db
            .prepare(`
      INSERT INTO im_config (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
    `)
            .run(key, JSON.stringify(value), now);
    }
    // ==================== Full Config Operations ====================
    getConfig() {
        const dingtalkMulti = this.getDingTalkMultiInstanceConfig();
        const telegramMulti = this.getTelegramMultiInstanceConfig();
        const discordMulti = this.getDiscordMultiInstanceConfig();
        const nimMulti = this.getNimMultiInstanceConfig();
        const neteaseBeeChan = this.getConfigValue('netease-bee') ?? types_1.DEFAULT_NETEASE_BEE_CONFIG;
        const qqMulti = this.getQQMultiInstanceConfig();
        const feishuMulti = this.getFeishuMultiInstanceConfig();
        const wecomMulti = this.getWecomMultiInstanceConfig();
        const popoMulti = this.getPopoMultiInstanceConfig();
        const weixin = this.getConfigValue('weixin') ?? types_1.DEFAULT_WEIXIN_CONFIG;
        const settings = this.getConfigValue('settings') ?? types_1.DEFAULT_IM_SETTINGS;
        const email = this.getEmailConfig();
        // Resolve enabled field: default to false for safety
        // User must explicitly enable the service by setting enabled: true
        const resolveEnabled = (stored, defaults) => {
            const merged = { ...defaults, ...stored };
            // If enabled is not explicitly set, default to false (safer behavior)
            if (stored.enabled === undefined) {
                return { ...merged, enabled: false };
            }
            return merged;
        };
        return {
            dingtalk: dingtalkMulti,
            feishu: feishuMulti,
            telegram: telegramMulti,
            discord: discordMulti,
            nim: nimMulti,
            'netease-bee': resolveEnabled(neteaseBeeChan, types_1.DEFAULT_NETEASE_BEE_CONFIG),
            qq: qqMulti,
            wecom: wecomMulti,
            popo: popoMulti,
            weixin: resolveEnabled(weixin, types_1.DEFAULT_WEIXIN_CONFIG),
            email,
            settings: { ...types_1.DEFAULT_IM_SETTINGS, ...settings },
        };
    }
    setConfig(config) {
        if (config.dingtalk) {
            this.setDingTalkMultiInstanceConfig(config.dingtalk);
        }
        if (config.feishu) {
            this.setFeishuMultiInstanceConfig(config.feishu);
        }
        if (config.telegram) {
            this.setTelegramMultiInstanceConfig(config.telegram);
        }
        if (config.discord) {
            this.setDiscordMultiInstanceConfig(config.discord);
        }
        if (config.nim) {
            this.setNimMultiInstanceConfig(config.nim);
        }
        if (config['netease-bee']) {
            this.setNeteaseBeeChanConfig(config['netease-bee']);
        }
        if (config.qq) {
            this.setQQMultiInstanceConfig(config.qq);
        }
        if (config.wecom) {
            this.setWecomMultiInstanceConfig(config.wecom);
        }
        if (config.popo) {
            this.setPopoMultiInstanceConfig(config.popo);
        }
        if (config.weixin) {
            this.setWeixinConfig(config.weixin);
        }
        if (config.email) {
            this.setEmailConfig(config.email);
        }
        if (config.settings) {
            this.setIMSettings(config.settings);
        }
    }
    // ==================== DingTalk OpenClaw Config ====================
    /** @deprecated Use getDingTalkMultiInstanceConfig() or getDingTalkInstances() instead */
    getDingTalkOpenClawConfig() {
        const stored = this.getConfigValue('dingtalkOpenClaw');
        return { ...types_1.DEFAULT_DINGTALK_OPENCLAW_CONFIG, ...stored };
    }
    /** @deprecated Use setDingTalkInstanceConfig() instead */
    setDingTalkOpenClawConfig(config) {
        const current = this.getDingTalkOpenClawConfig();
        this.setConfigValue('dingtalkOpenClaw', { ...current, ...config });
    }
    // ==================== DingTalk Multi-Instance Config ====================
    getDingTalkInstances() {
        const rows = this.db
            .prepare('SELECT key, value FROM im_config WHERE key LIKE ?')
            .all('dingtalk:%');
        if (!rows.length)
            return [];
        const instances = [];
        for (const row of rows) {
            try {
                const config = JSON.parse(row.value);
                instances.push({ ...types_1.DEFAULT_DINGTALK_OPENCLAW_CONFIG, ...config });
            }
            catch {
                // Ignore parse errors
            }
        }
        return instances;
    }
    getDingTalkInstanceConfig(instanceId) {
        const stored = this.getConfigValue(`dingtalk:${instanceId}`);
        if (!stored)
            return null;
        return { ...types_1.DEFAULT_DINGTALK_OPENCLAW_CONFIG, ...stored };
    }
    setDingTalkInstanceConfig(instanceId, config) {
        const current = this.getDingTalkInstanceConfig(instanceId);
        if (current) {
            this.setConfigValue(`dingtalk:${instanceId}`, { ...current, ...config });
        }
        else {
            this.setConfigValue(`dingtalk:${instanceId}`, {
                ...types_1.DEFAULT_DINGTALK_OPENCLAW_CONFIG,
                instanceId,
                instanceName: config.instanceName || 'DingTalk Bot',
                ...config,
            });
        }
    }
    deleteDingTalkInstance(instanceId) {
        const now = Date.now();
        this.db.prepare('DELETE FROM im_config WHERE key = ?').run(`dingtalk:${instanceId}`);
        // Clean up session mappings for this instance
        this.db
            .prepare('DELETE FROM im_session_mappings WHERE platform = ?')
            .run(`dingtalk:${instanceId}`);
        void now;
    }
    getDingTalkMultiInstanceConfig() {
        const instances = this.getDingTalkInstances();
        if (instances.length === 0)
            return types_1.DEFAULT_DINGTALK_MULTI_INSTANCE_CONFIG;
        return { instances };
    }
    setDingTalkMultiInstanceConfig(config) {
        // Write each instance individually
        for (const inst of config.instances) {
            this.setDingTalkInstanceConfig(inst.instanceId, inst);
        }
    }
    // ==================== Feishu OpenClaw Config ====================
    /** @deprecated Use getFeishuMultiInstanceConfig() or getFeishuInstances() instead */
    getFeishuOpenClawConfig() {
        const stored = this.getConfigValue('feishuOpenClaw');
        return { ...types_1.DEFAULT_FEISHU_OPENCLAW_CONFIG, ...stored };
    }
    /** @deprecated Use setFeishuInstanceConfig() instead */
    setFeishuOpenClawConfig(config) {
        const current = this.getFeishuOpenClawConfig();
        this.setConfigValue('feishuOpenClaw', { ...current, ...config });
    }
    // ==================== Feishu Multi-Instance Config ====================
    getFeishuInstances() {
        const rows = this.db
            .prepare('SELECT key, value FROM im_config WHERE key LIKE ?')
            .all('feishu:%');
        if (!rows.length)
            return [];
        const instances = [];
        for (const row of rows) {
            try {
                const config = JSON.parse(row.value);
                instances.push({ ...types_1.DEFAULT_FEISHU_OPENCLAW_CONFIG, ...config });
            }
            catch {
                // Ignore parse errors
            }
        }
        return instances;
    }
    getFeishuInstanceConfig(instanceId) {
        const stored = this.getConfigValue(`feishu:${instanceId}`);
        if (!stored)
            return null;
        return { ...types_1.DEFAULT_FEISHU_OPENCLAW_CONFIG, ...stored };
    }
    setFeishuInstanceConfig(instanceId, config) {
        const current = this.getFeishuInstanceConfig(instanceId);
        if (current) {
            this.setConfigValue(`feishu:${instanceId}`, { ...current, ...config });
        }
        else {
            this.setConfigValue(`feishu:${instanceId}`, {
                ...types_1.DEFAULT_FEISHU_OPENCLAW_CONFIG,
                instanceId,
                instanceName: config.instanceName || 'Feishu Bot',
                ...config,
            });
        }
    }
    deleteFeishuInstance(instanceId) {
        const now = Date.now();
        this.db.prepare('DELETE FROM im_config WHERE key = ?').run(`feishu:${instanceId}`);
        // Clean up session mappings for this instance
        this.db
            .prepare('DELETE FROM im_session_mappings WHERE platform = ?')
            .run(`feishu:${instanceId}`);
        void now;
    }
    getFeishuMultiInstanceConfig() {
        const instances = this.getFeishuInstances();
        if (instances.length === 0)
            return types_1.DEFAULT_FEISHU_MULTI_INSTANCE_CONFIG;
        return { instances };
    }
    setFeishuMultiInstanceConfig(config) {
        // Write each instance individually
        for (const inst of config.instances) {
            this.setFeishuInstanceConfig(inst.instanceId, inst);
        }
    }
    // ==================== Discord OpenClaw Config ====================
    /** @deprecated Use getDiscordMultiInstanceConfig() or getDiscordInstances() instead */
    getDiscordOpenClawConfig() {
        const stored = this.getConfigValue('discordOpenClaw');
        return { ...types_1.DEFAULT_DISCORD_OPENCLAW_CONFIG, ...stored };
    }
    /** @deprecated Use setDiscordInstanceConfig() instead */
    setDiscordOpenClawConfig(config) {
        const current = this.getDiscordOpenClawConfig();
        this.setConfigValue('discordOpenClaw', { ...current, ...config });
    }
    // ==================== Discord Multi-Instance Config ====================
    getDiscordInstances() {
        const rows = this.db
            .prepare('SELECT key, value FROM im_config WHERE key LIKE ?')
            .all('discord:%');
        if (!rows.length)
            return [];
        const instances = [];
        for (const row of rows) {
            try {
                const config = JSON.parse(row.value);
                instances.push({ ...types_1.DEFAULT_DISCORD_OPENCLAW_CONFIG, ...config });
            }
            catch {
                // Ignore parse errors
            }
        }
        return instances;
    }
    getDiscordInstanceConfig(instanceId) {
        const stored = this.getConfigValue(`discord:${instanceId}`);
        if (!stored)
            return null;
        return { ...types_1.DEFAULT_DISCORD_OPENCLAW_CONFIG, ...stored };
    }
    setDiscordInstanceConfig(instanceId, config) {
        const current = this.getDiscordInstanceConfig(instanceId);
        if (current) {
            this.setConfigValue(`discord:${instanceId}`, { ...current, ...config });
        }
        else {
            this.setConfigValue(`discord:${instanceId}`, {
                ...types_1.DEFAULT_DISCORD_OPENCLAW_CONFIG,
                instanceId,
                instanceName: config.instanceName || 'Discord Bot',
                ...config,
            });
        }
    }
    deleteDiscordInstance(instanceId) {
        this.db.prepare('DELETE FROM im_config WHERE key = ?').run(`discord:${instanceId}`);
        this.db.prepare('DELETE FROM im_session_mappings WHERE platform = ?').run(`discord:${instanceId}`);
    }
    getDiscordMultiInstanceConfig() {
        const instances = this.getDiscordInstances();
        if (instances.length === 0)
            return types_1.DEFAULT_DISCORD_MULTI_INSTANCE_CONFIG;
        return { instances };
    }
    setDiscordMultiInstanceConfig(config) {
        for (const inst of config.instances) {
            this.setDiscordInstanceConfig(inst.instanceId, inst);
        }
    }
    // ==================== NIM Config ====================
    hasMeaningfulNimConfig(config) {
        return Boolean(config && (config.nimToken || (config.appKey && config.account && config.token)));
    }
    buildMigratedNimInstance(config) {
        return {
            ...types_1.DEFAULT_NIM_CONFIG,
            ...config,
            instanceId: (0, node_crypto_1.randomUUID)(),
            instanceName: 'NIM Bot 1',
        };
    }
    getNimConfig() {
        const stored = this.getConfigValue('nim');
        return { ...types_1.DEFAULT_NIM_CONFIG, ...stored };
    }
    setNimConfig(config) {
        const current = this.getNimConfig();
        this.setConfigValue('nim', { ...current, ...config });
    }
    deleteLegacyNimConfig() {
        this.db.prepare('DELETE FROM im_config WHERE key = ?').run('nim');
    }
    getNimInstances() {
        const rows = this.db
            .prepare('SELECT key, value FROM im_config WHERE key LIKE ?')
            .all('nim:%');
        if (rows.length > 0) {
            const instances = [];
            for (const row of rows) {
                try {
                    const config = JSON.parse(row.value);
                    instances.push({ ...types_1.DEFAULT_NIM_CONFIG, ...config });
                }
                catch {
                    // Ignore parse errors
                }
            }
            return instances;
        }
        const legacy = this.getConfigValue('nim');
        if (!this.hasMeaningfulNimConfig(legacy)) {
            return [];
        }
        const migrated = this.buildMigratedNimInstance(legacy);
        this.setNimInstanceConfig(migrated.instanceId, migrated);
        return [migrated];
    }
    getNimInstanceConfig(instanceId) {
        const stored = this.getConfigValue(`nim:${instanceId}`);
        if (!stored)
            return null;
        return { ...types_1.DEFAULT_NIM_CONFIG, ...stored };
    }
    setNimInstanceConfig(instanceId, config) {
        this.deleteLegacyNimConfig();
        const current = this.getNimInstanceConfig(instanceId);
        if (current) {
            this.setConfigValue(`nim:${instanceId}`, { ...current, ...config });
            return;
        }
        this.setConfigValue(`nim:${instanceId}`, {
            ...types_1.DEFAULT_NIM_CONFIG,
            instanceId,
            instanceName: config.instanceName || 'NIM Bot',
            ...config,
        });
    }
    deleteNimInstance(instanceId) {
        this.db.prepare('DELETE FROM im_config WHERE key = ?').run(`nim:${instanceId}`);
        this.db.prepare('DELETE FROM im_session_mappings WHERE platform = ?').run(`nim:${instanceId}`);
        if (this.getNimInstances().length === 0) {
            this.deleteLegacyNimConfig();
        }
    }
    getNimMultiInstanceConfig() {
        const instances = this.getNimInstances();
        if (instances.length === 0)
            return types_1.DEFAULT_NIM_MULTI_INSTANCE_CONFIG;
        return { instances };
    }
    setNimMultiInstanceConfig(config) {
        this.deleteLegacyNimConfig();
        const nextIds = new Set(config.instances.map((inst) => inst.instanceId));
        for (const inst of this.getNimInstances()) {
            if (!nextIds.has(inst.instanceId)) {
                this.deleteNimInstance(inst.instanceId);
            }
        }
        for (const inst of config.instances) {
            this.setNimInstanceConfig(inst.instanceId, inst);
        }
    }
    // ==================== NeteaseBee Chan Config ====================
    getNeteaseBeeChanConfig() {
        const stored = this.getConfigValue('netease-bee');
        return { ...types_1.DEFAULT_NETEASE_BEE_CONFIG, ...stored };
    }
    setNeteaseBeeChanConfig(config) {
        const current = this.getNeteaseBeeChanConfig();
        this.setConfigValue('netease-bee', { ...current, ...config });
    }
    // ==================== Telegram OpenClaw Config ====================
    /** @deprecated Use getTelegramMultiInstanceConfig() or getTelegramInstances() instead */
    getTelegramOpenClawConfig() {
        const stored = this.getConfigValue('telegramOpenClaw');
        return { ...types_1.DEFAULT_TELEGRAM_OPENCLAW_CONFIG, ...stored };
    }
    /** @deprecated Use setTelegramInstanceConfig() instead */
    setTelegramOpenClawConfig(config) {
        const current = this.getTelegramOpenClawConfig();
        this.setConfigValue('telegramOpenClaw', { ...current, ...config });
    }
    // ==================== Telegram Multi-Instance Config ====================
    getTelegramInstances() {
        const rows = this.db
            .prepare('SELECT key, value FROM im_config WHERE key LIKE ?')
            .all('telegram:%');
        if (!rows.length)
            return [];
        const instances = [];
        for (const row of rows) {
            try {
                const config = JSON.parse(row.value);
                instances.push({ ...types_1.DEFAULT_TELEGRAM_OPENCLAW_CONFIG, ...config });
            }
            catch {
                // Ignore parse errors
            }
        }
        return instances;
    }
    getTelegramInstanceConfig(instanceId) {
        const stored = this.getConfigValue(`telegram:${instanceId}`);
        if (!stored)
            return null;
        return { ...types_1.DEFAULT_TELEGRAM_OPENCLAW_CONFIG, ...stored };
    }
    setTelegramInstanceConfig(instanceId, config) {
        const current = this.getTelegramInstanceConfig(instanceId);
        if (current) {
            this.setConfigValue(`telegram:${instanceId}`, { ...current, ...config });
        }
        else {
            this.setConfigValue(`telegram:${instanceId}`, {
                ...types_1.DEFAULT_TELEGRAM_OPENCLAW_CONFIG,
                instanceId,
                instanceName: config.instanceName || 'Telegram Bot',
                ...config,
            });
        }
    }
    deleteTelegramInstance(instanceId) {
        this.db.prepare('DELETE FROM im_config WHERE key = ?').run(`telegram:${instanceId}`);
        this.db.prepare('DELETE FROM im_session_mappings WHERE platform = ?').run(`telegram:${instanceId}`);
    }
    getTelegramMultiInstanceConfig() {
        const instances = this.getTelegramInstances();
        if (instances.length === 0)
            return types_1.DEFAULT_TELEGRAM_MULTI_INSTANCE_CONFIG;
        return { instances };
    }
    setTelegramMultiInstanceConfig(config) {
        for (const inst of config.instances) {
            this.setTelegramInstanceConfig(inst.instanceId, inst);
        }
    }
    // ==================== QQ Multi-Instance Config ====================
    /** @deprecated Use getQQMultiInstanceConfig() or getQQInstances() instead */
    getQQConfig() {
        const stored = this.getConfigValue('qq');
        return { ...types_1.DEFAULT_QQ_CONFIG, ...stored };
    }
    /** @deprecated Use setQQInstanceConfig() instead */
    setQQConfig(config) {
        const current = this.getQQConfig();
        this.setConfigValue('qq', { ...current, ...config });
    }
    getQQInstances() {
        const rows = this.db
            .prepare('SELECT key, value FROM im_config WHERE key LIKE ?')
            .all('qq:%');
        if (!rows.length)
            return [];
        const instances = [];
        for (const row of rows) {
            try {
                const config = JSON.parse(row.value);
                instances.push({ ...types_1.DEFAULT_QQ_CONFIG, ...config });
            }
            catch {
                // Ignore parse errors
            }
        }
        return instances;
    }
    getQQInstanceConfig(instanceId) {
        const stored = this.getConfigValue(`qq:${instanceId}`);
        if (!stored)
            return null;
        return { ...types_1.DEFAULT_QQ_CONFIG, ...stored };
    }
    setQQInstanceConfig(instanceId, config) {
        const current = this.getQQInstanceConfig(instanceId);
        if (current) {
            this.setConfigValue(`qq:${instanceId}`, { ...current, ...config });
        }
        else {
            this.setConfigValue(`qq:${instanceId}`, {
                ...types_1.DEFAULT_QQ_CONFIG,
                instanceId,
                instanceName: config.instanceName || `QQ Bot`,
                ...config,
            });
        }
    }
    deleteQQInstance(instanceId) {
        const now = Date.now();
        this.db.prepare('DELETE FROM im_config WHERE key = ?').run(`qq:${instanceId}`);
        // Clean up session mappings for this instance
        this.db.prepare('DELETE FROM im_session_mappings WHERE platform = ?').run(`qq:${instanceId}`);
        void now;
    }
    getQQMultiInstanceConfig() {
        const instances = this.getQQInstances();
        if (instances.length === 0)
            return types_1.DEFAULT_QQ_MULTI_INSTANCE_CONFIG;
        return { instances };
    }
    setQQMultiInstanceConfig(config) {
        // Write each instance individually
        for (const inst of config.instances) {
            this.setQQInstanceConfig(inst.instanceId, inst);
        }
    }
    // ==================== WeCom Multi-Instance Config ====================
    /** @deprecated Use getWecomMultiInstanceConfig() or getWecomInstances() instead */
    getWecomConfig() {
        const stored = this.getConfigValue('wecomOpenClaw');
        return { ...types_1.DEFAULT_WECOM_CONFIG, ...stored };
    }
    /** @deprecated Use setWecomInstanceConfig() instead */
    setWecomConfig(config) {
        const current = this.getWecomConfig();
        this.setConfigValue('wecomOpenClaw', { ...current, ...config });
    }
    getWecomInstances() {
        const rows = this.db
            .prepare('SELECT key, value FROM im_config WHERE key LIKE ?')
            .all('wecom:%');
        if (!rows.length)
            return [];
        const instances = [];
        for (const row of rows) {
            try {
                const config = JSON.parse(row.value);
                instances.push({ ...types_1.DEFAULT_WECOM_CONFIG, ...config });
            }
            catch {
                // Ignore parse errors
            }
        }
        return instances;
    }
    getWecomInstanceConfig(instanceId) {
        const stored = this.getConfigValue(`wecom:${instanceId}`);
        if (!stored)
            return null;
        return { ...types_1.DEFAULT_WECOM_CONFIG, ...stored };
    }
    setWecomInstanceConfig(instanceId, config) {
        const current = this.getWecomInstanceConfig(instanceId);
        if (current) {
            this.setConfigValue(`wecom:${instanceId}`, { ...current, ...config });
        }
        else {
            this.setConfigValue(`wecom:${instanceId}`, {
                ...types_1.DEFAULT_WECOM_CONFIG,
                instanceId,
                instanceName: config.instanceName || `WeCom Bot`,
                ...config,
            });
        }
    }
    deleteWecomInstance(instanceId) {
        this.db.prepare('DELETE FROM im_config WHERE key = ?').run(`wecom:${instanceId}`);
        // Clean up session mappings for this instance
        this.db.prepare('DELETE FROM im_session_mappings WHERE platform = ?').run(`wecom:${instanceId}`);
    }
    getWecomMultiInstanceConfig() {
        const instances = this.getWecomInstances();
        if (instances.length === 0)
            return types_1.DEFAULT_WECOM_MULTI_INSTANCE_CONFIG;
        return { instances };
    }
    setWecomMultiInstanceConfig(config) {
        // Write each instance individually
        for (const inst of config.instances) {
            this.setWecomInstanceConfig(inst.instanceId, inst);
        }
    }
    // ==================== POPO ====================
    /** @deprecated Use getPopoMultiInstanceConfig() or getPopoInstances() instead */
    getPopoConfig() {
        const stored = this.getConfigValue('popo');
        return { ...types_1.DEFAULT_POPO_CONFIG, ...stored };
    }
    /** @deprecated Use setPopoInstanceConfig() instead */
    setPopoConfig(config) {
        const current = this.getPopoConfig();
        this.setConfigValue('popo', { ...current, ...config });
    }
    // ==================== POPO Multi-Instance Config ====================
    getPopoInstances() {
        const rows = this.db
            .prepare('SELECT key, value FROM im_config WHERE key LIKE ?')
            .all('popo:%');
        if (!rows.length)
            return [];
        const instances = [];
        for (const row of rows) {
            try {
                const config = JSON.parse(row.value);
                instances.push({ ...types_1.DEFAULT_POPO_CONFIG, ...config });
            }
            catch {
                // Ignore parse errors
            }
        }
        return instances;
    }
    getPopoInstanceConfig(instanceId) {
        const stored = this.getConfigValue(`popo:${instanceId}`);
        if (!stored)
            return null;
        return { ...types_1.DEFAULT_POPO_CONFIG, ...stored };
    }
    setPopoInstanceConfig(instanceId, config) {
        const current = this.getPopoInstanceConfig(instanceId);
        if (current) {
            this.setConfigValue(`popo:${instanceId}`, { ...current, ...config });
        }
        else {
            this.setConfigValue(`popo:${instanceId}`, {
                ...types_1.DEFAULT_POPO_CONFIG,
                instanceId,
                instanceName: config.instanceName || 'POPO Bot',
                ...config,
            });
        }
    }
    deletePopoInstance(instanceId) {
        this.db.prepare('DELETE FROM im_config WHERE key = ?').run(`popo:${instanceId}`);
        this.db
            .prepare('DELETE FROM im_session_mappings WHERE platform = ?')
            .run(`popo:${instanceId}`);
    }
    getPopoMultiInstanceConfig() {
        const instances = this.getPopoInstances();
        if (instances.length === 0)
            return types_1.DEFAULT_POPO_MULTI_INSTANCE_CONFIG;
        return { instances };
    }
    setPopoMultiInstanceConfig(config) {
        for (const inst of config.instances) {
            this.setPopoInstanceConfig(inst.instanceId, inst);
        }
    }
    // ==================== Weixin (微信) ====================
    getWeixinConfig() {
        const stored = this.getConfigValue('weixin');
        return { ...types_1.DEFAULT_WEIXIN_CONFIG, ...stored };
    }
    setWeixinConfig(config) {
        const current = this.getWeixinConfig();
        this.setConfigValue('weixin', { ...current, ...config });
    }
    // ==================== IM Settings ====================
    getIMSettings() {
        const stored = this.getConfigValue('settings');
        return { ...types_1.DEFAULT_IM_SETTINGS, ...stored };
    }
    setIMSettings(settings) {
        const current = this.getIMSettings();
        this.setConfigValue('settings', { ...current, ...settings });
    }
    // ==================== Email Channel Config ====================
    /**
     * Get email channel multi-instance configuration
     */
    getEmailConfig() {
        const raw = this.db.prepare('SELECT value FROM im_config WHERE key = ?').get('email');
        if (!raw?.value) {
            return types_1.DEFAULT_EMAIL_MULTI_INSTANCE_CONFIG;
        }
        try {
            const parsed = JSON.parse(raw.value);
            // Migration logic: detect v1 format (single account) and convert to v2 (multi-instance)
            if (parsed.email && !parsed.instances) {
                console.log('[EmailChannel] Migrating from v1 config format');
                return {
                    instances: [
                        {
                            instanceId: 'email-1',
                            instanceName: 'Default',
                            enabled: parsed.enabled ?? false,
                            transport: 'imap',
                            email: parsed.email,
                            password: parsed.password,
                            agentId: 'main',
                            ...types_1.DEFAULT_EMAIL_INSTANCE_CONFIG,
                        },
                    ],
                };
            }
            // v2 format: multi-instance mode
            return {
                instances: (parsed.instances || []).map((inst) => ({
                    ...types_1.DEFAULT_EMAIL_INSTANCE_CONFIG,
                    ...inst,
                })),
            };
        }
        catch (error) {
            console.error('[EmailChannel] Failed to parse config:', error);
            return types_1.DEFAULT_EMAIL_MULTI_INSTANCE_CONFIG;
        }
    }
    /**
     * Set email channel multi-instance configuration
     */
    setEmailConfig(config) {
        this.setConfigValue('email', config);
    }
    setEmailInstanceConfig(instanceId, config) {
        const current = this.getEmailConfig();
        const existing = current.instances.find(i => i.instanceId === instanceId);
        if (existing) {
            const updated = current.instances.map(i => i.instanceId === instanceId ? { ...i, ...config } : i);
            this.setEmailConfig({ instances: updated });
        }
        else {
            this.setEmailConfig({
                instances: [...current.instances, { ...types_1.DEFAULT_EMAIL_INSTANCE_CONFIG, ...config, instanceId }],
            });
        }
    }
    deleteEmailInstance(instanceId) {
        const current = this.getEmailConfig();
        const updated = current.instances.filter(i => i.instanceId !== instanceId);
        this.setEmailConfig({ instances: updated });
        // Clean up session mappings for this instance
        this.db
            .prepare('DELETE FROM im_session_mappings WHERE platform = ?')
            .run(`email:${instanceId}`);
    }
    // ==================== Utility ====================
    /**
     * Clear all IM configuration
     */
    clearConfig() {
        this.db.prepare('DELETE FROM im_config').run();
    }
    /**
     * Check if IM is configured (at least one platform has credentials)
     */
    isConfigured() {
        const config = this.getConfig();
        const hasDingTalk = config.dingtalk?.instances?.some(i => !!(i.clientId && i.clientSecret)) ?? false;
        const hasFeishu = config.feishu?.instances?.some(i => !!(i.appId && i.appSecret)) ?? false;
        const hasTelegram = config.telegram?.instances?.some(i => !!i.botToken) ?? false;
        const hasDiscord = config.discord?.instances?.some(i => !!i.botToken) ?? false;
        const hasNim = config.nim?.instances?.some(i => !!(i.nimToken || (i.appKey && i.account && i.token))) ?? false;
        const hasNeteaseBeeChan = !!(config['netease-bee']?.clientId && config['netease-bee']?.secret);
        const hasQQ = config.qq?.instances?.some(i => !!(i.appId && i.appSecret)) ?? false;
        const hasWecom = config.wecom?.instances?.some(i => !!(i.botId && i.secret)) ?? false;
        return (hasDingTalk ||
            hasFeishu ||
            hasTelegram ||
            hasDiscord ||
            hasNim ||
            hasNeteaseBeeChan ||
            hasQQ ||
            hasWecom);
    }
    // ==================== Notification Target Persistence ====================
    /**
     * Get persisted notification target for a platform
     */
    getNotificationTarget(platform) {
        return this.getConfigValue(`notification_target:${platform}`) ?? null;
    }
    /**
     * Persist notification target for a platform
     */
    setNotificationTarget(platform, target) {
        this.setConfigValue(`notification_target:${platform}`, target);
    }
    getConversationReplyRoute(platform, conversationId) {
        const normalizedConversationId = conversationId.trim();
        if (!normalizedConversationId) {
            return null;
        }
        return (this.getConfigValue(`conversation_reply_route:${platform}:${normalizedConversationId}`) ?? null);
    }
    setConversationReplyRoute(platform, conversationId, route) {
        const normalizedConversationId = conversationId.trim();
        if (!normalizedConversationId) {
            return;
        }
        this.setConfigValue(`conversation_reply_route:${platform}:${normalizedConversationId}`, route);
    }
    // ==================== Session Mapping Operations ====================
    /**
     * Get session mapping by IM conversation ID and platform.
     *
     * When agentId is provided, this is an agent-scoped lookup. Calls without
     * agentId keep legacy behavior and return the most recent mapping for the
     * conversation, preferring the main agent when timestamps tie.
     */
    getSessionMapping(imConversationId, platform, agentId) {
        const normalizedAgentId = agentId?.trim();
        const row = normalizedAgentId
            ? this.db
                .prepare('SELECT im_conversation_id, platform, cowork_session_id, agent_id, openclaw_session_key, created_at, last_active_at FROM im_session_mappings WHERE im_conversation_id = ? AND platform = ? AND agent_id = ?')
                .get(imConversationId, platform, normalizedAgentId)
            : this.db
                .prepare(`SELECT im_conversation_id, platform, cowork_session_id, agent_id, openclaw_session_key, created_at, last_active_at
           FROM im_session_mappings
           WHERE im_conversation_id = ? AND platform = ?
           ORDER BY last_active_at DESC, CASE WHEN agent_id = 'main' THEN 0 ELSE 1 END
           LIMIT 1`)
                .get(imConversationId, platform);
        return row ? mapSessionMappingRow(row) : null;
    }
    /**
     * Find the IM mapping that owns a real OpenClaw channel session key.
     */
    getSessionMappingByOpenClawSessionKey(openClawSessionKey) {
        const normalizedKey = openClawSessionKey.trim();
        if (!normalizedKey)
            return null;
        const row = this.db
            .prepare('SELECT im_conversation_id, platform, cowork_session_id, agent_id, openclaw_session_key, created_at, last_active_at FROM im_session_mappings WHERE openclaw_session_key = ? ORDER BY last_active_at DESC LIMIT 1')
            .get(normalizedKey);
        return row ? mapSessionMappingRow(row) : null;
    }
    /**
     * Find the IM mapping that owns a given cowork session ID.
     */
    getSessionMappingByCoworkSessionId(coworkSessionId) {
        const row = this.db
            .prepare('SELECT im_conversation_id, platform, cowork_session_id, agent_id, openclaw_session_key, created_at, last_active_at FROM im_session_mappings WHERE cowork_session_id = ? LIMIT 1')
            .get(coworkSessionId);
        return row ? mapSessionMappingRow(row) : null;
    }
    /**
     * Create a new session mapping
     */
    createSessionMapping(imConversationId, platform, coworkSessionId, agentId = 'main', openClawSessionKey = '') {
        const now = Date.now();
        const normalizedOpenClawSessionKey = openClawSessionKey.trim();
        this.db
            .prepare('INSERT INTO im_session_mappings (im_conversation_id, platform, cowork_session_id, agent_id, openclaw_session_key, created_at, last_active_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
            .run(imConversationId, platform, coworkSessionId, agentId, normalizedOpenClawSessionKey || null, now, now);
        return {
            imConversationId,
            platform,
            coworkSessionId,
            agentId,
            ...(normalizedOpenClawSessionKey ? { openClawSessionKey: normalizedOpenClawSessionKey } : {}),
            createdAt: now,
            lastActiveAt: now,
        };
    }
    /**
     * Update last active time for a session mapping
     */
    updateSessionLastActive(imConversationId, platform, agentId) {
        const now = Date.now();
        const normalizedAgentId = agentId?.trim();
        if (normalizedAgentId) {
            this.db
                .prepare('UPDATE im_session_mappings SET last_active_at = ? WHERE im_conversation_id = ? AND platform = ? AND agent_id = ?')
                .run(now, imConversationId, platform, normalizedAgentId);
            return;
        }
        this.db
            .prepare(`UPDATE im_session_mappings
         SET last_active_at = ?
         WHERE rowid = (
           SELECT rowid FROM im_session_mappings
           WHERE im_conversation_id = ? AND platform = ?
           ORDER BY last_active_at DESC, CASE WHEN agent_id = 'main' THEN 0 ELSE 1 END
           LIMIT 1
         )`)
            .run(now, imConversationId, platform);
    }
    /**
     * Update the target session and agent for an existing mapping.
     * Used when the platform's agent binding changes.
     */
    updateSessionMappingTarget(imConversationId, platform, newCoworkSessionId, newAgentId, newOpenClawSessionKey, existingAgentId) {
        const now = Date.now();
        const normalizedOpenClawSessionKey = newOpenClawSessionKey?.trim() || null;
        const normalizedExistingAgentId = existingAgentId?.trim();
        if (normalizedExistingAgentId) {
            this.db
                .prepare('UPDATE im_session_mappings SET cowork_session_id = ?, agent_id = ?, openclaw_session_key = COALESCE(?, openclaw_session_key), last_active_at = ? WHERE im_conversation_id = ? AND platform = ? AND agent_id = ?')
                .run(newCoworkSessionId, newAgentId, normalizedOpenClawSessionKey, now, imConversationId, platform, normalizedExistingAgentId);
            return;
        }
        this.db
            .prepare(`UPDATE im_session_mappings
         SET cowork_session_id = ?, agent_id = ?, openclaw_session_key = COALESCE(?, openclaw_session_key), last_active_at = ?
         WHERE rowid = (
           SELECT rowid FROM im_session_mappings
           WHERE im_conversation_id = ? AND platform = ?
           ORDER BY last_active_at DESC, CASE WHEN agent_id = 'main' THEN 0 ELSE 1 END
           LIMIT 1
         )`)
            .run(newCoworkSessionId, newAgentId, normalizedOpenClawSessionKey, now, imConversationId, platform);
    }
    updateSessionOpenClawSessionKey(imConversationId, platform, openClawSessionKey, agentId) {
        const normalizedKey = openClawSessionKey.trim();
        if (!normalizedKey) {
            return;
        }
        const now = Date.now();
        const normalizedAgentId = agentId?.trim();
        if (normalizedAgentId) {
            this.db
                .prepare('UPDATE im_session_mappings SET openclaw_session_key = ?, last_active_at = ? WHERE im_conversation_id = ? AND platform = ? AND agent_id = ?')
                .run(normalizedKey, now, imConversationId, platform, normalizedAgentId);
            return;
        }
        this.db
            .prepare(`UPDATE im_session_mappings
         SET openclaw_session_key = ?, last_active_at = ?
         WHERE rowid = (
           SELECT rowid FROM im_session_mappings
           WHERE im_conversation_id = ? AND platform = ?
           ORDER BY last_active_at DESC, CASE WHEN agent_id = 'main' THEN 0 ELSE 1 END
           LIMIT 1
         )`)
            .run(normalizedKey, now, imConversationId, platform);
    }
    /**
     * Delete a session mapping
     */
    deleteSessionMapping(imConversationId, platform, agentId) {
        const normalizedAgentId = agentId?.trim();
        if (normalizedAgentId) {
            this.db
                .prepare('DELETE FROM im_session_mappings WHERE im_conversation_id = ? AND platform = ? AND agent_id = ?')
                .run(imConversationId, platform, normalizedAgentId);
            return;
        }
        this.db
            .prepare('DELETE FROM im_session_mappings WHERE im_conversation_id = ? AND platform = ?')
            .run(imConversationId, platform);
    }
    /**
     * Delete all session mappings that reference a given cowork session ID.
     * Called when a cowork session is deleted so that the IM conversation
     * can be re-synced as a fresh session.
     */
    deleteSessionMappingByCoworkSessionId(coworkSessionId) {
        this.db
            .prepare('DELETE FROM im_session_mappings WHERE cowork_session_id = ?')
            .run(coworkSessionId);
    }
    /**
     * List all session mappings for a platform, optionally filtered by IM bot accountId.
     *
     * The accountId is encoded as the first segment of im_conversation_id before
     * the peer subtype suffix (for example "c9c41984:direct:ou_xxx" or the legacy
     * NIM form "appKey-account:direct:peer"). Filtering by accountId therefore
     * requires no schema migration. NIM additionally accepts the current stable
     * instance key and matches legacy runtime-derived prefixes for compatibility.
     */
    listSessionMappings(platform, accountId) {
        let query;
        let params;
        if (platform && accountId) {
            const directPrefixes = new Set([accountId]);
            if (platform === 'nim') {
                for (const inst of this.getNimInstances()) {
                    const instanceKey = inst.instanceId?.slice(0, 8);
                    if (instanceKey !== accountId)
                        continue;
                    const runtimeAccountId = deriveNimRuntimeAccountIdForInstance(inst);
                    if (runtimeAccountId) {
                        directPrefixes.add(normalizeNimLegacyConversationPrefix(runtimeAccountId));
                    }
                }
            }
            // Include direct conversations owned by this bot instance (prefix matches accountId)
            // and all group conversations for the platform, since group membership per-bot
            // is not yet stored — group: prefix is a temporary heuristic until im_account_id
            // column is introduced.
            const directClauses = Array.from(directPrefixes).map(() => 'im_conversation_id LIKE ?');
            query = `SELECT im_conversation_id, platform, cowork_session_id, agent_id, openclaw_session_key, created_at, last_active_at
        FROM im_session_mappings
        WHERE platform = ?
          AND (${directClauses.join(' OR ')} OR im_conversation_id LIKE 'group:%')
        ORDER BY last_active_at DESC`;
            params = [platform, ...Array.from(directPrefixes).map((prefix) => `${prefix}:%`)];
        }
        else if (platform) {
            query =
                'SELECT im_conversation_id, platform, cowork_session_id, agent_id, openclaw_session_key, created_at, last_active_at FROM im_session_mappings WHERE platform = ? ORDER BY last_active_at DESC';
            params = [platform];
        }
        else {
            query =
                'SELECT im_conversation_id, platform, cowork_session_id, agent_id, openclaw_session_key, created_at, last_active_at FROM im_session_mappings ORDER BY last_active_at DESC';
            params = [];
        }
        const rows = this.db.prepare(query).all(...params);
        return rows.map(mapSessionMappingRow);
    }
}
exports.IMStore = IMStore;
//# sourceMappingURL=imStore.js.map