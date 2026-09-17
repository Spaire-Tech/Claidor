import type { ProductEvent, ThreadSnapshot } from "@rakazo/contracts";
import { describe, expect, test } from "vitest";
import {
  ACTIVE_RUN_STATUSES,
  caisraApplyEvent,
  caisraVisible,
  caisraWaiting,
  caisraWorking,
  LiveOutcome,
} from "./caisra-live.js";

const snapshot = (over: Partial<ThreadSnapshot> = {}): ThreadSnapshot =>
  ({
    threadId: "t1",
    cursor: 10,
    messages: [],
    olderCursor: null,
    botId: "b1",
    run: null,
    ...over,
  }) as ThreadSnapshot;

const event = (over: Partial<ProductEvent> = {}): ProductEvent =>
  ({
    id: "e1",
    spaceId: "s1",
    threadId: "t1",
    botId: "b1",
    seq: 11,
    type: "thread.message.created",
    createdAt: "2026-09-18T09:00:00.000Z",
    payload: { id: "m1", role: "bot", blocks: [{ kind: "text", text: "Hello" }] },
    ...over,
  }) as ProductEvent;

describe("an event against the thread", () => {
  test("a new message is appended", () => {
    const result = caisraApplyEvent(snapshot(), event());
    expect(result.outcome).toBe(LiveOutcome.Changed);
    expect(result.snapshot.messages).toHaveLength(1);
    expect(result.snapshot.messages[0]?.blocks).toEqual([{ kind: "text", text: "Hello" }]);
    expect(result.snapshot.cursor).toBe(11);
  });

  test("a message that is already there is updated in place", () => {
    const first = caisraApplyEvent(snapshot(), event()).snapshot;
    const result = caisraApplyEvent(
      first,
      event({
        seq: 12,
        type: "thread.message.updated",
        payload: { id: "m1", role: "bot", blocks: [{ kind: "text", text: "Hello there" }] },
      }),
    );
    expect(result.snapshot.messages).toHaveLength(1);
    expect(result.snapshot.messages[0]?.blocks).toEqual([{ kind: "text", text: "Hello there" }]);
  });

  test("the snapshot is never mutated", () => {
    // React reads identity. A snapshot changed in place draws nothing.
    const before = snapshot();
    const result = caisraApplyEvent(before, event());
    expect(before.messages).toHaveLength(0);
    expect(result.snapshot).not.toBe(before);
  });

  test("an event already folded in is ignored", () => {
    // The stream replays from a cursor on reconnect, so this is the ordinary
    // case and not an error.
    const before = snapshot({ cursor: 20 });
    const result = caisraApplyEvent(before, event({ seq: 15 }));
    expect(result.outcome).toBe(LiveOutcome.Ignored);
    expect(result.snapshot).toBe(before);
  });

  test("an event from another thread is ignored, not refetched", () => {
    const result = caisraApplyEvent(snapshot(), event({ threadId: "other" }));
    expect(result.outcome).toBe(LiveOutcome.Ignored);
  });

  test("a run event moves the cursor and nothing else", () => {
    const result = caisraApplyEvent(
      snapshot(),
      event({ seq: 11, type: "run.started", payload: {} }),
    );
    expect(result.outcome).toBe(LiveOutcome.Changed);
    expect(result.snapshot.cursor).toBe(11);
    expect(result.snapshot.messages).toHaveLength(0);
  });
});

describe("what we do not understand", () => {
  test("an event we have no rule for asks the server rather than guessing", () => {
    // This is the whole reason the reducer can be short and still be right.
    const result = caisraApplyEvent(snapshot(), event({ type: "thread.cleared", payload: {} }));
    expect(result.outcome).toBe(LiveOutcome.Refetch);
  });

  test("a kind we have no rule for asks", () => {
    // `thread.subagent`, `skill.draft.created`, `group.handoff`: real events
    // that say something this conversation does not draw from the payload.
    for (const type of ["thread.subagent", "skill.draft.created", "group.handoff"] as const) {
      expect(caisraApplyEvent(snapshot(), event({ type, payload: {} })).outcome).toBe(
        LiveOutcome.Refetch,
      );
    }
  });

  test("a message event with no message in it asks too", () => {
    const result = caisraApplyEvent(snapshot(), event({ payload: { nothing: true } }));
    expect(result.outcome).toBe(LiveOutcome.Refetch);
  });
});

describe("what the header says", () => {
  const withRun = (status: string) => ({ run: { status } }) as unknown as ThreadSnapshot;

  test("every status their run-state calls active counts, not just running", () => {
    // This is the bug this test exists for. An earlier pass tested
    // `status === "running"` by hand, so a run that was queued or leased --
    // which is what a run is for the first moments after you press send --
    // read as idle: no dots in the header, no "Working" in the sidebar, while
    // the agent was working. ACTIVE_RUN_STATUSES is theirs and is the answer.
    expect(ACTIVE_RUN_STATUSES).toEqual([
      "queued",
      "leased",
      "running",
      "waiting_input",
      "waiting_takeover",
    ]);
    for (const status of ["queued", "leased", "running"]) {
      expect(caisraWorking(withRun(status)), status).toBe(true);
    }
  });

  test("a finished run is not working", () => {
    for (const status of ["completed", "failed", "cancelled"]) {
      expect(caisraWorking(withRun(status)), status).toBe(false);
    }
    expect(caisraWorking({ run: null } as unknown as ThreadSnapshot)).toBe(false);
  });

  test("working, from any of several runs", () => {
    expect(
      caisraWorking({
        run: null,
        activeRuns: [{ status: "completed" }, { status: "queued" }],
      } as unknown as ThreadSnapshot),
    ).toBe(true);
  });

  test("waiting is active but it is not working", () => {
    // Nothing is happening until the person moves, so the header says so
    // rather than showing the dots. Takeover counts: the computer asking for
    // control is also the person's move.
    for (const status of ["waiting_input", "waiting_takeover"]) {
      expect(caisraWaiting(withRun(status)), status).toBe(true);
      expect(caisraWorking(withRun(status)), status).toBe(false);
    }
    expect(caisraWaiting(withRun("running"))).toBe(false);
  });
});

describe("what the person is meant to see", () => {
  const message = (id: string, blocks: unknown[], runId?: string) =>
    ({ id, blocks, ...(runId ? { runId } : {}) }) as never;

  test("a peer run's working history stays out of the conversation", () => {
    // Their rule, from message-visibility.ts. An earlier pass drew every
    // message in the snapshot.
    const kept = caisraVisible([
      message("m1", [{ kind: "text", text: "Hello" }]),
      message("m2", [{ kind: "bot_message_received", from: "yodo" }], "r1"),
      message("m3", [{ kind: "status", text: "reading a file" }], "r1"),
    ]);
    const ids = kept.map((one) => (one as { id: string }).id);
    expect(ids).toContain("m1");
    expect(ids).not.toContain("m3");
  });

  test("but the handoff itself stays, because the design draws it", () => {
    // The founder, 17 September: every agent posts its own results into the
    // shared conversation and each speaks for itself. Caisra draws a handoff
    // as a centred grey line, so hiding it would hide the thing the design is
    // about.
    const kept = caisraVisible([
      message("m2", [{ kind: "bot_message_received", from: "yodo" }], "r1"),
    ]);
    expect(kept).toHaveLength(1);
  });
});
