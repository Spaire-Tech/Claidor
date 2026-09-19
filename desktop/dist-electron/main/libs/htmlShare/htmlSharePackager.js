"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.packageHtmlFile = packageHtmlFile;
exports.packageStaticDirectory = packageStaticDirectory;
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const promises_1 = require("stream/promises");
const yazl_1 = __importDefault(require("yazl"));
const constants_1 = require("../../../shared/cowork/constants");
const constants_2 = require("../../../shared/htmlShare/constants");
const htmlDependencyScanner_1 = require("./htmlDependencyScanner");
const htmlShareError_1 = require("./htmlShareError");
const MAX_CLIENT_ARCHIVE_BYTES = 20 * 1024 * 1024;
const MAX_CLIENT_TOTAL_BYTES = 100 * 1024 * 1024;
const MAX_CLIENT_SINGLE_FILE_BYTES = 10 * 1024 * 1024;
const MAX_CLIENT_FILE_COUNT = 500;
const EXCLUDED_DIRECTORY_NAMES = new Set([
    '.git',
    '.hg',
    '.svn',
    'node_modules',
    '.next',
    '.nuxt',
    '.svelte-kit',
    '.vite',
    '.cache',
    'coverage',
]);
const COWORK_TEMP_DIRECTORY_NAME = constants_1.COWORK_TEMP_DIR_NAME;
const SENSITIVE_DIRECTORY_NAMES = new Set([
    COWORK_TEMP_DIRECTORY_NAME,
    '.openclaw',
    'memory',
]);
const EXCLUDED_FILE_NAMES = new Set([
    '.DS_Store',
    'Thumbs.db',
    'package-lock.json',
    'pnpm-lock.yaml',
    'yarn.lock',
]);
const ALLOWED_EXTENSIONS = new Set([
    '.html',
    '.htm',
    '.css',
    '.js',
    '.mjs',
    '.cjs',
    '.json',
    '.txt',
    '.md',
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.webp',
    '.svg',
    '.ico',
    '.bmp',
    '.avif',
    '.woff',
    '.woff2',
    '.ttf',
    '.otf',
    '.eot',
    '.wasm',
    '.mp3',
    '.mp4',
    '.webm',
    '.ogg',
]);
const SHARE_BOUNDARY_MARKER_NAMES = [
    'package.json',
    'AGENTS.md',
    '.git',
    '.openclaw',
    'MEMORY.md',
];
function normalizeArchiveName(value) {
    return value.split(path_1.default.sep).join('/');
}
function isExcludedFileName(name) {
    return EXCLUDED_FILE_NAMES.has(name) || /^\.env(?:\.|$)/i.test(name);
}
function isAllowedStaticFile(filePath) {
    return ALLOWED_EXTENSIONS.has(path_1.default.extname(filePath).toLowerCase());
}
function isBlockedStaticPath(rootDir, filePath) {
    const relative = path_1.default.relative(rootDir, filePath);
    if (!relative || relative.startsWith('..') || path_1.default.isAbsolute(relative))
        return true;
    const parts = relative.split(path_1.default.sep).filter(Boolean);
    return parts.some(part => EXCLUDED_DIRECTORY_NAMES.has(part) || SENSITIVE_DIRECTORY_NAMES.has(part))
        || isExcludedFileName(path_1.default.basename(filePath));
}
async function hasShareBoundaryMarker(dir) {
    for (const markerName of SHARE_BOUNDARY_MARKER_NAMES) {
        try {
            await fs_1.default.promises.access(path_1.default.join(dir, markerName));
            return true;
        }
        catch {
            // Keep walking until a project boundary is found.
        }
    }
    return false;
}
async function findShareBoundaryRoot(startDir) {
    const resolvedStartDir = path_1.default.resolve(startDir);
    let current = resolvedStartDir;
    while (true) {
        if (await hasShareBoundaryMarker(current))
            return current;
        const parent = path_1.default.dirname(current);
        if (parent === current)
            return resolvedStartDir;
        current = parent;
    }
}
function resolveHtmlFileShareRoot(resolvedFilePath, boundaryRoot) {
    const relative = path_1.default.relative(boundaryRoot, resolvedFilePath);
    const relativeParts = relative.split(path_1.default.sep).filter(Boolean);
    if (relativeParts.includes(COWORK_TEMP_DIRECTORY_NAME)) {
        return path_1.default.dirname(resolvedFilePath);
    }
    return boundaryRoot;
}
function findCommonDirectory(filePaths) {
    if (!filePaths.length) {
        throw new Error('Shared output did not contain any files.');
    }
    const directoryParts = filePaths.map(filePath => path_1.default.dirname(path_1.default.resolve(filePath)).split(path_1.default.sep));
    const first = directoryParts[0];
    let commonLength = first.length;
    for (const parts of directoryParts.slice(1)) {
        commonLength = Math.min(commonLength, parts.length);
        for (let index = 0; index < commonLength; index += 1) {
            if (parts[index] !== first[index]) {
                commonLength = index;
                break;
            }
        }
    }
    return first.slice(0, commonLength).join(path_1.default.sep) || path_1.default.parse(filePaths[0]).root;
}
async function buildStaticFileEntries(archiveRoot, filePaths) {
    if (filePaths.length > MAX_CLIENT_FILE_COUNT) {
        throw (0, htmlShareError_1.createHtmlShareSizeError)(constants_2.HtmlShareFailureKind.FileCountExceeded, `Too many files to share. The limit is ${MAX_CLIENT_FILE_COUNT}.`, { limitCount: MAX_CLIENT_FILE_COUNT });
    }
    const entries = [];
    for (const filePath of filePaths) {
        const stat = await fs_1.default.promises.stat(filePath);
        if (stat.size > MAX_CLIENT_SINGLE_FILE_BYTES) {
            throw (0, htmlShareError_1.createHtmlShareSizeError)(constants_2.HtmlShareFailureKind.FileTooLarge, `File is too large to share: ${path_1.default.relative(archiveRoot, filePath)}`, {
                fileName: path_1.default.basename(filePath),
                limitBytes: MAX_CLIENT_SINGLE_FILE_BYTES,
                actualBytes: stat.size,
            });
        }
        entries.push({
            absolutePath: filePath,
            archiveName: normalizeArchiveName(path_1.default.relative(archiveRoot, filePath)),
            size: stat.size,
        });
    }
    const totalBytes = entries.reduce((sum, entry) => sum + entry.size, 0);
    if (totalBytes > MAX_CLIENT_TOTAL_BYTES) {
        throw (0, htmlShareError_1.createHtmlShareSizeError)(constants_2.HtmlShareFailureKind.TotalSizeExceeded, `Share content is too large. The limit is ${Math.floor(MAX_CLIENT_TOTAL_BYTES / 1024 / 1024)}MB.`, {
            limitBytes: MAX_CLIENT_TOTAL_BYTES,
            actualBytes: totalBytes,
        });
    }
    return entries.sort((a, b) => a.archiveName.localeCompare(b.archiveName));
}
async function writeZip(entries) {
    const tempDir = await fs_1.default.promises.mkdtemp(path_1.default.join(os_1.default.tmpdir(), 'lobster-html-share-'));
    const archivePath = path_1.default.join(tempDir, 'share.zip');
    const zipFile = new yazl_1.default.ZipFile();
    console.debug(`[HtmlShare] writing share archive with ${entries.length} files`);
    zipFile.on('error', (err) => {
        zipFile.outputStream.destroy(err);
    });
    for (const entry of entries) {
        zipFile.addFile(entry.absolutePath, entry.archiveName);
    }
    const outputStream = fs_1.default.createWriteStream(archivePath);
    const pipelinePromise = (0, promises_1.pipeline)(zipFile.outputStream, outputStream);
    zipFile.end();
    await pipelinePromise;
    const stat = await fs_1.default.promises.stat(archivePath);
    if (stat.size > MAX_CLIENT_ARCHIVE_BYTES) {
        throw (0, htmlShareError_1.createHtmlShareSizeError)(constants_2.HtmlShareFailureKind.ArchiveSizeExceeded, `Share archive is too large. The limit is ${Math.floor(MAX_CLIENT_ARCHIVE_BYTES / 1024 / 1024)}MB.`, {
            limitBytes: MAX_CLIENT_ARCHIVE_BYTES,
            actualBytes: stat.size,
        });
    }
    const buffer = await fs_1.default.promises.readFile(archivePath);
    const sourceSha256 = crypto_1.default.createHash('sha256').update(buffer).digest('hex');
    console.debug(`[HtmlShare] wrote share archive with ${stat.size} bytes and hash ${sourceSha256}`);
    return {
        archivePath,
        sourceSha256,
    };
}
async function packageHtmlFile(filePath) {
    const resolvedFilePath = path_1.default.resolve(filePath);
    console.debug(`[HtmlShare] packaging HTML file at ${resolvedFilePath}`);
    const stat = await fs_1.default.promises.stat(resolvedFilePath);
    if (!stat.isFile()) {
        throw new Error('HTML artifact file does not exist.');
    }
    if (!/\.html?$/i.test(resolvedFilePath)) {
        throw new Error('Only HTML files can be shared.');
    }
    const boundaryRoot = await findShareBoundaryRoot(path_1.default.dirname(resolvedFilePath));
    const shareRoot = resolveHtmlFileShareRoot(resolvedFilePath, boundaryRoot);
    return packageStaticDirectory(shareRoot, path_1.default.relative(shareRoot, resolvedFilePath));
}
async function packageStaticDirectory(rootDir, entryFile = 'index.html') {
    const resolvedRootDir = path_1.default.resolve(rootDir);
    const entryPath = path_1.default.resolve(resolvedRootDir, entryFile);
    const relativeEntry = path_1.default.relative(resolvedRootDir, entryPath);
    console.debug(`[HtmlShare] packaging static directory ${resolvedRootDir} with entry ${entryFile}`);
    if (!relativeEntry || relativeEntry.startsWith('..') || path_1.default.isAbsolute(relativeEntry)) {
        throw new Error('Entry HTML must be inside the shared directory.');
    }
    const entryStat = await fs_1.default.promises.stat(entryPath);
    if (!entryStat.isFile()) {
        throw new Error('Shared output directory must contain an entry HTML file.');
    }
    const dependencyScan = await (0, htmlDependencyScanner_1.scanHtmlDependencies)(entryPath, {
        allowedRoot: resolvedRootDir,
        isAllowedFile: isAllowedStaticFile,
        isBlockedPath: filePath => isBlockedStaticPath(resolvedRootDir, filePath),
    });
    console.debug(`[HtmlShare] dependency scan found ${dependencyScan.files.length} files, ${dependencyScan.missing.length} missing referenced resources, and ${dependencyScan.blocked.length} blocked resources`);
    const archiveRoot = findCommonDirectory(dependencyScan.files);
    const files = await buildStaticFileEntries(archiveRoot, dependencyScan.files);
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    console.debug(`[HtmlShare] collected ${files.length} referenced static files with ${totalBytes} bytes before compression`);
    const archiveEntry = normalizeArchiveName(path_1.default.relative(archiveRoot, entryPath));
    if (!files.some(file => file.archiveName === archiveEntry)) {
        throw new Error('Entry HTML was excluded from the share archive.');
    }
    const { archivePath, sourceSha256 } = await writeZip(files);
    return {
        archivePath,
        sourceSha256,
        entryFile: archiveEntry,
        rootDir: archiveRoot,
        totalFiles: files.length,
        totalBytes,
        warnings: [
            ...dependencyScan.missing.map(item => `Missing referenced resource: ${item}`),
            ...dependencyScan.blocked.map(item => `Blocked referenced resource: ${item}`),
        ],
    };
}
//# sourceMappingURL=htmlSharePackager.js.map