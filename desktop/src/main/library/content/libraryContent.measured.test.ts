import Database from 'better-sqlite3';
import fs from 'fs';
import JSZip from 'jszip';
import os from 'os';
import path from 'path';
import { describe, expect, test } from 'vitest';
import * as XLSX from 'xlsx';

import {
  formatLibraryLocator,
  type LibraryChunkLocator,
  type LibraryContentConfig,
  type LibraryDocumentKind,
  type LibraryWorkerDocumentIndexedMessage,
  LibraryWorkerMessageType,
  type LibraryWorkerReadyMessage,
} from '../../../shared/library/contentConstants';
import { initializeLibraryContentTables } from '../libraryMigrations';
import { handleLibraryWorkerRequest, type LibraryWorkerCoreDeps } from './documentWorkerCore';
import { type LibraryEmbedFunction, loadLibraryEmbeddingModel } from './embeddingModel';
import { extractLibraryDocument } from './extractors';
import { LibraryContentIndexer, type LibraryWorkerLike } from './libraryContentIndexer';
import { LibraryContentStore } from './libraryContentStore';
import { isLibraryModelPresent } from './modelPath';

/**
 * The measured run promised in docs/maties/library.md: a folder of a few
 * hundred generated office files through the real extractors, the real
 * model and the real indexer, then ten questions with the expected file and
 * place. Runs only with MATIES_LIBRARY_MEASURE=1 because it takes a minute.
 *
 *   MATIES_LIBRARY_MEASURE=1 npx vitest run src/main/library/content/libraryContent.measured.test.ts
 */

const MODEL_DIR = path.resolve(__dirname, '../../../../resources/embedding-model');
const ENABLED = process.env.MATIES_LIBRARY_MEASURE === '1' && isLibraryModelPresent(MODEL_DIR);

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const PKG_RELS_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const P_NS = 'http://schemas.openxmlformats.org/presentationml/2006/main';

const escapeXml = (text: string): string => text
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const writeDocx = async (filePath: string, sections: Array<{ heading: string; paragraphs: string[] }>): Promise<void> => {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${PKG_RELS_NS}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${PKG_RELS_NS}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  zip.file('word/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="${W_NS}"><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style></w:styles>`);
  const body = sections.map(section => (
    `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>${escapeXml(section.heading)}</w:t></w:r></w:p>`
    + section.paragraphs.map(paragraph => `<w:p><w:r><w:t>${escapeXml(paragraph)}</w:t></w:r></w:p>`).join('')
  )).join('');
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W_NS}"><w:body>${body}</w:body></w:document>`);
  await fs.promises.writeFile(filePath, await zip.generateAsync({ type: 'nodebuffer' }));
};

const writeXlsx = async (filePath: string, sheets: Array<{ name: string; rows: string[][] }>): Promise<void> => {
  const workbook = XLSX.utils.book_new();
  for (const sheet of sheets) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(sheet.rows), sheet.name);
  }
  await fs.promises.writeFile(filePath, XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer);
};

