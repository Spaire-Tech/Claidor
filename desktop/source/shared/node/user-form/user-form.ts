// The in-chat form's card (28 October 2026): what the agent's
// `request_user_form` puts in the chat, what the apps draw, and what the agent
// is told once the person answers. The rules are the upstream app's own for
// its card ("In-chat form"):
//
//   - The form is the ask: the page needs the person to type something (a
//     sign-in, a delivery address, a phone number, a code) and its fields can
//     be reached from the host. The agent never asks for these in the chat.
//   - One to eight fields, each pointed at a field on the open page (a ref of
//     the browser helper's snapshot, a selector or its label), on one site
//     (`domain`). A password or a code is always masked.
//   - The host fills; the agent presses the site's own button afterwards.
//     Only a lone one-time code may press Enter (`submitAfterFill`).
//   - The agent learns, per field, filled / fillFailed / notFilled, never a
//     value. Dismissing it is a decline.
//   - It ends the turn: the agent is woken with the answer.

import { USER_FORM_FIELD_TYPES, type UserFormFieldOutcome, type UserFormFieldSpec, type UserFormFieldType, type UserFormTarget } from "./form-fill.js";

export const USER_FORM_MESSAGE_TYPE = "user-form";
export const USER_FORM_MAX_FIELDS = 8;
/** The longest value a field takes from the person. */
export const USER_FORM_MAX_VALUE = 2000;

export type UserFormReason = "auth" | "checkout" | "profile" | "other";

export interface UserFormOption {
  readonly label: string;
  readonly value: string;
}

export interface UserFormField {
  readonly id: string;
  readonly label: string;
  readonly type: UserFormFieldType;
  /** Masked on the card. Always for a password or a code. */
  readonly secret: boolean;
  readonly required: boolean;
  readonly placeholder?: string;
  /** A menu's choices; the value is what is picked on the page. */
  readonly options?: readonly UserFormOption[];
  /** Where on the page it goes. The apps don't draw it. */
  readonly target: UserFormTarget;
}

export interface UserFormMessage {
  readonly type: typeof USER_FORM_MESSAGE_TYPE;
  readonly form: {
    readonly title: string;
    readonly instruction: string;
    readonly reason: UserFormReason;
    /** The site it is typed into, without "www.". */
    readonly domain: string;
    readonly submitAfterFill: boolean;
    readonly fields: readonly UserFormField[];
  };
}

/** Where the card stands: open, being typed in, done, couldn't be typed in, or dismissed. */
export type UserFormState = "open" | "filling" | "filled" | "failed" | "dismissed";

/** What the card's entry carries beside its message. Never a value. */
export interface UserFormEntryFields {
  readonly formState?: UserFormState;
  readonly formOutcomes?: Readonly<Record<string, UserFormFieldOutcome>>;
  readonly formSubmitted?: boolean;
  /** Why it couldn't be typed in, for the person. */
  readonly formNote?: string;
}

/** The tool's own arguments, as the agent writes them. */
export interface UserFormArgs {
  readonly title: string;
  readonly instruction: string;
  readonly reason?: UserFormReason | undefined;
  readonly domain: string;
  readonly submit_after_fill?: boolean | undefined;
  readonly fields: readonly {
    readonly id: string;
    readonly label: string;
    readonly type: UserFormFieldType;
    readonly secret?: boolean | undefined;
    readonly required?: boolean | undefined;
    readonly placeholder?: string | undefined;
    readonly options?: readonly (string | { readonly label: string; readonly value?: string | undefined })[] | undefined;
    readonly target?: { readonly ref?: string | undefined; readonly selector?: string | undefined; readonly label?: string | undefined } | undefined;
  }[];
}

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

