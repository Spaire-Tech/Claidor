/**
 * Where a tool call keeps what its hooks added: a list the hooks' carriers
 * are put on as they come, read once the tool has answered.
 */
import type { HookAdditionalContext } from "../proto/generated/agent/v1/hook_additional_context_pb.js";

/**
 * Puts carriers on the collector, after what it holds, all of them in one
 * call. A tool call that collects nothing has no collector, and then the
 * carriers are not even looked at. A collector is left alone when there is
 * nothing to add.
 */
export function appendHookAdditionalContexts(
  collector: HookAdditionalContext[] | undefined,
  contexts: readonly HookAdditionalContext[],
): void {
  if (collector === undefined) return;
  if (contexts.length > 0) collector.push(...contexts);
}
