"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppUpdateCoordinator = exports.APP_UPDATE_READY_FILE_KEY_PREFIX = exports.INSTALLATION_UUID_KEY = void 0;
const crypto_1 = __importDefault(require("crypto"));
const electron_1 = require("electron");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const constants_1 = require("../../shared/analytics/constants");
const constants_2 = require("../../shared/appUpdate/constants");
const appUpdateInstaller_1 = require("./appUpdateInstaller");
const appUpdateUrlPolicy_1 = require("./appUpdateUrlPolicy");
const endpoints_1 = require("./endpoints");
const keyfromAttribution_1 = require("./keyfromAttribution");
function formatUpdateUrlForLog(rawUrl) {
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
exports.INSTALLATION_UUID_KEY = constants_1.LogReporterStoreKey.InstallationUuid;
const APP_UPDATE_TEST_CURRENT_VERSION_ENV = 'LOBSTERAI_UPDATE_CURRENT_VERSION';
exports.APP_UPDATE_READY_FILE_KEY_PREFIX = 'app_update_ready_file';
const initialState = () => ({
    status: constants_2.AppUpdateStatus.Idle,
    source: null,
    info: null,
    progress: null,
    readyFilePath: null,
    readyFileHash: null,
    errorMessage: null,
});
class AppUpdateCoordinator {
    state = initialState();
    store;
    readyWindowsInstallerTrust = null;
    autoOpenReadyModal = false;
    completedUpdateVersion = null;
    flowSequence = 0;
    activeFlowId = 0;
    activeFlowSource = null;
    constructor(store) {
        this.store = store;
        this.restoreStoredReadyState();
    }
    getState() {
        return { ...this.state };
    }
    shouldAutoOpenReadyModal() {
        return this.autoOpenReadyModal;
    }
    consumeAutoOpenReadyModal() {
        this.autoOpenReadyModal = false;
    }
    /**
     * Version of an update that finished installing right before this launch
     * (the app is now running that version), or null. Consumed once so the
     * renderer shows its "updated" notice a single time.
     */
    consumeCompletedUpdateVersion() {
        const version = this.completedUpdateVersion;
        this.completedUpdateVersion = null;
        return version;
    }
    async checkNow(options) {
        const targetSource = options?.manual === true ? constants_2.AppUpdateSource.Manual : constants_2.AppUpdateSource.Auto;
        console.log(`[AppUpdate] checkNow started, manual=${options?.manual === true}, status=${this.state.status}, source=${this.state.source ?? 'none'}, readyFilePath=${this.state.readyFilePath ?? 'none'}`);
        if (this.isUpdateDisabled()) {
            console.log('[AppUpdate] updates are disabled by enterprise config');
            const state = this.resetToIdle();
            return { success: true, state, updateFound: false };
        }
        if (options?.manual === true && this.state.source === constants_2.AppUpdateSource.Auto) {
            if (this.state.status === constants_2.AppUpdateStatus.Downloading) {
                console.log('[AppUpdate] manual check is preempting active auto download');
                const cancelled = (0, appUpdateInstaller_1.cancelActiveDownload)();
                console.log(`[AppUpdate] auto download cancel requested by manual check, cancelled=${cancelled}`);
            }
            else if (this.state.status === constants_2.AppUpdateStatus.Checking) {
                console.log('[AppUpdate] manual check is preempting active auto check before download');
            }
            else if (this.state.status === constants_2.AppUpdateStatus.Installing) {
                console.log('[AppUpdate] manual check cannot preempt auto install already in progress');
                return { success: true, state: this.getState(), updateFound: this.state.info !== null };
            }
        }
        if ((this.state.status === constants_2.AppUpdateStatus.Downloading || this.state.status === constants_2.AppUpdateStatus.Installing) &&
            this.state.source === targetSource) {
            console.log(`[AppUpdate] returning existing active ${targetSource} flow without starting a new check`);
            return { success: true, state: this.getState(), updateFound: this.state.info !== null };
        }
        const previousState = this.getState();
        const flowId = this.beginFlow(targetSource, options?.manual === true ? 'manual-check' : 'auto-check');
        this.setState({
            ...this.state,
            status: constants_2.AppUpdateStatus.Checking,
            source: targetSource,
            errorMessage: null,
        });
        try {
            const currentVersion = this.resolveCurrentVersion();
            const info = await this.fetchUpdateInfo(currentVersion, options?.manual === true, options?.userId);
            if (!this.isFlowActive(flowId, targetSource)) {
                console.log(`[AppUpdate] ignoring stale check result after fetch, flowId=${flowId}, source=${targetSource}, activeFlowId=${this.activeFlowId}, activeSource=${this.activeFlowSource ?? 'none'}`);
                return { success: true, state: this.getState(), updateFound: this.getState().info !== null };
            }
            if (!info) {
                if (previousState.source === targetSource &&
                    previousState.status === constants_2.AppUpdateStatus.Ready &&
                    previousState.readyFilePath != null &&
                    previousState.readyFileHash != null &&
                    previousState.info != null &&
                    this.compareVersions(previousState.info.latestVersion, currentVersion) > 0) {
                    console.log(`[AppUpdate] no update from server, preserving existing ready update ${previousState.info.latestVersion}`);
                    const state = this.setState({
                        ...previousState,
                        errorMessage: null,
                    });
                    return { success: true, state, updateFound: true };
                }
                const state = this.setState({
                    ...initialState(),
                    source: targetSource,
                });
                return { success: true, state, updateFound: false };
            }
            const updateFound = true;
            const matchingReadyFile = await this.resolveMatchingReadyFile(previousState, targetSource, info.latestVersion);
            if (!this.isFlowActive(flowId, targetSource)) {
                console.log(`[AppUpdate] ignoring stale check result after ready-file resolution, flowId=${flowId}, source=${targetSource}, activeFlowId=${this.activeFlowId}, activeSource=${this.activeFlowSource ?? 'none'}`);
                return { success: true, state: this.getState(), updateFound: this.getState().info !== null };
            }
            if (matchingReadyFile) {
                console.log(`[AppUpdate] reusing ready file for version ${info.latestVersion}: ${matchingReadyFile.filePath}`);
                this.bindReadyWindowsInstallerTrust(matchingReadyFile);
                const state = this.setState({
                    ...previousState,
                    info,
                    status: constants_2.AppUpdateStatus.Ready,
                    source: targetSource,
                    readyFilePath: matchingReadyFile.filePath,
                    readyFileHash: matchingReadyFile.fileHash,
                    errorMessage: null,
                });
                return { success: true, state, updateFound };
            }
            console.log(`[AppUpdate] no reusable ready file found for version ${info.latestVersion}, previousReadyFilePath=${previousState.readyFilePath ?? 'none'}`);
            const existingReadyFile = this.getStoredReadyFile(targetSource);
            if (existingReadyFile?.filePath) {
                await this.cleanupReadyFile(existingReadyFile.filePath);
            }
            this.clearStoredReadyFile(targetSource);
            await this.pruneCachedInstallerFiles(targetSource);
            if (!this.canPredownload(info.url)) {
                const state = this.setState({
                    status: constants_2.AppUpdateStatus.Available,
                    source: targetSource,
                    info,
                    progress: null,
                    readyFilePath: null,
                    readyFileHash: null,
                    errorMessage: null,
                });
                return { success: true, state, updateFound };
            }
            if (options?.manual === true) {
                const state = this.setState({
                    status: constants_2.AppUpdateStatus.Available,
                    source: targetSource,
                    info,
                    progress: null,
                    readyFilePath: null,
                    readyFileHash: null,
                    errorMessage: null,
                });
                return { success: true, state, updateFound };
            }
            const state = await this.startDownload(info, flowId, targetSource);
            return { success: true, state, updateFound };
        }
        catch (error) {
            if (!this.isFlowActive(flowId, targetSource)) {
                console.log(`[AppUpdate] ignoring stale check failure, flowId=${flowId}, source=${targetSource}, activeFlowId=${this.activeFlowId}, activeSource=${this.activeFlowSource ?? 'none'}`);
                return { success: true, state: this.getState(), updateFound: this.getState().info !== null };
            }
            console.error('[AppUpdate] check failed:', error);
            const message = error instanceof Error ? error.message : 'Check failed';
            // A failed availability check must not invalidate an already downloaded
            // and verified installer. Demoting Ready to Error here used to strand
            // the update: installReadyUpdate rejects non-Ready states, so every
            // retry failed instantly until the next successful check (e.g. the
            // resume-time check that fails with ERR_NETWORK_IO_SUSPENDED).
            const keepReady = previousState.status === constants_2.AppUpdateStatus.Ready
                && previousState.readyFilePath != null
                && previousState.readyFileHash != null;
            if (keepReady) {
                console.warn(`[AppUpdate] check failed but a verified ready update exists, keeping Ready state for version ${previousState.info?.latestVersion ?? 'unknown'}`);
            }
            const state = this.setState({
                ...previousState,
                status: keepReady
                    ? constants_2.AppUpdateStatus.Ready
                    : previousState.info
                        ? constants_2.AppUpdateStatus.Error
                        : constants_2.AppUpdateStatus.Idle,
                errorMessage: keepReady ? null : message,
            });
            return {
                success: false,
                state,
                updateFound: previousState.info !== null,
                error: message,
            };
        }
    }
    async retryDownload() {
        if (!this.state.info) {
            return this.getState();
        }
        if (!this.canPredownload(this.state.info.url)) {
            return this.getState();
        }
        if (this.state.status === constants_2.AppUpdateStatus.Downloading || this.state.status === constants_2.AppUpdateStatus.Installing) {
            return this.getState();
        }
        const source = this.state.source ?? constants_2.AppUpdateSource.Auto;
        const flowId = this.beginFlow(source, 'retry-download');
        void this.startDownload(this.state.info, flowId, source);
        return this.getState();
    }
    async installReadyUpdate() {
        // Error with a verified ready file stays installable (defense in depth
        // for any path that lands there): the hash and the Windows URL-policy
        // receipt are re-validated below before the installer launches. Other
        // non-Ready states stay rejected so e.g. a second click during
        // Installing cannot double-launch the installer.
        const installableFromError = this.state.status === constants_2.AppUpdateStatus.Error && this.state.readyFileHash != null;
        if (!this.state.readyFilePath
            || (this.state.status !== constants_2.AppUpdateStatus.Ready && !installableFromError)) {
            console.warn(`[AppUpdate] install rejected: status=${this.state.status}, readyFilePath=${this.state.readyFilePath ?? 'none'}, readyFileHash=${this.state.readyFileHash != null ? 'present' : 'none'}`);
            return {
                success: false,
                state: this.getState(),
                error: 'Update is not ready to install',
            };
        }
        const filePath = this.state.readyFilePath;
        const readyInfo = this.state.info;
        const readyFileHash = this.state.readyFileHash;
        const readyReceipt = this.getReadyWindowsInstallerReceipt({
            version: readyInfo?.latestVersion ?? '',
            filePath,
            fileHash: readyFileHash ?? '',
            source: this.state.source,
        });
        if (!this.isTrustedWindowsReadyInstallerInfo(readyInfo ?? undefined, readyReceipt)) {
            const source = this.state.source;
            await this.cleanupReadyFile(filePath);
            this.clearStoredReadyFile(source);
            this.readyWindowsInstallerTrust = null;
            const state = this.setState({
                status: constants_2.AppUpdateStatus.Error,
                source,
                info: null,
                progress: null,
                readyFilePath: null,
                readyFileHash: null,
                errorMessage: constants_2.APP_UPDATE_URL_UNTRUSTED_ERROR,
            });
            return {
                success: false,
                state,
                error: constants_2.APP_UPDATE_URL_UNTRUSTED_ERROR,
            };
        }
        if (readyFileHash == null
            || !(await this.isReadyFileValid(filePath, readyFileHash))) {
            const source = this.state.source;
            await this.cleanupReadyFile(filePath);
            this.clearStoredReadyFile(source);
            this.readyWindowsInstallerTrust = null;
            const message = constants_2.APP_UPDATE_FILE_INVALID_ERROR;
            const state = this.setState({
                status: constants_2.AppUpdateStatus.Available,
                source,
                info: readyInfo,
                progress: null,
                readyFilePath: null,
                readyFileHash: null,
                errorMessage: message,
            });
            return {
                success: false,
                state,
                error: message,
            };
        }
        this.setState({
            ...this.state,
            status: constants_2.AppUpdateStatus.Installing,
            errorMessage: null,
        });
        // Persist the attempt before launching the installer. If the app quits
        // but the installer never completes, the next startup restores a Ready
        // state with installIncomplete set so the UI can re-prompt the user.
        if (readyInfo && readyFileHash) {
            this.setStoredReadyFile({
                version: readyInfo.latestVersion,
                filePath,
                fileHash: readyFileHash,
                info: readyInfo,
                windowsInstallerUrlPolicyReceipt: readyReceipt,
                installAttempted: true,
            });
        }
        try {
            await (0, appUpdateInstaller_1.installUpdate)(filePath, {
                noDefenderExclusion: this.isDefenderExclusionDisabled(),
            });
            return { success: true, state: this.getState() };
        }
        catch (error) {
            console.error('[AppUpdate] install failed:', error);
            const message = error instanceof Error ? error.message : 'Installation failed';
            // The verified installer usually survives a failed launch (e.g. the user
            // dismissed the UAC prompt on Windows), so return to Ready and let the
            // user retry the install without re-downloading. Only fall back to
            // Available when the file is gone or corrupted.
            const fileIntact = readyFileHash != null
                && (await this.isReadyFileValid(filePath, readyFileHash));
            if (fileIntact) {
                const state = this.setState({
                    ...this.state,
                    status: constants_2.AppUpdateStatus.Ready,
                    errorMessage: message,
                });
                return { success: false, state, error: message };
            }
            console.warn(`[AppUpdate] ready file is no longer valid after failed install: ${filePath}`);
            this.clearStoredReadyFile(this.state.source);
            const state = this.setState({
                ...this.state,
                status: constants_2.AppUpdateStatus.Available,
                progress: null,
                readyFilePath: null,
                readyFileHash: null,
                errorMessage: message,
            });
            return { success: false, state, error: message };
        }
    }
    resetToIdle() {
        const previousReadyFilePath = this.state.readyFilePath;
        const previousSource = this.state.source;
        const state = this.setState(initialState());
        if (previousReadyFilePath) {
            void this.cleanupReadyFile(previousReadyFilePath);
        }
        this.clearStoredReadyFile(previousSource);
        this.readyWindowsInstallerTrust = null;
        return state;
    }
    async startDownload(info, flowId, source) {
        console.log(`[AppUpdate] startDownload requested, flowId=${flowId}, source=${source}, version=${info.latestVersion}, url=${formatUpdateUrlForLog(info.url)}`);
        this.setState({
            status: constants_2.AppUpdateStatus.Downloading,
            source,
            info,
            progress: null,
            readyFilePath: null,
            readyFileHash: null,
            errorMessage: null,
        });
        this.readyWindowsInstallerTrust = null;
        try {
            const download = await (0, appUpdateInstaller_1.downloadUpdate)(info.url, source, progress => {
                if (!this.isFlowActive(flowId, source)) {
                    console.log(`[AppUpdate] ignoring stale download progress, flowId=${flowId}, source=${source}, activeFlowId=${this.activeFlowId}, activeSource=${this.activeFlowSource ?? 'none'}`);
                    return;
                }
                this.setState({
                    ...this.state,
                    status: constants_2.AppUpdateStatus.Downloading,
                    source,
                    info,
                    progress,
                    errorMessage: null,
                });
            });
            const filePath = download.filePath;
            if (!this.isFlowActive(flowId, source)) {
                console.log(`[AppUpdate] ignoring stale download completion, flowId=${flowId}, source=${source}, filePath=${filePath}`);
                return this.getState();
            }
            const fileHash = await this.computeFileHash(filePath);
            console.log(`[AppUpdate] download completed, flowId=${flowId}, source=${source}, version=${info.latestVersion}, filePath=${filePath}, fileHash=${fileHash}`);
            const storedReadyFile = {
                version: info.latestVersion,
                filePath,
                fileHash,
                info,
                windowsInstallerUrlPolicyReceipt: download.windowsInstallerUrlPolicyReceipt,
            };
            this.setStoredReadyFile(storedReadyFile);
            this.bindReadyWindowsInstallerTrust(storedReadyFile);
            await this.pruneCachedInstallerFiles(source, [filePath]);
            this.autoOpenReadyModal = true;
            return this.setState({
                status: constants_2.AppUpdateStatus.Ready,
                source,
                info,
                progress: null,
                readyFilePath: filePath,
                readyFileHash: fileHash,
                errorMessage: null,
            });
        }
        catch (error) {
            if (!this.isFlowActive(flowId, source)) {
                console.log(`[AppUpdate] ignoring stale download failure, flowId=${flowId}, source=${source}, error=${error instanceof Error ? error.message : String(error)}`);
                return this.getState();
            }
            const cancelled = error instanceof Error && error.message === 'Download cancelled';
            if (cancelled) {
                console.log(`[AppUpdate] download cancelled for active flow, flowId=${flowId}, source=${source}`);
                this.clearStoredReadyFile(source);
                return this.setState({
                    status: constants_2.AppUpdateStatus.Available,
                    source,
                    info,
                    progress: null,
                    readyFilePath: null,
                    readyFileHash: null,
                    errorMessage: null,
                });
            }
            console.error('[AppUpdate] background download failed:', error);
            this.clearStoredReadyFile(source);
            return this.setState({
                status: constants_2.AppUpdateStatus.Error,
                source,
                info,
                progress: null,
                readyFilePath: null,
                readyFileHash: null,
                errorMessage: error instanceof Error ? error.message : 'Download failed',
            });
        }
    }
    async fetchUpdateInfo(currentVersion, manual, userId) {
        const baseUrl = manual ? (0, endpoints_1.getManualUpdateCheckUrl)() : (0, endpoints_1.getUpdateCheckUrl)();
        const qs = this.getUpdateQueryString(userId, currentVersion);
        const url = qs ? `${baseUrl}?${qs}` : baseUrl;
        console.log(`[AppUpdate] checking update, currentVersion=${currentVersion}, url=${url}`);
        const response = await electron_1.session.defaultSession.fetch(url, {
            method: 'GET',
            headers: {
                Accept: 'application/json',
            },
        });
        if (!response.ok) {
            throw new Error(`Update check failed (HTTP ${response.status})`);
        }
        const payload = (await response.json());
        if (payload.code !== 0) {
            throw new Error(`Update check failed with code ${payload.code ?? 'unknown'}`);
        }
        const value = payload.data?.value;
        const latestVersion = value?.version?.trim();
        if (!latestVersion || !this.isNewerVersion(latestVersion, currentVersion)) {
            console.log(`[AppUpdate] no update available, latestVersion=${latestVersion || 'N/A'}, currentVersion=${currentVersion}`);
            return null;
        }
        const toEntry = (log) => ({
            title: typeof log?.title === 'string' ? log.title : '',
            content: Array.isArray(log?.content) ? log.content : [],
        });
        const result = {
            latestVersion,
            date: value?.date?.trim() || '',
            changeLog: {
                zh: toEntry(value?.changeLog?.ch),
                en: toEntry(value?.changeLog?.en),
            },
            url: this.getPlatformDownloadUrl(value),
        };
        console.log(`[AppUpdate] update available: ${currentVersion} -> ${latestVersion}, downloadUrl=${formatUpdateUrlForLog(result.url)}`);
        return result;
    }
    getPlatformDownloadUrl(value) {
        if (process.platform === 'darwin') {
            const download = process.arch === 'arm64' ? value?.macArm : value?.macIntel;
            return download?.url?.trim() || (0, endpoints_1.getFallbackDownloadUrl)();
        }
        if (process.platform === 'win32') {
            const candidate = value?.windowsX64?.url?.trim();
            if (!candidate) {
                return (0, endpoints_1.getFallbackDownloadUrl)();
            }
            try {
                (0, appUpdateUrlPolicy_1.assertTrustedWindowsInstallerUrl)(candidate);
            }
            catch (error) {
                const reason = error instanceof appUpdateUrlPolicy_1.AppUpdateUrlUntrustedError
                    ? error.reason
                    : 'unknown';
                console.error(`[AppUpdate] update API returned an unsafe Windows installer URL, reason=${reason}`);
                throw error;
            }
            return candidate;
        }
        return (0, endpoints_1.getFallbackDownloadUrl)();
    }
    canPredownload(url) {
        if (process.platform !== 'darwin' && process.platform !== 'win32') {
            return false;
        }
        return this.isDirectInstallerUrl(url);
    }
    isDirectInstallerUrl(url) {
        if (!url || (0, constants_2.isManualDownloadUrl)(url)) {
            return false;
        }
        if (process.platform === 'darwin') {
            try {
                return new URL(url).pathname.toLowerCase().endsWith('.dmg');
            }
            catch {
                return false;
            }
        }
        if (process.platform === 'win32') {
            return (0, appUpdateUrlPolicy_1.validateWindowsInstallerUrl)(url).trusted;
        }
        return false;
    }
    isUpdateDisabled() {
        const enterprise = this.store.get('enterprise_config');
        return enterprise?.disableUpdate === true;
    }
    isDefenderExclusionDisabled() {
        const enterprise = this.store.get('enterprise_config');
        return enterprise?.disableDefenderExclusion === true;
    }
    resolveCurrentVersion() {
        const overriddenVersion = process.env[APP_UPDATE_TEST_CURRENT_VERSION_ENV]?.trim();
        if (overriddenVersion) {
            console.log(`[AppUpdate] using overridden current version from ${APP_UPDATE_TEST_CURRENT_VERSION_ENV}: ${overriddenVersion}`);
            return overriddenVersion;
        }
        return electron_1.app.getVersion();
    }
    getUpdateQueryString(userId, version) {
        const params = new URLSearchParams();
        const installationId = this.getOrCreateInstallationId();
        if (installationId) {
            params.append('uuid', installationId);
        }
        if (userId) {
            params.append('userId', userId);
        }
        if (version) {
            params.append('version', version);
        }
        const { firstKeyfrom, latestKeyfrom } = (0, keyfromAttribution_1.getKeyfromAttribution)(this.store);
        params.set('firstKeyfrom', firstKeyfrom);
        params.set('latestKeyfrom', latestKeyfrom);
        return params.toString();
    }
    getOrCreateInstallationId() {
        try {
            const existing = this.store.get(exports.INSTALLATION_UUID_KEY);
            if (typeof existing === 'string' && existing.trim()) {
                return existing;
            }
            const nextId = crypto_1.default.randomUUID();
            this.store.set(exports.INSTALLATION_UUID_KEY, nextId);
            return nextId;
        }
        catch (error) {
            console.warn('[AppUpdate] failed to get installation uuid:', error);
            return null;
        }
    }
    isNewerVersion(latestVersion, currentVersion) {
        return this.compareVersions(latestVersion, currentVersion) > 0;
    }
    compareVersions(a, b) {
        const aParts = this.toVersionParts(a);
        const bParts = this.toVersionParts(b);
        const maxLength = Math.max(aParts.length, bParts.length);
        for (let index = 0; index < maxLength; index += 1) {
            const left = aParts[index] ?? 0;
            const right = bParts[index] ?? 0;
            if (left > right)
                return 1;
            if (left < right)
                return -1;
        }
        return 0;
    }
    toVersionParts(version) {
        return version.split('.').map(part => {
            const match = part.trim().match(/^\d+/);
            return match ? Number.parseInt(match[0], 10) : 0;
        });
    }
    setState(nextState) {
        this.state = { ...nextState };
        const snapshot = this.getState();
        for (const window of electron_1.BrowserWindow.getAllWindows()) {
            if (!window.isDestroyed()) {
                window.webContents.send(constants_2.AppUpdateIpc.StateChanged, snapshot);
            }
        }
        return snapshot;
    }
    beginFlow(source, reason) {
        const flowId = ++this.flowSequence;
        this.activeFlowId = flowId;
        this.activeFlowSource = source;
        console.log(`[AppUpdate] begin flow, flowId=${flowId}, source=${source}, reason=${reason}`);
        return flowId;
    }
    isFlowActive(flowId, source) {
        return this.activeFlowId === flowId && this.activeFlowSource === source;
    }
    async cleanupReadyFile(filePath) {
        if (!filePath) {
            return;
        }
        if (!this.isExpectedReadyInstallerPath(filePath)) {
            console.warn(`[AppUpdate] refused to delete a ready-file path outside the managed update cache: ${filePath}`);
            return;
        }
        try {
            await fs_1.default.promises.unlink(filePath);
        }
        catch {
            // Best effort cleanup only.
        }
    }
    getUpdateCacheDir() {
        return path_1.default.join(electron_1.app.getPath('userData'), 'updates');
    }
    isCachedInstallerForSource(filename, source) {
        if (!filename.startsWith('lobsterai-update-')) {
            return false;
        }
        if (source == null) {
            return true;
        }
        if (filename.startsWith(`lobsterai-update-${source}-`)) {
            return true;
        }
        return /^lobsterai-update-\d+/.test(filename);
    }
    isExpectedReadyInstallerPath(filePath) {
        const cacheDir = path_1.default.resolve(this.getUpdateCacheDir());
        const resolvedFilePath = path_1.default.resolve(filePath);
        const normalize = (value) => process.platform === 'win32' ? value.toLowerCase() : value;
        if (normalize(path_1.default.dirname(resolvedFilePath)) !== normalize(cacheDir)) {
            return false;
        }
        const filename = path_1.default.basename(resolvedFilePath);
        if (!this.isCachedInstallerForSource(filename, null)) {
            return false;
        }
        const extension = path_1.default.extname(filename).toLowerCase();
        if (process.platform === 'win32') {
            return extension === '.exe';
        }
        if (process.platform === 'darwin') {
            return extension === '.dmg';
        }
        return extension === '.exe' || extension === '.dmg';
    }
    async pruneCachedInstallerFiles(source, keepFilePaths = []) {
        const keepSet = new Set(keepFilePaths.filter(Boolean).map(filePath => path_1.default.resolve(filePath)));
        const cacheDir = this.getUpdateCacheDir();
        try {
            const entries = await fs_1.default.promises.readdir(cacheDir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory() && entry.name.startsWith(appUpdateInstaller_1.MAC_UPDATE_MOUNT_DIR_PREFIX)) {
                    // Explicit mount point dir left behind by a failed macOS install.
                    // rmdir only succeeds once nothing is mounted there, so a live
                    // mount is never disturbed.
                    await fs_1.default.promises.rmdir(path_1.default.resolve(cacheDir, entry.name)).catch(() => { });
                    continue;
                }
                if (!entry.isFile()) {
                    continue;
                }
                if (!this.isCachedInstallerForSource(entry.name, source)) {
                    continue;
                }
                const entryPath = path_1.default.resolve(cacheDir, entry.name);
                if (keepSet.has(entryPath)) {
                    continue;
                }
                await fs_1.default.promises.unlink(entryPath).catch(() => { });
                console.log(`[AppUpdate] pruned cached installer file: ${entryPath}`);
            }
        }
        catch (error) {
            const err = error;
            if (err.code !== 'ENOENT') {
                console.warn('[AppUpdate] failed to prune cached installer files:', error);
            }
        }
    }
    async resolveMatchingReadyFile(previousState, targetSource, latestVersion) {
        console.log(`[AppUpdate] resolveMatchingReadyFile started, targetSource=${targetSource}, previousStatus=${previousState.status}, previousSource=${previousState.source ?? 'none'}, previousVersion=${previousState.info?.latestVersion ?? 'none'}, latestVersion=${latestVersion}`);
        const inMemoryReadyFile = previousState.source === targetSource &&
            previousState.status === constants_2.AppUpdateStatus.Ready &&
            previousState.info?.latestVersion === latestVersion &&
            previousState.readyFilePath != null &&
            previousState.readyFileHash != null
            ? {
                version: latestVersion,
                filePath: previousState.readyFilePath,
                fileHash: previousState.readyFileHash,
                info: previousState.info,
                windowsInstallerUrlPolicyReceipt: this.getReadyWindowsInstallerReceipt({
                    version: latestVersion,
                    filePath: previousState.readyFilePath,
                    fileHash: previousState.readyFileHash,
                    source: previousState.source,
                }),
            }
            : null;
        if (inMemoryReadyFile) {
            console.log(`[AppUpdate] checking in-memory ready file: ${inMemoryReadyFile.filePath}`);
            if (!this.isTrustedWindowsReadyInstallerInfo(inMemoryReadyFile.info, inMemoryReadyFile.windowsInstallerUrlPolicyReceipt)) {
                await this.cleanupReadyFile(inMemoryReadyFile.filePath);
                this.clearStoredReadyFile(previousState.source);
                this.readyWindowsInstallerTrust = null;
            }
            else {
                const isValid = await this.isReadyFileValid(inMemoryReadyFile.filePath, inMemoryReadyFile.fileHash);
                if (isValid) {
                    console.log('[AppUpdate] in-memory ready file is valid');
                    return inMemoryReadyFile;
                }
                console.warn('[AppUpdate] in-memory ready file is invalid');
            }
        }
        // A matching installer may have been downloaded by the other flow (e.g. a
        // manual check after the auto updater already fetched this version), so
        // consider both persisted records, preferring the target source's own.
        const candidateSources = targetSource === constants_2.AppUpdateSource.Manual
            ? [constants_2.AppUpdateSource.Manual, constants_2.AppUpdateSource.Auto]
            : [constants_2.AppUpdateSource.Auto, constants_2.AppUpdateSource.Manual];
        for (const source of candidateSources) {
            const storedReadyFile = this.getStoredReadyFile(source);
            if (!storedReadyFile || storedReadyFile.version !== latestVersion) {
                console.log(`[AppUpdate] stored ready file mismatch, source=${source}, storedVersion=${storedReadyFile?.version ?? 'none'}, latestVersion=${latestVersion}`);
                continue;
            }
            console.log(`[AppUpdate] checking persisted ready file: ${storedReadyFile.filePath}`);
            if (!this.isTrustedWindowsReadyInstallerInfo(storedReadyFile.info, storedReadyFile.windowsInstallerUrlPolicyReceipt)) {
                await this.cleanupReadyFile(storedReadyFile.filePath);
                this.clearStoredReadyFile(source);
                continue;
            }
            const isValid = await this.isReadyFileValid(storedReadyFile.filePath, storedReadyFile.fileHash);
            if (isValid) {
                console.log(`[AppUpdate] persisted ready file from source=${source} is valid`);
                return storedReadyFile;
            }
            console.warn(`[AppUpdate] persisted ready file is invalid, deleting: ${storedReadyFile.filePath}`);
            await this.cleanupReadyFile(storedReadyFile.filePath);
            this.clearStoredReadyFile(source);
        }
        return null;
    }
    async isReadyFileValid(filePath, expectedHash) {
        try {
            if (!this.isExpectedReadyInstallerPath(filePath)) {
                console.warn(`[AppUpdate] ready file validation failed: path is outside the managed update cache, path=${filePath}`);
                return false;
            }
            const stat = await fs_1.default.promises.lstat(filePath);
            if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0) {
                console.warn(`[AppUpdate] ready file validation failed: file missing or empty, path=${filePath}`);
                return false;
            }
            const actualHash = await this.computeFileHash(filePath);
            if (actualHash !== expectedHash) {
                console.warn(`[AppUpdate] ready file validation failed: hash mismatch, path=${filePath}, expectedHash=${expectedHash}, actualHash=${actualHash}`);
            }
            return actualHash === expectedHash;
        }
        catch {
            console.warn(`[AppUpdate] ready file validation failed: stat/hash threw, path=${filePath}`);
            return false;
        }
    }
    async computeFileHash(filePath) {
        return await new Promise((resolve, reject) => {
            const hash = crypto_1.default.createHash('sha256');
            const stream = fs_1.default.createReadStream(filePath);
            stream.on('error', reject);
            stream.on('data', chunk => {
                hash.update(chunk);
            });
            stream.on('end', () => {
                resolve(hash.digest('hex'));
            });
        });
    }
    restoreStoredReadyState() {
        const sources = [constants_2.AppUpdateSource.Manual, constants_2.AppUpdateSource.Auto];
        let restored = false;
        for (const source of sources) {
            const storedReadyFile = this.getStoredReadyFile(source);
            if (!storedReadyFile) {
                continue;
            }
            console.log(`[AppUpdate] restoring persisted ready file, source=${source}, version=${storedReadyFile.version}, filePath=${storedReadyFile.filePath}`);
            if (this.compareVersions(storedReadyFile.version, this.resolveCurrentVersion()) <= 0) {
                console.log(`[AppUpdate] persisted ready file is not newer than current version, clearing it: source=${source}, storedVersion=${storedReadyFile.version}, currentVersion=${this.resolveCurrentVersion()}`);
                // An attempted install whose version the app is now running means the
                // installer completed and relaunched us — surface it once in the UI.
                if (storedReadyFile.installAttempted === true &&
                    this.compareVersions(storedReadyFile.version, this.resolveCurrentVersion()) === 0) {
                    console.log(`[AppUpdate] detected completed update to version ${storedReadyFile.version}`);
                    this.completedUpdateVersion = storedReadyFile.version;
                }
                this.clearStoredReadyFile(source);
                void this.pruneCachedInstallerFiles(source);
                continue;
            }
            if (!this.isTrustedWindowsReadyInstallerInfo(storedReadyFile.info, storedReadyFile.windowsInstallerUrlPolicyReceipt)) {
                this.clearStoredReadyFile(source);
                void this.cleanupReadyFile(storedReadyFile.filePath);
                void this.pruneCachedInstallerFiles(source);
                continue;
            }
            try {
                if (!this.isExpectedReadyInstallerPath(storedReadyFile.filePath)) {
                    console.warn(`[AppUpdate] persisted ready file is outside the managed update cache: ${storedReadyFile.filePath}`);
                    this.clearStoredReadyFile(source);
                    void this.cleanupReadyFile(storedReadyFile.filePath);
                    continue;
                }
                const stat = fs_1.default.lstatSync(storedReadyFile.filePath);
                if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0) {
                    console.warn(`[AppUpdate] persisted ready file is missing or empty during startup restore: ${storedReadyFile.filePath}`);
                    this.clearStoredReadyFile(source);
                    void this.pruneCachedInstallerFiles(source);
                    continue;
                }
            }
            catch {
                console.warn(`[AppUpdate] persisted ready file stat failed during startup restore: ${storedReadyFile.filePath}`);
                this.clearStoredReadyFile(source);
                void this.pruneCachedInstallerFiles(source);
                continue;
            }
            this.state = {
                status: constants_2.AppUpdateStatus.Ready,
                source,
                info: storedReadyFile.info ?? this.createStoredReadyInfo(storedReadyFile.version),
                progress: null,
                readyFilePath: storedReadyFile.filePath,
                readyFileHash: storedReadyFile.fileHash,
                errorMessage: null,
                installIncomplete: storedReadyFile.installAttempted === true,
            };
            this.bindReadyWindowsInstallerTrust(storedReadyFile);
            void this.pruneCachedInstallerFiles(source, [storedReadyFile.filePath]);
            console.log(`[AppUpdate] restored ready update into runtime state, source=${source}, version=${this.state.info?.latestVersion ?? 'none'}, filePath=${this.state.readyFilePath ?? 'none'}`);
            restored = true;
            break;
        }
        if (!restored) {
            console.log('[AppUpdate] no persisted ready file found during startup restore');
            void this.pruneCachedInstallerFiles(constants_2.AppUpdateSource.Manual);
            void this.pruneCachedInstallerFiles(constants_2.AppUpdateSource.Auto);
        }
    }
    createStoredReadyInfo(version) {
        return {
            latestVersion: version,
            date: '',
            changeLog: {
                zh: { title: '', content: [] },
                en: { title: '', content: [] },
            },
            url: '',
        };
    }
    bindReadyWindowsInstallerTrust(record) {
        const receipt = record.windowsInstallerUrlPolicyReceipt;
        if (process.platform !== 'win32' || !receipt) {
            this.readyWindowsInstallerTrust = null;
            return;
        }
        this.readyWindowsInstallerTrust = {
            version: record.version,
            filePath: record.filePath,
            fileHash: record.fileHash,
            receipt,
        };
    }
    getReadyWindowsInstallerReceipt(candidate) {
        const matches = (record) => record?.version === candidate.version
            && record.filePath === candidate.filePath
            && record.fileHash === candidate.fileHash;
        if (matches(this.readyWindowsInstallerTrust)) {
            return this.readyWindowsInstallerTrust?.receipt;
        }
        const stored = this.getStoredReadyFile(candidate.source);
        if (matches(stored)) {
            return stored?.windowsInstallerUrlPolicyReceipt;
        }
        return undefined;
    }
    isTrustedWindowsReadyInstallerInfo(info, receipt) {
        if (process.platform !== 'win32') {
            return true;
        }
        const result = (0, appUpdateUrlPolicy_1.validateWindowsInstallerUrl)(info?.url?.trim() ?? '');
        if ('reason' in result) {
            console.error(`[AppUpdate] rejected cached Windows installer source, reason=${result.reason}`);
            return false;
        }
        const receiptTrusted = receipt?.policyVersion === appUpdateUrlPolicy_1.WINDOWS_INSTALLER_URL_POLICY_VERSION
            && receipt.inputOrigin === result.url.origin
            && receipt.finalOrigin === result.url.origin
            && (0, appUpdateUrlPolicy_1.isSecureWindowsInstallerOrigin)(receipt.inputOrigin)
            && (0, appUpdateUrlPolicy_1.isSecureWindowsInstallerOrigin)(receipt.finalOrigin);
        if (!receiptTrusted) {
            console.error('[AppUpdate] rejected cached Windows installer source, reason=receipt-invalid');
        }
        return receiptTrusted;
    }
    getReadyFileStoreKey(source) {
        return `${exports.APP_UPDATE_READY_FILE_KEY_PREFIX}:${source ?? 'unknown'}`;
    }
    getStoredReadyFile(source) {
        try {
            const key = this.getReadyFileStoreKey(source);
            const value = this.store.get(key);
            if (!value?.version || !value.filePath || !value.fileHash) {
                console.log('[AppUpdate] persisted ready file record is missing required fields');
                return null;
            }
            console.log(`[AppUpdate] loaded persisted ready file record, source=${source ?? 'unknown'}, version=${value.version}, filePath=${value.filePath}`);
            return value;
        }
        catch (error) {
            console.warn('[AppUpdate] failed to read stored ready file:', error);
            return null;
        }
    }
    setStoredReadyFile(value) {
        try {
            const source = this.state.source ?? constants_2.AppUpdateSource.Auto;
            this.store.set(this.getReadyFileStoreKey(source), value);
            console.log(`[AppUpdate] persisted ready file record, source=${source}, version=${value.version}, filePath=${value.filePath}`);
        }
        catch (error) {
            console.warn('[AppUpdate] failed to persist ready file:', error);
        }
    }
    clearStoredReadyFile(source) {
        if (source == null) {
            return;
        }
        try {
            this.store.delete(this.getReadyFileStoreKey(source));
            console.log(`[AppUpdate] cleared persisted ready file record for source=${source}`);
        }
        catch (error) {
            console.warn('[AppUpdate] failed to clear stored ready file:', error);
        }
    }
}
exports.AppUpdateCoordinator = AppUpdateCoordinator;
//# sourceMappingURL=appUpdateCoordinator.js.map