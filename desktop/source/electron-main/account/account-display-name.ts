import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { getSandRootDir } from "../../host/host-paths.js";

export const ACCOUNT_DISPLAY_NAME_FILE = "account-display-name";

export function isUnimplementedProfileError(error: unknown): boolean {
  if (typeof error !== "object" || error == null) return false;
  const code = (error as { code?: unknown }).code;
  const message = error instanceof Error ? error.message : String(error);
  return code === 12 || code === "unimplemented" || code === "UNIMPLEMENTED" || /unimplemented/i.test(message);
}

export function localAccountDisplayNamePath(root = getSandRootDir()): string {
  return join(root, ACCOUNT_DISPLAY_NAME_FILE);
}

export function readLocalAccountDisplayName(root = getSandRootDir()): string | undefined {
  try {
    const trimmed = readFileSync(localAccountDisplayNamePath(root), "utf8").replace(/\s+/g, " ").trim();
    return trimmed.length > 0 ? trimmed : undefined;
  } catch {
    return undefined;
  }
}

export function writeLocalAccountDisplayName(name: string, root = getSandRootDir()): string {
  const trimmed = name.replace(/\s+/g, " ").trim();
  const path = localAccountDisplayNamePath(root);
  mkdirSync(dirname(path), { recursive: true });
  if (trimmed.length === 0) {
    try { unlinkSync(path); } catch { /* already gone */ }
    return "";
  }
  writeFileSync(path, `${trimmed}\n`, "utf8");
  return trimmed;
}

export async function persistAccountDisplayName(name: string, remote?: () => Promise<void>, root = getSandRootDir()): Promise<void> {
  writeLocalAccountDisplayName(name, root);
  if (remote == null) return;
  try { await remote(); }
  catch (error) { if (!isUnimplementedProfileError(error)) throw error; }
}
