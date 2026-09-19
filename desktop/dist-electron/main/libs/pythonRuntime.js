"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBundledPythonRoot = getBundledPythonRoot;
exports.getUserPythonRoot = getUserPythonRoot;
exports.appendPythonRuntimeToEnv = appendPythonRuntimeToEnv;
exports.ensurePythonRuntimeReady = ensurePythonRuntimeReady;
const electron_1 = require("electron");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const fsCompat_1 = require("../fsCompat");
const pythonPipShim_1 = require("./pythonPipShim");
const PYTHON_RUNTIME_DIR_NAME = 'python-win';
const PYTHON_RUNTIME_STATE_FILE = 'runtime.json';
const REQUIRED_FILES = [
    'python.exe',
    'python3.exe',
];
const PIP_EXECUTABLE_CANDIDATES = [
    path_1.default.join('Scripts', 'pip.exe'),
    path_1.default.join('Scripts', 'pip3.exe'),
    path_1.default.join('Scripts', 'pip.cmd'),
    path_1.default.join('Scripts', 'pip3.cmd'),
    path_1.default.join('Scripts', 'pip'),
    path_1.default.join('Scripts', 'pip3'),
];
const PIP_MODULE_MAIN_REL_PATH = path_1.default.join('Lib', 'site-packages', 'pip', '__main__.py');
const PIP_MODULE_INIT_REL_PATH = path_1.default.join('Lib', 'site-packages', 'pip', '__init__.py');
function hasPipExecutable(rootDir) {
    return PIP_EXECUTABLE_CANDIDATES.some((relPath) => fs_1.default.existsSync(path_1.default.join(rootDir, relPath)));
}
function hasPipSupport(rootDir) {
    const hasCommand = hasPipExecutable(rootDir);
    const hasModuleShim = fs_1.default.existsSync(path_1.default.join(rootDir, PIP_MODULE_MAIN_REL_PATH))
        || fs_1.default.existsSync(path_1.default.join(rootDir, PIP_MODULE_INIT_REL_PATH));
    return hasCommand && hasModuleShim;
}
function readEmbedPthFiles(rootDir) {
    try {
        return fs_1.default.readdirSync(rootDir).filter((name) => name.endsWith('._pth'));
    }
    catch {
        return [];
    }
}
function ensureEmbedSitePackages(rootDir) {
    const pthFiles = readEmbedPthFiles(rootDir);
    if (pthFiles.length === 0) {
        return;
    }
    const pthPath = path_1.default.join(rootDir, pthFiles[0]);
    const raw = fs_1.default.readFileSync(pthPath, 'utf8');
    const lines = raw.split(/\r?\n/);
    const updated = [];
    let hasSitePackages = false;
    let hasImportSite = false;
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed === 'import site' || trimmed === '#import site') {
            updated.push('import site');
            hasImportSite = true;
            continue;
        }
        if (trimmed.toLowerCase() === 'lib\\site-packages' || trimmed.toLowerCase() === 'lib/site-packages') {
            updated.push('Lib\\site-packages');
            hasSitePackages = true;
            continue;
        }
        updated.push(line);
    }
    if (!hasSitePackages) {
        updated.push('Lib\\site-packages');
    }
    if (!hasImportSite) {
        updated.push('import site');
    }
    const normalized = `${updated.join('\n').replace(/\n+$/g, '')}\n`;
    if (normalized !== raw) {
        fs_1.default.writeFileSync(pthPath, normalized, 'utf8');
    }
}
function appendWindowsPath(current, entries) {
    const delimiter = ';';
    const seen = new Set();
    const merged = [];
    const append = (value) => {
        const trimmed = value.trim();
        if (!trimmed)
            return;
        const normalized = trimmed.toLowerCase().replace(/[\\/]+$/, '');
        if (seen.has(normalized))
            return;
        seen.add(normalized);
        merged.push(trimmed);
    };
    entries.forEach(append);
    (current || '').split(delimiter).forEach(append);
    return merged.length > 0 ? merged.join(delimiter) : current;
}
function runtimeHealth(rootDir, options = {}) {
    const requireEmbedSiteConfig = options.requireEmbedSiteConfig !== false;
    const requirePip = options.requirePip === true;
    const missing = [];
    for (const relPath of REQUIRED_FILES) {
        const fullPath = path_1.default.join(rootDir, relPath);
        if (!fs_1.default.existsSync(fullPath)) {
            missing.push(relPath);
        }
    }
    const hasPip = hasPipSupport(rootDir);
    if (requirePip && !hasPip) {
        if (!hasPipExecutable(rootDir)) {
            missing.push('Scripts/pip.exe (or Scripts/pip3.exe/pip.cmd)');
        }
        if (!fs_1.default.existsSync(path_1.default.join(rootDir, PIP_MODULE_MAIN_REL_PATH))
            && !fs_1.default.existsSync(path_1.default.join(rootDir, PIP_MODULE_INIT_REL_PATH))) {
            missing.push(PIP_MODULE_MAIN_REL_PATH.replace(/\\/g, '/'));
        }
    }
    if (requireEmbedSiteConfig) {
        const pthFiles = readEmbedPthFiles(rootDir);
        if (pthFiles.length > 0) {
            const pthPath = path_1.default.join(rootDir, pthFiles[0]);
            try {
                const raw = fs_1.default.readFileSync(pthPath, 'utf8');
                const lines = raw.split(/\r?\n/).map((line) => line.trim().toLowerCase());
                const hasImportSite = lines.includes('import site');
                const hasSitePackages = lines.includes('lib\\site-packages') || lines.includes('lib/site-packages');
                if (!hasImportSite || !hasSitePackages) {
                    missing.push(`${pthFiles[0]} config (require "Lib\\site-packages" and "import site")`);
                }
            }
            catch {
                missing.push(`${pthFiles[0]} read failed`);
            }
        }
    }
    return {
        ok: missing.length === 0,
        missing,
    };
}
function computeRuntimeSignature(rootDir) {
    const parts = [];
    for (const relPath of REQUIRED_FILES) {
        const fullPath = path_1.default.join(rootDir, relPath);
        try {
            const stat = fs_1.default.statSync(fullPath);
            parts.push(`${relPath}:${stat.size}:${Math.floor(stat.mtimeMs)}`);
        }
        catch {
            parts.push(`${relPath}:missing`);
        }
    }
    return parts.join('|');
}
function ensureRuntimeStateFile(runtimeRoot, sourceRoot) {
    const statePath = path_1.default.join(runtimeRoot, PYTHON_RUNTIME_STATE_FILE);
    const payload = {
        syncedAt: Date.now(),
        sourceRoot,
        signature: computeRuntimeSignature(runtimeRoot),
    };
    fs_1.default.writeFileSync(statePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}
function resolveBundledCandidates() {
    if (electron_1.app.isPackaged) {
        return [
            path_1.default.join(process.resourcesPath, PYTHON_RUNTIME_DIR_NAME),
            path_1.default.join(electron_1.app.getAppPath(), PYTHON_RUNTIME_DIR_NAME),
        ];
    }
    const projectRoot = path_1.default.resolve(__dirname, '..', '..', '..');
    return [
        path_1.default.join(projectRoot, 'resources', PYTHON_RUNTIME_DIR_NAME),
        path_1.default.join(process.cwd(), 'resources', PYTHON_RUNTIME_DIR_NAME),
        path_1.default.join(electron_1.app.getAppPath(), 'resources', PYTHON_RUNTIME_DIR_NAME),
    ];
}
function getBundledPythonRoot() {
    const candidates = resolveBundledCandidates();
    for (const candidate of candidates) {
        if (fs_1.default.existsSync(candidate) && fs_1.default.statSync(candidate).isDirectory()) {
            return candidate;
        }
    }
    return null;
}
function getUserPythonRoot() {
    return path_1.default.join(electron_1.app.getPath('userData'), 'runtimes', PYTHON_RUNTIME_DIR_NAME);
}
function appendPythonRuntimeToEnv(env) {
    if (process.platform !== 'win32') {
        return env;
    }
    const userRoot = getUserPythonRoot();
    const bundledRoot = getBundledPythonRoot();
    const candidates = [userRoot, bundledRoot].filter((value) => Boolean(value));
    const pathEntries = [];
    for (const root of candidates) {
        if (!fs_1.default.existsSync(root))
            continue;
        pathEntries.push(root, path_1.default.join(root, 'Scripts'));
    }
    if (pathEntries.length > 0) {
        env.PATH = appendWindowsPath(env.PATH, pathEntries);
        env.LOBSTERAI_PYTHON_ROOT = pathEntries[0];
    }
    return env;
}
function convergeUserPipShims(userRoot) {
    try {
        const { changed } = (0, pythonPipShim_1.repairPipShims)(userRoot);
        if (changed.length > 0) {
            console.log(`[python-runtime] Converged pip shim files: ${changed.join(', ')}`);
        }
    }
    catch (error) {
        console.warn('[python-runtime] Failed to converge pip shim files:', error);
    }
}
async function ensurePythonRuntimeReady() {
    if (process.platform !== 'win32') {
        return { success: true };
    }
    try {
        const userRoot = getUserPythonRoot();
        if (fs_1.default.existsSync(userRoot)) {
            try {
                ensureEmbedSitePackages(userRoot);
            }
            catch (error) {
                console.warn('[python-runtime] Failed to normalize user runtime _pth:', error);
            }
            convergeUserPipShims(userRoot);
        }
        const userHealth = runtimeHealth(userRoot);
        if (userHealth.ok) {
            ensureRuntimeStateFile(userRoot, 'existing-user-runtime');
            if (!hasPipSupport(userRoot)) {
                console.warn('[python-runtime] User runtime is ready without full pip support; pip commands may fail.');
            }
            console.log('[python-runtime] User runtime already healthy');
            return { success: true };
        }
        const bundledRoot = getBundledPythonRoot();
        if (!bundledRoot) {
            const message = 'Bundled python runtime not found in application resources.';
            console.error(`[python-runtime] ${message}`);
            return { success: false, error: message };
        }
        const bundledHealth = runtimeHealth(bundledRoot, { requireEmbedSiteConfig: false });
        if (!bundledHealth.ok) {
            const message = `Bundled python runtime is unhealthy (missing: ${bundledHealth.missing.join(', ')})`;
            console.error(`[python-runtime] ${message}`);
            return { success: false, error: message };
        }
        console.log(`[python-runtime] Sync runtime to userData: ${userRoot}`);
        if (fs_1.default.existsSync(userRoot)) {
            fs_1.default.rmSync(userRoot, { recursive: true, force: true });
        }
        fs_1.default.mkdirSync(path_1.default.dirname(userRoot), { recursive: true });
        (0, fsCompat_1.cpRecursiveSync)(bundledRoot, userRoot, { force: true, dereference: true });
        ensureEmbedSitePackages(userRoot);
        convergeUserPipShims(userRoot);
        const syncedHealth = runtimeHealth(userRoot);
        if (!syncedHealth.ok) {
            const message = `Synced python runtime is unhealthy (missing: ${syncedHealth.missing.join(', ')})`;
            console.error(`[python-runtime] ${message}`);
            return { success: false, error: message };
        }
        ensureRuntimeStateFile(userRoot, bundledRoot);
        if (!hasPipSupport(userRoot)) {
            console.warn('[python-runtime] Synced runtime does not include full pip support; pip commands may fail.');
        }
        console.log('[python-runtime] Runtime sync complete');
        return { success: true };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[python-runtime] Failed to ensure runtime ready:', message);
        return { success: false, error: message };
    }
}
//# sourceMappingURL=pythonRuntime.js.map