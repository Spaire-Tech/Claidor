"use strict";
/**
 * The agent putting an emoji on the person's message.
 *
 * **Why this exists.** The founder's chat-UI logic
 * (`docs/product/sources/caisra-chat-ui-logic.md`, §1 and §8) lists
 * `ReactToMessage`: *"Emoji tapback on a user message. Lightweight ack;
 * does not replace awaited delivery."* The person has had reactions
 * since 15 September (`renderer/design/thread/actions.ts`); the agent
 * had no way to make one. This is that way.
 *
 * **Which message.** The agent never sees message ids — it sees text —
 * so the tool takes no id. A tapback goes on the message being replied
 * to, which is the person's newest message in the conversation the
 * tool was called from. The session comes from the engine's tool
 * context, the way `AskUserQuestion` gets it; the tool lives in the same
 * plugin for that reason.
 *
 * **What it is not.** It is not a message and the engine never hears
 * back about it. It is drawn by the app and kept where the person's own
 * reactions are kept, beside the conversation.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReactionIpc = exports.REACT_ROUTE = exports.REACT_TOOL = void 0;
exports.parseReactInput = parseReactInput;
exports.latestPersonMessageId = latestPersonMessageId;
/** The tool's name, as the model sees it. */
exports.REACT_TOOL = 'ReactToMessage';
/** The bridge route the plugin posts to. */
exports.REACT_ROUTE = '/react';
/** main → renderer: draw this one. */
exports.ReactionIpc = {
    Agent: 'reaction:agent',
};
/**
 * The tool's argument, checked: one emoji. A string back is the reason
 * it was refused, for the model.
 *
 * One grapheme rather than one code point, so a flag, a skin tone or a
 * family stays whole. Letters and digits are not reactions.
 */
function parseReactInput(raw) {
    const input = raw && typeof raw === 'object' && !Array.isArray(raw)
        ? raw
        : {};
    const text = typeof input.emoji === 'string' ? input.emoji.trim() : '';
    if (!text)
        return 'An emoji is required.';
    const first = firstGrapheme(text);
    if (first !== text)
        return 'One emoji only.';
    if (/^[\p{L}\p{N}\p{P}\s]+$/u.test(first))
        return 'That is not an emoji.';
    return { emoji: first };
}
function firstGrapheme(text) {
    const Segmenter = Intl.Segmenter;
    if (Segmenter) {
        const first = new Segmenter(undefined, { granularity: 'grapheme' }).segment(text)[Symbol.iterator]().next();
        return first.done ? '' : first.value.segment;
    }
    return Array.from(text)[0] ?? '';
}
/**
 * The message a tapback goes on: the person's newest. `messages` in the
 * order they were said. Undefined when the person has said nothing yet.
 */
function latestPersonMessageId(messages) {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
        if (messages[index].type === 'user')
            return messages[index].id;
    }
    return undefined;
}
//# sourceMappingURL=constants.js.map