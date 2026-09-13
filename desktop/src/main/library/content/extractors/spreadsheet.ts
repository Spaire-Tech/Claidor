import fs from 'fs';
import * as XLSX from 'xlsx';

import type { LibraryTextSection } from '../../../../shared/library/chunker';
import { LibraryContentLimits } from '../../../../shared/library/contentConstants';
import {
  corruptFileError,
  isEmptyRow,
  joinRowsWithRepeatedHeader,
  type LibraryExtractionResult,
  MAX_ROWS_PER_SHEET,
} from './shared';

/**
 * Spreadsheets through the xlsx package: one section per sheet, rows as
 * tab-separated text with the header row repeated so chunks stay readable.
 */

const rowToText = (cells: readonly unknown[]): string[] => {
  const values = cells.map(cell => (cell === null || cell === undefined ? '' : String(cell)).replace(/[\t\r\n]+/g, ' ').trim());
  while (values.length > 0 && values[values.length - 1] === '') values.pop();
  return values;
};

/** Sheet rows to text; exported for the tests. */
export const sheetRowsToText = (rows: readonly (readonly unknown[])[], maxRows = MAX_ROWS_PER_SHEET): string => {
  const lines: string[] = [];
  for (const row of rows) {
    if (lines.length >= maxRows) break;
    const cells = rowToText(row);
    if (isEmptyRow(cells)) continue;
    lines.push(cells.join('\t'));
  }
  return joinRowsWithRepeatedHeader(lines);
};

export const extractSpreadsheetDocument = async (filePath: string): Promise<LibraryExtractionResult> => {
  const buffer = await fs.promises.readFile(filePath);
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, {
      type: 'buffer',
      cellHTML: false,
      cellFormula: false,
      cellStyles: false,
      cellText: true,
    });
  } catch (error) {
    throw corruptFileError(error);
  }
  const sections: LibraryTextSection[] = [];
  let chars = 0;
  for (const name of workbook.SheetNames) {
    if (chars >= LibraryContentLimits.MaxTextChars) break;
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    let rows: unknown[][];
    try {
      rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        raw: false,
        defval: '',
        blankrows: false,
      });
    } catch (error) {
      console.warn(`[LibraryWorker] sheet ${name} of ${filePath} could not be read`, error);
      continue;
    }
    const text = sheetRowsToText(rows);
    if (!text.trim()) continue;
    sections.push({ locator: { sheet: name }, text });
    chars += text.length;
  }
  return { sections, pageCount: workbook.SheetNames.length };
};
