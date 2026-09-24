// The Mac's side of the two-way copy of the account MCP store (24 September
// 2026). The agent's AddMcpServer, UninstallMcpServer and plugin tools run
// in the box (product turns run there), so the box's copy is where those
// writes land. Before the Mac reads its own store it merges the box's copy
// in; without this a server the agent added would not be in Settings, and
// its connect card, which runs on the Mac, would find no row. One pull at a
// time, remembered for a moment, and bounded, so a cold box costs a read a
// few seconds and not a hang.

import { adoptAccountMcpStore } from "./store.js";

/** How long a pulled copy of the box's store is trusted before the next read pulls again. */
export const BOX_ACCOUNT_MCP_STORE_PULL_FRESH_MS = 2_000;
/** How long a pull may take before the read goes on with the Mac's own file. */
export const BOX_ACCOUNT_MCP_STORE_PULL_TIMEOUT_MS = 3_000;

export interface BoxAccountMcpStorePullOptions {
  readonly rootDir: () => string;
  /** `refreshMcp({ routedAction: "account-mcp-store" })` on the coordinator leg; absent means nothing to pull from. */
  readonly readBoxAccountMcpStore?: () => Promise<unknown>;
  readonly onMerged?: () => void;
  readonly now?: () => number;
  readonly freshMs?: number;
  readonly timeoutMs?: number;
  readonly log?: (message: string) => void;
}

export function createBoxAccountMcpStorePull(options: BoxAccountMcpStorePullOptions): () => Promise<void> {
  const now = options.now ?? (() => Date.now());
  const freshMs = options.freshMs ?? BOX_ACCOUNT_MCP_STORE_PULL_FRESH_MS;
  const timeoutMs = options.timeoutMs ?? BOX_ACCOUNT_MCP_STORE_PULL_TIMEOUT_MS;
  let lastAtMs = -Infinity;
  let inFlight: Promise<void> | null = null;
  return async () => {
    const read = options.readBoxAccountMcpStore;
    if (read == null) return;
    if (inFlight != null) return inFlight;
    if (now() - lastAtMs < freshMs) return;
    inFlight = (async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const answer = await Promise.race([
          read(),
          new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error(`the box did not answer within ${timeoutMs} ms`)), timeoutMs); }),
        ]);
        const store = typeof answer === "object" && answer != null && "accountMcpStore" in answer ? (answer as { accountMcpStore: unknown }).accountMcpStore : answer;
        if (store === undefined || store === null) return;
        if (adoptAccountMcpStore(options.rootDir(), store).changed) options.onMerged?.();
      } catch (error) {
        options.log?.(`account-mcp pull from the box skipped: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        if (timer != null) clearTimeout(timer);
        lastAtMs = now();
        inFlight = null;
      }
    })();
    return inFlight;
  };
}
