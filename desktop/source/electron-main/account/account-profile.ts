import { isConnectServed } from "../../shared/cloud-agents-availability.js";
import { PrivacyMode } from "../../shared/observability/sentry-privacy-mode.js";
import { DASHBOARD_SERVICE_NAME, DashboardService } from "../../packages/proto/simeon/v1/services.js";
import { createSimeonBackendClient } from "../../shared/node/simeon-backend/simeon-inference.js";
import { simeonApiData } from "../../shared/node/simeon-backend/simeon-api.js";
import { getOrCreateMachineId } from "./machine-id.js";
import type { SandUsageSummary, SandUsageUpgradeCta } from "../../shared/usage.js";
import { persistAccountDisplayName, readLocalAccountDisplayName } from "./account-display-name.js";
export { ACCOUNT_DISPLAY_NAME_FILE, isUnimplementedProfileError, persistAccountDisplayName, readLocalAccountDisplayName, writeLocalAccountDisplayName } from "./account-display-name.js";

export const PROFILE_REQUEST_TIMEOUT_MS = 10_000;
export const USAGE_REQUEST_TIMEOUT_MS = 15_000;
export const ANYSPHERE_TEAM_ID = 1;
export const NO_LIMIT_SENTINEL_CENTS = 2_147_483_647;
export const SAND_TRIAL_CLAIM_GRANTED = 3;
export const SUPPORTED_DASHBOARD_ACTIONS = new Set(["requestLimitIncrease"]);

export type AccessTokenReader = () => Promise<string>;
export interface TimestampLike { toDate(): Date }
export interface Team { readonly id: number; readonly hasBilling: boolean; readonly seats: number; readonly isEnterprise?: boolean }
export interface TeamsResponse { readonly teams: readonly Team[] }
export interface SpendLimitUsage { readonly individualUsed: number; readonly individualLimit?: number }
export interface CurrentPeriodUsage { readonly spendLimitUsage?: SpendLimitUsage; readonly billingCycleEnd?: number | string | bigint }
export interface DashboardButton {
  readonly label: string;
  readonly action: { readonly case: "url"; readonly value: { readonly url: string } } |
    { readonly case: "dashboardAction"; readonly value: { readonly action: string; readonly args: Readonly<Record<string, string>>; readonly successMessage?: string } } |
    { readonly case: string; readonly value: unknown };
}
export interface SandUsageStatus {
  readonly usesPooledEnterpriseAllowance?: boolean;
  readonly usagePercent?: number;
  readonly nextResetTimestampUtc?: TimestampLike;
  readonly hasNonZeroIncludedLimit?: boolean;
  readonly hasAvailableUsage?: boolean;
  readonly sandTrialExpiresAt?: TimestampLike;
  readonly sandTrialCancelable?: boolean;
  readonly upgradeRecommendation?: { readonly disabled: boolean; readonly cta?: DashboardButton };
}
export interface WeeklyUsage { readonly percentUsed: number; readonly nextResetMs: number | null; readonly hasNonZeroIncludedLimit: boolean; readonly onDemand: { readonly usedCents: number; readonly limitCents: number } | null }
export interface AccountProfile { readonly displayName: string | undefined; readonly email: string | undefined; readonly profilePictureUrl: string | undefined; readonly isStaffUser: boolean }
export interface DashboardClient {
  getMe(request: object, options: { timeoutMs: number }): Promise<{ firstName?: string; lastName?: string; email?: string; profilePictureUrl?: string }>;
  getTeams(request: object, options: { timeoutMs: number }): Promise<TeamsResponse>;
  updateUserName(request: { firstName: string; lastName: string }, options: { timeoutMs: number }): Promise<unknown>;
  getUserPrivacyMode(request: object, options: { timeoutMs: number }): Promise<{ privacyMode?: PrivacyMode }>;
  getSandUsageStatus(request: object, options: { timeoutMs: number }): Promise<SandUsageStatus>;
  getCurrentPeriodUsage(request: object, options: { timeoutMs: number }): Promise<CurrentPeriodUsage>;
  getTeamAdminSettingsOrEmptyIfNotInTeam(request: object, options: { timeoutMs: number }): Promise<{ localToolControls?: { permissionCeiling?: number } }>;
  getSandTrialClaimStatus(request: object, options: { timeoutMs: number }): Promise<{ status: number }>;
  cancelSandTrial(request: object, options: { timeoutMs: number }): Promise<unknown>;
  clientAction(request: { action: string; args: Readonly<Record<string, string>> }, options: { timeoutMs: number }): Promise<{ success: boolean; infoMessage?: string; errorMessage?: string }>;
}
export interface AccountProfileDeps {
  readonly createClient?: (getAccessToken: AccessTokenReader) => DashboardClient;
  readonly getMachineId?: () => Promise<string>;
  readonly reportFailure?: (area: string, leg: string, error: unknown) => void;
  readonly isInvalidArgumentError?: (error: unknown) => boolean;
  readonly connectRawMessage?: (error: unknown) => string | undefined;
  readonly localToolPermissionCeilings?: { readonly never: number; readonly ask: number; readonly always: number };
  readonly now?: () => number;
  /** For the account doors on Simeon Labs' server (profile, quota): a fetch to drive and a host to aim at, both for tests. */
  readonly fetch?: typeof fetch;
  readonly backendUrl?: string;
}

