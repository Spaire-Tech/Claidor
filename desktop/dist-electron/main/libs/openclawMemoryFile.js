"use strict";
/**
 * OpenClaw MEMORY.md file-based memory management.
 *
 * Reads and writes the curated long-term memory file that OpenClaw's
 * memory_search / memory_get tools index automatically.
 *
 * The file is modelled as an ordered list of segments:
 *  - `entry` segments: one memory block — a top-level bullet together with
 *    its indented/lazy continuation lines, or a paragraph of prose lines.
 *  - `verbatim` segments: everything else (headings, blank lines, fenced
 *    code blocks). Preserved byte-for-byte on writes.
 *
 * `##`+ headings assign a section to the entries that follow them. Write
 * operations are surgical (append / replace-in-place / remove one block);
 * untouched segments are never re-serialised.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMainAgentWorkspacePath = getMainAgentWorkspacePath;
exports.resolveMemoryFilePath = resolveMemoryFilePath;
exports.parseMemoryMd = parseMemoryMd;
exports.serializeMemoryMd = serializeMemoryMd;
exports.readMemoryEntries = readMemoryEntries;
exports.addMemoryEntry = addMemoryEntry;
exports.updateMemoryEntry = updateMemoryEntry;
exports.deleteMemoryEntry = deleteMemoryEntry;
exports.searchMemoryEntries = searchMemoryEntries;
exports.readMemoryFileRaw = readMemoryFileRaw;
exports.writeMemoryFileRaw = writeMemoryFileRaw;
exports.migrateSqliteToMemoryMd = migrateSqliteToMemoryMd;
exports.resolveBootstrapFilePath = resolveBootstrapFilePath;
exports.readBootstrapFile = readBootstrapFile;
exports.writeBootstrapFile = writeBootstrapFile;
exports.ensureDefaultIdentity = ensureDefaultIdentity;
exports.syncMemoryFileOnWorkspaceChange = syncMemoryFileOnWorkspaceChange;
const crypto_1 = __importDefault(require("crypto"));
const electron_1 = require("electron");
const fs_1 = __importDefault(require("fs"));
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const TAG = '[Engine Memory]';
// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------
const DEFAULT_OPENCLAW_WORKSPACE = path_1.default.join(os_1.default.homedir(), '.openclaw', 'workspace');
/**
 * Return the fixed workspace path for the main agent.
 * All main-agent state files (MEMORY.md, IDENTITY.md, AGENTS.md, etc.) live here,
 * decoupled from the user-visible "working directory" (which is only used as session cwd).
 */
function getMainAgentWorkspacePath(stateDir) {
    return path_1.default.join(stateDir, 'workspace-main');
}
/**
 * Resolve the MEMORY.md path from an agent workspace directory.
 * Falls back to `~/.openclaw/workspace/MEMORY.md` when unset.
 *
 * NOTE: The parameter represents the agent's workspace path (e.g. from
 * `getMainAgentWorkspacePath()`), not the user-visible working directory.
 */
