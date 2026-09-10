import fs from 'fs';
import JSZip from 'jszip';
import os from 'os';
import path from 'path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import * as XLSX from 'xlsx';

import { LibraryContentLimits, LibraryDocumentKind } from '../../../../shared/library/contentConstants';
import { extractLibraryDocument } from './index';
import { joinPdfTextItems, pdfJsWouldMistakeElectronForBrowser } from './pdf';
import { sectionsFromMarkdown, textFromCsv } from './plainText';
import { boundSections, decodeXmlEntities, joinRowsWithRepeatedHeader } from './shared';
import { textFromSlideXml } from './slides';
import { sheetRowsToText } from './spreadsheet';
import { sectionsFromWordHtml } from './word';

let fixtureDir = '';

const fixture = (name: string): string => path.join(fixtureDir, name);

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const PKG_RELS_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';

const writeDocx = async (filePath: string): Promise<void> => {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${PKG_RELS_NS}">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);
  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${PKG_RELS_NS}">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`);
  zip.file('word/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="${W_NS}">
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style>
</w:styles>`);
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W_NS}">
  <w:body>
    <w:p><w:r><w:t>Lease agreement between the parties.</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Rent &amp; charges</w:t></w:r></w:p>
    <w:p><w:r><w:t>The tenant pays 2,400 euros each month.</w:t></w:r></w:p>
    <w:p><w:r><w:t>The lease runs for three years.</w:t></w:r></w:p>
  </w:body>
</w:document>`);
  await fs.promises.writeFile(filePath, await zip.generateAsync({ type: 'nodebuffer' }));
};

const writeXlsx = async (filePath: string): Promise<void> => {
  const workbook = XLSX.utils.book_new();
  const budgetRows = [['Item', 'Amount']];
  for (let index = 1; index <= 45; index += 1) budgetRows.push([`Line ${index}`, String(index * 100)]);
  budgetRows.push(['', '']);
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(budgetRows), 'Budget');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Name', 'Role'], ['Sarah', 'Owner of the move']]), 'People');
  await fs.promises.writeFile(filePath, XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer);
};

const A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const P_NS = 'http://schemas.openxmlformats.org/presentationml/2006/main';

const slideXml = (paragraphs: string[][]): string => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="${A_NS}" xmlns:p="${P_NS}"><p:cSld><p:spTree><p:sp><p:txBody>
${paragraphs.map(runs => `<a:p>${runs.map(run => `<a:r><a:t>${run}</a:t></a:r>`).join('')}</a:p>`).join('\n')}
</p:txBody></p:sp></p:spTree></p:cSld></p:sld>`;

const writePptx = async (filePath: string): Promise<void> => {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>`);
  zip.file('ppt/slides/slide1.xml', slideXml([['Quarterly review'], ['Revenue grew ', '12%']]));
  zip.file('ppt/slides/slide2.xml', slideXml([['Hiring plan'], ['Three engineers in Q4']]));
  zip.file('ppt/slides/slide10.xml', slideXml([['Questions']]));
  zip.file('ppt/slides/_rels/slide2.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${PKG_RELS_NS}"><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide7.xml"/></Relationships>`);
  zip.file('ppt/notesSlides/notesSlide7.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:notes xmlns:a="${A_NS}" xmlns:p="${P_NS}"><p:cSld><p:spTree><p:sp><p:txBody>
<a:p><a:r><a:t>Mention the budget freeze.</a:t></a:r></a:p>
<a:p><a:fld id="{1}" type="slidenum"><a:t>2</a:t></a:fld></a:p>
</p:txBody></p:sp></p:spTree></p:cSld></p:notes>`);
  await fs.promises.writeFile(filePath, await zip.generateAsync({ type: 'nodebuffer' }));
};

/** A valid single-page PDF with one text object; the xref offsets are computed here. */
const buildMinimalPdf = (text: string): Buffer => {
  const stream = `BT /F1 24 Tf 72 700 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
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

beforeAll(async () => {
  fixtureDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'maties-library-extractors-'));
  await Promise.all([
    writeDocx(fixture('lease.docx')),
    writeXlsx(fixture('budget.xlsx')),
    writePptx(fixture('review.pptx')),
    fs.promises.writeFile(fixture('page.pdf'), buildMinimalPdf('Hello library page one')),
    fs.promises.writeFile(fixture('notes.md'), '﻿Intro line before any heading.\n\n# Scope\n\nThe project covers the move.\n\n```\n# not a heading\n```\n\n## Timeline\n\nNovember at the latest.\n'),
    fs.promises.writeFile(fixture('data.csv'), 'name,amount\r\nrent,2400\r\n\r\nprint,8000\r\n'),
    fs.promises.writeFile(fixture('plain.txt'), '﻿Just a note.\r\nSecond line.'),
    fs.promises.writeFile(fixture('empty.txt'), '   \n'),
    fs.promises.writeFile(fixture('broken.pptx'), 'this is not a zip file'),
  ]);
});

