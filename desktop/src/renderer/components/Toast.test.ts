import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';

import Toast from './Toast';

describe('Toast', () => {
  test('renders non-blocking feedback at the bottom centre without a modal backdrop', () => {
    const html = renderToStaticMarkup(React.createElement(Toast, {
      message: 'Message copied',
      closeLabel: 'Close',
      onClose: () => {},
    }));

    // Bottom centre, one line (docs/maties/design.md, section 6).
    expect(html).toContain('pointer-events-none');
    expect(html).toContain('bottom-6');
    expect(html).toContain('justify-center');
    expect(html).toContain('maties-toast');
    expect(html).not.toContain('top-1/2');
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-label="Close"');
    expect(html).not.toContain('modal-backdrop');
    expect(html).not.toContain('fixed inset-0');
  });

  test('carries at most one action', () => {
    const html = renderToStaticMarkup(React.createElement(Toast, {
      message: 'Exported',
      closeLabel: 'Close',
      actionLabel: 'Show in Folder',
      onAction: () => {},
    }));

    expect(html).toContain('Show in Folder');
    expect(html.split('<button').length - 1).toBe(1);
  });
});
