"use strict";
/**
 * One-time migration: move main agent workspace files from the user's
 * configured working directory to the fixed `{STATE_DIR}/workspace-main/`
 * path, so the main agent workspace is decoupled from the working directory.
 *
 * Safe to call multiple times - uses a kv flag for idempotency.
 * Never deletes source files.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.migrateMainAgentWorkspace = migrateMainAgentWorkspace;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const constants_1 = require("../../shared/openclawEngine/constants");
const openclawMemoryFile_1 = require("./openclawMemoryFile");
const TAG = '[Engine Migration]';
const MIGRATION_KEY = 'migration.mainAgentWorkspace.v3.completed';
const BOOTSTRAP_FILES = ['IDENTITY.md', 'USER.md', 'SOUL.md', 'TOOLS.md', 'BOOTSTRAP.md'];
function mergeResult(results) {
    return {
        changed: results.some((result) => result.changed),
        error: results.some((result) => result.error),
    };
}
function isNonEmptyFile(filePath) {
    try {
        return fs_1.default.statSync(filePath).isFile() && fs_1.default.readFileSync(filePath, 'utf8').trim().length > 0;
    }
    catch {
        return false;
    }
}
function readNonEmptyText(filePath) {
    try {
        if (!fs_1.default.existsSync(filePath) || !fs_1.default.statSync(filePath).isFile())
            return null;
        const content = fs_1.default.readFileSync(filePath, 'utf8');
        return content.trim() ? content : null;
    }
    catch {
        return null;
    }
}
function buildConflictPath(dest) {
    const parsed = path_1.default.parse(dest);
    const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
    let candidate = path_1.default.join(parsed.dir, `${parsed.name}.migrated-${stamp}${parsed.ext}`);
    let index = 1;
    while (fs_1.default.existsSync(candidate)) {
        candidate = path_1.default.join(parsed.dir, `${parsed.name}.migrated-${stamp}-${index}${parsed.ext}`);
        index++;
    }
    return candidate;
}
function copyFilePreservingDestination(src, dest) {
    try {
        const srcContent = readNonEmptyText(src);
        if (!srcContent)
            return { changed: false, error: false };
        if (!fs_1.default.existsSync(dest) || !isNonEmptyFile(dest)) {
            fs_1.default.mkdirSync(path_1.default.dirname(dest), { recursive: true });
            fs_1.default.writeFileSync(dest, srcContent, 'utf8');
            return { changed: true, error: false };
        }
        const destContent = fs_1.default.readFileSync(dest, 'utf8');
        if (destContent === srcContent)
            return { changed: false, error: false };
        const conflictPath = buildConflictPath(dest);
        fs_1.default.writeFileSync(conflictPath, srcContent, 'utf8');
        console.warn(`${TAG} Preserved conflicting file as ${conflictPath}`);
        return { changed: true, error: false };
    }
    catch (err) {
        console.warn(`${TAG} Failed to copy ${src} to ${dest}:`, err instanceof Error ? err.message : err);
        return { changed: false, error: true };
    }
}
/**
 * Copy a file from `src` to `dest` only if `src` exists and `dest` is
 * missing or empty.
 */
function copyIfNeeded(src, dest) {
    try {
        const srcContent = readNonEmptyText(src);
        if (!srcContent)
            return { changed: false, error: false };
        // Don't overwrite non-empty destination
        if (isNonEmptyFile(dest)) {
            return { changed: false, error: false };
        }
        fs_1.default.mkdirSync(path_1.default.dirname(dest), { recursive: true });
        fs_1.default.writeFileSync(dest, srcContent, 'utf8');
        return { changed: true, error: false };
    }
    catch (err) {
        console.warn(`${TAG} Failed to copy ${src} to ${dest}:`, err instanceof Error ? err.message : err);
        return { changed: false, error: true };
    }
}
/**
 * Recursively merge a directory without overwriting non-empty destination files.
 */
