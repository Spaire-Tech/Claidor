import { createRequire } from 'node:module';

import { expect, test } from 'vitest';

const require = createRequire(import.meta.url);
const { shouldKeepBundledExtension } = require('../scripts/prune-openclaw-runtime.cjs');

test('pruneOpenClawRuntime keeps required bundled extensions', () => {
  expect(shouldKeepBundledExtension('openai')).toBe(true);
  expect(shouldKeepBundledExtension('browser')).toBe(true);
  expect(shouldKeepBundledExtension('feishu')).toBe(true);
  expect(shouldKeepBundledExtension('xiaomi')).toBe(true);
});

test('pruneOpenClawRuntime keeps the DuckDuckGo search provider', () => {
  // The one search provider Maties ships: free, no key, no account.
  // Packaging used to delete every provider, which is why `web_search`
  // was denied outright. Deleting it now would leave the tool allowed
  // with nothing behind it — a silent failure that reads as stupidity.
  expect(shouldKeepBundledExtension('duckduckgo')).toBe(true);
});

test('pruneOpenClawRuntime removes the search providers that need a key', () => {
  expect(shouldKeepBundledExtension('brave')).toBe(false);
  expect(shouldKeepBundledExtension('exa')).toBe(false);
  expect(shouldKeepBundledExtension('perplexity')).toBe(false);
});

test('pruneOpenClawRuntime removes explicitly unwanted bundled extensions', () => {
  expect(shouldKeepBundledExtension('amazon-bedrock')).toBe(false);
  expect(shouldKeepBundledExtension('amazon-bedrock-mantle')).toBe(false);
  expect(shouldKeepBundledExtension('slack')).toBe(false);
  expect(shouldKeepBundledExtension('diffs')).toBe(false);
});
