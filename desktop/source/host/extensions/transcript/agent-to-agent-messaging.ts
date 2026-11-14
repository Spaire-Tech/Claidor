import { staffedFirstRunCue } from "../../../shared/agents/chief-of-staff.js";
import { firstRunCueInLanguage } from "../../../shared/user-language.js";
import {
  buildAgentInboundBatchWakePrompt,
  buildAgentInboundWakePrompt,
  buildNetworkInboundWakePrompt,
  clampAgentMessage,
} from "../../agents/agent-messaging.js";
import { sandErrorDetail } from "../../ports/telemetry.js";
import { resolveAgentMessageHopCap } from "../../../shared/inference/turn-step-budget.js";
import { entryRaisesUserActivitySignal } from "../../../shared/transcript.js";
import { describeAgentRunError } from "./agent-run-error.js";
import { say } from "../../../shared/say.js";
import { loadAgentInboundImages } from "./send-message-shaping.js";
import { nextEntryId } from "./transcript-entry-ids.js";
import { getTranscript } from "./transcript-store.js";
import { classifyAgentError } from "./turn-runtime.js";
import type { TranscriptManagerLike } from "./transcript-hub.js";

export interface AgentInboundMessage {
  from: { id: string; name: string };
  text: string;
  timestampMs: number;
  images?: readonly { url: string; alt?: string }[];
  priority?: boolean;
  isDisplayed?: boolean;
  isRedriven?: boolean;
  // How many agent messages in a row led here, each waking the next: 1 for a
  // message sent from a turn a person (or a routine) started, one more for
  // each message sent from a turn another agent's message woke.
  hop?: number;
  // From one of the person's agents outside Simeon, over their Simeon
  // network (14 November 2026): its address there, how it hears the answer
  // ("chat": it reads this chat; "send": only what is sent to its address),
  // the server's caution if it has one, and the nonce the server finds the
  // message's line by.
  network?: { address: string; answer: "chat" | "send"; nonce: string; note?: string };
}

/** Who a message from the person's Simeon network is from, as the inbox reads it off the server's message (chat-copy/chat-inbox.ts). */
export interface NetworkSender {
  readonly address: string;
  readonly name: string;
  readonly answer: "chat" | "send";
  readonly note?: string;
}

export function agentMessageHopRefusal(cap: number): string {
  return `Not sent: agents have passed ${cap} messages in a row, each waking the next, without a person. Stop the back-and-forth here. If the person should know or decide something, tell them with SendMessage; once they reply, you can message other agents again.`;
}
export function partitionAgentInbound<T extends { priority?: boolean }>(
  messages: readonly T[],
): { priority: T[]; rest: T[] } {
  const priority: T[] = [],
    rest: T[] = [];
  for (const message of messages)
    (message.priority === true ? priority : rest).push(message);
  return { priority, rest };
}
export function prioritizeAgentInbound<T extends { priority?: boolean }>(
  messages: readonly T[],
): T[] {
  const parts = partitionAgentInbound(messages);
  return [...parts.priority, ...parts.rest];
}
export function mergeAgentInboundQueue<T extends { priority?: boolean }>(
  queued: readonly T[],
  deferred: readonly T[],
): T[] {
  const newer = partitionAgentInbound(queued),
    older = partitionAgentInbound(deferred);
  return [...newer.priority, ...older.priority, ...older.rest, ...newer.rest];
}

/**
 * The turns a batch of agent messages is run in (8 October 2026): a priority
 * message alone, a new agent's staffing brief (`firstAlone`) alone, and every
 * other message together in one turn. Until then each message was a turn of
 * its own on the agent's whole conversation, as in the upstream app.
 */
export function groupAgentInboundTurns<T extends { priority?: boolean }>(
  messages: readonly T[],
  firstAlone: boolean,
): T[][] {
  const turns: T[][] = [];
  let together: T[] = [];
  for (const [index, message] of messages.entries()) {
    if (message.priority === true || (index === 0 && firstAlone)) {
      if (together.length > 0) turns.push(together);
      together = [];
      turns.push([message]);
    } else together.push(message);
  }
  if (together.length > 0) turns.push(together);
  return turns;
}

