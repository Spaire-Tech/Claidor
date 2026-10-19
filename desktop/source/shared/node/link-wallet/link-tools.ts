// The agents' Link tools (13 October 2026): what an agent can do with the
// person's Link wallet, each one a `link-cli` command run on the cloud
// computer (`link-cli.ts`), offered as the "link" app's MCP tools so they
// list and run like any connected app's (`vendor-mcp/backend-exec.ts`).
//
// What keeps the person in charge:
//   - every purchase is a checkout card in the chat first (RequestPurchase,
//     `purchase-card.ts`): Link is asked for nothing until the person presses
//     Allow there, so the agents have no tool that starts a payment;
//   - Allow makes a spend request Link sends to the Link app for the
//     person's approval; nothing is paid before they approve it there;
//   - Link's own limits hold ($500 a purchase, $500 a day);
//   - the one-time card never reaches the agent: `pay_checkout` writes it to
//     a file only this computer can read, types it into the checkout page
//     through Chrome's DevTools port (`checkout-fill.ts`) and deletes it, and
//     every answer here is scrubbed of card numbers, codes and tokens.
// The sign-in (17 October 2026) is Simeon Labs' own Link client, through the
// server (`link-server.ts`): the apps open the server's link in their sign-in
// sheet, the person approves "Simeon" on Link's page, and the server keeps
// the tokens and hands each command an access token. Where the server can't
// (no client there yet), it is Link's device flow as before: `auth login`
// gives a link.com page that already carries the code, and `auth status`
// finishes it once the person approved.

import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { LINK_CLIENT_NAME, LINK_SOURCE_ACTIONS, linkAuthFile, linkDir, type LinkCli, type LinkCliAnswer } from "./link-cli.js";
import type { LinkServer } from "./link-server.js";
import type { CheckoutCard, CheckoutFillResult, fillCheckout as FillCheckout } from "./checkout-fill.js";

export interface LinkToolDefinition {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
}

export interface LinkToolResult {
  readonly text: string;
  readonly isError: boolean;
}

const string = (description: string): Record<string, unknown> => ({ type: "string", description });
const integer = (description: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({ type: "integer", description, ...extra });
const object = (properties: Record<string, unknown>, required: readonly string[] = []): Record<string, unknown> => ({ type: "object", properties, required: [...required], additionalProperties: false });

export const LINK_TOOLS: readonly LinkToolDefinition[] = [
  {
    name: "get_wallet",
    title: "Link wallet",
    description: "The person's Link wallet before a purchase: their name, email and phone (for the checkout's contact fields), spending limits (cents; null means none), anything Link needs them to do first (agent_wallet_verification_requirement.action_url: send them that link), their payment methods (an id is what RequestPurchase takes as payment_method_id) and saved shipping addresses. Use a sole or default address; ask the person when there are several and none is the default. Never ask which card pays: RequestPurchase's card lets them choose among their cards (pass payment_method_id only when they named one). When you show an address or card to the person, show only the city, the ZIP or the last four digits.",
    inputSchema: object({}),
  },
  {
    name: "wait_for_approval",
    title: "Wait for approval",
    description: "Rarely needed: Simeon watches Link for every checkout card and wakes you when the person approves or declines. Use it only when you were told a purchase is approved but pay_checkout says otherwise. Says where a spend request stands: approved, denied, expired, or requires_action (show the person status_details.requires_action.next_action.display_message and its action_url).",
    inputSchema: object({ spend_request_id: string("The lsrq_… id you were given when the person allowed the checkout card."), wait_seconds: integer("How long to wait this time, 10 to 600. Default 120.", { minimum: 10, maximum: 600 }) }, ["spend_request_id"]),
  },
  {
    name: "pay_checkout",
    title: "Fill in the payment",
    description: "For an approved purchase: puts the one-time card (or Link's pay token) into the checkout page open in the browser, without you ever seeing the card number. Have the checkout's payment step on screen first. It fills the card number, expiry, security code and, where the page asks, the name on the card and billing ZIP, then says which fields it filled. It does not press Pay: check the order summary matches what the person approved, then press the page's Pay or Place order button yourself. If it finds no card fields, open the payment step (or the card option) and call it again.",
    inputSchema: object({ spend_request_id: string("The approved lsrq_… id."), checkout_url: string("The checkout page's address, or just its domain, so the right browser tab is used.") }, ["spend_request_id"]),
  },
  {
    name: "cancel_purchase",
    title: "Cancel a purchase",
    description: "Cancels a purchase request that is waiting for approval or approved but not yet used, e.g. when the person changes their mind or the total changed (then show a new checkout card with RequestPurchase).",
    inputSchema: object({ spend_request_id: string("The lsrq_… id.") }, ["spend_request_id"]),
  },
  {
    name: "list_purchases",
    title: "Purchases",
    description: "The person's Link purchase requests: by default the active ones (waiting, approved); with include_history, every one.",
    inputSchema: object({ include_history: { type: "boolean", description: "Also the finished, expired and declined ones." } }),
  },
  {
    name: "list_accounts",
    title: "Bank and card accounts",
    description: "The bank accounts and credit cards the person shared with Link: institution, type, last four digits, and whether balances and transactions can be read (capabilities). Use an id as source_id in get_balances and list_transactions. US accounts only.",
    inputSchema: object({ limit: integer("1 to 100.", { minimum: 1, maximum: 100 }), starting_after: string("For the next page: the last id of the previous one.") }),
  },
  {
    name: "get_balances",
    title: "Balances",
    description: "Current balances of the shared accounts. Amounts are in the smallest unit (cents): divide by 100. Bank accounts: cash.available excludes pending transactions, current is the posted balance. Credit cards: credit.used includes pending charges. If Link answers that data is still being retrieved, wait a few seconds and ask again.",
    inputSchema: object({ source_ids: { type: "array", items: { type: "string" }, description: "Only these accounts (ids from list_accounts)." } }),
  },
  {
    name: "list_transactions",
    title: "Transactions",
    description: "Transactions from the shared bank accounts and cards (and Link purchases), newest first, up to 100 a page. Amounts are in the smallest unit: negative is money going out, positive coming in. Ask only for the dates you need; when has_more is true and you need more, pass the last transaction's id as starting_after. category may be null. To answer \"how much did I spend on …\", sum the matching outgoing amounts and say which dates and accounts you counted.",
    inputSchema: object({
      start_date: string("YYYY-MM-DD, on or after."),
      end_date: string("YYYY-MM-DD, on or before."),
      category: string("Only this category."),
      origin: { type: "string", enum: ["link", "external_connection"], description: "link: Link purchases; external_connection: the bank's and cards' own." },
      source_ids: { type: "array", items: { type: "string" }, description: "Only these accounts." },
      limit: integer("1 to 100, default 100.", { minimum: 1, maximum: 100 }),
      starting_after: string("For the next page."),
    }),
  },
];

const SECRET_KEYS = new Set(["number", "cvc", "cvv", "link_pay_token", "shared_payment_token", "token", "access_token", "refresh_token", "device_code"]);

/** Every answer without card numbers, security codes or tokens, whatever Link put where. */
export function scrubLinkSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrubLinkSecrets);
  if (value == null || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, SECRET_KEYS.has(key) && (typeof item === "string" || typeof item === "number") ? "[hidden]" : scrubLinkSecrets(item)]));
}

