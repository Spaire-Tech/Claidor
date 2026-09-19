"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ComputerUseHelperConfig = exports.ComputerUseRuntimeStatus = exports.ComputerUseRuntime = void 0;
exports.getComputerUseRuntimeBaseDir = getComputerUseRuntimeBaseDir;
exports.getComputerUseRuntimeRoot = getComputerUseRuntimeRoot;
exports.getComputerUseHelperStateHome = getComputerUseHelperStateHome;
exports.ensureComputerUseHelperStateHome = ensureComputerUseHelperStateHome;
exports.inspectComputerUseRuntime = inspectComputerUseRuntime;
exports.resolveInstalledComputerUseRuntimePaths = resolveInstalledComputerUseRuntimePaths;
exports.installComputerUseRuntime = installComputerUseRuntime;
exports.uninstallComputerUseRuntime = uninstallComputerUseRuntime;
const crypto_1 = __importDefault(require("crypto"));
const electron_1 = require("electron");
const extract_zip_1 = __importDefault(require("extract-zip"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const stream_1 = require("stream");
const promises_1 = require("stream/promises");
exports.ComputerUseRuntime = {
    Id: 'computer-use',
    Version: '1.0.7',
    Platform: 'win32',
    Arch: 'x64',
    ArchiveName: 'lobsterai-computer-use-runtime-win-x64-1.0.7.zip',
    DownloadUrl: 'https://ydhardwarebusiness.nosdn.127.net/806b908f1ba20905cc5c99495bccc69c.zip',
    Sha256: 'd43c15cd69e10f0fbffe62f6c5ec947b4e61c5df84efbce46b6f73e28c9de30e',
    SizeBytes: 540139,
};
exports.ComputerUseRuntimeStatus = {
    Unsupported: 'unsupported',
    NotInstalled: 'not_installed',
    Installed: 'installed',
    Invalid: 'invalid',
};
exports.ComputerUseHelperConfig = {
    AccentColor: '#339cff',
    Direction: 'ltr',
    Locale: 'zh-CN',
    EscToCancel: '按 Esc 取消',
    UsingComputer: 'Caisra 正在使用你的电脑',
};
const RUNTIME_PLATFORM_DIR = 'win-x64';
const RUNTIME_STATE_FILE = 'runtime.json';
function isFile(filePath) {
    try {
        return fs_1.default.statSync(filePath).isFile();
    }
    catch {
        return false;
    }
}
function isDirectory(filePath) {
    try {
        return fs_1.default.statSync(filePath).isDirectory();
    }
    catch {
        return false;
    }
}
function isSupportedPlatform() {
    return process.platform === exports.ComputerUseRuntime.Platform
        && process.arch === exports.ComputerUseRuntime.Arch;
}
function getComputerUseRuntimeBaseDir() {
    return path_1.default.join(electron_1.app.getPath('userData'), 'runtimes', exports.ComputerUseRuntime.Id);
}
function getComputerUseRuntimeRoot() {
    return path_1.default.join(getComputerUseRuntimeBaseDir(), RUNTIME_PLATFORM_DIR, exports.ComputerUseRuntime.Version);
}
function getComputerUseHelperStateHome() {
    return path_1.default.join(electron_1.app.getPath('userData'), 'computer-use-helper');
}
function ensureComputerUseHelperStateHome() {
    const stateHome = getComputerUseHelperStateHome();
    const configDir = path_1.default.join(stateHome, 'computer-use');
    const configPath = path_1.default.join(configDir, 'config.json');
    const config = {
        accentColor: exports.ComputerUseHelperConfig.AccentColor,
        direction: exports.ComputerUseHelperConfig.Direction,
        locale: exports.ComputerUseHelperConfig.Locale,
        strings: {
            escToCancel: exports.ComputerUseHelperConfig.EscToCancel,
            usingComputer: exports.ComputerUseHelperConfig.UsingComputer,
        },
    };
    const content = `${JSON.stringify(config, null, 2)}\n`;
    fs_1.default.mkdirSync(configDir, { recursive: true });
    const existing = isFile(configPath) ? fs_1.default.readFileSync(configPath, 'utf8') : '';
    if (existing !== content) {
        fs_1.default.writeFileSync(configPath, content, 'utf8');
    }
    return stateHome;
}
function readRuntimeManifest(rootDir) {
    const manifestPath = path_1.default.join(rootDir, RUNTIME_STATE_FILE);
    if (!isFile(manifestPath)) {
        return null;
    }
    try {
        const content = fs_1.default.readFileSync(manifestPath, 'utf8').replace(/^\uFEFF/, '');
        return JSON.parse(content);
    }
    catch {
        return null;
    }
}
function manifestMatches(manifest) {
    return manifest?.id === exports.ComputerUseRuntime.Id
        && manifest.version === exports.ComputerUseRuntime.Version
        && manifest.platform === exports.ComputerUseRuntime.Platform
        && manifest.arch === exports.ComputerUseRuntime.Arch;
}
function readManifestRelativePath(manifest, key) {
    const value = manifest?.[key];
    if (typeof value !== 'string') {
        return null;
    }
    const normalized = value.trim().replace(/\\/g, '/');
    if (!normalized || path_1.default.isAbsolute(normalized)) {
        return null;
    }
    const parts = normalized.split('/').filter(Boolean);
    if (parts.length === 0 || parts.some(part => part === '.' || part === '..')) {
        return null;
    }
    return path_1.default.join(...parts);
}
function inspectComputerUseRuntime(rootDir = getComputerUseRuntimeRoot()) {
    if (!isSupportedPlatform()) {
        return {
            missing: [],
            paths: null,
            status: exports.ComputerUseRuntimeStatus.Unsupported,
        };
    }
    if (!isDirectory(rootDir)) {
        return {
            missing: [rootDir],
            paths: null,
            status: exports.ComputerUseRuntimeStatus.NotInstalled,
        };
    }
    const missing = [];
    const manifest = readRuntimeManifest(rootDir);
    if (!manifestMatches(manifest)) {
        missing.push(RUNTIME_STATE_FILE);
    }
    const runtimePackageRootRelativePath = readManifestRelativePath(manifest, 'runtimePackageRoot');
    const helperRelativePath = readManifestRelativePath(manifest, 'helper');
    const clientModuleRelativePath = readManifestRelativePath(manifest, 'clientModule');
    if (!runtimePackageRootRelativePath) {
        missing.push(`${RUNTIME_STATE_FILE}:runtimePackageRoot`);
    }
    if (!helperRelativePath) {
        missing.push(`${RUNTIME_STATE_FILE}:helper`);
    }
    if (!clientModuleRelativePath) {
        missing.push(`${RUNTIME_STATE_FILE}:clientModule`);
    }
    const runtimePackageRoot = runtimePackageRootRelativePath
        ? path_1.default.join(rootDir, runtimePackageRootRelativePath)
        : '';
    const helperExePath = helperRelativePath ? path_1.default.join(rootDir, helperRelativePath) : '';
    const clientModulePath = clientModuleRelativePath
        ? path_1.default.join(rootDir, clientModuleRelativePath)
        : '';
    if (runtimePackageRootRelativePath && !isDirectory(runtimePackageRoot)) {
        missing.push(runtimePackageRootRelativePath);
    }
    if (helperRelativePath && !isFile(helperExePath)) {
        missing.push(helperRelativePath);
    }
    if (clientModuleRelativePath && !isFile(clientModulePath)) {
        missing.push(clientModuleRelativePath);
    }
    if (missing.length > 0) {
        return {
            missing,
            paths: null,
            status: exports.ComputerUseRuntimeStatus.Invalid,
        };
    }
    return {
        missing: [],
        paths: { clientModulePath, helperExePath, rootDir, runtimePackageRoot },
        status: exports.ComputerUseRuntimeStatus.Installed,
    };
}
function resolveInstalledComputerUseRuntimePaths() {
    return inspectComputerUseRuntime().paths;
}
async function sha256File(filePath) {
    const hash = crypto_1.default.createHash('sha256');
    const stream = fs_1.default.createReadStream(filePath);
    for await (const chunk of stream) {
        hash.update(chunk);
    }
    return hash.digest('hex');
}
async function downloadRuntimeArchive(archivePath, onProgress) {
    const response = await electron_1.session.defaultSession.fetch(exports.ComputerUseRuntime.DownloadUrl);
    if (!response.ok) {
        throw new Error(`Computer Use runtime download failed with HTTP ${response.status}`);
    }
    if (!response.body) {
        throw new Error('Computer Use runtime download returned an empty body');
    }
    const totalHeader = response.headers.get('content-length');
    const total = totalHeader ? Number(totalHeader) : undefined;
    let received = 0;
    onProgress?.({ received, total, percent: total ? 0 : undefined });
    await fs_1.default.promises.mkdir(path_1.default.dirname(archivePath), { recursive: true });
    const nodeStream = stream_1.Readable.fromWeb(response.body);
    nodeStream.on('data', (chunk) => {
        received += chunk.length;
        onProgress?.({
            received,
            total: total && Number.isFinite(total) ? total : undefined,
            percent: total && Number.isFinite(total) ? received / total : undefined,
        });
    });
    await (0, promises_1.pipeline)(nodeStream, fs_1.default.createWriteStream(archivePath));
}
async function installComputerUseRuntime(onProgress) {
    if (!isSupportedPlatform()) {
        return { success: false, error: 'Computer Use runtime is only available on Windows x64.' };
    }
    const current = inspectComputerUseRuntime();
    if (current.paths) {
        return { success: true, paths: current.paths };
    }
    const baseDir = getComputerUseRuntimeBaseDir();
    const archivePath = path_1.default.join(baseDir, 'downloads', exports.ComputerUseRuntime.ArchiveName);
    const targetRoot = getComputerUseRuntimeRoot();
    const tempRoot = `${targetRoot}.tmp-${Date.now()}`;
    try {
        await downloadRuntimeArchive(archivePath, onProgress);
        const actualSha256 = await sha256File(archivePath);
        if (actualSha256 !== exports.ComputerUseRuntime.Sha256) {
            throw new Error('Computer Use runtime checksum verification failed');
        }
        await fs_1.default.promises.rm(tempRoot, { recursive: true, force: true });
        await fs_1.default.promises.mkdir(tempRoot, { recursive: true });
        await (0, extract_zip_1.default)(archivePath, { dir: tempRoot });
        const extracted = inspectComputerUseRuntime(tempRoot);
        if (!extracted.paths) {
            throw new Error(`Computer Use runtime archive is invalid: ${extracted.missing.join(', ')}`);
        }
        await fs_1.default.promises.rm(targetRoot, { recursive: true, force: true });
        await fs_1.default.promises.mkdir(path_1.default.dirname(targetRoot), { recursive: true });
        await fs_1.default.promises.rename(tempRoot, targetRoot);
        const installed = inspectComputerUseRuntime(targetRoot);
        if (!installed.paths) {
            throw new Error(`Computer Use runtime install is invalid: ${installed.missing.join(', ')}`);
        }
        console.log('[ComputerUseRuntime] runtime installed successfully');
        return { success: true, paths: installed.paths };
    }
    catch (error) {
        await fs_1.default.promises.rm(tempRoot, { recursive: true, force: true }).catch(() => { });
        const message = error instanceof Error ? error.message : String(error);
        console.error('[ComputerUseRuntime] runtime installation failed:', error);
        return { success: false, error: message };
    }
}
async function uninstallComputerUseRuntime() {
    const targetRoot = getComputerUseRuntimeRoot();
    const archivePath = path_1.default.join(getComputerUseRuntimeBaseDir(), 'downloads', exports.ComputerUseRuntime.ArchiveName);
    await fs_1.default.promises.rm(targetRoot, { recursive: true, force: true });
    await fs_1.default.promises.rm(archivePath, { force: true }).catch(() => { });
}
//# sourceMappingURL=computerUseRuntime.js.map