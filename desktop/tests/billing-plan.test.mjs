/**
 * The billing page's door in the Mac app, and the access cover's button.
 *
 * The cover reads `const pft`. An exact replacement rewrites that constant
 * before the brand pass, so a later phrase naming the raw onboarding URL
 * cannot retarget the button. Settings mounts a plan block the preload fills.
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import vm from "node:vm";

import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = path.resolve(repoRoot, "..");
const patchModule = pathToFileURL(path.join(repoRoot, "scripts/lib/router-renderer-patch.mjs")).href;
const BILLING = "https://app.simeonlabs.com/billing?plan=standard";
const ONBOARDING = "https://cursor.com/bot/onboarding";

async function loadModule(entry, name) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), `simeon-${name}-`));
  const output = path.join(temporary, `${name}.mjs`);
  await build({
    entryPoints: [path.join(repoRoot, entry)],
    outfile: output,
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node22",
    logLevel: "silent",
    external: ["electron"],
    banner: { js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);' },
  });
  const module = await import(`${pathToFileURL(output).href}?${Date.now()}`);
  return { module, dispose: () => rm(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }) };
}

test("the cover's pft constant is the billing page, and a later phrase cannot retarget it", async () => {
  const { LOGO_REPLACEMENTS, patchOriginalBrandStrings } = await import(patchModule);
  const row = LOGO_REPLACEMENTS.find(([label]) => label === "upstream-link-onboarding");
  assert.equal(row[1], `const pft="${ONBOARDING}"`);
  assert.equal(row[2], `const pft="${BILLING}"`);
  // The logo pass rewrites this one constant. Applying every logo anchor
  // needs the whole renderer; this is the cover's own line.
  const source = `function cover(){${row[1]};return [()=>{s(pft)},()=>{e(pft)}]}`;
  const logos = source.replace(row[1], row[2]);
  assert.match(logos, new RegExp(`const pft="${BILLING.replace(/[?]/g, "\\?")}"`));
  assert.equal(logos.includes(ONBOARDING), false);
  assert.match(logos, /s\(pft\)/);
  assert.match(logos, /e\(pft\)/);
  // What a brand phrase naming the raw onboarding URL would do, after the
  // logo pass has already rewritten the constant.
  const phrased = logos.split(ONBOARDING).join(BILLING);
  assert.equal(phrased, logos);
  const branded = patchOriginalBrandStrings(logos);
  assert.equal(branded.counts[ONBOARDING] ?? 0, 0);
  assert.match(branded.source, new RegExp(`const pft="${BILLING.replace(/[?]/g, "\\?")}"`));
});

test("the committed renderer cover clicks pft, and the raw onboarding URL is already gone", async () => {
  const bundle = await readFile(path.join(workspaceRoot, "clients/apps/web/public/app/assets/index-UbX-y3il.js"), "utf8");
  assert.equal(bundle.split(ONBOARDING).length - 1, 0);
  assert.equal(bundle.split('const pft="https://simeonlabs.com"').length - 1, 1);
  assert.equal(bundle.includes('onClick:()=>{s(pft)}'), true);
  assert.equal(bundle.includes('onClick:()=>{e(pft)}'), true);
  assert.equal(bundle.includes("app.simeonlabs.com/billing"), false);
});

test("the usage panel gains one plan mount, on the anchor the committed settings chunk carries once", async () => {
  const { SETTINGS_PLAN_BEFORE, patchOriginalSettingsPanel } = await import(patchModule);
  const chunk = await readFile(path.join(workspaceRoot, "clients/apps/web/public/app/assets/index-BlqerJhg.js"), "utf8");
  assert.equal(chunk.split(SETTINGS_PLAN_BEFORE).length - 1, 1);
  const patched = patchOriginalSettingsPanel(chunk);
  assert.equal(patched.split("simeon-plan-settings").length - 1, 1);
  assert.match(patched, /globalThis\.__simeonMountPlan&&globalThis\.__simeonMountPlan\(n\)/);
  assert.equal(patched.includes(SETTINGS_PLAN_BEFORE), false);
  assert.equal(patchOriginalSettingsPanel("function Na(){}"), "function Na(){}");
  assert.throws(() => patchOriginalSettingsPanel(SETTINGS_PLAN_BEFORE + SETTINGS_PLAN_BEFORE), /settings plan anchor is missing or ambiguous/);
});

test("the plan block names the trial and opens the portal, except cancel trial", async () => {
  const loaded = await loadModule("source/electron-preload/plan-settings.ts", "plan-settings");
  try {
    const { describePlan, planSettingsHtml, planSettingsPageSource } = loaded.module;
    const plan = {
      tier: "standard",
      plan_name: "Standard",
      status: "trialing",
      billing_interval: "month",
      current_period_end: "2026-10-13T00:00:00+00:00",
      trial_end: "2026-10-13T00:00:00+00:00",
      cancel_at_period_end: false,
      can_open_portal: true,
      can_change_plan: true,
      trial_cancelable: true,
      weekly_credits: 750000,
      trial_credits: 1000000,
    };
    const view = describePlan(plan);
    assert.equal(view.title, "Simeon Standard");
    assert.match(view.lines.join(" "), /October 13, 2026/);
    assert.deepEqual(view.actions.map((action) => action.id), ["update", "trial", "payment_method", "invoices"]);
    const html = planSettingsHtml(plan, null);
    assert.match(html, /data-plan-action="trial"/);
    assert.match(html, /1,000,000 credits/);

    const calls = [];
    const buttons = [];
    const node = {
      dataset: {},
      innerHTML: "",
      querySelectorAll() {
        buttons.length = 0;
        for (const match of node.innerHTML.matchAll(/data-plan-action="([^"]+)"/g)) {
          const id = match[1];
          buttons.push({
            getAttribute: () => id,
            addEventListener(_type, listener) { this.click = listener; },
          });
        }
        return buttons;
      },
    };
    const sandbox = {
      Promise,
      Intl,
      Date,
      Number,
      String,
      JSON,
      document: { getElementById: () => null, createElement: () => ({ id: "", textContent: "" }), head: { appendChild() {} } },
    };
    sandbox.globalThis = sandbox;
    sandbox.desktop = {
      account: {
        getPlan: async () => plan,
        openPortal: async (flow) => { calls.push(["portal", flow ?? null]); },
        cancelTrial: async () => { calls.push(["trial", null]); return { ok: true }; },
      },
    };
    vm.runInNewContext(planSettingsPageSource(), sandbox);
    sandbox.__simeonMountPlan(node);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.match(node.innerHTML, /Simeon Standard/);
    const trial = buttons.find((button) => button.getAttribute() === "trial");
    const update = buttons.find((button) => button.getAttribute() === "update");
    trial.click();
    update.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(calls.filter((call) => call[0] === "portal"), [["portal", "update"]]);
    assert.equal(calls.some((call) => call[0] === "trial"), true);
  } finally {
    await loaded.dispose();
  }
});

test("the main process fetches the plan and opens the portal URL", async () => {
  const loaded = await loadModule("source/electron-main/account/account-profile.ts", "account-billing");
  const edge = await loadModule("source/electron-main/main-edge.ts", "main-edge-billing");
  try {
    const requests = [];
    const plan = { tier: "pro", plan_name: "Pro", status: "active", billing_interval: "year", current_period_end: null, trial_end: null, cancel_at_period_end: false, can_open_portal: true, can_change_plan: true, trial_cancelable: false, weekly_credits: 2500000, trial_credits: 1000000 };
    const fetch = async (input, init) => {
      requests.push({ url: String(input), method: init?.method, body: init?.body });
      const portal = String(input).endsWith("/portal");
      return new Response(JSON.stringify({ code: 0, data: portal ? { portal_url: "https://billing.stripe.com/p/1" } : plan }), { status: 200, headers: { "content-type": "application/json" } });
    };
    const row = await loaded.module.fetchPlanBilling(async () => "token", { backendUrl: "https://api.simeonlabs.com", fetch });
    assert.equal(row.plan_name, "Pro");
    assert.match(requests[0].url, /\/desktop\/api\/user\/billing$/);
    const url = await loaded.module.openPlanPortal(async () => "token", "payment_method", { backendUrl: "https://api.simeonlabs.com", fetch });
    assert.equal(url, "https://billing.stripe.com/p/1");
    assert.equal(requests[1].method, "POST");
    assert.match(requests[1].body, /payment_method/);

    const opened = [];
    const handlers = edge.module.createMainEdgeHandlers({
      accountService: { getPlanBilling: async () => plan, openPlanPortal: async (flow) => ({ ok: true, portalUrl: `https://billing.stripe.com/${flow}`, message: null }) },
      shell: { openExternalUrl: async (target) => { opened.push(target); } },
    });
    assert.equal(typeof handlers.getPlanBilling, "function");
    assert.deepEqual(await handlers.getPlanBilling({}), plan);
    await handlers.openPlanPortal({ flow: "update" });
    assert.deepEqual(opened, ["https://billing.stripe.com/update"]);
  } finally {
    await loaded.dispose();
    await edge.dispose();
  }
});
