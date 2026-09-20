import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export interface VendorMcpInstall {
  readonly id: string;
  readonly url: string;
  readonly connected: boolean;
}

export function vendorMcpInstallsPath(rootDir: string): string {
  return join(rootDir, "vendor-mcp-installs.json");
}

export function loadVendorMcpInstalls(rootDir: string): VendorMcpInstall[] {
  const path = vendorMcpInstallsPath(rootDir);
  if (!existsSync(path)) return [];
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item): VendorMcpInstall[] => {
      if (typeof item !== "object" || item == null || Array.isArray(item)) return [];
      const row = item as Record<string, unknown>;
      if (typeof row.id !== "string" || typeof row.url !== "string") return [];
      return [{ id: row.id, url: row.url, connected: row.connected === true }];
    });
  } catch {
    return [];
  }
}

export function saveVendorMcpInstalls(rootDir: string, installs: readonly VendorMcpInstall[]): void {
  const path = vendorMcpInstallsPath(rootDir);
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(installs, null, 2)}\n`, "utf8");
  renameSync(temporary, path);
}

export function upsertVendorMcpInstall(rootDir: string, install: VendorMcpInstall): VendorMcpInstall[] {
  const next = loadVendorMcpInstalls(rootDir).filter((item) => item.id !== install.id);
  next.push(install);
  saveVendorMcpInstalls(rootDir, next);
  return next;
}

export function removeVendorMcpInstall(rootDir: string, id: string): boolean {
  const current = loadVendorMcpInstalls(rootDir);
  const next = current.filter((item) => item.id !== id);
  if (next.length === current.length) return false;
  saveVendorMcpInstalls(rootDir, next);
  return true;
}