/** `key:value,key:value` for Link's repeatable flags; commas and line breaks in a value would split it, so they go. */
export function linkPairs(entries: Record<string, unknown>): string {
  return Object.entries(entries)
    .filter(([, value]) => value != null && String(value).trim().length > 0)
    .map(([key, value]) => `${key}:${String(value).replace(/[,\n\r]+/g, " ").replace(/\s+/g, " ").trim()}`)
    .join(",");
}

const text = (value: unknown): string => typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
const records = (value: unknown): Record<string, unknown>[] => Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => item != null && typeof item === "object") : [];

const NOT_CONNECTED = "Link isn't connected. Call AuthenticateMcpServer for the Link app so the person can approve the connection in Link; then try again.";

function answerText(answer: LinkCliAnswer, lead?: string): LinkToolResult {
  if (!answer.ok) {
    if (answer.code === "NOT_AUTHENTICATED") return { text: NOT_CONNECTED, isError: true };
    return { text: `Link: ${answer.message} (${answer.code})`, isError: true };
  }
  const body = JSON.stringify(scrubLinkSecrets(answer.value ?? null), null, 1);
  return { text: lead == null ? body : `${lead}\n${body}`, isError: false };
}

export interface LinkToolsOptions {
  readonly cli: LinkCli;
  readonly rootDir: () => string;
  /** Types the card into the checkout (`checkout-fill.ts`); absent where there is no browser to fill. */
  readonly fillCheckout?: typeof FillCheckout;
  readonly log?: (message: string) => void;
  /** Simeon's server, which signs in with Simeon Labs' own Link client and holds the tokens (`link-server.ts`); the CLI is given its tokens too (`createLinkCli`'s `serverToken`). */
  readonly server?: LinkServer;
}

