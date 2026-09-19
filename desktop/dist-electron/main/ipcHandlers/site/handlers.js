"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerSiteIpcHandlers = registerSiteIpcHandlers;
const electron_1 = require("electron");
const constants_1 = require("../../../shared/htmlShare/constants");
const constants_2 = require("../../../shared/site/constants");
const siteClient_1 = require("../../libs/site/siteClient");
const requireShareId = (value) => {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > 64) {
        throw new Error('Invalid site identifier');
    }
    return value.trim();
};
const requireAccessMode = (value) => {
    if (value !== constants_1.HtmlShareAccessMode.Public && value !== constants_1.HtmlShareAccessMode.Code) {
        throw new Error('Invalid site access mode');
    }
    return value;
};
const requireAccessStatus = (value) => {
    if (value !== constants_1.HtmlShareStatus.Live && value !== constants_1.HtmlShareStatus.Disabled) {
        throw new Error('Invalid site access status');
    }
    return value;
};
const handleSiteRequest = async (action, request) => {
    try {
        return await request();
    }
    catch (error) {
        console.error(`[Sites] ${action} failed:`, error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Site request failed',
        };
    }
};
function registerSiteIpcHandlers({ getServerApiBaseUrl, fetchWithAuth, }) {
    electron_1.ipcMain.handle(constants_2.SiteIpc.List, (_event, options = {}) => handleSiteRequest('list request', () => (0, siteClient_1.listSites)(getServerApiBaseUrl(), fetchWithAuth, options ?? {})));
    electron_1.ipcMain.handle(constants_2.SiteIpc.Get, (_event, shareId) => handleSiteRequest('detail request', () => (0, siteClient_1.getSite)(getServerApiBaseUrl(), fetchWithAuth, requireShareId(shareId))));
    electron_1.ipcMain.handle(constants_2.SiteIpc.UpdateTitle, (_event, input) => handleSiteRequest('title update', () => (0, siteClient_1.updateSiteTitle)(getServerApiBaseUrl(), fetchWithAuth, requireShareId(input?.shareId), typeof input?.title === 'string' ? input.title.slice(0, 100) : '')));
    electron_1.ipcMain.handle(constants_2.SiteIpc.UpdateAccessMode, (_event, input) => handleSiteRequest('access-mode update', () => (0, siteClient_1.updateSiteAccessMode)(getServerApiBaseUrl(), fetchWithAuth, requireShareId(input?.shareId), requireAccessMode(input?.accessMode))));
    electron_1.ipcMain.handle(constants_2.SiteIpc.UpdateAccessStatus, (_event, input) => handleSiteRequest('access-status update', () => (0, siteClient_1.updateSiteAccessStatus)(getServerApiBaseUrl(), fetchWithAuth, requireShareId(input?.shareId), requireAccessStatus(input?.status))));
    electron_1.ipcMain.handle(constants_2.SiteIpc.Delete, (_event, shareId) => handleSiteRequest('delete request', () => (0, siteClient_1.deleteSite)(getServerApiBaseUrl(), fetchWithAuth, requireShareId(shareId))));
    electron_1.ipcMain.handle(constants_2.SiteIpc.GetAnalytics, (_event, shareId, options = {}) => handleSiteRequest('analytics request', () => (0, siteClient_1.getSiteAnalytics)(getServerApiBaseUrl(), fetchWithAuth, requireShareId(shareId), options ?? {})));
    electron_1.ipcMain.handle(constants_2.SiteIpc.GetDeploymentQuota, (_event, options = {}) => handleSiteRequest('deployment-quota request', () => (0, siteClient_1.getSiteDeploymentQuota)(getServerApiBaseUrl(), fetchWithAuth, options ?? {})));
    electron_1.ipcMain.handle(constants_2.SiteIpc.CreateQuotaReservation, (_event, input) => handleSiteRequest('quota-reservation creation', () => {
        if (!input || typeof input.requestKey !== 'string' || !input.requestKey.trim()) {
            throw new Error('Invalid site quota reservation request');
        }
        return (0, siteClient_1.createSiteQuotaReservation)(getServerApiBaseUrl(), fetchWithAuth, {
            requestKey: input.requestKey.trim().slice(0, 128),
            ...(input.targetShareId
                ? { targetShareId: requireShareId(input.targetShareId) }
                : {}),
        });
    }));
    electron_1.ipcMain.handle(constants_2.SiteIpc.ReleaseQuotaReservation, (_event, reservationId) => handleSiteRequest('quota-reservation release', () => (0, siteClient_1.releaseSiteQuotaReservation)(getServerApiBaseUrl(), fetchWithAuth, requireShareId(reservationId))));
}
//# sourceMappingURL=handlers.js.map