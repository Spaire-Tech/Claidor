import { describe, expect, test } from 'vitest';

import {
  buildExecApprovalPermissionRequest,
  CLAUDE_TOOL_COMMAND_HEAD,
  FILE_ACCESS_COMMAND_HEAD,
  parseClaudeTool,
  parseExecApprovalRequestedPayload,
  parseFileAccess,
  type PendingApprovalEntry,
  resolveApprovalDecision,
  reviewReason,
} from './openclawApprovalBridge';

const payload = (command: string, sessionKey = 'desktop-session-1') => ({
  id: 'req-1',
  request: { sessionKey, command },
});

const pending = (over: Partial<PendingApprovalEntry> = {}): PendingApprovalEntry => ({
  requestId: 'req-1', sessionId: 's1', kind: 'exec', ...over,
});

describe('when the app decides for you', () => {
  test('it does not, on this computer', () => {
    // "as you can see it always ask if he's allowed to do something in
    // the computer i want the same." This used to auto-approve every
    // command that was not a delete, so on the desktop almost nothing was
    // ever actually asked.
    expect(parseExecApprovalRequestedPayload(payload('ls -la'))?.shouldAutoApprove).toBe(false);
    expect(parseExecApprovalRequestedPayload(payload('git push'))?.shouldAutoApprove).toBe(false);
    expect(parseExecApprovalRequestedPayload(payload('rm -rf /tmp/x'))?.shouldAutoApprove).toBe(false);
  });

  test('it still does where nobody can be asked', () => {
    // An IM channel session is somebody messaging from Feishu or Discord.
    // No card can reach them, so the alternative to allowing is hanging.
    // The key shape is OpenClaw's:
    //   agent:{agentId}:{platform}:{subtype}:{conversationId}
    const channelKey = 'agent:main:feishu:direct:ou_abc123';
    expect(parseExecApprovalRequestedPayload(payload('ls', channelKey))?.shouldAutoApprove)
      .toBe(true);
  });
});

describe('a file tool asking', () => {
  // The engine patch `openclaw-file-tools-ask-first.patch` raises a command
  // approval with `file-access <kind> <paths…>` in commandArgv. The bridge
  // has to recognise exactly that and nothing that could be a real command.
  const fileRequest = (argv: unknown) => ({
    sessionKey: 'desktop-session-1',
    command: 'file-access write /Users/bass/Work/report.docx',
    commandArgv: argv as string[],
    cwd: '/Users/bass/Work',
  });

  test('is recognised by its argv head, and carries the paths', () => {
    const parsed = parseExecApprovalRequestedPayload({
      id: 'req-2',
      request: fileRequest([FILE_ACCESS_COMMAND_HEAD, 'write', '/Users/bass/Work/report.docx', '/Users/bass/Work/notes.md']),
    });
    expect(parsed?.fileAccess).toEqual({
      kind: 'write',
      paths: ['/Users/bass/Work/report.docx', '/Users/bass/Work/notes.md'],
    });
    // Still not auto-approved on this computer.
    expect(parsed?.shouldAutoApprove).toBe(false);
  });

  test('a real command is never mistaken for one', () => {
    expect(parseFileAccess({ command: 'read foo', commandArgv: ['read', 'foo'] })).toBeUndefined();
    expect(parseFileAccess({ command: 'ls', commandArgv: ['ls'] })).toBeUndefined();
    expect(parseFileAccess({ command: 'ls' })).toBeUndefined();
    // The head alone, or an unknown kind, or no path: not a file request.
    expect(parseFileAccess({ commandArgv: [FILE_ACCESS_COMMAND_HEAD] })).toBeUndefined();
    expect(parseFileAccess({ commandArgv: [FILE_ACCESS_COMMAND_HEAD, 'delete', '/x'] })).toBeUndefined();
    expect(parseFileAccess({ commandArgv: [FILE_ACCESS_COMMAND_HEAD, 'read', ''] })).toBeUndefined();
  });

  test('becomes a card that shows the paths where a command would show the command', () => {
    const request = buildExecApprovalPermissionRequest(
      'req-2',
      fileRequest([FILE_ACCESS_COMMAND_HEAD, 'read', '/a', '/b']),
      'file-access read /a /b',
      { kind: 'read', paths: ['/a', '/b'] },
    );
    expect(request.toolName).toBe('FileAccess');
    expect(request.toolInput.fileAccess).toEqual({ kind: 'read', paths: ['/a', '/b'] });
    expect(request.toolInput.command).toBe('/a\n/b');
    expect(request.toolInput.cwd).toBe('/Users/bass/Work');
  });

  test('a command approval is untouched', () => {
    const request = buildExecApprovalPermissionRequest(
      'req-1',
      { sessionKey: 's', command: 'ls -la', cwd: '/x' },
      'ls -la',
    );
    expect(request.toolName).toBe('Bash');
    expect(request.toolInput.command).toBe('ls -la');
    expect(request.toolInput.fileAccess).toBeUndefined();
  });
});

