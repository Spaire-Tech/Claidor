// Our own .xlsx reader (xlsx.ts) against a workbook LibreOffice made
// (fixtures/revenue.xlsx, from fixtures/revenue.fods: `soffice --headless
// --convert-to xlsx revenue.fods`), a workbook written the way Excel writes
// one, Excel's number formats, and files that are not workbooks.

import { readFileSync } from 'node:fs'
import { deflateRawSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import {
  columnIndex,
  formatDate,
  formatNumber,
  general,
  isDateFormat,
  readXlsx,
  unescapeXML,
} from './xlsx'

/** A zip of these parts, each deflated (or stored), as a spreadsheet app writes one. */
function zip(
  parts: Record<string, string | Uint8Array>,
  stored = false,
): Uint8Array {
  const locals: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  for (const [name, content] of Object.entries(parts)) {
    const raw = Buffer.from(content)
    const packed = stored ? raw : deflateRawSync(raw)
    const nameBytes = Buffer.from(name)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(stored ? 0 : 8, 8)
    local.writeUInt32LE(packed.length, 18)
    local.writeUInt32LE(raw.length, 22)
    local.writeUInt16LE(nameBytes.length, 26)
    locals.push(local, nameBytes, packed)
    const entry = Buffer.alloc(46)
    entry.writeUInt32LE(0x02014b50, 0)
    entry.writeUInt16LE(stored ? 0 : 8, 10)
    entry.writeUInt32LE(packed.length, 20)
    entry.writeUInt32LE(raw.length, 24)
    entry.writeUInt16LE(nameBytes.length, 28)
    entry.writeUInt32LE(offset, 42)
    central.push(entry, nameBytes)
    offset += 30 + nameBytes.length + packed.length
  }
  const directory = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(Object.keys(parts).length, 8)
  end.writeUInt16LE(Object.keys(parts).length, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)
  return new Uint8Array(Buffer.concat([...locals, directory, end]))
}

const main =
  'xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'

/** A workbook as Excel writes one: prefixed tags, a rels path from the root, inline words, true and false, an error, a formula's words. */
function excelLike(stored = false): Uint8Array {
  return zip(
    {
      'xl/workbook.xml': `<?xml version="1.0"?><x:workbook ${main}><x:workbookPr date1904="1"/><x:sheets><x:sheet name="Plan &amp; budget" sheetId="7" r:id="rId9" xmlns:r="r"/><x:sheet name="Other" sheetId="8" r:id="rId10" xmlns:r="r"/></x:sheets></x:workbook>`,
      'xl/_rels/workbook.xml.rels': `<Relationships><Relationship Id="rId10" Type="http://x/worksheet" Target="/xl/worksheets/other.xml"/><Relationship Id="rId9" Type="http://x/worksheet" Target="/xl/worksheets/plan.xml"/><Relationship Id="rId2" Type="http://x/sharedStrings" Target="strings.xml"/><Relationship Id="rId3" Type="http://x/styles" Target="styles.xml"/></Relationships>`,
      'xl/strings.xml': `<x:sst ${main}><x:si><x:t>Item</x:t></x:si><x:si><x:r><x:t xml:space="preserve">Cost </x:t></x:r><x:r><x:rPr><x:b/></x:rPr><x:t>(€)</x:t></x:r></x:si><x:si><x:t>Due</x:t><x:rPh><x:t>ignored</x:t></x:rPh></x:si></x:sst>`,
      'xl/styles.xml': `<x:styleSheet ${main}><x:numFmts><x:numFmt numFmtId="170" formatCode="[$€-407]#,##0.00"/></x:numFmts><x:cellXfs><x:xf numFmtId="0"/><x:xf numFmtId="170"/><x:xf numFmtId="14"/><x:xf numFmtId="10"/></x:cellXfs></x:styleSheet>`,
      'xl/worksheets/plan.xml': `<x:worksheet ${main}><x:dimension ref="B2:E5"/><x:sheetData>
        <x:row r="2"><x:c r="B2" t="s"><x:v>0</x:v></x:c><x:c r="C2" t="s"><x:v>1</x:v></x:c><x:c r="D2" t="s"><x:v>2</x:v></x:c><x:c r="E2" t="inlineStr"><x:is><x:t>Done?</x:t></x:is></x:c></x:row>
        <x:row r="3"><x:c r="B3" t="inlineStr"><x:is><x:r><x:t>Deck</x:t></x:r><x:r><x:t xml:space="preserve"> &amp; page</x:t></x:r></x:is></x:c><x:c r="C3" s="1"><x:v>1234.5</x:v></x:c><x:c r="D3" s="2"><x:v>45000</x:v></x:c><x:c r="E3" t="b"><x:v>1</x:v></x:c></x:row>
        <x:row r="4"><x:c r="B4" t="str"><x:f>UPPER("x")</x:f><x:v>X</x:v></x:c><x:c r="C4" t="e"><x:v>#DIV/0!</x:v></x:c><x:c r="D4" s="3"><x:v>0.0425</x:v></x:c><x:c r="E4" t="b"><x:v>0</x:v></x:c></x:row>
        <x:row r="5"><x:c r="C5"><x:v>0.30000000000000004</x:v></x:c></x:row>
      </x:sheetData></x:worksheet>`,
      'xl/worksheets/other.xml': `<x:worksheet ${main}><x:sheetData><x:row r="1"><x:c r="A1" t="inlineStr"><x:is><x:t>not first</x:t></x:is></x:c></x:row></x:sheetData></x:worksheet>`,
    },
    stored,
  )
}

describe('an Excel workbook', () => {
  it('reads the first sheet of one LibreOffice made', async () => {
    const data = new Uint8Array(
      readFileSync(new URL('./fixtures/revenue.xlsx', import.meta.url)),
    )
    const sheet = await readXlsx(data)
    expect(sheet?.name).toBe('Revenue')
    expect(sheet?.rows).toEqual([
      ['Month', 'Revenue', 'Growth', 'Closed', 'Note', 'Double'],
      ['2026-07-01', '42000', '12.5%', '1', 'Smith, J & "Co" <ok>', '84000'],
      ['2026-08-01', '45500.75', '', '0', 'été 🌞', '91001.5'],
      ['', '', '', '', '', ''],
      ['', '', '', '', '', ''],
      ['Total', '87500.75', '', '', '', ''],
    ])
    expect(sheet?.totalRows).toBe(6)
  })

  it('reads one written the way Excel writes it, deflated or stored', async () => {
    for (const stored of [false, true]) {
      const sheet = await readXlsx(excelLike(stored))
      expect(sheet?.name).toBe('Plan & budget')
      expect(sheet?.rows).toEqual([
        ['Item', 'Cost (€)', 'Due', 'Done?'],
        ['Deck & page', '€1,234.50', '3/16/27', 'TRUE'],
        ['X', '#DIV/0!', '4.25%', 'FALSE'],
        ['', '0.3', '', ''],
      ])
      expect(sheet?.totalRows).toBe(4)
    }
  })

  it('reads as much of the sheet as the preview shows, and counts the rest', async () => {
    const rows = Array.from(
      { length: 2500 },
      (_, i) =>
        `<row r="${i + 1}"><c r="A${i + 1}"><v>${i}</v></c><c r="GZ${i + 1}"><v>1</v></c></row>`,
    ).join('')
    const sheet = await readXlsx(
      zip({
        'xl/workbook.xml': `<workbook><sheets><sheet name="Big" r:id="rId1"/></sheets></workbook>`,
        'xl/_rels/workbook.xml.rels': `<Relationships><Relationship Id="rId1" Type="x/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
        'xl/worksheets/sheet1.xml': `<worksheet><sheetData>${rows}</sheetData></worksheet>`,
      }),
    )
    expect(sheet?.rows.length).toBe(2000)
    expect(sheet?.rows[0]?.length).toBe(200)
    expect(sheet?.totalRows).toBe(2500)
  })

  it('refuses what is not a workbook, and a zip that unzips past its limit', async () => {
    expect(
      await readXlsx(new TextEncoder().encode('Month,Revenue')),
    ).toBeUndefined()
    expect(await readXlsx(zip({ 'word/document.xml': '<w/>' }))).toBeUndefined()
    const bomb = zip({
      'xl/workbook.xml': `<workbook><sheets><sheet name="A" r:id="rId1"/></sheets></workbook>`,
      'xl/worksheets/sheet1.xml': `<worksheet>${' '.repeat(2_000_000)}</worksheet>`,
    })
    expect(bomb.length).toBeLessThan(10_000)
    expect(await readXlsx(bomb, 1_000_000)).toBeUndefined()
    expect(await readXlsx(bomb)).toEqual({ name: 'A', rows: [], totalRows: 0 })
    // Cut short: nothing, not a failure.
    expect(await readXlsx(excelLike().slice(0, 300))).toBeUndefined()
  })
})

describe("Excel's number formats", () => {
  it('write numbers', () => {
    expect(general(0.1 + 0.2)).toBe('0.3')
    expect(general(42)).toBe('42')
    expect(general(123456789012345)).toBe('1.2345678901E+14')
    expect(formatNumber(1204.5, '#,##0.00')).toBe('1,204.50')
    expect(formatNumber(-1204.5, '#,##0.00')).toBe('-1,204.50')
    expect(formatNumber(-1204.5, '#,##0.00;(#,##0.00)')).toBe('(1,204.50)')
    expect(formatNumber(0.125, '0.0%')).toBe('12.5%')
    expect(formatNumber(0.5, '0%')).toBe('50%')
    expect(formatNumber(1234.5, '"$"#,##0.00')).toBe('$1,234.50')
    expect(formatNumber(1234.5, '#,##0.00 [$€-407]')).toBe('1,234.50 €')
    expect(formatNumber(12345, '0.00E+00')).toBe('1.23E+04')
    expect(formatNumber(1234567, '#,##0,"K"')).toBe('1,235K')
    expect(formatNumber(7, '0')).toBe('7')
    expect(formatNumber(7.456, '0.00_);(0.00)')).toBe('7.46 ')
  })

  it('write dates and times', () => {
    expect(isDateFormat('yyyy\\-mm\\-dd')).toBe(true)
    expect(isDateFormat('#,##0.00 [$€-407]')).toBe(false)
    expect(isDateFormat('0.00E+00')).toBe(false)
    expect(formatDate(46204, 'yyyy\\-mm\\-dd')).toBe('2026-07-01')
    expect(formatDate(46204.5, 'yyyy-mm-dd hh:mm')).toBe('2026-07-01 12:00')
    expect(formatDate(46204, 'm/d/yy')).toBe('7/1/26')
    expect(formatDate(46204, 'mmm d, yyyy')).toBe('Jul 1, 2026')
    expect(formatDate(46204, 'dddd d mmmm')).toBe('Wednesday 1 July')
    expect(formatDate(0.75, 'h:mm AM/PM')).toBe('6:00 PM')
    expect(formatDate(1.5, '[h]:mm:ss')).toBe('36:00:00')
    expect(formatDate(1, 'yyyy-mm-dd')).toBe('1900-01-01')
    expect(formatDate(61, 'yyyy-mm-dd')).toBe('1900-03-01')
    expect(formatDate(0, 'yyyy-mm-dd', true)).toBe('1904-01-01')
  })

  it('read names and references', () => {
    expect(columnIndex('A1')).toBe(0)
    expect(columnIndex('Z9')).toBe(25)
    expect(columnIndex('BC12')).toBe(54)
    expect(unescapeXML('a &amp; b &lt;c&gt; &#233; &#x1F31E; &bogus;')).toBe(
      'a & b <c> é 🌞 &bogus;',
    )
  })
})
