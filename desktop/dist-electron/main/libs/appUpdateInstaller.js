"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WINDOWS_UAC_DECLINED_EXIT_CODE = exports.WINDOWS_NO_DEFENDER_EXCLUSION_ARG = exports.WINDOWS_UPDATE_INSTALL_ARGS = exports.MAC_SWAP_ROLLED_BACK_EXIT_CODE = exports.MAC_SWAP_BACKUP_INFIX = exports.MAC_SWAP_STAGING_INFIX = exports.MAC_UPDATE_MOUNT_DIR_PREFIX = exports.WindowsInstallerLauncherFallback = void 0;
exports.cancelActiveDownload = cancelActiveDownload;
exports.downloadUpdate = downloadUpdate;
exports.installUpdate = installUpdate;
exports.parseHdiutilAttachOutput = parseHdiutilAttachOutput;
exports.findAttachedDevEntries = findAttachedDevEntries;
exports.buildMacSwapPaths = buildMacSwapPaths;
exports.buildMacSwapInstallCommand = buildMacSwapInstallCommand;
exports.buildWindowsPowerShellCandidatePaths = buildWindowsPowerShellCandidatePaths;
exports.resolveWindowsPowerShellPath = resolveWindowsPowerShellPath;
exports.buildWindowsInstallerLaunchScript = buildWindowsInstallerLaunchScript;
const child_process_1 = require("child_process");
const electron_1 = require("electron");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const stream_1 = require("stream");
const promises_1 = require("stream/promises");
const constants_1 = require("../../shared/appUpdate/constants");
const appQuitConfirmation_1 = require("./appQuitConfirmation");
const appUpdateUrlPolicy_1 = require("./appUpdateUrlPolicy");
exports.WindowsInstallerLauncherFallback = {
    None: 'none',
    WizardNoArgs: 'wizard-no-args',
};
function formatDownloadUrlForLog(rawUrl) {
    if (process.platform !== 'win32') {
        return rawUrl;
    }
    try {
        const url = new URL(rawUrl);
        return `${url.origin}${url.pathname}`;
    }
    catch {
        return '[invalid-url]';
    }
}
let activeDownloadController = null;
function cancelActiveDownload() {
    if (activeDownloadController) {
        console.log('[AppUpdate] Download cancelled by user');
        activeDownloadController.abort('cancelled');
        activeDownloadController = null;
        return true;
    }
    return false;
}
/** Escape a string for safe use as a single-quoted POSIX shell argument. */
function shellEscape(s) {
    return `'${s.replace(/'/g, "'\\''")}'`;
}
function execAsync(command, timeoutMs = 120_000) {
    return new Promise((resolve, reject) => {
        (0, child_process_1.exec)(command, { maxBuffer: 10 * 1024 * 1024, timeout: timeoutMs }, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(`${error.message}\nstderr: ${stderr}`));
            }
            else {
                resolve(stdout.trim());
            }
        });
    });
}
/** Minimum interval between progress IPC events (ms). */
const PROGRESS_THROTTLE_MS = 200;
/** Abort download if no data received for this duration (ms). */
const DOWNLOAD_INACTIVITY_TIMEOUT_MS = 60_000;
async function downloadUpdate(url, source, onProgress) {
    if (activeDownloadController) {
        throw new Error('A download is already in progress');
    }
    let validatedWindowsInputUrl = null;
    if (process.platform === 'win32') {
        try {
            validatedWindowsInputUrl = (0, appUpdateUrlPolicy_1.assertTrustedWindowsInstallerUrl)(url);
        }
        catch (error) {
            const reason = error instanceof appUpdateUrlPolicy_1.AppUpdateUrlUntrustedError
                ? error.reason
                : 'unknown';
            console.error(`[AppUpdate] Rejected unsafe Windows installer URL, reason=${reason}`);
            throw error;
        }
    }
    console.log(`[AppUpdate] Starting download: ${formatDownloadUrlForLog(url)}`);
    // Validate URL
    let parsedUrl;
    try {
        parsedUrl = new URL(url);
    }
    catch {
        throw new Error(`Invalid download URL: ${url}`);
    }
    const ext = path_1.default.extname(parsedUrl.pathname) || (process.platform === 'darwin' ? '.dmg' : '.exe');
    const updateDir = path_1.default.join(electron_1.app.getPath('userData'), 'updates');
    const ts = Date.now();
    const downloadPath = path_1.default.join(updateDir, `lobsterai-update-${source}-${ts}${ext}.download`);
    const finalPath = path_1.default.join(updateDir, `lobsterai-update-${source}-${ts}${ext}`);
    console.log(`[AppUpdate] Temp path: ${downloadPath}`);
    console.log(`[AppUpdate] Final path: ${finalPath}`);
    const controller = new AbortController();
    activeDownloadController = controller;
    let writeStream = null;
    let inactivityTimer = null;
    const clearInactivityTimer = () => {
        if (inactivityTimer) {
            clearTimeout(inactivityTimer);
            inactivityTimer = null;
        }
    };
    const resetInactivityTimer = () => {
        clearInactivityTimer();
        inactivityTimer = setTimeout(() => {
            console.error('[AppUpdate] Download inactivity timeout (60s), aborting');
            controller.abort('timeout');
        }, DOWNLOAD_INACTIVITY_TIMEOUT_MS);
    };
    try {
        const response = await electron_1.session.defaultSession.fetch(url, {
            signal: controller.signal,
            // Electron documents Response.url as unreliable for session.fetch().
            // Reject Windows redirects so the validated input remains the download
            // source without relying on that field for final-URL provenance.
            ...(process.platform === 'win32' ? { redirect: 'error' } : {}),
        });
        console.log(`[AppUpdate] HTTP response: ${response.status} ${response.statusText}`);
        if (!response.ok) {
            throw new Error(`Download failed (HTTP ${response.status})`);
        }
        if (!response.body) {
            throw new Error('Response has no body');
        }
        const totalHeader = response.headers.get('content-length');
        const total = totalHeader ? Number(totalHeader) : undefined;
        console.log(`[AppUpdate] Content-Length: ${totalHeader ?? 'unknown'}`);
        let received = 0;
        let lastSpeedTime = Date.now();
        let lastSpeedBytes = 0;
        let currentSpeed = undefined;
        let lastProgressTime = 0;
        const emitProgress = () => {
            onProgress({
                received,
                total: total && Number.isFinite(total) ? total : undefined,
                percent: total && Number.isFinite(total) ? received / total : undefined,
                speed: currentSpeed,
            });
        };
        // Emit initial progress
        emitProgress();
        await fs_1.default.promises.mkdir(updateDir, { recursive: true });
        writeStream = fs_1.default.createWriteStream(downloadPath);
        const nodeStream = stream_1.Readable.fromWeb(response.body);
        // Start inactivity timer
        resetInactivityTimer();
        nodeStream.on('data', (chunk) => {
            received += chunk.length;
            // Reset inactivity timer on each chunk
            resetInactivityTimer();
            // Calculate speed with 1-second window
            const now = Date.now();
            const elapsed = now - lastSpeedTime;
            if (elapsed >= 1000) {
                currentSpeed = ((received - lastSpeedBytes) / elapsed) * 1000;
                lastSpeedTime = now;
                lastSpeedBytes = received;
            }
            // Throttle progress events to avoid flooding IPC channel
            if (now - lastProgressTime >= PROGRESS_THROTTLE_MS) {
                lastProgressTime = now;
                emitProgress();
            }
        });
        await (0, promises_1.pipeline)(nodeStream, writeStream);
        writeStream = null;
        clearInactivityTimer();
        // Validate downloaded file
        const stat = await fs_1.default.promises.stat(downloadPath);
        console.log(`[AppUpdate] Download complete: ${stat.size} bytes`);
        if (stat.size === 0) {
            throw new Error('Downloaded file is empty');
        }
        if (total && Number.isFinite(total) && stat.size !== total) {
            throw new Error(`Download incomplete: expected ${total} bytes but got ${stat.size}`);
        }
        // Rename to final path (atomic on same filesystem)
        await fs_1.default.promises.rename(downloadPath, finalPath);
        console.log(`[AppUpdate] File saved to: ${finalPath}`);
        // Emit final 100% progress
        onProgress({
            received,
            total: total && Number.isFinite(total) ? total : received,
            percent: 1,
            speed: currentSpeed,
        });
        return {
            filePath: finalPath,
            ...(validatedWindowsInputUrl
                ? {
                    windowsInstallerUrlPolicyReceipt: {
                        policyVersion: appUpdateUrlPolicy_1.WINDOWS_INSTALLER_URL_POLICY_VERSION,
                        inputOrigin: validatedWindowsInputUrl.origin,
                        finalOrigin: validatedWindowsInputUrl.origin,
                    },
                }
                : {}),
        };
    }
    catch (error) {
        clearInactivityTimer();
        console.error('[AppUpdate] Download error:', error);
        // Clean up partial download
        try {
            if (writeStream) {
                writeStream.destroy();
            }
            await fs_1.default.promises.unlink(downloadPath).catch(() => { });
        }
        catch {
            // Ignore cleanup errors
        }
        if (controller.signal.aborted) {
            if (controller.signal.reason === 'timeout') {
                throw new Error('Download timed out: no data received for 60 seconds');
            }
            throw new Error('Download cancelled');
        }
        throw error;
    }
    finally {
        // A cancelled flow can be replaced before its rejected pipeline reaches
        // this finally block. Do not let the stale flow clear the replacement's
        // controller, otherwise the new download can no longer be cancelled.
        if (activeDownloadController === controller) {
            activeDownloadController = null;
        }
    }
}
async function installUpdate(filePath, options) {
    console.log(`[AppUpdate] Installing update from: ${filePath}`);
    console.log(`[AppUpdate] Platform: ${process.platform}, Arch: ${process.arch}`);
    // Verify the file exists before attempting install
    try {
        const stat = await fs_1.default.promises.stat(filePath);
        console.log(`[AppUpdate] Installer file size: ${stat.size} bytes`);
        if (stat.size === 0) {
            throw new Error('Update file is empty');
        }
    }
    catch (error) {
        if (error.code === 'ENOENT') {
            throw new Error('Update file not found');
        }
        throw error;
    }
    if (process.platform === 'darwin') {
        return installMacDmg(filePath);
    }
    if (process.platform === 'win32') {
        return installWindowsNsis(filePath, options);
    }
    throw new Error('Unsupported platform');
}
/** Prefix of explicit DMG mount point directories under userData/updates. */
exports.MAC_UPDATE_MOUNT_DIR_PREFIX = 'mnt-';
const HDIUTIL_ATTACH_TIMEOUT_MS = 60_000;
const HDIUTIL_DETACH_TIMEOUT_MS = 30_000;
/**
 * Parse `hdiutil attach -plist` output (converted to JSON). hdiutil exits 0
 * even when the image attaches but the volume fails to mount; that case shows
 * up as entities without any mount-point and is reported as data rather than
 * an error. Entity order is not device order, so callers must not assume
 * devEntries[0] is the root device.
 */
