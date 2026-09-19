"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppLinkKind = exports.APP_LINK_SCHEME = void 0;
exports.parseAppLink = parseAppLink;
exports.appLink = appLink;
exports.settingsAnchors = settingsAnchors;
exports.isSettingsAnchor = isSettingsAnchor;
const rows_1 = require("../settings/rows");
/**
 * The two links the agent can write that point back into this app.
 *
 * Everything else in a message points outward — a file on the disk, a page
 * on the web. These two point inward: *this setting*, and *what you said
 * earlier*. Both come from `grok-bot-chat.md` §9, where they are
 * `grokbot://app/v1/settings?id=…` and `sand-msg:…`.
 *
 * They are ordinary markdown links with our own scheme, so the message
 * parser needs no new syntax and a build that does not understand them
 * still shows the label rather than punctuation.
 *
 * **A pill only renders when the thing exists.** A settings pill naming a
 * row this build does not have would be the fabrication problem with a
 * nicer shape — a person clicks it, nothing happens, and they no longer
 * trust the next one. `isSettingsAnchor` is checked against the same
 * `settingsFor()` that draws the screen and writes
 * `reference/app-ui.md`, so the three cannot disagree.
 */
exports.APP_LINK_SCHEME = 'caisra:';
exports.AppLinkKind = {
    /** A row in Settings, by its anchor id. */
    Settings: 'settings',
    /** An earlier message in this conversation, by its id. */
    Message: 'message',
};
/** `caisra://settings/exec-policy` → `{ kind: 'settings', id: 'exec-policy' }`. */
function parseAppLink(target) {
    const match = /^caisra:\/\/(settings|message)\/([A-Za-z0-9_-]+)$/.exec(target.trim());
    if (!match)
        return undefined;
    return { kind: match[1], id: match[2] };
}
function appLink(kind, id) {
    return `${exports.APP_LINK_SCHEME}//${kind}/${id}`;
}
/** Every settings row id this build can draw, whether or not it is showing. */
function settingsAnchors() {
    const seen = new Set();
    for (const tab of rows_1.SETTINGS_TABS) {
        for (const group of (0, rows_1.settingsFor)(tab, ANCHOR_PROBE)) {
            for (const row of group.rows)
                seen.add(row.id);
        }
    }
    return [...seen];
}
function isSettingsAnchor(id) {
    return settingsAnchors().includes(id);
}
const noop = () => { };
/**
 * A person with every conditional row switched on, so the anchor list is
 * every row the app *can* draw rather than every row it happens to be
 * drawing. A pill for the working folder should still resolve on a
 * machine that has not opened a conversation yet.
 */
const ANCHOR_PROBE = {
    accountName: '-',
    computerName: '-',
    workingDirectory: '-',
    execPolicy: 'ask',
    memoryEnabled: true,
    usage: { fraction: 0, value: '-', desc: '-' },
    version: '-',
    onSignOut: noop,
    onAddAccount: noop,
    onExecPolicy: noop,
    onMemory: noop,
    onWorkingDirectory: noop,
    onRefreshUsage: noop,
    onCheckUpdates: noop,
};
//# sourceMappingURL=links.js.map