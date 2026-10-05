import { CursorRuleSource as AgentRuleSource, type CursorRule as AgentRule } from "../../proto/generated/agent/v1/cursor_rules_pb.js";
import { filterByAgentEnvironment } from "../utils/environment-filtering.js";
import { isFileScopedAgentRule } from "../utils/rule-matching.js";
import { AgentType } from "../utils/agent-config.js";
import { hasDisableModelInvocation, isSkillPath } from "./user-info-rule-helpers.js";

export interface CategorizedAgentRules {
  readonly globalRules: AgentRule[];
  readonly agentRequestableRules: AgentRule[];
  readonly userRules: AgentRule[];
  readonly skills: AgentRule[];
}

// Extracted from ../packages/agent/dist/prompts/user-info.js as an
// uncomposed owner leaf. Prompt composition remains separate.
export function categorizeAgentRules(
  agentRules: AgentRule[],
  workspacePaths: readonly string[] = [],
  agentType?: AgentType,
): CategorizedAgentRules {
  const filteredRules = filterByAgentEnvironment(agentRules, agentType);
  const globalRules: AgentRule[] = [];
  const agentRequestableRules: AgentRule[] = [];
  const userRules: AgentRule[] = [];
  const skills: AgentRule[] = [];
  for (const rule of filteredRules) {
    const mdcPath = rule.fullPath;
    if (isSkillPath(mdcPath)) {
      if (rule.type?.type.case === "global") {
        globalRules.push(rule);
      } else if (!hasDisableModelInvocation(rule)) {
        skills.push(rule);
      }
      continue;
    }
    if (rule.source === AgentRuleSource.USER) {
      userRules.push(rule);
      continue;
    }
    if (rule.source === AgentRuleSource.TEAM) {
      globalRules.push(rule);
      continue;
    }
    if (rule.type?.type.case === "manuallyAttached") {
      continue;
    }
    if (rule.type?.type.case !== "global") {
      agentRequestableRules.push(rule);
      continue;
    }
    if (isFileScopedAgentRule(rule, workspacePaths)) {
      agentRequestableRules.push(rule);
    } else {
      globalRules.push(rule);
    }
  }
  return { globalRules, agentRequestableRules, userRules, skills };
}
