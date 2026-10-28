/**
 * request_user_form (28 October 2026): the in-chat form, as the upstream
 * app's own card rules describe it (`shared/node/user-form/user-form.ts`).
 * Before the card is shown, the host checks that a tab on the site is open
 * and that every field it points at can be found there
 * (`checkUserForm`); a form that can't be filled is never put in front of
 * the person.
 */
import { z } from "zod";
import { defineCommunicateTool } from "./communicate-tool.js";
import { USER_FORM_FIELD_TYPES, type UserFormCheck, type UserFormFieldSpec } from "../../../shared/node/user-form/form-fill.js";
import { USER_FORM_MAX_FIELDS, formFieldSpecs, formShownNote, userFormFromArgs, type UserFormMessage } from "../../../shared/node/user-form/user-form.js";

export const requestUserFormParameters = z.object({
  title: z.string().trim().min(1).describe('The card\'s title, a few words ("Sign in to Acme", "Delivery address").'),
  instruction: z.string().trim().min(1).describe("One or two sentences to the user: what to type and why."),
  reason: z.enum(["auth", "checkout", "profile", "other"]).optional().catch(undefined).describe('"auth" for a sign-in or a code, "checkout" for an order\'s address or contact, "profile" for an account\'s details, "other".'),
  domain: z.string().trim().min(1).describe('The site\'s host exactly as the browser bar shows it ("accounts.example.com"). The values are typed only into a tab on that site.'),
  fields: z.array(z.object({
    id: z.string().trim().min(1).describe('A short id for the field ("email", "password").'),
    label: z.string().trim().min(1).describe("The field's name on the card, in the user's words."),
    type: z.enum(USER_FORM_FIELD_TYPES).describe("text, email, tel, password, otp (a one-time code), number, date (YYYY-MM-DD), select (with options), textarea or checkbox. A password or an otp is always masked."),
    secret: z.boolean().optional().describe("Mask it on the card: set it for any other credential."),
    required: z.boolean().optional().describe("Defaults to true (a checkbox never is)."),
    placeholder: z.string().trim().optional(),
    options: z.array(z.union([z.string(), z.object({ label: z.string(), value: z.string().optional() })])).optional().describe("A select's choices, as the page shows them."),
    target: z.object({
      ref: z.string().trim().optional().describe("The field's ref in the browser helper's latest snapshot of this page (e12, or f1e3 in a frame)."),
      selector: z.string().trim().optional().describe("A CSS selector for the field."),
      label: z.string().trim().optional().describe("The words the page labels the field with, or its placeholder."),
    }).describe("Where the field is on the page. At least one; the ref is checked first, then the selector, then the label."),
  })).min(1).max(USER_FORM_MAX_FIELDS).describe(`1 to ${USER_FORM_MAX_FIELDS} fields: only those the page shows now (one step of a sign-in at a time).`),
  submit_after_fill: z.boolean().optional().describe("Press Enter in the field once it is filled. Only for a lone one-time code; never for a sign-in, a checkout or a payment."),
});

export interface UserFormToolDependencies {
  /** Whether the page is open and every field can be found on it. */
  checkForm(request: { readonly domain: string; readonly fields: readonly UserFormFieldSpec[] }): Promise<UserFormCheck>;
  /** Appends the card to the transcript; returns the entry id when the transport reports one. */
  emitFormCard(message: UserFormMessage, timestampMs: number): string | undefined;
  now?: () => number;
}

export const REQUEST_USER_FORM_DESCRIPTION = "Ask the user, in a form in the chat, for what a page open on your computer needs them to type: a sign-in (email or username, password), a one-time code, a delivery address or phone, an account's details. The form is the ask: never ask for these in the chat, and don't ask whether to send a form. The host types what they enter into the page; you never see it, and you learn only which fields went in. Before calling it, have the page open on the step that asks (the browser helper stops there and reports each field's ref from a fresh snapshot, or its label), and point every field at its place on the page; ask only for the fields shown now (one step of a sign-in at a time). The fields must be ones the host can type into: a field it can't find is refused before the user sees anything. For SSO, a passkey, a captcha, a QR code or a field inside a frame the page won't let you reach, hand the screen over with request_box_help instead. After the fill, have the helper take a fresh snapshot and press the site's own button (Sign in, Continue); only a lone one-time code may set submit_after_fill. Sending the form ends your turn; you are woken when they fill or dismiss it. A dismissal is a decline: don't send it again.";

export function createRequestUserFormTool(deps: UserFormToolDependencies) {
  return defineCommunicateTool(deps, {
    id: "REQUEST_USER_FORM",
    name: "request_user_form",
    description: REQUEST_USER_FORM_DESCRIPTION,
    parameters: requestUserFormParameters,
    describeActivity: (args: z.infer<typeof requestUserFormParameters>) => ({ detail: `Asking for ${args.title}` }),
    execute: async (_ctx, args: z.infer<typeof requestUserFormParameters>, resolved) => {
      const message = userFormFromArgs(args);
      if (typeof message === "string") return message;
      const checked = await resolved.checkForm({ domain: message.form.domain, fields: formFieldSpecs(message) });
      if (!checked.ok) {
        const missing = checked.missing ?? [];
        return `The form was not shown: ${checked.message}${missing.length > 0 ? " Have the browser helper take a fresh snapshot of the page and point those fields at it again (its refs, a selector, or the words the page labels them with)." : ""} If the page won't let them be reached, hand the user the screen with request_box_help instead; never ask for these in the chat.`;
      }
      const entryId = resolved.emitFormCard(message, (resolved.now ?? Date.now)());
      return formShownNote(message, entryId);
    },
  });
}
