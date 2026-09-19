"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GoalDisplayAction = void 0;
exports.parseGoalSettingCommandForDisplay = parseGoalSettingCommandForDisplay;
exports.buildGoalSettingMessageMetadata = buildGoalSettingMessageMetadata;
exports.hasGoalSettingMessageMetadata = hasGoalSettingMessageMetadata;
exports.GoalDisplayAction = {
    Start: 'start',
    Create: 'create',
    Set: 'set',
};
const GOAL_SETTING_ACTIONS = new Set([
    exports.GoalDisplayAction.Start,
    exports.GoalDisplayAction.Create,
    exports.GoalDisplayAction.Set,
]);
function parseGoalSettingCommandForDisplay(input) {
    const trimmed = input.trim();
    if (!trimmed.startsWith('/'))
        return null;
    const match = /^\/goal(?:\s+(\S+))?(?:\s+([\s\S]*))?$/i.exec(trimmed);
    if (!match)
        return null;
    const rawAction = (match[1] ?? exports.GoalDisplayAction.Start).toLowerCase();
    if (!GOAL_SETTING_ACTIONS.has(rawAction))
        return null;
    const objective = (match[2] ?? '').trim();
    if (!objective)
        return null;
    return {
        action: rawAction,
        objective,
    };
}
function buildGoalSettingMessageMetadata(input) {
    const command = parseGoalSettingCommandForDisplay(input);
    if (!command)
        return undefined;
    return {
        goalSetting: {
            action: command.action,
            objective: command.objective,
        },
    };
}
function hasGoalSettingMessageMetadata(metadata) {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata))
        return false;
    const goalSetting = metadata.goalSetting;
    if (!goalSetting || typeof goalSetting !== 'object' || Array.isArray(goalSetting))
        return false;
    const action = goalSetting.action;
    return typeof action === 'string' && GOAL_SETTING_ACTIONS.has(action);
}
//# sourceMappingURL=goalCommandDisplay.js.map