// The Read tool's PDF branch: "Read PDF worker is not bound" was thrown for
// every PDF because no composition passed a pdfTextExtractor
// (docs/product/reconstruction-gaps-2026-09-24.md, item 4). These tests run
// the in-process pdf.js extractor on a PDF written by hand, and check that
// both Read inputs in host-runner-composition.ts name it and that the host
// bundle carries pdf.js (the box gets host-main.cjs alone).
import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

import { assemblePdfTextExtractionBinding, pdfTextExtractionBindingSpec } from "../scripts/host-production-activation.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporaryRoots = [];

after(async () => {
  for (const root of temporaryRoots) await rm(root, { recursive: true, force: true });
});

async function temporary(name) {
  const root = await mkdtemp(path.join(os.tmpdir(), `caisra-${name}-`));
  temporaryRoots.push(root);
  return root;
}

// The extractor is bundled once the way scripts/build-caisra.mjs bundles the
// host (esbuild, everything inlined), so the test exercises the same pdf.js
// modules the box will run, and pdf.js's one-time "@napi-rs/canvas" warnings
// print once.
let extractorModule;
async function loadExtractor() {
  if (extractorModule === undefined) {
    const root = await temporary("pdf-text-extractor");
    const output = path.join(root, "pdf-text-extractor.mjs");
    await build({
      entryPoints: [path.join(repoRoot, "source/host/runner/pdf-text-extractor.ts")],
      outfile: output,
      bundle: true,
      format: "esm",
      platform: "node",
      target: "node22",
      logLevel: "silent",
    });
    extractorModule = await import(`${pathToFileURL(output).href}?${Date.now()}`);
  }
  return extractorModule;
}

/**
 * A minimal PDF 1.4: one Type1 Helvetica font, one content stream per page,
 * each line drawn with Tj and advanced with T*, a correct xref table.
 */
