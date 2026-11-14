/**
 * The approval a hook can ask for before a shell command runs. A shell
 * request carries it in its `hookApprovalRequirement` field; the functions
 * here make one, put it on a request and read it back.
 */
import type { PartialMessage } from "@bufbuild/protobuf";

import { ShellHookApprovalRequirement, ShellHookApprovalRequirement_Kind } from "../proto/generated/agent/v1/shell_exec_pb.js";

/** The one field of a shell request that these functions touch. */
interface CarriesHookApproval {
  hookApprovalRequirement?: ShellHookApprovalRequirement | undefined;
}

/**
 * Puts a requirement on a request, as a message of its own made from what is
 * given. Given none, the field is still written, with nothing in it, so that
 * a requirement set earlier is gone.
 */
export function setShellHookApprovalRequirement(args: CarriesHookApproval, requirement: PartialMessage<ShellHookApprovalRequirement> | undefined): void {
  args.hookApprovalRequirement = requirement === undefined ? undefined : new ShellHookApprovalRequirement(requirement);
}

/** A requirement that the person be asked whatever else would allow the command, with the hook's reason when it gave one. */
export function createForcePromptHookApprovalRequirement(reason: string | undefined): ShellHookApprovalRequirement {
  const prompt: PartialMessage<ShellHookApprovalRequirement> = { kind: ShellHookApprovalRequirement_Kind.FORCE_PROMPT };
  if (reason !== undefined) {
    prompt.reason = reason;
  }
  return new ShellHookApprovalRequirement(prompt);
}

/** The requirement a request carries, if any. */
export function getShellHookApprovalRequirement(args: CarriesHookApproval): ShellHookApprovalRequirement | undefined {
  return args.hookApprovalRequirement;
}
