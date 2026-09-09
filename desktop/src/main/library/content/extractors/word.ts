import mammoth from 'mammoth';

import type { LibraryTextSection } from '../../../../shared/library/chunker';
import { corruptFileError, decodeXmlEntities, type LibraryExtractionResult } from './shared';

/**
 * Word documents through mammoth. `extractRawText` loses the headings, so
 * the document is converted to HTML and walked with a small state machine:
 * h1–h6 open a new section carrying the heading as locator; paragraphs,
 * list items and table rows become lines; table cells are tab-separated.
 */

const HTML_TOKEN = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)[^>]*>|([^<]+)/g;
const HEADING_TAG = /^h[1-6]$/;
const MAX_HEADING_CHARS = 200;

interface WordSectionBuilder {
  heading: string | null;
  text: string;
}

/** Splits mammoth's HTML into sections. Exported for the tests. */
export const sectionsFromWordHtml = (html: string): LibraryTextSection[] => {
  const sections: LibraryTextSection[] = [];
  let current: WordSectionBuilder = { heading: null, text: '' };
  let headingBuffer: string | null = null;

  const flush = (): void => {
    if (current.text.trim()) {
      sections.push({
        locator: current.heading ? { heading: current.heading } : {},
        text: current.text,
      });
    }
  };

  for (const match of html.matchAll(HTML_TOKEN)) {
    const [, closing, rawTag, textNode] = match;
    if (textNode !== undefined) {
      const text = decodeXmlEntities(textNode.replace(/[\r\n]+/g, ' '));
      if (headingBuffer !== null) headingBuffer += text;
      else current.text += text;
      continue;
    }
    const tag = rawTag.toLowerCase();
    if (HEADING_TAG.test(tag)) {
      if (!closing) {
        headingBuffer = '';
      } else if (headingBuffer !== null) {
        const heading = headingBuffer.replace(/\s+/g, ' ').trim();
        headingBuffer = null;
        flush();
        current = {
          heading: heading ? heading.slice(0, MAX_HEADING_CHARS) : null,
          text: heading ? `${heading}\n` : '',
        };
      }
      continue;
    }
    if (headingBuffer !== null) continue;
    if (closing) {
      if (tag === 'p' || tag === 'li' || tag === 'tr' || tag === 'div') current.text += '\n';
      else if (tag === 'td' || tag === 'th') current.text += '\t';
    } else if (tag === 'br') {
      current.text += '\n';
    }
  }
  if (headingBuffer !== null) current.text += headingBuffer;
  flush();
  return sections;
};

export const extractWordDocument = async (filePath: string): Promise<LibraryExtractionResult> => {
  let html: string;
  try {
    const result = await mammoth.convertToHtml({ path: filePath }, { ignoreEmptyParagraphs: true });
    html = result.value;
  } catch (error) {
    throw corruptFileError(error);
  }
  return { sections: sectionsFromWordHtml(html), pageCount: 0 };
};
