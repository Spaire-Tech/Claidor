"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.COWORK_TEMP_ATTACHMENTS_RETENTION_MS = void 0;
exports.getCoworkTempDirPath = getCoworkTempDirPath;
exports.findCoworkTempRoot = findCoworkTempRoot;
exports.ensureCoworkTempGitignore = ensureCoworkTempGitignore;
exports.sweepCoworkTempDir = sweepCoworkTempDir;
exports.measureCoworkTempDir = measureCoworkTempDir;
exports.createCoworkTempJanitor = createCoworkTempJanitor;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const constants_1 = require("../../shared/cowork/constants");
/**
 * Manual, user-confirmed cleaner for per-working-directory `.cowork-temp`
 * scratch dirs. There is deliberately NO automatic deletion: the renderer
 * first shows a preview (what would be removed, per directory) and only a
 * user-confirmed clean actually deletes files.
 *
 * Safety model (mirrors Codex's projectless-dir handling):
 * - Only operates on paths strictly inside `<cwd>/.cowork-temp`.
 * - The temp dir must be a real directory (not a symlink); symlinked entries
 *   are never followed nor deleted.
 * - The `attachments/` subtree uses a long retention (originals are
 *   referenced by message re-edit), and the root `.gitignore` marker is
 *   preserved.
 * - Working directories with an active session are never cleaned.
 * - Clean targets are re-derived from the session store and intersected with
 *   the caller's selection, so IPC input cannot name arbitrary paths.
 *
 * This module is Electron-free so the sweep logic stays unit-testable.
 */
/** Attachment originals are kept this long before a clean removes them. */
exports.COWORK_TEMP_ATTACHMENTS_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const SWEEP_MAX_ENTRIES = 20000;
const MAX_SWEEP_DEPTH = 8;
const GITIGNORE_FILE_NAME = '.gitignore';
function getCoworkTempDirPath(cwd) {
    return path.join(cwd, constants_1.COWORK_TEMP_DIR_NAME);
}
/**
 * Walk up from a path and return the enclosing `.cowork-temp` root, or null
 * when the path is not inside one.
 */
function findCoworkTempRoot(childPath) {
    const resolved = path.resolve(childPath);
    const segments = resolved.split(path.sep);
    const index = segments.lastIndexOf(constants_1.COWORK_TEMP_DIR_NAME);
    if (index < 0)
        return null;
    return segments.slice(0, index + 1).join(path.sep) || null;
}
/**
 * Drop a `*` .gitignore marker into the temp dir so model-written scratch
 * files do not pollute `git status` of user project repositories. Idempotent;
 * never overwrites an existing file.
 */
function ensureCoworkTempGitignore(tempDir) {
    try {
        const gitignorePath = path.join(tempDir, GITIGNORE_FILE_NAME);
        if (fs.existsSync(gitignorePath))
            return;
        if (!isRealDirectorySync(tempDir))
            return;
        fs.writeFileSync(gitignorePath, '*\n', { flag: 'wx' });
    }
    catch {
        // Best effort — a read-only or concurrent-created file is fine.
    }
}
function isRealDirectorySync(dirPath) {
    try {
        const stat = fs.lstatSync(dirPath);
        return stat.isDirectory();
    }
    catch {
        return false;
    }
}
async function isRealDirectory(dirPath) {
    try {
        const stat = await fs.promises.lstat(dirPath);
        return stat.isDirectory();
    }
    catch {
        return false;
    }
}
async function sweepDirectory(dirPath, depth, inAttachments, state) {
    let entries;
    try {
        entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    }
    catch {
        state.result.skippedEntries++;
        return;
    }
    for (const entry of entries) {
        if (state.visitedEntries >= state.maxEntries) {
            state.result.truncated = true;
            return;
        }
        state.visitedEntries++;
        const entryPath = path.join(dirPath, entry.name);
        // Belt-and-suspenders containment check against crafted names.
        if (!path.resolve(entryPath).startsWith(state.rootPrefix)) {
            state.result.skippedEntries++;
            continue;
        }
        if (entry.isSymbolicLink()) {
            state.result.skippedEntries++;
            continue;
        }
        if (entry.isDirectory()) {
            if (depth + 1 > state.maxDepth) {
                state.result.skippedEntries++;
                continue;
            }
            const enteringAttachments = inAttachments || (depth === 0 && entry.name === constants_1.COWORK_TEMP_ATTACHMENTS_DIR_NAME);
            await sweepDirectory(entryPath, depth + 1, enteringAttachments, state);
            if (!state.dryRun) {
                try {
                    await fs.promises.rmdir(entryPath);
                }
                catch {
                    // Not empty or not removable — keep it.
                }
            }
            continue;
        }
        if (!entry.isFile()) {
            state.result.skippedEntries++;
            continue;
        }
        const isRootGitignore = depth === 0 && entry.name === GITIGNORE_FILE_NAME;
        try {
            const stat = await fs.promises.lstat(entryPath);
            state.result.totalFiles++;
            state.result.totalBytes += stat.size;
            if (isRootGitignore) {
                continue;
            }
            const retentionMs = inAttachments ? state.attachmentsRetentionMs : state.retentionMs;
            if (state.now - stat.mtimeMs < retentionMs) {
                continue;
            }
            if (!state.dryRun) {
                await fs.promises.unlink(entryPath);
            }
            state.result.deletedFiles++;
            state.result.freedBytes += stat.size;
        }
        catch {
            // Locked (Windows) or otherwise unreadable — skip, retry next sweep.
            state.result.skippedEntries++;
        }
    }
}
/**
 * Sweep one `.cowork-temp` directory. Returns a zero result when the path is
 * missing or not a real directory.
 */
