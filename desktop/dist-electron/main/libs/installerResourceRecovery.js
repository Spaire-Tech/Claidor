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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.recoverInstallerResourcesFromTar = exports.hasBundledRuntimeEntry = exports.INSTALLER_RESOURCES_MARKER = exports.INSTALLER_RESOURCES_TAR = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const tar = __importStar(require("tar"));
/**
 * Recovery for Windows installs where the NSIS installer stopped (killed by
 * the user, or its extractor child was frozen by security software) after the
 * main app files were extracted but before win-resources.tar was unpacked.
 * In that state the app launches, but resources/cfmind, python-win and SKILLs
 * are empty directories; the tar preserved next to them is the only local
 * source of the OpenClaw runtime. The installer only deletes the tar after a
 * successful extraction, so we can finish its job here.
 */
exports.INSTALLER_RESOURCES_TAR = 'win-resources.tar';
/** Written after a successful extraction, by the installer or by this module. */
exports.INSTALLER_RESOURCES_MARKER = '.win-resources-extracted';
// Any of these marks the OpenClaw runtime as present. Mirrors the entry
// candidates of OpenClawEngineManager.resolveOpenClawEntry.
const RUNTIME_ENTRY_CANDIDATES = [
    path_1.default.join('cfmind', 'gateway-bundle.mjs'),
    path_1.default.join('cfmind', 'openclaw.mjs'),
    path_1.default.join('cfmind', 'dist', 'entry.js'),
    path_1.default.join('cfmind', 'gateway.asar'),
];
const PROGRESS_LOG_STEP_BYTES = 50 * 1024 * 1024;
const hasBundledRuntimeEntry = (resourcesDir) => RUNTIME_ENTRY_CANDIDATES.some((candidate) => fs_1.default.existsSync(path_1.default.join(resourcesDir, candidate)));
exports.hasBundledRuntimeEntry = hasBundledRuntimeEntry;
const stringifyError = (error) => {
    if (error instanceof Error)
        return error.message;
    return String(error);
};
const doRecover = async (resourcesDir, reason, onProgress) => {
    const tarPath = path_1.default.join(resourcesDir, exports.INSTALLER_RESOURCES_TAR);
    const markerPath = path_1.default.join(resourcesDir, exports.INSTALLER_RESOURCES_MARKER);
    if ((0, exports.hasBundledRuntimeEntry)(resourcesDir)) {
        return { attempted: false, success: true, tarPath };
    }
    if (!fs_1.default.existsSync(tarPath)) {
        console.warn(`[InstallerRecovery] runtime entry is missing and no installer tar is left to recover from ` +
            `(reason=${reason}, extractedMarker=${fs_1.default.existsSync(markerPath)}, dir=${resourcesDir})`);
        return { attempted: false, success: false, tarPath, error: 'installer resource tar not found' };
    }
    let totalBytes = 0;
    try {
        totalBytes = fs_1.default.statSync(tarPath).size;
    }
    catch {
        // Progress percentages become unavailable; extraction can still proceed.
    }
    const t0 = Date.now();
    let entries = 0;
    let bytes = 0;
    let nextProgressBytes = PROGRESS_LOG_STEP_BYTES;
    console.log(`[InstallerRecovery] runtime entry is missing, extracting ${tarPath} -> ${resourcesDir} ` +
        `(reason=${reason}, tarBytes=${totalBytes})`);
    onProgress?.({ entries: 0, bytes: 0, totalBytes });
    try {
        await tar.extract({
            file: tarPath,
            cwd: resourcesDir,
            onReadEntry: (entry) => {
                entries += 1;
                bytes += Number(entry.size ?? 0);
                if (bytes >= nextProgressBytes) {
                    while (bytes >= nextProgressBytes) {
                        nextProgressBytes += PROGRESS_LOG_STEP_BYTES;
                    }
                    console.log(`[InstallerRecovery] extract progress: entries=${entries} ` +
                        `mb=${(bytes / (1024 * 1024)).toFixed(0)} elapsedMs=${Date.now() - t0}`);
                    onProgress?.({ entries, bytes, totalBytes });
                }
            },
        });
    }
    catch (error) {
        console.error(`[InstallerRecovery] extraction failed after ${Date.now() - t0}ms (entries=${entries}), ` +
            `keeping ${tarPath} for a later retry:`, error);
        return {
            attempted: true,
            success: false,
            tarPath,
            entries,
            elapsedMs: Date.now() - t0,
            error: stringifyError(error),
        };
    }
    const elapsedMs = Date.now() - t0;
    if (!(0, exports.hasBundledRuntimeEntry)(resourcesDir)) {
        console.error(`[InstallerRecovery] extraction finished (entries=${entries}, elapsedMs=${elapsedMs}) ` +
            `but the runtime entry is still missing, keeping ${tarPath}`);
        return {
            attempted: true,
            success: false,
            tarPath,
            entries,
            elapsedMs,
            error: 'runtime entry still missing after extraction',
        };
    }
    // Mirror the installer's success path: stamp the marker, drop the archive.
    try {
        fs_1.default.writeFileSync(markerPath, `${new Date().toISOString()} source=app-recovery reason=${reason}\n`);
    }
    catch (error) {
        console.warn('[InstallerRecovery] failed to write extraction marker:', error);
    }
    try {
        fs_1.default.rmSync(tarPath);
    }
    catch (error) {
        console.warn(`[InstallerRecovery] recovered, but failed to remove ${tarPath}:`, error);
    }
    console.log(`[InstallerRecovery] runtime recovered from installer tar (entries=${entries}, elapsedMs=${elapsedMs})`);
    return { attempted: true, success: true, tarPath, entries, elapsedMs };
};
let inflightRecovery = null;
/**
 * Extract win-resources.tar back into the resources directory if (and only
 * if) the OpenClaw runtime entry is missing. The tar is deleted only after
 * the runtime entry is confirmed present, so a failed attempt (e.g. security
 * software still holding files) can be retried later. Concurrent calls share
 * one extraction. Cheap no-op when the runtime is intact.
 */
const recoverInstallerResourcesFromTar = (resourcesDir, reason, onProgress) => {
    if (inflightRecovery) {
        return inflightRecovery;
    }
    const promise = doRecover(resourcesDir, reason, onProgress).finally(() => {
        if (inflightRecovery === promise) {
            inflightRecovery = null;
        }
    });
    inflightRecovery = promise;
    return promise;
};
exports.recoverInstallerResourcesFromTar = recoverInstallerResourcesFromTar;
//# sourceMappingURL=installerResourceRecovery.js.map