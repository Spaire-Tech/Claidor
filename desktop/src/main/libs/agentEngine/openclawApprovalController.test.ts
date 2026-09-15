import { describe, expect, test, vi } from 'vitest';

import { OpenClawApprovalController } from './openclawApprovalController';
import type { PermissionRequest } from './types';

vi.mock('../../i18n', () => ({
  t: (key: string) => key,
}));

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

function build() {
  const request = vi.fn(async () => ({}));
  const emitted: PermissionRequest[] = [];
  const continueSession = vi.fn(async () => undefined);
  const controller = new OpenClawApprovalController({
    getGatewayClient: () => ({ request }),
    resolveSessionId: () => 's1',
    isSessionInStopCooldown: () => false,
    isManualStopSuppressed: () => false,
    sessionExists: () => true,
    // Not running: the moment a continuation would fire.
    isSessionActive: () => false,
    continueSession,
    emitPermissionRequest: (_sessionId, permission) => { emitted.push(permission); },
    emitPermissionResolved: () => undefined,
    emitError: () => undefined,
  });
  return { controller, request, emitted, continueSession };
}

describe('after the person answers', () => {
  test('a command approval is followed by the continuation prompt', async () => {
    const { controller, request, continueSession } = build();
    controller.handleExecApprovalRequested({
      id: 'req-1',
      request: { sessionKey: 'desktop-1', command: 'ls -la' },
    });
    controller.respondToPermission('req-1', { behavior: 'allow', scope: 'once' });
    await tick();
    expect(request).toHaveBeenCalledWith('exec.approval.resolve', { id: 'req-1', decision: 'allow-once' });
    expect(continueSession).toHaveBeenCalledTimes(1);
  });

  test('a file approval is resolved the same way but never continued', async () => {
    // The file tool is blocked on the answer inside the turn. A
    // continuation prompt here would land a phantom user turn — "Approved,
    // carry on" — in a conversation that never stopped.
    const { controller, request, emitted, continueSession } = build();
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
    expect(continueSession).not.toHaveBeenCalled();
  });
});
