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
}

export const SIMEON_MODEL_ROLES_PATH = "models/available";
export const SIMEON_MODEL_ROLES_REFRESH_MS = 5 * 60_000;
const SIMEON_MODEL_ROLES_TIMEOUT_MS = 15_000;
/** The file, in the box's data root, that keeps the last roles read. */
export const SIMEON_MODEL_ROLES_FILE = "model-roles.json";

// The wires this engine writes for the loop. A role on any other wire is not
// one it can follow, and is left to the defaults.
const FOLLOWED_TRANSPORTS: ReadonlySet<string> = new Set(["openai-responses", "anthropic-messages"]);

let current: SimeonModelRoles = {};
let lastLogged = "";

export function simeonModelRoles(): SimeonModelRoles {
  return current;
}

export function setSimeonModelRolesForTest(roles: SimeonModelRoles): void {
  current = { ...roles };
  lastLogged = "";
  lastKept = "";
}

type Row = { modelId?: unknown; role?: unknown; transportApi?: unknown; provider?: unknown; accessible?: unknown };

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
  const primary = holder("primary"), cheap = holder("cheap"), fallback = holder("fallback");
  return {
    ...(primary === undefined ? {} : { primary }),
    ...(cheap === undefined ? {} : { cheap }),
    ...(fallback === undefined ? {} : { fallback }),
  };
}

export interface SimeonModelRolesSource {
  readonly getAccessToken: () => Promise<string>;
  readonly backendUrl?: string;
  readonly fetch?: typeof fetch;
  /** The file the last roles read are kept in (`SIMEON_MODEL_ROLES_FILE`); none, nothing is kept. */
  readonly rememberIn?: string;
}

/** Roles as a file kept them: only the three names, each a non-empty string. */
function keptRoles(value: unknown): SimeonModelRoles | undefined {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const name = (key: string): string | undefined => typeof record[key] === "string" && (record[key] as string).trim().length > 0 ? (record[key] as string).trim() : undefined;
  const primary = name("primary"), cheap = name("cheap"), fallback = name("fallback");
  return {
    ...(primary === undefined ? {} : { primary }),
    ...(cheap === undefined ? {} : { cheap }),
    ...(fallback === undefined ? {} : { fallback }),
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
    note(`${HOST_LOG_PREFIX} model-roles remembered primary=${roles.primary ?? "-"} cheap=${roles.cheap ?? "-"} fallback=${roles.fallback ?? "-"}`);
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
    const roles = parseSimeonModelRoles(await response.json());
    if (roles === undefined) {
      note(`${HOST_LOG_PREFIX} model-roles unread reason=not a model list`);
      return undefined;
    }
    current = roles;
    if (source.rememberIn !== undefined) keep(source.rememberIn, roles);
    note(`${HOST_LOG_PREFIX} model-roles primary=${roles.primary ?? "-"} cheap=${roles.cheap ?? "-"} fallback=${roles.fallback ?? "-"}`);
    return roles;
  } catch (error) {
    note(`${HOST_LOG_PREFIX} model-roles unread reason=${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
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
  let stopped = false;
  let readOnce = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  if (source.rememberIn !== undefined) recallSimeonModelRoles(source.rememberIn);
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
