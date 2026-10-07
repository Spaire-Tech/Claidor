/**
 * Whose connectors a store file holds (7 October 2026).
 *
 * The Mac keeps the person's connectors in two files, `vendor-mcp-installs.json`
 * (Connect apps) and `account-mcp-config.json` (custom servers and plugins).
 * They sat once per Mac in the data folder, so a second Simeon account signed
 * in on the same Mac read, used and pushed to its own cloud computer the first
 * account's connectors and their tokens. On the Mac each account now has its
 * own folder, `accounts/<scope>/`, the scope being the hash of the account the
 * settings are scoped to (the one the box secrets use). Signed out, the Mac
 * reads `accounts/signed-out/`, which belongs to no account.
 *
 * The cloud computer belongs to one account, so the box never registers a
 * scope and keeps its files where they were.
 *
 * Files from before this change are adopted, once, by the account the Mac is
 * scoped to when it first resolves a folder: on an install used by one account,
 * that account. When that account already has its own file, the old one is set
 * aside in `accounts/unassigned/` and read by no one.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, renameSync } from "node:fs";
import { join } from "node:path";

export const CONNECTOR_ACCOUNTS_DIRNAME = "accounts";
export const CONNECTOR_SIGNED_OUT_DIRNAME = "signed-out";
export const CONNECTOR_UNASSIGNED_DIRNAME = "unassigned";
export const CONNECTOR_STORE_FILENAMES = Object.freeze(["vendor-mcp-installs.json", "account-mcp-config.json"]);

const SCOPE_PATTERN = /^[0-9a-f]{64}$/;

let readAccountScope: (() => string | null | undefined) | undefined;

/** The Mac calls this once, with the settings' account scope; the box never does. */
export function scopeConnectorStoresToAccount(getAccountScope: () => string | null | undefined): void {
  readAccountScope = getAccountScope;
}

/** For tests: back to one folder for everything, as in the box. */
export function resetConnectorStoreScope(): void {
  readAccountScope = undefined;
}

function folderName(scope: string): string {
  return SCOPE_PATTERN.test(scope) ? scope : createHash("sha256").update(scope).digest("hex");
}

function adoptEarlierFiles(rootDir: string, accountDir: string): void {
  for (const name of CONNECTOR_STORE_FILENAMES) {
    const earlier = join(rootDir, name);
    if (!existsSync(earlier)) continue;
    const target = join(accountDir, name);
    const destination = existsSync(target) ? join(rootDir, CONNECTOR_ACCOUNTS_DIRNAME, CONNECTOR_UNASSIGNED_DIRNAME, String(Date.now()), name) : target;
    try {
      mkdirSync(join(destination, ".."), { recursive: true, mode: 0o700 });
      renameSync(earlier, destination);
    } catch {
      // Another process moved it first, or the disk refused: the next read tries again.
    }
  }
}

/** The folder whose connector files belong to the account signed in now. */
export function connectorStoreDir(rootDir: string): string {
  if (readAccountScope === undefined) return rootDir;
  let scope: string | null | undefined;
  try { scope = readAccountScope(); } catch { scope = undefined; }
  if (typeof scope !== "string" || scope.length === 0) return join(rootDir, CONNECTOR_ACCOUNTS_DIRNAME, CONNECTOR_SIGNED_OUT_DIRNAME);
  const accountDir = join(rootDir, CONNECTOR_ACCOUNTS_DIRNAME, folderName(scope));
  adoptEarlierFiles(rootDir, accountDir);
  return accountDir;
}