/**
 * How long a reply in an agent back-and-forth waits before it wakes its
 * agent, so the replies that come back together wake it once (8 October
 * 2026). A message sent from a turn the person or a routine started (hop 1)
 * and a priority message still wake at once.
 */
export const AGENT_REPLY_SETTLE_MS = 15_000;

export class AgentToAgentMessaging {
  readonly pendingAgentInbound = new Map<string, AgentInboundMessage[]>();
  readonly revivingAgentInboundIds = new Set<string>();
  // The hop of the agent message an agent's current turn was woken by, while
  // that turn runs (runAgentInboundWake). A message it sends then is one hop
  // further; one sent from any other turn starts again at 1.
  readonly agentWakeHops = new Map<string, number>();
  // A pending wake for replies that settle together (AGENT_REPLY_SETTLE_MS).
  readonly agentReplyTimers = new Map<string, ReturnType<typeof setTimeout>>();
  agentReplySettleMs = AGENT_REPLY_SETTLE_MS;
  constructor(readonly tm: TranscriptManagerLike) {}

  async sendToAgent(
    fromAgentId: string,
    toAgentId: string,
    text: string,
    images: readonly { url: string; alt?: string }[] = [],
    priority = false,
  ): Promise<string> {
    const message = clampAgentMessage(text);
    if (message.length === 0) return "Message was empty; nothing was sent.";
    if (toAgentId === fromAgentId) return "An agent can't message itself.";
    if (this.tm.sessions.isAgentGone(toAgentId))
      return "That agent no longer exists.";
    if (this.tm.groupChat.isRemoteRoomAgentId(toAgentId))
      return "That is a shared chat hosted by another user; agents can't message it directly.";
    const roster = await this.tm.sessionStore.listAgents();
    const target = roster.find((agent: any) => agent.id === toAgentId);
    if (target == null) return `No agent found with id ${toAgentId}.`;
    if (target.isGroup) {
      const ack = await this.tm.postToGroup(
        fromAgentId,
        toAgentId,
        message,
        priority,
      );
      const notes: string[] = [];
      if (images.length > 0)
        notes.push(
          `Note: the attached image${images.length === 1 ? " was" : "s were"} NOT delivered — group messages are text-only for now; send images to an agent directly.`,
        );
      if (priority)
        notes.push(
          "Note: priority is 1:1 only — this post did not interrupt members.",
        );
      return notes.length === 0 ? ack : `${ack} ${notes.join(" ")}`;
    }
    const hop = (this.agentWakeHops.get(fromAgentId) ?? 0) + 1;
    const hopCap = resolveAgentMessageHopCap();
    if (hop > hopCap) return agentMessageHopRefusal(hopCap);
    this.tm.productAnalytics.trackEvent("sand.agent_message.sent", {
      from_agent_id: fromAgentId,
      to_agent_id: toAgentId,
      is_group_target: false,
      is_priority: priority,
    });
    const sender = roster.find((agent: any) => agent.id === fromAgentId);
    this.tm.sessions.liveSessions
      .get(fromAgentId)
      ?.db.addConversationPartner(toAgentId);
    this.appendAgentOutboundEntry(
      fromAgentId,
      { id: toAgentId, name: target.name, kind: "agent" },
      message,
      Date.now(),
      images,
    );
    const inbound: AgentInboundMessage = {
      from: { id: fromAgentId, name: sender?.name ?? say(this.tm.userLanguage?.(), "agent.unnamed") },
      text: message,
      timestampMs: Date.now(),
      ...(images.length === 0 ? {} : { images }),
      ...(priority ? { priority: true } : {}),
      hop,
    };
    const queued = this.pendingAgentInbound.get(toAgentId) ?? [];
    if (priority) {
      this.pendingAgentInbound.set(toAgentId, [inbound, ...queued]);
      this.steerRecipientForPriorityPeer(toAgentId);
    } else {
      queued.push(inbound);
      this.pendingAgentInbound.set(toAgentId, queued);
    }
    if (priority || hop < 2) void this.reviveForAgentInbound(toAgentId);
    else this.scheduleAgentReplyWake(toAgentId);
    return priority
      ? `Sent to ${target.name} as a priority message — it will interrupt their current non-user work and wake them now. This is asynchronous — if they reply, it'll arrive later as a new message that wakes you; don't wait on it now.`
      : `Sent to ${target.name}. This is asynchronous — if they reply, it'll arrive later as a new message that wakes you; don't wait on it now.`;
  }

