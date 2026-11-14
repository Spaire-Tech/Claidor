/**
 * The error trays the window shows: a short list of what went wrong, newest
 * last. Whoever listens is told when a tray is pushed, when one is
 * dismissed and when the list is cleared. The list is never changed in
 * place: every change makes a new one, so a list handed out earlier stays
 * as it was.
 */
import { EventEmitter } from "node:events";

/** How many trays are kept. One more pushes the oldest out. */
export const MAX_TRAYS = 20;

export interface ErrorTray {
  readonly kind: "error";
  readonly id: string;
  readonly agentId?: string | undefined;
  readonly title: string;
  readonly detail: string;
  readonly requestId?: string | undefined;
  readonly createdAt: number;
  readonly errorKind?: string | undefined;
  readonly rawDetail?: string | undefined;
  readonly actions?: readonly unknown[] | undefined;
  readonly dedupeKey?: string;
  readonly count?: number;
}

export type TrayEvent = { type: "pushed"; tray: ErrorTray } | { type: "cleared" } | { type: "dismissed"; id: string };

/** What a push says: a tray without the three fields the list fills in, and the count to show if not the next one. */
type PushedError = Omit<ErrorTray, "kind" | "id" | "createdAt" | "count"> & { count?: number };

/** A tray while it is being put together. */
type TrayDraft = { -readonly [Field in keyof ErrorTray]: ErrorTray[Field] };

/** The one name every event goes out under. */
const EVENT = "event";

/** The actions to show: the list as given when it holds any, nothing otherwise. */
function actionsToShow(actions: PushedError["actions"]): PushedError["actions"] {
  return actions != null && actions.length > 0 ? actions : undefined;
}

/**
 * The tray that takes the place of `earlier` when the same thing goes wrong
 * again. It stays the same tray (id, agent, dedupe key); what it says and
 * when is the new push's, and it is counted once more unless the push
 * brings its own count. A field the new push leaves out is emptied, not kept.
 */
function repeatOf(earlier: ErrorTray, pushed: PushedError, createdAt: number): ErrorTray {
  return {
    ...earlier,
    title: pushed.title,
    detail: pushed.detail,
    requestId: pushed.requestId,
    count: pushed.count ?? (earlier.count ?? 1) + 1,
    createdAt,
    errorKind: pushed.errorKind,
    rawDetail: pushed.rawDetail,
    actions: actionsToShow(pushed.actions),
  };
}

export class TrayManager {
  /** Carries the events. What listens is Node's own emitter's to keep, with its order and its habits. */
  private readonly told = new EventEmitter();
  private kept: ErrorTray[] = [];

  constructor(
    private readonly newId: () => string = () => crypto.randomUUID(),
    private readonly clock: () => number = () => Date.now(),
  ) {}

  getTrays(): readonly ErrorTray[] {
    return this.kept;
  }

  /**
   * Shows an error. With a dedupe key that a kept tray already has, that
   * tray is replaced where it stands; otherwise a new tray goes to the end
   * and, past the limit, the oldest are pushed out.
   */
  pushError(options: PushedError): ErrorTray {
    const createdAt = this.clock();
    if (options.dedupeKey != null) {
      const at = this.kept.findIndex((tray) => tray.dedupeKey === options.dedupeKey);
      const earlier = at === -1 ? undefined : this.kept[at];
      if (earlier != null) {
        const repeat = repeatOf(earlier, options, createdAt);
        this.kept = this.kept.with(at, repeat);
        this.tell({ type: "pushed", tray: repeat });
        return repeat;
      }
    }

    const tray: TrayDraft = {
      kind: "error",
      id: this.newId(),
      agentId: options.agentId,
      title: options.title,
      detail: options.detail,
      requestId: options.requestId,
      createdAt,
    };
    // The fields below are only there when the push has something to say for them.
    if (options.errorKind != null) tray.errorKind = options.errorKind;
    if (options.rawDetail != null) tray.rawDetail = options.rawDetail;
    const actions = actionsToShow(options.actions);
    if (actions !== undefined) tray.actions = actions;
    if (options.dedupeKey != null) {
      tray.dedupeKey = options.dedupeKey;
      tray.count = options.count ?? 1;
    }

    this.kept = [...this.kept, tray];
    this.tell({ type: "pushed", tray });
    this.dropOldest();
    return tray;
  }

  clearAll(): void {
    if (this.kept.length === 0) return;
    this.kept = [];
    this.tell({ type: "cleared" });
  }

  /** Takes away every tray with that id and tells it once. False when no tray has it. */
  dismiss(id: string): boolean {
    if (this.take((tray) => tray.id === id).length === 0) return false;
    this.tell({ type: "dismissed", id });
    return true;
  }

  clearForAgent(agentId: string): void {
    this.tellDismissed(this.take((tray) => tray.agentId === agentId));
  }

  /** Adds a listener. What is handed back takes it away again, and gives the emitter itself, as it always has. */
  subscribe(listener: (event: TrayEvent) => void): () => void {
    this.told.on(EVENT, listener);
    return () => this.told.off(EVENT, listener);
  }

  /** Takes the trays that match out of the list and hands them back. With none, the list is left as it is. */
  private take(matches: (tray: ErrorTray) => boolean): ErrorTray[] {
    const taken = this.kept.filter(matches);
    if (taken.length > 0) this.kept = this.kept.filter((tray) => !matches(tray));
    return taken;
  }

  /** Past the limit, the oldest trays leave, each told as dismissed. */
  private dropOldest(): void {
    const tooMany = this.kept.length - MAX_TRAYS;
    if (tooMany <= 0) return;
    const oldest = this.kept.slice(0, tooMany);
    this.kept = this.kept.slice(tooMany);
    this.tellDismissed(oldest);
  }

  private tellDismissed(trays: readonly ErrorTray[]): void {
    for (const tray of trays) this.tell({ type: "dismissed", id: tray.id });
  }

  /** Tells every listener, in turn. One that throws ends the telling, and the call that caused it. */
  private tell(event: TrayEvent): void {
    this.told.emit(EVENT, event);
  }
}