// --- the account doors on Simeon Labs' server ------------------------------
//
// Until 24 September 2026 the profile came from `DashboardService/GetMe` +
// `GetTeams` and the usage from `GetSandUsageStatus` + `GetCurrentPeriodUsage`,
// four upstream Connect RPCs that Simeon Labs' server never served. `fetchAccountProfile`
// swallowed the failure and answered null (or the locally stored name with
// no e-mail and no picture), so the account menu showed "Simeon user" with
// no avatar; `fetchSandWeeklyUsage` answered null so the header never showed
// usage. The renderer still calls the same edge methods and reads the same
// shapes (`AccountProfile`, `WeeklyUsage`, the usage summary of
// `buildSandUsageSummary`); only where the numbers come from changed:
// `GET /desktop/api/user/profile` (`service.py`, `user_payload`) and
// `GET /desktop/api/user/quota` (`quota`). `profile-summary` repeats the
// quota's remaining credits under `creditItems` and adds nothing the
// renderer reads, so it is not called.

export const SIMEON_PROFILE_PATH = "user/profile";
export const SIMEON_QUOTA_PATH = "user/quota";

/** `user_payload()` in `server/simeon/desktop/service.py`. */
export interface SimeonProfileRow {
  readonly id?: string;
  readonly email?: string;
  readonly name?: string;
  readonly nickname?: string;
  /** What the person asked their agents to call them (`POST user/name`). */
  readonly preferredName?: string;
  /** Google's first name, offered in the name sheet. */
  readonly suggestedName?: string;
  readonly avatarUrl?: string | null;
  readonly phone?: string | null;
  readonly accountMode?: string;
}

/** `quota()` in `server/simeon/desktop/service.py`. */
export interface SimeonQuotaRow {
  readonly planName?: string;
  /** `free`, `none`, or the subscription's own: `trialing`, `active`, `past_due`. */
  readonly subscriptionStatus?: string;
  readonly creditsLimit?: number;
  readonly creditsUsed?: number;
  readonly creditsRemaining?: number;
  readonly hasPaidCredits?: boolean;
  readonly periodStart?: string;
  readonly periodEnd?: string;
  /** The plan's key (`standard`, `pro`, `max`), null with no plan. */
  readonly tier?: string | null;
  /** When the trial ends, while trialing (5 October 2026). */
  readonly trialEndsAt?: string | null;
  readonly trialCancelable?: boolean;
  /** On-demand spend past the allowance; null until the server meters it. */
  readonly onDemand?: { readonly usedCents?: number; readonly limitCents?: number | null } | null;
  /** Where the person changes plan: the API host's /billing page. Null on the free fallback. */
  readonly upgradeUrl?: string | null;
}

function simeonAuth(getAccessToken: AccessTokenReader, deps: AccountProfileDeps) {
  return { getAccessToken: () => getAccessToken(), ...(deps.backendUrl === undefined ? {} : { backendUrl: deps.backendUrl }) };
}
async function readSimeonProfile(getAccessToken: AccessTokenReader, deps: AccountProfileDeps): Promise<SimeonProfileRow> {
  return await simeonApiData<SimeonProfileRow>(simeonAuth(getAccessToken, deps), SIMEON_PROFILE_PATH, { method: "GET", ...(deps.fetch === undefined ? {} : { fetch: deps.fetch }) });
}
export async function readSimeonQuota(getAccessToken: AccessTokenReader, deps: AccountProfileDeps): Promise<SimeonQuotaRow> {
  return await simeonApiData<SimeonQuotaRow>(simeonAuth(getAccessToken, deps), SIMEON_QUOTA_PATH, { method: "GET", ...(deps.fetch === undefined ? {} : { fetch: deps.fetch }) });
}

