"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getKitStoreUrl = exports.getPortalTasksUrl = exports.getSkillStoreUrl = exports.getFallbackDownloadUrl = exports.getManualUpdateCheckUrl = exports.getUpdateCheckUrl = exports.getHtmlSharePublicBaseUrl = exports.getServerApiBaseUrl = exports.isTestModeEnabled = void 0;
exports.refreshEndpointsTestMode = refreshEndpointsTestMode;
const electron_1 = require("electron");
const constants_1 = require("../../shared/htmlShare/constants");
const constants_2 = require("../../shared/server/constants");
const developmentServerBaseUrl_1 = require("./developmentServerBaseUrl");
let cachedTestMode = null;
let loggedDevelopmentServerBaseUrl = null;
/**
 * Read testMode from store and cache it.
 * Call once at startup and again whenever app_config changes.
 */
function refreshEndpointsTestMode(store) {
    const appConfig = store.get('app_config');
    cachedTestMode = appConfig?.app?.testMode === true;
}
/**
 * Whether the app is in test mode.
 * Uses cached value after init; falls back to !app.isPackaged before init.
 */
const isTestModeEnabled = () => {
    return cachedTestMode ?? !electron_1.app.isPackaged;
};
exports.isTestModeEnabled = isTestModeEnabled;
/**
 * The server base, with a development override. There is no separate test
 * host yet, so testMode does not change it. See `shared/server/constants.ts`
 * for what hangs off it.
 */
const getServerApiBaseUrl = () => {
    const defaultBaseUrl = constants_2.SERVER_API_BASE_URL;
    const serverBaseUrl = (0, developmentServerBaseUrl_1.resolveDevelopmentServerBaseUrl)({
        defaultBaseUrl,
        developmentOverride: process.env.CAISRA_SERVER_BASE_URL,
        isDev: process.env.NODE_ENV === 'development',
        isPackaged: electron_1.app.isPackaged,
    });
    if (serverBaseUrl !== defaultBaseUrl
        && loggedDevelopmentServerBaseUrl !== serverBaseUrl) {
        console.warn(`[Endpoints] routing all server traffic to development origin ${serverBaseUrl}`);
        loggedDevelopmentServerBaseUrl = serverBaseUrl;
    }
    return serverBaseUrl;
};
exports.getServerApiBaseUrl = getServerApiBaseUrl;
const getHtmlSharePublicBaseUrl = () => {
    return `${(0, exports.getServerApiBaseUrl)()}${constants_1.HtmlSharePublicRoute.Root}`;
};
exports.getHtmlSharePublicBaseUrl = getHtmlSharePublicBaseUrl;
const getUpdateCheckUrl = () => (`${(0, exports.getServerApiBaseUrl)()}/api/updates/check`);
exports.getUpdateCheckUrl = getUpdateCheckUrl;
const getManualUpdateCheckUrl = () => (`${(0, exports.getServerApiBaseUrl)()}/api/updates/check-manual`);
exports.getManualUpdateCheckUrl = getManualUpdateCheckUrl;
// The web pages below are NetEase's and we have none of our own yet. They are
// only ever handed to `shell.openExternal`, so nothing reaches them unless a
// person clicks a growth surface — the ad slot, the credits float, the upgrade
// and pricing links — and those screens go when the Messages shell lands. They
// are left here rather than pointed at a page that does not exist; when the
// site exists, this block is the one place to change.
const getFallbackDownloadUrl = () => ((0, exports.isTestModeEnabled)()
    ? 'https://lobsterai.inner.youdao.com/#/download-list'
    : 'https://lobsterai.youdao.com/#/download-list');
exports.getFallbackDownloadUrl = getFallbackDownloadUrl;
const getSkillStoreUrl = () => (`${(0, exports.getServerApiBaseUrl)()}/api/skill-store`);
exports.getSkillStoreUrl = getSkillStoreUrl;
// Portal 页面
const PORTAL_BASE_TEST = 'https://lobsterai.inner.youdao.com/portal#';
const PORTAL_BASE_PROD = 'https://lobsterai.youdao.com/portal#';
const getPortalBase = () => (0, exports.isTestModeEnabled)() ? PORTAL_BASE_TEST : PORTAL_BASE_PROD;
const getPortalTasksUrl = () => `${getPortalBase()}/profile/detail?tab=tasks`;
exports.getPortalTasksUrl = getPortalTasksUrl;
const getKitStoreUrl = () => (`${(0, exports.getServerApiBaseUrl)()}/api/kit-store`);
exports.getKitStoreUrl = getKitStoreUrl;
//# sourceMappingURL=endpoints.js.map