"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.findSystemNodePath = findSystemNodePath;
exports.resolveStdioCommand = resolveStdioCommand;
/**
 * resolveStdioCommand — resolves stdio MCP server commands for the current platform.
 *
 * On packaged builds, node/npx/npm commands are resolved in this order:
 * 1. Use system-installed Node.js if available (avoids Electron stdin quirks)
 * 2. Fall back to Electron runtime with ELECTRON_RUN_AS_NODE=1
 *
 * Extracted from McpServerManager for reuse by openclawConfigSync (native MCP migration).
 */
const electron_1 = require("electron");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const coworkUtil_1 = require("./coworkUtil");
const nodeRuntime_1 = require("./nodeRuntime");
/**
 * Get the packaged npm bin directory path.
 * This is a lightweight alternative to getEnhancedEnv() — it only computes
 * the LOBSTERAI_NPM_BIN_DIR path without resolving API config or proxy settings.
 */
function getPackagedNpmBinDir() {
    if (!electron_1.app.isPackaged)
        return undefined;
    const npmBinDir = path_1.default.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'npm', 'bin');
    return fs_1.default.existsSync(npmBinDir) ? npmBinDir : undefined;
}
const log = (level, msg) => {
    const formatted = `[MCP:Resolve][${level}] ${msg}`;
    if (level === 'ERROR') {
        console.error(formatted);
    }
    else if (level === 'WARN') {
        console.warn(formatted);
    }
    else {
        console.log(formatted);
    }
};
// ── Windows hidden-subprocess init script ────────────────────────
const WINDOWS_HIDE_INIT_SCRIPT_NAME = 'mcp-bridge-windows-hide-init.js';
const WINDOWS_HIDE_INIT_SCRIPT_CONTENT = [
    '// Auto-generated: hide subprocess console windows on Windows',
    'const cp = require("child_process");',
    'for (const fn of ["spawn", "execFile"]) {',
    '  const original = cp[fn];',
    '  cp[fn] = function(file, args, options) {',
    '    const addWindowsHide = (o) => ({ ...(o || {}), windowsHide: true });',
    '    if (typeof args === "function" || args === undefined) {',
    '      return original.call(this, file, addWindowsHide(undefined), args);',
    '    }',
    '    return original.call(this, file, addWindowsHide(args), options);',
    '  };',
    '}',
    '',
].join('\n');
function ensureWindowsHideInitScript() {
    if (process.platform !== 'win32')
        return null;
    try {
        const dir = path_1.default.join(electron_1.app.getPath('userData'), 'mcp-bridge', 'bin');
        fs_1.default.mkdirSync(dir, { recursive: true });
        const scriptPath = path_1.default.join(dir, WINDOWS_HIDE_INIT_SCRIPT_NAME);
        const existing = fs_1.default.existsSync(scriptPath) ? fs_1.default.readFileSync(scriptPath, 'utf8') : '';
        if (existing !== WINDOWS_HIDE_INIT_SCRIPT_CONTENT) {
            fs_1.default.writeFileSync(scriptPath, WINDOWS_HIDE_INIT_SCRIPT_CONTENT, 'utf8');
        }
        return scriptPath;
    }
    catch (e) {
        log('WARN', `Failed to create Windows hide init script: ${e instanceof Error ? e.message : String(e)}`);
        return null;
    }
}
function prependRequireArg(args, scriptPath) {
    for (let i = 0; i < args.length - 1; i++) {
        if (args[i] === '--require' && args[i + 1] === scriptPath)
            return args;
    }
    return ['--require', scriptPath, ...args];
}
// ── Command resolution ────────────────────────────────────────────
/**
 * Check whether a system-installed Node.js runtime is available on the PATH.
 * Caches the result for the lifetime of the process to avoid repeated lookups.
 */
let _systemNodePath;
function findSystemNodePath() {
    if (_systemNodePath !== undefined) {
        return _systemNodePath || null;
    }
    const resolved = (0, nodeRuntime_1.findSpawnableSystemNodePath)();
    if (resolved) {
        _systemNodePath = resolved;
        log('INFO', `System Node.js found: ${resolved}`);
        return resolved;
    }
    _systemNodePath = false;
    log('INFO', 'System Node.js not found on PATH');
    return null;
}
/**
 * Check if a command is a node/npx/npm variant.
 */
