/**
 * Excel: the easy host, because a cell reference is already a coordinate.
 *
 * Everywhere else the server has to invent a way of saying « here ». A
 * model cell says it natively — `DCF!D42` means the same thing to the
 * reader, to the audit, to a banker reading a finding, and to `getRange`.
 *
 * So the anchor for an audit finding is the ref, and this bridge is short.
 * What it still has to get right is the sheet: `getRange('D42')` on the
 * active worksheet lands on whatever tab happens to be in front, which is
 * a jump to the wrong number rather than no jump at all.
 */

import { filenameFromUrl, readStamp, writeStamp } from './settings'
import type { Anchor, GoToResult, HostBridge, OpenDocument } from './types'

/**
 * `DCF!D42` → sheet and address; a bare `D42` → address only.
 *
 * Exported for its own test: getting this wrong sends the reader to the
 * right address on the wrong tab, which looks like a working jump.
 */
export function splitRef(ref: string): {
  sheet: string | null
  address: string
} {
  const at = ref.lastIndexOf('!')
  if (at < 0) return { sheet: null, address: ref }
  // Excel quotes sheet names containing spaces — 'Free Cash Flow'!D42 —
  // and doubles any apostrophe inside them.
  const sheet = ref.slice(0, at).replace(/^'|'$/g, '').replace(/''/g, "'")
  return { sheet, address: ref.slice(at + 1) }
}

async function activeSheetIndex(): Promise<number | null> {
  try {
    return await Excel.run(async (context) => {
      const sheet = context.workbook.worksheets.getActiveWorksheet()
      sheet.load('position')
      await context.sync()
      return sheet.position + 1
    })
  } catch {
    return null
  }
}

export const excel: HostBridge = {
  host: 'excel',

  async read(): Promise<OpenDocument> {
    return {
      host: 'excel',
      filename: filenameFromUrl(),
      lineageId: readStamp(),
      currentPage: await activeSheetIndex(),
    }
  },

  stamp: writeStamp,

  async goTo(anchor: Anchor): Promise<GoToResult> {
    const ref = anchor.ref
    if (!ref) {
      return { moved: false, by: 'none', reason: 'this finding names no cell' }
    }

    const { sheet, address } = splitRef(ref)
    const name = anchor.sheet || sheet

    return Excel.run(async (context) => {
      const worksheet = name
        ? context.workbook.worksheets.getItemOrNullObject(name)
        : context.workbook.worksheets.getActiveWorksheet()
      worksheet.load('isNullObject')
      await context.sync()

      if ((worksheet as { isNullObject?: boolean }).isNullObject) {
        return {
          moved: false,
          by: 'none',
          reason: `this workbook has no sheet called « ${name} »`,
        }
      }

      // Activating first, because selecting a range on a sheet nobody is
      // looking at moves the selection and not the view.
      worksheet.activate()
      const range = worksheet.getRange(address)
      range.select()
      await context.sync()
      return { moved: true, by: 'cell' }
    }).catch((error: unknown) => ({
      moved: false,
      by: 'none',
      reason:
        error instanceof Error
          ? error.message
          : 'Excel refused to go to that cell',
    }))
  },
}