const writePptx = async (filePath: string, slides: string[][]): Promise<void> => {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>`);
  slides.forEach((paragraphs, index) => {
    zip.file(`ppt/slides/slide${index + 1}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="${A_NS}" xmlns:p="${P_NS}"><p:cSld><p:spTree><p:sp><p:txBody>
${paragraphs.map(paragraph => `<a:p><a:r><a:t>${escapeXml(paragraph)}</a:t></a:r></a:p>`).join('\n')}
</p:txBody></p:sp></p:spTree></p:cSld></p:sld>`);
  });
  await fs.promises.writeFile(filePath, await zip.generateAsync({ type: 'nodebuffer' }));
};

/** A valid PDF with one text line per page. */
const buildPdf = (pages: string[]): Buffer => {
  const objects: string[] = [];
  const pageIds: number[] = [];
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push('PAGES');
  const fontId = 3;
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  for (const text of pages) {
    const safe = text.replace(/[()\\]/g, match => `\\${match}`);
    const stream = `BT /F1 12 Tf 72 700 Td (${safe}) Tj ET`;
    const contentId = objects.length + 1;
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    const pageId = objects.length + 1;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`);
    pageIds.push(pageId);
  }
  objects[1] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(out, 'latin1'));
    out += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) out += `${String(offset).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
};

// Filler text so the index has ordinary office noise around the ten facts.
const TOPICS = [
  'The weekly team meeting covers open tickets, upcoming deadlines and staffing.',
  'Invoices are approved by the department head before payment is released.',
  'The office printer on the second floor needs a new toner cartridge.',
  'Travel expenses must be filed within thirty days with receipts attached.',
  'The client asked for a revised proposal by the end of the month.',
  'Quarterly targets are reviewed with each manager in a short call.',
  'New starters receive a laptop, a badge and access to the shared drive.',
  'The supplier contract renews automatically unless cancelled in writing.',
  'Customer feedback from the survey is grouped by product line.',
  'The maintenance window for the servers is Sunday night.',
  'Parking permits are issued by reception on request.',
  'The marketing team is preparing the spring campaign materials.',
];

const filler = (seed: number, count: number): string[] => (
  Array.from({ length: count }, (_, index) => TOPICS[(seed * 7 + index * 3) % TOPICS.length])
);

interface Question {
  query: string;
  file: string;
  locator: LibraryChunkLocator;
}

const QUESTIONS: Question[] = [
  { query: 'how much is the rent', file: 'lease.docx', locator: { heading: 'Rent' } },
  { query: 'marketing budget for the third quarter', file: 'budget.xlsx', locator: { sheet: 'Q3' } },
  { query: 'how many engineers are we hiring', file: 'review.pptx', locator: { slide: 2 } },
  { query: 'working from home policy', file: 'policy.pdf', locator: { page: 2 } },
  { query: 'who is in charge of the office move', file: 'minutes.md', locator: { heading: 'Decisions' } },
  { query: 'holiday allowance', file: 'handbook.txt', locator: {} },
  { query: 'Acme Printing invoice', file: 'suppliers.csv', locator: {} },
  { query: 'notice period in the contract', file: 'contract.docx', locator: { heading: 'Termination' } },
  { query: 'sales in the north region', file: 'sales.xlsx', locator: { sheet: 'Regions' } },
  { query: 'when is the first aid course', file: 'training.pptx', locator: { slide: 3 } },
];

const generateCorpus = async (root: string): Promise<number> => {
  let count = 0;
  const dir = (name: string) => {
    const folder = path.join(root, name);
    fs.mkdirSync(folder, { recursive: true });
    return folder;
  };
  const contracts = dir('contracts');
  const finance = dir('finance');
  const slides = dir('slides');
  const hr = dir('hr');
  const notes = dir('notes');

  // The ten documents the questions point at.
  await writeDocx(path.join(contracts, 'lease.docx'), [
    { heading: 'Parties', paragraphs: filler(1, 3) },
    { heading: 'Rent', paragraphs: ['The tenant shall pay rent of 2,400 euros on the first day of each month.', ...filler(2, 2)] },
    { heading: 'Duration', paragraphs: filler(3, 3) },
  ]);
  await writeDocx(path.join(contracts, 'contract.docx'), [
    { heading: 'Scope', paragraphs: filler(4, 3) },
    { heading: 'Termination', paragraphs: ['Either party may end this agreement with a notice period of ninety days given in writing.'] },
  ]);
  await writeXlsx(path.join(finance, 'budget.xlsx'), [
    { name: 'Q3', rows: [['Item', 'Amount'], ['Marketing budget total', '45000'], ['Events', '12000'], ['Print', '8000']] },
    { name: 'Q4', rows: [['Item', 'Amount'], ['Travel', '3000']] },
  ]);
  await writeXlsx(path.join(finance, 'sales.xlsx'), [
    { name: 'Regions', rows: [['Region', 'Sales'], ['North region', '1.2 million'], ['South region', '0.8 million']] },
  ]);
  await writePptx(path.join(slides, 'review.pptx'), [
    ['Quarterly review', 'Revenue grew 12%'],
    ['Hiring plan', 'Three engineers join in the fourth quarter'],
    ['Questions'],
  ]);
  await writePptx(path.join(slides, 'training.pptx'), [
    ['Training calendar'],
    ['Excel basics in February'],
    ['First aid course on 14 March in the main meeting room'],
  ]);
  fs.writeFileSync(path.join(hr, 'policy.pdf'), buildPdf([
    'Company policies overview and general conduct at work.',
    'Employees may work from home up to three days per week with manager approval.',
    'Expense claims are filed monthly.',
  ]));
  fs.writeFileSync(path.join(notes, 'minutes.md'), '# Meeting minutes\n\n## Attendees\n\nSarah, Tom, Priya.\n\n## Decisions\n\nThe office moves to the new building in November. Sarah owns the move.\n\n## Actions\n\nTom books the movers.\n');
  fs.writeFileSync(path.join(hr, 'handbook.txt'), `${filler(5, 4).join('\n\n')}\n\nThe holiday allowance is 25 days a year, plus public holidays.\n`);
  fs.writeFileSync(path.join(finance, 'suppliers.csv'), 'supplier,invoice,amount\nAcme Printing,INV-2201,8000\nBlue Catering,INV-2202,1500\n');
  count += 10;

  // Filler documents of every kind.
  for (let index = 0; index < 60; index += 1) {
    await writeDocx(path.join(contracts, `memo-${index}.docx`), [
      { heading: `Memo ${index}`, paragraphs: filler(index, 6) },
      { heading: 'Next steps', paragraphs: filler(index + 1, 4) },
    ]);
    await writeXlsx(path.join(finance, `sheet-${index}.xlsx`), [
      { name: 'Data', rows: [['Item', 'Value'], ...Array.from({ length: 30 }, (_, row) => [`Line ${row}`, String(row * index)])] },
    ]);
    await writePptx(path.join(slides, `deck-${index}.pptx`), [
      [`Deck ${index}`, ...filler(index, 2)],
      filler(index + 2, 3),
      filler(index + 4, 2),
    ]);
    fs.writeFileSync(path.join(hr, `note-${index}.pdf`), buildPdf(filler(index, 3)));
    count += 4;
  }
  for (let index = 0; index < 30; index += 1) {
    fs.writeFileSync(path.join(notes, `day-${index}.md`), `# Day ${index}\n\n${filler(index, 5).join('\n\n')}\n`);
    fs.writeFileSync(path.join(notes, `list-${index}.txt`), filler(index + 3, 5).join('\n'));
    fs.writeFileSync(path.join(finance, `export-${index}.csv`), `id,label\n${filler(index, 20).map((line, row) => `${row},${line.replace(/,/g, ' ')}`).join('\n')}\n`);
    count += 3;
  }
  return count;
};

