// The person's 1Password, as the agent's computer holds it (28 October 2026).
// The upstream app's way, which the founder chose: on the Mac, Simeon asks the
// person's 1Password app (with Touch ID) for a vault named "Shared with
// Simeon" and a read-only service-account key for it, and sends the key here
// (`connectOnePassword`). The key is kept in the engine's own folder (0600),
// never in the agent's environment, and used only by the engine through
// `op` (`op-cli.ts`). The agent sees which logins are in the vault for a site
// (ListCredentials: their names and ids), never a username, a password or a
// code; those are read only to be typed into the page (`readLogin`).

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ensureOpCli, runOp, type OpResult } from "./op-cli.js";

export const ONEPASSWORD_VAULT_NAME = "Shared with Simeon";

export interface OnePasswordConnection {
  readonly token: string;
  readonly vaultId: string;
  readonly vaultName: string;
  readonly accountEmail?: string;
  readonly connectedAtMs: number;
}

/** A login in the shared vault, as the agent may see it: never its username or password. */
export interface LoginSummary {
  readonly credentialId: string;
  readonly title: string;
  /** The site it is saved for, "acme.com". */
  readonly site: string;
  readonly revision: number;
  readonly vaultId: string;
}

/** What is typed into a page. Held only for the fill. */
export interface LoginSecrets {
  readonly username?: string;
  readonly password?: string;
  readonly otp?: string;
}

type Answer<T> = ({ readonly ok: true } & T) | { readonly ok: false; readonly message: string; readonly notConnected?: boolean };

const TOKEN = /^ops_[A-Za-z0-9_-]{20,4096}$/;
const ID = /^[a-z0-9]{10,64}$/i;