function parseHdiutilAttachOutput(json) {
    const devEntries = [];
    let mountPoint;
    try {
        const data = JSON.parse(json);
        const entities = Array.isArray(data['system-entities']) ? data['system-entities'] : [];
        for (const entity of entities) {
            if (typeof entity !== 'object' || entity === null) {
                continue;
            }
            const record = entity;
            const dev = record['dev-entry'];
            if (typeof dev === 'string' && dev) {
                devEntries.push(dev);
            }
            const mp = record['mount-point'];
            if (!mountPoint && typeof mp === 'string' && mp) {
                mountPoint = mp;
            }
        }
    }
    catch {
        // Malformed output is handled by callers as "no mount point".
    }
    return { mountPoint, devEntries };
}
/**
 * Extract the dev entries of an attached image from `hdiutil info -plist`
 * output (converted to JSON), matched by image path.
 */
function findAttachedDevEntries(json, imagePath) {
    try {
        const data = JSON.parse(json);
        const images = Array.isArray(data.images) ? data.images : [];
        for (const image of images) {
            if (typeof image !== 'object' || image === null) {
                continue;
            }
            const record = image;
            if (record['image-path'] !== imagePath) {
                continue;
            }
            const entities = Array.isArray(record['system-entities']) ? record['system-entities'] : [];
            const devEntries = [];
            for (const entity of entities) {
                const dev = typeof entity === 'object' && entity !== null
                    ? entity['dev-entry']
                    : undefined;
                if (typeof dev === 'string' && dev) {
                    devEntries.push(dev);
                }
            }
            if (devEntries.length) {
                return devEntries;
            }
        }
    }
    catch {
        // Best-effort lookup for cleanup only.
    }
    return [];
}
function plistToJson(xml) {
    return new Promise((resolve, reject) => {
        const child = (0, child_process_1.spawn)('plutil', ['-convert', 'json', '-o', '-', '-']);
        let stdout = '';
        let stderr = '';
        child.stdout.setEncoding('utf8');
        child.stderr.setEncoding('utf8');
        child.stdout.on('data', (chunk) => {
            stdout += chunk;
        });
        child.stderr.on('data', (chunk) => {
            stderr += chunk;
        });
        child.on('error', reject);
        child.on('close', (code) => {
            if (code === 0) {
                resolve(stdout);
            }
            else {
                reject(new Error(`plutil exited with code ${code}: ${stderr.trim()}`));
            }
        });
        // plutil may exit before consuming stdin; without a handler the EPIPE
        // would crash the process instead of rejecting via 'close'.
        child.stdin.on('error', () => { });
        child.stdin.end(xml);
    });
}
async function attachDmg(dmgPath, explicitMountPoint) {
    const mountPointArg = explicitMountPoint
        ? ` -mountpoint ${shellEscape(explicitMountPoint)}`
        : '';
    const rawOutput = await execAsync(`hdiutil attach ${shellEscape(dmgPath)} -nobrowse -noautoopen -noverify -plist${mountPointArg}`, HDIUTIL_ATTACH_TIMEOUT_MS);
    try {
        const json = await plistToJson(rawOutput);
        return { ...parseHdiutilAttachOutput(json), rawOutput };
    }
    catch (error) {
        console.error('[AppUpdate] failed to convert hdiutil attach output to JSON:', error);
        return { devEntries: [], rawOutput };
    }
}
/** Detaching any device of an image tears down the whole attachment, so stop at the first success. */
async function detachDevEntriesBestEffort(devEntries) {
    for (const dev of devEntries) {
        try {
            await execAsync(`hdiutil detach ${shellEscape(dev)} -force`, HDIUTIL_DETACH_TIMEOUT_MS);
            return true;
        }
        catch {
            // The device may already be gone; try the next entry.
        }
    }
    return false;
}
/**
 * Detach a leftover attachment of this DMG. A stale attachment makes every
 * subsequent `hdiutil attach` return the attached-but-unmounted device table
 * in ~100ms, so retries would fail forever without this cleanup.
 */
