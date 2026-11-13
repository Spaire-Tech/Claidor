import { randomUUID } from "node:crypto";
import { CloudAgentService, DashboardService } from "../../../packages/proto/simeon/v1/services.js";
import { BackgroundComposerSource, StartingMessageType } from "../../../packages/proto/generated/simeon/v1/background_composer_pb.js";
import { AgentMode } from "../../../packages/proto/generated/agent/v1/agent_pb.js";
import { createSimeonBackendClient } from "../../../shared/node/simeon-backend/simeon-inference.js";
import { cloudAgentWebUrl } from "../../../shared/cloud-agents-availability.js";
import { CloudAgentCompletionPoller, CloudAgentModelCatalogCache, CloudAgentTeamAdminPolicyCache, resolveSandLimitError, resolveSavedEnvironment, type Clock, type DetailedComposer, type PollingPolicy, type SavedEnvironmentClient } from "./cloud-agent-poll-loop.js";
import { SandCloudAgentLaunchError } from "./cloud-agent-launch-error.js";
import { buildCloudAgentConversationAction, buildCloudAgentRequestedModel, buildCloudAgentUserMessage, buildRepoFromRemote, resolveCloudAgentEnvironmentFields, resolveLaunchRepoReference, toStartRepoConfig, type CloudAgentEnvironment, type SavedEnvironment } from "./cloud-agent-request-composition.js";
import type { SandModelCatalogEntry } from "../../../shared/agents/model-catalog.js";
import { CLOUD_AGENT_CODER, coderName, coderOfModel, coderPlan, coderProvider, codingChoice, type CloudAgentCoder, type CodingChoice } from "../../cloud-agents/coding-choice.js";
import type { CursorSignInState } from "../../cursor/cursor-account.js";
import { refreshSimeonModelRolesBeforeTurn } from "../inference/simeon-model-roles.js";
import { GITHUB_DEVICE_URL, type GitHubSignInState } from "../../cloud-agents/coding-github.js";
export const MAX_CLOUD_AGENT_FILES = 300;
/**
 * The label a launch carries when this engine does the work on the person's
 * own computer, in Claude Code (11 November 2026, `host/cloud-agents/`): the
 * server then makes a job only this computer takes
 * (`server/simeon/sand/cloud_agents_service.py`, `executor_of`).
 */
export const ON_COMPUTER_FIELDS = { usePrivateWorker: true, labels: [{ key: "executor", value: "computer" }] } as const;
/** The coding on this computer, as the cloud-agents extension starts it. */
export interface CloudAgentCoding { kick(): void; isBusy(): boolean }
/** GitHub on this computer (`coding-github.ts`). */
export interface CloudAgentGitHub { startSignIn(agentId: string): Promise<GitHubSignInState>; signInState(): Promise<GitHubSignInState> }
/** Cursor on this computer (`cursor/cursor-account.ts`): signed in with Cursor's own program, for a cloud agent's coding in Cursor. */
export interface CloudAgentCursor { startSignIn(): Promise<CursorSignInState>; signInState(): CursorSignInState; signOut(): Promise<CursorSignInState> }
/** The chat's Connect GitHub card (the apps' `github-sign-in`): the code, where to type it, and until when. */
export interface GitHubSignInCard { readonly type: "github-sign-in"; readonly code: string; readonly url: string; readonly expiresAtMs: number }
/**
 * The chat's card to connect Claude or ChatGPT (the apps' `model-connect`, 13 November 2026, the founder: "when
 * neither of them is connected, the user is given a choice of both cards to connect"): the providers offered, in
 * the order shown. Each row opens that provider's own connect flow in AI Models; the card reads what is connected
 * from the app's own accounts, so it carries no state.
 */
