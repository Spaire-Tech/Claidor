/**
 * The steps a carrier can be made for, as a table: each step's name, and the
 * name its carrier goes under. The engine keeps its own list of the steps
 * whose hooks may add context (`HOOK_STEPS_SUPPORTING_ADDITIONAL_CONTEXT`);
 * the table is made from that list when this file is loaded, and the load
 * fails if the list names a step this file does not know. Adding a step
 * therefore takes two changes, there and here, and forgetting the second
 * one is found the first time the engine starts.
 */
import { HookStep, type HookStepValue } from "../hooks/hook-step.js";
import { HOOK_STEPS_SUPPORTING_ADDITIONAL_CONTEXT } from "../hooks/types.js";

type HookStepAdditionalContextEventName =
  | typeof HookStep.sessionStart
  | typeof HookStep.beforeSubmitPrompt
  | typeof HookStep.preToolUse
  | typeof HookStep.postToolUse
  | typeof HookStep.postToolUseFailure;

/** The same five names as the type above, for the check made when the table is built. */
const STEPS_WITH_A_CARRIER: readonly HookStepValue[] = [
  HookStep.sessionStart,
  HookStep.beforeSubmitPrompt,
  HookStep.preToolUse,
  HookStep.postToolUse,
  HookStep.postToolUseFailure,
];

function hasCarrier(step: HookStepValue): step is HookStepAdditionalContextEventName {
  return STEPS_WITH_A_CARRIER.includes(step);
}

/** One entry for each step, in the order the steps come. The first step without a carrier ends it. */
function carrierSpecs(
  steps: Iterable<HookStepValue>,
): Record<HookStepAdditionalContextEventName, { hookEventName: HookStepAdditionalContextEventName }> {
  const specs: Partial<Record<HookStepAdditionalContextEventName, { hookEventName: HookStepAdditionalContextEventName }>> = {};
  for (const step of steps) {
    if (!hasCarrier(step)) {
      throw new Error(
        `HOOK_STEPS_SUPPORTING_ADDITIONAL_CONTEXT lists ${step} but HookStepAdditionalContextEventName does not include it. Extend the Extract<> union in spec.ts.`,
      );
    }
    specs[step] = { hookEventName: step };
  }
  return specs as Record<HookStepAdditionalContextEventName, { hookEventName: HookStepAdditionalContextEventName }>;
}

export const HOOK_STEP_CARRIER_SPECS: Record<
  HookStepAdditionalContextEventName,
  { hookEventName: HookStepAdditionalContextEventName }
> = carrierSpecs(HOOK_STEPS_SUPPORTING_ADDITIONAL_CONTEXT);
