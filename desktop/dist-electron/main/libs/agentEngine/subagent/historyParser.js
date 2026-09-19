"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseSubagentGatewayHistoryMessages = void 0;
const node_crypto_1 = __importDefault(require("node:crypto"));
const openclawHistory_1 = require("../../openclawHistory");
const isRecord = (value) => {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
};
const getStringField = (value, keys) => {
    for (const key of keys) {
        const candidate = value[key];
        if (typeof candidate === 'string' && candidate.trim()) {
            return candidate.trim();
        }
    }
    return '';
};
const getToolCallId = (value) => (getStringField(value, ['id', 'toolCallId', 'tool_call_id', 'toolUseId', 'tool_use_id']) || null);
const getToolName = (value) => {
    const direct = getStringField(value, ['name', 'toolName', 'tool_name']);
    if (direct)
        return direct;
    if (isRecord(value.function)) {
        return getStringField(value.function, ['name']);
    }
    return '';
};
const parseHistoryTimestamp = (value) => {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        return value;
    }
    if (typeof value !== 'string' || !value.trim()) {
        return undefined;
    }
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) {
        return numeric;
    }
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};
const getHistoryMessageTimestamp = (value) => (parseHistoryTimestamp(value.timestamp)
    ?? parseHistoryTimestamp(value.createdAt)
    ?? parseHistoryTimestamp(value.created_at)
    ?? parseHistoryTimestamp(value.time));
const isToolCallBlock = (value) => {
    const blockType = typeof value.type === 'string' ? value.type.trim() : '';
    return blockType === 'tool_use'
        || blockType === 'tool_call'
        || blockType === 'toolCall'
        || blockType === 'function_call'
        || Boolean(getToolName(value) && getToolCallId(value));
};
/**
 * Resolve tool input from a tool_use block, handling multiple field names and formats.
 * The gateway can return tool arguments as:
 *  - `input` (Anthropic format, object)
 *  - `args` (OpenClaw format, object)
 *  - `arguments` (OpenAI format, may be a JSON string)
 */
