import { getCommandDangerLevel } from '../commandSafety';
import { parseChannelSessionKey } from '../openclawChannelSessionSync';
import type { PermissionRequest, PermissionResult } from './types';

export type ApprovalDecision = 'allow-once' | 'allow-always' | 'deny';

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
export const FILE_ACCESS_COMMAND_HEAD = 'file-access';

export type FileAccessKind = 'read' | 'write';

export type FileAccess = {
  kind: FileAccessKind;
  paths: string[];
};

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
export const CLAUDE_TOOL_COMMAND_HEAD = 'claude-tool';

export type ClaudeTool = {
  toolName: string;
  text: string;
};

export type PendingApprovalEntry = {
  requestId: string;
  sessionId: string;
  /**
   * `file` is a command approval raised by a file tool. It resolves like
   * `exec`, but the tool is blocked on the answer inside the turn, so it
   * must not get the "approved, carry on" continuation an exec approval
   * needs — that would land a phantom turn in the conversation. `claude`
   * is one of Claude Code's own tools asking, blocked the same way.
   */
  kind: 'exec' | 'plugin' | 'file' | 'claude';
  allowedDecisions?: ApprovalDecision[];
  /** When true, use 'allow-always' decision so OpenClaw adds the command to its allowlist. */
  allowAlways?: boolean;
};

type ExecApprovalRequest = {
  command?: string;
  commandArgv?: string[] | null;
  cwd?: string | null;
  host?: string | null;
  security?: string | null;
  ask?: string | null;
  resolvedPath?: string | null;
  sessionKey?: string | null;
  agentId?: string | null;
};

type ExecApprovalRequestedPayload = {
  id?: string;
  request?: ExecApprovalRequest;
};

type PluginApprovalRequest = {
  pluginId?: string | null;
  title?: string;
  description?: string;
  severity?: string | null;
  toolName?: string | null;
  toolCallId?: string | null;
  allowedDecisions?: string[] | null;
  agentId?: string | null;
  sessionKey?: string | null;
};

type PluginApprovalRequestedPayload = {
  id?: string;
  request?: PluginApprovalRequest;
};

export type ParsedExecApprovalRequest = {
  requestId: string;
  request: ExecApprovalRequest;
  sessionKey: string;
  command: string;
  shouldAutoApprove: boolean;
  /** Present when a file tool raised this, not a command. */
  fileAccess?: FileAccess;
  /** Present when one of Claude Code's own tools raised this. */
  claudeTool?: ClaudeTool;
};

export const parseClaudeTool = (request: ExecApprovalRequest): ClaudeTool | undefined => {
  const argv = request.commandArgv;
  if (!Array.isArray(argv) || argv.length !== 3) return undefined;
  if (argv[0] !== CLAUDE_TOOL_COMMAND_HEAD) return undefined;
  const [, toolName, text] = argv;
  if (typeof toolName !== 'string' || !toolName.trim()) return undefined;
  if (typeof text !== 'string' || !text.trim()) return undefined;
  return { toolName: toolName.trim(), text };
};

export const parseFileAccess = (request: ExecApprovalRequest): FileAccess | undefined => {
  const argv = request.commandArgv;
  if (!Array.isArray(argv) || argv.length < 3) return undefined;
  if (argv[0] !== FILE_ACCESS_COMMAND_HEAD) return undefined;
  const kind = argv[1];
  if (kind !== 'read' && kind !== 'write') return undefined;
  const paths = argv.slice(2).filter((one): one is string => typeof one === 'string' && one.trim().length > 0);
  if (!paths.length) return undefined;
  return { kind, paths };
};

export type ParsedPluginApprovalRequest = {
  requestId: string;
  request: PluginApprovalRequest;
  sessionKey: string;
  allowedDecisions?: ApprovalDecision[];
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
};

const isApprovalDecision = (value: unknown): value is ApprovalDecision => (
  value === 'allow-once' || value === 'allow-always' || value === 'deny'
);

const normalizeApprovalDecisions = (value: unknown): ApprovalDecision[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const decisions: ApprovalDecision[] = [];
  for (const item of value) {
    if (isApprovalDecision(item) && !decisions.includes(item)) {
      decisions.push(item);
    }
  }
  return decisions.length > 0 ? decisions : undefined;
};

export const parseExecApprovalRequestedPayload = (payload: unknown): ParsedExecApprovalRequest | null => {
  if (!isRecord(payload)) return null;
  const typedPayload = payload as ExecApprovalRequestedPayload;
  const requestId = typeof typedPayload.id === 'string' ? typedPayload.id.trim() : '';
  if (!requestId) return null;
  if (!typedPayload.request || !isRecord(typedPayload.request)) return null;

  const request = typedPayload.request;
  const sessionKey = typeof request.sessionKey === 'string' ? request.sessionKey.trim() : '';
  const command = typeof request.command === 'string' ? request.command : '';
  const fileAccess = parseFileAccess(request);
  const claudeTool = fileAccess ? undefined : parseClaudeTool(request);
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
    shouldAutoApprove: parseChannelSessionKey(sessionKey) !== null,
  };
};

export const parsePluginApprovalRequestedPayload = (payload: unknown): ParsedPluginApprovalRequest | null => {
  if (!isRecord(payload)) return null;
  const typedPayload = payload as PluginApprovalRequestedPayload;
  const requestId = typeof typedPayload.id === 'string' ? typedPayload.id.trim() : '';
  if (!requestId) return null;
  if (!typedPayload.request || !isRecord(typedPayload.request)) return null;

  const request = typedPayload.request;
  const sessionKey = typeof request.sessionKey === 'string' ? request.sessionKey.trim() : '';
  return {
    requestId,
    request,
    sessionKey,
    allowedDecisions: normalizeApprovalDecisions(request.allowedDecisions),
  };
};

export const parseApprovalResolvedPayload = (payload: unknown): string | null => {
  if (!isRecord(payload)) return null;
  const requestId = typeof payload.id === 'string' ? payload.id.trim() : '';
  return requestId || null;
};

export const buildExecApprovalPermissionRequest = (
  requestId: string,
  request: ExecApprovalRequest,
  command: string,
  fileAccess?: FileAccess,
  claudeTool?: ClaudeTool,
): PermissionRequest => {
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

  const { level: dangerLevel, reason: dangerReason } = getCommandDangerLevel(command);

  return {
    requestId,
    toolName: 'Bash',
    toolInput: {
      command,
      dangerLevel,
      dangerReason,
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

export const buildPluginApprovalPermissionRequest = (
  requestId: string,
  request: PluginApprovalRequest,
  allowedDecisions?: ApprovalDecision[],
): PermissionRequest => ({
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

export const resolveApprovalDecision = (
  pending: PendingApprovalEntry,
  result: PermissionResult,
): ApprovalDecision => {
  if (result.behavior !== 'allow') return 'deny';
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

export const getApprovalResolveMethod = (pending: PendingApprovalEntry): 'exec.approval.resolve' | 'plugin.approval.resolve' => (
  pending.kind === 'plugin' ? 'plugin.approval.resolve' : 'exec.approval.resolve'
);
