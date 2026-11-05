/**
 * The 1Password cards, the host's side (28 October 2026; the cards are
 * described in `shared/node/onepassword/onepassword-cards.ts`).
 *
 *   - `answerCredentialRequest` (the fill card's Fill or Not now): Fill reads
 *     the login from the shared vault and types it into the page on the
 *     agent's computer; the card keeps only which fields went in, and the
 *     agent is woken with that. The app hears back at once.
 *   - `connectOnePassword` (from the Mac, once the person's 1Password app made
 *     the vault and its read-only key): the key is checked with 1Password and
 *     kept in the engine's own folder; a connect card, if one asked, says
 *     Connected and wakes its agent.
 *   - `dismissOnePasswordConnect` (the connect card's X): a decline.
 *
 * One Fill covers the same login on the same site for ten minutes, so a
 * sign-in's next page (the password after the email) needs no second card
 * (`fillAllowedCredential`, called by request_credential_fill).
 */
import { HOST_LOG_PREFIX, logHostLine } from "../../../shared/host-log.js";
import { say } from "../../../shared/say.js";
import { fillUserForm } from "../../../shared/node/user-form/form-fill.js";
import { siteOf, type LoginSecrets, type OnePassword } from "../../../shared/node/onepassword/onepassword.js";
import {
  CREDENTIAL_ALLOWANCE_MS,
  CREDENTIAL_REQUEST_MESSAGE_TYPE,
  ONEPASSWORD_CONNECT_MESSAGE_TYPE,
  buildCredentialDeclinedWakePrompt,
  buildCredentialFailedWakePrompt,
  buildCredentialFilledWakePrompt,
  buildOnePasswordConnectedWakePrompt,
  buildOnePasswordDismissedWakePrompt,
  credentialOutcomeLine,
  loginFieldSpecs,
  type ConnectEntryFields,
  type CredentialEntryFields,
  type CredentialOutcome,
  type CredentialRequestMessage,
  type OnePasswordConnectMessage,
} from "../../../shared/node/onepassword/onepassword-cards.js";
import { readCard, stampCard } from "./card-entries.js";
import type { TranscriptEntry, TranscriptManagerLike } from "./transcript-hub.js";

export interface OnePasswordServices {
  readonly onePassword: OnePassword;
  /** The agent's own Chrome on the box (its DevTools port). */
  browserPort(agentId: string): number;
  readonly otherPorts?: readonly number[];
  readonly fill?: typeof fillUserForm;
  readonly now?: () => number;
}

type CredentialEntry = TranscriptEntry & CredentialEntryFields & { readonly message: CredentialRequestMessage };
type ConnectEntry = TranscriptEntry & ConnectEntryFields & { readonly message: OnePasswordConnectMessage };
type Outcomes = Partial<Record<keyof LoginSecrets, CredentialOutcome>>;
export type CredentialFill = { readonly ok: true; readonly outcomes: Outcomes } | { readonly ok: false; readonly message: string };

export function isCredentialEntry(entry: unknown): entry is CredentialEntry {
  const record = entry as { kind?: unknown; message?: { type?: unknown; credential?: { credentialId?: unknown } } } | null | undefined;
  return record?.kind === "send-message" && record.message?.type === CREDENTIAL_REQUEST_MESSAGE_TYPE && typeof record.message.credential?.credentialId === "string";
}

export function isConnectEntry(entry: unknown): entry is ConnectEntry {
  const record = entry as { kind?: unknown; message?: { type?: unknown } } | null | undefined;
  return record?.kind === "send-message" && record.message?.type === ONEPASSWORD_CONNECT_MESSAGE_TYPE;
}

export class OnePasswordCards {
  private services: OnePasswordServices | undefined;
  private readonly filling = new Set<string>();
  /** Fill pressed: this login on this site, for this agent, until then. */
  private readonly allowances = new Map<string, number>();
  private readonly log: (line: string) => void;

  constructor(private readonly tm: TranscriptManagerLike, options: { readonly log?: (line: string) => void } = {}) {
    this.log = options.log ?? ((line) => logHostLine(`${HOST_LOG_PREFIX} ${line}`));
  }