export interface ModelConnectCard { readonly type: "model-connect"; readonly providers: readonly ("claude" | "chatgpt" | "cursor")[] }
/** Cursor is the third (13 November 2026, the founder: "Cursor now"); an app from before it draws the two it knows. */
export const MODEL_CONNECT_PROVIDERS = ["claude", "chatgpt", "cursor"] as const;
/** Whether a launch or a follow-up may go ahead: yes, or what the agent is told instead, with the card to show (`waitFor`: what the agent is resumed on). */
export type CodingReadiness = { readonly ok: true } | { readonly ok: false; readonly text: string; readonly card?: GitHubSignInCard | ModelConnectCard; readonly waitFor?: "model" };
export const MODEL_CONNECT_CARD_TEXT = "A cloud agent codes in Claude Code on the user's own Claude plan, in Codex on their ChatGPT plan, or in Cursor on their Cursor plan, and none of them is connected, so nothing was launched. A card is now in the chat with all three to connect, named as the card names them: Claude Code, Codex and Cursor. Say so in one short sentence in your own words, with those three names (they pick whichever plan they have), don't explain the steps or send a link, and don't ask them to report back: you're resumed automatically once one is connected, and then you launch again.";
/** What the agent is told when the launch named a program that isn't connected: its card alone is in the chat. */
export function programConnectCardText(program: CloudAgentCoder): string { const name = coderName(program); return `The user asked for ${name}, which runs on their own ${coderPlan(program)} plan, and it isn't connected, so nothing was launched. A card is now in the chat to connect ${name}. Say so in one short sentence in your own words, don't explain the steps or send a link, and don't ask them to report back: you're resumed automatically once it is connected, and then you launch again with the same program.`; }
/** One line of a cloud agent's conversation, as the apps draw it. */
export interface CloudAgentLine { readonly id: string; readonly role: "prompt" | "update" | "answer"; readonly text: string; readonly atMs: number }
/** The server's conversation rows (`ConversationMessage`: `type` 1 the asker's, 2 the cloud agent's) as the apps' lines; rows with no words are left out. */
export function cloudAgentLines(conversation: unknown): CloudAgentLine[] {
  if (!Array.isArray(conversation)) return [];
  const lines: CloudAgentLine[] = [];
  for (const [index, row] of conversation.entries()) {
    if (row === null || typeof row !== "object") continue;
    const message = row as { text?: unknown; type?: unknown; bubbleId?: unknown; createdAt?: unknown };
    const text = typeof message.text === "string" ? message.text.trim() : "";
    if (text === "") continue;
    const bubble = typeof message.bubbleId === "string" && message.bubbleId !== "" ? message.bubbleId : `line-${index}`;
    const asked = message.type === 1 || (typeof message.type === "string" && /HUMAN/i.test(message.type));
    const at = Number(message.createdAt);
    lines.push({ id: bubble, role: asked ? "prompt" : bubble.startsWith("update-") ? "update" : "answer", text, atMs: Number.isFinite(at) && at > 0 ? at : 0 });
  }
  return lines;
}
export const GITHUB_CARD_TEXT = "GitHub isn't connected on your own computer (the box, not the user's Mac or PC) yet, so nothing was launched: the cloud agent opens the repository and its pull request with the user's GitHub account. A Connect GitHub card is now in the chat with a one-time code. Say so in your own words, but don't paste the code or a link, and don't ask them to report back: you're resumed automatically once GitHub is connected, and then you launch again.";
type AnyRecord = Record<string, unknown>;
export interface CloudAgentClient extends SavedEnvironmentClient {
  startBackgroundComposerFromSnapshot(request: AnyRecord): Promise<{ composer?: { bcId?: string } }>;
  getBackgroundComposerInfo(request: AnyRecord, options?: { timeoutMs: number }): Promise<{ composer?: DetailedComposer & { prompt?: { text?: string }; composer?: DetailedComposer["composer"] & { bcId?: string; name?: string; isArchived?: boolean; createdAtMs?: number; prStatus?: unknown }; prs?: readonly { prUrl?: string; branchName?: string; pullNumber?: number; prStatus?: unknown }[] } }>;
  listBackgroundComposers(request: { n: number }): Promise<{ composers: readonly AnyRecord[] }>;
  addAsyncFollowupBackgroundComposer(request: AnyRecord): Promise<{ runId?: string }>;
  pauseBackgroundComposer(request: AnyRecord): Promise<void>; renameBackgroundComposer(request: AnyRecord): Promise<void>; archiveBackgroundComposer(request: AnyRecord): Promise<void>; deleteBackgroundComposer(request: AnyRecord): Promise<void>;
  listBackgroundComposerArtifacts(request: AnyRecord): Promise<{ artifacts: readonly { absolutePath: string; sizeBytes: number | bigint }[] }>;
  getBackgroundComposerConversation(request: AnyRecord): Promise<{ conversation: unknown }>;
  getPullRequestMergeStatus(request: { prUrl: string }): Promise<{ isMerged?: boolean; isClosed?: boolean; isDraft?: boolean; state?: string }>;
  getOptimizedDiffDetails(request: AnyRecord): Promise<{ diff?: { diffs?: readonly { from: string; to: string; added: number; removed: number }[] } }>;
}
export interface DashboardClient { getTeamAdminSettingsOrEmptyIfNotInTeam(request: AnyRecord, options: { timeoutMs: number }): Promise<{ backgroundAgentSettings?: { disableCloudAgentsInSand?: boolean } }>; getTeams(request: { activeOnly: true }): Promise<{ teams: readonly { id: number; name: string; isDirectMember: boolean }[] }> }
export function mapRunStatus(status: unknown): string { if (typeof status === "string") { const value = status.toLowerCase(); return ["creating","running","finished","error","expired"].includes(value) ? value : "unknown"; } switch (status) { case 1: return "running"; case 2: return "finished"; case 3: return "error"; case 4: return "creating"; case 5: return "expired"; default: return "unknown"; } }
/** A run the plan's limit stopped reads as paused (11 November 2026: the person's Claude plan, `resolveSandLimitError`). */
export function statusOf(detailed?: DetailedComposer): string { const status = mapRunStatus(detailed?.composer?.status); return status === "error" && resolveSandLimitError(detailed) != null ? "paused" : status; }
export function resolvePrUrl(detailed?: DetailedComposer & { prs?: readonly { prUrl?: string }[] }): string { return detailed?.composer?.prUrl || detailed?.prs?.find((pr) => pr.prUrl)?.prUrl || ""; }
export function resolveBranchName(detailed?: DetailedComposer & { prs?: readonly { branchName?: string }[] }): string { return detailed?.composer?.branchName || detailed?.prs?.find((pr) => pr.branchName)?.branchName || ""; }
export type CloudAgentPrState = "none" | "unknown" | "open" | "draft" | "merged" | "closed";
export function mapProtoPrStatus(status: unknown): Exclude<CloudAgentPrState, "none" | "unknown"> | null { switch (status) { case 1: return "open"; case 2: return "draft"; case 3: return "merged"; case 4: return "closed"; default: return null; } }
export function resolvePr(detailed?: DetailedComposer & { composer?: DetailedComposer["composer"] & { prStatus?: unknown } }): { state: CloudAgentPrState; number: number | null } { const url = resolvePrUrl(detailed); const primary = url.length > 0 ? detailed?.prs?.find((pr) => pr.prUrl === url) : detailed?.prs?.find((pr) => pr.pullNumber != null || mapProtoPrStatus(pr.prStatus) != null); const state = mapProtoPrStatus(primary?.prStatus) ?? mapProtoPrStatus(detailed?.composer?.prStatus) ?? (url.length > 0 || primary != null ? "unknown" : "none"); return { state, number: primary?.pullNumber ?? null }; }
export function normalizeDiffPath(raw: string): string { const value = raw.trim(); return value === "/dev/null" ? "" : value; }
export function toFileChange(diff: { from: string; to: string; added: number; removed: number }) { const from = normalizeDiffPath(diff.from), to = normalizeDiffPath(diff.to), path = to || from; return path ? { path, added: diff.added, removed: diff.removed } : null; }
// Where a cloud agent's work is opened (11 November 2026): its pull request, once there is one. Simeon's page for a run
// (`cloudAgentWebUrl`, app.simeonlabs.com/agents/<bcId>) was never made, so nothing links there any more.
export function cloudAgentUrl(_bcId: string, prUrl = ""): string { void cloudAgentWebUrl; return prUrl; }
export function buildTranscriptJsonl(conversation: unknown, convert: (conversation: unknown) => readonly unknown[]) { const lines = convert(conversation).map((message) => JSON.stringify(message, (_key, value) => typeof value === "bigint" ? value.toString() : value)); return { jsonl: lines.length > 0 ? `${lines.join("\n")}\n` : "", lineCount: lines.length }; }
export interface SandCloudAgentManagerOptions { readonly getAccountAccessToken: (options?: { readonly backendUrl: string }) => Promise<string>; readonly getMachineId: () => Promise<string>; readonly completionPolling: PollingPolicy; readonly clock: Clock; readonly convertConversationMessagesToTrace: (conversation: unknown) => readonly unknown[]; readonly clientForTesting?: CloudAgentClient; readonly dashboardClientForTesting?: DashboardClient; readonly modelCatalogForTesting?: readonly SandModelCatalogEntry[]; readonly onRequestId?: (id: string) => void }
// The enum fields (`source`, `followupSource`, `startingMessageType`, the user message's `mode`) carry the generated
// constants: the reconstruction had the strings "their product name", "user-message" and "agent" where the bundle had enum values,
// which the binary codec wrote as garbage and the JSON codec refuses ("cannot encode field ... to JSON"; 25 September 2026).
export class SandCloudAgentManager {
  readonly launchedIds = new Set<string>();
  private coding?: CloudAgentCoding;
  private client?: CloudAgentClient; private dashboardClient?: DashboardClient; private readonly completionPoller: CloudAgentCompletionPoller; private readonly modelCatalog: CloudAgentModelCatalogCache; private readonly teamAdminPolicy: CloudAgentTeamAdminPolicyCache;
  constructor(private readonly options: SandCloudAgentManagerOptions) { this.completionPoller = new CloudAgentCompletionPoller(options, () => this.getClient()); this.modelCatalog = new CloudAgentModelCatalogCache(options); this.teamAdminPolicy = new CloudAgentTeamAdminPolicyCache({ clock: options.clock, load: async () => (await this.getDashboardClient().getTeamAdminSettingsOrEmptyIfNotInTeam({}, { timeoutMs: 10_000 })).backgroundAgentSettings ?? {} }); }
  private github?: CloudAgentGitHub;
  /** The coding on this computer: launches ask for it, and each launch or follow-up starts it at once. */
  attachCoding(coding: CloudAgentCoding): void { this.coding = coding; }
  /** GitHub on this computer, which the coding opens repositories with. */
  attachGitHub(github: CloudAgentGitHub): void { this.github = github; }
  private modelWait?: { wait(agentId: string, program?: CloudAgentCoder): void };
  /** What resumes an agent once a program is connected from the chat's card (`model-connect-wait.ts`). */
  attachModelWait(modelWait: { wait(agentId: string, program?: CloudAgentCoder): void }): void { this.modelWait = modelWait; }
  private cursor?: CloudAgentCursor;
  /** Cursor on this computer, which a cloud agent's coding may run in. */
  attachCursor(cursor: CloudAgentCursor): void { this.cursor = cursor; }
  /** The card's Cursor row (`getCursorSignIn`, `startCursorSignIn`, `signOutCursor`); "none" where this engine does no coding. */
  async getCursorSignIn(): Promise<CursorSignInState> { return this.cursor === undefined ? { state: "none" } : this.cursor.signInState(); }
  async startCursorSignIn(): Promise<CursorSignInState> { return this.cursor === undefined ? { state: "failed", why: "Cursor can't be connected on this computer" } : await this.cursor.startSignIn(); }
  async signOutCursor(): Promise<CursorSignInState> { return this.cursor === undefined ? { state: "none" } : await this.cursor.signOut(); }
  /** The Connect GitHub card's state (`getGitHubSignIn`); "none" where this engine does no coding. */
  async getGitHubSignIn(): Promise<GitHubSignInState> { return this.github === undefined ? { state: "none" } : await this.github.signInState(); }
  /**
   * Whether `agentId`'s launch or follow-up may go ahead on this computer:
   * Claude or ChatGPT connected (the work runs in Claude Code or in Codex on
   * the person's own plan, `codingChoice`) and GitHub connected here. When
   * neither model is, the card that offers both comes back (13 November
   * 2026); when GitHub isn't, its sign-in starts and the card that carries
   * its code comes back. Always yes where this engine does no coding (the
   * cloud runner answers then, as before). A launch that named a program
   * (`program`: "in Cursor") needs that one: when it isn't connected, its
   * card alone comes back.
   */
  async codingReady(agentId: string, choice: (kept?: CloudAgentCoder) => { readonly model: string; readonly coder?: CloudAgentCoder } | undefined = codingChoice, refresh: () => Promise<void> = refreshSimeonModelRolesBeforeTurn, program?: CloudAgentCoder): Promise<CodingReadiness> {
    if (this.coding === undefined || this.github === undefined) return { ok: true };
    const found = (): boolean => { const one = choice(program); return one !== undefined && (program === undefined || (one.coder ?? CLOUD_AGENT_CODER) === program); };
    // What was connected a moment ago in AI Models counts: the roles are read again when the last read is old.
    if (!found()) await refresh().catch(() => undefined);
    if (!found()) {
      this.modelWait?.wait(agentId, program);
      return program === undefined
        ? { ok: false, text: MODEL_CONNECT_CARD_TEXT, card: { type: "model-connect", providers: MODEL_CONNECT_PROVIDERS }, waitFor: "model" }
        : { ok: false, text: programConnectCardText(program), card: { type: "model-connect", providers: [coderProvider(program)] }, waitFor: "model" };
    }
    const state = await this.github.startSignIn(agentId);
    if (state.state === "connected") return { ok: true };
    if (state.state === "waiting") return { ok: false, text: GITHUB_CARD_TEXT, card: { type: "github-sign-in", code: state.code, url: state.url || GITHUB_DEVICE_URL, expiresAtMs: state.expiresAtMs } };
    return { ok: false, text: `GitHub's sign-in couldn't start on your own computer (the box, not the user's Mac or PC): ${state.state === "failed" ? state.why : "the sign-in ended"}. Nothing was launched. Tell the user plainly that this is on Simeon's side and nothing on their own computer needs doing; try the launch once more later, and if it says the same, stop and tell them it needs fixing by Simeon Labs.` };
  }
  /** The model that codes now (`own:claude:…`, `own:chatgpt:…`, `own:cursor:…`), in `program` when the launch named one, which a launch on this computer carries so the server knows the program from the start. */
  private codingModelId(program?: CloudAgentCoder): string | undefined { return (codingChoice(program) as CodingChoice | undefined)?.modelId; }
  /** A turn of coding is being done on this computer (the sleeper keeps it awake). */
  isCodingBusy(): boolean { return this.coding?.isBusy() ?? false; }
  isDisabledByTeamAdmin(): boolean { return this.teamAdminPolicy.isDisabledByTeamAdmin(); } prefetchTeamAdminPolicy(): void { this.teamAdminPolicy.prefetchTeamAdminPolicy(); } dispose(): void { this.completionPoller.dispose(); } listModels(): Promise<readonly SandModelCatalogEntry[]> { return this.modelCatalog.listModels(); }
  private getClient(): CloudAgentClient { return this.options.clientForTesting ?? (this.client ??= createSimeonBackendClient(CloudAgentService, { getAccessToken: this.options.getAccountAccessToken, getMachineId: this.options.getMachineId, ...(this.options.onRequestId === undefined ? {} : { onRequestId: this.options.onRequestId }) }) as unknown as CloudAgentClient); }
  private getDashboardClient(): DashboardClient { return this.options.dashboardClientForTesting ?? (this.dashboardClient ??= createSimeonBackendClient(DashboardService, { getAccessToken: this.options.getAccountAccessToken, getMachineId: this.options.getMachineId, ...(this.options.onRequestId === undefined ? {} : { onRequestId: this.options.onRequestId }) }) as unknown as DashboardClient); }
  async resolvePrivateWorkerTeamId(environment?: CloudAgentEnvironment): Promise<number | undefined> { if (environment == null || environment.type === "cloud" || environment.type === "environment") return undefined; if (environment.teamId != null) return environment.teamId; const teams = (await this.getDashboardClient().getTeams({ activeOnly: true })).teams.filter((team) => team.id > 0 && team.isDirectMember); if (teams.length === 1) return teams[0]?.id; if (teams.length === 0) { if (environment.type === "pool") throw new SandCloudAgentLaunchError("A self-hosted pool requires an active team, but this account has none."); return undefined; } throw new SandCloudAgentLaunchError(`This account has multiple active teams. Set environment.team_id to one of: ${teams.map((team) => `${team.name} (${team.id})`).join(", ")}.`); }
  async launch(args: { prompt: string; repoUrl?: string; startingRef?: string; environment?: CloudAgentEnvironment; program?: CloudAgentCoder; modelId?: string; modelParams?: Readonly<Record<string, string>>; images?: readonly { data: Uint8Array; path?: string; mimeType?: string }[]; title?: string }) { if (args.environment?.type === "machine" && args.startingRef?.trim()) throw new SandCloudAgentLaunchError(`A named private worker runs on its own checkout, so it can't start from '${args.startingRef}'. Omit starting_ref (the worker uses its current branch), or use a cloud or pool environment to start from a specific ref.`); const saved = args.environment?.type === "environment" ? await resolveSavedEnvironment(this.getClient(), { ...(args.environment.publicId === undefined ? {} : { publicId: args.environment.publicId }), ...(args.environment.name === undefined ? {} : { name: args.environment.name }) }) as SavedEnvironment : undefined, repo = buildRepoFromRemote(resolveLaunchRepoReference(args.repoUrl, saved), args.startingRef), requestedModel = buildCloudAgentRequestedModel(args.modelId ?? (this.coding === undefined ? undefined : this.codingModelId(args.program)), args.modelParams), bcId = `bc-${randomUUID()}`, teamId = await this.resolvePrivateWorkerTeamId(args.environment); const request: AnyRecord = { bcId, snapshotNameOrId: repo.sanitizedRepoUrl, devcontainerStartingPoint: { url: repo.httpRepoUrl, ref: repo.baseBranch ?? "", ...(saved == null ? {} : { environmentPublicId: saved.publicId, ...(saved.name.trim() ? { environmentName: saved.name.trim() } : {}), repoConfig: toStartRepoConfig(saved.repoConfig) }) }, snapshotWorkspaceRootPath: "/workspace", returnImmediately: true, repoUrl: repo.httpRepoUrl, source: BackgroundComposerSource.SIMEON, autoBranch: true, ...(repo.baseBranch === undefined ? {} : { baseBranch: repo.baseBranch }), autoCreatePr: true, conversationAction: buildCloudAgentConversationAction(buildCloudAgentUserMessage({ prompt: args.prompt, mode: AgentMode.AGENT, ...(args.images === undefined ? {} : { images: args.images }) })), startingMessageType: StartingMessageType.USER_MESSAGE, addInitialMessageToResponses: true, repositoryInfo: { pathEncryptionKey: "", shouldSyncIndex: false }, ...resolveCloudAgentEnvironmentFields(repo.httpRepoUrl, args.environment), ...(this.coding !== undefined && (args.environment == null || args.environment.type === "cloud" || args.environment.type === "environment") ? ON_COMPUTER_FIELDS : {}), requestedModels: requestedModel == null ? [] : [requestedModel], skills: [], ...(teamId === undefined ? {} : { teamId }), ...(args.title?.trim() ? { name: args.title.trim() } : {}) }; const response = await this.getClient().startBackgroundComposerFromSnapshot(request), id = response.composer?.bcId || bcId; this.coding?.kick(); return { bcId: id, url: cloudAgentUrl(id) }; }
  awaitCompletion(bcId: string, options?: { waitForRestart?: boolean }) { return this.completionPoller.awaitCompletion(bcId, options); }
  async list(args?: { limit?: number; includeArchived?: boolean }) { const response = await this.getClient().listBackgroundComposers({ n: args?.limit ?? 20 }); return response.composers.filter((composer) => (args?.includeArchived ?? false) || composer.isArchived !== true).map((composer) => ({ bcId: String(composer.bcId ?? ""), name: String(composer.name ?? ""), status: mapRunStatus(composer.status), branchName: String(composer.branchName ?? ""), prUrl: String(composer.prUrl ?? ""), isArchived: composer.isArchived === true, createdAtMs: Number(composer.createdAtMs ?? 0), url: cloudAgentUrl(String(composer.bcId ?? ""), String(composer.prUrl ?? "")) })); }
  async get(bcId: string) { const id = bcId.trim(); if (!id) return null; const detailed = (await this.getClient().getBackgroundComposerInfo({ bcId: id, includeDiff: false, doNotThrowIfSetupNotFinished: true })).composer, composer = detailed?.composer; if (composer == null) return null; return { bcId: id, name: composer.name ?? "", status: statusOf(detailed), branchName: resolveBranchName(detailed), prUrl: resolvePrUrl(detailed), isArchived: composer.isArchived ?? false, createdAtMs: composer.createdAtMs ?? 0, url: cloudAgentUrl(id, resolvePrUrl(detailed)), filesChanged: composer.filesChanged ?? 0, linesAdded: composer.linesAdded ?? 0, linesRemoved: composer.linesRemoved ?? 0, error: resolveSandLimitError(detailed), coder: coderOfModel(composer.requestedModel?.modelId) as string }; }
  async reply(args: { bcId: string; prompt: string; images?: readonly { data: Uint8Array; path?: string; mimeType?: string }[]; interrupt?: boolean; modelId?: string; modelParams?: Readonly<Record<string, string>> }) { const requestedModel = buildCloudAgentRequestedModel(args.modelId, args.modelParams), response = await this.getClient().addAsyncFollowupBackgroundComposer({ bcId: args.bcId, followupConversationAction: buildCloudAgentConversationAction(buildCloudAgentUserMessage({ prompt: args.prompt, ...(args.images === undefined ? {} : { images: args.images }) })), synchronous: args.interrupt ?? false, followupSource: BackgroundComposerSource.SIMEON, ...(requestedModel == null ? {} : { requestedModel }) }); this.coding?.kick(); return { runId: response.runId }; }
  async cancel(bcId: string): Promise<void> { await this.getClient().pauseBackgroundComposer({ bcId, source: BackgroundComposerSource.SIMEON }); } async rename(bcId: string, newName: string): Promise<void> { await this.getClient().renameBackgroundComposer({ bcId, newName }); } async setArchived(bcId: string, archived: boolean): Promise<void> { await this.getClient().archiveBackgroundComposer({ bcId, unarchive: !archived, source: BackgroundComposerSource.SIMEON }); } async delete(bcId: string): Promise<void> { await this.getClient().deleteBackgroundComposer({ bcId }); }
  async listArtifacts(bcId: string) { return (await this.getClient().listBackgroundComposerArtifacts({ bcId })).artifacts.map((artifact) => ({ path: artifact.absolutePath, sizeBytes: Number(artifact.sizeBytes) })); }
  async getTranscriptDump(args: { bcId: string }) { const bcId = args.bcId.trim(); if (!bcId) return null; const response = await this.getClient().getBackgroundComposerConversation({ bcId }), dump = buildTranscriptJsonl(response.conversation, this.options.convertConversationMessagesToTrace); let status = "unknown"; try { status = mapRunStatus((await this.getClient().getBackgroundComposerInfo({ bcId, includeDiff: false, doNotThrowIfSetupNotFinished: true })).composer?.composer?.status); } catch {} return { ...dump, status }; }
  /**
   * A cloud agent's conversation for the apps (`getCloudAgentConversation`, 13 November 2026): what it was asked
   * (`prompt`), what it said along the way (`update`: the server's rows whose bubbleId starts `update-`) and each
   * turn's answer, in the server's order, and the program that coded (`coder`). Null when the server doesn't know it.
   */
  async getConversation(bcId: string): Promise<{ bcId: string; coder: string; messages: CloudAgentLine[] } | null> { const id = bcId.trim(); if (!id) return null; let response: { conversation: unknown }; try { response = await this.getClient().getBackgroundComposerConversation({ bcId: id }); } catch (error) { const candidate = error as { name?: unknown; code?: unknown }; if (candidate?.name === "ConnectError" && (candidate.code === 5 || candidate.code === 7)) return null; throw error; } return { bcId: id, coder: await this.coderOf(id), messages: cloudAgentLines(response.conversation) }; }
  /** The program that codes for a cloud agent, from the model the server keeps for it (`coderOfModel`); Claude Code when the server can't say. */
  private async coderOf(bcId: string): Promise<string> { try { return coderOfModel((await this.getClient().getBackgroundComposerInfo({ bcId, includeDiff: false, doNotThrowIfSetupNotFinished: true })).composer?.composer?.requestedModel?.modelId); } catch { return coderOfModel(undefined); } }
  async getInfo(bcId: string, includeFiles = true) { const id = bcId.trim(); if (!id) return null; let response: Awaited<ReturnType<CloudAgentClient["getBackgroundComposerInfo"]>>; try { response = await this.getClient().getBackgroundComposerInfo({ bcId: id, includeDiff: false, doNotThrowIfSetupNotFinished: true }); } catch (error) { const candidate = error as { name?: unknown; code?: unknown }; if (candidate?.name === "ConnectError" && (candidate.code === 5 || candidate.code === 7)) return null; throw error; } const detailed = response.composer, composer = detailed?.composer, filesChanged = composer?.filesChanged ?? 0, pr = resolvePr(detailed), prUrl = resolvePrUrl(detailed); const [files, livePrState] = await Promise.all([includeFiles && filesChanged > 0 ? this.fetchFileChanges(id) : Promise.resolve([]), this.fetchLivePrState(prUrl, pr.state)]); return { bcId: id, status: statusOf(detailed), coder: coderOfModel(composer?.requestedModel?.modelId) as string, name: composer?.name ?? "", prompt: detailed?.prompt?.text ?? "", branchName: resolveBranchName(detailed), prUrl, prState: livePrState ?? pr.state, prNumber: pr.number, filesChanged, linesAdded: composer?.linesAdded ?? 0, linesRemoved: composer?.linesRemoved ?? 0, files }; }
  async fetchLivePrState(prUrl: string, storedState: string): Promise<string | null> { if (!prUrl || storedState === "merged") return null; try { const value = await this.getClient().getPullRequestMergeStatus({ prUrl }); return value.isMerged ? "merged" : value.isClosed ? "closed" : value.isDraft ? "draft" : value.state === "open" ? "open" : null; } catch { return null; } }
  async fetchFileChanges(bcId: string) { try { const response = await this.getClient().getOptimizedDiffDetails({ bcId, excludeBeforeAfterDiffs: true }), changes: { path: string; added: number; removed: number }[] = []; for (const diff of response.diff?.diffs ?? []) { const change = toFileChange(diff); if (change != null) changes.push(change); if (changes.length >= MAX_CLOUD_AGENT_FILES) break; } return changes; } catch { return []; } }
}
