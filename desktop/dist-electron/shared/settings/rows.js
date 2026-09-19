"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EXEC_POLICY_OPTIONS = exports.SettingsRowKind = exports.SETTINGS_TABS = exports.SettingsTab = void 0;
exports.tabForRow = tabForRow;
exports.execPolicyLabel = execPolicyLabel;
exports.settingsFor = settingsFor;
const constants_1 = require("./constants");
/**
 * Settings, as data.
 *
 * The screen is a rail of four tabs and a column of grouped rows, and the
 * rows come in exactly five kinds. That is the canvas's structure, and
 * keeping it as data rather than as markup is what makes the interesting
 * half — which rows exist, what they say, what they are worth showing —
 * testable without rendering anything.
 *
 * **What is not here, and why.** The canvas draws rows this product does
 * not have anything behind: a second computer, an egress tunnel, hardware
 * security keys, auto-review rules in plain words, plan management, an
 * update track, and a shared cloud computer to update or reset. Every one
 * of those would be a control that looks like the others and does
 * nothing, which is the thing the founder has already objected to twice.
 * They are listed in `docs/product/review.md` under item 5 so the
 * omissions are a decision on the record rather than a gap.
 */
exports.SettingsTab = {
    General: 'General',
    Computer: 'Computer',
    Usage: 'Usage & Billing',
    Updates: 'Updates',
};
/** In the canvas's order, which is also the order of how often you need them. */
exports.SETTINGS_TABS = [
    exports.SettingsTab.General,
    exports.SettingsTab.Computer,
    exports.SettingsTab.Usage,
    exports.SettingsTab.Updates,
];
exports.SettingsRowKind = {
    Select: 'select',
    Toggle: 'toggle',
    Button: 'button',
    Field: 'field',
    Meter: 'meter',
};
/**
 * The three answers to "how much may it do on this computer".
 *
 * The wording matters more than usual: this is the sentence somebody
 * reads once and then lives with for months. Each says what happens, not
 * what it is called.
 */
exports.EXEC_POLICY_OPTIONS = [
    {
        value: constants_1.ExecPolicy.Ask,
        label: 'Ask every time',
        hint: 'Nothing runs on this computer until you say so.',
    },
    {
        value: constants_1.ExecPolicy.Auto,
        label: 'Check, then ask',
        hint: 'It runs everyday commands and asks you about risky ones.',
    },
    {
        value: constants_1.ExecPolicy.Allow,
        label: 'Allow automatically',
        hint: 'It runs commands without asking. You will not be shown them.',
    },
];
/**
 * The tab a row sits on, for a deep link the agent wrote
 * (`caisra://settings/<row>`), or undefined for a row that does not
 * exist. Found by building each tab rather than kept as a second table,
 * so a row that moves takes its link with it.
 */