  setOnePasswordServices(services: OnePasswordServices | undefined): void {
    this.services = services;
  }

  private now(): number { return (this.services?.now ?? Date.now)(); }
  private allowanceKey(agentId: string, credentialId: string, site: string): string { return `${agentId}\u0000${credentialId}\u0000${siteOf(site)}`; }

  /** Reads the login and types it into the page; nothing read is kept or returned. */
  private async fill(agentId: string, credentialId: string, site: string): Promise<CredentialFill> {
    const services = this.services;
    if (services == null) return { ok: false, message: "1Password isn't set up on this computer." };
    const read = await services.onePassword.readLogin(credentialId, site);
    if (!read.ok) return { ok: false, message: read.message };
    const { fields, values } = loginFieldSpecs(read.secrets);
    if (fields.length === 0) return { ok: false, message: "That login has no username or password in 1Password." };
    const own = services.browserPort(agentId);
    const ports = [own, ...(services.otherPorts ?? []).filter((port) => port !== own)];
    const typed = await (services.fill ?? fillUserForm)({ domain: site, fields, values, ports, missingAs: "notFound" }).catch((error: unknown) => ({ ok: false as const, message: error instanceof Error ? error.message : String(error) }));
    if (!typed.ok) return typed;
    const outcomes: Outcomes = {};
    for (const field of fields) {
      const outcome = typed.outcomes[field.id];
      if (outcome === "filled" || outcome === "fillFailed" || outcome === "notFound") outcomes[field.id as keyof LoginSecrets] = outcome;
    }
    if (!Object.values(outcomes).some((outcome) => outcome === "filled")) return { ok: false, message: `no sign-in field on the page on ${siteOf(site)} could be filled (${credentialOutcomeLine(outcomes)}).` };
    return { ok: true, outcomes };
  }

  /**
   * request_credential_fill within ten minutes of a Fill for the same login on
   * the same site: filled now, without a card. Undefined when there is no
   * such allowance and the card must ask.
   */
  async fillAllowedCredential(args: { readonly agentId: string; readonly credentialId: string; readonly site: string }): Promise<CredentialFill | undefined> {
    const key = this.allowanceKey(args.agentId, args.credentialId, args.site);
    const until = this.allowances.get(key);
    if (until == null || until < this.now()) { this.allowances.delete(key); return undefined; }
    const result = await this.fill(args.agentId, args.credentialId, args.site);
    this.log(`[1password] filled again ${args.agentId} on ${siteOf(args.site)}: ${result.ok ? credentialOutcomeLine(result.outcomes) : `not filled: ${result.message}`}`);
    return result;
  }

  /** The fill card's Fill (`allow`) or Not now. `{ ok: true }` once started. */
  async answerCredentialRequest(args: { readonly agentId: string; readonly entryId: string; readonly allow?: unknown }): Promise<{ readonly ok: true } | { readonly ok: false; readonly message: string }> {
    const language = this.tm.userLanguage?.();
    const card = await readCard(this.tm, args.agentId, args.entryId, isCredentialEntry);
    if (card == null) return { ok: false, message: say(language, "onepassword.cardGone") };
    if ((card.credentialState ?? "open") !== "open") return { ok: false, message: say(language, "onepassword.answered") };
    const credential = card.message.credential;
    if (args.allow !== true) {
      const stamped = await stampCard(this.tm, args.agentId, args.entryId, isCredentialEntry, (entry) => (entry.credentialState ?? "open") === "open" ? { credentialState: "declined" } : null);
      if (stamped != null) this.wake(args.agentId, args.entryId, "credential-declined", buildCredentialDeclinedWakePrompt(args.entryId, credential), { silenceAllowed: true });
      return { ok: true };
    }
    const key = `${args.agentId}\u0000${args.entryId}`;
    if (this.filling.has(key)) return { ok: true };
    this.filling.add(key);
    const stamped = await stampCard(this.tm, args.agentId, args.entryId, isCredentialEntry, (entry) => (entry.credentialState ?? "open") === "open" ? { credentialState: "filling" } : null);
    if (stamped == null) { this.filling.delete(key); return { ok: false, message: say(language, "onepassword.cardGone") }; }
    void (async () => {
      const result = await this.fill(args.agentId, credential.credentialId, credential.site);
      if (!result.ok) {
        this.log(`[1password] not filled ${args.agentId}/${args.entryId} on ${credential.site}: ${result.message}`);
        await stampCard(this.tm, args.agentId, args.entryId, isCredentialEntry, () => ({ credentialState: "failed", credentialNote: say(language, "onepassword.notFilled") }));
        this.wake(args.agentId, args.entryId, "credential-failed", buildCredentialFailedWakePrompt(args.entryId, credential, result.message));
        return;
      }
      this.allowances.set(this.allowanceKey(args.agentId, credential.credentialId, credential.site), this.now() + CREDENTIAL_ALLOWANCE_MS);
      this.log(`[1password] filled ${args.agentId}/${args.entryId} on ${credential.site}: ${credentialOutcomeLine(result.outcomes)}`);
      await stampCard(this.tm, args.agentId, args.entryId, isCredentialEntry, () => ({ credentialState: "filled", credentialOutcomes: result.outcomes, credentialNote: undefined }));
      this.wake(args.agentId, args.entryId, "credential-filled", buildCredentialFilledWakePrompt(args.entryId, credential, result.outcomes));
    })().finally(() => this.filling.delete(key));
    return { ok: true };
  }

