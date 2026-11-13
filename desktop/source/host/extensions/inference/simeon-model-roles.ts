/**
 * Which models answer, as Simeon Labs' server says (13 October 2026).
 *
 * The server holds the policy (`ModelPolicy`, server/simeon/desktop/pricing.py):
 * one setting moves every engine between GPT-6 and Claude, and a few people
 * can go first. Until then the engine named its models itself (GPT-6 Sol and
 * Luna, `DEFAULT_SIMEON_MODEL`), so a change of model meant a new bundle on
 * every box. The host now reads the roles from
 * `GET /desktop/api/models/available` when it starts and every five minutes
 * after, and keeps the last answer when a read fails. Until the first answer,
 * and wherever the server names nothing, the defaults hold: GPT-6 Sol and
 * Luna, which every policy serves.
 *
 * Read only from the host's own composition (`inference-service.ts`), never
 * on import: a test that stubs `fetch` sees no request it did not make.
 *
 * The last answer is kept on the box's data volume (`model-roles.json`) and
 * taken back when the host starts (14 October 2026). Until then a computer
 * that woke up answered on GPT-6 Sol and Luna until its first read, which
 * fails while the box's sign-in is not there yet and was tried again only
 * thirty seconds later: under the Claude policy the founder's first
 * messages after a wake went to GPT and came back empty ("Your agent
 * couldn't answer right now", then it worked). Until a first read succeeds
 * the host now asks again every five seconds.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { simeonApiUrl } from "../../../shared/node/simeon-backend/simeon-api.js";
import { HOST_LOG_PREFIX, logHostLine } from "../../../shared/host-log.js";

export interface SimeonModelRoles {
  /** Every reply the person reads. */
  readonly primary?: string;
  /** Summaries, memory, titles and other machinery. */
  readonly cheap?: string;
  /** Answers a step when the primary's provider fails. */
  readonly fallback?: string;
  /**
   * Drives the desktop for the agent: the computerUse helper, which the
   * upstream app runs on a stronger model than its agent (Claude Opus there,
   * `sand-agent-model.ts`). None named, the primary does it (18 October 2026).
   */
  readonly computer?: string;
  /**
   * The person's own Claude plan (9 November 2026, docs/your-own-models.md,
   * section 6): the agent's turns are run by Claude Code on the computer, on
   * this model (`opus`, `sonnet`). The server names it as a `primary` row on
   * the `claude-code` wire; `primary` itself stays Simeon's, which answers
   * whenever Claude Code can't.
   */
  readonly claudeCode?: string;
  /**
   * How hard Claude thinks on those turns (`--effort`: `low`, `medium`,
   * `high`, `xhigh`, `max`), as the person chose beside the model on the
   * composer (9 November 2026); none, Claude Code's own.
   */
  readonly claudeCodeEffort?: string;
}

export const SIMEON_MODEL_ROLES_PATH = "models/available";
export const SIMEON_MODEL_ROLES_REFRESH_MS = 5 * 60_000;
const SIMEON_MODEL_ROLES_TIMEOUT_MS = 15_000;
/** The file, in the box's data root, that keeps the last roles read. */
export const SIMEON_MODEL_ROLES_FILE = "model-roles.json";

// The wires this engine writes for the loop. A role on any other wire is not
// one it can follow, and is left to the defaults.
const FOLLOWED_TRANSPORTS: ReadonlySet<string> = new Set(["openai-responses", "anthropic-messages"]);
/** The wire of a turn run by Claude Code on the computer: no model calls of the engine's own. */
export const CLAUDE_CODE_TRANSPORT = "claude-code";
/** A Claude Code model name as `--model` takes it (`opus`, `sonnet`, `claude-opus-5-5`). */
const CLAUDE_CODE_MODEL = /^[a-z][a-z0-9.-]{0,63}$/;
/** The efforts Claude Code takes (`claude --help`, 2.1.311). */
const CLAUDE_CODE_EFFORTS: ReadonlySet<string> = new Set(["low", "medium", "high", "xhigh", "max"]);

