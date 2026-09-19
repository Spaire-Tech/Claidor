"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppUpdateUrlUntrustedError = exports.WINDOWS_INSTALLER_URL_POLICY_VERSION = exports.WindowsInstallerUrlPolicyFailure = void 0;
exports.validateWindowsInstallerUrl = validateWindowsInstallerUrl;
exports.isSecureWindowsInstallerOrigin = isSecureWindowsInstallerOrigin;
exports.assertTrustedWindowsInstallerUrl = assertTrustedWindowsInstallerUrl;
const path_1 = __importDefault(require("path"));
const constants_1 = require("../../shared/appUpdate/constants");
exports.WindowsInstallerUrlPolicyFailure = {
    InvalidUrl: 'invalid-url',
    InsecureProtocol: 'insecure-protocol',
    CredentialsPresent: 'credentials-present',
    FragmentPresent: 'fragment-present',
    UnapprovedPort: 'unapproved-port',
    InvalidExtension: 'invalid-extension',
};
exports.WINDOWS_INSTALLER_URL_POLICY_VERSION = 2;
/**
 * Enforce the transport-level policy that is stable across CDN changes.
 * This deliberately does not authenticate the publisher or pin an origin;
 * signed release metadata and Authenticode verification are separate work.
 */
function validateWindowsInstallerUrl(rawUrl) {
    let url;
    try {
        url = new URL(rawUrl);
    }
    catch {
        return { trusted: false, reason: exports.WindowsInstallerUrlPolicyFailure.InvalidUrl };
    }
    if (url.protocol !== 'https:') {
        return { trusted: false, reason: exports.WindowsInstallerUrlPolicyFailure.InsecureProtocol };
    }
    if (url.username || url.password) {
        return { trusted: false, reason: exports.WindowsInstallerUrlPolicyFailure.CredentialsPresent };
    }
    if (url.hash) {
        return { trusted: false, reason: exports.WindowsInstallerUrlPolicyFailure.FragmentPresent };
    }
    // WHATWG URL normalizes an explicit :443 to the default empty port.
    if (url.port) {
        return { trusted: false, reason: exports.WindowsInstallerUrlPolicyFailure.UnapprovedPort };
    }
    if (path_1.default.posix.extname(url.pathname).toLowerCase() !== '.exe') {
        return { trusted: false, reason: exports.WindowsInstallerUrlPolicyFailure.InvalidExtension };
    }
    return { trusted: true, url };
}
/** Validate a canonical origin previously emitted by URL.origin. */
function isSecureWindowsInstallerOrigin(rawOrigin) {
    try {
        const url = new URL(rawOrigin);
        return (url.protocol === 'https:'
            && !url.username
            && !url.password
            && !url.port
            && !url.search
            && !url.hash
            && url.pathname === '/'
            && url.origin === rawOrigin);
    }
    catch {
        return false;
    }
}
class AppUpdateUrlUntrustedError extends Error {
    reason;
    constructor(reason) {
        super(constants_1.APP_UPDATE_URL_UNTRUSTED_ERROR);
        this.name = 'AppUpdateUrlUntrustedError';
        this.reason = reason;
    }
}
exports.AppUpdateUrlUntrustedError = AppUpdateUrlUntrustedError;
function assertTrustedWindowsInstallerUrl(rawUrl) {
    const result = validateWindowsInstallerUrl(rawUrl);
    if ('reason' in result) {
        throw new AppUpdateUrlUntrustedError(result.reason);
    }
    return result.url;
}
//# sourceMappingURL=appUpdateUrlPolicy.js.map