afterAll(async () => {
  if (fixtureDir) await fs.promises.rm(fixtureDir, { recursive: true, force: true });
});

describe('extractLibraryDocument', () => {
  test('Word: headings open sections with a heading locator', async () => {
    const { sections, pageCount } = await extractLibraryDocument(fixture('lease.docx'), LibraryDocumentKind.Word);
    expect(pageCount).toBe(0);
    expect(sections).toHaveLength(2);
    expect(sections[0].locator).toEqual({});
    expect(sections[0].text).toContain('Lease agreement between the parties.');
    expect(sections[1].locator).toEqual({ heading: 'Rent & charges' });
    expect(sections[1].text).toContain('Rent & charges');
    expect(sections[1].text).toContain('The tenant pays 2,400 euros each month.');
    expect(sections[1].text).toContain('The lease runs for three years.');
  });

  test('PDF: one section per page with the page number', async () => {
    const { sections, pageCount } = await extractLibraryDocument(fixture('page.pdf'), LibraryDocumentKind.Pdf);
    expect(pageCount).toBe(1);
    expect(sections).toHaveLength(1);
    expect(sections[0].locator).toEqual({ page: 1 });
    expect(sections[0].text.replace(/\s+/g, ' ').trim()).toContain('Hello library page one');
  });

  test('Spreadsheet: one section per sheet, header repeated, empty rows skipped', async () => {
    const { sections, pageCount } = await extractLibraryDocument(fixture('budget.xlsx'), LibraryDocumentKind.Spreadsheet);
    expect(pageCount).toBe(2);
    expect(sections.map(section => section.locator)).toEqual([{ sheet: 'Budget' }, { sheet: 'People' }]);
    const budgetLines = sections[0].text.split('\n');
    expect(budgetLines[0]).toBe('Item\tAmount');
    expect(budgetLines).toContain('Line 45\t4500');
    expect(budgetLines.filter(line => line === 'Item\tAmount')).toHaveLength(2);
    expect(budgetLines.filter(line => line.trim() === '')).toHaveLength(1);
    expect(sections[1].text).toBe('Name\tRole\nSarah\tOwner of the move');
  });

  test('Slides: numeric slide order, runs joined, notes appended', async () => {
    const { sections, pageCount } = await extractLibraryDocument(fixture('review.pptx'), LibraryDocumentKind.Slides);
    expect(pageCount).toBe(3);
    expect(sections.map(section => section.locator)).toEqual([{ slide: 1 }, { slide: 2 }, { slide: 10 }]);
    expect(sections[0].text).toBe('Quarterly review\nRevenue grew 12%');
    expect(sections[1].text).toBe('Hiring plan\nThree engineers in Q4\n\nNotes:\nMention the budget freeze.');
    expect(sections[2].text).toBe('Questions');
  });

  test('Markdown: sections at ATX headings, fences ignored, BOM stripped', async () => {
    const { sections } = await extractLibraryDocument(fixture('notes.md'), LibraryDocumentKind.Markdown);
    expect(sections.map(section => section.locator)).toEqual([{}, { heading: 'Scope' }, { heading: 'Timeline' }]);
    expect(sections[0].text.startsWith('Intro line')).toBe(true);
    expect(sections[1].text).toContain('# not a heading');
    expect(sections[2].text).toContain('November at the latest.');
  });

  test('CSV: single section with the header kept; text: single section', async () => {
    const csv = await extractLibraryDocument(fixture('data.csv'), LibraryDocumentKind.Csv);
    expect(csv.sections).toEqual([{ locator: {}, text: 'name,amount\nrent,2400\nprint,8000' }]);
    const text = await extractLibraryDocument(fixture('plain.txt'), LibraryDocumentKind.Text);
    expect(text.sections).toEqual([{ locator: {}, text: 'Just a note.\r\nSecond line.' }]);
    expect(text.pageCount).toBe(0);
  });

  test('an empty file yields no sections', async () => {
    const { sections } = await extractLibraryDocument(fixture('empty.txt'), LibraryDocumentKind.Text);
    expect(sections).toEqual([]);
  });

  test('a file over the size limit is refused before reading', async () => {
    const filePath = fixture('huge.txt');
    const handle = await fs.promises.open(filePath, 'w');
    try {
      await handle.truncate(LibraryContentLimits.MaxFileBytes + 1);
    } finally {
      await handle.close();
    }
    await expect(extractLibraryDocument(filePath, LibraryDocumentKind.Text)).rejects.toThrow(/^too large/);
  });

  test('a corrupt archive and an unknown kind are reported as such', async () => {
    await expect(extractLibraryDocument(fixture('broken.pptx'), LibraryDocumentKind.Slides)).rejects.toThrow(/^corrupt file/);
    await expect(extractLibraryDocument(fixture('plain.txt'), 'image' as never)).rejects.toThrow(/^unsupported/);
  });
});

