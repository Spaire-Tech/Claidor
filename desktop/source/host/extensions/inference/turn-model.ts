/**
 * The model an agent's turn is on, and the chat's line when it changes (10
 * November 2026, the founder: "whenever a model is changed, i want this to
 * fire in the chat. that at least tells us that it's working").
 *
 * Before each of an agent's own turns (a message, a routine, a wake; never a
 * subagent's, a shared room's or a box-scoped helper's), once the model the
 * person chose has been read again (`refreshSimeonModelRolesBeforeTurn`),
 * the turn's model is compared with the one that agent's last turn was on.
 * When it differs, one line goes in that agent's chat: "Changed from ⌘
 * Simeon to ✳ Claude Opus 5.5". The apps draw it with each provider's mark;
 * the line is an `event` in the chat's own log (`model-changed`), which the
 * model never reads, and it wakes no one.
 *
 * The turn's model is the person's choice as the server names it: the
 * Claude plan's row (Claude Code), else the primary when it is one of the
 * person's own (`own:<provider>:<model>`), else Simeon's, whichever of
 * Simeon's models that is (a change of Simeon's own model is not the
 * person's, and no line says it). A turn Claude Code can't take falls to
 * Simeon's for that turn, with its own line (`claude-code-notice.ts`); the
 * choice is still Claude, so no line flips back and forth.
 *
 * Each agent's last model is kept on the box's data volume
 * (`model-seen.json`). An agent this file doesn't know yet, at its first
 * turn on this engine, is compared with the model the computer was last on
 * before the engine started (the roles its last run kept,
 * `simeonModelRolesAtStart`), when the agent was there then: the founder
 * switched from the Claude plan to an Anthropic key and sent the first
 * message the new engine ran, and saw no line, since that first turn was
 * only remembered. An agent made since the engine started, or a computer
 * that kept no roles, is only remembered: no line until its model really
 * changes.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { readSimeonEnv } from "../../../shared/inference-router.js";
import { HOST_LOG_PREFIX, logHostLine } from "../../../shared/host-log.js";
import { simeonClaudeCodeModelId, simeonModelName, simeonModelRoles, simeonModelRolesAtStart, type SimeonModelRoles } from "./simeon-model-roles.js";

/** One side of the line: the person's model (its id, its name, its provider), or Simeon's (no id, no provider). */
export interface TurnModel {
  readonly model: string | null;
  readonly name: string;
  readonly provider: string | null;
}

/** The event the chat keeps: `{ type: "model-changed", from, to }`. */
export interface ModelChangedEvent {
  readonly type: "model-changed";
  readonly from: TurnModel;
  readonly to: TurnModel;
}

export const SIMEON_TURN_MODEL: TurnModel = { model: null, name: "Simeon", provider: null };
/** The file, in the box's data root, that keeps each agent's last model. */
export const TURN_MODELS_FILE = "model-seen.json";
/** The longest a turn waits for its line to be written. */
export const TURN_MODEL_LINE_WAIT_MS = 1_000;

const OWN = /^own:([a-z0-9]{1,20}):(.{1,200})$/;
const NUMBER = /^\d+(\.\d+)*$/;
const CAPITALS = new Set(["gpt", "glm", "oss", "ai"]);

/**
 * A model's name from its id when the server named none (a model it no
 * longer lists, such as the Claude plan's once a key is chosen):
 * `claude-opus-5-5` reads "Claude Opus 5.5", `deepseek-v4-pro` "Deepseek V4
 * Pro", `gpt-6.1-sol` "GPT 6.1 Sol".
 */
export function readableModelName(slug: string): string {
  const words: string[] = [];
  for (const part of slug.trim().split(/[-_\s]+/).filter((one) => one !== "")) {
    const last = words.at(-1);
    if (last !== undefined && NUMBER.test(last) && NUMBER.test(part)) words[words.length - 1] = `${last}.${part}`;
    else words.push(part);
  }
  const name = words.map((word) => (CAPITALS.has(word.toLowerCase()) ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1))).join(" ");
  return (name === "" ? slug : name).slice(0, 80);
}

/**
 * The turn's model from the roles: the Claude plan's (Claude Code), else the
 * primary when it is the person's own, else Simeon's. `primary` is the model
 * the engine answers on (`configuredSimeonModel`: the environment's, else the
 * server's), `name` a model's name as the server gave it, `claudeCodeModelId`
 * the Claude Code row's id as the server gave it (null: none, the id made
 * from the roles, as the server makes it: `own:claude:<slug>`).
 */
export function turnModelOf(
  roles: SimeonModelRoles,
  primary: string | undefined,
  name: (modelId: string) => string | undefined = simeonModelName,
  claudeCodeModelId: string | null = simeonClaudeCodeModelId() ?? null,
): TurnModel {
  if (roles.claudeCode !== undefined) {
    const model = claudeCodeModelId ?? `own:claude:${roles.claudeCode}`;
    const readable = readableModelName(roles.claudeCode);
    return { model, name: name(model) ?? (/^claude\b/i.test(readable) ? readable : `Claude ${readable}`), provider: "claude" };
  }
  const model = primary?.trim() ?? "";
  const own = OWN.exec(model);
  const provider = own?.[1];
  if (provider === undefined) return SIMEON_TURN_MODEL;
  return { model, name: name(model) ?? readableModelName(own?.[2] ?? model), provider };
}

function primaryOf(roles: SimeonModelRoles): string | undefined {
  return readSimeonEnv(process.env, "SAND_SIMEON_MODEL")?.trim() || roles.primary;
}

/** The turn's model now: the roles read last, the primary as the engine takes it. */
export function currentTurnModel(): TurnModel {
  const roles = simeonModelRoles();
  return turnModelOf(roles, primaryOf(roles));
}

