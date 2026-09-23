// How many model calls one turn may make.
//
// Grok Bot caps a turn at 5,000 steps (`runner/turn-agent-composition.ts`,
// SAND_AGENT_MAX_STEPS) and has no money cap at all. A turn nobody asked
// for — the first-run intro, a reply nudge, an automation — gets a far
// smaller cap here. Measured 22 September 2026: one unattended first-run
// turn made 481 model calls in fifty minutes with nothing on screen
// (`docs/product/spend-guards.md`). SAND_AGENT_MAX_STEPS and
// SAND_HIDDEN_TURN_MAX_STEPS override the two numbers.
export const SAND_AGENT_MAX_STEPS = 5_000;
export const SAND_HIDDEN_TURN_MAX_STEPS = 40;
export const SAND_AGENT_MAX_STEPS_ENV = "SAND_AGENT_MAX_STEPS";
export const SAND_HIDDEN_TURN_MAX_STEPS_ENV = "SAND_HIDDEN_TURN_MAX_STEPS";

function readStepCap(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const parsed = Number.parseInt(env[name]?.trim() ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : fallback;
}

export function resolveSandAgentStepCap(options: { readonly hidden?: boolean } = {}, env: NodeJS.ProcessEnv = process.env): number {
  const asked = readStepCap(env, SAND_AGENT_MAX_STEPS_ENV, SAND_AGENT_MAX_STEPS);
  if (options.hidden !== true) return asked;
  return Math.min(asked, readStepCap(env, SAND_HIDDEN_TURN_MAX_STEPS_ENV, SAND_HIDDEN_TURN_MAX_STEPS));
}

export function stepBudgetExceededMessage(budget: number, hidden: boolean): string {
  return hidden
    ? `This turn ran without being asked and reached its budget of ${budget} model calls (${SAND_HIDDEN_TURN_MAX_STEPS_ENV}). It stops here; send a message to continue the work on purpose.`
    : `This turn reached its budget of ${budget} model calls (${SAND_AGENT_MAX_STEPS_ENV}). It stops here; send a message to continue.`;
}
