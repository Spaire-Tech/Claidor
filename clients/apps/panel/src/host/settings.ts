/**
 * The stamp: a lineage id written into the document itself.
 *
 * The panel opens inside PowerPoint with a deck already on screen and has
 * to work out which artifact it is. Everything else it could go on is a
 * guess — a filename is wrong the moment two deals hold a « model.xlsx »,
 * and a content hash changes the instant somebody types.
 *
 * `Office.context.document.settings` is a small key/value store that lives
 * inside the file. Write the lineage id there once, when a person picks
 * the deal, and every later open is a lookup rather than a guess. It
 * survives Save As, a rename, and being emailed to somebody else.
 *
 * **The lineage, not the artifact id.** An artifact id changes on every
 * upload; the thing a banker means by « this deck » does not.
 *
 * Two hosts do not have this store. Outlook has `roamingSettings`, which
 * belongs to the mailbox rather than to any document — a draft is not a
 * file, and there is nothing to stamp. Both cases return `null` and the
 * panel asks, which is the honest outcome and not a failure.
 */

const KEY = 'claidor.lineage_id'

function hasDocumentSettings(): boolean {
  return (
    typeof Office !== 'undefined' && Boolean(Office.context?.document?.settings)
  )
}

export function readStamp(): string | null {
  if (!hasDocumentSettings()) return null
  const value = Office.context.document.settings.get(KEY)
  return typeof value === 'string' && value.length > 0 ? value : null
}

export async function writeStamp(lineageId: string): Promise<boolean> {
  if (!hasDocumentSettings()) return false
  Office.context.document.settings.set(KEY, lineageId)
  return new Promise((resolve) => {
    // `set` only touches the in-memory copy. Without `saveAsync` the stamp
    // is gone the moment the document closes, which is exactly when it was
    // needed — and nothing about the failure would be visible until the
    // next open.
    Office.context.document.settings.saveAsync((result) => {
      resolve(result.status === Office.AsyncResultStatus.Succeeded)
    })
  })
}

/** Forget the stamp, for « this is the wrong deal ». */
export async function clearStamp(): Promise<boolean> {
  if (!hasDocumentSettings()) return false
  Office.context.document.settings.remove(KEY)
  return new Promise((resolve) => {
    Office.context.document.settings.saveAsync((result) => {
      resolve(result.status === Office.AsyncResultStatus.Succeeded)
    })
  })
}

/**
 * The open file's name, or null.
 *
 * `Office.context.document.url` is a full path on desktop and a URL on the
 * web, and is empty for a document that has never been saved — which is a
 * real state, not an error: a deck being built from scratch has no name
 * until somebody gives it one.
 */
export function filenameFromUrl(): string | null {
  const url = Office.context?.document?.url
  if (!url) return null
  const cleaned = url.split(/[?#]/)[0]
  const parts = cleaned.split(/[\\/]/)
  const name = parts[parts.length - 1]
  return name ? decodeURIComponent(name) : null
}
