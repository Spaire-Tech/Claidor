/**
 * The in-chat form, the host's side (28 October 2026; the card is described
 * in `shared/node/user-form/user-form.ts`).
 *
 *   - `submitUserForm` (the card's Fill): the values are typed into the page
 *     on the agent's computer (`fillUserForm`), the card keeps only which
 *     fields went in, and the agent is woken with that. The app hears back
 *     at once; the card shows "filling" until the fill is done.
 *   - `dismissUserForm` (the card's X): a decline, and the agent hears it at
 *     once.
 *
 * What the person typed is never written to the transcript, the log or a
 * file, and never reaches the agent. The composition hands this the agent's
 * browser (`setUserFormServices`).
 */
import { HOST_LOG_PREFIX, logHostLine } from "../../../shared/host-log.js";
import { say } from "../../../shared/say.js";
import { fillUserForm, type UserFormFill } from "../../../shared/node/user-form/form-fill.js";
import {
  USER_FORM_MESSAGE_TYPE,
  buildFormDismissedWakePrompt,
  buildFormFailedWakePrompt,
  buildFormFilledWakePrompt,
  formFieldSpecs,
  formValues,
  type UserFormEntryFields,
  type UserFormMessage,
} from "../../../shared/node/user-form/user-form.js";
import { readCard, stampCard } from "./card-entries.js";
import type { TranscriptEntry, TranscriptManagerLike } from "./transcript-hub.js";

export interface UserFormServices {
  /** The agent's own Chrome on the box (its DevTools port). */
  browserPort(agentId: string): number;
  /** Every DevTools port on the box, for a page the agent opened in another window. */
  readonly otherPorts?: readonly number[];
  readonly fill?: typeof fillUserForm;
}

type FormEntry = TranscriptEntry & UserFormEntryFields & { readonly message: UserFormMessage };
type FormPatch = { readonly [K in keyof UserFormEntryFields]?: UserFormEntryFields[K] | undefined };

export function isUserFormEntry(entry: unknown): entry is FormEntry {
  const record = entry as { kind?: unknown; message?: { type?: unknown; form?: { fields?: unknown } } } | null | undefined;
  return record?.kind === "send-message" && record.message?.type === USER_FORM_MESSAGE_TYPE && Array.isArray(record.message.form?.fields);
}

export class UserForms {
  private services: UserFormServices | undefined;
  /** Forms being typed in (Fill pressed twice). */
  private readonly filling = new Set<string>();
  private readonly log: (line: string) => void;

  constructor(private readonly tm: TranscriptManagerLike, options: { readonly log?: (line: string) => void } = {}) {
    this.log = options.log ?? ((line) => logHostLine(`${HOST_LOG_PREFIX} ${line}`));
  }

  setUserFormServices(services: UserFormServices | undefined): void {
    this.services = services;
  }

  /** The card's Fill: `{ ok: true }` once the fill has started, or why it can't. */
  async submitUserForm(args: { readonly agentId: string; readonly entryId: string; readonly values?: unknown }): Promise<{ readonly ok: true } | { readonly ok: false; readonly message: string; readonly field?: string }> {
    const language = this.tm.userLanguage?.();
    const form = await this.readForm(args.agentId, args.entryId);
    if (form == null) return { ok: false, message: say(language, "form.gone") };
    if ((form.formState ?? "open") !== "open") return { ok: false, message: say(language, "form.closed") };
    const services = this.services;
    if (services == null) return { ok: false, message: say(language, "form.unavailable") };
    const checked = formValues(form.message, args.values);
    if (!checked.ok) return { ok: false, message: say(language, "form.fieldEmpty"), field: checked.field };
    const key = `${args.agentId}\u0000${args.entryId}`;
    if (this.filling.has(key)) return { ok: true };
    this.filling.add(key);
    const stamped = await this.stampForm(args.agentId, args.entryId, (entry) => (entry.formState ?? "open") === "open" ? { formState: "filling" } : null);
    if (stamped == null) { this.filling.delete(key); return { ok: false, message: say(language, "form.gone") }; }
    const own = services.browserPort(args.agentId);
    const ports = [own, ...(services.otherPorts ?? []).filter((port) => port !== own)];
    void (async () => {
      let result: UserFormFill;
      try {
        result = await (services.fill ?? fillUserForm)({ domain: form.message.form.domain, fields: formFieldSpecs(form.message), values: checked.values, submitAfterFill: form.message.form.submitAfterFill, ports });
      } catch (error) {
        result = { ok: false, message: error instanceof Error && error.message.length > 0 ? error.message : "The browser didn't answer." };
      }
      if (!result.ok) {
        // The browser's own sentence names no value: it is about the tab or the connection.
        this.log(`[forms] not typed in ${args.agentId}/${args.entryId} on ${form.message.form.domain}: ${result.message}`);
        await this.stampForm(args.agentId, args.entryId, () => ({ formState: "failed", formNote: say(language, "form.notTypedIn") }));
        this.wake(args.agentId, args.entryId, "form-failed", buildFormFailedWakePrompt(args.entryId, form.message, result.message));
        return;
      }
      this.log(`[forms] typed in ${args.agentId}/${args.entryId} on ${result.page}: ${Object.entries(result.outcomes).map(([id, outcome]) => `${id} ${outcome}`).join(", ")}${result.submitted ? ", Enter pressed" : ""}`);
      await this.stampForm(args.agentId, args.entryId, () => ({ formState: "filled", formOutcomes: result.outcomes, formSubmitted: result.submitted, formNote: undefined }));
      this.wake(args.agentId, args.entryId, "form-filled", buildFormFilledWakePrompt(args.entryId, form.message, result.outcomes, result.submitted));
    })().finally(() => this.filling.delete(key));
    return { ok: true };
  }

  /** The card's X: a decline the agent hears at once. */
  async dismissUserForm(args: { readonly agentId: string; readonly entryId: string }): Promise<{ readonly accepted: boolean }> {
    const form = await this.readForm(args.agentId, args.entryId);
    if (form == null || (form.formState ?? "open") !== "open") return { accepted: false };
    const stamped = await this.stampForm(args.agentId, args.entryId, (entry) => (entry.formState ?? "open") === "open" ? { formState: "dismissed" } : null);
    if (stamped == null) return { accepted: false };
    this.wake(args.agentId, args.entryId, "form-dismissed", buildFormDismissedWakePrompt(args.entryId, form.message), { silenceAllowed: true });
    return { accepted: true };
  }

  private wake(agentId: string, entryId: string, source: "form-filled" | "form-failed" | "form-dismissed", prompt: string, options: { readonly silenceAllowed?: boolean } = {}): void {
    void Promise.resolve()
      .then(() => this.tm.backgroundWakes.runHiddenPromptWake(agentId, source, prompt, say(this.tm.userLanguage?.(), "tray.resumeAfterFormFailed"), options.silenceAllowed === true ? { isSilenceAllowed: true } : undefined))
      .catch((error: unknown) => this.log(`[forms] ${source} wake for ${agentId}/${entryId} failed: ${error instanceof Error ? error.message : String(error)}`));
  }

  private async readForm(agentId: string, entryId: string): Promise<FormEntry | null> {
    return await readCard(this.tm, agentId, entryId, isUserFormEntry);
  }

  /** Writes a change to the card in its agent's transcript and sends it to the apps; null from `change` leaves it as it is. */
  private async stampForm(agentId: string, entryId: string, change: (entry: FormEntry) => FormPatch | null): Promise<TranscriptEntry | null> {
    return await stampCard(this.tm, agentId, entryId, isUserFormEntry, change);
  }
}
