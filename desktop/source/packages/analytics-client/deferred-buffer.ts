/**
 * Where analytics events wait while it is not yet known whether analytics is
 * on. Nothing is sent from here: whoever holds the buffer reads the events
 * out when analytics is switched on, or clears them when it is not.
 */
export interface DeferredAnalyticsEvent {
  eventName: string;
  props?: Readonly<Record<string, unknown>> | undefined;
  timestamp?: number | undefined;
}

export class DeferredAnalyticsBuffer {
  private kept: DeferredAnalyticsEvent[] = [];

  /** Keeps the event as it is given; nothing about it is checked. */
  track(eventName: string, props?: Readonly<Record<string, unknown>>, timestamp?: number): void {
    this.kept.push({ eventName, props, timestamp });
  }

  /** There is nowhere to send to: this only matches the sending buffer's shape. */
  async flush(_timeoutMs: number): Promise<void> {}

  /** The buffer's own list, not a copy of it. */
  getEvents(): DeferredAnalyticsEvent[] {
    return this.kept;
  }

  /** Starts a new list; one handed out earlier keeps what it held. */
  clear(): void {
    this.kept = [];
  }
}