  /**
   * A message from one of the person's agents outside Simeon, taken from
   * the server's inbox (14 November 2026; the founder: "have the message
   * between the two work as if agents talking to each other"). It is
   * written in the chat as that agent's message ("Message from"), not as
   * the person's, and the agent is woken as a teammate's message wakes it.
   * The line carries the server's nonce: the server finds it by that and
   * reads the agent's answer back to the sender. A message whose line is
   * already in the chat is not written, and wakes nobody, a second time.
   */
  async receiveFromNetwork(
    toAgentId: string,
    sender: NetworkSender,
    text: string,
    nonce: string,
  ): Promise<void> {
    const message = clampAgentMessage(text);
    if (message.length === 0) return;
    const session = await this.tm.sessions.resolveBackgroundSession(toAgentId);
    if (
      this.tm.groupChat.isGroupSession(session) ||
      this.tm.groupChat.isRemoteRoomSession(session)
    )
      return;
    const isActive = session.id === this.tm.sessions.activeSession?.id;
    const entries: readonly any[] = isActive
      ? getTranscript()
      : session.db.getTranscriptEntries();
    if (entries.some((entry) => entry?.clientNonce === nonce)) return;
    const inbound: AgentInboundMessage = {
      from: { id: `network:${sender.address}`, name: sender.name },
      text: message,
      timestampMs: Date.now(),
      hop: 1,
      network: {
        address: sender.address,
        answer: sender.answer,
        nonce,
        ...(sender.note == null ? {} : { note: sender.note }),
      },
    };
    this.appendAgentInboundEntries(session, [inbound]);
    const queued = this.pendingAgentInbound.get(toAgentId) ?? [];
    queued.push({ ...inbound, isDisplayed: true });
    this.pendingAgentInbound.set(toAgentId, queued);
    void this.reviveForAgentInbound(toAgentId);
  }

  steerRecipientForPriorityPeer(agentId: string): void {
    const scheduler = this.tm.runLifecycle.runScheduler;
    if (scheduler == null || scheduler.getActiveLane(agentId) === "user")
      return;
    const reason = "superseded by a priority agent message";
    const wasInFlight = this.tm.runLifecycle.runningAgentIds().has(agentId);
    const hadGroupRun =
      this.tm.runnerRegistry.activeGroupMemberRunners
        .get(agentId)
        ?.interrupt(reason) ?? false;
    if (hadGroupRun) this.tm.groupChat.dmPreemptedGroupMemberIds.add(agentId);
    const hadDirectRun =
      this.tm.runnerRegistry.runners.get(agentId)?.interrupt(reason) ?? false;
    if (hadDirectRun)
      this.tm.backgroundWakes.dmPreemptedWakeAgentIds.add(agentId);
    if (hadDirectRun || hadGroupRun || wasInFlight)
      this.tm.telemetry.reportTurnInterrupt({
        conversationId: agentId,
        reason: "agent_steer",
        hadActiveRun: hadDirectRun || hadGroupRun,
        wasInFlight,
      });
  }

  scheduleAgentReplyWake(agentId: string): void {
    if (this.agentReplyTimers.has(agentId)) return;
    const timer = setTimeout(() => {
      this.agentReplyTimers.delete(agentId);
      void this.reviveForAgentInbound(agentId);
    }, this.agentReplySettleMs);
    (timer as { unref?: () => void }).unref?.();
    this.agentReplyTimers.set(agentId, timer);
  }

  async reviveForAgentInbound(agentId: string): Promise<void> {
    if (
      !this.tm.execution.canExecute ||
      this.revivingAgentInboundIds.has(agentId)
    )
      return;
    this.revivingAgentInboundIds.add(agentId);
    try {
      while ((this.pendingAgentInbound.get(agentId)?.length ?? 0) > 0) {
        const messages = prioritizeAgentInbound(
          this.pendingAgentInbound.get(agentId) ?? [],
        );
        this.pendingAgentInbound.delete(agentId);
        await this.runAgentInboundWake(agentId, messages);
      }
    } finally {
      this.revivingAgentInboundIds.delete(agentId);
    }
  }