function mergeDirIfNeeded(src, dest) {
    try {
        if (!fs_1.default.existsSync(src) || !fs_1.default.statSync(src).isDirectory()) {
            return { changed: false, error: false };
        }
        fs_1.default.mkdirSync(dest, { recursive: true });
        const results = [];
        for (const entry of fs_1.default.readdirSync(src, { withFileTypes: true })) {
            const srcPath = path_1.default.join(src, entry.name);
            const destPath = path_1.default.join(dest, entry.name);
            if (entry.isDirectory()) {
                results.push(mergeDirIfNeeded(srcPath, destPath));
            }
            else if (entry.isFile()) {
                results.push(copyFilePreservingDestination(srcPath, destPath));
            }
        }
        return mergeResult(results);
    }
    catch (err) {
        console.warn(`${TAG} Failed to merge directory ${src} to ${dest}:`, err instanceof Error ? err.message : err);
        return { changed: false, error: true };
    }
}
function extractAgentsUserContent(content) {
    const markerIndex = (0, constants_1.findAgentsMdManagedMarker)(content)?.index ?? -1;
    const userContent = markerIndex >= 0 ? content.slice(0, markerIndex) : content;
    return userContent.trim();
}
function mergeAgentsMdUserContent(src, dest) {
    try {
        const srcContent = readNonEmptyText(src);
        if (!srcContent)
            return { changed: false, error: false };
        const srcUserContent = extractAgentsUserContent(srcContent);
        if (!srcUserContent)
            return { changed: false, error: false };
        let destContent = '';
        try {
            destContent = fs_1.default.readFileSync(dest, 'utf8');
        }
        catch {
            // Destination does not exist yet.
        }
        if (destContent.includes(srcUserContent)) {
            return { changed: false, error: false };
        }
        const markerIndex = (0, constants_1.findAgentsMdManagedMarker)(destContent)?.index ?? -1;
        let nextContent;
        if (!destContent.trim()) {
            nextContent = `${srcUserContent}\n`;
        }
        else if (markerIndex >= 0) {
            const destUserContent = destContent.slice(0, markerIndex).trim();
            const managedContent = destContent.slice(markerIndex).trimStart();
            nextContent = destUserContent
                ? `${destUserContent}\n\n${srcUserContent}\n\n${managedContent}`
                : `${srcUserContent}\n\n${managedContent}`;
            if (!nextContent.endsWith('\n'))
                nextContent += '\n';
        }
        else {
            nextContent = `${destContent.trimEnd()}\n\n${srcUserContent}\n`;
        }
        fs_1.default.mkdirSync(path_1.default.dirname(dest), { recursive: true });
        fs_1.default.writeFileSync(dest, nextContent, 'utf8');
        return { changed: true, error: false };
    }
    catch (err) {
        console.warn(`${TAG} Failed to migrate AGENTS.md user content:`, err instanceof Error ? err.message : err);
        return { changed: false, error: true };
    }
}
/**
 * Migrate main agent workspace files from the old working directory to
 * `{STATE_DIR}/workspace-main/`.
 */
function migrateMainAgentWorkspace(stateDir, oldWorkingDirectory, store) {
    // Already completed - skip
    if (store.get(MIGRATION_KEY) === '1')
        return;
    const oldDir = (oldWorkingDirectory || '').trim();
    const newDir = (0, openclawMemoryFile_1.getMainAgentWorkspacePath)(stateDir);
    console.log(`${TAG} Starting main agent workspace migration: ${oldDir || '(empty)'} to ${newDir}`);
    // Ensure destination exists
    try {
        fs_1.default.mkdirSync(newDir, { recursive: true });
    }
    catch (err) {
        console.warn(`${TAG} Failed to create destination workspace:`, err instanceof Error ? err.message : err);
        return;
    }
    // Skip if source and destination are the same path
    if (oldDir && path_1.default.resolve(oldDir) === path_1.default.resolve(newDir)) {
        console.log(`${TAG} Source and destination are identical, marking done`);
        store.set(MIGRATION_KEY, '1');
        return;
    }
    if (!oldDir) {
        console.log(`${TAG} No previous working directory configured, marking done`);
        store.set(MIGRATION_KEY, '1');
        return;
    }
    // 1. Migrate memory/ directory (daily logs)
    //    Must run BEFORE MEMORY.md sync because syncMemoryFileOnWorkspaceChange
    //    creates an empty memory/ dir as a side effect, which would cause
    //    copyDirIfNeeded to skip the copy.
    const oldMemoryDir = path_1.default.join(oldDir, 'memory');
    const newMemoryDir = path_1.default.join(newDir, 'memory');
    const results = [];
    const memoryResult = mergeDirIfNeeded(oldMemoryDir, newMemoryDir);
    results.push(memoryResult);
    if (memoryResult.changed) {
        console.log(`${TAG} Migrated memory/ directory`);
    }
    // 2. Migrate MEMORY.md via merge-dedup
    try {
        const result = (0, openclawMemoryFile_1.syncMemoryFileOnWorkspaceChange)(oldDir, newDir);
        console.log(`${TAG} MEMORY.md migration: synced=${result.synced}${result.error ? `, error=${result.error}` : ''}`);
        if (result.error) {
            results.push({ changed: false, error: true });
        }
    }
    catch (err) {
        console.warn(`${TAG} MEMORY.md migration failed:`, err instanceof Error ? err.message : err);
        results.push({ changed: false, error: true });
    }
    // 3. Migrate AGENTS.md user-authored content only. The managed section is
    // rebuilt by openclawConfigSync.
    const agentsResult = mergeAgentsMdUserContent(path_1.default.join(oldDir, 'AGENTS.md'), path_1.default.join(newDir, 'AGENTS.md'));
    results.push(agentsResult);
    if (agentsResult.changed) {
        console.log(`${TAG} Migrated AGENTS.md user content`);
    }
    // 4. Migrate bootstrap files.
    for (const filename of BOOTSTRAP_FILES) {
        const src = path_1.default.join(oldDir, filename);
        const dest = path_1.default.join(newDir, filename);
        const result = copyIfNeeded(src, dest);
        results.push(result);
        if (result.changed) {
            console.log(`${TAG} Migrated ${filename}`);
        }
    }
    if (results.some((result) => result.error)) {
        console.warn(`${TAG} Main agent workspace migration completed with errors; it will retry on next startup`);
        return;
    }
    // Mark as completed
    store.set(MIGRATION_KEY, '1');
    console.log(`${TAG} Main agent workspace migration completed`);
}
//# sourceMappingURL=openclawWorkspaceMigration.js.map