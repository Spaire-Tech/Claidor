/**
 * The plan block under Settings → Usage & Billing.
 *
 * The window that ships is the pinned renderer. Its usage panel is minified
 * `function Na` and only knows the meters, one upgrade button and Cancel
 * trial. The renderer patch adds a div the panel owns, and this script,
 * injected into the page, fills that div. Card entry stays on Stripe: the
 * buttons ask the main process for a Customer Portal URL and open it.
 */

export interface PlanBilling {
  readonly tier: string;
  readonly plan_name: string;
  readonly status: string;
  readonly billing_interval: "month" | "year" | null;
  readonly current_period_end: string | null;
  readonly trial_end: string | null;
  readonly cancel_at_period_end: boolean;
  readonly can_open_portal: boolean;
  readonly can_change_plan: boolean;
  readonly trial_cancelable: boolean;
  readonly weekly_credits: number;
  readonly trial_credits: number;
}

export interface PlanAction {
  readonly id: "update" | "cancel" | "trial" | "payment_method" | "invoices";
  readonly label: string;
}

export interface PlanView {
  readonly title: string;
  readonly lines: readonly string[];
  readonly actions: readonly PlanAction[];
}

export const PLAN_SETTINGS_STYLE = `
.simeon-plan-settings{margin-top:18px;padding-top:16px;border-top:1px solid color-mix(in srgb,currentColor 16%,transparent);display:flex;flex-direction:column;gap:6px;color:inherit;font:13px/1.45 -apple-system,BlinkMacSystemFont,"SF Pro Text",Inter,sans-serif}
.simeon-plan-settings h3{margin:0;font-size:13px;font-weight:600}
.simeon-plan-settings p{margin:0;opacity:.78}
.simeon-plan-settings .acts{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
.simeon-plan-settings button{appearance:none;border:0;border-radius:999px;height:28px;padding:0 12px;font:inherit;cursor:pointer;background:#255a93;color:#fff}
.simeon-plan-settings button.quiet{background:transparent;color:inherit;box-shadow:inset 0 0 0 1px color-mix(in srgb,currentColor 28%,transparent)}
.simeon-plan-settings button:disabled{opacity:.45;cursor:default}
.simeon-plan-settings .warn{color:#ef8585;opacity:1}
`;

interface PlanMountNode {
  dataset: { simeonPlanMounted?: string };
  innerHTML: string;
  querySelectorAll(selector: string): ArrayLike<PlanMountButton>;
}

interface PlanMountButton {
  getAttribute(name: string): string | null;
  addEventListener(type: string, listener: () => void): void;
}

interface PlanDesktop {
  account?: {
    getPlan?: () => Promise<unknown>;
    openPortal?: (flow?: string) => Promise<unknown>;
    cancelTrial?: () => Promise<unknown>;
  };
}

function formatCredits(credits: number): string {
  return new Intl.NumberFormat("en-US").format(credits);
}

