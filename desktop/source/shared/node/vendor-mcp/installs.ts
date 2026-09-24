import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * What the vendor's sign-in left us (24 September 2026): a bearer token for
 * the MCP endpoint, the refresh token when the vendor gave one, and the two
 * things a refresh needs. The Mac is the only writer of a credential; the
 * host in the box receives a copy through the settings sync and never
 * refreshes it itself, so a rotating refresh token is used by one party.
 */
export interface VendorMcpCredential {
  readonly accessToken: string;
  readonly refreshToken?: string;
  readonly expiresAtMs?: number;
  readonly tokenEndpoint: string;
  readonly clientId: string;
}

export interface VendorMcpInstall {
  readonly id: string;
  readonly url: string;
  /** True once a credential is held; kept as a field so old files still read. */
  readonly connected: boolean;
  readonly credential?: VendorMcpCredential;
}

function parseCredential(value: unknown): VendorMcpCredential | undefined {
  if (typeof value !== "object" || value == null || Array.isArray(value)) return undefined;
  const row = value as Record<string, unknown>;
  if (typeof row.accessToken !== "string" || row.accessToken.length === 0) return undefined;
  if (typeof row.tokenEndpoint !== "string" || typeof row.clientId !== "string") return undefined;
  return {
    accessToken: row.accessToken,
    ...(typeof row.refreshToken === "string" && row.refreshToken.length > 0 ? { refreshToken: row.refreshToken } : {}),
    ...(typeof row.expiresAtMs === "number" && Number.isFinite(row.expiresAtMs) ? { expiresAtMs: row.expiresAtMs } : {}),
    tokenEndpoint: row.tokenEndpoint,
    clientId: row.clientId,
  };
}

export function parseVendorMcpInstalls(parsed: unknown): VendorMcpInstall[] {
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((item): VendorMcpInstall[] => {
    if (typeof item !== "object" || item == null || Array.isArray(item)) return [];
    const row = item as Record<string, unknown>;
    if (typeof row.id !== "string" || typeof row.url !== "string") return [];
    const credential = parseCredential(row.credential);
    return [{ id: row.id, url: row.url, connected: row.connected === true || credential != null, ...(credential == null ? {} : { credential }) }];
  });
}

export function vendorMcpInstallsPath(rootDir: string): string {
  return join(rootDir, "vendor-mcp-installs.json");
}

export function loadVendorMcpInstalls(rootDir: string): VendorMcpInstall[] {
  const path = vendorMcpInstallsPath(rootDir);
  if (!existsSync(path)) return [];
  try {
    return parseVendorMcpInstalls(JSON.parse(readFileSync(path, "utf8")) as unknown);
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

/** Records an install; an existing credential survives a re-install, so "Connect" twice does not sign the person out. */
export function upsertVendorMcpInstall(rootDir: string, install: VendorMcpInstall): VendorMcpInstall[] {
  const current = loadVendorMcpInstalls(rootDir);
  const previous = current.find((item) => item.id === install.id);
  const credential = install.credential ?? previous?.credential;
  const next = current.filter((item) => item.id !== install.id);
  next.push({ id: install.id, url: install.url, connected: install.connected || credential != null, ...(credential == null ? {} : { credential }) });
  saveVendorMcpInstalls(rootDir, next);
  return next;
}

export function vendorMcpInstallById(rootDir: string, id: string): VendorMcpInstall | undefined {
  return loadVendorMcpInstalls(rootDir).find((item) => item.id === id);
}

export function setVendorMcpCredential(rootDir: string, id: string, credential: VendorMcpCredential): VendorMcpInstall | undefined {
  const current = vendorMcpInstallById(rootDir, id);
  if (current == null) return undefined;
  const next: VendorMcpInstall = { id, url: current.url, connected: true, credential };
  upsertVendorMcpInstall(rootDir, next);
  return next;
}

export function clearVendorMcpCredential(rootDir: string, id: string): boolean {
  const current = vendorMcpInstallById(rootDir, id);
  if (current?.credential == null) return false;
  const next = loadVendorMcpInstalls(rootDir).filter((item) => item.id !== id);
  next.push({ id, url: current.url, connected: false });
  saveVendorMcpInstalls(rootDir, next);
  return true;
}

/** The whole store as the Mac sends it to the host, and as the host writes it. */
export function replaceVendorMcpInstalls(rootDir: string, installs: unknown): VendorMcpInstall[] {
  const parsed = parseVendorMcpInstalls(installs);
  saveVendorMcpInstalls(rootDir, parsed);
  return parsed;
}

export function removeVendorMcpInstall(rootDir: string, id: string): boolean {
  const current = loadVendorMcpInstalls(rootDir);
  const next = current.filter((item) => item.id !== id);
  if (next.length === current.length) return false;
  saveVendorMcpInstalls(rootDir, next);
  return true;
}
