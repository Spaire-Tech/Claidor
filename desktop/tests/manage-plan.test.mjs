import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// The Manage plan card in Settings → Usage & Billing (6 October 2026): the
// renderer patch draws it under the usage meters from the summary's
// `managePlan`, and its two buttons open Stripe's Customer Portal through the
// account bridge (`openBillingPortal`, `POST /desktop/api/billing/portal`).

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const patchModule = path.join(repoRoot, "scripts/lib/router-renderer-patch.mjs");

test("the Manage plan anchors apply exactly once, and a second pass refuses", async () => {
  const { MANAGE_PLAN_REPLACEMENTS, MANAGE_PLAN_PANEL_REPLACEMENTS, patchOriginalManagePlan, patchOriginalManagePlanPanel, patchOriginalManagePlanStylesheet, MANAGE_PLAN_MARKER } = await import(patchModule);
  assert.deepEqual(MANAGE_PLAN_REPLACEMENTS.map(([label]) => label), ["manage-plan-component"]);
  assert.deepEqual(MANAGE_PLAN_PANEL_REPLACEMENTS.map(([label]) => label), ["manage-plan-under-usage"]);
  const main = patchOriginalManagePlan(MANAGE_PLAN_REPLACEMENTS.map(([, before]) => before).join(";\n"));
  assert.match(main, /function __simeonManagePlan\(\)\{/);
  assert.match(main, /globalThis\.__simeonManagePlan=__simeonManagePlan;/);
  assert.match(main, /a\.openBillingPortal\(req\)/);
  assert.match(main, /flow:"update_confirm",tier:s\.nextTier\.tier/);
  assert.match(main, /Manage billing on Stripe/);
  assert.throws(() => patchOriginalManagePlan(main), /already present/);
  const panel = patchOriginalManagePlanPanel(MANAGE_PLAN_PANEL_REPLACEMENTS.map(([, before]) => before).join(";\n"));
  assert.match(panel, /a\.jsx\(Na,\{\},"usage"\),a\.jsx\(globalThis\.__simeonManagePlan\?\?\(\(\)=>null\),\{\},"simeon-manage-plan"\)/);
  assert.throws(() => patchOriginalManagePlanPanel(panel), /anchor is missing or ambiguous/);
  const css = patchOriginalManagePlanStylesheet(".x{}");
  assert.ok(css.includes(MANAGE_PLAN_MARKER));
  assert.match(css, /\.simeon-manage-plan__btn\{flex:none;height:40px/);
  assert.throws(() => patchOriginalManagePlanStylesheet(css), /already present/);
  const source = await readFile(patchModule, "utf8");
  assert.match(source, /patchOriginalManagePlan\(patchOriginalVoiceCall\(/);
  assert.match(source, /patchOriginalManagePlanStylesheet\(patchOriginalVoiceCallStylesheet\(/);
  assert.match(source, /\["manage-plan", panelCandidates\[0\], patchOriginalManagePlanPanel\]/);
});

test("the bridge carries openBillingPortal from the window to the server", async () => {
  const preload = await readFile(path.join(repoRoot, "source/electron-preload/preload.ts"), "utf8");
  assert.match(preload, /openBillingPortal: \(request: unknown\) => edge\("openAccountBillingPortal", request\)/);
  const rpc = await readFile(path.join(repoRoot, "source/shared/rpc/main.ts"), "utf8");
  assert.match(rpc, /openAccountBillingPortal: \{ args: "object" \}/);
  const edge = await readFile(path.join(repoRoot, "source/electron-main/main-edge.ts"), "utf8");
  assert.match(edge, /openAccountBillingPortal: \(raw\) => invoke\(deps\.accountService, "openBillingPortal", raw\)/);
  const profile = await readFile(path.join(repoRoot, "source/electron-main/account/account-profile.ts"), "utf8");
  assert.match(profile, /SIMEON_BILLING_PORTAL_PATH = "billing\/portal"/);
});