/** The model the computer was last on before this engine started (the roles its last run kept); undefined when none was kept. */
export function turnModelAtStart(): TurnModel | undefined {
  const roles = simeonModelRolesAtStart();
  return roles === undefined ? undefined : turnModelOf(roles, primaryOf(roles), simeonModelName, null);
}

/** What the computer had before this engine started: the model it was last on, and its agents then. */
export interface TurnModelsBefore {
  readonly model: () => TurnModel | undefined;
  readonly agents: Promise<readonly string[]>;
}

function same(a: TurnModel, b: TurnModel): boolean {
  return a.model === b.model;
}

function remembered(value: unknown): TurnModel | undefined {
  if (value == null || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const model = typeof record.model === "string" && record.model.length > 0 ? record.model : null;
  const name = typeof record.name === "string" && record.name.trim() !== "" ? record.name.trim().slice(0, 80) : undefined;
  const provider = typeof record.provider === "string" && /^[a-z0-9]{1,20}$/.test(record.provider) ? record.provider : null;
  if (name === undefined) return undefined;
  return model === null ? SIMEON_TURN_MODEL : { model, name, provider };
}

/**
 * Each agent's last model, kept in `file` (none: only in memory), and the
 * line written when an agent's turn is on another one.
 */
export class TurnModels {
  private seen: Map<string, TurnModel> | undefined;

  constructor(
    private readonly file: string | undefined,
    private readonly write: (agentId: string, event: ModelChangedEvent) => Promise<void> | void,
    private readonly log: (line: string) => void = (line) => logHostLine(`${HOST_LOG_PREFIX} ${line}`),
    private readonly before?: TurnModelsBefore,
  ) {}

  /** An agent the file doesn't know: the model the computer was last on, when the agent was there before this engine started. */
  private async lastBefore(agentId: string): Promise<TurnModel | undefined> {
    const before = this.before;
    if (before === undefined) return undefined;
    const model = before.model();
    if (model === undefined) return undefined;
    const agents = await before.agents.catch((): readonly string[] => []);
    return agents.includes(agentId) ? model : undefined;
  }

  private load(): Map<string, TurnModel> {
    if (this.seen !== undefined) return this.seen;
    const seen = new Map<string, TurnModel>();
    if (this.file !== undefined) {
      try {
        const kept = JSON.parse(readFileSync(this.file, "utf8")) as unknown;
        if (kept != null && typeof kept === "object" && !Array.isArray(kept)) {
          for (const [agentId, value] of Object.entries(kept as Record<string, unknown>)) {
            const model = remembered(value);
            if (model !== undefined) seen.set(agentId, model);
          }
        }
      } catch { /* no file yet, or unreadable: every agent is seen afresh */ }
    }
    this.seen = seen;
    return seen;
  }

  private keep(): void {
    if (this.file === undefined || this.seen === undefined) return;
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      writeFileSync(this.file, `${JSON.stringify(Object.fromEntries(this.seen))}\n`, { mode: 0o600 });
    } catch (error) {
      this.log(`model-changed not kept reason=${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * The model of `agentId`'s turn: remembered, and when the agent's last
   * turn was on another, the line written in its chat. True when it was.
   */
  async note(agentId: string, model: TurnModel): Promise<boolean> {
    if (agentId.trim() === "") return false;
    const seen = this.load();
    const kept = seen.get(agentId);
    const last = kept ?? await this.lastBefore(agentId);
    if (last !== undefined && same(last, model)) {
      // The same model, perhaps named better now (a key's own list): kept as named last.
      if (kept === undefined || kept.name !== model.name) { seen.set(agentId, model); this.keep(); }
      return false;
    }
    seen.set(agentId, model);
    this.keep();
    if (last === undefined) return false;
    const event: ModelChangedEvent = { type: "model-changed", from: last, to: model };
    this.log(`model-changed agent=${agentId} from=${last.model ?? "simeon"} to=${model.model ?? "simeon"}`);
    await this.write(agentId, event);
    return true;
  }
}

let writeLine: ((agentId: string, event: ModelChangedEvent) => Promise<void> | void) | undefined;
let models: TurnModels | undefined;
let modelsFile: string | undefined;
let modelsBefore: TurnModelsBefore | undefined;

/**
 * Where the line goes (the chat's, `model-change-line.ts`), where each
 * agent's last model is kept, and the agents there are as the engine starts
 * (read at once, so an agent made later is not taken for one that was
 * there); set when the transcript starts.
 */
export function setTurnModelLine(
  write: ((agentId: string, event: ModelChangedEvent) => Promise<void> | void) | undefined,
  file?: string,
  agentsAtStart?: () => Promise<readonly string[]> | readonly string[],
): void {
  writeLine = write;
  modelsFile = file;
  models = undefined;
  modelsBefore = agentsAtStart === undefined
    ? undefined
    : { model: turnModelAtStart, agents: Promise.resolve().then(agentsAtStart).catch((): readonly string[] => []) };
}

/**
 * Before an agent's own turn: its model noted, and the line written when it
 * changed. Never in the turn's way: it waits at most a second, and nothing
 * it does can fail the turn.
 */
export async function noteTurnModel(agentId: string, model: TurnModel = currentTurnModel()): Promise<void> {
  const write = writeLine;
  if (write === undefined) return;
  models ??= new TurnModels(modelsFile, (id, event) => write(id, event), undefined, modelsBefore);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      models.note(agentId, model),
      new Promise<void>((resolve) => { timer = setTimeout(resolve, TURN_MODEL_LINE_WAIT_MS); }),
    ]);
  } catch (error) {
    logHostLine(`${HOST_LOG_PREFIX} model-changed unwritten reason=${error instanceof Error ? error.message : String(error)}`);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
