import fs from 'fs';

import type { LibraryTextSection } from '../../../../shared/library/chunker';
import { LibraryContentLimits } from '../../../../shared/library/contentConstants';

/** What an extractor returns: the document as sections, each with its locator. */
export interface LibraryExtractionResult {
  sections: LibraryTextSection[];
  /** Pages, sheets or slides; 0 when the kind has none. */
  pageCount: number;
}

/** Rows between two repeats of the header row in tabular text. */
export const HEADER_REPEAT_EVERY_ROWS = 40;
/** Rows read per sheet before the rest is dropped. */
export const MAX_ROWS_PER_SHEET = 5_000;

/**
 * Refuses files over the size limit before anything is read. The message
 * starts with « too large » so the worker can mark the failure permanent.
 */
export const assertLibraryFileSize = async (filePath: string): Promise<number> => {
  const stat = await fs.promises.stat(filePath);
  if (stat.size > LibraryContentLimits.MaxFileBytes) {
    throw new Error(
      `too large: ${stat.size} bytes, limit ${LibraryContentLimits.MaxFileBytes}`,
    );
  }
  return stat.size;
};

/** Wraps a parser failure so the worker can tell corrupt content from a passing error. */
export const corruptFileError = (error: unknown): Error => {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(`corrupt file: ${message}`);
};

export const stripByteOrderMark = (text: string): string => (
  text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
);

export const readUtf8File = async (filePath: string): Promise<string> => (
  stripByteOrderMark(await fs.promises.readFile(filePath, 'utf8'))
);

const XML_ENTITY = /&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos|nbsp);/g;

/** Decodes the entities XML and HTML share; anything else is left as it is. */
export const decodeXmlEntities = (text: string): string => text.replace(XML_ENTITY, (match, entity: string) => {
  switch (entity) {
    case 'amp': return '&';
    case 'lt': return '<';
    case 'gt': return '>';
    case 'quot': return '"';
    case 'apos': return '\'';
    case 'nbsp': return ' ';
    default: {
      const code = entity[1] === 'x' || entity[1] === 'X'
        ? parseInt(entity.slice(2), 16)
        : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
  }
});

/**
 * Joins tabular rows into text, repeating the header row every
 * HEADER_REPEAT_EVERY_ROWS rows so every chunk stays self-describing.
 * The first row is the header; empty rows are expected to be gone already.
 */
export const joinRowsWithRepeatedHeader = (rows: string[], every = HEADER_REPEAT_EVERY_ROWS): string => {
  if (rows.length === 0) return '';
  const [header, ...body] = rows;
  const lines: string[] = [header];
  body.forEach((row, index) => {
    if (index > 0 && index % every === 0) {
      lines.push('', header);
    }
    lines.push(row);
  });
  return lines.join('\n');
};

/** True when a tab-separated row carries something other than whitespace. */
export const isEmptyRow = (cells: readonly string[]): boolean => cells.every(cell => cell.trim().length === 0);

/**
 * Drops empty sections and cuts the whole to MaxTextChars, so a huge file
 * never produces more than the chunk budget allows.
 */
export const boundSections = (
  sections: LibraryTextSection[],
  maxChars: number = LibraryContentLimits.MaxTextChars,
): LibraryTextSection[] => {
  const kept: LibraryTextSection[] = [];
  let used = 0;
  for (const section of sections) {
    if (used >= maxChars) break;
    const text = section.text.trim();
    if (!text) continue;
    const room = maxChars - used;
    const cut = text.length > room ? text.slice(0, room) : text;
    kept.push({ locator: { ...section.locator }, text: cut });
    used += cut.length;
  }
  return kept;
};

export const countSectionChars = (sections: readonly LibraryTextSection[]): number => (
  sections.reduce((total, section) => total + section.text.length, 0)
);
