/**
 * ListCredentials, request_credential_fill and request_1password_connect
 * (28 October 2026): the 1Password cards, as the upstream app's own card
 * rules describe them (`shared/node/onepassword/onepassword-cards.ts`). At a
 * username-and-password sign-in on a page open on the agent's computer, the
 * first step is ListCredentials for the page's site; a match is filled with
 * the person's allowance on the fill card; no match, or no 1Password, falls
 * back to the in-chat form or the computer handoff. The agent never sees a
 * username, a password or a code.
 */
import { z } from "zod";
import { defineCommunicateTool } from "./communicate-tool.js";
import { siteOf, type LoginSummary } from "../../../shared/node/onepassword/onepassword.js";
import {
  CREDENTIAL_REQUEST_MESSAGE_TYPE,
  LOGIN_FIELD_SELECTORS,
  ONEPASSWORD_CONNECT_MESSAGE_TYPE,
  credentialOutcomeLine,
  type CredentialOutcome,
  type CredentialRequestMessage,
  type OnePasswordConnectMessage,
} from "../../../shared/node/onepassword/onepassword-cards.js";
import type { UserFormFieldSpec } from "../../../shared/node/user-form/form-fill.js";

type Listed = { readonly ok: true; readonly logins: readonly LoginSummary[] } | { readonly ok: false; readonly message: string; readonly notConnected?: boolean };
type Filled = { readonly ok: true; readonly outcomes: Partial<Record<"username" | "password" | "otp", CredentialOutcome>> } | { readonly ok: false; readonly message: string };

export interface OnePasswordToolDependencies {
  connection(): { readonly vaultName: string } | undefined;
  listLogins(site: string, options: { readonly forceRefresh?: boolean }): Promise<Listed>;
  /** Filled now when the person allowed this login on this site in the last ten minutes; undefined when the card must ask. */
  fillAllowed(args: { readonly credentialId: string; readonly site: string }): Promise<Filled | undefined>;
  /** Which sign-in fields are on the page on the site now. */
  locateFields(request: { readonly domain: string; readonly fields: readonly UserFormFieldSpec[] }): Promise<{ readonly ok: true; readonly found: readonly string[] } | { readonly ok: false; readonly message: string }>;
  emitCard(message: CredentialRequestMessage | OnePasswordConnectMessage, timestampMs: number): string | undefined;
  now?: () => number;
}

const NOT_CONNECTED = "1Password isn't connected. Ask the user once to connect it with request_1password_connect; meanwhile, or if they decline, ask for the sign-in with request_user_form or hand them the screen (request_box_help).";

export const listCredentialsParameters = z.object({
  site: z.string().trim().min(1).describe('The page\'s address or domain, as the browser bar shows it ("https://accounts.example.com/login" or "accounts.example.com").'),
  force_refresh: z.boolean().optional().describe("Read the vault again instead of the list from the last five minutes. Set it when a login the user says is there wasn't listed."),
});

export const requestCredentialFillParameters = z.object({
  credential_id: z.string().trim().min(1).describe("The credential_id ListCredentials gave for this site."),
  site: z.string().trim().min(1).describe("The page's address or domain, as the browser bar shows it."),
  purpose: z.string().trim().min(1).describe('One honest sentence the user reads beside the fill ("To sign in to Acme and download your September invoice.").'),
});

export const requestOnePasswordConnectParameters = z.object({
  reason: z.string().trim().optional().describe('One short sentence: what it is for ("To sign in to Acme with the login you keep in 1Password.").'),
});

