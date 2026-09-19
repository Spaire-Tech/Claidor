"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ActivityIpc = exports.ActivityServerErrorCode = exports.OneTimeCreditAction = exports.DailyCheckInAction = exports.ActivityLifecycleState = exports.ActivitySlotState = exports.ActivityTemplate = exports.ActivityType = exports.ActivityPlacement = exports.ActivityContainerApiVersion = void 0;
exports.ActivityContainerApiVersion = {
    NativeDailyCheckInV1: 2,
    NativeStartupCreditV1: 3,
};
exports.ActivityPlacement = {
    DesktopSidebar: 'desktop_sidebar',
    DesktopStartupModal: 'desktop_startup_modal',
};
exports.ActivityType = {
    DailyCheckIn: 'daily_check_in',
    OneTimeCreditReward: 'one_time_credit_reward',
};
exports.ActivityTemplate = {
    NativeDailyCheckInV1: 'native_daily_check_in_v1',
    NativeStartupCreditV1: 'native_startup_credit_v1',
};
exports.ActivitySlotState = {
    Empty: 'empty',
    Available: 'available',
};
exports.ActivityLifecycleState = {
    Active: 'active',
    NotStarted: 'not_started',
    Ended: 'ended',
    Offline: 'offline',
    Superseded: 'superseded',
};
exports.DailyCheckInAction = {
    CheckIn: 'check_in',
};
exports.OneTimeCreditAction = {
    Claim: 'claim',
};
exports.ActivityServerErrorCode = {
    NotFound: 51100,
    NotActive: 51101,
    LoginRequired: 51102,
    ActionInvalid: 51103,
    AlreadyClaimed: 51104,
    ConfigInvalid: 51105,
    RevisionMismatch: 51106,
};
exports.ActivityIpc = {
    HostGetSlot: 'activity:host:get-slot',
    HostGetContext: 'activity:host:get-context',
    HostExecuteAction: 'activity:host:execute-action',
};
//# sourceMappingURL=constants.js.map