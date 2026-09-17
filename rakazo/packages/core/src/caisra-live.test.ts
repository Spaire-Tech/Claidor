import type { ProductEvent, ThreadSnapshot } from "@rakazo/contracts";
import { describe, expect, test } from "vitest";
import { caisraApplyEvent, caisraWaiting, caisraWorking, LiveOutcome } from "./caisra-live.js";

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
  test("working, from a running run", () => {
    expect(caisraWorking({ run: { status: "running" } } as unknown as ThreadSnapshot)).toBe(true);
    expect(caisraWorking({ run: { status: "completed" } } as unknown as ThreadSnapshot)).toBe(
      false,
    );
    expect(caisraWorking({ run: null } as unknown as ThreadSnapshot)).toBe(false);
  });

  test("working, from any of several runs", () => {
    expect(
      caisraWorking({
        run: null,
        activeRuns: [{ status: "completed" }, { status: "running" }],
      } as unknown as ThreadSnapshot),
    ).toBe(true);
  });

  test("waiting is not working", () => {
    // Nothing is happening until the person answers, so the header says so
    // rather than showing the dots.
    const held = { run: { status: "waiting_input" } } as unknown as ThreadSnapshot;
    expect(caisraWaiting(held)).toBe(true);
    expect(caisraWorking(held)).toBe(false);
  });
});
