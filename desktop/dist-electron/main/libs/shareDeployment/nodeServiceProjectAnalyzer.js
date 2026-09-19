"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NODE_SERVICE_DEPLOYMENT_LIMITS = void 0;
exports.collectNodeServiceDeploymentPackageEntries = collectNodeServiceDeploymentPackageEntries;
exports.collectStaticSiteDeploymentPackageEntries = collectStaticSiteDeploymentPackageEntries;
exports.buildNodeServiceProjectPackagePlan = buildNodeServiceProjectPackagePlan;
exports.analyzeNodeServiceProjectDirectory = analyzeNodeServiceProjectDirectory;
exports.detectNodeServiceProjectCandidates = detectNodeServiceProjectCandidates;
const child_process_1 = require("child_process");
const fs_1 = __importDefault(require("fs"));
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const util_1 = require("util");
const constants_1 = require("../../../shared/shareDeployment/constants");
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
exports.NODE_SERVICE_DEPLOYMENT_LIMITS = {
    MaxFiles: 50000,
    MaxSourceTotalBytes: 100 * 1024 * 1024,
    MaxDeploymentTotalBytes: 500 * 1024 * 1024,
    MaxArchiveBytes: 100 * 1024 * 1024,
    CommandTimeoutMs: 10 * 60 * 1000,
};
const PACKAGE_JSON_FILE_NAME = 'package.json';
const STATIC_SITE_ENTRY_FILE = 'index.html';
const DEFAULT_PERSISTENCE_QUOTA_BYTES = 100 * 1024 * 1024;
const PERSISTENCE_ROOT_DIRECTORY_NAMES = new Set(['data', 'uploads', 'storage']);
const PERSISTENCE_DATABASE_EXTENSIONS = new Set(['.db', '.sqlite', '.sqlite3']);
const COMMON_BLOCKED_DIRECTORY_NAMES = [
    '.git',
    '.hg',
    '.svn',
    '.vite',
    '.cache',
    '.turbo',
    '.vercel',
    '.serverless',
    'coverage',
    'tmp',
    'temp',
    'logs',
];
const SOURCE_BUILD_OUTPUT_DIRECTORY_NAMES = [
    '.next',
    '.nuxt',
    '.svelte-kit',
    '.output',
    '.lobster-static-runtime',
    'dist',
    'build',
    'out',
];
const SOURCE_BLOCKED_DIRECTORY_NAMES = new Set([
    ...COMMON_BLOCKED_DIRECTORY_NAMES,
    ...SOURCE_BUILD_OUTPUT_DIRECTORY_NAMES,
    'node_modules',
]);
const DEPLOYMENT_BLOCKED_DIRECTORY_NAMES = new Set(COMMON_BLOCKED_DIRECTORY_NAMES);
const STATIC_SITE_BLOCKED_DIRECTORY_NAMES = new Set([
    ...COMMON_BLOCKED_DIRECTORY_NAMES,
    'node_modules',
]);
const BLOCKED_FILE_NAMES = new Set([
    '.DS_Store',
    'Thumbs.db',
    'npm-debug.log',
    'yarn-debug.log',
    'yarn-error.log',
    'pnpm-debug.log',
]);
const NEXT_STANDALONE_START_COMMAND = 'node server.js';
const NITRO_OUTPUT_START_COMMAND = 'node .output/server/index.mjs';
const STATIC_BUILD_START_COMMAND = 'node server.js';
const STATIC_SITE_SUPPORTED_EXTENSION_NAMES = new Set([
    '.avif',
    '.css',
    '.csv',
    '.docx',
    '.eot',
    '.gif',
    '.html',
    '.ico',
    '.jpeg',
    '.jpg',
    '.js',
    '.json',
    '.map',
    '.markdown',
    '.md',
    '.mermaid',
    '.mjs',
    '.mmd',
    '.mp3',
    '.mp4',
    '.otf',
    '.pdf',
    '.png',
    '.pptx',
    '.svg',
    '.tsv',
    '.ttf',
    '.txt',
    '.wasm',
    '.webm',
    '.webmanifest',
    '.webp',
    '.woff',
    '.woff2',
    '.xlsx',
    '.xml',
]);
function normalizeArchiveName(value) {
    return value.split(path_1.default.sep).join('/');
}
function parseLocalServicePort(value) {
    if (!value)
        return undefined;
    try {
        const url = new URL(value.trim());
        const port = Number(url.port);
        if (Number.isInteger(port) && port > 0 && port <= 65535)
            return port;
    }
    catch {
        // The caller will surface a missing port as a validation issue.
    }
    return undefined;
}
function isEnvFileName(name) {
    return /^\.env(?:\.|$)/i.test(name);
}
function isSecretLikeFileName(name) {
    return /(?:^|[-_.])(secret|credential|credentials|token|private[-_.]?key)(?:[-_.]|$)/i.test(name);
}
function isBlockedFileName(name) {
    return BLOCKED_FILE_NAMES.has(name) || isEnvFileName(name) || isSecretLikeFileName(name);
}
function isRootPersistenceDirectory(relativeParts) {
    return relativeParts.length === 1 && PERSISTENCE_ROOT_DIRECTORY_NAMES.has(relativeParts[0]);
}
function isPersistenceDatabaseFile(relativeParts, fileName) {
    return relativeParts.length <= 2 && PERSISTENCE_DATABASE_EXTENSIONS.has(path_1.default.extname(fileName).toLowerCase());
}
function persistenceDataPath(relativePath) {
    return normalizeArchiveName(relativePath);
}
function isBlockedPathPart(part, blockedDirectoryNames) {
    return blockedDirectoryNames.has(part);
}
function isBlockedRootDirectory(resolvedDirectory) {
    const normalized = path_1.default.resolve(resolvedDirectory);
    const parsed = path_1.default.parse(normalized);
    if (normalized === parsed.root)
        return true;
    const homeDir = path_1.default.resolve(os_1.default.homedir());
    const blockedRoots = new Set([
        homeDir,
        path_1.default.resolve(os_1.default.tmpdir()),
        path_1.default.resolve(parsed.root, 'tmp'),
        path_1.default.resolve(parsed.root, 'var', 'tmp'),
    ]);
    if (process.platform === 'win32') {
        blockedRoots.add(path_1.default.resolve(homeDir, 'Desktop'));
        blockedRoots.add(path_1.default.resolve(homeDir, 'Documents'));
        blockedRoots.add(path_1.default.resolve(homeDir, 'Downloads'));
    }
    else {
        blockedRoots.add('/Users');
        blockedRoots.add('/home');
        blockedRoots.add(path_1.default.resolve(homeDir, 'Desktop'));
        blockedRoots.add(path_1.default.resolve(homeDir, 'Documents'));
        blockedRoots.add(path_1.default.resolve(homeDir, 'Downloads'));
    }
    return blockedRoots.has(normalized);
}
async function readPackageJson(projectDirectory) {
    try {
        const text = await fs_1.default.promises.readFile(path_1.default.join(projectDirectory, PACKAGE_JSON_FILE_NAME), 'utf8');
        return JSON.parse(text);
    }
    catch {
        return null;
    }
}
async function pathExists(targetPath) {
    try {
        await fs_1.default.promises.access(targetPath);
        return true;
    }
    catch {
        return false;
    }
}
async function hasPackageJson(directory) {
    return await pathExists(path_1.default.join(directory, PACKAGE_JSON_FILE_NAME));
}
async function hasStaticSiteEntryFile(directory) {
    try {
        const stat = await fs_1.default.promises.stat(path_1.default.join(directory, STATIC_SITE_ENTRY_FILE));
        return stat.isFile();
    }
    catch {
        return false;
    }
}
async function findNearestProjectDirectory(startDirectory) {
    let current = path_1.default.resolve(startDirectory);
    while (true) {
        if (await hasPackageJson(current))
            return current;
        const parent = path_1.default.dirname(current);
        if (parent === current)
            return null;
        current = parent;
    }
}
async function findNearestStaticSiteDirectory(startDirectory) {
    let current = path_1.default.resolve(startDirectory);
    while (true) {
        if (await hasStaticSiteEntryFile(current))
            return current;
        if (await hasPackageJson(current))
            return null;
        const parent = path_1.default.dirname(current);
        if (parent === current || isBlockedRootDirectory(parent))
            return null;
        current = parent;
    }
}
async function findProjectDirectoryCandidate(startDirectory) {
    if (!startDirectory?.trim())
        return null;
    const resolved = path_1.default.resolve(startDirectory.trim());
    try {
        const stat = await fs_1.default.promises.stat(resolved);
        if (!stat.isDirectory())
            return null;
    }
    catch {
        return null;
    }
    return await findNearestProjectDirectory(resolved);
}
async function findStaticSiteDirectoryCandidate(startDirectory) {
    if (!startDirectory?.trim())
        return null;
    const resolved = path_1.default.resolve(startDirectory.trim());
    try {
        const stat = await fs_1.default.promises.stat(resolved);
        if (!stat.isDirectory())
            return null;
    }
    catch {
        return null;
    }
    return await findNearestStaticSiteDirectory(resolved);
}
function resolvePackageManager(projectDirectory) {
    if (fs_1.default.existsSync(path_1.default.join(projectDirectory, 'pnpm-lock.yaml'))) {
        return constants_1.ShareDeploymentPackageManager.Pnpm;
    }
    if (fs_1.default.existsSync(path_1.default.join(projectDirectory, 'yarn.lock'))) {
        return constants_1.ShareDeploymentPackageManager.Yarn;
    }
    if (fs_1.default.existsSync(path_1.default.join(projectDirectory, 'package-lock.json'))) {
        return constants_1.ShareDeploymentPackageManager.Npm;
    }
    return constants_1.ShareDeploymentPackageManager.Npm;
}
function hasNpmLockfile(projectDirectory) {
    return fs_1.default.existsSync(path_1.default.join(projectDirectory, 'package-lock.json')) ||
        fs_1.default.existsSync(path_1.default.join(projectDirectory, 'npm-shrinkwrap.json'));
}
function resolveInstallCommand(projectDirectory, packageManager) {
    switch (packageManager) {
        case constants_1.ShareDeploymentPackageManager.Pnpm:
            return 'pnpm install --frozen-lockfile';
        case constants_1.ShareDeploymentPackageManager.Yarn:
            return 'yarn install --frozen-lockfile';
        case constants_1.ShareDeploymentPackageManager.Unknown:
            return '';
        case constants_1.ShareDeploymentPackageManager.Npm:
        default:
            return hasNpmLockfile(projectDirectory) ? 'npm ci' : 'npm install';
    }
}
function scriptRunCommand(packageManager, scriptName) {
    switch (packageManager) {
        case constants_1.ShareDeploymentPackageManager.Pnpm:
            return `pnpm run ${scriptName}`;
        case constants_1.ShareDeploymentPackageManager.Yarn:
            return `yarn run ${scriptName}`;
        case constants_1.ShareDeploymentPackageManager.Npm:
        default:
            return `npm run ${scriptName}`;
    }
}
function resolveBuildCommand(packageJson, packageManager) {
    const scripts = packageJson?.scripts ?? {};
    if (typeof scripts.build === 'string' && scripts.build.trim()) {
        return scriptRunCommand(packageManager, 'build');
    }
    return '';
}
function isNextProjectPackage(packageJson) {
    return hasPackageDependency(packageJson, ['next']);
}
function hasPackageDependency(packageJson, packageNames) {
    const dependencies = {
        ...packageJson?.dependencies,
        ...packageJson?.devDependencies,
    };
    return packageNames.some(packageName => Boolean(dependencies[packageName]));
}
function hasPackageScript(packageJson, scriptName) {
    const script = packageJson?.scripts?.[scriptName];
    return typeof script === 'string' && script.trim().length > 0;
}
function hasProductionStartScript(packageJson) {
    return hasPackageScript(packageJson, 'start') || hasPackageScript(packageJson, 'serve');
}
function isNuxtProjectPackage(packageJson) {
    return hasPackageDependency(packageJson, ['nuxt', 'nuxt3']);
}
function isStaticBuildProjectPackage(packageJson) {
    return hasPackageDependency(packageJson, [
        'vite',
        'react-scripts',
        '@vue/cli-service',
        '@angular/cli',
        'astro',
        'parcel',
        '@sveltejs/vite-plugin-svelte',
    ]);
}
function isSupportedStaticSiteFileName(name) {
    return STATIC_SITE_SUPPORTED_EXTENSION_NAMES.has(path_1.default.extname(name).toLowerCase());
}
function isSvelteKitProjectPackage(packageJson) {
    return hasPackageDependency(packageJson, ['@sveltejs/kit', '@sveltejs/vite-plugin-svelte']);
}
function hasSvelteKitProductionAdapter(packageJson) {
    return hasPackageDependency(packageJson, [
        '@sveltejs/adapter-static',
        '@sveltejs/adapter-node',
        '@sveltejs/adapter-vercel',
        '@sveltejs/adapter-netlify',
        '@sveltejs/adapter-cloudflare',
    ]);
}
function isDevStartCommand(command) {
    return command.endsWith(' run dev') || command.endsWith(' dev');
}
function deploymentReadinessBlockers(packageJson, startCommand) {
    if (!packageJson)
        return [];
    const blockers = [];
    if (isDevStartCommand(startCommand) && !hasProductionStartScript(packageJson)) {
        blockers.push('This project only defines a development start command. Add a production start/serve script or configure a supported static build before sharing.');
    }
    if (isSvelteKitProjectPackage(packageJson) &&
        hasPackageDependency(packageJson, ['@sveltejs/adapter-auto']) &&
        !hasSvelteKitProductionAdapter(packageJson) &&
        !hasProductionStartScript(packageJson)) {
        blockers.push('This SvelteKit project uses @sveltejs/adapter-auto without a production deployment adapter. Use @sveltejs/adapter-static for static sharing, or @sveltejs/adapter-node with a start script such as "node build/index.js".');
    }
    return blockers;
}
function resolveStartCommand(packageJson, packageManager) {
    if (isNextProjectPackage(packageJson) &&
        hasPackageScript(packageJson, 'build')) {
        return NEXT_STANDALONE_START_COMMAND;
    }
    if (isNuxtProjectPackage(packageJson) &&
        hasPackageScript(packageJson, 'build')) {
        return NITRO_OUTPUT_START_COMMAND;
    }
    if (isStaticBuildProjectPackage(packageJson) &&
        hasPackageScript(packageJson, 'build')) {
        return STATIC_BUILD_START_COMMAND;
    }
    if (hasPackageScript(packageJson, 'start'))
        return scriptRunCommand(packageManager, 'start');
    if (hasPackageScript(packageJson, 'serve'))
        return scriptRunCommand(packageManager, 'serve');
    if (hasPackageScript(packageJson, 'dev'))
        return scriptRunCommand(packageManager, 'dev');
    return '';
}
function resolveDeploymentKind(packageJson, isStaticSiteDirectory) {
    if (!packageJson && isStaticSiteDirectory) {
        return constants_1.ShareDeploymentKind.StaticSite;
    }
    if (isStaticBuildProjectPackage(packageJson) && !isNextProjectPackage(packageJson) && !isNuxtProjectPackage(packageJson)) {
        return constants_1.ShareDeploymentKind.StaticSite;
    }
    return constants_1.ShareDeploymentKind.NodeService;
}
function hasRunnableScript(packageJson) {
    if (isNextProjectPackage(packageJson) &&
        hasPackageScript(packageJson, 'build')) {
        return true;
    }
    if ((isNuxtProjectPackage(packageJson) || isStaticBuildProjectPackage(packageJson)) &&
        hasPackageScript(packageJson, 'build')) {
        return true;
    }
    return ['start', 'serve', 'dev'].some(scriptName => {
        return hasPackageScript(packageJson, scriptName);
    });
}
async function isUsableNodeProjectDirectory(projectDirectory) {
    try {
        const stat = await fs_1.default.promises.stat(projectDirectory);
        if (!stat.isDirectory() || isBlockedRootDirectory(projectDirectory))
            return false;
        const packageJson = await readPackageJson(projectDirectory);
        return hasRunnableScript(packageJson);
    }
    catch {
        return false;
    }
}
async function isUsableStaticSiteDirectory(projectDirectory) {
    try {
        const stat = await fs_1.default.promises.stat(projectDirectory);
        return stat.isDirectory() &&
            !isBlockedRootDirectory(projectDirectory) &&
            await hasStaticSiteEntryFile(projectDirectory);
    }
    catch {
        return false;
    }
}
async function isUsableProjectDirectory(projectDirectory) {
    return await isUsableNodeProjectDirectory(projectDirectory) ||
        await isUsableStaticSiteDirectory(projectDirectory);
}
function resolveNodeVersion(packageJson) {
    const engine = packageJson?.engines?.node;
    if (typeof engine !== 'string')
        return '20';
    const majorMatch = engine.match(/(?:^|[^\d])(\d{2})(?:[^\d]|$)/);
    const major = majorMatch?.[1];
    if (major === '18' || major === '20' || major === '22')
        return major;
    return '20';
}
async function collectPackageEntries(projectDirectory, blockedDirectoryNames, maxTotalBytes) {
    const entries = [];
    const persistenceCandidates = new Map();
    const blockers = [];
    let totalBytes = 0;
    let excludedCount = 0;
    function addPersistenceCandidate(relativePath, kind, sizeBytes) {
        const archiveName = normalizeArchiveName(relativePath);
        const previous = persistenceCandidates.get(archiveName);
        if (previous) {
            previous.sizeBytes += sizeBytes;
            return;
        }
        persistenceCandidates.set(archiveName, {
            appPath: archiveName,
            kind,
            sizeBytes,
        });
    }
    async function walk(directory) {
        if (blockers.length > 0)
            return;
        const children = await fs_1.default.promises.readdir(directory, { withFileTypes: true });
        for (const child of children) {
            if (blockers.length > 0)
                return;
            const absolutePath = path_1.default.join(directory, child.name);
            const relativePath = path_1.default.relative(projectDirectory, absolutePath);
            const relativeParts = relativePath.split(path_1.default.sep).filter(Boolean);
            if (relativeParts.some(part => isBlockedPathPart(part, blockedDirectoryNames)) ||
                isBlockedFileName(child.name)) {
                excludedCount += 1;
                continue;
            }
            if (child.isSymbolicLink()) {
                excludedCount += 1;
                continue;
            }
            if (child.isDirectory()) {
                await walk(absolutePath);
                continue;
            }
            if (!child.isFile()) {
                excludedCount += 1;
                continue;
            }
            const stat = await fs_1.default.promises.stat(absolutePath);
            totalBytes += stat.size;
            if (relativeParts.length > 1 && isRootPersistenceDirectory([relativeParts[0]])) {
                addPersistenceCandidate(relativeParts[0], constants_1.ShareDeploymentPersistenceBindingKind.Directory, stat.size);
            }
            else if (isPersistenceDatabaseFile(relativeParts, child.name)) {
                addPersistenceCandidate(relativePath, constants_1.ShareDeploymentPersistenceBindingKind.File, stat.size);
            }
            entries.push({
                absolutePath,
                archiveName: normalizeArchiveName(relativePath),
                size: stat.size,
            });
            if (entries.length > exports.NODE_SERVICE_DEPLOYMENT_LIMITS.MaxFiles) {
                blockers.push(`Project has more than ${exports.NODE_SERVICE_DEPLOYMENT_LIMITS.MaxFiles} files after exclusions.`);
                return;
            }
            if (totalBytes > maxTotalBytes) {
                blockers.push(`Project files exceed ${Math.floor(maxTotalBytes / 1024 / 1024)}MB after exclusions.`);
                return;
            }
        }
    }
    await walk(projectDirectory);
    const persistenceBindings = Array.from(persistenceCandidates.values())
        .sort((a, b) => a.appPath.localeCompare(b.appPath))
        .map(candidate => ({
        appPath: candidate.appPath,
        dataPath: persistenceDataPath(candidate.appPath),
        kind: candidate.kind,
        sizeBytes: candidate.sizeBytes,
    }));
    return {
        entries: entries.sort((a, b) => a.archiveName.localeCompare(b.archiveName)),
        totalBytes,
        excludedCount,
        persistence: persistenceBindings.length
            ? {
                enabled: true,
                provider: constants_1.ShareDeploymentPersistenceProvider.Filesystem,
                quotaBytes: DEFAULT_PERSISTENCE_QUOTA_BYTES,
                bindings: persistenceBindings,
            }
            : undefined,
        warnings: [],
        blockers,
    };
}
async function collectNodeServiceDeploymentPackageEntries(projectDirectory) {
    return await collectPackageEntries(projectDirectory, DEPLOYMENT_BLOCKED_DIRECTORY_NAMES, exports.NODE_SERVICE_DEPLOYMENT_LIMITS.MaxDeploymentTotalBytes);
}
async function collectStaticSiteDeploymentPackageEntries(projectDirectory) {
    const entries = [];
    const blockers = [];
    let totalBytes = 0;
    let excludedCount = 0;
    async function walk(directory) {
        if (blockers.length > 0)
            return;
        let children;
        try {
            children = await fs_1.default.promises.readdir(directory, { withFileTypes: true });
        }
        catch {
            return;
        }
        for (const child of children) {
            if (blockers.length > 0)
                return;
            const absolutePath = path_1.default.join(directory, child.name);
            const relativePath = path_1.default.relative(projectDirectory, absolutePath);
            const relativeParts = relativePath.split(path_1.default.sep).filter(Boolean);
            if (relativeParts.some(part => isBlockedPathPart(part, STATIC_SITE_BLOCKED_DIRECTORY_NAMES)) ||
                isBlockedFileName(child.name) ||
                child.isSymbolicLink()) {
                excludedCount += 1;
                continue;
            }
            if (child.isDirectory()) {
                await walk(absolutePath);
                continue;
            }
            if (!child.isFile() || !isSupportedStaticSiteFileName(child.name)) {
                excludedCount += 1;
                continue;
            }
            const stat = await fs_1.default.promises.stat(absolutePath);
            totalBytes += stat.size;
            entries.push({
                absolutePath,
                archiveName: normalizeArchiveName(relativePath),
                size: stat.size,
            });
            if (entries.length > exports.NODE_SERVICE_DEPLOYMENT_LIMITS.MaxFiles) {
                blockers.push(`Project has more than ${exports.NODE_SERVICE_DEPLOYMENT_LIMITS.MaxFiles} files after exclusions.`);
                return;
            }
            if (totalBytes > exports.NODE_SERVICE_DEPLOYMENT_LIMITS.MaxDeploymentTotalBytes) {
                blockers.push(`Project files exceed ${Math.floor(exports.NODE_SERVICE_DEPLOYMENT_LIMITS.MaxDeploymentTotalBytes / 1024 / 1024)}MB after exclusions.`);
                return;
            }
        }
    }
    await walk(projectDirectory);
    return {
        entries: entries.sort((a, b) => a.archiveName.localeCompare(b.archiveName)),
        totalBytes,
        excludedCount,
        warnings: [],
        blockers,
    };
}
async function buildNodeServiceProjectPackagePlan(input) {
    const projectDirectory = path_1.default.resolve(input.projectDirectory.trim());
    const warnings = [];
    const blockers = [];
    let stat = null;
    try {
        stat = await fs_1.default.promises.stat(projectDirectory);
    }
    catch {
        blockers.push('Project directory does not exist.');
    }
    if (stat && !stat.isDirectory()) {
        blockers.push('Project path must be a directory.');
    }
    if (isBlockedRootDirectory(projectDirectory)) {
        blockers.push('Choose a project subdirectory instead of a system, home, or shared root directory.');
    }
    const isStaticSiteDirectory = stat?.isDirectory()
        ? await hasStaticSiteEntryFile(projectDirectory)
        : false;
    const packageJson = await readPackageJson(projectDirectory);
    if (!packageJson && !isStaticSiteDirectory) {
        blockers.push('Project directory must contain package.json or index.html.');
    }
    const packageManager = packageJson
        ? resolvePackageManager(projectDirectory)
        : constants_1.ShareDeploymentPackageManager.Unknown;
    const installCommand = resolveInstallCommand(projectDirectory, packageManager);
    const buildCommand = resolveBuildCommand(packageJson, packageManager);
    const startCommand = resolveStartCommand(packageJson, packageManager);
    const deploymentKind = resolveDeploymentKind(packageJson, isStaticSiteDirectory);
    const nodeVersion = resolveNodeVersion(packageJson);
    const port = parseLocalServicePort(input.localServiceUrl);
    if (!startCommand && deploymentKind !== constants_1.ShareDeploymentKind.StaticSite) {
        blockers.push('package.json must define a start, serve, or dev script.');
    }
    blockers.push(...deploymentReadinessBlockers(packageJson, startCommand));
    if (!port) {
        blockers.push('Local service URL must include a valid port.');
    }
    if (isDevStartCommand(startCommand) && !blockers.length) {
        warnings.push('Only a dev script was found. Confirm the service can run in a cloud deployment.');
    }
    if (packageJson && packageManager === constants_1.ShareDeploymentPackageManager.Npm && !hasNpmLockfile(projectDirectory)) {
        warnings.push('No npm lockfile was found. npm install behavior may be less reproducible.');
    }
    const shouldCollectPackageEntries = Boolean(stat?.isDirectory() && blockers.length === 0);
    const collected = shouldCollectPackageEntries
        ? deploymentKind === constants_1.ShareDeploymentKind.StaticSite && !packageJson
            ? await collectStaticSiteDeploymentPackageEntries(projectDirectory)
            : await collectPackageEntries(projectDirectory, SOURCE_BLOCKED_DIRECTORY_NAMES, exports.NODE_SERVICE_DEPLOYMENT_LIMITS.MaxSourceTotalBytes)
        : {
            entries: [],
            totalBytes: 0,
            excludedCount: 0,
            persistence: undefined,
            warnings: [],
            blockers: [],
        };
    const analysis = {
        success: blockers.length === 0 && collected.blockers.length === 0,
        projectDirectory,
        packageName: typeof packageJson?.name === 'string' ? packageJson.name : undefined,
        packageVersion: typeof packageJson?.version === 'string' ? packageJson.version : undefined,
        deploymentKind,
        entryFile: deploymentKind === constants_1.ShareDeploymentKind.StaticSite ? 'index.html' : undefined,
        spaFallback: deploymentKind === constants_1.ShareDeploymentKind.StaticSite ? true : undefined,
        packageManager,
        nodeVersion,
        installCommand,
        buildCommand,
        startCommand,
        port,
        totalFiles: collected.entries.length,
        totalBytes: collected.totalBytes,
        excludedCount: collected.excludedCount,
        persistence: collected.persistence,
        warnings: [...warnings, ...collected.warnings],
        blockers: [...blockers, ...collected.blockers],
    };
    return {
        analysis,
        entries: collected.entries,
    };
}
async function analyzeNodeServiceProjectDirectory(input) {
    try {
        return (await buildNodeServiceProjectPackagePlan(input)).analysis;
    }
    catch (error) {
        return {
            success: false,
            projectDirectory: input.projectDirectory,
            packageManager: constants_1.ShareDeploymentPackageManager.Unknown,
            nodeVersion: '20',
            installCommand: 'npm install',
            buildCommand: '',
            startCommand: '',
            totalFiles: 0,
            totalBytes: 0,
            excludedCount: 0,
            warnings: [],
            blockers: [error instanceof Error ? error.message : 'Failed to analyze project directory.'],
        };
    }
}
async function getPidListeningOnPort(port) {
    if (process.platform === 'win32')
        return null;
    try {
        const { stdout } = await execFileAsync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-Fp'], {
            timeout: 1500,
        });
        const pidLine = stdout
            .split(/\r?\n/)
            .map(line => line.trim())
            .find(line => /^p\d+$/.test(line));
        return pidLine ? pidLine.slice(1) : null;
    }
    catch {
        return null;
    }
}
async function getProcessCwd(pid) {
    if (process.platform === 'win32')
        return null;
    const procCwd = `/proc/${pid}/cwd`;
    try {
        return await fs_1.default.promises.realpath(procCwd);
    }
    catch {
        // Linux normally resolves /proc directly; macOS and restricted systems fall through to lsof.
    }
    try {
        const { stdout } = await execFileAsync('lsof', ['-a', '-p', pid, '-d', 'cwd', '-Fn'], {
            timeout: 1500,
        });
        const cwdLine = stdout
            .split(/\r?\n/)
            .map(line => line.trim())
            .find(line => line.startsWith('n'));
        return cwdLine ? cwdLine.slice(1) : null;
    }
    catch {
        return null;
    }
}
function pushUniqueCandidate(candidates, candidate) {
    if (!candidate?.directory)
        return;
    const normalized = path_1.default.resolve(candidate.directory);
    const normalizedCandidate = {
        ...candidate,
        directory: normalized,
        confidence: Math.max(0, Math.min(100, Math.round(candidate.confidence))),
        detectedAt: candidate.detectedAt ?? Date.now(),
    };
    const existingIndex = candidates.findIndex(item => path_1.default.resolve(item.directory) === normalized);
    if (existingIndex >= 0) {
        if (normalizedCandidate.confidence > candidates[existingIndex].confidence) {
            candidates[existingIndex] = normalizedCandidate;
        }
        return;
    }
    candidates.push(normalizedCandidate);
}
async function pushUsableInputCandidate(candidates, candidate) {
    if (!candidate?.directory?.trim())
        return;
    const directory = path_1.default.resolve(candidate.directory.trim());
    if (!await isUsableProjectDirectory(directory))
        return;
    pushUniqueCandidate(candidates, {
        ...candidate,
        directory,
    });
}
async function detectNodeServiceProjectCandidates(input) {
    const candidates = [];
    const port = parseLocalServicePort(input.localServiceUrl);
    if (port) {
        const pid = await getPidListeningOnPort(port);
        const cwd = pid ? await getProcessCwd(pid) : null;
        const projectDirectory = cwd ? await findProjectDirectoryCandidate(cwd) : null;
        const usableProjectDirectory = projectDirectory && await isUsableNodeProjectDirectory(projectDirectory)
            ? projectDirectory
            : null;
        pushUniqueCandidate(candidates, usableProjectDirectory
            ? {
                directory: usableProjectDirectory,
                source: constants_1.ShareDeploymentCandidateSource.ProcessCwd,
                confidence: 95,
                reason: `Matched the process listening on port ${port}.`,
                pid: Number(pid),
            }
            : null);
        if (!usableProjectDirectory) {
            const staticSiteDirectory = cwd ? await findStaticSiteDirectoryCandidate(cwd) : null;
            const usableStaticSiteDirectory = staticSiteDirectory && await isUsableStaticSiteDirectory(staticSiteDirectory)
                ? staticSiteDirectory
                : null;
            pushUniqueCandidate(candidates, usableStaticSiteDirectory
                ? {
                    directory: usableStaticSiteDirectory,
                    source: constants_1.ShareDeploymentCandidateSource.ProcessCwd,
                    confidence: 95,
                    reason: `Matched the static site directory served by the process listening on port ${port}.`,
                    pid: Number(pid),
                }
                : null);
        }
    }
    for (const candidate of input.projectCandidates ?? []) {
        await pushUsableInputCandidate(candidates, candidate);
    }
    await pushUsableInputCandidate(candidates, input.cachedProjectDirectory?.trim()
        ? {
            directory: input.cachedProjectDirectory,
            source: constants_1.ShareDeploymentCandidateSource.Cache,
            confidence: 35,
            reason: 'Matched the previously used project directory for this local service origin.',
        }
        : null);
    const workspaceProjectDirectory = await findProjectDirectoryCandidate(input.workingDirectory) ??
        await findStaticSiteDirectoryCandidate(input.workingDirectory);
    const usableWorkspaceProjectDirectory = workspaceProjectDirectory && await isUsableProjectDirectory(workspaceProjectDirectory)
        ? workspaceProjectDirectory
        : null;
    pushUniqueCandidate(candidates, usableWorkspaceProjectDirectory
        ? {
            directory: usableWorkspaceProjectDirectory,
            source: constants_1.ShareDeploymentCandidateSource.Workspace,
            confidence: 60,
            reason: 'Matched the current workspace directory.',
        }
        : null);
    // Preserve the fallback stages instead of globally re-sorting by confidence:
    // listening process -> session context -> previous selection -> working directory.
    return candidates;
}
//# sourceMappingURL=nodeServiceProjectAnalyzer.js.map