async function cleanupStaleAttachment(dmgPath, knownDevEntries) {
    let devEntries = knownDevEntries;
    if (!devEntries.length) {
        try {
            const infoXml = await execAsync('hdiutil info -plist', HDIUTIL_ATTACH_TIMEOUT_MS);
            devEntries = findAttachedDevEntries(await plistToJson(infoXml), dmgPath);
        }
        catch (error) {
            console.warn('[AppUpdate] failed to inspect attached images:', error);
        }
    }
    if (!devEntries.length) {
        console.warn('[AppUpdate] no attached devices found for the DMG, nothing to detach');
        return;
    }
    if (await detachDevEntriesBestEffort(devEntries)) {
        console.log(`[AppUpdate] detached stale image attachment (${devEntries.join(', ')})`);
    }
    else {
        console.warn(`[AppUpdate] failed to detach stale image attachment (${devEntries.join(', ')})`);
    }
}
/**
 * Hand the DMG to Finder as a last resort. When mounting is blocked
 * system-wide (security tooling, broken /Volumes permissions), Finder
 * surfaces the real system error to the user, which the hidden hdiutil path
 * never can.
 */
async function openDmgForManualInstall(dmgPath) {
    try {
        const openError = await electron_1.shell.openPath(dmgPath);
        if (openError) {
            console.warn(`[AppUpdate] failed to open DMG in Finder: ${openError}`);
            electron_1.shell.showItemInFolder(dmgPath);
        }
    }
    catch (error) {
        console.warn('[AppUpdate] failed to reveal DMG for manual install:', error);
    }
}
async function removeMountDirBestEffort(dir) {
    if (!dir) {
        return;
    }
    // rmdir, not rm -rf: if the volume is still mounted here the directory is
    // busy/non-empty and removal fails, which is the safe outcome.
    await fs_1.default.promises.rmdir(dir).catch(() => { });
}
/** Timeout for each copy/move step of the swap install (ms). */
const APP_SWAP_STEP_TIMEOUT_MS = 300_000;
/** Name fragments of the hidden swap directories placed next to the target app. */
exports.MAC_SWAP_STAGING_INFIX = '.staging-';
exports.MAC_SWAP_BACKUP_INFIX = '.backup-';
/**
 * Exit code the privileged swap command uses to signal "swap failed but the
 * previous version was restored". osascript does not propagate the inner exit
 * code as its own (it exits 1 with a localized message), so callers recognize
 * it from the trailing `(90)` AppleScript error number in stderr.
 */
