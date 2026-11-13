/**
 * The program, the model and the effort a cloud agent's coding runs on.
 *
 * Until 13 November 2026 a cloud agent ran in Claude Code alone, and only
 * while Claude was the person's chosen model (11 November 2026). The founder
 * then asked for Codex beside it ("running one in Codex is not built"), and
 * for both to be offered when neither is connected. The rule now:
 *
 * - the server lists the programs connected, the one to take first
 *   (`simeonCodingPrograms`): Claude Code when Claude is signed in on this
 *   computer, Codex when ChatGPT is connected; the program of the model the
 *   person chose for their agents comes first, on that model and effort;
 * - a cloud agent keeps the program it began in while that one is still
 *   connected (its session is that program's), else takes the first;
 * - none connected, the coding doesn't start and the chat offers both
 *   (`cloud-agents-service.ts`, `codingReady`).
 *
 * A server that lists no programs yet (an older one) still has a person on
 * Claude run in Claude Code, as before (`claudeCodingChoice`).
 *
 * Cursor's own command-line agent is the third (13 November 2026, the
 * founder: "Cursor now"). It is signed in on this computer with Cursor's own
 * program (`cursor/cursor-account.ts`), not on the server, so the engine
 * adds it to the server's list itself, after the others, while that sign-in
 * is there. It runs on the model the person's Cursor account uses. A launch
 * that names a program (`CloudAgent`'s `program`) takes that one.
 */
import { simeonClaudeCodeModelId, simeonCodingPrograms, simeonModelRoles } from "../extensions/inference/simeon-model-roles.js";
import { cursorConnected } from "../cursor/cursor-account.js";

/**
 * The program that codes for a cloud agent, by the name the Simeon Network
 * gives it (the server's `network.KINDS`): Claude Code, Codex, or Cursor. The apps
 * draw its mascot where the cloud agent's picture would be (13 November
 * 2026, the founder: "it should be whatever agent is used. either claude
 * code or codex"), so it travels with the cloud agent's state, its
 * conversation and its line in the chat (`coder`).
 */
export type CloudAgentCoder = "claude-code" | "codex" | "cursor";
export const CLOUD_AGENT_CODERS: readonly CloudAgentCoder[] = ["claude-code", "codex", "cursor"];
/** The model a cloud agent in Cursor is kept under: Cursor's own choice (the engine names none). */
export const CURSOR_MODEL_ID = "own:cursor:auto";
/** The program of a cloud agent whose own isn't known: every one before Codex ran in Claude Code. */
export const CLOUD_AGENT_CODER: CloudAgentCoder = "claude-code";

export interface CodingChoice {
  readonly coder: CloudAgentCoder;
  /** The model as the program names it (`--model`, `-m`). */
  readonly model: string;
  readonly effort?: string;
  /** The model as Simeon names it (`own:claude:…`, `own:chatgpt:…`); the server keeps it with the cloud agent. */
  readonly modelId?: string;
}

/** The program's own name, as the person reads it. */
export function coderName(coder: CloudAgentCoder): string {
  return coder === "codex" ? "Codex" : coder === "cursor" ? "Cursor" : "Claude Code";
}

/** Whose plan the program runs on, as the person reads it. */
export function coderPlan(coder: CloudAgentCoder): string {
  return coder === "codex" ? "ChatGPT" : coder === "cursor" ? "Cursor" : "Claude";
}

/** The provider a program is connected as on the chat's card (`model-connect`). */
export function coderProvider(coder: CloudAgentCoder): "claude" | "chatgpt" | "cursor" {
  return coder === "codex" ? "chatgpt" : coder === "cursor" ? "cursor" : "claude";
}

/** The program a model codes in: Codex for a ChatGPT model (`own:chatgpt:…`), Cursor for Cursor's (`own:cursor:…`), Claude Code otherwise. */
export function coderOfModel(modelId: string | undefined | null): CloudAgentCoder {
  const id = typeof modelId === "string" ? modelId.trim() : "";
  return id.startsWith("own:chatgpt:") ? "codex" : id.startsWith("own:cursor:") ? "cursor" : CLOUD_AGENT_CODER;
}

export function claudeCodingChoice(): { readonly model: string; readonly effort?: string } | undefined {
  const roles = simeonModelRoles();
  if (roles.claudeCode === undefined) return undefined;
  return { model: roles.claudeCode, ...(roles.claudeCodeEffort === undefined ? {} : { effort: roles.claudeCodeEffort }) };
}

/** Every program the coding may run in now, the one to take first; `cursor`, whether Cursor is signed in on this computer. */
export function codingChoices(cursor: boolean = cursorConnected()): CodingChoice[] {
  const choices: CodingChoice[] = simeonCodingPrograms().map((one) => ({ coder: one.coder, model: one.model, ...(one.effort === undefined ? {} : { effort: one.effort }), modelId: one.modelId }));
  if (choices.length === 0) {
    const claude = claudeCodingChoice();
    const modelId = simeonClaudeCodeModelId();
    if (claude !== undefined) choices.push({ coder: "claude-code", ...claude, ...(modelId === undefined ? {} : { modelId }) });
  }
  // Cursor names its own model: none is given to it (`cursor-turn.ts`).
  if (cursor) choices.push({ coder: "cursor", model: "auto", modelId: CURSOR_MODEL_ID });
  return choices;
}

/**
 * What a cloud agent's coding runs on now: the program it began in (`kept`)
 * while that one is still connected, else the first; none when no program
 * is connected.
 */
export function codingChoice(kept?: CloudAgentCoder): CodingChoice | undefined {
  const choices = codingChoices();
  return (kept === undefined ? undefined : choices.find((one) => one.coder === kept)) ?? choices[0];
}

/** `program` itself when it is connected now; none otherwise (a launch that named it shows its card). */
export function codingChoiceOf(program: CloudAgentCoder): CodingChoice | undefined {
  return codingChoices().find((one) => one.coder === program);
}