function tabForRow(rowId, input) {
    return exports.SETTINGS_TABS.find(tab => settingsFor(tab, input).some(group => group.rows.some(row => row.id === rowId)));
}
function execPolicyLabel(policy) {
    return exports.EXEC_POLICY_OPTIONS.find(one => one.value === policy)?.label ?? 'Ask every time';
}
/** The groups on one tab. Empty groups never reach the screen. */
function settingsFor(tab, input) {
    const groups = build(tab, input);
    return groups.filter(group => group.rows.length > 0);
}
function build(tab, input) {
    switch (tab) {
        case exports.SettingsTab.Computer:
            return [
                {
                    title: 'This computer',
                    rows: [
                        ...(input.computerName
                            ? [{
                                    kind: exports.SettingsRowKind.Field,
                                    id: 'computer-name',
                                    label: 'Current computer',
                                    desc: 'The one you are using now. It is the only one — an agent here works on your disk, where your files already are.',
                                    value: input.computerName,
                                    readOnly: true,
                                }]
                            : []),
                        {
                            kind: exports.SettingsRowKind.Select,
                            id: 'exec-policy',
                            label: 'Running things on this computer',
                            desc: 'Opening files, running commands, driving the browser.',
                            value: input.execPolicy,
                            options: exports.EXEC_POLICY_OPTIONS,
                            onPick: value => input.onExecPolicy(value),
                        },
                        ...(input.workingDirectory
                            ? [{
                                    kind: exports.SettingsRowKind.Button,
                                    id: 'working-directory',
                                    label: 'Working folder',
                                    desc: input.workingDirectory,
                                    action: 'Change',
                                    onPress: input.onWorkingDirectory,
                                }]
                            : []),
                    ],
                },
            ];
        case exports.SettingsTab.Usage:
            return [
                {
                    title: 'Usage',
                    rows: [
                        ...(input.usage
                            ? [{
                                    kind: exports.SettingsRowKind.Meter,
                                    id: 'usage',
                                    label: 'Usage',
                                    fraction: input.usage.fraction,
                                    value: input.usage.value,
                                    desc: input.usage.desc,
                                }]
                            : []),
                        // Always here, so the tab is never blank. A figure that has
                        // not arrived is a thing you want to be able to ask for
                        // again, and a tab that opens onto nothing is worse than no
                        // tab — which is what this looked like before a test said so.
                        {
                            kind: exports.SettingsRowKind.Button,
                            id: 'refresh-usage',
                            label: input.usage ? 'Check again' : 'Usage',
                            desc: input.usage
                                ? 'Asks the server for the current figure.'
                                : 'The figure has not come back from the server yet.',
                            action: 'Refresh',
                            onPress: input.onRefreshUsage,
                        },
                    ],
                },
            ];
        case exports.SettingsTab.Updates:
            return [
                {
                    title: 'Updates',
                    rows: [{
                            kind: exports.SettingsRowKind.Button,
                            id: 'version',
                            label: input.version ? `Version ${input.version}` : 'Version',
                            ...(input.updateNote ? { desc: input.updateNote } : {}),
                            action: 'Check for updates',
                            ...(input.checkingUpdate ? { busy: true } : {}),
                            onPress: input.onCheckUpdates,
                        }],
                },
            ];
        case exports.SettingsTab.General:
        default:
            return [
                {
                    title: 'Account',
                    rows: [
                        {
                            kind: exports.SettingsRowKind.Button,
                            id: 'sign-out',
                            label: input.accountName,
                            ...(input.accountEmail ? { desc: input.accountEmail } : {}),
                            action: 'Sign out',
                            onPress: input.onSignOut,
                        },
                        {
                            kind: exports.SettingsRowKind.Button,
                            id: 'add-account',
                            label: 'Add account',
                            desc: 'One account at a time — signing in as somebody else replaces this one.',
                            action: 'Add',
                            onPress: input.onAddAccount,
                        },
                    ],
                },
                // No "Models" group, and no "Apps" group with a Composio key. There
                // was a Models group for a day — "Your account's allowance" or your
                // own provider key — and the founder, 16 September: "i told you only
                // use my claude code account. i told you to remove that settings for
                // api keys. or allowance or whatever that is." And, of keys in
                // general: "my users should never put a key. everything happens
                // under the hood. not a setting." So which models run is decided in
                // code — the account's models through the metered proxy, or the
                // Claude Code sign-in in a development build
                // (`main/libs/claudeCodeMode.ts`) — and the Composio key is
                // Claidor's, on the server (`polar/desktop/composio.py`).
                {
                    title: 'Agents',
                    rows: [{
                            kind: exports.SettingsRowKind.Toggle,
                            id: 'memory',
                            label: 'Memory',
                            desc: 'Your agents keep what you tell them — team names, where files live, how you like things written — and use it without being reminded.',
                            on: input.memoryEnabled,
                            onToggle: () => input.onMemory(!input.memoryEnabled),
                        }],
                },
            ];
    }
}
//# sourceMappingURL=rows.js.map