describe("one of Claude Code's own tools asking", () => {
  // The engine patch `openclaw-claude-tools-ask-first.patch` raises a
  // command approval with `claude-tool <ToolName> <text>` in commandArgv
  // for every tool Claude Code would itself prompt for.
  const claudeRequest = (argv: unknown, command = 'ls -la ~/Documents') => ({
    sessionKey: 'desktop-session-1',
    command,
    commandArgv: argv as string[],
    cwd: '/Users/bass/Work',
  });

  test('is recognised by its argv head, and carries the tool and its text', () => {
    const parsed = parseExecApprovalRequestedPayload({
      id: 'req-3',
      request: claudeRequest([CLAUDE_TOOL_COMMAND_HEAD, 'Bash', 'ls -la ~/Documents']),
    });
    expect(parsed?.claudeTool).toEqual({ toolName: 'Bash', text: 'ls -la ~/Documents' });
    expect(parsed?.fileAccess).toBeUndefined();
    expect(parsed?.shouldAutoApprove).toBe(false);
  });

  test('a real command is never mistaken for one', () => {
    expect(parseClaudeTool({ command: 'claude-tool x', commandArgv: ['claude-tool'] })).toBeUndefined();
    expect(parseClaudeTool({ command: 'ls', commandArgv: ['ls'] })).toBeUndefined();
    expect(parseClaudeTool({ command: 'ls' })).toBeUndefined();
    expect(parseClaudeTool({ commandArgv: [CLAUDE_TOOL_COMMAND_HEAD, '', 'x'] })).toBeUndefined();
    expect(parseClaudeTool({ commandArgv: [CLAUDE_TOOL_COMMAND_HEAD, 'Bash', ' '] })).toBeUndefined();
    expect(parseClaudeTool({ commandArgv: [CLAUDE_TOOL_COMMAND_HEAD, 'Bash', 'ls', 'extra'] })).toBeUndefined();
  });

  test('its Bash takes the command card', () => {
    const request = buildExecApprovalPermissionRequest(
      'req-3',
      claudeRequest([CLAUDE_TOOL_COMMAND_HEAD, 'Bash', 'rm -rf build']),
      'rm -rf build',
      undefined,
      { toolName: 'Bash', text: 'rm -rf build' },
    );
    expect(request.toolName).toBe('Bash');
    expect(request.toolInput.command).toBe('rm -rf build');
    expect(request.toolInput.dangerLevel).toBeDefined();
    expect(request.toolInput.claudeTool).toBeUndefined();
  });

  test('any other of its tools takes a card named for the tool, arguments where the command goes', () => {
    const text = 'WebFetch {"url":"https://example.com"}';
    const request = buildExecApprovalPermissionRequest(
      'req-4',
      claudeRequest([CLAUDE_TOOL_COMMAND_HEAD, 'WebFetch', text], text),
      text,
      undefined,
      { toolName: 'WebFetch', text },
    );
    expect(request.toolName).toBe('WebFetch');
    expect(request.toolInput.command).toBe(text);
    expect(request.toolInput.claudeTool).toEqual({ toolName: 'WebFetch' });
    expect(request.toolInput.cwd).toBe('/Users/bass/Work');
    expect(request.toolInput.fileAccess).toBeUndefined();
  });
});