describe('extractor helpers', () => {
  test('sectionsFromWordHtml turns paragraphs, lists and tables into lines', () => {
    const sections = sectionsFromWordHtml(
      '<p>Intro</p><h2>Terms &amp; conditions</h2><ul><li>One</li><li>Two</li></ul>'
      + '<table><tr><td>A</td><td>B</td></tr><tr><td>C</td><td>D</td></tr></table><p>Line<br />break</p>',
    );
    expect(sections).toHaveLength(2);
    expect(sections[0]).toEqual({ locator: {}, text: 'Intro\n' });
    expect(sections[1].locator).toEqual({ heading: 'Terms & conditions' });
    expect(sections[1].text).toBe('Terms & conditions\nOne\nTwo\nA\tB\t\nC\tD\t\nLine\nbreak\n');
  });

  test('joinPdfTextItems inserts line breaks on EOL and vertical moves', () => {
    const text = joinPdfTextItems([
      { str: 'First', hasEOL: false, transform: [1, 0, 0, 1, 72, 700], width: 30 },
      { str: 'line', hasEOL: true, transform: [1, 0, 0, 1, 110, 700], width: 20 },
      { str: 'Second', hasEOL: false, transform: [1, 0, 0, 1, 72, 680], width: 40 },
      { type: 'beginMarkedContent' },
      { str: 'Third', hasEOL: false, transform: [1, 0, 0, 1, 72, 660], width: 40 },
    ]);
    expect(text).toBe('First line\nSecond\nThird');
  });

  test('sheetRowsToText and textFromCsv repeat the header every forty rows', () => {
    const rows = [['h1', 'h2'], ...Array.from({ length: 85 }, (_, index) => [`r${index}`, index])];
    const lines = sheetRowsToText(rows).split('\n');
    expect(lines.filter(line => line === 'h1\th2')).toHaveLength(3);
    expect(lines[0]).toBe('h1\th2');
    expect(lines[41]).toBe('');
    expect(lines[42]).toBe('h1\th2');
    expect(joinRowsWithRepeatedHeader([])).toBe('');
    expect(textFromCsv('a,b\n1,2\n')).toBe('a,b\n1,2');
    expect(sheetRowsToText(rows, 10).split('\n')).toHaveLength(10);
  });

  test('textFromSlideXml and sectionsFromMarkdown handle entities, breaks and fences', () => {
    expect(textFromSlideXml('<a:p><a:r><a:t>A &amp; B</a:t></a:r><a:br/><a:r><a:t>C</a:t></a:r></a:p><a:p><a:fld type="slidenum"><a:t>3</a:t></a:fld></a:p>')).toBe('A & B\nC');
    expect(decodeXmlEntities('&#65;&#x42;&quot;&apos;&unknown;')).toBe('AB"\'&unknown;');
    expect(sectionsFromMarkdown('### Deep heading ###\ntext').map(section => section.locator)).toEqual([{ heading: 'Deep heading' }]);
    expect(sectionsFromMarkdown('')).toEqual([]);
  });

  test('boundSections drops empties and cuts to the character budget', () => {
    const bounded = boundSections([
      { locator: { page: 1 }, text: '   ' },
      { locator: { page: 2 }, text: 'abcdef' },
      { locator: { page: 3 }, text: 'ghijkl' },
      { locator: { page: 4 }, text: 'mno' },
    ], 9);
    expect(bounded).toEqual([
      { locator: { page: 2 }, text: 'abcdef' },
      { locator: { page: 3 }, text: 'ghi' },
    ]);
  });
});

describe('pdf.js inside an Electron utility process', () => {
  test('is mistaken for a browser only when Electron sets a non-browser process type', () => {
    expect(pdfJsWouldMistakeElectronForBrowser({ electron: '40.0.0' }, 'utility')).toBe(true);
    expect(pdfJsWouldMistakeElectronForBrowser({ electron: '40.0.0' }, 'browser')).toBe(false);
    expect(pdfJsWouldMistakeElectronForBrowser({}, undefined)).toBe(false);
    expect(pdfJsWouldMistakeElectronForBrowser({}, 'utility')).toBe(false);
  });
});