function finiteOrNull(value: unknown): number | null { return typeof value === "number" && Number.isFinite(value) ? value : null; }
function isoToMs(value: unknown): number | null { if (typeof value !== "string" || value.length === 0) return null; const ms = Date.parse(value); return Number.isFinite(ms) && ms > 0 ? ms : null; }

export function accountProfileFromSimeon(row: SimeonProfileRow, localName: string | undefined): AccountProfile {
  const avatar = typeof row.avatarUrl === "string" ? nonEmpty(row.avatarUrl) : undefined;
  return {
    displayName: localName ?? nonEmpty(row.preferredName) ?? nonEmpty(row.name) ?? nonEmpty(row.nickname),
    email: nonEmpty(row.email),
    profilePictureUrl: avatar,
    isStaffUser: false,
  };
}

/**
 * The quota as the renderer's meter reads it. The window is the plan's
 * (`simeon/desktop/allowance.py`): the week, Monday to Monday, on a plan;
 * the trial while trialing; the calendar month where no billing is
 * configured. The percent is of that window and the reset its end, so the
 * pinned renderer's "Weekly usage" title is true on a plan and the
 * "Trial usage" one while trialing. On-demand spend is carried through as
 * the renderer's used/limit pair when the server meters it.
 */
export function weeklyUsageFromSimeonQuota(quota: SimeonQuotaRow): WeeklyUsage | null {
  const limit = finiteOrNull(quota.creditsLimit); const used = finiteOrNull(quota.creditsUsed);
  if (limit == null || used == null) return null;
  const included = limit > 0;
  return { percentUsed: included ? Math.max(0, Math.min(100, (used / limit) * 100)) : 0, nextResetMs: isoToMs(quota.periodEnd), hasNonZeroIncludedLimit: included, onDemand: onDemandOfQuota(quota) };
}

function onDemandOfQuota(quota: SimeonQuotaRow): { usedCents: number; limitCents: number } | null {
  const onDemand = quota.onDemand; if (onDemand == null) return null;
  const used = finiteOrNull(onDemand.usedCents); const limit = finiteOrNull(onDemand.limitCents);
  return used == null || limit == null || limit <= 0 ? null : { usedCents: used, limitCents: limit };
}

/** The upgrade button: the billing page, when the server names one. */
export function upgradeCtaOfQuota(quota: SimeonQuotaRow): SandUsageUpgradeCta | null {
  const url = typeof quota.upgradeUrl === "string" ? quota.upgradeUrl : "";
  if (url.length === 0) return null;
  try { if (!["http:", "https:"].includes(new URL(url).protocol)) return null; } catch { return null; }
  const status = quota.subscriptionStatus;
  const label = status === "none" ? "Choose a plan" : status === "trialing" ? "Choose a plan" : "Get more usage";
  return { label, disabled: false, action: { kind: "open-url", url } };
}

export function usageSummaryFromSimeonQuota(quota: SimeonQuotaRow): SandUsageSummary {
  const weekly = weeklyUsageFromSimeonQuota(quota);
  const remaining = finiteOrNull(quota.creditsRemaining);
  const trialing = quota.subscriptionStatus === "trialing";
  const trialEndMs = isoToMs(quota.trialEndsAt);
  const onDemand = onDemandOfQuota(quota);
  return {
    isEnterprise: false,
    sandUsagePercent: weekly == null ? null : weekly.percentUsed,
    sandUsageResetTimestampMs: weekly?.nextResetMs ?? null,
    hasAvailableUsage: remaining == null ? weekly != null && weekly.percentUsed < 100 : remaining > 0,
    isSandTrial: trialing,
    // The server answers `none` once a trial has ended without a plan; the
    // renderer then says the trial is over and offers the plans.
    hasEndedSandTrial: !trialing && trialEndMs != null && trialEndMs <= Date.now(),
    hasNonZeroIncludedLimit: weekly?.hasNonZeroIncludedLimit ?? false,
    canCancelSandTrial: trialing && quota.trialCancelable === true,
    onDemand: onDemand == null ? null : { usedCents: onDemand.usedCents, limitCents: onDemand.limitCents, resetTimestampMs: weekly?.nextResetMs ?? null },
    upgradeCta: upgradeCtaOfQuota(quota),
  };
}

