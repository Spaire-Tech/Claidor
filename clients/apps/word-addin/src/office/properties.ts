import { runWord } from "./run";

/**
 * Stamp the Claidor review status into the document's STANDARD custom properties
 * (`document.properties.customProperties`, WordApi 1.3). Unlike the sign-off
 * ledger (custom XML, invisible to anything but this add-in), these show in
 * Word's native File > Info > Properties and are read by DMS/records systems
 * (iManage, NetDocuments), so a reviewer or system sees the status without
 * opening the pane. Standard OOXML metadata that travels with the .docx.
 *
 * Values are capped at 255 chars (the OOXML custom-property limit).
 */

const KEYS = {
  status: "ClaidorReviewStatus",
  by: "ClaidorReviewedBy",
  at: "ClaidorReviewedAt",
  type: "ClaidorContractType",
} as const;

export interface ClaidorReviewStamp {
  /** e.g. "Signed off", "Pending sign-off", "Reviewed - clear to send". */
  status: string;
  by?: string;
  /** ISO timestamp; defaults to now. */
  at?: string;
  contractType?: string;
}

function cap(v: string): string {
  return v.length > 255 ? v.slice(0, 255) : v;
}

export async function stampClaidorReview(stamp: ClaidorReviewStamp): Promise<void> {
  return runWord(async (context) => {
    const props = context.document.properties.customProperties;
    // add() creates or overwrites, so re-stamping updates in place.
    props.add(KEYS.status, cap(stamp.status));
    props.add(KEYS.at, cap(stamp.at || new Date().toISOString()));
    if (stamp.by) props.add(KEYS.by, cap(stamp.by));
    if (stamp.contractType) props.add(KEYS.type, cap(stamp.contractType));
    await context.sync();
  });
}
