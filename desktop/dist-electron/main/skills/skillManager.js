"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.__skillManagerTestUtils = exports.SkillManager = void 0;
const child_process_1 = require("child_process");
const crypto_1 = __importDefault(require("crypto"));
const electron_1 = require("electron");
const extract_zip_1 = __importDefault(require("extract-zip"));
const fs_1 = __importDefault(require("fs"));
const js_yaml_1 = __importDefault(require("js-yaml"));
const path_1 = __importDefault(require("path"));
const constants_1 = require("../../shared/computerUse/constants");
const computerUseKit_1 = require("../computerUse/computerUseKit");
const fsCompat_1 = require("../fsCompat");
const i18n_1 = require("../i18n");
const coworkUtil_1 = require("../libs/coworkUtil");
const nodeRuntime_1 = require("../libs/nodeRuntime");
const pythonRuntime_1 = require("../libs/pythonRuntime");
const skillSecurityScanner_1 = require("../libs/skillSecurity/skillSecurityScanner");
/**
 * Resolve the user's login shell PATH on macOS/Linux.
 * Packaged Electron apps on macOS don't inherit the user's shell profile,
 * so node/npm won't be in PATH unless we resolve it explicitly.
 */
function resolveUserShellPath() {
    if (process.platform === 'win32')
        return null;
    try {
        const shell = process.env.SHELL || '/bin/bash';
        // Use non-interactive login shell to avoid side effects in interactive startup scripts.
        const result = (0, child_process_1.execSync)(`${shell} -lc 'echo __PATH__=$PATH'`, {
            encoding: 'utf-8',
            timeout: 5000,
            env: { ...process.env },
        });
        const match = result.match(/__PATH__=(.+)/);
        return match ? match[1].trim() : null;
    }
    catch (error) {
        console.warn('[skills] Failed to resolve user shell PATH:', error);
        return null;
    }
}
/**
 * Check if a command exists in the given environment.
 */
function hasCommand(command, env) {
    const isWin = process.platform === 'win32';
    const checker = isWin ? 'where' : 'which';
    // On Windows, use shell: true so cmd.exe resolves PATH correctly
    // (avoids issues with duplicated PATH/Path keys in env)
    const result = (0, child_process_1.spawnSync)(checker, [command], {
        stdio: 'pipe',
        env,
        shell: isWin,
        timeout: 5000,
    });
    if (result.status !== 0) {
        console.log(`[skills] hasCommand('${command}'): not found (status=${result.status}, error=${result.error?.message || 'none'})`);
    }
    return result.status === 0;
}
/**
 * Normalize the PATH key in an env object on Windows.
 * Windows env vars are case-insensitive, but JS objects are case-sensitive.
 * After spreading process.env, the key might be "Path" or "PATH".
 * We normalize to "PATH" to avoid issues with duplicate keys.
 */
function normalizePathKey(env) {
    if (process.platform !== 'win32')
        return;
    const pathKeys = Object.keys(env).filter(k => k.toLowerCase() === 'path');
    if (pathKeys.length <= 1)
        return;
    // Merge all PATH-like values (separated by ;), then remove duplicates
    const seen = new Set();
    const merged = [];
    for (const key of pathKeys) {
        const value = env[key];
        if (!value)
            continue;
        for (const entry of value.split(';')) {
            const trimmed = entry.trim();
            if (!trimmed)
                continue;
            const normalized = trimmed.toLowerCase().replace(/[\\/]+$/, '');
            if (seen.has(normalized))
                continue;
            seen.add(normalized);
            merged.push(trimmed);
        }
        if (key !== 'PATH') {
            delete env[key];
        }
    }
    env.PATH = merged.join(';');
}
const EMAIL_ADDRESS_LOG_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
function redactEmailValueForLog(value) {
    return value.replace(EMAIL_ADDRESS_LOG_PATTERN, email => {
        const [local, domain] = email.split('@');
        if (!domain)
            return '[redacted-email]';
        const prefix = local.slice(0, Math.min(2, local.length));
        return `${prefix}${local.length > 2 ? '***' : '*'}@${domain}`;
    });
}
function buildSafeEmailConnectivityConfigForLog(config) {
    const safeConfig = { ...config };
    const secretKeys = ['IMAP_PASS', 'SMTP_PASS'];
    const emailKeys = ['IMAP_USER', 'SMTP_USER', 'SMTP_FROM'];
    secretKeys.forEach(key => {
        if (safeConfig[key])
            safeConfig[key] = '***';
    });
    emailKeys.forEach(key => {
        if (safeConfig[key])
            safeConfig[key] = redactEmailValueForLog(safeConfig[key]);
    });
    return safeConfig;
}
/**
 * Resolve the latest Windows system PATH from the registry.
 * When an Electron app is launched from Start Menu or Explorer,
 * process.env.PATH may be stale (missing tools installed after Explorer started).
 */