exports.MAC_SWAP_ROLLED_BACK_EXIT_CODE = 90;
/**
 * Staging and backup live next to the target app: rename(2) is only atomic
 * within one filesystem, and sharing the parent directory is the reliable way
 * to stay on the target's volume (the app may live outside /Applications).
 * The leading dot hides them in Finder, and the names do not end in ".app" so
 * LaunchServices ignores them.
 */
function buildMacSwapPaths(targetApp, timestamp) {
    const dir = path_1.default.dirname(targetApp);
    const base = path_1.default.basename(targetApp);
    return {
        staging: path_1.default.join(dir, `.${base}${exports.MAC_SWAP_STAGING_INFIX}${timestamp}`),
        backup: path_1.default.join(dir, `.${base}${exports.MAC_SWAP_BACKUP_INFIX}${timestamp}`),
    };
}
/**
 * Composite sequence for the privileged path, which must be a single shell
 * command: every `do shell script … with administrator privileges` call shows
 * its own password prompt. Rollback is embedded — a failed swap-in restores
 * the backup and exits with MAC_SWAP_ROLLED_BACK_EXIT_CODE. The `[ ! -e … ]`
 * guards cover a missing target app (fresh install fallback).
 */
function buildMacSwapInstallCommand(sourceApp, targetApp, swapPaths) {
    const src = shellEscape(sourceApp);
    const tgt = shellEscape(targetApp);
    const stg = shellEscape(swapPaths.staging);
    const bak = shellEscape(swapPaths.backup);
    return (`cp -R ${src} ${stg}` +
        ` && { [ ! -e ${tgt} ] || mv ${tgt} ${bak}; }` +
        ` && { mv ${stg} ${tgt} || { [ ! -e ${bak} ] || mv ${bak} ${tgt}; exit ${exports.MAC_SWAP_ROLLED_BACK_EXIT_CODE}; }; }` +
        ` && { [ ! -e ${bak} ] || rm -rf ${bak}; }`);
}
function execFileAsync(file, args, timeoutMs) {
    return new Promise((resolve, reject) => {
        (0, child_process_1.execFile)(file, args, { maxBuffer: 10 * 1024 * 1024, timeout: timeoutMs }, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(`${error.message}\nstderr: ${stderr}`));
            }
            else {
                resolve(stdout.trim());
            }
        });
    });
}
/**
 * Escape for an AppleScript string literal. `$` and backtick must NOT be
 * escaped here: the swap command wraps paths in single quotes, and AppleScript
 * passes unknown escapes like `\$` through with the backslash intact, which
 * would corrupt the path inside those quotes.
 */