export function createLinkTools(options: LinkToolsOptions) {
  const { cli } = options;
  const log = options.log ?? (() => undefined);

  const statusOf = (answer: LinkCliAnswer): { status: string; type: string; record: Record<string, unknown> } => {
    const record = answer.ok && answer.value != null && typeof answer.value === "object" ? answer.value as Record<string, unknown> : {};
    const inner = record.spend_request != null && typeof record.spend_request === "object" ? record.spend_request as Record<string, unknown> : record;
    return { status: text(inner.status), type: text(inner.credential_type) || "card", record: inner };
  };

  const payCheckout = async (id: string, checkoutUrl: string): Promise<LinkToolResult> => {
    if (options.fillCheckout == null) return { text: "This computer has no browser to fill a checkout in.", isError: true };
    const current = await cli.run(["spend-request", "retrieve", id]);
    if (!current.ok) return answerText(current);
    const { status, type } = statusOf(current);
    if (status !== "approved") return { text: `This purchase is ${status || "not approved"}, not approved: ${status === "pending_approval" || status === "created" ? "call wait_for_approval first." : "tell the person, and create a new purchase only if they ask."}`, isError: true };
    if (type === "link_pay_token") {
      const withToken = await cli.run(["spend-request", "retrieve", id, "--include", "link_pay_token"]);
      if (!withToken.ok) return answerText(withToken);
      const token = findString(withToken.value, "link_pay_token");
      if (token == null) return { text: "Link gave no pay token for this purchase.", isError: true };
      return fillAnswer(await options.fillCheckout({ linkPayToken: token, pageHint: checkoutUrl }));
    }
    if (type !== "card") return { text: `This purchase was made for a ${type.replace(/_/g, " ")}, which Simeon can't put into a page.`, isError: true };
    const fill = options.fillCheckout;
    const used = await withCard(id, async (card) => await fill({ card, pageHint: checkoutUrl }));
    if (!used.ok) return used.answer != null ? answerText(used.answer) : { text: used.message, isError: true };
    return fillAnswer(used.value);
  };

  /**
   * One approved spend request's one-time card, handed to `use` and gone
   * from disk before this returns. The card goes to a file only this
   * computer's root can read, never to the agent; one left by an
   * interrupted payment goes first.
   */
  const withCard = async <T>(id: string, use: (card: CheckoutCard) => Promise<T>): Promise<{ readonly ok: true; readonly value: T } | { readonly ok: false; readonly message: string; readonly answer?: LinkCliAnswer }> => {
    const dir = linkDir(options.rootDir());
    try { for (const name of readdirSync(dir)) if (/^card-.*\.json$/.test(name)) rmSync(join(dir, name), { force: true }); } catch { /* no folder yet */ }
    const file = join(dir, `card-${randomUUID()}.json`);
    try {
      const written = await cli.run(["spend-request", "retrieve", id, "--include", "card", "--output-file", file, "--force"]);
      if (!written.ok) return { ok: false, message: `Link: ${written.message} (${written.code})`, answer: written };
      let card: CheckoutCard;
      try { card = cardFromFile(JSON.parse(readFileSync(file, "utf8")) as unknown); } catch (error) { return { ok: false, message: `Link's card could not be read: ${error instanceof Error ? error.message : String(error)}` }; }
      rmSync(file, { force: true });
      return { ok: true, value: await use(card) };
    } finally {
      rmSync(file, { force: true });
    }
  };

  /** The person as Link knows them, for a form Simeon fills in for them: name, email and phone, nothing else. */
  const personFacts = async (): Promise<{ readonly name?: string; readonly email?: string; readonly phone?: string } | undefined> => {
    const answer = await cli.run(["user-info", "retrieve"]);
    if (!answer.ok || answer.value == null || typeof answer.value !== "object") return undefined;
    const info = answer.value as Record<string, unknown>;
    const name = text(info.name) || [text(info.first_name), text(info.last_name)].filter((part) => part.length > 0).join(" ");
    return { ...(name.length > 0 ? { name } : {}), ...(text(info.email).length > 0 ? { email: text(info.email) } : {}), ...(text(info.phone).length > 0 ? { phone: text(info.phone) } : {}) };
  };

  const call = async (name: string, args: Record<string, unknown>): Promise<LinkToolResult> => {
    switch (name) {
      case "get_wallet": {
        const [user, methods, addresses] = await Promise.all([
          cli.run(["user-info", "retrieve"]),
          cli.run(["payment-methods", "list"]),
          cli.run(["shipping-address", "list"]),
        ]);
        const failed = [user, methods, addresses].find((answer) => !answer.ok);
        if (failed != null && !failed.ok && failed.code === "NOT_AUTHENTICATED") return { text: NOT_CONNECTED, isError: true };
        const part = (answer: LinkCliAnswer): unknown => answer.ok ? answer.value : { error: answer.message };
        return { text: JSON.stringify(scrubLinkSecrets({ account: part(user), payment_methods: part(methods), shipping_addresses: part(addresses) }), null, 1), isError: false };
      }
      case "create_purchase":
        // Until 13 October 2026 this asked Link straight away; now every purchase is a checkout card the person allows first.
        return { text: "Purchases start with RequestPurchase, which shows the person the checkout card; Link is asked only when they press Allow, and you are woken once Link approves.", isError: true };
      case "wait_for_approval": {
        const id = text(args.spend_request_id);
        if (id.length === 0) return { text: "spend_request_id is required.", isError: true };
        const seconds = Math.max(10, Math.min(600, Math.round(Number(args.wait_seconds ?? 120)) || 120));
        const answer = await cli.run(["spend-request", "retrieve", id, "--interval", "3", "--timeout", String(seconds)], { timeoutMs: (seconds + 30) * 1000 });
        if (!answer.ok && answer.code === "POLLING_TIMEOUT") return { text: `Still waiting for the person to approve in the Link app after ${seconds} seconds. Call wait_for_approval again, or remind them.`, isError: false };
        return answerText(answer);
      }
      case "pay_checkout": {
        const id = text(args.spend_request_id);
        if (id.length === 0) return { text: "spend_request_id is required.", isError: true };
        return await payCheckout(id, text(args.checkout_url));
      }
      case "cancel_purchase": {
        const id = text(args.spend_request_id);
        if (id.length === 0) return { text: "spend_request_id is required.", isError: true };
        return answerText(await cli.run(["spend-request", "cancel", id]));
      }
      case "list_purchases":
        return answerText(await cli.run(["spend-request", "list", ...(args.include_history === true ? ["--include-history"] : [])]));
      case "list_accounts": {
        const command = ["sources", "list"];
        if (args.limit != null) command.push("--limit", String(args.limit));
        if (text(args.starting_after).length > 0) command.push("--starting-after", text(args.starting_after));
        return answerText(await cli.run(command));
      }
      case "get_balances": {
        const command = ["balances", "list"];
        for (const id of Array.isArray(args.source_ids) ? args.source_ids : []) if (text(id).length > 0) command.push("--source", text(id));
        return answerText(await cli.run(command));
      }
      case "list_transactions": {
        const command = ["transactions", "list", "--limit", String(args.limit ?? 100)];
        for (const [flag, key] of [["--start-date", "start_date"], ["--end-date", "end_date"], ["--category", "category"], ["--origin", "origin"], ["--starting-after", "starting_after"]] as const) {
          if (text(args[key]).length > 0) command.push(flag, text(args[key]));
        }
        for (const id of Array.isArray(args.source_ids) ? args.source_ids : []) if (text(id).length > 0) command.push("--source", text(id));
        return answerText(await cli.run(command));
      }
      default:
        return { text: `Link has no tool "${name}". Its tools: ${LINK_TOOLS.map((tool) => tool.name).join(", ")}.`, isError: true };
    }
  };

  /**
   * Before a checkout card: Link is connected, the person needs to do
   * nothing first, the amount fits their limits, and which card pays (the
   * one asked for, else the default or only one). Link's limits count in US
   * dollars, so another currency is checked against the $500 cap only by
   * Link itself.
   */
  const checkoutFacts = async (request: { readonly amount: number; readonly currency: string; readonly paymentMethodId?: string }): Promise<CheckoutFacts> => {
    const [user, methods] = await Promise.all([cli.run(["user-info", "retrieve"]), cli.run(["payment-methods", "list"])]);
    for (const answer of [user, methods]) {
      if (!answer.ok) return { ok: false, message: answer.code === "NOT_AUTHENTICATED" ? NOT_CONNECTED : `Link: ${answer.message} (${answer.code})` };
    }
    const info = user.ok && user.value != null && typeof user.value === "object" ? user.value as Record<string, unknown> : {};
    const step = info.agent_wallet_verification_requirement != null && typeof info.agent_wallet_verification_requirement === "object" ? info.agent_wallet_verification_requirement as Record<string, unknown> : undefined;
    const stepStatus = text(step?.status);
    if (stepStatus.length > 0 && stepStatus !== "not_required" && stepStatus !== "complete") {
      const url = text(step?.action_url);
      return { ok: false, message: stepStatus === "pending" ? "Link is still checking the person's identity; nothing can be bought until it's done. Tell them, and try again once Link says it's finished." : `Link needs the person to verify their identity before an agent can buy anything (${stepStatus.replace(/_/g, " ")}). Send them this link in the chat${url.length > 0 ? `: ${url}` : " (Link gave none: they open the Link app)"}; once they say it's done, call RequestPurchase again.` };
    }
    const limits = info.agent_wallet_spend_limits != null && typeof info.agent_wallet_spend_limits === "object" ? info.agent_wallet_spend_limits as Record<string, Record<string, unknown> | undefined> : undefined;
    if ((request.currency || "usd").toLowerCase() === "usd") {
      const money = (cents: number): string => `$${(cents / 100).toFixed(2)}`;
      const perPurchase = typeof limits?.per_transaction?.limit === "number" ? limits.per_transaction.limit : LINK_MAX_PURCHASE_CENTS;
      if (request.amount > perPurchase) return { ok: false, message: `${money(request.amount)} is over the person's Link limit of ${money(perPurchase)} a purchase. Tell them; nothing was asked of Link.` };
      for (const [key, label] of [["daily", "today"], ["thirty_day", "in the last 30 days"]] as const) {
        const remaining = limits?.[key]?.remaining;
        if (typeof remaining === "number" && request.amount > remaining) return { ok: false, message: `${money(request.amount)} is more than the ${money(remaining)} the person's Link limits leave ${label}. Tell them; nothing was asked of Link.` };
      }
    }
    const listed = methods.ok ? paymentMethodsOf(methods.value) : [];
    // The cards an agent may pay with, for the checkout card's own chooser (14 October 2026: the person picks there, with each card's mark, not in a typed question).
    const usable = listed.filter((item) => text(item.id).length > 0 && agenticRefusal(item) == null);
    const cards = usable.map((item): LinkCardChoice => ({ id: text(item.id), ...cardOf(item), isDefault: item.is_default === true }));
    const holder = text(info.name).length > 0 ? { holder: text(info.name) } : {};
    const wanted = request.paymentMethodId?.trim() ?? "";
    const method = wanted.length > 0
      ? listed.find((item) => text(item.id) === wanted)
      : listed.find((item) => item.is_default === true) ?? (listed.length === 1 ? listed[0] : undefined);
    if (wanted.length > 0 && method == null) return { ok: false, message: `Link has no payment method "${wanted}" for this person. Call get_wallet for their methods, or leave payment_method_id out: the card lets them choose.` };
    if (listed.length === 0) return { ok: false, message: "The person has no card in Link yet. Ask them to add one in the Link app or at link.com, then call RequestPurchase again." };
    if (usable.length === 0) {
      const named = listed.map((item) => cardOf(item)).map((card) => `${card.name || card.brand}${card.last4.length > 0 ? ` ending ${card.last4}` : ""}`);
      return { ok: false, message: `Link says none of the person's cards can be used for purchases by an agent (${named.join(", ")}). Ask them to add another card in the Link app or at link.com, then call RequestPurchase again. Nothing was asked of Link.` };
    }
    // No card named and no default, or the default is one Link won't let an agent use: the person picks on the card.
    if (method == null || (wanted.length === 0 && agenticRefusal(method) != null)) {
      if (usable.length === 1) return { ok: true, paymentMethodId: cards[0]!.id, card: cardOf(usable[0]!), cards, ...holder };
      return { ok: true, paymentMethodId: "", card: { brand: "", last4: "", name: "" }, cards, ...holder };
    }
    // Link marks a card agents can't pay with (`capabilities.agentic_payments`); asking Link anyway fails only after the person pressed Allow.
    const refused = agenticRefusal(method);
    if (refused != null) {
      const card = cardOf(method);
      return { ok: false, message: `Link says the ${card.name || card.brand}${card.last4.length > 0 ? ` ending ${card.last4}` : ""} can't be used for purchases by an agent${refused.length > 0 ? ` (${refused})` : ""}. Leave payment_method_id out and call RequestPurchase again: the card lets the person choose among the cards Link allows. Nothing was asked of Link.` };
    }
    return { ok: true, paymentMethodId: text(method.id), card: cardOf(method), cards, ...holder };
  };

  /**
   * At Allow: the spend request for one checkout card. With the person's
   * approval given in Simeon (`approval`, Link's `approval_details`), Link is
   * handed it as the approval (`--approve`, Link's delegated approval, as
   * Muse does), so no Link app is needed. When Link refuses that for Simeon,
   * the request is made again asking the person in the Link app, as before
   * 14 October 2026. Each way has its own idempotency key, so neither replays
   * the other; a delegated request whose answer was lost (the CLI died) is
   * asked once more with its own key rather than made a second way.
   */
  const requestSpend = async (request: SpendRequestInput): Promise<SpendAnswer> => {
    if (request.credentialType === "link_pay_token" && (request.merchantAccountId ?? "").length === 0) return { ok: false, code: "MISSING_MERCHANT_ACCOUNT", message: "A Link pay token needs the checkout's merchant account." };
    const command = (delegated: boolean): string[] => {
      const args = ["spend-request", "create", "--credential-type", request.credentialType, "--amount", String(request.amount), "--currency", request.currency.toLowerCase() || "usd", "--context", request.context];
      if (delegated) args.push("--approve", "--approval-detail", JSON.stringify(request.approval), "--idempotency-key", `${request.idempotencyKey}-approved`);
      else args.push("--request-approval", "--idempotency-key", request.idempotencyKey);
      if (request.credentialType === "link_pay_token") args.push("--merchant-account-id", request.merchantAccountId as string);
      else args.push("--merchant-name", request.merchantName, "--merchant-url", request.merchantUrl);
      if ((request.paymentMethodId ?? "").length > 0) args.push("--payment-method-id", request.paymentMethodId as string);
      for (const item of request.lineItems) args.push("--line-item", linkPairs({ name: item.name, unit_amount: item.unitAmount, quantity: item.quantity, description: item.description }));
      for (const total of request.totals) args.push("--total", linkPairs({ type: total.type, display_text: total.label, amount: total.amount }));
      if (request.test && request.credentialType !== "link_pay_token") args.push("--test");
      args.push("--metadata", `source:${LINK_CLIENT_NAME}`);
      return args;
    };
    if (request.approval != null) {
      let delegated = spendAnswer(await cli.run(command(true), { timeoutMs: 90_000 }));
      if (!delegated.ok && delegated.code === "LINK_CLI_FAILED") delegated = spendAnswer(await cli.run(command(true), { timeoutMs: 90_000 }));
      if (delegated.ok) {
        log(`[link] purchase approved in Simeon: ${delegated.status} ${delegated.id}`);
        return { ...delegated, approvedInSimeon: true };
      }
      // A CLI that never answered, twice: say so, and make nothing more (the first may yet stand at Link).
      if (delegated.code === "LINK_CLI_FAILED" || delegated.code === "LINK_UNAVAILABLE") return delegated;
      // Link's own refusal (Simeon not allowed to approve for the person, a field it wants): ask in the Link app instead.
      log(`[link] approval in Simeon refused: ${delegated.code} ${(delegated.message.split("\n")[0] ?? "").slice(0, 200)}; asking in the Link app`);
    }
    const spend = spendAnswer(await cli.run(command(false), { timeoutMs: 90_000 }));
    if (spend.ok) log(`[link] purchase requested: ${spend.status} ${spend.id}`);
    return spend;
  };

  /** Where a spend request stands, waiting up to `seconds` for it to move on from created or pending approval. */
  const spendStatus = async (id: string, seconds: number): Promise<SpendAnswer | { readonly ok: false; readonly code: "POLLING_TIMEOUT"; readonly message: string }> => {
    const wait = Math.max(0, Math.round(seconds));
    const answer = await cli.run(wait > 0 ? ["spend-request", "retrieve", id, "--interval", "3", "--timeout", String(wait)] : ["spend-request", "retrieve", id], { timeoutMs: (wait + 30) * 1000 });
    if (!answer.ok && answer.code === "POLLING_TIMEOUT") return { ok: false, code: "POLLING_TIMEOUT", message: answer.message };
    return spendAnswer(answer);
  };

  const cancelSpend = async (id: string): Promise<boolean> => (await cli.run(["spend-request", "cancel", id])).ok;

  /** Link's own record of how a purchase went (`report`; optional, best effort). */
  const reportOutcome = async (args: { readonly domain: string; readonly spendRequestId: string; readonly outcome: "success" | "blocked" | "abandoned"; readonly context?: string }): Promise<void> => {
    if (args.domain.length === 0 || args.spendRequestId.length === 0) return;
    const command = ["report", "--domain", args.domain, "--outcome", args.outcome, "--spend-request-id", args.spendRequestId];
    if (args.context != null && args.context.trim().length > 0) command.push("--freeform-context", args.context.trim().slice(0, 500));
    const answer = await cli.run(command);
    if (!answer.ok) log(`[link] report failed: ${answer.code}`);
  };

  /**
   * Whether the person's Link is connected: held by Simeon's server, else
   * this computer's own sign-in file (Link's device code, from before 17
   * October 2026; a sign-in just approved there is finished here, `auth
   * status` taking the pending code's tokens).
   */
  const signInStatus = async (): Promise<{ readonly authenticated: boolean; readonly pending: boolean; readonly error?: string }> => {
    const held = await options.server?.status();
    if (held?.connected === true) return { authenticated: true, pending: false };
    const answer = await cli.run(["auth", "status"]);
    if (!answer.ok) return { authenticated: false, pending: false, error: answer.message };
    const record = answer.value != null && typeof answer.value === "object" ? answer.value as Record<string, unknown> : {};
    return { authenticated: record.authenticated === true, pending: record.pending === true };
  };

  /**
   * Starts the sign-in for the apps' sign-in sheet: the server's link to
   * Link's own page, where the person approves Simeon (Simeon Labs' client),
   * else, on a server without the client, Link's device-code page.
   */
  const startSignIn = async (forceReauth: boolean): Promise<{ readonly authenticated: true } | { readonly url: string; readonly phrase: string; readonly via: "server" | "device" } | { readonly error: string }> => {
    if (options.server != null) {
      const started = await options.server.start();
      if ("url" in started) {
        // A sign-in from before, in this computer's own file, would stand in for the new one wherever the server's is missing.
        if (forceReauth) await cli.run(["auth", "logout"]);
        return { url: started.url, phrase: "", via: "server" };
      }
      if ("error" in started) return started;
      log("[link] the server has no Link client; signing in with Link's device code");
    }
    if (forceReauth) await cli.run(["auth", "logout"]);
    const answer = await cli.run(["auth", "login", "--client-name", LINK_CLIENT_NAME, ...LINK_SOURCE_ACTIONS.flatMap((action) => ["--source-actions", action])]);
    if (!answer.ok) return { error: answer.message };
    const record = answer.value != null && typeof answer.value === "object" ? answer.value as Record<string, unknown> : {};
    if (record.authenticated === true) return { authenticated: true };
    const url = text(record.verification_url);
    if (!url.startsWith("https://")) return { error: "Link gave no sign-in page." };
    return { url, phrase: text(record.phrase), via: "device" };
  };

  /** Disconnects: the server revokes Simeon's grant at Link and forgets it, and this computer's own sign-in, if any, is logged out. */
  const signOut = async (): Promise<void> => {
    await options.server?.disconnect();
    await cli.run(["auth", "logout"]);
  };

  /** Whether a purchase should try Link first: a sign-in on this computer, or the server's, as it last said. */
  const hasSignIn = (): boolean => options.server?.knownConnected() === true || existsSync(linkAuthFile(options.rootDir()));

  /**
   * The saved delivery addresses, for Shop's checkout to fill what Shop's
   * saved one lacks (`shop-tools.ts`, `withLinkLine2`); none when Link isn't
   * connected or can't say.
   */
  const deliveryAddresses = async (): Promise<readonly { readonly line1: string; readonly line2: string; readonly postalCode: string }[]> => {
    if (!hasSignIn()) return [];
    const answer = await cli.run(["shipping-address", "list"]);
    if (!answer.ok) return [];
    const list = Array.isArray(answer.value) ? answer.value : (answer.value as { data?: unknown } | null)?.data;
    return records(list).map((item) => {
      const place = item.address != null && typeof item.address === "object" ? item.address as Record<string, unknown> : item;
      return { line1: text(place.line1) || text(place.line_1), line2: text(place.line2) || text(place.line_2), postalCode: text(place.postal_code) || text(place.postalCode) };
    });
  };

  return { tools: LINK_TOOLS, call, signInStatus, startSignIn, signOut, hasSignIn, checkoutFacts, requestSpend, spendStatus, cancelSpend, reportOutcome, withCard, personFacts, deliveryAddresses };
}