function profileClient(getAccessToken: AccessTokenReader, deps: AccountProfileDeps): DashboardClient {
  if (deps.createClient != null) return deps.createClient(getAccessToken);
  return createSimeonBackendClient(DashboardService, {
    getAccessToken,
    getMachineId: deps.getMachineId ?? getOrCreateMachineId,
  }) as unknown as DashboardClient;
}

function nonEmpty(value: string | undefined): string | undefined { const trimmed = value?.trim(); return trimmed != null && trimmed.length > 0 ? trimmed : undefined; }
export function displayNameFromProfile(firstName?: string, lastName?: string): string { return [firstName?.trim(), lastName?.trim()].filter((part): part is string => part != null && part.length > 0).join(" "); }
export function splitAccountName(name: string): { firstName: string; lastName: string } { const parts = name.split(/\s+/).filter(Boolean); return { firstName: parts[0] ?? "", lastName: parts.slice(1).join(" ") }; }
export function privacyModeEnabledForMode(mode: PrivacyMode | undefined): boolean { return mode !== PrivacyMode.USAGE_DATA_TRAINING_ALLOWED && mode !== PrivacyMode.USAGE_CODEBASE_TRAINING_ALLOWED; }
export function isLiveSandTrial(expiresAt: TimestampLike | null | undefined, nowMs: number): boolean { if (expiresAt == null) return false; const expiresMs = expiresAt.toDate().getTime(); return Number.isFinite(expiresMs) && expiresMs > nowMs; }
export function normalizedLimitCents(value: number | undefined): number | null { return value === undefined || !Number.isFinite(value) || value <= 0 || value >= NO_LIMIT_SENTINEL_CENTS ? null : value; }

function toOnDemandSpend(response: CurrentPeriodUsage | null | undefined): { usedCents: number; limitCents: number } | null {
  const usage = response?.spendLimitUsage; const limitCents = normalizedLimitCents(usage?.individualLimit);
  return usage == null || limitCents == null ? null : { usedCents: usage.individualUsed, limitCents };
}
function onDemandOf(response: CurrentPeriodUsage | undefined): { usedCents: number; limitCents: number | null; resetTimestampMs: number | null } | null {
  const usage = response?.spendLimitUsage; if (response === undefined || usage === undefined) return null;
  const end = Number(response.billingCycleEnd);
  return { usedCents: Number.isFinite(usage.individualUsed) ? usage.individualUsed : 0, limitCents: normalizedLimitCents(usage.individualLimit), resetTimestampMs: Number.isFinite(end) && end > 0 ? end : null };
}
export function toWeeklyUsage(status: SandUsageStatus, currentPeriodUsage: CurrentPeriodUsage | null, _nowMs: number): WeeklyUsage | null {
  if (status.usesPooledEnterpriseAllowance || status.usagePercent == null || !Number.isFinite(status.usagePercent)) return null;
  const reset = status.nextResetTimestampUtc?.toDate().getTime(); const included = status.hasNonZeroIncludedLimit === true;
  return { percentUsed: Math.max(status.usagePercent, 0), nextResetMs: reset != null && Number.isFinite(reset) && reset > 0 ? reset : null, hasNonZeroIncludedLimit: included, onDemand: included ? toOnDemandSpend(currentPeriodUsage) : null };
}

function isHttpExternalUrl(value: string): boolean { try { const url = new URL(value); return url.protocol === "http:" || url.protocol === "https:"; } catch { return false; } }
export function upgradeCtaOf(recommendation: SandUsageStatus["upgradeRecommendation"]): unknown | null {
  const button = recommendation?.cta; if (button == null || button.label === "") return null;
  const disabled = recommendation?.disabled === true;
  if (button.action.case === "url") {
    const value = button.action.value as { url: string }; if (!isHttpExternalUrl(value.url)) return null;
    return { label: button.label, disabled, action: { kind: "open-url", url: value.url } };
  }
  if (button.action.case === "dashboardAction") {
    const value = button.action.value as { action: string; args: Readonly<Record<string, string>>; successMessage?: string };
    if (!SUPPORTED_DASHBOARD_ACTIONS.has(value.action)) return null;
    return { label: button.label, disabled, action: { kind: "dashboard-action", action: value.action, args: { ...value.args }, successMessage: nonEmpty(value.successMessage) ?? null } };
  }
  return null;
}

