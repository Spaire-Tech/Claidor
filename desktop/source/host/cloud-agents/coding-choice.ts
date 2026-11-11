/**
 * The model and the effort a cloud agent's coding runs on (11 November 2026):
 * the ones the person chose for Claude in AI Models and on the composer, on
 * their own Claude plan; none when Claude isn't their choice, and then the
 * coding doesn't start (`cloud-agents-service.ts`, `codingReady`).
 */
import { simeonModelRoles } from "../extensions/inference/simeon-model-roles.js";

export function claudeCodingChoice(): { readonly model: string; readonly effort?: string } | undefined {
  const roles = simeonModelRoles();
  if (roles.claudeCode === undefined) return undefined;
  return { model: roles.claudeCode, ...(roles.claudeCodeEffort === undefined ? {} : { effort: roles.claudeCodeEffort }) };
}
