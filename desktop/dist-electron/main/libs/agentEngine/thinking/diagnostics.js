"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.summarizeCurrentTurnThinkingHistoryForDiagnostics = exports.summarizeAgentEventForThinkingDiagnostics = exports.summarizeThinkingMessageForDiagnostics = exports.logThinkingDiagnostic = void 0;
/** Diagnostic summaries intentionally exclude thinking text. */
const THINKING_DIAGNOSTICS_ENABLED = process.env.LOBSTERAI_THINKING_DIAGNOSTICS === '1';
const isRecord = (value) => (Boolean(value && typeof value === 'object' && !Array.isArray(value)));
const logThinkingDiagnostic = (...parts) => {
    if (!THINKING_DIAGNOSTICS_ENABLED)
        return;
    console.debug('[ThinkingDiag]', ...parts);
};
exports.logThinkingDiagnostic = logThinkingDiagnostic;
const summarizeThinkingMessageForDiagnostics = (message) => {
    if (!isRecord(message))
        return `message=${typeof message}`;
    const role = typeof message.role === 'string' ? message.role : '?';
    const messageId = typeof message.id === 'string' ? message.id.slice(-12) : '-';
    const content = Array.isArray(message.content) ? message.content : [];
    const thinkingChars = [];
    const textChars = [];
    let toolCallCount = 0;
    for (const block of content) {
        if (!isRecord(block))
            continue;
        if (block.type === 'thinking' && typeof block.thinking === 'string') {
            thinkingChars.push(block.thinking.length);
        }
        if (block.type === 'text' && typeof block.text === 'string') {
            textChars.push(block.text.length);
        }
        if (block.type === 'toolCall' || block.type === 'tool_use' || block.type === 'tool_call') {
            toolCallCount += 1;
        }
    }
    return [
        `role=${role}`,
        `id=${messageId}`,
        `thinkingBlocks=[${thinkingChars.join(',')}]`,
        `textBlocks=[${textChars.join(',')}]`,
        `toolCalls=${toolCallCount}`,
    ].join(' ');
};
exports.summarizeThinkingMessageForDiagnostics = summarizeThinkingMessageForDiagnostics;
const summarizeAgentEventForThinkingDiagnostics = (payload, frameSeq) => {
    if (!isRecord(payload))
        return null;
    const stream = typeof payload.stream === 'string' ? payload.stream.trim() : '';
    if (!['assistant', 'thinking', 'tool', 'tools', 'lifecycle'].includes(stream))
        return null;
    const data = isRecord(payload.data) ? payload.data : null;
    const runId = typeof payload.runId === 'string' ? payload.runId.slice(-12) : '-';
    const payloadSeq = typeof payload.seq === 'number' ? payload.seq : undefined;
    const textChars = data && typeof data.text === 'string' ? data.text.length : 0;
    const deltaChars = data && typeof data.delta === 'string' ? data.delta.length : 0;
    const phase = data && typeof data.phase === 'string' ? data.phase : '-';
    const replace = data?.replace === true;
    const toolCallId = data && typeof data.toolCallId === 'string'
        ? data.toolCallId.slice(-12)
        : '-';
    const embeddedMessage = data?.message ?? payload.message;
    return [
        `agent stream=${stream || '-'}`,
        `frameSeq=${frameSeq ?? '-'}`,
        `payloadSeq=${payloadSeq ?? '-'}`,
        `run=${runId}`,
        `phase=${phase}`,
        `textChars=${textChars}`,
        `deltaChars=${deltaChars}`,
        `replace=${replace}`,
        `toolCall=${toolCallId}`,
        embeddedMessage !== undefined
            ? (0, exports.summarizeThinkingMessageForDiagnostics)(embeddedMessage)
            : `dataKeys=[${data ? Object.keys(data).join(',') : ''}]`,
    ].join(' ');
};
exports.summarizeAgentEventForThinkingDiagnostics = summarizeAgentEventForThinkingDiagnostics;
const summarizeCurrentTurnThinkingHistoryForDiagnostics = (messages) => {
    let lastUserIdx = -1;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index];
        if (isRecord(message) && message.role === 'user') {
            lastUserIdx = index;
            break;
        }
    }
    return messages
        .slice(lastUserIdx + 1)
        .map((message, relativeIndex) => ({ message, relativeIndex }))
        .filter(({ message }) => isRecord(message) && message.role === 'assistant')
        .slice(-40)
        .map(({ message, relativeIndex }) => (`assistant[${relativeIndex}] ${(0, exports.summarizeThinkingMessageForDiagnostics)(message)}`))
        .join(' | ');
};
exports.summarizeCurrentTurnThinkingHistoryForDiagnostics = summarizeCurrentTurnThinkingHistoryForDiagnostics;
//# sourceMappingURL=diagnostics.js.map