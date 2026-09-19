"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DSH_CONFIG_STORE_KEY = exports.DshIpcChannel = exports.DSH_STATE_DIR_NAME = exports.DSH_RUNTIME_RESOURCE_DIR = exports.DshInstallStage = exports.DshEngineErrorCode = exports.DshEnginePhase = void 0;
exports.DshEnginePhase = {
    NotInstalled: 'not_installed',
    Stopped: 'stopped',
    Installing: 'installing',
    Starting: 'starting',
    Ready: 'ready',
    Failed: 'failed',
};
exports.DshEngineErrorCode = {
    RuntimeMissing: 'runtime_missing',
    RuntimeInvalid: 'runtime_invalid',
    InstallFailed: 'install_failed',
    SpawnFailed: 'spawn_failed',
    ReadyTimeout: 'ready_timeout',
    CrashedEarly: 'crashed_early',
    PluginLoadFailed: 'plugin_load_failed',
};
// Stages of a runtime install. The renderer labels the current one while the
// download runs, so these travel over IPC and belong here rather than staying
// main-process literals.
exports.DshInstallStage = {
    Manifest: 'manifest',
    Download: 'download',
    Verify: 'verify',
    Extract: 'extract',
};
exports.DSH_RUNTIME_RESOURCE_DIR = 'dsh';
exports.DSH_STATE_DIR_NAME = 'dsh';
exports.DshIpcChannel = {
    GetState: 'dsh:getState',
    GetConfig: 'dsh:getConfig',
    SetEnabled: 'dsh:setEnabled',
    OpenWorkbench: 'dsh:openWorkbench',
    Stop: 'dsh:stop',
};
// kv store key holding { enabled: boolean } for the experimental dsh feature.
exports.DSH_CONFIG_STORE_KEY = 'dsh_config';
//# sourceMappingURL=constants.js.map