function buildPdf(pages) {
  const objects = [];
  const add = body => { objects.push(body); return objects.length; };
  const catalog = add(null);
  const pagesObject = add(null);
  const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const pageIds = [];
  for (const lines of pages) {
    const escaped = lines.map(line => `(${line.replace(/([()\\])/g, "\\$1")}) Tj T*`).join(" ");
    const stream = `BT /F1 12 Tf 72 720 Td 14 TL ${escaped} ET`;
    const contents = add(`<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`);
    pageIds.push(add(`<< /Type /Page /Parent ${pagesObject} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${contents} 0 R >>`));
  }
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObject} 0 R >>`;
  objects[pagesObject - 1] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
  let body = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets = [];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body, "latin1"));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(body, "latin1");
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(body, "latin1"));
}

test("the extractor reads the text of a real PDF, page by page", async () => {
  const module = await loadExtractor();
  const pdf = buildPdf([["Hello from Simeon.", "Second line of page one."], ["Page two says hi."]]);
  assert.equal(String.fromCharCode(...pdf.subarray(0, 4)), "%PDF");
  const before = Buffer.from(pdf).toString("latin1");
  const text = await module.productionPdfTextExtractor(pdf);
  assert.equal(text, "Hello from Simeon.\nSecond line of page one.\n\nPage two says hi.");
  // The Read tool keeps its own bytes; the extractor must not detach or alter them.
  assert.equal(Buffer.from(pdf).toString("latin1"), before);
  assert.equal(await module.productionPdfTextExtractor(pdf), text, "a second read of the same bytes gives the same text");
});

test("the extractor caps pages and bytes instead of running unbounded", async () => {
  const module = await loadExtractor();
  assert.equal(module.PDF_TEXT_EXTRACTION_MAX_BYTES, 50 * 1024 * 1024);
  assert.equal(module.PDF_TEXT_EXTRACTION_MAX_PAGES, 500);
  assert.deepEqual(module.DEFAULT_PDF_TEXT_EXTRACTION_LIMITS, { maxBytes: 50 * 1024 * 1024, maxPages: 500 });
  const pdf = buildPdf([["One."], ["Two."], ["Three."]]);
  const capped = await module.extractPdfText(pdf, { maxBytes: module.PDF_TEXT_EXTRACTION_MAX_BYTES, maxPages: 2 });
  assert.equal(capped, "One.\n\nTwo.\n\n[1 more pages not extracted: the Read tool extracts the first 2 pages of a PDF]");
  await assert.rejects(
    () => module.extractPdfText(pdf, { maxBytes: pdf.byteLength - 1, maxPages: 500 }),
    error => error.name === "PdfTooLargeError" && error.byteLength === pdf.byteLength && error.maxBytes === pdf.byteLength - 1,
  );
});

test("the extractor refuses bytes that are not a PDF with pdf.js's own error", async () => {
  const module = await loadExtractor();
  await assert.rejects(() => module.extractPdfText(new TextEncoder().encode("not a pdf at all")), /PDF/);
});

test("both Read inputs in the composition bind the extractor", async () => {
  const composition = await readFile(path.join(repoRoot, "source/host/host-runner-composition.ts"), "utf8");
  assert.match(composition, /import \{ productionPdfTextExtractor \} from "\.\/runner\/pdf-text-extractor\.js";/);
  for (const read of pdfTextExtractionBindingSpec.reads) {
    const factoryOffset = composition.indexOf(read.factoryNeedle);
    assert.ok(factoryOffset >= 0, `${read.tool} factory is declared`);
    const nextFactory = /create\w+ToolInputs/g;
    nextFactory.lastIndex = factoryOffset + read.factoryNeedle.length;
    const factoryEnd = nextFactory.exec(composition)?.index ?? composition.length;
    const bindingOffset = composition.indexOf(pdfTextExtractionBindingSpec.bindingNeedle, factoryOffset);
    assert.ok(bindingOffset >= 0 && bindingOffset < factoryEnd, `${read.tool} inputs name pdfTextExtractor: productionPdfTextExtractor`);
  }
  assert.equal(composition.match(/pdfTextExtractor: productionPdfTextExtractor,/g)?.length, 2);
});

test("host-production-activation detects the binding instead of recording pdf-worker as fail-closed", async () => {
  const binding = await assemblePdfTextExtractionBinding();
  assert.deepEqual(binding.blockers, []);
  assert.equal(binding.status, "bound-in-process");
  assert.equal(binding.extractor.source, "source/host/runner/pdf-text-extractor.ts");
  assert.ok(binding.reads.externalRead.line > binding.reads.externalRead.factoryLine);
  assert.ok(binding.reads.boxRead.line > binding.reads.boxRead.factoryLine);
  assert.ok(binding.reads.boxRead.factoryLine > binding.reads.externalRead.line, "the box binding is found in its own factory, not the external one");
  assert.equal(binding.package.name, "pdfjs-dist");
  assert.equal(binding.package.version, "5.4.296");
  assert.deepEqual(
    binding.bundleScripts.map(script => [script.script, script.externalsPdfjs]),
    [["scripts/build-caisra.mjs", false], ["scripts/caisra-ignition-activation.mjs", false]],
    "pdf.js is bundled into host-main.cjs, which is the only file the box receives",
  );
});

/** A copy of just the files the detector reads, with one change applied. */
async function detectorRootWith(name, mutate) {
  const root = await temporary(`pdf-binding-${name}`);
  const files = [
    pdfTextExtractionBindingSpec.module,
    pdfTextExtractionBindingSpec.composition,
    "package.json",
    "package-lock.json",
    ...pdfTextExtractionBindingSpec.bundleScripts,
  ];
  for (const file of files) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await cp(path.join(repoRoot, file), path.join(root, file));
  }
  await mutate(root);
  return root;
}

async function rewrite(root, file, edit) {
  const target = path.join(root, file);
  const before = await readFile(target, "utf8");
  const edited = edit(before);
  assert.notEqual(edited, before, `${file} was changed by the test`);
  await writeFile(target, edited);
}

test("the detector fails closed again, naming the piece, when a Read input drops the extractor", async () => {
  const root = await detectorRootWith("box-read", async root => {
    await rewrite(root, pdfTextExtractionBindingSpec.composition, text => {
      const last = text.lastIndexOf(pdfTextExtractionBindingSpec.bindingNeedle);
      return `${text.slice(0, last)}${text.slice(last + pdfTextExtractionBindingSpec.bindingNeedle.length)}`;
    });
  });
  const binding = await assemblePdfTextExtractionBinding({ root });
  assert.equal(binding.status, "fail-closed");
  assert.deepEqual(binding.blockers, ["source/host/host-runner-composition.ts boxRead inputs do not name pdfTextExtractor"]);
  assert.notEqual(binding.reads.externalRead, null);
  assert.equal(binding.reads.boxRead, null);
});

test("the detector fails closed when pdfjs-dist is left external to the host bundle", async () => {
  const root = await detectorRootWith("external", async root => {
    await rewrite(root, "scripts/build-caisra.mjs", text => text.replace('  "piscina",\n];', '  "piscina",\n  "pdfjs-dist",\n];'));
  });
  const binding = await assemblePdfTextExtractionBinding({ root });
  assert.equal(binding.status, "fail-closed");
  assert.deepEqual(binding.blockers, ["scripts/build-caisra.mjs leaves pdfjs-dist external, and the box has no node_modules to resolve it"]);
});

test("the detector fails closed when the extractor module is absent", async () => {
  const root = await detectorRootWith("no-module", async root => {
    await rm(path.join(root, pdfTextExtractionBindingSpec.module));
  });
  const binding = await assemblePdfTextExtractionBinding({ root });
  assert.equal(binding.status, "fail-closed");
  assert.equal(binding.extractor, null);
  assert.deepEqual(binding.blockers, ["source/host/runner/pdf-text-extractor.ts is absent"]);
});

test("the Read tool still fails closed when no extractor is bound", async () => {
  const read = await readFile(path.join(repoRoot, "source/packages/agent/tools/core/read/read.ts"), "utf8");
  assert.match(read, /if \(extractor === undefined\) throw new TypeError\("Read PDF worker is not bound"\);/);
  assert.match(read, /export type PdfTextExtractor = \(bytes: Uint8Array\) => Promise<string>;/);
});