export function createOnePasswordTools(deps: OnePasswordToolDependencies) {
  const listCredentials = defineCommunicateTool(deps, {
    id: "LIST_CREDENTIALS",
    name: "ListCredentials",
    description: "List the logins the user keeps for a site in their 1Password vault shared with Simeon: each one's name and credential_id, never a username or a password. At a username-and-password sign-in on a page open on your computer, call this first, before asking for anything. A match: fill it with request_credential_fill. No match: tell the user it isn't in the shared vault (they can add it there), and next time call this with force_refresh before saying it's missing again; meanwhile ask with request_user_form or hand them the screen. Not for SSO, a passkey, a captcha or a payment.",
    parameters: listCredentialsParameters,
    describeActivity: () => ({ detail: "Looking in 1Password" }),
    execute: async (_ctx, args: z.infer<typeof listCredentialsParameters>, resolved) => {
      const site = siteOf(args.site);
      if (site.length === 0) return "Give the page's address or its domain.";
      const listed = await resolved.listLogins(site, { forceRefresh: args.force_refresh === true });
      if (!listed.ok) return listed.notConnected === true ? NOT_CONNECTED : `1Password couldn't be read: ${listed.message}`;
      const vault = resolved.connection()?.vaultName ?? "Shared with Simeon";
      if (listed.logins.length === 0) return `No login for ${site} is in the 1Password vault "${vault}". Tell the user in one line it isn't there (they can add it to that vault); next time call ListCredentials with force_refresh before saying it's missing again. Meanwhile ask with request_user_form or hand them the screen (request_box_help).`;
      const lines = listed.logins.map((login) => `- credential_id ${login.credentialId}: "${login.title}" (saved for ${login.site})`);
      return `Logins for ${site} in the 1Password vault "${vault}":\n${lines.join("\n")}\nFill one with request_credential_fill (the user allows it on a card). You never see a username or a password.`;
    },
  });

  const requestFill = defineCommunicateTool(deps, {
    id: "REQUEST_CREDENTIAL_FILL",
    name: "request_credential_fill",
    description: "Ask the user to let 1Password fill a sign-in on a page open on your computer, with a login ListCredentials found for that site. The card shows the login's name, the site and your purpose; on Fill, the host types the username, the password and, when the login has one, its one-time code into the page. You learn only which went in. Have the sign-in page open on its step first. One Fill covers the same login on the same site for ten minutes: for the sign-in's next page (the password after the email), call this again and it fills without a new card. Sending the card ends your turn. A decline is final.",
    parameters: requestCredentialFillParameters,
    describeActivity: () => ({ detail: "Asking to fill a sign-in with 1Password" }),
    execute: async (_ctx, args: z.infer<typeof requestCredentialFillParameters>, resolved) => {
      const site = siteOf(args.site);
      if (site.length === 0) return "Give the page's address or its domain.";
      const connection = resolved.connection();
      if (connection == null) return NOT_CONNECTED;
      const listed = await resolved.listLogins(site, {});
      if (!listed.ok) return listed.notConnected === true ? NOT_CONNECTED : `1Password couldn't be read: ${listed.message}`;
      const login = listed.logins.find((item) => item.credentialId === args.credential_id);
      if (login == null) return `credential_id ${args.credential_id} isn't a login saved for ${site} in the vault "${connection.vaultName}". Call ListCredentials for the page and use one it gives.`;
      const allowed = await resolved.fillAllowed({ credentialId: login.credentialId, site });
      if (allowed != null) {
        if (!allowed.ok) return `1Password couldn't fill it: ${allowed.message} Look at the page again; if it changed, call this once more, else ask with request_user_form or hand them the screen.`;
        return `Filled again with "${login.title}", as the user allowed a few minutes ago: ${credentialOutcomeLine(allowed.outcomes)}. Have the browser helper take a fresh snapshot and press the site's own button.`;
      }
      const fields: UserFormFieldSpec[] = (["username", "password", "otp"] as const).map((id) => ({ id, type: id === "username" ? "text" : id === "password" ? "password" : "otp", target: { selector: LOGIN_FIELD_SELECTORS[id] } }));
      const located = await resolved.locateFields({ domain: site, fields });
      if (!located.ok) return `The card was not shown: ${located.message}`;
      if (located.found.length === 0) return `The card was not shown: no sign-in field is on the page on ${site} now. Have the browser helper open the sign-in step (the email or password field on screen), then call this again.`;
      const message: CredentialRequestMessage = {
        type: CREDENTIAL_REQUEST_MESSAGE_TYPE,
        credential: { kind: "browser-login", credentialId: login.credentialId, vaultId: login.vaultId, revision: login.revision, title: login.title, site, purpose: args.purpose.slice(0, 300) },
      };
      const entryId = resolved.emitCard(message, (resolved.now ?? Date.now)());
      return `The 1Password card for "${login.title}" is in the chat${entryId == null ? "" : ` (entry ${entryId})`}. Your turn ends here: send nothing more about it now. You are woken once the user fills or declines it, with which fields went in (never what they hold).`;
    },
  });

  const requestConnect = defineCommunicateTool(deps, {
    id: "REQUEST_1PASSWORD_CONNECT",
    name: "request_1password_connect",
    description: "Ask the user to connect 1Password, when ListCredentials says it isn't connected and a sign-in needs it. They connect it from Simeon on their Mac, which asks their 1Password app for a vault shared with Simeon and a read-only key. Ask once per blockage, never again after a dismissal. Sending the card ends your turn; you are woken when they connect it or dismiss it.",
    parameters: requestOnePasswordConnectParameters,
    describeActivity: () => ({ detail: "Asking to connect 1Password" }),
    execute: async (_ctx, args: z.infer<typeof requestOnePasswordConnectParameters>, resolved) => {
      const connection = resolved.connection();
      if (connection != null) return `1Password is already connected (vault "${connection.vaultName}"). Call ListCredentials with force_refresh for the page.`;
      const reason = (args.reason ?? "").trim();
      const message: OnePasswordConnectMessage = { type: ONEPASSWORD_CONNECT_MESSAGE_TYPE, ...(reason.length > 0 ? { reason: reason.slice(0, 300) } : {}) };
      const entryId = resolved.emitCard(message, (resolved.now ?? Date.now)());
      return `The 1Password connect card is in the chat${entryId == null ? "" : ` (entry ${entryId})`}. Your turn ends here: send nothing more about it now. You are woken once the user connects it or dismisses it.`;
    },
  });

  return [listCredentials, requestFill, requestConnect] as const;
}
