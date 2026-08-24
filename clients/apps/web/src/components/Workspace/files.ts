/**
 * What kind of file a name is, and what it wears.
 *
 * These lived in the Check-a-model screen; the screen left the product
 * with the Swens design (its bench is off the dock), and the mapping
 * stayed because the folder browser reads it. Same suffix table as the
 * server's `ingest.SUFFIXES`.
 */

import { fileIcon } from './design'

/** What each kind of file wears, same mapping as the deal page. */
export const iconOf = (kind: string): string => {
  if (kind === 'model') return fileIcon.xls
  if (kind === 'deck') return fileIcon.ppt
  if (kind === 'message') return fileIcon.mail
  return fileIcon.doc
}

export const kindFor = (filename: string): string => {
  const lower = filename.toLowerCase()
  if (/\.(xlsx|xlsm|xls|xlt)$/.test(lower)) return 'model'
  if (/\.(pptx|pptm)$/.test(lower)) return 'deck'
  if (/\.(docx|doc)$/.test(lower)) return 'memo'
  return 'file'
}
