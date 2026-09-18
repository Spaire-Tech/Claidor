/**
 * The managed brief: every section of prose the agent reads, in modules.
 *
 * `syncAgentsMd` in `openclawConfigSync.ts` imports from here and decides
 * the order they are assembled in; nothing here knows about the engine
 * config, and nothing in the engine config states a rule.
 */

import { buildManagedAppUiPrompt } from './appUi';
import { MANAGED_BROWSER_POLICY_PROMPT } from './browser';
import { MANAGED_CONVERSATION_PROMPT } from './conversation';
import { MANAGED_DELIVERABLE_LINKS_PROMPT } from './documents';
import { MANAGED_ESCALATION_PROMPT } from './escalation';
import { MANAGED_EXEC_SAFETY_PROMPT } from './execSafety';
import { MANAGED_HEARTBEAT_POLICY_PROMPT } from './heartbeat';
import { MANAGED_IDENTITY_PROMPT } from './identity';
import { MANAGED_MATH_FORMAT_PROMPT } from './mathFormat';
import { MANAGED_MEMORY_POLICY_PROMPT } from './memory';
import { buildManagedPersonPrompt } from './person';
import { buildManagedProjectsPrompt } from './projects';
import { buildManagedSkillCreationPrompt } from './skills';
import { MANAGED_WEB_SEARCH_POLICY_PROMPT } from './webSearch';

export {
  buildManagedAppUiPrompt,
  buildManagedPersonPrompt,
  buildManagedProjectsPrompt,
  buildManagedSkillCreationPrompt,
  MANAGED_BROWSER_POLICY_PROMPT,
  MANAGED_CONVERSATION_PROMPT,
  MANAGED_DELIVERABLE_LINKS_PROMPT,
  MANAGED_ESCALATION_PROMPT,
  MANAGED_EXEC_SAFETY_PROMPT,
  MANAGED_HEARTBEAT_POLICY_PROMPT,
  MANAGED_IDENTITY_PROMPT,
  MANAGED_MATH_FORMAT_PROMPT,
  MANAGED_MEMORY_POLICY_PROMPT,
  MANAGED_WEB_SEARCH_POLICY_PROMPT,
};

/**
 * The managed prose sections, for `briefConsistency.test.ts`.
 *
 * Only the ones that state behaviour: the generated component
 * signatures and the per-install sections (projects, skills paths,
 * scheduled tasks) carry no rules to contradict. Kept next to the
 * constants so a new prose section is one line away from being checked
 * for arguing with the rest.
 */
export const managedBriefSectionsForTest = (): readonly string[] => [
  MANAGED_IDENTITY_PROMPT,
  MANAGED_CONVERSATION_PROMPT,
  MANAGED_ESCALATION_PROMPT,
  MANAGED_WEB_SEARCH_POLICY_PROMPT,
  MANAGED_BROWSER_POLICY_PROMPT,
  MANAGED_EXEC_SAFETY_PROMPT,
  MANAGED_DELIVERABLE_LINKS_PROMPT,
  MANAGED_MEMORY_POLICY_PROMPT,
];
