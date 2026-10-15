// Started connector sign-ins, kept on the box's disk as well as in memory
// (15 October 2026). The box starts a sign-in when the person taps Connect
// and finishes it when the vendor sends them back, minutes later; a host
// restart in between (a new host program, a recreated box) lost the
// in-memory note, and the finish failed with a server error the person could
// not act on. The host names the file (`persistPendingSignInsAt`); the Mac
// names none and keeps them in memory only, as before.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import type { VendorMcpOAuthPending } from "../vendor-mcp/oauth.js";

export type PendingSignInKind = "vendor" | "account";

interface SavedSignIn {
  readonly kind: PendingSignInKind;
  readonly state: string;
  readonly startedAtMs: number;
  readonly pending: VendorMcpOAuthPending;
}

let filePath: string | null = null;

export function persistPendingSignInsAt(path: string | null): void {
  filePath = path;
}

function read(): SavedSignIn[] {
  if (filePath == null) return [];
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8")) as { entries?: unknown };
    return Array.isArray(parsed.entries)
      ? parsed.entries.filter((entry): entry is SavedSignIn =>
          typeof entry === "object" && entry != null
          && typeof (entry as SavedSignIn).state === "string"
          && typeof (entry as SavedSignIn).startedAtMs === "number"
          && typeof (entry as SavedSignIn).pending === "object" && (entry as SavedSignIn).pending != null)
      : [];
  } catch {
    return [];
  }
}

function write(entries: readonly SavedSignIn[]): void {
  if (filePath == null) return;
  try {
    mkdirSync(dirname(filePath), { recursive: true });
    const temporary = `${filePath}.${process.pid}.tmp`;
    writeFileSync(temporary, `${JSON.stringify({ entries })}\n`, { mode: 0o600 });
    renameSync(temporary, filePath);
  } catch {
    // Memory still holds it; only a restart before the finish would lose it.
  }
}

export function savePendingSignIn(kind: PendingSignInKind, pending: VendorMcpOAuthPending, startedAtMs: number, ttlMs: number): void {
  if (filePath == null) return;
  const kept = read().filter((entry) => startedAtMs - entry.startedAtMs <= ttlMs && !(entry.kind === kind && entry.state === pending.state));
  write([...kept, { kind, state: pending.state, startedAtMs, pending }]);
}

/** The saved sign-in for this state, removed from the file; undefined when absent or older than `ttlMs`. */
export function takeSavedPendingSignIn(kind: PendingSignInKind, state: string, now: number, ttlMs: number): VendorMcpOAuthPending | undefined {
  if (filePath == null) return undefined;
  const entries = read();
  const found = entries.find((entry) => entry.kind === kind && entry.state === state);
  if (found == null) return undefined;
  write(entries.filter((entry) => entry !== found && now - entry.startedAtMs <= ttlMs));
  return now - found.startedAtMs > ttlMs ? undefined : found.pending;
}

/** The sentence when a vendor sends the person back and the box has no note of that sign-in. */
export const PENDING_SIGN_IN_LOST_MESSAGE = "This sign-in can't be finished: it was started more than 15 minutes ago, or Simeon's computer restarted in the meantime. Go back to Simeon and connect the app again.";
