// The in-chat form's fill (28 October 2026), as the upstream app's own card
// rules describe it ("In-chat form", `request_user_form`): the person types
// in the chat what a page on the agent's computer asks for (a sign-in, an
// address, a code), and the host types it into that page. The values stay in
// this process: never in the chat, a log, a shell command or a file, and the
// agent learns only which fields were filled. Like the checkout card's
// (`link-wallet/checkout-fill.ts`), it reaches the computer's Chrome over its
// DevTools port; it types only into a tab on the exact site the agent named
// ("www." aside), and only into the fields the agent pointed at.
//
// A field is pointed at by the ref of the browser helper's last snapshot
// (`e12`, or `f1e3` in a frame; `__sandRefs`, `sand-browser-driver-source.ts`),
// a CSS selector, or the words the page labels it with.

import { BOX_CHROME_PORTS, loadBoxPlaywright } from "../link-wallet/checkout-fill.js";
import { hostOfAddress, listTabsOn, wakeSleepingTabs, type BoxChromeTab } from "../link-wallet/box-chrome-tabs.js";

export const USER_FORM_FIELD_TYPES = ["text", "email", "tel", "password", "otp", "number", "date", "select", "textarea", "checkbox"] as const;
export type UserFormFieldType = (typeof USER_FORM_FIELD_TYPES)[number];

export interface UserFormTarget {
  readonly ref?: string;
  readonly selector?: string;
  readonly label?: string;
}

export interface UserFormFieldSpec {
  readonly id: string;
  readonly type: UserFormFieldType;
  readonly target: UserFormTarget;
}

/**
 * How one field went: typed in, could not be typed in, or left empty by the
 * person. A 1Password fill also says when a field isn't on this step of a
 * sign-in (`notFound`: the password page comes after the email page).
 */
export type UserFormFieldOutcome = "filled" | "fillFailed" | "notFilled" | "notFound";

export type UserFormCheck =
  | { readonly ok: true; readonly page: string }
  | { readonly ok: false; readonly message: string; readonly missing?: readonly string[] };

export type UserFormFill =
  | { readonly ok: true; readonly page: string; readonly outcomes: Readonly<Record<string, UserFormFieldOutcome>>; readonly submitted: boolean }
  | { readonly ok: false; readonly message: string };

/** The Playwright calls used here; a test hands in the real one. */
export interface FormLocator {
  count(): Promise<number>;
  nth(index: number): FormLocator;
  first(): FormLocator;
  isVisible(): Promise<boolean>;
  isEditable(): Promise<boolean>;
  isChecked(): Promise<boolean>;
  click(options?: Record<string, unknown>): Promise<void>;
  fill(value: string, options?: Record<string, unknown>): Promise<void>;
  pressSequentially(value: string, options?: Record<string, unknown>): Promise<void>;
  press(key: string, options?: Record<string, unknown>): Promise<void>;
  setChecked(checked: boolean, options?: Record<string, unknown>): Promise<void>;
  selectOption(values: unknown, options?: Record<string, unknown>): Promise<unknown>;
  inputValue(options?: Record<string, unknown>): Promise<string>;
  getAttribute(name: string, options?: Record<string, unknown>): Promise<string | null>;
  evaluate<R>(fn: (element: never) => R): Promise<R>;
}
export interface FormFrame {
  url(): string;
  isDetached(): boolean;
  locator(selector: string): FormLocator;
  getByLabel(text: string, options?: { exact?: boolean }): FormLocator;
  getByPlaceholder(text: string, options?: { exact?: boolean }): FormLocator;
  getByRole(role: string, options?: { name?: string; exact?: boolean }): FormLocator;
  evaluate<R>(fn: (arg: never) => R, arg?: unknown): Promise<R>;
}
interface FormPage {
  url(): string;
  frames(): FormFrame[];
  mainFrame(): FormFrame;
  bringToFront(): Promise<void>;
}
interface FormBrowser {
  contexts(): { pages(): FormPage[] }[];
  close(): Promise<void>;
}
export interface FormPlaywright {
  chromium: { connectOverCDP(endpoint: string, options?: Record<string, unknown>): Promise<FormBrowser> };
}

export interface UserFormPageOptions {
  /** The site the agent named, as its browser bar shows it ("accounts.example.com"). */
  readonly domain: string;
  readonly fields: readonly UserFormFieldSpec[];
  /** DevTools ports, the agent's own Chrome first; a tab on the site in the first one that has any is used. */
  readonly ports?: readonly number[];
  readonly loadPlaywright?: () => FormPlaywright;
  readonly listTabs?: (ports: readonly number[]) => Promise<readonly BoxChromeTab[]>;
  readonly wakeTabs?: (port: number) => Promise<unknown>;
}

