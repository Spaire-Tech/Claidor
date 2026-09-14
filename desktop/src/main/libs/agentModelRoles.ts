import { type ModelRole, ModelRole as Role } from '../../shared/providers';

/**
 * Turning the server's model roles into the refs OpenClaw's agent config
 * wants.
 *
 * The policy is one model the person talks to and cheap ones for machinery
 * they never see. The engine already has a slot for each piece of that
 * machinery — sub-agents, compaction, the pre-compaction memory flush and
 * heartbeats — so none of it needs building; it needs filling in.
 *
 * The server decides which model holds which role, so the policy changes
 * with a deploy rather than a release. Nothing here names a model.
 */

/** A `provider/model` reference, as OpenClaw's config spells one. */
export type ModelRef = string;

export interface AgentModelRoleRefs {
  /** Every reply the person reads. */
  primary?: ModelRef;
  /** Sub-agents, compaction, the memory flush, heartbeats. */
  cheap?: ModelRef;
  /** Answers when the primary's provider is down. */
  fallback?: ModelRef;
}

export interface RoledServerModel {
  modelId: string;
  role?: ModelRole;
}

/**
 * The first model the server offers for each role, as a `provider/model`
 * ref. A role the server sent no model for is simply absent: writing a ref
 * to a model the engine has not been given would fail at the moment it was
 * needed, which for the fallback is the worst possible moment.
 *
 * First rather than last, and deliberately: if a future catalogue ever
 * carried two models in one role, the order the server sent them in is the
 * only thing expressing a preference.
 */
export function resolveAgentModelRoleRefs(
  models: readonly RoledServerModel[],
  providerId: string,
): AgentModelRoleRefs {
  const refs: AgentModelRoleRefs = {};
  if (!providerId) return refs;

  for (const model of models) {
    const modelId = model.modelId?.trim();
    if (!modelId || !model.role) continue;

    const ref = `${providerId}/${modelId}`;
    if (model.role === Role.Primary && !refs.primary) refs.primary = ref;
    else if (model.role === Role.Cheap && !refs.cheap) refs.cheap = ref;
    else if (model.role === Role.Fallback && !refs.fallback) refs.fallback = ref;
  }

  return refs;
}

/**
 * The `agents.defaults` fragments the roles fill in. Each is its own object
 * so a caller can spread it into the block it belongs to without the
 * shapes of those blocks being restated here.
 *
 * Every field is omitted when its role has no model, so a partial catalogue
 * degrades to the engine's own defaults instead of to a broken reference.
 */
export function buildAgentModelRoleDefaults(refs: AgentModelRoleRefs): {
  /** Merged into `agents.defaults.model`. */
  model: { fallbacks?: ModelRef[] };
  /** Merged into `agents.defaults.compaction`. */
  compaction: { model?: ModelRef; memoryFlush?: { model: ModelRef } };
  /** Merged into `agents.defaults.heartbeat`. */
  heartbeat: { model?: ModelRef };
  /** Written as `agents.defaults.subagents`, or omitted entirely. */
  subagents?: { model: ModelRef };
} {
  return {
    model: refs.fallback ? { fallbacks: [refs.fallback] } : {},
    compaction: refs.cheap
      ? { model: refs.cheap, memoryFlush: { model: refs.cheap } }
      : {},
    heartbeat: refs.cheap ? { model: refs.cheap } : {},
    ...(refs.cheap ? { subagents: { model: refs.cheap } } : {}),
  };
}
