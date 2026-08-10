/**
 * Outlook: the surface where being wrong is permanent.
 *
 * Everywhere else a mistake is caught before anybody outside sees it. A
 * draft with the deck attached is the last moment that is still true, and
 * a panel that says *« the attached deck has three figures that do not
 * match the model »* before Send is worth more than the same sentence
 * anywhere else in the product.
 *
 * Outlook differs from the other three in two ways that matter here.
 *
 * **There is no document to stamp.** `Office.context.document` does not
 * exist; a draft is not a file. `roamingSettings` belongs to the mailbox,
 * so writing a lineage id there would attach one deal to every message
 * this person ever writes. So `stamp` returns false and the panel resolves
 * the deal from the *attachment*, which is a real file with a real name.
 *
 * **Nothing can be selected.** There is no cursor to move to a figure in
 * an attachment nobody has opened. `goTo` says so rather than pretending,
 * and the panel shows the finding in the pane instead — which in a 320px
 * column beside a draft is what a person wanted anyway.
 */

import type { GoToResult, HostBridge, OpenDocument } from './types'

/** The attachments on the draft, for resolving which deal this is about. */
export interface DraftAttachment {
  id: string
  name: string
  size: number
}

export function attachments(): DraftAttachment[] {
  const item = Office.context?.mailbox?.item
  const list = item?.attachments ?? []
  return list.map((one) => ({ id: one.id, name: one.name, size: one.size }))
}

/**
 * The first attachment this product can read anything out of.
 *
 * A draft carrying a deck, a model and a signature image should resolve to
 * the deck, and the signature should never be offered as a candidate.
 */
const READABLE = /\.(pptx|pptm|xlsx|xlsm|xls|xlt|docx)$/i

/** Exported for its own test — the choice, without Outlook attached. */
export function pickReadable(list: DraftAttachment[]): DraftAttachment | null {
  return list.find((one) => READABLE.test(one.name)) ?? null
}

export function firstReadable(): DraftAttachment | null {
  return pickReadable(attachments())
}

export const outlook: HostBridge = {
  host: 'outlook',

  async read(): Promise<OpenDocument> {
    return {
      host: 'outlook',
      // The attachment's name, not the message's subject: what is being
      // checked is the file, and the file is what the deal knows about.
      filename: firstReadable()?.name ?? null,
      lineageId: null,
      currentPage: null,
    }
  },

  async stamp(): Promise<boolean> {
    // Nothing to write to. Saying so is the point — a silent success here
    // would make the panel stop asking and start guessing forever.
    return false
  },

  // Takes no anchor, because there is nowhere in a mail item to go. The
  // signature is the bridge's; this host answers the same way whatever it
  // is handed.
  async goTo(): Promise<GoToResult> {
    return {
      moved: false,
      by: 'none',
      reason:
        'the deck is an attachment — open it in PowerPoint to jump to a slide',
    }
  },
}