const resolveToolInput = (block) => {
    if (isRecord(block.input))
        return block.input;
    if (isRecord(block.args))
        return block.args;
    if (isRecord(block.arguments))
        return block.arguments;
    if (isRecord(block.function)) {
        const functionArguments = resolveToolInput(block.function);
        if (Object.keys(functionArguments).length > 0)
            return functionArguments;
    }
    if (typeof block.arguments === 'string') {
        try {
            const parsed = JSON.parse(block.arguments);
            if (isRecord(parsed))
                return parsed;
        }
        catch {
            // Ignore malformed tool input payloads from gateway history.
        }
    }
    if (typeof block.input === 'string') {
        try {
            const parsed = JSON.parse(block.input);
            if (isRecord(parsed))
                return parsed;
        }
        catch {
            // Ignore malformed tool input payloads from gateway history.
        }
    }
    return {};
};
const collectToolCallBlocks = (message) => {
    const blocks = [];
    const seen = new Set();
    const collect = (value) => {
        if (!value)
            return;
        if (Array.isArray(value)) {
            for (const item of value)
                collect(item);
            return;
        }
        if (!isRecord(value) || !isToolCallBlock(value))
            return;
        const key = getToolCallId(value) ?? `${getToolName(value)}:${blocks.length}`;
        if (seen.has(key))
            return;
        seen.add(key);
        blocks.push(value);
    };
    collect(message.content);
    collect(message.toolCalls);
    collect(message.tool_calls);
    collect(message.toolCall);
    collect(message.tool_call);
    collect(message.function_call);
    return blocks;
};
const createToolUseMessage = (block, createId, timestamp) => ({
    id: createId(),
    type: 'tool_use',
    content: '',
    timestamp,
    metadata: {
        toolName: getToolName(block) || 'tool',
        toolInput: resolveToolInput(block),
        toolUseId: getToolCallId(block),
    },
});
const inferExecCommandFromToolResult = (resultText) => {
    const lines = resultText.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
        const trimmed = lines[index].trim();
        if (!trimmed.startsWith('+'))
            continue;
        const command = trimmed.replace(/^\+\s*/, '').trim();
        if (command && !/^~+$/.test(command)) {
            return command;
        }
    }
    return null;
};
const synthesizeMissingToolUses = (messages, createId) => {
    const seenToolUseIds = new Set();
    const output = [];
    for (const message of messages) {
        if (message.type === 'tool_use') {
            const toolUseId = message.metadata?.toolUseId;
            if (typeof toolUseId === 'string' && toolUseId.trim()) {
                seenToolUseIds.add(toolUseId);
            }
            output.push(message);
            continue;
        }
        if (message.type === 'tool_result') {
            const toolUseId = message.metadata?.toolUseId;
            if (typeof toolUseId === 'string' && toolUseId.trim() && !seenToolUseIds.has(toolUseId)) {
                const toolName = typeof message.metadata?.toolName === 'string'
                    ? message.metadata.toolName
                    : 'tool';
                const command = toolName.toLowerCase() === 'exec'
                    ? inferExecCommandFromToolResult(message.content)
                    : null;
                const toolUse = {
                    id: createId(),
                    type: 'tool_use',
                    content: '',
                    timestamp: message.timestamp,
                    metadata: {
                        toolName,
                        toolInput: command ? { command } : {},
                        toolUseId,
                        inferredFromResult: true,
                    },
                };
                seenToolUseIds.add(toolUseId);
                output.push(toolUse);
            }
        }
        output.push(message);
    }
    return output;
};
const parseSubagentGatewayHistoryMessages = (historyMessages, options = {}) => {
    const createId = options.createId ?? (() => node_crypto_1.default.randomUUID());
    let timestamp = options.startTimestamp ?? Date.now() - historyMessages.length * 1000;
    const messages = [];
    const rawTimestampOffsets = new WeakMap();
    const nextTimestamp = (raw) => {
        const parsed = raw ? getHistoryMessageTimestamp(raw) : undefined;
        if (parsed != null) {
            const offset = rawTimestampOffsets.get(raw) ?? 0;
            rawTimestampOffsets.set(raw, offset + 1);
            const value = parsed + offset;
            timestamp = Math.max(timestamp, value + 1);
            return value;
        }
        return timestamp++;
    };
    for (const raw of historyMessages) {
        if (!isRecord(raw))
            continue;
        const role = typeof raw.role === 'string' ? raw.role.trim().toLowerCase() : '';
        if (role === 'user' || role === 'assistant' || role === 'system') {
            const text = (0, openclawHistory_1.extractGatewayMessageText)(raw).trim();
            if (role === 'assistant') {
                if (text && !(0, openclawHistory_1.shouldSuppressHeartbeatText)(role, text)) {
                    messages.push({
                        id: createId(),
                        type: 'assistant',
                        content: text,
                        timestamp: nextTimestamp(raw),
                    });
                }
                for (const block of collectToolCallBlocks(raw)) {
                    messages.push(createToolUseMessage(block, createId, nextTimestamp(raw)));
                }
            }
            else if (role === 'user' && Array.isArray(raw.content)) {
                for (const block of raw.content) {
                    if (!isRecord(block))
                        continue;
                    const blockType = typeof block.type === 'string' ? block.type : '';
                    if (blockType === 'tool_result') {
                        const resultText = typeof block.content === 'string'
                            ? block.content
                            : (0, openclawHistory_1.extractGatewayMessageText)(block).trim();
                        const toolUseId = getToolCallId(block);
                        const isError = block.is_error === true;
                        if (resultText) {
                            messages.push({
                                id: createId(),
                                type: 'tool_result',
                                content: resultText,
                                timestamp: nextTimestamp(raw),
                                metadata: {
                                    toolResult: resultText,
                                    toolUseId,
                                    isError: isError || undefined,
                                },
                            });
                        }
                    }
                }
                if (text && !(0, openclawHistory_1.shouldSuppressHeartbeatText)('user', text)) {
                    messages.push({
                        id: createId(),
                        type: 'user',
                        content: text,
                        timestamp: nextTimestamp(raw),
                    });
                }
            }
            else if (text && !(0, openclawHistory_1.shouldSuppressHeartbeatText)(role, text)) {
                messages.push({
                    id: createId(),
                    type: role === 'system' ? 'system' : role,
                    content: text,
                    timestamp: nextTimestamp(raw),
                });
            }
            continue;
        }
        if (role === 'tool_result' || role === 'toolresult' || role === 'tool' || role === 'function') {
            const text = (0, openclawHistory_1.extractGatewayMessageText)(raw).trim();
            const toolName = getToolName(raw);
            const toolUseId = getToolCallId(raw);
            if (text) {
                messages.push({
                    id: createId(),
                    type: 'tool_result',
                    content: text,
                    timestamp: nextTimestamp(raw),
                    metadata: { toolName: toolName || undefined, toolResult: text, toolUseId },
                });
            }
            continue;
        }
        if (!role && Array.isArray(raw.content)) {
            for (const block of raw.content) {
                if (!isRecord(block))
                    continue;
                const blockType = typeof block.type === 'string' ? block.type : '';
                if (isToolCallBlock(block)) {
                    messages.push(createToolUseMessage(block, createId, nextTimestamp(raw)));
                }
                else if (blockType === 'text' && typeof block.text === 'string' && block.text.trim()) {
                    messages.push({
                        id: createId(),
                        type: 'assistant',
                        content: block.text.trim(),
                        timestamp: nextTimestamp(raw),
                    });
                }
            }
        }
    }
    return synthesizeMissingToolUses(messages, createId);
};
exports.parseSubagentGatewayHistoryMessages = parseSubagentGatewayHistoryMessages;
//# sourceMappingURL=historyParser.js.map