import { describe, expect, test } from 'vitest';

import {
  buildExecApprovalPermissionRequest,
  FILE_ACCESS_COMMAND_HEAD,
  parseExecApprovalRequestedPayload,
  parseFileAccess,
  type PendingApprovalEntry,
  resolveApprovalDecision,
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
