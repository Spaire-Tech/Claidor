import { DUFFEL_CARD_FRAMES, DUFFEL_FIELDS, duffelMissing, duffelValues, payOnDuffelPage, sayOnPayPage, type DuffelFieldKind, type DuffelPayOptions, type DuffelPayResult } from "../../../shared/node/flight-booking/duffel-pay.js";
import { say } from "../../../shared/say.js";
import { appTaskOf, askApp, type AppTask } from "./app-browser-forms.js";
import type { AppBrowserRoute } from "./app-browser-route.js";

/**
 * Paying a flight where the agent's page is (docs/app-browser/README.md,
 * step 3c-2): for a task in the Mac or Windows app's browser, Simeon's pay
 * page opens in the agent's tab there and the card is typed into Duffel's
 * frame by the app; the bank's check is in that tab, where the person
 * answers it (the bank-check card opens it, step 3a). The same steps as on
 * the computer (`payOnDuffelPage`), each one short `flight` step to the
 * app, with the computer's fields, values and sentences. Every other task
 * pays on the computer as before. The card is never logged.
 */

export interface RoutedDuffel {
  pay(options: DuffelPayOptions): Promise<DuffelPayResult>;
  /** Words on the open pay page (its status line), best effort. */
  say(port: number, words: string, agentId?: string): Promise<void>;
}

export interface BoxDuffel {
  pay(options: DuffelPayOptions): Promise<DuffelPayResult>;
  say(port: number, words: string): Promise<void>;
}

const BOX_DUFFEL: BoxDuffel = { pay: payOnDuffelPage, say: (port, words) => sayOnPayPage(port, words) };
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const FRAMES = DUFFEL_CARD_FRAMES.map((origin) => origin.source);
const CHOSEN = new Set<string>(["country", "region", "expiry month", "expiry year"]);

async function payInApp(app: AppTask, agentId: string, options: DuffelPayOptions): Promise<DuffelPayResult> {
  const language = options.language;
  const poll = options.pollMs ?? 1000;
  const step = (args: Record<string, unknown>, timeoutMs: number) => askApp(app, agentId, "flight", args, timeoutMs);
  const status = async (): Promise<{ readonly phase?: string; readonly error?: string | null; readonly session?: { readonly id?: string } | null; readonly cardFrames: number } | undefined> => {
    const answer = await step({ action: "status", frames: FRAMES }, 10_000);
    if (!answer.ok) return undefined;
    const page = typeof answer.data.status === "object" && answer.data.status !== null ? (answer.data.status as Record<string, unknown>) : {};
    const session = typeof page.session === "object" && page.session !== null ? (page.session as { id?: string }) : null;
    return { ...(typeof page.phase === "string" ? { phase: page.phase } : {}), error: typeof page.error === "string" ? page.error : null, session, cardFrames: typeof answer.data.cardFrames === "number" ? answer.data.cardFrames : 0 };
  };

  const opened = await step({ action: "open", url: options.pageUrl }, 45_000);
  if (!opened.ok) return { ok: false, stage: "browser", message: say(language, "pay.browserNoAnswer", { why: opened.message }) };

  // The card form, ready in its frame.
  let ready: Awaited<ReturnType<typeof status>>;
  for (let waited = 0; waited < 40_000; waited += poll) {
    ready = await status();
    if (ready?.phase === "failed") return { ok: false, stage: "form", message: ready.error ?? say(language, "pay.pageNoStart") };
    if (ready?.phase === "form" && ready.cardFrames > 0) break;
    await pause(poll);
  }
  if (ready?.phase !== "form") return { ok: false, stage: "form", message: say(language, "pay.formNotLoaded") };
  await pause(Math.min(1500, poll * 2));

  // The card and its billing address, typed in Duffel's frames only.
  const values = duffelValues(options.card, options.holder);
  const kinds = Object.keys(DUFFEL_FIELDS) as DuffelFieldKind[];
  const typed = await step({
    action: "fill",
    frames: FRAMES,
    fields: kinds.map((kind) => ({ kind, selector: DUFFEL_FIELDS[kind].selector, pattern: DUFFEL_FIELDS[kind].label.source, chosen: CHOSEN.has(kind) })),
    values,
    keyDelayMs: options.keyDelayMs ?? 35,
  }, 60_000);
  if (!typed.ok) return { ok: false, stage: "card", message: say(language, "pay.pageStopped", { why: typed.message }) };
  const filled = new Set((Array.isArray(typed.data.filled) ? typed.data.filled : []).filter((kind): kind is DuffelFieldKind => typeof kind === "string" && kinds.includes(kind as DuffelFieldKind)));
  const { missing, absent } = duffelMissing(filled, values);
  const fieldsSeen = typeof typed.data.seen === "string" ? typed.data.seen.slice(0, 1500) : "";
  if (missing.length > 0) return { ok: false, stage: "card", message: say(language, "pay.fieldsMissing", { fields: missing.join(", ") }), filled: [...filled], missing: [...missing, ...absent], fieldsSeen };

  // Duffel keeps the card for 25 minutes under an id.
  const made = await step({ action: "call", fn: "createCard" }, 30_000);
  const card = made.ok && typeof made.data.value === "object" && made.data.value !== null ? (made.data.value as { ok?: boolean; card?: { id?: string; last_4_digits?: string }; error?: string }) : undefined;
  const cardId = card?.ok === true ? card.card?.id ?? "" : "";
  if (cardId.length === 0) return { ok: false, stage: "card", message: card?.error ?? (made.ok ? say(language, "pay.cardNotTaken") : made.message), filled: [...filled], missing: absent, fieldsSeen };

  // The bank check: most cards pass without a word; some banks want the person, in the tab here.
  const verify = await step({ action: "call", fn: "verify", args: [options.offerId, cardId] }, 15_000);
  if (!verify.ok) return { ok: false, stage: "verify", message: say(language, "pay.pageStopped", { why: verify.message }), filled: [...filled] };
  let challenged = false;
  const limit = options.verifyTimeoutMs ?? 10 * 60_000;
  for (let waited = 0; waited < limit; waited += poll) {
    const now = await status();
    if (now?.phase === "ready" && now.session?.id != null) return { ok: true, threeDSecureSessionId: now.session.id, cardLast4: card?.card?.last_4_digits ?? "", filled: [...filled], challenged };
    if (now?.phase === "failed") return { ok: false, stage: "verify", message: now.error ?? say(language, "pay.bankNotConfirmed"), filled: [...filled] };
    if (now?.phase === "challenge" && !challenged) {
      challenged = true;
      await step({ action: "front" }, 10_000);
      options.onChallenge?.();
    }
    await pause(poll);
  }
  return { ok: false, stage: "verify", message: challenged ? say(language, "pay.bankCheckLate") : say(language, "pay.bankNoAnswer"), filled: [...filled] };
}

export function routedDuffel(route: () => AppBrowserRoute | undefined, box: BoxDuffel = BOX_DUFFEL): RoutedDuffel {
  return {
    async pay(options) {
      const app = options.agentId == null ? undefined : appTaskOf(route(), options.agentId);
      if (app === undefined || options.agentId == null) return await box.pay(options);
      return await payInApp(app, options.agentId, options);
    },
    async say(port, words, agentId) {
      const app = agentId == null ? undefined : appTaskOf(route(), agentId);
      if (app === undefined || agentId == null) return await box.say(port, words);
      await askApp(app, agentId, "flight", { action: "call", fn: "say", args: [words] }, 10_000);
    },
  };
}
