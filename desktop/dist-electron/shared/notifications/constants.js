"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeNotificationSettings = exports.defaultNotificationSettings = exports.classifyWaitingNotificationKind = exports.WaitingNotificationKind = exports.TaskCompletionNotificationMode = void 0;
const constants_1 = require("../cowork/constants");
/** When task-completion notifications are shown. */
exports.TaskCompletionNotificationMode = {
    Always: 'always',
    Unfocused: 'unfocused',
    Off: 'off',
};
/** Category of a "session is waiting for the user" notification. */
exports.WaitingNotificationKind = {
    Permission: 'permission',
    Question: 'question',
};
const classifyWaitingNotificationKind = (toolName) => toolName === constants_1.ASK_USER_QUESTION_TOOL_NAME
    ? exports.WaitingNotificationKind.Question
    : exports.WaitingNotificationKind.Permission;
exports.classifyWaitingNotificationKind = classifyWaitingNotificationKind;
exports.defaultNotificationSettings = {
    taskCompletionNotificationMode: exports.TaskCompletionNotificationMode.Unfocused,
    permissionNotificationsEnabled: true,
    questionNotificationsEnabled: true,
    taskCompletionNotificationsEnabled: true,
};
const isTaskCompletionNotificationMode = (value) => value === exports.TaskCompletionNotificationMode.Always ||
    value === exports.TaskCompletionNotificationMode.Unfocused ||
    value === exports.TaskCompletionNotificationMode.Off;
const normalizeNotificationSettings = (value) => {
    let mode;
    if (isTaskCompletionNotificationMode(value?.taskCompletionNotificationMode)) {
        mode = value.taskCompletionNotificationMode;
    }
    else if (typeof value?.taskCompletionNotificationsEnabled === 'boolean') {
        // Migrate the legacy single switch: on used to mean "notify while the app
        // is not in the foreground", off meant "never notify".
        mode = value.taskCompletionNotificationsEnabled
            ? exports.TaskCompletionNotificationMode.Unfocused
            : exports.TaskCompletionNotificationMode.Off;
    }
    else {
        mode = exports.defaultNotificationSettings.taskCompletionNotificationMode;
    }
    return {
        taskCompletionNotificationMode: mode,
        permissionNotificationsEnabled: typeof value?.permissionNotificationsEnabled === 'boolean'
            ? value.permissionNotificationsEnabled
            : exports.defaultNotificationSettings.permissionNotificationsEnabled,
        questionNotificationsEnabled: typeof value?.questionNotificationsEnabled === 'boolean'
            ? value.questionNotificationsEnabled
            : exports.defaultNotificationSettings.questionNotificationsEnabled,
        taskCompletionNotificationsEnabled: mode !== exports.TaskCompletionNotificationMode.Off,
    };
};
exports.normalizeNotificationSettings = normalizeNotificationSettings;
//# sourceMappingURL=constants.js.map