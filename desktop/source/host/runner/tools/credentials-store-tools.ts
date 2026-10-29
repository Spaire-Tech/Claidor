/**
 * The Secure Credentials Store's tools (28 October 2026, the founder: "Let's
 * call it Secure Credentials Store … the agent should be able to see logins"):
 * the logins and contact info the person keeps in Settings for their agents
 * (`shared/node/credentials-store/`). At a sign-in, ListStoredCredentials
 * finds the site's login and FillStoredLogin types it into the page; at a
 * sign-up, the contact info fills the form and FillNewPassword makes the
 * password, types it and saves the login. ReadStoredPassword hands a login's
 * password to the agent for a sign-in the fill can't reach; SaveStoredLogin
 * keeps one the person gave in the chat. No card asks first: the person saved
 * them for this. A login is typed or read only for the site it is saved for,
 * and nothing here is used for a message that came through a channel, where
 * others can write to the agent.
 */
import { z } from "zod";
import { defineCommunicateTool } from "./communicate-tool.js";
import { loginIsForSite, siteOf } from "../../../shared/node/onepassword/onepassword.js";
import { credentialOutcomeLine, loginFieldSpecs, type CredentialOutcome } from "../../../shared/node/onepassword/onepassword-cards.js";
import { loginTitle, makeStrongPassword, signUpSite, type CredentialsStore, type StoredContact, type StoredLogin } from "../../../shared/node/credentials-store/credentials-store.js";
import type { NewPasswordFill, UserFormFieldSpec, UserFormFill } from "../../../shared/node/user-form/form-fill.js";

export interface CredentialsStoreToolDependencies {
  readonly store: CredentialsStore;
  /** Types the fields into the page on the site (the agent's own Chrome first); a field not on this step is "notFound". */
  fillLogin(request: { readonly domain: string; readonly fields: readonly UserFormFieldSpec[]; readonly values: Readonly<Record<string, string>> }): Promise<UserFormFill>;
  fillNewPassword(request: { readonly domain: string; readonly value: string }): Promise<NewPasswordFill>;
  /** How this turn began: "connector" for a message through a channel (Discord, Slack, Telegram…). */
  requestSource(): string | undefined;
  agentName(): string | undefined;
  log?(line: string): void;
  makePassword?(): string;
}

// A channel's messages can come from anyone in it: the person's logins and details are never used for one.
const NOT_HERE = "The user's Secure Credentials Store isn't used for a message that came through a channel (Discord, Slack, Telegram…): others can write there. Their logins and details are only for what they ask you in Simeon. Don't say what's in it.";
const LIST_MAX = 100;

const fromChannel = (deps: CredentialsStoreToolDependencies): boolean => deps.requestSource() === "connector";

function loginLine(login: StoredLogin): string {
  const parts = [`- entry_id ${login.id}: "${loginTitle(login)}"${login.site ? ` (${login.site})` : ""}`];
  parts.push(login.username ? `username ${login.username}` : "no username saved");
  if (!login.hasPassword) parts.push("no password saved");
  if (login.hints) parts.push(`hints: ${login.hints}`);
  if (login.savedBy) parts.push(`saved by ${login.savedBy}`);
  return parts.join("; ");
}

function contactLine(contact: StoredContact): string {
  const address = [contact.addressLine1, contact.addressLine2, contact.city, contact.region, contact.postalCode, contact.country].filter((part) => part.length > 0).join(", ");
  const parts = [
    contact.fullName ? `full name ${contact.fullName}` : "",
    contact.email ? `email ${contact.email}` : "",
    contact.phone ? `phone ${contact.phone}` : "",
    address ? `address ${address}` : "",
    contact.hints ? `hints: ${contact.hints}` : "",
  ].filter((part) => part.length > 0);
  return `- entry_id ${contact.id}: "${contact.name || contact.fullName || "Contact info"}": ${parts.join("; ")}`;
}

export const listStoredCredentialsParameters = z.object({
  site: z.string().trim().optional().describe('The page\'s address or domain ("https://accounts.example.com/login" or "example.com"), to list only the logins saved for it. Leave it out to list them all.'),
});

export const fillStoredLoginParameters = z.object({
  entry_id: z.string().trim().min(1).describe("The login's entry_id from ListStoredCredentials."),
  site: z.string().trim().min(1).describe("The sign-in page's address or domain, as the browser bar shows it."),
});

