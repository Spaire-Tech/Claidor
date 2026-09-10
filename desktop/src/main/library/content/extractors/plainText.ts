import type { LibraryTextSection } from '../../../../shared/library/chunker';
import { LibraryContentLimits } from '../../../../shared/library/contentConstants';
import { joinRowsWithRepeatedHeader, type LibraryExtractionResult, readUtf8File } from './shared';

/** Text, Markdown and CSV are read as UTF-8 as they are. */

const ATX_HEADING = /^ {0,3}(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/;
const FENCE = /^ {0,3}(```|~~~)/;
const MAX_HEADING_CHARS = 200;

const capText = (text: string): string => (
  text.length > LibraryContentLimits.MaxTextChars ? text.slice(0, LibraryContentLimits.MaxTextChars) : text
);

/** Splits Markdown at ATX headings; the heading line stays in its section. Exported for the tests. */
export const sectionsFromMarkdown = (markdown: string): LibraryTextSection[] => {
  const sections: LibraryTextSection[] = [];
  let heading: string | null = null;
  let lines: string[] = [];
  let inFence = false;

  const flush = (): void => {
    const text = lines.join('\n');
    if (text.trim()) sections.push({ locator: heading ? { heading } : {}, text });
    lines = [];
  };

  for (const line of markdown.split(/\r\n?|\n/)) {
    if (FENCE.test(line)) inFence = !inFence;
    const match = inFence ? null : line.match(ATX_HEADING);
    if (match) {
      flush();
      heading = match[2].trim().slice(0, MAX_HEADING_CHARS);
      lines.push(heading);
      continue;
    }
    lines.push(line);
  }
  flush();
  return sections;
};

/** CSV rows with the header repeated, like a sheet. Exported for the tests. */
export const textFromCsv = (csv: string): string => {
  const rows = csv.split(/\r\n?|\n/).filter(line => line.trim().length > 0);
  return joinRowsWithRepeatedHeader(rows);
};

export const extractTextDocument = async (filePath: string): Promise<LibraryExtractionResult> => {
  const text = capText(await readUtf8File(filePath));
  return { sections: text.trim() ? [{ locator: {}, text }] : [], pageCount: 0 };
};

export const extractMarkdownDocument = async (filePath: string): Promise<LibraryExtractionResult> => {
  const text = capText(await readUtf8File(filePath));
  return { sections: sectionsFromMarkdown(text), pageCount: 0 };
};

export const extractCsvDocument = async (filePath: string): Promise<LibraryExtractionResult> => {
  const text = textFromCsv(capText(await readUtf8File(filePath)));
  return { sections: text.trim() ? [{ locator: {}, text }] : [], pageCount: 0 };
};