async function sweepCoworkTempDir(tempDir, options) {
    const result = {
        deletedFiles: 0,
        freedBytes: 0,
        totalFiles: 0,
        totalBytes: 0,
        skippedEntries: 0,
        truncated: false,
    };
    if (!(await isRealDirectory(tempDir))) {
        return result;
    }
    const state = {
        rootPrefix: path.resolve(tempDir) + path.sep,
        now: options.now ?? Date.now(),
        retentionMs: Math.max(0, options.retentionMs),
        attachmentsRetentionMs: Math.max(0, options.attachmentsRetentionMs ?? exports.COWORK_TEMP_ATTACHMENTS_RETENTION_MS),
        dryRun: options.dryRun ?? false,
        maxEntries: options.maxEntries ?? SWEEP_MAX_ENTRIES,
        maxDepth: options.maxDepth ?? MAX_SWEEP_DEPTH,
        visitedEntries: 0,
        result,
    };
    await sweepDirectory(tempDir, 0, false, state);
    return result;
}
/**
 * Measure a `.cowork-temp` directory: total size plus what a clean would
 * currently remove (scratch immediately, attachments past their retention).
 * Read-only.
 */
async function measureCoworkTempDir(tempDir, options = {}) {
    const result = await sweepCoworkTempDir(tempDir, {
        retentionMs: 0,
        dryRun: true,
        now: options.now,
        maxEntries: options.maxEntries ?? SWEEP_MAX_ENTRIES,
        maxDepth: options.maxDepth,
    });
    return {
        bytes: result.totalBytes,
        files: result.totalFiles,
        cleanableBytes: result.freedBytes,
        cleanableFiles: result.deletedFiles,
        truncated: result.truncated,
    };
}
const normalizeCwdForCompare = (cwd) => {
    const resolved = path.resolve(cwd.trim());
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
};
function createCoworkTempJanitor(deps) {
    let running = false;
    const listCandidates = () => {
        const activeCwds = new Set(deps.listActiveCwds().map(normalizeCwdForCompare));
        const seen = new Set();
        const candidates = [];
        for (const cwd of deps.listAllCwds()) {
            if (!cwd?.trim())
                continue;
            const normalized = normalizeCwdForCompare(cwd);
            if (seen.has(normalized))
                continue;
            seen.add(normalized);
            const resolvedCwd = path.resolve(cwd.trim());
            candidates.push({
                cwd: resolvedCwd,
                tempDir: getCoworkTempDirPath(resolvedCwd),
                isActive: activeCwds.has(normalized),
            });
        }
        return candidates;
    };
    return {
        async preview() {
            const preview = {
                dirs: [],
                bytes: 0,
                files: 0,
                cleanableBytes: 0,
                cleanableFiles: 0,
                truncated: false,
            };
            for (const candidate of listCandidates()) {
                if (!(await isRealDirectory(candidate.tempDir)))
                    continue;
                const usage = await measureCoworkTempDir(candidate.tempDir);
                if (usage.files === 0)
                    continue;
                const cleanableBytes = candidate.isActive ? 0 : usage.cleanableBytes;
                const cleanableFiles = candidate.isActive ? 0 : usage.cleanableFiles;
                preview.dirs.push({
                    cwd: candidate.cwd,
                    tempDir: candidate.tempDir,
                    totalBytes: usage.bytes,
                    totalFiles: usage.files,
                    cleanableBytes,
                    cleanableFiles,
                    isActive: candidate.isActive,
                    truncated: usage.truncated,
                });
                preview.bytes += usage.bytes;
                preview.files += usage.files;
                preview.cleanableBytes += cleanableBytes;
                preview.cleanableFiles += cleanableFiles;
                preview.truncated = preview.truncated || usage.truncated;
            }
            preview.dirs.sort((a, b) => b.cleanableBytes - a.cleanableBytes);
            return preview;
        },
        async clean(selectedCwds) {
            const summary = {
                sweptDirs: 0,
                deletedFiles: 0,
                freedBytes: 0,
                skippedEntries: 0,
                truncated: false,
            };
            if (running)
                return summary;
            running = true;
            try {
                const selection = selectedCwds
                    ? new Set(selectedCwds.map(normalizeCwdForCompare))
                    : null;
                for (const candidate of listCandidates()) {
                    if (candidate.isActive)
                        continue;
                    if (selection && !selection.has(normalizeCwdForCompare(candidate.cwd)))
                        continue;
                    if (!(await isRealDirectory(candidate.tempDir)))
                        continue;
                    ensureCoworkTempGitignore(candidate.tempDir);
                    const result = await sweepCoworkTempDir(candidate.tempDir, { retentionMs: 0 });
                    summary.sweptDirs++;
                    summary.deletedFiles += result.deletedFiles;
                    summary.freedBytes += result.freedBytes;
                    summary.skippedEntries += result.skippedEntries;
                    summary.truncated = summary.truncated || result.truncated;
                    if (result.deletedFiles > 0) {
                        console.debug(`[CoworkTempJanitor] cleaned ${candidate.tempDir}: ${result.deletedFiles} files, ${result.freedBytes} bytes`);
                    }
                }
                if (summary.deletedFiles > 0) {
                    console.log(`[CoworkTempJanitor] manual clean removed ${summary.deletedFiles} files (${summary.freedBytes} bytes) across ${summary.sweptDirs} dirs`);
                }
            }
            catch (error) {
                console.warn('[CoworkTempJanitor] clean failed:', error);
            }
            finally {
                running = false;
            }
            return summary;
        },
    };
}
//# sourceMappingURL=coworkTempJanitor.js.map