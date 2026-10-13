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
 */
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
// redeploying), the next try comes sooner than the next five minutes.
export const SIMEON_MODEL_ROLES_RETRY_MS = 30_000;

/** Reads now, then every five minutes (thirty seconds after a failed read); the returned function stops it. */
export function startSimeonModelRoles(source: SimeonModelRolesSource): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const tick = async (): Promise<void> => {
    const read = await refreshSimeonModelRoles(source);
    if (stopped) return;
    timer = setTimeout(() => void tick(), read === undefined ? SIMEON_MODEL_ROLES_RETRY_MS : SIMEON_MODEL_ROLES_REFRESH_MS);
    timer.unref?.();
  };
  void tick();
  return () => { stopped = true; if (timer !== undefined) clearTimeout(timer); };
}