/** The wire of a cloud agent's coding in Codex on the computer (the server's `CODEX_TRANSPORT`). */
export const CODEX_TRANSPORT = "codex";
/** The role of the rows that say what a cloud agent's coding runs in (the server's `CODING_ROLE`). */
export const CODING_ROLE = "coding";
/** A Codex model name as `-m` takes it (`gpt-6.1-sol`), and an effort (`model_reasoning_effort`). */
const CODEX_MODEL = /^[a-z][a-z0-9.-]{0,63}$/;
const CODEX_EFFORT = /^[a-z]{2,12}$/;

/**
 * A program a cloud agent's coding may run in on this computer (13 November
 * 2026): Claude Code on the person's Claude plan, or Codex on their ChatGPT
 * plan, with the model and the effort it is given. The server lists the ones
 * connected, the one to take first (`coding_rows` in
 * `server/simeon/desktop/own_models.py`); none listed, neither is connected.
 */
export interface SimeonCodingProgram {
  readonly coder: "claude-code" | "codex";
  /** The model as the program names it (`claude-opus-5-5`, `gpt-6.1-sol`). */
  readonly model: string;
  readonly effort?: string;
  /** The model as Simeon names it (`own:claude:claude-opus-5-5`, `own:chatgpt:gpt-6.1-sol`). */
  readonly modelId: string;
}

let current: SimeonModelRoles = {};
/** The coding programs of the last read, kept apart from the roles as the names are. */
let codingPrograms: readonly SimeonCodingProgram[] = [];
/**
 * The roles the engine's last run kept (`model-roles.json` as this run found
 * it at its start): the model the agents were last on before this engine
 * started, which an agent's first turn on it is compared with (`turn-model.ts`).
 */
let rolesAtStart: SimeonModelRoles | undefined;
/**
 * Each model's name as the last read gave it (`modelName`), and the model the
 * Claude Code row names (`own:claude:…`): the chat's line when an agent's
 * model changes names it with them (`turn-model.ts`, 10 November 2026).
 * Kept apart from the roles, which stay the four ids and Claude Code's two.
 */
let modelNames: ReadonlyMap<string, string> = new Map();
let claudeCodeModelId: string | undefined;
let lastLogged = "";
/** When the roles were last read, and where from (`startSimeonModelRoles`): the read before a turn. */
let lastReadAt = 0;
let liveSource: SimeonModelRolesSource | undefined;
let readingBeforeTurn: Promise<unknown> | undefined;

/** A read older than this is made again before an agent's turn. */
export const SIMEON_MODEL_ROLES_TURN_FRESH_MS = 15_000;
/** The longest a turn waits for that read; past it, the turn goes on the roles it has. */
export const SIMEON_MODEL_ROLES_TURN_WAIT_MS = 3_000;

/**
 * Before an agent's turn: the roles read again when the last read is more
 * than fifteen seconds old, waited for at most three seconds (9 November
 * 2026). Until then a model or an effort chosen on the composer reached the
 * agents only at the next five-minute read: the founder connected Claude at
 * 22:44 and his next two messages were still answered on Simeon's model.
 */
export async function refreshSimeonModelRolesBeforeTurn(now: number = Date.now()): Promise<void> {
  const source = liveSource;
  if (source === undefined || now - lastReadAt < SIMEON_MODEL_ROLES_TURN_FRESH_MS) return;
  readingBeforeTurn ??= refreshSimeonModelRoles(source).finally(() => { readingBeforeTurn = undefined; });
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([readingBeforeTurn, new Promise<void>((resolve) => { timer = setTimeout(resolve, SIMEON_MODEL_ROLES_TURN_WAIT_MS); })]);
  if (timer !== undefined) clearTimeout(timer);
}

/** For tests: the source the read before a turn uses, and when the last read was. */
export function setSimeonModelRolesSourceForTest(source: SimeonModelRolesSource | undefined, readAt = 0): void {
  liveSource = source;
  lastReadAt = readAt;
}