function isNodeCommand(normalized) {
    if (normalized === 'node' || normalized === 'node.exe'
        || normalized.endsWith('\\node.cmd') || normalized.endsWith('/node.cmd')) {
        return 'node';
    }
    if (normalized === 'npx' || normalized === 'npx.cmd'
        || normalized.endsWith('\\npx.cmd') || normalized.endsWith('/npx.cmd')) {
        return 'npx';
    }
    if (normalized === 'npm' || normalized === 'npm.cmd'
        || normalized.endsWith('\\npm.cmd') || normalized.endsWith('/npm.cmd')) {
        return 'npm';
    }
    return null;
}
/**
 * Resolve a stdio MCP server command/args/env for the current platform.
 *
 * On packaged builds, node/npx/npm commands are resolved in this order:
 * 1. Use system-installed Node.js if available (avoids Electron stdin quirks)
 * 2. Fall back to Electron runtime with ELECTRON_RUN_AS_NODE=1
 */
async function resolveStdioCommand(server) {
    const stdioCommand = server.command || '';
    let effectiveCommand = stdioCommand;
    const stdioArgs = server.args || [];
    let effectiveArgs = [...stdioArgs];
    let stdioEnv = server.env && Object.keys(server.env).length > 0
        ? { ...server.env }
        : undefined;
    let shouldInjectWindowsHide = false;
    const electronNodeRuntimePath = (0, coworkUtil_1.getElectronNodeRuntimePath)();
    // Resolve node/npx/npm commands on Windows (both dev and packaged mode).
    // The MCP SDK's StdioClientTransport only inherits a limited set of env vars
    // (PATH, APPDATA, TEMP, etc.) — our node shims in PATH need LOBSTERAI_ELECTRON_PATH
    // and LOBSTERAI_NPM_BIN_DIR which won't be inherited. Pre-resolving to absolute
    // paths avoids depending on shims entirely.
    if (process.platform === 'win32' && effectiveCommand) {
        const normalized = effectiveCommand.trim().toLowerCase();
        const nodeCommandType = isNodeCommand(normalized);
        if (nodeCommandType) {
            const systemNode = findSystemNodePath();
            if (systemNode) {
                if (nodeCommandType === 'node') {
                    effectiveCommand = systemNode;
                    log('INFO', `"${server.name}": using system Node.js "${systemNode}" (preferred over Electron runtime)`);
                }
                else {
                    let npmBinDir = getPackagedNpmBinDir();
                    // In dev mode, the packaged npmBinDir may not exist.
                    // Fall back to the npm bin dir relative to system Node.js.
                    if (!npmBinDir || !fs_1.default.existsSync(npmBinDir)) {
                        const systemNpmBin = path_1.default.join(path_1.default.dirname(systemNode), 'node_modules', 'npm', 'bin');
                        if (fs_1.default.existsSync(systemNpmBin)) {
                            npmBinDir = systemNpmBin;
                        }
                    }
                    const cliJs = nodeCommandType === 'npx'
                        ? (npmBinDir ? path_1.default.join(npmBinDir, 'npx-cli.js') : '')
                        : (npmBinDir ? path_1.default.join(npmBinDir, 'npm-cli.js') : '');
                    if (cliJs && fs_1.default.existsSync(cliJs)) {
                        effectiveCommand = systemNode;
                        effectiveArgs = [cliJs, ...stdioArgs];
                        log('INFO', `"${server.name}": using system Node.js "${systemNode}" + ${nodeCommandType}-cli.js (preferred over Electron runtime)`);
                    }
                    else {
                        // npx-cli.js not found; use the system npx/npm executable directly
                        // (cross-spawn handles .cmd files on Windows)
                        const systemBinCmd = path_1.default.join(path_1.default.dirname(systemNode), `${nodeCommandType}.cmd`);
                        if (fs_1.default.existsSync(systemBinCmd)) {
                            effectiveCommand = systemBinCmd;
                            effectiveArgs = [...stdioArgs];
                            log('INFO', `"${server.name}": using system "${systemBinCmd}" directly`);
                        }
                        else {
                            log('INFO', `"${server.name}": keeping raw "${stdioCommand}" (system fallback not found)`);
                        }
                    }
                }
            }
            else if (electron_1.app.isPackaged) {
                const npmBinDir = getPackagedNpmBinDir();
                const npxCliJs = npmBinDir ? path_1.default.join(npmBinDir, 'npx-cli.js') : '';
                const npmCliJs = npmBinDir ? path_1.default.join(npmBinDir, 'npm-cli.js') : '';
                const withElectronNodeEnv = (base) => ({
                    ...(base || {}),
                    ELECTRON_RUN_AS_NODE: '1',
                    LOBSTERAI_ELECTRON_PATH: electronNodeRuntimePath,
                });
                if (nodeCommandType === 'node') {
                    effectiveCommand = electronNodeRuntimePath;
                    stdioEnv = withElectronNodeEnv(stdioEnv);
                    shouldInjectWindowsHide = true;
                    log('WARN', `"${server.name}": no system Node.js found, falling back to Electron runtime (may cause stdin issues)`);
                }
                else if (nodeCommandType === 'npx' && npxCliJs && fs_1.default.existsSync(npxCliJs)) {
                    effectiveCommand = electronNodeRuntimePath;
                    effectiveArgs = [npxCliJs, ...stdioArgs];
                    stdioEnv = withElectronNodeEnv(stdioEnv);
                    shouldInjectWindowsHide = true;
                    log('WARN', `"${server.name}": no system Node.js found, falling back to Electron + npx-cli.js (may cause stdin issues)`);
                }
                else if (nodeCommandType === 'npm' && npmCliJs && fs_1.default.existsSync(npmCliJs)) {
                    effectiveCommand = electronNodeRuntimePath;
                    effectiveArgs = [npmCliJs, ...stdioArgs];
                    stdioEnv = withElectronNodeEnv(stdioEnv);
                    shouldInjectWindowsHide = true;
                    log('WARN', `"${server.name}": no system Node.js found, falling back to Electron + npm-cli.js (may cause stdin issues)`);
                }
            }
        }
    }
    // macOS packaged: rewrite absolute command pointing to app executable
    if (electron_1.app.isPackaged && process.platform === 'darwin' && stdioCommand && path_1.default.isAbsolute(stdioCommand)) {
        const commandCandidates = new Set([stdioCommand, path_1.default.resolve(stdioCommand)]);
        const appExecCandidates = new Set([
            process.execPath, path_1.default.resolve(process.execPath),
            electronNodeRuntimePath, path_1.default.resolve(electronNodeRuntimePath),
        ]);
        try {
            commandCandidates.add(fs_1.default.realpathSync.native(stdioCommand));
        }
        catch { /* ignore */ }
        try {
            appExecCandidates.add(fs_1.default.realpathSync.native(process.execPath));
        }
        catch { /* ignore */ }
        try {
            appExecCandidates.add(fs_1.default.realpathSync.native(electronNodeRuntimePath));
        }
        catch { /* ignore */ }
        if (Array.from(commandCandidates).some(c => appExecCandidates.has(c))) {
            effectiveCommand = electronNodeRuntimePath;
            stdioEnv = {
                ...(stdioEnv || {}),
                ELECTRON_RUN_AS_NODE: '1',
                LOBSTERAI_ELECTRON_PATH: electronNodeRuntimePath,
            };
            log('INFO', `"${server.name}": rewrote macOS command → Electron helper`);
        }
    }
    // Inject Windows hidden-subprocess preload
    if (process.platform === 'win32' && shouldInjectWindowsHide) {
        const initScript = ensureWindowsHideInitScript();
        if (initScript) {
            effectiveArgs = prependRequireArg(effectiveArgs, initScript);
        }
    }
    return { command: effectiveCommand, args: effectiveArgs, env: stdioEnv };
}
//# sourceMappingURL=resolveStdioCommand.js.map