/** The worker's logic in this process: real extractors, real model. */
class InProcessWorker implements LibraryWorkerLike {
  ready = false;
  private embedFn: LibraryEmbedFunction | null = null;

  constructor(private readonly modelDir: string) {}

  /** Built per request so `embed` reflects the model once it is loaded. */
  private get deps(): LibraryWorkerCoreDeps {
    return {
      extract: extractLibraryDocument,
      embed: this.embedFn,
      loadModel: async (dir) => (await loadLibraryEmbeddingModel(dir)).embed,
      onModelLoaded: (embed) => {
        this.embedFn = embed;
      },
    };
  }

  async start(): Promise<LibraryWorkerReadyMessage> {
    const reply = await handleLibraryWorkerRequest({ type: LibraryWorkerMessageType.Init, modelDir: this.modelDir }, this.deps);
    if (reply.type !== LibraryWorkerMessageType.Ready) throw new Error('unexpected reply');
    this.ready = reply.ok;
    return reply;
  }

  async indexDocument(filePath: string, kind: LibraryDocumentKind): Promise<LibraryWorkerDocumentIndexedMessage> {
    const reply = await handleLibraryWorkerRequest(
      { type: LibraryWorkerMessageType.IndexDocument, requestId: 'r', filePath, kind },
      this.deps,
    );
    if (reply.type === LibraryWorkerMessageType.Failed) {
      throw Object.assign(new Error(reply.error), { permanent: reply.permanent === true });
    }
    if (reply.type !== LibraryWorkerMessageType.DocumentIndexed) throw new Error('unexpected reply');
    return reply;
  }