  async runAgentInboundWake(
    agentId: string,
    messages: readonly AgentInboundMessage[],
  ): Promise<void> {
    if (messages.length === 0 || !this.tm.execution.canExecute) return;
    let session: any;
    try {
      session = await this.tm.sessions.resolveBackgroundSession(agentId);
    } catch {
      return;
    }
    if (
      this.tm.groupChat.isGroupSession(session) ||
      this.tm.groupChat.isRemoteRoomSession(session)
    )
      return;
    this.appendAgentInboundEntries(
      session,
      messages.filter((message) => message.isDisplayed !== true),
    );
    const runner = this.tm.runnerRegistry.getRunner(session);
    this.tm.runLifecycle.beginSessionRun(session);
    await this.tm.runLifecycle.enqueueExclusiveRun(
      session.id,
      async () => {
        this.tm.turnRuntime.activeRequestPrompts.delete(session.id);
        this.tm.turnRuntime.activeRequestSources.set(session.id, "agent");
        this.tm.backgroundWakes.dmPreemptedWakeAgentIds.delete(session.id);
        try {
          // One turn for the messages that arrived together; a priority
          // message and a staffing brief keep a turn of their own.
          // A message from the person's network keeps a turn of its own
          // too: its answer goes another way than a teammate's.
          const turns = groupAgentInboundTurns(
            messages,
            session.db.getIntroductionPending?.() === true,
          ).flatMap((turn) =>
            turn.some((queued) => queued.network != null)
              ? turn.map((queued) => [queued])
              : [turn],
          );
          for (const [index, turn] of turns.entries()) {
            if (
              index > 0 &&
              (this.pendingAgentInbound.get(agentId) ?? []).some(
                (pending) => pending.priority === true,
              )
            ) {
              const deferred = turns
                .slice(index)
                .flat()
                .map((remaining) => ({ ...remaining, isDisplayed: true }));
              this.pendingAgentInbound.set(
                agentId,
                mergeAgentInboundQueue(
                  this.pendingAgentInbound.get(agentId) ?? [],
                  deferred,
                ),
              );
              return;
            }
            const message = turn[0]!;
            const selectedImages = await loadAgentInboundImages(
              turn.flatMap((queued) => queued.images ?? []),
            );
            this.agentWakeHops.set(
              agentId,
              Math.max(...turn.map((queued) => queued.hop ?? 1)),
            );
            // A brief as the agent's first message is its staffing (7 October
            // 2026): the first turn reads it and introduces the agent to the
            // person as the one now on the job, in place of the greeting the
            // kickstart would run (`shared/agents/chief-of-staff.ts`).
            const isStaffing = session.db.getIntroductionPending?.() === true && index === 0;
            if (isStaffing) session.db.setIntroductionPending(false);
            const prompt =
              turn.length === 1
                ? message.network != null
                  ? buildNetworkInboundWakePrompt({
                      from: message.from,
                      text: message.text,
                      address: message.network.address,
                      answer: message.network.answer,
                      ...(message.network.note == null ? {} : { note: message.network.note }),
                    })
                  : buildAgentInboundWakePrompt(message)
                : buildAgentInboundBatchWakePrompt(turn);
            const result = await runner.run(
              isStaffing
                ? `${firstRunCueInLanguage(staffedFirstRunCue({ fromName: message.from.name, personName: this.tm.requestContextUserFullName?.() ?? null }), this.tm.userLanguage?.())}\n\n${prompt}`
                : prompt,
              {
                hidden: true,
                callReason: "agent_wake",
                isSilenceAllowed: true,
                ...(selectedImages.length === 0 ? {} : { selectedImages }),
              },
            );
            const preempted =
              this.tm.backgroundWakes.dmPreemptedWakeAgentIds.delete(
                session.id,
              );
            if (result.aborted && result.quiescedForUpgrade !== true) {
              if (!preempted || this.tm.sessions.isAgentGone(agentId)) return;
              const redrivable = turns
                .slice(index)
                .flat()
                .filter((remaining) => remaining.isRedriven !== true)
                .map((remaining) => ({
                  ...remaining,
                  isDisplayed: true,
                  isRedriven: true,
                }));
              if (redrivable.length > 0)
                this.pendingAgentInbound.set(
                  agentId,
                  mergeAgentInboundQueue(
                    this.pendingAgentInbound.get(agentId) ?? [],
                    redrivable,
                  ),
                );
              return;
            }
          }
          await this.tm.roster.emitAgentUpdate(session.id);
        } catch (error) {
          this.tm.telemetry.reportAgentError({
            source: "agent",
            conversationId: session.id,
            requestId: this.tm.runLifecycle.lastRequestIdBySession.get(
              session.id,
            ),
            error: classifyAgentError(error),
            detail: sandErrorDetail(error),
          });
          this.tm.trayErrors.pushError({
            agentId: session.id,
            title: say(this.tm.userLanguage?.(), "tray.agentMessageFailed"),
            ...describeAgentRunError(error, this.tm.userLanguage?.()),
          });
        } finally {
          this.agentWakeHops.delete(agentId);
          this.tm.runLifecycle.endSessionRun(session);
        }
      },
      { lane: "agent", source: "agent" },
    );
  }