export function simeonModelRoles(): SimeonModelRoles {
  return current;
}

/** The roles the engine's last run kept, as this run found them when it started; undefined when it kept none. */
export function simeonModelRolesAtStart(): SimeonModelRoles | undefined {
  return rolesAtStart;
}

/** A model's name as the server's last answer gave it; undefined when it named none. */
export function simeonModelName(modelId: string): string | undefined {
  return modelNames.get(modelId);
}

/** The model id of the Claude Code row (`own:claude:claude-opus-5-5`), while the person's Claude plan is chosen. */
export function simeonClaudeCodeModelId(): string | undefined {
  return claudeCodeModelId;
}

/** Keeps the names and the Claude Code row's id of one `/desktop/api/models/available` answer. */
export function rememberSimeonModelNames(body: unknown): void {
  const rows = (body as { data?: unknown } | null | undefined)?.data;
  if (!Array.isArray(rows)) return;
  const names = new Map<string, string>();
  let claude: string | undefined;
  for (const row of rows as Row[]) {
    if (row == null || typeof row.modelId !== "string" || row.modelId.trim() === "") continue;
    const id = row.modelId.trim();
    if (typeof row.modelName === "string" && row.modelName.trim() !== "" && !names.has(id)) names.set(id, row.modelName.trim().slice(0, 80));
    if (claude === undefined && row.role === "primary" && row.transportApi === CLAUDE_CODE_TRANSPORT && row.accessible !== false) claude = id;
  }
  modelNames = names;
  claudeCodeModelId = claude;
}

/** The programs a cloud agent's coding may run in, the one to take first; empty when neither is connected (or the server is an older one). */
export function simeonCodingPrograms(): readonly SimeonCodingProgram[] {
  return codingPrograms;
}

/** The coding programs in one `/desktop/api/models/available` answer: its rows of the `coding` role, in their order. */
export function parseSimeonCodingPrograms(body: unknown): SimeonCodingProgram[] {
  const rows = (body as { data?: unknown } | null | undefined)?.data;
  if (!Array.isArray(rows)) return [];
  const programs: SimeonCodingProgram[] = [];
  for (const row of rows as (Row & { codexModel?: unknown; codexEffort?: unknown })[]) {
    if (row == null || row.role !== CODING_ROLE || row.accessible === false || typeof row.modelId !== "string" || row.modelId.trim() === "") continue;
    const modelId = row.modelId.trim();
    if (row.transportApi === CLAUDE_CODE_TRANSPORT && typeof row.claudeCodeModel === "string" && CLAUDE_CODE_MODEL.test(row.claudeCodeModel.trim())) {
      const effort = typeof row.claudeCodeEffort === "string" && CLAUDE_CODE_EFFORTS.has(row.claudeCodeEffort) ? row.claudeCodeEffort : undefined;
      programs.push({ coder: "claude-code", model: row.claudeCodeModel.trim(), ...(effort === undefined ? {} : { effort }), modelId });
    } else if (row.transportApi === CODEX_TRANSPORT && typeof row.codexModel === "string" && CODEX_MODEL.test(row.codexModel.trim())) {
      const effort = typeof row.codexEffort === "string" && CODEX_EFFORT.test(row.codexEffort) ? row.codexEffort : undefined;
      programs.push({ coder: "codex", model: row.codexModel.trim(), ...(effort === undefined ? {} : { effort }), modelId });
    }
  }
  return programs;
}

export function setSimeonCodingProgramsForTest(programs: readonly SimeonCodingProgram[]): void {
  codingPrograms = [...programs];
}

/**
 * The roles read again now, whatever the last read's age (the chat's card to
 * connect Claude or ChatGPT waits on it, `model-connect-wait.ts`). True when
 * the server answered.
 */
export async function readSimeonModelRolesNow(): Promise<boolean> {
  const source = liveSource;
  if (source === undefined) return false;
  return await refreshSimeonModelRoles(source) !== undefined;
}

export function setSimeonModelRolesForTest(roles: SimeonModelRoles): void {
  current = { ...roles };
  lastLogged = "";
  lastKept = "";
}