export interface UserFormFillOptions extends UserFormPageOptions {
  /** What the person typed, by field id. Never logged, never returned. */
  readonly values: Readonly<Record<string, string>>;
  /** Presses Enter in the one field once it is filled (a one-time code); nothing else is ever submitted. */
  readonly submitAfterFill?: boolean;
  /** Pause between typed keys, so fields that format as you type keep up. */
  readonly keyDelayMs?: number;
  /** A field the page doesn't show: "fillFailed" (a form pointed at it), or "notFound" (a sign-in's later step). */
  readonly missingAs?: "fillFailed" | "notFound";
}

const TAG = "data-simeon-form";

/** The same site, "www." aside: never a subdomain or a look-alike. */
export function isSameSite(address: string, domain: string): boolean {
  const wanted = hostOfAddress(domain);
  return wanted.length > 0 && hostOfAddress(address) === wanted;
}

/** The ports whose Chrome shows the site: the first port (the agent's own) when it does, else every other one that does. */
async function sitePorts(domain: string, ports: readonly number[], listTabs: (ports: readonly number[]) => Promise<readonly BoxChromeTab[]>): Promise<readonly number[]> {
  const tabs = await listTabs(ports);
  const showing = tabs.filter((tab) => isSameSite(tab.url, domain));
  if (showing.length === 0) return [];
  const own = ports[0];
  if (own != null && showing.some((tab) => tab.port === own)) return [own];
  return [...new Set(showing.map((tab) => tab.port))];
}

async function firstUsable(locator: FormLocator, type: UserFormFieldType): Promise<FormLocator | undefined> {
  const count = await locator.count().catch(() => 0);
  for (let index = 0; index < Math.min(count, 6); index += 1) {
    const field = locator.nth(index);
    if (!(await field.isVisible().catch(() => false))) continue;
    // A checkbox is often drawn over by its label: visible and enabled is enough.
    if (type === "checkbox" || (await field.isEditable().catch(() => false))) return field;
  }
  return undefined;
}

/** The element a snapshot ref names, marked so a locator finds it; undefined when the page moved on since. */
async function byRef(page: FormPage, ref: string, token: string): Promise<{ frame: FormFrame; locator: FormLocator } | undefined> {
  const mark = (frame: FormFrame, generation: unknown): Promise<boolean> => frame.evaluate<boolean>(((args: [string, string, string, unknown]) => {
    const [wanted, attribute, value, expected] = args;
    const scope = globalThis as unknown as { __sandRefs?: unknown; __sandRefsGeneration?: unknown };
    if (expected !== undefined && scope.__sandRefsGeneration !== expected) return false;
    const map = scope.__sandRefs;
    const element = map instanceof Map ? map.get(wanted) as { isConnected?: boolean; setAttribute(name: string, value: string): void } | undefined : undefined;
    if (element == null || element.isConnected !== true) return false;
    element.setAttribute(attribute, value);
    return true;
  }) as never, [ref, TAG, token, generation]).catch(() => false);
  const main = page.mainFrame();
  if (/^e\d+$/.test(ref)) return (await mark(main, undefined)) ? { frame: main, locator: main.locator(`[${TAG}="${token}"]`) } : undefined;
  if (!/^f\d+e\d+$/.test(ref)) return undefined;
  const generation = await main.evaluate((() => (globalThis as unknown as { __sandRefsGeneration?: unknown }).__sandRefsGeneration) as never).catch(() => undefined);
  if (generation === undefined) return undefined;
  for (const frame of page.frames()) {
    if (frame === main || frame.isDetached()) continue;
    if (await mark(frame, generation)) return { frame, locator: frame.locator(`[${TAG}="${token}"]`) };
  }
  return undefined;
}

/** The field a target points at, in the page or one of its frames. */
async function locate(page: FormPage, field: UserFormFieldSpec, token: string): Promise<FormLocator | undefined> {
  const { ref, selector, label } = field.target;
  if (ref != null && ref.length > 0) {
    const found = await byRef(page, ref, token);
    const usable = found == null ? undefined : await firstUsable(found.locator, field.type);
    if (usable != null) return usable;
  }
  const frames = [page.mainFrame(), ...page.frames().filter((frame) => frame !== page.mainFrame() && !frame.isDetached())];
  if (selector != null && selector.length > 0) {
    for (const frame of frames) {
      const usable = await firstUsable(frame.locator(selector), field.type);
      if (usable != null) return usable;
    }
  }
  if (label != null && label.length > 0) {
    const roles = field.type === "checkbox" ? ["checkbox"] : field.type === "select" ? ["combobox", "listbox"] : ["textbox", "spinbutton"];
    for (const frame of frames) {
      const tries = [
        () => frame.getByLabel(label, { exact: true }),
        () => frame.getByPlaceholder(label, { exact: true }),
        ...roles.map((role) => () => frame.getByRole(role, { name: label, exact: true })),
        () => frame.getByLabel(label),
        () => frame.getByPlaceholder(label),
      ];
      for (const attempt of tries) {
        let locator: FormLocator;
        try { locator = attempt(); } catch { continue; }
        const usable = await firstUsable(locator, field.type);
        if (usable != null) return usable;
      }
    }
  }
  return undefined;
}