const escapeForAppleScriptString = (s) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
async function runPrivilegedSwapInstall(sourceApp, targetApp) {
    // Fresh timestamp: `cp -R` into an existing directory copies the source
    // inside it, so staging names are never reused across attempts.
    const swapPaths = buildMacSwapPaths(targetApp, Date.now());
    const command = buildMacSwapInstallCommand(sourceApp, targetApp, swapPaths);
    // argv array (no outer shell): the command contains single quotes from
    // shellEscape, which an `osascript -e '…'` shell wrapper could not carry.
    await execFileAsync('osascript', ['-e', `do shell script "${escapeForAppleScriptString(command)}" with administrator privileges`], APP_SWAP_STEP_TIMEOUT_MS);
}
/** Whether a failed privileged swap reported "previous version restored". */
function isPrivilegedSwapRolledBack(error) {
    const message = error instanceof Error ? error.message : String(error);
    return message.includes(`(${exports.MAC_SWAP_ROLLED_BACK_EXIT_CODE})`);
}
class SwapInstallError extends Error {
    outcome;
    backupPath;
    constructor(message, outcome, backupPath) {
        super(message);
        this.outcome = outcome;
        this.backupPath = backupPath;
    }
}
async function pathExists(targetPath) {
    try {
        await fs_1.default.promises.lstat(targetPath);
        return true;
    }
    catch {
        return false;
    }
}
async function removeDirBestEffort(dir) {
    try {
        await fs_1.default.promises.rm(dir, { recursive: true, force: true });
    }
    catch (error) {
        console.warn(`[AppUpdate] failed to remove ${dir}:`, error);
    }
}
/**
 * Remove leftover staging/backup directories from earlier attempts. `cp -R`
 * into an existing staging directory would nest the copy inside it, and
 * leftovers would otherwise accumulate forever. Best effort: a root-owned
 * leftover from a failed privileged attempt may survive, which is harmless
 * (hidden directory, disk space only).
 */
async function cleanupSwapLeftovers(targetApp) {
    const targetDir = path_1.default.dirname(targetApp);
    const base = path_1.default.basename(targetApp);
    const prefixes = [`.${base}${exports.MAC_SWAP_STAGING_INFIX}`, `.${base}${exports.MAC_SWAP_BACKUP_INFIX}`];
    let entries;
    try {
        entries = await fs_1.default.promises.readdir(targetDir);
    }
    catch (error) {
        console.warn('[AppUpdate] failed to scan for swap leftovers:', error);
        return;
    }
    for (const entry of entries) {
        if (!prefixes.some((prefix) => entry.startsWith(prefix))) {
            continue;
        }
        const leftover = path_1.default.join(targetDir, entry);
        console.log(`[AppUpdate] removing swap leftover: ${leftover}`);
        await removeDirBestEffort(leftover);
    }
}
/**
 * Stage-copy the new app next to the target, then swap it in with atomic
 * renames, keeping a backup of the current install until the new one is in
 * place. The copy — the step most likely to fail (300+ MB, disk space) — runs
 * before the current install is touched; the previous `rm -rf && cp -R`
 * sequence deleted the user's app before the copy had succeeded.
 */
