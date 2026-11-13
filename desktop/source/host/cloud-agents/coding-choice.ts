/**
 * The model and the effort a cloud agent's coding runs on (11 November 2026):
 * the ones the person chose for Claude in AI Models and on the composer, on
 * their own Claude plan; none when Claude isn't their choice, and then the
 * coding doesn't start (`cloud-agents-service.ts`, `codingReady`).
 */
import { simeonModelRoles } from "../extensions/inference/simeon-model-roles.js";

/**
 * The program that codes for a cloud agent, by the name the Simeon Network
 * gives it (the server's `network.KINDS`): Claude Code, the only one a cloud
 * agent runs in today; "codex" once one can run in Codex. The apps draw its
 * mascot where the cloud agent's picture would be (13 November 2026, the
 * founder: "it should be whatever agent is used. either claude code or
 * codex"), so it travels with the cloud agent's state, its conversation and
 * its line in the chat (`coder`).
 */
export type CloudAgentCoder = "claude-code" | "codex";
export const CLOUD_AGENT_CODER: CloudAgentCoder = "claude-code";

export function claudeCodingChoice(): { readonly model: string; readonly effort?: string } | undefined {
  const roles = simeonModelRoles();
  if (roles.claudeCode === undefined) return undefined;
  return { model: roles.claudeCode, ...(roles.claudeCodeEffort === undefined ? {} : { effort: roles.claudeCodeEffort }) };
}
