import {
  checkUserForm,
  fillNewPassword,
  fillUserForm,
  locateFields,
  USER_FORM_FIELD_TYPES,
  type NewPasswordFill,
  type UserFormCheck,
  type UserFormFieldOutcome,
  type UserFormFill,
  type UserFormFillOptions,
  type UserFormPageOptions,
} from "../../../shared/node/user-form/form-fill.js";
import type { AppBrowserLive, AppBrowserRoute } from "./app-browser-route.js";

/**
 * The cards' fills where the agent's page is (docs/app-browser/README.md,
 * step 3b, 4 November 2026): the in-chat form, 1Password, the Credentials
 * Store's saved login and new password. For a task in the Mac or Windows
 * app's browser (`AppBrowserRoute.where`), the fields and the values go to
 * that app as one `form` step, and it types them into its own tab; the
 * answer says which fields went in, never what. Every other task fills the
 * computer's Chrome exactly as before (`form-fill.ts`). The values are
 * never logged, here or in the app; the agent learns only the outcomes, as
 * today. The sentences are the computer's own, so the cards and the agent
 * read them the same.
 */

export type LocatedFields = { readonly ok: true; readonly page: string; readonly found: readonly string[] } | { readonly ok: false; readonly message: string };

/** The computer's own fills (`form-fill.ts`); a test hands in others. */
export interface BoxForms {
  check(options: UserFormPageOptions): Promise<UserFormCheck>;
  locate(options: UserFormPageOptions): Promise<LocatedFields>;
  fill(options: UserFormFillOptions): Promise<UserFormFill>;
  newPassword(options: Omit<UserFormPageOptions, "fields"> & { readonly value: string; readonly keyDelayMs?: number }): Promise<NewPasswordFill>;
}

export interface RoutedForms {
  check(agentId: string, options: UserFormPageOptions): Promise<UserFormCheck>;
  locate(agentId: string, options: UserFormPageOptions): Promise<LocatedFields>;
  fill(agentId: string, options: UserFormFillOptions): Promise<UserFormFill>;
  newPassword(agentId: string, options: Omit<UserFormPageOptions, "fields"> & { readonly value: string; readonly keyDelayMs?: number }): Promise<NewPasswordFill>;
}

const BOX_FORMS: BoxForms = { check: checkUserForm, locate: locateFields, fill: fillUserForm, newPassword: fillNewPassword };

/** A fill in the app waits this long for its answer (typing a long form at 25 ms a key takes a while). */
export const APP_FORM_TIMEOUT_MS = 60_000;

const OUTCOMES = new Set<UserFormFieldOutcome>(["filled", "fillFailed", "notFilled", "notFound"]);

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((one): one is string => typeof one === "string") : [];
}

/** The fields as the app is sent them: their ids, types and targets, nothing else of the options. */
function fieldsFor(options: UserFormPageOptions): Record<string, unknown>[] {
  return options.fields.map((field) => ({
    id: field.id,
    type: USER_FORM_FIELD_TYPES.includes(field.type) ? field.type : "text",
    target: {
      ...(field.target.ref === undefined ? {} : { ref: field.target.ref }),
      ...(field.target.selector === undefined ? {} : { selector: field.target.selector }),
      ...(field.target.label === undefined ? {} : { label: field.target.label }),
    },
  }));
}

/** The app holding an agent's task, when its browser does (`AppBrowserRoute.where`); none for a task on the computer. */
export interface AppTask {
  readonly route: AppBrowserRoute;
  readonly live: AppBrowserLive;
}

export function appTaskOf(route: AppBrowserRoute | undefined, agentId: string): AppTask | undefined {
  const live = route?.where?.(agentId);
  return route === undefined || live === undefined ? undefined : { route, live };
}

