"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findRedundantFinalPrefixMessageId = exports.findReusableCommittedAssistantMessageId = exports.findReusableFinalAssistantMessageId = exports.findMatchingThinkingMessageIdInCurrentTurn = exports.extractThinkingFromCurrentTurn = exports.isRedundantFinalPrefixSegment = void 0;
const openclawHistory_1 = require("../openclawHistory");
const isRecord = (value) => {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
};
const isThinkingAssistantMessage = (message) => {
    return message.type === 'assistant'
        && isRecord(message.metadata)
        && message.metadata.isThinking === true;
};
const isRedundantFinalPrefixSegment = (candidate, finalText) => {
    const normalizedCandidate = candidate.replace(/\s+/g, ' ').trim();
    const normalizedFinal = finalText.replace(/\s+/g, ' ').trim();
    if (normalizedCandidate.length < 80 || normalizedFinal.length <= normalizedCandidate.length) {
        return false;
    }
    if (!normalizedFinal.startsWith(normalizedCandidate)) {
        return false;
    }
    return normalizedCandidate.length / normalizedFinal.length >= 0.35;
};
exports.isRedundantFinalPrefixSegment = isRedundantFinalPrefixSegment;
const extractThinkingFromCurrentTurn = (messages) => {
    let lastUserIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if (isRecord(msg) && msg.role === 'user') {
            lastUserIdx = i;
            break;
        }
    }
    const startIdx = lastUserIdx >= 0 ? lastUserIdx + 1 : 0;
    const thinkingParts = [];
    for (let i = startIdx; i < messages.length; i++) {
        const msg = messages[i];
        if (!isRecord(msg))
            continue;
        const role = typeof msg.role === 'string' ? msg.role.trim().toLowerCase() : '';
        if (role !== 'assistant')
            continue;
        const thinking = (0, openclawHistory_1.extractGatewayMessageThinking)(msg);
        if (thinking) {
            thinkingParts.push(thinking);
        }
    }
    return thinkingParts.join('\n\n').trim();
};
exports.extractThinkingFromCurrentTurn = extractThinkingFromCurrentTurn;
const findMatchingThinkingMessageIdInCurrentTurn = (messages, thinkingText) => {
    const targetText = thinkingText.trim();
    if (!targetText)
        return null;
    for (let index = messages.length - 1; index >= 0; index--) {
        const message = messages[index];
        if (message.type === 'user')
            break;
        if (!isThinkingAssistantMessage(message))
            continue;
        if (message.content.trim() === targetText) {
            return message.id;
        }
    }
    return null;
};
exports.findMatchingThinkingMessageIdInCurrentTurn = findMatchingThinkingMessageIdInCurrentTurn;
const findReusableFinalAssistantMessageId = (messages, content) => {
    const normalizedContent = content.trim();
    if (!normalizedContent) {
        return null;
    }
    // Scan backward: in normal flow the assistant message is last; after a skill
    // switch one user message may sit between the previous assistant reply and
    // this sync. Allow at most one non-assistant message before giving up.
    let nonAssistantCount = 0;
    for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if (msg.type === 'assistant') {
            return !isThinkingAssistantMessage(msg) && msg.content.trim() === normalizedContent ? msg.id : null;
        }
        nonAssistantCount++;
        if (nonAssistantCount > 1) {
            return null;
        }
    }
    return null;
};
exports.findReusableFinalAssistantMessageId = findReusableFinalAssistantMessageId;
const findReusableCommittedAssistantMessageId = (messages, messageId, content) => {
    const normalizedContent = content.trim();
    if (!messageId || !normalizedContent) {
        return null;
    }
    const message = messages.find((candidate) => candidate.id === messageId);
    if (!message
        || message.type !== 'assistant'
        || isThinkingAssistantMessage(message)
        || message.content.trim() !== normalizedContent) {
        return null;
    }
    return message.id;
};
exports.findReusableCommittedAssistantMessageId = findReusableCommittedAssistantMessageId;
const findRedundantFinalPrefixMessageId = (messages, finalMessageId, finalText) => {
    const normalizedFinalText = finalText.trim();
    if (!normalizedFinalText)
        return null;
    const finalIndex = finalMessageId
        ? messages.findIndex((message) => message.id === finalMessageId)
        : messages.length;
    const scanStart = finalIndex >= 0 ? finalIndex - 1 : messages.length - 1;
    for (let i = scanStart; i >= 0; i -= 1) {
        const message = messages[i];
        if (message.type === 'user') {
            return null;
        }
        if (message.type !== 'assistant' || message.id === finalMessageId) {
            continue;
        }
        if (isThinkingAssistantMessage(message)) {
            continue;
        }
        return (0, exports.isRedundantFinalPrefixSegment)(message.content, normalizedFinalText)
            ? message.id
            : null;
    }
    return null;
};
exports.findRedundantFinalPrefixMessageId = findRedundantFinalPrefixMessageId;
//# sourceMappingURL=assistantMessageReconciliation.js.map