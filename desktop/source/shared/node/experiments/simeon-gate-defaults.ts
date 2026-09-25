import { envGateOverride } from "./cursor-experiments.js";

// Feature gates Simeon turns on that Grok Bot's bundled table
// (`experiment-config.gen.ts`, a generated file that is not edited) leaves
// off. Grok Bot flips these from Cursor's experiments server, which Simeon
// Labs' server does not serve, so without this the bundled default is the
// only value the app ever sees.
//
// `sand_usage_page` — Settings → Usage & Billing and the account menu's
// usage card. Off by default since the reconstruction; on since
// 24 September 2026, now that the summary is built from Simeon Labs'
// server's quota (`account/cursor-profile.ts`).
//
// Precedence, lowest to highest: this table, then
// `SAND_FEATURE_GATE_OVERRIDES=name=0` in the environment (a kill switch,
// read whatever the build), then a local override set from the flags
// panel. A gate not named here is untouched.
//
// `sand_auto_review` — the risky-or-safe review of the agent's own actions
// (a shell command, a computer action, a routine write) with the confirm
// card. Off in the bundled table, so every surface resolved to shadow: one
// Luna call per action, verdict discarded, no card. On since 25 September
// 2026 (design-audit-ledger.md F-340), now that the classifier runs on Luna
// through Simeon Labs' proxy and the box host reads this table.
//
// `sand_product_analytics` — Grok Bot's event stream to Cursor's
// AnalyticsService, which nothing serves here; off (F-378).
//
// `sand_multiplayer` — sharing a room with another person's agent. Off in
// the bundled table; on since 25 September 2026 (F-403), now that Simeon
// Labs' server serves the `/sand/xuser` and `/sand/share-rooms` relay
// (`server/polar/sand/sharing.py`). The cross-user-sharing extension reads
// it through `getFeatureGateProperty`, which this table also covers.
//
// `sand_notify_bus` — the box's one SSE stream to `GET /sand/notify`, which
// wakes the listener relay poller and the fire consumer the moment an
// event or a cron fire lands instead of at their next poll. Off in the
// bundled table; on since 25 September 2026, now that Simeon Labs' server
// serves the stream (polar/sand/notify.py) and the listener relay behind
// it (polar/sand/listeners*.py). The safety polls stay on.
export const SIMEON_FEATURE_GATE_DEFAULTS: Readonly<Record<string, boolean>> = Object.freeze({
  sand_usage_page: true,
  sand_auto_review: true,
  sand_product_analytics: false,
  sand_multiplayer: true,
  sand_notify_bus: true,
});

export function simeonGateDefault(name: string, env: NodeJS.ProcessEnv = process.env): boolean | undefined {
  if (!Object.hasOwn(SIMEON_FEATURE_GATE_DEFAULTS, name)) return undefined;
  return envGateOverride(name, env) ?? SIMEON_FEATURE_GATE_DEFAULTS[name];
}

export function withSimeonGateDefaults<Snapshot>(snapshot: Snapshot, env: NodeJS.ProcessEnv = process.env, localOverrides: Readonly<Record<string, unknown>> = {}): Snapshot {
  if (typeof snapshot !== "object" || snapshot == null) return snapshot;
  const gates = (snapshot as { featureGates?: unknown }).featureGates;
  if (typeof gates !== "object" || gates == null) return snapshot;
  const featureGates: Record<string, boolean> = { ...(gates as Record<string, boolean>) };
  for (const name of Object.keys(SIMEON_FEATURE_GATE_DEFAULTS)) {
    if (typeof localOverrides[name] === "boolean") continue;
    const value = simeonGateDefault(name, env);
    if (value !== undefined) featureGates[name] = value;
  }
  return { ...snapshot, featureGates };
}

export interface GateDefaultableService<Snapshot> {
  checkFeatureGate(name: any): boolean;
  getSnapshot(): Snapshot;
  subscribe(listener: (snapshot: Snapshot) => void): () => void;
  getFeatureFlagOverridesRecord(): Record<string, unknown>;
  getFeatureGateProperty?(name: any): { get(): boolean; set(value: boolean): void };
}

/**
 * The experiment service with Simeon's defaults laid over its answers:
 * `checkFeatureGate`, `getSnapshot`, every snapshot handed to a
 * subscriber, and the gate property an extension subscribes to
 * (`getFeatureGateProperty` builds it from the raw table, so the property
 * is set to Simeon's default when one exists; 25 September 2026, the
 * sharing gate). Everything else reaches the wrapped service untouched.
 */
export function applySimeonGateDefaults<Snapshot, Service extends GateDefaultableService<Snapshot>>(service: Service, env: NodeJS.ProcessEnv = process.env): Service {
  const overrides = () => service.getFeatureFlagOverridesRecord();
  const project = (snapshot: Snapshot) => withSimeonGateDefaults(snapshot, env, overrides());
  const resolve = (name: string): boolean | undefined => {
    const local = overrides()[name];
    return typeof local === "boolean" ? local : simeonGateDefault(name, env);
  };
  return new Proxy(service, {
    get(target, property, receiver) {
      if (property === "checkFeatureGate") {
        return (name: string) => resolve(name) ?? target.checkFeatureGate(name);
      }
      if (property === "getFeatureGateProperty" && typeof target.getFeatureGateProperty === "function") {
        return (name: string) => {
          const gate = target.getFeatureGateProperty!(name);
          const value = resolve(name);
          if (value !== undefined && gate.get() !== value) gate.set(value);
          return gate;
        };
      }
      if (property === "getSnapshot") return () => project(target.getSnapshot());
      if (property === "subscribe") return (listener: (snapshot: Snapshot) => void) => target.subscribe((snapshot) => listener(project(snapshot)));
      const value = Reflect.get(target, property, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
