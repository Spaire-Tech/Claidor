"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerCoworkSubagentHandlers = registerCoworkSubagentHandlers;
const electron_1 = require("electron");
const constants_1 = require("../../../shared/cowork/constants");
function registerCoworkSubagentHandlers(deps) {
    const { getOpenClawRuntimeAdapter, getCoworkEngineRouter } = deps;
    electron_1.ipcMain.handle(constants_1.CoworkIpcChannel.SubTaskHistory, async (_event, options) => {
        const adapter = getOpenClawRuntimeAdapter();
        if (!adapter) {
            return { success: false, error: 'Runtime adapter not available' };
        }
        try {
            const messages = await adapter.getSubTaskHistory(options.parentSessionId, options.agentId, options.sessionKey);
            return { success: true, messages };
        }
        catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to fetch subagent history',
            };
        }
    });
    electron_1.ipcMain.handle(constants_1.CoworkIpcChannel.SubagentList, async (_event, options) => {
        const adapter = getOpenClawRuntimeAdapter();
        if (!adapter)
            return { success: true, runs: [] };
        const runs = adapter.listSubagentRuns(options.parentSessionId);
        return { success: true, runs };
    });
    electron_1.ipcMain.handle(constants_1.CoworkIpcChannel.SubagentListByAgent, async (_event, options) => {
        const adapter = getOpenClawRuntimeAdapter();
        if (!adapter)
            return { success: true, runs: [], hasMore: false };
        const result = adapter.listSubagentRunsByAgent(options.agentId, options.limit ?? 20, options.offset ?? 0);
        return { success: true, ...result };
    });
    electron_1.ipcMain.handle(constants_1.CoworkIpcChannel.SubagentDelete, async (_event, options) => {
        const adapter = getOpenClawRuntimeAdapter();
        if (!adapter) {
            return { success: false, error: 'Runtime adapter not available' };
        }
        try {
            const deleted = await getCoworkEngineRouter().deleteSubagentSession(options.parentSessionId, options.runId);
            return { success: true, deleted };
        }
        catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to delete subagent session',
            };
        }
    });
}
//# sourceMappingURL=handlers.js.map