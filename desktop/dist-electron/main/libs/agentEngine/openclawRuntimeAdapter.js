"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenClawRuntimeAdapter = exports.buildRuntimeErrorMetadata = exports.isIncompleteStopReason = exports.resolveToolEventIsError = exports.OPENCLAW_CHAT_SEND_PAYLOAD_SAFE_LIMIT_BYTES = exports.OPENCLAW_CHAT_SEND_PAYLOAD_SAFETY_MARGIN_BYTES = exports.OPENCLAW_CHAT_SEND_PAYLOAD_LIMIT_BYTES = void 0;
exports.estimateOpenClawChatSendFrameBytes = estimateOpenClawChatSendFrameBytes;
exports.buildOpenClawChatSendPayloadTooLargeError = buildOpenClawChatSendPayloadTooLargeError;
exports.pickPersistedAssistantSegment = pickPersistedAssistantSegment;
exports.isOpenClawToolLoopBlockedResultText = isOpenClawToolLoopBlockedResultText;
exports.resolveOpenClawToolLoopErrorOverride = resolveOpenClawToolLoopErrorOverride;
exports.isPlanModeSafeExecCommand = isPlanModeSafeExecCommand;
exports.ensurePlanModeProposedPlanBlock = ensurePlanModeProposedPlanBlock;
exports.isPlanModeResponseComplete = isPlanModeResponseComplete;
exports.isSignificantAssistantStreamReset = isSignificantAssistantStreamReset;
exports.normalizeOpenClawRuntimeErrorMessage = normalizeOpenClawRuntimeErrorMessage;
exports.resolveOpenClawRuntimeErrorMessage = resolveOpenClawRuntimeErrorMessage;
exports.resolveOpenClawRuntimeError = resolveOpenClawRuntimeError;
exports.buildOpenClawRuntimeErrorDetail = buildOpenClawRuntimeErrorDetail;
const crypto_1 = require("crypto");
const electron_1 = require("electron");
const events_1 = require("events");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const coworkErrorClassify_1 = require("../../../common/coworkErrorClassify");
const coworkSystemMessages_1 = require("../../../common/coworkSystemMessages");
const goalCommandDisplay_1 = require("../../../common/goalCommandDisplay");
const openclawSession_1 = require("../../../common/openclawSession");
const constants_1 = require("../../../shared/analytics/constants");
const constants_2 = require("../../../shared/browserWebAccess/constants");
const browserAnnotations_1 = require("../../../shared/cowork/browserAnnotations");
const btw_1 = require("../../../shared/cowork/btw");
const constants_3 = require("../../../shared/cowork/constants");
const errorDetail_1 = require("../../../shared/cowork/errorDetail");
const goal_1 = require("../../../shared/cowork/goal");
const imageAttachments_1 = require("../../../shared/cowork/imageAttachments");
const openclawCronSessionKey_1 = require("../../../shared/cowork/openclawCronSessionKey");
const planMode_1 = require("../../../shared/cowork/planMode");
const selectedText_1 = require("../../../shared/cowork/selectedText");
const steer_1 = require("../../../shared/cowork/steer");
const text_1 = require("../../../shared/cowork/text");
const constants_4 = require("../../../shared/enterpriseAccount/constants");
const quotaError_1 = require("../../../shared/enterpriseAccount/quotaError");
const constants_5 = require("../../../shared/openclawEngine/constants");
const constants_6 = require("../../../shared/openclawTranscript/constants");
const providers_1 = require("../../../shared/providers");
const i18n_1 = require("../../i18n");
const mediaGenerationPolicy_1 = require("../../mediaGenerationPolicy");
const coworkOpenAICompatProxy_1 = require("../coworkOpenAICompatProxy");
const openclawAssistantText_1 = require("../openclawAssistantText");
const openclawChannelSessionSync_1 = require("../openclawChannelSessionSync");
const openclawConfigSync_1 = require("../openclawConfigSync");
const openclawHistory_1 = require("../openclawHistory");
const openclawLocalTimeContextPrompt_1 = require("../openclawLocalTimeContextPrompt");
const openclawModelThinkingLevels_1 = require("../openclawModelThinkingLevels");
const openclawTokenProxy_1 = require("../openclawTokenProxy");
const assistantMessageReconciliation_1 = require("./assistantMessageReconciliation");
const channelSessionRunStatus_1 = require("./channelSessionRunStatus");
const constants_7 = require("./constants");
const coworkContinuityCapsule_1 = require("./coworkContinuityCapsule");
const coworkTopKEvidence_1 = require("./coworkTopKEvidence");
const coworkWorkspaceRehydration_1 = require("./coworkWorkspaceRehydration");
const cronDeliveryTarget_1 = require("./cronDeliveryTarget");
const mediaGenerationTurnInstruction_1 = require("./mediaGenerationTurnInstruction");
const openclawApprovalController_1 = require("./openclawApprovalController");
const openclawConversationReconciliation_1 = require("./openclawConversationReconciliation");
const openclawCronRunHistorySync_1 = require("./openclawCronRunHistorySync");
const openclawTranscriptSafety_1 = require("./openclawTranscriptSafety");
const openclawTurnHistorySync_1 = require("./openclawTurnHistorySync");
const childHistorySync_1 = require("./subagent/childHistorySync");
const historyBackfill_1 = require("./subagent/historyBackfill");
const sessionKeys_1 = require("./subagent/sessionKeys");
const sessionMaterializer_1 = require("./subagent/sessionMaterializer");
const tracker_1 = require("./subagent/tracker");
const controller_1 = require("./thinking/controller");
const diagnostics_1 = require("./thinking/diagnostics");
const OPENCLAW_GATEWAY_TOOL_EVENTS_CAP = 'tool-events';
const OPENCLAW_BTW_SESSION_KEY_MAX_CHARS = 4_096;
const OpenClawGatewayEvent = {
    ChatSideResult: 'chat.side_result',
    SessionsChanged: 'sessions.changed',
};
const OpenClawGatewayMethod = {
    ChatAbort: 'chat.abort',
    ChatSend: 'chat.send',
    SessionsSubscribe: 'sessions.subscribe',
};
const BRIDGE_MAX_MESSAGES = 20;
const BRIDGE_MAX_MESSAGE_CHARS = 1200;
const FORK_COMPACTION_SUMMARY_MAX_CHARS = 40_000;
// v2026.4.5 introduced a connect.challenge pre-auth step that can delay the
// initial handshake when the gateway is busy loading plugins at startup.
// The GatewayClient auto-reconnects and typically succeeds on the second
// attempt.  Keep a broad timeout to accommodate plugin loading and runtime
// warmup on slow machines.
const GATEWAY_READY_TIMEOUT_MS = 60_000;
const BROWSER_GATEWAY_REQUEST_TIMEOUT_MS = 15_000;
const BROWSER_GATEWAY_REQUEST_TIMEOUT_SLACK_MS = 5_000;
const FINAL_HISTORY_SYNC_LIMIT = 50;
const CHANNEL_SESSION_DISCOVERY_LIMIT = 200;
exports.OPENCLAW_CHAT_SEND_PAYLOAD_LIMIT_BYTES = 30 * 1000 * 1000;
exports.OPENCLAW_CHAT_SEND_PAYLOAD_SAFETY_MARGIN_BYTES = 500 * 1000;
exports.OPENCLAW_CHAT_SEND_PAYLOAD_SAFE_LIMIT_BYTES = exports.OPENCLAW_CHAT_SEND_PAYLOAD_LIMIT_BYTES - exports.OPENCLAW_CHAT_SEND_PAYLOAD_SAFETY_MARGIN_BYTES;
const WebSocketCloseCode = {
    MessageTooBig: 1009,
    // RFC 6455 "Service Restart" — the OpenClaw gateway sends this when a config
    // reload makes it restart itself (in-process SIGUSR1 restart).
    ServiceRestart: 1012,
};
const MediaGenerationToolAction = {
    Status: 'status',
};
const OPENCLAW_GOAL_ACTIONS = new Set([
    'block',
    'blocked',
    'clear',
    'complete',
    'create',
    'done',
    'pause',
    'resume',
    'set',
    'start',
    'status',
]);
const GOAL_BOOTSTRAP_ACTIONS = new Set([
    'create',
    'set',
    'start',
]);
const GOAL_CONTINUATION_PROMPT_PREFIX = 'Pursue this goal exactly as written from this JSON string:';
const GOAL_RESUME_NOTE_PROMPT_PREFIX = 'Continue pursuing the current goal. Interpret this JSON string as the resume note:';
function parseOpenClawGoalCommand(raw) {
    const trimmed = raw.trim();
    if (!trimmed)
        return null;
    const commandEnd = trimmed.search(/\s/);
    const commandToken = commandEnd === -1 ? trimmed : trimmed.slice(0, commandEnd);
    if (commandToken.toLowerCase() !== '/goal')
        return null;
    const argText = commandEnd === -1 ? '' : trimmed.slice(commandEnd).trim();
    if (!argText)
        return { action: 'status', text: '' };
    const [rawAction = '', ...rest] = argText.split(/\s+/);
    const action = rawAction.toLowerCase();
    if (!OPENCLAW_GOAL_ACTIONS.has(action)) {
        return { action: 'start', text: argText };
    }
    return { action: action, text: rest.join(' ').trim() };
}
function hasCommandLikeGoalText(trimmed) {
    return /(?:^|\s)\//.test(trimmed) || trimmed.startsWith('!');
}
function encodeGoalJsonString(trimmed) {
    return JSON.stringify(trimmed).replaceAll('/', '\\/');
}
function formatGoalContinuationPrompt(objective) {
    const trimmed = objective.trim();
    return hasCommandLikeGoalText(trimmed)
        ? `${GOAL_CONTINUATION_PROMPT_PREFIX} ${encodeGoalJsonString(trimmed)}`
        : trimmed;
}
function formatGoalResumeContinuationPrompt(note) {
    const trimmed = note.trim();
    if (!trimmed)
        return 'Continue pursuing the current goal.';
    return hasCommandLikeGoalText(trimmed)
        ? `${GOAL_RESUME_NOTE_PROMPT_PREFIX} ${encodeGoalJsonString(trimmed)}`
        : `Continue pursuing the current goal. Note: ${trimmed}`;
}
function shouldBootstrapGoalFromPrompt(command) {
    return Boolean(command && GOAL_BOOTSTRAP_ACTIONS.has(command.action) && command.text.trim());
}
function estimateOpenClawChatSendFrameBytes(params) {
    const frame = {
        id: 'estimate',
        method: 'chat.send',
        params,
    };
    return Buffer.byteLength(JSON.stringify(frame), 'utf8');
}
function sumAttachmentBase64Bytes(attachments) {
    return (attachments ?? []).reduce((total, attachment) => {
        return total + (typeof attachment.content === 'string' ? attachment.content.length : 0);
    }, 0);
}
function buildOpenClawChatSendPayloadTooLargeError(options) {
    return new Error(`chat.send payload too large: estimated ${options.estimatedFrameBytes} bytes exceeds safe limit `
        + `${options.safeLimitBytes} bytes; attachments ${options.attachmentCount}; attachment base64 bytes `
        + `${options.attachmentBase64Bytes}`);
}
function assertOpenClawChatSendPayloadWithinLimit(sessionId, params, attachments) {
    const estimatedFrameBytes = estimateOpenClawChatSendFrameBytes(params);
    if (estimatedFrameBytes <= exports.OPENCLAW_CHAT_SEND_PAYLOAD_SAFE_LIMIT_BYTES) {
        return;
    }
    const attachmentCount = attachments?.length ?? 0;
    const attachmentBase64Bytes = sumAttachmentBase64Bytes(attachments);
    console.warn('[EngineRuntime] chat.send payload exceeded safe limit.', `Session ${sessionId}.`, `Estimated ${estimatedFrameBytes} bytes.`, `Safe limit ${exports.OPENCLAW_CHAT_SEND_PAYLOAD_SAFE_LIMIT_BYTES} bytes.`, `Attachments ${attachmentCount}.`, `Attachment base64 total ${attachmentBase64Bytes} bytes.`);
    throw buildOpenClawChatSendPayloadTooLargeError({
        estimatedFrameBytes,
        safeLimitBytes: exports.OPENCLAW_CHAT_SEND_PAYLOAD_SAFE_LIMIT_BYTES,
        attachmentCount,
        attachmentBase64Bytes,
    });
}
function validateRuntimeImageAttachments(imageAttachments) {
    for (const attachment of imageAttachments ?? []) {
        const validation = (0, imageAttachments_1.validateCoworkImageAttachmentSize)(attachment);
        if (!validation.ok) {
            return {
                ok: false,
                error: `Image attachment ${attachment.name} exceeds the ${(0, imageAttachments_1.formatCoworkImageAttachmentLimit)(validation.maxBytes)} limit.`,
            };
        }
    }
    return { ok: true };
}
/**
 * Prefer agent-stream segment text when it is authoritative (longer or equal vs chat.final).
 * When only the chat path updated the UI, prefer chat.final extraction.
 */
function pickPersistedAssistantSegment(previousSegmentText, finalSegmentText, hasSeenAgentAssistantStream) {
    const prev = previousSegmentText;
    const fin = finalSegmentText;
    if (!prev.trim() && !fin.trim()) {
        return { content: '', reason: 'both_empty' };
    }
    if (!prev.trim()) {
        return { content: fin, reason: 'final_only' };
    }
    if (!fin.trim()) {
        return { content: prev, reason: 'previous_only' };
    }
    if (hasSeenAgentAssistantStream) {
        if (prev.length >= fin.length) {
            return { content: prev, reason: 'stream_authority_same_or_longer' };
        }
        return { content: fin, reason: 'stream_shorter_prefer_chat_final' };
    }
    return { content: fin, reason: 'chat_path_prefer_final' };
}
const SessionModelPatchSource = {
    SessionOverride: 'sessionOverride',
    AgentModel: 'agentModel',
};
const GatewayStopReason = {
    Error: 'error',
    Length: 'length',
    ToolUse: 'toolUse',
    ToolUseSnake: 'tool_use',
};
const OpenClawKnownRuntimeError = {
    UnexpectedEndOfJsonInput: 'Unexpected end of JSON input',
    OnlyEmptySseDataFrames: 'Provider stream emitted too many empty SSE data frames.',
};
const OPENCLAW_GENERIC_LLM_REQUEST_FAILED = 'LLM request failed.';
const OpenClawFailureFinalText = {
    AgentFailedBeforeReply: 'Agent failed before reply:',
    SessionFileLocked: 'session file locked (timeout',
    // OpenClaw's generic external-run failure copy (verbose off, e.g. cron/IM
    // sessions). Detect it so the session surfaces an error instead of a
    // normal-looking assistant reply.
    GenericRunFailure: 'Something went wrong while processing your request',
};
// A critical tool-loop veto replaces the blocked tool's result with a
// "CRITICAL: ... Session execution blocked ..." text and terminates the run,
// which then surfaces OpenClaw's generic incomplete-turn copy. Both strings
// come from the pinned OpenClaw runtime (agents loop detection + embedded
// runner); re-verify them when bumping the runtime version.
const OPENCLAW_TOOL_LOOP_BLOCKED_RESULT_PATTERN = /^CRITICAL: [\s\S]*Session execution blocked/;
const OPENCLAW_INCOMPLETE_TURN_TEXT = "Agent couldn't generate a response";
function isOpenClawToolLoopBlockedResultText(text) {
    return OPENCLAW_TOOL_LOOP_BLOCKED_RESULT_PATTERN.test(text.trim());
}
function resolveOpenClawToolLoopErrorOverride(toolLoopBlockReason, rawErrorMessage) {
    if (!toolLoopBlockReason || !rawErrorMessage.includes(OPENCLAW_INCOMPLETE_TURN_TEXT)) {
        return null;
    }
    return {
        errorMessage: (0, i18n_1.t)('coworkErrorToolLoopBlocked'),
        detailRawErrorMessage: `${rawErrorMessage}\n${toolLoopBlockReason}`,
    };
}
const OpenClawHistoryRole = {
    Tool: 'tool',
    ToolResult: 'toolResult',
};
const PLAN_MODE_BLOCKED_TOOL_NAMES = new Set([
    'apply_patch',
    'bash',
    'cmd',
    'copy',
    'create_file',
    'delete_file',
    'edit',
    'mkdir',
    'move',
    'move_file',
    'patch',
    'powershell',
    'remove',
    'rename',
    'replace',
    'shell',
    'terminal',
    'write',
    'write_file',
]);
const PLAN_MODE_SAFE_EXEC_COMMANDS = new Set([
    'cat',
    'dir',
    'dirname',
    'du',
    'echo',
    'file',
    'find',
    'findstr',
    'gc',
    'gci',
    'get-childitem',
    'get-content',
    'get-location',
    'grep',
    'head',
    'ls',
    'printf',
    'pwd',
    'realpath',
    'rg',
    'sed',
    'select-string',
    'select-object',
    'sort',
    'stat',
    'tail',
    'tree',
    'type',
    'uniq',
    'where',
    'which',
    'wc',
]);
const PLAN_MODE_SAFE_GIT_COMMANDS = new Set([
    'diff',
    'log',
    'ls-files',
    'rev-parse',
    'show',
    'status',
]);
const ASSISTANT_STREAM_RESET_MIN_DROP_CHARS = 40;
const ASSISTANT_STREAM_RESET_RATIO = 0.7;
function isPlanModeSystemPrompt(systemPrompt) {
    return (0, planMode_1.containsPlanModePrompt)(systemPrompt)
        && !systemPrompt.includes(planMode_1.PLAN_MODE_EXECUTION_OVERRIDE_MARKER);
}
function sessionHasProposedPlan(messages) {
    return messages.some((message) => (message.type === 'assistant'
        && /<proposed_plan\b[^>]*>[\s\S]*<\/proposed_plan\s*>/i.test(message.content)));
}
function buildPlanModeExecutionOverridePrompt() {
    return [
        planMode_1.PLAN_MODE_EXECUTION_OVERRIDE_MARKER,
        '',
        'The user explicitly approved the existing proposed plan and asked you to implement it.',
        'For this turn, Plan Mode is disabled. Ignore earlier Plan Mode restrictions and do not output another proposed plan.',
        'Implement the approved plan now, including file changes and validation requested by the plan.',
    ].join('\n');
}
function getStringArg(args, key) {
    if (!isRecord(args))
        return '';
    const value = args[key];
    return typeof value === 'string' ? value.trim() : '';
}
function getPlanModeExecCommand(args) {
    return getStringArg(args, 'command') || getStringArg(args, 'cmd');
}
function getShellCommandName(command) {
    const [firstToken = ''] = command.trim().split(/\s+/, 1);
    return firstToken.replace(/^["']|["']$/g, '').toLowerCase();
}
function getGitSubcommand(command) {
    const [, subcommand = ''] = command.trim().split(/\s+/, 2);
    return subcommand.toLowerCase();
}
function splitPlanModeShellCommands(command) {
    const commands = [];
    let current = '';
    let quote = null;
    let escaped = false;
    const pushCurrent = () => {
        const segment = current.trim();
        current = '';
        if (!segment)
            return false;
        commands.push(segment);
        return true;
    };
    for (let index = 0; index < command.length; index++) {
        const character = command[index];
        if (escaped) {
            current += character;
            escaped = false;
            continue;
        }
        if (character === '\\' && quote !== "'") {
            current += character;
            escaped = true;
            continue;
        }
        if (quote) {
            current += character;
            if (character === quote)
                quote = null;
            continue;
        }
        if (character === '"' || character === "'") {
            quote = character;
            current += character;
            continue;
        }
        if (character === '`' || (character === '$' && command[index + 1] === '(')) {
            return null;
        }
        if (character === '&' && command[index + 1] !== '&') {
            return null;
        }
        if (character === ';' || character === '|' || character === '\n' || character === '\r' || character === '&') {
            if (!pushCurrent())
                return null;
            if ((character === '|' || character === '&') && command[index + 1] === character) {
                index++;
            }
            continue;
        }
        current += character;
    }
    if (quote || escaped || !pushCurrent())
        return null;
    return commands;
}
function stripPlanModeNullRedirections(command) {
    let normalized = command;
    const nullRedirectionPattern = /(?:^|\s)\d*>\s*(?:\/dev\/null|nul|\$null)(?=\s|$)/gi;
    normalized = normalized.replace(nullRedirectionPattern, ' ');
    if (/[<>]/.test(normalized))
        return null;
    return normalized.trim();
}
function isPlanModeSafeSedCommand(command) {
    return !/(?:^|\s)(?:-i(?:\S*)?|--in-place(?:=\S*)?)(?:\s|$)/i.test(command)
        && !/(?:^|[;'"\s])(?:w|e)(?:\s|$)/i.test(command);
}
function isPlanModeSafeShellSegment(command) {
    const normalized = stripPlanModeNullRedirections(command);
    if (!normalized)
        return false;
    if (/(?:^|\s)-(?:delete|exec|execdir|ok|fprint|fprint0|fprintf|fls)(?:\s|$)/i.test(normalized)) {
        return false;
    }
    const commandName = getShellCommandName(normalized);
    if (commandName === 'git') {
        if (/(?:^|\s)(?:--output(?:=|\s)|-o(?:\s|$))/i.test(normalized))
            return false;
        return PLAN_MODE_SAFE_GIT_COMMANDS.has(getGitSubcommand(normalized));
    }
    if (commandName === 'sed' && !isPlanModeSafeSedCommand(normalized))
        return false;
    if (commandName === 'sort'
        && /(?:^|\s)(?:--output(?:=|\s)|-o(?:\S+|\s)|\/o(?::|\s))/i.test(normalized))
        return false;
    if (commandName === 'tree'
        && /(?:^|\s)(?:--output(?:=|\s)|-o(?:\S+|\s))/i.test(normalized))
        return false;
    return PLAN_MODE_SAFE_EXEC_COMMANDS.has(commandName);
}
function isPlanModeSafeExecCommand(command) {
    const trimmed = command.trim();
    if (!trimmed)
        return false;
    const commands = splitPlanModeShellCommands(trimmed);
    return Boolean(commands?.length && commands.every(isPlanModeSafeShellSegment));
}
function getPlanModeBlockedToolReason(toolNameRaw, args) {
    const toolName = toolNameRaw.trim().toLowerCase();
    if (PLAN_MODE_BLOCKED_TOOL_NAMES.has(toolName)) {
        return `blocked mutating tool ${toolNameRaw || 'Tool'}`;
    }
    if (toolName === 'exec') {
        const command = getPlanModeExecCommand(args);
        if (isPlanModeSafeExecCommand(command))
            return null;
        return 'blocked shell command in plan mode';
    }
    return null;
}
function shouldSuppressPlanModeToolEvent(toolNameRaw, args) {
    const toolName = toolNameRaw.trim().toLowerCase();
    if (toolName === 'read')
        return true;
    if (toolName === 'exec') {
        return isPlanModeSafeExecCommand(getPlanModeExecCommand(args));
    }
    return false;
}
function ensurePlanModeProposedPlanBlock(text) {
    const trimmed = text.trim();
    if (!trimmed || /<proposed_plan\b[^>]*>[\s\S]*<\/proposed_plan\s*>/i.test(trimmed))
        return text;
    if (/<proposed_plan\b[^>]*>/i.test(trimmed)) {
        return `${trimmed}\n</proposed_plan>`;
    }
    return `<proposed_plan>\n${trimmed}\n</proposed_plan>`;
}
function isPlanModeResponseComplete(text) {
    const content = text
        .replace(/<proposed_plan\b[^>]*>/gi, '')
        .replace(/<\/proposed_plan\s*>/gi, '')
        .trim();
    if (content.length < 220)
        return false;
    const structuralLineCount = content
        .split('\n')
        .filter((line) => /^\s*(?:#{1,6}\s+|[-*]\s+|\d+\.\s+)/.test(line))
        .length;
    const sectionPatterns = [
        /(?:summary|overview|概述|概览|摘要|总览|目标)/i,
        /(?:implementation approach|implementation|architecture|实施|实现|技术|架构)/i,
        /(?:key changes|changes|改动|变更|页面|功能|交互)/i,
        /(?:validation|verification|验证|测试|验收|检查)/i,
        /(?:assumptions? or questions?|assumptions?|假设|前提|待确认|问题|风险)/i,
    ];
    const sectionCount = sectionPatterns.filter((pattern) => pattern.test(content)).length;
    return structuralLineCount >= 8 || (structuralLineCount >= 5 && sectionCount >= 3);
}
function isOpenClawFailureFinalText(text) {
    const trimmed = text.trim();
    return trimmed.includes(OpenClawFailureFinalText.AgentFailedBeforeReply)
        || trimmed.includes(OpenClawFailureFinalText.SessionFileLocked)
        || trimmed.includes(OpenClawFailureFinalText.GenericRunFailure);
}
function isSignificantAssistantStreamReset(previousLength, nextLength) {
    if (previousLength <= 5 || nextLength >= previousLength)
        return false;
    const drop = previousLength - nextLength;
    return drop >= ASSISTANT_STREAM_RESET_MIN_DROP_CHARS
        && nextLength <= previousLength * ASSISTANT_STREAM_RESET_RATIO;
}
function buildPlanModeOutboundReminder() {
    return [
        '[Plan Mode reminder]',
        'Plan Mode is active for this turn.',
        'Only use read-only exploration when needed; do not implement, create, modify, write, edit, or run shell commands that can change files or system state.',
        'Write the plan in the same language as the user request.',
        'Return one complete proposed plan wrapped in <proposed_plan> and </proposed_plan> tags.',
        'Do not stop after a preface; include Summary, Implementation Approach, Key Changes, Validation, and Assumptions or Questions.',
    ].join('\n');
}
const isRecord = (value) => {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
};
const truncateBtwResultText = (value) => {
    if (value.length <= btw_1.COWORK_BTW_RESULT_MAX_CHARS)
        return value;
    const suffix = `\n\n${(0, i18n_1.t)('coworkBtwResultTruncated')}`;
    return `${value.slice(0, Math.max(0, btw_1.COWORK_BTW_RESULT_MAX_CHARS - suffix.length))}${suffix}`;
};
const MODEL_SNAPSHOT_CUSTOM_TYPE = 'model-snapshot';
const SESSION_STATUS_TOOL_NAME = 'session_status';
const hasOwn = (record, key) => Object.prototype.hasOwnProperty.call(record, key);
const readNonEmptyString = (record, key) => {
    const value = record[key];
    return typeof value === 'string' && value.trim() ? value.trim() : null;
};
const buildModelRef = (provider, model) => {
    const normalizedModel = model?.trim();
    if (!normalizedModel)
        return null;
    const normalizedProvider = provider?.trim();
    if (!normalizedProvider || normalizedModel.includes('/'))
        return normalizedModel;
    return `${normalizedProvider}/${normalizedModel}`;
};
const readModelRefFromRecord = (record, options) => {
    const model = options.modelKeys
        .map((key) => readNonEmptyString(record, key))
        .find((value) => Boolean(value));
    if (!model)
        return null;
    const provider = (options.providerKeys ?? [])
        .map((key) => readNonEmptyString(record, key))
        .find((value) => Boolean(value));
    return buildModelRef(provider, model);
};
const readExplicitModelOverrideState = (record, source) => {
    if (!hasOwn(record, 'modelOverride'))
        return null;
    const value = record.modelOverride;
    if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) {
        return { modelRef: null, explicitOverride: true, source };
    }
    if (typeof value !== 'string')
        return null;
    const provider = readNonEmptyString(record, 'providerOverride')
        ?? readNonEmptyString(record, 'modelProvider')
        ?? readNonEmptyString(record, 'provider')
        ?? readNonEmptyString(record, 'providerId');
    return {
        modelRef: buildModelRef(provider, value),
        explicitOverride: true,
        source,
    };
};
const extractChannelSessionModelStateFromRow = (row) => {
    const explicit = readExplicitModelOverrideState(row, 'sessions-list');
    if (explicit)
        return explicit;
    const effectiveModelRef = readModelRefFromRecord(row, {
        providerKeys: ['modelProvider', 'provider', 'providerId'],
        modelKeys: ['model', 'modelId'],
    });
    return effectiveModelRef
        ? { modelRef: effectiveModelRef, explicitOverride: false, source: 'sessions-list' }
        : null;
};
const unwrapGatewayHistoryMessageRecord = (value) => {
    if (!isRecord(value))
        return null;
    return isRecord(value.message) ? value.message : value;
};
const extractModelSnapshotState = (value) => {
    if (!isRecord(value) || value.type !== 'custom' || value.customType !== MODEL_SNAPSHOT_CUSTOM_TYPE) {
        return null;
    }
    const data = isRecord(value.data) ? value.data : null;
    if (!data)
        return null;
    const modelRef = readModelRefFromRecord(data, {
        providerKeys: ['provider', 'modelProvider', 'providerId'],
        modelKeys: ['modelId', 'model'],
    });
    return modelRef
        ? { modelRef, explicitOverride: false, source: 'history' }
        : null;
};
const extractSessionStatusModelState = (value) => {
    const message = unwrapGatewayHistoryMessageRecord(value);
    if (!message)
        return null;
    const role = typeof message.role === 'string' ? message.role.trim() : '';
    const toolName = typeof message.toolName === 'string' ? message.toolName.trim() : '';
    if (role !== 'toolResult' || toolName !== SESSION_STATUS_TOOL_NAME)
        return null;
    let details = null;
    if (isRecord(message.details)) {
        details = message.details;
    }
    else if (isRecord(value) && isRecord(value.details)) {
        details = value.details;
    }
    if (!details)
        return null;
    const explicit = readExplicitModelOverrideState(details, 'session-status');
    if (explicit)
        return explicit;
    if (details.changedModel !== true)
        return null;
    const modelRef = readModelRefFromRecord(details, {
        providerKeys: ['modelProvider', 'provider', 'providerId'],
        modelKeys: ['model', 'modelId'],
    });
    return modelRef
        ? { modelRef, explicitOverride: true, source: 'session-status' }
        : null;
};
const extractChannelSessionModelStateFromHistory = (messages) => {
    let latest = null;
    for (const message of messages) {
        const sessionStatus = extractSessionStatusModelState(message);
        if (sessionStatus) {
            latest = sessionStatus;
            continue;
        }
        const snapshot = extractModelSnapshotState(message);
        if (snapshot) {
            latest = snapshot;
        }
    }
    return latest;
};
const extractModelOverrideFromPatchResult = (response, fallbackModel) => {
    if (isRecord(response)) {
        const entry = isRecord(response.entry) ? response.entry : null;
        if (entry) {
            const explicit = readExplicitModelOverrideState(entry, 'patchSession');
            if (explicit)
                return explicit.modelRef;
        }
        const resolved = isRecord(response.resolved) ? response.resolved : null;
        if (resolved) {
            const resolvedModelRef = readModelRefFromRecord(resolved, {
                providerKeys: ['modelProvider', 'provider', 'providerId'],
                modelKeys: ['model', 'modelId'],
            });
            if (resolvedModelRef)
                return resolvedModelRef;
        }
    }
    if (fallbackModel === null || fallbackModel === undefined)
        return fallbackModel;
    return fallbackModel.trim() || null;
};
const resolveToolEventIsError = (data) => {
    if (!isRecord(data))
        return false;
    if (data.isError)
        return true;
    return isRecord(data.result) && data.result.isError === true;
};
exports.resolveToolEventIsError = resolveToolEventIsError;
const extractAgentNameFromSessionKey = (sessionKey) => {
    const parsed = (0, openclawChannelSessionSync_1.parseManagedSessionKey)(sessionKey);
    if (parsed?.agentId)
        return parsed.agentId;
    if (sessionKey && !parsed)
        return 'main';
    return undefined;
};
const isSameChannelHistoryEntry = (left, right) => {
    return left.role === right.role && left.text === right.text;
};
const truncate = (value, maxChars) => {
    if (value.length <= maxChars)
        return value;
    return `${value.slice(0, maxChars)}...`;
};
const normalizeAgentLifecyclePhase = (value) => {
    if (typeof value !== 'string')
        return '';
    const normalized = value.trim();
    const phases = Object.values(constants_7.AgentLifecyclePhase);
    return phases.includes(normalized) ? normalized : '';
};
const getAgentLifecyclePhase = (data) => {
    if (!isRecord(data))
        return '';
    return normalizeAgentLifecyclePhase(data.phase);
};
/** Strip Discord mention markup: <@userId>, <@!userId>, <#channelId>, <@&roleId>, and rendered @Username mentions */
const stripDiscordMentions = (text) => text
    .replace(/<@!?\d+>/g, '')
    .replace(/<#\d+>/g, '')
    .replace(/<@&\d+>/g, '')
    .replace(/^(?:@\S+\s*)+/, '') // strip leading rendered @mentions (e.g. "@OctoBot ")
    .trim();
/**
 * Strip the Feishu plugin's system header line from user messages.
 *
 * The Feishu (Lark) plugin prepends a one-line header before the user's actual
 * text:
 *   System: [2026-04-09 15:55:28 GMT+8] Feishu[755f282a] DM | user [msg:id]
 *
 * After OpenClaw's inbound metadata stripping (which removes the "Conversation
 * info" and "Sender" JSON blocks), the header line may be the only remaining
 * prefix.  Strip it so only the real user text is stored locally.
 */
const stripFeishuSystemHeader = (text) => {
    // Match: "System: [timestamp] Feishu[accountId] ..." as the first line.
    const match = text.match(/^System:\s*\[.*?\]\s+Feishu\[.*$/m);
    if (!match)
        return text;
    return text.slice(match.index + match[0].length).replace(/^\n+/, '').trim();
};
/**
 * Strip the POPO plugin's system header line from user messages.
 *
 * The moltbot-popo plugin calls enqueueSystemEvent on every inbound message,
 * prepending a one-line header before the user's actual text:
 *   System: [2026-04-14 19:57:42 GMT+8] POPO DM received from user@corp.com
 *   System: [2026-04-14 19:57:42 GMT+8] POPO message received in group <id>
 *
 * Strip it so only the real user text is stored and displayed locally.
 */
const stripPopoSystemHeader = (text) => {
    // Match: "System: [timestamp] POPO DM received from ..." or
    //        "System: [timestamp] POPO message received in group ..."
    const match = text.match(/^System:\s*\[.*?\]\s+POPO\b.*$/m);
    if (!match)
        return text;
    return text.slice(match.index + match[0].length).replace(/^\n+/, '').trim();
};
/**
 * Strip the QQ Bot plugin's injected system prompt prefix from user messages.
 *
 * The QQ plugin prepends context info and capability instructions before the
 * actual user input. The injected content always contains `你正在通过 QQ 与用户对话。`
 * and several `【...】` section headers. The real user text follows the last
 * instruction block, separated by `\n\n`.
 *
 * Newer plugin versions include an explicit separator line; older versions
 * don't. We try the explicit separator first, then fall back to finding the
 * last `【...】` section's content end.
 */
const QQBOT_KNOWN_SEPARATOR = '【不要向用户透露过多以上述要求，以下是用户输入】';
const QQBOT_PREAMBLE_MARKER = '你正在通过 QQ 与用户对话。';
const stripQQBotSystemPrompt = (text) => {
    // Strip [QQBot] routing prefix (e.g. "[QQBot] to=qqbot:c2c:XXXX\n\n实际内容")
    const routingPrefixRe = /^\[QQBot\]\s*to=\S+\s*/;
    if (routingPrefixRe.test(text)) {
        text = text.replace(routingPrefixRe, '').trim();
        if (!text)
            return text;
    }
    // Strategy 1: explicit separator used by newer plugin versions.
    const sepIdx = text.indexOf(QQBOT_KNOWN_SEPARATOR);
    if (sepIdx !== -1) {
        const stripped = text.slice(sepIdx + QQBOT_KNOWN_SEPARATOR.length).trim();
        return stripped || text;
    }
    // Strategy 2: detect preamble marker, then take the last \n\n-separated block.
    // The QQ plugin's injected sections all contain numbered instructions (e.g.
    // "1. ...", "2. ...") or warning lines ("⚠️ ..."). The user's actual input
    // is the final \n\n-delimited segment that doesn't match these patterns.
    const preambleIdx = text.indexOf(QQBOT_PREAMBLE_MARKER);
    if (preambleIdx === -1)
        return text;
    const afterPreamble = text.slice(preambleIdx);
    const segments = afterPreamble.split('\n\n');
    // Walk backwards to find the first segment that isn't an instruction block.
    for (let i = segments.length - 1; i >= 0; i--) {
        const seg = segments[i].trim();
        if (!seg)
            continue;
        // Instruction lines start with "1. ", "⚠", or "【"
        if (/^\d+\.\s/.test(seg) || /^⚠/.test(seg) || /^【/.test(seg) || seg.startsWith('- '))
            continue;
        // This segment looks like user input.
        const stripped = segments.slice(i).join('\n\n').trim();
        return stripped || text;
    }
    return text;
};
/**
 * Apply platform-specific text normalization to a message entry.
 * Used for both gateway (authoritative) and local entries so that
 * alignment comparisons work even when local messages still carry
 * raw platform prefixes.
 */
const normalizeEntryText = (role, text, flags) => {
    let result = text.trim();
    if (!result)
        return result;
    if (flags.isDiscord)
        result = stripDiscordMentions(result);
    if (flags.isQQ && role === 'user')
        result = stripQQBotSystemPrompt(result);
    if (flags.isPopo && role === 'user')
        result = stripPopoSystemHeader(result);
    if (flags.isFeishu && role === 'user')
        result = stripFeishuSystemHeader(result);
    return result;
};
const buildLocalReconciledEntries = (messages, platformFlags) => {
    const entries = [];
    for (const message of messages) {
        if (message.type !== 'user' && message.type !== 'assistant')
            continue;
        const text = normalizeEntryText(message.type, message.content, platformFlags);
        const mediaKey = (0, openclawConversationReconciliation_1.getLocalMediaAttachmentsKey)(message.metadata);
        if ((!text && !mediaKey) || (0, openclawHistory_1.shouldSuppressHeartbeatText)(message.type, text))
            continue;
        entries.push({
            role: message.type,
            text,
            timestamp: message.timestamp,
            metadata: message.metadata,
        });
    }
    return entries;
};
const getReconciliationTailState = (localEntries, authoritativeEntries, alignment) => {
    if (!alignment || (alignment.localIdx === 0 && alignment.authIdx === 0))
        return null;
    const authoritativeTail = authoritativeEntries.slice(alignment.authIdx);
    const localTail = localEntries.slice(alignment.localIdx);
    return {
        authoritativeTail,
        localTail,
        isInSync: localTail.length === authoritativeTail.length
            && localTail.every((entry, index) => (0, openclawConversationReconciliation_1.isSameReconciledEntry)(entry, authoritativeTail[index])),
    };
};
const extractMessageText = openclawHistory_1.extractGatewayMessageText;
const summarizeGatewayMessageShape = (message) => {
    if (!isRecord(message)) {
        return `non-record:${typeof message}`;
    }
    const role = typeof message.role === 'string' ? message.role : '?';
    const content = message.content;
    if (typeof content === 'string') {
        return `role=${role} contentType=string contentLen=${content.length}`;
    }
    if (Array.isArray(content)) {
        const parts = content.map((item) => {
            if (!isRecord(item))
                return typeof item;
            const type = typeof item.type === 'string' ? item.type : 'object';
            const textLength = typeof item.text === 'string' ? ` textLen=${item.text.length}` : '';
            return `${type}${textLength}`;
        });
        const toolCallCount = content.filter((item) => (isRecord(item) && (item.type === 'toolCall' || item.type === 'tool_call'))).length;
        return `role=${role} contentType=array blocks=${content.length} blockTypes=[${parts.join(', ')}] toolCalls=${toolCallCount}`;
    }
    if (isRecord(content)) {
        return `role=${role} contentType=object fields=${Object.keys(content).length}`;
    }
    if (typeof message.text === 'string') {
        return `role=${role} textLen=${message.text.length}`;
    }
    return `role=${role} fields=${Object.keys(message).length}`;
};
const messageHasToolCallBlock = (message) => {
    if (!isRecord(message))
        return false;
    const content = message.content;
    if (!Array.isArray(content))
        return false;
    return content.some((block) => isRecord(block) && block.type === 'toolCall');
};
const isToolUseStopReason = (stopReason) => {
    return stopReason === GatewayStopReason.ToolUse || stopReason === GatewayStopReason.ToolUseSnake;
};
const isIncompleteStopReason = (stopReason) => {
    return stopReason === GatewayStopReason.Length;
};
exports.isIncompleteStopReason = isIncompleteStopReason;
function normalizeOpenClawRuntimeErrorMessage(errorMessage) {
    const normalized = errorMessage.trim();
    switch (normalized) {
        case OpenClawKnownRuntimeError.UnexpectedEndOfJsonInput:
            return (0, i18n_1.t)('coworkErrorModelStreamEmptySseData');
        case OpenClawKnownRuntimeError.OnlyEmptySseDataFrames:
            return (0, i18n_1.t)('coworkErrorModelStreamOnlyEmptySseData');
        default:
            return errorMessage;
    }
}
function isOpenClawGenericLlmRequestFailed(errorMessage) {
    return errorMessage.trim() === OPENCLAW_GENERIC_LLM_REQUEST_FAILED;
}
const COWORK_ERROR_KEY_BY_OPENCLAW_FAILOVER_REASON = {
    auth: coworkErrorClassify_1.CoworkErrorI18nKey.AuthInvalid,
    billing: coworkErrorClassify_1.CoworkErrorI18nKey.InsufficientBalance,
    rate_limit: coworkErrorClassify_1.CoworkErrorI18nKey.RateLimit,
    overloaded: coworkErrorClassify_1.CoworkErrorI18nKey.ModelOverloaded,
    timeout: coworkErrorClassify_1.CoworkErrorI18nKey.ModelResponseTimeout,
    server_error: coworkErrorClassify_1.CoworkErrorI18nKey.ServerError,
};
const COWORK_ERROR_KEY_BY_OPENCLAW_RUNTIME_FAILURE_KIND = {
    auth_scope: coworkErrorClassify_1.CoworkErrorI18nKey.ModelAccessDenied,
    auth_refresh: coworkErrorClassify_1.CoworkErrorI18nKey.OAuthInvalid,
    refresh_timeout: coworkErrorClassify_1.CoworkErrorI18nKey.OAuthInvalid,
    refresh_contention: coworkErrorClassify_1.CoworkErrorI18nKey.OAuthInvalid,
    callback_timeout: coworkErrorClassify_1.CoworkErrorI18nKey.OAuthInvalid,
    callback_validation: coworkErrorClassify_1.CoworkErrorI18nKey.OAuthInvalid,
    auth_html: coworkErrorClassify_1.CoworkErrorI18nKey.OAuthInvalid,
    auth_invalid_token: coworkErrorClassify_1.CoworkErrorI18nKey.OAuthInvalid,
    rate_limit: coworkErrorClassify_1.CoworkErrorI18nKey.RateLimit,
    overloaded: coworkErrorClassify_1.CoworkErrorI18nKey.ModelOverloaded,
    dns: coworkErrorClassify_1.CoworkErrorI18nKey.NetworkError,
    timeout: coworkErrorClassify_1.CoworkErrorI18nKey.ModelResponseTimeout,
    upstream_html: coworkErrorClassify_1.CoworkErrorI18nKey.ServerError,
    proxy: coworkErrorClassify_1.CoworkErrorI18nKey.NetworkError,
    empty_response: coworkErrorClassify_1.CoworkErrorI18nKey.ServerError,
};
const pickStringField = (record, key) => {
    const value = record[key];
    if ((key === 'code' || key === 'errorCode')
        && typeof value === 'number'
        && Number.isFinite(value)) {
        return String(value);
    }
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
};
function normalizeOpenClawSafeRuntimeErrorMetadata(metadata) {
    if (!isRecord(metadata))
        return undefined;
    const normalized = {};
    for (const key of [
        'code',
        'errorCode',
        'error',
        'errorMessage',
        'provider',
        'model',
        'failoverReason',
        'providerRuntimeFailureKind',
        'providerErrorType',
        'httpCode',
        'providerErrorMessagePreview',
        'rawErrorPreview',
        'rawErrorHash',
    ]) {
        const value = pickStringField(metadata, key);
        if (value)
            normalized[key] = value;
    }
    return Object.keys(normalized).length > 0 ? normalized : undefined;
}
function classifyOpenClawSafeRuntimeErrorMetadata(metadata) {
    if (!metadata)
        return null;
    if (metadata.provider?.trim() === providers_1.ProviderName.LobsteraiServer
        && metadata.httpCode?.trim() === '403') {
        return coworkErrorClassify_1.CoworkErrorI18nKey.ModelAccessDenied;
    }
    // Some providers return an HTTP 200 SSE response whose terminal error text
    // contains an inner 503 capacity failure. OpenClaw can classify that text as
    // rate_limit because it also says "too many requests" or "throttled". Let
    // the high-confidence capacity signal in the preserved raw preview win after
    // retaining LobsterAI's explicit HTTP 403 access-denial rule above.
    const rawErrorClassifiedKey = metadata.rawErrorPreview
        ? (0, coworkErrorClassify_1.classifyErrorKey)(metadata.rawErrorPreview)
        : null;
    if (rawErrorClassifiedKey === coworkErrorClassify_1.CoworkErrorI18nKey.ModelOverloaded) {
        return rawErrorClassifiedKey;
    }
    const failureKind = metadata.providerRuntimeFailureKind?.trim();
    if (failureKind && COWORK_ERROR_KEY_BY_OPENCLAW_RUNTIME_FAILURE_KIND[failureKind]) {
        return COWORK_ERROR_KEY_BY_OPENCLAW_RUNTIME_FAILURE_KIND[failureKind];
    }
    const failoverReason = metadata.failoverReason?.trim();
    if (failoverReason && COWORK_ERROR_KEY_BY_OPENCLAW_FAILOVER_REASON[failoverReason]) {
        return COWORK_ERROR_KEY_BY_OPENCLAW_FAILOVER_REASON[failoverReason];
    }
    for (const candidate of [
        metadata.rawErrorPreview,
        metadata.errorMessage,
        metadata.error,
        metadata.providerErrorType,
    ]) {
        if (!candidate)
            continue;
        const classifiedKey = (0, coworkErrorClassify_1.classifyErrorKey)(candidate);
        if (classifiedKey)
            return classifiedKey;
    }
    return null;
}
function isLobsterAILoginExpiredMetadata(metadata) {
    if (metadata?.provider?.trim() !== providers_1.ProviderName.LobsteraiServer)
        return false;
    if (metadata.httpCode?.trim() === '403')
        return false;
    if (metadata.providerRuntimeFailureKind?.trim() === 'auth_scope')
        return false;
    return metadata.httpCode?.trim() === '401'
        || metadata.failoverReason?.trim() === 'auth'
        || metadata.providerRuntimeFailureKind?.trim() === 'auth_refresh'
        || metadata.providerRuntimeFailureKind?.trim() === 'auth_invalid_token';
}
function resolveOpenClawRuntimeErrorMessage(errorMessage, metadata) {
    return resolveOpenClawRuntimeError(errorMessage, metadata).message;
}
const getEnterpriseQuotaErrorMessage = (details) => {
    switch (details.reason) {
        case constants_4.EnterpriseQuotaReason.MemberMonthlyQuotaExhausted:
            return (0, i18n_1.t)('coworkErrorEnterpriseMemberQuotaExhausted');
        case constants_4.EnterpriseQuotaReason.EnterprisePoolExhausted:
            return (0, i18n_1.t)('coworkErrorEnterprisePoolExhausted');
        case constants_4.EnterpriseQuotaReason.EnterpriseCreditBatchesExpired:
            return (0, i18n_1.t)('coworkErrorEnterpriseCreditBatchesExpired');
    }
};
const buildResolvedRuntimeError = (message, enterpriseQuotaError = null) => ({ message, enterpriseQuotaError });
function resolveOpenClawRuntimeError(errorMessage, metadata) {
    const normalized = normalizeOpenClawRuntimeErrorMessage(errorMessage);
    const metadataClassifiedKey = classifyOpenClawSafeRuntimeErrorMetadata(metadata);
    const explicitEnterpriseQuotaError = (0, quotaError_1.resolveEnterpriseQuotaError)(metadata?.errorCode ?? metadata?.code, normalized);
    if (explicitEnterpriseQuotaError) {
        (0, openclawTokenProxy_1.consumeRecentOpenClawTokenProxyQuotaError)();
        return buildResolvedRuntimeError(getEnterpriseQuotaErrorMessage(explicitEnterpriseQuotaError), explicitEnterpriseQuotaError);
    }
    // OpenClaw's friendly wrapper may already say "rate limit" even when its
    // preserved raw metadata identifies a provider-capacity failure.
    if (metadataClassifiedKey === coworkErrorClassify_1.CoworkErrorI18nKey.ModelOverloaded) {
        (0, openclawTokenProxy_1.consumeRecentOpenClawTokenProxyQuotaError)();
        return buildResolvedRuntimeError((0, i18n_1.t)(metadataClassifiedKey));
    }
    const classifiedKey = (0, coworkErrorClassify_1.classifyErrorKey)(normalized);
    if (classifiedKey) {
        if (isLobsterAILoginExpiredMetadata(metadata)
            && (classifiedKey === coworkErrorClassify_1.CoworkErrorI18nKey.AuthInvalid
                || classifiedKey === coworkErrorClassify_1.CoworkErrorI18nKey.OAuthInvalid)) {
            return buildResolvedRuntimeError((0, i18n_1.t)(coworkErrorClassify_1.CoworkErrorI18nKey.LobsterAILoginExpired));
        }
        if (classifiedKey === coworkErrorClassify_1.CoworkErrorI18nKey.QuotaExhausted) {
            const recentQuotaError = (0, openclawTokenProxy_1.consumeRecentOpenClawTokenProxyQuotaError)();
            const enterpriseQuotaError = (0, quotaError_1.resolveEnterpriseQuotaError)(metadata?.errorCode ?? metadata?.code ?? recentQuotaError?.code, `${normalized} ${recentQuotaError?.message ?? ''}`);
            if (enterpriseQuotaError) {
                return buildResolvedRuntimeError(getEnterpriseQuotaErrorMessage(enterpriseQuotaError), enterpriseQuotaError);
            }
        }
        return buildResolvedRuntimeError((0, i18n_1.t)(classifiedKey));
    }
    if (isOpenClawGenericLlmRequestFailed(normalized)) {
        if (isLobsterAILoginExpiredMetadata(metadata)) {
            (0, openclawTokenProxy_1.consumeRecentOpenClawTokenProxyQuotaError)();
            return buildResolvedRuntimeError((0, i18n_1.t)(coworkErrorClassify_1.CoworkErrorI18nKey.LobsterAILoginExpired));
        }
        if (metadataClassifiedKey) {
            const recentQuotaError = (0, openclawTokenProxy_1.consumeRecentOpenClawTokenProxyQuotaError)();
            if (metadataClassifiedKey === coworkErrorClassify_1.CoworkErrorI18nKey.QuotaExhausted) {
                const enterpriseQuotaError = (0, quotaError_1.resolveEnterpriseQuotaError)(metadata?.errorCode ?? metadata?.code ?? recentQuotaError?.code, recentQuotaError?.message ?? '');
                if (enterpriseQuotaError) {
                    return buildResolvedRuntimeError(getEnterpriseQuotaErrorMessage(enterpriseQuotaError), enterpriseQuotaError);
                }
            }
            return buildResolvedRuntimeError((0, i18n_1.t)(metadataClassifiedKey));
        }
        const recentQuotaError = (0, openclawTokenProxy_1.consumeRecentOpenClawTokenProxyQuotaError)();
        if (recentQuotaError) {
            const enterpriseQuotaError = (0, quotaError_1.resolveEnterpriseQuotaError)(recentQuotaError.code, recentQuotaError.message);
            if (enterpriseQuotaError) {
                return buildResolvedRuntimeError(getEnterpriseQuotaErrorMessage(enterpriseQuotaError), enterpriseQuotaError);
            }
            return buildResolvedRuntimeError((0, i18n_1.t)(coworkErrorClassify_1.CoworkErrorI18nKey.QuotaExhausted));
        }
    }
    return buildResolvedRuntimeError(normalized);
}
const splitModelRef = (modelRef) => {
    const trimmed = modelRef?.trim();
    if (!trimmed)
        return {};
    const slashIndex = trimmed.indexOf('/');
    if (slashIndex <= 0)
        return { model: trimmed };
    return {
        provider: trimmed.slice(0, slashIndex),
        model: trimmed.slice(slashIndex + 1) || undefined,
    };
};
/**
 * Preserves the redacted technical detail of a runtime error next to the
 * normalized display copy, so the UI can offer a "technical details"
 * disclosure. Returns undefined when there is nothing beyond the display copy.
 */
function buildOpenClawRuntimeErrorDetail(rawErrorMessage, displayMessage, metadata, options) {
    const fallbackRef = splitModelRef(options?.fallbackModelRef);
    const provider = metadata?.provider?.trim() || fallbackRef.provider;
    const model = metadata?.model?.trim() || fallbackRef.model;
    const sourceInfo = provider ? options?.resolveModelSource?.(provider) : undefined;
    return (0, errorDetail_1.buildCoworkErrorDetail)({
        rawErrorMessage,
        displayMessage,
        metadata: { ...metadata, provider, model },
        modelSource: sourceInfo?.source,
        providerDisplayName: sourceInfo?.providerDisplayName,
    });
}
const buildRuntimeErrorMetadata = (resolvedError) => ({
    error: resolvedError.message,
    ...(resolvedError.errorDetail ? { errorDetail: resolvedError.errorDetail } : {}),
    ...(resolvedError.enterpriseQuotaError
        ? {
            [constants_4.EnterpriseQuotaMessageMetadataKey.ErrorCode]: resolvedError.enterpriseQuotaError.code,
            [constants_4.EnterpriseQuotaMessageMetadataKey.Reason]: resolvedError.enterpriseQuotaError.reason,
        }
        : {}),
});
exports.buildRuntimeErrorMetadata = buildRuntimeErrorMetadata;
const extractTextBlocksAndSignals = (message) => {
    if (!isRecord(message)) {
        return {
            textBlocks: [],
            thinkingText: '',
            sawNonTextContentBlocks: false,
        };
    }
    const content = message.content;
    if (typeof content === 'string') {
        const text = content.trim();
        return {
            textBlocks: text ? [text] : [],
            thinkingText: '',
            sawNonTextContentBlocks: false,
        };
    }
    if (!Array.isArray(content)) {
        return {
            textBlocks: [],
            thinkingText: '',
            sawNonTextContentBlocks: false,
        };
    }
    const textBlocks = [];
    const thinkingParts = [];
    let sawNonTextContentBlocks = false;
    for (const block of content) {
        if (!isRecord(block))
            continue;
        if (block.type === 'text' && typeof block.text === 'string') {
            const text = block.text.trim();
            if (text) {
                textBlocks.push(text);
            }
            continue;
        }
        if (block.type === 'thinking' && typeof block.thinking === 'string') {
            const thinkingText = block.thinking.trim();
            if (thinkingText) {
                thinkingParts.push(thinkingText);
            }
            continue;
        }
        if (typeof block.type === 'string') {
            sawNonTextContentBlocks = true;
        }
    }
    return {
        textBlocks,
        thinkingText: thinkingParts.join('\n\n'),
        sawNonTextContentBlocks,
    };
};
/**
 * Extract file paths from assistant "message" tool calls in chat.history.
 * Only scans messages after the last user message (current turn).
 * The model sends files to Telegram using: toolCall { name: "message", arguments: { action: "send", filePath: "..." } }
 */
const extractSentFilePathsFromHistory = (messages) => {
    // Find the last user message index to scope to current turn only
    let lastUserIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if (isRecord(msg) && msg.role === 'user') {
            lastUserIdx = i;
            break;
        }
    }
    const filePaths = [];
    const seen = new Set();
    const startIdx = lastUserIdx >= 0 ? lastUserIdx + 1 : 0;
    for (let i = startIdx; i < messages.length; i++) {
        const msg = messages[i];
        if (!isRecord(msg))
            continue;
        const role = typeof msg.role === 'string' ? msg.role.trim().toLowerCase() : '';
        if (role !== 'assistant')
            continue;
        if (!Array.isArray(msg.content))
            continue;
        for (const block of msg.content) {
            if (!isRecord(block))
                continue;
            if (block.type !== 'toolCall' || block.name !== 'message')
                continue;
            const args = block.arguments;
            if (!isRecord(args))
                continue;
            const filePath = typeof args.filePath === 'string' ? args.filePath.trim() : '';
            if (filePath && !seen.has(filePath)) {
                seen.add(filePath);
                filePaths.push(filePath);
            }
        }
    }
    return filePaths;
};
/**
 * Extract and concatenate all assistant text from the current turn in chat.history.
 * The current turn starts after the last user message.
 */
const extractCurrentTurnAssistantText = (messages) => {
    // Find the last user message index (turn boundary)
    let lastUserIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if (isRecord(msg) && msg.role === 'user') {
            lastUserIdx = i;
            break;
        }
    }
    const startIdx = lastUserIdx >= 0 ? lastUserIdx + 1 : 0;
    const textParts = [];
    for (let i = startIdx; i < messages.length; i++) {
        const msg = messages[i];
        if (!isRecord(msg))
            continue;
        const role = typeof msg.role === 'string' ? msg.role.trim().toLowerCase() : '';
        if (role !== 'assistant')
            continue;
        let text = extractMessageText(msg).trim();
        text = (0, openclawHistory_1.stripTrailingSilentReplyToken)(text);
        if (text && !(0, openclawHistory_1.shouldSuppressHeartbeatText)('assistant', text)) {
            textParts.push(text);
        }
    }
    return textParts.join('\n\n');
};
/**
 * Extract the text of the LAST assistant message in the current turn from chat.history.
 * Unlike extractCurrentTurnAssistantText (which concatenates ALL assistant segments),
 * this returns only the final segment — suitable for replacing the last assistant message
 * in managed sessions without relying on committedAssistantText for prefix slicing.
 */
const extractLastAssistantSegmentInTurn = (messages) => {
    let lastUserIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if (isRecord(msg) && msg.role === 'user') {
            lastUserIdx = i;
            break;
        }
    }
    const startIdx = lastUserIdx >= 0 ? lastUserIdx + 1 : 0;
    let lastAssistantText = '';
    for (let i = startIdx; i < messages.length; i++) {
        const msg = messages[i];
        if (!isRecord(msg))
            continue;
        const role = typeof msg.role === 'string' ? msg.role.trim().toLowerCase() : '';
        if (role !== 'assistant')
            continue;
        let text = extractMessageText(msg).trim();
        text = (0, openclawHistory_1.stripTrailingSilentReplyToken)(text);
        if (text && !(0, openclawHistory_1.shouldSuppressHeartbeatText)('assistant', text)) {
            lastAssistantText = text;
        }
    }
    return lastAssistantText;
};
const inspectCurrentTurnToolWork = (messages) => {
    let lastUserIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if (isRecord(msg) && msg.role === 'user') {
            lastUserIdx = i;
            break;
        }
    }
    const startIdx = lastUserIdx >= 0 ? lastUserIdx + 1 : 0;
    let hasToolWork = false;
    let toolResultChars = 0;
    for (let i = startIdx; i < messages.length; i++) {
        const msg = messages[i];
        if (!isRecord(msg))
            continue;
        const role = typeof msg.role === 'string' ? msg.role.trim() : '';
        if (role === OpenClawHistoryRole.Tool || role === OpenClawHistoryRole.ToolResult) {
            hasToolWork = true;
            toolResultChars += extractMessageText(msg).length;
            continue;
        }
        if (role !== 'assistant' || !Array.isArray(msg.content))
            continue;
        if (msg.content.some((block) => isRecord(block) && block.type === 'toolCall')) {
            hasToolWork = true;
        }
    }
    return { hasToolWork, toolResultChars };
};
const isDroppedBoundaryTextBlockSubset = (streamedTextBlocks, finalTextBlocks) => {
    if (finalTextBlocks.length === 0 || finalTextBlocks.length >= streamedTextBlocks.length) {
        return false;
    }
    if (finalTextBlocks.every((block, index) => streamedTextBlocks[index] === block)) {
        return true;
    }
    const suffixStart = streamedTextBlocks.length - finalTextBlocks.length;
    return finalTextBlocks.every((block, index) => streamedTextBlocks[suffixStart + index] === block);
};
const extractToolText = (payload) => {
    if (typeof payload === 'string') {
        return payload;
    }
    if (Array.isArray(payload)) {
        const lines = payload
            .map((item) => extractToolText(item).trim())
            .filter(Boolean);
        if (lines.length > 0) {
            return lines.join('\n');
        }
    }
    if (!isRecord(payload)) {
        if (payload === undefined || payload === null)
            return '';
        try {
            return JSON.stringify(payload, null, 2);
        }
        catch {
            return String(payload);
        }
    }
    if (typeof payload.text === 'string' && payload.text.trim()) {
        return payload.text;
    }
    if (typeof payload.output === 'string' && payload.output.trim()) {
        return payload.output;
    }
    if (typeof payload.stdout === 'string' || typeof payload.stderr === 'string') {
        const chunks = [
            typeof payload.stdout === 'string' ? payload.stdout : '',
            typeof payload.stderr === 'string' ? payload.stderr : '',
        ].filter(Boolean);
        if (chunks.length > 0) {
            return chunks.join('\n');
        }
    }
    const content = payload.content;
    if (typeof content === 'string' && content.trim()) {
        return content;
    }
    if (Array.isArray(content)) {
        const chunks = [];
        for (const item of content) {
            if (typeof item === 'string' && item.trim()) {
                chunks.push(item);
                continue;
            }
            if (!isRecord(item))
                continue;
            if (typeof item.text === 'string' && item.text.trim()) {
                chunks.push(item.text);
                continue;
            }
            if (typeof item.content === 'string' && item.content.trim()) {
                chunks.push(item.content);
            }
        }
        if (chunks.length > 0) {
            return chunks.join('\n');
        }
    }
    try {
        return JSON.stringify(payload, null, 2);
    }
    catch {
        return String(payload);
    }
};
const isContextMaintenanceToolEvent = (data) => {
    const toolName = typeof data.name === 'string' ? data.name.trim().toLowerCase() : '';
    if (toolName !== 'read' && toolName !== 'write') {
        return false;
    }
    const args = isRecord(data.args) ? data.args : null;
    const toolPath = typeof args?.path === 'string' ? args.path : '';
    return /(?:^|\/)memory\/\d{4}-\d{2}-\d{2}\.md$/.test(toolPath);
};
const messageHasContextMaintenanceToolCall = (message) => {
    if (!isRecord(message) || !Array.isArray(message.content))
        return false;
    return message.content.some((block) => (isRecord(block)
        && block.type === 'toolCall'
        && isContextMaintenanceToolEvent({
            name: block.name,
            args: isRecord(block.arguments) ? block.arguments : undefined,
        })));
};
const historyTailLooksLikeContextMaintenance = (historyMessages) => {
    let sawMaintenanceAssistant = false;
    for (let i = historyMessages.length - 1; i >= 0; i--) {
        const message = historyMessages[i];
        if (!isRecord(message))
            continue;
        const role = typeof message.role === 'string' ? message.role : '';
        if (role === 'assistant') {
            const text = (0, openclawHistory_1.extractGatewayMessageText)(message).trim();
            sawMaintenanceAssistant = sawMaintenanceAssistant
                || messageHasContextMaintenanceToolCall(message)
                || (0, openclawHistory_1.isSilentReplyText)(text);
            continue;
        }
        if (role === 'toolResult') {
            continue;
        }
        if (role === 'user') {
            return sawMaintenanceAssistant && (0, openclawHistory_1.isPreCompactionMemoryFlushPromptText)((0, openclawHistory_1.extractGatewayMessageText)(message));
        }
        if (role === 'system') {
            continue;
        }
        return false;
    }
    return false;
};
const extractToolDetails = (payload) => {
    if (!isRecord(payload))
        return undefined;
    return isRecord(payload.details) ? payload.details : undefined;
};
const readMediaPollCount = (value) => (typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : undefined);
const getMediaStatusToolArgs = (toolName, args) => {
    if (toolName !== mediaGenerationPolicy_1.MediaGenerationTool.Image && toolName !== mediaGenerationPolicy_1.MediaGenerationTool.Video) {
        return null;
    }
    if (!isRecord(args) || args.action !== MediaGenerationToolAction.Status) {
        return null;
    }
    const taskId = typeof args.taskId === 'string' ? args.taskId.trim() : '';
    if (!taskId)
        return null;
    return {
        taskId,
        mediaType: toolName === mediaGenerationPolicy_1.MediaGenerationTool.Video ? 'video' : 'image',
    };
};
const extractMediaStatusFromText = (text) => {
    const match = text.match(/^Status:\s*(\S+)/m);
    return match?.[1];
};
const extractMediaTaskIdFromText = (text) => {
    const match = text.match(/^Task ID:\s*(\S+)/m);
    return match?.[1];
};
const resolveMediaStatusToolDetails = (turn, toolCallId, toolName, args, payload, phase, text) => {
    const details = extractToolDetails(payload);
    const mediaArgs = getMediaStatusToolArgs(toolName, args);
    if (!mediaArgs)
        return details;
    const existingPollCount = turn.mediaStatusPollCountByToolCallId.get(toolCallId) ?? 0;
    const existingTaskPollCount = turn.mediaStatusPollCountByTaskId.get(mediaArgs.taskId) ?? 0;
    const detailPollCount = readMediaPollCount(details?.pollCount);
    let basePollCount = turn.mediaStatusPollBaseByToolCallId.get(toolCallId);
    if (basePollCount == null) {
        basePollCount = detailPollCount != null && detailPollCount > existingTaskPollCount
            ? 0
            : existingTaskPollCount;
        turn.mediaStatusPollBaseByToolCallId.set(toolCallId, basePollCount);
    }
    const nextPollCount = phase === 'update'
        ? (detailPollCount != null
            ? basePollCount + detailPollCount
            : Math.max(existingPollCount, existingTaskPollCount) + 1)
        : (detailPollCount != null
            ? basePollCount + detailPollCount
            : (Math.max(existingPollCount, existingTaskPollCount) || undefined));
    let resolvedPollCount = nextPollCount;
    if (nextPollCount != null) {
        const mergedPollCount = Math.max(existingPollCount, existingTaskPollCount, nextPollCount);
        resolvedPollCount = mergedPollCount;
        turn.mediaStatusPollCountByToolCallId.set(toolCallId, mergedPollCount);
        turn.mediaStatusPollCountByTaskId.set(mediaArgs.taskId, mergedPollCount);
    }
    const status = typeof details?.status === 'string'
        ? details.status
        : extractMediaStatusFromText(text);
    const textTaskId = extractMediaTaskIdFromText(text);
    const upstreamTaskId = typeof details?.upstreamTaskId === 'string'
        ? details.upstreamTaskId
        : textTaskId;
    const nextDetails = {
        ...(details ?? {}),
    };
    delete nextDetails.pollCount;
    return {
        ...nextDetails,
        taskId: typeof details?.taskId === 'string' ? details.taskId : mediaArgs.taskId,
        ...(upstreamTaskId ? { upstreamTaskId } : {}),
        ...(status ? { status } : {}),
        ...(resolvedPollCount != null && resolvedPollCount > 1 ? { pollCount: resolvedPollCount } : {}),
        isMediaStatusPolling: true,
        mediaType: mediaArgs.mediaType,
    };
};
const toToolInputRecord = (value) => {
    if (isRecord(value)) {
        return value;
    }
    if (value === undefined || value === null) {
        return {};
    }
    return { value };
};
const MediaReferenceTypeLabel = {
    Image: 'image',
    Video: 'video',
    Audio: 'audio',
};
const sanitizeMediaReferenceText = (value) => (value.replace(/[\r\n]+/g, ' ').trim().slice(0, 200));
const buildMediaReferencePromptSection = (mediaReferences) => {
    const refs = mediaReferences?.filter(ref => ref.token.trim()) ?? [];
    if (refs.length === 0)
        return '';
    const lines = [
        '[Caisra media reference mapping]',
        'The current user request contains explicit @ media tokens. Treat these mappings as authoritative and do not guess which uploaded attachment a token means.',
        'When calling caisra_image_generate or caisra_video_generate, pass mapped file paths or URLs as tool arguments. Do not pass @ media tokens as image, images, firstFrame, lastFrame, referenceImages, media.url, video, or videos values.',
        'For caisra_image_generate, prefer image with the mapped path for one referenced image and images for multiple referenced images.',
    ];
    for (const ref of refs) {
        const mediaType = ref.mediaType === MediaReferenceTypeLabel.Image
            ? MediaReferenceTypeLabel.Image
            : ref.mediaType === MediaReferenceTypeLabel.Video
                ? MediaReferenceTypeLabel.Video
                : MediaReferenceTypeLabel.Audio;
        const locations = [
            ref.localPath ? `localPath "${sanitizeMediaReferenceText(ref.localPath)}"` : '',
            ref.remoteUrl ? `remoteUrl "${sanitizeMediaReferenceText(ref.remoteUrl)}"` : '',
            !ref.localPath && !ref.remoteUrl && ref.dataUrl ? 'dataUrl fallback available through the Caisra host' : '',
        ].filter(Boolean);
        const locationText = locations.length > 0 ? `, ${locations.join(', ')}` : '';
        lines.push(`- ${ref.token}: ${mediaType} attachment #${ref.index}, file "${sanitizeMediaReferenceText(ref.fileName)}", MIME ${sanitizeMediaReferenceText(ref.mimeType)}${locationText}.`);
    }
    return lines.join('\n');
};
const mergeStreamingText = (previousText, incomingText, mode) => {
    if (!incomingText) {
        return { text: previousText, mode };
    }
    if (!previousText) {
        return { text: incomingText, mode };
    }
    if (incomingText === previousText) {
        return { text: previousText, mode };
    }
    if (mode === 'snapshot') {
        if (previousText.startsWith(incomingText) && incomingText.length < previousText.length) {
            return { text: previousText, mode };
        }
        return { text: incomingText, mode };
    }
    if (mode === 'delta') {
        if (incomingText.startsWith(previousText)) {
            return { text: incomingText, mode: 'snapshot' };
        }
        return { text: previousText + incomingText, mode };
    }
    if (incomingText.startsWith(previousText)) {
        return { text: incomingText, mode: 'snapshot' };
    }
    if (previousText.startsWith(incomingText)) {
        return { text: previousText, mode: 'snapshot' };
    }
    if (incomingText.includes(previousText) && incomingText.length > previousText.length) {
        return { text: incomingText, mode: 'snapshot' };
    }
    // Overlap detection removed: coincidental suffix-prefix matches (e.g. "...p" + "ptx")
    // would incorrectly strip characters. Once snapshot detection above has failed,
    // treat the incoming text as a pure delta append.
    return { text: previousText + incomingText, mode: 'delta' };
};
const sleep = async (ms) => {
    await new Promise((resolve) => setTimeout(resolve, ms));
};
const waitWithTimeout = async (promise, timeoutMs) => {
    let timeoutId = null;
    const timeoutPromise = new Promise((_resolve, reject) => {
        timeoutId = setTimeout(() => {
            reject(new Error(`Engine connection timed out after ${timeoutMs}ms.`));
        }, timeoutMs);
    });
    try {
        await Promise.race([promise, timeoutPromise]);
    }
    finally {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
    }
};
const formatTimingDuration = (startedAtMs, endedAtMs) => {
    if (!startedAtMs || !endedAtMs) {
        return 'n/a';
    }
    return `${endedAtMs - startedAtMs}ms`;
};
const formatTimingOffset = (baseStartedAtMs, endedAtMs) => {
    if (!endedAtMs) {
        return 'n/a';
    }
    return `${endedAtMs - baseStartedAtMs}ms`;
};
class OpenClawRuntimeAdapter extends events_1.EventEmitter {
    store;
    engineManager;
    options;
    activeTurns = new Map();
    pendingGoalContinuations = new Map();
    sessionIdBySessionKey = new Map();
    /** Stable cron job key → latest real gateway session key. One entry per job
     * keeps routing correct without retaining every historical run id. */
    latestCronSessionKeyByCacheKey = new Map();
    sessionIdByRunId = new Map();
    pendingAgentEventsByRunId = new Map();
    lastChatSeqByRunId = new Map();
    lastAgentSeqByRunId = new Map();
    // Tracks runIds that have received a lifecycle phase=error, so gateway retries
    // (which reuse the same runId) don't re-create an ActiveTurn and surface duplicate errors.
    terminatedRunIds = new Set();
    /**
     * Recently completed/aborted/errored runIds are kept briefly so late gateway
     * events cannot re-create a ghost turn or attach to the next user turn.
     */
    recentlyClosedRunIds = new Map();
    pendingBtwRuns = new Map();
    pendingBtwRunBySessionId = new Map();
    terminalBtwRunIds = new Map();
    pendingTurns = new Map();
    confirmationModeBySession = new Map();
    bridgedSessions = new Set();
    continuityFullBridgeCompactedAtBySession = new Map();
    workspaceRehydrationBridgeCompactedAtBySession = new Map();
    lastSystemPromptBySession = new Map();
    sessionModelPatchStateBySession = new Map();
    sessionModelPatchQueue = new Map();
    gatewayHistoryCountBySession = new Map();
    gatewayHistoryCountByCronSessionKey = new Map();
    latestTurnTokenBySession = new Map();
    /**
     * Sessions that were manually stopped by the user via stopSession().
     * Maps sessionId → timestamp of when stop was requested.
     * Used to suppress automatic ActiveTurn re-creation from late-arriving
     * OpenClaw Gateway events (e.g. POPO/Telegram channel events that arrive
     * after the user clicked Stop).  Entries expire after STOP_COOLDOWN_MS.
     */
    stoppedSessions = new Map();
    static STOP_COOLDOWN_MS = 10_000; // 10 seconds
    static RECENTLY_CLOSED_RUN_ID_TTL_MS = 120_000;
    static RECENTLY_CLOSED_RUN_ID_LIMIT = 1000;
    static TERMINAL_BTW_RUN_ID_TTL_MS = 120_000;
    static TERMINAL_BTW_RUN_ID_LIMIT = 1000;
    static LIFECYCLE_ERROR_FALLBACK_DELAY_MS = 20_000;
    static CHAT_FINAL_COMPLETION_GRACE_MS = 800;
    static PLAN_MODE_RECOVERY_FOLLOWUP_GRACE_MS = 15_000;
    static TOOL_USE_FINAL_LIFECYCLE_END_GRACE_MS = 45_000;
    static SILENT_MAINTENANCE_FOLLOWUP_GRACE_MS = 60_000;
    static VISIBLE_FINAL_CONTINUATION_GRACE_MS = 120_000;
    static VISIBLE_FINAL_LARGE_TOOL_CONFIRMATION_GRACE_MS = 8_000;
    static VISIBLE_FINAL_TOOL_RESULT_CHAR_THRESHOLD = 20_000;
    static VISIBLE_FINAL_SHORT_TEXT_CHAR_THRESHOLD = 600;
    static GATEWAY_SESSION_DELETE_TIMEOUT_MS = 5_000;
    static PLAN_MODE_SAFETY_RECOVERY_AFTER_ABORT_FALLBACK_MS = 10_000;
    static PLAN_MODE_SAFETY_RECOVERY_AFTER_LIFECYCLE_END_MS = 1_500;
    gatewayClient = null;
    gatewayClientVersion = null;
    gatewayClientEntryPath = null;
    gatewayClientGeneration = 0;
    /** Holds the client between start() and onHelloOk so stopGatewayClient can clean it up. */
    pendingGatewayClient = null;
    gatewayReadyPromise = null;
    gatewayReadyReject = null;
    /** Serializes concurrent calls to ensureGatewayClientReady to prevent duplicate clients. */
    gatewayClientInitLock = null;
    channelSessionSync = null;
    knownChannelSessionIds = new Set();
    fullySyncedSessions = new Set();
    /** Per-session cursor: number of gateway history entries (user+assistant) already synced locally. */
    channelSyncCursor = new Map();
    /** Sessions re-created after user deletion — use latestOnly sync to avoid replaying old history. */
    reCreatedChannelSessionIds = new Set();
    /** Channel sessionKeys explicitly deleted by the user. Polling will not re-create these. */
    deletedChannelKeys = new Set();
    /** Sessions that were manually stopped by the user. Used to suppress the timeout hint
     *  when the gateway sends back a late 'aborted' event after stopSession() already cleaned up the turn. */
    manuallyStoppedSessions = new Set();
    /** Session keys whose origin is "heartbeat" — discovered via polling, used to filter real-time events. */
    heartbeatSessionKeys = new Set();
    /**
     * Native IM runs are not represented by the gateway's `hasActiveRun` flag.
     * Track explicit `sessions.changed` lifecycle starts so the polling fallback
     * cannot immediately overwrite their loading state with `completed`.
     */
    channelLifecycleRunBySessionKey = new Map();
    reportedChannelPromptRunIds = new Set();
    channelPollingTimer = null;
    static CHANNEL_POLL_INTERVAL_MS = 10_000;
    static CHANNEL_LIFECYCLE_RUN_GRACE_MS = 60_000;
    static REPORTED_CHANNEL_PROMPT_RUN_ID_LIMIT = 2_000;
    static GATEWAY_SESSION_SUBSCRIBE_TIMEOUT_MS = 5_000;
    /** Delay before pulling a cron delivery mirror into the mapped conversation,
     *  giving the gateway time to flush the transcript append. */
    static CRON_DELIVERY_SYNC_DELAY_MS = 2_000;
    static FULL_HISTORY_SYNC_LIMIT = 50;
    /** Gateway WS auto-reconnect state */
    gatewayReconnectTimer = null;
    gatewayReconnectAttempt = 0;
    /** Set to true before intentionally stopping the client (e.g. version upgrade) to suppress auto-reconnect. */
    gatewayStoppingIntentionally = false;
    gatewayReconnectSuppressed = false;
    static GATEWAY_RECONNECT_MAX_ATTEMPTS = 10;
    static GATEWAY_RECONNECT_DELAYS = [2_000, 5_000, 10_000, 15_000, 30_000]; // ms
    /** Gateway tick heartbeat watchdog state */
    lastTickTimestamp = 0;
    tickWatchdogTimer = null;
    static TICK_WATCHDOG_INTERVAL_MS = 60_000; // check every 60s
    static TICK_TIMEOUT_MS = 90_000; // 3 tick cycles (30s each) without response → dead
    /** Throttle state for messageUpdate IPC emissions during streaming */
    lastMessageUpdateEmitTime = new Map();
    pendingMessageUpdateTimer = new Map();
    static MESSAGE_UPDATE_THROTTLE_MS = 200;
    /** Throttle state for SQLite store writes during streaming */
    lastStoreUpdateTime = new Map();
    pendingStoreUpdateTimer = new Map();
    static STORE_UPDATE_THROTTLE_MS = 250;
    // ── Subagent tracking (delegated) ───────────────────────────────────────
    subagentTracker;
    subagentSessionMaterializer;
    approvalController;
    thinkingController;
    turnHistorySync;
    /**
     * Server-side agent timeout in seconds (mirrors agents.defaults.timeoutSeconds in openclaw config).
     * Used to set a client-side fallback timer that fires slightly after the server timeout,
     * so LobsterAI can recover even when the gateway fails to deliver the abort event.
     */
    agentTimeoutSeconds = openclawConfigSync_1.OPENCLAW_AGENT_TIMEOUT_SECONDS;
    static CLIENT_TIMEOUT_GRACE_MS = 30_000;
    contextWindowCache = new Map();
    contextWindowCacheLoaded = false;
    // Authoritative contextTokens from sessions.list (per sessionKey).
    // Updated by pollChannelSessions and refreshSessionContextTokens.
    sessionContextTokensCache = new Map();
    goalSnapshotBySessionId = new Map();
    contextUsageInFlightBySession = new Map();
    contextUsageListInFlight = new Map();
    gatewayRpcHealth = {
        degradedUntil: 0,
        consecutiveTimeouts: 0,
    };
    static CONTEXT_USAGE_LIST_LIMIT = 120;
    static CONTEXT_USAGE_TARGETED_TIMEOUT_MS = 2_000;
    static CONTEXT_USAGE_LIST_TIMEOUT_MS = 5_000;
    static GATEWAY_RPC_DEGRADED_MS = 30_000;
    static SESSION_MODEL_PATCH_CONFIRMED_TTL_MS = 10 * 60_000;
    static SESSION_PATCH_TIMEOUT_MS = 30_000;
    // Pre-send model sync tolerates slow gateways (cold start / process stalls
    // of 35-107s observed in the field); the patch is idempotent and the
    // gateway recovers on its own, so waiting beats dropping the message.
    static SESSION_PATCH_SEND_TIMEOUT_MS = 90_000;
    static SESSION_PATCH_SLOW_LOG_MS = 5_000;
    emitSessionStatus(sessionId, status) {
        this.emit('sessionStatus', sessionId, status);
    }
    emitContextMaintenance(sessionId, active) {
        console.log(`[EngineRuntime] context maintenance ${active ? 'started' : 'ended'} for session ${sessionId}.`);
        this.emit('contextMaintenance', sessionId, active);
    }
    refreshContinuityCapsule(sessionId, source, options = {}) {
        try {
            if (typeof this.store.getSession !== 'function'
                || typeof this.store.getContinuityCapsule !== 'function'
                || typeof this.store.upsertContinuityCapsule !== 'function') {
                return;
            }
            const session = this.store.getSession(sessionId);
            if (!session) {
                console.debug(`[CoworkContinuityCapsule] skipped refresh because session ${sessionId} was not found.`);
                return;
            }
            const previous = this.store.getContinuityCapsule(sessionId);
            const capsule = (0, coworkContinuityCapsule_1.buildCoworkContinuityCapsule)({
                sessionId,
                messages: session.messages,
                previous,
                source,
                ...(options.sourceMessageId ? { sourceMessageId: options.sourceMessageId } : {}),
                ...(options.compactedAt ? { compactedAt: options.compactedAt } : {}),
            });
            this.store.upsertContinuityCapsule(sessionId, capsule);
            const logMessage = [
                `[CoworkContinuityCapsule] refreshed capsule for session ${sessionId}.`,
                `Source ${source}.`,
                `Revision ${capsule.revision}.`,
                `Touched files ${capsule.touchedFiles.length}.`,
                `Next steps ${capsule.nextSteps.length}.`,
            ];
            if (source === coworkContinuityCapsule_1.ContinuityCapsuleSource.PreCompaction || source === coworkContinuityCapsule_1.ContinuityCapsuleSource.PostCompaction) {
                console.log(...logMessage);
            }
            else {
                console.debug(...logMessage);
            }
        }
        catch (error) {
            console.warn(`[CoworkContinuityCapsule] failed to refresh capsule for session ${sessionId}:`, error);
        }
    }
    buildContinuityCapsuleBridge(sessionId) {
        try {
            if (typeof this.store.getContinuityCapsule !== 'function') {
                return '';
            }
            const capsule = this.store.getContinuityCapsule(sessionId);
            if (!capsule?.lastCompactedAt) {
                return '';
            }
            const shouldInjectFullBridge = this.continuityFullBridgeCompactedAtBySession.get(sessionId) !== capsule.lastCompactedAt;
            const bridge = shouldInjectFullBridge
                ? (0, coworkContinuityCapsule_1.formatCoworkContinuityCapsuleBridge)(capsule)
                : (0, coworkContinuityCapsule_1.formatCoworkMiniContinuityCapsuleBridge)(capsule);
            if (!bridge.trim()) {
                return '';
            }
            if (shouldInjectFullBridge) {
                this.continuityFullBridgeCompactedAtBySession.set(sessionId, capsule.lastCompactedAt);
            }
            console.debug(`[CoworkContinuityCapsule] injected capsule bridge for session ${sessionId}.`, `Mode ${shouldInjectFullBridge ? 'full' : 'mini'}.`, `Revision ${capsule.revision}.`, `Bridge length ${bridge.length}.`);
            return bridge;
        }
        catch (error) {
            console.warn(`[CoworkContinuityCapsule] failed to build capsule bridge for session ${sessionId}; continuing without it.`, error);
            return '';
        }
    }
    async buildWorkspaceRehydrationBridge(sessionId) {
        try {
            if (typeof this.store.getSession !== 'function' || typeof this.store.getContinuityCapsule !== 'function') {
                return '';
            }
            const session = this.store.getSession(sessionId);
            const capsule = this.store.getContinuityCapsule(sessionId);
            const compactedAt = capsule?.lastCompactedAt;
            if (!compactedAt || this.workspaceRehydrationBridgeCompactedAtBySession.get(sessionId) === compactedAt) {
                return '';
            }
            const bridge = await (0, coworkWorkspaceRehydration_1.buildCoworkWorkspaceRehydrationBridge)({
                sessionId,
                cwd: session?.cwd,
                capsule,
            });
            this.workspaceRehydrationBridgeCompactedAtBySession.set(sessionId, compactedAt);
            if (!bridge.trim()) {
                return '';
            }
            console.debug(`[CoworkWorkspaceRehydration] injected workspace bridge for session ${sessionId}.`, `Bridge length ${bridge.length}.`);
            return bridge;
        }
        catch (error) {
            console.warn(`[CoworkWorkspaceRehydration] failed to build workspace bridge for session ${sessionId}; continuing without it.`, error);
            return '';
        }
    }
    buildTopKEvidenceBridge(sessionId, prompt) {
        try {
            if (typeof this.store.getSession !== 'function' || typeof this.store.getContinuityCapsule !== 'function') {
                return '';
            }
            const session = this.store.getSession(sessionId, 300);
            const capsule = this.store.getContinuityCapsule(sessionId);
            if (!session || !capsule?.lastCompactedAt) {
                return '';
            }
            const result = (0, coworkTopKEvidence_1.buildCoworkTopKEvidenceBridgeResult)({
                sessionId,
                messages: session.messages,
                prompt,
                capsule,
            });
            const bridge = result.bridge;
            if (!bridge.trim()) {
                return '';
            }
            console.debug(`[CoworkTopKEvidence] injected retrieved evidence bridge for session ${sessionId}.`, `Candidates ${result.diagnostics.candidateCount}.`, `Matched ${result.diagnostics.matchedCount}.`, `Injected ${result.diagnostics.injectedCount}.`, `Bridge length ${result.diagnostics.bridgeLength}.`);
            return bridge;
        }
        catch (error) {
            console.warn(`[CoworkTopKEvidence] failed to build evidence bridge for session ${sessionId}; continuing without it.`, error);
            return '';
        }
    }
    isWaitingForRecoverableFollowup(turn) {
        return Boolean(turn.hasContextMaintenanceTool
            || turn.hasContextCompactionEvent
            || turn.pendingRecoverableFollowup
            || turn.pendingOpenClawRetry
            || turn.pendingVisibleFinalContinuation
            || turn.finalCompletionFlushOnLifecycleEnd === false);
    }
    clearContextMaintenanceState(sessionId, turn, reason) {
        const wasActive = this.isWaitingForRecoverableFollowup(turn);
        turn.hasContextMaintenanceTool = false;
        turn.hasContextCompactionEvent = false;
        turn.pendingRecoverableFollowup = false;
        turn.pendingOpenClawRetry = false;
        turn.pendingVisibleFinalContinuation = false;
        turn.pendingThinkingOnlyHint = false;
        if (wasActive) {
            this.emitContextMaintenance(sessionId, false);
            console.debug(`[EngineRuntime] context maintenance ended because ${reason}.`);
        }
    }
    getLocalTurnToolWork(sessionId) {
        const session = this.store.getSession(sessionId);
        if (!session) {
            return { hasToolWork: false, toolResultChars: 0 };
        }
        let lastUserIdx = -1;
        for (let i = session.messages.length - 1; i >= 0; i--) {
            if (session.messages[i].type === 'user') {
                lastUserIdx = i;
                break;
            }
        }
        const startIdx = lastUserIdx >= 0 ? lastUserIdx + 1 : 0;
        let hasToolWork = false;
        let toolResultChars = 0;
        for (let i = startIdx; i < session.messages.length; i++) {
            const message = session.messages[i];
            if (message.type === 'tool_use') {
                hasToolWork = true;
                continue;
            }
            if (message.type === 'tool_result') {
                hasToolWork = true;
                toolResultChars += message.content.length;
            }
        }
        return { hasToolWork, toolResultChars };
    }
    hasTurnToolWork(sessionId, turn) {
        return turn.toolUseMessageIdByToolCallId.size > 0
            || turn.toolResultMessageIdByToolCallId.size > 0
            || turn.toolResultTextByToolCallId.size > 0
            || turn.lastHistoryHadToolWork === true
            || this.getLocalTurnToolWork(sessionId).hasToolWork;
    }
    getTurnToolResultCharCount(sessionId, turn) {
        let total = 0;
        for (const text of turn.toolResultTextByToolCallId.values()) {
            total += text.length;
        }
        const localToolWork = this.getLocalTurnToolWork(sessionId);
        total = Math.max(total, localToolWork.toolResultChars);
        total = Math.max(total, turn.lastHistoryToolResultCharCount ?? 0);
        return total;
    }
    shouldWaitForVisibleFinalContinuation(sessionId, turn, finalText, options = {}) {
        const visibleText = finalText.trim();
        const toolResultChars = this.getTurnToolResultCharCount(sessionId, turn);
        const hasToolWork = this.hasTurnToolWork(sessionId, turn);
        if (!visibleText || !hasToolWork) {
            return {
                wait: false,
                reason: 'not a visible tool final risk',
                toolResultChars,
                graceMs: OpenClawRuntimeAdapter.CHAT_FINAL_COMPLETION_GRACE_MS,
            };
        }
        const hasMaintenanceSignal = Boolean(turn.hasContextCompactionEvent
            || turn.hasContextMaintenanceTool
            || turn.pendingRecoverableFollowup
            || turn.pendingOpenClawRetry
            || turn.pendingVisibleFinalContinuation);
        if (hasMaintenanceSignal) {
            return {
                wait: true,
                reason: 'context maintenance signal is active',
                toolResultChars,
                graceMs: OpenClawRuntimeAdapter.VISIBLE_FINAL_CONTINUATION_GRACE_MS,
            };
        }
        if (options.forceForEmptyFinal) {
            return {
                wait: true,
                reason: 'empty final recovered short history text after tool work',
                toolResultChars,
                graceMs: OpenClawRuntimeAdapter.VISIBLE_FINAL_CONTINUATION_GRACE_MS,
            };
        }
        const isShortVisibleFinal = visibleText.length <= OpenClawRuntimeAdapter.VISIBLE_FINAL_SHORT_TEXT_CHAR_THRESHOLD;
        const hasLargeToolResults = toolResultChars >= OpenClawRuntimeAdapter.VISIBLE_FINAL_TOOL_RESULT_CHAR_THRESHOLD;
        if (isShortVisibleFinal && hasLargeToolResults) {
            return {
                wait: true,
                reason: 'short visible final followed large tool results',
                toolResultChars,
                graceMs: OpenClawRuntimeAdapter.VISIBLE_FINAL_LARGE_TOOL_CONFIRMATION_GRACE_MS,
            };
        }
        return {
            wait: false,
            reason: 'visible final does not look recoverable',
            toolResultChars,
            graceMs: OpenClawRuntimeAdapter.CHAT_FINAL_COMPLETION_GRACE_MS,
        };
    }
    shouldWaitForLifecycleFallbackContinuation(sessionId, turn) {
        const toolResultChars = this.getTurnToolResultCharCount(sessionId, turn);
        if (!this.hasTurnToolWork(sessionId, turn)) {
            return {
                wait: false,
                reason: 'fallback turn has no tool work',
                graceMs: OpenClawRuntimeAdapter.CHAT_FINAL_COMPLETION_GRACE_MS,
                toolResultChars,
                visibleTextLen: 0,
            };
        }
        const visibleText = (turn.currentAssistantSegmentText.trim() || turn.currentText.trim());
        if (!visibleText) {
            return {
                wait: true,
                reason: 'missing chat.final after tool work',
                graceMs: OpenClawRuntimeAdapter.SILENT_MAINTENANCE_FOLLOWUP_GRACE_MS,
                pendingThinkingOnlyHint: true,
                toolResultChars,
                visibleTextLen: 0,
            };
        }
        const visibleRisk = this.shouldWaitForVisibleFinalContinuation(sessionId, turn, visibleText);
        if (visibleRisk.wait) {
            return {
                wait: true,
                reason: `missing chat.final lifecycle fallback: ${visibleRisk.reason}`,
                graceMs: visibleRisk.graceMs,
                pendingVisibleFinalContinuation: true,
                toolResultChars: visibleRisk.toolResultChars,
                visibleTextLen: visibleText.length,
            };
        }
        return {
            wait: false,
            reason: visibleRisk.reason,
            graceMs: OpenClawRuntimeAdapter.CHAT_FINAL_COMPLETION_GRACE_MS,
            toolResultChars: visibleRisk.toolResultChars,
            visibleTextLen: visibleText.length,
        };
    }
    waitForRecoverableOpenClawRetry(sessionId, turn, runId, options) {
        if (this.activeTurns.get(sessionId) !== turn || turn.stopRequested) {
            console.debug('[EngineRuntime] skipped recoverable follow-up wait for stale turn.', `sessionId=${sessionId}`, `runId=${runId}`, `reason=${options.reason}`);
            return;
        }
        turn.pendingRecoverableFollowup = true;
        turn.pendingOpenClawRetry = true;
        turn.lastRecoverableFinalAtMs = Date.now();
        if (options.pendingThinkingOnlyHint) {
            turn.pendingThinkingOnlyHint = true;
        }
        if (options.pendingVisibleFinalContinuation) {
            turn.pendingVisibleFinalContinuation = true;
        }
        this.store.updateSession(sessionId, { status: 'running' });
        this.emitSessionStatus(sessionId, 'running');
        this.emitContextMaintenance(sessionId, true);
        this.deferChatFinalCompletion(sessionId, turn, runId, {
            graceMs: options.graceMs,
            flushOnLifecycleEnd: false,
            allowLateContinuation: true,
        });
        console.debug('[EngineRuntime] delayed chat.final while waiting for OpenClaw retry.', `sessionId=${sessionId}`, `runId=${runId}`, `reason=${options.reason}`);
    }
    readNumber(record, keys) {
        for (const key of keys) {
            const value = record[key];
            if (typeof value === 'number' && Number.isFinite(value)) {
                return value;
            }
        }
        return undefined;
    }
    getErrorMessage(error) {
        return error instanceof Error ? error.message : String(error);
    }
    isGatewayRequestTimeout(error, method) {
        const message = this.getErrorMessage(error);
        if (method) {
            return new RegExp(`gateway request timeout for ${method.replace('.', '\\.')}`, 'i').test(message);
        }
        return /gateway request timeout for /i.test(message);
    }
    isGatewayRpcDegraded(now = Date.now()) {
        if (this.gatewayRpcHealth.degradedUntil <= now) {
            return false;
        }
        return true;
    }
    markGatewayRpcTimeout(method, error) {
        const now = Date.now();
        const consecutiveTimeouts = this.gatewayRpcHealth.consecutiveTimeouts + 1;
        this.gatewayRpcHealth = {
            degradedUntil: now + OpenClawRuntimeAdapter.GATEWAY_RPC_DEGRADED_MS,
            consecutiveTimeouts,
            lastTimeoutMethod: method,
            lastTimeoutAt: now,
        };
        console.warn(`[EngineRuntime] gateway RPC timed out for ${method}; session RPCs are degraded for ${OpenClawRuntimeAdapter.GATEWAY_RPC_DEGRADED_MS}ms:`, error);
    }
    markGatewayRpcSuccess() {
        if (this.gatewayRpcHealth.consecutiveTimeouts === 0 && this.gatewayRpcHealth.degradedUntil <= Date.now()) {
            return;
        }
        this.gatewayRpcHealth = {
            degradedUntil: 0,
            consecutiveTimeouts: 0,
        };
    }
    recordGatewayRpcFailure(method, error) {
        if (this.isGatewayRequestTimeout(error, method)) {
            this.markGatewayRpcTimeout(method, error);
        }
    }
    async requestSessionPatchWithProfile(options) {
        const { sessionId, sessionKey, patch, source, reason } = options;
        const timeoutMs = options.timeoutMs ?? OpenClawRuntimeAdapter.SESSION_PATCH_TIMEOUT_MS;
        const patchKeys = Object.entries(patch)
            .filter(([, value]) => value !== undefined)
            .map(([key]) => key);
        const model = typeof patch.model === 'string' && patch.model ? patch.model : '-';
        const startedAtMs = Date.now();
        console.debug('[EngineRuntime] sessions.patch started.', `Session ${sessionId}.`, `OpenClaw key ${sessionKey}.`, `Reason ${reason}.`, `Source ${source}.`, `Patch fields ${patchKeys.join(',') || 'none'}.`, `Model ${model}.`, `Timeout ${timeoutMs}ms.`);
        let response;
        try {
            const client = this.requireGatewayClient();
            response = await client.request('sessions.patch', {
                key: sessionKey,
                ...patch,
            }, { timeoutMs });
        }
        catch (error) {
            const elapsedMs = Date.now() - startedAtMs;
            console.warn(`[EngineRuntime] sessions.patch failed after ${elapsedMs}ms.`, `Session ${sessionId}.`, `OpenClaw key ${sessionKey}.`, `Reason ${reason}.`, `Source ${source}.`, `Patch fields ${patchKeys.join(',') || 'none'}.`, `Model ${model}.`, `Timeout ${timeoutMs}ms.`, error);
            throw error;
        }
        const elapsedMs = Date.now() - startedAtMs;
        const message = elapsedMs >= OpenClawRuntimeAdapter.SESSION_PATCH_SLOW_LOG_MS
            ? `[EngineRuntime] sessions.patch completed slowly in ${elapsedMs}ms.`
            : `[EngineRuntime] sessions.patch completed in ${elapsedMs}ms.`;
        const details = [
            `Session ${sessionId}.`,
            `OpenClaw key ${sessionKey}.`,
            `Reason ${reason}.`,
            `Source ${source}.`,
            `Patch fields ${patchKeys.join(',') || 'none'}.`,
            `Model ${model}.`,
            `Timeout ${timeoutMs}ms.`,
        ];
        if (elapsedMs >= OpenClawRuntimeAdapter.SESSION_PATCH_SLOW_LOG_MS) {
            console.warn(message, ...details);
        }
        else {
            console.debug(message, ...details);
        }
        return response;
    }
    resetGatewayRpcHealth() {
        this.gatewayRpcHealth = {
            degradedUntil: 0,
            consecutiveTimeouts: 0,
        };
    }
    getConfirmedSessionModelPatch(sessionId, sessionKey, model, source) {
        const state = this.sessionModelPatchStateBySession.get(sessionId);
        if (!state)
            return null;
        if (state.model !== model || state.sessionKey !== sessionKey || state.source !== source) {
            return null;
        }
        if (Date.now() - state.confirmedAt > OpenClawRuntimeAdapter.SESSION_MODEL_PATCH_CONFIRMED_TTL_MS) {
            this.sessionModelPatchStateBySession.delete(sessionId);
            return null;
        }
        return state;
    }
    rememberSessionModelPatch(sessionId, sessionKey, model, source) {
        this.sessionModelPatchStateBySession.set(sessionId, {
            model,
            sessionKey,
            source,
            confirmedAt: Date.now(),
        });
    }
    resolveContextUsageStatus(percent) {
        if (percent === undefined)
            return 'unknown';
        if (percent >= 90)
            return 'danger';
        if (percent >= 70)
            return 'warning';
        return 'normal';
    }
    async listGatewaySessionsForUsage(options = {}) {
        const client = this.gatewayClient;
        if (!client)
            return [];
        if (this.isGatewayRpcDegraded()) {
            console.debug('[EngineRuntime] skipped context usage session lookup because gateway session RPCs are degraded.');
            return [];
        }
        const params = {
            limit: options.limit ?? OpenClawRuntimeAdapter.CONTEXT_USAGE_LIST_LIMIT,
        };
        if (typeof options.activeMinutes === 'number') {
            params.activeMinutes = options.activeMinutes;
        }
        if (options.search?.trim()) {
            params.search = options.search.trim();
        }
        const timeoutMs = options.timeoutMs ?? OpenClawRuntimeAdapter.CONTEXT_USAGE_LIST_TIMEOUT_MS;
        const inFlightKey = JSON.stringify({ ...params, timeoutMs });
        const existing = this.contextUsageListInFlight.get(inFlightKey);
        if (existing) {
            return existing;
        }
        let request;
        request = client.request('sessions.list', {
            ...params,
        }, { timeoutMs })
            .then((result) => {
            this.markGatewayRpcSuccess();
            const sessions = result?.sessions;
            return Array.isArray(sessions)
                ? sessions.filter(isRecord)
                : [];
        })
            .catch((error) => {
            this.recordGatewayRpcFailure('sessions.list', error);
            throw error;
        })
            .finally(() => {
            if (this.contextUsageListInFlight.get(inFlightKey) === request) {
                this.contextUsageListInFlight.delete(inFlightKey);
            }
        });
        this.contextUsageListInFlight.set(inFlightKey, request);
        return request;
    }
    buildContextUsageFromSessionRow(sessionId, row) {
        const sessionKey = typeof row.key === 'string' ? row.key : undefined;
        const contextTokens = this.readNumber(row, ['contextTokens', 'contextWindow']);
        const usedTokens = this.readNumber(row, ['totalTokens', 'tokenCount', 'tokens', 'inputTokens']);
        const compactionCount = this.readNumber(row, ['compactionCheckpointCount']);
        const latestCheckpoint = isRecord(row.latestCompactionCheckpoint)
            ? row.latestCompactionCheckpoint
            : undefined;
        const percent = usedTokens !== undefined && contextTokens && contextTokens > 0
            ? Math.min(Math.round((usedTokens / contextTokens) * 100), 100)
            : undefined;
        if (sessionKey && typeof contextTokens === 'number') {
            this.sessionContextTokensCache.set(sessionKey, contextTokens);
        }
        this.syncGoalFromSessionRow(row);
        return {
            sessionId,
            ...(sessionKey ? { sessionKey } : {}),
            ...(usedTokens !== undefined ? { usedTokens } : {}),
            ...(contextTokens !== undefined ? { contextTokens } : {}),
            ...(percent !== undefined ? { percent } : {}),
            ...(compactionCount !== undefined ? { compactionCount } : {}),
            status: this.resolveContextUsageStatus(percent),
            ...(typeof latestCheckpoint?.checkpointId === 'string'
                ? { latestCompactionCheckpointId: latestCheckpoint.checkpointId }
                : {}),
            ...(typeof latestCheckpoint?.reason === 'string'
                ? { latestCompactionReason: latestCheckpoint.reason }
                : {}),
            ...(typeof latestCheckpoint?.createdAt === 'number'
                ? { latestCompactionCreatedAt: latestCheckpoint.createdAt }
                : {}),
            ...(typeof row.model === 'string' ? { model: row.model } : {}),
            updatedAt: Date.now(),
        };
    }
    syncGoalFromSessionRow(row) {
        if (!Object.prototype.hasOwnProperty.call(row, 'goal'))
            return;
        const sessionKey = typeof row.key === 'string' ? row.key.trim() : '';
        if (!sessionKey)
            return;
        const sessionId = this.resolveSessionIdBySessionKey(sessionKey)
            ?? this.resolveLocalSessionIdFromGatewaySessionKey(sessionKey);
        if (!sessionId)
            return;
        const goal = (0, goal_1.normalizeCoworkGoal)(row.goal);
        this.rememberSessionKey(sessionId, sessionKey);
        this.emitGoalUpdateIfChanged(sessionId, goal);
    }
    emitGoalUpdateIfChanged(sessionId, goal) {
        const snapshot = goal ? JSON.stringify(goal) : '';
        if (this.goalSnapshotBySessionId.get(sessionId) === snapshot)
            return;
        this.goalSnapshotBySessionId.set(sessionId, snapshot);
        try {
            this.store.updateSession(sessionId, { goal }, { touchUpdatedAt: false });
        }
        catch (error) {
            console.warn(`[EngineRuntime] failed to persist goal display cache for session ${sessionId}; continuing with streamed update.`, error);
        }
        console.debug(`[EngineRuntime] goal update for session ${sessionId}: status=${goal?.status ?? 'none'}, hasGoal=${goal ? 'yes' : 'no'}.`);
        this.emit('goalUpdate', sessionId, goal);
    }
    addGoalSettingUserMessageFromCommand(sessionId, command) {
        if (!GOAL_BOOTSTRAP_ACTIONS.has(command.action) || !command.text.trim())
            return;
        const goalCommand = `/goal ${command.action} ${command.text.trim()}`;
        const metadata = (0, goalCommandDisplay_1.buildGoalSettingMessageMetadata)(goalCommand);
        const userMessage = this.store.addMessage(sessionId, {
            type: 'user',
            content: command.text.trim(),
            ...(metadata ? { metadata } : {}),
        });
        this.refreshContinuityCapsule(sessionId, coworkContinuityCapsule_1.ContinuityCapsuleSource.UserMessage, {
            sourceMessageId: userMessage.id,
        });
        console.debug('[EngineRuntime] persisted goal setting user message.', `Session ${sessionId}.`, `Action ${command.action}.`);
        this.emit('message', sessionId, userMessage);
    }
    async getContextUsage(sessionId) {
        const existing = this.contextUsageInFlightBySession.get(sessionId);
        if (existing) {
            return existing;
        }
        let request;
        request = this.resolveContextUsage(sessionId).finally(() => {
            if (this.contextUsageInFlightBySession.get(sessionId) === request) {
                this.contextUsageInFlightBySession.delete(sessionId);
            }
        });
        this.contextUsageInFlightBySession.set(sessionId, request);
        return request;
    }
    async resolveContextUsage(sessionId) {
        const interactiveSessionKey = this.resolveInteractiveSessionKey(sessionId);
        if (!interactiveSessionKey)
            return null;
        const session = this.store.getSession(sessionId);
        const isIdleScheduledSession = Boolean(session?.scheduledTaskId?.trim() && !this.activeTurns.has(sessionId));
        const keys = isIdleScheduledSession
            ? [interactiveSessionKey]
            : [
                interactiveSessionKey,
                ...this.getSessionKeysForSession(sessionId)
                    .filter((key) => key !== interactiveSessionKey),
            ];
        const startedAt = Date.now();
        for (const key of keys) {
            try {
                const rows = await this.listGatewaySessionsForUsage({
                    search: key,
                    limit: 5,
                    timeoutMs: OpenClawRuntimeAdapter.CONTEXT_USAGE_TARGETED_TIMEOUT_MS,
                });
                const row = rows.find(item => item.key === key);
                if (row) {
                    console.log(`[EngineRuntime] context usage was resolved by targeted lookup for session ${sessionId} in ${Date.now() - startedAt}ms.`);
                    return this.buildContextUsageFromSessionRow(sessionId, row);
                }
            }
            catch (error) {
                console.warn(`[EngineRuntime] context usage lookup failed for session ${sessionId}; returning no usage.`, error);
                return null;
            }
        }
        console.debug(`[EngineRuntime] context usage was unavailable for session ${sessionId} after ${Date.now() - startedAt}ms.`);
        return null;
    }
    async compactContext(sessionId) {
        const client = this.requireGatewayClient();
        const sessionKey = this.resolveInteractiveSessionKey(sessionId);
        if (!sessionKey) {
            throw new Error(`Session ${sessionId} has no engine session key.`);
        }
        console.log(`[EngineRuntime] starting manual context compaction for session ${sessionId}.`);
        this.refreshContinuityCapsule(sessionId, coworkContinuityCapsule_1.ContinuityCapsuleSource.PreCompaction);
        const result = await client.request('sessions.compact', {
            key: sessionKey,
        }, { timeoutMs: 120_000 });
        const compacted = result?.compacted === true;
        const reason = typeof result?.reason === 'string' ? result.reason : undefined;
        const usage = await this.getContextUsage(sessionId);
        console.log(`[EngineRuntime] manual context compaction finished for session ${sessionId}, compacted=${compacted}, reason=${reason ?? 'none'}.`);
        if (compacted) {
            this.refreshContinuityCapsule(sessionId, coworkContinuityCapsule_1.ContinuityCapsuleSource.PostCompaction, {
                compactedAt: Date.now(),
            });
        }
        void this.logContextCompactionDiagnostic({
            sessionId,
            sessionKey,
            mode: 'manual',
            ...(reason ? { reason } : {}),
            compacted,
        });
        return { compacted, ...(reason ? { reason } : {}), usage };
    }
    async lookupLatestCompactionCheckpoint(client, sessionKey, options = {}) {
        const listResult = await client.request('sessions.compaction.list', { key: sessionKey }, { timeoutMs: 3_000 });
        const checkpoints = Array.isArray(listResult)
            ? listResult
            : Array.isArray(listResult?.checkpoints)
                ? listResult.checkpoints
                : [];
        const eligibleCheckpoints = typeof options.beforeCreatedAt === 'number'
            ? checkpoints.filter((checkpoint) => (typeof checkpoint.createdAt === 'number' && checkpoint.createdAt <= options.beforeCreatedAt))
            : checkpoints;
        const viableCheckpoints = eligibleCheckpoints
            .filter((checkpoint) => (typeof checkpoint?.summary === 'string'
            || typeof checkpoint?.checkpointId === 'string'
            || typeof checkpoint?.createdAt === 'number'))
            .sort((left, right) => (right.createdAt ?? 0) - (left.createdAt ?? 0));
        const latest = options.preferSummary
            ? viableCheckpoints.find((checkpoint) => checkpoint.summary?.trim()) ?? viableCheckpoints[0]
            : viableCheckpoints[0];
        if (!latest) {
            return null;
        }
        if (!latest.summary?.trim() && latest.checkpointId) {
            const checkpoint = await client.request('sessions.compaction.get', { key: sessionKey, checkpointId: latest.checkpointId }, { timeoutMs: 3_000 });
            return {
                ...latest,
                ...checkpoint,
                checkpointId: checkpoint.checkpointId ?? latest.checkpointId,
                createdAt: checkpoint.createdAt ?? latest.createdAt,
            };
        }
        return latest;
    }
    recordContextCompactionDiagnostic(diagnostic) {
        console.log(`[EngineRuntime] recorded safe context compaction diagnostic for session ${diagnostic.sessionId}: `
            + `mode ${diagnostic.mode}, compacted ${diagnostic.compacted ?? 'unknown'}, `
            + `reason ${diagnostic.reason ?? 'none'}, checkpoint ${diagnostic.checkpointId ?? 'none'}, `
            + `created at ${diagnostic.checkpointCreatedAt ?? 'unknown'}, `
            + `summary length ${diagnostic.summaryChars ?? 0} characters, `
            + `has summary ${diagnostic.hasSummary}, `
            + `tokens ${diagnostic.tokensBefore ?? 'unknown'} to ${diagnostic.tokensAfter ?? 'unknown'}.`);
    }
    async logContextCompactionDiagnostic(input) {
        const sessionKey = input.sessionKey ?? this.resolveInteractiveSessionKey(input.sessionId);
        if (!sessionKey) {
            console.warn(`[EngineRuntime] skipped context compaction diagnostic for session ${input.sessionId} because no OpenClaw session key was available.`);
            return;
        }
        if (input.compacted === false) {
            this.recordContextCompactionDiagnostic({
                sessionId: input.sessionId,
                sessionKey,
                mode: input.mode,
                ...(input.reason ? { reason: input.reason } : {}),
                summaryChars: 0,
                hasSummary: false,
                compacted: false,
                updatedAt: Date.now(),
            });
            return;
        }
        const client = this.gatewayClient;
        if (!client) {
            console.debug(`[EngineRuntime] skipped context compaction diagnostic for session ${input.sessionId} because the gateway client is unavailable.`);
            return;
        }
        try {
            const checkpoint = await this.lookupLatestCompactionCheckpoint(client, sessionKey);
            const summary = typeof checkpoint?.summary === 'string' ? checkpoint.summary.trim() : '';
            this.recordContextCompactionDiagnostic({
                sessionId: input.sessionId,
                sessionKey,
                mode: input.mode,
                reason: input.reason ?? checkpoint?.reason,
                checkpointId: checkpoint?.checkpointId,
                checkpointCreatedAt: checkpoint?.createdAt,
                tokensBefore: checkpoint?.tokensBefore,
                tokensAfter: checkpoint?.tokensAfter,
                summaryChars: summary.length,
                hasSummary: summary.length > 0,
                compacted: input.compacted,
                updatedAt: Date.now(),
            });
        }
        catch (error) {
            console.warn(`[EngineRuntime] context compaction diagnostic lookup failed for session ${input.sessionId}; continuing without checkpoint metadata.`, error);
        }
    }
    async getForkCompactionSummary(sessionId, beforeCreatedAt) {
        const client = this.gatewayClient;
        if (!client) {
            console.debug(`[EngineRuntime] skipped fork compaction lookup for session ${sessionId} because the gateway client is unavailable.`);
            return null;
        }
        for (const sessionKey of this.getSessionKeysForSession(sessionId)) {
            try {
                const checkpoint = await this.lookupLatestCompactionCheckpoint(client, sessionKey, {
                    beforeCreatedAt,
                    preferSummary: true,
                });
                if (!checkpoint) {
                    continue;
                }
                const summary = checkpoint.summary?.trim();
                if (!summary) {
                    continue;
                }
                const truncated = summary.length > FORK_COMPACTION_SUMMARY_MAX_CHARS;
                console.log(`[EngineRuntime] found a compaction checkpoint for forked session ${sessionId}.`);
                return {
                    summary: truncated ? summary.slice(0, FORK_COMPACTION_SUMMARY_MAX_CHARS) : summary,
                    sessionKey,
                    ...(checkpoint.checkpointId ? { checkpointId: checkpoint.checkpointId } : {}),
                    ...(checkpoint.reason ? { reason: checkpoint.reason } : {}),
                    ...(typeof checkpoint.createdAt === 'number' ? { createdAt: checkpoint.createdAt } : {}),
                    ...(typeof checkpoint.tokensBefore === 'number' ? { tokensBefore: checkpoint.tokensBefore } : {}),
                    ...(typeof checkpoint.tokensAfter === 'number' ? { tokensAfter: checkpoint.tokensAfter } : {}),
                    ...(truncated ? { truncated } : {}),
                };
            }
            catch (error) {
                console.warn(`[EngineRuntime] fork compaction lookup failed for session ${sessionId}; continuing without a summary.`, error);
                return null;
            }
        }
        console.debug(`[EngineRuntime] no compaction checkpoint was available for forked session ${sessionId}.`);
        return null;
    }
    getContextWindowForModel(modelId) {
        if (!this.contextWindowCacheLoaded) {
            this.contextWindowCacheLoaded = true;
            try {
                const stateDir = this.engineManager.getStateDir();
                for (const agentDir of ['main', 'a']) {
                    const modelsPath = path.join(stateDir, 'agents', agentDir, 'agent', 'models.json');
                    if (!fs.existsSync(modelsPath))
                        continue;
                    const config = JSON.parse(fs.readFileSync(modelsPath, 'utf-8'));
                    if (config?.providers && typeof config.providers === 'object') {
                        for (const provider of Object.values(config.providers)) {
                            if (!Array.isArray(provider?.models))
                                continue;
                            for (const m of provider.models) {
                                if (typeof m?.id === 'string' && typeof m?.contextWindow === 'number') {
                                    this.contextWindowCache.set(m.id, m.contextWindow);
                                }
                            }
                        }
                    }
                }
            }
            catch {
                // non-fatal
            }
        }
        if (this.contextWindowCache.has(modelId))
            return this.contextWindowCache.get(modelId);
        const slashIdx = modelId.indexOf('/');
        if (slashIdx >= 0) {
            const bare = modelId.slice(slashIdx + 1);
            if (this.contextWindowCache.has(bare))
                return this.contextWindowCache.get(bare);
        }
        return undefined;
    }
    async refreshSessionContextTokens(sessionKey) {
        if (this.sessionContextTokensCache.has(sessionKey)) {
            return this.sessionContextTokensCache.get(sessionKey);
        }
        const client = this.gatewayClient;
        if (!client)
            return undefined;
        if (this.isGatewayRpcDegraded()) {
            console.debug('[EngineRuntime] skipped context token refresh because gateway session RPCs are degraded.');
            return undefined;
        }
        try {
            const result = await client.request('sessions.list', {
                activeMinutes: 60, limit: 50,
            }, { timeoutMs: OpenClawRuntimeAdapter.CONTEXT_USAGE_LIST_TIMEOUT_MS });
            this.markGatewayRpcSuccess();
            const sessions = result?.sessions;
            if (Array.isArray(sessions)) {
                for (const row of sessions) {
                    if (isRecord(row)) {
                        const k = typeof row.key === 'string'
                            ? row.key : '';
                        if (k && typeof row.contextTokens === 'number') {
                            this.sessionContextTokensCache.set(k, row.contextTokens);
                        }
                    }
                }
            }
            const resolved = this.sessionContextTokensCache.get(sessionKey);
            console.debug('[EngineRuntime] refreshSessionContextTokens:', sessionKey, resolved ? `contextTokens=${resolved}` : 'not found in sessions.list');
            return resolved;
        }
        catch (error) {
            this.recordGatewayRpcFailure('sessions.list', error);
            console.debug('[EngineRuntime] refreshSessionContextTokens failed:', sessionKey, error);
            return undefined;
        }
    }
    constructor(store, engineManager, options = {}, subagentRunStore, subagentMessageStore) {
        super();
        this.store = store;
        this.engineManager = engineManager;
        this.options = options;
        this.thinkingController = new controller_1.OpenClawThinkingController({
            store: this.store,
            emitMessage: (sessionId, message, beforeMessageId) => {
                this.emit('message', sessionId, message, beforeMessageId);
            },
            emitMessageUpdate: (sessionId, messageId, content, metadata) => {
                this.emit('messageUpdate', sessionId, messageId, content, metadata);
            },
            throttledStoreUpdate: (sessionId, messageId, content, metadata) => {
                this.throttledStoreUpdateMessage(sessionId, messageId, content, metadata);
            },
            throttledEmitMessageUpdate: (sessionId, messageId, content) => {
                this.throttledEmitMessageUpdate(sessionId, messageId, content);
            },
            flushPendingStoreUpdate: (sessionId, messageId) => {
                this.flushPendingStoreUpdate(sessionId, messageId);
            },
            clearPendingMessageUpdate: (messageId) => this.clearPendingMessageUpdate(messageId),
        });
        this.turnHistorySync = new openclawTurnHistorySync_1.OpenClawTurnHistorySync({
            getTurn: (sessionId) => {
                const turn = this.activeTurns.get(sessionId);
                return turn ? { sessionKey: turn.sessionKey, turnToken: turn.turnToken } : undefined;
            },
            requestHistory: async (sessionKey, limit) => {
                const client = this.gatewayClient;
                if (!client)
                    return undefined;
                const history = await client.request('chat.history', {
                    sessionKey,
                    limit,
                }, { timeoutMs: 5_000 });
                return Array.isArray(history?.messages) ? history.messages : undefined;
            },
            handleThinkingHistory: (sessionId, messages) => {
                const turn = this.activeTurns.get(sessionId);
                if (turn)
                    this.thinkingController.reconcile(sessionId, turn, messages, false);
            },
            handleBackfillHistory: (sessionId, messages) => {
                this.handleIncrementalBackfillHistory(sessionId, messages);
            },
        });
        this.approvalController = new openclawApprovalController_1.OpenClawApprovalController({
            getGatewayClient: () => this.gatewayClient,
            resolveSessionId: (sessionKey) => this.resolveApprovalSessionId(sessionKey),
            isSessionInStopCooldown: (sessionId) => this.isSessionInStopCooldown(sessionId),
            isManualStopSuppressed: (sessionId, sessionKey) => (this.manuallyStoppedSessions.has(sessionId) && (0, openclawChannelSessionSync_1.isManagedSessionKey)(sessionKey)),
            emitPermissionRequest: (sessionId, request) => this.emit('permissionRequest', sessionId, request),
            emitPermissionResolved: (sessionId, requestId) => this.emit('permissionResolved', sessionId, requestId),
            emitError: (sessionId, error) => this.emit('error', sessionId, error),
        });
        this.subagentSessionMaterializer = new sessionMaterializer_1.SubagentSessionMaterializer({
            store: this.store,
            rememberSessionKey: (sessionId, sessionKey) => this.rememberSessionKey(sessionId, sessionKey),
            markSessionHistoryUnsynced: (sessionId) => this.fullySyncedSessions.delete(sessionId),
            notifySessionsChanged: (sessionId) => this.notifySessionsChanged(sessionId),
            emitSessionStatus: (sessionId, status) => this.emitSessionStatus(sessionId, status),
            emitComplete: (sessionId, sessionKey) => this.emit('complete', sessionId, sessionKey),
            emitError: (sessionId, error) => this.emit('error', sessionId, error),
            resolveSessionIdBySessionKey: (sessionKey) => this.resolveSessionIdBySessionKey(sessionKey),
            syncSessionHistory: (sessionId, sessionKey) => this.syncSessionHistoryFromGateway(sessionId, sessionKey),
        });
        if (subagentRunStore) {
            this.subagentTracker = new tracker_1.SubagentTracker(subagentRunStore, subagentMessageStore ?? null, () => this.gatewayClient, (params) => this.subagentSessionMaterializer.materialize(params), (params) => this.subagentSessionMaterializer.shouldMaterialize(params));
        }
        else {
            // Fallback: create a no-op tracker (should not happen in production)
            this.subagentTracker = new tracker_1.SubagentTracker(null, null, () => this.gatewayClient);
        }
    }
    normalizeModelRef(modelRef) {
        const normalized = modelRef.trim();
        if (!normalized)
            return normalized;
        return this.options.normalizeModelRef?.(normalized) ?? normalized;
    }
    notifySessionsChanged(sessionIds) {
        const normalizedSessionIds = Array.from(new Set((Array.isArray(sessionIds) ? sessionIds : [sessionIds])
            .map(sessionId => sessionId.trim())
            .filter(Boolean)));
        if (normalizedSessionIds.length === 0)
            return;
        const payload = { sessionIds: normalizedSessionIds };
        for (const win of electron_1.BrowserWindow.getAllWindows()) {
            if (!win.isDestroyed()) {
                win.webContents.send(constants_3.CoworkIpcChannel.SessionsChanged, payload);
            }
        }
    }
    resolveAgentDefaultModelRef(session) {
        const agent = this.store.getAgent(session.agentId || 'main');
        const rawModel = agent?.model?.trim() ?? '';
        return rawModel ? this.normalizeModelRef(rawModel) : '';
    }
    notifySessionModelOverrideChanged(sessionId, modelOverride) {
        for (const win of electron_1.BrowserWindow.getAllWindows()) {
            if (!win.isDestroyed()) {
                win.webContents.send(constants_3.CoworkIpcChannel.SessionModelOverrideChanged, {
                    sessionId,
                    modelOverride,
                });
            }
        }
    }
    syncChannelSessionModelOverride(options) {
        const { coworkSessionId, openClawSessionKey, state } = options;
        if (!state)
            return false;
        const session = this.store.getSession(coworkSessionId);
        if (!session)
            return false;
        const normalizedModelRef = state.modelRef ? this.normalizeModelRef(state.modelRef) : '';
        const agentDefaultModel = this.resolveAgentDefaultModelRef(session);
        const nextModelOverride = normalizedModelRef && (state.explicitOverride || normalizedModelRef !== agentDefaultModel)
            ? normalizedModelRef
            : '';
        if ((session.modelOverride || '') === nextModelOverride) {
            if (nextModelOverride) {
                this.rememberSessionModelPatch(coworkSessionId, openClawSessionKey, nextModelOverride, SessionModelPatchSource.SessionOverride);
            }
            return false;
        }
        this.store.updateSession(coworkSessionId, { modelOverride: nextModelOverride }, { touchUpdatedAt: false });
        if (nextModelOverride) {
            this.rememberSessionModelPatch(coworkSessionId, openClawSessionKey, nextModelOverride, SessionModelPatchSource.SessionOverride);
        }
        else {
            this.sessionModelPatchStateBySession.delete(coworkSessionId);
        }
        console.log('[ChannelSync] synced channel session model override.', `Session ${coworkSessionId}.`, `OpenClaw key ${openClawSessionKey}.`, `Source ${state.source}.`, `Model ${nextModelOverride || 'agent/default'}.`);
        this.notifySessionModelOverrideChanged(coworkSessionId, nextModelOverride);
        return true;
    }
    syncChannelSessionRunStatus(options) {
        const { coworkSessionId, openClawSessionKey, row } = options;
        const session = this.store.getSession(coworkSessionId);
        if (!session)
            return false;
        const rawStatus = typeof row.status === 'string' ? row.status.trim().toLowerCase() : '';
        const terminalStatus = (0, channelSessionRunStatus_1.resolveChannelSessionTerminalStatus)(rawStatus);
        // A native IM run is announced by `sessions.changed`, but does not appear
        // in OpenClaw's chat-specific `hasActiveRun` tracker. Keep that explicit
        // lifecycle signal authoritative while it is fresh; otherwise the 10s
        // polling fallback would turn the loading state off mid-run. A persisted
        // terminal row still wins if the matching terminal event was dropped.
        if (this.getFreshChannelLifecycleRun(openClawSessionKey) && !terminalStatus) {
            return false;
        }
        if (terminalStatus) {
            this.channelLifecycleRunBySessionKey.delete(openClawSessionKey);
        }
        const hasActiveRun = row.hasActiveRun === true
            ? true
            : row.hasActiveRun === false
                ? false
                : null;
        const nextStatus = (0, channelSessionRunStatus_1.resolveChannelSessionNextStatus)({
            hasActiveRun,
            rawStatus,
            currentStatus: session.status,
        });
        if (!nextStatus || session.status === nextStatus)
            return false;
        if (nextStatus !== 'running' && this.activeTurns.has(coworkSessionId)) {
            return false;
        }
        this.store.updateSession(coworkSessionId, { status: nextStatus });
        console.log('[ChannelSync] synced channel session run status.', `Session ${coworkSessionId}.`, `OpenClaw key ${openClawSessionKey}.`, `Status ${session.status} -> ${nextStatus}.`, `Active run ${hasActiveRun === null ? 'unknown' : String(hasActiveRun)}.`);
        this.emitSessionStatus(coworkSessionId, nextStatus);
        return true;
    }
    getFreshChannelLifecycleRun(sessionKey) {
        const activeRun = this.channelLifecycleRunBySessionKey.get(sessionKey);
        if (!activeRun)
            return null;
        const configuredTimeoutMs = Number.isFinite(this.agentTimeoutSeconds)
            ? Math.max(1, this.agentTimeoutSeconds) * 1_000
            : openclawConfigSync_1.OPENCLAW_AGENT_TIMEOUT_SECONDS * 1_000;
        const maxAgeMs = configuredTimeoutMs + OpenClawRuntimeAdapter.CHANNEL_LIFECYCLE_RUN_GRACE_MS;
        if (Date.now() - activeRun.observedAtMs <= maxAgeMs) {
            return activeRun;
        }
        this.channelLifecycleRunBySessionKey.delete(sessionKey);
        console.warn('[ChannelSync] discarded stale IM lifecycle run marker.', `SessionKey ${sessionKey}.`, `Run ${activeRun.runId || 'unknown'}.`);
        return null;
    }
    pruneStaleChannelLifecycleRuns() {
        for (const sessionKey of this.channelLifecycleRunBySessionKey.keys()) {
            this.getFreshChannelLifecycleRun(sessionKey);
        }
    }
    setChannelSessionSync(sync) {
        this.channelSessionSync = sync;
    }
    clearChannelSessionCache() {
        if (!this.channelSessionSync) {
            return;
        }
        this.channelSessionSync.clearCache();
        this.channelLifecycleRunBySessionKey.clear();
        for (const [sessionKey] of this.sessionIdBySessionKey.entries()) {
            if (this.channelSessionSync.isChannelSessionKey(sessionKey)) {
                this.sessionIdBySessionKey.delete(sessionKey);
            }
        }
        this.latestCronSessionKeyByCacheKey.clear();
        this.gatewayHistoryCountByCronSessionKey.clear();
    }
    /**
     * Fetch session history from OpenClaw by sessionKey and return a transient
     * CoworkSession object (not persisted to local database).
     * First checks if a local session already exists via channel sync.
     * Returns a CoworkSession if successful, or null.
     */
    async fetchSessionByKey(sessionKey, options) {
        const managedSession = (0, openclawChannelSessionSync_1.parseManagedSessionKey)(sessionKey);
        if (managedSession) {
            return this.store.getSession(managedSession.sessionId) ?? null;
        }
        // 1. Try existing local session via channel/main-agent resolution
        if (this.channelSessionSync) {
            const existingId = this.channelSessionSync.resolveSession(sessionKey);
            if (existingId) {
                const session = this.store.getSession(existingId);
                if (session && session.messages.length > 0) {
                    return session;
                }
            }
        }
        // 2. Fetch history from OpenClaw server and build a transient session object
        const client = this.gatewayClient;
        if (!client) {
            return (await this.readFromTranscript(sessionKey, options?.sessionId)
                ?? await this.readFromDeletedTranscript(sessionKey, options?.sessionId));
        }
        try {
            const history = await client.request('chat.history', {
                sessionKey,
                limit: OpenClawRuntimeAdapter.FULL_HISTORY_SYNC_LIMIT,
            }, { timeoutMs: 10_000 });
            if (!Array.isArray(history?.messages) || history.messages.length === 0) {
                return (await this.readFromTranscript(sessionKey, options?.sessionId)
                    ?? await this.readFromDeletedTranscript(sessionKey, options?.sessionId));
            }
            const now = Date.now();
            const messages = [];
            let msgIndex = 0;
            for (const entry of (0, openclawHistory_1.extractGatewayHistoryEntries)(history.messages)) {
                const mediaMetadata = entry.role === 'user' ? (0, openclawConversationReconciliation_1.buildGatewayMediaMetadata)(entry) : undefined;
                messages.push({
                    id: `transient-${msgIndex++}`,
                    type: entry.role,
                    content: entry.text,
                    timestamp: now,
                    metadata: entry.role === 'assistant'
                        ? { isStreaming: false, isFinal: true }
                        : mediaMetadata ?? {},
                });
            }
            if (messages.length === 0)
                return null;
            // Return a transient session (not saved to database)
            return {
                id: `transient-${sessionKey}`,
                title: sessionKey.split(':').pop() || 'Cron Session',
                claudeSessionId: null,
                scheduledTaskId: null,
                status: 'completed',
                pinned: false,
                cwd: '',
                systemPrompt: '',
                modelOverride: '',
                executionMode: 'local',
                activeSkillIds: [],
                messages,
                agentId: 'main',
                createdAt: now,
                updatedAt: now,
                messagesOffset: 0,
                totalMessages: messages.length,
            };
        }
        catch (error) {
            console.error('[EngineRuntime] fetchSessionByKey: failed to fetch history:', error);
            return null;
        }
    }
    /**
     * Fallback for fetchSessionByKey when chat.history returns no messages.
     *
     * openclaw's maintenance logic may archive a session transcript by renaming
     * `{sessionId}.jsonl` → `{sessionId}.jsonl.deleted.{timestamp}` while the
     * session entry remains in sessions.json. In that case chat.history cannot
     * find the file (it only looks for the plain `.jsonl` path) and returns [].
     * This method reads the archived file directly from disk.
     */
    resolveTranscriptSessionId(sessionKey, sessionId) {
        const normalizedSessionId = typeof sessionId === 'string' ? sessionId.trim() : '';
        if (/^[0-9a-f-]{36}$/i.test(normalizedSessionId)) {
            return normalizedSessionId;
        }
        const runMatch = sessionKey.match(/(?:^|:)run:([0-9a-f-]{36})(?:$|:)/i);
        return runMatch?.[1] ?? null;
    }
    async readTranscriptFile(sessionKey, filePath) {
        const content = await fs.promises.readFile(filePath, 'utf-8');
        const lines = content.split(/\r?\n/);
        const messages = [];
        let msgIndex = 0;
        for (const line of lines) {
            if (!line.trim())
                continue;
            try {
                const parsed = JSON.parse(line);
                if (parsed?.type !== 'message' || !parsed.message)
                    continue;
                const msg = parsed.message;
                const role = msg.role;
                if (role !== 'user' && role !== 'assistant')
                    continue;
                const msgContent = msg.content;
                const text = Array.isArray(msgContent)
                    ? msgContent
                        .filter(b => b?.type === 'text')
                        .map(b => b.text)
                        .join('\n')
                    : typeof msgContent === 'string' ? msgContent : '';
                if (!text.trim())
                    continue;
                const timestamp = typeof msg.timestamp === 'number'
                    ? msg.timestamp
                    : typeof parsed.timestamp === 'string' ? Date.parse(parsed.timestamp) : Date.now();
                messages.push({
                    id: `transient-${msgIndex++}`,
                    type: role,
                    content: text,
                    timestamp,
                    metadata: role === 'assistant' ? { isStreaming: false, isFinal: true } : {},
                });
            }
            catch {
                // skip malformed lines
            }
        }
        if (messages.length === 0)
            return null;
        const firstTimestamp = messages[0]?.timestamp ?? Date.now();
        return {
            id: `transient-${sessionKey}`,
            agentId: '',
            title: sessionKey.split(':').pop() || 'Cron Session',
            claudeSessionId: null,
            scheduledTaskId: null,
            status: 'completed',
            pinned: false,
            cwd: '',
            systemPrompt: '',
            modelOverride: '',
            executionMode: 'local',
            activeSkillIds: [],
            messages,
            messagesOffset: 0,
            totalMessages: messages.length,
            createdAt: firstTimestamp,
            updatedAt: firstTimestamp,
        };
    }
    async readFromTranscript(sessionKey, sessionId) {
        try {
            const agentMatch = sessionKey.match(/^agent:([^:]+):/);
            const agentId = agentMatch?.[1] ?? 'main';
            const resolvedSessionId = this.resolveTranscriptSessionId(sessionKey, sessionId);
            if (!resolvedSessionId)
                return null;
            const stateDir = this.engineManager.getStateDir();
            const filePath = path.join(stateDir, 'agents', agentId, 'sessions', `${resolvedSessionId}.jsonl`);
            if (!fs.existsSync(filePath)) {
                console.log('[EngineRuntime] readFromTranscript: no transcript found for sessionId:', resolvedSessionId);
                return null;
            }
            console.log('[EngineRuntime] readFromTranscript: reading transcript:', filePath);
            return await this.readTranscriptFile(sessionKey, filePath);
        }
        catch (error) {
            console.warn('[EngineRuntime] readFromTranscript failed:', error);
            return null;
        }
    }
    async readFromDeletedTranscript(sessionKey, sessionId) {
        try {
            // Extract agentId from "agent:{agentId}:..." pattern
            const agentMatch = sessionKey.match(/^agent:([^:]+):/);
            const agentId = agentMatch?.[1] ?? 'main';
            const resolvedSessionId = this.resolveTranscriptSessionId(sessionKey, sessionId);
            if (!resolvedSessionId)
                return null;
            const stateDir = this.engineManager.getStateDir();
            const sessionsDir = path.join(stateDir, 'agents', agentId, 'sessions');
            const files = await fs.promises.readdir(sessionsDir).catch(() => []);
            const deletedFile = files.find(f => f.startsWith(`${resolvedSessionId}.jsonl.deleted.`));
            if (!deletedFile) {
                console.log('[EngineRuntime] readFromDeletedTranscript: no archived transcript found for sessionId:', resolvedSessionId);
                return null;
            }
            console.log('[EngineRuntime] readFromDeletedTranscript: reading archived transcript:', deletedFile);
            const filePath = path.join(sessionsDir, deletedFile);
            return await this.readTranscriptFile(sessionKey, filePath);
        }
        catch (error) {
            console.warn('[EngineRuntime] readFromDeletedTranscript failed:', error);
            return null;
        }
    }
    /**
     * Ensure the gateway WebSocket client is connected.
     * Called when IM channels (e.g. Telegram) are enabled in OpenClaw mode
     * so that channel-originated events can be received without waiting
     * for a LobsterAI-initiated session.
     */
    async connectGatewayIfNeeded() {
        this.gatewayReconnectSuppressed = false;
        if (this.gatewayClient) {
            console.log('[ChannelSync] connectGatewayIfNeeded: gateway client already exists, skipping');
            return;
        }
        console.log('[ChannelSync] connectGatewayIfNeeded: no gateway client, initializing...');
        try {
            await this.ensureGatewayClientReady();
            console.log('[ChannelSync] connectGatewayIfNeeded: gateway client ready, starting channel polling');
            this.startChannelPolling();
        }
        catch (error) {
            console.error('[ChannelSync] connectGatewayIfNeeded: failed to initialize gateway client:', error);
            throw error;
        }
    }
    async requestBrowserControl(request) {
        if (!this.gatewayClient) {
            await this.ensureGatewayClientReady();
        }
        const browserTimeoutMs = request.timeoutMs ?? BROWSER_GATEWAY_REQUEST_TIMEOUT_MS;
        return this.requireGatewayClient().request(constants_2.OpenClawBrowserGatewayMethod.Request, {
            ...request,
            timeoutMs: browserTimeoutMs,
        }, { timeoutMs: browserTimeoutMs + BROWSER_GATEWAY_REQUEST_TIMEOUT_SLACK_MS });
    }
    /**
     * Force-reconnect the gateway WebSocket client.
     * Used after the OpenClaw gateway process has been restarted (e.g. after config sync).
     * Unlike `connectGatewayIfNeeded`, this always tears down the old client first
     * to avoid a race where the old client's `onClose` fires after a new client is created.
     */
    async reconnectGateway() {
        console.log('[ChannelSync] reconnectGateway: tearing down old client and reconnecting...');
        this.gatewayReconnectSuppressed = false;
        this.stopGatewayClient();
        try {
            await this.ensureGatewayClientReady();
            console.log('[ChannelSync] reconnectGateway: gateway client ready, starting channel polling');
            this.startChannelPolling();
        }
        catch (error) {
            console.error('[ChannelSync] reconnectGateway: failed to initialize gateway client:', error);
            throw error;
        }
    }
    /**
     * Explicitly disconnect the gateway WebSocket client.
     * Called before the OpenClaw gateway process is restarted so that the old
     * client's async `onClose` handler cannot interfere with a subsequently
     * created client.
     */
    disconnectGatewayClient() {
        console.log('[ChannelSync] disconnectGatewayClient: explicitly tearing down gateway client');
        this.gatewayReconnectSuppressed = true;
        this.stopGatewayClient();
    }
    /**
     * Start periodic polling for channel-originated sessions (e.g. Telegram).
     * Uses the gateway `sessions.list` RPC to discover sessions that may not
     * have been delivered via WebSocket events.
     */
    startChannelPolling() {
        if (!this.channelSessionSync) {
            console.warn('[ChannelSync] startChannelPolling: no channelSessionSync set, skipping');
            return;
        }
        // Already running
        if (this.channelPollingTimer) {
            console.log('[ChannelSync] startChannelPolling: already running, skipping');
            return;
        }
        console.log('[ChannelSync] startChannelPolling: starting periodic channel session discovery');
        // Run once immediately, then at interval
        void this.pollChannelSessions();
        this.channelPollingTimer = setInterval(() => {
            void this.pollChannelSessions();
        }, OpenClawRuntimeAdapter.CHANNEL_POLL_INTERVAL_MS);
    }
    stopChannelPolling() {
        if (this.channelPollingTimer) {
            clearInterval(this.channelPollingTimer);
            this.channelPollingTimer = null;
        }
    }
    async pollChannelSessions() {
        if (!this.gatewayClient || !this.channelSessionSync) {
            console.warn('[ChannelSync] pollChannelSessions: skipped — gatewayClient:', !!this.gatewayClient, 'channelSessionSync:', !!this.channelSessionSync);
            return;
        }
        // Reuse the existing poll cadence for marker cleanup instead of creating
        // one timer per IM run. This bounds memory even if both a terminal event
        // and the corresponding terminal sessions.list row are lost.
        this.pruneStaleChannelLifecycleRuns();
        if (this.isGatewayRpcDegraded()) {
            console.debug('[ChannelSync] skipped channel session polling because gateway session RPCs are degraded.');
            return;
        }
        try {
            const params = { activeMinutes: 60, limit: CHANNEL_SESSION_DISCOVERY_LIMIT };
            const result = await this.gatewayClient.request('sessions.list', params, {
                timeoutMs: OpenClawRuntimeAdapter.CONTEXT_USAGE_LIST_TIMEOUT_MS,
            });
            this.markGatewayRpcSuccess();
            const sessions = result?.sessions;
            if (!Array.isArray(sessions)) {
                console.warn('[ChannelSync] pollChannelSessions: sessions.list returned non-array sessions:', typeof sessions, 'full result keys:', Object.keys(result));
                return;
            }
            let channelCount = 0;
            const newSessionsToSync = [];
            const newSessionIds = [];
            const rememberedCronCacheKeys = new Set();
            for (const row of sessions) {
                const key = typeof row?.key === 'string' ? row.key : '';
                if (!key)
                    continue;
                // Cache contextTokens for all sessions returned by sessions.list
                if (isRecord(row) && typeof row.contextTokens === 'number') {
                    this.sessionContextTokensCache.set(key, row.contextTokens);
                }
                if (isRecord(row)) {
                    this.syncGoalFromSessionRow(row);
                }
                // Skip heartbeat-originated sessions (origin.label === 'heartbeat')
                if (isRecord(row)) {
                    const rowOrigin = row.origin;
                    if (isRecord(rowOrigin) && rowOrigin.label === 'heartbeat') {
                        this.heartbeatSessionKeys.add(key);
                        continue;
                    }
                }
                const isChannel = this.channelSessionSync.isChannelSessionKey(key);
                if (!isChannel)
                    continue;
                // Skip keys that were explicitly deleted by the user — only real-time events re-create them
                if (this.deletedChannelKeys.has(this.getDeletedChannelKey(key)))
                    continue;
                // Skip gateway sessions belonging to a previously-bound agent.
                // After an agent binding change, the gateway retains old sessions under the old agentId.
                // Only process sessions matching the current platformAgentBindings.
                if (!this.channelSessionSync.isCurrentBindingKey(key))
                    continue;
                channelCount++;
                // Polling is the recovery path when a real-time sessions.changed event
                // was missed. Resolve every supported key kind here; cron run keys must
                // use their stable job cache so unique run ids never enter the channel
                // rejected-key set or accumulate in sessionIdBySessionKey.
                const sessionId = (0, openclawChannelSessionSync_1.isCronSessionKey)(key)
                    ? this.channelSessionSync.resolveOrCreateCronSession(key)
                    : this.channelSessionSync.resolveOrCreateSession(key)
                        ?? this.channelSessionSync.resolveOrCreateMainAgentSession(key);
                if (sessionId && isRecord(row)) {
                    this.syncChannelSessionRunStatus({
                        coworkSessionId: sessionId,
                        openClawSessionKey: key,
                        row: row,
                    });
                    this.syncChannelSessionModelOverride({
                        coworkSessionId: sessionId,
                        openClawSessionKey: key,
                        state: extractChannelSessionModelStateFromRow(row),
                    });
                }
                if (sessionId && isRecord(row) && Object.prototype.hasOwnProperty.call(row, 'goal')) {
                    this.emitGoalUpdateIfChanged(sessionId, (0, goal_1.normalizeCoworkGoal)(row.goal));
                }
                const cronKey = (0, openclawCronSessionKey_1.parseOpenClawCronSessionKey)(key);
                if (sessionId && cronKey && !rememberedCronCacheKeys.has(cronKey.cacheKey)) {
                    // sessions.list is newest-first. Keep the first real run key for each
                    // job this cycle, replacing the previous cycle's key in bounded maps.
                    rememberedCronCacheKeys.add(cronKey.cacheKey);
                    this.rememberSessionKey(sessionId, key);
                }
                if (sessionId && !this.knownChannelSessionIds.has(sessionId)) {
                    this.knownChannelSessionIds.add(sessionId);
                    this.rememberSessionKey(sessionId, key);
                    newSessionIds.push(sessionId);
                    // Queue full history sync for newly discovered sessions
                    if (!this.fullySyncedSessions.has(sessionId)) {
                        newSessionsToSync.push({ sessionId, sessionKey: key });
                    }
                }
            }
            if (newSessionIds.length > 0) {
                this.notifySessionsChanged(newSessionIds);
                console.log('[ChannelSync] discovered', channelCount, 'channel sessions, including', newSessionIds.length, 'new sessions');
            }
            // Sync full history for newly discovered sessions
            for (const { sessionId, sessionKey } of newSessionsToSync) {
                await this.syncFullChannelHistory(sessionId, sessionKey);
            }
            // Incremental sync for already-known sessions: check if the gateway has messages
            // that weren't picked up during initial sync or real-time events.
            if (channelCount > 0) {
                const syncedThisCycle = new Set();
                for (const row of sessions) {
                    const key = typeof row?.key === 'string' ? row.key : '';
                    if (!key)
                        continue;
                    if (!this.channelSessionSync.isChannelSessionKey(key))
                        continue;
                    if (this.deletedChannelKeys.has(this.getDeletedChannelKey(key)))
                        continue;
                    if (this.heartbeatSessionKeys.has(key))
                        continue;
                    // Skip sessions belonging to a previously-bound agent
                    if (!this.channelSessionSync.isCurrentBindingKey(key))
                        continue;
                    const sessionId = (0, openclawChannelSessionSync_1.isCronSessionKey)(key)
                        ? this.channelSessionSync.resolveSession(key)
                        : this.sessionIdBySessionKey.get(key);
                    if (!sessionId || !this.fullySyncedSessions.has(sessionId))
                        continue;
                    // Safety net: only sync each sessionId once per poll cycle
                    if (syncedThisCycle.has(sessionId))
                        continue;
                    syncedThisCycle.add(sessionId);
                    // Skip sessions with an active turn (they handle their own sync)
                    if (this.activeTurns.has(sessionId))
                        continue;
                    try {
                        await this.incrementalChannelSync(sessionId, key);
                    }
                    catch (err) {
                        console.warn('[ChannelSync] incremental sync failed for', key, err);
                    }
                }
            }
        }
        catch (error) {
            this.recordGatewayRpcFailure('sessions.list', error);
            if (this.isGatewayRequestTimeout(error, 'sessions.list')) {
                console.warn('[ChannelSync] channel session polling timed out; polling will back off temporarily:', error);
                return;
            }
            console.error('[ChannelSync] pollChannelSessions: error during polling:', error);
        }
    }
    on(event, listener) {
        return super.on(event, listener);
    }
    off(event, listener) {
        return super.off(event, listener);
    }
    async startSession(sessionId, prompt, options = {}) {
        await this.runTurn(sessionId, (0, text_1.stripNullChars)(prompt), {
            skipInitialUserMessage: options.skipInitialUserMessage,
            skillIds: options.skillIds,
            messageSkillIds: options.messageSkillIds,
            kitIds: options.kitIds,
            kitReferences: options.kitReferences,
            resolvedKitCapabilities: options.resolvedKitCapabilities,
            systemPrompt: options.systemPrompt,
            confirmationMode: options.confirmationMode,
            imageAttachments: options.imageAttachments,
            agentId: options.agentId,
            mediaSelection: options.mediaSelection,
            workflowKind: options.workflowKind,
            mediaReferences: options.mediaReferences,
            selectedTextSnippets: options.selectedTextSnippets,
            browserAnnotations: options.browserAnnotations,
        });
    }
    async continueSession(sessionId, prompt, options = {}) {
        await this.runTurn(sessionId, (0, text_1.stripNullChars)(prompt), {
            skipInitialUserMessage: options.skipInitialUserMessage ?? false,
            systemPrompt: options.systemPrompt,
            skillIds: options.skillIds,
            messageSkillIds: options.messageSkillIds,
            kitIds: options.kitIds,
            kitReferences: options.kitReferences,
            resolvedKitCapabilities: options.resolvedKitCapabilities,
            imageAttachments: options.imageAttachments,
            mediaSelection: options.mediaSelection,
            workflowKind: options.workflowKind,
            mediaReferences: options.mediaReferences,
            selectedTextSnippets: options.selectedTextSnippets,
            browserAnnotations: options.browserAnnotations,
        });
    }
    async submitBtw(sessionId, question, runId) {
        const normalizedSessionId = sessionId.trim();
        const normalizedRunId = runId.trim();
        const normalizedQuestion = (0, btw_1.normalizeCoworkBtwQuestion)(question);
        if (!normalizedSessionId || !normalizedRunId) {
            return {
                success: false,
                runId: normalizedRunId,
                error: (0, i18n_1.t)('coworkBtwRequestRequired'),
            };
        }
        if (normalizedSessionId.length > btw_1.COWORK_BTW_IDENTIFIER_MAX_CHARS
            || normalizedRunId.length > btw_1.COWORK_BTW_IDENTIFIER_MAX_CHARS) {
            return {
                success: false,
                runId: normalizedRunId.slice(0, btw_1.COWORK_BTW_IDENTIFIER_MAX_CHARS),
                error: (0, i18n_1.t)('coworkBtwInvalidIdentifier'),
            };
        }
        if (!normalizedQuestion) {
            return {
                success: false,
                runId: normalizedRunId,
                error: (0, i18n_1.t)('coworkBtwQuestionRequired'),
            };
        }
        if (/[\r\n]/.test(normalizedQuestion)) {
            return {
                success: false,
                runId: normalizedRunId,
                error: (0, i18n_1.t)('coworkBtwSingleLine'),
            };
        }
        if (this.pendingBtwRunBySessionId.has(normalizedSessionId)) {
            return {
                success: false,
                runId: normalizedRunId,
                error: (0, i18n_1.t)('coworkBtwAlreadyPending'),
            };
        }
        if (this.pendingBtwRuns.has(normalizedRunId)
            || this.sessionIdByRunId.has(normalizedRunId)
            || this.isTerminalBtwRunId(normalizedRunId)) {
            return {
                success: false,
                runId: normalizedRunId,
                error: (0, i18n_1.t)('coworkBtwRunConflict'),
            };
        }
        const session = this.store.getSession(normalizedSessionId);
        if (!session) {
            return {
                success: false,
                runId: normalizedRunId,
                error: (0, i18n_1.t)('coworkBtwSessionNotFound', { sessionId: normalizedSessionId }),
            };
        }
        const agentId = session.agentId || 'main';
        const sessionKey = this.resolveInteractiveSessionKey(normalizedSessionId);
        if (!sessionKey) {
            return {
                success: false,
                runId: normalizedRunId,
                error: (0, i18n_1.t)('coworkBtwSessionNotFound', { sessionId: normalizedSessionId }),
            };
        }
        try {
            await this.ensureGatewayClientReady();
            if (this.pendingBtwRunBySessionId.has(normalizedSessionId)) {
                return {
                    success: false,
                    runId: normalizedRunId,
                    error: (0, i18n_1.t)('coworkBtwAlreadyPending'),
                };
            }
            const runCwd = session.cwd?.trim() ? path.resolve(session.cwd.trim()) : undefined;
            const chatSendParams = {
                sessionKey,
                message: `/btw ${normalizedQuestion}`,
                deliver: false,
                idempotencyKey: normalizedRunId,
                ...(runCwd ? { cwd: runCwd } : {}),
            };
            assertOpenClawChatSendPayloadWithinLimit(normalizedSessionId, chatSendParams);
            this.rememberSessionKey(normalizedSessionId, sessionKey);
            const pending = this.registerPendingBtwRun({
                clientRunId: normalizedRunId,
                sessionId: normalizedSessionId,
                sessionKey,
                agentId,
                question: normalizedQuestion,
            });
            console.log('[CoworkBtw] submitting side question.', `Session ${normalizedSessionId}.`, `Run ${normalizedRunId}.`, `OpenClaw key ${sessionKey}.`, `Question chars ${normalizedQuestion.length}.`, `Active main turn ${this.activeTurns.has(normalizedSessionId) ? 'yes' : 'no'}.`);
            const sendResult = await this.requireGatewayClient().request(OpenClawGatewayMethod.ChatSend, chatSendParams, { timeoutMs: 90_000 });
            const returnedRunId = typeof sendResult?.runId === 'string' ? sendResult.runId.trim() : '';
            if (returnedRunId && !this.addPendingBtwRunAlias(pending, returnedRunId)) {
                return {
                    success: false,
                    runId: normalizedRunId,
                    error: (0, i18n_1.t)('coworkBtwInvalidResult'),
                };
            }
            return {
                success: true,
                runId: normalizedRunId,
            };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const pending = this.pendingBtwRunBySessionId.get(normalizedSessionId);
            if (pending?.clientRunId === normalizedRunId) {
                this.failPendingBtwRun(pending, message, 'chat.send rejected');
            }
            else if (this.isTerminalBtwRunId(normalizedRunId)) {
                return {
                    success: true,
                    runId: normalizedRunId,
                };
            }
            console.error('[CoworkBtw] failed to submit side question.', `Session ${normalizedSessionId}.`, `Run ${normalizedRunId}.`, error);
            return {
                success: false,
                runId: normalizedRunId,
                error: message,
            };
        }
    }
    async abortBtw(sessionId, runId) {
        const normalizedSessionId = sessionId.trim();
        const normalizedRunId = runId.trim();
        if (!normalizedSessionId
            || !normalizedRunId
            || normalizedSessionId.length > btw_1.COWORK_BTW_IDENTIFIER_MAX_CHARS
            || normalizedRunId.length > btw_1.COWORK_BTW_IDENTIFIER_MAX_CHARS) {
            return {
                success: false,
                aborted: false,
                runId: normalizedRunId.slice(0, btw_1.COWORK_BTW_IDENTIFIER_MAX_CHARS),
                error: (0, i18n_1.t)('coworkBtwInvalidIdentifier'),
            };
        }
        const pending = this.pendingBtwRunBySessionId.get(normalizedSessionId);
        if (!pending || pending.clientRunId !== normalizedRunId) {
            return {
                success: false,
                aborted: false,
                runId: normalizedRunId,
                error: (0, i18n_1.t)('coworkBtwNoPending'),
            };
        }
        if (pending.stopRequested) {
            // A stop RPC is already in flight. Do not claim that the gateway
            // confirmed it; the terminal stream event will settle every renderer.
            return {
                success: true,
                aborted: false,
                runId: normalizedRunId,
            };
        }
        const client = this.gatewayClient;
        if (!client) {
            return {
                success: false,
                aborted: false,
                runId: normalizedRunId,
                error: (0, i18n_1.t)('coworkBtwStopFailed'),
            };
        }
        pending.stopRequested = true;
        console.log('[CoworkBtw] stopping side question.', `Session ${normalizedSessionId}.`, `Run ${normalizedRunId}.`);
        try {
            const gatewayRunIds = Array.from(pending.gatewayRunIds).reverse();
            let aborted = false;
            for (const gatewayRunId of gatewayRunIds) {
                const result = await client.request(OpenClawGatewayMethod.ChatAbort, {
                    sessionKey: pending.sessionKey,
                    runId: gatewayRunId,
                }, { timeoutMs: 10_000 });
                const abortedRunIds = Array.isArray(result?.runIds)
                    ? result.runIds.filter((value) => typeof value === 'string')
                    : [];
                if (result?.aborted === true
                    && abortedRunIds.some(abortedRunId => pending.gatewayRunIds.has(abortedRunId))) {
                    aborted = true;
                    break;
                }
            }
            if (this.pendingBtwRunBySessionId.get(normalizedSessionId) !== pending) {
                return {
                    success: true,
                    aborted,
                    runId: normalizedRunId,
                };
            }
            if (!aborted) {
                pending.stopRequested = false;
                console.warn('[CoworkBtw] gateway did not confirm side-question stop.', `Session ${normalizedSessionId}.`, `Run ${normalizedRunId}.`);
                return {
                    success: false,
                    aborted: false,
                    runId: normalizedRunId,
                    error: (0, i18n_1.t)('coworkBtwStopFailed'),
                };
            }
            this.stopPendingBtwRun(pending, 'user requested stop');
            return {
                success: true,
                aborted: true,
                runId: normalizedRunId,
            };
        }
        catch (error) {
            if (this.pendingBtwRunBySessionId.get(normalizedSessionId) === pending) {
                pending.stopRequested = false;
            }
            console.error('[CoworkBtw] failed to stop side question.', `Session ${normalizedSessionId}.`, `Run ${normalizedRunId}.`, error);
            return {
                success: false,
                aborted: false,
                runId: normalizedRunId,
                error: (0, i18n_1.t)('coworkBtwStopFailed'),
            };
        }
    }
    async submitSteer(sessionId, text, clientSteerId) {
        const trimmedText = (0, text_1.stripNullChars)(text).trim();
        if (!trimmedText) {
            return {
                success: false,
                status: steer_1.CoworkSteerStatus.Rejected,
                clientSteerId,
                reason: steer_1.CoworkSteerRejectReason.EmptyInput,
                error: 'Steer input is required.',
            };
        }
        const turn = this.activeTurns.get(sessionId);
        if (!turn) {
            return {
                success: false,
                status: steer_1.CoworkSteerStatus.Rejected,
                clientSteerId,
                reason: steer_1.CoworkSteerRejectReason.NoActiveTurn,
                error: 'There is no active session turn to steer.',
            };
        }
        if (turn.contextMaintenanceToolCallIds.size > 0) {
            return {
                success: false,
                status: steer_1.CoworkSteerStatus.Rejected,
                clientSteerId,
                reason: steer_1.CoworkSteerRejectReason.ContextMaintenance,
                error: 'The active turn is organizing context and cannot accept steer input yet.',
            };
        }
        try {
            const client = this.requireGatewayClient();
            const result = await client.request('sessions.queueSteer', {
                key: turn.sessionKey,
                message: trimmedText,
                idempotencyKey: clientSteerId,
            }, { timeoutMs: OpenClawRuntimeAdapter.SESSION_PATCH_TIMEOUT_MS });
            if (result?.queued === true) {
                console.debug('[EngineRuntime] steer accepted by active-run queue.', `Session ${sessionId}.`, `Client steer ${clientSteerId}.`, `OpenClaw key ${turn.sessionKey}.`);
                return {
                    success: true,
                    status: steer_1.CoworkSteerStatus.Accepted,
                    clientSteerId,
                };
            }
            const rejectedReason = this.mapOpenClawSteerRejectReason(result?.reason);
            console.warn('[EngineRuntime] steer rejected by active-run queue.', `Session ${sessionId}.`, `Client steer ${clientSteerId}.`, `Reason ${result?.reason ?? 'unknown'}.`);
            return {
                success: false,
                status: steer_1.CoworkSteerStatus.Rejected,
                clientSteerId,
                reason: rejectedReason,
                error: result?.errorMessage ?? `Steer was rejected by the engine (${result?.reason ?? 'unknown'}).`,
            };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const reason = /unknown method|not found|no handler/i.test(message)
                ? steer_1.CoworkSteerRejectReason.RuntimeUnsupported
                : steer_1.CoworkSteerRejectReason.RuntimeRejected;
            console.warn('[EngineRuntime] steer request failed.', `Session ${sessionId}.`, `Client steer ${clientSteerId}.`, `Reason ${reason}.`, error);
            return {
                success: false,
                status: steer_1.CoworkSteerStatus.Rejected,
                clientSteerId,
                reason,
                error: reason === steer_1.CoworkSteerRejectReason.RuntimeUnsupported
                    ? 'The current engine build does not expose same-turn steering yet. Rebuild the pinned runtime with the Caisra patches.'
                    : message,
            };
        }
    }
    mapOpenClawSteerRejectReason(reason) {
        switch (reason) {
            case 'no_active_run':
                return steer_1.CoworkSteerRejectReason.NoActiveTurn;
            case 'not_streaming':
                return steer_1.CoworkSteerRejectReason.NotStreaming;
            case 'compacting':
                return steer_1.CoworkSteerRejectReason.ContextMaintenance;
            case 'runtime_rejected':
                return steer_1.CoworkSteerRejectReason.RuntimeRejected;
            default:
                return steer_1.CoworkSteerRejectReason.Unknown;
        }
    }
    async runGoalCommand(sessionId, command) {
        const parsed = parseOpenClawGoalCommand(command);
        if (!parsed) {
            throw new Error('Invalid goal command.');
        }
        const session = this.store.getSession(sessionId);
        if (!session) {
            throw new Error(`Session ${sessionId} not found`);
        }
        const sessionKey = this.resolveInteractiveSessionKey(sessionId);
        if (!sessionKey) {
            throw new Error(`Session ${sessionId} has no engine session key.`);
        }
        this.rememberSessionKey(sessionId, sessionKey);
        console.debug('[EngineRuntime] running goal command.', `Session ${sessionId}.`, `OpenClaw key ${sessionKey}.`, `Action ${parsed.action}.`, `Active ${this.activeTurns.has(sessionId) ? 'yes' : 'no'}.`);
        await this.ensureGatewayClientReady();
        const client = this.requireGatewayClient();
        const response = await client.request('sessions.goal', {
            key: sessionKey,
            action: parsed.action,
            text: parsed.text,
        }, { timeoutMs: OpenClawRuntimeAdapter.SESSION_PATCH_TIMEOUT_MS });
        const goal = (0, goal_1.normalizeCoworkGoal)(response?.goal);
        this.emitGoalUpdateIfChanged(sessionId, goal);
        this.addGoalSettingUserMessageFromCommand(sessionId, parsed);
        const shouldContinueForGoalAction = parsed.action === 'start'
            || parsed.action === 'create'
            || parsed.action === 'set'
            || parsed.action === 'resume';
        if (!shouldContinueForGoalAction) {
            this.pendingGoalContinuations.delete(sessionId);
        }
        if (shouldContinueForGoalAction) {
            const continuationPrompt = parsed.action === 'resume'
                ? formatGoalResumeContinuationPrompt(parsed.text)
                : formatGoalContinuationPrompt(goal?.objective || parsed.text);
            if (continuationPrompt.trim()) {
                const pendingContinuation = {
                    action: parsed.action,
                    prompt: continuationPrompt,
                    skipInitialUserMessage: GOAL_BOOTSTRAP_ACTIONS.has(parsed.action),
                    systemPrompt: session.systemPrompt,
                };
                if (this.activeTurns.has(sessionId)) {
                    this.pendingGoalContinuations.set(sessionId, pendingContinuation);
                    console.debug('[EngineRuntime] queued goal continuation until active turn completes.', `Session ${sessionId}.`, `Action ${parsed.action}.`);
                    return goal;
                }
                console.debug('[EngineRuntime] continuing after goal command.', `Session ${sessionId}.`, `Action ${parsed.action}.`);
                void this.continueSession(sessionId, pendingContinuation.prompt, {
                    skipInitialUserMessage: pendingContinuation.skipInitialUserMessage,
                    systemPrompt: pendingContinuation.systemPrompt,
                })
                    .catch((error) => {
                    const message = error instanceof Error ? error.message : String(error);
                    console.error('[EngineRuntime] failed to continue after goal command:', error);
                    this.store.updateSession(sessionId, { status: 'error' });
                    this.emit('error', sessionId, message);
                });
            }
        }
        return goal;
    }
    async patchSession(sessionId, patch) {
        const session = this.store.getSession(sessionId);
        if (!session) {
            throw new Error(`Session ${sessionId} not found`);
        }
        const targetSessionKey = this.resolveInteractiveSessionKey(sessionId, {
            requirePersistedChannelKey: true,
        });
        if (!targetSessionKey) {
            throw new Error(`Session ${sessionId} has no engine session key.`);
        }
        this.rememberSessionKey(sessionId, targetSessionKey);
        await this.ensureGatewayClientReady();
        const normalizedPatch = {
            ...patch,
            ...(patch.model !== undefined
                ? { model: patch.model ? this.normalizeModelRef(patch.model) : patch.model }
                : {}),
        };
        const patchedThinkingLevel = normalizedPatch.thinkingLevel !== undefined
            ? normalizedPatch.thinkingLevel ?? ''
            : undefined;
        const thinkingModelRef = normalizedPatch.model !== undefined
            ? (normalizedPatch.model || this.resolveAgentDefaultModelRef(session))
            : (session.modelOverride
                ? this.normalizeModelRef(session.modelOverride)
                : this.resolveAgentDefaultModelRef(session));
        const gatewayPatch = {
            ...normalizedPatch,
            ...(typeof normalizedPatch.thinkingLevel === 'string' && normalizedPatch.thinkingLevel
                ? {
                    thinkingLevel: (0, openclawModelThinkingLevels_1.resolveOpenClawThinkingLevelForModel)(thinkingModelRef, normalizedPatch.thinkingLevel),
                }
                : {}),
        };
        const sendPatch = async () => {
            try {
                const response = await this.requestSessionPatchWithProfile({
                    sessionId,
                    sessionKey: targetSessionKey,
                    patch: gatewayPatch,
                    source: 'patchSession',
                    reason: 'user-requested session patch',
                    timeoutMs: OpenClawRuntimeAdapter.SESSION_PATCH_TIMEOUT_MS,
                });
                this.markGatewayRpcSuccess();
                return response;
            }
            catch (error) {
                this.recordGatewayRpcFailure('sessions.patch', error);
                throw error;
            }
        };
        if (normalizedPatch.model !== undefined) {
            let response;
            await this.enqueueSessionModelPatch(sessionId, async () => {
                response = await sendPatch();
            });
            const modelOverride = extractModelOverrideFromPatchResult(response, typeof normalizedPatch.model === 'string' ? normalizedPatch.model : null);
            if (typeof modelOverride === 'string' && modelOverride) {
                this.rememberSessionModelPatch(sessionId, targetSessionKey, modelOverride, SessionModelPatchSource.SessionOverride);
            }
            else {
                this.sessionModelPatchStateBySession.delete(sessionId);
            }
            return {
                modelOverride: modelOverride ?? '',
                ...(patchedThinkingLevel !== undefined ? { thinkingLevel: patchedThinkingLevel } : {}),
            };
        }
        await sendPatch();
        return patchedThinkingLevel !== undefined
            ? { thinkingLevel: patchedThinkingLevel }
            : {};
    }
    stopSession(sessionId) {
        const turn = this.activeTurns.get(sessionId);
        if (turn) {
            turn.stopRequested = true;
            this.manuallyStoppedSessions.add(sessionId);
            this.finalizeStoppedStreamingMessages(sessionId, turn);
            const client = this.gatewayClient;
            if (client) {
                console.log(`[EngineRuntime] user requested stop, aborting gateway run ${turn.runId}.`);
                void client.request('chat.abort', {
                    sessionKey: turn.sessionKey,
                    runId: turn.runId,
                }).catch((error) => {
                    console.warn('[EngineRuntime] Failed to abort chat run:', error);
                });
            }
        }
        else {
            console.log('[EngineRuntime] received stop before a gateway run became active.', `Session ${sessionId}.`);
        }
        // Record the stop timestamp so that late-arriving gateway events
        // (e.g. from POPO/Telegram channels) don't re-create the ActiveTurn.
        this.stoppedSessions.set(sessionId, Date.now());
        this.cleanupSessionTurn(sessionId);
        this.approvalController.clearBySession(sessionId);
        this.store.updateSession(sessionId, { status: 'idle' });
        this.emitSessionStatus(sessionId, 'idle');
        this.emit('sessionStopped', sessionId);
        this.resolveTurn(sessionId);
    }
    cancelTurnStartupIfStopped(sessionId, checkpoint) {
        if (!this.stoppedSessions.has(sessionId)) {
            return false;
        }
        console.log('[EngineRuntime] cancelled turn startup after user stop.', `Session ${sessionId}.`, `Checkpoint ${checkpoint}.`);
        this.cleanupSessionTurn(sessionId);
        this.stoppedSessions.delete(sessionId);
        this.manuallyStoppedSessions.delete(sessionId);
        this.store.updateSession(sessionId, { status: 'idle' });
        this.emitSessionStatus(sessionId, 'idle');
        this.resolveTurn(sessionId);
        return true;
    }
    stopAllSessions() {
        const activeSessionIds = Array.from(this.activeTurns.keys());
        activeSessionIds.forEach((sessionId) => {
            this.stopSession(sessionId);
        });
    }
    respondToPermission(requestId, result) {
        this.approvalController.respondToPermission(requestId, result);
    }
    isSessionActive(sessionId) {
        return this.activeTurns.has(sessionId);
    }
    hasActiveSessions() {
        return this.activeTurns.size > 0;
    }
    getSessionConfirmationMode(sessionId) {
        return this.confirmationModeBySession.get(sessionId) ?? null;
    }
    async enqueueSessionModelPatch(sessionId, task) {
        const previous = this.sessionModelPatchQueue.get(sessionId) ?? Promise.resolve();
        const next = previous.catch(() => undefined).then(task);
        this.sessionModelPatchQueue.set(sessionId, next);
        try {
            await next;
        }
        finally {
            if (this.sessionModelPatchQueue.get(sessionId) === next) {
                this.sessionModelPatchQueue.delete(sessionId);
            }
        }
    }
    async ensureSessionModelForTurn(options) {
        const { sessionId, sessionKey, model, thinkingLevel, source } = options;
        if (!model) {
            this.sessionModelPatchStateBySession.delete(sessionId);
            return;
        }
        const confirmedState = this.getConfirmedSessionModelPatch(sessionId, sessionKey, model, source);
        if (source === SessionModelPatchSource.AgentModel && confirmedState) {
            console.debug('[EngineRuntime] skipped sessions.patch before chat.send because the agent model is already confirmed.', `Session ${sessionId}.`, `OpenClaw key ${sessionKey}.`, `Model ${model}.`);
            return;
        }
        if (confirmedState && this.isGatewayRpcDegraded()) {
            console.warn('[EngineRuntime] skipped redundant sessions.patch before chat.send because gateway session RPCs are degraded.', `Session ${sessionId}.`, `OpenClaw key ${sessionKey}.`, `Model ${model}.`, `Source ${source}.`);
            return;
        }
        try {
            await this.enqueueSessionModelPatch(sessionId, async () => {
                const currentConfirmedState = this.getConfirmedSessionModelPatch(sessionId, sessionKey, model, source);
                if (source === SessionModelPatchSource.AgentModel && currentConfirmedState) {
                    console.debug('[EngineRuntime] skipped queued sessions.patch before chat.send because the agent model is already confirmed.', `Session ${sessionId}.`, `OpenClaw key ${sessionKey}.`, `Model ${model}.`);
                    return;
                }
                if (currentConfirmedState && this.isGatewayRpcDegraded()) {
                    console.warn('[EngineRuntime] skipped queued redundant sessions.patch before chat.send because gateway session RPCs are degraded.', `Session ${sessionId}.`, `OpenClaw key ${sessionKey}.`, `Model ${model}.`, `Source ${source}.`);
                    return;
                }
                const openClawThinkingLevel = thinkingLevel
                    ? (0, openclawModelThinkingLevels_1.resolveOpenClawThinkingLevelForModel)(model, thinkingLevel)
                    : undefined;
                await this.requestSessionPatchWithProfile({
                    sessionId,
                    sessionKey,
                    patch: {
                        model,
                        ...(openClawThinkingLevel ? { thinkingLevel: openClawThinkingLevel } : {}),
                        ...((0, openclawChannelSessionSync_1.isManagedSessionKey)(sessionKey)
                            ? { reasoningLevel: openclawSession_1.OpenClawSessionReasoningLevel.Stream }
                            : {}),
                    },
                    source,
                    reason: 'model sync before chat.send',
                    timeoutMs: OpenClawRuntimeAdapter.SESSION_PATCH_SEND_TIMEOUT_MS,
                });
                this.markGatewayRpcSuccess();
                this.rememberSessionModelPatch(sessionId, sessionKey, model, source);
            });
        }
        catch (error) {
            this.recordGatewayRpcFailure('sessions.patch', error);
            console.warn('[EngineRuntime] failed to patch the session model before chat.send:', error);
            const confirmedAfterFailure = this.getConfirmedSessionModelPatch(sessionId, sessionKey, model, source);
            if (confirmedAfterFailure && this.isGatewayRequestTimeout(error, 'sessions.patch')) {
                console.warn(`[EngineRuntime] continuing chat.send for session ${sessionId} after a redundant session model patch timed out.`);
                return;
            }
            this.sessionModelPatchStateBySession.delete(sessionId);
            if (source === SessionModelPatchSource.SessionOverride) {
                throw error;
            }
        }
    }
    async assertTranscriptSafeForRun(options) {
        if (typeof this.engineManager.getStateDir !== 'function') {
            console.debug('[EngineRuntime] skipped transcript safety inspection because the engine state directory is unavailable.', `Session ${options.sessionId}.`);
            return;
        }
        const inspection = await (0, openclawTranscriptSafety_1.inspectOpenClawTranscriptSafety)({
            stateDir: this.engineManager.getStateDir(),
            agentId: options.agentId,
            sessionKey: options.sessionKey,
        });
        if (inspection.status === constants_6.OpenClawTranscriptSafetyStatus.Unknown) {
            console.debug('[EngineRuntime] transcript safety inspection was inconclusive.', `Session ${options.sessionId}.`, `OpenClaw key ${options.sessionKey}.`, `Reason ${inspection.reason ?? 'unknown'}.`);
            return;
        }
        if (inspection.status === constants_6.OpenClawTranscriptSafetyStatus.CompactionRequired) {
            console.log('[EngineRuntime] active transcript reached the managed compaction threshold.', `Session ${options.sessionId}.`, `OpenClaw key ${options.sessionKey}.`, `Transcript bytes ${inspection.transcriptBytes ?? 'unknown'}.`);
            return;
        }
        if (inspection.status === constants_6.OpenClawTranscriptSafetyStatus.Blocked) {
            console.warn('[EngineRuntime] blocked a run before gateway transcript loading because the active transcript is oversized.', `Session ${options.sessionId}.`, `OpenClaw key ${options.sessionKey}.`, `Transcript bytes ${inspection.transcriptBytes ?? 'unknown'}.`);
            throw (0, openclawTranscriptSafety_1.buildOpenClawTranscriptOversizedError)(inspection);
        }
    }
    async runTurn(sessionId, prompt, options) {
        if (!prompt.trim()
            && (!options.imageAttachments || options.imageAttachments.length === 0)
            && !options.browserAnnotations?.length) {
            throw new Error('Prompt is required.');
        }
        const imageAttachmentValidation = validateRuntimeImageAttachments(options.imageAttachments);
        if (imageAttachmentValidation.ok === false) {
            throw new Error(imageAttachmentValidation.error);
        }
        const firstResponseTiming = { turnStartedAtMs: Date.now() };
        console.log('[EngineRuntimeTiming] turn started.', `Session ${sessionId}.`, `Prompt length ${prompt.length}.`, `Image attachments ${options.imageAttachments?.length ?? 0}.`);
        // Clear stop cooldown when user explicitly starts/continues a session
        this.stoppedSessions.delete(sessionId);
        this.manuallyStoppedSessions.delete(sessionId);
        if (this.activeTurns.has(sessionId)) {
            throw new Error(`Session ${sessionId} is still running.`);
        }
        const session = this.store.getSession(sessionId);
        if (!session) {
            throw new Error(`Session ${sessionId} not found`);
        }
        const confirmationMode = options.confirmationMode
            ?? this.confirmationModeBySession.get(sessionId)
            ?? 'modal';
        this.confirmationModeBySession.set(sessionId, confirmationMode);
        if (!options.skipInitialUserMessage) {
            const messageSkillIds = options.messageSkillIds ?? options.skillIds;
            const imageAttachmentPreviews = (0, imageAttachments_1.buildCoworkImageAttachmentPreviews)(options.imageAttachments);
            const goalSettingMetadata = (0, goalCommandDisplay_1.buildGoalSettingMessageMetadata)(prompt);
            const metadata = (messageSkillIds?.length
                || options.kitIds?.length
                || imageAttachmentPreviews?.length
                || options.selectedTextSnippets?.length
                || options.browserAnnotations?.length
                || goalSettingMetadata)
                ? {
                    ...goalSettingMetadata,
                    ...(messageSkillIds?.length ? { skillIds: messageSkillIds } : {}),
                    ...(options.kitIds?.length ? {
                        kitIds: options.kitIds,
                        ...(options.kitReferences?.length ? { kitReferences: options.kitReferences } : {}),
                        ...(options.resolvedKitCapabilities ? { resolvedKitCapabilities: options.resolvedKitCapabilities } : {}),
                    } : {}),
                    ...(imageAttachmentPreviews?.length ? { imageAttachmentPreviews } : {}),
                    ...(options.selectedTextSnippets?.length ? { selectedTextSnippets: options.selectedTextSnippets } : {}),
                    ...(options.browserAnnotations?.length ? { browserAnnotations: options.browserAnnotations } : {}),
                }
                : undefined;
            if (options.selectedTextSnippets?.length) {
                console.log(`[EngineRuntime] persisted ${options.selectedTextSnippets.length} selected text excerpts in `
                    + `local metadata for session ${sessionId}`);
            }
            const userMessage = this.store.addMessage(sessionId, {
                type: 'user',
                content: prompt,
                metadata,
            });
            this.refreshContinuityCapsule(sessionId, coworkContinuityCapsule_1.ContinuityCapsuleSource.UserMessage, {
                sourceMessageId: userMessage.id,
            });
            this.emit('message', sessionId, userMessage);
        }
        const agentId = options.agentId || session.agentId || 'main';
        const persistedSessionKey = session.claudeSessionId?.trim() || '';
        const sessionKey = persistedSessionKey || this.toSessionKey(sessionId, agentId);
        this.rememberSessionKey(sessionId, sessionKey);
        const parsedGoalBootstrapCommand = parseOpenClawGoalCommand(prompt);
        const goalBootstrapCommand = shouldBootstrapGoalFromPrompt(parsedGoalBootstrapCommand)
            ? parsedGoalBootstrapCommand
            : null;
        let effectivePrompt = prompt;
        try {
            await this.assertTranscriptSafeForRun({ sessionId, sessionKey, agentId });
        }
        catch (error) {
            this.store.updateSession(sessionId, { status: 'error' });
            const message = error instanceof Error ? error.message : String(error);
            this.emit('error', sessionId, message);
            throw error;
        }
        this.store.updateSession(sessionId, { status: 'running' });
        this.emitSessionStatus(sessionId, 'running');
        (0, coworkOpenAICompatProxy_1.setCoworkProxySessionId)(sessionId);
        firstResponseTiming.gatewayReadyStartedAtMs = Date.now();
        await this.ensureGatewayClientReady();
        if (this.cancelTurnStartupIfStopped(sessionId, 'gateway client became ready')) {
            return;
        }
        firstResponseTiming.gatewayReadyEndedAtMs = Date.now();
        console.log('[EngineRuntimeTiming] gateway client ready.', `Session ${sessionId}.`, `Elapsed ${formatTimingDuration(firstResponseTiming.gatewayReadyStartedAtMs, firstResponseTiming.gatewayReadyEndedAtMs)}.`, `Total ${formatTimingOffset(firstResponseTiming.turnStartedAtMs, firstResponseTiming.gatewayReadyEndedAtMs)}.`);
        this.startChannelPolling();
        const runId = (0, crypto_1.randomUUID)();
        const turnToken = this.nextTurnToken(sessionId);
        const agent = this.store.getAgent(agentId);
        const rawCurrentModel = session.modelOverride || agent?.model || '';
        // Normalize only agent-level model refs (may need provider migration).
        // Session modelOverride is user-selected and must not be rewritten.
        const currentModel = session.modelOverride
            ? rawCurrentModel
            : (rawCurrentModel ? this.normalizeModelRef(rawCurrentModel) : '');
        if (!session.modelOverride && currentModel && currentModel !== rawCurrentModel && agent?.id) {
            this.store.updateAgent(agent.id, { model: currentModel });
        }
        try {
            firstResponseTiming.modelPatchStartedAtMs = Date.now();
            await this.ensureSessionModelForTurn({
                sessionId,
                sessionKey,
                model: currentModel,
                thinkingLevel: session.thinkingLevel || undefined,
                source: session.modelOverride
                    ? SessionModelPatchSource.SessionOverride
                    : SessionModelPatchSource.AgentModel,
            });
            if (this.cancelTurnStartupIfStopped(sessionId, 'session model sync finished')) {
                return;
            }
            firstResponseTiming.modelPatchEndedAtMs = Date.now();
            console.log('[EngineRuntimeTiming] session model sync finished.', `Session ${sessionId}.`, `Model ${currentModel || 'none'}.`, `Elapsed ${formatTimingDuration(firstResponseTiming.modelPatchStartedAtMs, firstResponseTiming.modelPatchEndedAtMs)}.`, `Total ${formatTimingOffset(firstResponseTiming.turnStartedAtMs, firstResponseTiming.modelPatchEndedAtMs)}.`);
        }
        catch (error) {
            this.store.updateSession(sessionId, { status: 'error' });
            const message = error instanceof Error ? error.message : String(error);
            this.emit('error', sessionId, message);
            throw error;
        }
        // The model sync may wait up to SESSION_PATCH_SEND_TIMEOUT_MS on a slow
        // gateway. stoppedSessions was cleared at turn start, so an entry here
        // means the user stopped the session while we were waiting.
        if (this.stoppedSessions.has(sessionId)) {
            console.log(`[EngineRuntime] turn aborted after model sync because the user stopped session ${sessionId} while waiting.`);
            return;
        }
        if (shouldBootstrapGoalFromPrompt(goalBootstrapCommand)) {
            try {
                const client = this.requireGatewayClient();
                console.debug('[EngineRuntime] bootstrapping goal before first turn.', `Session ${sessionId}.`, `OpenClaw key ${sessionKey}.`, `Action ${goalBootstrapCommand.action}.`);
                const response = await client.request('sessions.goal', {
                    key: sessionKey,
                    action: goalBootstrapCommand.action,
                    text: goalBootstrapCommand.text,
                }, { timeoutMs: OpenClawRuntimeAdapter.SESSION_PATCH_TIMEOUT_MS });
                const goal = (0, goal_1.normalizeCoworkGoal)(response?.goal);
                this.emitGoalUpdateIfChanged(sessionId, goal);
                effectivePrompt = formatGoalContinuationPrompt(goal?.objective || goalBootstrapCommand.text);
            }
            catch (error) {
                console.error('[EngineRuntime] failed to bootstrap goal before first turn:', error);
                this.store.updateSession(sessionId, { status: 'error' });
                const message = error instanceof Error ? error.message : String(error);
                this.emit('error', sessionId, message);
                throw error;
            }
        }
        const systemPromptText = options.systemPrompt ?? session.systemPrompt ?? '';
        const hasMediaSkillActive = /\bseedream\b|\bseedance\b/i.test(systemPromptText);
        const planModeExecutionApproved = (0, planMode_1.containsPlanModePrompt)(systemPromptText)
            && (0, planMode_1.isPlanImplementationApproval)(effectivePrompt)
            && sessionHasProposedPlan(session.messages);
        const outboundSystemPrompt = [
            systemPromptText,
            planModeExecutionApproved ? buildPlanModeExecutionOverridePrompt() : '',
            (0, mediaGenerationTurnInstruction_1.buildMediaGenerationTurnInstruction)(options.mediaSelection, hasMediaSkillActive, options.workflowKind),
        ].filter(p => p?.trim()).join('\n\n');
        const planMode = isPlanModeSystemPrompt(outboundSystemPrompt);
        if (planModeExecutionApproved) {
            console.log(`[EngineRuntime] exited plan mode for an approved implementation in session ${sessionId}.`);
        }
        firstResponseTiming.promptBuildStartedAtMs = Date.now();
        // Strip NUL at the final outbound boundary so bridge content rebuilt from
        // already-poisoned local history cannot trigger the gateway rejection.
        const outboundMessage = (0, text_1.stripNullChars)(await this.buildOutboundPrompt(sessionId, effectivePrompt, outboundSystemPrompt, agentId, options.mediaReferences, options.selectedTextSnippets, options.browserAnnotations, firstResponseTiming));
        if (this.cancelTurnStartupIfStopped(sessionId, 'outbound prompt built')) {
            return;
        }
        firstResponseTiming.promptBuildEndedAtMs = Date.now();
        console.log('[EngineRuntimeTiming] outbound prompt built.', `Session ${sessionId}.`, `Message length ${outboundMessage.length}.`, `System prompt length ${outboundSystemPrompt.length}.`, `Elapsed ${formatTimingDuration(firstResponseTiming.promptBuildStartedAtMs, firstResponseTiming.promptBuildEndedAtMs)}.`, `Total ${formatTimingOffset(firstResponseTiming.turnStartedAtMs, firstResponseTiming.promptBuildEndedAtMs)}.`);
        const runCwd = session.cwd?.trim() ? path.resolve(session.cwd.trim()) : undefined;
        const completionPromise = new Promise((resolve, reject) => {
            this.pendingTurns.set(sessionId, { resolve, reject });
        });
        this.activeTurns.set(sessionId, {
            sessionId,
            sessionKey,
            runId,
            model: currentModel,
            turnToken,
            planMode,
            knownRunIds: new Set([runId]),
            assistantMessageId: null,
            committedAssistantText: '',
            lastCommittedAssistantMessageId: null,
            currentAssistantSegmentText: '',
            currentText: '',
            agentAssistantTextLength: 0,
            hasSeenAgentAssistantStream: false,
            currentContentText: '',
            currentContentBlocks: [],
            sawNonTextContentBlocks: false,
            textStreamMode: 'unknown',
            toolUseMessageIdByToolCallId: new Map(),
            toolResultMessageIdByToolCallId: new Map(),
            toolResultTextByToolCallId: new Map(),
            mediaStatusPollCountByToolCallId: new Map(),
            mediaStatusPollCountByTaskId: new Map(),
            mediaStatusPollBaseByToolCallId: new Map(),
            contextMaintenanceToolCallIds: new Set(),
            planModeSuppressedToolCallIds: new Set(),
            startedAtMs: Date.now(),
            firstResponseTiming,
            stopRequested: false,
            thinking: (0, controller_1.createOpenClawThinkingTurnState)(),
            pendingUserSync: false,
            bufferedChatPayloads: [],
            bufferedAgentPayloads: [],
        });
        this.sessionIdByRunId.set(runId, sessionId);
        // Start client-side timeout watchdog.
        // OpenClaw gateway has a known issue where embedded run timeouts may not
        // produce a WS abort/final event (the subscription is torn down before the
        // lifecycle event fires). This timer fires slightly after the server-side
        // timeout to recover the UI from a stuck "running" state.
        this.startTurnTimeoutWatchdog(sessionId);
        const client = this.requireGatewayClient();
        try {
            console.log('[EngineRuntime] chat.send params:', { sessionKey, messageLength: outboundMessage.length, runId });
            console.log('[EngineRuntime] chat.send imageAttachments diagnosis:', {
                hasImageAttachments: !!options.imageAttachments,
                imageAttachmentsCount: options.imageAttachments?.length ?? 0,
                imageAttachmentsDetail: options.imageAttachments?.map(img => ({
                    name: img.name,
                    mimeType: img.mimeType,
                    base64Length: img.base64Data?.length ?? 0,
                })) ?? [],
            });
            const attachments = options.imageAttachments?.length
                ? options.imageAttachments.map((img) => ({
                    type: 'image',
                    mimeType: img.mimeType,
                    content: img.base64Data,
                }))
                : undefined;
            if (attachments) {
                console.log('[EngineRuntime] chat.send with attachments:', attachments.length, 'images,', attachments.map(a => ({ type: a.type, mimeType: a.mimeType, contentLength: a.content?.length ?? 0 })));
            }
            const chatSendParams = {
                sessionKey,
                message: outboundMessage,
                deliver: false,
                idempotencyKey: runId,
                ...(runCwd ? { cwd: runCwd } : {}),
                ...(attachments ? { attachments } : {}),
            };
            assertOpenClawChatSendPayloadWithinLimit(sessionId, chatSendParams, attachments);
            const chatSendStartMs = Date.now();
            firstResponseTiming.chatSendStartedAtMs = chatSendStartMs;
            const sendResult = await client.request(OpenClawGatewayMethod.ChatSend, chatSendParams, { timeoutMs: 90_000 });
            const chatSendElapsedMs = Date.now() - chatSendStartMs;
            firstResponseTiming.chatSendAckAtMs = Date.now();
            console.log('[EngineRuntimeTiming] chat.send acknowledged.', `Session ${sessionId}.`, `Run ${runId}.`, `Elapsed ${chatSendElapsedMs}ms.`, `Total ${formatTimingOffset(firstResponseTiming.turnStartedAtMs, firstResponseTiming.chatSendAckAtMs)}.`);
            if (chatSendElapsedMs > 10_000) {
                console.warn(`[EngineRuntime] chat.send took ${chatSendElapsedMs}ms — gateway may still be initializing`);
            }
            const returnedRunId = typeof sendResult?.runId === 'string' ? sendResult.runId.trim() : '';
            if (returnedRunId) {
                this.bindRunIdToTurn(sessionId, returnedRunId);
            }
        }
        catch (error) {
            this.cleanupSessionTurn(sessionId);
            this.store.updateSession(sessionId, { status: 'error' });
            const message = error instanceof Error ? error.message : String(error);
            this.emit('error', sessionId, message);
            this.pendingTurns.delete(sessionId);
            throw error;
        }
        await completionPromise;
    }
    async buildOutboundPrompt(sessionId, prompt, systemPrompt, agentId, mediaReferences, selectedTextSnippets, browserAnnotations, firstResponseTiming) {
        const normalizedSystemPrompt = (systemPrompt ?? '').trim();
        const planMode = isPlanModeSystemPrompt(normalizedSystemPrompt);
        const previousSystemPrompt = this.lastSystemPromptBySession.get(sessionId) ?? '';
        const shouldInjectSystemPrompt = Boolean(normalizedSystemPrompt
            && normalizedSystemPrompt !== previousSystemPrompt);
        if (normalizedSystemPrompt) {
            this.lastSystemPromptBySession.set(sessionId, normalizedSystemPrompt);
        }
        else {
            this.lastSystemPromptBySession.delete(sessionId);
        }
        const session = this.store.getSession(sessionId);
        const agent = agentId ? this.store.getAgent(agentId) : null;
        const rawCurrentModel = session?.modelOverride || agent?.model || '';
        const currentModel = rawCurrentModel ? this.normalizeModelRef(rawCurrentModel) : '';
        const sections = [];
        if (shouldInjectSystemPrompt) {
            sections.push(this.buildSystemPromptPrefix(normalizedSystemPrompt));
        }
        sections.push((0, openclawLocalTimeContextPrompt_1.buildOpenClawLocalTimeContextPrompt)());
        if (currentModel) {
            sections.push(`[Session info]\nCurrent model: ${currentModel}`);
        }
        const mediaReferenceSection = buildMediaReferencePromptSection(mediaReferences);
        if (mediaReferenceSection) {
            sections.push(mediaReferenceSection);
        }
        const selectedTextSection = (0, selectedText_1.buildSelectedTextPromptSection)(selectedTextSnippets);
        const browserAnnotationSection = (0, browserAnnotations_1.buildBrowserAnnotationPromptSection)(browserAnnotations);
        if (selectedTextSnippets?.length && selectedTextSection) {
            console.log(`[EngineRuntime] appended ${selectedTextSnippets.length} selected text excerpts with `
                + `${selectedTextSnippets.reduce((total, snippet) => total + snippet.text.length, 0)} characters `
                + `to the outbound message for session ${sessionId}`);
        }
        const continuityCapsuleBridge = this.buildContinuityCapsuleBridge(sessionId);
        const workspaceRehydrationBridge = await this.buildWorkspaceRehydrationBridge(sessionId);
        const topKEvidenceBridge = this.buildTopKEvidenceBridge(sessionId, prompt);
        if (this.bridgedSessions.has(sessionId)) {
            if (continuityCapsuleBridge) {
                sections.push(continuityCapsuleBridge);
            }
            if (workspaceRehydrationBridge) {
                sections.push(workspaceRehydrationBridge);
            }
            if (topKEvidenceBridge) {
                sections.push(topKEvidenceBridge);
            }
            if (selectedTextSection) {
                sections.push(selectedTextSection);
            }
            if (browserAnnotationSection) {
                sections.push(browserAnnotationSection);
            }
            if (prompt.trim()) {
                sections.push(`[Current user request]\n${prompt}`);
            }
            if (planMode) {
                sections.push(buildPlanModeOutboundReminder());
            }
            return sections.join('\n\n');
        }
        const client = this.requireGatewayClient();
        const sessionKey = this.toSessionKey(sessionId, agentId);
        let hasHistory = false;
        try {
            if (firstResponseTiming) {
                firstResponseTiming.chatHistoryStartedAtMs = Date.now();
            }
            const history = await client.request('chat.history', {
                sessionKey,
                limit: 1,
            }, { timeoutMs: 3_000 });
            if (firstResponseTiming) {
                firstResponseTiming.chatHistoryEndedAtMs = Date.now();
            }
            hasHistory = Array.isArray(history?.messages) && history.messages.length > 0;
            console.log('[EngineRuntimeTiming] chat.history probe finished.', `Session ${sessionId}.`, `Has history ${hasHistory}.`, `Elapsed ${formatTimingDuration(firstResponseTiming?.chatHistoryStartedAtMs, firstResponseTiming?.chatHistoryEndedAtMs)}.`, `Total ${firstResponseTiming ? formatTimingOffset(firstResponseTiming.turnStartedAtMs, firstResponseTiming.chatHistoryEndedAtMs) : 'n/a'}.`);
        }
        catch (error) {
            if (firstResponseTiming) {
                firstResponseTiming.chatHistoryEndedAtMs = Date.now();
            }
            console.warn('[EngineRuntime] chat.history check failed, continuing without history guard:', error);
        }
        this.bridgedSessions.add(sessionId);
        if (!hasHistory) {
            if (session) {
                const bridgePrefix = this.buildBridgePrefix(session.messages, prompt);
                if (bridgePrefix) {
                    sections.push(bridgePrefix);
                }
            }
        }
        if (continuityCapsuleBridge) {
            sections.push(continuityCapsuleBridge);
        }
        if (workspaceRehydrationBridge) {
            sections.push(workspaceRehydrationBridge);
        }
        if (topKEvidenceBridge) {
            sections.push(topKEvidenceBridge);
        }
        if (selectedTextSection) {
            sections.push(selectedTextSection);
        }
        if (browserAnnotationSection) {
            sections.push(browserAnnotationSection);
        }
        if (prompt.trim()) {
            sections.push(`[Current user request]\n${prompt}`);
        }
        if (planMode) {
            sections.push(buildPlanModeOutboundReminder());
        }
        return sections.join('\n\n');
    }
    buildSystemPromptPrefix(systemPrompt) {
        return [
            '[Caisra system instructions]',
            'Apply the instructions below as the highest-priority guidance for this session.',
            'If earlier Caisra system instructions exist, replace them with this version.',
            systemPrompt,
        ].join('\n');
    }
    buildBridgePrefix(messages, currentPrompt) {
        const normalizedCurrentPrompt = currentPrompt.trim();
        if (!normalizedCurrentPrompt)
            return '';
        const compactionSummaries = messages
            .filter((message) => (message.type === 'system'
            && message.metadata?.kind === coworkSystemMessages_1.CoworkSystemMessageKind.ForkCompactionSummary
            && message.content.trim()))
            .map((message) => message.content.trim());
        const source = messages
            .filter((message) => {
            if (message.type !== 'user' && message.type !== 'assistant') {
                return false;
            }
            if (!message.content.trim()) {
                return false;
            }
            if (message.metadata?.isThinking) {
                return false;
            }
            return true;
        })
            .map((message) => ({
            type: message.type,
            content: message.content.trim(),
        }));
        if (source[source.length - 1]?.type === 'user'
            && source[source.length - 1]?.content === normalizedCurrentPrompt) {
            source.pop();
        }
        const recent = source.slice(-BRIDGE_MAX_MESSAGES);
        if (recent.length === 0 && compactionSummaries.length === 0) {
            return '';
        }
        const sections = [
            '[Context bridge from previous Caisra conversation]',
            'Use this prior context for continuity. Focus your final answer on the current request.',
        ];
        for (const summary of compactionSummaries) {
            sections.push('[Engine compaction summary from the fork source]', truncate(summary, FORK_COMPACTION_SUMMARY_MAX_CHARS));
        }
        if (compactionSummaries.length > 0) {
            console.debug(`[EngineRuntime] injected ${compactionSummaries.length} fork compaction summary bridge message(s).`);
        }
        const lines = recent.map((entry) => {
            const role = entry.type === 'user' ? 'User' : 'Assistant';
            return `${role}: ${truncate(entry.content, BRIDGE_MAX_MESSAGE_CHARS)}`;
        });
        if (lines.length > 0) {
            sections.push('[Recent visible conversation before the fork]', ...lines);
        }
        return sections.join('\n');
    }
    async ensureGatewayClientReady() {
        // Serialize concurrent calls: if another init is already in progress, wait for it.
        if (this.gatewayClientInitLock) {
            await this.gatewayClientInitLock;
            return;
        }
        this.gatewayClientInitLock = this._ensureGatewayClientReadyImpl();
        try {
            await this.gatewayClientInitLock;
        }
        finally {
            this.gatewayClientInitLock = null;
        }
    }
    async _ensureGatewayClientReadyImpl() {
        console.log('[ChannelSync] ensureGatewayClientReady: starting engine gateway...');
        const engineStatus = await this.engineManager.startGateway('channel-sync-ensure-ready');
        console.log('[ChannelSync] ensureGatewayClientReady: engine phase=', engineStatus.phase, 'message=', engineStatus.message);
        if (engineStatus.phase !== 'running') {
            const message = engineStatus.message || 'The engine is not running.';
            throw new Error(message);
        }
        const connection = this.engineManager.getGatewayConnectionInfo();
        console.log('[ChannelSync] ensureGatewayClientReady: connection info — url=', connection.url ? '✓' : '✗', 'token=', connection.token ? '✓' : '✗', 'version=', connection.version, 'clientEntryPath=', connection.clientEntryPath ? '✓' : '✗');
        const missing = [];
        if (!connection.url)
            missing.push('url');
        if (!connection.token)
            missing.push('token');
        if (!connection.version)
            missing.push('version');
        if (!connection.clientEntryPath)
            missing.push('clientEntryPath');
        if (missing.length > 0) {
            throw new Error(`Engine connection info is incomplete (missing: ${missing.join(', ')})`);
        }
        const needsNewClient = !this.gatewayClient
            || this.gatewayClientVersion !== connection.version
            || this.gatewayClientEntryPath !== connection.clientEntryPath;
        console.log('[ChannelSync] ensureGatewayClientReady: needsNewClient=', needsNewClient, 'hasExistingClient=', !!this.gatewayClient);
        if (!needsNewClient && this.gatewayReadyPromise) {
            await waitWithTimeout(this.gatewayReadyPromise, GATEWAY_READY_TIMEOUT_MS);
            return;
        }
        this.stopGatewayClient();
        console.log('[ChannelSync] ensureGatewayClientReady: creating gateway client, url=', connection.url);
        await this.createGatewayClient(connection);
        console.log('[ChannelSync] ensureGatewayClientReady: createGatewayClient returned, waiting for handshake...');
        if (this.gatewayReadyPromise) {
            await waitWithTimeout(this.gatewayReadyPromise, GATEWAY_READY_TIMEOUT_MS);
        }
        console.log('[ChannelSync] ensureGatewayClientReady: gateway client created and ready');
    }
    async createGatewayClient(connection) {
        const GatewayClient = await this.loadGatewayClientCtor(connection.clientEntryPath);
        const clientGeneration = ++this.gatewayClientGeneration;
        let resolveReady = null;
        let rejectReady = null;
        let settled = false;
        this.gatewayReadyPromise = new Promise((resolve, reject) => {
            resolveReady = resolve;
            rejectReady = reject;
            this.gatewayReadyReject = reject;
        });
        const settleResolve = () => {
            if (settled)
                return;
            settled = true;
            this.gatewayReadyReject = null;
            resolveReady?.();
        };
        const settleReject = (error) => {
            if (settled)
                return;
            settled = true;
            this.gatewayReadyReject = null;
            rejectReady?.(error);
        };
        const client = new GatewayClient({
            url: connection.url,
            token: connection.token,
            clientDisplayName: 'Caisra',
            clientVersion: electron_1.app.getVersion(),
            mode: 'backend',
            caps: [OPENCLAW_GATEWAY_TOOL_EVENTS_CAP],
            role: 'operator',
            scopes: ['operator.admin'],
            onHelloOk: () => {
                if (clientGeneration !== this.gatewayClientGeneration) {
                    console.debug('[ChannelSync] ignored hello from a stale gateway client generation');
                    return;
                }
                console.log('[ChannelSync] GatewayClient: onHelloOk — handshake succeeded');
                // Expose the client only after the connect handshake completes.
                // Setting gatewayClient earlier would let concurrent code send
                // request frames before the connect frame, causing 1008 rejection.
                this.gatewayClient = client;
                this.gatewayClientVersion = connection.version;
                this.gatewayClientEntryPath = connection.clientEntryPath;
                this.gatewayReconnectSuppressed = false;
                this.gatewayReconnectAttempt = 0;
                this.resetGatewayRpcHealth();
                this.subscribeToGatewaySessionEvents(client);
                settleResolve();
                try {
                    this.options.onGatewayClientReady?.();
                }
                catch (error) {
                    console.warn('[EngineRuntime] gateway ready callback failed:', error);
                }
                this.lastTickTimestamp = Date.now();
                this.startTickWatchdog();
            },
            onConnectError: (error) => {
                console.error('[ChannelSync] GatewayClient: onConnectError —', error.message);
                // Don't reject on transient connect errors — the GatewayClient has
                // built-in reconnection logic and will retry automatically.  Let the
                // outer waitWithTimeout be the single authority on giving up.  Only
                // reject immediately for definitive auth failures that won't resolve
                // on retry (e.g. invalid token, access denied).
                const msg = error.message.toLowerCase();
                const isAuthFailure = msg.includes('auth') || msg.includes('denied') || msg.includes('forbidden');
                if (isAuthFailure) {
                    settleReject(error);
                }
                else {
                    console.log('[ChannelSync] GatewayClient: transient connect error, waiting for auto-reconnect...');
                }
            },
            onClose: (_code, reason) => {
                console.log('[ChannelSync] GatewayClient: onClose — code:', _code, 'reason:', reason, 'settled:', settled);
                if (clientGeneration !== this.gatewayClientGeneration) {
                    console.debug('[ChannelSync] ignored close from a stale gateway client generation');
                    return;
                }
                if (!settled) {
                    // v2026.4.5+: The initial handshake may fail due to the gateway
                    // being busy with plugin loading (connect.challenge timeout on the
                    // server side).  The GatewayClient internally reconnects and
                    // typically succeeds on the next attempt.  Don't reject the promise
                    // or discard the client here — let waitWithTimeout handle the
                    // overall deadline.  The onHelloOk callback will settle the promise
                    // when the reconnection succeeds.
                    console.log('[ChannelSync] GatewayClient: connection closed before handshake, waiting for auto-reconnect...');
                    return;
                }
                // If stopGatewayClient() triggered this onClose, don't do anything —
                // the caller is already handling cleanup and may be creating a new client.
                if (this.gatewayStoppingIntentionally) {
                    return;
                }
                console.warn('[EngineRuntime] gateway WS disconnected — code:', _code, 'reason:', reason);
                if (_code === WebSocketCloseCode.ServiceRestart) {
                    // The gateway is restarting itself after a config reload. Flag the
                    // window so the supervisor doesn't kill the process mid-restart
                    // (which poisons the single-instance lock file on Windows).
                    this.engineManager.noteGatewaySelfRestart(reason || 'service restart');
                }
                const gatewayFailure = typeof this.engineManager.getLastGatewayFailure === 'function'
                    ? this.engineManager.getLastGatewayFailure()
                    : null;
                const failureMatchesConnectionGeneration = gatewayFailure
                    && (connection.generation === undefined || gatewayFailure.generation === connection.generation);
                const disconnectedMessage = failureMatchesConnectionGeneration
                    && gatewayFailure.kind === constants_5.OpenClawGatewayFailureKind.HeapOutOfMemory
                    ? `The engine failed: gatewayFailureKind=${gatewayFailure.kind}; `
                        + `generation=${gatewayFailure.generation}; code=${gatewayFailure.exitCode ?? _code}`
                    : _code === WebSocketCloseCode.MessageTooBig
                        ? (reason || 'gateway closed (1009):')
                        : (reason || 'The engine connection was lost');
                const disconnectedError = new Error(disconnectedMessage);
                const activeSessionIds = Array.from(this.activeTurns.keys());
                activeSessionIds.forEach((sessionId) => {
                    this.store.updateSession(sessionId, { status: 'error' });
                    this.emit('error', sessionId, disconnectedError.message);
                    this.cleanupSessionTurn(sessionId);
                    this.rejectTurn(sessionId, disconnectedError);
                });
                this.stopGatewayClient();
                this.gatewayReadyPromise = Promise.reject(disconnectedError);
                this.gatewayReadyPromise.catch(() => {
                    // suppress unhandled rejection noise; auto-reconnect will re-establish
                });
                // Auto-reconnect after unexpected disconnect
                this.scheduleGatewayReconnect();
            },
            onEvent: (event) => {
                this.handleGatewayEvent(event);
            },
        });
        // gatewayClient/version/entryPath are now set inside onHelloOk,
        // after the connect handshake succeeds. We only keep a local ref
        // for stopGatewayClient() cleanup if start() fails synchronously.
        this.pendingGatewayClient = client;
        client.start();
    }
    subscribeToGatewaySessionEvents(client) {
        void client.request(OpenClawGatewayMethod.SessionsSubscribe, {}, { timeoutMs: OpenClawRuntimeAdapter.GATEWAY_SESSION_SUBSCRIBE_TIMEOUT_MS }).then((result) => {
            if (result?.subscribed !== true) {
                console.warn('[ChannelSync] gateway session event subscription was not confirmed.');
                return;
            }
            console.log('[ChannelSync] subscribed to gateway session lifecycle events.');
        }).catch((error) => {
            // Polling remains available as a compatibility fallback if an older or
            // temporarily degraded gateway cannot establish the subscription.
            console.warn('[ChannelSync] failed to subscribe to gateway session lifecycle events:', error);
        });
    }
    stopGatewayClient() {
        this.gatewayStoppingIntentionally = true;
        this.failAllPendingBtwRuns((0, i18n_1.t)('coworkBtwDisconnected'), 'gateway stopped');
        this.gatewayClientGeneration += 1;
        this.stopChannelPolling();
        this.cancelGatewayReconnect();
        this.stopTickWatchdog();
        // Stop whichever client exists — the promoted one or the pending one.
        const clientToStop = this.gatewayClient ?? this.pendingGatewayClient;
        try {
            clientToStop?.stop();
        }
        catch (error) {
            console.warn('[EngineRuntime] Failed to stop gateway client:', error);
        }
        this.gatewayClient = null;
        this.pendingGatewayClient = null;
        this.gatewayClientVersion = null;
        this.gatewayClientEntryPath = null;
        if (this.gatewayReadyReject) {
            const stoppedBeforeReadyError = new Error('The engine connection stopped before the handshake completed.');
            this.gatewayReadyPromise?.catch(() => {
                // suppress unhandled rejection when no caller is currently awaiting readiness
            });
            this.gatewayReadyReject(stoppedBeforeReadyError);
            this.gatewayReadyReject = null;
        }
        this.gatewayReadyPromise = null;
        this.channelSessionSync?.clearCache();
        this.sessionModelPatchStateBySession.clear();
        this.goalSnapshotBySessionId.clear();
        this.contextUsageInFlightBySession.clear();
        this.contextUsageListInFlight.clear();
        this.resetGatewayRpcHealth();
        this.knownChannelSessionIds.clear();
        this.heartbeatSessionKeys.clear();
        this.channelLifecycleRunBySessionKey.clear();
        this.stoppedSessions.clear();
        this.recentlyClosedRunIds.clear();
        this.terminalBtwRunIds.clear();
        this.lastTickTimestamp = 0;
        // Clear messageUpdate throttle state
        for (const timer of this.pendingMessageUpdateTimer.values()) {
            clearTimeout(timer);
        }
        this.pendingMessageUpdateTimer.clear();
        this.lastMessageUpdateEmitTime.clear();
        this.turnHistorySync.dispose();
        this.gatewayStoppingIntentionally = false;
    }
    registerPendingBtwRun(input) {
        const timeoutSeconds = Number.isFinite(this.agentTimeoutSeconds)
            ? Math.max(1, this.agentTimeoutSeconds)
            : openclawConfigSync_1.OPENCLAW_AGENT_TIMEOUT_SECONDS;
        const timeoutMs = (timeoutSeconds * 1000)
            + OpenClawRuntimeAdapter.CLIENT_TIMEOUT_GRACE_MS;
        let pending;
        const timeoutTimer = setTimeout(() => {
            this.failPendingBtwRun(pending, (0, i18n_1.t)('coworkBtwTimeout'), 'timeout');
        }, timeoutMs);
        pending = {
            ...input,
            gatewayRunIds: new Set([input.clientRunId]),
            createdAt: Date.now(),
            timeoutTimer,
            stopRequested: false,
        };
        this.terminalBtwRunIds.delete(input.clientRunId);
        this.pendingBtwRuns.set(input.clientRunId, pending);
        this.pendingBtwRunBySessionId.set(input.sessionId, pending);
        return pending;
    }
    addPendingBtwRunAlias(pending, runId) {
        const normalizedRunId = runId.trim();
        if (!normalizedRunId)
            return false;
        if (this.pendingBtwRunBySessionId.get(pending.sessionId) !== pending) {
            if (this.isTerminalBtwRunId(pending.clientRunId)) {
                this.rememberTerminalBtwRunId(normalizedRunId);
            }
            return true;
        }
        if (this.sessionIdByRunId.has(normalizedRunId)) {
            this.failPendingBtwRun(pending, (0, i18n_1.t)('coworkBtwInvalidResult'), 'gateway run id collided with a main run');
            return false;
        }
        const existing = this.pendingBtwRuns.get(normalizedRunId);
        if (existing && existing !== pending) {
            console.warn('[CoworkBtw] refused duplicate gateway run id alias.', `Run ${normalizedRunId}.`, `Session ${pending.sessionId}.`);
            this.failPendingBtwRun(pending, (0, i18n_1.t)('coworkBtwInvalidResult'), 'duplicate gateway run id alias');
            return false;
        }
        pending.gatewayRunIds.add(normalizedRunId);
        this.pendingBtwRuns.set(normalizedRunId, pending);
        return true;
    }
    cleanupPendingBtwRun(pending) {
        clearTimeout(pending.timeoutTimer);
        for (const gatewayRunId of pending.gatewayRunIds) {
            if (this.pendingBtwRuns.get(gatewayRunId) === pending) {
                this.pendingBtwRuns.delete(gatewayRunId);
            }
            this.rememberTerminalBtwRunId(gatewayRunId);
        }
        if (this.pendingBtwRunBySessionId.get(pending.sessionId) === pending) {
            this.pendingBtwRunBySessionId.delete(pending.sessionId);
        }
    }
    finishPendingBtwRun(pending, result) {
        if (this.pendingBtwRunBySessionId.get(pending.sessionId) !== pending)
            return;
        this.cleanupPendingBtwRun(pending);
        const completedAt = Date.now();
        const entry = result.error
            ? {
                runId: pending.clientRunId,
                sessionId: pending.sessionId,
                question: pending.question,
                status: btw_1.CoworkBtwStatus.Failed,
                error: result.error,
                createdAt: pending.createdAt,
                completedAt,
            }
            : {
                runId: pending.clientRunId,
                sessionId: pending.sessionId,
                question: pending.question,
                status: btw_1.CoworkBtwStatus.Answered,
                answer: result.answer ?? '',
                createdAt: pending.createdAt,
                completedAt,
            };
        this.emit('btwResult', pending.sessionId, entry);
    }
    failPendingBtwRun(pending, error, reason) {
        if (this.pendingBtwRunBySessionId.get(pending.sessionId) !== pending)
            return;
        const normalizedError = error.trim() || (0, i18n_1.t)('coworkBtwFailed');
        console.warn('[CoworkBtw] side question failed.', `Session ${pending.sessionId}.`, `Run ${pending.clientRunId}.`, `Reason ${reason}.`);
        this.finishPendingBtwRun(pending, { error: normalizedError });
    }
    stopPendingBtwRun(pending, reason) {
        if (this.pendingBtwRunBySessionId.get(pending.sessionId) !== pending)
            return;
        this.cleanupPendingBtwRun(pending);
        console.log('[CoworkBtw] side question stopped.', `Session ${pending.sessionId}.`, `Run ${pending.clientRunId}.`, `Reason ${reason}.`);
        this.emit('btwResult', pending.sessionId, {
            runId: pending.clientRunId,
            sessionId: pending.sessionId,
            question: pending.question,
            status: btw_1.CoworkBtwStatus.Stopped,
            createdAt: pending.createdAt,
            completedAt: Date.now(),
        });
    }
    failAllPendingBtwRuns(error, reason) {
        const pendingRuns = Array.from(new Set(this.pendingBtwRunBySessionId.values()));
        for (const pending of pendingRuns) {
            this.failPendingBtwRun(pending, error, reason);
        }
    }
    discardPendingBtwRunsForSession(sessionId) {
        const pending = this.pendingBtwRunBySessionId.get(sessionId);
        if (!pending)
            return;
        this.cleanupPendingBtwRun(pending);
    }
    pruneTerminalBtwRunIds(now = Date.now()) {
        for (const [runId, expiresAt] of this.terminalBtwRunIds.entries()) {
            if (expiresAt <= now) {
                this.terminalBtwRunIds.delete(runId);
            }
        }
        while (this.terminalBtwRunIds.size > OpenClawRuntimeAdapter.TERMINAL_BTW_RUN_ID_LIMIT) {
            const oldestRunId = this.terminalBtwRunIds.keys().next().value;
            if (!oldestRunId)
                return;
            this.terminalBtwRunIds.delete(oldestRunId);
        }
    }
    rememberTerminalBtwRunId(runId) {
        const normalizedRunId = runId.trim();
        if (!normalizedRunId)
            return;
        const now = Date.now();
        this.terminalBtwRunIds.delete(normalizedRunId);
        this.terminalBtwRunIds.set(normalizedRunId, now + OpenClawRuntimeAdapter.TERMINAL_BTW_RUN_ID_TTL_MS);
        this.pruneTerminalBtwRunIds(now);
    }
    isTerminalBtwRunId(runId) {
        const normalizedRunId = runId.trim();
        if (!normalizedRunId)
            return false;
        const expiresAt = this.terminalBtwRunIds.get(normalizedRunId);
        if (!expiresAt)
            return false;
        if (expiresAt <= Date.now()) {
            this.terminalBtwRunIds.delete(normalizedRunId);
            return false;
        }
        return true;
    }
    pruneRecentlyClosedRunIds(now = Date.now()) {
        for (const [runId, info] of this.recentlyClosedRunIds.entries()) {
            if (info.expiresAt <= now) {
                this.recentlyClosedRunIds.delete(runId);
            }
        }
        while (this.recentlyClosedRunIds.size > OpenClawRuntimeAdapter.RECENTLY_CLOSED_RUN_ID_LIMIT) {
            const oldestRunId = this.recentlyClosedRunIds.keys().next().value;
            if (!oldestRunId)
                return;
            this.recentlyClosedRunIds.delete(oldestRunId);
        }
    }
    rememberRecentlyClosedRunId(runId, options = {}) {
        const normalizedRunId = runId.trim();
        if (!normalizedRunId)
            return;
        const now = Date.now();
        this.recentlyClosedRunIds.set(normalizedRunId, {
            closedAt: now,
            expiresAt: now + OpenClawRuntimeAdapter.RECENTLY_CLOSED_RUN_ID_TTL_MS,
            ...(options.sessionId ? { sessionId: options.sessionId } : {}),
            ...(options.sessionKey ? { sessionKey: options.sessionKey } : {}),
            ...(options.allowRetryReopen ? { allowRetryReopen: true } : {}),
        });
        this.pruneRecentlyClosedRunIds(now);
    }
    getRecentlyClosedRunInfo(runId) {
        const normalizedRunId = runId.trim();
        if (!normalizedRunId)
            return null;
        const info = this.recentlyClosedRunIds.get(normalizedRunId);
        if (!info)
            return null;
        if (info.expiresAt <= Date.now()) {
            this.recentlyClosedRunIds.delete(normalizedRunId);
            return null;
        }
        return info;
    }
    isRecentlyClosedRunId(runId) {
        return this.getRecentlyClosedRunInfo(runId) !== null;
    }
    canReopenRecentlyClosedRunForRetry(runId, sessionId, sessionKey) {
        const info = this.getRecentlyClosedRunInfo(runId);
        if (!info?.allowRetryReopen) {
            return false;
        }
        if (info.sessionId && info.sessionId !== sessionId) {
            return false;
        }
        if (info.sessionKey && info.sessionKey !== sessionKey) {
            return false;
        }
        if (this.terminatedRunIds.has(runId)) {
            return false;
        }
        if (this.isSessionInStopCooldown(sessionId)) {
            return false;
        }
        if (this.manuallyStoppedSessions.has(sessionId) && (0, openclawChannelSessionSync_1.isManagedSessionKey)(sessionKey)) {
            return false;
        }
        return true;
    }
    reopenRecentlyClosedRunForRetry(sessionId, sessionKey, runId) {
        const normalizedRunId = runId.trim();
        if (!normalizedRunId || !this.canReopenRecentlyClosedRunForRetry(normalizedRunId, sessionId, sessionKey)) {
            return false;
        }
        this.recentlyClosedRunIds.delete(normalizedRunId);
        this.lastChatSeqByRunId.delete(normalizedRunId);
        this.lastAgentSeqByRunId.delete(normalizedRunId);
        this.pendingAgentEventsByRunId.delete(normalizedRunId);
        this.ensureActiveTurn(sessionId, sessionKey, normalizedRunId);
        const turn = this.activeTurns.get(sessionId);
        if (!turn) {
            return false;
        }
        turn.pendingRecoverableFollowup = true;
        turn.pendingOpenClawRetry = true;
        turn.reopenedFromClosedRun = true;
        this.bindRunIdToTurn(sessionId, normalizedRunId);
        console.log(`[EngineRuntime] reopened recently closed run ${normalizedRunId} for a same-run retry in session ${sessionId}.`);
        return true;
    }
    cancelGatewayReconnect() {
        if (this.gatewayReconnectTimer) {
            clearTimeout(this.gatewayReconnectTimer);
            this.gatewayReconnectTimer = null;
        }
    }
    /**
     * Throttled emit for messageUpdate during streaming.
     * OpenClaw sends full-replacement deltas, so intermediate updates can be safely skipped.
     * Uses leading + trailing pattern: emit immediately if enough time has passed,
     * otherwise schedule a trailing emit to deliver the latest content.
     */
    throttledEmitMessageUpdate(sessionId, messageId, content) {
        const now = Date.now();
        const lastEmit = this.lastMessageUpdateEmitTime.get(messageId) ?? 0;
        const elapsed = now - lastEmit;
        if (elapsed >= OpenClawRuntimeAdapter.MESSAGE_UPDATE_THROTTLE_MS) {
            this.clearPendingMessageUpdate(messageId);
            this.lastMessageUpdateEmitTime.set(messageId, now);
            this.emit('messageUpdate', sessionId, messageId, content);
            return;
        }
        // Schedule a trailing emit to ensure the latest content is delivered
        this.clearPendingMessageUpdate(messageId);
        this.pendingMessageUpdateTimer.set(messageId, setTimeout(() => {
            this.pendingMessageUpdateTimer.delete(messageId);
            this.lastMessageUpdateEmitTime.set(messageId, Date.now());
            this.emit('messageUpdate', sessionId, messageId, content);
        }, OpenClawRuntimeAdapter.MESSAGE_UPDATE_THROTTLE_MS - elapsed));
    }
    clearPendingMessageUpdate(messageId) {
        const timer = this.pendingMessageUpdateTimer.get(messageId);
        if (timer) {
            clearTimeout(timer);
            this.pendingMessageUpdateTimer.delete(messageId);
        }
    }
    /**
     * Throttled SQLite store write for streaming message updates.
     * Uses leading + trailing pattern identical to throttledEmitMessageUpdate.
     * Final correctness is guaranteed by syncFinalAssistantWithHistory.
     */
    throttledStoreUpdateMessage(sessionId, messageId, content, metadata) {
        const now = Date.now();
        const lastUpdate = this.lastStoreUpdateTime.get(messageId) ?? 0;
        const elapsed = now - lastUpdate;
        if (elapsed >= OpenClawRuntimeAdapter.STORE_UPDATE_THROTTLE_MS) {
            this.clearPendingStoreUpdate(messageId);
            this.lastStoreUpdateTime.set(messageId, now);
            this.store.updateMessage(sessionId, messageId, { content, metadata });
            return;
        }
        // Schedule a trailing write to ensure the latest content is persisted
        this.clearPendingStoreUpdate(messageId);
        this.pendingStoreUpdateTimer.set(messageId, setTimeout(() => {
            this.pendingStoreUpdateTimer.delete(messageId);
            this.lastStoreUpdateTime.set(messageId, Date.now());
            // Guard: skip write if the session turn has already been cleaned up
            const activeTurn = this.activeTurns.get(sessionId);
            if (activeTurn?.assistantMessageId === messageId || activeTurn?.thinking.messageId === messageId) {
                this.store.updateMessage(sessionId, messageId, { content, metadata });
            }
        }, OpenClawRuntimeAdapter.STORE_UPDATE_THROTTLE_MS - elapsed));
    }
    clearPendingStoreUpdate(messageId) {
        const timer = this.pendingStoreUpdateTimer.get(messageId);
        if (timer) {
            clearTimeout(timer);
            this.pendingStoreUpdateTimer.delete(messageId);
        }
    }
    resolveCurrentModelForSession(sessionId) {
        const session = this.store.getSession(sessionId);
        if (session?.modelOverride) {
            return session.modelOverride;
        }
        const agent = session?.agentId ? this.store.getAgent(session.agentId) : null;
        const rawCurrentModel = agent?.model || '';
        if (!rawCurrentModel)
            return '';
        return this.normalizeModelRef(rawCurrentModel);
    }
    /** Builds the persisted error detail, annotated with the failing model's LobsterAI source. */
    buildTurnErrorDetail(sessionId, turn, rawErrorMessage, displayMessage, metadata) {
        let fallbackModelRef = turn?.model?.trim() || '';
        if (!fallbackModelRef) {
            try {
                fallbackModelRef = this.resolveCurrentModelForSession(sessionId);
            }
            catch {
                fallbackModelRef = '';
            }
        }
        return buildOpenClawRuntimeErrorDetail(rawErrorMessage, displayMessage, metadata, {
            fallbackModelRef: fallbackModelRef || undefined,
            resolveModelSource: openclawConfigSync_1.resolveModelSourceForOpenClawProvider,
        });
    }
    /**
     * The runtime ends a critically tool-loop-vetoed run with its generic
     * incomplete-turn copy, which reads like a model failure. When this turn saw
     * a loop veto, surface an honest localized message instead and keep the veto
     * reason in the technical detail for diagnosis.
     */
    resolveTurnErrorMessageWithToolLoopContext(turn, rawErrorMessage, metadata) {
        const override = resolveOpenClawToolLoopErrorOverride(turn?.toolLoopBlockReason, rawErrorMessage);
        if (override) {
            return {
                resolvedError: buildResolvedRuntimeError(override.errorMessage),
                detailRawErrorMessage: override.detailRawErrorMessage,
            };
        }
        return {
            resolvedError: resolveOpenClawRuntimeError(rawErrorMessage, metadata),
            detailRawErrorMessage: rawErrorMessage,
        };
    }
    finalizeStoppedStreamingMessage(sessionId, messageId, content, model) {
        if (!messageId)
            return;
        this.clearPendingStoreUpdate(messageId);
        this.clearPendingMessageUpdate(messageId);
        this.lastStoreUpdateTime.delete(messageId);
        this.lastMessageUpdateEmitTime.delete(messageId);
        const session = this.store.getSession(sessionId);
        const message = session?.messages.find((item) => item.id === messageId);
        if (!message)
            return;
        const finalContent = content || message.content;
        const existingModel = typeof message.metadata?.model === 'string' && message.metadata.model.trim()
            ? message.metadata.model
            : '';
        const metadata = {
            ...message.metadata,
            isStreaming: false,
            isFinal: true,
            ...(existingModel ? { model: existingModel } : model ? { model } : {}),
        };
        this.store.updateMessage(sessionId, messageId, {
            content: finalContent,
            metadata,
        });
        console.debug(`[EngineRuntime] finalized stopped streaming message for session ${sessionId}.`, `Message ${messageId}.`, `Model ${metadata.model ?? 'none'}.`);
        this.emit('messageUpdate', sessionId, messageId, finalContent, metadata);
    }
    finalizeStoppedStreamingMessages(sessionId, turn) {
        const model = turn.model || this.resolveCurrentModelForSession(sessionId);
        this.finalizeStoppedStreamingMessage(sessionId, turn.thinking.messageId, turn.thinking.currentText, model);
        this.finalizeStoppedStreamingMessage(sessionId, turn.assistantMessageId, turn.currentAssistantSegmentText || turn.currentText, model);
    }
    syncToolResultsFromHistory(sessionId, turn, historyMessages) {
        this.syncBackfillableToolsFromHistory(sessionId, turn, historyMessages);
        for (const msg of historyMessages) {
            if (!isRecord(msg))
                continue;
            const msgRole = typeof msg.role === 'string' ? msg.role.trim() : '';
            if (!(0, historyBackfill_1.isHistoryToolResultRole)(msgRole)) {
                continue;
            }
            const msgToolCallId = (0, historyBackfill_1.getHistoryToolCallId)(msg);
            if (!msgToolCallId)
                continue;
            const text = extractMessageText(msg);
            if (!text.trim())
                continue;
            const existingResultMsgId = turn.toolResultMessageIdByToolCallId.get(msgToolCallId);
            const hasKnownToolUse = turn.toolUseMessageIdByToolCallId.has(msgToolCallId);
            if (!hasKnownToolUse && !existingResultMsgId) {
                console.debug('[EngineRuntime] skipped a tool result from chat history because it is not part of the current turn and was not backfillable.', `sessionId=${sessionId}`, `toolCallId=${msgToolCallId}`, `toolName=${(0, historyBackfill_1.getHistoryToolName)(msg) || 'unknown'}`, `role=${msgRole}`, `len=${text.length}`);
                continue;
            }
            const existingText = turn.toolResultTextByToolCallId.get(msgToolCallId) ?? '';
            if (text.length <= existingText.length)
                continue;
            const isError = Boolean(msg.isError);
            const metadata = {
                toolResult: text,
                toolUseId: msgToolCallId,
                isError,
                isStreaming: false,
                isFinal: true,
            };
            if (existingResultMsgId) {
                this.store.updateMessage(sessionId, existingResultMsgId, {
                    content: text,
                    metadata,
                });
                turn.toolResultTextByToolCallId.set(msgToolCallId, text);
                this.emit('messageUpdate', sessionId, existingResultMsgId, text);
            }
            else {
                const resultMessage = this.store.addMessage(sessionId, {
                    type: 'tool_result',
                    content: text,
                    metadata,
                });
                turn.toolResultMessageIdByToolCallId.set(msgToolCallId, resultMessage.id);
                turn.toolResultTextByToolCallId.set(msgToolCallId, text);
                this.emit('message', sessionId, resultMessage);
            }
            console.debug('[EngineRuntime] backfilled a tool result from chat history.', `sessionId=${sessionId}`, `toolCallId=${msgToolCallId}`, `len=${text.length}`, `prevLen=${existingText.length}`);
        }
    }
    syncBackfillableToolsFromHistory(sessionId, turn, historyMessages) {
        const entries = (0, historyBackfill_1.collectBackfillableHistoryToolEntries)(historyMessages);
        if (entries.length === 0)
            return;
        const session = this.store.getSession(sessionId);
        const existingToolUseIds = new Map();
        const existingToolResultIds = new Map();
        for (const message of session?.messages ?? []) {
            if (!isRecord(message))
                continue;
            const metadata = isRecord(message.metadata) ? message.metadata : {};
            const toolUseId = typeof metadata.toolUseId === 'string' ? metadata.toolUseId.trim() : '';
            if (!toolUseId)
                continue;
            if (message.type === 'tool_use') {
                existingToolUseIds.set(toolUseId, message.id);
            }
            else if (message.type === 'tool_result') {
                existingToolResultIds.set(toolUseId, {
                    messageId: message.id,
                    text: typeof message.content === 'string' ? message.content : '',
                });
            }
        }
        let materializedToolUses = 0;
        let materializedToolResults = 0;
        let trackerUpdates = 0;
        for (const entry of entries) {
            const existingToolUseMessageId = existingToolUseIds.get(entry.toolCallId);
            if (!turn.toolUseMessageIdByToolCallId.has(entry.toolCallId) && existingToolUseMessageId) {
                turn.toolUseMessageIdByToolCallId.set(entry.toolCallId, existingToolUseMessageId);
            }
            if (!turn.toolUseMessageIdByToolCallId.has(entry.toolCallId) && !existingToolUseMessageId) {
                const toolUseMessage = this.store.addMessage(sessionId, {
                    type: 'tool_use',
                    content: `Using tool: ${entry.toolName}`,
                    metadata: {
                        toolName: entry.toolName,
                        toolInput: entry.args,
                        toolUseId: entry.toolCallId,
                        isStreaming: false,
                        isFinal: true,
                    },
                });
                turn.toolUseMessageIdByToolCallId.set(entry.toolCallId, toolUseMessage.id);
                existingToolUseIds.set(entry.toolCallId, toolUseMessage.id);
                materializedToolUses++;
                this.emit('message', sessionId, toolUseMessage);
            }
            const existingToolResult = existingToolResultIds.get(entry.toolCallId);
            if (!turn.toolResultMessageIdByToolCallId.has(entry.toolCallId) && existingToolResult) {
                turn.toolResultMessageIdByToolCallId.set(entry.toolCallId, existingToolResult.messageId);
                turn.toolResultTextByToolCallId.set(entry.toolCallId, existingToolResult.text);
            }
            if (!turn.toolResultMessageIdByToolCallId.has(entry.toolCallId) && !existingToolResult) {
                const resultMessage = this.store.addMessage(sessionId, {
                    type: 'tool_result',
                    content: entry.resultText,
                    metadata: {
                        toolResult: entry.resultText,
                        toolUseId: entry.toolCallId,
                        isError: entry.resultIsError,
                        isStreaming: false,
                        isFinal: true,
                    },
                });
                turn.toolResultMessageIdByToolCallId.set(entry.toolCallId, resultMessage.id);
                turn.toolResultTextByToolCallId.set(entry.toolCallId, entry.resultText);
                existingToolResultIds.set(entry.toolCallId, {
                    messageId: resultMessage.id,
                    text: entry.resultText,
                });
                materializedToolResults++;
                this.emit('message', sessionId, resultMessage);
            }
            if (entry.toolName === 'sessions_spawn') {
                this.subagentTracker.onHistorySpawnResult({
                    toolCallId: entry.toolCallId,
                    args: entry.args,
                    resultText: entry.resultText,
                    parentSessionId: sessionId,
                    createdAt: entry.resultTimestamp,
                });
                trackerUpdates++;
            }
            else if (entry.toolName === 'sessions_resume' || entry.toolName === 'sessions_read') {
                this.subagentTracker.onResumeOrReadResult(entry.args);
                trackerUpdates++;
            }
        }
        if (materializedToolUses > 0 || materializedToolResults > 0 || trackerUpdates > 0) {
            console.log('[EngineRuntime] synced backfillable tools from chat.history', `sessionId=${sessionId}`, `entries=${entries.length}`, `toolUses=${materializedToolUses}`, `toolResults=${materializedToolResults}`, `trackerUpdates=${trackerUpdates}`, `tools=${entries.map((entry) => `${entry.toolName}:${entry.toolCallId}`).join(',')}`);
        }
    }
    /** Flush any pending throttled store write immediately (e.g. before segment split or final sync). */
    flushPendingStoreUpdate(sessionId, messageId) {
        const timer = this.pendingStoreUpdateTimer.get(messageId);
        if (!timer)
            return;
        clearTimeout(timer);
        this.pendingStoreUpdateTimer.delete(messageId);
        this.lastStoreUpdateTime.set(messageId, Date.now());
        // Persist the latest in-memory content only; caller is responsible for metadata.
        const turn = this.activeTurns.get(sessionId);
        if (turn?.assistantMessageId === messageId && turn.currentAssistantSegmentText) {
            this.store.updateMessage(sessionId, messageId, {
                content: turn.currentAssistantSegmentText,
            });
        }
    }
    // ─── Incremental Tool Result Backfill ─────────────────────────────────────────
    /**
     * Apply one history response to thinking blocks and incomplete local tool results.
     */
    handleIncrementalBackfillHistory(sessionId, messages) {
        const turn = this.activeTurns.get(sessionId);
        if (!turn)
            return;
        (0, diagnostics_1.logThinkingDiagnostic)('history-incremental-backfill', `sessionId=${sessionId}`, `messages=${messages.length}`, (0, diagnostics_1.summarizeCurrentTurnThinkingHistoryForDiagnostics)(messages));
        this.thinkingController.reconcile(sessionId, turn, messages, false);
        for (const message of messages) {
            if (!isRecord(message))
                continue;
            const role = typeof message.role === 'string' ? message.role : '';
            const toolCallId = typeof message.toolCallId === 'string' ? message.toolCallId.trim()
                : typeof message.tool_call_id === 'string' ? message.tool_call_id.trim()
                    : '';
            if (!toolCallId || (role !== 'toolResult' && role !== 'tool'))
                continue;
            const text = extractMessageText(message);
            const resultMessageId = turn.toolResultMessageIdByToolCallId.get(toolCallId);
            const previousText = turn.toolResultTextByToolCallId.get(toolCallId) ?? '';
            if (!text.trim() || text.length <= previousText.length || !resultMessageId)
                continue;
            this.store.updateMessage(sessionId, resultMessageId, {
                content: text,
                metadata: {
                    toolResult: text,
                    toolUseId: toolCallId,
                    isError: Boolean(message.isError),
                    isStreaming: false,
                    isFinal: true,
                },
            });
            turn.toolResultTextByToolCallId.set(toolCallId, text);
            this.emit('messageUpdate', sessionId, resultMessageId, text);
            this.subagentTracker.onBackfillResult(toolCallId, text);
            console.log('[EngineRuntime] incremental backfill from chat.history', `toolCallId=${toolCallId}`, `len=${text.length}`, `prevLen=${previousText.length}`);
        }
    }
    startTickWatchdog() {
        this.stopTickWatchdog();
        console.log('[TickWatchdog] started');
        this.tickWatchdogTimer = setInterval(() => {
            this.checkTickHealth();
        }, OpenClawRuntimeAdapter.TICK_WATCHDOG_INTERVAL_MS);
    }
    stopTickWatchdog() {
        if (this.tickWatchdogTimer) {
            clearInterval(this.tickWatchdogTimer);
            this.tickWatchdogTimer = null;
        }
    }
    checkTickHealth() {
        if (this.lastTickTimestamp <= 0)
            return;
        const elapsed = Date.now() - this.lastTickTimestamp;
        if (elapsed <= OpenClawRuntimeAdapter.TICK_TIMEOUT_MS)
            return;
        console.warn(`[TickWatchdog] no tick received for ${Math.round(elapsed / 1000)}s (threshold: ${OpenClawRuntimeAdapter.TICK_TIMEOUT_MS / 1000}s) — connection is likely dead, triggering reconnect`);
        this.cancelGatewayReconnect();
        this.stopGatewayClient();
        this.gatewayReconnectAttempt = 0;
        this.scheduleGatewayReconnect();
    }
    /**
     * Called when the system resumes from sleep/suspend.
     * Resets the reconnect counter and triggers an immediate reconnect or health check.
     */
    onSystemResume() {
        if (this.gatewayReconnectSuppressed) {
            console.log('[GatewayReconnect] skipped system resume reconnect because gateway reconnect is suppressed');
            return;
        }
        console.log('[GatewayReconnect] system resumed from sleep');
        this.cancelGatewayReconnect();
        this.gatewayReconnectAttempt = 0;
        if (!this.gatewayClient) {
            void this.attemptGatewayReconnect();
        }
        else {
            this.checkTickHealth();
        }
    }
    /**
     * Schedule an automatic gateway WS reconnection attempt with exponential backoff.
     * Called from onClose when the connection drops unexpectedly after a successful handshake.
     */
    scheduleGatewayReconnect() {
        if (this.gatewayReconnectSuppressed) {
            console.log('[GatewayReconnect] skipped reconnect scheduling because gateway reconnect is suppressed');
            return;
        }
        if (this.gatewayReconnectAttempt >= OpenClawRuntimeAdapter.GATEWAY_RECONNECT_MAX_ATTEMPTS) {
            console.error('[GatewayReconnect] max attempts reached (' + OpenClawRuntimeAdapter.GATEWAY_RECONNECT_MAX_ATTEMPTS + '), giving up. Restart the app to reconnect.');
            return;
        }
        const delays = OpenClawRuntimeAdapter.GATEWAY_RECONNECT_DELAYS;
        const delay = delays[Math.min(this.gatewayReconnectAttempt, delays.length - 1)];
        this.gatewayReconnectAttempt++;
        console.log(`[GatewayReconnect] scheduling reconnect attempt ${this.gatewayReconnectAttempt}/${OpenClawRuntimeAdapter.GATEWAY_RECONNECT_MAX_ATTEMPTS} in ${delay}ms`);
        this.gatewayReconnectTimer = setTimeout(() => {
            this.gatewayReconnectTimer = null;
            void this.attemptGatewayReconnect();
        }, delay);
    }
    async attemptGatewayReconnect() {
        if (this.gatewayReconnectSuppressed) {
            console.log('[GatewayReconnect] skipped reconnect attempt because gateway reconnect is suppressed');
            return;
        }
        console.log(`[GatewayReconnect] attempting reconnect (attempt ${this.gatewayReconnectAttempt})`);
        try {
            // connectGatewayIfNeeded checks if client already exists, so safe to call
            await this.connectGatewayIfNeeded();
            console.log('[GatewayReconnect] reconnected successfully');
            this.gatewayReconnectAttempt = 0; // reset counter on success
        }
        catch (error) {
            console.warn('[GatewayReconnect] reconnect failed:', error);
            this.scheduleGatewayReconnect(); // retry with next backoff
        }
    }
    async loadGatewayClientCtor(clientEntryPath) {
        // Use require() with file path directly. TypeScript's CJS output downgrades
        // dynamic import() to require(), which doesn't support file:// URLs.
        const loaded = require(clientEntryPath);
        const direct = loaded.GatewayClient;
        if (typeof direct === 'function') {
            return direct;
        }
        const exportedValues = Object.values(loaded);
        for (const candidate of exportedValues) {
            if (typeof candidate !== 'function') {
                continue;
            }
            const maybeCtor = candidate;
            if (maybeCtor.name === 'GatewayClient') {
                return candidate;
            }
            const proto = maybeCtor.prototype;
            if (proto
                && typeof proto.start === 'function'
                && typeof proto.stop === 'function'
                && typeof proto.request === 'function') {
                return candidate;
            }
        }
        const exportKeysPreview = Object.keys(loaded).slice(0, 20).join(', ');
        throw new Error(`Invalid engine client module: ${clientEntryPath} (exports: ${exportKeysPreview || 'none'})`);
    }
    normalizeBtwSideResultPayload(payload) {
        if (!isRecord(payload) || payload.kind !== 'btw')
            return null;
        const runId = typeof payload.runId === 'string' ? payload.runId.trim() : '';
        const sessionKey = typeof payload.sessionKey === 'string' ? payload.sessionKey.trim() : '';
        const agentId = typeof payload.agentId === 'string' ? payload.agentId.trim() : undefined;
        const question = typeof payload.question === 'string'
            ? (0, btw_1.normalizeCoworkBtwQuestion)(payload.question)
            : '';
        const text = typeof payload.text === 'string'
            ? truncateBtwResultText(payload.text)
            : '';
        const ts = typeof payload.ts === 'number' && Number.isFinite(payload.ts) ? payload.ts : NaN;
        if (!runId
            || !sessionKey
            || !question
            || runId.length > btw_1.COWORK_BTW_IDENTIFIER_MAX_CHARS
            || sessionKey.length > OPENCLAW_BTW_SESSION_KEY_MAX_CHARS
            || (agentId?.length ?? 0) > btw_1.COWORK_BTW_IDENTIFIER_MAX_CHARS
            || /[\r\n]/.test(question)
            || !Number.isFinite(ts)) {
            return null;
        }
        return {
            kind: 'btw',
            runId,
            sessionKey,
            ...(agentId ? { agentId } : {}),
            question,
            text,
            ...(payload.isError === true ? { isError: true } : {}),
            ts,
            ...(typeof payload.seq === 'number' && Number.isFinite(payload.seq)
                ? { seq: payload.seq }
                : {}),
        };
    }
    handleBtwSideResult(payload) {
        const result = this.normalizeBtwSideResultPayload(payload);
        if (!result) {
            const rawRunId = isRecord(payload) && typeof payload.runId === 'string'
                ? payload.runId.trim()
                : '';
            const malformedRunId = rawRunId.length <= btw_1.COWORK_BTW_IDENTIFIER_MAX_CHARS
                ? rawRunId
                : '';
            const pending = malformedRunId ? this.pendingBtwRuns.get(malformedRunId) : undefined;
            if (pending) {
                this.failPendingBtwRun(pending, (0, i18n_1.t)('coworkBtwInvalidResult'), 'malformed side result');
            }
            console.warn('[CoworkBtw] dropped malformed chat.side_result payload.');
            return;
        }
        const pending = this.pendingBtwRuns.get(result.runId);
        if (!pending) {
            if (this.isTerminalBtwRunId(result.runId)) {
                console.debug('[CoworkBtw] ignored duplicate terminal side result.', `Run ${result.runId}.`);
                return;
            }
            console.warn('[CoworkBtw] dropped side result without a pending request.', `Run ${result.runId}.`, `OpenClaw key ${result.sessionKey}.`);
            return;
        }
        const mappedSessionId = this.resolveSessionIdBySessionKey(result.sessionKey);
        if (result.sessionKey !== pending.sessionKey
            || (result.agentId && result.agentId !== pending.agentId)
            || (mappedSessionId && mappedSessionId !== pending.sessionId)) {
            console.warn('[CoworkBtw] dropped side result because session or agent routing did not match.', `Run ${result.runId}.`, `Expected session ${pending.sessionId}.`, `Mapped session ${mappedSessionId ?? 'none'}.`);
            return;
        }
        if (result.question !== pending.question) {
            console.debug('[CoworkBtw] accepted side result with a runtime-normalized question.', `Run ${result.runId}.`, `Submitted chars ${pending.question.length}.`, `Returned chars ${result.question.length}.`);
        }
        if (!this.addPendingBtwRunAlias(pending, result.runId)) {
            return;
        }
        console.log('[CoworkBtw] received side result.', `Session ${pending.sessionId}.`, `Run ${result.runId}.`, `Answer chars ${result.text.length}.`, `Error ${result.isError ? 'yes' : 'no'}.`);
        if (result.isError && pending.stopRequested) {
            this.stopPendingBtwRun(pending, 'gateway returned an error after stop');
            return;
        }
        if (result.isError) {
            this.finishPendingBtwRun(pending, {
                error: result.text.trim() || (0, i18n_1.t)('coworkBtwFailed'),
            });
            return;
        }
        this.finishPendingBtwRun(pending, { answer: result.text });
    }
    handleBtwChatEvent(payload) {
        if (!isRecord(payload))
            return false;
        const runId = typeof payload.runId === 'string' ? payload.runId.trim() : '';
        if (!runId)
            return false;
        const pending = this.pendingBtwRuns.get(runId);
        if (!pending && !this.isTerminalBtwRunId(runId)) {
            return false;
        }
        const state = typeof payload.state === 'string' ? payload.state : '';
        if (pending && (state === 'aborted' || state === 'error')) {
            if (pending.stopRequested) {
                this.stopPendingBtwRun(pending, `chat ${state}`);
            }
            else {
                const error = typeof payload.errorMessage === 'string' && payload.errorMessage.trim()
                    ? payload.errorMessage.trim()
                    : (0, i18n_1.t)('coworkBtwFailed');
                this.failPendingBtwRun(pending, error, `chat ${state}`);
            }
        }
        console.debug('[CoworkBtw] suppressed chat event for side-question run.', `Run ${runId}.`, `State ${state || 'unknown'}.`);
        return true;
    }
    isBtwAgentEvent(payload) {
        if (!isRecord(payload))
            return false;
        const runId = typeof payload.runId === 'string' ? payload.runId.trim() : '';
        return Boolean(runId
            && (this.pendingBtwRuns.has(runId) || this.isTerminalBtwRunId(runId)));
    }
    handleGatewayEvent(event) {
        // Any event from the gateway proves the connection is alive.
        // Previously only 'tick' updated this timestamp, but during heavy exec
        // streaming the gateway's tick timer gets starved by I/O while other
        // events (agent, tool updates) keep flowing — causing false-positive
        // disconnect from the TickWatchdog.
        this.lastTickTimestamp = Date.now();
        if (event.event === 'tick') {
            return;
        }
        if (event.event === OpenClawGatewayEvent.SessionsChanged) {
            try {
                this.handleChannelSessionLifecycleEvent(event.payload);
            }
            catch (error) {
                // Channel parsing and mapping may touch plugin-provided identifiers and
                // local persistence. Keep a malformed event isolated from the gateway
                // client's event loop; polling remains the fallback.
                console.warn('[ChannelSync] failed to process gateway session lifecycle event:', error);
            }
            return;
        }
        if (event.event === OpenClawGatewayEvent.ChatSideResult) {
            this.handleBtwSideResult(event.payload);
            return;
        }
        if (event.event === 'chat') {
            if (this.handleBtwChatEvent(event.payload)) {
                return;
            }
            this.handleChatEvent(event.payload, event.seq);
            return;
        }
        if (event.event === 'agent') {
            if (this.isBtwAgentEvent(event.payload)) {
                return;
            }
            const diagnostic = (0, diagnostics_1.summarizeAgentEventForThinkingDiagnostics)(event.payload, event.seq);
            if (diagnostic) {
                (0, diagnostics_1.logThinkingDiagnostic)(diagnostic);
            }
            // Process assistant text updates here (before handleAgentEvent) because
            // handleAgentEvent may enqueue events when sessionId mapping isn't ready.
            this.processAgentAssistantText(event.payload);
            this.handleAgentEvent(event.payload, event.seq);
            return;
        }
        if (event.event === 'exec.approval.requested') {
            this.approvalController.handleExecApprovalRequested(event.payload);
            return;
        }
        if (event.event === 'exec.approval.resolved') {
            this.approvalController.handleExecApprovalResolved(event.payload);
            return;
        }
        if (event.event === 'plugin.approval.requested') {
            this.approvalController.handlePluginApprovalRequested(event.payload);
            return;
        }
        if (event.event === 'plugin.approval.resolved') {
            this.approvalController.handlePluginApprovalResolved(event.payload);
        }
        if (event.event === 'cron') {
            console.debug('[EngineRuntime] received cron event:', JSON.stringify(event));
            this.scheduleImConversationSyncAfterCronDelivery(event.payload);
        }
    }
    handleChannelSessionLifecycleEvent(payload) {
        if (!this.channelSessionSync || !isRecord(payload))
            return;
        const sessionKey = typeof payload.sessionKey === 'string' ? payload.sessionKey.trim() : '';
        const phase = normalizeAgentLifecyclePhase(payload.phase);
        if (!sessionKey
            || !(0, openclawChannelSessionSync_1.parseChannelSessionKey)(sessionKey)
            || !this.channelSessionSync.isCurrentBindingKey(sessionKey)
            || (phase !== constants_7.AgentLifecyclePhase.Start
                && phase !== constants_7.AgentLifecyclePhase.End
                && phase !== constants_7.AgentLifecyclePhase.Error)) {
            return;
        }
        // A deleted conversation may only be re-created by a genuine new IM run,
        // never by a delayed terminal event from the run that was deleted.
        const deletedChannelKey = this.getDeletedChannelKey(sessionKey);
        if (this.deletedChannelKeys.has(deletedChannelKey) && phase !== constants_7.AgentLifecyclePhase.Start) {
            return;
        }
        const runId = typeof payload.runId === 'string' ? payload.runId.trim() : '';
        const trackedRun = this.getFreshChannelLifecycleRun(sessionKey);
        if (phase !== constants_7.AgentLifecyclePhase.Start
            && trackedRun?.runId
            && runId
            && trackedRun.runId !== runId) {
            console.debug('[ChannelSync] ignored stale IM lifecycle terminal event for a superseded run.');
            return;
        }
        const sessionId = this.resolveSessionIdBySessionKey(sessionKey)
            ?? this.channelSessionSync.resolveOrCreateSession(sessionKey);
        if (!sessionId)
            return;
        const activeTurn = this.activeTurns.get(sessionId);
        if (phase !== constants_7.AgentLifecyclePhase.Start
            && activeTurn
            && runId
            && activeTurn.runId !== runId
            && !activeTurn.knownRunIds.has(runId)) {
            console.debug('[ChannelSync] ignored IM lifecycle terminal event for a non-current local turn.');
            return;
        }
        if (phase === constants_7.AgentLifecyclePhase.Start) {
            this.channelLifecycleRunBySessionKey.set(sessionKey, {
                runId,
                observedAtMs: Date.now(),
            });
            if (activeTurn && runId) {
                activeTurn.knownRunIds.add(runId);
                this.sessionIdByRunId.set(runId, sessionId);
            }
            if (this.deletedChannelKeys.delete(deletedChannelKey)) {
                this.fullySyncedSessions.add(sessionId);
                this.reCreatedChannelSessionIds.add(sessionId);
            }
        }
        else {
            this.channelLifecycleRunBySessionKey.delete(sessionKey);
        }
        this.rememberSessionKey(sessionId, sessionKey);
        const isNewlyKnownSession = !this.knownChannelSessionIds.has(sessionId);
        // Leave discovery ownership to pollChannelSessions. Marking the session as
        // known here would prevent that poll from scheduling its initial full
        // history sync for a conversation first seen through this lifecycle event.
        const session = this.store.getSession(sessionId);
        if (!session)
            return;
        const rawStatus = typeof payload.status === 'string' ? payload.status.trim().toLowerCase() : '';
        const nextStatus = phase === constants_7.AgentLifecyclePhase.Start
            ? 'running'
            : phase === constants_7.AgentLifecyclePhase.Error
                ? 'error'
                : (0, channelSessionRunStatus_1.resolveChannelSessionNextStatus)({
                    hasActiveRun: false,
                    rawStatus,
                    currentStatus: session.status,
                }) ?? 'completed';
        if (session.status !== nextStatus) {
            const previousStatus = session.status;
            this.store.updateSession(sessionId, { status: nextStatus });
            this.emitSessionStatus(sessionId, nextStatus);
            console.debug('[ChannelSync] synced IM session lifecycle status.', `Session ${sessionId}.`, `Status ${previousStatus} -> ${nextStatus}.`, `Phase ${phase}.`);
        }
        if (isNewlyKnownSession) {
            this.notifySessionsChanged(sessionId);
        }
        if (phase === constants_7.AgentLifecyclePhase.Start && runId) {
            this.reportChannelPromptSubmit(sessionId, sessionKey, runId, activeTurn);
        }
    }
    /**
     * Cron announce deliveries mirror into the target conversation's gateway
     * transcript without bumping the session's activity timestamp, so the
     * active-window incremental poll never picks them up. Pull the mirrored
     * message into the mapped IM conversation record right after a delivered
     * run instead.
     */
    scheduleImConversationSyncAfterCronDelivery(payload) {
        const target = (0, cronDeliveryTarget_1.extractCronDeliveredTarget)(payload);
        if (!target || !this.channelSessionSync)
            return;
        let conversation;
        try {
            conversation = this.channelSessionSync.resolveOrCreateConversationForDeliveryMirror(target.channel, target.to, target.accountId, target.agentId);
        }
        catch (error) {
            console.warn('[ChannelSync] failed to resolve IM conversation after cron delivery:', error);
            return;
        }
        if (!conversation) {
            console.debug('[ChannelSync] no local conversation mapped for cron delivery target:', target.channel, target.to);
            return;
        }
        // Delay so the gateway finishes flushing the delivery mirror into the
        // transcript before we reconcile against chat.history.
        setTimeout(() => {
            void this.syncSessionHistoryFromGateway(conversation.sessionId, conversation.sessionKey)
                .then(() => {
                // The delivered mirror is assistant-only and message writes
                // deliberately never advance updated_at (streaming reorder guard),
                // so surface the fresh delivery in the session list explicitly.
                this.store.updateSession(conversation.sessionId, {}, { touchUpdatedAt: true });
                this.notifySessionsChanged(conversation.sessionId);
                console.log('[ChannelSync] synced IM conversation after cron delivery.', `Session ${conversation.sessionId}.`, `SessionKey ${conversation.sessionKey}.`, `Channel ${target.channel}.`);
            })
                .catch((error) => {
                console.warn('[ChannelSync] failed to sync IM conversation after cron delivery:', error);
            });
        }, OpenClawRuntimeAdapter.CRON_DELIVERY_SYNC_DELAY_MS);
    }
    handleAgentEvent(payload, seq) {
        if (!isRecord(payload))
            return;
        const agentPayload = payload;
        const runId = typeof agentPayload.runId === 'string' ? agentPayload.runId.trim() : '';
        const sessionKey = typeof agentPayload.sessionKey === 'string' ? agentPayload.sessionKey.trim() : '';
        const stream = typeof agentPayload.stream === 'string' ? agentPayload.stream.trim() : '';
        const lifecyclePhase = stream === 'lifecycle' ? getAgentLifecyclePhase(agentPayload.data) : '';
        let reopenedSessionId;
        if (runId && this.isRecentlyClosedRunId(runId)) {
            if (stream !== 'lifecycle' || lifecyclePhase !== constants_7.AgentLifecyclePhase.Start || !sessionKey) {
                console.debug('[EngineRuntime] dropped late agent event for a closed run.');
                return;
            }
            const retrySessionId = this.resolveSessionIdBySessionKey(sessionKey);
            if (!retrySessionId || !this.reopenRecentlyClosedRunForRetry(retrySessionId, sessionKey, runId)) {
                console.debug('[EngineRuntime] dropped closed run lifecycle start because it was not a valid retry.');
                return;
            }
            reopenedSessionId = retrySessionId;
        }
        if (lifecyclePhase === constants_7.AgentLifecyclePhase.Fallback) {
            console.debug('[EngineRuntime] ignored agent lifecycle fallback event.');
            return;
        }
        if (stream === 'lifecycle'
            && (lifecyclePhase === constants_7.AgentLifecyclePhase.End || lifecyclePhase === constants_7.AgentLifecyclePhase.Error)) {
            const sessionIdByRunIdForLog = runId ? this.sessionIdByRunId.get(runId) : undefined;
            const sessionIdBySessionKeyForLog = sessionKey ? this.resolveSessionIdBySessionKey(sessionKey) ?? undefined : undefined;
            console.log('[EngineRuntime] terminal agent lifecycle received:', `phase=${lifecyclePhase}`, `runId=${runId || 'unknown'}`, `sessionKey=${sessionKey || 'unknown'}`, `sessionIdByRunId=${sessionIdByRunIdForLog ?? 'none'}`, `sessionIdBySessionKey=${sessionIdBySessionKeyForLog ?? 'none'}`, `activeByRunId=${sessionIdByRunIdForLog ? this.activeTurns.has(sessionIdByRunIdForLog) : false}`, `activeBySessionKey=${sessionIdBySessionKeyForLog ? this.activeTurns.has(sessionIdBySessionKeyForLog) : false}`, `isSubagentSessionKey=${(0, sessionKeys_1.isSubagentSessionKey)(sessionKey)}`);
        }
        if (stream === 'lifecycle'
            && (lifecyclePhase === constants_7.AgentLifecyclePhase.End || lifecyclePhase === constants_7.AgentLifecyclePhase.Error)
            && sessionKey
            && this.subagentTracker.tryMarkTerminalFromSessionKey(sessionKey, lifecyclePhase === constants_7.AgentLifecyclePhase.Error ? 'error' : 'done')) {
            this.subagentSessionMaterializer.finalizePassive(sessionKey, lifecyclePhase === constants_7.AgentLifecyclePhase.Error ? 'error' : 'done');
            return;
        }
        const sessionIdByRunId = runId ? this.sessionIdByRunId.get(runId) : undefined;
        const sessionIdBySessionKey = sessionKey ? this.resolveSessionIdBySessionKey(sessionKey) ?? undefined : undefined;
        let sessionId = reopenedSessionId ?? sessionIdByRunId ?? sessionIdBySessionKey;
        // Re-create ActiveTurn for channel session follow-up turns.
        // Exclude stream=error events (e.g. seq gap notifications) — they are diagnostic alerts,
        // not new run events, and must not create a ghost ActiveTurn that blocks the next user turn.
        // Also exclude runIds that have already been terminated (lifecycle phase=error received),
        // which prevents gateway retries from spawning new turns and surfacing duplicate errors.
        if (sessionId && !this.activeTurns.has(sessionId) && sessionKey && stream !== 'error' && !this.terminatedRunIds.has(runId)) {
            // Desktop sessions (lobsterai:*) that were manually stopped must not be
            // re-activated by late-arriving gateway events (e.g. MCP tool results that
            // arrive after the user clicked Stop).  Only channel/cron sessions are
            // allowed to re-create turns after the stop cooldown expires.
            if (this.manuallyStoppedSessions.has(sessionId) && (0, openclawChannelSessionSync_1.isManagedSessionKey)(sessionKey)) {
                console.log('[Debug:handleAgentEvent] suppressed — desktop session was manually stopped, sessionId:', sessionId);
                return;
            }
            console.log('[Debug:handleAgentEvent] re-creating ActiveTurn for follow-up turn, sessionId:', sessionId);
            this.ensureActiveTurn(sessionId, sessionKey, runId);
        }
        // Try to resolve channel-originated sessions (e.g. Telegram via OpenClaw)
        if (!sessionId && sessionKey && this.channelSessionSync) {
            const channelSessionId = this.resolveOrCreateChannelSession(sessionKey);
            console.log('[Debug:handleAgentEvent] channel resolve — channelSessionId:', channelSessionId);
            if (channelSessionId) {
                // If this key was previously deleted, allow re-creation but skip history sync
                const deletedChannelKey = this.getDeletedChannelKey(sessionKey);
                if (this.deletedChannelKeys.delete(deletedChannelKey)) {
                    this.fullySyncedSessions.add(channelSessionId);
                    this.reCreatedChannelSessionIds.add(channelSessionId);
                    console.log('[Debug:handleAgentEvent] re-created after delete, skipping history sync for:', sessionKey);
                }
                this.rememberSessionKey(channelSessionId, sessionKey);
                sessionId = channelSessionId;
                this.ensureActiveTurn(channelSessionId, sessionKey, runId);
            }
        }
        if (!sessionId) {
            if (stream === 'lifecycle'
                && (lifecyclePhase === constants_7.AgentLifecyclePhase.End || lifecyclePhase === constants_7.AgentLifecyclePhase.Error)) {
                console.warn('[EngineRuntime] dropping terminal agent lifecycle event because no sessionId resolved', `phase=${lifecyclePhase}`, `runId=${runId || 'unknown'}`, `sessionKey=${sessionKey || 'unknown'}`);
            }
            console.log('[Debug:handleAgentEvent] no sessionId, dropping event. runId:', runId, 'sessionKey:', sessionKey);
            if (runId) {
                this.enqueuePendingAgentEvent(runId, agentPayload, seq);
            }
            return;
        }
        if (sessionIdByRunId && sessionIdBySessionKey && sessionIdByRunId !== sessionIdBySessionKey) {
            console.log('[Debug:handleAgentEvent] sessionId mismatch, dropping. byRunId:', sessionIdByRunId, 'bySessionKey:', sessionIdBySessionKey);
            return;
        }
        const turn = this.activeTurns.get(sessionId);
        if (!turn) {
            if (stream === 'lifecycle'
                && (lifecyclePhase === constants_7.AgentLifecyclePhase.End || lifecyclePhase === constants_7.AgentLifecyclePhase.Error)) {
                console.warn('[EngineRuntime] dropping terminal agent lifecycle event because no active turn exists', `phase=${lifecyclePhase}`, `sessionId=${sessionId}`, `runId=${runId || 'unknown'}`, `sessionKey=${sessionKey || 'unknown'}`);
            }
            console.log('[Debug:handleAgentEvent] no active turn for sessionId:', sessionId);
            return;
        }
        if (sessionKey && !runId && turn.sessionKey !== sessionKey) {
            console.log('[Debug:handleAgentEvent] sessionKey mismatch, dropping. event:', sessionKey, 'turn:', turn.sessionKey);
            return;
        }
        if (runId) {
            const mappedSessionId = this.sessionIdByRunId.get(runId);
            if (mappedSessionId && mappedSessionId !== sessionId) {
                console.log('[Debug:handleAgentEvent] runId mapped to different session, dropping. mapped:', mappedSessionId, 'current:', sessionId);
                return;
            }
            this.bindRunIdToTurn(sessionId, runId);
        }
        // Buffer agent events while user messages are being prefetched for channel sessions.
        // Must be checked BEFORE seq dedup so that replayed events are not dropped.
        if (turn.pendingUserSync) {
            console.log('[Debug:handleAgentEvent] buffering agent event (pendingUserSync), sessionId:', sessionId, 'buffered:', turn.bufferedAgentPayloads.length + 1);
            turn.bufferedAgentPayloads.push({ payload: agentPayload, seq, bufferedAt: Date.now() });
            return;
        }
        // Sequence-based dedup (placed after buffer check to match handleChatEvent pattern)
        if (typeof seq === 'number' && Number.isFinite(seq) && runId) {
            const lastSeq = this.lastAgentSeqByRunId.get(runId);
            if (lastSeq !== undefined && seq <= lastSeq) {
                return;
            }
            this.lastAgentSeqByRunId.set(runId, seq);
        }
        if (stream !== 'lifecycle' || lifecyclePhase !== constants_7.AgentLifecyclePhase.End) {
            this.cancelLifecycleEndFallback(sessionId, turn, 'agent stream continued');
        }
        // Fast-path: skip assistant-stream events — they carry the same text as
        // chat deltas and dispatchAgentEvent() has no handler for stream=assistant.
        if (stream === 'assistant') {
            const dataField = isRecord(agentPayload.data) ? agentPayload.data : {};
            const assistantText = (0, openclawAssistantText_1.extractOpenClawAssistantStreamText)(dataField) || (0, openclawAssistantText_1.extractOpenClawAssistantStreamText)(agentPayload);
            if (!(0, openclawHistory_1.isHeartbeatAckText)(assistantText) && !(0, openclawHistory_1.isSilentReplyText)(assistantText) && !(0, openclawHistory_1.isSilentReplyPrefixText)(assistantText)) {
                this.postponeChatFinalCompletion(sessionId, turn, 'assistant stream continued');
            }
            return;
        }
        const shouldKeepRunningAfterFinal = stream === 'tool'
            || stream === 'tools'
            || stream === 'thinking'
            || stream === 'compaction'
            || (!stream && isRecord(agentPayload.data) && typeof agentPayload.data.toolCallId === 'string')
            || (stream === 'lifecycle' && getAgentLifecyclePhase(agentPayload.data) !== constants_7.AgentLifecyclePhase.End);
        if (shouldKeepRunningAfterFinal) {
            this.cancelChatFinalCompletion(sessionId, turn, 'agent stream continued');
        }
        this.dispatchAgentEvent(sessionId, turn, {
            ...agentPayload,
            ...(typeof seq === 'number' && Number.isFinite(seq) ? { seq } : {}),
        });
    }
    dispatchAgentEvent(sessionId, turn, agentPayload) {
        const stream = typeof agentPayload.stream === 'string' ? agentPayload.stream.trim() : '';
        const hasToolShape = isRecord(agentPayload.data) && typeof agentPayload.data.toolCallId === 'string';
        if (stream === 'tool' || stream === 'tools' || (!stream && hasToolShape)) {
            if (Array.isArray(agentPayload.data)) {
                for (const entry of agentPayload.data) {
                    this.handleAgentToolEvent(sessionId, turn, entry);
                }
            }
            else {
                this.handleAgentToolEvent(sessionId, turn, agentPayload.data);
            }
            return;
        }
        if (stream === 'lifecycle') {
            // Mark runId as terminated immediately on phase=error so that subsequent retries
            // (which reuse the same runId) are blocked from re-creating an ActiveTurn.
            const lifecycleData = agentPayload.data;
            const lifecycleRunId = typeof agentPayload.runId === 'string' ? agentPayload.runId.trim() : '';
            if (getAgentLifecyclePhase(lifecycleData) === constants_7.AgentLifecyclePhase.Error && lifecycleRunId) {
                this.terminatedRunIds.add(lifecycleRunId);
            }
            this.handleAgentLifecycleEvent(sessionId, agentPayload.data, lifecycleRunId || undefined);
            return;
        }
        if (stream === 'compaction') {
            const compactionData = isRecord(agentPayload.data) ? agentPayload.data : {};
            const phase = typeof compactionData.phase === 'string' && compactionData.phase.trim()
                ? compactionData.phase.trim()
                : 'unknown';
            const runId = typeof agentPayload.runId === 'string' && agentPayload.runId.trim()
                ? agentPayload.runId.trim()
                : 'unknown';
            console.log(`[EngineRuntime] received a compaction stream event for session ${sessionId}, run ${runId}, phase ${phase}.`);
            this.handleAgentCompactionEvent(sessionId, agentPayload.data);
            return;
        }
        if (stream === 'thinking') {
            this.thinkingController.handleStream(sessionId, turn, agentPayload.data);
            return;
        }
    }
    enqueuePendingAgentEvent(runId, payload, seq) {
        const normalizedRunId = runId.trim();
        if (!normalizedRunId)
            return;
        if (this.isRecentlyClosedRunId(normalizedRunId))
            return;
        const stream = typeof payload.stream === 'string' ? payload.stream.trim() : '';
        if (stream === 'lifecycle' && getAgentLifecyclePhase(payload.data) === constants_7.AgentLifecyclePhase.Fallback) {
            return;
        }
        const hasToolShape = isRecord(payload.data) && typeof payload.data.toolCallId === 'string';
        const isSupportedStream = stream === 'tool'
            || stream === 'tools'
            || stream === 'thinking'
            || stream === 'lifecycle'
            || stream === 'compaction'
            || (!stream && hasToolShape);
        if (!isSupportedStream)
            return;
        const queued = this.pendingAgentEventsByRunId.get(normalizedRunId) ?? [];
        queued.push({
            runId: normalizedRunId,
            sessionKey: payload.sessionKey,
            stream: payload.stream,
            data: payload.data,
            ...(typeof seq === 'number' && Number.isFinite(seq) ? { seq } : {}),
        });
        if (queued.length > 240) {
            queued.shift();
        }
        this.pendingAgentEventsByRunId.set(normalizedRunId, queued);
        if (this.pendingAgentEventsByRunId.size > 400) {
            const oldestRunId = this.pendingAgentEventsByRunId.keys().next().value;
            if (oldestRunId) {
                this.pendingAgentEventsByRunId.delete(oldestRunId);
            }
        }
    }
    flushPendingAgentEvents(sessionId, runId) {
        const normalizedRunId = runId.trim();
        if (!normalizedRunId)
            return;
        const queued = this.pendingAgentEventsByRunId.get(normalizedRunId);
        if (!queued || queued.length === 0)
            return;
        this.pendingAgentEventsByRunId.delete(normalizedRunId);
        const turn = this.activeTurns.get(sessionId);
        if (!turn)
            return;
        for (const event of queued) {
            this.dispatchAgentEvent(sessionId, turn, event);
        }
    }
    resolveInteractiveSessionKey(sessionId, options = {}) {
        const normalizedSessionId = sessionId.trim();
        if (!normalizedSessionId)
            return null;
        const session = this.store.getSession(normalizedSessionId);
        if (!session)
            return null;
        const activeTurnSessionKey = this.activeTurns.get(normalizedSessionId)?.sessionKey?.trim();
        if (activeTurnSessionKey) {
            return activeTurnSessionKey;
        }
        const managedSessionKey = this.toSessionKey(normalizedSessionId, session.agentId || 'main');
        if (session.scheduledTaskId?.trim()) {
            return managedSessionKey;
        }
        const rememberedSessionKey = this.getSessionKeysForSession(normalizedSessionId)
            .find((key) => !(0, openclawChannelSessionSync_1.isManagedSessionKey)(key));
        if (rememberedSessionKey) {
            return rememberedSessionKey;
        }
        const persistedChannelSession = this.channelSessionSync
            ?.getOpenClawSessionKeyForCoworkSession(normalizedSessionId);
        const persistedChannelSessionKey = persistedChannelSession?.sessionKey?.trim() ?? '';
        if (persistedChannelSessionKey && !(0, openclawChannelSessionSync_1.isManagedSessionKey)(persistedChannelSessionKey)) {
            return persistedChannelSessionKey;
        }
        if (options.requirePersistedChannelKey && persistedChannelSession?.isChannelSession) {
            throw new Error('Cannot patch IM channel session because the engine session key is missing.');
        }
        return managedSessionKey;
    }
    rememberSessionKey(sessionId, sessionKey) {
        const normalizedSessionKey = sessionKey.trim();
        if (!normalizedSessionKey)
            return;
        const cronKey = (0, openclawCronSessionKey_1.parseOpenClawCronSessionKey)(normalizedSessionKey);
        if (cronKey) {
            const previousRawKey = this.latestCronSessionKeyByCacheKey.get(cronKey.cacheKey);
            if (previousRawKey && previousRawKey !== normalizedSessionKey) {
                this.sessionIdBySessionKey.delete(previousRawKey);
                this.gatewayHistoryCountByCronSessionKey.delete(previousRawKey);
            }
            this.latestCronSessionKeyByCacheKey.set(cronKey.cacheKey, normalizedSessionKey);
        }
        this.sessionIdBySessionKey.set(normalizedSessionKey, sessionId);
    }
    getDeletedChannelKey(sessionKey) {
        const normalizedSessionKey = sessionKey.trim();
        return (0, openclawCronSessionKey_1.parseOpenClawCronSessionKey)(normalizedSessionKey)?.cacheKey ?? normalizedSessionKey;
    }
    resolveOrCreateChannelSession(sessionKey) {
        if (!this.channelSessionSync)
            return null;
        if ((0, openclawChannelSessionSync_1.isCronSessionKey)(sessionKey)) {
            return this.channelSessionSync.resolveOrCreateCronSession(sessionKey) ?? null;
        }
        return this.channelSessionSync.resolveOrCreateSession(sessionKey)
            ?? (!this.heartbeatSessionKeys.has(sessionKey)
                ? this.channelSessionSync.resolveOrCreateMainAgentSession(sessionKey)
                : null)
            ?? null;
    }
    resolveSessionIdBySessionKey(sessionKey) {
        const normalizedSessionKey = sessionKey.trim();
        if (!normalizedSessionKey)
            return null;
        const cronKey = (0, openclawCronSessionKey_1.parseOpenClawCronSessionKey)(normalizedSessionKey);
        const latestCronSessionKey = cronKey
            ? this.latestCronSessionKeyByCacheKey.get(cronKey.cacheKey)
            : undefined;
        const mappedSessionId = this.sessionIdBySessionKey.get(normalizedSessionKey)
            ?? (latestCronSessionKey
                ? this.sessionIdBySessionKey.get(latestCronSessionKey)
                : undefined);
        if (mappedSessionId) {
            return mappedSessionId;
        }
        const persistedSessionId = typeof this.store.getSessionIdByClaudeSessionId === 'function'
            ? this.store.getSessionIdByClaudeSessionId(normalizedSessionKey)
            : null;
        if (persistedSessionId) {
            this.rememberSessionKey(persistedSessionId, normalizedSessionKey);
            return persistedSessionId;
        }
        const parsedManagedSession = (0, openclawChannelSessionSync_1.parseManagedSessionKey)(normalizedSessionKey);
        if (!parsedManagedSession) {
            return this.resolveLocalSessionIdFromGatewaySessionKey(normalizedSessionKey);
        }
        const session = this.store.getSession(parsedManagedSession.sessionId);
        if (!session) {
            return null;
        }
        this.rememberSessionKey(session.id, normalizedSessionKey);
        this.rememberSessionKey(session.id, this.toSessionKey(session.id, session.agentId));
        return session.id;
    }
    resolveLocalSessionIdFromGatewaySessionKey(sessionKey) {
        const match = /^agent:([^:]+):([^:]+):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(sessionKey);
        if (!match) {
            return null;
        }
        const [, agentId, source, candidateSessionId] = match;
        const session = this.store.getSession(candidateSessionId);
        if (!session) {
            console.debug('[EngineRuntime] ignored gateway session key with unknown local session id', `sessionKey=${sessionKey}`, `agentId=${agentId}`, `source=${source}`);
            return null;
        }
        const localAgentId = typeof session.agentId === 'string' && session.agentId.trim()
            ? session.agentId.trim()
            : 'main';
        if (agentId !== localAgentId) {
            console.debug('[EngineRuntime] ignored gateway session key with mismatched local agent id', `sessionId=${candidateSessionId}`, `sessionKeyAgentId=${agentId}`, `localAgentId=${localAgentId}`, `source=${source}`);
            return null;
        }
        this.rememberSessionKey(session.id, sessionKey);
        this.rememberSessionKey(session.id, this.toSessionKey(session.id, session.agentId));
        console.warn('[EngineRuntime] resolved non-managed gateway session key to local session by id fallback', `sessionId=${session.id}`, `agentId=${agentId}`, `source=${source}`);
        return session.id;
    }
    nextTurnToken(sessionId) {
        const nextToken = (this.latestTurnTokenBySession.get(sessionId) ?? 0) + 1;
        this.latestTurnTokenBySession.set(sessionId, nextToken);
        return nextToken;
    }
    isCurrentTurnToken(sessionId, turnToken) {
        return (this.latestTurnTokenBySession.get(sessionId) ?? 0) === turnToken;
    }
    ensureFirstResponseTiming(turn) {
        if (!turn.firstResponseTiming) {
            turn.firstResponseTiming = { turnStartedAtMs: turn.startedAtMs || Date.now() };
        }
        return turn.firstResponseTiming;
    }
    logFirstResponseTiming(sessionId, turn, source, visibleTextLength) {
        const timing = this.ensureFirstResponseTiming(turn);
        if (timing.firstVisibleAssistantAtMs) {
            return;
        }
        const now = Date.now();
        timing.firstVisibleAssistantAtMs = now;
        timing.firstVisibleAssistantSource = source;
        console.log('[EngineRuntimeTiming] first visible assistant content received.', `Session ${sessionId}.`, `Run ${turn.runId}.`, `Source ${source}.`, `Visible text length ${visibleTextLength}.`, `Total ${formatTimingOffset(timing.turnStartedAtMs, now)}.`, `Gateway ready ${formatTimingDuration(timing.gatewayReadyStartedAtMs, timing.gatewayReadyEndedAtMs)}.`, `Model patch ${formatTimingDuration(timing.modelPatchStartedAtMs, timing.modelPatchEndedAtMs)}.`, `Prompt build ${formatTimingDuration(timing.promptBuildStartedAtMs, timing.promptBuildEndedAtMs)}.`, `History probe ${formatTimingDuration(timing.chatHistoryStartedAtMs, timing.chatHistoryEndedAtMs)}.`, `Chat send ack ${formatTimingDuration(timing.chatSendStartedAtMs, timing.chatSendAckAtMs)}.`, `Ack to lifecycle ${formatTimingDuration(timing.chatSendAckAtMs, timing.lifecycleStartedAtMs)}.`, `Lifecycle to first content ${formatTimingDuration(timing.lifecycleStartedAtMs, now)}.`, `Ack to first content ${formatTimingDuration(timing.chatSendAckAtMs, now)}.`);
    }
    reuseFinalAssistantMessage(sessionId, content) {
        const session = this.store.getSession(sessionId);
        const messages = session?.messages ?? [];
        const messageId = (0, assistantMessageReconciliation_1.findReusableFinalAssistantMessageId)(messages, content);
        if (!messageId) {
            return null;
        }
        this.store.updateMessage(sessionId, messageId, {
            content,
            metadata: {
                isStreaming: false,
                isFinal: true,
            },
        });
        return messageId;
    }
    reuseCommittedAssistantMessage(sessionId, turn, content) {
        const session = this.store.getSession(sessionId);
        const messageId = (0, assistantMessageReconciliation_1.findReusableCommittedAssistantMessageId)(session?.messages ?? [], turn.lastCommittedAssistantMessageId, content);
        if (!messageId) {
            return null;
        }
        const finalMetadata = {
            isStreaming: false,
            isFinal: true,
        };
        this.store.updateMessage(sessionId, messageId, {
            content,
            metadata: finalMetadata,
        });
        this.emit('messageUpdate', sessionId, messageId, content, finalMetadata);
        return messageId;
    }
    removeRedundantFinalPrefixSegment(sessionId, finalMessageId, finalText) {
        const session = this.store.getSession(sessionId);
        const messages = session?.messages ?? [];
        const redundantMessageId = (0, assistantMessageReconciliation_1.findRedundantFinalPrefixMessageId)(messages, finalMessageId, finalText);
        if (!redundantMessageId) {
            return;
        }
        console.debug('[EngineRuntime] removing redundant assistant prefix segment before final.', `sessionId=${sessionId}`, `messageId=${redundantMessageId}`, `finalMessageId=${finalMessageId ?? 'pending'}`);
        this.deleteAssistantMessage(sessionId, redundantMessageId);
    }
    resolveAssistantMessageIdForUsage(sessionId, preferredMessageId) {
        const session = this.store.getSession(sessionId);
        if (!session) {
            return undefined;
        }
        const isVisibleAssistant = (message) => message.type === 'assistant' && !(0, openclawHistory_1.isSilentReplyText)(message.content);
        if (preferredMessageId
            && session.messages.some((message) => message.id === preferredMessageId && isVisibleAssistant(message))) {
            return preferredMessageId;
        }
        for (let i = session.messages.length - 1; i >= 0; i--) {
            if (isVisibleAssistant(session.messages[i])) {
                return session.messages[i].id;
            }
        }
        return undefined;
    }
    handleAgentLifecycleEvent(sessionId, data, eventRunId) {
        if (!isRecord(data))
            return;
        const phase = getAgentLifecyclePhase(data);
        if (phase === constants_7.AgentLifecyclePhase.Fallback) {
            return;
        }
        if (phase === constants_7.AgentLifecyclePhase.Start) {
            this.store.updateSession(sessionId, { status: 'running' });
            this.emitSessionStatus(sessionId, 'running');
            const startingTurn = this.activeTurns.get(sessionId);
            if (startingTurn) {
                const timing = this.ensureFirstResponseTiming(startingTurn);
                if (timing.lifecycleStartedAtMs) {
                    return;
                }
                timing.lifecycleStartedAtMs = Date.now();
                console.log('[EngineRuntimeTiming] agent lifecycle started.', `Session ${sessionId}.`, `Run ${eventRunId ?? startingTurn.runId}.`, `Total ${formatTimingOffset(timing.turnStartedAtMs, timing.lifecycleStartedAtMs)}.`, `Ack to lifecycle ${formatTimingDuration(timing.chatSendAckAtMs, timing.lifecycleStartedAtMs)}.`);
            }
        }
        if (phase === constants_7.AgentLifecyclePhase.End) {
            // Detect announce completion — mark subagent done and skip parent turn
            // lifecycle handling (announce is an embedded run, not the parent's end).
            if (eventRunId && this.subagentTracker.tryMarkDoneFromAnnounceRunId(eventRunId)) {
                return;
            }
            const endingTurn = this.activeTurns.get(sessionId);
            if (endingTurn) {
                endingTurn.lastAttemptEndedAtMs = Date.now();
            }
            const endingRunId = eventRunId
                ?? endingTurn?.runId
                ?? (isRecord(data) && typeof data.runId === 'string' ? data.runId : null);
            if (endingTurn?.planMode
                && endingTurn.planModeSafetyRecoveryPending
                && (!endingRunId || !endingTurn.planModeSafetyRecoveryAbortedRunId || endingRunId === endingTurn.planModeSafetyRecoveryAbortedRunId)) {
                this.schedulePlanModeSafetyRecovery(sessionId, endingTurn, OpenClawRuntimeAdapter.PLAN_MODE_SAFETY_RECOVERY_AFTER_LIFECYCLE_END_MS, 'aborted run lifecycle ended');
                return;
            }
            if (endingTurn && this.isWaitingForRecoverableFollowup(endingTurn)) {
                this.scheduleLifecycleEndFallback(sessionId, endingTurn, endingRunId ?? undefined, OpenClawRuntimeAdapter.TOOL_USE_FINAL_LIFECYCLE_END_GRACE_MS);
                return;
            }
            if (endingTurn?.finalCompletionTimer &&
                endingTurn.finalCompletionFlushOnLifecycleEnd !== false &&
                (!endingRunId || endingTurn.knownRunIds.has(endingRunId))) {
                void this.completeDeferredChatFinalNow(sessionId, endingTurn, endingRunId ?? endingTurn.finalCompletionRunId ?? endingTurn.runId);
                return;
            }
            if (endingTurn?.finalCompletionTimer && endingTurn.finalCompletionFlushOnLifecycleEnd === false) {
                // Silent memory-maintenance turns intentionally outlive the maintenance
                // run's lifecycle=end so the original user request can continue in the
                // follow-up run. Completing here would mark that follow-up run as closed.
                return;
            }
            // Deferred completion fallback: the gateway should send a `chat state=final`
            // event that triggers handleChatFinal(). But after the OpenClaw upgrade, this
            // event may not arrive reliably for IM channel sessions.  The agent lifecycle
            // `phase=end` event IS reliable.  Wait a short window for handleChatFinal() to
            // run; if the turn is still active after that, complete it ourselves.
            const fallbackDelayMs = endingTurn?.lastToolUseChatFinalAtMs
                ? OpenClawRuntimeAdapter.TOOL_USE_FINAL_LIFECYCLE_END_GRACE_MS
                : OpenClawRuntimeAdapter.CHAT_FINAL_COMPLETION_GRACE_MS;
            this.scheduleLifecycleEndFallback(sessionId, endingTurn, endingRunId ?? undefined, fallbackDelayMs);
        }
        if (phase === constants_7.AgentLifecyclePhase.Error) {
            // Deferred error fallback: the gateway should also send a `chat state=error`
            // event that triggers handleChatError().  But after the OpenClaw upgrade, this
            // event may not arrive reliably — similar to the phase=end / chat final gap.
            // Wait for the gateway chat error or retry/compaction path to settle first;
            // if the turn is still active after that, surface the error ourselves.
            const rawErrorMessage = typeof data.error === 'string' ? data.error.trim() : 'The run failed';
            const errorMetadata = normalizeOpenClawSafeRuntimeErrorMetadata(data);
            const errorTurn = this.activeTurns.get(sessionId);
            const errorRunId = eventRunId
                ?? errorTurn?.runId
                ?? (typeof data.runId === 'string' ? data.runId : null);
            setTimeout(() => {
                const turn = this.activeTurns.get(sessionId);
                if (!turn)
                    return; // Already handled by handleChatError
                // If a different run started while the fallback was pending, leave it alone.
                if (errorRunId && !turn.knownRunIds.has(errorRunId))
                    return;
                const resolved = this.resolveTurnErrorMessageWithToolLoopContext(turn, rawErrorMessage, errorMetadata);
                const resolvedError = resolved.resolvedError;
                const errorMessage = resolvedError.message;
                const errorDetail = this.buildTurnErrorDetail(sessionId, turn, resolved.detailRawErrorMessage, errorMessage, errorMetadata);
                console.log(`[EngineRuntime] lifecycle error fallback surfaced an error after waiting for the gateway chat error event in session ${sessionId}: ${errorMessage}`);
                // Abort the retrying run on the gateway so the session is freed for new messages.
                // Without this, the gateway continues retrying indefinitely and rejects subsequent chat.send requests.
                const client = this.gatewayClient;
                if (client) {
                    console.log(`[EngineRuntime] lifecycle error fallback is aborting gateway run ${turn.runId} after the retry grace window for ${turn.sessionKey}.`);
                    void client.request('chat.abort', {
                        sessionKey: turn.sessionKey,
                        runId: turn.runId,
                    }).catch((err) => {
                        console.warn('[EngineRuntime] lifecycle error fallback: chat.abort failed:', err);
                    });
                }
                const erroredSessionKey = turn.sessionKey;
                this.store.updateSession(sessionId, { status: 'error' });
                const errorMsg = this.store.addMessage(sessionId, {
                    type: 'system',
                    content: errorMessage,
                    metadata: (0, exports.buildRuntimeErrorMetadata)({
                        ...resolvedError,
                        ...(errorDetail ? { errorDetail } : {}),
                    }),
                });
                this.emit('message', sessionId, errorMsg);
                this.emit('error', sessionId, errorMessage);
                this.cleanupSessionTurn(sessionId);
                this.rejectTurn(sessionId, new Error(errorMessage));
                void this.syncSessionHistoryFromGateway(sessionId, erroredSessionKey);
            }, OpenClawRuntimeAdapter.LIFECYCLE_ERROR_FALLBACK_DELAY_MS);
        }
    }
    getContextCompactionContent(status) {
        switch (status) {
            case coworkSystemMessages_1.ContextCompactionStatus.Running:
                return 'Context compaction in progress';
            case coworkSystemMessages_1.ContextCompactionStatus.Retrying:
                return 'Context compaction completed, continuing task';
            case coworkSystemMessages_1.ContextCompactionStatus.Failed:
                return 'Context compaction did not complete';
            case coworkSystemMessages_1.ContextCompactionStatus.Completed:
            default:
                return 'Context compaction completed';
        }
    }
    getSessionMessage(sessionId, messageId) {
        if (!messageId)
            return null;
        const session = this.store.getSession(sessionId);
        return session?.messages.find((message) => message.id === messageId) ?? null;
    }
    buildContextCompactionMetadata(turn, status, timestamp) {
        return {
            kind: coworkSystemMessages_1.CoworkSystemMessageKind.ContextCompaction,
            mode: coworkSystemMessages_1.ContextCompactionMode.Auto,
            status,
            runId: turn.runId,
            startedAt: turn.contextCompactionStartedAt ?? timestamp,
            ...(status !== coworkSystemMessages_1.ContextCompactionStatus.Running ? { completedAt: timestamp } : {}),
        };
    }
    createContextCompactionMessage(sessionId, turn, timestamp) {
        turn.contextCompactionStartedAt = timestamp;
        const metadata = this.buildContextCompactionMetadata(turn, coworkSystemMessages_1.ContextCompactionStatus.Running, timestamp);
        const message = this.store.addMessage(sessionId, {
            type: 'system',
            content: this.getContextCompactionContent(coworkSystemMessages_1.ContextCompactionStatus.Running),
            metadata,
        }, timestamp);
        turn.contextCompactionMessageId = message.id;
        this.emit('message', sessionId, message);
    }
    markContextCompactionRunning(sessionId, turn, timestamp) {
        const existingMessage = this.getSessionMessage(sessionId, turn.contextCompactionMessageId);
        if (existingMessage?.metadata?.status !== coworkSystemMessages_1.ContextCompactionStatus.Running) {
            this.createContextCompactionMessage(sessionId, turn, timestamp);
            return;
        }
        const metadata = this.buildContextCompactionMetadata(turn, coworkSystemMessages_1.ContextCompactionStatus.Running, timestamp);
        const content = this.getContextCompactionContent(coworkSystemMessages_1.ContextCompactionStatus.Running);
        this.store.updateMessage(sessionId, existingMessage.id, {
            content,
            metadata,
        });
        this.emit('messageUpdate', sessionId, existingMessage.id, content, metadata);
    }
    updateContextCompactionMessage(sessionId, turn, status, timestamp) {
        const existingMessage = this.getSessionMessage(sessionId, turn.contextCompactionMessageId);
        if (!existingMessage) {
            return;
        }
        const metadata = this.buildContextCompactionMetadata(turn, status, timestamp);
        const content = this.getContextCompactionContent(status);
        this.store.updateMessage(sessionId, existingMessage.id, {
            content,
            metadata,
        });
        this.emit('messageUpdate', sessionId, existingMessage.id, content, metadata);
    }
    handleAgentCompactionEvent(sessionId, data) {
        if (!isRecord(data)) {
            console.warn(`[EngineRuntime] ignored a context compaction event for session ${sessionId} because the payload was invalid.`);
            return;
        }
        const phase = typeof data.phase === 'string' ? data.phase.trim() : '';
        const turn = this.activeTurns.get(sessionId);
        if (phase === 'start') {
            if (turn) {
                turn.hasContextCompactionEvent = true;
                this.markContextCompactionRunning(sessionId, turn, Date.now());
            }
            this.store.updateSession(sessionId, { status: 'running' });
            this.emitSessionStatus(sessionId, 'running');
            this.emitContextMaintenance(sessionId, true);
            this.refreshContinuityCapsule(sessionId, coworkContinuityCapsule_1.ContinuityCapsuleSource.PreCompaction);
            console.log(`[EngineRuntime] context compaction started for session ${sessionId}.`);
            return;
        }
        if (phase !== 'end') {
            console.debug(`[EngineRuntime] ignored a context compaction event for session ${sessionId} because phase ${phase || 'unknown'} is unsupported.`);
            return;
        }
        if (turn) {
            turn.hasContextCompactionEvent = false;
        }
        this.store.updateSession(sessionId, { status: 'running' });
        this.emitSessionStatus(sessionId, 'running');
        const completed = data.completed === true;
        const willRetry = data.willRetry === true;
        let compactionStatus = coworkSystemMessages_1.ContextCompactionStatus.Failed;
        if (willRetry) {
            compactionStatus = coworkSystemMessages_1.ContextCompactionStatus.Retrying;
        }
        else if (completed) {
            compactionStatus = coworkSystemMessages_1.ContextCompactionStatus.Completed;
        }
        if (turn) {
            this.updateContextCompactionMessage(sessionId, turn, compactionStatus, Date.now());
        }
        if (turn && willRetry) {
            this.waitForRecoverableOpenClawRetry(sessionId, turn, turn.runId, {
                reason: 'context compaction requested retry',
                graceMs: OpenClawRuntimeAdapter.VISIBLE_FINAL_CONTINUATION_GRACE_MS,
            });
        }
        else {
            this.emitContextMaintenance(sessionId, false);
        }
        console.log(`[EngineRuntime] context compaction ended for session ${sessionId}, completed=${completed}, willRetry=${willRetry}.`);
        if (completed) {
            this.refreshContinuityCapsule(sessionId, coworkContinuityCapsule_1.ContinuityCapsuleSource.PostCompaction, {
                compactedAt: Date.now(),
            });
            void this.logContextCompactionDiagnostic({
                sessionId,
                mode: 'auto',
                compacted: true,
            });
            this.refreshAndEmitContextUsage(sessionId);
            setTimeout(() => {
                this.refreshAndEmitContextUsage(sessionId);
            }, 1500);
        }
    }
    refreshAndEmitContextUsage(sessionId) {
        void this.getContextUsage(sessionId).then((usage) => {
            if (usage) {
                this.emit('contextUsageUpdate', sessionId, usage);
            }
        }).catch((error) => {
            console.warn('[EngineRuntime] context usage refresh after compaction failed:', error);
        });
    }
    scheduleLifecycleEndFallback(sessionId, turn, endingRunId, delayMs) {
        if (!turn)
            return;
        if (turn.lifecycleEndFallbackTimer) {
            clearTimeout(turn.lifecycleEndFallbackTimer);
        }
        const turnToken = turn.turnToken;
        turn.lifecycleEndFallbackTimer = setTimeout(() => {
            const currentTurn = this.activeTurns.get(sessionId);
            if (!currentTurn || currentTurn.turnToken !== turnToken)
                return;
            currentTurn.lifecycleEndFallbackTimer = undefined;
            if (endingRunId && !currentTurn.knownRunIds.has(endingRunId))
                return;
            if (this.isWaitingForRecoverableFollowup(currentTurn) || currentTurn.finalCompletionTimer) {
                console.debug('[EngineRuntime] lifecycle end fallback stayed open while waiting for retry follow-up.');
                return;
            }
            console.log('[EngineRuntime] agent lifecycle end fallback completed a turn that missed chat final.');
            void this.completeChannelTurnFallback(sessionId, currentTurn);
        }, delayMs);
        console.debug('[EngineRuntime] scheduled lifecycle end fallback for missing chat.final.');
    }
    cancelLifecycleEndFallback(sessionId, turn, reason) {
        if (!turn.lifecycleEndFallbackTimer)
            return;
        clearTimeout(turn.lifecycleEndFallbackTimer);
        turn.lifecycleEndFallbackTimer = undefined;
        this.store.updateSession(sessionId, { status: 'running' });
        this.emitSessionStatus(sessionId, 'running');
        console.debug(`[EngineRuntime] canceled lifecycle end fallback because ${reason}.`);
    }
    /**
     * Fallback completion for turns that never received a `chat state=final`
     * event. Called from handleAgentLifecycleEvent after a delay to give the normal
     * handleChatFinal path time to run first.
     */
    async completeChannelTurnFallback(sessionId, turn) {
        if (!this.activeTurns.has(sessionId))
            return;
        try {
            if ((0, openclawChannelSessionSync_1.isManagedSessionKey)(turn.sessionKey)) {
                await this.syncFinalAssistantWithHistory(sessionId, turn);
            }
            else {
                await this.syncSessionHistoryFromGateway(sessionId, turn.sessionKey);
            }
        }
        catch (error) {
            console.warn('[EngineRuntime] fallback final sync failed:', error);
        }
        // Re-check after async final sync — handleChatFinal may have run in the meantime
        if (!this.activeTurns.has(sessionId))
            return;
        if (this.isWaitingForRecoverableFollowup(turn) || turn.finalCompletionTimer)
            return;
        const fallbackContinuation = this.shouldWaitForLifecycleFallbackContinuation(sessionId, turn);
        if (fallbackContinuation.wait) {
            this.waitForRecoverableOpenClawRetry(sessionId, turn, turn.runId, {
                reason: fallbackContinuation.reason,
                graceMs: fallbackContinuation.graceMs,
                pendingThinkingOnlyHint: fallbackContinuation.pendingThinkingOnlyHint,
                pendingVisibleFinalContinuation: fallbackContinuation.pendingVisibleFinalContinuation,
            });
            console.debug('[EngineRuntime] lifecycle fallback stayed open after history sync because a retry may follow.', `sessionId=${sessionId}`, `runId=${turn.runId}`, `reason=${fallbackContinuation.reason}`, `toolResultChars=${fallbackContinuation.toolResultChars}`, `visibleTextLen=${fallbackContinuation.visibleTextLen}`);
            return;
        }
        // Sync usage metadata (same logic as handleChatFinal)
        if (turn.sessionKey) {
            const targetMessageId = this.resolveAssistantMessageIdForUsage(sessionId, turn.assistantMessageId);
            if (targetMessageId) {
                void this.syncUsageMetadata(sessionId, turn.sessionKey, targetMessageId);
            }
        }
        if (this.hasTurnToolWork(sessionId, turn)) {
            turn.allowRecentlyClosedRunRetryReopenOnCleanup = true;
        }
        this.store.updateSession(sessionId, { status: 'completed' });
        this.emit('complete', sessionId, turn.runId);
        this.cleanupSessionTurn(sessionId);
        this.resolveTurn(sessionId);
    }
    handleAgentToolEvent(sessionId, turn, data) {
        if (!isRecord(data))
            return;
        const rawPhase = typeof data.phase === 'string' ? data.phase.trim() : '';
        const phase = rawPhase === 'end' ? 'result' : rawPhase;
        const toolCallId = typeof data.toolCallId === 'string' ? data.toolCallId.trim() : '';
        if (isContextMaintenanceToolEvent(data)) {
            turn.hasContextMaintenanceTool = true;
            if (toolCallId) {
                turn.contextMaintenanceToolCallIds.add(toolCallId);
            }
            this.store.updateSession(sessionId, { status: 'running' });
            this.emitSessionStatus(sessionId, 'running');
            this.emitContextMaintenance(sessionId, true);
            return;
        }
        if (toolCallId && turn.contextMaintenanceToolCallIds.has(toolCallId)) {
            return;
        }
        if (toolCallId && turn.planModeSuppressedToolCallIds?.has(toolCallId)) {
            return;
        }
        if (!toolCallId)
            return;
        if (phase !== 'start' && phase !== 'update' && phase !== 'result')
            return;
        const toolNameRaw = typeof data.name === 'string' ? data.name.trim() : '';
        const toolName = toolNameRaw || 'Tool';
        (0, diagnostics_1.logThinkingDiagnostic)('tool-event', `sessionId=${sessionId}`, `phase=${phase}`, `tool=${toolName}`, `toolCall=${toolCallId.slice(-12)}`, `assistantMessage=${turn.assistantMessageId ?? '-'}`, `thinkingMessage=${turn.thinking.messageId ?? '-'}`, `thinkingChars=${turn.thinking.currentText.length}`);
        if (phase === 'start' && turn.planMode) {
            const blockedReason = getPlanModeBlockedToolReason(toolNameRaw, data.args);
            if (blockedReason) {
                console.warn(`[EngineRuntime] blocked ${toolName} in plan mode for session ${sessionId}: ${blockedReason}.`);
                (turn.planModeSuppressedToolCallIds ??= new Set()).add(toolCallId);
                if (turn.planModeRecoveryAttempted || turn.planModeSafetyRecoveryPending) {
                    console.warn(`[EngineRuntime] stopped plan mode session ${sessionId} after a repeated blocked tool call.`);
                    this.stopSession(sessionId);
                    return;
                }
                turn.planModeRecoveryAttempted = true;
                turn.planModeSafetyRecoveryPending = true;
                turn.planModeSafetyRecoveryAbortedRunId = turn.runId;
                void Promise.resolve().then(() => this.requireGatewayClient().request('chat.abort', {
                    sessionKey: turn.sessionKey,
                    runId: turn.runId,
                })).catch((error) => {
                    if (this.activeTurns.get(sessionId) !== turn || !turn.planModeSafetyRecoveryPending)
                        return;
                    turn.planModeSafetyRecoveryPending = false;
                    console.error(`[EngineRuntime] failed to abort a blocked plan mode tool for session ${sessionId}:`, error);
                    this.stopSession(sessionId);
                });
                return;
            }
            if (shouldSuppressPlanModeToolEvent(toolNameRaw, data.args)) {
                (turn.planModeSuppressedToolCallIds ??= new Set()).add(toolCallId);
                console.debug(`[EngineRuntime] suppressed a read-only ${toolName} event from the plan mode transcript for session ${sessionId}.`);
                return;
            }
        }
        if (toolNameRaw.toLowerCase() === 'browser') {
            const isError = (0, exports.resolveToolEventIsError)(data);
            const browserArgs = isRecord(data.args) ? data.args : {};
            const browserResult = isRecord(data.result) ? data.result : {};
            const browserResultDetails = isRecord(browserResult.details) ? browserResult.details : {};
            const readBrowserEventString = (value) => (typeof value === 'string' && value.trim() ? value.trim() : undefined);
            const browserAction = readBrowserEventString(browserArgs.action);
            const browserProfile = readBrowserEventString(browserArgs.profile);
            const browserTargetId = readBrowserEventString(browserResultDetails.targetId)
                ?? readBrowserEventString(browserResult.targetId)
                ?? readBrowserEventString(browserArgs.targetId);
            try {
                this.options.onBrowserToolEvent?.({
                    sessionId,
                    phase,
                    ...(browserAction ? { action: browserAction } : {}),
                    ...(browserProfile ? { profile: browserProfile } : {}),
                    ...(browserTargetId ? { targetId: browserTargetId } : {}),
                    ...(phase === constants_2.AgentBrowserToolPhase.Result ? { isError } : {}),
                });
            }
            catch (error) {
                console.warn('[EngineRuntime] Browser observation callback failed.', error);
            }
            const browserEventSummary = `[EngineRuntime] browser tool event: phase=${phase}`
                + ` action=${browserAction ?? 'unknown'} toolCallId=${toolCallId}`
                + (browserTargetId ? ` targetId=${browserTargetId}` : '');
            if (phase === constants_2.AgentBrowserToolPhase.Result && isError) {
                console.warn(`${browserEventSummary} failed.`);
            }
            else {
                console.debug(browserEventSummary);
            }
        }
        if (!turn.toolUseMessageIdByToolCallId.has(toolCallId)) {
            this.splitAssistantSegmentBeforeTool(sessionId, turn, toolCallId);
            turn.agentAssistantTextLength = 0;
            const toolUseMessage = this.store.addMessage(sessionId, {
                type: 'tool_use',
                content: `Using tool: ${toolName}`,
                metadata: {
                    toolName,
                    toolInput: toToolInputRecord(data.args),
                    toolUseId: toolCallId,
                },
            });
            turn.toolUseMessageIdByToolCallId.set(toolCallId, toolUseMessage.id);
            this.emit('message', sessionId, toolUseMessage);
            this.turnHistorySync.scheduleThinking(sessionId, toolCallId);
            // Track sessions_spawn tool calls for subagent visualization
            if (toolNameRaw.toLowerCase() === 'sessions_spawn') {
                this.subagentTracker.onToolStart(toolCallId, toToolInputRecord(data.args), sessionId);
            }
        }
        if (phase === 'update') {
            const incoming = extractToolText(data.partialResult);
            const updateDetails = resolveMediaStatusToolDetails(turn, toolCallId, toolName, data.args, data.partialResult, 'update', incoming);
            if (!incoming.trim() && !updateDetails)
                return;
            const previous = turn.toolResultTextByToolCallId.get(toolCallId) ?? '';
            let merged = previous;
            if (incoming.trim()) {
                merged = updateDetails
                    ? incoming
                    : mergeStreamingText(previous, incoming, 'unknown').text;
            }
            const existingResultMessageId = turn.toolResultMessageIdByToolCallId.get(toolCallId);
            const updateMetadata = {
                toolResult: merged,
                toolUseId: toolCallId,
                isError: false,
                isStreaming: true,
                isFinal: false,
                ...(updateDetails ? { toolResultDetails: updateDetails } : {}),
            };
            if (!existingResultMessageId) {
                const resultMessage = this.store.addMessage(sessionId, {
                    type: 'tool_result',
                    content: merged,
                    metadata: updateMetadata,
                });
                turn.toolResultMessageIdByToolCallId.set(toolCallId, resultMessage.id);
                turn.toolResultTextByToolCallId.set(toolCallId, merged);
                this.emit('message', sessionId, resultMessage);
                return;
            }
            if (merged !== previous || updateDetails) {
                this.store.updateMessage(sessionId, existingResultMessageId, {
                    content: merged,
                    metadata: updateMetadata,
                });
                turn.toolResultTextByToolCallId.set(toolCallId, merged);
                this.emit('messageUpdate', sessionId, existingResultMessageId, merged, updateMetadata);
            }
            return;
        }
        if (phase === 'result') {
            const incoming = extractToolText(data.result);
            const toolDetails = resolveMediaStatusToolDetails(turn, toolCallId, toolName, data.args, data.result, 'result', incoming);
            const previous = turn.toolResultTextByToolCallId.get(toolCallId) ?? '';
            const isError = (0, exports.resolveToolEventIsError)(data);
            const finalContent = incoming.trim() ? incoming : previous;
            if (isOpenClawToolLoopBlockedResultText(finalContent)) {
                turn.toolLoopBlockReason = finalContent.trim().slice(0, 400);
            }
            const finalError = isError ? (finalContent || 'Tool execution failed') : undefined;
            const existingResultMessageId = turn.toolResultMessageIdByToolCallId.get(toolCallId);
            const finalMetadata = {
                toolResult: finalContent,
                toolUseId: toolCallId,
                error: finalError,
                isError,
                isStreaming: false,
                isFinal: true,
                ...(toolDetails ? { toolResultDetails: toolDetails } : {}),
            };
            if (existingResultMessageId) {
                this.store.updateMessage(sessionId, existingResultMessageId, {
                    content: finalContent,
                    metadata: finalMetadata,
                });
                this.emit('messageUpdate', sessionId, existingResultMessageId, finalContent, finalMetadata);
            }
            else {
                const resultMessage = this.store.addMessage(sessionId, {
                    type: 'tool_result',
                    content: finalContent,
                    metadata: finalMetadata,
                });
                turn.toolResultMessageIdByToolCallId.set(toolCallId, resultMessage.id);
                this.emit('message', sessionId, resultMessage);
            }
            turn.toolResultTextByToolCallId.set(toolCallId, finalContent);
            // Track subagent session keys from sessions_spawn results
            if (toolNameRaw.toLowerCase() === 'sessions_spawn' && finalContent) {
                this.subagentTracker.onSpawnResult(toolCallId, finalContent, toToolInputRecord(data.args));
            }
            // Mark subagent as done when parent retrieves result via sessions_resume/sessions_read
            if (toolNameRaw.toLowerCase() === 'sessions_resume' || toolNameRaw.toLowerCase() === 'sessions_read') {
                this.subagentTracker.onResumeOrReadResult(toToolInputRecord(data.args));
            }
            // Schedule incremental backfill if the result text is empty (gateway stripped it).
            // The authoritative text will be fetched from chat.history after a debounce window.
            if (!finalContent.trim()) {
                this.turnHistorySync.scheduleToolResultBackfill(sessionId, toolCallId);
            }
        }
    }
    handleChatEvent(payload, seq) {
        if (!isRecord(payload))
            return;
        const chatPayload = payload;
        const state = chatPayload.state;
        if (!state)
            return;
        const runId = typeof chatPayload.runId === 'string' ? chatPayload.runId.trim() : '';
        (0, diagnostics_1.logThinkingDiagnostic)('chat-event', `seq=${seq ?? '-'}`, `state=${state}`, `run=${runId ? runId.slice(-12) : '-'}`, `stopReason=${chatPayload.stopReason ?? '-'}`, (0, diagnostics_1.summarizeThinkingMessageForDiagnostics)(chatPayload.message));
        console.debug('[EngineRuntime] handleChatEvent:', `state=${state}`, `runId=${typeof chatPayload.runId === 'string' ? chatPayload.runId : ''}`, `sessionKey=${typeof chatPayload.sessionKey === 'string' ? chatPayload.sessionKey : ''}`, `message=${summarizeGatewayMessageShape(chatPayload.message)}`);
        if (runId && this.isRecentlyClosedRunId(runId)) {
            console.debug('[EngineRuntime] dropped late chat event for a closed run.');
            return;
        }
        const sessionKey = typeof chatPayload.sessionKey === 'string' ? chatPayload.sessionKey.trim() : '';
        const sessionId = this.resolveSessionIdFromChatPayload(chatPayload);
        if (state === 'final' || state === 'aborted' || state === 'error') {
            console.log('[EngineRuntime] terminal chat received:', `state=${state}`, `runId=${runId || 'unknown'}`, `sessionKey=${sessionKey || 'unknown'}`, `sessionId=${sessionId ?? 'none'}`, `active=${sessionId ? this.activeTurns.has(sessionId) : false}`, `isSubagentSessionKey=${(0, sessionKeys_1.isSubagentSessionKey)(sessionKey)}`, `message=${summarizeGatewayMessageShape(chatPayload.message)}`);
        }
        if (!sessionId) {
            if ((state === 'final' || state === 'aborted' || state === 'error')
                && sessionKey
                && this.subagentTracker.tryMarkTerminalFromSessionKey(sessionKey, state === 'final' ? 'done' : 'error')) {
                this.subagentSessionMaterializer.finalizePassive(sessionKey, state === 'final' ? 'done' : 'error');
                return;
            }
            if (state === 'final' || state === 'aborted' || state === 'error') {
                console.warn('[EngineRuntime] dropping terminal chat event because no sessionId resolved', `state=${state}`, `runId=${runId || 'unknown'}`, `sessionKey=${typeof chatPayload.sessionKey === 'string' ? chatPayload.sessionKey : 'unknown'}`, `message=${summarizeGatewayMessageShape(chatPayload.message)}`);
            }
            console.debug('[EngineRuntime] handleChatEvent — no sessionId resolved, dropping event');
            return;
        }
        if (!this.activeTurns.has(sessionId)
            && sessionKey
            && runId
            && (0, sessionKeys_1.isSubagentSessionKey)(sessionKey)
            && state !== 'final'
            && state !== 'aborted'
            && state !== 'error') {
            this.ensureActiveTurn(sessionId, sessionKey, runId);
        }
        const turn = this.activeTurns.get(sessionId);
        if (!turn) {
            if ((state === 'final' || state === 'aborted' || state === 'error')
                && sessionKey
                && this.subagentTracker.tryMarkTerminalFromSessionKey(sessionKey, state === 'final' ? 'done' : 'error')) {
                this.subagentSessionMaterializer.finalizePassive(sessionKey, state === 'final' ? 'done' : 'error');
                return;
            }
            console.debug('[EngineRuntime] handleChatEvent — no active turn for sessionId:', sessionId);
            return;
        }
        // Buffer chat events while user messages are being prefetched for channel sessions
        if (turn.pendingUserSync) {
            console.debug('[EngineRuntime] handleChatEvent — buffering (pendingUserSync), sessionId:', sessionId);
            turn.bufferedChatPayloads.push({ payload, seq, bufferedAt: Date.now() });
            return;
        }
        if (typeof seq === 'number' && Number.isFinite(seq) && runId) {
            const lastSeq = this.lastChatSeqByRunId.get(runId);
            if (lastSeq !== undefined && seq <= lastSeq) {
                return;
            }
            this.lastChatSeqByRunId.set(runId, seq);
        }
        if (state === 'delta') {
            const deltaText = (0, openclawHistory_1.extractGatewayMessageText)(chatPayload.message).trim();
            if (!(0, openclawHistory_1.isHeartbeatAckText)(deltaText) && !(0, openclawHistory_1.isSilentReplyText)(deltaText) && !(0, openclawHistory_1.isSilentReplyPrefixText)(deltaText)) {
                this.cancelLifecycleEndFallback(sessionId, turn, 'chat delta continued');
                this.postponeChatFinalCompletion(sessionId, turn, 'chat delta continued');
            }
            this.handleChatDelta(sessionId, turn, chatPayload);
            return;
        }
        if (state === 'final') {
            this.cancelLifecycleEndFallback(sessionId, turn, 'chat final arrived');
            // Detect announce chat final — mark subagent done as backup
            if (runId) {
                this.subagentTracker.tryMarkDoneFromAnnounceRunId(runId);
            }
            this.handleChatFinal(sessionId, turn, chatPayload);
            return;
        }
        if (state === 'aborted') {
            const elapsedSec = ((Date.now() - turn.startedAtMs) / 1000).toFixed(1);
            console.warn(`[AbortDiag] chat aborted event received`, `sessionId=${sessionId}`, `runId=${turn.runId}`, `sessionKey=${turn.sessionKey}`, `elapsed=${elapsedSec}s`, `stopReason=${chatPayload.stopReason ?? 'unknown'}`, `stopRequested=${turn.stopRequested}`, `manuallyStoppedSession=${this.manuallyStoppedSessions.has(sessionId)}`, `payload=${JSON.stringify(chatPayload).slice(0, 500)}`);
            this.handleChatAborted(sessionId, turn);
            return;
        }
        if (state === 'error') {
            if (this.completeDeferredFinalOnStaleChatError(sessionId, turn, chatPayload)) {
                return;
            }
            this.handleChatError(sessionId, turn, chatPayload);
        }
    }
    updateTurnTextState(turn, message, options = {}) {
        const contentText = extractMessageText(message).trim();
        const { textBlocks, thinkingText, sawNonTextContentBlocks } = extractTextBlocksAndSignals(message);
        // Update thinking text on the turn
        if (thinkingText) {
            const previousThinkingText = turn.thinking.currentText;
            (0, diagnostics_1.logThinkingDiagnostic)('chat-thinking-snapshot', `sessionId=${turn.sessionId}`, `previousChars=${previousThinkingText.length}`, `nextChars=${thinkingText.length}`, `extendsPrevious=${Boolean(previousThinkingText && thinkingText.startsWith(previousThinkingText))}`, (0, diagnostics_1.summarizeThinkingMessageForDiagnostics)(message));
            turn.thinking.currentText = thinkingText;
        }
        if (contentText) {
            const nextContentBlocks = textBlocks.length > 0 ? textBlocks : [contentText];
            const shouldProtectBoundaryDrop = Boolean(options.protectBoundaryDrops
                && (turn.sawNonTextContentBlocks || sawNonTextContentBlocks)
                && isDroppedBoundaryTextBlockSubset(turn.currentContentBlocks, nextContentBlocks));
            if (!shouldProtectBoundaryDrop) {
                if (options.forceReplace) {
                    turn.currentContentText = contentText;
                    turn.currentContentBlocks = nextContentBlocks;
                    turn.textStreamMode = 'snapshot';
                }
                else {
                    const merged = mergeStreamingText(turn.currentContentText, contentText, turn.textStreamMode);
                    turn.currentContentText = merged.text;
                    turn.textStreamMode = merged.mode;
                    if (merged.mode === 'snapshot') {
                        turn.currentContentBlocks = nextContentBlocks;
                    }
                    else {
                        const mergedText = merged.text.trim();
                        if (mergedText) {
                            turn.currentContentBlocks = [mergedText];
                        }
                    }
                }
            }
        }
        if (sawNonTextContentBlocks) {
            turn.sawNonTextContentBlocks = true;
        }
        turn.currentText = turn.currentContentText.trim();
    }
    resolveFinalTurnText(turn, message) {
        const streamedText = turn.currentText.trim();
        const streamedTextBlocks = [...turn.currentContentBlocks];
        const streamedSawNonTextContentBlocks = turn.sawNonTextContentBlocks;
        this.updateTurnTextState(turn, message, { forceReplace: true });
        const finalText = turn.currentText.trim();
        if (!finalText) {
            return streamedText;
        }
        const shouldFallbackToStreamedText = streamedSawNonTextContentBlocks
            && isDroppedBoundaryTextBlockSubset(streamedTextBlocks, turn.currentContentBlocks);
        if (shouldFallbackToStreamedText && streamedText) {
            turn.currentContentText = streamedText;
            turn.currentContentBlocks = streamedTextBlocks;
            turn.currentText = streamedText;
            return streamedText;
        }
        return finalText;
    }
    resolveAssistantSegmentText(turn, fullText) {
        const normalizedFullText = fullText.trim();
        const committed = turn.committedAssistantText;
        if (!normalizedFullText) {
            return '';
        }
        if (!committed) {
            return normalizedFullText;
        }
        if (normalizedFullText.startsWith(committed)) {
            return normalizedFullText.slice(committed.length).trimStart();
        }
        return normalizedFullText;
    }
    deleteAssistantMessage(sessionId, messageId) {
        this.clearPendingStoreUpdate(messageId);
        this.clearPendingMessageUpdate(messageId);
        this.store.deleteMessage(sessionId, messageId);
        this.notifySessionsChanged(sessionId);
    }
    deleteSilentAssistantMessages(sessionId) {
        const session = this.store.getSession(sessionId);
        if (!session)
            return;
        const silentAssistantIds = session.messages
            .filter((message) => message.type === 'assistant' && (0, openclawHistory_1.isSilentReplyText)(message.content))
            .map((message) => message.id);
        for (const messageId of silentAssistantIds) {
            this.deleteAssistantMessage(sessionId, messageId);
        }
    }
    /**
     * Process agent assistant-stream text directly from handleGatewayEvent.
     * This bypasses handleAgentEvent's session resolution (which may enqueue events),
     * ensuring text updates and reset detection always work.
     */
    processAgentAssistantText(payload) {
        if (!isRecord(payload))
            return;
        const p = payload;
        if (p.stream !== 'assistant')
            return;
        const dataField = isRecord(p.data) ? p.data : p;
        const parts = (0, openclawAssistantText_1.extractOpenClawAssistantStreamParts)(dataField);
        if (!parts.text && !parts.thinking) {
            const fallback = (0, openclawAssistantText_1.extractOpenClawAssistantStreamParts)(p);
            parts.text = parts.text || fallback.text;
            parts.thinking = parts.thinking || fallback.thinking;
        }
        const text = parts.text || (0, openclawAssistantText_1.extractOpenClawAssistantStreamText)(p);
        const runId = typeof p.runId === 'string' ? p.runId.trim() : '';
        const sessionKey = typeof p.sessionKey === 'string' ? p.sessionKey.trim() : '';
        if (runId && this.isRecentlyClosedRunId(runId)) {
            console.debug('[EngineRuntime] dropped late assistant text for a closed run.');
            return;
        }
        let sessionId = runId ? this.sessionIdByRunId.get(runId) : undefined;
        if (!sessionId && sessionKey) {
            sessionId = this.resolveSessionIdBySessionKey(sessionKey) ?? undefined;
            if (!sessionId && this.channelSessionSync) {
                sessionId = this.resolveOrCreateChannelSession(sessionKey) ?? undefined;
                if (sessionId) {
                    this.rememberSessionKey(sessionId, sessionKey);
                }
            }
            if (sessionId && !this.activeTurns.has(sessionId)) {
                this.ensureActiveTurn(sessionId, sessionKey, runId);
            }
            if (sessionId && runId) {
                this.bindRunIdToTurn(sessionId, runId);
            }
        }
        const turn = sessionId ? this.activeTurns.get(sessionId) : undefined;
        // Sync thinking message if thinking content is available
        if (parts.thinking && turn && sessionId) {
            if (parts.thinking !== turn.thinking.currentText) {
                turn.thinking.currentText = parts.thinking;
                this.thinkingController.sync(sessionId, turn);
            }
        }
        if (!text || !turn || !sessionId) {
            if (text) {
                console.debug('[Debug:processAssistant] skipped: text.len:', text.length, 'runId:', runId.slice(0, 8), 'sessionKey:', sessionKey, 'sid:', !!sessionId, 'turn:', !!turn);
            }
            return;
        }
        if ((0, openclawHistory_1.isHeartbeatAckText)(text) || (0, openclawHistory_1.isSilentReplyText)(text)) {
            turn.currentText = text;
            turn.currentAssistantSegmentText = '';
            if (turn.assistantMessageId) {
                this.deleteAssistantMessage(sessionId, turn.assistantMessageId);
                turn.assistantMessageId = null;
            }
            return;
        }
        if ((0, openclawHistory_1.isSilentReplyPrefixText)(text)) {
            turn.currentText = text;
            turn.currentAssistantSegmentText = '';
            if (turn.assistantMessageId) {
                this.deleteAssistantMessage(sessionId, turn.assistantMessageId);
                turn.assistantMessageId = null;
            }
            return;
        }
        if (this.isWaitingForRecoverableFollowup(turn)) {
            turn.hasRecoverableContinuationText = true;
        }
        this.postponeChatFinalCompletion(sessionId, turn, 'assistant text continued');
        this.clearContextMaintenanceState(sessionId, turn, 'assistant text continued');
        // Detect text reset: new model call starts → text length drops significantly.
        // Only trigger when hwm is meaningful (> 5 chars) to avoid false positives
        // from early chat delta / agent event interleaving.
        if (isSignificantAssistantStreamReset(turn.agentAssistantTextLength, text.length)
            && turn.assistantMessageId) {
            console.debug('[Debug:textReset] detected:', turn.agentAssistantTextLength, '->', text.length, 'splitting. prevText:', turn.currentText.slice(0, 80));
            this.splitAssistantSegmentBeforeTool(sessionId, turn);
            turn.agentAssistantTextLength = 0;
        }
        // Track high-water mark.
        turn.agentAssistantTextLength = Math.max(turn.agentAssistantTextLength, text.length);
        if (text.trim().length > 0) {
            turn.hasSeenAgentAssistantStream = true;
        }
        // Update turn text state and push to store.
        turn.currentText = text;
        const displayText = (0, openclawHistory_1.stripTrailingSilentReplyTail)(text);
        turn.currentAssistantSegmentText = this.resolveAssistantSegmentText(turn, displayText);
        if (turn.currentAssistantSegmentText) {
            this.logFirstResponseTiming(sessionId, turn, 'agent', turn.currentAssistantSegmentText.length);
        }
        if (!turn.assistantMessageId && turn.currentAssistantSegmentText) {
            // Create a new message for the new text segment (after split).
            const msgTimestamp = isRecord(payload.message) && typeof payload.message.timestamp === 'number'
                ? payload.message.timestamp : undefined;
            const assistantMessage = this.store.addMessage(sessionId, {
                type: 'assistant',
                content: turn.currentAssistantSegmentText,
                metadata: { isStreaming: true, isFinal: false },
            }, msgTimestamp);
            turn.assistantMessageId = assistantMessage.id;
            this.emit('message', sessionId, assistantMessage);
        }
        else if (turn.assistantMessageId && turn.currentAssistantSegmentText) {
            this.throttledStoreUpdateMessage(sessionId, turn.assistantMessageId, turn.currentAssistantSegmentText, { isStreaming: true, isFinal: false });
            this.throttledEmitMessageUpdate(sessionId, turn.assistantMessageId, turn.currentAssistantSegmentText);
        }
    }
    splitAssistantSegmentBeforeTool(sessionId, turn, toolCallId) {
        this.thinkingController.finalizeBeforeTool(sessionId, turn, toolCallId);
        if (!turn.assistantMessageId)
            return;
        const messageId = turn.assistantMessageId;
        // Flush pending throttled updates so store content is current before reading.
        this.flushPendingStoreUpdate(sessionId, messageId);
        this.clearPendingMessageUpdate(messageId);
        // Committed text: use agentAssistantTextLength as the reliable segment length,
        // since currentText/currentAssistantSegmentText may be overwritten by chat deltas.
        // Read the actual content from the store (which was updated by processAgentAssistantText).
        const session = this.store.getSession(sessionId);
        const currentMsg = session?.messages.find((m) => m.id === messageId);
        const storeContent = currentMsg?.content?.trim() || '';
        if (storeContent) {
            turn.committedAssistantText = `${turn.committedAssistantText}${storeContent}`;
            turn.lastCommittedAssistantMessageId = messageId;
        }
        const finalMetadata = { isStreaming: false, isFinal: true };
        this.store.updateMessage(sessionId, messageId, {
            metadata: finalMetadata,
        });
        if (storeContent) {
            this.emit('messageUpdate', sessionId, messageId, storeContent, finalMetadata);
        }
        turn.assistantMessageId = null;
        turn.currentAssistantSegmentText = '';
        turn.hasSeenAgentAssistantStream = false;
        turn.chatDeltaOverwriteSkipLogged = false;
    }
    handleChatDelta(sessionId, turn, payload) {
        const previousText = turn.currentText;
        const previousContentText = turn.currentContentText;
        const previousContentBlocks = [...turn.currentContentBlocks];
        const previousSawNonTextContentBlocks = turn.sawNonTextContentBlocks;
        const previousTextStreamMode = turn.textStreamMode;
        const previousSegmentText = turn.currentAssistantSegmentText;
        this.updateTurnTextState(turn, payload.message, { protectBoundaryDrops: true });
        // Handle thinking message independently of regular text flow
        this.thinkingController.sync(sessionId, turn);
        const streamedText = turn.currentText;
        if (previousText && streamedText && streamedText.length < previousText.length) {
            turn.currentText = previousText;
            turn.currentContentText = previousContentText;
            turn.currentContentBlocks = previousContentBlocks;
            turn.sawNonTextContentBlocks = previousSawNonTextContentBlocks;
            turn.textStreamMode = previousTextStreamMode;
            return;
        }
        if (!streamedText)
            return;
        if ((0, openclawHistory_1.isHeartbeatAckText)(streamedText) || (0, openclawHistory_1.isSilentReplyText)(streamedText)) {
            turn.currentAssistantSegmentText = '';
            if (turn.assistantMessageId) {
                this.deleteAssistantMessage(sessionId, turn.assistantMessageId);
                turn.assistantMessageId = null;
            }
            return;
        }
        if ((0, openclawHistory_1.isSilentReplyPrefixText)(streamedText)) {
            turn.currentAssistantSegmentText = '';
            if (turn.assistantMessageId) {
                this.deleteAssistantMessage(sessionId, turn.assistantMessageId);
                turn.assistantMessageId = null;
            }
            return;
        }
        if (this.isWaitingForRecoverableFollowup(turn)) {
            turn.hasRecoverableContinuationText = true;
        }
        this.clearContextMaintenanceState(sessionId, turn, 'chat delta continued');
        const displayStreamedText = (0, openclawHistory_1.stripTrailingSilentReplyTail)(streamedText);
        const segmentText = this.resolveAssistantSegmentText(turn, displayStreamedText);
        if (!segmentText)
            return;
        if (segmentText === previousSegmentText && streamedText === previousText)
            return;
        this.logFirstResponseTiming(sessionId, turn, 'chat', segmentText.length);
        if (!turn.assistantMessageId) {
            const msgTimestamp = isRecord(payload.message) && typeof payload.message.timestamp === 'number'
                ? payload.message.timestamp : undefined;
            const assistantMessage = this.store.addMessage(sessionId, {
                type: 'assistant',
                content: segmentText,
                metadata: {
                    isStreaming: true,
                    isFinal: false,
                },
            }, msgTimestamp);
            turn.assistantMessageId = assistantMessage.id;
            turn.currentAssistantSegmentText = segmentText;
            this.emit('message', sessionId, assistantMessage);
            return;
        }
        if (turn.assistantMessageId && segmentText !== previousSegmentText) {
            // Only update segment text from chat delta if this segment has NOT yet received
            // agent assistant stream text. Agent stream preserves formatting; chat delta uses
            // extractGatewayMessageText (multi-block trim/join), which can break GFM tables.
            // hasSeenAgentAssistantStream stays true across agentAssistantTextLength resets
            // (e.g. split before tool) until a new assistant segment begins.
            if (!turn.hasSeenAgentAssistantStream) {
                turn.currentAssistantSegmentText = segmentText;
            }
            else if (!turn.chatDeltaOverwriteSkipLogged) {
                turn.chatDeltaOverwriteSkipLogged = true;
                console.debug('[EngineRuntime] skipping further chat.delta segment overwrite; agent stream owns this assistant segment until split');
            }
        }
    }
    async handleChatFinal(sessionId, turn, payload) {
        const previousText = turn.currentText;
        const previousSegmentText = turn.currentAssistantSegmentText;
        const wasWaitingForRecoverableFinal = this.isWaitingForRecoverableFollowup(turn);
        const rawFinalText = this.resolveFinalTurnText(turn, payload.message);
        const messageRecord = isRecord(payload.message) ? payload.message : null;
        const stopReason = payload.stopReason
            ?? (messageRecord && typeof messageRecord.stopReason === 'string' ? messageRecord.stopReason : undefined);
        const errorMessageFromMessage = messageRecord && typeof messageRecord.errorMessage === 'string'
            ? messageRecord.errorMessage
            : undefined;
        const stoppedByToolUse = isToolUseStopReason(stopReason) || messageHasToolCallBlock(messageRecord);
        const stoppedByIncomplete = (0, exports.isIncompleteStopReason)(stopReason);
        const stoppedByError = stopReason === GatewayStopReason.Error;
        const rawVisibleFinalText = (0, openclawHistory_1.stripTrailingSilentReplyToken)(rawFinalText);
        const finalTextIsOpenClawFailure = isOpenClawFailureFinalText(rawVisibleFinalText);
        const finalText = turn.planMode && !stoppedByToolUse && !stoppedByIncomplete && !finalTextIsOpenClawFailure
            ? ensurePlanModeProposedPlanBlock(rawVisibleFinalText)
            : rawVisibleFinalText;
        console.debug('[EngineRuntime] handleChatFinal:', `sessionId=${sessionId}`, `runId=${payload.runId ?? turn.runId}`, `message=${summarizeGatewayMessageShape(payload.message)}`, `previousTextLen=${previousText.length}`, `finalTextLen=${finalText.length}`);
        if (!stoppedByError && !stoppedByIncomplete && (0, openclawHistory_1.isHeartbeatAckText)(finalText)) {
            turn.currentText = finalText;
            turn.currentAssistantSegmentText = '';
            if (turn.assistantMessageId) {
                this.deleteAssistantMessage(sessionId, turn.assistantMessageId);
                turn.assistantMessageId = null;
            }
            this.thinkingController.finalize(sessionId, turn);
            this.store.updateSession(sessionId, { status: 'completed' });
            this.emit('complete', sessionId, payload.runId ?? turn.runId);
            this.cleanupSessionTurn(sessionId);
            this.resolveTurn(sessionId);
            return;
        }
        if (!stoppedByError && !stoppedByIncomplete && ((0, openclawHistory_1.isSilentReplyText)(finalText) || (0, openclawHistory_1.isSilentReplyPrefixText)(finalText))) {
            turn.currentText = finalText;
            turn.currentAssistantSegmentText = '';
            if (turn.assistantMessageId) {
                this.deleteAssistantMessage(sessionId, turn.assistantMessageId);
                turn.assistantMessageId = null;
            }
            this.deleteSilentAssistantMessages(sessionId);
            if (!turn.hasContextMaintenanceTool) {
                await this.syncFinalAssistantWithHistory(sessionId, turn);
            }
            if (turn.hasContextMaintenanceTool) {
                this.store.updateSession(sessionId, { status: 'running' });
                this.emitSessionStatus(sessionId, 'running');
                this.emitContextMaintenance(sessionId, true);
                this.deferChatFinalCompletion(sessionId, turn, payload.runId ?? turn.runId, {
                    graceMs: OpenClawRuntimeAdapter.SILENT_MAINTENANCE_FOLLOWUP_GRACE_MS,
                    flushOnLifecycleEnd: false,
                    allowLateContinuation: true,
                });
                return;
            }
            await this.syncSessionHistoryFromGateway(sessionId, turn.sessionKey);
            this.store.updateSession(sessionId, { status: 'completed' });
            this.emit('complete', sessionId, payload.runId ?? turn.runId);
            this.cleanupSessionTurn(sessionId);
            this.resolveTurn(sessionId);
            return;
        }
        if (finalTextIsOpenClawFailure) {
            const rawErrorMessage = finalText.trim() || 'The run failed';
            const errorMetadata = normalizeOpenClawSafeRuntimeErrorMetadata(payload);
            const resolved = this.resolveTurnErrorMessageWithToolLoopContext(turn, rawErrorMessage, errorMetadata);
            const resolvedError = resolved.resolvedError;
            const errorMessage = resolvedError.message;
            const errorDetail = this.buildTurnErrorDetail(sessionId, turn, resolved.detailRawErrorMessage, errorMessage, errorMetadata);
            const erroredSessionKey = turn.sessionKey;
            this.store.updateSession(sessionId, { status: 'error' });
            const errorMsg = this.store.addMessage(sessionId, {
                type: 'system',
                content: errorMessage,
                metadata: (0, exports.buildRuntimeErrorMetadata)({
                    ...resolvedError,
                    ...(errorDetail ? { errorDetail } : {}),
                }),
            });
            this.emit('message', sessionId, errorMsg);
            this.emit('error', sessionId, errorMessage);
            this.cleanupSessionTurn(sessionId);
            this.rejectTurn(sessionId, new Error(errorMessage));
            void this.syncSessionHistoryFromGateway(sessionId, erroredSessionKey);
            return;
        }
        turn.currentText = finalText;
        if (wasWaitingForRecoverableFinal && finalText.trim()) {
            turn.hasRecoverableContinuationText = true;
        }
        if (finalText && turn.currentContentBlocks.length === 0) {
            turn.currentContentText = finalText;
            turn.currentContentBlocks = [finalText];
        }
        const finalSegmentText = this.resolveAssistantSegmentText(turn, finalText);
        turn.currentAssistantSegmentText = finalSegmentText;
        if (finalSegmentText) {
            this.logFirstResponseTiming(sessionId, turn, 'chat', finalSegmentText.length);
        }
        // Collect media URLs and backfill tool result text from chat.history.
        // The agent tool event does not carry the result text (gateway strips it),
        // so we fetch it from the authoritative transcript via chat.history.
        if (turn.toolUseMessageIdByToolCallId.size > 0
            && turn.sessionKey
            && this.gatewayClient) {
            try {
                const history = await this.gatewayClient.request('chat.history', {
                    sessionKey: turn.sessionKey,
                    limit: 20,
                }, { timeoutMs: 5_000 });
                if (Array.isArray(history?.messages)) {
                    this.syncToolResultsFromHistory(sessionId, turn, history.messages);
                    (0, diagnostics_1.logThinkingDiagnostic)('history-chat-final-tool-backfill', `sessionId=${sessionId}`, `messages=${history.messages.length}`, (0, diagnostics_1.summarizeCurrentTurnThinkingHistoryForDiagnostics)(history.messages));
                }
            }
            catch (err) {
                console.warn('[EngineRuntime] chat history tool result backfill failed:', err);
            }
        }
        if (turn.assistantMessageId) {
            // Flush any pending throttled updates so store content is current.
            this.flushPendingStoreUpdate(sessionId, turn.assistantMessageId);
            this.clearPendingMessageUpdate(turn.assistantMessageId);
            const { content: persistedSegmentText, reason: persistPickReason } = pickPersistedAssistantSegment(previousSegmentText, finalSegmentText, turn.hasSeenAgentAssistantStream);
            if (persistedSegmentText) {
                const finalMetadata = {
                    isStreaming: false,
                    isFinal: true,
                };
                console.debug('[EngineRuntime] persisting assistant segment at chat.final', `sessionId=${sessionId}`, `messageId=${turn.assistantMessageId}`, `reason=${persistPickReason}`, `previousLen=${previousSegmentText.length}`, `finalLen=${finalSegmentText.length}`, `persistedLen=${persistedSegmentText.length}`, `hadAgentStreamAuthority=${turn.hasSeenAgentAssistantStream}`);
                this.store.updateMessage(sessionId, turn.assistantMessageId, {
                    content: persistedSegmentText,
                    metadata: finalMetadata,
                });
                this.emit('messageUpdate', sessionId, turn.assistantMessageId, persistedSegmentText, finalMetadata);
            }
        }
        else if (finalSegmentText) {
            const reusedMessageId = this.reuseFinalAssistantMessage(sessionId, finalSegmentText);
            if (reusedMessageId) {
                turn.assistantMessageId = reusedMessageId;
            }
            else {
                const msgTimestamp = isRecord(payload.message) && typeof payload.message.timestamp === 'number'
                    ? payload.message.timestamp : undefined;
                const assistantMessage = this.store.addMessage(sessionId, {
                    type: 'assistant',
                    content: finalSegmentText,
                    metadata: {
                        isStreaming: false,
                        isFinal: true,
                    },
                }, msgTimestamp);
                turn.assistantMessageId = assistantMessage.id;
                this.emit('message', sessionId, assistantMessage);
            }
        }
        if (stoppedByIncomplete) {
            // A length stop is still a terminal gateway snapshot. Reconcile the
            // bounded authoritative tail before finalizing local state so reasoning
            // and tool work that arrived only in chat.history are not lost. The
            // helper is best-effort and preserves the already-persisted local
            // partial when history is unavailable.
            await this.syncFinalAssistantWithHistory(sessionId, turn, {
                requireActiveTurn: true,
                suppressPlanModeWrapping: true,
            });
            if (this.activeTurns.get(sessionId) !== turn
                || turn.stopRequested) {
                console.debug('[EngineRuntime] ignored length final after the turn was stopped or superseded.', `sessionId=${sessionId}`);
                return;
            }
            // Flush/finalize thinking before applying truncation metadata. Otherwise a
            // pending thinking write can overwrite the incomplete marker.
            this.thinkingController.finalize(sessionId, turn);
            const truncatedMessageId = this.resolveAssistantMessageIdForUsage(sessionId, turn.assistantMessageId);
            if (truncatedMessageId) {
                const session = this.store.getSession(sessionId);
                const truncatedMessage = session?.messages.find((message) => message.id === truncatedMessageId);
                if (truncatedMessage) {
                    const truncatedMetadata = {
                        ...(truncatedMessage.metadata ?? {}),
                        isStreaming: false,
                        isFinal: true,
                        isTruncated: true,
                        stopReason: GatewayStopReason.Length,
                    };
                    this.store.updateMessage(sessionId, truncatedMessageId, {
                        metadata: truncatedMetadata,
                    });
                    this.emit('messageUpdate', sessionId, truncatedMessageId, truncatedMessage.content, truncatedMetadata);
                }
            }
            const incompleteMessage = (0, i18n_1.t)('taskOutputTruncated');
            this.store.updateSession(sessionId, { status: 'error' });
            const systemMessage = this.store.addMessage(sessionId, {
                type: 'system',
                content: incompleteMessage,
                metadata: {
                    error: incompleteMessage,
                    isFinal: true,
                    isIncomplete: true,
                    isTruncated: true,
                    stopReason: GatewayStopReason.Length,
                },
            });
            this.emit('message', sessionId, systemMessage);
            this.emit('error', sessionId, incompleteMessage);
            console.warn('[EngineRuntime] preserved a partial response after the model reached its output limit.', `sessionId=${sessionId}`, `runId=${payload.runId ?? turn.runId}`);
            this.cleanupSessionTurn(sessionId);
            this.rejectTurn(sessionId, new Error(incompleteMessage));
            return;
        }
        if (!stoppedByError && !finalText.trim()) {
            console.debug('[EngineRuntime] handleChatFinal: final payload had no text, falling back to chat.history sync', `sessionId=${sessionId}`, `runId=${payload.runId ?? turn.runId}`);
            await this.syncFinalAssistantWithHistory(sessionId, turn);
            const syncedVisibleText = turn.currentAssistantSegmentText.trim() || turn.currentText.trim();
            if (this.hasTurnToolWork(sessionId, turn)) {
                const visibleRetryRisk = this.shouldWaitForVisibleFinalContinuation(sessionId, turn, syncedVisibleText, { forceForEmptyFinal: Boolean(syncedVisibleText) });
                this.waitForRecoverableOpenClawRetry(sessionId, turn, payload.runId ?? turn.runId, {
                    reason: syncedVisibleText
                        ? visibleRetryRisk.reason
                        : 'empty final after tool work',
                    graceMs: syncedVisibleText
                        ? visibleRetryRisk.graceMs
                        : OpenClawRuntimeAdapter.SILENT_MAINTENANCE_FOLLOWUP_GRACE_MS,
                    pendingThinkingOnlyHint: !syncedVisibleText,
                    pendingVisibleFinalContinuation: Boolean(syncedVisibleText),
                });
                return;
            }
            if (turn.hasContextMaintenanceTool && !turn.currentAssistantSegmentText.trim()) {
                this.waitForRecoverableOpenClawRetry(sessionId, turn, payload.runId ?? turn.runId, {
                    reason: 'context maintenance history tail',
                    graceMs: OpenClawRuntimeAdapter.SILENT_MAINTENANCE_FOLLOWUP_GRACE_MS,
                });
                return;
            }
        }
        if (stoppedByToolUse) {
            turn.lastToolUseChatFinalAtMs = Date.now();
            this.cancelChatFinalCompletion(sessionId, turn, 'chat final requested tool work');
            this.store.updateSession(sessionId, { status: 'running' });
            this.emitSessionStatus(sessionId, 'running');
            console.debug('[EngineRuntime] kept session running after tool-use chat.final.', `sessionId=${sessionId}`, `runId=${payload.runId ?? turn.runId}`);
            return;
        }
        if (stoppedByError) {
            const rawErrorMessage = payload.errorMessage?.trim()
                || errorMessageFromMessage?.trim()
                || 'The run failed';
            const errorMetadata = normalizeOpenClawSafeRuntimeErrorMetadata(payload);
            const resolved = this.resolveTurnErrorMessageWithToolLoopContext(turn, rawErrorMessage, errorMetadata);
            const resolvedError = resolved.resolvedError;
            const errorMessage = resolvedError.message;
            const errorDetail = this.buildTurnErrorDetail(sessionId, turn, resolved.detailRawErrorMessage, errorMessage, errorMetadata);
            const erroredSessionKey = turn.sessionKey;
            this.store.updateSession(sessionId, { status: 'error' });
            const errorMsg = this.store.addMessage(sessionId, {
                type: 'system',
                content: errorMessage,
                metadata: (0, exports.buildRuntimeErrorMetadata)({
                    ...resolvedError,
                    ...(errorDetail ? { errorDetail } : {}),
                }),
            });
            this.emit('message', sessionId, errorMsg);
            this.emit('error', sessionId, errorMessage);
            this.cleanupSessionTurn(sessionId);
            this.rejectTurn(sessionId, new Error(errorMessage));
            // Reconcile even on error so the UI shows messages already delivered.
            void this.syncSessionHistoryFromGateway(sessionId, erroredSessionKey);
            return;
        }
        // Reconcile local messages with authoritative gateway history.
        // Managed sessions keep local tool messages as the source of truth, but the
        // final assistant text should still be corrected from chat.history because
        // streaming merge heuristics can lose repeated boundary characters.
        if ((0, openclawChannelSessionSync_1.isManagedSessionKey)(turn.sessionKey)) {
            await this.syncFinalAssistantWithHistory(sessionId, turn);
        }
        else {
            // Awaited so that IM handlers reading from the store see reconciled data.
            await this.syncSessionHistoryFromGateway(sessionId, turn.sessionKey);
        }
        const reconciledPlanText = turn.currentAssistantSegmentText.trim()
            || turn.currentText.trim()
            || rawFinalText;
        if (await this.retryIncompletePlanModeResponse(sessionId, turn, reconciledPlanText)) {
            return;
        }
        if (turn.planMode
            && turn.planModeRecoveryAttempted
            && !isPlanModeResponseComplete(reconciledPlanText)) {
            this.waitForRecoverableOpenClawRetry(sessionId, turn, payload.runId ?? turn.runId, {
                reason: 'plan mode recovery returned an incomplete final response',
                graceMs: OpenClawRuntimeAdapter.PLAN_MODE_RECOVERY_FOLLOWUP_GRACE_MS,
                pendingThinkingOnlyHint: !reconciledPlanText.trim(),
                pendingVisibleFinalContinuation: Boolean(reconciledPlanText.trim()),
            });
            console.warn(`[EngineRuntime] kept plan mode recovery open for an automatic continuation in session ${sessionId}.`);
            return;
        }
        // Finalize thinking message at end of turn
        this.thinkingController.finalize(sessionId, turn);
        // Detect thinking-only response: the last API call returned no visible text
        // (only a thinking block), causing the run to complete silently without output.
        // This happens with qwen3.5-plus under very large context (~380K tokens).
        // Signal: turn.currentText is empty AND there was at least one tool call in THIS turn.
        // Scoped to the current turn to avoid false positives when previous turns had tool calls
        // but the current turn returned empty (e.g. session busy, network error).
        const sessionAfterReconcile = this.store.getSession(sessionId);
        if (sessionAfterReconcile) {
            const hadToolCall = this.hasTurnToolWork(sessionId, turn);
            const lastApiResponseHadNoText = !turn.currentText.trim();
            console.debug('[EngineRuntime] run end diagnostics, sessionId:', sessionId, 'turn.currentText:', JSON.stringify(turn.currentText?.slice(0, 100)), 'turn.committedAssistantText:', JSON.stringify(turn.committedAssistantText?.slice(0, 100)), 'hadToolCall:', hadToolCall, 'lastApiResponseHadNoText:', lastApiResponseHadNoText);
            if (hadToolCall && lastApiResponseHadNoText) {
                this.waitForRecoverableOpenClawRetry(sessionId, turn, payload.runId ?? turn.runId, {
                    reason: 'thinking-only tool final',
                    graceMs: OpenClawRuntimeAdapter.SILENT_MAINTENANCE_FOLLOWUP_GRACE_MS,
                    pendingThinkingOnlyHint: true,
                });
                console.debug(`[EngineRuntime] delayed empty tool final while waiting for a recoverable follow-up in session ${sessionId}.`);
                return;
            }
        }
        // Sync usage metadata to the latest assistant message. Reconciliation can replace
        // message IDs even for managed sessions, so resolve against the current store.
        if (turn.sessionKey) {
            const targetMessageId = this.resolveAssistantMessageIdForUsage(sessionId, turn.assistantMessageId);
            if (targetMessageId) {
                // Extract usage/model directly from the chat.final payload to avoid race condition
                // (chat.history may not yet have usage for the just-completed message).
                const finalUsageRecord = messageRecord && isRecord(messageRecord.usage)
                    ? messageRecord.usage : null;
                const finalModel = messageRecord && typeof messageRecord.model === 'string'
                    ? messageRecord.model : undefined;
                const finalInputTokens = finalUsageRecord
                    ? (typeof finalUsageRecord.input === 'number' ? finalUsageRecord.input
                        : typeof finalUsageRecord.inputTokens === 'number' ? finalUsageRecord.inputTokens
                            : undefined)
                    : undefined;
                const finalOutputTokens = finalUsageRecord
                    ? (typeof finalUsageRecord.output === 'number' ? finalUsageRecord.output
                        : typeof finalUsageRecord.outputTokens === 'number' ? finalUsageRecord.outputTokens
                            : undefined)
                    : undefined;
                const finalTotalTokens = finalUsageRecord && typeof finalUsageRecord.totalTokens === 'number'
                    ? finalUsageRecord.totalTokens : undefined;
                const finalCacheReadTokens = finalUsageRecord
                    ? (typeof finalUsageRecord.cacheRead === 'number' ? finalUsageRecord.cacheRead
                        : typeof finalUsageRecord.cacheReadTokens === 'number' ? finalUsageRecord.cacheReadTokens
                            : undefined)
                    : undefined;
                if (finalInputTokens != null || finalOutputTokens != null || finalModel) {
                    void this.applyUsageMetadataFromFinal(sessionId, turn.sessionKey, targetMessageId, finalInputTokens, finalOutputTokens, finalModel, finalTotalTokens, finalCacheReadTokens);
                }
                else {
                    // Fallback: fetch from chat.history after a delay to give gateway time
                    // to commit usage data for the just-completed message.
                    const sk = turn.sessionKey;
                    const mid = targetMessageId;
                    setTimeout(() => {
                        void this.syncUsageMetadata(sessionId, sk, mid);
                    }, 2000);
                }
            }
        }
        const visibleFinalTextForDecision = turn.currentText.trim() ? turn.currentText : finalText;
        const visibleFinalContinuation = this.shouldWaitForVisibleFinalContinuation(sessionId, turn, visibleFinalTextForDecision);
        if (visibleFinalContinuation.wait) {
            this.waitForRecoverableOpenClawRetry(sessionId, turn, payload.runId ?? turn.runId, {
                reason: visibleFinalContinuation.reason,
                graceMs: visibleFinalContinuation.graceMs,
                pendingVisibleFinalContinuation: true,
            });
            console.debug('[EngineRuntime] delayed visible tool final while waiting for a recoverable continuation.', `sessionId=${sessionId}`, `runId=${payload.runId ?? turn.runId}`, `reason=${visibleFinalContinuation.reason}`, `toolResultChars=${visibleFinalContinuation.toolResultChars}`, `visibleTextLen=${visibleFinalTextForDecision.trim().length}`);
            return;
        }
        this.deferChatFinalCompletion(sessionId, turn, payload.runId ?? turn.runId);
    }
    async retryIncompletePlanModeResponse(sessionId, turn, rawFinalText) {
        if (!turn.planMode || turn.planModeRecoveryAttempted || isPlanModeResponseComplete(rawFinalText)) {
            return false;
        }
        turn.planModeRecoveryAttempted = true;
        const recoveryRunId = (0, crypto_1.randomUUID)();
        const previousRunId = turn.runId;
        const previousState = {
            currentText: turn.currentText,
            currentAssistantSegmentText: turn.currentAssistantSegmentText,
            currentContentText: turn.currentContentText,
            currentContentBlocks: [...turn.currentContentBlocks],
            sawNonTextContentBlocks: turn.sawNonTextContentBlocks,
            textStreamMode: turn.textStreamMode,
            agentAssistantTextLength: turn.agentAssistantTextLength,
            hasSeenAgentAssistantStream: turn.hasSeenAgentAssistantStream,
            currentThinkingText: turn.thinking.currentText,
        };
        const recoveryPrompt = [
            '[Plan Mode recovery instruction]',
            'Your previous visible response was incomplete and ended after a short preface.',
            'Do not call any tools and do not repeat environment exploration.',
            'Output the complete plan now in the same language as the original user request.',
            'Wrap it in <proposed_plan> and </proposed_plan>.',
            'Include Summary, Implementation Approach, Key Changes, Validation, and Assumptions or Questions.',
            'Use at least 8 concrete bullets or short paragraphs; do not output introductory text outside the tags.',
        ].join('\n');
        const session = this.store.getSession(sessionId);
        const runCwd = session?.cwd?.trim() ? path.resolve(session.cwd.trim()) : undefined;
        const chatSendParams = {
            sessionKey: turn.sessionKey,
            message: recoveryPrompt,
            deliver: false,
            idempotencyKey: recoveryRunId,
            ...(runCwd ? { cwd: runCwd } : {}),
        };
        turn.runId = recoveryRunId;
        turn.currentText = '';
        turn.currentAssistantSegmentText = '';
        turn.currentContentText = '';
        turn.currentContentBlocks = [];
        turn.sawNonTextContentBlocks = false;
        turn.textStreamMode = 'unknown';
        turn.agentAssistantTextLength = 0;
        turn.hasSeenAgentAssistantStream = false;
        turn.chatDeltaOverwriteSkipLogged = false;
        turn.thinking.currentText = '';
        turn.pendingRecoverableFollowup = true;
        turn.pendingOpenClawRetry = true;
        this.bindRunIdToTurn(sessionId, recoveryRunId);
        this.store.updateSession(sessionId, { status: 'running' });
        this.emitSessionStatus(sessionId, 'running');
        console.warn(`[EngineRuntime] requested one plan mode recovery for incomplete output in session ${sessionId}.`);
        try {
            assertOpenClawChatSendPayloadWithinLimit(sessionId, chatSendParams);
            await new Promise((resolve) => setTimeout(resolve, 500));
            if (this.activeTurns.get(sessionId) !== turn || turn.stopRequested) {
                return true;
            }
            const sendResult = await this.requireGatewayClient().request('chat.send', chatSendParams, { timeoutMs: 90_000 });
            const returnedRunId = typeof sendResult?.runId === 'string' ? sendResult.runId.trim() : '';
            if (returnedRunId)
                this.bindRunIdToTurn(sessionId, returnedRunId);
            return true;
        }
        catch (error) {
            this.sessionIdByRunId.delete(recoveryRunId);
            turn.knownRunIds.delete(recoveryRunId);
            turn.runId = previousRunId;
            turn.currentText = previousState.currentText;
            turn.currentAssistantSegmentText = previousState.currentAssistantSegmentText;
            turn.currentContentText = previousState.currentContentText;
            turn.currentContentBlocks = previousState.currentContentBlocks;
            turn.sawNonTextContentBlocks = previousState.sawNonTextContentBlocks;
            turn.textStreamMode = previousState.textStreamMode;
            turn.agentAssistantTextLength = previousState.agentAssistantTextLength;
            turn.hasSeenAgentAssistantStream = previousState.hasSeenAgentAssistantStream;
            turn.thinking.currentText = previousState.currentThinkingText;
            this.clearContextMaintenanceState(sessionId, turn, 'plan mode recovery request failed');
            console.warn(`[EngineRuntime] plan mode recovery request failed for session ${sessionId}; using the original response.`, error);
            return false;
        }
    }
    postponeChatFinalCompletion(sessionId, turn, reason) {
        if (!turn.finalCompletionTimer)
            return;
        const runId = turn.finalCompletionRunId ?? turn.runId;
        const isSilentMaintenanceWait = turn.finalCompletionFlushOnLifecycleEnd === false;
        clearTimeout(turn.finalCompletionTimer);
        turn.finalCompletionTimer = undefined;
        turn.finalCompletionRunId = undefined;
        turn.finalCompletionFlushOnLifecycleEnd = undefined;
        turn.finalCompletionAllowLateContinuation = undefined;
        this.store.updateSession(sessionId, { status: 'running' });
        this.emitSessionStatus(sessionId, 'running');
        if (isSilentMaintenanceWait) {
            this.clearContextMaintenanceState(sessionId, turn, reason);
            console.debug(`[EngineRuntime] canceled silent maintenance completion because ${reason}.`);
            return;
        }
        this.clearContextMaintenanceState(sessionId, turn, reason);
        this.deferChatFinalCompletion(sessionId, turn, runId);
        console.debug(`[EngineRuntime] postponed deferred chat.final completion because ${reason}.`);
    }
    cancelChatFinalCompletion(sessionId, turn, reason) {
        if (!turn.finalCompletionTimer)
            return;
        clearTimeout(turn.finalCompletionTimer);
        turn.finalCompletionTimer = undefined;
        turn.finalCompletionRunId = undefined;
        turn.finalCompletionFlushOnLifecycleEnd = undefined;
        turn.finalCompletionAllowLateContinuation = undefined;
        this.store.updateSession(sessionId, { status: 'running' });
        this.emitSessionStatus(sessionId, 'running');
        this.clearContextMaintenanceState(sessionId, turn, reason);
        console.debug(`[EngineRuntime] canceled deferred chat.final completion because ${reason}.`);
    }
    deferChatFinalCompletion(sessionId, turn, runId, options = {}) {
        if (turn.finalCompletionTimer) {
            clearTimeout(turn.finalCompletionTimer);
        }
        const graceMs = options.graceMs ?? OpenClawRuntimeAdapter.CHAT_FINAL_COMPLETION_GRACE_MS;
        const turnToken = turn.turnToken;
        turn.finalCompletionRunId = runId;
        turn.finalCompletionFlushOnLifecycleEnd = options.flushOnLifecycleEnd;
        turn.finalCompletionAllowLateContinuation = options.allowLateContinuation;
        turn.finalCompletionTimer = setTimeout(() => {
            const currentTurn = this.activeTurns.get(sessionId);
            if (!currentTurn || currentTurn.turnToken !== turnToken)
                return;
            void this.completeDeferredChatFinalNow(sessionId, currentTurn, runId);
        }, graceMs);
        console.debug('[EngineRuntime] deferred chat.final completion to allow retry or compaction follow-up.');
    }
    async completeDeferredChatFinalNow(sessionId, turn, runId) {
        if (turn.finalCompletionTimer) {
            clearTimeout(turn.finalCompletionTimer);
            turn.finalCompletionTimer = undefined;
        }
        const currentPlanText = turn.currentAssistantSegmentText.trim() || turn.currentText.trim();
        if (turn.planMode && !isPlanModeResponseComplete(currentPlanText)) {
            await this.syncFinalAssistantWithHistory(sessionId, turn);
            if (this.activeTurns.get(sessionId) !== turn) {
                return;
            }
            console.debug(`[EngineRuntime] synchronized plan mode recovery from history before completing session ${sessionId}.`);
        }
        if (turn.pendingThinkingOnlyHint && !turn.currentText.trim()) {
            await this.syncFinalAssistantWithHistory(sessionId, turn);
            if (this.activeTurns.get(sessionId) !== turn) {
                return;
            }
            if (!turn.currentText.trim()) {
                const hintMessage = this.store.addMessage(sessionId, {
                    type: 'system',
                    content: (0, i18n_1.t)('taskThinkingOnly'),
                });
                this.emit('message', sessionId, hintMessage);
                console.warn(`[EngineRuntime] thinking-only response detected after waiting for follow-up in session ${sessionId}.`);
            }
        }
        if (turn.finalCompletionAllowLateContinuation) {
            turn.allowRecentlyClosedRunRetryReopenOnCleanup = true;
        }
        turn.finalCompletionRunId = undefined;
        turn.finalCompletionFlushOnLifecycleEnd = undefined;
        turn.finalCompletionAllowLateContinuation = undefined;
        this.clearContextMaintenanceState(sessionId, turn, 'deferred completion finished');
        this.store.updateSession(sessionId, { status: 'completed' });
        this.emit('complete', sessionId, runId);
        this.cleanupSessionTurn(sessionId);
        this.resolveTurn(sessionId);
    }
    async recoverPlanModeAfterSafetyAbort(sessionId, turn) {
        if (this.activeTurns.get(sessionId) !== turn || turn.stopRequested)
            return;
        if (turn.planModeSafetyRecoveryTimer) {
            clearTimeout(turn.planModeSafetyRecoveryTimer);
            turn.planModeSafetyRecoveryTimer = undefined;
        }
        turn.planModeSafetyRecoveryPending = false;
        turn.planModeSafetyRecoveryAbortedRunId = undefined;
        const recoveryRunId = (0, crypto_1.randomUUID)();
        const session = this.store.getSession(sessionId);
        const runCwd = session?.cwd?.trim() ? path.resolve(session.cwd.trim()) : undefined;
        const chatSendParams = {
            sessionKey: turn.sessionKey,
            message: [
                '[Plan Mode safety recovery instruction]',
                'A mutating tool call was blocked and the previous run was stopped.',
                'Do not call any tools. Use only the read-only context already gathered in this conversation.',
                'Output the complete plan now in the same language as the original user request.',
                'Wrap it in <proposed_plan> and </proposed_plan>.',
                'Include Summary, Implementation Approach, Key Changes, Validation, and Assumptions or Questions.',
                'Use at least 8 concrete bullets or short paragraphs; do not output introductory text outside the tags.',
            ].join('\n'),
            deliver: false,
            idempotencyKey: recoveryRunId,
            ...(runCwd ? { cwd: runCwd } : {}),
        };
        turn.runId = recoveryRunId;
        turn.currentText = '';
        turn.currentAssistantSegmentText = '';
        turn.currentContentText = '';
        turn.currentContentBlocks = [];
        turn.sawNonTextContentBlocks = false;
        turn.textStreamMode = 'unknown';
        turn.agentAssistantTextLength = 0;
        turn.hasSeenAgentAssistantStream = false;
        turn.chatDeltaOverwriteSkipLogged = false;
        turn.thinking.currentText = '';
        turn.pendingRecoverableFollowup = true;
        turn.pendingOpenClawRetry = true;
        this.bindRunIdToTurn(sessionId, recoveryRunId);
        this.store.updateSession(sessionId, { status: 'running' });
        this.emitSessionStatus(sessionId, 'running');
        try {
            assertOpenClawChatSendPayloadWithinLimit(sessionId, chatSendParams);
            const sendResult = await this.requireGatewayClient().request('chat.send', chatSendParams, { timeoutMs: 90_000 });
            const returnedRunId = typeof sendResult?.runId === 'string' ? sendResult.runId.trim() : '';
            if (returnedRunId)
                this.bindRunIdToTurn(sessionId, returnedRunId);
            console.warn(`[EngineRuntime] resumed plan generation without tools after a safety abort in session ${sessionId}.`);
        }
        catch (error) {
            this.sessionIdByRunId.delete(recoveryRunId);
            turn.knownRunIds.delete(recoveryRunId);
            console.error(`[EngineRuntime] failed to resume plan generation after a safety abort in session ${sessionId}:`, error);
            this.store.updateSession(sessionId, { status: 'idle' });
            this.emit('complete', sessionId, recoveryRunId);
            this.cleanupSessionTurn(sessionId);
            this.resolveTurn(sessionId);
        }
    }
    schedulePlanModeSafetyRecovery(sessionId, turn, delayMs, reason) {
        if (this.activeTurns.get(sessionId) !== turn || !turn.planModeSafetyRecoveryPending)
            return;
        if (turn.planModeSafetyRecoveryTimer) {
            clearTimeout(turn.planModeSafetyRecoveryTimer);
        }
        const turnToken = turn.turnToken;
        turn.planModeSafetyRecoveryTimer = setTimeout(() => {
            const currentTurn = this.activeTurns.get(sessionId);
            if (!currentTurn || currentTurn.turnToken !== turnToken || !currentTurn.planModeSafetyRecoveryPending)
                return;
            currentTurn.planModeSafetyRecoveryTimer = undefined;
            void this.recoverPlanModeAfterSafetyAbort(sessionId, currentTurn);
        }, delayMs);
        console.debug(`[EngineRuntime] scheduled plan mode safety recovery after ${delayMs}ms because ${reason} for session ${sessionId}.`);
    }
    handleChatAborted(sessionId, turn) {
        if (turn.planMode && turn.planModeSafetyRecoveryPending) {
            console.warn(`[EngineRuntime] received the expected safety abort for plan mode session ${sessionId}.`);
            this.schedulePlanModeSafetyRecovery(sessionId, turn, OpenClawRuntimeAdapter.PLAN_MODE_SAFETY_RECOVERY_AFTER_ABORT_FALLBACK_MS, 'waiting for aborted run lifecycle end');
            return;
        }
        const elapsedSec = ((Date.now() - turn.startedAtMs) / 1000).toFixed(1);
        this.store.updateSession(sessionId, { status: 'idle' });
        if (!turn.stopRequested && !this.manuallyStoppedSessions.has(sessionId)) {
            // The run was aborted without user request — most likely a timeout.
            // Add a visible hint so the user knows the task was interrupted.
            console.warn(`[AbortDiag] showing timeout hint to user`, `sessionId=${sessionId}`, `runId=${turn.runId}`, `elapsed=${elapsedSec}s`, `turnToken=${turn.turnToken}`);
            const hintMessage = this.store.addMessage(sessionId, {
                type: 'assistant',
                content: (0, i18n_1.t)('taskTimedOut'),
                metadata: { isTimeout: true },
            });
            this.emit('message', sessionId, hintMessage);
            this.emit('complete', sessionId, turn.runId);
        }
        const abortedSessionKey = turn.sessionKey;
        this.cleanupSessionTurn(sessionId);
        this.resolveTurn(sessionId);
        void this.syncSessionHistoryFromGateway(sessionId, abortedSessionKey);
    }
    /**
     * Fetch the last assistant message from chat.history to extract usage metadata
     * (inputTokens, outputTokens, contextPercent, model) and update the local message.
     */
    async syncUsageMetadata(sessionId, sessionKey, assistantMessageId) {
        const client = this.gatewayClient;
        if (!client)
            return;
        try {
            const history = await client.request('chat.history', {
                sessionKey,
                limit: 10,
            }, { timeoutMs: 8_000 });
            if (!Array.isArray(history?.messages) || history.messages.length === 0)
                return;
            // Find the LAST assistant message (must be the most recent one).
            // Only use its usage if present — never fall back to an earlier message's usage,
            // which would cause metadata to appear on the wrong message.
            let usageMsg = null;
            for (let i = history.messages.length - 1; i >= 0; i--) {
                const msg = history.messages[i];
                if (isRecord(msg) && msg.role === 'assistant') {
                    const text = (0, openclawHistory_1.extractGatewayMessageText)(msg).trim();
                    if (!text || (0, openclawHistory_1.shouldSuppressHeartbeatText)('assistant', text)) {
                        return;
                    }
                    if (isRecord(msg.usage)) {
                        usageMsg = msg;
                    }
                    break;
                }
            }
            if (!usageMsg)
                return;
            const usage = usageMsg.usage;
            const inputTokens = (typeof usage.input === 'number' ? usage.input : undefined)
                ?? (typeof usage.inputTokens === 'number' ? usage.inputTokens : undefined);
            const outputTokens = (typeof usage.output === 'number' ? usage.output : undefined)
                ?? (typeof usage.outputTokens === 'number' ? usage.outputTokens : undefined);
            const cacheReadTokens = (typeof usage.cacheRead === 'number' ? usage.cacheRead : undefined)
                ?? (typeof usage.cacheReadTokens === 'number' ? usage.cacheReadTokens : undefined)
                ?? (typeof usage.cache_read_input_tokens === 'number' ? usage.cache_read_input_tokens : undefined);
            const model = typeof usageMsg.model === 'string' ? usageMsg.model : undefined;
            // Compute contextPercent: input / contextTokens (matches OpenClaw web UI)
            // Primary source: sessions.list contextTokens (authoritative, matches gateway resolution)
            // Fallback: local models.json contextWindow cache
            let contextPercent;
            if (typeof inputTokens === 'number' && inputTokens > 0) {
                let contextTokens = this.sessionContextTokensCache.get(sessionKey);
                if (!contextTokens) {
                    contextTokens = await this.refreshSessionContextTokens(sessionKey);
                }
                if (!contextTokens) {
                    contextTokens = this.getContextWindowForModel(model ?? '');
                }
                if (contextTokens && contextTokens > 0) {
                    contextPercent = Math.min(Math.round((inputTokens / contextTokens) * 100), 100);
                }
            }
            // Extract agent name from sessionKey
            const agentName = extractAgentNameFromSessionKey(sessionKey);
            if (inputTokens == null && outputTokens == null && !model)
                return;
            const usageMetadata = {
                isStreaming: false,
                isFinal: true,
                ...(inputTokens != null || outputTokens != null || cacheReadTokens != null ? {
                    usage: {
                        ...(inputTokens != null && { inputTokens }),
                        ...(outputTokens != null && { outputTokens }),
                        ...(cacheReadTokens != null && { cacheReadTokens }),
                    },
                } : {}),
                ...(contextPercent != null && { contextPercent }),
                ...(model && { model }),
                ...(agentName && { agentName }),
            };
            const targetMessageId = this.resolveAssistantMessageIdForUsage(sessionId, assistantMessageId);
            if (!targetMessageId)
                return;
            this.store.updateMessage(sessionId, targetMessageId, {
                metadata: usageMetadata,
            });
            console.debug('[EngineRuntime] syncUsageMetadata success:', sessionId, model ?? 'unknown-model', `in=${inputTokens ?? '-'} out=${outputTokens ?? '-'} ctx=${contextPercent ?? '-'}% cacheRead=${cacheReadTokens ?? '-'} agent=${agentName ?? '-'}`);
            // Notify renderer to re-render the message with usage data
            const session = this.store.getSession(sessionId);
            if (session) {
                const msg = session.messages.find(m => m.id === targetMessageId);
                if (msg) {
                    this.emit('messageUpdate', sessionId, targetMessageId, msg.content, usageMetadata);
                }
            }
        }
        catch (error) {
            console.debug('[EngineRuntime] syncUsageMetadata failed:', error);
        }
    }
    async applyUsageMetadataFromFinal(sessionId, sessionKey, assistantMessageId, inputTokens, outputTokens, model, totalTokens, cacheReadTokens) {
        let contextPercent;
        if (typeof inputTokens === 'number' && inputTokens > 0) {
            let contextTokens = this.sessionContextTokensCache.get(sessionKey);
            if (!contextTokens) {
                contextTokens = await this.refreshSessionContextTokens(sessionKey);
            }
            if (!contextTokens) {
                contextTokens = this.getContextWindowForModel(model ?? '');
            }
            if (contextTokens && contextTokens > 0) {
                contextPercent = Math.min(Math.round((inputTokens / contextTokens) * 100), 100);
            }
        }
        const agentName = extractAgentNameFromSessionKey(sessionKey);
        const usageMetadata = {
            isStreaming: false,
            isFinal: true,
            ...(inputTokens != null || outputTokens != null || cacheReadTokens != null ? {
                usage: {
                    ...(inputTokens != null && { inputTokens }),
                    ...(outputTokens != null && { outputTokens }),
                    ...(cacheReadTokens != null && { cacheReadTokens }),
                },
            } : {}),
            ...(contextPercent != null && { contextPercent }),
            ...(model && { model }),
            ...(agentName && { agentName }),
        };
        const targetMessageId = this.resolveAssistantMessageIdForUsage(sessionId, assistantMessageId);
        if (!targetMessageId)
            return;
        this.store.updateMessage(sessionId, targetMessageId, {
            metadata: usageMetadata,
        });
        console.debug('[EngineRuntime] applyUsageMetadataFromFinal:', sessionId, model ?? 'unknown-model', `in=${inputTokens ?? '-'} out=${outputTokens ?? '-'} ctx=${contextPercent ?? '-'}% cacheRead=${cacheReadTokens ?? '-'} agent=${agentName ?? '-'}`);
        const session = this.store.getSession(sessionId);
        if (session) {
            const msg = session.messages.find(m => m.id === targetMessageId);
            if (msg) {
                this.emit('messageUpdate', sessionId, targetMessageId, msg.content, usageMetadata);
            }
        }
    }
    /**
     * OpenClaw's reply resolver can flush an earlier tool-failure notice as a late
     * `state=error` chat event after the run already finished successfully — the
     * successful chat.final is persisted and only its deferred completion is
     * pending. Surfacing that stale notice would flip a successful turn into a
     * session error, so complete the deferred final instead.
     *
     * Exception: OpenClaw's surface_error failover (e.g. LLM idle timeout after a
     * partial reply) ends the lifecycle with isError=false and delivers the real
     * failure through this same late chat-error path, so it never reaches
     * terminatedRunIds. Those provider-runtime failures must surface — swallowing
     * them makes a dead run look completed.
     */
    completeDeferredFinalOnStaleChatError(sessionId, turn, payload) {
        if (!turn.finalCompletionTimer)
            return false;
        // Silent maintenance/retry waits intentionally outlive their run; a
        // follow-up error there is a real outcome, not a stale flush.
        if (turn.finalCompletionFlushOnLifecycleEnd === false)
            return false;
        const errorRunId = typeof payload.runId === 'string' ? payload.runId.trim() : '';
        if (errorRunId && !turn.knownRunIds.has(errorRunId))
            return false;
        for (const knownRunId of turn.knownRunIds) {
            if (this.terminatedRunIds.has(knownRunId))
                return false;
        }
        const staleErrorText = payload.errorMessage?.trim()
            || (0, openclawHistory_1.extractGatewayMessageText)(payload.message).trim();
        if (this.isProviderRuntimeFailureChatError(payload, staleErrorText)) {
            console.warn('[EngineRuntime] surfacing a provider runtime failure that arrived as a late chat error despite a pending deferred final.', `Session ${sessionId}.`, `Run ${errorRunId || turn.finalCompletionRunId || turn.runId}.`, `Error ${staleErrorText.slice(0, 200) || 'unknown'}.`);
            return false;
        }
        console.warn('[EngineRuntime] ignored a stale chat error after a successful final; completing the deferred final instead.', `Session ${sessionId}.`, `Run ${errorRunId || turn.finalCompletionRunId || turn.runId}.`, `Error ${staleErrorText.slice(0, 200) || 'unknown'}.`);
        void this.completeDeferredChatFinalNow(sessionId, turn, turn.finalCompletionRunId ?? turn.runId);
        return true;
    }
    /**
     * True when a late chat error carries evidence of a real provider/LLM runtime
     * failure rather than a stale tool-failure notice. The lifecycle-error
     * forwarding path attaches structured observation fields; the webchat reply
     * path (broadcastChatError) sends text only, so also match the model-timeout
     * wording OpenClaw uses for surfaced LLM failures. Tool-failure notices carry
     * neither: broader text classes such as network errors ("request timed out")
     * overlap with tool error output and must stay swallowed here.
     */
    isProviderRuntimeFailureChatError(payload, errorText) {
        const metadata = normalizeOpenClawSafeRuntimeErrorMetadata(payload);
        if (metadata?.providerRuntimeFailureKind
            || metadata?.failoverReason
            || metadata?.httpCode
            || metadata?.providerErrorType) {
            return true;
        }
        if (!errorText)
            return false;
        return (0, coworkErrorClassify_1.classifyErrorKey)(errorText) === coworkErrorClassify_1.CoworkErrorI18nKey.ModelResponseTimeout;
    }
    handleChatError(sessionId, turn, payload) {
        console.log('[EngineRuntime] handleChatError payload:', JSON.stringify(payload).slice(0, 1000));
        const rawErrorMessage = payload.errorMessage?.trim() || 'The run failed';
        const errorMetadata = normalizeOpenClawSafeRuntimeErrorMetadata(payload);
        const resolved = this.resolveTurnErrorMessageWithToolLoopContext(turn, rawErrorMessage, errorMetadata);
        const resolvedError = resolved.resolvedError;
        let errorMessage = resolvedError.message;
        // Detect model API errors that are likely caused by unsupported image content
        // in tool results (e.g., Read tool returning image blocks for non-vision models).
        // Only match 400 Bad Request — other 4xx codes (403 forbidden, 429 rate limit, etc.)
        // have unrelated causes and should show their original error message.
        if (/^400\b/.test(errorMessage)) {
            errorMessage += '\n\n[Hint: If the model attempted to read an image file, this may be because the model does not support image input. Consider using a vision-capable model or avoid sending image files.]';
        }
        const errorDetail = this.buildTurnErrorDetail(sessionId, turn, resolved.detailRawErrorMessage, errorMessage, errorMetadata);
        const erroredSessionKey = turn.sessionKey;
        this.clearContextMaintenanceState(sessionId, turn, 'chat error');
        this.store.updateSession(sessionId, { status: 'error' });
        // Persist error message to SQLite so it survives session switches
        const errorMsg = this.store.addMessage(sessionId, {
            type: 'system',
            content: errorMessage,
            metadata: (0, exports.buildRuntimeErrorMetadata)({
                ...resolvedError,
                message: errorMessage, ...(errorDetail ? { errorDetail } : {}),
            }),
        });
        this.emit('message', sessionId, errorMsg);
        this.emit('error', sessionId, errorMessage);
        this.cleanupSessionTurn(sessionId);
        this.rejectTurn(sessionId, new Error(errorMessage));
        void this.syncSessionHistoryFromGateway(sessionId, erroredSessionKey);
    }
    resolveApprovalSessionId(sessionKey) {
        let sessionId = sessionKey ? this.resolveSessionIdBySessionKey(sessionKey) ?? undefined : undefined;
        // Try to resolve channel-originated sessions for approval requests
        if (!sessionId && sessionKey && this.channelSessionSync) {
            const channelSessionId = this.resolveOrCreateChannelSession(sessionKey);
            if (channelSessionId) {
                this.rememberSessionKey(channelSessionId, sessionKey);
                sessionId = channelSessionId;
            }
        }
        return sessionId;
    }
    resolveSessionIdFromChatPayload(payload) {
        const runId = typeof payload.runId === 'string' ? payload.runId.trim() : '';
        if (runId && this.sessionIdByRunId.has(runId)) {
            const sid = this.sessionIdByRunId.get(runId) ?? null;
            return sid;
        }
        const sessionKey = typeof payload.sessionKey === 'string' ? payload.sessionKey.trim() : '';
        if (sessionKey) {
            const sessionId = this.resolveSessionIdBySessionKey(sessionKey);
            if (sessionId) {
                // Re-create ActiveTurn for channel session follow-up turns
                this.ensureActiveTurn(sessionId, sessionKey, runId);
                if (runId) {
                    this.bindRunIdToTurn(sessionId, runId);
                }
                return sessionId;
            }
        }
        // Try to resolve channel-originated sessions
        if (sessionKey && this.channelSessionSync) {
            const channelSessionId = this.resolveOrCreateChannelSession(sessionKey);
            if (channelSessionId) {
                // If this key was previously deleted, allow re-creation but skip history sync
                const deletedChannelKey = this.getDeletedChannelKey(sessionKey);
                if (this.deletedChannelKeys.delete(deletedChannelKey)) {
                    this.fullySyncedSessions.add(channelSessionId);
                    this.reCreatedChannelSessionIds.add(channelSessionId);
                    console.debug('[resolveSessionId] re-created after delete, skipping history sync for:', sessionKey);
                }
                this.rememberSessionKey(channelSessionId, sessionKey);
                this.ensureActiveTurn(channelSessionId, sessionKey, runId);
                if (runId) {
                    this.bindRunIdToTurn(channelSessionId, runId);
                }
                return channelSessionId;
            }
        }
        console.warn('[resolveSessionId] failed — runId:', runId, 'sessionKey:', sessionKey);
        return null;
    }
    syncSystemMessagesFromHistory(sessionId, historyMessages, options) {
        const recordSessionHistoryCount = options.recordSessionHistoryCount !== false;
        if (historyMessages.length === 0) {
            if (recordSessionHistoryCount) {
                this.gatewayHistoryCountBySession.set(sessionId, 0);
            }
            return;
        }
        const canUseCursor = options.previousCountKnown
            && options.previousCount >= 0
            && options.previousCount <= historyMessages.length;
        const entries = (0, openclawHistory_1.extractGatewayHistoryEntries)(canUseCursor ? historyMessages.slice(options.previousCount) : historyMessages);
        if (recordSessionHistoryCount) {
            this.gatewayHistoryCountBySession.set(sessionId, historyMessages.length);
        }
        const systemEntries = entries.filter((entry) => entry.role === 'system');
        if (systemEntries.length === 0) {
            return;
        }
        const session = this.store.getSession(sessionId);
        const existingSystemTexts = new Set((session?.messages ?? [])
            .filter((message) => message.type === 'system')
            .map((message) => message.content.trim())
            .filter(Boolean));
        for (const entry of systemEntries) {
            if ((0, openclawHistory_1.isHeartbeatAckText)(entry.text) || (0, openclawHistory_1.isSilentReplyText)(entry.text)) {
                continue;
            }
            if (existingSystemTexts.has(entry.text)) {
                continue;
            }
            const systemMessage = this.store.addMessage(sessionId, {
                type: 'system',
                content: entry.text,
                metadata: {},
            });
            existingSystemTexts.add(entry.text);
            this.emit('message', sessionId, systemMessage);
        }
    }
    /**
     * Channel history prefetch/full-sync intentionally skips historical system entries.
     * Seed the raw gateway history cursor so those older reminders are not replayed
     * under the next assistant reply during final-history sync.
     */
    markGatewayHistoryWindowConsumed(sessionId, historyMessages) {
        if (historyMessages.length === 0) {
            return;
        }
        this.gatewayHistoryCountBySession.set(sessionId, historyMessages.length);
    }
    async syncSessionHistoryFromGateway(sessionId, sessionKey, options) {
        if ((0, sessionKeys_1.isSubagentSessionKey)(sessionKey)) {
            await this.syncSubagentChildHistory(sessionId, sessionKey, options);
            return;
        }
        if ((0, openclawChannelSessionSync_1.isCronSessionKey)(sessionKey)) {
            await this.syncCronRunHistory(sessionId, sessionKey, options);
            return;
        }
        await this.reconcileWithHistory(sessionId, sessionKey, options);
    }
    async syncSubagentChildHistory(sessionId, sessionKey, options) {
        const client = this.gatewayClient;
        if (!client) {
            console.log('[SubagentHistorySync] no gateway client, skipping - sessionId:', sessionId);
            return;
        }
        const limit = options?.isFullSync
            ? OpenClawRuntimeAdapter.FULL_HISTORY_SYNC_LIMIT
            : FINAL_HISTORY_SYNC_LIMIT;
        try {
            const history = await client.request('chat.history', {
                sessionKey,
                limit,
            }, { timeoutMs: 10_000 });
            if (!Array.isArray(history?.messages) || history.messages.length === 0) {
                this.channelSyncCursor.set(sessionId, 0);
                return;
            }
            const previousHistoryCountKnown = this.gatewayHistoryCountBySession.has(sessionId);
            const previousHistoryCount = this.gatewayHistoryCountBySession.get(sessionId) ?? 0;
            this.gatewayHistoryCountBySession.set(sessionId, history.messages.length);
            this.syncSystemMessagesFromHistory(sessionId, history.messages, {
                previousCountKnown: previousHistoryCountKnown,
                previousCount: previousHistoryCount,
            });
            const session = this.store.getSession(sessionId);
            if (!session)
                return;
            const plan = (0, childHistorySync_1.buildSubagentChildHistorySyncPlan)(session.messages, history.messages);
            if (plan.entriesToStore.length === 0) {
                this.channelSyncCursor.set(sessionId, 0);
                return;
            }
            if (!plan.changed) {
                this.channelSyncCursor.set(sessionId, plan.cursor);
                return;
            }
            this.store.replaceSessionMessages(sessionId, plan.entriesToStore);
            this.channelSyncCursor.set(sessionId, plan.cursor);
            this.notifySessionsChanged(sessionId);
        }
        catch (error) {
            console.warn('[SubagentHistorySync] failed - sessionId:', sessionId, 'error:', error);
        }
    }
    /**
     * Cron run sessions are not a stable full-conversation source of truth:
     * each run-scoped sessionKey only describes one execution, while the local
     * Cowork session can later contain user follow-up turns under a managed key.
     * Sync cron history non-destructively so missed run output can be backfilled
     * without deleting follow-up messages from the local conversation.
     */
    async syncCronRunHistory(sessionId, sessionKey, _options) {
        const client = this.gatewayClient;
        if (!client) {
            console.log('[CronHistorySync] no gateway client, skipping - sessionId:', sessionId);
            return;
        }
        try {
            const history = await client.request('chat.history', {
                sessionKey,
                limit: FINAL_HISTORY_SYNC_LIMIT,
            }, { timeoutMs: 10_000 });
            if (!Array.isArray(history?.messages) || history.messages.length === 0) {
                console.log('[CronHistorySync] empty history - sessionId:', sessionId);
                this.gatewayHistoryCountByCronSessionKey.set(sessionKey, 0);
                this.channelSyncCursor.set(sessionId, 0);
                return;
            }
            const previousHistoryCountKnown = this.gatewayHistoryCountByCronSessionKey.has(sessionKey);
            const previousHistoryCount = this.gatewayHistoryCountByCronSessionKey.get(sessionKey) ?? 0;
            this.gatewayHistoryCountByCronSessionKey.set(sessionKey, history.messages.length);
            this.syncSystemMessagesFromHistory(sessionId, history.messages, {
                previousCountKnown: previousHistoryCountKnown,
                previousCount: previousHistoryCount,
                recordSessionHistoryCount: false,
            });
            const authoritativeEntries = (0, openclawCronRunHistorySync_1.buildCronRunHistoryEntries)(history.messages, sessionKey);
            if (authoritativeEntries.length === 0) {
                console.log('[CronHistorySync] no user/assistant entries in history - sessionId:', sessionId);
                this.channelSyncCursor.set(sessionId, 0);
                return;
            }
            const session = this.store.getSession(sessionId);
            if (!session)
                return;
            const localEntries = (0, openclawCronRunHistorySync_1.buildCronRunLocalHistoryEntries)(session.messages);
            if ((0, openclawCronRunHistorySync_1.shouldReplaceLocalConversationWithCronHistory)(localEntries, authoritativeEntries, sessionKey)) {
                this.store.replaceConversationMessages(sessionId, (0, openclawConversationReconciliation_1.applyLocalTimestampsToEntries)(authoritativeEntries, localEntries));
                this.channelSyncCursor.set(sessionId, authoritativeEntries.length);
                this.notifySessionsChanged(sessionId);
                return;
            }
            const usedLocalMessageIds = new Set();
            let didWrite = false;
            for (const authoritative of authoritativeEntries) {
                const indexedLocal = (0, openclawCronRunHistorySync_1.findCronRunHistoryLocalIndexMatch)(authoritative, localEntries, usedLocalMessageIds, sessionKey);
                if (indexedLocal) {
                    usedLocalMessageIds.add(indexedLocal.id);
                    const nextMetadata = {
                        ...(indexedLocal.metadata ?? {}),
                        ...(authoritative.metadata ?? {}),
                    };
                    if (indexedLocal.text !== authoritative.text
                        || JSON.stringify(indexedLocal.metadata ?? {}) !== JSON.stringify(nextMetadata)) {
                        this.store.updateMessage(sessionId, indexedLocal.id, {
                            content: authoritative.text,
                            metadata: nextMetadata,
                        });
                        didWrite = true;
                    }
                    continue;
                }
                const matchingLocal = (0, openclawCronRunHistorySync_1.findCronRunHistoryLocalMatch)(authoritative, localEntries, usedLocalMessageIds, sessionKey);
                if (matchingLocal) {
                    usedLocalMessageIds.add(matchingLocal.id);
                    const nextMetadata = {
                        ...(matchingLocal.metadata ?? {}),
                        ...(authoritative.metadata ?? {}),
                    };
                    if (JSON.stringify(matchingLocal.metadata ?? {}) !== JSON.stringify(nextMetadata)) {
                        this.store.updateMessage(sessionId, matchingLocal.id, {
                            metadata: nextMetadata,
                        });
                        didWrite = true;
                    }
                    continue;
                }
                this.store.addMessage(sessionId, {
                    type: authoritative.role,
                    content: authoritative.text,
                    metadata: {
                        isStreaming: false,
                        isFinal: true,
                        ...(authoritative.metadata ?? {}),
                    },
                });
                didWrite = true;
            }
            this.channelSyncCursor.set(sessionId, authoritativeEntries.length);
            if (didWrite) {
                this.notifySessionsChanged(sessionId);
            }
        }
        catch (error) {
            console.warn('[CronHistorySync] failed - sessionId:', sessionId, 'error:', error);
        }
    }
    /**
     * Reconcile local session messages with the authoritative gateway chat.history.
     *
     * This is the single source-of-truth sync method: after a turn completes,
     * it aligns the bounded OpenClaw history window with local user/assistant
     * messages, preserving any older local prefix outside that window. Tool
     * messages (tool_use, tool_result, system) are kept as-is because the
     * gateway does not expose them in chat.history.
     *
     * The reconciliation is idempotent — calling it multiple times produces
     * the same result.
     */
    async reconcileWithHistory(sessionId, sessionKey, options) {
        const client = this.gatewayClient;
        if (!client) {
            console.log('[Reconcile] no gateway client, skipping — sessionId:', sessionId);
            return;
        }
        // Skip reconciliation for main-window (managed) sessions — local store is
        // the source of truth; only channel/IM sessions need gateway reconciliation.
        if ((0, openclawChannelSessionSync_1.isManagedSessionKey)(sessionKey)) {
            return;
        }
        const limit = options?.isFullSync
            ? OpenClawRuntimeAdapter.FULL_HISTORY_SYNC_LIMIT
            : FINAL_HISTORY_SYNC_LIMIT;
        try {
            const history = await client.request('chat.history', {
                sessionKey,
                limit,
            }, { timeoutMs: 10_000 });
            if (!Array.isArray(history?.messages) || history.messages.length === 0) {
                console.log('[Reconcile] empty history — sessionId:', sessionId);
                this.channelSyncCursor.set(sessionId, 0);
                return;
            }
            // Update gateway history cursor for system message tracking
            this.gatewayHistoryCountBySession.set(sessionId, history.messages.length);
            // Sync system messages (reminders etc.)
            const previousHistoryCountKnown = this.gatewayHistoryCountBySession.has(sessionId);
            const previousHistoryCount = this.gatewayHistoryCountBySession.get(sessionId) ?? 0;
            this.syncSystemMessagesFromHistory(sessionId, history.messages, {
                previousCountKnown: previousHistoryCountKnown,
                previousCount: previousHistoryCount,
            });
            // Determine if this is a channel session (for Discord/QQ text normalization)
            const isChannel = this.channelSessionSync
                && !(0, openclawChannelSessionSync_1.isManagedSessionKey)(sessionKey)
                && this.channelSessionSync.isChannelSessionKey(sessionKey);
            const isDiscord = sessionKey.includes(':discord:');
            const isQQ = sessionKey.includes(':qqbot:');
            const isPopo = sessionKey.includes(':moltbot-popo:');
            const isFeishu = sessionKey.includes(':feishu:');
            // Platform flags for text normalization (shared by auth + local)
            const platformFlags = { isDiscord, isQQ, isPopo, isFeishu };
            if (isChannel) {
                this.syncChannelSessionModelOverride({
                    coworkSessionId: sessionId,
                    openClawSessionKey: sessionKey,
                    state: extractChannelSessionModelStateFromHistory(history.messages),
                });
            }
            // Extract authoritative user/assistant entries from gateway history
            const authoritativeEntries = [];
            for (const entry of (0, openclawHistory_1.extractGatewayHistoryEntries)(history.messages)) {
                const role = entry.role;
                if (role !== 'user' && role !== 'assistant')
                    continue;
                const text = normalizeEntryText(role, entry.text, platformFlags);
                const mediaMetadata = role === 'user' ? (0, openclawConversationReconciliation_1.buildGatewayMediaMetadata)(entry) : undefined;
                if ((!text && !mediaMetadata) || (0, openclawHistory_1.shouldSuppressHeartbeatText)(role, text))
                    continue;
                // Carry usage/model metadata for assistant messages and local media refs for user messages.
                let metadata;
                if (role === 'user') {
                    metadata = mediaMetadata;
                }
                else if (role === 'assistant' && (entry.usage || entry.model)) {
                    metadata = {};
                    if (entry.usage) {
                        metadata.usage = {
                            ...(entry.usage.input != null && { inputTokens: entry.usage.input }),
                            ...(entry.usage.output != null && { outputTokens: entry.usage.output }),
                        };
                    }
                    if (entry.model) {
                        metadata.model = entry.model;
                    }
                }
                authoritativeEntries.push({
                    role: role,
                    text,
                    ...(metadata && { metadata }),
                    ...(entry.timestamp != null && { timestamp: entry.timestamp }),
                });
            }
            // For channel sessions, append file paths from "message" tool calls
            if (isChannel && authoritativeEntries.length > 0) {
                const sentFilePaths = extractSentFilePathsFromHistory(history.messages);
                if (sentFilePaths.length > 0) {
                    const lastAssistantIdx = authoritativeEntries.findLastIndex(e => e.role === 'assistant');
                    if (lastAssistantIdx >= 0) {
                        const fileLinks = sentFilePaths
                            .map((fp) => `[${path.basename(fp)}](${fp})`)
                            .join('\n');
                        authoritativeEntries[lastAssistantIdx] = {
                            ...authoritativeEntries[lastAssistantIdx],
                            text: `${authoritativeEntries[lastAssistantIdx].text}\n\n${fileLinks}`,
                        };
                    }
                }
            }
            if (authoritativeEntries.length === 0) {
                console.log('[Reconcile] no user/assistant entries in history — sessionId:', sessionId);
                this.channelSyncCursor.set(sessionId, 0);
                return;
            }
            // Collect local user/assistant messages for comparison
            // Apply the same normalization as authoritativeEntries so alignment
            // works even when local messages still carry raw platform prefixes.
            let localMessages = this.store.getRecentConversationMessages(sessionId, limit);
            let localEntries = buildLocalReconciledEntries(localMessages, platformFlags);
            // Fast path: if already in sync, skip
            const isInSync = localEntries.length === authoritativeEntries.length
                && localEntries.every((entry, idx) => entry.role === authoritativeEntries[idx].role
                    && entry.text === authoritativeEntries[idx].text
                    && (0, openclawConversationReconciliation_1.isSameReconciledEntry)(entry, authoritativeEntries[idx]));
            if (isInSync) {
                console.log('[Reconcile] already in sync — sessionId:', sessionId, 'entries:', localEntries.length);
                this.channelSyncCursor.set(sessionId, authoritativeEntries.length);
                return;
            }
            // Tail-alignment: find where the gateway window overlaps local history.
            let alignment = (0, openclawConversationReconciliation_1.findTailAlignment)(localEntries, authoritativeEntries);
            let tailState = getReconciliationTailState(localEntries, authoritativeEntries, alignment);
            // A bounded tail is enough for every steady-state poll. Only expand the
            // local transcript when a replacement is already necessary, otherwise a
            // gateway window of `limit` entries could truncate an older local prefix.
            if (!tailState?.isInSync && localMessages.length === limit) {
                const allLocalMessages = this.store.getAllConversationMessages(sessionId);
                if (allLocalMessages.length > localMessages.length) {
                    console.debug('[Reconcile] expanding local history before replacement — sessionId:', sessionId, 'recent:', localMessages.length, 'all:', allLocalMessages.length);
                    localMessages = allLocalMessages;
                    localEntries = buildLocalReconciledEntries(localMessages, platformFlags);
                    alignment = (0, openclawConversationReconciliation_1.findTailAlignment)(localEntries, authoritativeEntries);
                    tailState = getReconciliationTailState(localEntries, authoritativeEntries, alignment);
                }
            }
            let entriesToStore;
            if (tailState?.isInSync && alignment) {
                console.log('[Reconcile] tail in sync — sessionId:', sessionId, 'preserved:', alignment.localIdx, 'tail:', tailState.localTail.length, 'authSkipped:', alignment.authIdx);
                this.channelSyncCursor.set(sessionId, authoritativeEntries.length);
                return;
            }
            if (tailState && alignment) {
                // Gateway covers only the tail — preserve older local messages
                // Concat preserved prefix with authoritative tail
                entriesToStore = [
                    ...localEntries.slice(0, alignment.localIdx),
                    ...tailState.authoritativeTail,
                ];
                console.log('[Reconcile] tail replace — sessionId:', sessionId, 'preserved:', alignment.localIdx, 'auth:', tailState.authoritativeTail.length, 'authSkipped:', alignment.authIdx, 'total:', entriesToStore.length);
            }
            else {
                // alignment.localIdx === 0 (gateway covers full range) or no overlap
                // In both cases: full replace to ensure dashboard consistency
                entriesToStore = authoritativeEntries;
                console.log('[Reconcile] full replace — sessionId:', sessionId, 'local:', localEntries.length, '→ auth:', authoritativeEntries.length, 'alignIdx:', alignment?.localIdx ?? -1);
            }
            this.store.replaceConversationMessages(sessionId, (0, openclawConversationReconciliation_1.applyLocalTimestampsToEntries)(entriesToStore, localEntries));
            this.channelSyncCursor.set(sessionId, authoritativeEntries.length);
            // Notify renderer to refresh
            this.notifySessionsChanged(sessionId);
        }
        catch (error) {
            console.warn('[Reconcile] failed — sessionId:', sessionId, 'error:', error);
        }
    }
    async syncLatestChannelUserMessage(sessionId, sessionKey) {
        const client = this.gatewayClient;
        if (!client) {
            console.log('[ChannelSync] no gateway client, skipping latest channel user sync');
            return;
        }
        const history = await client.request('chat.history', {
            sessionKey,
            limit: FINAL_HISTORY_SYNC_LIMIT,
        }, { timeoutMs: 10_000 });
        if (!Array.isArray(history?.messages) || history.messages.length === 0) {
            this.channelSyncCursor.set(sessionId, 0);
            return;
        }
        this.markGatewayHistoryWindowConsumed(sessionId, history.messages);
        this.syncChannelUserMessages(sessionId, history.messages, true, sessionKey.includes(':discord:'), sessionKey.includes(':qqbot:'), sessionKey.includes(':moltbot-popo:'), sessionKey.includes(':feishu:'));
    }
    async syncFinalAssistantWithHistory(sessionId, turn, options = {}) {
        console.debug('[EngineRuntime] syncFinalAssistant — sessionId:', sessionId);
        const client = this.gatewayClient;
        if (!client) {
            console.debug('[EngineRuntime] syncFinalAssistant — no gateway client, skipping');
            return;
        }
        try {
            const retryDelaysMs = [0, 120, 250, 500];
            let historyMessages = null;
            let canonicalText = '';
            let isChannel = false;
            for (const delayMs of retryDelaysMs) {
                if (options.requireActiveTurn
                    && (this.activeTurns.get(sessionId) !== turn
                        || turn.stopRequested)) {
                    console.debug('[EngineRuntime] syncFinalAssistant — inactive turn, skipping');
                    return;
                }
                if (delayMs > 0) {
                    await sleep(delayMs);
                }
                const history = await client.request('chat.history', {
                    sessionKey: turn.sessionKey,
                    limit: FINAL_HISTORY_SYNC_LIMIT,
                }, { timeoutMs: 8_000 });
                if (options.requireActiveTurn
                    && (this.activeTurns.get(sessionId) !== turn
                        || turn.stopRequested)) {
                    console.debug('[EngineRuntime] syncFinalAssistant — turn stopped during history request');
                    return;
                }
                const msgCount = Array.isArray(history?.messages) ? history.messages.length : 0;
                console.debug('[EngineRuntime] syncFinalAssistant — chat.history returned', msgCount, 'messages');
                if (!Array.isArray(history?.messages) || history.messages.length === 0) {
                    this.gatewayHistoryCountBySession.set(sessionId, 0);
                    continue;
                }
                historyMessages = history.messages;
                (0, diagnostics_1.logThinkingDiagnostic)('history-final-reconcile', `sessionId=${sessionId}`, `attemptDelayMs=${delayMs}`, `messages=${history.messages.length}`, (0, diagnostics_1.summarizeCurrentTurnThinkingHistoryForDiagnostics)(history.messages));
                const previousHistoryCountKnown = this.gatewayHistoryCountBySession.has(sessionId);
                const previousHistoryCount = this.gatewayHistoryCountBySession.get(sessionId) ?? 0;
                this.syncSystemMessagesFromHistory(sessionId, history.messages, {
                    previousCountKnown: previousHistoryCountKnown,
                    previousCount: previousHistoryCount,
                });
                isChannel = Boolean(this.channelSessionSync
                    && !(0, openclawChannelSessionSync_1.isManagedSessionKey)(turn.sessionKey)
                    && this.channelSessionSync.isChannelSessionKey(turn.sessionKey));
                if (isChannel) {
                    const latestOnly = this.reCreatedChannelSessionIds.has(sessionId);
                    this.syncChannelUserMessages(sessionId, history.messages, latestOnly, turn.sessionKey.includes(':discord:'), turn.sessionKey.includes(':qqbot:'), turn.sessionKey.includes(':moltbot-popo:'), turn.sessionKey.includes(':feishu:'));
                }
                if (!this.isCurrentTurnToken(sessionId, turn.turnToken)) {
                    console.debug('[EngineRuntime] syncFinalAssistant — stale turn token, skipping');
                    return;
                }
                this.syncToolResultsFromHistory(sessionId, turn, history.messages);
                const historyToolWork = inspectCurrentTurnToolWork(history.messages);
                turn.lastHistoryHadToolWork = historyToolWork.hasToolWork;
                turn.lastHistoryToolResultCharCount = historyToolWork.toolResultChars;
                // Use turn-aware extraction for ALL session types.
                // The previous non-channel backward scan could return stale assistant text
                // from a prior turn when the gateway rejected the current run (empty final).
                canonicalText = extractCurrentTurnAssistantText(history.messages);
                if (!canonicalText && historyTailLooksLikeContextMaintenance(history.messages)) {
                    turn.hasContextMaintenanceTool = true;
                    console.debug('[EngineRuntime] detected context maintenance from final history tail.');
                    break;
                }
                if (canonicalText) {
                    break;
                }
            }
            if (historyMessages) {
                // Preserve OpenClaw's assistant/tool ordering instead of collapsing all
                // reasoning from the turn into one trailing message. This also runs for
                // thinking-only turns that have no canonical visible text.
                this.thinkingController.reconcile(sessionId, turn, historyMessages, true);
            }
            if (!historyMessages || !canonicalText) {
                console.debug('[EngineRuntime] syncFinalAssistant — no canonical text found');
                return;
            }
            // For channel sessions, append file paths from "message" tool calls as clickable links
            if (isChannel) {
                const sentFilePaths = extractSentFilePathsFromHistory(historyMessages);
                if (sentFilePaths.length > 0) {
                    console.debug('[EngineRuntime] syncFinalAssistant — found sent file paths:', sentFilePaths);
                    const fileLinks = sentFilePaths
                        .map((fp) => `[${path.basename(fp)}](${fp})`)
                        .join('\n');
                    canonicalText = `${canonicalText}\n\n${fileLinks}`;
                }
            }
            if (turn.planMode && !options.suppressPlanModeWrapping) {
                canonicalText = ensurePlanModeProposedPlanBlock(canonicalText);
            }
            console.debug('[EngineRuntime] syncFinalAssistant — canonicalText.length:', canonicalText.length);
            // For managed sessions: extract the last assistant segment directly from history
            // instead of using committedAssistantText for prefix slicing.
            // committedAssistantText is built from streaming data which may have been corrupted
            // by the gateway's appendUniqueSuffix overlap detection.
            let canonicalSegmentText = (0, openclawChannelSessionSync_1.isManagedSessionKey)(turn.sessionKey)
                ? extractLastAssistantSegmentInTurn(historyMessages)
                : this.resolveAssistantSegmentText(turn, canonicalText);
            if (turn.planMode && !options.suppressPlanModeWrapping) {
                canonicalSegmentText = ensurePlanModeProposedPlanBlock(canonicalSegmentText);
            }
            console.debug('[Debug:syncFinal] canonicalSegmentText length:', canonicalSegmentText.length, 'committed.length:', turn.committedAssistantText.length, 'segment:', canonicalSegmentText.slice(0, 80));
            turn.currentText = canonicalText;
            turn.currentAssistantSegmentText = canonicalSegmentText;
            if (!canonicalSegmentText) {
                return;
            }
            if (!turn.planMode) {
                this.removeRedundantFinalPrefixSegment(sessionId, turn.assistantMessageId, canonicalSegmentText);
            }
            if (!turn.assistantMessageId) {
                const committedMessageId = this.reuseCommittedAssistantMessage(sessionId, turn, canonicalSegmentText);
                if (committedMessageId) {
                    turn.assistantMessageId = committedMessageId;
                    return;
                }
                const reusedMessageId = this.reuseFinalAssistantMessage(sessionId, canonicalSegmentText);
                if (reusedMessageId) {
                    turn.assistantMessageId = reusedMessageId;
                    return;
                }
                const assistantMessage = this.store.addMessage(sessionId, {
                    type: 'assistant',
                    content: canonicalSegmentText,
                    metadata: {
                        isStreaming: false,
                        isFinal: true,
                    },
                });
                turn.assistantMessageId = assistantMessage.id;
                this.emit('message', sessionId, assistantMessage);
                return;
            }
            const session = this.store.getSession(sessionId);
            const currentMessage = session?.messages.find((message) => message.id === turn.assistantMessageId);
            const currentText = currentMessage?.content.trim() ?? '';
            const finalMetadata = {
                isStreaming: false,
                isFinal: true,
            };
            if (canonicalSegmentText === currentText) {
                // Content matches but renderer may not have received the last throttled update.
                // Force-emit so the UI shows the final text.
                this.store.updateMessage(sessionId, turn.assistantMessageId, {
                    metadata: finalMetadata,
                });
                this.emit('messageUpdate', sessionId, turn.assistantMessageId, canonicalSegmentText, finalMetadata);
                return;
            }
            console.debug('[Debug:syncFinal] updating last segment:', currentText.length, '->', canonicalSegmentText.length);
            this.store.updateMessage(sessionId, turn.assistantMessageId, {
                content: canonicalSegmentText,
                metadata: finalMetadata,
            });
            this.emit('messageUpdate', sessionId, turn.assistantMessageId, canonicalSegmentText, finalMetadata);
        }
        catch (error) {
            console.warn('[EngineRuntime] chat.history sync after final failed:', error);
        }
    }
    collectChannelHistoryEntries(historyMessages, isDiscord, isQQ, isPopo = false, isFeishu = false) {
        const historyEntries = [];
        for (const message of historyMessages) {
            const entry = (0, openclawHistory_1.extractGatewayHistoryEntries)([message])[0];
            if (!entry)
                continue;
            const role = entry.role;
            if (role !== 'user' && role !== 'assistant')
                continue;
            let text = entry.text.trim();
            // POPO's moltbot-popo plugin converts newlines to HTML break tags (<br />),
            // causing raw <br /> to appear in the UI and AI conversation.
            if (isPopo)
                text = text.replace(/<br\s*\/?>/gi, '\n');
            if (isPopo && role === 'user')
                text = stripPopoSystemHeader(text);
            if (isDiscord)
                text = stripDiscordMentions(text);
            if (isQQ && role === 'user')
                text = stripQQBotSystemPrompt(text);
            if (isFeishu && role === 'user')
                text = stripFeishuSystemHeader(text);
            const metadata = role === 'user' ? (0, openclawConversationReconciliation_1.buildGatewayMediaMetadata)(entry) : undefined;
            if ((text || metadata) && !(0, openclawHistory_1.shouldSuppressHeartbeatText)(role, text)) {
                historyEntries.push({
                    role: role,
                    text,
                    ...(metadata ? { metadata } : {}),
                });
            }
        }
        return historyEntries;
    }
    collectLocalChannelEntries(sessionId) {
        const session = this.store.getSession(sessionId);
        if (!session)
            return [];
        const localEntries = [];
        for (const msg of session.messages) {
            if (msg.type !== 'user' && msg.type !== 'assistant')
                continue;
            const text = msg.content.trim();
            const mediaKey = (0, openclawConversationReconciliation_1.getLocalMediaAttachmentsKey)(msg.metadata);
            if (!text && !mediaKey)
                continue;
            localEntries.push({ role: msg.type, text, metadata: msg.metadata });
        }
        return localEntries;
    }
    computeChannelHistoryFirstNewIndex(localEntries, historyEntries, cursor) {
        if (localEntries.length === 0) {
            return { firstNewIdx: 0, strategy: 'empty-local' };
        }
        // `chat.history` is byte-bounded in OpenClaw, so the returned window can slide
        // long before it reaches our requested count. Match the local tail against the
        // current history prefix to find the continuation point without trusting length.
        const maxOverlap = Math.min(localEntries.length, historyEntries.length);
        for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
            let matched = true;
            for (let idx = 0; idx < overlap; idx += 1) {
                const localEntry = localEntries[localEntries.length - overlap + idx];
                const historyEntry = historyEntries[idx];
                if (!isSameChannelHistoryEntry(localEntry, historyEntry)) {
                    matched = false;
                    break;
                }
            }
            if (matched) {
                return { firstNewIdx: overlap, strategy: 'tail-overlap' };
            }
        }
        let lastLocalUserIdx = -1;
        for (let idx = localEntries.length - 1; idx >= 0; idx -= 1) {
            if (localEntries[idx].role === 'user') {
                lastLocalUserIdx = idx;
                break;
            }
        }
        if (lastLocalUserIdx >= 0) {
            const lastLocalUser = localEntries[lastLocalUserIdx];
            let prevLocalUserText;
            for (let idx = lastLocalUserIdx - 1; idx >= 0; idx -= 1) {
                if (localEntries[idx].role === 'user') {
                    prevLocalUserText = localEntries[idx].text;
                    break;
                }
            }
            for (let idx = historyEntries.length - 1; idx >= 0; idx -= 1) {
                if (historyEntries[idx].role !== 'user' || historyEntries[idx].text !== lastLocalUser.text) {
                    continue;
                }
                if (prevLocalUserText !== undefined && idx > 0) {
                    let prevHistUserText;
                    for (let histIdx = idx - 1; histIdx >= 0; histIdx -= 1) {
                        if (historyEntries[histIdx].role === 'user') {
                            prevHistUserText = historyEntries[histIdx].text;
                            break;
                        }
                    }
                    if (prevHistUserText !== prevLocalUserText) {
                        continue;
                    }
                }
                return { firstNewIdx: idx + 1, strategy: 'last-user-anchor' };
            }
        }
        // When cursor > 0, tail-overlap and last-user-anchor (above) are the correct
        // content-based strategies for detecting a sliding history window.  If both
        // failed the mismatch is caused by duplicates in the local store, not by
        // genuinely new gateway messages.  Trust the cursor — it was set to
        // historyEntries.length at the end of the previous sync — instead of falling
        // through to forward-match, which can produce wildly wrong firstNewIdx values
        // when local entries are polluted (causing either an infinite re-sync loop
        // when cursor == historyEntries.length, or a burst of old messages being
        // re-synced when cursor < historyEntries.length).
        //
        // forward-match is still used when cursor == 0 (initial sync / after restart)
        // because there is no cursor history to rely on.
        if (cursor > 0) {
            if (cursor >= historyEntries.length) {
                return { firstNewIdx: historyEntries.length, strategy: 'cursor-stable' };
            }
            return { firstNewIdx: cursor, strategy: 'cursor-fallback' };
        }
        let localIdx = 0;
        let forwardFirstNewIdx = 0;
        for (let idx = 0; idx < historyEntries.length; idx += 1) {
            if (localIdx < localEntries.length && isSameChannelHistoryEntry(historyEntries[idx], localEntries[localIdx])) {
                localIdx += 1;
                forwardFirstNewIdx = idx + 1;
            }
        }
        if (forwardFirstNewIdx > 0) {
            return { firstNewIdx: forwardFirstNewIdx, strategy: 'forward-match' };
        }
        if (historyEntries.length < cursor) {
            return { firstNewIdx: 0, strategy: 'history-rewrite' };
        }
        return {
            firstNewIdx: Math.min(cursor, historyEntries.length),
            strategy: 'cursor-fallback',
        };
    }
    /**
     * Sync user messages from gateway chat.history that haven't been added to the local store yet.
     * Used for channel-originated sessions (e.g. Telegram) where user messages arrive via the
     * gateway rather than the LobsterAI UI.
     *
     * Called at the start of a new turn (via prefetchChannelUserMessages) so that user messages
     * appear before the assistant's streaming response. Both chat and agent events are buffered
     * during prefetch, so the replay order matches direct cowork sessions.
     *
     * Reconciles against the local tail instead of trusting history length/cursor alone,
     * because OpenClaw's `chat.history` window can slide due to byte limits well before
     * the requested message count is reached.
     */
    syncChannelUserMessages(sessionId, historyMessages, latestOnly = false, isDiscord = false, isQQ = false, isPopo = false, isFeishu = false) {
        const historyEntries = this.collectChannelHistoryEntries(historyMessages, isDiscord, isQQ, isPopo, isFeishu);
        const cursor = this.channelSyncCursor.get(sessionId) ?? 0;
        // When latestOnly is true (e.g. session re-created after deletion),
        // only sync the last user message — the one that triggered this turn.
        // Advance cursor to end so subsequent syncs don't replay old history.
        if (latestOnly) {
            if (historyEntries.length > 0) {
                const lastUser = [...historyEntries].reverse().find((entry) => entry.role === 'user');
                if (lastUser) {
                    // Dedup: skip if this message already exists locally
                    const session = this.store.getSession(sessionId);
                    const existingUser = session?.messages.find((m) => m.type === 'user' && m.content.trim() === lastUser.text);
                    if (existingUser) {
                        if ((0, openclawConversationReconciliation_1.getLocalMediaAttachmentsKey)(existingUser.metadata) !== (0, openclawConversationReconciliation_1.getLocalMediaAttachmentsKey)(lastUser.metadata)) {
                            const nextMetadata = {
                                ...(existingUser.metadata ?? {}),
                                ...(lastUser.metadata ?? {}),
                            };
                            this.store.updateMessage(sessionId, existingUser.id, { metadata: nextMetadata });
                            this.emit('messageUpdate', sessionId, existingUser.id, existingUser.content, nextMetadata);
                        }
                    }
                    else {
                        const userMessage = this.store.addMessage(sessionId, {
                            type: 'user',
                            content: lastUser.text,
                            metadata: lastUser.metadata ?? {},
                        });
                        this.emit('message', sessionId, userMessage);
                    }
                }
            }
            this.channelSyncCursor.set(sessionId, historyEntries.length);
            return;
        }
        const localEntries = this.collectLocalChannelEntries(sessionId);
        const { firstNewIdx } = this.computeChannelHistoryFirstNewIndex(localEntries, historyEntries, cursor);
        // Sync user messages from gateway history.
        // Only sync user messages here — assistant messages are already added by the
        // real-time streaming pipeline (handleChatDelta / handleAgentEvent) and by
        // syncFinalAssistantWithHistory's own addMessage/updateMessage logic.
        //
        // When syncing a user message, check whether the corresponding assistant response
        // was already created locally (e.g. due to prefetch timeout where the assistant
        // streamed before user messages were synced). If so, use insertMessageBeforeId
        // to place the user message before the assistant — preserving correct chronological
        // order. This handles the race condition where gateway chat.history lags behind
        // the real-time streaming events.
        // Collect all user message indices that need syncing:
        // 1. Normal: user messages from firstNewIdx onwards (definitely new, no dedup)
        // 2. Repair: user messages before firstNewIdx that are missing locally
        //    (can happen when computeChannelHistoryFirstNewIndex's forward-match
        //    strategy matches the assistant but skips the preceding user message)
        const currentSession = this.store.getSession(sessionId);
        // Build a count-based map of local user texts for the repair range.
        // A simple Set<text> is wrong because users can send the same text
        // multiple times (e.g. "你好" in turn 1 and turn 4) — the Set would
        // dedup the second occurrence.  A count map tracks how many times each
        // text already exists locally so we only add genuinely missing entries.
        const localUserTextCounts = new Map();
        if (currentSession) {
            for (const msg of currentSession.messages) {
                if (msg.type === 'user') {
                    const text = msg.content.trim();
                    localUserTextCounts.set(text, (localUserTextCounts.get(text) ?? 0) + 1);
                }
            }
        }
        const userIndicesToSync = [];
        // Normal range: from firstNewIdx onwards — these are definitively new messages
        // identified by the reconciliation algorithm, sync unconditionally.
        for (let i = firstNewIdx; i < historyEntries.length; i++) {
            if (historyEntries[i].role === 'user') {
                userIndicesToSync.push(i);
            }
        }
        // Repair range: before firstNewIdx, check for entries missing locally.
        // Use count-based matching: consume one local occurrence per history entry.
        // Entries with no remaining local count are missing and need to be synced.
        const repairCounts = new Map(localUserTextCounts);
        for (let i = 0; i < firstNewIdx; i++) {
            if (historyEntries[i].role !== 'user')
                continue;
            const remaining = repairCounts.get(historyEntries[i].text) ?? 0;
            if (remaining > 0) {
                repairCounts.set(historyEntries[i].text, remaining - 1);
            }
            else {
                userIndicesToSync.push(i);
            }
        }
        for (const idx of userIndicesToSync) {
            const entry = historyEntries[idx];
            // Find the next assistant entry in history after this user entry, then
            // look for a matching local assistant message. If found, insert the user
            // message before it to maintain correct chronological order.
            let insertBeforeId = null;
            if (currentSession) {
                for (let j = idx + 1; j < historyEntries.length; j++) {
                    if (historyEntries[j].role !== 'assistant')
                        continue;
                    const assistantText = historyEntries[j].text;
                    // Match by content prefix — local text may be segmented or truncated
                    const matchPrefix = assistantText.slice(0, 100);
                    const localMatch = currentSession.messages.find((m) => m.type === 'assistant' && m.content.trim().startsWith(matchPrefix));
                    if (localMatch) {
                        insertBeforeId = localMatch.id;
                    }
                    break;
                }
            }
            let userMessage;
            if (insertBeforeId) {
                userMessage = this.store.insertMessageBeforeId(sessionId, insertBeforeId, {
                    type: 'user',
                    content: entry.text,
                    metadata: entry.metadata ?? {},
                });
                console.debug('[syncChannelUserMessages] inserted user message before assistant, sessionId:', sessionId);
            }
            else {
                userMessage = this.store.addMessage(sessionId, {
                    type: 'user',
                    content: entry.text,
                    metadata: entry.metadata ?? {},
                });
            }
            this.emit('message', sessionId, userMessage);
        }
        this.channelSyncCursor.set(sessionId, historyEntries.length);
    }
    getUserMessageCount(sessionId) {
        const session = this.store.getSession(sessionId);
        if (!session)
            return 0;
        return session.messages.filter((m) => m.type === 'user').length;
    }
    /**
     * Sync full conversation history for a newly discovered channel session.
     * Adds both user and assistant messages to the local CoworkStore in order.
     * Skipped if the session has already been fully synced.
     *
     * Uses position-based matching to avoid false dedup of identical-content messages.
     */
    async syncFullChannelHistory(sessionId, sessionKey) {
        if (this.fullySyncedSessions.has(sessionId))
            return;
        this.fullySyncedSessions.add(sessionId);
        try {
            await this.syncSessionHistoryFromGateway(sessionId, sessionKey, { isFullSync: true });
        }
        catch (error) {
            console.error('[ChannelSync] syncFullChannelHistory: error:', error);
            // Remove from synced set so retry is possible
            this.fullySyncedSessions.delete(sessionId);
        }
    }
    /**
     * Incremental sync for an already-known channel session.
     * Delegates to reconcileWithHistory which handles diff and update.
     */
    async incrementalChannelSync(sessionId, sessionKey) {
        if (this.reCreatedChannelSessionIds.has(sessionId)) {
            await this.syncLatestChannelUserMessage(sessionId, sessionKey);
            return;
        }
        await this.syncSessionHistoryFromGateway(sessionId, sessionKey);
    }
    /**
     * Trigger an immediate incremental sync after a channel session turn completes,
     * so that the renderer sees the latest messages without waiting for the next poll.
     */
    syncChannelAfterTurn(sessionId, sessionKey) {
        if (!this.channelSessionSync || !sessionKey)
            return;
        if (!this.channelSessionSync.isChannelSessionKey(sessionKey))
            return;
        if (!this.fullySyncedSessions.has(sessionId))
            return;
        void this.syncSessionHistoryFromGateway(sessionId, sessionKey).catch((err) => {
            console.warn('[ChannelSync] post-turn incremental sync failed for', sessionKey, err);
        });
    }
    cleanupSessionTurn(sessionId) {
        const turn = this.activeTurns.get(sessionId);
        if (turn) {
            // Clear client-side timeout watchdog
            if (turn.timeoutTimer) {
                clearTimeout(turn.timeoutTimer);
                turn.timeoutTimer = undefined;
            }
            if (turn.lifecycleEndFallbackTimer) {
                clearTimeout(turn.lifecycleEndFallbackTimer);
                turn.lifecycleEndFallbackTimer = undefined;
            }
            if (turn.planModeSafetyRecoveryTimer) {
                clearTimeout(turn.planModeSafetyRecoveryTimer);
                turn.planModeSafetyRecoveryTimer = undefined;
            }
            if (turn.finalCompletionTimer) {
                clearTimeout(turn.finalCompletionTimer);
                turn.finalCompletionTimer = undefined;
                turn.finalCompletionRunId = undefined;
                turn.finalCompletionFlushOnLifecycleEnd = undefined;
                turn.finalCompletionAllowLateContinuation = undefined;
            }
            if (turn.hasContextMaintenanceTool || turn.hasContextCompactionEvent || turn.pendingRecoverableFollowup || turn.pendingOpenClawRetry) {
                this.emitContextMaintenance(sessionId, false);
            }
            // The compaction end event can be dropped when the run closes first
            // (late agent events for closed runs are discarded), which would leave
            // the persisted compaction message spinning forever.
            const compactionMessage = this.getSessionMessage(sessionId, turn.contextCompactionMessageId);
            if (compactionMessage?.metadata?.status === coworkSystemMessages_1.ContextCompactionStatus.Running) {
                this.updateContextCompactionMessage(sessionId, turn, coworkSystemMessages_1.ContextCompactionStatus.Failed, Date.now());
                console.warn(`[EngineRuntime] finalized a running context compaction message as failed during turn cleanup for session ${sessionId}.`);
            }
            // Cancel any pending throttled messageUpdate timer for this turn
            if (turn.assistantMessageId) {
                this.clearPendingMessageUpdate(turn.assistantMessageId);
                this.lastMessageUpdateEmitTime.delete(turn.assistantMessageId);
                this.clearPendingStoreUpdate(turn.assistantMessageId);
                this.lastStoreUpdateTime.delete(turn.assistantMessageId);
            }
            this.turnHistorySync.clearSession(sessionId);
            const shouldRememberClosedRunIds = !turn.suppressRecentlyClosedRunIdsOnCleanup;
            const allowRetryReopen = Boolean(turn.allowRecentlyClosedRunRetryReopenOnCleanup
                || turn.suppressRecentlyClosedRunIdsOnCleanup);
            turn.knownRunIds.forEach((knownRunId) => {
                if (shouldRememberClosedRunIds || allowRetryReopen) {
                    this.rememberRecentlyClosedRunId(knownRunId, {
                        sessionId,
                        sessionKey: turn.sessionKey,
                        allowRetryReopen,
                    });
                }
                this.sessionIdByRunId.delete(knownRunId);
                this.pendingAgentEventsByRunId.delete(knownRunId);
                this.lastChatSeqByRunId.delete(knownRunId);
                this.lastAgentSeqByRunId.delete(knownRunId);
            });
        }
        const completedNormally = typeof this.store.getSession === 'function'
            && this.store.getSession(sessionId)?.status === 'completed';
        if (completedNormally) {
            this.refreshContinuityCapsule(sessionId, coworkContinuityCapsule_1.ContinuityCapsuleSource.PostRun);
        }
        this.activeTurns.delete(sessionId);
        (0, coworkOpenAICompatProxy_1.setCoworkProxySessionId)(null);
        if (completedNormally) {
            setTimeout(() => this.startPendingGoalContinuation(sessionId), 0);
        }
        else {
            this.pendingGoalContinuations.delete(sessionId);
        }
        // NOTE: Do NOT clear lastSystemPromptBySession here — it must persist
        // across turns so that the system prompt is only injected on the first
        // turn of a session (or when it actually changes).  Cleanup happens in
        // onSessionDeleted() when the session is removed entirely.
        this.reCreatedChannelSessionIds.delete(sessionId);
    }
    startPendingGoalContinuation(sessionId) {
        const pending = this.pendingGoalContinuations.get(sessionId);
        if (!pending)
            return;
        this.pendingGoalContinuations.delete(sessionId);
        const session = this.store.getSession(sessionId);
        if (!session)
            return;
        if (this.activeTurns.has(sessionId)) {
            this.pendingGoalContinuations.set(sessionId, pending);
            return;
        }
        console.debug('[EngineRuntime] starting queued goal continuation after active turn completed.', `Session ${sessionId}.`, `Action ${pending.action}.`);
        void this.continueSession(sessionId, pending.prompt, {
            skipInitialUserMessage: pending.skipInitialUserMessage,
            systemPrompt: pending.systemPrompt ?? session.systemPrompt,
        }).catch((error) => {
            const message = error instanceof Error ? error.message : String(error);
            console.error('[EngineRuntime] failed to start queued goal continuation:', error);
            this.store.updateSession(sessionId, { status: 'error' });
            this.emit('error', sessionId, message);
        });
    }
    /**
     * Start a client-side timeout watchdog for a turn.
     * Fires after the server-side timeout + grace period, recovering the UI
     * if the gateway fails to deliver the abort/final event.
     */
    startTurnTimeoutWatchdog(sessionId) {
        const turn = this.activeTurns.get(sessionId);
        if (!turn)
            return;
        const timeoutMs = this.agentTimeoutSeconds * 1000
            + OpenClawRuntimeAdapter.CLIENT_TIMEOUT_GRACE_MS;
        turn.timeoutTimer = setTimeout(() => {
            const currentTurn = this.activeTurns.get(sessionId);
            if (!currentTurn || currentTurn.turnToken !== turn.turnToken)
                return;
            const elapsedSec = ((Date.now() - currentTurn.startedAtMs) / 1000).toFixed(1);
            console.warn(`[AbortDiag] client-side timeout watchdog fired`, `sessionId=${sessionId}`, `runId=${currentTurn.runId}`, `elapsed=${elapsedSec}s`, `watchdogMs=${timeoutMs}`, `— gateway did not deliver abort event`);
            this.handleChatAborted(sessionId, currentTurn);
        }, timeoutMs);
    }
    // ── Subagent public API (delegated to SubagentTracker) ──────────────────
    listSubagentRuns(parentSessionId) {
        return this.subagentTracker.listSubagentRuns(parentSessionId);
    }
    listSubagentRunsByAgent(agentId, limit, offset) {
        return this.subagentTracker.listSubagentRunsByAgent(agentId, limit, offset);
    }
    async getSubTaskHistory(parentSessionId, agentId, sessionKey) {
        return this.subagentTracker.getSubTaskHistory(parentSessionId, agentId, sessionKey);
    }
    async deleteSubagentSession(parentSessionId, runId) {
        return this.subagentTracker.deleteSubagentRun(parentSessionId, runId);
    }
    /**
     * Called when a session is deleted from the store.
     * Purges all in-memory references so that new channel messages
     * with the same sessionKey can create a fresh session.
     */
    onSessionDeleted(sessionId) {
        this.discardPendingBtwRunsForSession(sessionId);
        // Remove sessionIdBySessionKey entries pointing to this session
        const removedKeys = [];
        for (const [key, id] of this.sessionIdBySessionKey.entries()) {
            if (id === sessionId) {
                this.sessionIdBySessionKey.delete(key);
                this.gatewayHistoryCountByCronSessionKey.delete(key);
                const cronKey = (0, openclawCronSessionKey_1.parseOpenClawCronSessionKey)(key);
                if (cronKey && this.latestCronSessionKeyByCacheKey.get(cronKey.cacheKey) === key) {
                    this.latestCronSessionKeyByCacheKey.delete(cronKey.cacheKey);
                }
                removedKeys.push(key);
            }
        }
        const removedChannelKeys = removedKeys.filter((key) => this.channelSessionSync?.isChannelSessionKey(key) ?? false);
        // Suppress polling re-creation for deleted channel keys.
        // Only real-time events (new IM messages) will re-create the session.
        for (const key of removedChannelKeys) {
            this.deletedChannelKeys.add(this.getDeletedChannelKey(key));
            this.channelLifecycleRunBySessionKey.delete(key);
        }
        if (removedKeys.length > 0) {
            void this.deleteGatewaySessionTranscripts(removedKeys);
        }
        // Allow polling to rediscover channel sessions
        this.knownChannelSessionIds.delete(sessionId);
        // Allow full history re-sync when session is re-created
        this.fullySyncedSessions.delete(sessionId);
        this.channelSyncCursor.delete(sessionId);
        this.reCreatedChannelSessionIds.delete(sessionId);
        this.gatewayHistoryCountBySession.delete(sessionId);
        this.latestTurnTokenBySession.delete(sessionId);
        this.stoppedSessions.delete(sessionId);
        this.goalSnapshotBySessionId.delete(sessionId);
        // Clean up active turn and related run-id mappings
        this.cleanupSessionTurn(sessionId);
        // Clean up pending approvals, bridged state, confirmation mode
        this.approvalController.clearBySession(sessionId);
        this.bridgedSessions.delete(sessionId);
        this.continuityFullBridgeCompactedAtBySession.delete(sessionId);
        this.workspaceRehydrationBridgeCompactedAtBySession.delete(sessionId);
        this.confirmationModeBySession.delete(sessionId);
        this.manuallyStoppedSessions.delete(sessionId);
        this.sessionModelPatchStateBySession.delete(sessionId);
        this.contextUsageInFlightBySession.delete(sessionId);
        this.sessionModelPatchQueue.delete(sessionId);
        // Propagate to channel session sync
        if (this.channelSessionSync) {
            this.channelSessionSync.onSessionDeleted(sessionId);
        }
        // Clean up subagent tracking state and persisted messages
        this.subagentTracker.onSessionDeleted(sessionId);
    }
    async deleteGatewaySessionTranscripts(sessionKeys) {
        const client = this.gatewayClient;
        if (!client) {
            console.warn('[EngineRuntime] could not delete gateway session transcripts because the gateway client is unavailable');
            return;
        }
        const uniqueKeys = Array.from(new Set(sessionKeys.filter(Boolean)));
        for (const sessionKey of uniqueKeys) {
            try {
                await client.request('sessions.delete', {
                    key: sessionKey,
                    deleteTranscript: true,
                }, { timeoutMs: OpenClawRuntimeAdapter.GATEWAY_SESSION_DELETE_TIMEOUT_MS });
                console.log(`[EngineRuntime] deleted gateway session transcript for ${sessionKey}`);
            }
            catch (error) {
                console.warn(`[EngineRuntime] failed to delete gateway session transcript for ${sessionKey}:`, error);
            }
        }
    }
    /**
     * Ensure an ActiveTurn exists for a session. Used for channel-originated sessions
     * where new turns arrive after the previous turn was cleaned up.
     */
    isSessionInStopCooldown(sessionId) {
        const stoppedAt = this.stoppedSessions.get(sessionId);
        if (stoppedAt === undefined)
            return false;
        if (Date.now() - stoppedAt < OpenClawRuntimeAdapter.STOP_COOLDOWN_MS) {
            return true;
        }
        // Cooldown expired, remove the entry
        this.stoppedSessions.delete(sessionId);
        return false;
    }
    ensureActiveTurn(sessionId, sessionKey, runId) {
        if (this.activeTurns.has(sessionId))
            return;
        if (runId && this.isRecentlyClosedRunId(runId)) {
            console.debug('[EngineRuntime] suppressed active turn creation for a closed run.');
            return;
        }
        // Suppress automatic turn re-creation for sessions that are still within
        // the stop cooldown window.  This prevents late-arriving OpenClaw events
        // (e.g. from POPO/Telegram) from restarting a stopped session.
        if (this.isSessionInStopCooldown(sessionId)) {
            console.log('[Debug:ensureActiveTurn] suppressed — session in stop cooldown, sessionId:', sessionId);
            return;
        }
        // Once the cooldown has expired, clear the manual-stop marker so that
        // genuinely new channel messages can create a fresh turn.  Without this,
        // `manuallyStoppedSessions` (a permanent Set) would block all future
        // channel events for this session until `runTurn` or `onSessionDeleted`
        // happens to clear it.
        // Only clear for channel/cron sessions.  Desktop sessions (lobsterai:*)
        // must stay suppressed — the gateway may still push late MCP tool results
        // long after the 10s cooldown expires.
        if (this.manuallyStoppedSessions.has(sessionId)) {
            const isChannel = this.channelSessionSync
                && !(0, openclawChannelSessionSync_1.isManagedSessionKey)(sessionKey)
                && this.channelSessionSync.isChannelSessionKey(sessionKey);
            if (isChannel) {
                console.log('[Debug:ensureActiveTurn] cooldown expired, clearing manuallyStoppedSessions for channel re-activation, sessionId:', sessionId);
                this.manuallyStoppedSessions.delete(sessionId);
            }
            else {
                console.log('[Debug:ensureActiveTurn] suppressed — desktop session was manually stopped, sessionId:', sessionId);
                return;
            }
        }
        const isChannel = this.channelSessionSync
            && !(0, openclawChannelSessionSync_1.isManagedSessionKey)(sessionKey)
            && this.channelSessionSync.isChannelSessionKey(sessionKey);
        const trackedLifecycleRunId = isChannel
            ? this.getFreshChannelLifecycleRun(sessionKey)?.runId.trim() ?? ''
            : '';
        const turnRunId = runId || trackedLifecycleRunId || (0, crypto_1.randomUUID)();
        const turnToken = this.nextTurnToken(sessionId);
        console.log('[Debug:ensureActiveTurn] creating turn — sessionId:', sessionId, 'sessionKey:', sessionKey, 'runId:', turnRunId, 'isChannel:', !!isChannel, 'pendingUserSync:', !!isChannel);
        const activeTurn = {
            sessionId,
            sessionKey,
            runId: turnRunId,
            model: this.resolveCurrentModelForSession(sessionId),
            turnToken,
            planMode: false,
            knownRunIds: new Set(runId ? [runId] : [turnRunId]),
            assistantMessageId: null,
            committedAssistantText: '',
            currentAssistantSegmentText: '',
            currentText: '',
            agentAssistantTextLength: 0,
            hasSeenAgentAssistantStream: false,
            currentContentText: '',
            currentContentBlocks: [],
            sawNonTextContentBlocks: false,
            textStreamMode: 'unknown',
            toolUseMessageIdByToolCallId: new Map(),
            toolResultMessageIdByToolCallId: new Map(),
            toolResultTextByToolCallId: new Map(),
            mediaStatusPollCountByToolCallId: new Map(),
            mediaStatusPollCountByTaskId: new Map(),
            mediaStatusPollBaseByToolCallId: new Map(),
            contextMaintenanceToolCallIds: new Set(),
            planModeSuppressedToolCallIds: new Set(),
            startedAtMs: Date.now(),
            firstResponseTiming: { turnStartedAtMs: Date.now() },
            stopRequested: false,
            thinking: (0, controller_1.createOpenClawThinkingTurnState)(),
            pendingUserSync: !!isChannel,
            bufferedChatPayloads: [],
            bufferedAgentPayloads: [],
        };
        this.activeTurns.set(sessionId, activeTurn);
        if (runId) {
            this.sessionIdByRunId.set(runId, sessionId);
        }
        this.store.updateSession(sessionId, { status: 'running' });
        this.emitSessionStatus(sessionId, 'running');
        this.startTurnTimeoutWatchdog(sessionId);
        // For channel sessions, prefetch user messages before streaming starts
        if (isChannel) {
            this.reportChannelPromptSubmit(sessionId, sessionKey, turnRunId, activeTurn);
            void this.prefetchChannelUserMessages(sessionId, sessionKey);
        }
    }
    rememberReportedChannelPromptRunId(runId) {
        if (!runId)
            return;
        this.reportedChannelPromptRunIds.add(runId);
        while (this.reportedChannelPromptRunIds.size
            > OpenClawRuntimeAdapter.REPORTED_CHANNEL_PROMPT_RUN_ID_LIMIT) {
            const oldestRunId = this.reportedChannelPromptRunIds.values().next().value;
            if (typeof oldestRunId !== 'string')
                break;
            this.reportedChannelPromptRunIds.delete(oldestRunId);
        }
    }
    reportChannelPromptSubmit(sessionId, sessionKey, runId, activeTurn) {
        const onChannelPromptSubmit = this.options.onChannelPromptSubmit;
        if (!onChannelPromptSubmit || !this.channelSessionSync)
            return;
        try {
            if (this.heartbeatSessionKeys.has(sessionKey))
                return;
            const channel = (0, openclawChannelSessionSync_1.parseChannelSessionKey)(sessionKey);
            if (!channel || !this.channelSessionSync.isCurrentBindingKey(sessionKey))
                return;
            const normalizedRunId = runId.trim();
            if (activeTurn?.promptAnalyticsReported) {
                this.rememberReportedChannelPromptRunId(normalizedRunId);
                return;
            }
            if (normalizedRunId && this.reportedChannelPromptRunIds.has(normalizedRunId)) {
                if (activeTurn)
                    activeTurn.promptAnalyticsReported = true;
                return;
            }
            const session = this.store.getSession(sessionId);
            if (!session)
                return;
            const agentId = session.agentId?.trim() || (0, openclawChannelSessionSync_1.extractAgentIdFromKey)(sessionKey) || 'main';
            const conversationState = session.messages.some(message => message.type === 'assistant')
                ? constants_1.PromptAnalyticsConversationState.ContinueSession
                : constants_1.PromptAnalyticsConversationState.NewTask;
            this.rememberReportedChannelPromptRunId(normalizedRunId);
            if (activeTurn)
                activeTurn.promptAnalyticsReported = true;
            onChannelPromptSubmit({
                agentId,
                conversationState,
                isMainAgent: agentId === 'main',
                platform: channel.platform,
            });
        }
        catch (error) {
            const errorName = error instanceof Error && error.name.trim()
                ? error.name.trim()
                : 'UnknownError';
            console.warn(`[EngineRuntime] failed to report IM prompt submission analytics (${errorName})`);
        }
    }
    /**
     * Prefetch user messages from gateway history at the start of a channel session turn.
     * This ensures user messages appear before the assistant's streaming response.
     * Delta/final events are buffered until this completes.
     */
    async prefetchChannelUserMessages(sessionId, sessionKey) {
        console.log('[Debug:prefetch] start — sessionId:', sessionId, 'sessionKey:', sessionKey);
        // Use reconcileWithHistory for prefetch — it does an authoritative full
        // comparison against chat.history and replaces local messages on mismatch.
        // This is simpler and more accurate than incremental syncChannelUserMessages:
        // - Handles duplicate user texts correctly (position-based, not text-based)
        // - No cursor drift or dedup heuristic issues
        // - replaceConversationMessages preserves tool_use/tool_result/system messages
        //
        // At turn start the assistant hasn't streamed yet, so full replacement is safe.
        // Final correctness is still ensured by reconcileWithHistory at turn end.
        const MAX_ATTEMPTS = 2;
        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
            try {
                const beforeCount = this.getUserMessageCount(sessionId);
                if (this.reCreatedChannelSessionIds.has(sessionId)) {
                    await this.syncLatestChannelUserMessage(sessionId, sessionKey);
                }
                else {
                    await this.syncSessionHistoryFromGateway(sessionId, sessionKey);
                }
                const afterCount = this.getUserMessageCount(sessionId);
                const newUserMessages = afterCount - beforeCount;
                console.log('[Debug:prefetch] reconciled (attempt', attempt, ') synced user messages:', newUserMessages, '(before:', beforeCount, 'after:', afterCount, ')');
                // Emit 'message' events for newly added user messages so the active
                // conversation updates immediately while the scoped session refresh
                // reconciles the full persisted view asynchronously.
                if (newUserMessages > 0) {
                    const session = this.store.getSession(sessionId);
                    if (session) {
                        const userMessages = session.messages.filter((m) => m.type === 'user');
                        const newMsgs = userMessages.slice(-newUserMessages);
                        for (const msg of newMsgs) {
                            this.emit('message', sessionId, msg);
                        }
                    }
                    break;
                }
                // Retry once if buffered events suggest history hasn't caught up yet
                if (attempt < MAX_ATTEMPTS - 1) {
                    const turn = this.activeTurns.get(sessionId);
                    if (turn && (turn.bufferedChatPayloads.length > 0 || turn.bufferedAgentPayloads.length > 0)) {
                        console.log('[Debug:prefetch] no new user messages but have buffered events, retrying after 500ms...');
                        await new Promise((resolve) => setTimeout(resolve, 500));
                        continue;
                    }
                }
                break;
            }
            catch (error) {
                console.warn('[EngineRuntime] prefetchChannelUserMessages attempt', attempt, 'failed:', error);
                if (attempt < MAX_ATTEMPTS - 1) {
                    await new Promise((resolve) => setTimeout(resolve, 500));
                }
            }
        }
        const turn = this.activeTurns.get(sessionId);
        if (!turn) {
            console.log('[Debug:prefetch] turn was removed during prefetch, cannot replay. sessionId:', sessionId);
            return;
        }
        turn.pendingUserSync = false;
        const chatBuffered = turn.bufferedChatPayloads.length;
        const agentBuffered = turn.bufferedAgentPayloads.length;
        console.log('[Debug:prefetch] replaying buffered events — chat:', chatBuffered, 'agent:', agentBuffered);
        // Merge and replay both chat and agent events in sequence order
        // so that tool use/result messages are interleaved with assistant text segments
        // just like in direct cowork sessions.
        const allBuffered = [];
        let bufIdx = 0;
        for (const event of turn.bufferedChatPayloads) {
            allBuffered.push({ type: 'chat', payload: event.payload, seq: event.seq, bufferedAt: event.bufferedAt, idx: bufIdx++ });
        }
        for (const event of turn.bufferedAgentPayloads) {
            allBuffered.push({ type: 'agent', payload: event.payload, seq: event.seq, bufferedAt: event.bufferedAt, idx: bufIdx++ });
        }
        turn.bufferedChatPayloads = [];
        turn.bufferedAgentPayloads = [];
        allBuffered.sort((a, b) => {
            // Primary: sort by seq if both have it
            const hasSeqA = typeof a.seq === 'number';
            const hasSeqB = typeof b.seq === 'number';
            if (hasSeqA && hasSeqB)
                return a.seq - b.seq;
            // Events with seq come before events without
            if (hasSeqA !== hasSeqB)
                return hasSeqA ? -1 : 1;
            // Fallback: preserve arrival order via bufferedAt, then insertion index
            if (a.bufferedAt !== b.bufferedAt)
                return a.bufferedAt - b.bufferedAt;
            return a.idx - b.idx;
        });
        for (const event of allBuffered) {
            if (event.type === 'chat') {
                this.handleChatEvent(event.payload, event.seq);
            }
            else {
                this.handleAgentEvent(event.payload, event.seq);
            }
        }
        console.log('[Debug:prefetch] replay complete, sessionId:', sessionId);
    }
    bindRunIdToTurn(sessionId, runId) {
        const normalizedRunId = runId.trim();
        if (!normalizedRunId)
            return;
        if (this.isRecentlyClosedRunId(normalizedRunId)) {
            console.debug('[EngineRuntime] suppressed run binding for a closed run.');
            return;
        }
        const turn = this.activeTurns.get(sessionId);
        if (!turn)
            return;
        turn.knownRunIds.add(normalizedRunId);
        this.sessionIdByRunId.set(normalizedRunId, sessionId);
        this.flushPendingAgentEvents(sessionId, normalizedRunId);
    }
    resolveTurn(sessionId) {
        const pending = this.pendingTurns.get(sessionId);
        if (!pending)
            return;
        this.pendingTurns.delete(sessionId);
        pending.resolve();
    }
    rejectTurn(sessionId, error) {
        const pending = this.pendingTurns.get(sessionId);
        if (!pending)
            return;
        this.pendingTurns.delete(sessionId);
        pending.reject(error);
    }
    toSessionKey(sessionId, agentId) {
        return (0, openclawChannelSessionSync_1.buildManagedSessionKey)(sessionId, agentId);
    }
    requireGatewayClient() {
        if (!this.gatewayClient) {
            throw new Error('The engine is not running.');
        }
        return this.gatewayClient;
    }
    /**
     * Return the current gateway client instance, or null if not yet connected.
     * Used by CronJobService to call cron.* APIs on the same gateway.
     */
    getGatewayClient() {
        return this.gatewayClient;
    }
    /**
     * Resolve a connected gateway RPC client for config delivery, creating and
     * handshaking one if needed. Resolves to null instead of throwing so callers
     * can degrade to their own fallback path.
     */
    async ensureGatewayRpcClient() {
        try {
            await this.ensureGatewayClientReady();
        }
        catch (error) {
            console.warn('[EngineRuntime] ensureGatewayRpcClient failed:', error);
            return null;
        }
        return this.gatewayClient;
    }
    /**
     * Current engine status without starting or waiting for anything.
     * Lets IPC handlers report not-ready quickly instead of blocking on
     * gateway startup.
     */
    getEngineStatusSnapshot() {
        return this.engineManager.getStatus();
    }
    getSessionKeysForSession(sessionId) {
        const normalizedSessionId = sessionId.trim();
        if (!normalizedSessionId) {
            return [];
        }
        const keys = [];
        for (const [key, mappedSessionId] of this.sessionIdBySessionKey.entries()) {
            if (mappedSessionId === normalizedSessionId) {
                keys.push(key);
            }
        }
        const session = this.store.getSession(normalizedSessionId);
        const managedKey = this.toSessionKey(normalizedSessionId, session?.agentId);
        if (!keys.includes(managedKey)) {
            keys.push(managedKey);
        }
        keys.sort((left, right) => {
            const leftManaged = (0, openclawChannelSessionSync_1.isManagedSessionKey)(left);
            const rightManaged = (0, openclawChannelSessionSync_1.isManagedSessionKey)(right);
            if (leftManaged !== rightManaged) {
                return leftManaged ? 1 : -1;
            }
            return left.localeCompare(right);
        });
        return keys;
    }
    /**
     * Ensure the gateway client is connected and ready.
     * Resolves when the WebSocket connection is established and authenticated.
     */
    async ensureReady() {
        await this.ensureGatewayClientReady();
    }
}
exports.OpenClawRuntimeAdapter = OpenClawRuntimeAdapter;
//# sourceMappingURL=openclawRuntimeAdapter.js.map