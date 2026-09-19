"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.McpLaunchResolutionStatus = exports.McpLaunchResolverKind = void 0;
exports.createMcpLaunchSourceFingerprint = createMcpLaunchSourceFingerprint;
exports.normalizeMcpCommand = normalizeMcpCommand;
exports.isNpxMcpServer = isNpxMcpServer;
const crypto_1 = __importDefault(require("crypto"));
exports.McpLaunchResolverKind = {
    Npx: 'npx',
    Uvx: 'uvx',
    Python: 'python',
    Raw: 'raw',
};
exports.McpLaunchResolutionStatus = {
    Pending: 'pending',
    Installing: 'installing',
    Ready: 'ready',
    Failed: 'failed',
    Unsupported: 'unsupported',
};
function createMcpLaunchSourceFingerprint(server) {
    const payload = {
        transportType: server.transportType,
        command: server.command || '',
        args: server.args || [],
        env: server.env || {},
        registryId: server.registryId || '',
        platform: process.platform,
        arch: process.arch,
    };
    return crypto_1.default.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}
function normalizeMcpCommand(command) {
    return (command || '').trim().toLowerCase();
}
function isNpxMcpServer(server) {
    const command = normalizeMcpCommand(server.command);
    return (command === 'npx'
        || command === 'npx.cmd'
        || command.endsWith('\\npx.cmd')
        || command.endsWith('/npx.cmd'));
}
//# sourceMappingURL=mcpLaunchResolution.js.map