import type { Bot, ThreadSnapshot } from "@rakazo/contracts";
import {
  caisraApplyEvent,
  caisraRowsFromBlocks,
  caisraWaiting,
  caisraWorking,
  LiveOutcome,
  runThreadSubscription,
} from "@rakazo/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ThreadRow } from "../Thread.js";
import { rpc } from "./rpc.js";

/**
 * A live conversation.
 *
 * The whole chain, and every link of it is the fork's except the last:
 *
 * 1. `threads.get` for what is there now.
 * 2. `threads.subscribe` for what happens next, run through their own
 *    `runThreadSubscription`, which owns the reconnect, the replay from a
 *    cursor and the backoff. That is the part nobody should write twice.
 * 3. `caisraApplyEvent` folds an event into the snapshot, and says `refetch`
 *    rather than guessing when it meets something it has no rule for.
 * 4. `caisraRowsFromBlocks` turns each message's blocks into the rows the
 *    thread draws. This is the only Caisra-shaped link, and it is the one the
 *    design is about.
 *
 * Nothing in their tree is edited to make this work.
 */
export interface LiveThread {
  rows: readonly ThreadRow[];
  working: boolean;
  waiting: boolean;
  /** Nothing has come back yet. The thread draws empty rather than wrong. */
  loading: boolean;
  /** The last thing that went wrong, said in a sentence. */
  error?: string;
  send: (text: string) => Promise<void>;
  stop: () => Promise<void>;
  /** A choice card's button, answered. */
  answer: (messageId: string, runId: string, answer: string) => Promise<void>;
}

export function useThread(botId: string | undefined, names: Record<string, string>): LiveThread {
  const [snapshot, setSnapshot] = useState<ThreadSnapshot | null>(null);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  // The subscription reads the current snapshot without re-subscribing every
  // time a message lands, which is what a dependency on state would do.
  const current = useRef<ThreadSnapshot | null>(null);
  const commit = useCallback((next: ThreadSnapshot | null) => {
    current.current = next;
    setSnapshot(next);
  }, []);

  useEffect(() => {
    if (!botId) {
      commit(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    commit(null);
    const abort = new AbortController();
    const refresh = async () => {
      const fresh = await rpc.threads.get({ botId }, { signal: abort.signal });
      if (!abort.signal.aborted) {
        commit(fresh);
        setLoading(false);
        setError(undefined);
      }
      return fresh;
    };

    void runThreadSubscription({
      signal: abort.signal,
      loadInitial: () => refresh().catch(() => null),
      loadHead: () => rpc.threads.head({ botId }, { signal: abort.signal }).catch(() => null),
      refresh: () => refresh().catch(() => null),
      currentSnapshot: () => current.current,
      subscribe: (cursor) => rpc.threads.subscribe({ botId, cursor }, { signal: abort.signal }),
      applyEvent: (event) => {
        const held = current.current;
        if (!held) return;
        const result = caisraApplyEvent(held, event);
        if (result.outcome === LiveOutcome.Changed) commit(result.snapshot);
        // An event we have no rule for: ask, rather than draw something stale.
        else if (result.outcome === LiveOutcome.Refetch) void refresh().catch(() => undefined);
      },
      onEvent: () => undefined,
    }).catch((cause: unknown) => {
      if (abort.signal.aborted) return;
      setError(cause instanceof Error ? cause.message : String(cause));
      setLoading(false);
    });

    return () => abort.abort();
  }, [botId, commit]);

  const rows = useMemo<ThreadRow[]>(() => {
    if (!snapshot) return [];
    return snapshot.messages.flatMap((message) =>
      caisraRowsFromBlocks(message.blocks, { nameFor: (id) => names[id] }).map(
        (row): ThreadRow =>
          // Who is speaking belongs to the message rather than to the block,
          // so it is the one thing added on the way past.
          row.kind === "text"
            ? { ...row, from: message.role === "user" ? "person" : "agent" }
            : row,
      ),
    );
  }, [snapshot, names]);

  const send = useCallback(
    async (text: string) => {
      if (!botId || !text.trim()) return;
      try {
        await rpc.threads.send({ botId, text });
        setError(undefined);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    },
    [botId],
  );

  const stop = useCallback(async () => {
    if (!botId) return;
    await rpc.threads.stop({ botId }).catch(() => undefined);
  }, [botId]);

  const answer = useCallback(
    async (messageId: string, runId: string, value: string) => {
      if (!botId) return;
      await rpc.threads.answer({ botId, messageId, runId, answer: value }).catch(() => undefined);
    },
    [botId],
  );

  return {
    rows,
    working: snapshot ? caisraWorking(snapshot) : false,
    waiting: snapshot ? caisraWaiting(snapshot) : false,
    loading,
    ...(error ? { error } : {}),
    send,
    stop,
    answer,
  };
}

/**
 * The agents, and their conversations' last lines.
 *
 * Refreshed on a run starting or finishing, because that is when a preview
 * changes; there is no polling.
 */
export function useBots(): {
  bots: readonly Bot[];
  loading: boolean;
  error?: string;
  reload: () => void;
} {
  const [bots, setBots] = useState<readonly Bot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [epoch, setEpoch] = useState(0);

  useEffect(() => {
    const abort = new AbortController();
    void rpc.bots
      // A procedure with no input takes the options in the second place.
      .list(undefined, { signal: abort.signal })
      .then((list) => {
        if (abort.signal.aborted) return;
        setBots(list);
        setError(undefined);
      })
      .catch((cause: unknown) => {
        if (abort.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
    // `epoch` is what `reload` bumps. Without it here the button would be a
    // dead control, which is the fault this whole design keeps coming back to.
  }, [epoch]);

  return {
    bots,
    loading,
    ...(error ? { error } : {}),
    reload: () => setEpoch((one) => one + 1),
  };
}
