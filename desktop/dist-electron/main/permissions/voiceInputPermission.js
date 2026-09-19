"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerVoiceInputPermissionHandler = registerVoiceInputPermissionHandler;
const electron_1 = require("electron");
const isLocalhost = (hostname) => hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]';
function isTrustedRendererMediaUrl(requestUrl, isDev, startUrl) {
    try {
        const url = new URL(requestUrl);
        if (url.protocol === 'file:')
            return true;
        if (!isDev || (url.protocol !== 'http:' && url.protocol !== 'https:'))
            return false;
        if (startUrl) {
            try {
                return url.origin === new URL(startUrl).origin;
            }
            catch {
                return false;
            }
        }
        return isLocalhost(url.hostname) && url.port === '5175';
    }
    catch {
        return false;
    }
}
async function requestMacMicrophoneAccess() {
    if (process.platform !== 'darwin')
        return true;
    const status = electron_1.systemPreferences.getMediaAccessStatus('microphone');
    if (status === 'granted')
        return true;
    if (status === 'denied' || status === 'restricted') {
        console.warn(`[VoiceInput] macOS microphone access is ${status}`);
        return false;
    }
    try {
        const granted = await electron_1.systemPreferences.askForMediaAccess('microphone');
        if (!granted) {
            console.warn('[VoiceInput] macOS microphone access was not granted');
        }
        return granted;
    }
    catch (error) {
        console.warn('[VoiceInput] macOS microphone access request failed:', error);
        return false;
    }
}
function getPermissionMediaTypes(details) {
    if (!details || typeof details !== 'object' || !('mediaTypes' in details))
        return [];
    const mediaTypes = details.mediaTypes;
    return Array.isArray(mediaTypes) ? mediaTypes.filter((mediaType) => typeof mediaType === 'string') : [];
}
function registerVoiceInputPermissionHandler({ session, getMainWindow, isDev, startUrl, }) {
    session.setPermissionRequestHandler((webContents, permission, callback, details) => {
        if (permission !== 'media') {
            callback(false);
            return;
        }
        const mediaTypes = getPermissionMediaTypes(details);
        if (!mediaTypes.includes('audio')) {
            callback(false);
            return;
        }
        const requestingUrl = details.requestingUrl || webContents.getURL();
        const mainWindow = getMainWindow();
        if (mainWindow?.webContents !== webContents || !isTrustedRendererMediaUrl(requestingUrl, isDev, startUrl)) {
            console.warn(`[VoiceInput] blocked microphone permission request from ${requestingUrl || 'unknown origin'}`);
            callback(false);
            return;
        }
        void requestMacMicrophoneAccess().then(granted => {
            callback(granted);
        });
    });
}
//# sourceMappingURL=voiceInputPermission.js.map