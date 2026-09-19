"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getApprovalResolveMethod = exports.resolveApprovalDecision = exports.buildPluginApprovalPermissionRequest = exports.buildExecApprovalPermissionRequest = exports.parseApprovalResolvedPayload = exports.parsePluginApprovalRequestedPayload = exports.parseExecApprovalRequestedPayload = exports.parseFileAccess = exports.parseClaudeTool = exports.reviewReason = exports.CLAUDE_TOOL_COMMAND_HEAD = exports.FILE_ACCESS_COMMAND_HEAD = void 0;
const commandSafety_1 = require("../commandSafety");
const openclawChannelSessionSync_1 = require("../openclawChannelSessionSync");
/**
 * A file tool asking, through the command approval.
 *
 * The engine patch `openclaw-file-tools-ask-first.patch` makes `read`,
 * `write`, `edit` and `apply_patch` request approval exactly as a command
 * does, and marks the request by putting `file-access <kind> <paths…>` in
 * `commandArgv`. No shell command is named that, so it is unambiguous.
 * The two constants below mirror `FILE_ACCESS_COMMAND_HEAD` and the kinds
 * in `openclaw/src/agents/file-tool-approval.ts`; change both together.
 */
exports.FILE_ACCESS_COMMAND_HEAD = 'file-access';
/**
 * One of Claude Code's own tools asking, through the command approval.
 *
 * When the engine runs a turn through the installed Claude Code
 * (`claude-cli/…`, the development-build mechanic in `claudeCodeMode.ts`),
 * Claude Code's `Bash`, `Write`, `WebFetch` and the rest ask the engine
 * before they run, and the engine patch
 * `openclaw-claude-tools-ask-first.patch` raises a command approval for
 * each with `claude-tool <ToolName> <text>` in `commandArgv`. `Bash`
 * carries its command; anything else carries the tool name and its
 * arguments. Mirrors `CLAUDE_TOOL_COMMAND_HEAD` in
 * `openclaw/src/agents/cli-runner/claude-native-tool-approval.ts`.
 */
exports.CLAUDE_TOOL_COMMAND_HEAD = 'claude-tool';
/**
 * Why the engine flagged this one, in a sentence for the card, or
 * undefined when nothing did.
 *
 * Under review mode ("Check, then ask") a card means the reviewer said
 * so: the quick rules with a plain sentence ("Deletes a whole folder and
 * everything in it."), the model with its own, or a sensitive path
 * ("Touches the SSH keys."). The engine wraps a deferral as `Exec
 * auto-review deferred to human approval (risk=high): <reason>` and
 * files send the sentence bare. Its other warnings ("Warning: heredoc
 * execution requires…") are the engine talking to itself, and stay out.
 */
