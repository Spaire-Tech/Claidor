/** Counters, gauges and histograms: each is a name and a kind, and what it measures goes to whichever backend the context holds. */
export const part = "packages/metrics";
export const modules = { metrics: "source/packages/metrics/index.ts" };

/** A context that hands back one backend, and the backend's calls as they came. */
function standIn() {
  const calls = [];
  const backend = Object.fromEntries(["record", "increment", "gauge", "histogram"].map((method) => [method, (context, handle, value, labels) => { calls.push({ method, sameContext: context === holder.context, handle, value, labels }); }]));
  const holder = { context: { get: () => backend }, calls };
  return holder;
}

export const scenarios = [
  {
    name: "a counter counts by one unless told, and records a value",
    run: ({ metrics }) => {
      const { context, calls } = standIn();
      const plainCounter = metrics.createCounter("turns_started");
      const described = metrics.createCounter("tool_calls", { description: "Calls made", labelNames: ["tool", "outcome"] });
      plainCounter.increment(context);
      plainCounter.increment(context, 5);
      described.increment(context, 2, { tool: "Shell", outcome: "ok" });
      described.record(context, 9, { tool: "Read" });
      return { calls, methods: [Object.keys(plainCounter), Object.keys(described)] };
    },
  },
  {
    name: "a gauge and a histogram pass their values on with their own kind",
    run: ({ metrics }) => {
      const { context, calls } = standIn();
      const gauge = metrics.createGauge("open_sessions", { description: "Sessions open now" });
      const histogram = metrics.createHistogram("turn_seconds", { labelNames: ["model"] });
      gauge.gauge(context, 3);
      gauge.record(context, 4, { region: "eu" });
      histogram.histogram(context, 1.5, { model: "a" });
      histogram.record(context, 0);
      return { calls, methods: [Object.keys(gauge), Object.keys(histogram)] };
    },
  },
  {
    name: "the backend is read from the context under the metrics key, whose own backend does nothing",
    run: ({ metrics }) => {
      const asked = [];
      const backend = { record() {}, increment() {}, gauge() {}, histogram() {} };
      const found = metrics.getMetricsBackend({ get: (key) => { asked.push(key === metrics.metricsKey); return backend; } });
      const key = metrics.metricsKey;
      const fallback = Object.values(key).find((value) => value !== null && typeof value === "object" && typeof value.increment === "function");
      return {
        asked,
        sameBackend: found === backend,
        keyFields: Object.keys(key).sort(),
        fallbackMethods: fallback === undefined ? null : Object.keys(fallback).sort(),
        fallbackAnswers: fallback === undefined ? null : ["record", "increment", "gauge", "histogram"].map((method) => fallback[method]({}, { name: "n", type: "counter" }, 1)),
      };
    },
  },
];
