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
 */
import { simeonClaudeCodeModelId, simeonCodingPrograms, simeonModelRoles } from "../extensions/inference/simeon-model-roles.js";

/**
 * The program that codes for a cloud agent, by the name the Simeon Network
 * gives it (the server's `network.KINDS`): Claude Code, or Codex. The apps
 * draw its mascot where the cloud agent's picture would be (13 November
 * 2026, the founder: "it should be whatever agent is used. either claude
 * code or codex"), so it travels with the cloud agent's state, its
 * conversation and its line in the chat (`coder`).
 */
export type CloudAgentCoder = "claude-code" | "codex";
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
  return coder === "codex" ? "Codex" : "Claude Code";
}

/** Whose plan the program runs on, as the person reads it. */
export function coderPlan(coder: CloudAgentCoder): string {
  return coder === "codex" ? "ChatGPT" : "Claude";
}

/** The program a model codes in: Codex for a ChatGPT model (`own:chatgpt:…`), Claude Code otherwise. */
export function coderOfModel(modelId: string | undefined | null): CloudAgentCoder {
  return typeof modelId === "string" && modelId.trim().startsWith("own:chatgpt:") ? "codex" : CLOUD_AGENT_CODER;
}

export function claudeCodingChoice(): { readonly model: string; readonly effort?: string } | undefined {
  const roles = simeonModelRoles();
  if (roles.claudeCode === undefined) return undefined;
  return { model: roles.claudeCode, ...(roles.claudeCodeEffort === undefined ? {} : { effort: roles.claudeCodeEffort }) };
}

/** Every program the coding may run in now, the one to take first. */
export function codingChoices(): CodingChoice[] {
  const listed = simeonCodingPrograms();
  if (listed.length > 0) return listed.map((one) => ({ coder: one.coder, model: one.model, ...(one.effort === undefined ? {} : { effort: one.effort }), modelId: one.modelId }));
  const claude = claudeCodingChoice();
  if (claude === undefined) return [];
  const modelId = simeonClaudeCodeModelId();
  return [{ coder: "claude-code", ...claude, ...(modelId === undefined ? {} : { modelId }) }];
}

/**
 * What a cloud agent's coding runs on now: the program it began in (`kept`)
 * while that one is still connected, else the first; none when neither
 * Claude nor ChatGPT is connected.
 */
export function codingChoice(kept?: CloudAgentCoder): CodingChoice | undefined {
  const choices = codingChoices();
  return (kept === undefined ? undefined : choices.find((one) => one.coder === kept)) ?? choices[0];
}
