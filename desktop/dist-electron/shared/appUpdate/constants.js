"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.APP_UPDATE_HEARTBEAT_INTERVAL_MS = exports.APP_UPDATE_POLL_INTERVAL_MS = exports.APP_UPDATE_FILE_INVALID_ERROR = exports.APP_UPDATE_URL_UNTRUSTED_ERROR = exports.APP_UPDATE_ELEVATION_DECLINED_ERROR = exports.AppUpdateIpc = exports.AppUpdateSource = exports.AppUpdateStatus = void 0;
exports.isManualDownloadUrl = isManualDownloadUrl;
exports.AppUpdateStatus = {
    Idle: 'idle',
    Checking: 'checking',
    Available: 'available',
    Downloading: 'downloading',
    Ready: 'ready',
    Installing: 'installing',
    Error: 'error',
};
exports.AppUpdateSource = {
    Auto: 'auto',
    Manual: 'manual',
};
exports.AppUpdateIpc = {
    GetState: 'appUpdate:getState',
    CheckNow: 'appUpdate:checkNow',
    RetryDownload: 'appUpdate:retryDownload',
    InstallReady: 'appUpdate:installReady',
    StateChanged: 'appUpdate:stateChanged',
    GetCompletedUpdate: 'appUpdate:getCompletedUpdate',
    GetActiveWorkloads: 'appUpdate:getActiveWorkloads',
};
/**
 * Marker stored in AppUpdateRuntimeState.errorMessage when the user declined
 * the Windows UAC elevation prompt for a silent install. The OS-provided
 * exception text is localized, so this stable token is what crosses the IPC
 * boundary; the renderer maps it to a translated message.
 */
exports.APP_UPDATE_ELEVATION_DECLINED_ERROR = 'update-elevation-declined';
/**
 * Stable marker returned when a Windows installer URL fails the HTTPS
 * transport, credential, port, or extension policy.
 */
exports.APP_UPDATE_URL_UNTRUSTED_ERROR = 'update-url-untrusted';
/** Stable marker returned when cached installer bytes fail hash validation. */
exports.APP_UPDATE_FILE_INVALID_ERROR = 'update-file-invalid';
exports.APP_UPDATE_POLL_INTERVAL_MS = 2 * 60 * 60 * 1000;
exports.APP_UPDATE_HEARTBEAT_INTERVAL_MS = 30 * 60 * 1000;
/**
 * True when the update URL points at a download landing page that the user
 * must visit in a browser, rather than a direct installer file the app can
 * download and run itself.
 */
function isManualDownloadUrl(url) {
    return url.includes('#') || url.endsWith('/download-list');
}
//# sourceMappingURL=constants.js.map