export function buildSandUsageSummary(args: { readonly sandStatus: SandUsageStatus; readonly currentPeriodUsage?: CurrentPeriodUsage; readonly teams: TeamsResponse; readonly nowMs: number; readonly trialClaimGranted: boolean }): unknown {
  const { sandStatus } = args; const reset = sandStatus.nextResetTimestampUtc?.toDate().getTime(); const trial = isLiveSandTrial(sandStatus.sandTrialExpiresAt, args.nowMs); const included = sandStatus.hasNonZeroIncludedLimit === true;
  return { isEnterprise: args.teams.teams.some((team) => team.isEnterprise === true), sandUsagePercent: sandStatus.usagePercent !== undefined && Number.isFinite(sandStatus.usagePercent) && sandStatus.usagePercent >= 0 ? sandStatus.usagePercent : null, sandUsageResetTimestampMs: reset !== undefined && Number.isFinite(reset) && reset > 0 ? reset : null, hasAvailableUsage: sandStatus.hasAvailableUsage === true, isSandTrial: trial, hasEndedSandTrial: args.trialClaimGranted && !trial, hasNonZeroIncludedLimit: included, canCancelSandTrial: trial && sandStatus.sandTrialCancelable === true, onDemand: included ? onDemandOf(args.currentPeriodUsage) : null, upgradeCta: upgradeCtaOf(sandStatus.upgradeRecommendation) };
}

// The person, from `GET /desktop/api/user/profile`: their name, e-mail and
// the picture their sign-in provider gave (Google's, for the founder), which
// `cursor-avatar.ts` fetches as `preferredUrl` and hands to the account menu
// as a data URL. A locally renamed account keeps its local name on top.
// Until 24 September 2026 this was `GetMe` + `GetTeams` (see above).
export async function fetchAccountProfile(getAccessToken: AccessTokenReader, deps: AccountProfileDeps): Promise<AccountProfile | null> {
  const localName = readLocalAccountDisplayName();
  try {
    return accountProfileFromSimeon(await readSimeonProfile(getAccessToken, deps), localName);
  } catch (error) {
    deps.reportFailure?.("account-profile", "simeon-profile", error);
    return localName == null ? null : { displayName: localName, email: undefined, profilePictureUrl: undefined, isStaffUser: false };
  }
}
// The rename stays local, as before: the name is written to
// `~/.simeon/account-display-name` first and `DashboardService/UpdateUserName`
// is still attempted, where its "unimplemented" answer from Simeon Labs'
// server is swallowed by `persistAccountDisplayName`. It already worked
// that way; nothing here changed on 24 September 2026.
// Since 1 October 2026 the name is the server's (`POST /desktop/api/user/name`):
// what the person's agents, calls and recaps call them. The local copy stays
// so the account menu shows it at once.
export async function updateAccountProfileName(getAccessToken: AccessTokenReader, name: string, deps: AccountProfileDeps): Promise<void> {
  await persistAccountDisplayName(name, () => saveSimeonPreferredName(getAccessToken, name, deps).then(() => undefined));
}

export const SIMEON_NAME_PATH = "user/name";
export async function saveSimeonPreferredName(getAccessToken: AccessTokenReader, name: string, deps: AccountProfileDeps): Promise<SimeonProfileRow> {
  return await simeonApiData<SimeonProfileRow>(simeonAuth(getAccessToken, deps), SIMEON_NAME_PATH, { method: "POST", json: { name }, ...(deps.fetch === undefined ? {} : { fetch: deps.fetch }) });
}

/**
 * The name sheet after onboarding (1 October 2026): `needed` until the person
 * has given a name, with Google's first name offered. Never the e-mail's
 * local part: "bxss.fall" is not anyone's name.
 */