export type LinkTools = ReturnType<typeof createLinkTools>;

/** Link's cap on one purchase, in US cents (README, 0.27.1). */
export const LINK_MAX_PURCHASE_CENTS = 50_000;

/** One card in the person's Link an agent may pay with, as the checkout card's chooser shows it. */
export interface LinkCardChoice {
  /** Link's opaque payment method id (never a card number). */
  readonly id: string;
  readonly brand: string;
  readonly last4: string;
  /** The card's name in Link: its nickname, else Link's own ("Chime Credit Builder"); "" when Link gives none. */
  readonly name: string;
  readonly isDefault: boolean;
}

/**
 * Before a checkout card. `paymentMethodId` is "" when the person picks on
 * the card (several cards and no default, or a default agents can't use);
 * `cards` are the ones they can pick from.
 */
export type CheckoutFacts =
  | { readonly ok: true; readonly paymentMethodId: string; readonly card: { readonly brand: string; readonly last4: string; readonly name: string }; readonly cards: readonly LinkCardChoice[]; readonly holder?: string }
  | { readonly ok: false; readonly message: string };

export interface SpendRequestInput {
  readonly idempotencyKey: string;
  readonly credentialType: "card" | "link_pay_token";
  readonly amount: number;
  readonly currency: string;
  readonly context: string;
  readonly merchantName: string;
  readonly merchantUrl: string;
  readonly merchantAccountId?: string;
  readonly paymentMethodId?: string;
  readonly lineItems: readonly { readonly name: string; readonly quantity: number; readonly unitAmount?: number; readonly description?: string }[];
  readonly totals: readonly { readonly type: string; readonly label: string; readonly amount: number }[];
  readonly test: boolean;
  /** The person's approval given in Simeon, as Link's `approval_details` (`linkApprovalDetails`): Link is asked to take it as the approval. */
  readonly approval?: Readonly<Record<string, string | number>>;
}

