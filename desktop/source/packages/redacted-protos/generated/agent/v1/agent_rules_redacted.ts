// @ts-nocheck -- exact generated runtime; declaration typing is a subsequent mechanical pass.
import { AgentRule as AgentRule2, AgentRuleType, AgentRuleTypeAgentFetched, AgentRuleTypeFileGlobs, AgentRuleTypeGlobal, AgentRuleTypeManuallyAttached } from "../../../../proto/generated/agent/v1/agent_rules_pb.js";
import { DataClassification } from "../../../../redaction/classification.js";
import { createRedactedString } from "../../../../redaction/factory.js";

function toRedactedAgentRuleTypeGlobal(msg, privacyMode) {
  return {
    _privacyMode: privacyMode
  };
}
function fromRedactedAgentRuleTypeGlobal(msg, purpose, opts) {
  const redactUnallowedFieldsInsteadOfThrowing = opts?.redactUnallowedFieldsInsteadOfThrowing ?? false;
  const enforcing = opts?.enforcing;
  return new AgentRuleTypeGlobal({});
}
function toRedactedAgentRuleTypeFileGlobs(msg, privacyMode) {
  return {
    _privacyMode: privacyMode,
    globs: msg.globs.map((v2) => createRedactedString(v2, DataClassification.PATH, "globs", privacyMode))
  };
}
function fromRedactedAgentRuleTypeFileGlobs(msg, purpose, opts) {
  const redactUnallowedFieldsInsteadOfThrowing = opts?.redactUnallowedFieldsInsteadOfThrowing ?? false;
  const enforcing = opts?.enforcing;
  return new AgentRuleTypeFileGlobs({
    globs: msg.globs.map((v2) => v2.unwrap(purpose, { redactUnallowedFieldsInsteadOfThrowing, enforcing }))
  });
}
function toRedactedAgentRuleTypeAgentFetched(msg, privacyMode) {
  return {
    _privacyMode: privacyMode,
    description: createRedactedString(msg.description, DataClassification.CODE, "description", privacyMode)
  };
}
function fromRedactedAgentRuleTypeAgentFetched(msg, purpose, opts) {
  const redactUnallowedFieldsInsteadOfThrowing = opts?.redactUnallowedFieldsInsteadOfThrowing ?? false;
  const enforcing = opts?.enforcing;
  return new AgentRuleTypeAgentFetched({
    description: msg.description.unwrap(purpose, { redactUnallowedFieldsInsteadOfThrowing, enforcing })
  });
}
function toRedactedAgentRuleTypeManuallyAttached(msg, privacyMode) {
  return {
    _privacyMode: privacyMode
  };
}
function fromRedactedAgentRuleTypeManuallyAttached(msg, purpose, opts) {
  const redactUnallowedFieldsInsteadOfThrowing = opts?.redactUnallowedFieldsInsteadOfThrowing ?? false;
  const enforcing = opts?.enforcing;
  return new AgentRuleTypeManuallyAttached({});
}
function toRedactedAgentRuleType(msg, privacyMode) {
  return {
    _privacyMode: privacyMode,
    type: toRedactedAgentRuleType_type(msg.type, privacyMode)
  };
}
function toRedactedAgentRuleType_type(oneof, privacyMode) {
  if (!oneof || oneof.case === void 0) {
    return { case: void 0, value: void 0 };
  }
  switch (oneof.case) {
    case "global":
      return { case: "global", value: toRedactedAgentRuleTypeGlobal(oneof.value, privacyMode) };
    case "fileGlobbed":
      return { case: "fileGlobbed", value: toRedactedAgentRuleTypeFileGlobs(oneof.value, privacyMode) };
    case "agentFetched":
      return { case: "agentFetched", value: toRedactedAgentRuleTypeAgentFetched(oneof.value, privacyMode) };
    case "manuallyAttached":
      return { case: "manuallyAttached", value: toRedactedAgentRuleTypeManuallyAttached(oneof.value, privacyMode) };
    default:
      return { case: void 0, value: void 0 };
  }
}
function fromRedactedAgentRuleType(msg, purpose, opts) {
  const redactUnallowedFieldsInsteadOfThrowing = opts?.redactUnallowedFieldsInsteadOfThrowing ?? false;
  const enforcing = opts?.enforcing;
  return new AgentRuleType({
    type: fromRedactedAgentRuleType_type(msg.type, purpose, opts)
  });
}
function fromRedactedAgentRuleType_type(oneof, purpose, opts) {
  const redactUnallowedFieldsInsteadOfThrowing = opts?.redactUnallowedFieldsInsteadOfThrowing ?? false;
  const enforcing = opts?.enforcing;
  if (!oneof || oneof.case === void 0) {
    return { case: void 0, value: void 0 };
  }
  switch (oneof.case) {
    case "global":
      return { case: "global", value: fromRedactedAgentRuleTypeGlobal(oneof.value, purpose, opts) };
    case "fileGlobbed":
      return { case: "fileGlobbed", value: fromRedactedAgentRuleTypeFileGlobs(oneof.value, purpose, opts) };
    case "agentFetched":
      return { case: "agentFetched", value: fromRedactedAgentRuleTypeAgentFetched(oneof.value, purpose, opts) };
    case "manuallyAttached":
      return { case: "manuallyAttached", value: fromRedactedAgentRuleTypeManuallyAttached(oneof.value, purpose, opts) };
    default:
      return { case: void 0, value: void 0 };
  }
}
function toRedactedAgentRule(msg, privacyMode) {
  return {
    _privacyMode: privacyMode,
    fullPath: createRedactedString(msg.fullPath, DataClassification.PATH, "full_path", privacyMode),
    content: createRedactedString(msg.content, DataClassification.CODE, "content", privacyMode),
    type: msg.type !== void 0 ? toRedactedAgentRuleType(msg.type, privacyMode) : void 0,
    source: msg.source,
    gitRemoteOrigin: msg.gitRemoteOrigin !== void 0 ? createRedactedString(msg.gitRemoteOrigin, DataClassification.PATH, "git_remote_origin", privacyMode) : void 0,
    parseError: msg.parseError !== void 0 ? createRedactedString(msg.parseError, DataClassification.CODE, "parse_error", privacyMode) : void 0,
    environments: msg.environments,
    disabledEnvironments: msg.disabledEnvironments,
    plugin: msg.plugin,
    marketplace: msg.marketplace,
    pluginId: msg.pluginId,
    marketplaceId: msg.marketplaceId,
    scopedTo: msg.scopedTo,
    frontmatter: createRedactedString(msg.frontmatter, DataClassification.CODE, "frontmatter", privacyMode),
    isRequired: msg.isRequired
  };
}
function fromRedactedAgentRule(msg, purpose, opts) {
  const redactUnallowedFieldsInsteadOfThrowing = opts?.redactUnallowedFieldsInsteadOfThrowing ?? false;
  const enforcing = opts?.enforcing;
  return new AgentRule2({
    fullPath: msg.fullPath.unwrap(purpose, { redactUnallowedFieldsInsteadOfThrowing, enforcing }),
    content: msg.content.unwrap(purpose, { redactUnallowedFieldsInsteadOfThrowing, enforcing }),
    type: msg.type !== void 0 ? fromRedactedAgentRuleType(msg.type, purpose, opts) : void 0,
    source: msg.source,
    gitRemoteOrigin: msg.gitRemoteOrigin?.unwrap(purpose, { redactUnallowedFieldsInsteadOfThrowing, enforcing }),
    parseError: msg.parseError?.unwrap(purpose, { redactUnallowedFieldsInsteadOfThrowing, enforcing }),
    environments: msg.environments,
    disabledEnvironments: msg.disabledEnvironments,
    plugin: msg.plugin,
    marketplace: msg.marketplace,
    pluginId: msg.pluginId,
    marketplaceId: msg.marketplaceId,
    scopedTo: msg.scopedTo,
    frontmatter: msg.frontmatter.unwrap(purpose, { redactUnallowedFieldsInsteadOfThrowing, enforcing }),
    isRequired: msg.isRequired
  });
}

export {
  toRedactedAgentRuleTypeGlobal,
  fromRedactedAgentRuleTypeGlobal,
  toRedactedAgentRuleTypeFileGlobs,
  fromRedactedAgentRuleTypeFileGlobs,
  toRedactedAgentRuleTypeAgentFetched,
  fromRedactedAgentRuleTypeAgentFetched,
  toRedactedAgentRuleTypeManuallyAttached,
  fromRedactedAgentRuleTypeManuallyAttached,
  toRedactedAgentRuleType,
  toRedactedAgentRuleType_type,
  fromRedactedAgentRuleType,
  fromRedactedAgentRuleType_type,
  toRedactedAgentRule as toRedactedAgentRule2,
  fromRedactedAgentRule as fromRedactedAgentRule2,
};