function resolveWindowsRegistryPath() {
    if (process.platform !== 'win32')
        return null;
    try {
        const machinePath = (0, child_process_1.execSync)('reg query "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment" /v Path', { encoding: 'utf-8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] });
        const userPath = (0, child_process_1.execSync)('reg query "HKCU\\Environment" /v Path', { encoding: 'utf-8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] });
        const extract = (output) => {
            const match = output.match(/Path\s+REG_(?:EXPAND_)?SZ\s+(.+)/i);
            return match ? match[1].trim() : '';
        };
        const combined = [extract(machinePath), extract(userPath)].filter(Boolean).join(';');
        return combined || null;
    }
    catch {
        return null;
    }
}
function isWindowsDeletePermissionError(error) {
    if (process.platform !== 'win32')
        return false;
    if (!(error instanceof Error))
        return false;
    const code = error.code;
    return code === 'EPERM' || code === 'EACCES' || code === 'EBUSY';
}
function tryWindowsDeleteFallbackAsync(targetDir) {
    if (process.platform !== 'win32')
        return Promise.resolve({ success: false, detail: 'not-windows' });
    return new Promise(resolve => setTimeout(resolve, 50)).then(() => {
        const escapedPath = targetDir.replace(/"/g, '""');
        const command = `icacls "${escapedPath}" /reset /t /c >nul 2>&1 & attrib -r -s -h "${escapedPath}" /s /d >nul 2>&1 & rmdir /s /q "${escapedPath}"`;
        return new Promise((resolve) => {
            let settled = false;
            const settle = (result) => {
                if (settled)
                    return;
                settled = true;
                resolve(result);
            };
            const child = (0, child_process_1.spawn)('cmd.exe', ['/d', '/s', '/c', command], {
                stdio: 'pipe',
                windowsHide: true,
            });
            let stderr = '';
            let stdout = '';
            child.stderr?.on('data', (data) => { stderr += data.toString('utf-8'); });
            child.stdout?.on('data', (data) => { stdout += data.toString('utf-8'); });
            const timer = setTimeout(() => {
                child.kill();
                settle({ success: false, detail: 'timeout' });
            }, 10000);
            child.on('close', () => {
                clearTimeout(timer);
                if (!fs_1.default.existsSync(targetDir)) {
                    settle({ success: true });
                }
                else {
                    const detail = stderr.trim() || stdout.trim() || 'unknown';
                    settle({ success: false, detail });
                }
            });
            child.on('error', (err) => {
                clearTimeout(timer);
                settle({ success: false, detail: err.message });
            });
        });
    });
}
function normalizeWindowsSkillDirectoryAttrs(targetDir) {
    if (process.platform !== 'win32')
        return { success: true };
    const escapedPath = targetDir.replace(/"/g, '""');
    const result = (0, child_process_1.spawnSync)('cmd.exe', ['/d', '/s', '/c', `attrib -r -s -h "${escapedPath}" /s /d`], {
        stdio: 'pipe',
        windowsHide: true,
        timeout: 10000,
    });
    if (result.status === 0) {
        return { success: true };
    }
    const stderr = result.stderr?.toString('utf-8').trim();
    const stdout = result.stdout?.toString('utf-8').trim();
    const detail = stderr || stdout || result.error?.message || `status=${result.status ?? 'null'}`;
    return { success: false, detail };
}
/**
 * Build an environment for spawning skill scripts.
 * Merges the user's shell PATH with the current process environment.
 */
function buildSkillEnv() {
    const env = { ...process.env };
    // Normalize PATH key casing on Windows to avoid duplicate PATH/Path issues
    normalizePathKey(env);
    // Ensure HOME is available for tools (e.g. clawhub CLI) that persist state
    // under the user's home directory. Without this, some runtimes may resolve
    // to root ("/.clawhub") in packaged apps.
    if (!env.HOME) {
        env.HOME = electron_1.app.getPath('home');
        console.debug('[skills] HOME was unset; using Electron user home directory');
    }
    if (process.platform === 'win32' && !env.USERPROFILE) {
        env.USERPROFILE = env.HOME;
        console.debug('[skills] USERPROFILE was unset; aligned with HOME for skill subprocesses');
    }
    if (electron_1.app.isPackaged) {
        if (process.platform === 'win32') {
            // On Windows, merge the latest PATH from the registry to pick up
            // tools installed after the Electron app (or Explorer) was started.
            const registryPath = resolveWindowsRegistryPath();
            if (registryPath) {
                const currentPath = env.PATH || '';
                const seen = new Set(currentPath.toLowerCase().split(';').map(s => s.trim().replace(/[\\/]+$/, '')).filter(Boolean));
                const extra = [];
                for (const entry of registryPath.split(';')) {
                    const trimmed = entry.trim();
                    if (!trimmed)
                        continue;
                    const key = trimmed.toLowerCase().replace(/[\\/]+$/, '');
                    if (!seen.has(key)) {
                        seen.add(key);
                        extra.push(trimmed);
                    }
                }
                if (extra.length > 0) {
                    env.PATH = currentPath ? `${currentPath};${extra.join(';')}` : extra.join(';');
                    console.log('[skills] Merged registry PATH entries for skill scripts');
                }
            }
            // Append common Windows Node.js installation paths as fallback
            const commonWinPaths = [
                'C:\\Program Files\\nodejs',
                'C:\\Program Files (x86)\\nodejs',
                `${env.APPDATA || ''}\\npm`,
                `${env.LOCALAPPDATA || ''}\\Programs\\nodejs`,
            ].filter(Boolean);
            const pathSet = new Set((env.PATH || '').toLowerCase().split(';').map(s => s.trim().replace(/[\\/]+$/, '')));
            const missingPaths = commonWinPaths.filter(p => !pathSet.has(p.toLowerCase().replace(/[\\/]+$/, '')));
            if (missingPaths.length > 0) {
                env.PATH = env.PATH ? `${env.PATH};${missingPaths.join(';')}` : missingPaths.join(';');
            }
        }
        else {
            // Resolve user's shell PATH to find npm/node (macOS/Linux)
            const userPath = resolveUserShellPath();
            if (userPath) {
                env.PATH = userPath;
                console.log('[skills] Resolved user shell PATH for skill scripts');
            }
            else {
                // Fallback: append common node installation paths
                const commonPaths = [
                    '/usr/local/bin',
                    '/opt/homebrew/bin',
                    `${env.HOME}/.nvm/current/bin`,
                    `${env.HOME}/.volta/bin`,
                    `${env.HOME}/.fnm/current/bin`,
                ];
                env.PATH = [env.PATH, ...commonPaths].filter(Boolean).join(':');
                console.log('[skills] Using fallback PATH for skill scripts');
            }
        }
    }
    // Expose Electron executable so skill scripts can run JS with ELECTRON_RUN_AS_NODE
    // even when system Node.js is not installed.
    env.LOBSTERAI_ELECTRON_PATH = (0, coworkUtil_1.getElectronNodeRuntimePath)();
    (0, pythonRuntime_1.appendPythonRuntimeToEnv)(env);
    // Re-normalize after appendPythonRuntimeToEnv may have added a PATH key
    normalizePathKey(env);
    return env;
}
const SKILLS_DIR_NAME = 'SKILLs';
const SKILL_FILE_NAME = 'SKILL.md';
const SKILLS_CONFIG_FILE = 'skills.config.json';
const SKILL_STATE_KEY = 'skills_state';
const WATCH_DEBOUNCE_MS = 250;
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
const parseFrontmatter = (raw) => {
    const normalized = raw.replace(/^\uFEFF/, '');
    const match = normalized.match(FRONTMATTER_RE);
    if (!match) {
        return { frontmatter: {}, content: normalized };
    }
    let frontmatter = {};
    try {
        const parsed = js_yaml_1.default.load(match[1]);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            frontmatter = parsed;
        }
    }
    catch (e) {
        console.warn('[skills] Failed to parse YAML frontmatter:', e);
    }
    const content = normalized.slice(match[0].length);
    return { frontmatter, content };
};
const isTruthy = (value) => {
    if (value === true)
        return true;
    if (!value)
        return false;
    if (typeof value !== 'string')
        return false;
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === 'yes' || normalized === '1';
};
const extractDescription = (content) => {
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed)
            continue;
        return trimmed.replace(/^#+\s*/, '');
    }
    return '';
};
const normalizeFolderName = (name) => {
    const normalized = name.replace(/[^a-zA-Z0-9-_]+/g, '-').replace(/^-+|-+$/g, '');
    return normalized || 'skill';
};
const isZipFile = (filePath) => path_1.default.extname(filePath).toLowerCase() === '.zip';
/**
 * Compare two semver-like version strings (e.g. "1.0.0" vs "1.0.1").
 * Returns 1 if a > b, -1 if a < b, 0 if equal.
 * Non-numeric segments are treated as 0.
 */
const compareVersions = (a, b) => {
    const pa = a.split('.').map(s => parseInt(s, 10) || 0);
    const pb = b.split('.').map(s => parseInt(s, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const na = pa[i] || 0;
        const nb = pb[i] || 0;
        if (na > nb)
            return 1;
        if (na < nb)
            return -1;
    }
    return 0;
};
const resolveWithin = (root, target) => {
    const resolvedRoot = path_1.default.resolve(root);
    const resolvedTarget = path_1.default.resolve(root, target);
    if (resolvedTarget === resolvedRoot)
        return resolvedTarget;
    if (!resolvedTarget.startsWith(resolvedRoot + path_1.default.sep)) {
        throw new Error('Invalid target path');
    }
    return resolvedTarget;
};
const appendEnvPath = (current, entries) => {
    const delimiter = process.platform === 'win32' ? ';' : ':';
    const existing = (current || '').split(delimiter).filter(Boolean);
    const merged = [...existing];
    entries.forEach(entry => {
        if (!entry || merged.includes(entry))
            return;
        merged.push(entry);
    });
    return merged.join(delimiter);
};
const listWindowsCommandPaths = (command) => {
    if (process.platform !== 'win32')
        return [];
    try {
        const result = (0, child_process_1.spawnSync)('cmd.exe', ['/d', '/s', '/c', command], {
            encoding: 'utf8',
            windowsHide: true,
        });
        if (result.status !== 0)
            return [];
        return result.stdout
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(Boolean);
    }
    catch {
        return [];
    }
};
const resolveWindowsGitExecutable = () => {
    if (process.platform !== 'win32')
        return null;
    const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
    const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    const localAppData = process.env.LOCALAPPDATA || '';
    const userProfile = process.env.USERPROFILE || '';
    const installedCandidates = [
        path_1.default.join(programFiles, 'Git', 'cmd', 'git.exe'),
        path_1.default.join(programFiles, 'Git', 'bin', 'git.exe'),
        path_1.default.join(programFilesX86, 'Git', 'cmd', 'git.exe'),
        path_1.default.join(programFilesX86, 'Git', 'bin', 'git.exe'),
        path_1.default.join(localAppData, 'Programs', 'Git', 'cmd', 'git.exe'),
        path_1.default.join(localAppData, 'Programs', 'Git', 'bin', 'git.exe'),
        path_1.default.join(userProfile, 'scoop', 'apps', 'git', 'current', 'cmd', 'git.exe'),
        path_1.default.join(userProfile, 'scoop', 'apps', 'git', 'current', 'bin', 'git.exe'),
        'C:\\Git\\cmd\\git.exe',
        'C:\\Git\\bin\\git.exe',
    ];
    for (const candidate of installedCandidates) {
        if (candidate && fs_1.default.existsSync(candidate)) {
            return candidate;
        }
    }
    const whereCandidates = listWindowsCommandPaths('where git');
    for (const candidate of whereCandidates) {
        const normalized = candidate.trim();
        if (!normalized)
            continue;
        if (normalized.toLowerCase().endsWith('git.exe') && fs_1.default.existsSync(normalized)) {
            return normalized;
        }
    }
    const bundledRoots = electron_1.app.isPackaged
        ? [path_1.default.join(process.resourcesPath, 'mingit')]
        : [
            path_1.default.join(__dirname, '..', '..', 'resources', 'mingit'),
            path_1.default.join(process.cwd(), 'resources', 'mingit'),
        ];
    for (const root of bundledRoots) {
        const bundledCandidates = [
            path_1.default.join(root, 'cmd', 'git.exe'),
            path_1.default.join(root, 'bin', 'git.exe'),
            path_1.default.join(root, 'mingw64', 'bin', 'git.exe'),
            path_1.default.join(root, 'usr', 'bin', 'git.exe'),
        ];
        for (const candidate of bundledCandidates) {
            if (fs_1.default.existsSync(candidate)) {
                return candidate;
            }
        }
    }
    return null;
};
const resolveGitCommand = () => {
    if (process.platform !== 'win32') {
        return { command: 'git' };
    }
    const gitExe = resolveWindowsGitExecutable();
    if (!gitExe) {
        return { command: 'git' };
    }
    const env = { ...process.env };
    const gitDir = path_1.default.dirname(gitExe);
    const gitRoot = path_1.default.dirname(gitDir);
    const candidateDirs = [
        gitDir,
        path_1.default.join(gitRoot, 'cmd'),
        path_1.default.join(gitRoot, 'bin'),
        path_1.default.join(gitRoot, 'mingw64', 'bin'),
        path_1.default.join(gitRoot, 'usr', 'bin'),
    ].filter(dir => fs_1.default.existsSync(dir));
    env.PATH = appendEnvPath(env.PATH, candidateDirs);
    return { command: gitExe, env };
};
/**
 * On Windows, ensure a Node.js --require init script that monkey-patches
 * child_process so all descendant processes inherit windowsHide: true.
 * Returns the script path, or null on non-Windows / failure.
 */
const WINDOWS_HIDE_SCRIPT = [
    "'use strict';",
    'if (process.platform === "win32") {',
    '  const cp = require("child_process");',
    '  const hide = (o) => {',
    '    if (o == null) return { windowsHide: true };',
    '    if (typeof o !== "object") return o;',
    '    if (Object.prototype.hasOwnProperty.call(o, "windowsHide")) return o;',
    '    return { ...o, windowsHide: true };',
    '  };',
    '  for (const fn of ["spawn", "spawnSync", "exec", "execFile", "fork"]) {',
    '    const orig = cp[fn];',
    '    if (typeof orig !== "function") continue;',
    '    cp[fn] = function (...a) {',
    '      const optsIdx = fn === "exec" ? 1 : fn === "fork" || fn === "spawn" || fn === "spawnSync" || fn === "execFile" ? 2 : 1;',
    '      if (a.length > optsIdx && typeof a[optsIdx] === "object" && a[optsIdx] !== null) {',
    '        a[optsIdx] = hide(a[optsIdx]);',
    '      } else if (a.length === optsIdx) {',
    '        a.push(hide(undefined));',
    '      }',
    '      return orig.apply(this, a);',
    '    };',
    '  }',
    '}',
].join('\n');
let _windowsHideScriptPath;
const ensureWindowsHideScript = () => {
    if (process.platform !== 'win32')
        return null;
    if (_windowsHideScriptPath !== undefined)
        return _windowsHideScriptPath;
    try {
        const dir = path_1.default.join(electron_1.app.getPath('userData'), 'bin');
        fs_1.default.mkdirSync(dir, { recursive: true });
        const scriptPath = path_1.default.join(dir, 'skill_windows_hide.cjs');
        const existing = fs_1.default.existsSync(scriptPath) ? fs_1.default.readFileSync(scriptPath, 'utf8') : '';
        if (existing !== WINDOWS_HIDE_SCRIPT) {
            fs_1.default.writeFileSync(scriptPath, WINDOWS_HIDE_SCRIPT, 'utf8');
        }
        _windowsHideScriptPath = scriptPath;
        return scriptPath;
    }
    catch {
        _windowsHideScriptPath = null;
        return null;
    }
};
const runCommand = (command, args, options) => new Promise((resolve, reject) => {
    const child = (0, child_process_1.spawn)(command, args, {
        cwd: options?.cwd,
        env: options?.env,
        windowsHide: true,
        stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', chunk => {
        stderr += chunk.toString();
    });
    child.on('error', error => reject(error));
    child.on('close', code => {
        if (code === 0) {
            resolve();
            return;
        }
        reject(new Error(stderr.trim() || `Command failed with exit code ${code}`));
    });
});
function getSkillScriptRuntimeCandidates(env) {
    const runtime = (0, nodeRuntime_1.resolveNodeRuntimeForSpawn)(env);
    return [{
            command: runtime.command,
            args: runtime.args,
            extraEnv: Object.keys(runtime.env).length > 0 ? runtime.env : undefined,
        }];
}
const runScriptWithTimeout = (options) => new Promise((resolve) => {
    const startedAt = Date.now();
    const child = (0, child_process_1.spawn)(options.command, options.args, {
        cwd: options.cwd,
        env: options.env,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    let settled = false;
    let timedOut = false;
    let stdout = '';
    let stderr = '';
    let forceKillTimer = null;
    const settle = (result) => {
        if (settled)
            return;
        settled = true;
        resolve(result);
    };
    const timeoutTimer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        forceKillTimer = setTimeout(() => {
            child.kill('SIGKILL');
        }, 2000);
    }, options.timeoutMs);
    child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
    });
    child.on('error', (error) => {
        clearTimeout(timeoutTimer);
        if (forceKillTimer)
            clearTimeout(forceKillTimer);
        settle({
            success: false,
            exitCode: null,
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            durationMs: Date.now() - startedAt,
            timedOut,
            error: error.message,
            spawnErrorCode: error.code,
        });
    });
    child.on('close', (exitCode) => {
        clearTimeout(timeoutTimer);
        if (forceKillTimer)
            clearTimeout(forceKillTimer);
        settle({
            success: !timedOut && exitCode === 0,
            exitCode,
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            durationMs: Date.now() - startedAt,
            timedOut,
            error: timedOut ? `Command timed out after ${options.timeoutMs}ms` : undefined,
        });
    });
});
const cleanupPathSafely = (targetPath) => {
    if (!targetPath)
        return;
    try {
        fs_1.default.rmSync(targetPath, {
            recursive: true,
            force: true,
            maxRetries: process.platform === 'win32' ? 5 : 0,
            retryDelay: process.platform === 'win32' ? 200 : 0,
        });
    }
    catch (error) {
        console.warn('[skills] Failed to cleanup temporary directory:', targetPath, error);
    }
};
const listSkillDirs = (root) => {
    if (!fs_1.default.existsSync(root))
        return [];
    const skillFile = path_1.default.join(root, SKILL_FILE_NAME);
    if (fs_1.default.existsSync(skillFile)) {
        return [root];
    }
    const entries = fs_1.default.readdirSync(root);
    return entries
        .map(entry => path_1.default.join(root, entry))
        .filter((entryPath) => {
        try {
            const stat = fs_1.default.lstatSync(entryPath);
            if (!stat.isDirectory() && !stat.isSymbolicLink()) {
                return false;
            }
            return fs_1.default.existsSync(path_1.default.join(entryPath, SKILL_FILE_NAME));
        }
        catch {
            return false;
        }
    });
};
const collectSkillDirsFromSource = (source) => {
    const resolved = path_1.default.resolve(source);
    if (fs_1.default.existsSync(path_1.default.join(resolved, SKILL_FILE_NAME))) {
        return [resolved];
    }
    const nestedRoot = path_1.default.join(resolved, SKILLS_DIR_NAME);
    if (fs_1.default.existsSync(nestedRoot) && fs_1.default.statSync(nestedRoot).isDirectory()) {
        const nestedSkills = listSkillDirs(nestedRoot);
        if (nestedSkills.length > 0) {
            return nestedSkills;
        }
    }
    const directSkills = listSkillDirs(resolved);
    if (directSkills.length > 0) {
        return directSkills;
    }
    return collectSkillDirsRecursively(resolved);
};
const collectSkillDirsRecursively = (root) => {
    const resolvedRoot = path_1.default.resolve(root);
    if (!fs_1.default.existsSync(resolvedRoot))
        return [];
    const matchedDirs = [];
    const queue = [resolvedRoot];
    const seen = new Set();
    while (queue.length > 0) {
        const current = queue.shift();
        if (!current)
            continue;
        const normalized = path_1.default.resolve(current);
        if (seen.has(normalized))
            continue;
        seen.add(normalized);
        let stat;
        try {
            stat = fs_1.default.lstatSync(normalized);
        }
        catch {
            continue;
        }
        if (!stat.isDirectory() || stat.isSymbolicLink())
            continue;
        if (fs_1.default.existsSync(path_1.default.join(normalized, SKILL_FILE_NAME))) {
            matchedDirs.push(normalized);
            continue;
        }
        let entries = [];
        try {
            entries = fs_1.default.readdirSync(normalized);
        }
        catch {
            continue;
        }
        for (const entry of entries) {
            if (!entry || entry === '.git' || entry === 'node_modules')
                continue;
            queue.push(path_1.default.join(normalized, entry));
        }
    }
    return matchedDirs;
};
const deriveRepoName = (source) => {
    const cleaned = source.replace(/[#?].*$/, '');
    const base = cleaned.split('/').filter(Boolean).pop() || 'skill';
    return normalizeFolderName(base.replace(/\.git$/, ''));
};
const extractErrorMessage = (error) => {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
};
const parseGithubRepoSource = (repoUrl) => {
    const trimmed = repoUrl.trim();
    const sshMatch = trimmed.match(/^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?\/?$/i);
    if (sshMatch) {
        return {
            owner: sshMatch[1],
            repo: sshMatch[2],
        };
    }
    try {
        const parsedUrl = new URL(trimmed);
        if (!['github.com', 'www.github.com'].includes(parsedUrl.hostname.toLowerCase())) {
            return null;
        }
        const segments = parsedUrl.pathname
            .replace(/\.git$/i, '')
            .split('/')
            .filter(Boolean);
        if (segments.length < 2) {
            return null;
        }
        return {
            owner: segments[0],
            repo: segments[1],
        };
    }
    catch {
        return null;
    }
};
const downloadGithubArchive = async (source, tempRoot, ref) => {
    const encodedRef = ref ? encodeURIComponent(ref) : '';
    const archiveUrlCandidates = [];
    if (encodedRef) {
        archiveUrlCandidates.push({
            url: `https://github.com/${source.owner}/${source.repo}/archive/refs/heads/${encodedRef}.zip`,
            headers: { 'User-Agent': 'Caisra Skill Downloader' },
        }, {
            url: `https://github.com/${source.owner}/${source.repo}/archive/refs/tags/${encodedRef}.zip`,
            headers: { 'User-Agent': 'Caisra Skill Downloader' },
        }, {
            url: `https://github.com/${source.owner}/${source.repo}/archive/${encodedRef}.zip`,
            headers: { 'User-Agent': 'Caisra Skill Downloader' },
        });
    }
    archiveUrlCandidates.push({
        url: `https://api.github.com/repos/${source.owner}/${source.repo}/zipball${encodedRef ? `/${encodedRef}` : ''}`,
        headers: {
            Accept: 'application/vnd.github+json',
            'User-Agent': 'Caisra Skill Downloader',
            'X-GitHub-Api-Version': '2022-11-28',
        },
    });
    let buffer = null;
    let lastError = null;
    for (const candidate of archiveUrlCandidates) {
        try {
            const response = await electron_1.session.defaultSession.fetch(candidate.url, {
                method: 'GET',
                headers: candidate.headers,
            });
            if (!response.ok) {
                const detail = (await response.text()).trim();
                lastError = `Archive download failed (${response.status} ${response.statusText})${detail ? `: ${detail}` : ''}`;
                continue;
            }
            buffer = Buffer.from(await response.arrayBuffer());
            break;
        }
        catch (error) {
            lastError = extractErrorMessage(error);
        }
    }
    if (!buffer) {
        throw new Error(lastError || 'Archive download failed');
    }
    const zipPath = path_1.default.join(tempRoot, 'github-archive.zip');
    const extractRoot = path_1.default.join(tempRoot, 'github-archive');
    fs_1.default.writeFileSync(zipPath, buffer);
    fs_1.default.mkdirSync(extractRoot, { recursive: true });
    await (0, extract_zip_1.default)(zipPath, { dir: extractRoot });
    const extractedDirs = fs_1.default.readdirSync(extractRoot)
        .map(entry => path_1.default.join(extractRoot, entry))
        .filter(entryPath => {
        try {
            return fs_1.default.statSync(entryPath).isDirectory();
        }
        catch {
            return false;
        }
    });
    if (extractedDirs.length === 1) {
        return extractedDirs[0];
    }
    return extractRoot;
};
/**
 * Check if a source string looks like an npm package spec.
 * Supports: package-name, @scope/package, package@version, @scope/package@version
 */
const isNpmPackageSpec = (source) => {
    // Must not be a local path, URL, or GitHub shorthand (owner/repo)
    if (source.startsWith('.') || source.startsWith('/') || source.startsWith('~'))
        return false;
    try {
        new URL(source);
        return false;
    }
    catch { /* not a URL, good */ }
    // Scoped package: @scope/name or @scope/name@version
    if (/^@[\w-]+\/[\w.-]+(@[\w.^~>=<*-]+)?$/.test(source))
        return true;
    // Unscoped package: name or name@version (must not contain '/' which would be owner/repo)
    if (/^[\w.-]+(@[\w.^~>=<*-]+)?$/.test(source) && !source.includes('/'))
        return true;
    return false;
};
/**
 * Parse a clawhub.ai URL and extract the skill name.
 * Supports: /skills/{owner}/{name} and /skills/{name}
 */
const parseClawhubUrl = (source) => {
    try {
        const url = new URL(source);
        if (url.hostname !== 'clawhub.ai' && url.hostname !== 'www.clawhub.ai')
            return null;
        const segments = url.pathname.split('/').filter(Boolean);
        // Format: /skills/{owner}/{name}
        if (segments.length >= 3 && segments[0] === 'skills') {
            return { name: segments[2] };
        }
        // Format: /skills/{name}
        if (segments.length >= 2 && segments[0] === 'skills') {
            return { name: segments[1] };
        }
        // Format: /{owner}/{name} (no /skills/ prefix)
        if (segments.length >= 2) {
            return { name: segments[1] };
        }
        return null;
    }
    catch {
        return null;
    }
};
/**
 * Resolve the bundled npx-cli.js path for running npx commands
 * without requiring a system Node.js installation.
 */
const resolveNpxCliJs = () => {
    const candidates = electron_1.app.isPackaged
        ? [path_1.default.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'npm', 'bin', 'npx-cli.js')]
        : [
            path_1.default.join(electron_1.app.getAppPath(), 'node_modules', 'npm', 'bin', 'npx-cli.js'),
            path_1.default.join(process.cwd(), 'node_modules', 'npm', 'bin', 'npx-cli.js'),
        ];
    return candidates.find(c => fs_1.default.existsSync(c)) || null;
};
/**
 * Download a skill from ClawHub using `npx clawhub@latest install {name}`.
 * Prefers the bundled npx (via Electron runtime) so it works in packaged
 * apps where system Node.js is not installed.
 */
const downloadClawhubSkill = async (skillName, targetDir, env) => {
    fs_1.default.mkdirSync(targetDir, { recursive: true });
    const npxCliJs = resolveNpxCliJs();
    const electronPath = (0, coworkUtil_1.getElectronNodeRuntimePath)();
    let command;
    let args;
    if (npxCliJs) {
        console.log(`[downloadClawhubSkill] cwd="${targetDir}" skill="${skillName}" `
            + `electron="${electronPath}" npxCliJs="${npxCliJs}"`);
        command = electronPath;
        args = [npxCliJs, 'clawhub@latest', 'install', skillName, '--dir', targetDir, '--no-input', '--force'];
        // Inject --require script to hide CMD windows from all descendant processes
        const hideScript = ensureWindowsHideScript();
        if (hideScript) {
            args = ['--require', hideScript, ...args];
        }
    }
    else {
        const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
        console.log(`[downloadClawhubSkill] cwd="${targetDir}" skill="${skillName}" `
            + `bundled npx not found, falling back to system "${npxCommand}"`);
        if (!hasCommand(npxCommand, env)) {
            throw new Error('npx is not available. Please install Node.js from https://nodejs.org/');
        }
        command = npxCommand;
        args = ['clawhub@latest', 'install', skillName, '--dir', targetDir, '--no-input', '--force'];
    }
    try {
        await runCommand(command, args, {
            cwd: targetDir,
            env: { ...env, ELECTRON_RUN_AS_NODE: '1' },
        });
    }
    catch (error) {
        const raw = error instanceof Error ? error.message : String(error);
        // Strip ANSI escape codes and decode URL-encoded characters
        const cleaned = raw
            .replace(/\x1b\[[0-9;]*m/g, '')
            .replace(/%[0-9A-Fa-f]{2}/g, (match) => {
            try {
                return decodeURIComponent(match);
            }
            catch {
                return match;
            }
        })
            .trim();
        if (/skill not found/i.test(cleaned)) {
            throw new Error((0, i18n_1.t)('skillErrClawhubNotFound'));
        }
        throw new Error((0, i18n_1.t)('skillErrClawhubDownloadFailed') + '\n' + cleaned);
    }
};
/**
 * Resolve the bundled npm-cli.js path for running npm commands.
 */
const resolveNpmCliJs = () => {
    const candidates = electron_1.app.isPackaged
        ? [path_1.default.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'npm', 'bin', 'npm-cli.js')]
        : [
            path_1.default.join(electron_1.app.getAppPath(), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
            path_1.default.join(process.cwd(), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
        ];
    return candidates.find(c => fs_1.default.existsSync(c)) || null;
};
/**
 * Download and extract an npm package using `npm pack`.
 * Similar to openclaw's plugin install: npm pack → extract .tgz → return path.
 */
const downloadNpmPackage = async (spec, tempRoot) => {
    const npmCliJs = resolveNpmCliJs();
    const electronPath = (0, coworkUtil_1.getElectronNodeRuntimePath)();
    // Determine how to invoke npm
    let npmCommand;
    let npmArgs;
    if (npmCliJs) {
        npmCommand = electronPath;
        npmArgs = [npmCliJs, 'pack', spec, '--ignore-scripts', '--json'];
    }
    else {
        npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
        npmArgs = ['pack', spec, '--ignore-scripts', '--json'];
    }
    const packResult = await new Promise((resolve) => {
        const child = (0, child_process_1.spawn)(npmCommand, npmArgs, {
            cwd: tempRoot,
            env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', COREPACK_ENABLE_DOWNLOAD_PROMPT: '0' },
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (data) => { stdout += data; });
        child.stderr.on('data', (data) => { stderr += data; });
        child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
        child.on('error', (err) => resolve({ code: 1, stdout: '', stderr: err.message }));
    });
    if (packResult.code !== 0) {
        const detail = packResult.stderr.trim() || packResult.stdout.trim();
        throw new Error(`npm pack failed for "${spec}": ${detail}`);
    }
    // Find the .tgz file
    const tgzFiles = fs_1.default.readdirSync(tempRoot).filter(f => f.endsWith('.tgz'));
    if (tgzFiles.length === 0) {
        // Try parsing JSON output for filename
        try {
            const parsed = JSON.parse(packResult.stdout);
            const entries = Array.isArray(parsed) ? parsed : [parsed];
            for (const entry of entries) {
                if (entry.filename && fs_1.default.existsSync(path_1.default.join(tempRoot, entry.filename))) {
                    tgzFiles.push(entry.filename);
                    break;
                }
            }
        }
        catch { /* ignore */ }
    }
    if (tgzFiles.length === 0) {
        throw new Error(`npm pack produced no .tgz archive for "${spec}"`);
    }
    // Extract .tgz (which is a gzip'd tar containing a 'package/' directory)
    const tgzPath = path_1.default.join(tempRoot, tgzFiles[0]);
    const extractDir = path_1.default.join(tempRoot, 'npm-extracted');
    fs_1.default.mkdirSync(extractDir, { recursive: true });
    // Use tar to extract (Node.js built-in zlib + tar via npm's own bundled tar)
    const tarExtract = await new Promise((resolve) => {
        // Use system tar (available on all platforms including Windows 10+)
        const child = (0, child_process_1.spawn)('tar', ['xzf', tgzPath, '-C', extractDir], {
            windowsHide: true,
            stdio: ['ignore', 'ignore', 'pipe'],
        });
        let stderr = '';
        child.stderr.on('data', (data) => { stderr += data; });
        child.on('close', (code) => resolve({ code: code ?? 1, stderr }));
        child.on('error', () => resolve({ code: 1, stderr: 'tar not found' }));
    });
    if (tarExtract.code !== 0) {
        throw new Error(`Failed to extract npm package: ${tarExtract.stderr}`);
    }
    // npm pack extracts to a 'package/' subdirectory
    const packageDir = path_1.default.join(extractDir, 'package');
    if (fs_1.default.existsSync(packageDir)) {
        return packageDir;
    }
    // Fallback: return first directory in extract dir
    const dirs = fs_1.default.readdirSync(extractDir)
        .map(name => path_1.default.join(extractDir, name))
        .filter(p => fs_1.default.statSync(p).isDirectory());
    return dirs[0] || extractDir;
};
const isRemoteZipUrl = (source) => {
    try {
        const url = new URL(source);
        return (url.protocol === 'http:' || url.protocol === 'https:')
            && url.pathname.toLowerCase().endsWith('.zip');
    }
    catch {
        return false;
    }
};
const downloadZipUrl = async (zipUrl, tempRoot) => {
    const response = await electron_1.session.defaultSession.fetch(zipUrl, {
        method: 'GET',
        headers: { 'User-Agent': 'Caisra Skill Downloader' },
    });
    if (!response.ok) {
        throw new Error(`Download failed (${response.status} ${response.statusText})`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    const zipPath = path_1.default.join(tempRoot, 'remote-skill.zip');
    const extractRoot = path_1.default.join(tempRoot, 'remote-skill');
    fs_1.default.writeFileSync(zipPath, buffer);
    fs_1.default.mkdirSync(extractRoot, { recursive: true });
    await (0, extract_zip_1.default)(zipPath, { dir: extractRoot });
    const extractedDirs = fs_1.default.readdirSync(extractRoot)
        .map(entry => path_1.default.join(extractRoot, entry))
        .filter(entryPath => {
        try {
            return fs_1.default.statSync(entryPath).isDirectory();
        }
        catch {
            return false;
        }
    });
    if (extractedDirs.length === 1) {
        return extractedDirs[0];
    }
    return extractRoot;
};
const normalizeGithubSubpath = (value) => {
    const trimmed = value.trim().replace(/^\/+|\/+$/g, '');
    if (!trimmed)
        return null;
    const segments = trimmed
        .split('/')
        .filter(Boolean)
        .map(segment => {
        try {
            return decodeURIComponent(segment);
        }
        catch {
            return segment;
        }
    });
    if (segments.some(segment => segment === '.' || segment === '..')) {
        return null;
    }
    return segments.join('/');
};
const parseGithubTreeOrBlobUrl = (source) => {
    try {
        const parsedUrl = new URL(source);
        if (!['github.com', 'www.github.com'].includes(parsedUrl.hostname)) {
            return null;
        }
        const segments = parsedUrl.pathname.split('/').filter(Boolean);
        if (segments.length < 5) {
            return null;
        }
        const [owner, repoRaw, mode, ref, ...rest] = segments;
        if (!owner || !repoRaw || !ref || (mode !== 'tree' && mode !== 'blob')) {
            return null;
        }
        const repo = repoRaw.replace(/\.git$/i, '');
        const sourceSubpath = normalizeGithubSubpath(rest.join('/'));
        if (!repo || !sourceSubpath) {
            return null;
        }
        return {
            repoUrl: `https://github.com/${owner}/${repo}.git`,
            sourceSubpath,
            ref: decodeURIComponent(ref),
            repoNameHint: repo,
        };
    }
    catch {
        return null;
    }
};
const isWebSearchSkillBroken = (skillRoot) => {
    const startServerScript = path_1.default.join(skillRoot, 'scripts', 'start-server.sh');
    const searchScript = path_1.default.join(skillRoot, 'scripts', 'search.sh');
    const serverEntry = path_1.default.join(skillRoot, 'dist', 'server', 'index.js');
    const requiredPaths = [
        startServerScript,
        searchScript,
        serverEntry,
        path_1.default.join(skillRoot, 'node_modules', 'iconv-lite', 'encodings', 'index.js'),
    ];
    if (requiredPaths.some(requiredPath => !fs_1.default.existsSync(requiredPath))) {
        return true;
    }
    try {
        const startScript = fs_1.default.readFileSync(startServerScript, 'utf-8');
        const searchScriptContent = fs_1.default.readFileSync(searchScript, 'utf-8');
        const serverEntryContent = fs_1.default.readFileSync(serverEntry, 'utf-8');
        if (!startScript.includes('WEB_SEARCH_FORCE_REPAIR')) {
            return true;
        }
        if (!startScript.includes('detect_healthy_bridge_server')) {
            return true;
        }
        if (!searchScriptContent.includes('ACTIVE_SERVER_URL')) {
            return true;
        }
        if (!searchScriptContent.includes('try_switch_to_local_server')) {
            return true;
        }
        if (!searchScriptContent.includes('build_search_payload')) {
            return true;
        }
        if (!searchScriptContent.includes('@query_file')) {
            return true;
        }
        if (!serverEntryContent.includes('decodeJsonRequestBody')) {
            return true;
        }
        if (!serverEntryContent.includes("TextDecoder('gb18030'")) {
            return true;
        }
        if (serverEntryContent.includes('scoreDecodedJsonText') && serverEntryContent.includes('Request body decoded using gb18030 (score')) {
            return true;
        }
    }
    catch {
        return true;
    }
    return false;
};
class SkillManager {
    getStore;
    watchers = [];
    notifyTimer = null;
    changeListeners = [];
    pendingInstalls = new Map();
    upgradingSkillIds = new Set();
    deletingSkillIds = new Set();
    pluginSkillIds = new Set();
    constructor(getStore) {
        this.getStore = getStore;
    }
    /**
     * Update the cached set of plugin-provided skill IDs (from OpenClaw plugins).
     * These skills are treated as built-in and cannot be deleted by the user.
     */
    setPluginSkillIds(ids) {
        this.pluginSkillIds = ids;
    }
    getPluginSkillIds() {
        return this.pluginSkillIds;
    }
    getSkillsRoot() {
        return path_1.default.resolve(electron_1.app.getPath('userData'), SKILLS_DIR_NAME);
    }
    ensureSkillsRoot() {
        const root = this.getSkillsRoot();
        if (!fs_1.default.existsSync(root)) {
            fs_1.default.mkdirSync(root, { recursive: true });
        }
        return root;
    }
    recoverInterruptedUpgrades() {
        const root = this.getSkillsRoot();
        if (!fs_1.default.existsSync(root))
            return;
        try {
            const entries = fs_1.default.readdirSync(root);
            for (const entry of entries) {
                if (!entry.endsWith('.upgrading'))
                    continue;
                const backupDir = path_1.default.join(root, entry);
                const stat = fs_1.default.statSync(backupDir);
                if (!stat.isDirectory())
                    continue;
                const originalName = entry.replace(/\.upgrading$/, '');
                const originalDir = path_1.default.join(root, originalName);
                try {
                    if (fs_1.default.existsSync(originalDir) && fs_1.default.existsSync(path_1.default.join(originalDir, SKILL_FILE_NAME))) {
                        // Upgrade completed successfully, clean up backup
                        console.log(`[SkillManager] cleaning up completed upgrade backup: ${entry}`);
                        fs_1.default.rmSync(backupDir, { recursive: true, force: true });
                    }
                    else {
                        // Upgrade was interrupted, roll back
                        console.log(`[SkillManager] rolling back interrupted upgrade: ${entry} → ${originalName}`);
                        if (fs_1.default.existsSync(originalDir)) {
                            fs_1.default.rmSync(originalDir, { recursive: true, force: true });
                        }
                        fs_1.default.renameSync(backupDir, originalDir);
                    }
                }
                catch (error) {
                    console.warn(`[SkillManager] failed to recover upgrade for ${entry}:`, error);
                }
            }
        }
        catch (error) {
            console.warn('[SkillManager] failed to recover interrupted upgrades:', error);
        }
    }
    syncBundledSkillsToUserData() {
        console.log('[skills] syncBundledSkillsToUserData: start', { packaged: electron_1.app.isPackaged });
        const userRoot = this.ensureSkillsRoot();
        console.log('[skills] syncBundledSkillsToUserData: userRoot =', userRoot);
        const bundledRoot = this.getBundledSkillsRoot();
        console.log('[skills] syncBundledSkillsToUserData: bundledRoot =', bundledRoot);
        if (!bundledRoot || bundledRoot === userRoot || !fs_1.default.existsSync(bundledRoot)) {
            console.log('[skills] syncBundledSkillsToUserData: bundledRoot skipped (missing or same as userRoot)');
            return;
        }
        try {
            // Build allowlist of bundled skill IDs from skills.config.json so
            // user-added skill folders that happen to sit in the bundled root
            // (e.g. restored by the installer's AppData backup) are not synced
            // to user data. Falls back to the legacy "sync everything" behavior
            // if the config is missing or malformed.
            let bundledIds = null;
            try {
                const configPath = path_1.default.join(bundledRoot, SKILLS_CONFIG_FILE);
                if (fs_1.default.existsSync(configPath)) {
                    const parsed = JSON.parse(fs_1.default.readFileSync(configPath, 'utf8'));
                    if (parsed?.defaults && typeof parsed.defaults === 'object') {
                        bundledIds = new Set(Object.keys(parsed.defaults));
                    }
                }
            }
            catch (error) {
                console.warn('[skills] Failed to parse skills.config.json for sync filter:', error);
            }
            const bundledSkillDirs = listSkillDirs(bundledRoot);
            console.log('[skills] syncBundledSkillsToUserData: found', bundledSkillDirs.length, 'bundled skills');
            bundledSkillDirs.forEach((dir) => {
                const id = path_1.default.basename(dir);
                if (bundledIds && !bundledIds.has(id)) {
                    console.log(`[skills] syncBundledSkillsToUserData: skipping non-bundled "${id}"`);
                    return;
                }
                const targetDir = path_1.default.join(userRoot, id);
                const targetExists = fs_1.default.existsSync(targetDir);
                // Check if skill needs repair
                let shouldRepair = false;
                let needsCleanCopy = false;
                if (targetExists) {
                    // Version-based update: if bundled has a version and it's newer, force update
                    const bundledVer = this.getSkillVersion(dir);
                    if (bundledVer && compareVersions(bundledVer, this.getSkillVersion(targetDir) || '0.0.0') > 0) {
                        shouldRepair = true;
                        needsCleanCopy = true;
                    }
                    // web-search has specific broken checks
                    else if (id === 'web-search' && isWebSearchSkillBroken(targetDir)) {
                        shouldRepair = true;
                    }
                    // Generic check: if bundled has node_modules but target doesn't, repair it
                    else if (!this.isSkillRuntimeHealthy(targetDir, dir)) {
                        shouldRepair = true;
                    }
                }
                if (targetExists && !shouldRepair)
                    return;
                try {
                    console.log(`[skills] syncBundledSkillsToUserData: copying "${id}" from ${dir} to ${targetDir}`);
                    // Preserve user-managed email credentials before clean copy
                    let envBackup = null;
                    let accountsBackup = null;
                    const envPath = path_1.default.join(targetDir, '.env');
                    const accountsPath = path_1.default.join(targetDir, 'accounts.json');
                    if (needsCleanCopy && fs_1.default.existsSync(envPath)) {
                        envBackup = fs_1.default.readFileSync(envPath);
                    }
                    if (needsCleanCopy && fs_1.default.existsSync(accountsPath)) {
                        accountsBackup = fs_1.default.readFileSync(accountsPath);
                    }
                    // Version-based update: delete target dir first to remove stale files
                    // (e.g. old .py scripts, __pycache__, leftover package-lock.json)
                    if (needsCleanCopy) {
                        fs_1.default.rmSync(targetDir, { recursive: true, force: true });
                    }
                    (0, fsCompat_1.cpRecursiveSync)(dir, targetDir, {
                        dereference: true,
                        force: shouldRepair,
                    });
                    // Restore user-managed email credentials after clean copy
                    if (envBackup !== null) {
                        fs_1.default.writeFileSync(envPath, envBackup);
                    }
                    if (accountsBackup !== null) {
                        fs_1.default.writeFileSync(accountsPath, accountsBackup);
                    }
                    console.log(`[skills] syncBundledSkillsToUserData: copied "${id}" successfully`);
                    if (shouldRepair) {
                        console.log(`[skills] Repaired bundled skill "${id}" in user data`);
                    }
                }
                catch (error) {
                    console.warn(`[skills] Failed to sync bundled skill "${id}":`, error);
                }
            });
            const bundledConfig = path_1.default.join(bundledRoot, SKILLS_CONFIG_FILE);
            const targetConfig = path_1.default.join(userRoot, SKILLS_CONFIG_FILE);
            if (fs_1.default.existsSync(bundledConfig)) {
                if (!fs_1.default.existsSync(targetConfig)) {
                    console.log('[skills] syncBundledSkillsToUserData: copying skills.config.json');
                    (0, fsCompat_1.cpRecursiveSync)(bundledConfig, targetConfig);
                }
                else {
                    this.mergeSkillsConfig(bundledConfig, targetConfig);
                }
            }
            console.log('[skills] syncBundledSkillsToUserData: done');
        }
        catch (error) {
            console.warn('[skills] Failed to sync bundled skills:', error);
        }
    }
    /**
     * Check if a skill's runtime is healthy by comparing with bundled version.
     * Returns false if bundled has dependencies but target doesn't.
     */
    isSkillRuntimeHealthy(targetDir, bundledDir) {
        const bundledNodeModules = path_1.default.join(bundledDir, 'node_modules');
        const targetNodeModules = path_1.default.join(targetDir, 'node_modules');
        const targetPackageJson = path_1.default.join(targetDir, 'package.json');
        // If target has no package.json, it's a simple skill (no deps needed)
        if (!fs_1.default.existsSync(targetPackageJson)) {
            return true;
        }
        // If bundled doesn't have node_modules, no deps to sync
        if (!fs_1.default.existsSync(bundledNodeModules)) {
            return true;
        }
        // If bundled has node_modules but target doesn't, needs repair
        if (!fs_1.default.existsSync(targetNodeModules)) {
            return false;
        }
        return true;
    }
    getSkillVersion(skillDir) {
        try {
            const raw = fs_1.default.readFileSync(path_1.default.join(skillDir, SKILL_FILE_NAME), 'utf8');
            const { frontmatter } = parseFrontmatter(raw);
            const meta = frontmatter.metadata;
            const v = frontmatter.version ?? meta?.version;
            return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '';
        }
        catch {
            return '';
        }
    }
    mergeSkillsConfig(bundledPath, targetPath) {
        try {
            const bundled = JSON.parse(fs_1.default.readFileSync(bundledPath, 'utf-8'));
            const target = JSON.parse(fs_1.default.readFileSync(targetPath, 'utf-8'));
            if (!bundled.defaults || !target.defaults)
                return;
            let changed = false;
            for (const [id, config] of Object.entries(bundled.defaults)) {
                if (!(id in target.defaults)) {
                    target.defaults[id] = config;
                    changed = true;
                }
            }
            if (changed) {
                // Write to temp file first, then rename for atomic update
                const tmpPath = targetPath + '.tmp';
                fs_1.default.writeFileSync(tmpPath, JSON.stringify(target, null, 2) + '\n', 'utf-8');
                fs_1.default.renameSync(tmpPath, targetPath);
                console.log('[skills] mergeSkillsConfig: merged new skill entries into user config');
            }
        }
        catch (e) {
            console.warn('[skills] Failed to merge skills config:', e);
        }
    }
    listSkills() {
        const primaryRoot = this.ensureSkillsRoot();
        const state = this.loadSkillStateMap();
        const roots = this.getSkillRoots(primaryRoot);
        const orderedRoots = roots.filter(root => root !== primaryRoot).concat(primaryRoot);
        const defaults = this.loadSkillsDefaults(roots);
        const builtInSkillIds = this.listBuiltInSkillIds();
        const skillMap = new Map();
        orderedRoots.forEach(root => {
            if (!fs_1.default.existsSync(root))
                return;
            const skillDirs = listSkillDirs(root);
            skillDirs.forEach(dir => {
                const skillId = path_1.default.basename(dir);
                if (skillId === constants_1.ComputerUseSkillId.BuiltIn && !(0, computerUseKit_1.isComputerUseKitInstalled)(this.getStore())) {
                    return;
                }
                const skill = this.parseSkillDir(dir, state, defaults, builtInSkillIds.has(skillId) || this.pluginSkillIds.has(skillId));
                if (!skill)
                    return;
                skillMap.set(skill.id, skill);
            });
        });
        const skills = Array.from(skillMap.values());
        skills.sort((a, b) => {
            const orderA = defaults[a.id]?.order ?? 999;
            const orderB = defaults[b.id]?.order ?? 999;
            if (orderA !== orderB)
                return orderA - orderB;
            return a.name.localeCompare(b.name);
        });
        return skills;
    }
    buildAutoRoutingPrompt() {
        const skills = this.listSkills();
        const enabled = skills.filter(s => s.enabled && s.prompt);
        if (enabled.length === 0)
            return null;
        const skillEntries = enabled
            .map(s => `  <skill><id>${s.id}</id><name>${s.name}</name><description>${s.description}</description><location>${s.skillPath}</location></skill>`)
            .join('\n');
        return [
            '## Skills (mandatory)',
            'Before replying: scan <available_skills> <description> entries.',
            '- If exactly one skill clearly applies: read its SKILL.md at <location> with the Read tool, then follow it.',
            '- If multiple could apply: choose the most specific one, then read/follow it.',
            '- If none clearly apply: do not read any SKILL.md.',
            '- IMPORTANT: If a description contains "Do NOT use" constraints, strictly respect them. If the user\'s request falls into a "Do NOT" category, treat that skill as non-matching — do NOT read its SKILL.md.',
            '- For the selected skill, treat <location> as the canonical SKILL.md path.',
            '- Resolve relative paths mentioned by that SKILL.md against its directory (dirname(<location>)), not the workspace root.',
            'Constraints: never read more than one skill up front; only read additional skills if the first one explicitly references them.',
            '',
            '<available_skills>',
            skillEntries,
            '</available_skills>',
        ].join('\n');
    }
    detectSkillsFromOpenClaw(report) {
        try {
            const existing = this.listSkills();
            const existingIds = new Set(existing.map(s => s.id));
            const skillsRoot = this.getSkillsRoot();
            const newSkills = report.skills.filter(entry => {
                // Skip bundled skills and plugin-provided skills (e.g. moltbot/POPO plugins)
                if (entry.bundled || entry.source === 'openclaw-extra')
                    return false;
                const normalizedBaseDir = path_1.default.resolve(entry.baseDir);
                const normalizedRoot = path_1.default.resolve(skillsRoot);
                if (normalizedBaseDir.startsWith(normalizedRoot))
                    return false;
                const id = entry.skillKey || path_1.default.basename(entry.baseDir);
                if (existingIds.has(id))
                    return false;
                return true;
            });
            return {
                skills: newSkills.map(s => ({
                    name: s.name,
                    description: s.description,
                    skillKey: s.skillKey || path_1.default.basename(s.baseDir),
                    baseDir: s.baseDir,
                    disabled: s.disabled,
                })),
            };
        }
        catch (error) {
            return { skills: [], error: error instanceof Error ? error.message : 'Detection failed' };
        }
    }
    syncSkillsFromOpenClaw(report) {
        try {
            const { skills } = this.detectSkillsFromOpenClaw(report);
            if (skills.length === 0)
                return { synced: [] };
            const root = this.ensureSkillsRoot();
            const synced = [];
            for (const entry of skills) {
                const srcDir = path_1.default.resolve(entry.baseDir);
                if (!fs_1.default.existsSync(srcDir))
                    continue;
                const targetDir = path_1.default.join(root, entry.skillKey);
                if (fs_1.default.existsSync(targetDir))
                    continue;
                (0, fsCompat_1.cpRecursiveSync)(srcDir, targetDir);
                // Record OpenClaw source path so we can remove it on delete
                try {
                    const metaPath = path_1.default.join(targetDir, '_meta.json');
                    const meta = fs_1.default.existsSync(metaPath)
                        ? JSON.parse(fs_1.default.readFileSync(metaPath, 'utf8'))
                        : {};
                    meta.openclawSourceDir = srcDir;
                    fs_1.default.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n', 'utf8');
                }
                catch { /* best-effort */ }
                // Respect disabled state from OpenClaw
                if (entry.disabled) {
                    const state = this.loadSkillStateMap();
                    state[entry.skillKey] = { enabled: false };
                    this.saveSkillStateMap(state);
                }
                synced.push(entry.skillKey);
            }
            if (synced.length > 0) {
                this.notifySkillsChanged();
            }
            return { synced };
        }
        catch (error) {
            return { synced: [], error: error instanceof Error ? error.message : 'Sync failed' };
        }
    }
    setSkillEnabled(id, enabled) {
        const state = this.loadSkillStateMap();
        state[id] = { enabled };
        this.saveSkillStateMap(state);
        this.notifySkillsChanged();
        return this.listSkills();
    }
    async deleteSkill(id) {
        const root = this.ensureSkillsRoot();
        if (id !== path_1.default.basename(id)) {
            throw new Error('Invalid skill id');
        }
        if (this.isBuiltInSkillId(id)) {
            throw new Error('Built-in skills cannot be deleted');
        }
        if (this.deletingSkillIds.has(id)) {
            throw new Error(`Skill "${id}" is already being deleted`);
        }
        this.deletingSkillIds.add(id);
        try {
            return await this._performDelete(id, root);
        }
        finally {
            this.deletingSkillIds.delete(id);
        }
    }
    async _performDelete(id, root) {
        let targetDir = resolveWithin(root, id);
        if (!fs_1.default.existsSync(targetDir)) {
            const bundledRoot = this.getBundledSkillsRoot();
            if (bundledRoot && bundledRoot !== root) {
                const bundledTarget = resolveWithin(bundledRoot, id);
                targetDir = fs_1.default.existsSync(bundledTarget) ? bundledTarget : null;
            }
            else {
                targetDir = null;
            }
        }
        console.log('[skills] deleteSkill: id=%s, targetDir=%s, platform=%s', id, targetDir, process.platform);
        // Release directory handles held by fs.watch() before deleting;
        // on Windows, open handles prevent rmSync from removing the directory.
        this.stopWatching();
        // On Windows, watcher.close() triggers an async kernel operation to release
        // the directory handle. Yield to the event loop so the handle is fully
        // released before we attempt deletion.
        if (process.platform === 'win32') {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        try {
            if (targetDir !== null) {
                let removedByFallback = false;
                const startMs = Date.now();
                try {
                    await fs_1.default.promises.rm(targetDir, {
                        recursive: true,
                        force: true,
                        maxRetries: process.platform === 'win32' ? 5 : 0,
                        retryDelay: process.platform === 'win32' ? 200 : 0,
                    });
                }
                catch (error) {
                    if (!isWindowsDeletePermissionError(error)) {
                        throw error;
                    }
                    const fallback = await tryWindowsDeleteFallbackAsync(targetDir);
                    if (!fallback.success) {
                        console.warn('[skills] deleteSkill: Windows fallback failed for "%s": %s', id, fallback.detail || 'unknown');
                        // Last resort: remove SKILL.md so listSkillDirs won't discover this
                        // directory, then rename it to a tombstone cleaned up on next startup.
                        try {
                            const skillMdPath = path_1.default.join(targetDir, SKILL_FILE_NAME);
                            if (fs_1.default.existsSync(skillMdPath)) {
                                fs_1.default.unlinkSync(skillMdPath);
                            }
                            const tombstone = targetDir + '.deleted.' + Date.now();
                            fs_1.default.renameSync(targetDir, tombstone);
                            console.warn('[skills] deleteSkill: directory renamed to tombstone "%s" as last resort', path_1.default.basename(tombstone));
                            removedByFallback = true;
                        }
                        catch (renameError) {
                            console.error('[skills] deleteSkill: last-resort rename also failed:', renameError);
                            throw error;
                        }
                    }
                    else {
                        removedByFallback = true;
                    }
                }
                if (removedByFallback) {
                    console.warn('[skills] deleteSkill: directory removed via Windows fallback in %dms', Date.now() - startMs);
                }
                else {
                    console.log('[skills] deleteSkill: directory removed in %dms', Date.now() - startMs);
                }
            }
            else {
                console.warn('[skills] deleteSkill: directory not found on disk, cleaning state only');
            }
            const state = this.loadSkillStateMap();
            delete state[id];
            this.saveSkillStateMap(state);
            this.notifySkillsChanged();
            console.log('[skills] deleteSkill: completed successfully for "%s"', id);
            return this.listSkills();
        }
        catch (error) {
            console.error('[skills] deleteSkill: failed to remove "%s" at %s:', id, targetDir, error);
            throw error;
        }
        finally {
            this.startWatching();
        }
    }
    async downloadSkill(source) {
        let cleanupPath = null;
        try {
            const trimmed = source.trim();
            if (!trimmed) {
                return { success: false, error: 'Missing skill source' };
            }
            console.log(`[SkillManager] downloadSkill: source="${trimmed}"`);
            const root = this.ensureSkillsRoot();
            let localSource = trimmed;
            if (fs_1.default.existsSync(localSource)) {
                const stat = fs_1.default.statSync(localSource);
                if (stat.isFile()) {
                    if (isZipFile(localSource)) {
                        console.log('[SkillManager] downloadSkill: detected local zip file');
                        const tempRoot = fs_1.default.mkdtempSync(path_1.default.join(electron_1.app.getPath('temp'), 'lobsterai-skill-zip-'));
                        await (0, extract_zip_1.default)(localSource, { dir: tempRoot });
                        localSource = tempRoot;
                        cleanupPath = tempRoot;
                    }
                    else if (path_1.default.basename(localSource) === SKILL_FILE_NAME) {
                        console.log('[SkillManager] downloadSkill: detected local SKILL.md file');
                        localSource = path_1.default.dirname(localSource);
                    }
                    else {
                        return { success: false, error: 'Skill source must be a directory, zip file, or SKILL.md file' };
                    }
                }
                else {
                    console.log('[SkillManager] downloadSkill: detected local directory');
                }
            }
            else if (isRemoteZipUrl(trimmed)) {
                console.log('[SkillManager] downloadSkill: detected remote zip URL');
                const tempRoot = fs_1.default.mkdtempSync(path_1.default.join(electron_1.app.getPath('temp'), 'lobsterai-skill-zip-'));
                cleanupPath = tempRoot;
                localSource = await downloadZipUrl(trimmed, tempRoot);
            }
            else if (isNpmPackageSpec(trimmed)) {
                console.log(`[SkillManager] downloadSkill: detected npm package spec "${trimmed}"`);
                const tempRoot = fs_1.default.mkdtempSync(path_1.default.join(electron_1.app.getPath('temp'), 'lobsterai-skill-npm-'));
                cleanupPath = tempRoot;
                localSource = await downloadNpmPackage(trimmed, tempRoot);
                console.log(`[SkillManager] downloadSkill: npm package extracted to ${localSource}`);
            }
            else if (parseClawhubUrl(trimmed)) {
                const clawhubParsed = parseClawhubUrl(trimmed);
                console.log(`[SkillManager] downloadSkill: detected ClawHub URL, skill name="${clawhubParsed.name}"`);
                const tempRoot = fs_1.default.mkdtempSync(path_1.default.join(electron_1.app.getPath('temp'), 'lobsterai-skill-clawhub-'));
                cleanupPath = tempRoot;
                const env = buildSkillEnv();
                await downloadClawhubSkill(clawhubParsed.name, tempRoot, env);
                localSource = tempRoot;
            }
            else {
                const normalized = this.normalizeGitSource(trimmed);
                if (!normalized) {
                    return { success: false, error: (0, i18n_1.t)('skillErrInvalidSource') };
                }
                const tempRoot = fs_1.default.mkdtempSync(path_1.default.join(electron_1.app.getPath('temp'), 'lobsterai-skill-'));
                cleanupPath = tempRoot;
                const repoName = normalizeFolderName(normalized.repoNameHint || deriveRepoName(normalized.repoUrl));
                const clonePath = path_1.default.join(tempRoot, repoName);
                const githubSource = parseGithubRepoSource(normalized.repoUrl);
                let downloadedSourceRoot = clonePath;
                // Prefer HTTP zip download for GitHub repos (no git dependency required).
                // Fall back to git clone only for non-GitHub sources or if download fails.
                let downloaded = false;
                if (githubSource) {
                    console.log(`[SkillManager] downloadSkill: trying GitHub HTTP zip download for ${githubSource.owner}/${githubSource.repo}`);
                    try {
                        downloadedSourceRoot = await downloadGithubArchive(githubSource, tempRoot, normalized.ref);
                        downloaded = true;
                        console.log(`[SkillManager] downloadSkill: GitHub HTTP download succeeded → ${downloadedSourceRoot}`);
                    }
                    catch (err) {
                        console.log(`[SkillManager] downloadSkill: GitHub HTTP download failed: ${err instanceof Error ? err.message : err}, falling back to git clone`);
                    }
                }
                if (!downloaded) {
                    console.log(`[SkillManager] downloadSkill: using git clone for ${normalized.repoUrl}`);
                    const cloneArgs = ['clone', '--depth', '1'];
                    if (normalized.ref) {
                        cloneArgs.push('--branch', normalized.ref);
                    }
                    cloneArgs.push(normalized.repoUrl, clonePath);
                    const gitRuntime = resolveGitCommand();
                    try {
                        await runCommand(gitRuntime.command, cloneArgs, { env: gitRuntime.env });
                    }
                    catch (error) {
                        const errno = error?.code;
                        if (errno === 'ENOENT' && process.platform === 'win32') {
                            throw new Error('Failed to download skill. Git is not installed.'
                                + ' Please install Git for Windows, or use a GitHub URL (HTTP download).');
                        }
                        throw error;
                    }
                }
                if (normalized.sourceSubpath) {
                    const scopedSource = resolveWithin(downloadedSourceRoot, normalized.sourceSubpath);
                    if (!fs_1.default.existsSync(scopedSource)) {
                        return { success: false, error: `Path "${normalized.sourceSubpath}" not found in repository` };
                    }
                    const scopedStat = fs_1.default.statSync(scopedSource);
                    if (scopedStat.isFile()) {
                        if (path_1.default.basename(scopedSource) === SKILL_FILE_NAME) {
                            localSource = path_1.default.dirname(scopedSource);
                        }
                        else {
                            return { success: false, error: 'GitHub path must point to a directory or SKILL.md file' };
                        }
                    }
                    else {
                        localSource = scopedSource;
                    }
                }
                else {
                    localSource = downloadedSourceRoot;
                }
            }
            const skillDirs = collectSkillDirsFromSource(localSource);
            if (skillDirs.length === 0) {
                cleanupPathSafely(cleanupPath);
                cleanupPath = null;
                return { success: false, error: (0, i18n_1.t)('skillErrNoSkillMd') };
            }
            // Security scan before installation
            let auditReport = null;
            try {
                console.log(`[SkillManager] Starting security scan for ${skillDirs.length} skill dir(s)...`);
                const reports = await (0, skillSecurityScanner_1.scanMultipleSkillDirs)(skillDirs);
                auditReport = (0, skillSecurityScanner_1.mergeReports)(reports);
                if (auditReport) {
                    console.log(`[SkillManager] Security scan complete: riskLevel=${auditReport.riskLevel}, score=${auditReport.riskScore}, findings=${auditReport.findings.length}, duration=${auditReport.scanDurationMs}ms`);
                    for (const f of auditReport.findings) {
                        console.log(`[SkillManager]   [${f.severity}] ${f.dimension} | ${f.ruleId} → ${f.file}${f.line ? ':' + f.line : ''}`);
                    }
                }
            }
            catch (err) {
                console.warn('[SkillManager] Security scan failed (non-blocking):', err);
            }
            // If risk detected, cache for user confirmation instead of auto-installing
            if (auditReport && auditReport.riskLevel !== 'safe') {
                const pendingId = crypto_1.default.randomUUID();
                console.log(`[SkillManager] Risk detected (${auditReport.riskLevel}), pending user confirmation: ${pendingId}`);
                const timer = setTimeout(() => {
                    const pending = this.pendingInstalls.get(pendingId);
                    if (pending) {
                        cleanupPathSafely(pending.cleanupPath);
                        this.pendingInstalls.delete(pendingId);
                        console.log(`[SkillManager] Pending install ${pendingId} expired (TTL)`);
                    }
                }, 5 * 60 * 1000);
                this.pendingInstalls.set(pendingId, {
                    tempDir: localSource,
                    cleanupPath,
                    root,
                    skillDirs,
                    timer,
                });
                return {
                    success: true,
                    auditReport,
                    pendingInstallId: pendingId,
                };
            }
            // Safe or scan failed — install directly
            console.log(`[SkillManager] Skill is safe (or scan failed), installing directly`);
            for (const skillDir of skillDirs) {
                const folderName = normalizeFolderName(path_1.default.basename(skillDir));
                let targetDir = resolveWithin(root, folderName);
                let suffix = 1;
                while (fs_1.default.existsSync(targetDir)) {
                    targetDir = resolveWithin(root, `${folderName}-${suffix}`);
                    suffix += 1;
                }
                (0, fsCompat_1.cpRecursiveSync)(skillDir, targetDir);
                const normalizeResult = normalizeWindowsSkillDirectoryAttrs(targetDir);
                if (normalizeResult.success) {
                    console.log('[skills] install normalization applied for "%s" at %s', folderName, targetDir);
                }
                else {
                    console.warn('[skills] install normalization failed for "%s" at %s: %s', folderName, targetDir, normalizeResult.detail || 'unknown');
                }
            }
            cleanupPathSafely(cleanupPath);
            cleanupPath = null;
            this.startWatching();
            this.notifySkillsChanged();
            return { success: true, skills: this.listSkills() };
        }
        catch (error) {
            cleanupPathSafely(cleanupPath);
            return { success: false, error: error instanceof Error ? error.message : 'Failed to download skill' };
        }
    }
    async upgradeSkill(skillId, downloadUrl) {
        // Prevent concurrent upgrades of the same skill
        if (this.upgradingSkillIds.has(skillId)) {
            return { success: false, error: `Skill "${skillId}" is already being upgraded` };
        }
        // Find the installed skill
        const installedSkills = this.listSkills();
        const installed = installedSkills.find(s => s.id === skillId);
        if (!installed) {
            return { success: false, error: `Skill "${skillId}" is not installed` };
        }
        const existingSkillDir = path_1.default.dirname(installed.skillPath);
        if (!fs_1.default.existsSync(existingSkillDir)) {
            return { success: false, error: `Skill directory not found: ${existingSkillDir}` };
        }
        this.upgradingSkillIds.add(skillId);
        try {
            return await this.performUpgradeDownload(skillId, downloadUrl, existingSkillDir);
        }
        finally {
            this.upgradingSkillIds.delete(skillId);
        }
    }
    async performUpgradeDownload(skillId, downloadUrl, existingSkillDir) {
        let cleanupPath = null;
        try {
            console.log(`[SkillManager] starting upgrade for skill "${skillId}"`);
            const root = this.ensureSkillsRoot();
            // Download new version (reuse downloadSkill's download logic)
            const tempRoot = fs_1.default.mkdtempSync(path_1.default.join(electron_1.app.getPath('temp'), 'lobsterai-skill-upgrade-'));
            cleanupPath = tempRoot;
            let localSource;
            if (isRemoteZipUrl(downloadUrl)) {
                localSource = await downloadZipUrl(downloadUrl, tempRoot);
            }
            else {
                const normalized = this.normalizeGitSource(downloadUrl);
                if (!normalized) {
                    cleanupPathSafely(cleanupPath);
                    return { success: false, error: 'Invalid download URL' };
                }
                const repoName = normalizeFolderName(normalized.repoNameHint || deriveRepoName(normalized.repoUrl));
                const clonePath = path_1.default.join(tempRoot, repoName);
                const githubSource = parseGithubRepoSource(normalized.repoUrl);
                let downloadedSourceRoot = clonePath;
                let downloaded = false;
                if (githubSource) {
                    try {
                        downloadedSourceRoot = await downloadGithubArchive(githubSource, tempRoot, normalized.ref);
                        downloaded = true;
                    }
                    catch {
                        // Fall through to git clone
                    }
                }
                if (!downloaded) {
                    const cloneArgs = ['clone', '--depth', '1'];
                    if (normalized.ref)
                        cloneArgs.push('--branch', normalized.ref);
                    cloneArgs.push(normalized.repoUrl, clonePath);
                    const gitRuntime = resolveGitCommand();
                    await runCommand(gitRuntime.command, cloneArgs, { env: gitRuntime.env });
                }
                if (normalized.sourceSubpath) {
                    const scopedSource = resolveWithin(downloadedSourceRoot, normalized.sourceSubpath);
                    if (!fs_1.default.existsSync(scopedSource)) {
                        cleanupPathSafely(cleanupPath);
                        return { success: false, error: `Path "${normalized.sourceSubpath}" not found` };
                    }
                    localSource = fs_1.default.statSync(scopedSource).isFile() && path_1.default.basename(scopedSource) === SKILL_FILE_NAME
                        ? path_1.default.dirname(scopedSource)
                        : scopedSource;
                }
                else {
                    localSource = downloadedSourceRoot;
                }
            }
            const skillDirs = collectSkillDirsFromSource(localSource);
            if (skillDirs.length === 0) {
                cleanupPathSafely(cleanupPath);
                return { success: false, error: (0, i18n_1.t)('skillErrNoSkillMd') };
            }
            // Find the matching skill dir for this ID
            const matchingSkillDir = skillDirs.find(d => normalizeFolderName(path_1.default.basename(d)) === skillId) || skillDirs[0];
            // Security scan
            let auditReport = null;
            try {
                const reports = await (0, skillSecurityScanner_1.scanMultipleSkillDirs)([matchingSkillDir]);
                auditReport = (0, skillSecurityScanner_1.mergeReports)(reports);
            }
            catch (err) {
                console.warn('[SkillManager] Security scan failed (non-blocking):', err);
            }
            // If risk detected, cache for user confirmation
            if (auditReport && auditReport.riskLevel !== 'safe') {
                const pendingId = crypto_1.default.randomUUID();
                console.log(`[SkillManager] Upgrade risk detected (${auditReport.riskLevel}), pending confirmation: ${pendingId}`);
                const timer = setTimeout(() => {
                    const pending = this.pendingInstalls.get(pendingId);
                    if (pending) {
                        cleanupPathSafely(pending.cleanupPath);
                        this.pendingInstalls.delete(pendingId);
                    }
                }, 5 * 60 * 1000);
                this.pendingInstalls.set(pendingId, {
                    tempDir: localSource,
                    cleanupPath,
                    root,
                    skillDirs: [matchingSkillDir],
                    timer,
                    isUpgrade: true,
                    existingSkillDir,
                });
                // Ownership of cleanupPath transferred to pendingInstalls
                cleanupPath = null;
                return { success: true, auditReport, pendingInstallId: pendingId };
            }
            // Safe — perform upgrade
            this.performSkillUpgrade(matchingSkillDir, existingSkillDir);
            cleanupPathSafely(cleanupPath);
            cleanupPath = null;
            this.startWatching();
            this.notifySkillsChanged();
            return { success: true, skills: this.listSkills() };
        }
        catch (error) {
            cleanupPathSafely(cleanupPath);
            return { success: false, error: error instanceof Error ? error.message : 'Failed to upgrade skill' };
        }
    }
    performSkillUpgrade(newSkillDir, existingSkillDir) {
        const upgradingDir = existingSkillDir + '.upgrading';
        // Back up user-managed config files and _meta.json
        let envBackup = null;
        let accountsBackup = null;
        let metaBackup = null;
        const envPath = path_1.default.join(existingSkillDir, '.env');
        const accountsPath = path_1.default.join(existingSkillDir, 'accounts.json');
        const metaPath = path_1.default.join(existingSkillDir, '_meta.json');
        if (fs_1.default.existsSync(envPath)) {
            envBackup = fs_1.default.readFileSync(envPath);
        }
        if (fs_1.default.existsSync(accountsPath)) {
            accountsBackup = fs_1.default.readFileSync(accountsPath);
        }
        if (fs_1.default.existsSync(metaPath)) {
            metaBackup = fs_1.default.readFileSync(metaPath);
        }
        // Atomic rename old dir to .upgrading backup
        fs_1.default.renameSync(existingSkillDir, upgradingDir);
        try {
            // Copy new version to original path
            (0, fsCompat_1.cpRecursiveSync)(newSkillDir, existingSkillDir);
            // Restore user-managed config files and _meta.json
            if (envBackup !== null) {
                fs_1.default.writeFileSync(path_1.default.join(existingSkillDir, '.env'), envBackup);
            }
            if (accountsBackup !== null) {
                fs_1.default.writeFileSync(path_1.default.join(existingSkillDir, 'accounts.json'), accountsBackup);
            }
            if (metaBackup !== null) {
                fs_1.default.writeFileSync(path_1.default.join(existingSkillDir, '_meta.json'), metaBackup);
            }
        }
        catch (error) {
            // Roll back: remove partial new dir and restore backup
            console.error('[SkillManager] upgrade copy failed, rolling back:', error);
            if (fs_1.default.existsSync(existingSkillDir)) {
                fs_1.default.rmSync(existingSkillDir, { recursive: true, force: true });
            }
            fs_1.default.renameSync(upgradingDir, existingSkillDir);
            throw error;
        }
        // Remove backup
        fs_1.default.rmSync(upgradingDir, { recursive: true, force: true });
    }
    confirmPendingInstall(pendingId, action) {
        console.log(`[SkillManager] confirmPendingInstall: id=${pendingId}, action=${action}`);
        const pending = this.pendingInstalls.get(pendingId);
        if (!pending) {
            console.warn(`[SkillManager] Pending install not found: ${pendingId}`);
            return { success: false, error: 'No pending install found' };
        }
        clearTimeout(pending.timer);
        this.pendingInstalls.delete(pendingId);
        if (action === 'cancel') {
            cleanupPathSafely(pending.cleanupPath);
            return { success: true };
        }
        // Install the skill(s)
        const installedIds = [];
        // Upgrade path: overwrite existing skill directory
        if (pending.isUpgrade && pending.existingSkillDir) {
            for (const skillDir of pending.skillDirs) {
                this.performSkillUpgrade(skillDir, pending.existingSkillDir);
                installedIds.push(path_1.default.basename(pending.existingSkillDir));
            }
        }
        else {
            // Fresh install path: find unique directory name
            for (const skillDir of pending.skillDirs) {
                const folderName = normalizeFolderName(path_1.default.basename(skillDir));
                let targetDir = resolveWithin(pending.root, folderName);
                let suffix = 1;
                while (fs_1.default.existsSync(targetDir)) {
                    targetDir = resolveWithin(pending.root, `${folderName}-${suffix}`);
                    suffix += 1;
                }
                (0, fsCompat_1.cpRecursiveSync)(skillDir, targetDir);
                const normalizeResult = normalizeWindowsSkillDirectoryAttrs(targetDir);
                if (normalizeResult.success) {
                    console.log('[skills] install normalization applied for "%s" at %s', folderName, targetDir);
                }
                else {
                    console.warn('[skills] install normalization failed for "%s" at %s: %s', folderName, targetDir, normalizeResult.detail || 'unknown');
                }
                installedIds.push(path_1.default.basename(targetDir));
            }
        }
        cleanupPathSafely(pending.cleanupPath);
        // If user chose 'installDisabled', disable all newly installed skills
        if (action === 'installDisabled') {
            for (const id of installedIds) {
                try {
                    this.setSkillEnabled(id, false);
                }
                catch {
                    // Non-critical
                }
            }
        }
        this.startWatching();
        this.notifySkillsChanged();
        return { success: true, skills: this.listSkills() };
    }
    startWatching() {
        this.stopWatching();
        const primaryRoot = this.ensureSkillsRoot();
        const roots = this.getSkillRoots(primaryRoot);
        // Clean up tombstone directories left by failed deletions on Windows
        if (process.platform === 'win32') {
            for (const root of roots) {
                if (!fs_1.default.existsSync(root))
                    continue;
                try {
                    for (const entry of fs_1.default.readdirSync(root)) {
                        if (/\.deleted\.\d+$/.test(entry)) {
                            try {
                                fs_1.default.rmSync(path_1.default.join(root, entry), { recursive: true, force: true });
                                console.log('[skills] startWatching: cleaned up tombstone "%s"', entry);
                            }
                            catch { /* will retry next time */ }
                        }
                    }
                }
                catch { /* ignore scan errors */ }
            }
        }
        // Root-level watch: only react to directory additions/removals (new/deleted skills).
        const rootWatchHandler = (_event, filename) => {
            if (!filename) {
                this.scheduleNotify();
                return;
            }
            // Ignore hidden files/dirs and known non-skill files
            if (filename.startsWith('.'))
                return;
            // Accept directory changes (new skill added/removed) and config file
            if (filename === SKILLS_CONFIG_FILE) {
                this.scheduleNotify();
                return;
            }
            // For other filenames, check if it looks like a skill directory entry
            // (no extension = likely a directory name)
            if (!path_1.default.extname(filename)) {
                this.scheduleNotify();
            }
        };
        // Skill-directory-level watch: only react to skill definition file changes.
        const skillDirWatchHandler = (_event, filename) => {
            if (!filename) {
                this.scheduleNotify();
                return;
            }
            if (filename === SKILL_FILE_NAME || filename === SKILLS_CONFIG_FILE) {
                this.scheduleNotify();
            }
            // Ignore cache files, data files, and any other non-definition files.
        };
        roots.forEach(root => {
            if (!fs_1.default.existsSync(root))
                return;
            try {
                this.watchers.push(fs_1.default.watch(root, rootWatchHandler));
            }
            catch (error) {
                console.warn('[skills] Failed to watch skills root:', root, error);
            }
            const skillDirs = listSkillDirs(root);
            skillDirs.forEach(dir => {
                try {
                    this.watchers.push(fs_1.default.watch(dir, skillDirWatchHandler));
                }
                catch (error) {
                    console.warn('[skills] Failed to watch skill directory:', dir, error);
                }
            });
        });
    }
    stopWatching() {
        this.watchers.forEach(watcher => watcher.close());
        this.watchers = [];
        if (this.notifyTimer) {
            clearTimeout(this.notifyTimer);
            this.notifyTimer = null;
        }
    }
    handleWorkingDirectoryChange() {
        this.startWatching();
        this.notifySkillsChanged();
    }
    scheduleNotify() {
        if (this.notifyTimer) {
            clearTimeout(this.notifyTimer);
        }
        this.notifyTimer = setTimeout(() => {
            this.notifyTimer = null;
            this.startWatching();
            this.notifySkillsChanged();
        }, WATCH_DEBOUNCE_MS);
    }
    notifySkillsChanged() {
        electron_1.BrowserWindow.getAllWindows().forEach(win => {
            if (!win.isDestroyed()) {
                win.webContents.send('skills:changed');
            }
        });
        // Notify external listeners (e.g. OpenClaw AGENTS.md sync)
        for (const listener of this.changeListeners) {
            try {
                listener();
            }
            catch (error) {
                console.warn('[skills] onSkillsChanged listener error:', error);
            }
        }
    }
    onSkillsChanged(listener) {
        this.changeListeners.push(listener);
        return () => {
            this.changeListeners = this.changeListeners.filter(l => l !== listener);
        };
    }
    parseSkillDir(dir, state, defaults, isBuiltIn) {
        const skillFile = path_1.default.join(dir, SKILL_FILE_NAME);
        if (!fs_1.default.existsSync(skillFile))
            return null;
        try {
            const raw = fs_1.default.readFileSync(skillFile, 'utf8');
            const { frontmatter, content } = parseFrontmatter(raw);
            const name = (String(frontmatter.name || '') || path_1.default.basename(dir)).trim() || path_1.default.basename(dir);
            const description = (String(frontmatter.description || '') || extractDescription(content) || name).trim();
            const isOfficial = isTruthy(frontmatter.official) || isTruthy(frontmatter.isOfficial);
            const meta = frontmatter.metadata;
            const v = frontmatter.version ?? meta?.version;
            const version = typeof v === 'string' ? v : typeof v === 'number' ? String(v) : undefined;
            const updatedAt = fs_1.default.statSync(skillFile).mtimeMs;
            const id = path_1.default.basename(dir);
            const prompt = content.trim();
            const defaultEnabled = defaults[id]?.enabled ?? true;
            const enabled = state[id]?.enabled ?? defaultEnabled;
            return { id, name, description, enabled, isOfficial, isBuiltIn, updatedAt, prompt, skillPath: skillFile, version };
        }
        catch (error) {
            console.warn('[skills] Failed to parse skill:', dir, error);
            return null;
        }
    }
    listBuiltInSkillIds() {
        const builtInRoot = this.getBundledSkillsRoot();
        if (!builtInRoot || !fs_1.default.existsSync(builtInRoot)) {
            return new Set();
        }
        try {
            const configPath = path_1.default.join(builtInRoot, SKILLS_CONFIG_FILE);
            if (fs_1.default.existsSync(configPath)) {
                const parsed = JSON.parse(fs_1.default.readFileSync(configPath, 'utf8'));
                if (parsed?.defaults && typeof parsed.defaults === 'object') {
                    return new Set(Object.keys(parsed.defaults));
                }
            }
        }
        catch (error) {
            console.warn('[skills] Failed to parse skills.config.json for built-in skill list:', error);
        }
        return new Set(listSkillDirs(builtInRoot).map(dir => path_1.default.basename(dir)));
    }
    isBuiltInSkillId(id) {
        return this.listBuiltInSkillIds().has(id) || this.pluginSkillIds.has(id);
    }
    loadSkillStateMap() {
        const store = this.getStore();
        const raw = store.get(SKILL_STATE_KEY);
        if (Array.isArray(raw)) {
            const migrated = {};
            raw.forEach(skill => {
                migrated[skill.id] = { enabled: skill.enabled };
            });
            store.set(SKILL_STATE_KEY, migrated);
            return migrated;
        }
        return raw ?? {};
    }
    saveSkillStateMap(map) {
        this.getStore().set(SKILL_STATE_KEY, map);
    }
    loadSkillsDefaults(roots) {
        const merged = {};
        // Load from roots in reverse order so higher priority roots override lower ones
        // roots[0] is user directory (highest priority), roots[1] is app-bundled (lower priority)
        const reversedRoots = [...roots].reverse();
        for (const root of reversedRoots) {
            const configPath = path_1.default.join(root, SKILLS_CONFIG_FILE);
            if (!fs_1.default.existsSync(configPath))
                continue;
            try {
                const raw = fs_1.default.readFileSync(configPath, 'utf8');
                const config = JSON.parse(raw);
                if (config.defaults && typeof config.defaults === 'object') {
                    for (const [id, settings] of Object.entries(config.defaults)) {
                        merged[id] = { ...merged[id], ...settings };
                    }
                }
            }
            catch (error) {
                console.warn('[skills] Failed to load skills config:', configPath, error);
            }
        }
        return merged;
    }
    getSkillRoots(primaryRoot) {
        const resolvedPrimary = primaryRoot ?? this.getSkillsRoot();
        const roots = [resolvedPrimary];
        const appRoot = this.getBundledSkillsRoot();
        if (appRoot !== resolvedPrimary && fs_1.default.existsSync(appRoot)) {
            roots.push(appRoot);
        }
        return roots;
    }
    getBundledSkillsRoot() {
        if (electron_1.app.isPackaged) {
            // In production, bundled SKILLs should be in Resources/SKILLs.
            const resourcesRoot = path_1.default.resolve(process.resourcesPath, SKILLS_DIR_NAME);
            if (fs_1.default.existsSync(resourcesRoot)) {
                return resourcesRoot;
            }
            // Fallback for older packages where SKILLs are inside app.asar.
            return path_1.default.resolve(electron_1.app.getAppPath(), SKILLS_DIR_NAME);
        }
        // In development, use the project root (parent of dist-electron).
        // __dirname is dist-electron/, so we need to go up one level to get to project root
        const projectRoot = path_1.default.resolve(__dirname, '..');
        return path_1.default.resolve(projectRoot, SKILLS_DIR_NAME);
    }
    getSkillConfig(skillId) {
        try {
            const skillDir = this.resolveSkillDir(skillId);
            const envPath = path_1.default.join(skillDir, '.env');
            if (!fs_1.default.existsSync(envPath)) {
                return { success: true, config: {} };
            }
            const raw = fs_1.default.readFileSync(envPath, 'utf8');
            const config = {};
            for (const line of raw.split(/\r?\n/)) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith('#'))
                    continue;
                const eqIdx = trimmed.indexOf('=');
                if (eqIdx < 0)
                    continue;
                const key = trimmed.slice(0, eqIdx).trim();
                let value = trimmed.slice(eqIdx + 1).trim();
                // Strip surrounding quotes added by setSkillConfig / manual edits.
                // Double-quoted values may contain escape sequences (\", \\) that need reversal.
                // Single-quoted values are taken literally (no escape processing), matching dotenv behavior.
                if (value.startsWith('"') && value.endsWith('"')) {
                    value = value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
                }
                else if (value.startsWith("'") && value.endsWith("'")) {
                    value = value.slice(1, -1);
                }
                config[key] = value;
            }
            return { success: true, config };
        }
        catch (error) {
            return { success: false, error: error instanceof Error ? error.message : 'Failed to read skill config' };
        }
    }
    getEmailAccountsConfig(skillId) {
        try {
            const skillDir = this.resolveSkillDir(skillId);
            const accountsPath = path_1.default.join(skillDir, 'accounts.json');
            if (fs_1.default.existsSync(accountsPath)) {
                const parsed = JSON.parse(fs_1.default.readFileSync(accountsPath, 'utf8'));
                const config = this.normalizeEmailAccountsConfig(parsed);
                console.debug('[skills] Loaded email accounts config', {
                    skillId,
                    source: 'accounts.json',
                    accountCount: config.accounts.length,
                    enabledAccountCount: config.accounts.filter(account => account.enabled).length,
                    defaultAccountId: config.defaultAccountId,
                });
                return { success: true, config };
            }
            const legacy = this.getSkillConfig(skillId);
            if (!legacy.success) {
                return { success: false, error: legacy.error };
            }
            const config = this.migrateLegacyEmailConfig(legacy.config ?? {});
            console.debug('[skills] Loaded email accounts config', {
                skillId,
                source: '.env',
                accountCount: config.accounts.length,
                enabledAccountCount: config.accounts.filter(account => account.enabled).length,
                defaultAccountId: config.defaultAccountId,
            });
            return { success: true, config };
        }
        catch (error) {
            console.warn('[skills] Failed to read email accounts config', {
                skillId,
                error: error instanceof Error ? error.message : String(error),
            });
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to read email accounts config',
            };
        }
    }
    setEmailAccountsConfig(skillId, config) {
        try {
            const skillDir = this.resolveSkillDir(skillId);
            const normalized = this.normalizeEmailAccountsConfig(config);
            const accountsPath = path_1.default.join(skillDir, 'accounts.json');
            fs_1.default.writeFileSync(accountsPath, JSON.stringify(normalized, null, 2) + '\n', 'utf8');
            console.log('[skills] Saved email accounts config', {
                skillId,
                accountCount: normalized.accounts.length,
                enabledAccountCount: normalized.accounts.filter(account => account.enabled).length,
                defaultAccountId: normalized.defaultAccountId,
            });
            return { success: true };
        }
        catch (error) {
            console.warn('[skills] Failed to write email accounts config', {
                skillId,
                error: error instanceof Error ? error.message : String(error),
            });
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to write email accounts config',
            };
        }
    }
    async testEmailAccountConnectivity(skillId, account) {
        return this.testEmailConnectivity(skillId, {
            ...this.buildLegacyEnvFromEmailAccount(account),
            EMAIL_CONFIG_MODE: 'env',
        });
    }
    normalizeEmailAccountsConfig(config) {
        const usedIds = new Set();
        const accounts = Array.isArray(config.accounts)
            ? config.accounts.map((account, index) => {
                const normalized = this.normalizeEmailAccount(account, index);
                const baseId = normalized.id;
                let id = baseId;
                let suffix = 2;
                while (usedIds.has(id)) {
                    id = `${baseId}-${suffix}`;
                    suffix += 1;
                }
                usedIds.add(id);
                return { ...normalized, id };
            })
            : [];
        const enabledDefault = accounts.find(account => account.id === config.defaultAccountId && account.enabled);
        const fallbackDefault = accounts.find(account => account.enabled) ?? accounts[0];
        return {
            version: 1,
            defaultAccountId: enabledDefault?.id ?? fallbackDefault?.id ?? '',
            accounts,
        };
    }
    normalizeEmailAccount(account, index) {
        const email = (account.email ?? '').trim();
        const id = this.slugifyEmailAccountId(account.id || email, `account-${index + 1}`);
        return {
            id,
            name: (account.name ?? (email ? email.split('@')[0] : id)).trim() || id,
            enabled: account.enabled !== false,
            provider: account.provider ?? '',
            email,
            password: account.password ?? '',
            imapHost: account.imapHost ?? '',
            imapPort: this.normalizePort(account.imapPort, 993),
            imapTls: account.imapTls ?? true,
            imapRejectUnauthorized: account.imapRejectUnauthorized ?? true,
            smtpHost: account.smtpHost ?? '',
            smtpPort: this.normalizePort(account.smtpPort, 587),
            smtpSecure: account.smtpSecure ?? false,
            smtpRejectUnauthorized: account.smtpRejectUnauthorized ?? true,
            smtpFrom: account.smtpFrom ?? email,
            mailbox: account.mailbox ?? 'INBOX',
            requireSendConfirmation: account.requireSendConfirmation ?? true,
        };
    }
    migrateLegacyEmailConfig(config) {
        const email = (config.IMAP_USER || config.SMTP_USER || config.SMTP_FROM || '').trim();
        if (!email && !config.IMAP_HOST && !config.SMTP_HOST) {
            return { version: 1, defaultAccountId: '', accounts: [] };
        }
        const account = this.normalizeEmailAccount({
            id: 'default',
            name: email ? email.split('@')[0] : 'Default',
            enabled: Boolean(email && (config.IMAP_PASS || config.SMTP_PASS)),
            provider: '',
            email,
            password: config.IMAP_PASS || config.SMTP_PASS || '',
            imapHost: config.IMAP_HOST || '',
            imapPort: this.normalizePort(config.IMAP_PORT, 993),
            imapTls: config.IMAP_TLS !== 'false',
            imapRejectUnauthorized: config.IMAP_REJECT_UNAUTHORIZED !== 'false',
            smtpHost: config.SMTP_HOST || '',
            smtpPort: this.normalizePort(config.SMTP_PORT, 587),
            smtpSecure: config.SMTP_SECURE === 'true',
            smtpRejectUnauthorized: config.SMTP_REJECT_UNAUTHORIZED !== 'false',
            smtpFrom: config.SMTP_FROM || config.SMTP_USER || email,
            mailbox: config.IMAP_MAILBOX || 'INBOX',
            requireSendConfirmation: config.EMAIL_REQUIRE_SEND_CONFIRMATION !== 'false',
        }, 0);
        return { version: 1, defaultAccountId: account.enabled ? account.id : '', accounts: [account] };
    }
    buildLegacyEnvFromEmailAccount(account) {
        return {
            IMAP_HOST: account.imapHost ?? '',
            IMAP_PORT: String(account.imapPort ?? 993),
            IMAP_USER: account.email,
            IMAP_PASS: account.password ?? '',
            IMAP_TLS: String(account.imapTls ?? true),
            IMAP_REJECT_UNAUTHORIZED: String(account.imapRejectUnauthorized ?? true),
            IMAP_MAILBOX: account.mailbox || 'INBOX',
            SMTP_HOST: account.smtpHost ?? '',
            SMTP_PORT: String(account.smtpPort ?? 587),
            SMTP_SECURE: String(account.smtpSecure ?? false),
            SMTP_USER: account.email,
            SMTP_PASS: account.password ?? '',
            SMTP_FROM: account.smtpFrom || account.email,
            SMTP_REJECT_UNAUTHORIZED: String(account.smtpRejectUnauthorized ?? true),
            EMAIL_REQUIRE_SEND_CONFIRMATION: String(account.requireSendConfirmation ?? true),
        };
    }
    normalizePort(value, fallback) {
        const parsed = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
    }
    slugifyEmailAccountId(value, fallback) {
        const normalized = (value ?? '')
            .trim()
            .toLowerCase()
            .replace(/@.+$/, '')
            .replace(/[^a-z0-9_-]+/g, '-')
            .replace(/^-+|-+$/g, '');
        return normalized || fallback;
    }
    setSkillConfig(skillId, config) {
        try {
            const skillDir = this.resolveSkillDir(skillId);
            const envPath = path_1.default.join(skillDir, '.env');
            const lines = Object.entries(config)
                .filter(([key]) => key.trim())
                .map(([key, value]) => {
                // Wrap value in double quotes if it contains characters that dotenv
                // would misinterpret (e.g. # treated as inline comment, or spaces)
                if (value.includes('#') || value.includes(' ') || value.includes('"') || value.includes("'")) {
                    // Escape any existing double quotes inside the value
                    const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
                    return `${key}="${escaped}"`;
                }
                return `${key}=${value}`;
            });
            fs_1.default.writeFileSync(envPath, lines.join('\n') + '\n', 'utf8');
            return { success: true };
        }
        catch (error) {
            return { success: false, error: error instanceof Error ? error.message : 'Failed to write skill config' };
        }
    }
    repairSkillFromBundled(skillId, skillPath) {
        if (!electron_1.app.isPackaged)
            return false;
        const bundledRoot = this.getBundledSkillsRoot();
        if (!bundledRoot || !fs_1.default.existsSync(bundledRoot)) {
            return false;
        }
        const bundledPath = path_1.default.join(bundledRoot, skillId);
        if (!fs_1.default.existsSync(bundledPath) || bundledPath === skillPath) {
            return false;
        }
        // Check if bundled version has node_modules
        const bundledNodeModules = path_1.default.join(bundledPath, 'node_modules');
        if (!fs_1.default.existsSync(bundledNodeModules)) {
            console.log(`[skills] Bundled ${skillId} does not have node_modules, skipping repair`);
            return false;
        }
        try {
            console.log(`[skills] Repairing ${skillId} from bundled resources...`);
            fs_1.default.cpSync(bundledPath, skillPath, {
                recursive: true,
                dereference: true,
                force: true,
                errorOnExist: false,
            });
            console.log(`[skills] Repaired ${skillId} from bundled resources`);
            return true;
        }
        catch (error) {
            console.warn(`[skills] Failed to repair ${skillId} from bundled resources:`, error);
            return false;
        }
    }
    ensureSkillDependencies(skillDir) {
        const nodeModulesPath = path_1.default.join(skillDir, 'node_modules');
        const packageJsonPath = path_1.default.join(skillDir, 'package.json');
        const skillId = path_1.default.basename(skillDir);
        console.log(`[skills] Checking dependencies for ${skillId}...`);
        console.log(`[skills]   node_modules exists: ${fs_1.default.existsSync(nodeModulesPath)}`);
        console.log(`[skills]   package.json exists: ${fs_1.default.existsSync(packageJsonPath)}`);
        console.log(`[skills]   skillDir: ${skillDir}`);
        // If node_modules exists, assume dependencies are installed
        if (fs_1.default.existsSync(nodeModulesPath)) {
            console.log(`[skills] Dependencies already installed for ${skillId}`);
            return { success: true };
        }
        // If no package.json, nothing to install
        if (!fs_1.default.existsSync(packageJsonPath)) {
            console.log(`[skills] No package.json found for ${skillId}, skipping install`);
            return { success: true };
        }
        // Try to repair from bundled resources first (works without npm)
        if (this.repairSkillFromBundled(skillId, skillDir)) {
            if (fs_1.default.existsSync(nodeModulesPath)) {
                console.log(`[skills] Dependencies restored from bundled resources for ${skillId}`);
                return { success: true };
            }
        }
        // Build environment with user's shell PATH (crucial for packaged apps)
        const env = buildSkillEnv();
        const pathKeys = Object.keys(env).filter(k => k.toLowerCase() === 'path');
        console.log(`[skills]   PATH keys in env: ${JSON.stringify(pathKeys)}`);
        console.log(`[skills]   PATH (first 300 chars): ${env.PATH?.substring(0, 300)}`);
        // Check if npm is available
        const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
        if (!hasCommand(npmCommand, env) && !hasCommand('npm', env)) {
            const errorMsg = 'npm is not available and skill cannot be repaired from bundled resources. Please install Node.js from https://nodejs.org/';
            console.error(`[skills] ${errorMsg}`);
            return { success: false, error: errorMsg };
        }
        console.log(`[skills] npm is available`);
        // Try to install dependencies
        console.log(`[skills] Installing dependencies for ${skillId}...`);
        console.log(`[skills]   Working directory: ${skillDir}`);
        try {
            // On Windows, use shell: true so cmd.exe resolves npm.cmd correctly
            const isWin = process.platform === 'win32';
            const result = (0, child_process_1.spawnSync)('npm', ['install'], {
                cwd: skillDir,
                encoding: 'utf-8',
                stdio: 'pipe',
                timeout: 120000, // 2 minute timeout
                env,
                shell: isWin,
            });
            console.log(`[skills] npm install exit code: ${result.status}`);
            if (result.stdout) {
                console.log(`[skills] npm install stdout: ${result.stdout.substring(0, 500)}`);
            }
            if (result.stderr) {
                console.log(`[skills] npm install stderr: ${result.stderr.substring(0, 500)}`);
            }
            if (result.status !== 0) {
                const errorMsg = result.stderr || result.stdout || 'npm install failed';
                console.error(`[skills] Failed to install dependencies for ${skillId}:`, errorMsg);
                return { success: false, error: `Failed to install dependencies: ${errorMsg}` };
            }
            // Verify node_modules was created
            if (!fs_1.default.existsSync(nodeModulesPath)) {
                const errorMsg = 'npm install appeared to succeed but node_modules was not created';
                console.error(`[skills] ${errorMsg}`);
                return { success: false, error: errorMsg };
            }
            console.log(`[skills] Dependencies installed successfully for ${skillId}`);
            return { success: true };
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.error(`[skills] Error installing dependencies for ${skillId}:`, errorMsg);
            return { success: false, error: `Failed to install dependencies: ${errorMsg}` };
        }
    }
    async testEmailConnectivity(skillId, config) {
        try {
            const skillDir = this.resolveSkillDir(skillId);
            // Ensure dependencies are installed before running scripts
            const depsResult = this.ensureSkillDependencies(skillDir);
            if (!depsResult.success) {
                console.error('[email-connectivity] Dependency install failed:', depsResult.error);
                return { success: false, error: depsResult.error };
            }
            const imapScript = path_1.default.join(skillDir, 'scripts', 'imap.js');
            const smtpScript = path_1.default.join(skillDir, 'scripts', 'smtp.js');
            if (!fs_1.default.existsSync(imapScript) || !fs_1.default.existsSync(smtpScript)) {
                console.error('[email-connectivity] Scripts not found:', { imapScript, smtpScript });
                return { success: false, error: 'Email connectivity scripts not found' };
            }
            const safeConfig = buildSafeEmailConnectivityConfigForLog(config);
            console.log('[email-connectivity] Testing with config:', JSON.stringify(safeConfig, null, 2));
            const envOverrides = Object.fromEntries(Object.entries(config ?? {})
                .filter(([key]) => key.trim())
                .map(([key, value]) => [key, String(value ?? '')]));
            console.log('[email-connectivity] Running IMAP test (list-mailboxes)...');
            const imapResult = await this.runSkillScriptWithEnv(skillDir, imapScript, ['list-mailboxes'], envOverrides, 20000);
            console.log('[email-connectivity] IMAP result:', JSON.stringify({
                success: imapResult.success,
                exitCode: imapResult.exitCode,
                timedOut: imapResult.timedOut,
                durationMs: imapResult.durationMs,
                stdout: imapResult.stdout?.slice(0, 500),
                stderr: imapResult.stderr?.slice(0, 500),
                error: imapResult.error,
                spawnErrorCode: imapResult.spawnErrorCode,
            }, null, 2));
            console.log('[email-connectivity] Running SMTP test (verify)...');
            const smtpResult = await this.runSkillScriptWithEnv(skillDir, smtpScript, ['verify'], envOverrides, 20000);
            console.log('[email-connectivity] SMTP result:', JSON.stringify({
                success: smtpResult.success,
                exitCode: smtpResult.exitCode,
                timedOut: smtpResult.timedOut,
                durationMs: smtpResult.durationMs,
                stdout: smtpResult.stdout?.slice(0, 500),
                stderr: smtpResult.stderr?.slice(0, 500),
                error: smtpResult.error,
                spawnErrorCode: smtpResult.spawnErrorCode,
            }, null, 2));
            const checks = [
                this.buildEmailConnectivityCheck('imap_connection', imapResult),
                this.buildEmailConnectivityCheck('smtp_connection', smtpResult),
            ];
            const verdict = checks.every(check => check.level === 'pass') ? 'pass' : 'fail';
            console.log('[email-connectivity] Final verdict:', verdict, 'checks:', JSON.stringify(checks, null, 2));
            return {
                success: true,
                result: {
                    testedAt: Date.now(),
                    verdict,
                    checks,
                },
            };
        }
        catch (error) {
            console.error('[email-connectivity] Unexpected error:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to test email connectivity',
            };
        }
    }
    resolveSkillDir(skillId) {
        const skills = this.listSkills();
        const skill = skills.find(s => s.id === skillId);
        if (!skill) {
            throw new Error('Skill not found');
        }
        return path_1.default.dirname(skill.skillPath);
    }
    getScriptRuntimeCandidates(env) {
        return getSkillScriptRuntimeCandidates(env);
    }
    async runSkillScriptWithEnv(skillDir, scriptPath, scriptArgs, envOverrides, timeoutMs) {
        let lastResult = null;
        // Build base environment with user's shell PATH
        const baseEnv = buildSkillEnv();
        for (const runtime of this.getScriptRuntimeCandidates(baseEnv)) {
            const env = {
                ...baseEnv,
                ...runtime.extraEnv,
                ...envOverrides,
            };
            const result = await runScriptWithTimeout({
                command: runtime.command,
                args: [...runtime.args, scriptPath, ...scriptArgs],
                cwd: skillDir,
                env,
                timeoutMs,
            });
            lastResult = result;
            if (result.spawnErrorCode === 'ENOENT') {
                continue;
            }
            return result;
        }
        return lastResult ?? {
            success: false,
            exitCode: null,
            stdout: '',
            stderr: '',
            durationMs: 0,
            timedOut: false,
            error: 'Failed to run skill script',
        };
    }
    parseScriptMessage(stdout) {
        if (!stdout) {
            return null;
        }
        try {
            const parsed = JSON.parse(stdout);
            if (parsed && typeof parsed === 'object' && typeof parsed.message === 'string' && parsed.message.trim()) {
                return parsed.message.trim();
            }
            return null;
        }
        catch {
            return null;
        }
    }
    getLastOutputLine(text) {
        return text
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(Boolean)
            .slice(-1)[0] || '';
    }
    buildEmailConnectivityCheck(code, result) {
        const label = code === 'imap_connection' ? 'IMAP' : 'SMTP';
        if (result.success) {
            const parsedMessage = this.parseScriptMessage(result.stdout);
            return {
                code,
                level: 'pass',
                message: parsedMessage || `${label} connection successful`,
                durationMs: result.durationMs,
            };
        }
        const message = result.timedOut
            ? `${label} connectivity check timed out`
            : result.error
                || this.getLastOutputLine(result.stderr)
                || `${label} connection failed`;
        return {
            code,
            level: 'fail',
            message,
            durationMs: result.durationMs,
        };
    }
    normalizeGitSource(source) {
        const githubTreeOrBlob = parseGithubTreeOrBlobUrl(source);
        if (githubTreeOrBlob) {
            return githubTreeOrBlob;
        }
        if (/^[\w.-]+\/[\w.-]+$/.test(source)) {
            return {
                repoUrl: `https://github.com/${source}.git`,
            };
        }
        if (source.startsWith('http://') || source.startsWith('https://') || source.startsWith('git@')) {
            return {
                repoUrl: source,
            };
        }
        if (source.endsWith('.git')) {
            return {
                repoUrl: source,
            };
        }
        return null;
    }
}
exports.SkillManager = SkillManager;
exports.__skillManagerTestUtils = {
    parseFrontmatter,
    isTruthy,
    extractDescription,
    parseClawhubUrl,
    isWindowsDeletePermissionError,
    getSkillScriptRuntimeCandidates,
};
//# sourceMappingURL=skillManager.js.map