/** A spend request as the checkout card needs it: its id and status, where the person approves, and what Link asks of them. */
export type SpendAnswer =
  | {
    readonly ok: true;
    readonly id: string;
    readonly status: string;
    readonly approvalUrl?: string;
    /** Link took the person's approval given in Simeon (no Link app asked). */
    readonly approvedInSimeon?: boolean;
    /** `requires_action`: Link's sentence, its page, and whether it resumes by itself (`auto_resume`). */
    readonly action?: { readonly message: string; readonly url?: string; readonly resumes: boolean };
  }
  | { readonly ok: false; readonly code: string; readonly message: string };

function spendAnswer(answer: LinkCliAnswer): SpendAnswer {
  if (!answer.ok) return { ok: false, code: answer.code, message: answer.code === "NOT_AUTHENTICATED" ? "Link isn't connected any more." : answer.message };
  const root = answer.value != null && typeof answer.value === "object" ? answer.value as Record<string, unknown> : {};
  const record = root.spend_request != null && typeof root.spend_request === "object" ? root.spend_request as Record<string, unknown> : root;
  const id = text(record.id);
  if (id.length === 0) return { ok: false, code: "NO_SPEND_REQUEST", message: "Link answered without a purchase request." };
  const approvalUrl = text(record.approval_url);
  const details = record.status_details != null && typeof record.status_details === "object" ? record.status_details as Record<string, unknown> : undefined;
  const required = details?.requires_action != null && typeof details.requires_action === "object" ? details.requires_action as Record<string, unknown> : undefined;
  const next = required?.next_action != null && typeof required.next_action === "object" ? required.next_action as Record<string, unknown> : undefined;
  const status = text(record.status);
  const actionUrl = text(next?.action_url);
  return {
    ok: true,
    id,
    status,
    ...(approvalUrl.startsWith("https://") ? { approvalUrl } : {}),
    ...(status === "requires_action" ? { action: { message: text(next?.display_message) || "Link needs something from you before it can approve this.", ...(actionUrl.startsWith("https://") ? { url: actionUrl } : {}), resumes: text(next?.resolution) === "auto_resume" } } : {}),
  };
}

