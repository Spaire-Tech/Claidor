// The 1Password cards (28 October 2026), as the upstream app's own card rules
// describe them:
//
//   - The fill card (`credential-request`): at a sign-in on a page open on
//     the agent's computer, once ListCredentials found the site's login in the
//     shared vault, the person allows 1Password to fill it. The host types the
//     username, the password and, when the login has one, its one-time code
//     into the page; the agent learns only which went in. One allowance
//     covers the sign-in's next steps for ten minutes (the password page after
//     the email page), with no second card.
//   - The connect card (`onepassword-connect`): 1Password isn't connected, so
//     the person connects it from Simeon on their Mac (the Mac asks their
//     1Password app for a "Shared with Simeon" vault and a read-only key).
//
// Both end the agent's turn; dismissing either is a decline.

import type { UserFormFieldOutcome, UserFormFieldSpec } from "../user-form/form-fill.js";
import type { LoginSecrets } from "./onepassword.js";

export const CREDENTIAL_REQUEST_MESSAGE_TYPE = "credential-request";
export const ONEPASSWORD_CONNECT_MESSAGE_TYPE = "onepassword-connect";

/** How long one allowance fills the same login on the same site without asking again. */
export const CREDENTIAL_ALLOWANCE_MS = 10 * 60_000;

export interface CredentialRequestMessage {
  readonly type: typeof CREDENTIAL_REQUEST_MESSAGE_TYPE;
  readonly credential: {
    readonly kind: "browser-login";
    readonly credentialId: string;
    readonly vaultId: string;
    readonly revision: number;
    /** The login's name in 1Password. */
    readonly title: string;
    /** The site the page is on, "acme.com". */
    readonly site: string;
    /** One honest sentence, shown beside the fill. */
    readonly purpose: string;
  };
}

export type CredentialState = "open" | "filling" | "filled" | "failed" | "declined";
export type CredentialOutcome = Extract<UserFormFieldOutcome, "filled" | "fillFailed" | "notFound">;

export interface CredentialEntryFields {
  readonly credentialState?: CredentialState;
  readonly credentialOutcomes?: Readonly<Partial<Record<keyof LoginSecrets, CredentialOutcome>>>;
  readonly credentialNote?: string;
}

export interface OnePasswordConnectMessage {
  readonly type: typeof ONEPASSWORD_CONNECT_MESSAGE_TYPE;
  readonly reason?: string;
}

export type ConnectState = "open" | "connected" | "dismissed";

export interface ConnectEntryFields {
  readonly connectState?: ConnectState;
  /** The 1Password account it was connected with, for the card. */
  readonly connectAccount?: string;
}

/** Where a sign-in's fields usually are: the browser's own marks first, then common names. */
export const LOGIN_FIELD_SELECTORS: Readonly<Record<keyof LoginSecrets, string>> = {
  username: [
    'input[autocomplete~="username"]', 'input[autocomplete~="email"]', 'input[type="email"]',
    'input[name="username" i]', 'input[name="email" i]', 'input[name="login" i]', 'input[name="user" i]', 'input[name="identifier" i]',
    'input[id="username" i]', 'input[id="email" i]', 'input[id="login" i]', 'input[id="identifierId"]',
  ].join(", "),
  password: 'input[type="password"]:not([autocomplete="new-password"])',
  otp: [
    'input[autocomplete="one-time-code"]', 'input[name="otp" i]', 'input[name="totp" i]', 'input[name*="code" i][inputmode="numeric"]', 'input[id*="otp" i]',
  ].join(", "),
};

/** The fill's fields for what the login holds, in the order a sign-in asks for them. */
export function loginFieldSpecs(secrets: LoginSecrets): { readonly fields: UserFormFieldSpec[]; readonly values: Record<string, string> } {
  const fields: UserFormFieldSpec[] = [];
  const values: Record<string, string> = {};
  for (const key of ["username", "password", "otp"] as const) {
    const value = secrets[key];
    if (value == null || value.length === 0) continue;
    fields.push({ id: key, type: key === "username" ? "text" : key === "password" ? "password" : "otp", target: { selector: LOGIN_FIELD_SELECTORS[key] } });
    values[key] = value;
  }
  return { fields, values };
}

const NAMES: Readonly<Record<keyof LoginSecrets, string>> = { username: "username", password: "password", otp: "one-time code" };

/** "username filled, password not on this page": what went in, never a value. */
export function credentialOutcomeLine(outcomes: Readonly<Partial<Record<keyof LoginSecrets, CredentialOutcome>>>): string {
  const parts = (["username", "password", "otp"] as const).flatMap((key) => {
    const outcome = outcomes[key];
    if (outcome == null) return [];
    return [`${NAMES[key]} ${outcome === "filled" ? "filled" : outcome === "notFound" ? "not on this page" : "couldn't be typed in"}`];
  });
  return parts.length > 0 ? parts.join(", ") : "nothing to fill";
}

export function buildCredentialFilledWakePrompt(entryId: string, credential: CredentialRequestMessage["credential"], outcomes: Readonly<Partial<Record<keyof LoginSecrets, CredentialOutcome>>>): string {
  return `[The user allowed 1Password to fill "${credential.title}" on ${credential.site} (entry ${entryId}): ${credentialOutcomeLine(outcomes)}. You never see what was typed. Have the browser helper take a fresh snapshot and press the site's own button to go on (Sign in, Next). If the site then asks for the next step (a password or a code on a new page), call request_credential_fill again with the same credential_id within 10 minutes: it fills without asking again. Never take a screenshot to check a password field.]`;
}

export function buildCredentialFailedWakePrompt(entryId: string, credential: CredentialRequestMessage["credential"], reason: string): string {
  return `[The user allowed 1Password to fill "${credential.title}" on ${credential.site} (entry ${entryId}), but it couldn't be filled: ${reason} Nothing was kept. If the page changed, open the sign-in again and call request_credential_fill once more; otherwise ask with request_user_form or hand them the screen (request_box_help). Tell them in one short line what happened.]`;
}

export function buildCredentialDeclinedWakePrompt(entryId: string, credential: CredentialRequestMessage["credential"]): string {
  return `[The user declined filling "${credential.title}" on ${credential.site} with 1Password (entry ${entryId}). Take it as declined: don't ask again for it. Carry on without it if the task allows; if the task needs that sign-in, end your turn without a message.]`;
}

export function buildOnePasswordConnectedWakePrompt(entryId: string, vaultName: string): string {
  return `[The user connected 1Password (entry ${entryId}): you can now fill sign-ins with the logins they keep in the vault "${vaultName}". Call ListCredentials with force_refresh for the page you were on and carry on.]`;
}

export function buildOnePasswordDismissedWakePrompt(entryId: string): string {
  return `[The user dismissed connecting 1Password (entry ${entryId}). Don't ask again. For the sign-in, ask with request_user_form or hand them the screen (request_box_help); if the task waited on it, end your turn without a message.]`;
}
