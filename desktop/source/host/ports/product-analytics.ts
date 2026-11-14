/**
 * Product analytics as the host sees them: one verb, an event's name and
 * what is known about it.
 */
export interface SandProductAnalytics {
  trackEvent(name: string, properties?: Readonly<Record<string, unknown>>): void;
}

/** The analytics of a host that tracks nothing: every event is dropped. */
export function createNoopSandProductAnalytics(): SandProductAnalytics {
  return {
    trackEvent(): void {},
  };
}