function formatDate(iso: string | null): string | null {
  if (iso == null || iso.length === 0) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date);
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function numberOf(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function normalizePlan(value: unknown): PlanBilling | null {
  if (value == null || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const planName = typeof row.plan_name === "string" ? row.plan_name : "";
  if (planName.length === 0) return null;
  const interval = row.billing_interval === "month" || row.billing_interval === "year" ? row.billing_interval : null;
  return {
    tier: typeof row.tier === "string" ? row.tier : "inactive",
    plan_name: planName,
    status: typeof row.status === "string" ? row.status : "none",
    billing_interval: interval,
    current_period_end: typeof row.current_period_end === "string" ? row.current_period_end : null,
    trial_end: typeof row.trial_end === "string" ? row.trial_end : null,
    cancel_at_period_end: row.cancel_at_period_end === true,
    can_open_portal: row.can_open_portal === true,
    can_change_plan: row.can_change_plan === true,
    trial_cancelable: row.trial_cancelable === true,
    weekly_credits: numberOf(row.weekly_credits),
    trial_credits: numberOf(row.trial_credits),
  };
}

export function describePlan(plan: PlanBilling): PlanView {
  const name = plan.plan_name === "Standard" || plan.plan_name === "Pro" || plan.plan_name === "Max"
    ? `Simeon ${plan.plan_name}`
    : plan.plan_name;
  if (plan.status === "free" || plan.tier === "unmanaged") {
    return { title: "Free", lines: ["This account is on the free month."], actions: [] };
  }
  if (!plan.can_change_plan && plan.status !== "trialing") {
    return {
      title: "No plan",
      lines: ["You don't have a plan yet. Choose one from the button above, or on the billing page."],
      actions: [],
    };
  }
  const lines: string[] = [];
  const interval = plan.billing_interval === "year" ? "yearly" : "monthly";
  const periodEnd = formatDate(plan.current_period_end);
  const trialEnd = formatDate(plan.trial_end ?? plan.current_period_end);
  if (plan.status === "trialing") {
    lines.push(trialEnd == null ? "On trial." : plan.cancel_at_period_end
      ? `Your trial is cancelled and continues until ${trialEnd}. You will not be charged.`
      : `Your trial ends on ${trialEnd}. Your card is charged then unless you cancel.`);
    if (plan.trial_credits > 0) lines.push(`${formatCredits(plan.trial_credits)} credits for the trial.`);
  } else if (plan.status === "past_due") {
    lines.push("Your last payment failed. Update the card to keep the plan.");
  } else if (plan.cancel_at_period_end && periodEnd != null) {
    lines.push(`Your plan ends on ${periodEnd}.`);
  } else if (periodEnd != null) {
    lines.push(`Charged ${interval}. Renews on ${periodEnd}.`);
  } else {
    lines.push(`Charged ${interval}.`);
  }
  if (plan.status !== "trialing" && plan.weekly_credits > 0) {
    lines.push(`${formatCredits(plan.weekly_credits)} credits a week, resetting every Monday.`);
  }
  const actions: PlanAction[] = [];
  if (plan.can_change_plan) actions.push({ id: "update", label: "Switch plan" });
  if (plan.status === "trialing" && plan.trial_cancelable) actions.push({ id: "trial", label: "Cancel trial" });
  else if (plan.can_change_plan && plan.status !== "trialing") actions.push({ id: "cancel", label: "Cancel plan" });
  if (plan.can_open_portal) {
    actions.push({ id: "payment_method", label: "Update card" });
    actions.push({ id: "invoices", label: "Invoices" });
  }
  return { title: name, lines, actions };
}

export function planSettingsHtml(plan: PlanBilling | null, notice: string | null): string {
  if (notice != null && notice.length > 0) {
    return `<h3>Your plan</h3><p class="warn">${escapeHtml(notice)}</p><div class="acts"><button type="button" data-plan-action="retry">Try again</button></div>`;
  }
  if (plan == null) return `<h3>Your plan</h3><p>Loading your plan…</p>`;
  const view = describePlan(plan);
  const lines = view.lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("");
  const actions = view.actions.length === 0 ? "" : `<div class="acts">${view.actions.map((action) => {
    const quiet = action.id === "update" ? "" : " quiet";
    return `<button type="button" class="${quiet.trim()}" data-plan-action="${action.id}">${escapeHtml(action.label)}</button>`;
  }).join("")}</div>`;
  return `<h3>${escapeHtml(view.title)}</h3>${lines}${actions}`;
}

function planDesktop(): PlanDesktop | undefined {
  return (globalThis as { desktop?: PlanDesktop }).desktop;
}

function bindPlanSettings(node: PlanMountNode, reload: () => void): void {
  const buttons = node.querySelectorAll("button[data-plan-action]");
  for (let index = 0; index < buttons.length; index += 1) {
    const button = buttons[index];
    if (button == null) continue;
    button.addEventListener("click", () => {
      const action = button.getAttribute("data-plan-action");
      const account = planDesktop()?.account;
      if (action === "retry") {
        reload();
        return;
      }
      if (action === "trial") {
        void Promise.resolve(account?.cancelTrial?.()).then(() => reload());
        return;
      }
      const flow = action === "invoices" || action == null ? undefined : action;
      void account?.openPortal?.(flow);
    });
  }
}

export function mountPlanSettings(node: PlanMountNode | null): void {
  if (node == null) return;
  if (node.dataset.simeonPlanMounted === "1") return;
  node.dataset.simeonPlanMounted = "1";
  const paint = (html: string) => {
    node.innerHTML = html;
    bindPlanSettings(node, load);
  };
  const load = () => {
    const getPlan = planDesktop()?.account?.getPlan;
    if (getPlan == null) {
      paint(planSettingsHtml(null, "Sign in to Simeon to see your plan."));
      return;
    }
    paint(planSettingsHtml(null, null));
    void Promise.resolve(getPlan()).then((value) => {
      const plan = normalizePlan(value);
      paint(plan == null ? planSettingsHtml(null, "Could not load your plan.") : planSettingsHtml(plan, null));
    }).catch(() => {
      paint(planSettingsHtml(null, "Could not load your plan."));
    });
  };
  load();
}

function pageDocument(): { getElementById(id: string): unknown; createElement(tag: string): { id: string; textContent: string }; head: { appendChild(node: unknown): void } } | null {
  const doc = (globalThis as { document?: { getElementById(id: string): unknown; createElement(tag: string): { id: string; textContent: string }; head: { appendChild(node: unknown): void } } }).document;
  return doc ?? null;
}

function ensurePlanSettingsStyle(): void {
  const doc = pageDocument();
  if (doc == null || doc.getElementById("simeon-plan-settings-style") != null) return;
  const style = doc.createElement("style");
  style.id = "simeon-plan-settings-style";
  style.textContent = PLAN_SETTINGS_STYLE;
  doc.head.appendChild(style);
}

export function planSettingsPageSource(): string {
  return `(() => {
    const PLAN_SETTINGS_STYLE = ${JSON.stringify(PLAN_SETTINGS_STYLE)};
    ${formatCredits.toString()}
    ${formatDate.toString()}
    ${escapeHtml.toString()}
    ${numberOf.toString()}
    ${normalizePlan.toString()}
    ${describePlan.toString()}
    ${planSettingsHtml.toString()}
    ${planDesktop.toString()}
    ${bindPlanSettings.toString()}
    ${mountPlanSettings.toString()}
    ${pageDocument.toString()}
    ${ensurePlanSettingsStyle.toString()}
    const mount = mountPlanSettings;
    globalThis.__simeonMountPlan = (node) => { ensurePlanSettingsStyle(); mount(node); };
  })();`;
}

export function installPlanSettingsPage(doc: { getElementById(id: string): unknown; createElement(tag: string): { id: string; textContent: string }; documentElement: { appendChild(node: unknown): void } | null; head: { appendChild(node: unknown): void } }): void {
  if (doc.getElementById("simeon-plan-settings-boot") != null) return;
  const script = doc.createElement("script");
  script.id = "simeon-plan-settings-boot";
  script.textContent = planSettingsPageSource();
  (doc.documentElement ?? doc.head).appendChild(script);
}
