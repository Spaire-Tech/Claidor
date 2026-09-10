import { LibraryDocumentKind } from '../../../../shared/library/contentConstants';
import { extractPdfDocument } from './pdf';
import { extractCsvDocument, extractMarkdownDocument, extractTextDocument } from './plainText';
import { assertLibraryFileSize, boundSections, type LibraryExtractionResult } from './shared';
import { extractSlidesDocument } from './slides';
import { extractSpreadsheetDocument } from './spreadsheet';
import { extractWordDocument } from './word';

export type { LibraryExtractionResult } from './shared';

const EXTRACTORS: Record<LibraryDocumentKind, (filePath: string) => Promise<LibraryExtractionResult>> = {
  [LibraryDocumentKind.Word]: extractWordDocument,
  [LibraryDocumentKind.Pdf]: extractPdfDocument,
  [LibraryDocumentKind.Spreadsheet]: extractSpreadsheetDocument,
  [LibraryDocumentKind.Slides]: extractSlidesDocument,
  [LibraryDocumentKind.Text]: extractTextDocument,
  [LibraryDocumentKind.Markdown]: extractMarkdownDocument,
  [LibraryDocumentKind.Csv]: extractCsvDocument,
};

/**
 * Reads one document into sections with locators. Throws « too large » before
 * reading an oversized file and « unsupported » for an unknown kind; odd
 * content yields whatever could be read, possibly nothing.
 */
export const extractLibraryDocument = async (
  filePath: string,
  kind: LibraryDocumentKind,
): Promise<LibraryExtractionResult> => {
  const extractor = EXTRACTORS[kind];
  if (!extractor) throw new Error(`unsupported document kind: ${String(kind)}`);
  await assertLibraryFileSize(filePath);
  const result = await extractor(filePath);
  return { sections: boundSections(result.sections), pageCount: result.pageCount };
};
