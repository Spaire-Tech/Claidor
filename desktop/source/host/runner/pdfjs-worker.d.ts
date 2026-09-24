// pdfjs-dist ships types for its display entry (legacy/build/pdf.d.mts) and
// none for the worker script. The extractor imports the worker for its side
// effect alone: evaluating it sets `globalThis.pdfjsWorker`, which pdf.js's
// PDFWorker reads before it would `import()` a worker file that a single-file
// bundle cannot carry.
declare module "pdfjs-dist/legacy/build/pdf.worker.mjs" {
  export const WorkerMessageHandler: unknown;
}