type Row = { modelId?: unknown; modelName?: unknown; role?: unknown; transportApi?: unknown; provider?: unknown; accessible?: unknown; claudeCodeModel?: unknown; claudeCodeEffort?: unknown };

function transportOf(row: Row): string {
  if (typeof row.transportApi === "string" && row.transportApi.length > 0) return row.transportApi;
  return row.provider === "anthropic" ? "anthropic-messages" : "openai-responses";
}

/** The roles in one `/desktop/api/models/available` answer (`{ code, data: [rows] }`), or undefined for anything else. */
export function parseSimeonModelRoles(body: unknown): SimeonModelRoles | undefined {
  const rows = (body as { data?: unknown } | null | undefined)?.data;
  if (!Array.isArray(rows)) return undefined;
  const holder = (role: string): string | undefined => {
    const row = (rows as Row[]).find((one) => one != null
      && one.role === role
      && typeof one.modelId === "string"
      && one.modelId.trim().length > 0
      && one.accessible !== false
      && FOLLOWED_TRANSPORTS.has(transportOf(one)));
    return typeof row?.modelId === "string" ? row.modelId.trim() : undefined;
  };
  const primary = holder("primary"), cheap = holder("cheap"), fallback = holder("fallback"), computer = holder("computer");
  const claude = (rows as Row[]).find((one) => one != null
    && one.role === "primary"
    && one.transportApi === CLAUDE_CODE_TRANSPORT
    && one.accessible !== false
    && typeof one.claudeCodeModel === "string"
    && CLAUDE_CODE_MODEL.test(one.claudeCodeModel.trim()));
  const claudeCode = typeof claude?.claudeCodeModel === "string" ? claude.claudeCodeModel.trim() : undefined;
  const claudeCodeEffort = typeof claude?.claudeCodeEffort === "string" && CLAUDE_CODE_EFFORTS.has(claude.claudeCodeEffort) ? claude.claudeCodeEffort : undefined;
  return {
    ...(primary === undefined ? {} : { primary }),
    ...(cheap === undefined ? {} : { cheap }),
    ...(fallback === undefined ? {} : { fallback }),
    ...(computer === undefined ? {} : { computer }),
    ...(claudeCode === undefined ? {} : { claudeCode }),
    ...(claudeCode === undefined || claudeCodeEffort === undefined ? {} : { claudeCodeEffort }),
  };
}

/** The roles' line in the host log; Claude Code named only when chosen. */
function rolesLine(roles: SimeonModelRoles): string {
  return `primary=${roles.primary ?? "-"} cheap=${roles.cheap ?? "-"} fallback=${roles.fallback ?? "-"} computer=${roles.computer ?? "-"}${roles.claudeCode === undefined ? "" : ` claudeCode=${roles.claudeCode}`}${roles.claudeCodeEffort === undefined ? "" : ` effort=${roles.claudeCodeEffort}`}`;
}

export interface SimeonModelRolesSource {
  readonly getAccessToken: () => Promise<string>;
  readonly backendUrl?: string;
  readonly fetch?: typeof fetch;
  /** The file the last roles read are kept in (`SIMEON_MODEL_ROLES_FILE`); none, nothing is kept. */
  readonly rememberIn?: string;
}

/** Roles as a file kept them: only the four names, each a non-empty string. */
function keptRoles(value: unknown): SimeonModelRoles | undefined {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const name = (key: string): string | undefined => typeof record[key] === "string" && (record[key] as string).trim().length > 0 ? (record[key] as string).trim() : undefined;
  const primary = name("primary"), cheap = name("cheap"), fallback = name("fallback"), computer = name("computer");
  const claude = name("claudeCode");
  const claudeCode = claude !== undefined && CLAUDE_CODE_MODEL.test(claude) ? claude : undefined;
  const effort = name("claudeCodeEffort");
  const claudeCodeEffort = effort !== undefined && CLAUDE_CODE_EFFORTS.has(effort) ? effort : undefined;
  return {
    ...(primary === undefined ? {} : { primary }),
    ...(cheap === undefined ? {} : { cheap }),
    ...(fallback === undefined ? {} : { fallback }),
    ...(computer === undefined ? {} : { computer }),
    ...(claudeCode === undefined ? {} : { claudeCode }),
    ...(claudeCode === undefined || claudeCodeEffort === undefined ? {} : { claudeCodeEffort }),
  };
}