async function unmark(page: FormPage): Promise<void> {
  await Promise.all(page.frames().filter((frame) => !frame.isDetached()).map((frame) => frame.evaluate(((attribute: string) => {
    const doc = (globalThis as unknown as { document?: { querySelectorAll(selector: string): ArrayLike<{ removeAttribute(name: string): void }> } }).document;
    if (doc == null) return;
    const marked = doc.querySelectorAll(`[${attribute}]`);
    for (let index = 0; index < marked.length; index += 1) marked[index]?.removeAttribute(attribute);
  }) as never, TAG).catch(() => undefined)));
}

/**
 * Connects to the Chrome showing the site and finds the page there whose
 * fields can all be found (the most of them, else). The browsers are closed
 * by the caller; closing disconnects and leaves Chrome and its tabs open.
 */
async function withFormPage<T>(options: UserFormPageOptions, use: (page: FormPage, located: Map<string, FormLocator>, missing: string[]) => Promise<T>, none: (message: string) => T): Promise<T> {
  const domain = hostOfAddress(options.domain);
  if (domain.length === 0) return none("The form needs the site's domain, as the browser bar shows it.");
  let playwright: FormPlaywright;
  try { playwright = (options.loadPlaywright ?? (loadBoxPlaywright as unknown as () => FormPlaywright))(); } catch (error) { return none(`The browser can't be reached from here: ${error instanceof Error ? error.message : String(error)}`); }
  const ports = await sitePorts(domain, options.ports ?? BOX_CHROME_PORTS, options.listTabs ?? listTabsOn);
  if (ports.length === 0) return none(`No tab on ${domain} is open in the browser on your computer. Open the page first (OpenPage, or the browser helper), then ask again.`);
  await Promise.all(ports.map((port) => (options.wakeTabs ?? wakeSleepingTabs)(port).catch(() => undefined)));
  const browsers: FormBrowser[] = [];
  const pages: FormPage[] = [];
  await Promise.all(ports.map(async (port) => {
    try {
      const browser = await playwright.chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 5000 });
      browsers.push(browser);
      for (const context of browser.contexts()) pages.push(...context.pages().filter((page) => isSameSite(page.url(), domain)));
    } catch { /* no Chrome answered on this port */ }
  }));
  try {
    if (pages.length === 0) return none(`No tab on ${domain} could be reached in the browser on your computer. Open the page again, then ask again.`);
    let best: { page: FormPage; located: Map<string, FormLocator>; missing: string[] } | undefined;
    const looked: FormPage[] = [];
    try {
      for (const page of pages) {
        looked.push(page);
        const located = new Map<string, FormLocator>();
        const missing: string[] = [];
        for (const [index, field] of options.fields.entries()) {
          const found = await locate(page, field, `f${looked.length}-${index}-${Date.now().toString(36)}`);
          if (found == null) missing.push(field.id); else located.set(field.id, found);
        }
        if (best == null || missing.length < best.missing.length) best = { page, located, missing };
        if (missing.length === 0) break;
      }
      const chosen = best as { page: FormPage; located: Map<string, FormLocator>; missing: string[] };
      return await use(chosen.page, chosen.located, chosen.missing);
    } finally {
      // The marks a ref left on the page go, wherever it was looked for.
      await Promise.all(looked.map((page) => unmark(page)));
    }
  } finally {
    await Promise.all(browsers.map((browser) => browser.close().catch(() => undefined)));
  }
}

/**
 * Before the card is shown: is a tab on the site open, and can every field
 * the form points at be found there? A field that can't be is named, so the
 * agent points at it afresh or hands the screen over instead.
 */
export async function checkUserForm(options: UserFormPageOptions): Promise<UserFormCheck> {
  return await withFormPage<UserFormCheck>(options, async (page, _located, missing) => {
    if (missing.length === 0) return { ok: true, page: hostOfAddress(page.url()) };
    return { ok: false, missing, message: `These fields can't be found on ${hostOfAddress(page.url())}: ${missing.join(", ")}.` };
  }, (message) => ({ ok: false, message }));
}

/** Which of the fields are on the page now (a sign-in shows its email first, its password next). */
export async function locateFields(options: UserFormPageOptions): Promise<{ readonly ok: true; readonly page: string; readonly found: readonly string[] } | { readonly ok: false; readonly message: string }> {
  return await withFormPage<{ readonly ok: true; readonly page: string; readonly found: readonly string[] } | { readonly ok: false; readonly message: string }>(options, async (page, located) => ({ ok: true as const, page: hostOfAddress(page.url()), found: options.fields.map((field) => field.id).filter((id) => located.has(id)) }), (message) => ({ ok: false as const, message }));
}

