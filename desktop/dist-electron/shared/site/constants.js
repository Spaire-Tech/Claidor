"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SiteErrorCode = exports.SiteAction = exports.SiteFilterStatus = exports.SiteDeploymentStatus = exports.SiteStatus = exports.SiteKind = exports.SiteIpc = void 0;
exports.SiteIpc = {
    List: 'site:list',
    Get: 'site:get',
    UpdateTitle: 'site:updateTitle',
    UpdateAccessMode: 'site:updateAccessMode',
    UpdateAccessStatus: 'site:updateAccessStatus',
    Delete: 'site:delete',
    GetAnalytics: 'site:getAnalytics',
    GetDeploymentQuota: 'site:getDeploymentQuota',
    CreateQuotaReservation: 'site:createQuotaReservation',
    ReleaseQuotaReservation: 'site:releaseQuotaReservation',
};
exports.SiteKind = {
    NodeService: 'node_service',
    StaticSite: 'static_site',
};
exports.SiteStatus = {
    Online: 'online',
    Deploying: 'deploying',
    AccessStopped: 'access_stopped',
    RedeployRequired: 'redeploy_required',
    Blocked: 'blocked',
    Failed: 'failed',
};
exports.SiteDeploymentStatus = {
    Queued: 'queued',
    Building: 'building',
    Deploying: 'deploying',
    HealthChecking: 'health_checking',
};
exports.SiteFilterStatus = {
    Unavailable: 'unavailable',
};
exports.SiteAction = {
    Rename: 'rename',
    ChangeAccessMode: 'change_access_mode',
    StopAccess: 'stop_access',
    ResumeAccess: 'resume_access',
    Redeploy: 'redeploy',
    ViewAnalytics: 'view_analytics',
    Delete: 'delete',
};
exports.SiteErrorCode = {
    NotFound: 41601,
    RedeployRequired: 41604,
    AnalyticsRangeInvalid: 41606,
    ActionConflict: 41607,
    ReopenUnavailable: 41608,
    DeploymentQuotaExceeded: 41609,
    QuotaConfigInvalid: 41610,
    QuotaReservationInvalid: 41611,
    DeleteRequiresStopped: 41612,
};
//# sourceMappingURL=constants.js.map