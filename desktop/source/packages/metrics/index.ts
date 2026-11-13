/**
 * Counters, gauges and histograms for the agent's loop. A metric is only a
 * name and a kind: what it measures is handed to whichever backend the
 * context carries, and a context that carries none measures nothing.
 */
import { createKey, type Context } from "../context/core.js";

export type MetricType = "counter" | "gauge" | "histogram";
export type MetricLabels = Readonly<Record<string, string>>;

export interface MetricHandle {
  name: string;
  type: MetricType;
  description?: string;
  labelNames?: readonly string[];
}

export interface MetricsBackend {
  record(context: Context, handle: MetricHandle, value: number, labels?: MetricLabels): void;
  increment(context: Context, handle: MetricHandle, value: number, labels?: MetricLabels): void;
  gauge(context: Context, handle: MetricHandle, value: number, labels?: MetricLabels): void;
  histogram(context: Context, handle: MetricHandle, value: number, labels?: MetricLabels): void;
}

interface MetricOptions {
  description?: string;
  labelNames?: readonly string[];
}

/** The backend of a context that was given none: every measure is dropped. */
const silent: MetricsBackend = { record() {}, increment() {}, gauge() {}, histogram() {} };

export const metricsKey = createKey(Symbol("metricsBackend"), silent);

export function getMetricsBackend(context: Context): MetricsBackend {
  return context.get(metricsKey);
}

/**
 * A metric's handle. Both optional fields are always on it, undefined when
 * not given: a backend may list a handle's keys, and finds the same four
 * whatever the metric was made with.
 */
function describe(name: string, type: MetricType, options: MetricOptions | undefined): MetricHandle {
  return { name, type, description: options?.description as string, labelNames: options?.labelNames as readonly string[] };
}

/** What every metric can do besides its own verb: hand a raw value to the backend's `record`. */
function recorder(handle: MetricHandle) {
  return (context: Context, value: number, labels?: MetricLabels): void => getMetricsBackend(context).record(context, handle, value, labels);
}

export function createCounter(name: string, options?: MetricOptions) {
  const handle = describe(name, "counter", options);
  return {
    /** Counts one more, or `value` more. */
    increment(context: Context, value = 1, labels?: MetricLabels): void {
      getMetricsBackend(context).increment(context, handle, value, labels);
    },
    record: recorder(handle),
  };
}

export function createGauge(name: string, options?: MetricOptions) {
  const handle = describe(name, "gauge", options);
  return {
    gauge(context: Context, value: number, labels?: MetricLabels): void {
      getMetricsBackend(context).gauge(context, handle, value, labels);
    },
    record: recorder(handle),
  };
}

export function createHistogram(name: string, options?: MetricOptions) {
  const handle = describe(name, "histogram", options);
  return {
    histogram(context: Context, value: number, labels?: MetricLabels): void {
      getMetricsBackend(context).histogram(context, handle, value, labels);
    },
    record: recorder(handle),
  };
}
