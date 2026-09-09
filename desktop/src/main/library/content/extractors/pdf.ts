import fs from 'fs';
import { createRequire } from 'module';
import path from 'path';

import type { LibraryTextSection } from '../../../../shared/library/chunker';
import { LibraryContentLimits } from '../../../../shared/library/contentConstants';
import { corruptFileError, type LibraryExtractionResult } from './shared';

/**
 * PDF through pdf.js's Node build, one section per page. The legacy build is
 * loaded on demand: it is an ES module that resolves its own worker script
 * next to itself, so it stays outside the worker bundle.
 */

type PdfJsModule = typeof import('pdfjs-dist/legacy/build/pdf.mjs');

interface PdfTextItem {
  str: string;
  hasEOL: boolean;
  transform: number[];
  width: number;
}

const PDFJS_ENTRY = 'pdfjs-dist/legacy/build/pdf.mjs';
/** Vertical movement (in PDF units) that counts as a new line. */
const LINE_BREAK_Y_DELTA = 1;
/** Horizontal gap (in PDF units) that counts as a missing space. */
const WORD_GAP_X_DELTA = 1;

let pdfJsPromise: Promise<PdfJsModule> | null = null;
let pdfJsAssetRoot: string | null = null;

const loadPdfJs = (): Promise<PdfJsModule> => {
  if (!pdfJsPromise) {
    pdfJsPromise = import(PDFJS_ENTRY).catch((error: unknown) => {
      pdfJsPromise = null;
      throw error;
    });
  }
  return pdfJsPromise;
};

/** node_modules/pdfjs-dist, for the standard fonts and CMaps it ships. */
const resolvePdfJsAssetRoot = (): string | null => {
  if (pdfJsAssetRoot !== null) return pdfJsAssetRoot || null;
  try {
    const entry = createRequire(__filename).resolve(PDFJS_ENTRY);
    pdfJsAssetRoot = path.resolve(path.dirname(entry), '..', '..');
  } catch {
    pdfJsAssetRoot = '';
  }
  return pdfJsAssetRoot || null;
};

const isPdfTextItem = (item: unknown): item is PdfTextItem => (
  typeof item === 'object' && item !== null && typeof (item as PdfTextItem).str === 'string'
);

/** Joins text items into lines using pdf.js's EOL flag and the item positions. */
export const joinPdfTextItems = (items: readonly unknown[]): string => {
  let text = '';
  let lastY: number | null = null;
  let lastEndX: number | null = null;
  for (const item of items) {
    if (!isPdfTextItem(item)) continue;
    const x = item.transform[4] ?? 0;
    const y = item.transform[5] ?? 0;
    const endsLine = text.endsWith('\n');
    if (lastY !== null && !endsLine && Math.abs(y - lastY) > LINE_BREAK_Y_DELTA) {
      text += '\n';
    } else if (
      lastEndX !== null && !endsLine && text.length > 0
      && x - lastEndX > WORD_GAP_X_DELTA
      && !/\s$/.test(text) && !/^\s/.test(item.str)
    ) {
      text += ' ';
    }
    text += item.str;
    if (item.hasEOL) text += '\n';
    lastY = y;
    lastEndX = x + (item.width ?? 0);
  }
  return text;
};

const isPasswordError = (error: unknown): boolean => (
  typeof error === 'object' && error !== null
  && (error as { name?: string }).name === 'PasswordException'
);

const isInvalidPdfError = (error: unknown): boolean => {
  const name = typeof error === 'object' && error !== null ? (error as { name?: string }).name : undefined;
  return name === 'InvalidPDFException' || name === 'FormatError' || name === 'UnknownErrorException';
};

export const extractPdfDocument = async (filePath: string): Promise<LibraryExtractionResult> => {
  const pdfjs = await loadPdfJs();
  const data = new Uint8Array(await fs.promises.readFile(filePath));
  const assetRoot = resolvePdfJsAssetRoot();
  const loadingTask = pdfjs.getDocument({
    data,
    useSystemFonts: true,
    isEvalSupported: false,
    disableFontFace: true,
    verbosity: 0,
    ...(assetRoot ? {
      standardFontDataUrl: `${path.join(assetRoot, 'standard_fonts')}${path.sep}`,
      cMapUrl: `${path.join(assetRoot, 'cmaps')}${path.sep}`,
      cMapPacked: true,
    } : {}),
  });
  let document: Awaited<typeof loadingTask.promise>;
  try {
    document = await loadingTask.promise;
  } catch (error) {
    // A password-protected file has no text we can read; the caller records « no text ».
    if (isPasswordError(error)) return { sections: [], pageCount: 0 };
    if (isInvalidPdfError(error)) throw corruptFileError(error);
    throw error;
  }
  try {
    const sections: LibraryTextSection[] = [];
    const pageCount = document.numPages;
    let chars = 0;
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      if (chars >= LibraryContentLimits.MaxTextChars) break;
      let text = '';
      try {
        const page = await document.getPage(pageNumber);
        try {
          const content = await page.getTextContent();
          text = joinPdfTextItems(content.items);
        } finally {
          page.cleanup();
        }
      } catch (error) {
        // One broken page does not lose the rest of the document.
        console.warn(`[LibraryWorker] PDF page ${pageNumber} of ${filePath} could not be read`, error);
        continue;
      }
      if (!text.trim()) continue;
      sections.push({ locator: { page: pageNumber }, text });
      chars += text.length;
    }
    return { sections, pageCount };
  } finally {
    await loadingTask.destroy().catch((): void => undefined);
  }
};