export interface NamePrompt { readonly needed: boolean; readonly suggested: string | null }
export function namePromptFromSimeon(row: SimeonProfileRow): NamePrompt {
  const preferred = nonEmpty(row.preferredName);
  return { needed: preferred == null, suggested: preferred ?? nonEmpty(row.suggestedName) ?? null };
}
export async function fetchNamePrompt(getAccessToken: AccessTokenReader, deps: AccountProfileDeps): Promise<NamePrompt> {
  return namePromptFromSimeon(await readSimeonProfile(getAccessToken, deps));
}
/** The person's name for a voice call: the chosen one, else Google's first name. */
export async function fetchPersonName(getAccessToken: AccessTokenReader, deps: AccountProfileDeps): Promise<string | null> {
  const row = await readSimeonProfile(getAccessToken, deps);
  return nonEmpty(row.preferredName) ?? nonEmpty(row.suggestedName) ?? null;
}
// Simeon Labs' proxy trains nothing on anyone; the answer is stated, not
// fetched from a dashboard RPC that 404s (ledger F-383).
export async function fetchUserPrivacyMode(getAccessToken: AccessTokenReader, deps: AccountProfileDeps): Promise<PrivacyMode | undefined> { if (!isConnectServed(process.env, DASHBOARD_SERVICE_NAME)) return PrivacyMode.NO_TRAINING; try { return (await profileClient(getAccessToken, deps).getUserPrivacyMode({}, { timeoutMs: PROFILE_REQUEST_TIMEOUT_MS })).privacyMode; } catch { return undefined; } }
export async function fetchUserPrivacyModeEnabled(getAccessToken: AccessTokenReader, deps: AccountProfileDeps): Promise<boolean> { return privacyModeEnabledForMode(await fetchUserPrivacyMode(getAccessToken, deps)); }
// The header's usage, from `GET /desktop/api/user/quota`. Until
// 24 September 2026 this was `GetSandUsageStatus` + `GetCurrentPeriodUsage`
// (see above) and always answered null here.
export async function fetchSandWeeklyUsage(getAccessToken: AccessTokenReader, deps: AccountProfileDeps): Promise<WeeklyUsage | null> { try { return weeklyUsageFromSimeonQuota(await readSimeonQuota(getAccessToken, deps)); } catch (error) { deps.reportFailure?.("account-usage", "simeon-quota", error); return null; } }
export async function fetchLocalToolPermissionCeiling(getAccessToken: AccessTokenReader, deps: AccountProfileDeps): Promise<"never" | "ask" | "always" | undefined> { if (!isConnectServed(process.env, DASHBOARD_SERVICE_NAME)) return undefined; try { const value = (await profileClient(getAccessToken, deps).getTeamAdminSettingsOrEmptyIfNotInTeam({}, { timeoutMs: PROFILE_REQUEST_TIMEOUT_MS })).localToolControls?.permissionCeiling; const c = deps.localToolPermissionCeilings ?? { never: 1, ask: 2, always: 3 }; return value === c.never ? "never" : value === c.ask ? "ask" : value === c.always ? "always" : undefined; } catch { return undefined; } }
// Settings → Usage & Billing and the account menu's usage card, from
// `GET /desktop/api/user/quota`. Until 24 September 2026 this was four
// Dashboard RPCs (see above) behind the `sand_usage_page` gate, which was
// off, so the page never showed. A failure is thrown, as before: the
// renderer's `loadUsageState` turns it into its "failed" state with the
// server's sentence.
export async function fetchSandUsageSummary(getAccessToken: AccessTokenReader, deps: AccountProfileDeps): Promise<unknown> { return usageSummaryFromSimeonQuota(await readSimeonQuota(getAccessToken, deps)); }
export async function cancelSandTrial(getAccessToken: AccessTokenReader, deps: AccountProfileDeps): Promise<{ ok: boolean; message: string | null }> { try { await profileClient(getAccessToken, deps).cancelSandTrial({}, { timeoutMs: USAGE_REQUEST_TIMEOUT_MS }); return { ok: true, message: null }; } catch (error) { return { ok: false, message: nonEmpty(deps.connectRawMessage?.(error)) ?? null }; } }
export async function invokeSandDashboardAction(getAccessToken: AccessTokenReader, request: { readonly action: string; readonly args: Readonly<Record<string, string>> }, deps: AccountProfileDeps): Promise<{ ok: boolean; message: string | null }> { const response = await profileClient(getAccessToken, deps).clientAction(request, { timeoutMs: USAGE_REQUEST_TIMEOUT_MS }); return { ok: response.success, message: nonEmpty(response.success ? response.infoMessage : response.errorMessage) ?? null }; }