async function fillOne(field: FormLocator, type: UserFormFieldType, value: string, delay: number): Promise<boolean> {
  if (type === "checkbox") {
    const wanted = /^(true|yes|on|1|checked)$/i.test(value.trim());
    await field.setChecked(wanted, { timeout: 5000, force: true });
    return (await field.isChecked().catch(() => !wanted)) === wanted;
  }
  if (type === "select") {
    for (const option of [{ value }, { label: value }]) {
      try { await field.selectOption(option, { timeout: 3000 }); return true; } catch { /* the other spelling */ }
    }
    return false;
  }
  const inputType = (await field.getAttribute("type", { timeout: 2000 }).catch(() => null)) ?? "";
  if (type === "date" && inputType.toLowerCase() === "date") {
    await field.fill(value, { timeout: 5000 });
  } else {
    await field.click({ timeout: 5000 }).catch(() => undefined);
    await field.fill("", { timeout: 5000 }).catch(() => undefined);
    await field.pressSequentially(value, { delay, timeout: 20_000 });
  }
  return (await field.inputValue({ timeout: 2000 }).catch(() => "")).length > 0;
}

/** Where a sign-up's new password goes: a password field, never one asking for the current password. */
export const NEW_PASSWORD_SELECTOR = 'input[type="password"]:not([autocomplete="current-password"])';

export type NewPasswordFill =
  | { readonly ok: true; readonly page: string; readonly filled: number; readonly failed: number }
  | { readonly ok: false; readonly message: string };

/**
 * A sign-up's new password (the Credentials Store, 28 October 2026):
 * typed into every password field the page shows, the password and its
 * confirmation, at most three, never one asking for the current password.
 * What comes back is how many went in, never the value.
 */
export async function fillNewPassword(options: Omit<UserFormPageOptions, "fields"> & { readonly value: string; readonly keyDelayMs?: number }): Promise<NewPasswordFill> {
  const fields: UserFormFieldSpec[] = [{ id: "password", type: "password", target: { selector: NEW_PASSWORD_SELECTOR } }];
  return await withFormPage<NewPasswordFill>({ ...options, fields }, async (page, located) => {
    const host = hostOfAddress(page.url());
    if (!located.has("password") || options.value.length === 0) return { ok: true, page: host, filled: 0, failed: 0 };
    await page.bringToFront().catch(() => undefined);
    const delay = options.keyDelayMs ?? 25;
    let filled = 0;
    let failed = 0;
    const frames = [page.mainFrame(), ...page.frames().filter((frame) => frame !== page.mainFrame() && !frame.isDetached())];
    for (const frame of frames) {
      const all = frame.locator(NEW_PASSWORD_SELECTOR);
      const count = Math.min(await all.count().catch(() => 0), 6);
      for (let index = 0; index < count && filled + failed < 3; index += 1) {
        const field = all.nth(index);
        if (!(await field.isVisible().catch(() => false)) || !(await field.isEditable().catch(() => false))) continue;
        if (await fillOne(field, "password", options.value, delay).catch(() => false)) filled += 1;
        else failed += 1;
      }
    }
    return { ok: true, page: host, filled, failed };
  }, (message) => ({ ok: false, message }));
}

/**
 * Types what the person gave into the fields, each where the form pointed.
 * A field left empty is not touched ("notFilled"). Enter is pressed only
 * when asked and every field went in. What comes back says nothing of the
 * values.
 */
export async function fillUserForm(options: UserFormFillOptions): Promise<UserFormFill> {
  return await withFormPage<UserFormFill>(options, async (page, located) => {
    await page.bringToFront().catch(() => undefined);
    const delay = options.keyDelayMs ?? 25;
    const outcomes: Record<string, UserFormFieldOutcome> = {};
    for (const field of options.fields) {
      const value = options.values[field.id] ?? "";
      const where = located.get(field.id);
      if (value.length === 0) { outcomes[field.id] = "notFilled"; continue; }
      if (where == null) { outcomes[field.id] = options.missingAs ?? "fillFailed"; continue; }
      outcomes[field.id] = (await fillOne(where, field.type, value, delay).catch(() => false)) ? "filled" : "fillFailed";
    }
    let submitted = false;
    const only = options.fields[0];
    if (options.submitAfterFill === true && options.fields.length === 1 && only != null && outcomes[only.id] === "filled") {
      const where = located.get(only.id);
      if (where != null) submitted = await where.press("Enter", { timeout: 5000 }).then(() => true, () => false);
    }
    return { ok: true, page: hostOfAddress(page.url()), outcomes, submitted };
  }, (message) => ({ ok: false, message }));
}
