import type { Element, Parents, Root, RootContent, Text } from 'hast';

/**
 * A file the answer names becomes a chip (docs/maties/design.md, section
 * 4: « see budget.xlsx, sheet Q3 »). Kept simple on purpose: only an
 * absolute path written in the text, or the bare name of a file the turn
 * touched, becomes a link; the markdown `a` renderer then draws the chip
 * with the file's icon. Nothing is guessed from a name the turn never saw.
 */
export const FILE_CHIP_CLASS = 'maties-file-chip';

const SKIP_ELEMENTS = new Set(['a', 'pre', 'code', 'kbd', 'samp', 'script', 'style', 'svg', 'math']);
const POSIX_PATH = String.raw`/(?:[\w.\-@~+]+/)+[\w.\-@~+ ]*[\w\-@~+]\.[A-Za-z0-9]{1,6}`;
const WINDOWS_PATH = String.raw`[A-Za-z]:\\(?:[\w.\-@~+ ]+\\)*[\w.\-@~+ ]*[\w\-@~+]\.[A-Za-z0-9]{1,6}`;

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const basenameOf = (filePath: string): string => {
  const normalized = filePath.replace(/\\/g, '/');
  const lastSlash = normalized.lastIndexOf('/');
  return lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized;
};

const toFileHref = (filePath: string): string => {
  const normalized = filePath.replace(/\\/g, '/');
  return /^[A-Za-z]:/.test(filePath) ? `file:///${normalized}` : `file://${normalized}`;
};

export interface FileChipMatch {
  /** Where the match starts and ends in the text. */
  start: number;
  end: number;
  /** The text as written. */
  text: string;
  /** The path the chip opens. */
  path: string;
}

/**
 * Build the matcher for a turn: absolute paths anywhere, plus the exact
 * names of `knownFiles` as whole words. Longest names first, so
 * « budget-final.xlsx » is not cut into « final.xlsx ».
 */
export const buildFileChipMatcher = (knownFiles: string[]) => {
  const byName = new Map<string, string>();
  for (const filePath of knownFiles) {
    const name = basenameOf(filePath.trim());
    if (name && name.includes('.') && !byName.has(name)) byName.set(name, filePath.trim());
  }
  const names = [...byName.keys()].sort((a, b) => b.length - a.length).map(escapeRegExp);
  const alternatives = [POSIX_PATH, WINDOWS_PATH, ...(names.length > 0 ? [`(?<![\\w./\\\\-])(?:${names.join('|')})(?![\\w/\\\\-])`] : [])];
  const pattern = new RegExp(`(?:${alternatives.join('|')})`, 'g');

  return (text: string): FileChipMatch[] => {
    const matches: FileChipMatch[] = [];
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      let value = match[0];
      // A sentence's punctuation is not part of the name.
      while (/[.,;:!?)»"']$/.test(value) && !byName.has(value)) value = value.slice(0, -1);
      if (!value) continue;
      const path = byName.get(value) ?? value;
      matches.push({ start: match.index, end: match.index + value.length, text: value, path });
    }
    return matches;
  };
};

const chipNode = (match: FileChipMatch): Element => ({
  type: 'element',
  tagName: 'a',
  properties: { href: toFileHref(match.path), className: [FILE_CHIP_CLASS], title: match.path },
  children: [{ type: 'text', value: match.text }],
});

export const splitTextIntoChips = (text: Text, matcher: (value: string) => FileChipMatch[]): RootContent[] => {
  const matches = matcher(text.value);
  if (matches.length === 0) return [text];
  const out: RootContent[] = [];
  let cursor = 0;
  for (const match of matches) {
    if (match.start > cursor) out.push({ type: 'text', value: text.value.slice(cursor, match.start) });
    out.push(chipNode(match));
    cursor = match.end;
  }
  if (cursor < text.value.length) out.push({ type: 'text', value: text.value.slice(cursor) });
  return out;
};

const visit = (parent: Parents, matcher: (value: string) => FileChipMatch[]): void => {
  const next: RootContent[] = [];
  for (const child of parent.children) {
    if (child.type === 'text') {
      next.push(...splitTextIntoChips(child, matcher));
      continue;
    }
    if (child.type === 'element' && !SKIP_ELEMENTS.has(child.tagName)) {
      visit(child, matcher);
    }
    next.push(child);
  }
  parent.children = next;
};

/** A unified/rehype plugin: `rehypePlugins={[[rehypeFileChips, { knownFiles }]]}`. */
const rehypeFileChips = (options: { knownFiles?: string[] } = {}) => {
  const matcher = buildFileChipMatcher(options.knownFiles ?? []);
  return (tree: Root): void => {
    visit(tree, matcher);
  };
};

export default rehypeFileChips;