async function swapInstallWithUserPerms(sourceApp, targetApp) {
    const { staging, backup } = buildMacSwapPaths(targetApp, Date.now());
    console.log(`[AppUpdate] Copying app bundle to staging: ${staging}`);
    try {
        await execAsync(`cp -R ${shellEscape(sourceApp)} ${shellEscape(staging)}`, APP_SWAP_STEP_TIMEOUT_MS);
    }
    catch (error) {
        await removeDirBestEffort(staging);
        throw new SwapInstallError(`staging copy failed: ${error instanceof Error ? error.message : String(error)}`, 'untouched');
    }
    let backupCreated = false;
    if (await pathExists(targetApp)) {
        console.log(`[AppUpdate] Moving current app to backup: ${backup}`);
        try {
            await execAsync(`mv ${shellEscape(targetApp)} ${shellEscape(backup)}`, APP_SWAP_STEP_TIMEOUT_MS);
            backupCreated = true;
        }
        catch (error) {
            await removeDirBestEffort(staging);
            throw new SwapInstallError(`backup move failed: ${error instanceof Error ? error.message : String(error)}`, 'untouched');
        }
    }
    console.log('[AppUpdate] Swapping staged app into place...');
    try {
        await execAsync(`mv ${shellEscape(staging)} ${shellEscape(targetApp)}`, APP_SWAP_STEP_TIMEOUT_MS);
    }
    catch (error) {
        const swapMessage = error instanceof Error ? error.message : String(error);
        if (backupCreated) {
            try {
                await execAsync(`mv ${shellEscape(backup)} ${shellEscape(targetApp)}`, APP_SWAP_STEP_TIMEOUT_MS);
                console.warn('[AppUpdate] swap-in failed, previous version restored');
            }
            catch (rollbackError) {
                console.error(`[AppUpdate] rollback failed, previous version preserved at: ${backup}`, rollbackError);
                await removeDirBestEffort(staging);
                throw new SwapInstallError(`swap-in failed and rollback failed: ${swapMessage}`, 'backup-stranded', backup);
            }
        }
        await removeDirBestEffort(staging);
        throw new SwapInstallError(`swap-in failed: ${swapMessage}`, backupCreated ? 'rolled-back' : 'untouched');
    }
    if (backupCreated) {
        // The new version is already in place; a surviving backup is swept by the
        // next install's leftover cleanup.
        await removeDirBestEffort(backup);
    }
}
async function swapInstallMacApp(sourceApp, targetApp) {
    await cleanupSwapLeftovers(targetApp);
    let normalOutcome = 'untouched';
    try {
        await swapInstallWithUserPerms(sourceApp, targetApp);
        console.log('[AppUpdate] Swap install succeeded');
        return;
    }
    catch (error) {
        const swapError = error instanceof SwapInstallError ? error : null;
        if (swapError?.outcome === 'backup-stranded') {
            // The filesystem is in an unexpected state (target gone, old version
            // stranded in the backup dir); retrying with privileges could make it
            // worse, so surface the recovery path instead.
            throw new Error(`Installation failed: could not restore the current version; previous version preserved at ${swapError.backupPath}`);
        }
        normalOutcome = swapError?.outcome ?? 'untouched';
        console.warn(`[AppUpdate] normal swap install failed (${normalOutcome}), requesting admin privileges:`, error);
    }
    try {
        await runPrivilegedSwapInstall(sourceApp, targetApp);
        console.log('[AppUpdate] Admin swap install succeeded');
    }
    catch (adminError) {
        const rolledBack = isPrivilegedSwapRolledBack(adminError) || normalOutcome === 'rolled-back';
        throw new Error(`Installation failed: insufficient permissions. ${adminError instanceof Error ? adminError.message : ''} (${rolledBack ? 'rolled back to current version' : 'current version untouched'})`);
    }
}
async function installMacDmg(dmgPath) {
    let mountPoint = null;
    let attachedDevEntries = [];
    let explicitMountDir = null;
    try {
        console.log('[AppUpdate] Mounting DMG...');
        let attach = await attachDmg(dmgPath);
        attachedDevEntries = attach.devEntries;
        if (!attach.mountPoint) {
            // Attached but the volume never mounted (hdiutil still exits 0): either
            // DiskArbitration is blocked on this machine or a previous failed
            // install left a stale attachment. Clean up and retry once with an
            // explicit mount point outside /Volumes.
            console.error(`[AppUpdate] hdiutil attach returned no mount point (devices: ${attachedDevEntries.join(', ') || 'none'}), raw output:\n${attach.rawOutput}`);
            await cleanupStaleAttachment(dmgPath, attachedDevEntries);
            attachedDevEntries = [];
            explicitMountDir = path_1.default.join(electron_1.app.getPath('userData'), 'updates', `${exports.MAC_UPDATE_MOUNT_DIR_PREFIX}${Date.now()}`);
            await fs_1.default.promises.mkdir(explicitMountDir, { recursive: true });
            console.log(`[AppUpdate] Retrying attach with explicit mount point: ${explicitMountDir}`);
            attach = await attachDmg(dmgPath, explicitMountDir);
            attachedDevEntries = attach.devEntries;
            if (!attach.mountPoint) {
                console.error(`[AppUpdate] retry attach still returned no mount point, raw output:\n${attach.rawOutput}`);
                await openDmgForManualInstall(dmgPath);
                throw new Error('Failed to determine mount point from hdiutil output (volume mount failed)');
            }
        }
        mountPoint = attach.mountPoint;
        console.log(`[AppUpdate] Mounted at: ${mountPoint}`);
        // Find .app bundle in mount point
        const entries = await fs_1.default.promises.readdir(mountPoint);
        const appBundle = entries.find((e) => e.endsWith('.app'));
        if (!appBundle) {
            throw new Error('No .app bundle found in DMG');
        }
        const sourceApp = path_1.default.join(mountPoint, appBundle);
        console.log(`[AppUpdate] Source app: ${sourceApp}`);
        // Determine target path: current running app location
        // process.resourcesPath is .app/Contents/Resources, go up 3 levels
        const currentAppPath = path_1.default.resolve(process.resourcesPath, '..', '..', '..');
        let targetApp;
        if (currentAppPath.endsWith('.app')) {
            targetApp = currentAppPath;
        }
        else {
            // Fallback to /Applications
            targetApp = `/Applications/${appBundle}`;
        }
        console.log(`[AppUpdate] Target app: ${targetApp}`);
        await swapInstallMacApp(sourceApp, targetApp);
        // Detach DMG (timeout 30s)
        try {
            await execAsync(`hdiutil detach ${shellEscape(mountPoint)} -force`, HDIUTIL_DETACH_TIMEOUT_MS);
        }
        catch {
            // Best effort
        }
        mountPoint = null;
        attachedDevEntries = [];
        await removeMountDirBestEffort(explicitMountDir);
        explicitMountDir = null;
        // Clean up downloaded DMG
        try {
            await fs_1.default.promises.unlink(dmgPath);
        }
        catch {
            // Best effort
        }
        // Relaunch from the new app location
        const executablePath = path_1.default.join(targetApp, 'Contents', 'MacOS');
        const execEntries = await fs_1.default.promises.readdir(executablePath);
        const executable = execEntries[0]; // Should be the app executable
        if (executable) {
            console.log(`[AppUpdate] Relaunching: ${path_1.default.join(executablePath, executable)}`);
            electron_1.app.relaunch({ execPath: path_1.default.join(executablePath, executable) });
        }
        else {
            console.log('[AppUpdate] Relaunching (default)');
            electron_1.app.relaunch();
        }
        (0, appQuitConfirmation_1.quitAppWithoutConfirmation)('macOS update install');
    }
    catch (error) {
        console.error('[AppUpdate] macOS install error:', error);
        // Never leave the image attached on failure: a stale attachment poisons
        // every retry (attach returns instantly with no mount point).
        if (mountPoint) {
            try {
                await execAsync(`hdiutil detach ${shellEscape(mountPoint)} -force`, HDIUTIL_DETACH_TIMEOUT_MS);
                attachedDevEntries = [];
            }
            catch {
                // Fall back to detaching by device entry below.
            }
        }
        if (attachedDevEntries.length) {
            await detachDevEntriesBestEffort(attachedDevEntries);
        }
        await removeMountDirBestEffort(explicitMountDir);
        throw error;
    }
}
/**
 * NSIS upgrade arguments understood by the (patched) electron-builder
 * assisted installer. `--updated` puts it in update mode: every interactive
 * page (install mode, directory, finish) is skipped, the previous install
 * directory is reused from the registry, and the Cancel button is disabled —
 * the only visible UI is the install-files page with its real progress bar.
 * `--force-run` relaunches the app once files are in place (via
 * ExecShellAsUser, so the new instance is not elevated); the relaunched app
 * receives `--updated` as an argv flag. Deliberately NOT `/S`: silent mode
 * would hide the progress bar for the minutes-long extraction.
 */