  appendAgentInboundEntries(
    session: any,
    messages: readonly AgentInboundMessage[],
  ): void {
    const isActive = session.id === this.tm.sessions.activeSession?.id;
    let raisesActivity = false;
    for (const message of messages) {
      // An agent outside Simeon is no teammate of this one: nothing here can message it by that id.
      if (message.network == null) session.db.addConversationPartner(message.from.id);
      const entries = isActive
        ? getTranscript()
        : session.db.getTranscriptEntries();
      const entry = {
        kind: "message",
        id: nextEntryId(entries, "user-message"),
        role: "user",
        content: message.text,
        isStreaming: false,
        timestampMs: message.timestampMs,
        fromAgent: message.network == null ? message.from : { ...message.from, kind: "network" },
        ...(message.network == null ? {} : { clientNonce: message.network.nonce }),
        ...(message.images?.length ? { images: message.images } : {}),
      };
      raisesActivity ||= entryRaisesUserActivitySignal(entry);
      if (isActive) this.tm.appendEntry(entry);
      else session.db.appendTranscriptEntry(entry);
    }
    if (!isActive) {
      if (raisesActivity) this.tm.sessionStore.markSessionActivity(session);
      void this.tm.roster.emitAgentUpdate(session.id);
    }
  }
  /** Which agent asked each cloud agent last, for its first words back (`noteCloudAgentSaid`); the kept wake says the same after a restart. */
  private readonly cloudAgentAskers = new Map<string, string>();
  /**
   * What an agent asked a cloud agent, at a launch or a follow-up, written
   * into that agent's chat as its message to it ("Messaged", as a message to
   * a teammate is; 13 November 2026, the founder: "message to and message
   * from, like messaging agents work"). A line of the chat only: the launch
   * itself went to the server. Never in the way of the launch.
   */
  noteCloudAgentAsked(
    agentId: string,
    cloudAgent: { readonly id: string; readonly name: string; readonly coder?: string },
    text: string,
  ): void {
    try {
      const words = text.trim();
      if (cloudAgent.id === "" || words === "") return;
      this.cloudAgentAskers.set(cloudAgent.id, agentId);
      this.appendAgentOutboundEntry(
        agentId,
        {
          id: cloudAgent.id,
          name: cloudAgent.name.trim(),
          kind: "cloud-agent",
          ...(cloudAgent.coder === undefined ? {} : { coder: cloudAgent.coder }),
        },
        words,
        Date.now(),
      );
    } catch {
      /* the chat's line is extra */
    }
  }
  /**
   * A cloud agent's first words in a turn ("On it. I'll read the README
   * first."), written into the chat of the agent that asked it as its
   * message back ("Message from"), as a teammate's answer is. The agent that
   * asked is the one `noteCloudAgentAsked` named, else the one whose wake is
   * kept for it (after a restart). A line of the chat only: nobody is woken;
   * the agent is woken when the cloud agent ends. True when a line was written.
   */
  async noteCloudAgentSaid(
    cloudAgent: { readonly id: string; readonly name: string; readonly coder?: string },
    text: string,
  ): Promise<boolean> {
    try {
      const words = text.trim();
      if (cloudAgent.id === "" || words === "") return false;
      const kept = (this.tm.pendingWakeStore?.listPending?.() ?? []) as readonly { agentId?: string; kind?: string; workId?: string }[];
      const agentId = this.cloudAgentAskers.get(cloudAgent.id)
        ?? kept.find((marker) => marker.kind === "cloud-agent" && marker.workId === cloudAgent.id)?.agentId;
      if (agentId === undefined || this.tm.sessions.deletedAgentIds?.has(agentId) === true) return false;
      const session = this.tm.sessions.liveSessions.get(agentId) ?? await this.tm.sessions.resolveBackgroundSession(agentId);
      if (session == null) return false;
      this.appendCloudAgentAnswer(session, { id: cloudAgent.id, name: cloudAgent.name.trim(), ...(cloudAgent.coder === undefined ? {} : { coder: cloudAgent.coder }) }, words, Date.now());
      return true;
    } catch {
      return false;
    }
  }
  /**
   * A cloud agent's words, written into the chat of the agent that started
   * it as a message from it (13 November 2026; the founder: the agent "talks
   * to the cloud agent the same way it talks to another agent"): its first
   * words in a turn (`noteCloudAgentSaid`) and its report at the end
   * (`CompletionRevivals.noteCloudAgentAnswers`). The apps
   * draw "Message from" with its name, and open its conversation from there.
   * A line of the chat only: the agent itself is woken with the report apart
   * (`runSubagentRevival`), and a cloud agent is no conversation partner.
   * `coder` is the program that coded ("claude-code", "codex"): the apps
   * draw its mascot as the cloud agent's picture.
   */
  appendCloudAgentAnswer(
    session: any,
    cloudAgent: {
      readonly id: string;
      readonly name: string;
      readonly coder?: string;
    },
    text: string,
    timestampMs: number,
  ): void {
    const isActive = session.id === this.tm.sessions.activeSession?.id;
    const entries: readonly any[] = isActive ? getTranscript() : session.db.getTranscriptEntries();
    // Said once: a turn whose first words are its whole answer isn't written twice.
    const last = entries.findLast((entry) => entry?.kind === "message" && (entry.fromAgent?.id === cloudAgent.id || entry.toAgent?.id === cloudAgent.id));
    if (last?.fromAgent?.id === cloudAgent.id && last.content === text) return;
    const entry = {
      kind: "message",
      id: nextEntryId(entries, "user-message"),
      role: "user",
      content: text,
      isStreaming: false,
      timestampMs,
      fromAgent: {
        id: cloudAgent.id,
        name: cloudAgent.name,
        kind: "cloud-agent",
        ...(cloudAgent.coder === undefined ? {} : { coder: cloudAgent.coder }),
      },
    };
    if (isActive) this.tm.appendEntry(entry);
    else {
      session.db.appendTranscriptEntry(entry);
      void this.tm.roster.emitAgentUpdate(session.id);
    }
  }
  appendAgentOutboundEntry(
    fromAgentId: string,
    toAgent: { readonly kind?: string; readonly [key: string]: unknown },
    text: string,
    timestampMs: number,
    images: readonly { url: string; alt?: string }[] = [],
  ): void {
    const session = this.tm.sessions.liveSessions.get(fromAgentId);
    if (session == null) return;
    const isActive = session.id === this.tm.sessions.activeSession?.id;
    const entry = {
      kind: "message",
      id: nextEntryId(
        isActive ? getTranscript() : session.db.getTranscriptEntries(),
        "assistant-message",
      ),
      role: "assistant",
      content: text,
      isStreaming: false,
      timestampMs,
      toAgent,
      ...(images.length === 0 ? {} : { images }),
    };
    if (isActive) this.tm.appendEntry(entry);
    else {
      session.db.appendTranscriptEntry(entry);
      if (entryRaisesUserActivitySignal(entry))
        this.tm.sessionStore.markSessionActivity(session);
      void this.tm.roster.emitAgentUpdate(session.id);
    }
  }
}