  async embedQuery(text: string): Promise<Float32Array> {
    const reply = await handleLibraryWorkerRequest(
      { type: LibraryWorkerMessageType.EmbedQuery, requestId: 'q', text },
      this.deps,
    );
    if (reply.type !== LibraryWorkerMessageType.QueryEmbedded) throw new Error('unexpected reply');
    return reply.vector;
  }

  stop(): void {
    this.ready = false;
  }
}

const waitFor = async (condition: () => boolean, timeoutMs: number): Promise<void> => {
  const startedAt = Date.now();
  while (!condition()) {
    if (Date.now() - startedAt > timeoutMs) throw new Error('timed out');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
};

const megabytes = (bytes: number): string => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

describe.skipIf(!ENABLED)('the personal library, measured', () => {
  test('indexes a few hundred office files and answers ten questions with the file and the place', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maties-library-measured-'));
    const lines: string[] = [];
    const say = (line: string) => {
      lines.push(line);
      console.log(`[LibraryMeasured] ${line}`);
    };
    try {
      const fileCount = await generateCorpus(root);
      const db = new Database(':memory:');
      initializeLibraryContentTables(db);
      const store = new LibraryContentStore(db);
      const config: LibraryContentConfig = { enabled: true, folders: [root], excludedFolders: [] };
      const metadata = new Map<string, unknown>();
      const memoryBefore = process.memoryUsage().rss;
      const indexer = new LibraryContentIndexer({
        store,
        getConfig: () => config,
        createWorker: () => new InProcessWorker(MODEL_DIR),
        onStatus: () => undefined,
        getMetadata: <T>(key: string) => metadata.get(key) as T | undefined,
        setMetadata: (key, value) => metadata.set(key, value),
        rescanIntervalMs: 3_600_000,
      });
      const startedAt = Date.now();
      indexer.start();
      await indexer.scanNow();
      await waitFor(() => indexer.queueLength === 0 && store.counts().pending === 0, 600_000);
      const elapsedMs = Date.now() - startedAt;
      const counts = store.counts();
      const memoryAfter = process.memoryUsage().rss;
      say(`${fileCount} files generated, ${counts.indexed} indexed, ${counts.failed} failed, ${counts.chunks} passages`);
      say(`${elapsedMs} ms in total: ${Math.round((counts.indexed / elapsedMs) * 60_000)} documents per minute`);
      say(`index size about ${megabytes(counts.indexBytes)}; memory ${megabytes(memoryBefore)} before, ${megabytes(memoryAfter)} after`);
      expect(counts.failed).toBe(0);
      expect(counts.indexed).toBe(fileCount);

      let correct = 0;
      for (const question of QUESTIONS) {
        const askedAt = Date.now();
        const response = await indexer.search({ query: question.query, limit: 5 });
        const took = Date.now() - askedAt;
        const top = response.hits[0];
        const found = top && top.fileName === question.file && formatLibraryLocator(top.locator) === formatLibraryLocator(question.locator);
        const rank = response.hits.findIndex(hit => hit.fileName === question.file && formatLibraryLocator(hit.locator) === formatLibraryLocator(question.locator));
        if (found) correct += 1;
        say(`${found ? 'ok ' : 'MISS'} "${question.query}" → ${top ? `${top.fileName} ${formatLibraryLocator(top.locator) || 'whole file'} (${top.score})` : 'nothing'}; expected ${question.file} ${formatLibraryLocator(question.locator) || 'whole file'}${found ? '' : rank >= 0 ? ` at rank ${rank + 1}` : ' not in top 5'}; ${took} ms`);
      }
      say(`${correct} of ${QUESTIONS.length} questions answered with the right file and place`);
      fs.writeFileSync(path.join(os.tmpdir(), 'maties-library-measured.txt'), `${lines.join('\n')}\n`);
      indexer.stop();
      expect(correct).toBeGreaterThanOrEqual(8);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 900_000);
});