exports.WINDOWS_UPDATE_INSTALL_ARGS = ['--force-run', '--updated'];
/** Installer switch that forbids adding Windows Defender exclusions. */
exports.WINDOWS_NO_DEFENDER_EXCLUSION_ARG = '/NoDefenderExclusion';
/** Win32 ERROR_CANCELLED: the user declined the UAC elevation prompt. */
exports.WINDOWS_UAC_DECLINED_EXIT_CODE = 1223;
/**
 * How long the hidden launcher may sit on the UAC prompt. The secure-desktop
 * consent dialog auto-cancels itself after ~2 minutes; 5 minutes leaves margin
 * so a slow decision is never mistaken for a hang.
 */
const WINDOWS_INSTALLER_LAUNCH_TIMEOUT_MS = 300_000;
const WINDOWS_INSTALLER_PATH_ENV = 'LOBSTERAI_UPDATE_INSTALLER_PATH';
/**
 * Build trusted PowerShell candidates without consulting PATH. Sysnative is
 * the only way for a 32-bit process on 64-bit Windows to bypass WOW64
 * redirection and reach the native System32 directory.
 */
function buildWindowsPowerShellCandidatePaths(options) {
    const normalizedRoot = path_1.default.win32.normalize(options.systemRoot.trim())
        .replace(/[\\/]+$/, '');
    if (!/^[a-zA-Z]:\\Windows$/i.test(normalizedRoot)) {
        return [];
    }
    const nativeArchitecture = options.env.PROCESSOR_ARCHITEW6432
        ?? options.env.processor_architew6432
        ?? '';
    const isWow64 = options.processArch === 'ia32'
        && /^(amd64|arm64|ia64)$/i.test(nativeArchitecture);
    const relativePowerShellPath = path_1.default.win32.join('WindowsPowerShell', 'v1.0', 'powershell.exe');
    const candidates = [];
    if (isWow64) {
        candidates.push(path_1.default.win32.join(normalizedRoot, 'Sysnative', relativePowerShellPath));
    }
    candidates.push(path_1.default.win32.join(normalizedRoot, 'System32', relativePowerShellPath));
    return candidates;
}
function isTrustedWindowsSystemFile(candidatePath) {
    try {
        const stat = fs_1.default.lstatSync(candidatePath);
        return stat.isFile() && !stat.isSymbolicLink();
    }
    catch {
        return false;
    }
}
/** Resolve an existing system PowerShell executable without PATH lookup. */
function resolveWindowsPowerShellPath(options = {}) {
    const env = options.env ?? process.env;
    const systemRoot = options.systemRoot
        ?? env.SystemRoot
        ?? env.SYSTEMROOT
        ?? env.windir
        ?? env.WINDIR
        ?? 'C:\\Windows';
    const candidates = buildWindowsPowerShellCandidatePaths({
        systemRoot,
        processArch: options.processArch ?? process.arch,
        env,
    });
    const isTrustedFile = options.isTrustedFile ?? isTrustedWindowsSystemFile;
    return candidates.find(candidate => isTrustedFile(candidate)) ?? null;
}
/**
 * The installer's manifest requests administrator (customHeader in
 * scripts/nsis-installer.nsh), so CreateProcess-based spawns fail with
 * ERROR_ELEVATION_REQUIRED instead of showing the UAC prompt; only
 * ShellExecute semantics can elevate, and shell.openPath cannot pass the
 * update-mode arguments. PowerShell's Start-Process goes through
 * ShellExecute and reports a declined prompt as Win32Exception 1223, which
 * this script turns into a distinct exit code — the exception *message* is
 * localized by the OS, so the native error code is the only stable signal.
 */
