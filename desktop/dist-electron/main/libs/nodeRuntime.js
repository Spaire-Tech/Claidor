"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isSpawnableWindowsNode = isSpawnableWindowsNode;
exports.selectSpawnableNodeCandidate = selectSpawnableNodeCandidate;
exports.findSpawnableSystemNodePath = findSpawnableSystemNodePath;
exports.resolveNodeRuntimeForSpawn = resolveNodeRuntimeForSpawn;
exports.resolveBundledNodePackageCli = resolveBundledNodePackageCli;
exports.resolveNodePackageCliCommand = resolveNodePackageCliCommand;
const child_process_1 = require("child_process");
const electron_1 = require("electron");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const coworkUtil_1 = require("./coworkUtil");
function normalizeWindowsPathForCompare(value) {
    return path_1.default.win32.resolve(value).toLowerCase();
}
function isInsideWindowsDirectory(candidate, parent) {
    const resolvedCandidate = normalizeWindowsPathForCompare(candidate);
    const resolvedParent = normalizeWindowsPathForCompare(parent);
    return resolvedCandidate === resolvedParent
        || resolvedCandidate.startsWith(`${resolvedParent}${path_1.default.win32.sep}`);
}
function getUserDataNodeShimDir() {
    try {
        return path_1.default.join(electron_1.app.getPath('userData'), 'cowork', 'bin');
    }
    catch {
        return null;
    }
}
function defaultCommandLookup(command, env) {
    const checker = process.platform === 'win32' ? 'where' : 'which';
    try {
        const result = (0, child_process_1.spawnSync)(checker, [command], {
            encoding: 'utf-8',
            env,
            timeout: 5000,
            windowsHide: process.platform === 'win32',
        });
        if (result.status !== 0 || !result.stdout)
            return [];
        return result.stdout
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(Boolean);
    }
    catch {
        return [];
    }
}
function isSpawnableWindowsNode(candidate, userDataPath) {
    if (!candidate.trim().toLowerCase().endsWith('.exe'))
        return false;
    if (path_1.default.win32.basename(candidate).toLowerCase() !== 'node.exe')
        return false;
    const shimDir = userDataPath
        ? path_1.default.win32.join(userDataPath, 'cowork', 'bin')
        : getUserDataNodeShimDir();
    if (shimDir && isInsideWindowsDirectory(candidate, shimDir))
        return false;
    return true;
}
function selectSpawnableNodeCandidate(candidates, platform = process.platform, userDataPath) {
    for (const candidate of candidates) {
        const trimmed = candidate.trim();
        if (!trimmed)
            continue;
        if (platform === 'win32') {
            if (isSpawnableWindowsNode(trimmed, userDataPath))
                return trimmed;
            continue;
        }
        return trimmed;
    }
    return null;
}
function findSpawnableSystemNodePath(env = process.env, lookup = defaultCommandLookup) {
    return selectSpawnableNodeCandidate(lookup('node', env));
}
function resolveNodeRuntimeForSpawn(env = process.env, lookup) {
    const systemNode = findSpawnableSystemNodePath(env, lookup);
    if (systemNode) {
        return {
            command: systemNode,
            args: [],
            env: {},
        };
    }
    return {
        command: (0, coworkUtil_1.getElectronNodeRuntimePath)(),
        args: [],
        env: { ELECTRON_RUN_AS_NODE: '1' },
    };
}
function resolveBundledNodePackageCli(cliName) {
    const cliFile = `${cliName}-cli.js`;
    const candidates = electron_1.app.isPackaged
        ? [path_1.default.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'npm', 'bin', cliFile)]
        : [
            path_1.default.join(electron_1.app.getAppPath(), 'node_modules', 'npm', 'bin', cliFile),
            path_1.default.join(process.cwd(), 'node_modules', 'npm', 'bin', cliFile),
        ];
    return candidates.find(candidate => fs_1.default.existsSync(candidate)) || null;
}
function resolveNodePackageCliCommand(cliName, env = process.env) {
    const bundledCli = resolveBundledNodePackageCli(cliName);
    if (bundledCli) {
        return {
            command: (0, coworkUtil_1.getElectronNodeRuntimePath)(),
            baseArgs: [bundledCli],
            env: { ...env, ELECTRON_RUN_AS_NODE: '1' },
            shell: false,
        };
    }
    const isWin = process.platform === 'win32';
    return {
        command: isWin ? `${cliName}.cmd` : cliName,
        baseArgs: [],
        env: { ...env },
        shell: isWin,
    };
}
//# sourceMappingURL=nodeRuntime.js.map