describe('which button was pressed', () => {
  test('Always allow means always', () => {
    expect(resolveApprovalDecision(pending(), { behavior: 'allow', scope: 'always' }))
      .toBe('allow-always');
  });

  test('Allow once means once, even when the engine would have allowed always', () => {
    // The regression this guards: the decision was read from the engine's
    // own `allowAlways` flag and the person's press was discarded, so the
    // two allow buttons did the same thing.
    expect(resolveApprovalDecision(pending({ allowAlways: true }), { behavior: 'allow', scope: 'once' }))
      .toBe('allow-once');
  });

  test('Never is a denial whatever else is set', () => {
    expect(resolveApprovalDecision(pending({ allowAlways: true }), { behavior: 'deny', message: 'no' }))
      .toBe('deny');
  });

  test('with no press at all, the engine flag still decides', () => {
    // Auto-approved requests carry no scope, and must keep resolving as
    // allow-always so the engine adds them to its allowlist.
    expect(resolveApprovalDecision(pending({ allowAlways: true }), { behavior: 'allow' }))
      .toBe('allow-always');
    expect(resolveApprovalDecision(pending(), { behavior: 'allow' })).toBe('allow-once');
  });

  test('a press is refused when the engine does not offer it', () => {
    // Plugin approvals come with an explicit list of what is allowed.
    expect(resolveApprovalDecision(
      pending({ kind: 'plugin', allowedDecisions: ['allow-once'] }),
      { behavior: 'allow', scope: 'always' },
    )).toBe('allow-once');
  });
});

describe('the reason on a flagged card', () => {
  test("is the reviewer's sentence, not the engine's wrapping", () => {
    expect(reviewReason('Exec auto-review deferred to human approval (risk=high): Deletes a whole folder and everything in it.'))
      .toBe('Deletes a whole folder and everything in it.');
    expect(reviewReason('Touches the SSH keys.')).toBe('Touches the SSH keys.');
    expect(reviewReason('Warning: heredoc execution requires reviewer or explicit approval in allowlist mode.\nExec auto-review deferred to human approval (risk=medium): Installs software.'))
      .toBe('Installs software.');
  });

  test('is nothing when the engine only talked to itself, or said nothing', () => {
    expect(reviewReason('Warning: allowlist auto-execution is unavailable on linux; reviewer or explicit approval is required.')).toBeUndefined();
    expect(reviewReason('Exec auto-review allowed once (risk=low): fine')).toBeUndefined();
    expect(reviewReason(undefined)).toBeUndefined();
    expect(reviewReason('')).toBeUndefined();
  });

  test('travels onto the card as `reason`, for a command and for a file', () => {
    const command = buildExecApprovalPermissionRequest('r1', {
      sessionKey: 'desktop-1',
      command: 'rm -rf build',
      warningText: 'Exec auto-review deferred to human approval (risk=high): Deletes a whole folder and everything in it.',
    }, 'rm -rf build');
    expect(command.toolInput.reason).toBe('Deletes a whole folder and everything in it.');
    const file = buildExecApprovalPermissionRequest('r2', {
      sessionKey: 'desktop-1',
      command: 'file-access read /Users/bass/.ssh/config',
      warningText: 'Touches the SSH keys.',
    }, 'file-access read /Users/bass/.ssh/config', { kind: 'read', paths: ['/Users/bass/.ssh/config'] });
    expect(file.toolInput.reason).toBe('Touches the SSH keys.');
    const plain = buildExecApprovalPermissionRequest('r3', { sessionKey: 'desktop-1', command: 'ls' }, 'ls');
    expect(plain.toolInput.reason).toBeUndefined();
  });
});
