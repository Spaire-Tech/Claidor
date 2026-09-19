"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initCronJobServiceManager = initCronJobServiceManager;
exports.getCronJobService = getCronJobService;
const cronJobService_1 = require("../../../scheduledTask/cronJobService");
let cronJobService = null;
let deps = null;
function initCronJobServiceManager(d) {
    deps = d;
}
function getCronJobService() {
    if (!cronJobService) {
        if (!deps) {
            throw new Error('CronJobServiceManager not initialized. Call initCronJobServiceManager() first.');
        }
        const adapter = deps.getOpenClawRuntimeAdapter();
        if (!adapter) {
            throw new Error('The engine is not running. Scheduled tasks need the engine.');
        }
        cronJobService = new cronJobService_1.CronJobService({
            getGatewayClient: () => adapter.getGatewayClient(),
            ensureGatewayReady: () => adapter.ensureReady(),
        });
    }
    return cronJobService;
}
//# sourceMappingURL=cronJobServiceManager.js.map