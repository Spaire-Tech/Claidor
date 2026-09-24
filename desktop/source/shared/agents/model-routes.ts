// A route is the job a seat does, and it decides which model the seat runs on
// and how hard that model thinks. Simeon (the coach) picks one when it creates
// a teammate; the person can change it on the agent. This is the rule table
// the product overview calls Auto and Override (24 September 2026), written
// the way Arch-Router expresses routes but kept in our own hands and under
// our own licence.
//
// A route names a tier, not a model id: the host resolves `primary` and
// `cheap` to the models the proxy serves and the environment may override
// (`SAND_CLAIDOR_MODEL`, `SAND_CLAIDOR_CHEAP_MODEL`), so a route survives a
// model rename. Today the proxy reaches OpenAI models only, so every route
// is Terra or Luna; a second lab is a proxy change, not a route change.

export type SandModelRouteTier = "primary" | "cheap";
export type SandModelRouteEffort = "minimal" | "low" | "medium" | "high";

export interface SandModelRoute {
  readonly id: string;
  readonly label: string;
  /** What the coach reads when it chooses; one sentence, about the job. */
  readonly description: string;
  readonly tier: SandModelRouteTier;
  readonly effort: SandModelRouteEffort;
}

export const SAND_MODEL_ROUTES: readonly SandModelRoute[] = [
  {
    id: "frontier",
    label: "Frontier",
    description: "Hard, ambiguous or high-stakes work: research, analysis, a narrative, a legal pass, a review of another teammate's draft. The strongest model, thinking hard.",
    tier: "primary",
    effort: "high",
  },
  {
    id: "everyday",
    label: "Everyday",
    description: "Ordinary drafting, planning, replies and coordination. The strongest model, thinking less, so it answers faster and costs less.",
    tier: "primary",
    effort: "medium",
  },
  {
    id: "quick",
    label: "Quick",
    description: "Errands: formatting, lookups, short summaries, a routine step with a clear answer. The cheap model, thinking little.",
    tier: "cheap",
    effort: "low",
  },
];

export const SAND_MODEL_ROUTE_IDS = SAND_MODEL_ROUTES.map((route) => route.id) as [string, ...string[]];

/** The stored route id, or `undefined` when the agent has none or names one that no longer exists. */
export function findSandModelRoute(id: string | null | undefined): SandModelRoute | undefined {
  const needle = id?.trim().toLowerCase();
  if (!needle) return undefined;
  return SAND_MODEL_ROUTES.find((route) => route.id === needle);
}

export function normalizeSandModelRouteId(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/** One line per route, for a tool description the coach reads before it staffs. */
export function describeSandModelRoutes(): string {
  return SAND_MODEL_ROUTES.map((route) => `"${route.id}": ${route.description}`).join(" ");
}
