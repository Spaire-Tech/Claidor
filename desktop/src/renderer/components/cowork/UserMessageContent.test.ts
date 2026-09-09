import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';

import UserMessageContent from './UserMessageContent';

test('renders numbered user input as plain text instead of a markdown list', () => {
  const content = 'Contents include:\n1. Project\n2. Core';
  const html = renderToStaticMarkup(React.createElement(UserMessageContent, { content }));

  expect(html).not.toContain('<ol');
  expect(html).toContain('Contents include:');
  expect(html).toContain('1. Project');
  expect(html).toContain('2. Core');
});
