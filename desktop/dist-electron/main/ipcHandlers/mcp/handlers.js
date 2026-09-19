"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerMcpHandlers = registerMcpHandlers;
const electron_1 = require("electron");
const https_1 = __importDefault(require("https"));
const constants_1 = require("../../../shared/mcp/constants");
const url_1 = require("../../../shared/mcp/url");
const openclawConfigImpact_1 = require("../../libs/openclawConfigImpact");
const qichachaMcpAuth_1 = require("../../mcp/qichachaMcpAuth");
function fetchText(url) {
    return new Promise((resolve, reject) => {
        const req = https_1.default.get(url, { timeout: 10000 }, res => {
            if (res.statusCode !== 200) {
                reject(new Error(`HTTP ${res.statusCode}`));
                res.resume();
                return;
            }
            let body = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => {
                body += chunk;
            });
            res.on('end', () => resolve(body));
            res.on('error', reject);
        });
        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
    });
}
function syncMcpConfig(syncOpenClawConfig, reason) {
    syncOpenClawConfig({
        reason,
        expectedImpact: openclawConfigImpact_1.OpenClawConfigImpact.Restart,
    }).catch(err => console.error('[MCP] config sync error:', err));
}
function normalizeMcpServerInput(data) {
    if ((data.transportType === 'sse' || data.transportType === 'http')
        && data.url !== undefined) {
        const normalized = (0, url_1.normalizeMcpServerUrlInput)(data.url);
        if (!normalized.ok) {
            throw new Error('MCP server URL must be an absolute HTTP or HTTPS URL.');
        }
        return { ...data, url: normalized.url };
    }
    return data;
}
const QICHACHA_REGISTRY_ID = 'qichacha';
const QICHACHA_MCP_SERVERS = [
    {
        name: 'qcc-company',
        description: 'Qichacha company data MCP server',
        url: 'https://agent.qcc.com/mcp/company/stream',
    },
    {
        name: 'qcc-risk',
        description: 'Qichacha risk data MCP server',
        url: 'https://agent.qcc.com/mcp/risk/stream',
    },
    {
        name: 'qcc-ipr',
        description: 'Qichacha intellectual property data MCP server',
        url: 'https://agent.qcc.com/mcp/ipr/stream',
    },
    {
        name: 'qcc-operation',
        description: 'Qichacha operation data MCP server',
        url: 'https://agent.qcc.com/mcp/operation/stream',
    },
    {
        name: 'qcc-executive',
        description: 'Qichacha executive data MCP server',
        url: 'https://agent.qcc.com/mcp/executive/stream',
    },
    {
        name: 'qcc-history',
        description: 'Qichacha historical archive data MCP server',
        url: 'https://agent.qcc.com/mcp/history/stream',
    },
];
function buildQichachaServerData(server, apiKey) {
    return {
        name: server.name,
        description: server.description,
        transportType: 'http',
        url: server.url,
        headers: {
            Authorization: `Bearer ${apiKey}`,
        },
        isBuiltIn: true,
        registryId: QICHACHA_REGISTRY_ID,
    };
}
function registerMcpHandlers(deps) {
    const { getMcpRuntime, syncOpenClawConfig } = deps;
    electron_1.ipcMain.handle(constants_1.McpIpcChannel.List, () => {
        try {
            const servers = getMcpRuntime().getStore().listServers();
            return { success: true, servers };
        }
        catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to list MCP servers',
            };
        }
    });
    electron_1.ipcMain.handle(constants_1.McpIpcChannel.Create, async (_event, data) => {
        try {
            const mcpRuntime = getMcpRuntime();
            const normalizedData = normalizeMcpServerInput(data);
            const server = mcpRuntime.getStore().createServer(normalizedData);
            if (server.enabled) {
                mcpRuntime.ensureLaunchResolution(server.id, 'mcp-server-created');
            }
            const servers = mcpRuntime.getStore().listServers();
            syncMcpConfig(syncOpenClawConfig, 'mcp-server-created');
            return { success: true, servers };
        }
        catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to create MCP server',
            };
        }
    });
    electron_1.ipcMain.handle(constants_1.McpIpcChannel.Update, async (_event, id, data) => {
        try {
            const mcpRuntime = getMcpRuntime();
            const normalizedData = normalizeMcpServerInput(data);
            const server = mcpRuntime.getStore().updateServer(id, normalizedData);
            if (server?.enabled) {
                mcpRuntime.ensureLaunchResolution(server.id, 'mcp-server-updated');
            }
            const servers = mcpRuntime.getStore().listServers();
            syncMcpConfig(syncOpenClawConfig, 'mcp-server-updated');
            return { success: true, servers };
        }
        catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to update MCP server',
            };
        }
    });
    electron_1.ipcMain.handle(constants_1.McpIpcChannel.Delete, async (_event, id) => {
        try {
            const mcpRuntime = getMcpRuntime();
            mcpRuntime.getStore().deleteServer(id);
            const servers = mcpRuntime.getStore().listServers();
            syncMcpConfig(syncOpenClawConfig, 'mcp-server-deleted');
            return { success: true, servers };
        }
        catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to delete MCP server',
            };
        }
    });
    electron_1.ipcMain.handle(constants_1.McpIpcChannel.DeleteByRegistryId, async (_event, registryId) => {
        try {
            const normalizedRegistryId = registryId.trim();
            if (!normalizedRegistryId) {
                throw new Error('MCP registry id is required');
            }
            const mcpRuntime = getMcpRuntime();
            const store = mcpRuntime.getStore();
            const matchingServers = store
                .listServers()
                .filter(server => server.registryId === normalizedRegistryId);
            for (const server of matchingServers) {
                store.deleteServer(server.id);
            }
            const servers = store.listServers();
            syncMcpConfig(syncOpenClawConfig, 'mcp-registry-deleted');
            return { success: true, servers };
        }
        catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to delete MCP registry servers',
            };
        }
    });
    electron_1.ipcMain.handle(constants_1.McpIpcChannel.SetEnabled, async (_event, options) => {
        try {
            const mcpRuntime = getMcpRuntime();
            mcpRuntime.getStore().setEnabled(options.id, options.enabled);
            if (options.enabled) {
                mcpRuntime.ensureLaunchResolution(options.id, 'mcp-server-enabled');
            }
            const servers = mcpRuntime.getStore().listServers();
            syncMcpConfig(syncOpenClawConfig, 'mcp-server-toggled');
            return { success: true, servers };
        }
        catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to update MCP server',
            };
        }
    });
    electron_1.ipcMain.handle(constants_1.McpIpcChannel.SetEnabledByRegistryId, async (_event, options) => {
        try {
            const normalizedRegistryId = options.registryId.trim();
            if (!normalizedRegistryId) {
                throw new Error('MCP registry id is required');
            }
            const mcpRuntime = getMcpRuntime();
            const store = mcpRuntime.getStore();
            const matchingServers = store
                .listServers()
                .filter(server => server.registryId === normalizedRegistryId);
            for (const server of matchingServers) {
                store.setEnabled(server.id, options.enabled);
                if (options.enabled) {
                    mcpRuntime.ensureLaunchResolution(server.id, 'mcp-registry-enabled');
                }
            }
            const servers = store.listServers();
            syncMcpConfig(syncOpenClawConfig, 'mcp-registry-toggled');
            return { success: true, servers };
        }
        catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to update MCP registry servers',
            };
        }
    });
    electron_1.ipcMain.handle(constants_1.McpIpcChannel.RetryLaunchResolution, async (_event, id) => {
        try {
            const mcpRuntime = getMcpRuntime();
            await mcpRuntime.getLaunchResolverManager().retry(id);
            const servers = mcpRuntime.getStore().listServers();
            syncMcpConfig(syncOpenClawConfig, 'mcp-launch-manual-retry');
            return { success: true, servers };
        }
        catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to retry MCP launch resolution',
            };
        }
    });
    electron_1.ipcMain.handle(constants_1.McpIpcChannel.ConnectQichacha, async (event) => {
        try {
            const ownerWindow = electron_1.BrowserWindow.fromWebContents(event.sender);
            const apiKey = await (0, qichachaMcpAuth_1.startQichachaMcpApiKeyLogin)(ownerWindow);
            const mcpRuntime = getMcpRuntime();
            const store = mcpRuntime.getStore();
            const existingServers = store.listServers();
            for (const qichachaServer of QICHACHA_MCP_SERVERS) {
                const data = buildQichachaServerData(qichachaServer, apiKey);
                const existing = existingServers.find(server => server.registryId === QICHACHA_REGISTRY_ID
                    && server.name === qichachaServer.name);
                if (existing) {
                    store.updateServer(existing.id, data);
                }
                else {
                    store.createServer(data);
                }
            }
            const servers = store.listServers();
            syncMcpConfig(syncOpenClawConfig, 'qichacha-mcp-connected');
            return { success: true, servers };
        }
        catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to connect Qichacha MCP',
            };
        }
    });
    electron_1.ipcMain.handle(constants_1.McpIpcChannel.FetchMarketplace, async () => {
        const url = electron_1.app.isPackaged
            ? 'https://api-overmind.youdao.com/openapi/get/luna/hardware/lobsterai/prod/mcp-marketplace'
            : 'https://api-overmind.youdao.com/openapi/get/luna/hardware/lobsterai/test/mcp-marketplace';
        try {
            const data = await fetchText(url);
            const json = JSON.parse(data);
            const value = json?.data?.value;
            if (!value) {
                return { success: false, error: 'Invalid response: missing data.value' };
            }
            const marketplace = typeof value === 'string' ? JSON.parse(value) : value;
            return { success: true, data: marketplace };
        }
        catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to fetch marketplace',
            };
        }
    });
}
//# sourceMappingURL=handlers.js.map