/** "acme.com" from an address or a domain, without "www.". */
export function siteOf(value: string): string {
  try {
    return new URL(value.includes("://") ? value : `https://${value}`).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

/** A login saved for acme.com is for acme.com and its subdomains (login.acme.com), never for another site. */
export function loginIsForSite(saved: string, site: string): boolean {
  const kept = siteOf(saved), wanted = siteOf(site);
  return kept.length > 0 && wanted.length > 0 && (wanted === kept || wanted.endsWith(`.${kept}`));
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value != null && !Array.isArray(value);
const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

export interface OnePasswordOptions {
  /** The engine's own folder for 1Password: the key, the tool and its settings. */
  readonly dir: string;
  readonly ensureOp?: () => Promise<string>;
  readonly run?: (opPath: string, args: readonly string[], options: { readonly token: string; readonly home: string; readonly timeoutMs?: number }) => Promise<OpResult>;
  readonly now?: () => number;
}

export class OnePassword {
  private cache: { readonly at: number; readonly vaultId: string; readonly items: readonly Record<string, unknown>[] } | undefined;

  constructor(private readonly options: OnePasswordOptions) {}

  private get file(): string { return join(this.options.dir, "connection.json"); }
  private now(): number { return (this.options.now ?? Date.now)(); }

  connection(): OnePasswordConnection | undefined {
    try {
      const saved = JSON.parse(readFileSync(this.file, "utf8")) as Record<string, unknown>;
      const token = text(saved.token), vaultId = text(saved.vaultId);
      if (!TOKEN.test(token) || !ID.test(vaultId)) return undefined;
      return { token, vaultId, vaultName: text(saved.vaultName) || ONEPASSWORD_VAULT_NAME, ...(text(saved.accountEmail).length > 0 ? { accountEmail: text(saved.accountEmail) } : {}), connectedAtMs: Number(saved.connectedAtMs) || 0 };
    } catch {
      return undefined;
    }
  }

  private async op(args: readonly string[], connection: Pick<OnePasswordConnection, "token">): Promise<OpResult> {
    let path: string;
    try {
      path = await (this.options.ensureOp ?? (() => ensureOpCli(this.options.dir)))();
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
    return await (this.options.run ?? runOp)(path, args, { token: connection.token, home: join(this.options.dir, "home") });
  }

  /** Keeps the key once 1Password says it opens the vault; a key that doesn't is refused and not kept. */
  async connect(input: { readonly token: unknown; readonly vaultId: unknown; readonly vaultName?: unknown; readonly accountEmail?: unknown }): Promise<Answer<{ readonly vaultName: string }>> {
    const token = text(input.token), vaultId = text(input.vaultId);
    if (!TOKEN.test(token)) return { ok: false, message: "That isn't a 1Password service-account key." };
    if (!ID.test(vaultId)) return { ok: false, message: "That isn't a 1Password vault." };
    const checked = await this.op(["vault", "get", vaultId, "--format", "json"], { token });
    if (!checked.ok) return { ok: false, message: `1Password refused the key: ${checked.message}` };
    let vaultName = text(input.vaultName) || ONEPASSWORD_VAULT_NAME;
    try { vaultName = text((JSON.parse(checked.stdout) as Record<string, unknown>).name) || vaultName; } catch { /* the name it was given */ }
    mkdirSync(this.options.dir, { recursive: true, mode: 0o700 });
    const email = text(input.accountEmail);
    writeFileSync(this.file, JSON.stringify({ token, vaultId, vaultName, ...(email.length > 0 ? { accountEmail: email } : {}), connectedAtMs: this.now() }), { mode: 0o600 });
    this.cache = undefined;
    return { ok: true, vaultName };
  }

  disconnect(): void {
    rmSync(this.file, { force: true });
    this.cache = undefined;
  }

  /** The logins in the shared vault saved for the site, newest list unless one was read in the last five minutes. */
  async listLogins(site: string, options: { readonly forceRefresh?: boolean } = {}): Promise<Answer<{ readonly logins: readonly LoginSummary[] }>> {
    const connection = this.connection();
    if (connection == null) return { ok: false, notConnected: true, message: "1Password isn't connected." };
    if (siteOf(site).length === 0) return { ok: false, message: "Give the page's address or its domain." };
    if (options.forceRefresh === true || this.cache == null || this.cache.vaultId !== connection.vaultId || this.now() - this.cache.at > 5 * 60_000) {
      const listed = await this.op(["item", "list", "--vault", connection.vaultId, "--categories", "Login", "--format", "json"], connection);
      if (!listed.ok) return { ok: false, message: `1Password: ${listed.message}` };
      let items: unknown;
      try { items = JSON.parse(listed.stdout); } catch { return { ok: false, message: "1Password's answer couldn't be read." }; }
      this.cache = { at: this.now(), vaultId: connection.vaultId, items: Array.isArray(items) ? items.filter(isRecord) : [] };
    }
    const logins: LoginSummary[] = [];
    for (const item of this.cache.items) {
      const id = text(item.id);
      const urls = (Array.isArray(item.urls) ? item.urls : []).filter(isRecord).map((url) => text(url.href)).filter((href) => href.length > 0);
      const saved = urls.find((href) => loginIsForSite(href, site));
      if (!ID.test(id) || saved == null) continue;
      logins.push({ credentialId: id, title: text(item.title) || siteOf(saved), site: siteOf(saved), revision: Number(item.version) || 0, vaultId: connection.vaultId });
    }
    return { ok: true, logins };
  }

  /** One login's username, password and current one-time code, for the fill only; refused for another site. */
  async readLogin(credentialId: string, site: string): Promise<Answer<{ readonly title: string; readonly secrets: LoginSecrets }>> {
    const connection = this.connection();
    if (connection == null) return { ok: false, notConnected: true, message: "1Password isn't connected." };
    if (!ID.test(credentialId)) return { ok: false, message: "That isn't a 1Password login." };
    const got = await this.op(["item", "get", credentialId, "--vault", connection.vaultId, "--reveal", "--format", "json"], connection);
    if (!got.ok) return { ok: false, message: `1Password: ${got.message}` };
    let item: Record<string, unknown>;
    try { item = JSON.parse(got.stdout) as Record<string, unknown>; } catch { return { ok: false, message: "1Password's answer couldn't be read." }; }
    const urls = (Array.isArray(item.urls) ? item.urls : []).filter(isRecord).map((url) => text(url.href));
    if (!urls.some((href) => loginIsForSite(href, site))) return { ok: false, message: `That login isn't saved for ${siteOf(site)}.` };
    const fields = (Array.isArray(item.fields) ? item.fields : []).filter(isRecord);
    const value = (field: Record<string, unknown> | undefined): string | undefined => {
      const raw = typeof field?.value === "string" ? field.value : undefined;
      return raw != null && raw.length > 0 ? raw : undefined;
    };
    const username = value(fields.find((field) => field.purpose === "USERNAME"));
    const password = value(fields.find((field) => field.purpose === "PASSWORD"));
    let otp: string | undefined;
    const otpField = fields.find((field) => field.type === "OTP");
    if (otpField != null) {
      otp = typeof otpField.totp === "string" && otpField.totp.length > 0 ? otpField.totp : undefined;
      if (otp == null) {
        const code = await this.op(["item", "get", credentialId, "--vault", connection.vaultId, "--otp"], connection);
        if (code.ok && code.stdout.trim().length > 0) otp = code.stdout.trim();
      }
    }
    return { ok: true, title: text(item.title), secrets: { ...(username == null ? {} : { username }), ...(password == null ? {} : { password }), ...(otp == null ? {} : { otp }) } };
  }

  /** Whether the engine keeps a connection (for the brief's and the cards' answers). */
  isConnected(): boolean {
    return existsSync(this.file) && this.connection() != null;
  }
}
