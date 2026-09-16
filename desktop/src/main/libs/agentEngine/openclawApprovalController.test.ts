import { describe, expect, test, vi } from 'vitest';

import { OpenClawApprovalController } from './openclawApprovalController';
import type { PermissionRequest } from './types';

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

function build() {
  const request = vi.fn(async () => ({}));
  const emitted: PermissionRequest[] = [];
  const controller = new OpenClawApprovalController({
    getGatewayClient: () => ({ request }),
    resolveSessionId: () => 's1',
    isSessionInStopCooldown: () => false,
    isManualStopSuppressed: () => false,
    emitPermissionRequest: (_sessionId, permission) => { emitted.push(permission); },
    emitPermissionResolved: () => undefined,
    emitError: () => undefined,
  });
  return { controller, request, emitted };
}

describe('after the person answers', () => {
  test('a command approval is resolved with the engine, and nothing else is sent', async () => {
    // Upstream followed every command approval with a user turn — "The
    // user approved the command execution. Please check the result and
    // continue." — which the thread drew as if the person had typed it.
    // The engine wakes the agent itself when the approved command
    // finishes, so the answer is the whole of what the app sends.
    const { controller, request } = build();
    controller.handleExecApprovalRequested({
      id: 'req-1',
      request: { sessionKey: 'desktop-1', command: 'ls -la' },
    });
    controller.respondToPermission('req-1', { behavior: 'allow', scope: 'once' });
    await tick();
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith('exec.approval.resolve', { id: 'req-1', decision: 'allow-once' });
  });

  test('a file approval is resolved the same way', async () => {
    const { controller, request, emitted } = build();
    controller.handleExecApprovalRequested({
      id: 'req-2',
      request: {
        sessionKey: 'desktop-1',
        command: 'file-access write /Users/bass/Work/report.docx',
        commandArgv: ['file-access', 'write', '/Users/bass/Work/report.docx'],
      },
    });
    expect(emitted[0]?.toolName).toBe('FileAccess');
    controller.respondToPermission('req-2', { behavior: 'allow', scope: 'always' });
    await tick();
    expect(request).toHaveBeenCalledWith('exec.approval.resolve', { id: 'req-2', decision: 'allow-always' });
  });

  test("one of Claude Code's own tools is resolved the same way", async () => {
    // The engine patch marks the request `claude-tool`; the card shows the
    // tool's own name and command.
    const { controller, request, emitted } = build();
    controller.handleExecApprovalRequested({
      id: 'req-3',
      request: {
        sessionKey: 'desktop-1',
        command: 'open -a Notes',
        commandArgv: ['claude-tool', 'Bash', 'open -a Notes'],
      },
    });
    expect(emitted[0]?.toolName).toBe('Bash');
    expect(emitted[0]?.toolInput.command).toBe('open -a Notes');
    controller.respondToPermission('req-3', { behavior: 'allow', scope: 'once' });
    await tick();
    expect(request).toHaveBeenCalledWith('exec.approval.resolve', { id: 'req-3', decision: 'allow-once' });
  });
});