/** The person's payment methods from `payment-methods list`: the CLI prints the list itself; Link's own API wraps it in `payment_details`. */
function paymentMethodsOf(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return records(value);
  return value != null && typeof value === "object" ? records((value as Record<string, unknown>).payment_details) : [];
}

/** Why Link won't let an agent pay with this method ("" when it gives no reason), or undefined when it may. */
function agenticRefusal(method: Record<string, unknown>): string | undefined {
  const capabilities = method.capabilities != null && typeof method.capabilities === "object" ? method.capabilities as Record<string, unknown> : undefined;
  const agentic = capabilities?.agentic_payments != null && typeof capabilities.agentic_payments === "object" ? capabilities.agentic_payments as Record<string, unknown> : undefined;
  if (agentic?.eligible !== false) return undefined;
  const reasons = Array.isArray(agentic.ineligibility_reasons) ? agentic.ineligibility_reasons.map((reason) => text(reason).replace(/_/g, " ")).filter((reason) => reason.length > 0) : [];
  return reasons.join(", ");
}

const BRANDS: Record<string, string> = { visa: "Visa", mastercard: "Mastercard", amex: "Amex", american_express: "Amex", discover: "Discover", diners: "Diners Club", jcb: "JCB", unionpay: "UnionPay" };

/** A Link payment method as the card names it: "Visa" and "1234" (`card_details`), else the method's own name, and its name in Link. */
function cardOf(method: Record<string, unknown>): { readonly brand: string; readonly last4: string; readonly name: string } {
  const details = (method.card_details ?? method.bank_account_details) as Record<string, unknown> | undefined;
  const brand = text(details?.brand).toLowerCase();
  return {
    brand: BRANDS[brand] ?? (brand.length > 0 ? brand.charAt(0).toUpperCase() + brand.slice(1) : text(method.nickname) || text(method.name) || "Card"),
    last4: text(details?.last4).replace(/\D/g, "").slice(-4),
    name: (text(method.nickname).trim() || text(method.name).trim()).slice(0, 60),
  };
}