function buildWindowsInstallerLaunchScript(extraArgs = []) {
    const argumentList = [...exports.WINDOWS_UPDATE_INSTALL_ARGS, ...extraArgs]
        .map(arg => `'${arg}'`)
        .join(',');
    return (`$ErrorActionPreference = 'Stop'; ` +
        `$installer = $env:${WINDOWS_INSTALLER_PATH_ENV}; ` +
        `if ([string]::IsNullOrWhiteSpace($installer)) { ` +
        `[Console]::Error.WriteLine('Installer path is missing'); exit 1 }; ` +
        `try { Start-Process -FilePath $installer -ArgumentList ${argumentList} } ` +
        `catch { ` +
        `$native = $_.Exception.NativeErrorCode; ` +
        `if ($null -eq $native -and $_.Exception.InnerException) { $native = $_.Exception.InnerException.NativeErrorCode }; ` +
        `[Console]::Error.WriteLine($_.Exception.Message); ` +
        `if ($native -eq ${exports.WINDOWS_UAC_DECLINED_EXIT_CODE}) { exit ${exports.WINDOWS_UAC_DECLINED_EXIT_CODE} }; ` +
        `exit 1 }`);
}
function execFileWithExitCode(file, args, timeoutMs, env) {
    return new Promise(resolve => {
        (0, child_process_1.execFile)(file, args, {
            maxBuffer: 10 * 1024 * 1024,
            timeout: timeoutMs,
            windowsHide: true,
            env,
        }, (error, _stdout, stderr) => {
            if (!error) {
                resolve({ code: 0, stderr });
                return;
            }
            // Non-numeric codes (spawn failures like ENOENT, timeout kills) all
            // collapse into the generic-failure code 1.
            const rawCode = error.code;
            resolve({
                code: typeof rawCode === 'number' ? rawCode : 1,
                stderr: stderr || error.message,
            });
        });
    });
}
async function installWindowsNsis(exePath, options) {
    // Launch the installer while the app still owns the foreground so the UAC
    // elevation prompt (the installer requests admin) appears in front of the
    // user. The install runs in update mode: no questions asked, existing
    // install directory, a progress-bar-only window for the minutes-long
    // extraction, then an automatic relaunch.
    //
    // The app quits only after the elevated process actually started: a declined
    // prompt keeps this instance running so the coordinator returns to Ready and
    // offers a retry instead of quitting into nothing.
    //
    // Quitting in parallel with the installer running is safe: the NSIS
    // customCheckAppRunning macro stops remaining LobsterAI processes by image
    // name and polls until they are gone before replacing files. The installer
    // process itself is named lobsterai-update-*, so it is not affected by that
    // kill.
    console.log(`[AppUpdate] Launching Windows installer in update mode: ${exePath}`);
    const extraArgs = options?.noDefenderExclusion === true
        ? [exports.WINDOWS_NO_DEFENDER_EXCLUSION_ARG]
        : [];
    const powerShellPath = resolveWindowsPowerShellPath();
    if (powerShellPath) {
        console.log(`[AppUpdate] Using trusted Windows PowerShell: ${powerShellPath}`);
    }
    else {
        console.warn('[AppUpdate] Trusted Windows PowerShell unavailable; using wizard fallback');
    }
    const launch = powerShellPath
        ? await execFileWithExitCode(powerShellPath, [
            '-NoProfile',
            '-NonInteractive',
            '-Command',
            buildWindowsInstallerLaunchScript(extraArgs),
        ], WINDOWS_INSTALLER_LAUNCH_TIMEOUT_MS, {
            ...process.env,
            [WINDOWS_INSTALLER_PATH_ENV]: exePath,
        })
        : {
            code: 1,
            stderr: 'Trusted Windows PowerShell executable was not found',
        };
    if (launch.code === 0) {
        console.log(`[AppUpdate] Installer launched, invocation_source=app-update launcher_fallback=${exports.WindowsInstallerLauncherFallback.None} updated_flag=true ui_mode=interactive`);
        (0, appQuitConfirmation_1.quitAppWithoutConfirmation)('Windows update install');
        return;
    }
    if (launch.code === exports.WINDOWS_UAC_DECLINED_EXIT_CODE) {
        // The user said no. Do not relaunch the installer through the fallback —
        // it would immediately raise a second elevation prompt.
        console.warn('[AppUpdate] update install declined at the UAC prompt');
        throw new Error(constants_1.APP_UPDATE_ELEVATION_DECLINED_ERROR);
    }
    // PowerShell unavailable or blocked (policy, security software): fall back
    // to the plain full wizard so the user still has an update path. Known
    // trade-off: shell.openPath cannot carry arguments, so this path ignores
    // noDefenderExclusion — acceptable for the rare triple overlap of
    // enterprise opt-out + broken PowerShell + wizard fallback.
    console.error(`[AppUpdate] update-mode installer launch failed (code=${launch.code}): ${launch.stderr.trim()}`);
    console.warn(`[AppUpdate] Installer launcher fallback, invocation_source=app-update launcher_fallback=${exports.WindowsInstallerLauncherFallback.WizardNoArgs} updated_flag=false ui_mode=interactive`);
    const launchError = await electron_1.shell.openPath(exePath);
    if (launchError) {
        console.error(`[AppUpdate] failed to launch installer: ${launchError}`);
        // Leave the user a manual path instead of failing silently: reveal the
        // downloaded installer in Explorer so they can double-click it.
        electron_1.shell.showItemInFolder(exePath);
        throw new Error(launchError);
    }
    console.log('[AppUpdate] Installer launched interactively, quitting app');
    (0, appQuitConfirmation_1.quitAppWithoutConfirmation)('Windows update installer wizard');
}
//# sourceMappingURL=appUpdateInstaller.js.map