/** "accounts.example.com" from what the agent wrote, without "www."; empty when it isn't a site. */
export function formDomain(raw: string): string {
  const value = raw.trim().toLowerCase();
  if (value.length === 0) return "";
  try {
    return new URL(value.includes("://") ? value : `https://${value}`).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** The card's message from the agent's arguments, or why it can't be shown. */
export function userFormFromArgs(args: UserFormArgs): UserFormMessage | string {
  const title = text(args.title);
  const instruction = text(args.instruction);
  if (title.length === 0) return "The form needs a `title`.";
  if (instruction.length === 0) return "The form needs an `instruction`: one or two sentences saying what to type and why.";
  const domain = formDomain(args.domain);
  if (domain.length === 0) return "The form needs `domain`: the site's host exactly as the browser bar shows it (\"accounts.example.com\").";
  if (args.fields.length === 0) return "The form needs at least one field.";
  if (args.fields.length > USER_FORM_MAX_FIELDS) return `A form has at most ${USER_FORM_MAX_FIELDS} fields: ask for one visible step at a time.`;
  const seen = new Set<string>();
  const fields: UserFormField[] = [];
  for (const raw of args.fields) {
    const id = text(raw.id);
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) return `"${id}" is not a field id: letters, digits, "_" and "-" only.`;
    if (seen.has(id)) return `Two fields are called "${id}".`;
    seen.add(id);
    const label = text(raw.label);
    if (label.length === 0) return `Field "${id}" needs a \`label\`.`;
    if (!(USER_FORM_FIELD_TYPES as readonly string[]).includes(raw.type)) return `Field "${id}" has no type the card knows (${USER_FORM_FIELD_TYPES.join(", ")}).`;
    const target: UserFormTarget = {
      ...(text(raw.target?.ref).length > 0 ? { ref: text(raw.target?.ref) } : {}),
      ...(text(raw.target?.selector).length > 0 ? { selector: text(raw.target?.selector) } : {}),
      ...(text(raw.target?.label).length > 0 ? { label: text(raw.target?.label) } : {}),
    };
    if (Object.keys(target).length === 0) return `Field "${id}" needs a \`target\` on the page: the ref from a fresh snapshot, a selector, or the words the page labels it with. Nothing the person types comes back to you, so a field with nowhere to go is useless.`;
    const options = (raw.options ?? []).map((option) => typeof option === "string" ? { label: text(option), value: text(option) } : { label: text(option.label), value: text(option.value) || text(option.label) }).filter((option) => option.label.length > 0);
    if (raw.type === "select" && options.length === 0) return `Field "${id}" is a menu and needs \`options\`.`;
    const placeholder = text(raw.placeholder);
    fields.push({
      id,
      label: label.slice(0, 80),
      type: raw.type,
      secret: raw.type === "password" || raw.type === "otp" || raw.secret === true,
      required: raw.required !== false && raw.type !== "checkbox",
      ...(placeholder.length > 0 ? { placeholder: placeholder.slice(0, 120) } : {}),
      ...(options.length > 0 ? { options: options.slice(0, 50) } : {}),
      target,
    });
  }
  const submitAfterFill = args.submit_after_fill === true;
  if (submitAfterFill) {
    const only = fields[0];
    const oneCode = fields.length === 1 && only != null && (only.type === "otp" || only.type === "text" || only.type === "number");
    if (!oneCode || (args.reason ?? "other") === "checkout") return "`submit_after_fill` is only for a one-time code: exactly one single-line field (an otp, text or number). Never for a sign-in, a checkout or a payment: leave it off and press the site's own button yourself after the fill.";
  }
  return {
    type: USER_FORM_MESSAGE_TYPE,
    form: { title: title.slice(0, 100), instruction: instruction.slice(0, 400), reason: args.reason ?? "other", domain, submitAfterFill, fields },
  };
}

/** The fields as the fill reads them. */
export function formFieldSpecs(message: UserFormMessage): UserFormFieldSpec[] {
  return message.form.fields.map((field) => ({ id: field.id, type: field.type, target: field.target }));
}

/** What the person typed, kept to the form's own fields; a reason when a required one is empty. */
export function formValues(message: UserFormMessage, raw: unknown): { readonly ok: true; readonly values: Record<string, string> } | { readonly ok: false; readonly field: string } {
  const given = raw != null && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const values: Record<string, string> = {};
  for (const field of message.form.fields) {
    const value = typeof given[field.id] === "string" ? (given[field.id] as string).slice(0, USER_FORM_MAX_VALUE) : typeof given[field.id] === "boolean" ? String(given[field.id]) : "";
    const kept = field.secret ? value : value.trim();
    if (field.required && kept.length === 0) return { ok: false, field: field.id };
    values[field.id] = kept;
  }
  return { ok: true, values };
}

const list = (ids: readonly string[], message: UserFormMessage): string => ids.map((id) => message.form.fields.find((field) => field.id === id)?.label ?? id).map((label) => `"${label}"`).join(", ");

/** What the agent is woken with once the form went into the page. */
export function buildFormFilledWakePrompt(entryId: string, message: UserFormMessage, outcomes: Readonly<Record<string, UserFormFieldOutcome>>, submitted: boolean): string {
  const ids = message.form.fields.map((field) => field.id);
  const filled = ids.filter((id) => outcomes[id] === "filled");
  const failed = ids.filter((id) => outcomes[id] === "fillFailed");
  const empty = ids.filter((id) => outcomes[id] === "notFilled");
  const parts = [
    `[The user filled your form "${message.form.title}" (entry ${entryId}) and it was typed into the page on ${message.form.domain}.`,
    filled.length > 0 ? `Typed in: ${list(filled, message)}.` : "Nothing was typed in.",
    failed.length > 0 ? `Not typed in, the field couldn't be reached: ${list(failed, message)}. Send a new form for just those, pointed at them from a fresh snapshot, or hand the user the screen (request_box_help); never ask for them in the chat, and never take a screenshot to check a secret field.` : "",
    empty.length > 0 ? `Left empty by the user: ${list(empty, message)}.` : "",
    submitted ? "Enter was pressed in it once, as you asked: have the browser helper look at where the page went." : "Nothing was submitted: have the browser helper take a fresh snapshot and press the site's own button to go on (Sign in, Continue, Save).",
    "You never see what they typed, and the card already shows what went in, so don't repeat it.]",
  ];
  return parts.filter((part) => part.length > 0).join(" ");
}

/** What the agent is woken with when nothing could be typed in. */
export function buildFormFailedWakePrompt(entryId: string, message: UserFormMessage, reason: string): string {
  return `[The user filled your form "${message.form.title}" (entry ${entryId}) but it could not be typed into the page on ${message.form.domain}: ${reason} Nothing they typed was kept. Open the page again and send a new form, or hand them the screen with request_box_help; never ask for it in the chat. Tell them in one short line what happened.]`;
}

/** What the agent is woken with when the person dismissed it: a decline. */
export function buildFormDismissedWakePrompt(entryId: string, message: UserFormMessage): string {
  return `[The user dismissed your form "${message.form.title}" (entry ${entryId}) without filling it. Take it as declined and don't send it again. Carry on without it if the task allows; if the task waited on it, end your turn without a message.]`;
}

/** The tool's answer once the card is in the chat; `turn-shape.ts` reads it as a card that waits. */
export function formShownNote(message: UserFormMessage, entryId: string | undefined): string {
  return `The form "${message.form.title}" is in the chat${entryId == null ? "" : ` (entry ${entryId})`}. Your turn ends here: send nothing more about it now. You are woken once the user fills or dismisses it, with which fields were typed into the page (never what they hold).`;
}
