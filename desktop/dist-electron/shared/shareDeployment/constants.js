"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShareDeploymentPersistenceBindingKind = exports.ShareDeploymentPersistenceUpdateMode = exports.ShareDeploymentPersistenceStatus = exports.ShareDeploymentPersistenceProvider = exports.ShareDeploymentKind = exports.ShareDeploymentFailureCode = exports.ShareDeploymentStatus = exports.ShareDeploymentPackageManager = exports.ShareDeploymentCandidateSource = exports.ShareDeploymentIpc = void 0;
exports.ShareDeploymentIpc = {
    DetectProjectCandidates: 'shareDeployment:detectProjectCandidates',
    AnalyzeProjectDirectory: 'shareDeployment:analyzeProjectDirectory',
    SelectPersistencePath: 'shareDeployment:selectPersistencePath',
    CreateNodeDeployment: 'shareDeployment:createNodeDeployment',
    Get: 'shareDeployment:get',
    GetByLocalService: 'shareDeployment:getByLocalService',
    GetPersistence: 'shareDeployment:getPersistence',
    DownloadPersistenceArchive: 'shareDeployment:downloadPersistenceArchive',
};
exports.ShareDeploymentCandidateSource = {
    Process: 'process',
    ProcessCwd: 'process_cwd',
    ArtifactMetadata: 'artifact_metadata',
    TextLabeledPath: 'text_labeled_path',
    TextFileLink: 'text_file_link',
    TextCdCommand: 'text_cd_command',
    TextCommonParent: 'text_common_parent',
    ToolWorkingDirectory: 'tool_working_directory',
    ToolCdCommand: 'tool_cd_command',
    ToolPwdResult: 'tool_pwd_result',
    Workspace: 'workspace',
    WorkspaceChild: 'workspace_child',
    Cache: 'cache',
    Manual: 'manual',
};
exports.ShareDeploymentPackageManager = {
    Npm: 'npm',
    Pnpm: 'pnpm',
    Yarn: 'yarn',
    Unknown: 'unknown',
};
exports.ShareDeploymentStatus = {
    Queued: 'queued',
    Deploying: 'deploying',
    Live: 'live',
    DeployFailed: 'deploy_failed',
    Expired: 'expired',
    Stopped: 'stopped',
};
exports.ShareDeploymentFailureCode = {
    Provider: 'provider_error',
    Service: 'service_error',
    Unexpected: 'unexpected_error',
    PersistenceUnavailable: 'persistence_unavailable',
    PersistenceInvalid: 'persistence_invalid',
    PersistenceDataMissing: 'persistence_data_missing',
};
exports.ShareDeploymentKind = {
    NodeService: 'node_service',
    StaticSite: 'static_site',
};
exports.ShareDeploymentPersistenceProvider = {
    Filesystem: 'filesystem',
};
exports.ShareDeploymentPersistenceStatus = {
    Configured: 'configured',
    Live: 'live',
    ResetPending: 'reset_pending',
    Error: 'error',
};
exports.ShareDeploymentPersistenceUpdateMode = {
    Preserve: 'preserve',
    Replace: 'replace',
};
exports.ShareDeploymentPersistenceBindingKind = {
    File: 'file',
    Directory: 'directory',
};
//# sourceMappingURL=constants.js.map