import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';

import SelectedTextActionToolbar from './SelectedTextActionToolbar';

test('renders add-to-chat and side-chat actions in one selection toolbar', () => {
  const html = renderToStaticMarkup(React.createElement(SelectedTextActionToolbar, {
    left: 120,
    top: 80,
    onAddToChat: () => {},
    onAskInSideChat: () => {},
  }));

  expect(html).toContain('data-cowork-selected-text-action');
  expect(html).toContain('Add to chat');
  expect(html).toContain('Ask in side chat');
  expect(html.match(/<button/g)).toHaveLength(2);
});
