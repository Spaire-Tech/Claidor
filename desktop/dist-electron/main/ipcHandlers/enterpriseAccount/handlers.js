"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerEnterpriseAccountHandlers = registerEnterpriseAccountHandlers;
const electron_1 = require("electron");
const constants_1 = require("../../../shared/enterpriseAccount/constants");
function registerEnterpriseAccountHandlers(deps) {
    electron_1.ipcMain.handle(constants_1.EnterpriseAccountIpcChannel.GetContext, () => deps.getContext());
    electron_1.ipcMain.handle(constants_1.EnterpriseAccountIpcChannel.GetIdentities, () => deps.getIdentities());
    electron_1.ipcMain.handle(constants_1.EnterpriseAccountIpcChannel.RequestQuotaIncrease, (_event, enterpriseId, requestType) => (deps.requestQuotaIncrease(enterpriseId, requestType)));
}
//# sourceMappingURL=handlers.js.map