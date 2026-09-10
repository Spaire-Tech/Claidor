import { expect, test } from 'vitest';

import { formatShortcutGlyphs } from './shortcutGlyphs';

test('formatShortcutGlyphs prints Mac modifiers as glyphs', () => {
  expect(formatShortcutGlyphs('CommandOrControl+K', true)).toBe('⌘K');
  expect(formatShortcutGlyphs('Ctrl+Shift+A', true)).toBe('⌃⇧A');
  expect(formatShortcutGlyphs('CmdOrCtrl+Shift+A', true)).toBe('⌘⇧A');
});

test('formatShortcutGlyphs keeps words elsewhere', () => {
  expect(formatShortcutGlyphs('CommandOrControl+K', false)).toBe('Ctrl+K');
  expect(formatShortcutGlyphs('Ctrl+F', false)).toBe('Ctrl+F');
});

test('formatShortcutGlyphs is empty without a shortcut', () => {
  expect(formatShortcutGlyphs(undefined, true)).toBe('');
  expect(formatShortcutGlyphs('', false)).toBe('');
});
