import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';

import {
  CONVERSATION_SEARCH_MATCH_LIMIT,
  ConversationSearchErrorReason,
  ConversationSearchStatus,
} from './conversationSearch';
import CoworkConversationSearch from './CoworkConversationSearch';

test('hides result navigation before a query is entered', () => {
  const html = renderToStaticMarkup(React.createElement(CoworkConversationSearch, {
    query: '',
    status: ConversationSearchStatus.Ready,
    activeMatchIndex: -1,
    resultCount: 0,
    isResultLimitReached: false,
    focusRequestKey: 1,
    onQueryChange: () => undefined,
    onNavigate: () => undefined,
    onClose: () => undefined,
  }));

  expect(html).not.toContain('border-t');
  expect(html).not.toContain('Previous result');
  expect(html).not.toContain('Next result');
});

test('shows loading status without navigation before a query is entered', () => {
  const html = renderToStaticMarkup(React.createElement(CoworkConversationSearch, {
    query: '',
    status: ConversationSearchStatus.Loading,
    activeMatchIndex: -1,
    resultCount: 0,
    isResultLimitReached: false,
    focusRequestKey: 1,
    onQueryChange: () => undefined,
    onNavigate: () => undefined,
    onClose: () => undefined,
  }));

  expect(html).toContain('border-t');
  expect(html).toContain('Searching');
  expect(html).not.toContain('Previous result');
  expect(html).not.toContain('Next result');
});

test('shows a specific message when the conversation exceeds the safe search budget', () => {
  const html = renderToStaticMarkup(React.createElement(CoworkConversationSearch, {
    query: 'needle',
    status: ConversationSearchStatus.Error,
    errorReason: ConversationSearchErrorReason.HistoryTooLarge,
    activeMatchIndex: -1,
    resultCount: 0,
    isResultLimitReached: false,
    focusRequestKey: 1,
    onQueryChange: () => undefined,
    onNavigate: () => undefined,
    onClose: () => undefined,
  }));

  expect(html).toContain('too large to search completely');
  expect(html).not.toContain('Unable to search this conversation');
  expect(html).not.toContain('Previous result');
  expect(html).not.toContain('Next result');
});

test('renders the Codex-style two-row search surface and result count', () => {
  const html = renderToStaticMarkup(React.createElement(CoworkConversationSearch, {
    query: 'needle',
    status: ConversationSearchStatus.Ready,
    activeMatchIndex: 1,
    resultCount: 7,
    isResultLimitReached: false,
    focusRequestKey: 1,
    onQueryChange: () => undefined,
    onNavigate: () => undefined,
    onClose: () => undefined,
  }));

  expect(html).toContain('data-cowork-conversation-search="true"');
  expect(html).toContain('viewBox="0 0 34 34"');
  expect(html).toContain('value="needle"');
  expect(html).toContain('2 / 7 results');
  expect(html).toContain('border-t');
  expect(html).toContain('bg-surface-overlay');
  expect(html).toContain('rounded-3xl');
  expect(html).toContain('rounded-full');
});

test('keeps a 240px design minimum without overflowing narrower viewports', () => {
  const html = renderToStaticMarkup(React.createElement(CoworkConversationSearch, {
    query: '',
    status: ConversationSearchStatus.Ready,
    activeMatchIndex: -1,
    resultCount: 0,
    isResultLimitReached: false,
    focusRequestKey: 1,
    onQueryChange: () => undefined,
    onNavigate: () => undefined,
    onClose: () => undefined,
  }));
  const rootClassName = /^<div class="([^"]+)"/.exec(html)?.[1] ?? '';

  expect(rootClassName.split(' ')).toContain('w-[340px]');
  expect(rootClassName.split(' ')).toContain('min-w-[min(240px,calc(100vw_-_24px))]');
  expect(rootClassName.split(' ')).toContain('max-w-[calc(100vw_-_24px)]');
  expect(rootClassName.split(' ')).not.toContain('min-w-0');
});

test('disables navigation buttons when the query has no results', () => {
  const html = renderToStaticMarkup(React.createElement(CoworkConversationSearch, {
    query: 'missing',
    status: ConversationSearchStatus.Ready,
    activeMatchIndex: -1,
    resultCount: 0,
    isResultLimitReached: false,
    focusRequestKey: 1,
    onQueryChange: () => undefined,
    onNavigate: () => undefined,
    onClose: () => undefined,
  }));

  expect(html.match(/disabled=""/g)).toHaveLength(2);
  expect(html).toContain('0 / 0 results');
});

test('marks a capped result count', () => {
  const html = renderToStaticMarkup(React.createElement(CoworkConversationSearch, {
    query: 'x',
    status: ConversationSearchStatus.Ready,
    activeMatchIndex: 0,
    resultCount: CONVERSATION_SEARCH_MATCH_LIMIT,
    isResultLimitReached: true,
    focusRequestKey: 1,
    onQueryChange: () => undefined,
    onNavigate: () => undefined,
    onClose: () => undefined,
  }));

  expect(html).toContain(`1 / ${CONVERSATION_SEARCH_MATCH_LIMIT}+ results`);
});
