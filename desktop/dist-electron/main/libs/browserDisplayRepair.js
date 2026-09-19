"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.repairBrowserDisplayMode = repairBrowserDisplayMode;
const constants_1 = require("../../shared/browserWebAccess/constants");
function repairBrowserDisplayMode(stored) {
    // Nothing stored is the case the default already handles.
    if (!stored)
        return { changed: false, next: stored };
    if (stored.displayMode === constants_1.BrowserDisplayMode.External) {
        return {
            changed: true,
            next: { ...stored, displayMode: constants_1.BrowserDisplayMode.InApp },
            reason: 'a stored "external" from the old settings screen',
        };
    }
    // No `displayMode` at all, but a `headless: false` that the normaliser
    // used to read as External. The inference is gone, so this would now
    // resolve to in-app on its own — but writing it down means the stored
    // config says what the app does, rather than relying on a default two
    // files away.
    if (stored.displayMode === undefined && stored.headless === false) {
        return {
            changed: true,
            next: { ...stored, displayMode: constants_1.BrowserDisplayMode.InApp },
            reason: 'a stored `headless: false`, which used to mean external',
        };
    }
    return { changed: false, next: stored };
}
//# sourceMappingURL=browserDisplayRepair.js.map