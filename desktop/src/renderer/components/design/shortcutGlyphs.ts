import { formatShortcutForDisplay } from '../../services/shortcuts';

/**
 * A shortcut the way the design prints it in a mono pill: « ⌘K » on a Mac,
 * « Ctrl+K » elsewhere. Built on the app's own shortcut formatter so a
 * shortcut the person changed in Settings prints the same way.
 */
const MAC_GLYPHS: Array<[string, string]> = [
  ['Cmd', '⌘'],
  ['Shift', '⇧'],
  ['Option', '⌥'],
  ['Ctrl', '⌃'],
];

export const formatShortcutGlyphs = (shortcut: string | undefined, isMac: boolean): string => {
  const display = formatShortcutForDisplay(shortcut, { isMac });
  if (!display) return '';
  if (!isMac) return display;
  const tokens = display.split('+');
  const key = tokens.pop() ?? '';
  const modifiers = tokens
    .map((token) => MAC_GLYPHS.find(([name]) => name === token)?.[1] ?? token)
    .join('');
  return `${modifiers}${key}`;
};
