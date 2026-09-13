import type { Element, Parents, Root, RootContent, Text } from 'hast';

/**
 * The stream, inside rendered markdown (docs/maties/design.md, section 4).
 *
 * `Words` splits a plain string; an answer is markdown, so the split has to
 * happen after the markdown is parsed. This rehype plugin walks the tree and
 * wraps every word of every text node in `<span class="maties-word">`,
 * keeping whitespace as text so line breaks and spacing survive. Inside a
 * `maties-stream-live` wrapper each span animates once when it mounts.
 *
 * react-markdown keys siblings by tag name and position (`span-0`,
 * `span-1`, ...), so as the revealed prefix grows the spans already on
 * screen keep their keys and only the new words mount. A word that is still
 * arriving (« hel » then « hello ») keeps its span and grows in place.
 *
 * Code blocks, inline code, tables and math reveal whole, not word by word:
 * their text is the computer's, and a table that fades in cell by cell
 * reads as broken.
 */
export const STREAM_WORD_CLASS = 'maties-word';

const WHOLE_ELEMENTS = new Set(['pre', 'code', 'table', 'kbd', 'samp', 'svg', 'math', 'style', 'script']);
const WHOLE_CLASSES = ['katex', 'maties-file-chip'];

const hasWholeClass = (node: Element): boolean => {
  const className = node.properties?.className;
  const classes = Array.isArray(className) ? className.map(String) : typeof className === 'string' ? [className] : [];
  return classes.some((name) => WHOLE_CLASSES.some((whole) => name === whole || name.startsWith(`${whole}-`)));
};

/** True for a subtree that reveals as one piece. */
export const revealsWhole = (node: Element): boolean => WHOLE_ELEMENTS.has(node.tagName) || hasWholeClass(node);

/** Split text into alternating whitespace and word runs, dropping empties. */
export const splitWords = (text: string): string[] => text.split(/(\s+)/).filter((part) => part !== '');

const isWhitespace = (part: string): boolean => /^\s+$/.test(part);

export const wrapTextWords = (text: Text): RootContent[] => {
  const parts = splitWords(text.value);
  if (parts.length === 0) return [];
  if (parts.length === 1 && isWhitespace(parts[0])) return [text];
  return parts.map((part): RootContent => (
    isWhitespace(part)
      ? { type: 'text', value: part }
      : {
          type: 'element',
          tagName: 'span',
          properties: { className: [STREAM_WORD_CLASS] },
          children: [{ type: 'text', value: part }],
        }
  ));
};

const visit = (parent: Parents): void => {
  const next: RootContent[] = [];
  for (const child of parent.children) {
    if (child.type === 'text') {
      next.push(...wrapTextWords(child));
      continue;
    }
    if (child.type === 'element' && !revealsWhole(child)) {
      visit(child);
    }
    next.push(child);
  }
  parent.children = next;
};

/** A unified/rehype plugin: `rehypePlugins={[rehypeStreamWords]}`. */
const rehypeStreamWords = () => (tree: Root): void => {
  visit(tree);
};

export default rehypeStreamWords;