/** One step to the app (a card's fill or read, never shown or logged); its data as JSON, or the app's own sentence. */
export async function askApp(app: AppTask, agentId: string, op: "form" | "checkout", args: Record<string, unknown>, timeoutMs: number): Promise<{ readonly ok: true; readonly data: Record<string, unknown> } | { readonly ok: false; readonly message: string }> {
  let answer: Record<string, unknown>;
  try {
    answer = await app.route.request(app.live, { op, viewId: agentId, args, screenshot: false }, { timeoutMs });
  } catch (error) {
    return { ok: false, message: error instanceof Error && error.message.length > 0 ? error.message : "The browser didn't answer." };
  }
  if (answer.ok !== true) return { ok: false, message: typeof answer.error === "string" && answer.error.length > 0 ? answer.error : "The browser couldn't fill the page." };
  try {
    const data = JSON.parse(typeof answer.data === "string" ? answer.data : "") as unknown;
    if (typeof data === "object" && data !== null && !Array.isArray(data)) return { ok: true, data: data as Record<string, unknown> };
  } catch { /* below */ }
  return { ok: false, message: "The browser's answer couldn't be read." };
}

/**
 * The fills, each sent where the agent's task is. `route` is read at each
 * fill (the local-browser extension may start after whoever holds this);
 * without one, or for a task on the computer, the computer's own.
 */
export function routedForms(route: () => AppBrowserRoute | undefined, box: BoxForms = BOX_FORMS): RoutedForms {
  const inApp = (agentId: string): AppTask | undefined => appTaskOf(route(), agentId);
  const ask = (app: AppTask, agentId: string, args: Record<string, unknown>) => askApp(app, agentId, "form", args, APP_FORM_TIMEOUT_MS);
  const pageOf = (data: Record<string, unknown>): string => (typeof data.page === "string" ? data.page : "");

  return {
    async check(agentId, options) {
      const app = inApp(agentId);
      if (app === undefined) return await box.check(options);
      const answer = await ask(app, agentId, { action: "check", domain: options.domain, fields: fieldsFor(options) });
      if (!answer.ok) return answer;
      const missing = strings(answer.data.missing);
      const page = pageOf(answer.data);
      if (missing.length === 0) return { ok: true, page };
      return { ok: false, missing, message: `These fields can't be found on ${page}: ${missing.join(", ")}.` };
    },

    async locate(agentId, options) {
      const app = inApp(agentId);
      if (app === undefined) return await box.locate(options);
      const answer = await ask(app, agentId, { action: "locate", domain: options.domain, fields: fieldsFor(options) });
      if (!answer.ok) return answer;
      return { ok: true, page: pageOf(answer.data), found: strings(answer.data.found) };
    },

    async fill(agentId, options) {
      const app = inApp(agentId);
      if (app === undefined) return await box.fill(options);
      const values: Record<string, string> = {};
      for (const field of options.fields) values[field.id] = options.values[field.id] ?? "";
      const answer = await ask(app, agentId, {
        action: "fill",
        domain: options.domain,
        fields: fieldsFor(options),
        values,
        submitAfterFill: options.submitAfterFill === true,
        missingAs: options.missingAs ?? "fillFailed",
        ...(options.keyDelayMs === undefined ? {} : { keyDelayMs: options.keyDelayMs }),
      });
      if (!answer.ok) return answer;
      const said = typeof answer.data.outcomes === "object" && answer.data.outcomes !== null ? answer.data.outcomes as Record<string, unknown> : {};
      const outcomes: Record<string, UserFormFieldOutcome> = {};
      for (const field of options.fields) {
        const outcome = said[field.id];
        outcomes[field.id] = typeof outcome === "string" && OUTCOMES.has(outcome as UserFormFieldOutcome) ? outcome as UserFormFieldOutcome : "fillFailed";
      }
      return { ok: true, page: pageOf(answer.data), outcomes, submitted: answer.data.submitted === true };
    },

    async newPassword(agentId, options) {
      const app = inApp(agentId);
      if (app === undefined) return await box.newPassword(options);
      const answer = await ask(app, agentId, { action: "newPassword", domain: options.domain, value: options.value, ...(options.keyDelayMs === undefined ? {} : { keyDelayMs: options.keyDelayMs }) });
      if (!answer.ok) return answer;
      const count = (value: unknown) => (typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0);
      return { ok: true, page: pageOf(answer.data), filled: count(answer.data.filled), failed: count(answer.data.failed) };
    },
  };
}