function findString(value: unknown, key: string): string | undefined {
  if (Array.isArray(value)) { for (const item of value) { const found = findString(item, key); if (found != null) return found; } return undefined; }
  if (value == null || typeof value !== "object") return undefined;
  for (const [name, item] of Object.entries(value as Record<string, unknown>)) {
    if (name === key && typeof item === "string" && item.length > 0) return item;
    if (name === key && item != null && typeof item === "object") { const inner = findString(item, "token") ?? findString(item, "value"); if (inner != null) return inner; }
    const found = findString(item, key);
    if (found != null) return found;
  }
  return undefined;
}

/** The card file Link wrote (`--output-file`): the card object, at the top or under `card`. */
export function cardFromFile(value: unknown): CheckoutCard {
  const root = value != null && typeof value === "object" ? value as Record<string, unknown> : {};
  const card = (root.card != null && typeof root.card === "object" ? root.card : root) as Record<string, unknown>;
  const number = text(card.number).replace(/\s+/g, "");
  const cvc = text(card.cvc);
  const month = Number(card.exp_month);
  const year = Number(card.exp_year);
  if (!/^\d{12,19}$/.test(number) || !/^\d{3,4}$/.test(cvc) || !Number.isInteger(month) || !Number.isInteger(year)) throw new Error("the card file has no complete card");
  const billing = card.billing_address != null && typeof card.billing_address === "object" ? card.billing_address as Record<string, unknown> : undefined;
  return {
    number,
    cvc,
    expMonth: month,
    expYear: year < 100 ? 2000 + year : year,
    ...(billing == null ? {} : {
      billing: {
        name: text(billing.name),
        line1: text(billing.line1),
        line2: text(billing.line2),
        city: text(billing.city),
        state: text(billing.state),
        postalCode: text(billing.postal_code),
        country: text(billing.country),
      },
    }),
  };
}

/** What the agent is told after a card was typed into a checkout (Link's and Shop's `pay_checkout`). */
export function fillAnswer(result: CheckoutFillResult): LinkToolResult {
  if (!result.ok) return { text: result.message, isError: true };
  return {
    text: [
      `Filled on ${result.page}: ${result.filled.join(", ")}.`,
      result.missing.length > 0 ? `Not found on the page: ${result.missing.join(", ")} (fill those yourself if the page asks for them, never with card details).` : "",
      "Now check the order on the page matches what the person approved, then press its Pay or Place order button. Don't take a screenshot of the card fields to read them back.",
    ].filter((line) => line.length > 0).join(" "),
    isError: false,
  };
}
