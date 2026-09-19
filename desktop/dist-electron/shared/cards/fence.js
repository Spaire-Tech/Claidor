"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.splitCardSegments = splitCardSegments;
exports.stripCards = stripCards;
exports.hasCards = hasCards;
const library_1 = require("./library");
/**
 * A fence line with the card language, or the bare `openui` the model
 * sometimes writes, closed by the next fence line. Anchored to line
 * starts so a fence inside a sentence is not one.
 */
const CARD_BLOCK = new RegExp(`^[ \\t]*\`\`\`[ \\t]*(?:${library_1.CARD_FENCE}|openui)[ \\t]*\\r?\\n([\\s\\S]*?)^[ \\t]*\`\`\`[ \\t]*$`, 'gim');
/** The reply in order: text, card, text. Empty text between fences is dropped. */
function splitCardSegments(content) {
    const out = [];
    let last = 0;
    for (const match of content.matchAll(CARD_BLOCK)) {
        const before = content.slice(last, match.index).trim();
        if (before)
            out.push({ kind: 'text', text: before });
        const program = match[1].trim();
        if (program)
            out.push({ kind: 'card', program });
        last = match.index + match[0].length;
    }
    const after = content.slice(last).trim();
    if (after)
        out.push({ kind: 'text', text: after });
    return out;
}
/** The reply without its card blocks, for a preview line. */
function stripCards(content) {
    return splitCardSegments(content)
        .filter((one) => one.kind === 'text')
        .map(one => one.text)
        .join('\n\n');
}
/** Whether a reply carries a card block at all. */
function hasCards(content) {
    return splitCardSegments(content).some(one => one.kind === 'card');
}
//# sourceMappingURL=fence.js.map