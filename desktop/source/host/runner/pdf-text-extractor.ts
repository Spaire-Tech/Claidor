/**
 * The PDF text extractor the Read tool asks for.
 *
 * Grok Bot's host ran this in a Piscina worker: `resolveWorkerLocation(
 * __import_meta_url, "pdf-worker")`, `new Piscina({ filename:
 * ./pdf-worker.js })`, input `{ bytes }`, output `{ text }` (host-main.cjs
 * 578037-578056, anchored by scripts/host-production-activation.mjs). The
 * worker file itself was never in either shipped carrier, so the producer
 * had nothing to run and every PDF read threw "Read PDF worker is not
 * bound" (packages/agent/tools/core/read/read.ts). This module is the
 * replacement: the same signature, `(bytes) => Promise<string>`, extracted
 * in-process with pdfjs-dist instead of in a worker pool. A worker pool
 * would keep a large scan from stalling the loop's thread; a byte cap and a
 * page cap bound that cost instead, without rebuilding the pool.
 *
 * pdfjs-dist is bundled into host-main.cjs (it is not an external of
 * scripts/build-caisra.mjs or scripts/caisra-ignition-activation.mjs) because
 * the box receives that one file alone, bind-mounted at
 * /home/box/sand-host/host-main.cjs (electron-main/box/
 * local-docker-host-connector.ts); nothing installs node_modules there.
 *
 * pdf.js is loaded on the first PDF read, not at host start: its two modules
 * are about 3 MB of code, and on Node the display module tries to require
 * `@napi-rs/canvas` at load and prints "Cannot load / Cannot polyfill"
 * warnings when it is absent, as it is in the box. Those lines are true
 * (nothing here renders) and appear once, in the box's host log, the first
 * time a PDF is read. The side-effect import of the worker script sets
 * `globalThis.pdfjsWorker`, which pdf.js's PDFWorker reads before it would
 * `import()` a worker file that a single-file bundle cannot carry, so the
 * fake (same-thread) worker is used.
 */
import type { TextItem, TextMarkedContent } from "pdfjs-dist/types/src/display/api.js";

import type { PdfTextExtractor } from "../../packages/agent/tools/core/read/read.js";

export interface PdfTextExtractionLimits {
  /** Largest PDF, in bytes, the extractor will open. */
  readonly maxBytes: number;
  /** Most pages whose text is extracted; later pages are counted, not read. */
  readonly maxPages: number;
}

export const PDF_TEXT_EXTRACTION_MAX_BYTES = 50 * 1024 * 1024;
export const PDF_TEXT_EXTRACTION_MAX_PAGES = 500;

export const DEFAULT_PDF_TEXT_EXTRACTION_LIMITS: PdfTextExtractionLimits = Object.freeze({
  maxBytes: PDF_TEXT_EXTRACTION_MAX_BYTES,
  maxPages: PDF_TEXT_EXTRACTION_MAX_PAGES,
});

export class PdfTooLargeError extends Error {
  constructor(readonly byteLength: number, readonly maxBytes: number) {
    super(`PDF is ${byteLength} bytes; the Read tool extracts text from PDFs up to ${maxBytes} bytes`);
    this.name = "PdfTooLargeError";
  }
}

type PdfJs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

let pdfJsLoading: Promise<PdfJs> | undefined;

/**
 * Loads pdf.js once. The order is the point: the DOMMatrix polyfill has to
 * be on globalThis before the display module evaluates, and the worker
 * script has to have set `globalThis.pdfjsWorker` before the first document
 * is opened.
 */
function loadPdfJs(): Promise<PdfJs> {
  pdfJsLoading ??= (async () => {
    await import("./pdf-dom-polyfill.js");
    await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
    return await import("pdfjs-dist/legacy/build/pdf.mjs");
  })();
  return pdfJsLoading;
}

function isTextItem(item: TextItem | TextMarkedContent): item is TextItem {
  return typeof (item as TextItem).str === "string";
}

/**
 * Joins pdf.js text items into lines. pdf.js marks line ends with `hasEOL`
 * for text it laid out itself; when it does not, a change of baseline
 * (transform[5]) between two items starts a new line, and items on one line
 * are separated by a space unless the previous one already ends in one.
 */
export function joinPdfTextItems(items: ReadonlyArray<TextItem | TextMarkedContent>): string {
  let text = "";
  let previous: TextItem | undefined;
  for (const item of items) {
    if (!isTextItem(item)) continue;
    const baseline: unknown = item.transform[5];
    if (previous !== undefined && !previous.hasEOL && item.str !== "") {
      const previousBaseline: unknown = previous.transform[5];
      const sameLine = typeof baseline !== "number" || typeof previousBaseline !== "number" || Math.abs(baseline - previousBaseline) < 1;
      if (!sameLine) text += "\n";
      else if (text !== "" && !/\s$/.test(text) && !/^\s/.test(item.str)) text += " ";
    }
    text += item.str;
    if (item.hasEOL) text += "\n";
    previous = item;
  }
  return text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Extracts the text of every page of a PDF, page by page, within the limits. */
export async function extractPdfText(
  bytes: Uint8Array,
  limits: PdfTextExtractionLimits = DEFAULT_PDF_TEXT_EXTRACTION_LIMITS,
): Promise<string> {
  if (bytes.byteLength > limits.maxBytes) throw new PdfTooLargeError(bytes.byteLength, limits.maxBytes);
  const { getDocument, VerbosityLevel } = await loadPdfJs();
  // pdf.js takes ownership of the buffer it is handed (it may transfer or
  // detach it); the Read tool still holds `bytes`, so hand pdf.js a copy.
  const task = getDocument({
    data: new Uint8Array(bytes),
    // No fonts are drawn and nothing is fetched: the box has no font files
    // and no network beyond the model proxy. Missing standard-font data only
    // matters for rendering; text content does not need it.
    disableFontFace: true,
    useSystemFonts: false,
    useWorkerFetch: false,
    isEvalSupported: false,
    stopAtErrors: false,
    verbosity: VerbosityLevel.ERRORS,
  });
  const document = await task.promise;
  try {
    const pageCount = Math.min(document.numPages, limits.maxPages);
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      try {
        const content = await page.getTextContent();
        pages.push(joinPdfTextItems(content.items));
      } finally {
        page.cleanup();
      }
    }
    if (document.numPages > limits.maxPages) {
      pages.push(`[${document.numPages - limits.maxPages} more pages not extracted: the Read tool extracts the first ${limits.maxPages} pages of a PDF]`);
    }
    return pages.join("\n\n");
  } finally {
    await document.destroy();
  }
}

/** The extractor bound into both Read tools by host-runner-composition.ts. */
export const productionPdfTextExtractor: PdfTextExtractor = bytes => extractPdfText(bytes);
