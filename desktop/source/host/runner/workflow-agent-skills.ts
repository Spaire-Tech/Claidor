/**
 * The agent's skills, from its workflow library (26 September 2026,
 * ledger F-050 and F-183).
 *
 * A workflow with no trigger is a skill: a `SKILL.md` in the shared
 * library that the agent may read and follow (`shared/workflow-model.ts`,
 * `agentSkillsFromWorkflows`, which already applies the design's limits:
 * managed and plugin skills first, only those enabled for the agent, none
 * that disables model invocation). The loop's request context carries them
 * as `agentSkills` (`agent-adapters.ts`, `SandRequestContextExecutor`), the
 * prompt lists them with the Read tool as the way in
 * (`packages/agent/prompts/user-info-available-skills.ts`), and Read serves
 * a `SKILL.md` as a skill. Until today the production composition never
 * supplied `resolveAgentSkills`, so the list was empty on every turn and
 * `agentSkillsFromWorkflows` had no caller.
 */
import { AgentSkill } from "../../packages/proto/generated/agent/v1/agent_skills_pb.js";
import { agentSkillsFromWorkflows, type WorkflowRecord } from "../../shared/workflow-model.js";

export interface WorkflowStoreLike {
  list(): readonly WorkflowRecord[];
}

function isWorkflowStore(value: unknown): value is WorkflowStoreLike {
  return typeof value === "object" && value !== null && typeof (value as { list?: unknown }).list === "function";
}

/** The skills the session's workflow store holds, as the loop reads them; an absent or failing store is no skills. */
export function agentSkillsFromWorkflowStore(store: unknown): AgentSkill[] {
  if (!isWorkflowStore(store)) return [];
  let workflows: readonly WorkflowRecord[];
  try {
    workflows = store.list();
  } catch {
    return [];
  }
  return agentSkillsFromWorkflows(workflows).map((skill) => new AgentSkill({ fullPath: skill.fullPath, description: skill.description }));
}
