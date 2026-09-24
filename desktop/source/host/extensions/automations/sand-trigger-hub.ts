import type { PollingPolicy } from "../../../internal/scheduling.js";
import { triggerCronSchedules, triggerListeners, type AutomationTrigger, type EventTrigger } from "../../../shared/automations.js";
import { automationAnchor, computeNextRunAt } from "../../../shared/automation-schedule.js";
import { triggerMatchesEvent } from "../../automations/automation-trigger.js";

export interface TriggerSourceStatus { state: string; detail?: string; scopeIssues?: readonly unknown[] }
export interface TriggerSource { kind: string; setListeners(listeners: readonly EventTrigger[]): void; start(accept: (event: Record<string, unknown>) => boolean): Promise<void>; stop(): Promise<void>; getStatus(): TriggerSourceStatus }
export interface ScheduledAutomation { agentId: string; automation: { id?: string; isEnabled: boolean; trigger: AutomationTrigger; createdAt?: number; lastRunAt?: number | null } }
export interface SandTriggerHubDependencies { polling: PollingPolicy; sources: readonly TriggerSource[]; listAutomations(): Promise<readonly ScheduledAutomation[]>; fire(agentId: string, automation: ScheduledAutomation["automation"], event: Record<string, unknown>): Promise<unknown>; fireCron?(agentId: string, automation: ScheduledAutomation["automation"]): Promise<unknown>; isReady(): boolean | Promise<boolean>; shouldScheduleLocally?(agentId: string, automation: ScheduledAutomation["automation"]): boolean; getTimeZone?(): string | undefined; onReconcile?(): void }

export class SandTriggerHub {
  private readonly sources = new Map<string, TriggerSource>(); private readonly startedKinds = new Set<string>(); private timer: { dispose(): void } | undefined; private reconcileChain = Promise.resolve(); private pendingPasses = 0; private isStopped = false;
  private readonly lastLocalCronFireMs = new Map<string, number>();
  constructor(readonly deps: SandTriggerHubDependencies) { for (const source of deps.sources) this.sources.set(source.kind, source); }
  start(): void { if (this.timer != null) return; this.isStopped = false; this.timer = this.deps.polling.start(async () => { try { if (this.pendingPasses === 0) await this.reconcile(); } catch {} }); }
  async stop(): Promise<void> { this.isStopped = true; this.timer?.dispose(); this.timer = undefined; await this.reconcileChain; const started = [...this.startedKinds]; this.startedKinds.clear(); await Promise.all(started.map(async (kind) => { try { await this.sources.get(kind)?.stop(); } catch {} })); }
  async reconcileNow(): Promise<void> { await this.reconcile(); }
  getSourceStatuses(): Map<string, TriggerSourceStatus> { return new Map([...this.sources].map(([kind, source]) => [kind, source.getStatus()])); }
  async desiredListenersByKind(): Promise<Map<string, EventTrigger[]>> { const byKind = new Map<string, EventTrigger[]>(); for (const { agentId, automation } of await this.deps.listAutomations()) { if (!automation.isEnabled || !(this.deps.shouldScheduleLocally?.(agentId, automation) ?? true)) continue; for (const listener of triggerListeners(automation.trigger)) { const bucket = byKind.get(listener.type) ?? []; bucket.push(listener); byKind.set(listener.type, bucket); } } return byKind; }
  private reconcile(): Promise<void> { this.pendingPasses += 1; const pass = this.reconcileChain.then(async () => this.reconcilePass()); this.reconcileChain = pass.catch(() => {}).finally(() => { this.pendingPasses -= 1; }); return pass; }
  private async reconcilePass(): Promise<void> { if (this.isStopped) return; this.deps.onReconcile?.(); const ready = await this.deps.isReady(); const desired = ready ? await this.desiredListenersByKind() : new Map<string, EventTrigger[]>(); if (this.isStopped) return; for (const [kind, source] of this.sources) { const listeners = desired.get(kind) ?? []; if (listeners.length) { source.setListeners(listeners); if (!this.startedKinds.has(kind)) { this.startedKinds.add(kind); try { await source.start((event) => this.acceptEvent(event)); } catch { this.startedKinds.delete(kind); } } } else if (this.startedKinds.has(kind)) { this.startedKinds.delete(kind); try { await source.stop(); } catch {} } } if (ready && this.deps.fireCron != null) await this.fireLocalCrons(); }
  private async fireLocalCrons(): Promise<void> {
    if (this.isStopped) return;
    let scheduled: readonly ScheduledAutomation[];
    try { scheduled = await this.deps.listAutomations(); } catch { return; }
    const now = Date.now();
    const timeZone = this.deps.getTimeZone?.();
    const seenKeys = new Set<string>();
    for (const { agentId, automation } of scheduled) {
      if (this.isStopped) return;
      if (!automation.isEnabled || automation.id == null) continue;
      if (!(this.deps.shouldScheduleLocally?.(agentId, automation) ?? true)) continue;
      const schedules = triggerCronSchedules(automation.trigger);
      if (schedules.length === 0) continue;
      const key = `${agentId}:${automation.id}`;
      seenKeys.add(key);
      const anchor = automationAnchor({ createdAt: automation.createdAt ?? now, lastRunAt: automation.lastRunAt ?? null });
      const localFire = this.lastLocalCronFireMs.get(key);
      const effectiveAnchor = localFire != null && localFire > anchor ? localFire : anchor;
      let earliest: number | null = null;
      for (const schedule of schedules) {
        const next = computeNextRunAt(schedule, effectiveAnchor, timeZone);
        if (next != null && (earliest == null || next < earliest)) earliest = next;
      }
      if (earliest != null && earliest <= now) {
        this.lastLocalCronFireMs.set(key, now);
        try { await this.deps.fireCron!(agentId, automation); } catch {}
      }
    }
    for (const key of this.lastLocalCronFireMs.keys()) { if (!seenKeys.has(key)) this.lastLocalCronFireMs.delete(key); }
  }
  acceptEvent(event: Record<string, unknown>): boolean { if (this.isStopped) return false; void this.handleEvent(event); return true; }
  async handleEvent(event: Record<string, unknown>): Promise<void> { if (this.isStopped || !await this.deps.isReady()) return; let scheduled: readonly ScheduledAutomation[]; try { scheduled = await this.deps.listAutomations(); } catch { return; } for (const { agentId, automation } of scheduled) { if (!automation.isEnabled || !triggerMatchesEvent(automation.trigger, event)) continue; try { if (!(this.deps.shouldScheduleLocally?.(agentId, automation) ?? true)) continue; await this.deps.fire(agentId, automation, event); } catch {} } }
}
