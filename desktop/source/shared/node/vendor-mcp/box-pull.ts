// The Mac's side of the two-way copy of the vendor connector store (24
// September 2026, evening). The agent's InstallPlugin and UninstallPlugin
// run in the box, so a vendor connector the agent installed exists in the
// box's copy first. Before the Mac reads its own store it merges the box's
// copy in, with the Mac as authority; without this the connect card, which
// runs on the Mac, found no row for the connector and the sign-in never
// started. One pull at a time, remembered for a moment, and bounded, so a
// cold box costs a read a few seconds and not a hang.

import { adoptVendorMcpStore } from "./installs.js";

export const BOX_VENDOR_MCP_STORE_PULL_FRESH_MS = 2_000;
export const BOX_VENDOR_MCP_STORE_PULL_TIMEOUT_MS = 3_000;

/** After a failed pull, how long the box is left alone before the next read tries again. */
export const BOX_STORE_PULL_FAILURE_HOLD_MS = 30_000;

export interface BoxVendorMcpStorePullOptions {
  readonly rootDir: () => string;
  /** `refreshMcp({ routedAction: "vendor-mcp-store" })` on the coordinator leg; absent means nothing to pull from. */
  readonly readBoxVendorMcpStore?: () => Promise<unknown>;
  readonly onMerged?: () => void;
  readonly now?: () => number;
  readonly freshMs?: number;
  readonly timeoutMs?: number;
  readonly log?: (message: string) => void;
}

export function createBoxVendorMcpStorePull(options: BoxVendorMcpStorePullOptions): () => Promise<void> {
  const now = options.now ?? (() => Date.now());
  const freshMs = options.freshMs ?? BOX_VENDOR_MCP_STORE_PULL_FRESH_MS;
  const timeoutMs = options.timeoutMs ?? BOX_VENDOR_MCP_STORE_PULL_TIMEOUT_MS;
  let lastAtMs = -Infinity;
  // A box that did not answer is not asked again for a while (ledger F-172):
  // with Docker off every listing used to wait the full timeout.
  let holdUntilMs = -Infinity;
  let inFlight: Promise<void> | null = null;
  return async () => {
    const read = options.readBoxVendorMcpStore;
    if (read == null) return;
    if (inFlight != null) return inFlight;
    if (now() - lastAtMs < freshMs || now() < holdUntilMs) return;
    inFlight = (async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const answer = await Promise.race([
          read(),
          new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error(`the box did not answer within ${timeoutMs} ms`)), timeoutMs); }),
        ]);
        const store = typeof answer === "object" && answer != null && "vendorMcpStore" in answer ? (answer as { vendorMcpStore: unknown }).vendorMcpStore : answer;
        if (store === undefined || store === null) return;
        if (adoptVendorMcpStore(options.rootDir(), store, "local").changed) options.onMerged?.();
      } catch (error) {
        options.log?.(`vendor-mcp pull from the box skipped: ${error instanceof Error ? error.message : String(error)}`);
        holdUntilMs = now() + BOX_STORE_PULL_FAILURE_HOLD_MS;
      } finally {
        if (timer != null) clearTimeout(timer);
        lastAtMs = now();
        inFlight = null;
      }
    })();
    return inFlight;
  };
}