  /** The Mac's Connect: the key checked with 1Password and kept; the card that asked, if any, says Connected. */
  async connectOnePassword(args: { readonly agentId?: string; readonly entryId?: string; readonly token?: unknown; readonly vaultId?: unknown; readonly vaultName?: unknown; readonly accountEmail?: unknown }): Promise<{ readonly ok: true; readonly vaultName: string } | { readonly ok: false; readonly message: string }> {
    const services = this.services;
    if (services == null) return { ok: false, message: say(this.tm.userLanguage?.(), "onepassword.unavailable") };
    const connected = await services.onePassword.connect({ token: args.token, vaultId: args.vaultId, vaultName: args.vaultName, accountEmail: args.accountEmail });
    if (!connected.ok) {
      this.log(`[1password] not connected: ${connected.message}`);
      return connected;
    }
    this.log(`[1password] connected, vault "${connected.vaultName}"`);
    if (args.agentId != null && args.entryId != null) {
      const email = typeof args.accountEmail === "string" ? args.accountEmail.trim() : "";
      const stamped = await stampCard(this.tm, args.agentId, args.entryId, isConnectEntry, (entry) => (entry.connectState ?? "open") === "open" ? { connectState: "connected", ...(email.length > 0 ? { connectAccount: email } : {}) } : null);
      if (stamped != null) this.wake(args.agentId, args.entryId, "onepassword-connected", buildOnePasswordConnectedWakePrompt(args.entryId, connected.vaultName));
    }
    return { ok: true, vaultName: connected.vaultName };
  }

  /** The connect card's X: a decline. */
  async dismissOnePasswordConnect(args: { readonly agentId: string; readonly entryId: string }): Promise<{ readonly accepted: boolean }> {
    const stamped = await stampCard(this.tm, args.agentId, args.entryId, isConnectEntry, (entry) => (entry.connectState ?? "open") === "open" ? { connectState: "dismissed" } : null);
    if (stamped == null) return { accepted: false };
    // Remembered on this computer: no agent offers 1Password again unless the person asks.
    this.services?.onePassword.decline();
    this.wake(args.agentId, args.entryId, "onepassword-dismissed", buildOnePasswordDismissedWakePrompt(args.entryId), { silenceAllowed: true });
    return { accepted: true };
  }

  private wake(agentId: string, entryId: string, source: string, prompt: string, options: { readonly silenceAllowed?: boolean } = {}): void {
    void Promise.resolve()
      .then(() => this.tm.backgroundWakes.runHiddenPromptWake(agentId, source, prompt, say(this.tm.userLanguage?.(), "tray.resumeAfterOnePasswordFailed"), options.silenceAllowed === true ? { isSilenceAllowed: true } : undefined))
      .catch((error: unknown) => this.log(`[1password] ${source} wake for ${agentId}/${entryId} failed: ${error instanceof Error ? error.message : String(error)}`));
  }
}