function resolveMemoryFilePath(workingDirectory) {
    const dir = (workingDirectory || '').trim();
    return path_1.default.join(dir || DEFAULT_OPENCLAW_WORKSPACE, 'MEMORY.md');
}
// ---------------------------------------------------------------------------
// Fingerprinting (matches sqliteStore.ts logic)
// ---------------------------------------------------------------------------
function normalizeForFingerprint(text) {
    return text
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
function fingerprint(text) {
    return crypto_1.default.createHash('sha1').update(normalizeForFingerprint(text)).digest('hex');
}
// ---------------------------------------------------------------------------
// Block-level parsing
// ---------------------------------------------------------------------------
const HEADER = '# User Memories';
/** Top-level Markdown bullet at column 0: `- text`. */
const TOP_BULLET_RE = /^-\s+\S/;
/** Any bullet line, indented or not; captures the text after the marker. */
const ANY_BULLET_RE = /^\s*-\s+(.*)$/;
/** Column-0 ATX heading. */
const HEADING_RE = /^(#{1,6})\s+(.*\S)\s*$/;
/** Fenced-code delimiter. */
const FENCE_RE = /^\s*(```|~~~)/;
/** Column-0 HTML comment opener (metadata markers, e.g. OpenClaw memory promotion). */
const HTML_COMMENT_OPEN_RE = /^<!--/;
/** Display/edit text for a block: first-line bullet marker stripped, rest verbatim. */
function blockDisplayText(lines) {
    const [first, ...rest] = lines;
    const match = first.match(ANY_BULLET_RE);
    return [match ? match[1] : first, ...rest].join('\n');
}
function makeEntrySegment(lines, section) {
    const text = blockDisplayText(lines);
    return {
        kind: 'entry',
        lines,
        entry: { id: fingerprint(text), text, ...(section ? { section } : {}) },
    };
}
function parseMemorySegments(content) {
    const lines = content.split(/\r?\n/);
    const segments = [];
    let verbatim = [];
    let block = null;
    let section;
    let blockSection;
    let fence = null;
    let inComment = false;
    const flushVerbatim = () => {
        if (verbatim.length > 0) {
            segments.push({ kind: 'verbatim', lines: verbatim });
            verbatim = [];
        }
    };
    const closeBlock = () => {
        if (block) {
            segments.push(makeEntrySegment(block, blockSection));
            block = null;
        }
    };
    const openBlock = (line) => {
        closeBlock();
        flushVerbatim();
        blockSection = section;
        block = [line];
    };
    for (const line of lines) {
        if (fence === 'block') {
            block.push(line);
            if (FENCE_RE.test(line))
                fence = null;
            continue;
        }
        if (fence === 'verbatim') {
            verbatim.push(line);
            if (FENCE_RE.test(line))
                fence = null;
            continue;
        }
        if (inComment) {
            verbatim.push(line);
            if (line.includes('-->'))
                inComment = false;
            continue;
        }
        // Top-level HTML comments are metadata markers, never entries.
        if (HTML_COMMENT_OPEN_RE.test(line)) {
            closeBlock();
            verbatim.push(line);
            if (!line.includes('-->'))
                inComment = true;
            continue;
        }
        if (FENCE_RE.test(line)) {
            // An indented fence inside an open block belongs to that block;
            // a top-level fence is opaque verbatim content.
            if (block && /^\s/.test(line)) {
                block.push(line);
                fence = 'block';
            }
            else {
                closeBlock();
                verbatim.push(line);
                fence = 'verbatim';
            }
            continue;
        }
        if (line.trim() === '') {
            closeBlock();
            verbatim.push(line);
            continue;
        }
        const heading = line.match(HEADING_RE);
        if (heading) {
            closeBlock();
            section = heading[1].length >= 2 ? heading[2].trim() : undefined;
            verbatim.push(line);
            continue;
        }
        if (TOP_BULLET_RE.test(line)) {
            openBlock(line);
            continue;
        }
        if (block) {
            // Indented children and lazy continuations stay in the open block.
            block.push(line);
            continue;
        }
        // Orphan content line: starts a prose (or indented-bullet) block.
        openBlock(line);
    }
    closeBlock();
    flushVerbatim();
    return { segments, trailingSection: section };
}
function segmentsToContent(segments) {
    const text = segments.flatMap((segment) => segment.lines).join('\n');
    return text.endsWith('\n') ? text : `${text}\n`;
}
/**
 * Parse a MEMORY.md file into entries (deduplicated by fingerprint,
 * first occurrence wins).
 */
function parseMemoryMd(content) {
    const { segments } = parseMemorySegments(content);
    const seen = new Set();
    const entries = [];
    for (const segment of segments) {
        if (segment.kind !== 'entry' || !segment.entry)
            continue;
        if (seen.has(segment.entry.id))
            continue;
        seen.add(segment.entry.id);
        entries.push(segment.entry);
    }
    return entries;
}
// ---------------------------------------------------------------------------
// Serialisation
// ---------------------------------------------------------------------------
/**
 * Convert user-entered text into the lines of a single bullet block.
 * Blank lines are dropped (a blank line would split the block on the next
 * parse); non-indented continuation lines are indented so they stay inside
 * the block.
 */
function serializeEntryLines(text) {
    const lines = text
        .replace(/\r\n?/g, '\n')
        .split('\n')
        .map((line) => line.replace(/\s+$/u, ''))
        .filter((line) => line.trim() !== '');
    if (lines.length === 0)
        throw new Error('Memory text is required');
    const first = lines[0].trim();
    const head = ANY_BULLET_RE.test(first) ? first : `- ${first}`;
    const rest = lines.slice(1).map((line) => (/^\s/.test(line) ? line : `  ${line}`));
    return [head, ...rest];
}
/**
 * Serialise entries to a standalone MEMORY.md document (no existing content).
 */
function serializeMemoryMd(entries) {
    if (entries.length === 0)
        return `${HEADER}\n`;
    const blocks = entries.map((entry) => serializeEntryLines(entry.text).join('\n'));
    return `${HEADER}\n\n${blocks.join('\n')}\n`;
}
// ---------------------------------------------------------------------------
// File I/O helpers
// ---------------------------------------------------------------------------
function ensureDir(filePath) {
    fs_1.default.mkdirSync(path_1.default.dirname(filePath), { recursive: true });
}
function readFileOrEmpty(filePath) {
    try {
        if (fs_1.default.existsSync(filePath) && fs_1.default.statSync(filePath).isFile()) {
            return fs_1.default.readFileSync(filePath, 'utf8');
        }
    }
    catch (error) {
        console.warn(`${TAG} Failed to read file ${filePath}:`, error instanceof Error ? error.message : error);
    }
    return '';
}
/**
 * One-time safety net: before the first block-aware write touches an existing
 * file, keep a snapshot next to it. Never overwritten afterwards.
 */
function ensureBackup(filePath, originalContent) {
    if (!originalContent.trim())
        return;
    const backupPath = `${filePath}.bak`;
    try {
        if (!fs_1.default.existsSync(backupPath)) {
            fs_1.default.writeFileSync(backupPath, originalContent, 'utf8');
            console.log(`${TAG} ensureBackup: snapshot saved to ${backupPath}`);
        }
    }
    catch (error) {
        console.warn(`${TAG} ensureBackup: failed —`, error instanceof Error ? error.message : error);
    }
}
/** Append serialised blocks after the existing content (single blank-line separator). */
function appendBlocksToContent(original, blocks) {
    const body = blocks.join('\n');
    if (!original.trim()) {
        return `${HEADER}\n\n${body}\n`;
    }
    return `${original.replace(/\s+$/u, '')}\n\n${body}\n`;
}
// ---------------------------------------------------------------------------
// CRUD operations
// ---------------------------------------------------------------------------
function readMemoryEntries(filePath) {
    return parseMemoryMd(readFileOrEmpty(filePath));
}
function addMemoryEntry(filePath, text) {
    const blockLines = serializeEntryLines(text);
    const displayText = blockDisplayText(blockLines);
    const id = fingerprint(displayText);
    const original = readFileOrEmpty(filePath);
    const { segments, trailingSection } = parseMemorySegments(original);
    const existing = segments.find((segment) => segment.kind === 'entry' && segment.entry?.id === id);
    if (existing?.entry) {
        console.log(`${TAG} addMemoryEntry: duplicate skipped (id=${id.slice(0, 8)}…)`);
        return existing.entry;
    }
    ensureDir(filePath);
    ensureBackup(filePath, original);
    fs_1.default.writeFileSync(filePath, appendBlocksToContent(original, [blockLines.join('\n')]), 'utf8');
    const entry = {
        id,
        text: displayText,
        ...(trailingSection ? { section: trailingSection } : {}),
    };
    console.log(`${TAG} addMemoryEntry: added "${displayText.slice(0, 40)}…" (id=${id.slice(0, 8)}…)`);
    return entry;
}
function updateMemoryEntry(filePath, id, newText) {
    const blockLines = serializeEntryLines(newText);
    const displayText = blockDisplayText(blockLines);
    const original = readFileOrEmpty(filePath);
    const { segments } = parseMemorySegments(original);
    const index = segments.findIndex((segment) => segment.kind === 'entry' && segment.entry?.id === id);
    if (index === -1) {
        console.warn(`${TAG} updateMemoryEntry: entry not found (id=${id.slice(0, 8)}…)`);
        return null;
    }
    const target = segments[index];
    const section = target.entry?.section;
    // Note: ID changes because it's content-based (fingerprint of text)
    const updated = {
        id: fingerprint(displayText),
        text: displayText,
        ...(section ? { section } : {}),
    };
    if (target.entry?.text === displayText) {
        return updated;
    }
    const oldText = target.entry?.text ?? '';
    segments[index] = { kind: 'entry', lines: blockLines, entry: updated };
    ensureDir(filePath);
    ensureBackup(filePath, original);
    fs_1.default.writeFileSync(filePath, segmentsToContent(segments), 'utf8');
    console.log(`${TAG} updateMemoryEntry: "${oldText.slice(0, 30)}…" → "${displayText.slice(0, 30)}…"`);
    return updated;
}
function deleteMemoryEntry(filePath, id) {
    const original = readFileOrEmpty(filePath);
    const { segments } = parseMemorySegments(original);
    const index = segments.findIndex((segment) => segment.kind === 'entry' && segment.entry?.id === id);
    if (index === -1) {
        console.warn(`${TAG} deleteMemoryEntry: entry not found (id=${id.slice(0, 8)}…)`);
        return false;
    }
    const removedText = segments[index].entry?.text;
    segments.splice(index, 1);
    // Collapse the now-doubled blank separator around the removed block.
    const prev = index > 0 ? segments[index - 1] : undefined;
    const next = index < segments.length ? segments[index] : undefined;
    if (prev?.kind === 'verbatim' &&
        next?.kind === 'verbatim' &&
        prev.lines[prev.lines.length - 1]?.trim() === '' &&
        next.lines[0]?.trim() === '') {
        prev.lines.pop();
    }
    ensureDir(filePath);
    ensureBackup(filePath, original);
    fs_1.default.writeFileSync(filePath, segmentsToContent(segments), 'utf8');
    console.log(`${TAG} deleteMemoryEntry: removed "${removedText?.slice(0, 40)}…"`);
    return true;
}
function searchMemoryEntries(filePath, query) {
    const q = query.toLowerCase().trim();
    if (!q)
        return readMemoryEntries(filePath);
    const all = readMemoryEntries(filePath);
    const results = all.filter((entry) => entry.text.toLowerCase().includes(q) || entry.section?.toLowerCase().includes(q));
    console.log(`${TAG} searchMemoryEntries: query="${q}" → ${results.length}/${all.length} matched`);
    return results;
}
// ---------------------------------------------------------------------------
// Raw file access (settings "raw" editing mode)
// ---------------------------------------------------------------------------
function readMemoryFileRaw(filePath) {
    return readFileOrEmpty(filePath);
}
function writeMemoryFileRaw(filePath, content) {
    ensureDir(filePath);
    const original = readFileOrEmpty(filePath);
    ensureBackup(filePath, original);
    const next = content === '' || content.endsWith('\n') ? content : `${content}\n`;
    fs_1.default.writeFileSync(filePath, next, 'utf8');
    console.log(`${TAG} writeMemoryFileRaw: wrote ${next.length} chars to ${filePath}`);
}
// ---------------------------------------------------------------------------
// Bulk append (migration, workspace sync)
// ---------------------------------------------------------------------------
/**
 * Fingerprints already present in the file: block ids plus per-line
 * fingerprints of entry-block lines, so a single-line text that now lives
 * inside a larger block is not appended again.
 */
function collectExistingFingerprints(segments) {
    const fps = new Set();
    for (const segment of segments) {
        if (segment.kind !== 'entry')
            continue;
        if (segment.entry)
            fps.add(segment.entry.id);
        for (const line of segment.lines) {
            const match = line.match(ANY_BULLET_RE);
            const lineText = (match ? match[1] : line).trim();
            if (lineText)
                fps.add(fingerprint(lineText));
        }
    }
    return fps;
}
/** Append the given texts as blocks, skipping ones that already exist. */
function appendMemoryTexts(filePath, texts) {
    const original = readFileOrEmpty(filePath);
    const { segments } = parseMemorySegments(original);
    const existing = collectExistingFingerprints(segments);
    const blocks = [];
    for (const raw of texts) {
        let blockLines;
        try {
            blockLines = serializeEntryLines(raw);
        }
        catch {
            continue;
        }
        const id = fingerprint(blockDisplayText(blockLines));
        if (existing.has(id))
            continue;
        existing.add(id);
        blocks.push(blockLines.join('\n'));
    }
    if (blocks.length === 0)
        return 0;
    ensureDir(filePath);
    ensureBackup(filePath, original);
    fs_1.default.writeFileSync(filePath, appendBlocksToContent(original, blocks), 'utf8');
    return blocks.length;
}
/**
 * Migrate old SQLite user_memories to MEMORY.md.
 * Returns the number of entries migrated (0 if already done or nothing to migrate).
 */
function migrateSqliteToMemoryMd(filePath, source) {
    if (source.isMigrationDone())
        return 0;
    console.log(`${TAG} Migration: starting SQLite → MEMORY.md migration (target: ${filePath})`);
    const texts = source.getActiveMemoryTexts();
    if (texts.length === 0) {
        console.log(`${TAG} Migration: no active SQLite memories found, marking done`);
        source.markMigrationDone();
        return 0;
    }
    try {
        const added = appendMemoryTexts(filePath, texts);
        console.log(`${TAG} Migration: completed — added=${added}, skipped(duplicate)=${texts.length - added}`);
        source.markMigrationDone();
        return added;
    }
    catch (error) {
        console.error(`${TAG} Migration: FAILED —`, error instanceof Error ? error.message : error);
        // Do NOT mark done so it retries next time
        return 0;
    }
}
// ---------------------------------------------------------------------------
// Bootstrap file management (IDENTITY.md, USER.md, SOUL.md)
// ---------------------------------------------------------------------------
const DEFAULT_IDENTITY_ZH = '你的名字是 Caisra，一个在这台电脑上工作的个人助理。你全天候在线，能够自主处理日常工作：数据分析、演示文稿、文档撰写、资料研究、邮件工作流、定时任务等。你和你所服务的人共享同一个工作空间。';
const DEFAULT_IDENTITY_EN = 'Your name is Caisra, a personal assistant that works on this computer. You are available around the clock and can handle everyday work autonomously: data analysis, presentations, documents, research, email workflows, scheduled jobs and more. You and the person you work for share the same workspace.';
function getDefaultIdentity() {
    try {
        const locale = electron_1.app.getLocale();
        return locale.startsWith('zh') ? DEFAULT_IDENTITY_ZH : DEFAULT_IDENTITY_EN;
    }
    catch {
        return DEFAULT_IDENTITY_EN;
    }
}
const BOOTSTRAP_ALLOWLIST = new Set(['IDENTITY.md', 'USER.md', 'SOUL.md']);
function validateBootstrapFilename(filename) {
    if (!BOOTSTRAP_ALLOWLIST.has(filename)) {
        throw new Error(`Invalid bootstrap filename: ${filename}. Allowed: ${[...BOOTSTRAP_ALLOWLIST].join(', ')}`);
    }
}
/**
 * Resolve the path to a bootstrap file in the agent workspace directory.
 *
 * NOTE: The parameter represents the agent's workspace path (e.g. from
 * `getMainAgentWorkspacePath()`), not the user-visible working directory.
 */
function resolveBootstrapFilePath(workingDirectory, filename) {
    validateBootstrapFilename(filename);
    const dir = (workingDirectory || '').trim();
    return path_1.default.join(dir || DEFAULT_OPENCLAW_WORKSPACE, filename);
}
/**
 * Read a bootstrap file's content. Returns empty string if file doesn't exist.
 */
function readBootstrapFile(workingDirectory, filename) {
    const filePath = resolveBootstrapFilePath(workingDirectory, filename);
    return readFileOrEmpty(filePath);
}
/**
 * Write content to a bootstrap file, creating the directory if needed.
 */
function writeBootstrapFile(workingDirectory, filename, content) {
    const filePath = resolveBootstrapFilePath(workingDirectory, filename);
    ensureDir(filePath);
    fs_1.default.writeFileSync(filePath, content, 'utf8');
    console.log(`${TAG} writeBootstrapFile: wrote ${filename} (${content.length} chars) to ${filePath}`);
}
/**
 * Ensure IDENTITY.md exists in the workspace with built-in default content.
 * Only writes if the file doesn't exist or is empty — never overwrites user content.
 */
function ensureDefaultIdentity(workingDirectory) {
    const filePath = resolveBootstrapFilePath(workingDirectory, 'IDENTITY.md');
    const existing = readFileOrEmpty(filePath);
    if (existing.trim())
        return; // already has content, don't overwrite
    const defaultContent = getDefaultIdentity();
    ensureDir(filePath);
    fs_1.default.writeFileSync(filePath, defaultContent, 'utf8');
    console.log(`${TAG} ensureDefaultIdentity: wrote default IDENTITY.md to ${filePath}`);
}
// ---------------------------------------------------------------------------
// Workspace change sync
// ---------------------------------------------------------------------------
/**
 * Sync MEMORY.md when workspace directory changes.
 * Copies entries from old path to new path (merge-dedup, keeps old file as backup).
 *
 * Primarily used by the one-time migration from user working directory to
 * the fixed `{STATE_DIR}/workspace-main/` path.
 */
function syncMemoryFileOnWorkspaceChange(oldWorkingDirectory, newWorkingDirectory) {
    const oldPath = resolveMemoryFilePath(oldWorkingDirectory);
    const newPath = resolveMemoryFilePath(newWorkingDirectory);
    if (oldPath === newPath) {
        console.log(`${TAG} Workspace sync: same path, skipping`);
        return { synced: false };
    }
    console.log(`${TAG} Workspace sync: ${oldPath} → ${newPath}`);
    try {
        const oldContent = readFileOrEmpty(oldPath);
        if (!oldContent.trim()) {
            console.log(`${TAG} Workspace sync: old MEMORY.md empty or missing, skipping`);
            return { synced: false };
        }
        const oldEntries = parseMemoryMd(oldContent);
        if (oldEntries.length === 0) {
            console.log(`${TAG} Workspace sync: old MEMORY.md has no entries, skipping`);
            return { synced: false };
        }
        const added = appendMemoryTexts(newPath, oldEntries.map((entry) => entry.text));
        // Ensure memory/ directory exists for OpenClaw daily logs
        const memoryDir = path_1.default.join((newWorkingDirectory || '').trim() || DEFAULT_OPENCLAW_WORKSPACE, 'memory');
        if (!fs_1.default.existsSync(memoryDir)) {
            console.log(`${TAG} Workspace sync: creating memory/ dir at ${memoryDir}`);
            fs_1.default.mkdirSync(memoryDir, { recursive: true });
        }
        console.log(`${TAG} Workspace sync: done — copied ${added} new entries (old=${oldEntries.length})`);
        return { synced: true };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error(`${TAG} Workspace sync: FAILED —`, message);
        return { synced: false, error: message };
    }
}
//# sourceMappingURL=openclawMemoryFile.js.map