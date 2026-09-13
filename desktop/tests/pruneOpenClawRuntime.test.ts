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

test('pruneOpenClawRuntime still removes voice-call, imessage and elevenlabs', () => {
  // These were kept for a few hours on 12 September and it broke the
  // browser for the founder — plugin loading is all-or-nothing, so one
  // extension that cannot load takes the whole registry with it, and
  // voice-call declares dependencies our packaging never installs.
  //
  // This test is the guard, not a preference: bringing one back means
  // installing its dependencies and watching the gateway load it first.
  expect(shouldKeepBundledExtension('voice-call')).toBe(false);
  expect(shouldKeepBundledExtension('imessage')).toBe(false);
  expect(shouldKeepBundledExtension('elevenlabs')).toBe(false);
});

test('pruneOpenClawRuntime removes explicitly unwanted bundled extensions', () => {
  expect(shouldKeepBundledExtension('amazon-bedrock')).toBe(false);
  expect(shouldKeepBundledExtension('amazon-bedrock-mantle')).toBe(false);
  expect(shouldKeepBundledExtension('slack')).toBe(false);
  expect(shouldKeepBundledExtension('diffs')).toBe(false);
});