let lastKept = "";

function keep(file: string, roles: SimeonModelRoles): void {
  const text = `${JSON.stringify(roles)}\n`;
  if (text === lastKept) return;
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text, { mode: 0o600 });
    lastKept = text;
  } catch (error) {
    note(`${HOST_LOG_PREFIX} model-roles not kept reason=${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * The roles the last read kept in `file`, taken as the current ones when
 * nothing has been read in this run yet; undefined when there is no such
 * file or it holds nothing usable (the defaults then hold).
 */
export function recallSimeonModelRoles(file: string): SimeonModelRoles | undefined {
  let roles: SimeonModelRoles | undefined;
  try { roles = keptRoles(JSON.parse(readFileSync(file, "utf8"))); } catch { return undefined; }
  if (roles === undefined) return undefined;
  if (Object.keys(current).length === 0) {
    current = roles;
    lastKept = `${JSON.stringify(roles)}\n`;
    note(`${HOST_LOG_PREFIX} model-roles remembered ${rolesLine(roles)}`);
  }
  return roles;
}

/** One read. Keeps the roles it had when the read fails; writes one line when they change. */
export async function refreshSimeonModelRoles(source: SimeonModelRolesSource): Promise<SimeonModelRoles | undefined> {
  try {
    const token = await source.getAccessToken();
    const response = await (source.fetch ?? fetch)(simeonApiUrl(SIMEON_MODEL_ROLES_PATH, source.backendUrl), {
      headers: { authorization: `Bearer ${token}`, accept: "application/json" },
      signal: AbortSignal.timeout(SIMEON_MODEL_ROLES_TIMEOUT_MS),
    });
    if (!response.ok) {
      note(`${HOST_LOG_PREFIX} model-roles unread status=${response.status}`);
      return undefined;
    }
    const body: unknown = await response.json();
    const roles = parseSimeonModelRoles(body);
    if (roles === undefined) {
      note(`${HOST_LOG_PREFIX} model-roles unread reason=not a model list`);
      return undefined;
    }
    current = roles;
    rememberSimeonModelNames(body);
    codingPrograms = parseSimeonCodingPrograms(body);
    lastReadAt = Date.now();
    if (source.rememberIn !== undefined) keep(source.rememberIn, roles);
    note(`${HOST_LOG_PREFIX} model-roles ${rolesLine(roles)}${codingPrograms.length === 0 ? "" : ` coding=${codingPrograms.map((one) => `${one.coder}:${one.model}`).join(",")}`}`);
    return roles;
  } catch (error) {
    note(`${HOST_LOG_PREFIX} model-roles unread reason=${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

/** Where the engine says Claude Code is signed out on this computer. */
export const CLAUDE_SIGNED_OUT_PATH = "models/accounts/claude/signed-out";

/**
 * Claude Code found itself signed out on this computer (9 November 2026):
 * the server is told, so the person's Claude account shows signed out (red,
 * with Connect Again) and is offered to the agents no more; then the roles
 * are read again, and the agents' turns go to Simeon's models without trying
 * Claude first, until the person connects it again. Until then the app went
 * on showing Claude as usable. True when the server took it.
 */
export async function reportClaudeCodeSignedOut(): Promise<boolean> {
  const source = liveSource;
  if (source === undefined) return false;
  try {
    const token = await source.getAccessToken();
    const response = await (source.fetch ?? fetch)(simeonApiUrl(CLAUDE_SIGNED_OUT_PATH, source.backendUrl), {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, accept: "application/json", "content-type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(SIMEON_MODEL_ROLES_TIMEOUT_MS),
    });
    note(`${HOST_LOG_PREFIX} claude-code signed-out reported status=${response.status}`);
    if (!response.ok) return false;
    await refreshSimeonModelRoles(source);
    return true;
  } catch (error) {
    note(`${HOST_LOG_PREFIX} claude-code signed-out unreported reason=${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

/** Where the engine says how much of the Claude plan is used. */
export const CLAUDE_USAGE_PATH = "models/accounts/claude/usage";
/** The same usage is told again only after this long. */
export const CLAUDE_USAGE_AGAIN_MS = 15 * 60_000;
let lastUsage: { readonly said: string; readonly at: number } | undefined;

/**
 * How much of the Claude plan is used, as Claude Code said it in a turn (9
 * November 2026, the founder: "we need the usage for both claude and chat
 * gpt"): the server keeps it on the person's Claude account, and the apps
 * show it in AI Models like Usage & Billing. Told when it changes (each
 * window to the whole percent), else at most every fifteen minutes. True
 * when the server took it.
 */
export async function reportClaudeCodeUsage(
  windows: readonly { readonly kind: string; readonly usedPercent: number; readonly resetsAt?: number | undefined }[],
  now: number = Date.now(),
): Promise<boolean> {
  const source = liveSource;
  if (source === undefined || windows.length === 0) return false;
  const said = windows.map((one) => `${one.kind}=${Math.round(one.usedPercent)}`).join(",");
  if (lastUsage !== undefined && lastUsage.said === said && now - lastUsage.at < CLAUDE_USAGE_AGAIN_MS) return false;
  lastUsage = { said, at: now };
  try {
    const token = await source.getAccessToken();
    const response = await (source.fetch ?? fetch)(simeonApiUrl(CLAUDE_USAGE_PATH, source.backendUrl), {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({ windows: windows.map((one) => ({ kind: one.kind, usedPercent: one.usedPercent, resetsAt: one.resetsAt ?? null })) }),
      signal: AbortSignal.timeout(SIMEON_MODEL_ROLES_TIMEOUT_MS),
    });
    note(`${HOST_LOG_PREFIX} claude-code usage reported ${said} status=${response.status}`);
    if (!response.ok) lastUsage = undefined;
    return response.ok;
  } catch (error) {
    lastUsage = undefined;
    note(`${HOST_LOG_PREFIX} claude-code usage unreported reason=${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

/** Forgets the last usage told (tests). */
export function resetClaudeCodeUsageForTest(): void {
  lastUsage = undefined;
}

// A line when something changes, not every five minutes.
function note(line: string): void {
  if (line === lastLogged) return;
  lastLogged = line;
  logHostLine(line);
}

// After a failed read (the box's sign-in not there yet, the server
// redeploying), the next try comes sooner than the next five minutes; much
// sooner while this run has read nothing yet.
export const SIMEON_MODEL_ROLES_RETRY_MS = 30_000;
export const SIMEON_MODEL_ROLES_FIRST_RETRY_MS = 5_000;

/**
 * Takes back the kept roles, reads now, then every five minutes (five
 * seconds after a failed read until one succeeds, thirty after that); the
 * returned function stops it.
 */
export function startSimeonModelRoles(source: SimeonModelRolesSource): () => void {
  liveSource = source;
  let stopped = false;
  let readOnce = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  if (source.rememberIn !== undefined) rolesAtStart = recallSimeonModelRoles(source.rememberIn);
  const tick = async (): Promise<void> => {
    const read = await refreshSimeonModelRoles(source);
    if (stopped) return;
    if (read !== undefined) readOnce = true;
    timer = setTimeout(() => void tick(), read !== undefined ? SIMEON_MODEL_ROLES_REFRESH_MS : readOnce ? SIMEON_MODEL_ROLES_RETRY_MS : SIMEON_MODEL_ROLES_FIRST_RETRY_MS);
    timer.unref?.();
  };
  void tick();
  return () => { stopped = true; if (timer !== undefined) clearTimeout(timer); };
}