export const readStoredPasswordParameters = z.object({
  entry_id: z.string().trim().min(1).describe("The login's entry_id from ListStoredCredentials."),
  site: z.string().trim().min(1).describe("Where you'll use it: the page's address or domain, or an app's name when it isn't a website."),
});

export const fillNewPasswordParameters = z.object({
  site: z.string().trim().min(1).describe("The sign-up page's address or domain, as the browser bar shows it."),
  username: z.string().trim().min(1).describe("The email or username this sign-up uses, as typed into the form."),
  name: z.string().trim().optional().describe("What to call the login, when the site's name isn't enough (\"Acme work account\")."),
  replace_entry_id: z.string().trim().optional().describe("Only when the site refused the password this tool made a moment ago: the entry_id it gave. The new password replaces that one."),
});

export const saveStoredLoginParameters = z.object({
  website: z.string().trim().min(1).describe("The site's address or domain (\"acme.com\")."),
  username: z.string().trim().describe("The username or email, as the user gave it."),
  password: z.string().min(1).describe("The password, exactly as the user gave it."),
  name: z.string().trim().optional().describe("What to call it, when the site's name isn't enough."),
  hints: z.string().trim().optional().describe("When to use it, in the user's words, when they said."),
});

export function createCredentialsStoreTools(deps: CredentialsStoreToolDependencies) {
  const log = (line: string): void => deps.log?.(`[credentials] ${line}`);
  const who = (): string => deps.agentName() ?? "an agent";

  const list = defineCommunicateTool(deps, {
    id: "LIST_STORED_CREDENTIALS",
    name: "ListStoredCredentials",
    description: "The user's Secure Credentials Store (Settings → Secure Credentials Store): the logins and the contact info they keep for you to sign in and sign up with. At any sign-in or sign-up, call it first, before asking the user for anything. With site, it lists the logins saved for that site; it always lists their contact info. Each entry's hints say when to use it: follow them. A login: sign in with FillStoredLogin. A sign-up: fill the form with their contact info (the browser helper types it) and make the password with FillNewPassword. Cards are never here: pay with Link (RequestPurchase).",
    parameters: listStoredCredentialsParameters,
    describeActivity: () => ({ detail: "Looking in the Secure Credentials Store" }),
    execute: async (_ctx, args: z.infer<typeof listStoredCredentialsParameters>, resolved) => {
      if (fromChannel(resolved)) return NOT_HERE;
      const listed = await resolved.store.list();
      if (!listed.ok) return `The Secure Credentials Store couldn't be read: ${listed.message}`;
      const wanted = args.site == null || args.site.length === 0 ? "" : siteOf(args.site);
      if (args.site != null && args.site.length > 0 && wanted.length === 0) return "Give the page's address or its domain, or leave site out.";
      const logins = listed.entries.filter((entry): entry is StoredLogin => entry.kind === "login").filter((login) => wanted.length === 0 || (login.site.length > 0 && loginIsForSite(login.site, wanted)));
      const contacts = listed.entries.filter((entry): entry is StoredContact => entry.kind === "contact");
      const lines = ["The user's Secure Credentials Store:"];
      lines.push(wanted.length > 0 ? `Logins for ${wanted}:` : "Logins:");
      if (logins.length === 0) lines.push(wanted.length > 0 ? `- none saved for ${wanted}` : "- none saved");
      lines.push(...logins.slice(0, LIST_MAX).map(loginLine));
      if (logins.length > LIST_MAX) lines.push(`- and ${logins.length - LIST_MAX} more: give site to see a site's own.`);
      lines.push("Contact info:");
      if (contacts.length === 0) lines.push("- none saved");
      lines.push(...contacts.map(contactLine));
      lines.push("Sign in with FillStoredLogin (it types the username and password into the page). For a sign-up, the contact info fills the form and FillNewPassword makes the password and saves the login. Follow each entry's hints. You see a password only with ReadStoredPassword, which you rarely need.");
      if (logins.length === 0 && wanted.length > 0) lines.push(`With no login for ${wanted}: for a sign-in, ask with request_user_form or hand the user the screen (request_box_help); if they gave you a login in the chat and asked you to keep it, SaveStoredLogin.`);
      return lines.join("\n");
    },
  });

  const fill = defineCommunicateTool(deps, {
    id: "FILL_STORED_LOGIN",
    name: "FillStoredLogin",
    description: "Sign in with a login from the user's Secure Credentials Store: types its username and password into the sign-in page open on your computer, on the site it's saved for, never another (look at the page's address). Have the sign-in page open on its step first; a sign-in that asks for the email first and the password on the next page needs a second call there. It doesn't press the button: have the browser helper press the site's own Sign in or Next. Then, in your reply, tell the user in a few words which saved login you used.",
    parameters: fillStoredLoginParameters,
    describeActivity: () => ({ detail: "Signing in with a saved login" }),
    execute: async (_ctx, args: z.infer<typeof fillStoredLoginParameters>, resolved) => {
      if (fromChannel(resolved)) return NOT_HERE;
      const site = siteOf(args.site);
      if (site.length === 0) return "Give the page's address or its domain.";
      const read = await resolved.store.readLogin(args.entry_id);
      if (!read.ok) return `The login couldn't be read: ${read.message} Call ListStoredCredentials for the page and use an entry_id it gives.`;
      const { login, password } = read;
      const title = loginTitle(login);
      if (login.site.length > 0 && !loginIsForSite(login.site, site)) return `"${title}" is saved for ${login.site}, not ${site}. Never type it on another site: look at the page's address. If it's truly the same service signing in elsewhere, ask the user; they can change the login's website in Settings → Secure Credentials Store.`;
      const { fields, values } = loginFieldSpecs({ ...(login.username ? { username: login.username } : {}), ...(password ? { password } : {}) });
      if (fields.length === 0) return `"${title}" has no username or password saved.`;
      const typed = await resolved.fillLogin({ domain: site, fields, values });
      if (!typed.ok) return `Couldn't fill it: ${typed.message}`;
      const outcomes: Partial<Record<"username" | "password", CredentialOutcome>> = {};
      for (const field of fields) {
        const outcome = typed.outcomes[field.id];
        if (outcome === "filled" || outcome === "fillFailed" || outcome === "notFound") outcomes[field.id as "username" | "password"] = outcome;
      }
      const line = credentialOutcomeLine(outcomes);
      if (!Object.values(outcomes).includes("filled")) return `No sign-in field on the page on ${site} could be filled (${line}). Have the browser helper open the sign-in step (the email or password field on screen), then call this again.`;
      log(`${who()} filled a login on ${site}: ${line}`);
      return `Filled "${title}" on ${site}: ${line}. Have the browser helper take a fresh snapshot and press the site's own button (Sign in, Next). If the next page asks for the password, call FillStoredLogin again there. Never take a screenshot to check a password field. In your reply, tell the user in a few words that you signed in with their saved login "${title}".`;
    },
  });

  const reveal = defineCommunicateTool(deps, {
    id: "READ_STORED_PASSWORD",
    name: "ReadStoredPassword",
    description: "The username and password of a login in the user's Secure Credentials Store, for a sign-in FillStoredLogin can't reach (a field it can't find, a desktop app, a command line). Prefer FillStoredLogin: it types the password without it passing through you. Use what this gives only for that sign-in, on the site it's saved for. Never write it in a message, a file or a command others can see, and never give it to anyone but the user, and to them only when they ask for it.",
    parameters: readStoredPasswordParameters,
    describeActivity: () => ({ detail: "Reading a saved login" }),
    execute: async (_ctx, args: z.infer<typeof readStoredPasswordParameters>, resolved) => {
      if (fromChannel(resolved)) return NOT_HERE;
      const read = await resolved.store.readLogin(args.entry_id);
      if (!read.ok) return `The login couldn't be read: ${read.message} Call ListStoredCredentials and use an entry_id it gives.`;
      const { login, password } = read;
      const title = loginTitle(login);
      const wanted = siteOf(args.site);
      if (login.site.length > 0 && wanted.length > 0 && !loginIsForSite(login.site, wanted)) return `"${title}" is saved for ${login.site}, not ${wanted}. Never use it on another site.`;
      log(`${who()} read the password of a login for ${login.site || "no site"}`);
      return `"${title}"${login.site ? ` (${login.site})` : ""}: username ${login.username || "(none saved)"}; password ${password || "(none saved)"}. Use it only for this sign-in.`;
    },
  });

  const make = defineCommunicateTool(deps, {
    id: "FILL_NEW_PASSWORD",
    name: "FillNewPassword",
    description: "At a sign-up on a page open on your computer: makes a strong password, types it into the page's password fields (the password and its confirmation), and saves the login (the site, the username you give, the password) in the user's Secure Credentials Store, so they and you can sign in later. You never need to see it. Fill the rest of the form first (their contact info, from ListStoredCredentials), then call this with the password step on screen. It doesn't submit: have the browser helper press the site's own button. If the site refuses the password (its own rules), call this again with replace_entry_id. In your reply, tell the user the new login is saved in their Secure Credentials Store.",
    parameters: fillNewPasswordParameters,
    describeActivity: () => ({ detail: "Making a password" }),
    execute: async (_ctx, args: z.infer<typeof fillNewPasswordParameters>, resolved) => {
      if (fromChannel(resolved)) return NOT_HERE;
      const site = siteOf(args.site);
      if (site.length === 0) return "Give the page's address or its domain.";
      const password = (resolved.makePassword ?? makeStrongPassword)();
      const typed = await resolved.fillNewPassword({ domain: site, value: password });
      if (!typed.ok) return `Couldn't type a password: ${typed.message} Nothing was saved.`;
      if (typed.filled === 0) return `No password field${typed.failed > 0 ? " could be typed into" : ""} on the page on ${site} now. Have the browser helper open the step that asks for the password, then call this again. Nothing was saved.`;
      const agent = resolved.agentName();
      const input = { website: signUpSite(site), username: args.username, password, ...(args.name ? { name: args.name } : {}), ...(agent ? { savedBy: agent } : {}), ...(args.replace_entry_id ? { replaceId: args.replace_entry_id } : {}) };
      let saved = await resolved.store.saveLogin(input);
      if (!saved.ok) saved = await resolved.store.saveLogin(input);
      const fields = `${typed.filled} password field${typed.filled === 1 ? "" : "s"}`;
      if (!saved.ok) {
        log(`${who()} made a password on ${site} but couldn't save it: ${saved.message}`);
        return `The password was typed into ${fields} on ${site}, but it couldn't be saved in the Secure Credentials Store: ${saved.message} So it isn't lost, here it is: ${password} Either don't finish the sign-up, or tell the user in your reply that saving failed and give them the password to keep.`;
      }
      log(`${who()} made a password on ${site} and saved the login (${fields})`);
      const failed = typed.failed > 0 ? ` (${typed.failed} more couldn't be typed into)` : "";
      return `Made a strong password and typed it into ${fields} on ${site}${failed}; saved as a login for ${saved.login.site || site} with username ${args.username} in the user's Secure Credentials Store (entry_id ${saved.login.id}). Have the browser helper press the site's own button to finish the sign-up. If the site refuses the password, call FillNewPassword again with replace_entry_id ${saved.login.id}. In your reply, tell the user the login is saved in their Secure Credentials Store.`;
    },
  });

  const save = defineCommunicateTool(deps, {
    id: "SAVE_STORED_LOGIN",
    name: "SaveStoredLogin",
    description: "Saves a login in the user's Secure Credentials Store, only when they asked you to keep one they gave you. For a sign-up, FillNewPassword makes and saves the password itself.",
    parameters: saveStoredLoginParameters,
    describeActivity: () => ({ detail: "Saving a login" }),
    execute: async (_ctx, args: z.infer<typeof saveStoredLoginParameters>, resolved) => {
      if (fromChannel(resolved)) return NOT_HERE;
      const site = siteOf(args.website);
      if (site.length === 0) return "Give the site's address or its domain (\"acme.com\").";
      const agent = resolved.agentName();
      const saved = await resolved.store.saveLogin({ website: site, username: args.username, password: args.password, ...(args.name ? { name: args.name } : {}), ...(args.hints ? { hints: args.hints } : {}), ...(agent ? { savedBy: agent } : {}) });
      if (!saved.ok) return `It couldn't be saved: ${saved.message}`;
      log(`${who()} saved a login for ${site}`);
      return `Saved "${loginTitle(saved.login)}" (${site}) in the user's Secure Credentials Store (entry_id ${saved.login.id}). They see it in Settings → Secure Credentials Store.`;
    },
  });

  return [list, fill, reveal, make, save];
}