const reviewReason = (warningText) => {
    for (const line of (warningText ?? '').split('\n')) {
        const trimmed = line.trim();
        if (!trimmed)
            continue;
        const deferred = /deferred to human approval \(risk=\w+\): (.+)$/.exec(trimmed);
        if (deferred)
            return deferred[1].trim();
        if (/^(Warning:|Exec auto-review allowed)/.test(trimmed))
            continue;
        return trimmed;
    }
    return undefined;
};
exports.reviewReason = reviewReason;
const parseClaudeTool = (request) => {
    const argv = request.commandArgv;
    if (!Array.isArray(argv) || argv.length !== 3)
        return undefined;
    if (argv[0] !== exports.CLAUDE_TOOL_COMMAND_HEAD)
        return undefined;
    const [, toolName, text] = argv;
    if (typeof toolName !== 'string' || !toolName.trim())
        return undefined;
    if (typeof text !== 'string' || !text.trim())
        return undefined;
    return { toolName: toolName.trim(), text };
};
exports.parseClaudeTool = parseClaudeTool;
const parseFileAccess = (request) => {
    const argv = request.commandArgv;
    if (!Array.isArray(argv) || argv.length < 3)
        return undefined;
    if (argv[0] !== exports.FILE_ACCESS_COMMAND_HEAD)
        return undefined;
    const kind = argv[1];
    if (kind !== 'read' && kind !== 'write')
        return undefined;
    const paths = argv.slice(2).filter((one) => typeof one === 'string' && one.trim().length > 0);
    if (!paths.length)
        return undefined;
    return { kind, paths };
};
exports.parseFileAccess = parseFileAccess;
const isRecord = (value) => {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
};
const isApprovalDecision = (value) => (value === 'allow-once' || value === 'allow-always' || value === 'deny');
const normalizeApprovalDecisions = (value) => {
    if (!Array.isArray(value))
        return undefined;
    const decisions = [];
    for (const item of value) {
        if (isApprovalDecision(item) && !decisions.includes(item)) {
            decisions.push(item);
        }
    }
    return decisions.length > 0 ? decisions : undefined;
};
const parseExecApprovalRequestedPayload = (payload) => {
    if (!isRecord(payload))
        return null;
    const typedPayload = payload;
    const requestId = typeof typedPayload.id === 'string' ? typedPayload.id.trim() : '';
    if (!requestId)
        return null;
    if (!typedPayload.request || !isRecord(typedPayload.request))
        return null;
    const request = typedPayload.request;
    const sessionKey = typeof request.sessionKey === 'string' ? request.sessionKey.trim() : '';
    const command = typeof request.command === 'string' ? request.command : '';
    const fileAccess = (0, exports.parseFileAccess)(request);
    const claudeTool = fileAccess ? undefined : (0, exports.parseClaudeTool)(request);
    return {
        requestId,
        request,
        sessionKey,
        command,
        ...(fileAccess ? { fileAccess } : {}),
        ...(claudeTool ? { claudeTool } : {}),
        // Auto-approve only where there is nobody to ask. An IM channel
        // session is a person messaging from Feishu or Discord; no approval
        // card can reach them, so the alternative to allowing is hanging.
        //
        // It used to also auto-approve every command that was not a delete,
        // which meant that on this computer — where there IS somebody to ask
        // — almost nothing was ever asked. The direction is the opposite:
        // "as you can see it always ask if he's allowed to do something in
        // the computer i want the same."
        shouldAutoApprove: (0, openclawChannelSessionSync_1.parseChannelSessionKey)(sessionKey) !== null,
    };
};
exports.parseExecApprovalRequestedPayload = parseExecApprovalRequestedPayload;
const parsePluginApprovalRequestedPayload = (payload) => {
    if (!isRecord(payload))
        return null;
    const typedPayload = payload;
    const requestId = typeof typedPayload.id === 'string' ? typedPayload.id.trim() : '';
    if (!requestId)
        return null;
    if (!typedPayload.request || !isRecord(typedPayload.request))
        return null;
    const request = typedPayload.request;
    const sessionKey = typeof request.sessionKey === 'string' ? request.sessionKey.trim() : '';
    return {
        requestId,
        request,
        sessionKey,
        allowedDecisions: normalizeApprovalDecisions(request.allowedDecisions),
    };
};
exports.parsePluginApprovalRequestedPayload = parsePluginApprovalRequestedPayload;
const parseApprovalResolvedPayload = (payload) => {
    if (!isRecord(payload))
        return null;
    const requestId = typeof payload.id === 'string' ? payload.id.trim() : '';
    return requestId || null;
};
exports.parseApprovalResolvedPayload = parseApprovalResolvedPayload;
const buildExecApprovalPermissionRequest = (requestId, request, command, fileAccess, claudeTool) => {
    const reason = (0, exports.reviewReason)(request.warningText);
    if (claudeTool && claudeTool.toolName !== 'Bash') {
        // Claude Code's own WebFetch, WebSearch or whatever else: the card is
        // named for the tool and shows its arguments where a command would go.
        // Its Bash is a command and takes the command card below.
        return {
            requestId,
            toolName: claudeTool.toolName,
            toolInput: {
                claudeTool: { toolName: claudeTool.toolName },
                command: claudeTool.text,
                ...(reason ? { reason } : {}),
                cwd: request.cwd ?? null,
                host: request.host ?? null,
                security: request.security ?? null,
                ask: request.ask ?? null,
                sessionKey: request.sessionKey ?? null,
                agentId: request.agentId ?? null,
            },
            toolUseId: requestId,
        };
    }
    if (fileAccess) {
        // The card shows the paths, one per line, where a command would show
        // the command. Nothing else about the request is a shell command.
        return {
            requestId,
            toolName: 'FileAccess',
            toolInput: {
                fileAccess,
                command: fileAccess.paths.join('\n'),
                ...(reason ? { reason } : {}),
                cwd: request.cwd ?? null,
                host: request.host ?? null,
                security: request.security ?? null,
                ask: request.ask ?? null,
                sessionKey: request.sessionKey ?? null,
                agentId: request.agentId ?? null,
            },
            toolUseId: requestId,
        };
    }
    const { level: dangerLevel, reason: dangerReason } = (0, commandSafety_1.getCommandDangerLevel)(command);
    return {
        requestId,
        toolName: 'Bash',
        toolInput: {
            command,
            dangerLevel,
            dangerReason,
            ...(reason ? { reason } : {}),
            cwd: request.cwd ?? null,
            host: request.host ?? null,
            security: request.security ?? null,
            ask: request.ask ?? null,
            resolvedPath: request.resolvedPath ?? null,
            sessionKey: request.sessionKey ?? null,
            agentId: request.agentId ?? null,
        },
        toolUseId: requestId,
    };
};
exports.buildExecApprovalPermissionRequest = buildExecApprovalPermissionRequest;
const buildPluginApprovalPermissionRequest = (requestId, request, allowedDecisions) => ({
    requestId,
    toolName: request.toolName?.trim() || request.pluginId?.trim() || 'PluginApproval',
    toolInput: {
        approvalKind: 'plugin',
        title: request.title ?? null,
        description: request.description ?? null,
        severity: request.severity ?? null,
        pluginId: request.pluginId ?? null,
        toolName: request.toolName ?? null,
        toolCallId: request.toolCallId ?? null,
        allowedDecisions: allowedDecisions ?? null,
        sessionKey: request.sessionKey ?? null,
        agentId: request.agentId ?? null,
    },
    toolUseId: request.toolCallId ?? requestId,
});
exports.buildPluginApprovalPermissionRequest = buildPluginApprovalPermissionRequest;
const resolveApprovalDecision = (pending, result) => {
    if (result.behavior !== 'allow')
        return 'deny';
    const allowed = pending.allowedDecisions;
    // The person's press wins over the auto-approve flag. `allowAlways` is
    // set by the engine for sessions nobody can be asked about; `scope` is
    // set by somebody pressing a button, and only one of the two is a
    // choice.
    const wantsAlways = result.scope === 'always' || (result.scope === undefined && pending.allowAlways);
    if (wantsAlways && (!allowed || allowed.includes('allow-always'))) {
        return 'allow-always';
    }
    if (!allowed || allowed.includes('allow-once')) {
        return 'allow-once';
    }
    if (allowed.includes('allow-always')) {
        return 'allow-always';
    }
    return 'deny';
};
exports.resolveApprovalDecision = resolveApprovalDecision;
const getApprovalResolveMethod = (pending) => (pending.kind === 'plugin' ? 'plugin.approval.resolve' : 'exec.approval.resolve');
exports.getApprovalResolveMethod = getApprovalResolveMethod;
//# sourceMappingURL=openclawApprovalBridge.js.map