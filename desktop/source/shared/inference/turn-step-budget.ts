// How many model calls one turn may make.
//
// The upstream app caps a turn at 5,000 steps (`runner/turn-agent-composition.ts`,
// SAND_AGENT_MAX_STEPS) and has no money cap at all. A turn nobody asked
// for — the first-run intro, a reply nudge, an automation — gets a far
// smaller cap here. Measured 22 September 2026: one unattended first-run
// turn made 481 model calls in fifty minutes with nothing on screen
// (`docs/services-core.md`). SAND_AGENT_MAX_STEPS and
// SAND_HIDDEN_TURN_MAX_STEPS override the two numbers.
export const SAND_AGENT_MAX_STEPS = 5_000;
// Restored to the asked turn's cap on 8 October 2026: a revival after a
// helper finishes is a hidden turn, and it is exactly when a long job is
// picked back up. SAND_HIDDEN_TURN_MAX_STEPS still lowers it.
export const SAND_HIDDEN_TURN_MAX_STEPS = 5_000;
export const SAND_AGENT_MAX_STEPS_ENV = "SAND_AGENT_MAX_STEPS";
export const SAND_HIDDEN_TURN_MAX_STEPS_ENV = "SAND_HIDDEN_TURN_MAX_STEPS";
// A routine's run, since 2 October 2026: 200 calls, not the asked turn's
// 5,000. A routine runs unattended, often every day, so its worst run is
// paid on every fire; 200 calls is a long task (a real turn rarely passes
// 30) at a ceiling of a few dollars rather than tens.
// Restored to the asked turn's cap on 8 October 2026 (the founder: "bring
// back everything"); SAND_ROUTINE_MAX_STEPS still lowers it.
export const SAND_ROUTINE_MAX_STEPS = 5_000;
export const SAND_ROUTINE_MAX_STEPS_ENV = "SAND_ROUTINE_MAX_STEPS";
// How many messages agents may pass in a row, each waking the next, before a
// person has to step in: three round trips (2 October 2026). The upstream app had
// only a sentence in the prompt asking agents not to bounce back and forth.
// No cap since 8 October 2026, as the upstream app has none; the refusal
// machinery stays, and SAND_AGENT_MESSAGE_MAX_HOPS sets a cap on purpose.
export const SAND_AGENT_MESSAGE_MAX_HOPS = Number.POSITIVE_INFINITY;
export const SAND_AGENT_MESSAGE_MAX_HOPS_ENV = "SAND_AGENT_MESSAGE_MAX_HOPS";

function readStepCap(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const parsed = Number.parseInt(env[name]?.trim() ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : fallback;
}

export function resolveSandAgentStepCap(options: { readonly hidden?: boolean; readonly routine?: boolean } = {}, env: NodeJS.ProcessEnv = process.env): number {
  const asked = readStepCap(env, SAND_AGENT_MAX_STEPS_ENV, SAND_AGENT_MAX_STEPS);
  if (options.routine === true) return Math.min(asked, readStepCap(env, SAND_ROUTINE_MAX_STEPS_ENV, SAND_ROUTINE_MAX_STEPS));
  if (options.hidden !== true) return asked;
  return Math.min(asked, readStepCap(env, SAND_HIDDEN_TURN_MAX_STEPS_ENV, SAND_HIDDEN_TURN_MAX_STEPS));
}

export function resolveAgentMessageHopCap(env: NodeJS.ProcessEnv = process.env): number {
  return readStepCap(env, SAND_AGENT_MESSAGE_MAX_HOPS_ENV, SAND_AGENT_MESSAGE_MAX_HOPS);
}

export function stepBudgetExceededMessage(budget: number, hidden: boolean, routine = false): string {
  if (routine) return `This routine run reached its budget of ${budget} model calls (${SAND_ROUTINE_MAX_STEPS_ENV}). It stops here and runs again at its next scheduled time.`;
  return hidden
    ? `This turn ran without being asked and reached its budget of ${budget} model calls (${SAND_HIDDEN_TURN_MAX_STEPS_ENV}). It stops here; send a message to continue the work on purpose.`
    : `This turn reached its budget of ${budget} model calls (${SAND_AGENT_MAX_STEPS_ENV}). It stops here; send a message to continue.`;
}
