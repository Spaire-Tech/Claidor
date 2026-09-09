import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test, vi } from 'vitest';

import AppUpdateInstallConfirmDialog from './AppUpdateInstallConfirmDialog';

describe('AppUpdateInstallConfirmDialog', () => {
  test('warns that installing interrupts running tasks and offers both choices', () => {
    const html = renderToStaticMarkup(
      React.createElement(AppUpdateInstallConfirmDialog, {
        onCancel: vi.fn(),
        onConfirm: vi.fn(),
      }),
    );

    expect(html).toContain('role="alertdialog"');
    expect(html).toContain('A task is still running');
    expect(html).toContain('Updating now will interrupt the task that is currently running');
    expect(html).toContain('Update anyway');
    expect(html).toContain('Cancel');
    expect(html).toContain('z-[9999]');
  });
});
