/**
 * A marker on the cloud computer that switches its browser's token off: a
 * small file at a fixed place, there while the kill switch is on and gone
 * while it is off.
 */
import { promises as fs } from "node:fs";

export const UA_TOKEN_DISABLED_MARKER_PATH = "/tmp/sand-ua-token-disabled";

/**
 * What it hands back brings the marker in line with the switch. Calls are
 * taken one after another, and each asks the switch when its turn comes,
 * not when it was made. Nothing touches the disk while the switch says what
 * the marker was last brought to say. A failure on the disk is told to the
 * log and the same work is done again by the next call.
 */
export function createUaTokenKillSwitchReconciler(options: { readonly path?: string; readonly isKillSwitchEnabled: () => boolean; readonly log: (message: string) => void }) {
  const marker = options.path ?? UA_TOKEN_DISABLED_MARKER_PATH;
  /** What the marker was last brought to say. Nothing yet, until the first time. */
  let broughtTo: boolean | null = null;
  /** Every call so far, in a row: a new one waits for all of them. */
  let inARow = Promise.resolve();

  const bringInLine = async (): Promise<void> => {
    const switchedOff = options.isKillSwitchEnabled();
    if (switchedOff === broughtTo) return;
    try {
      await (switchedOff ? fs.writeFile(marker, "1\n", { encoding: "utf8", mode: 0o644 }) : fs.rm(marker, { force: true }));
      broughtTo = switchedOff;
    } catch (error) {
      options.log(`ua-token kill-switch marker update failed: ${String(error)}`);
    }
  };

  return () => {
    inARow = inARow.then(bringInLine);
    return inARow;
  };
}
