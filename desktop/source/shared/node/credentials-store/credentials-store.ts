// The person's Credentials Store (28 October 2026; the founder, 29 October:
// "name it Credentials Store"): the logins and the contact info they keep
// in Settings for their agents, the way the upstream app's own vault keeps
// them. Simeon Labs' server holds them, sealed (`server/simeon/desktop/
// credentials.py`), so the apps change them while this computer sleeps and the
// agents use them while the Mac is closed. This computer asks for them as the
// person's computer: the list without a password, one login with its password
// when a sign-in needs it, a new login when an agent made a password at a
// sign-up or was given one in the chat. Cards are never here: Link holds them.

import { randomInt } from "node:crypto";
import { siteOf } from "../onepassword/onepassword.js";

export const CONTACT_FIELDS = ["fullName", "email", "phone", "addressLine1", "addressLine2", "city", "region", "postalCode", "country"] as const;
export type ContactField = (typeof CONTACT_FIELDS)[number];

export interface StoredLogin {
  readonly kind: "login";
  readonly id: string;
  /** The person's name for it; empty when they gave none (the site stands for it). */
  readonly name: string;
  readonly website: string;
  /** "acme.com", from the website; empty for a login with none. */
  readonly site: string;
  readonly username: string;
  readonly hasPassword: boolean;
  /** When to use it, in the person's words ("Tell Simeon when to use this entry"). */
  readonly hints: string;
  /** The agent that saved it, when one did. */
  readonly savedBy?: string;
}

export type StoredContact = { readonly kind: "contact"; readonly id: string; readonly name: string; readonly hints: string } & { readonly [field in ContactField]: string };

export type StoredEntry = StoredLogin | StoredContact;

/** One call to `/desktop/api/<path>` as this computer, the app's envelope opened (`simeonApiData`). */
export type CredentialsStoreApi = (path: string, request?: { readonly method?: "GET" | "POST" | "PATCH"; readonly json?: unknown }) => Promise<unknown>;

type Answer<T> = ({ readonly ok: true } & T) | { readonly ok: false; readonly message: string };

const ENTRY_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = (value: unknown): string => (typeof value === "string" ? value : "");
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value != null && !Array.isArray(value);
const failure = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** A login's name as the agent and the apps show it: the person's name for it, else its site. */
export function loginTitle(login: Pick<StoredLogin, "name" | "site" | "website">): string {
  return login.name.trim() || login.site || login.website || "Login";
}

export function isEntryId(value: string): boolean {
  return ENTRY_ID.test(value);
}

function readEntry(value: unknown): StoredEntry | undefined {
  if (!isRecord(value)) return undefined;
  const id = text(value.id);
  if (!isEntryId(id)) return undefined;
  if (value.kind === "login") {
    const website = text(value.website);
    return {
      kind: "login",
      id,
      name: text(value.name),
      website,
      site: text(value.site) || siteOf(website),
      username: text(value.username),
      hasPassword: value.hasPassword === true,
      hints: text(value.hints),
      ...(text(value.savedBy).length > 0 ? { savedBy: text(value.savedBy) } : {}),
    };
  }
  if (value.kind === "contact") {
    const fields = Object.fromEntries(CONTACT_FIELDS.map((field) => [field, text(value[field])])) as { [field in ContactField]: string };
    return { kind: "contact", id, name: text(value.name), hints: text(value.hints), ...fields };
  }
  return undefined;
}

/**
 * A strong password in Apple's own shape (three groups of six, a capital and
 * a digit among them, "kobwyc-Qinbe7-mocwux"): letters, digits and hyphens
 * every site takes, about 80 bits.
 */
export function makeStrongPassword(pick: (bound: number) => number = randomInt): string {
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const chars = Array.from({ length: 18 }, () => lower[pick(lower.length)] as string);
  const capital = pick(18);
  let digit = pick(17);
  if (digit >= capital) digit += 1;
  chars[capital] = upper[pick(upper.length)] as string;
  chars[digit] = digits[pick(digits.length)] as string;
  return [chars.slice(0, 6), chars.slice(6, 12), chars.slice(12)].map((group) => group.join("")).join("-");
}

/**
 * The site a new login is saved for: the page's host without a sign-up's own
 * subdomain (signup.acme.com and accounts.acme.com are acme.com), so the same
 * login fills acme.com's sign-in wherever it is.
 */
export function signUpSite(pageSite: string): string {
  const host = siteOf(pageSite);
  const labels = host.split(".");
  const own = new Set(["accounts", "account", "auth", "id", "login", "signin", "signup", "register", "join", "app", "my", "secure", "sso", "www"]);
  if (labels.length >= 3 && own.has(labels[0] as string)) return labels.slice(1).join(".");
  return host;
}

export function createCredentialsStore(api: CredentialsStoreApi) {
  const list = async (): Promise<Answer<{ readonly entries: readonly StoredEntry[] }>> => {
    try {
      const data = await api("credentials");
      const entries = isRecord(data) && Array.isArray(data.entries) ? data.entries.map(readEntry).filter((entry): entry is StoredEntry => entry != null) : [];
      return { ok: true, entries };
    } catch (error) {
      return { ok: false, message: failure(error) };
    }
  };

  /** One login with its password. */
  const readLogin = async (entryId: string): Promise<Answer<{ readonly login: StoredLogin; readonly password: string }>> => {
    if (!isEntryId(entryId)) return { ok: false, message: "That isn't an entry_id from ListStoredCredentials." };
    try {
      const data = await api(`credentials/${entryId}`);
      const raw = isRecord(data) ? data.entry : undefined;
      const entry = readEntry(raw);
      if (entry == null) return { ok: false, message: "That entry couldn't be read." };
      if (entry.kind !== "login") return { ok: false, message: "That entry is contact info, not a login." };
      return { ok: true, login: entry, password: isRecord(raw) ? text(raw.password) : "" };
    } catch (error) {
      return { ok: false, message: failure(error) };
    }
  };

  /** A new login (or, with `replaceId`, a new password for one this computer saved). */
  const saveLogin = async (input: { readonly website: string; readonly username: string; readonly password: string; readonly name?: string; readonly hints?: string; readonly savedBy?: string; readonly replaceId?: string }): Promise<Answer<{ readonly login: StoredLogin }>> => {
    try {
      const body = { kind: "login", website: input.website, username: input.username, password: input.password, ...(input.name ? { name: input.name } : {}), ...(input.hints ? { hints: input.hints } : {}), ...(input.savedBy ? { savedBy: input.savedBy } : {}) };
      const data = input.replaceId != null && isEntryId(input.replaceId)
        ? await api(`credentials/${input.replaceId}`, { method: "PATCH", json: { username: input.username, password: input.password } })
        : await api("credentials", { method: "POST", json: body });
      const entry = readEntry(isRecord(data) ? data.entry : undefined);
      if (entry == null || entry.kind !== "login") return { ok: false, message: "The server's answer couldn't be read." };
      return { ok: true, login: entry };
    } catch (error) {
      return { ok: false, message: failure(error) };
    }
  };

  return { list, readLogin, saveLogin };
}

export type CredentialsStore = ReturnType<typeof createCredentialsStore>;
