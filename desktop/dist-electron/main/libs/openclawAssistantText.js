"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractOpenClawAssistantStreamText = extractOpenClawAssistantStreamText;
exports.extractOpenClawAssistantStreamParts = extractOpenClawAssistantStreamParts;
const isRecord = (value) => (Boolean(value && typeof value === 'object' && !Array.isArray(value)));
const collectTextChunks = (value) => {
    if (typeof value === 'string') {
        const text = value.trim();
        return text ? [text] : [];
    }
    if (Array.isArray(value)) {
        return value.flatMap((item) => collectTextChunks(item));
    }
    if (!isRecord(value)) {
        return [];
    }
    const chunks = [];
    if (typeof value.text === 'string') {
        const text = value.text.trim();
        if (text) {
            chunks.push(text);
        }
    }
    if (typeof value.output_text === 'string') {
        const text = value.output_text.trim();
        if (text) {
            chunks.push(text);
        }
    }
    // Skip thinking blocks from regular text (handled by collectThinkingChunks)
    if (value.content !== undefined) {
        chunks.push(...collectTextChunks(value.content));
    }
    if (value.parts !== undefined) {
        chunks.push(...collectTextChunks(value.parts));
    }
    if (value.candidates !== undefined) {
        chunks.push(...collectTextChunks(value.candidates));
    }
    if (value.response !== undefined) {
        chunks.push(...collectTextChunks(value.response));
    }
    return chunks;
};
const collectThinkingChunks = (value) => {
    if (typeof value === 'string')
        return [];
    if (Array.isArray(value)) {
        return value.flatMap((item) => collectThinkingChunks(item));
    }
    if (!isRecord(value))
        return [];
    const chunks = [];
    if (value.type === 'thinking' && typeof value.thinking === 'string') {
        const thinking = value.thinking.trim();
        if (thinking) {
            chunks.push(thinking);
        }
    }
    for (const key of ['reasoning_content', 'reasoning', 'reasoning_text']) {
        if (typeof value[key] === 'string') {
            const thinking = value[key].trim();
            if (thinking) {
                chunks.push(thinking);
            }
        }
    }
    if (value.content !== undefined) {
        chunks.push(...collectThinkingChunks(value.content));
    }
    if (value.parts !== undefined) {
        chunks.push(...collectThinkingChunks(value.parts));
    }
    if (value.candidates !== undefined) {
        chunks.push(...collectThinkingChunks(value.candidates));
    }
    if (value.response !== undefined) {
        chunks.push(...collectThinkingChunks(value.response));
    }
    return chunks;
};
function extractOpenClawAssistantStreamText(payload) {
    const chunks = collectTextChunks(payload);
    return chunks.join('\n').trim();
}
function extractOpenClawAssistantStreamParts(payload) {
    const textChunks = collectTextChunks(payload);
    const thinkingChunks = collectThinkingChunks(payload);
    return {
        text: textChunks.join('\n').trim(),
        thinking: thinkingChunks.join('\n\n').trim(),
    };
}
//# sourceMappingURL=openclawAssistantText.js.map