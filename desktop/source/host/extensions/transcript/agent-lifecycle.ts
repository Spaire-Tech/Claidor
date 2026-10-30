import { chiefOfStaffHello, chiefOfStaffKickstartPrompt, isChiefOfStaffTitle } from "../../../shared/agents/chief-of-staff.js";
import { firstRunCueInLanguage } from "../../../shared/user-language.js";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { isSandAgentLimitError } from "../../../shared/agents/agents.js";
import { errorLogTag } from "../../../shared/errors.js";
import { isAgentPeerMessageEntry } from "../../../shared/transcript.js";
import {
  cloneAgentDir,
  cloneAgentDisplayName,
} from "../../agents/agent-clone.js";
import { CANONICAL_AVATAR_FILENAME } from "../../agents/agent-avatar.js";
import { getSandProfilePath, readSandProfileFile } from "../../agents/agent-profile.js";
import { pickAgentColor } from "../../../shared/agents/agent-colors.js";
import { getAgentAutomationsDir } from "../../automations/automation-store.js";
import {
  SAND_DISK_SAVER_KICKSTART_PROMPT,
  SAND_DISK_SAVER_REAUDIT_PROMPT,
} from "../../../shared/agents/disk-saver.js";
import {
  SAND_ONBOARDING_KICKSTART_PROMPT,
  introductionFailedTrayKey,
} from "../../../shared/agents/onboarding.js";
import { sandErrorDetail } from "../../ports/telemetry.js";
import { SandAgentDb } from "../session/agent-db.js";
import { checkpointSandAgentDb } from "../../storage/store-db.js";
import { publishTranscriptMutation } from "../../transcript-mutation-events.js";
import { describeAgentRunError } from "./agent-run-error.js";
import { say } from "../../../shared/say.js";
import { createSendMessageEntry, isUserMessageEntry, type SendMessage } from "./send-message-shaping.js";
import { nextEntryId } from "./transcript-entry-ids.js";
import { getTranscript } from "./transcript-store.js";
import { classifyAgentError } from "./turn-runtime.js";
import type { TranscriptEntry, TranscriptManagerLike } from "./transcript-hub.js";

export class SandAgentLifecycleError extends Error {}

/**
 * Simeon's hello is written as the person watches (the founder, 30 October
 * 2026: "I want to show the thing being written. not the thing appearing out
 * of the blue"): it waits for his chat to be open, this long at most (the
 * app opens it as the first run ends, `Onboarding.handOff`), then each line
 * shows "Typing…" (`helloTypingMs`) and lands whole, never streamed.
 */
export const HELLO_OPEN_WAIT_MS = 8_000;

/** How long a line of his hello shows "Typing…" before it lands: longer for a longer line, from 1.2 to 3.2 seconds. */
export function helloTypingMs(line: string): number {
  return Math.min(3_200, Math.max(1_200, 500 + 18 * [...line].length));
}

interface CreateOptions {
  purpose?: string;
  isKickstartRequested?: boolean;
  isIntroductionSuppressed?: boolean;
  configureAgentDir?(dir: string): void;
}

export class AgentLifecycle {
  constructor(readonly tm: TranscriptManagerLike) {}

  /** The chats an app has opened (`kickstartIfPending` from the gateway's `openAgent…`), and a hello waiting for its own. */
  #openedChats = new Set<string>();
  #openWaiters = new Map<string, () => void>();
  /** A pause (the tests make it instant). */
  pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

  noteChatOpened(agentId: string): void {
    this.#openedChats.add(agentId);
    this.#openWaiters.get(agentId)?.();
  }

  /** Once an app has opened this chat, or after `ms`, whichever is first. */
  untilChatOpen(agentId: string, ms: number): Promise<void> {
    if (this.#openedChats.has(agentId)) return Promise.resolve();
    return new Promise((resolve) => {
      const done = (): void => {
        if (this.#openWaiters.get(agentId) === done) this.#openWaiters.delete(agentId);
        resolve();
      };
      this.#openWaiters.set(agentId, done);
      void this.pause(ms).then(done);
    });
  }

  async createAgent(
    profile: unknown,
    origin = "user",
    options: CreateOptions = {},
  ): Promise<any> {
    const previous = this.tm.sessions.activeSession;
    const next = await this.mintAgentSession(profile, origin, options);
    const now = Date.now();
    await this.tm.sessions.markSessionLeftBehind(previous, now);
    await this.tm.sessionStore.markSessionViewed(next, now);
    this.tm.sessions.invalidateDeferredActivation();
    await this.tm.sessions.replaceSession(next);
    this.tm.sessions.clearActiveTranscript(next.id);
    this.tm.roster.emit({ type: "cleared" });
    await this.tm.roster.emitAgents();
    const stamp = this.tm.roster.reserveSnapshotStamp();
    const summary = await this.tm.sessionStore.summarizeOpenSession(next);
    if (summary == null)
      throw new SandAgentLifecycleError(
        "Failed to summarize newly created Sand agent.",
      );
    if (options.isKickstartRequested === true)
      void this.kickstartCreatedAgent(next.id);
    return {
      agent: this.tm.roster.finalizeSummaryForRpc(summary, stamp),
      transcript: getTranscript(),
    };
  }
  async kickstartCreatedAgent(agentId: string): Promise<void> {
    let ready = false;
    try {
      ready = await this.tm.execution.isRunReady();
    } catch {}
    await this.kickstartAgent(agentId, ready);
  }
  async createBackgroundAgent(
    profile: unknown,
    origin = "user",
    options: CreateOptions = {},
  ): Promise<any> {
    const session = await this.mintAgentSession(profile, origin, options);
    try {
      const transcript = session.db.getTranscriptEntries();
      await this.tm.roster.emitAgents();
      const stamp = this.tm.roster.reserveSnapshotStamp();
      const summary = await this.tm.sessionStore.summarizeOpenSession(session);
      if (summary == null)
        throw new SandAgentLifecycleError(
          "Failed to summarize newly created Sand agent.",
        );
      return {
        agent: this.tm.roster.finalizeSummaryForRpc(summary, stamp),
        transcript,
      };
    } finally {
      await session.agentStore.dispose();
      session.db.close();
    }
  }
  // Agents are minted one at a time, so three hired in one step each see
  // the colours the others took (`withAgentColor`).
  #minting: Promise<unknown> = Promise.resolve();
  mintAgentSession(
    profile: unknown,
    origin: string,
    options: CreateOptions,
  ): Promise<any> {
    const minted = this.#minting.then(() => this.mintAgentSessionNow(profile, origin, options));
    this.#minting = minted.catch(() => {});
    return minted;
  }
  /**
   * The profile with a colour of its own when it brings none: the one fewest
   * agents are drawn in (`shared/agents/agent-colors.ts`). Until 7 October
   * 2026 a new agent had none and the window hashed one from its id, which
   * gave three hires in a row the same colour.
   */
  async withAgentColor(profile: unknown): Promise<unknown> {
    if (profile == null || typeof profile !== "object") return profile;
    const given = (profile as { avatarColor?: unknown }).avatarColor;
    if (typeof given === "string" && given.trim().length > 0) return profile;
    const agents: { id: string; color: string }[] = [];
    try {
      const store = this.tm.sessionStore;
      const ids: string[] = typeof store.listAgentRecordIds === "function"
        ? await store.listAgentRecordIds()
        : await store.listAgentIds();
      for (const id of ids)
        agents.push({ id, color: readSandProfileFile(getSandProfilePath(store.getAgentDir(id)))?.avatarColor ?? "" });
    } catch {}
    return { ...profile, avatarColor: pickAgentColor(agents) };
  }
  async mintAgentSessionNow(
    profile: unknown,
    origin: string,
    options: CreateOptions,
  ): Promise<any> {
    const session = await this.tm.sessionStore.createSession(
      await this.withAgentColor(profile),
      origin,
      options.purpose,
    );
    options.configureAgentDir?.(this.tm.sessionStore.getAgentDir(session.id));
    if (options.isIntroductionSuppressed !== true)
      session.db.setIntroductionPending(true);
    return session;
  }

  /** `opened`: an app just opened this chat (the gateway's `openAgent…`), which a hello waiting for it is told. */
  async kickstartAgent(agentId: string, isRunReady: boolean, opened = false): Promise<boolean> {
    if (opened) this.noteChatOpened(agentId);
    let session: any;
    try {
      session =
        this.tm.sessions.activeSession?.id === agentId
          ? this.tm.sessions.activeSession
          : await this.tm.sessions.resolveBackgroundSession(agentId);
    } catch {
      return false;
    }
    if (
      this.tm.groupChat.isGroupSession(session) ||
      this.tm.groupChat.isRemoteRoomSession(session) ||
      !session.db.getIntroductionPending()
    )
      return false;
    // No introduction is owed once the person has written, or once the agent
    // has already spoken to them. A brief from the agent that created it is
    // neither (1 October 2026, the founder: "when the agent creates another
    // agent for me, the new agent dont send me a message to sort of onboard
    // me"): it arrives as an inbound agent message, which cancelled the
    // greeting before the person ever opened the new chat.
    if (session.db.getTranscriptEntries().some((entry: TranscriptEntry) => (isUserMessageEntry(entry) && !isAgentPeerMessageEntry(entry)) || entry.kind === "send-message")) {
      session.db.setIntroductionPending(false);
      return false;
    }
    if (!isRunReady || !this.tm.execution.canExecute) return false;
    if (this.tm.runLifecycle.inFlightRunCounts.has(session)) return true;
    const runner = this.tm.runnerRegistry.getRunner(session);
    this.tm.runLifecycle.beginSessionRun(session);
    void this.tm.runLifecycle.enqueueExclusiveRun(
      session.id,
      async () => {
        this.tm.turnRuntime.activeRequestSources.set(session.id, "turn");
        try {
          // The Chief of Staff opens by hiring, not by offering to help
          // (7 October 2026, `shared/agents/chief-of-staff.ts`), after his
          // hello, the founder's words (29 October 2026), written here line
          // by line as the person watches (30 October 2026).
          // Said in the person's language when it is not English (20 October 2026).
          const language = this.tm.userLanguage?.();
          const diskSaver = session.db.getAgentPurpose() === "disk-saver";
          const hello = !diskSaver && isChiefOfStaffTitle(this.tm.sessionStore?.getAgentProfileText?.(session.id)?.title)
            ? chiefOfStaffHello(this.tm.requestContextUserFullName?.() ?? null, language)
            : null;
          if (hello != null) await this.writeHello(session, hello);
          const prompt = firstRunCueInLanguage(
            diskSaver
              ? SAND_DISK_SAVER_KICKSTART_PROMPT
              : hello != null
                ? chiefOfStaffKickstartPrompt(hello)
                : SAND_ONBOARDING_KICKSTART_PROMPT,
            language,
          );
          // Hidden (nobody asked yet) but under the asked turn's budget:
          // The upstream app gave its first message the same 5,000-call cap as any
          // turn, and its cue may begin a described assignment at once.
          const result = await runner.run(prompt, { hidden: true, fullStepBudget: true, callReason: "first_message" });
          let delivered = result.sentMessageCount > 0;
          if (!result.aborted && result.sentMessageCount === 0)
            delivered =
              await this.tm.automationRuntime.ensureHiddenTurnReply(runner);
          // His hello arrived, card or not: nothing to say went missing.
          if (hello != null) delivered = true;
          if (result.quiescedForUpgrade) {
            this.tm.upgradeResume.markAgentResumePending(session, "turn");
            session.db.setIntroductionPending(false);
          } else if (!result.aborted) {
            // One attempt, delivered or not. The upstream app kept the introduction
            // owed until a message landed, so every open of the agent ran
            // the whole first turn again; measured 22 September 2026, that
            // was 481 model calls with nothing on screen. Now the intro
            // runs once, and an undelivered one is said out loud.
            session.db.setIntroductionPending(false);
            if (!delivered)
              this.tm.trayErrors.pushError({
                agentId: session.id,
                title: say(this.tm.userLanguage?.(), "tray.introductionFailed"),
                detail: say(this.tm.userLanguage?.(), "tray.introductionUndelivered"),
                dedupeKey: introductionFailedTrayKey(session.id),
              });
          }
          await this.tm.roster.emitAgentUpdate(session.id);
        } catch (error) {
          this.tm.telemetry.reportAgentError({
            source: "onboarding_kickstart",
            conversationId: session.id,
            requestId: this.tm.runLifecycle.lastRequestIdBySession.get(
              session.id,
            ),
            error: classifyAgentError(error),
            detail: sandErrorDetail(error),
          });
          this.tm.trayErrors.pushError({
            agentId: session.id,
            title: say(this.tm.userLanguage?.(), "tray.introductionFailed"),
            ...describeAgentRunError(error, this.tm.userLanguage?.()),
            dedupeKey: introductionFailedTrayKey(session.id),
          });
        } finally {
          this.tm.runLifecycle.endSessionRun(session);
        }
      },
      { lane: "user", source: "kickstart" },
    );
    return true;
  }

  /**
   * The Chief of Staff's hello, line by line as the person watches: once his
   * chat is open (`HELLO_OPEN_WAIT_MS` at most), "Typing…" for each line
   * (`helloTypingMs`), then the line, whole. The first says who he is
   * (`introduction`: the apps draw his name in its pill there, the founder,
   * 30 October 2026).
   */
  async writeHello(session: any, lines: readonly string[]): Promise<void> {
    await this.untilChatOpen(session.id, HELLO_OPEN_WAIT_MS);
    const written: TranscriptEntry[] = [];
    try {
      for (const [index, content] of lines.entries()) {
        this.tm.runLifecycle.setSessionComposing(session.id, true);
        await this.pause(helloTypingMs(content));
        written.push(this.post(session, index === 0 ? { type: "text", content, introduction: true } : { type: "text", content }, written));
      }
    } finally {
      this.tm.runLifecycle.setSessionComposing(session.id, false);
    }
  }

  /**
   * A message from the agent in its chat, as its own (`send-message`, as
   * SendMessage leaves it): through the open chat when it is the one open
   * (opening it between two lines makes it so), else straight to its record.
   * `written`: what was just written before it, whose ids are taken too.
   */
  post(session: any, message: SendMessage, written: readonly TranscriptEntry[] = []): TranscriptEntry {
    const active = this.tm.sessions.activeSession?.id === session.id;
    const entries: readonly TranscriptEntry[] = active ? getTranscript() : session.db.getTranscriptEntries();
    const entry = createSendMessageEntry(nextEntryId([...entries, ...written], "send-message"), message, Date.now());
    if (active) this.tm.sendPipeline.appendSendMessageEntry(entry);
    else {
      session.db.appendTranscriptEntry(entry);
      this.tm.sessionStore.markSessionActivity(session);
    }
    void this.tm.roster.emitAgentUpdate(session.id);
    return entry;
  }

  async requestDiskSaverAudit(
    agentId: string,
    isRunReady: boolean,
  ): Promise<boolean> {
    let session: any;
    try {
      session =
        this.tm.sessions.activeSession?.id === agentId
          ? this.tm.sessions.activeSession
          : await this.tm.sessions.resolveBackgroundSession(agentId);
    } catch {
      return false;
    }
    if (
      this.tm.groupChat.isGroupSession(session) ||
      this.tm.groupChat.isRemoteRoomSession(session) ||
      session.db.getAgentPurpose() !== "disk-saver"
    )
      return false;
    if (session.db.getIntroductionPending())
      return this.kickstartAgent(agentId, isRunReady);
    if (!isRunReady || !this.tm.execution.canExecute) return false;
    if (this.tm.runLifecycle.inFlightRunCounts.has(session)) return true;
    const runner = this.tm.runnerRegistry.getRunner(session);
    this.tm.runLifecycle.beginSessionRun(session);
    void this.tm.runLifecycle.enqueueExclusiveRun(
      session.id,
      async () => {
        this.tm.turnRuntime.activeRequestSources.set(session.id, "event");
        try {
          const result = await runner.run(SAND_DISK_SAVER_REAUDIT_PROMPT, {
            hidden: true,
          });
          if (result.quiescedForUpgrade)
            this.tm.upgradeResume.markAgentResumePending(session, "event");
          else if (!result.aborted && result.sentMessageCount === 0)
            await this.tm.automationRuntime.ensureHiddenTurnReply(runner);
          await this.tm.roster.emitAgentUpdate(session.id);
        } catch (error) {
          this.tm.telemetry.reportAgentError({
            source: "disk_saver_reaudit",
            conversationId: session.id,
            requestId: this.tm.runLifecycle.lastRequestIdBySession.get(
              session.id,
            ),
            error: classifyAgentError(error),
            detail: sandErrorDetail(error),
          });
        } finally {
          this.tm.runLifecycle.endSessionRun(session);
        }
      },
      { lane: "background", source: "event" },
    );
    return true;
  }

  async cloneAgent(sourceId: string): Promise<any> {
    const summary = (await this.tm.sessionStore.listAgents()).find(
      (agent: any) => agent.id === sourceId,
    );
    if (summary == null)
      throw new SandAgentLifecycleError(say(this.tm.userLanguage?.(), "agent.gone"));
    if (summary.isGroup)
      throw new SandAgentLifecycleError(say(this.tm.userLanguage?.(), "agent.groupsCannotDuplicate"));
    const opened = await this.tm.sessionStore.mintAgent(
      async (agentId: string) => {
        cloneAgentDir(
          this.tm.sessionStore.getAgentDir(sourceId),
          this.tm.sessionStore.getAgentDir(agentId),
          agentId,
          cloneAgentDisplayName(summary.name),
          {
            getAutomationsDir: getAgentAutomationsDir,
            checkpointStore: (dbPath) => {
              checkpointSandAgentDb(dbPath);
            },
            rewriteIdentity: (targetDir, newAgentId, includesChatHistory) => {
              const db = new SandAgentDb(join(targetDir, "store.db"));
              try {
                db.set("agentId", newAgentId);
                db.setAgentOrigin("user");
                db.clearAgentPurpose();
                db.clearTransientState();
                if (!includesChatHistory) db.clearConversation();
                const avatarPath = join(targetDir, CANONICAL_AVATAR_FILENAME);
                const existing = db.getSandProfile();
                db.setSandProfile({
                  description: existing.description,
                  avatarPath: existsSync(avatarPath) ? avatarPath : null,
                });
              } finally {
                db.close();
              }
            },
          },
        );
        return this.openMintedSession(agentId);
      },
    );
    return this.commitOpenedSession(opened);
  }
  async commitOpenedSession(opened: {
    session: any;
    entries: any[];
    agent: any;
  }): Promise<any> {
    publishTranscriptMutation({
      kind: "agent-needs-reindex",
      agentId: opened.session.id,
    } as unknown as Parameters<typeof publishTranscriptMutation>[0]);
    const previous = this.tm.sessions.activeSession;
    const now = Date.now();
    await this.tm.sessions.markSessionLeftBehind(previous, now);
    await this.tm.sessionStore.markSessionViewed(opened.session, now);
    this.tm.sessions.invalidateDeferredActivation();
    await this.tm.sessions.replaceSession(opened.session);
    this.tm.sessions.setActiveTranscript(opened.session.id, opened.entries);
    this.tm.sessions.loaded = true;
    this.tm.roster.emit({
      type: "snapshot",
      activeAgentId: opened.session.id,
      entries: opened.entries,
    });
    await this.tm.roster.emitAgents();
    const stamp = this.tm.roster.reserveSnapshotStamp();
    const refreshed = await this.tm.sessionStore.summarizeOpenSession(
      opened.session,
    );
    return {
      agent: this.tm.roster.finalizeSummaryForRpc(
        refreshed ?? opened.agent,
        stamp,
      ),
      transcript: getTranscript(),
    };
  }
  async openMintedSession(newId: string): Promise<any> {
    let session: any;
    try {
      session = await this.tm.sessionStore.openSession(newId);
      const entries = await this.tm.sessionStore.getTranscriptEntries(session);
      const agent = await this.tm.sessionStore.summarizeOpenSession(session);
      if (agent == null)
        throw new SandAgentLifecycleError(
          "minted agent could not be summarized",
        );
      return { session, entries, agent };
    } catch (error) {
      await this.discardMintedSession(session, newId);
      throw error;
    }
  }
  async discardMintedSession(session: any, newId: string): Promise<void> {
    if (session != null) {
      try {
        await session.agentStore.dispose();
        session.db.close();
      } catch {}
    }
    await this.tm.sessionStore.deleteSession(newId).catch((error: unknown) => {
      console.error(
        `[sand] minted-session discard left ${newId} on disk: ${errorLogTag(error)}`,
      );
    });
  }

  async deleteAgent(agentId: string): Promise<any> {
    return this.tm.deleteAgents([agentId]);
  }
  async deleteAgents(agentIds: readonly string[]): Promise<any> {
    const ids = new Set(agentIds);
    if (ids.size === 0) return { transcript: getTranscript() };
    try {
      return await this.runDeleteAgents(ids);
    } catch (error) {
      for (const id of ids)
        if (this.tm.sessionStore.agentDirExists(id))
          this.tm.sessions.deletedAgentIds.delete(id);
      throw error;
    }
  }
  async runDeleteAgents(ids: ReadonlySet<string>): Promise<any> {
    const active = await this.tm.sessions.tryEnsureSession();
    const deletingActive = active != null && ids.has(active.id);
    for (const id of ids) await this.interruptAgentForDeletion(id);
    for (const id of ids) this.tm.trayErrors.clearForAgent(id);
    for (const id of ids) {
      if (id === active?.id) continue;
      this.tm.runnerRegistry.runners.delete(id);
      this.tm.sessions.liveSessions.delete(id);
      this.tm.sessions.pendingSessionOpens.delete(id);
      await this.tm.sessionStore.deleteSession(id);
      this.tm.onAgentForgotten?.(id);
      this.tm.pendingWakeStore?.clearAgent(id);
      this.tm.boxHandoff.boxHandoffs.delete(id);
      this.tm.boxHandoff.awaitingSink.clear(id);
      this.tm.roster.emitAsyncTasksForAgent(id);
    }
    if (!deletingActive || active == null) {
      await this.tm.roster.emitAgents();
      return { transcript: getTranscript() };
    }
    await active.agentStore.dispose();
    this.tm.runnerRegistry.runners.delete(active.id);
    this.tm.sessions.liveSessions.delete(active.id);
    this.tm.sessions.pendingSessionOpens.delete(active.id);
    this.tm.runLifecycle.closeSessionWhenIdle(active);
    await this.tm.sessionStore.deleteSession(active.id);
    this.tm.onAgentForgotten?.(active.id);
    this.tm.pendingWakeStore?.clearAgent(active.id);
    this.tm.boxHandoff.boxHandoffs.delete(active.id);
    this.tm.boxHandoff.awaitingSink.clear(active.id);
    this.tm.roster.emitAsyncTasksForAgent(active.id);
    const nextAgent = (await this.tm.sessionStore.listAgents(active.id)).find(
      (agent: any) => !ids.has(agent.id),
    );
    const successorIds = [
      ...(nextAgent == null ? [] : [nextAgent.id]),
      ...(await this.tm.sessionStore.listAgentRecordIds()).filter(
        (id: string) => !ids.has(id) && id !== nextAgent?.id,
      ),
    ];
    for (const successorId of successorIds) {
      let nextSession: any;
      try {
        nextSession =
          this.tm.sessions.liveSessions.get(successorId) ??
          (await this.tm.sessions.openSessionOnce(successorId));
      } catch (error) {
        console.error(
          `[sand] skipping unopenable agent ${successorId} after delete: ${errorLogTag(error)}`,
        );
        continue;
      }
      await this.tm.sessionStore.markSessionViewed(nextSession);
      this.tm.sessions.invalidateDeferredActivation();
      this.tm.sessions.setActiveSession(nextSession);
      this.tm.runLifecycle.watchActiveSession(nextSession);
      const entries =
        await this.tm.sessionStore.getTranscriptEntries(nextSession);
      this.tm.sessions.setActiveTranscript(nextSession.id, entries);
      this.tm.sessions.loaded = true;
      this.tm.roster.emit({
        type: "snapshot",
        activeAgentId: nextSession.id,
        entries,
      });
      await this.tm.roster.emitAgents();
      return { transcript: entries };
    }
    try {
      const next = await this.tm.sessionStore.createFallbackSession(
        (id: string) => this.tm.sessions.openSessionOnce(id),
      );
      await this.tm.sessionStore.markSessionViewed(next);
      this.tm.sessions.invalidateDeferredActivation();
      this.tm.sessions.setActiveSession(next);
      this.tm.runLifecycle.watchActiveSession(next);
      this.tm.sessions.clearActiveTranscript(next.id);
      this.tm.sessions.loaded = true;
      this.tm.roster.emit({ type: "cleared" });
      await this.tm.roster.emitAgents();
      return { transcript: getTranscript() };
    } catch (error) {
      if (!isSandAgentLimitError(error)) throw error;
      this.tm.sessions.activeSession = undefined;
      this.tm.unwatchActiveSession();
      this.tm.sessions.clearActiveTranscript(null);
      this.tm.sessions.loaded = false;
      this.tm.roster.emit({ type: "cleared" });
      await this.tm.roster.emitAgents();
      return { transcript: getTranscript() };
    }
  }

  /** The agent's turn is running, or one of its helpers is. */
  isAgentWorking(agentId: string): boolean {
    if (this.tm.runLifecycle.runningAgentIds().has(agentId)) return true;
    const runner = this.tm.runnerRegistry.runners.get(agentId);
    return runner?.hasRunningSubagents?.() === true;
  }

  /**
   * Stop task (15 October 2026): the person stops what the agent is doing,
   * from the phone. Its turn and every helper are interrupted, as deleting
   * an agent does, but the agent stays; a stopped helper's result does not
   * wake it again (`CompletionRevivals.stoppingAgentIds`), so it stays
   * stopped until the person writes to it.
   */
  async stopAgentTask(agentId: string): Promise<{ readonly stopped: boolean }> {
    const revivals = this.tm.backgroundWakes.completionRevivals;
    revivals.stoppingAgentIds.add(agentId);
    try {
      const runner = this.tm.runnerRegistry.runners.get(agentId);
      const groupRunner = this.tm.runnerRegistry.activeGroupMemberRunners.get(agentId);
      const wasInFlight = this.tm.runLifecycle.runningAgentIds().has(agentId);
      const hadHelpers = runner?.hasRunningSubagents?.() === true;
      const hadGroup = groupRunner?.interruptAll("stopped by the person") ?? false;
      const hadActiveRun = (runner?.interruptAll("stopped by the person") ?? false) || hadGroup;
      this.tm.telemetry.reportTurnInterrupt({
        conversationId: agentId,
        reason: "stopped_by_person",
        hadActiveRun,
        wasInFlight,
      });
      await this.tm.runLifecycle.drainExclusiveRuns(agentId);
      await runner?.drainBackgroundSubagents();
      await groupRunner?.drainBackgroundSubagents();
      this.tm.backgroundWakes.pendingSubagentCompletions.delete(agentId);
      await this.tm.roster.emitAgentUpdate(agentId);
      return { stopped: hadActiveRun || wasInFlight || hadHelpers };
    } finally {
      revivals.stoppingAgentIds.delete(agentId);
    }
  }

  async interruptAgentForDeletion(agentId: string): Promise<void> {
    this.tm.sessions.deletedAgentIds.add(agentId);
    this.tm.ackObligations.markAckObligationLost(agentId, "agent_deleted");
    this.tm.ackObligations.ackRunTokens.delete(agentId);
    for (const queue of [
      this.tm.backgroundWakes.pendingSubagentCompletions,
      this.tm.backgroundWakes.pendingShellCompletions,
      this.tm.backgroundWakes.pendingInbound,
      this.tm.backgroundWakes.pendingAgentInbound,
      this.tm.backgroundWakes.pendingChannelFailures,
    ])
      queue.delete(agentId);
    this.tm.groupChat.dmPreemptedGroupMemberIds.delete(agentId);
    this.tm.backgroundWakes.dmPreemptedWakeAgentIds.delete(agentId);
    this.tm.roster.forgetAgentSubagentWork(agentId);
    this.tm.roster.lastRunnerAsyncTasks.delete(agentId);
    const groupRunner =
      this.tm.runnerRegistry.activeGroupMemberRunners.get(agentId);
    const runner = this.tm.runnerRegistry.runners.get(agentId);
    if (runner != null || groupRunner != null) {
      const wasInFlight = this.tm.runLifecycle.runningAgentIds().has(agentId);
      const hadGroup = groupRunner?.interruptAll("agent deleted") ?? false;
      const hadActiveRun =
        (runner?.interruptAll("agent deleted") ?? false) || hadGroup;
      this.tm.telemetry.reportTurnInterrupt({
        conversationId: agentId,
        reason: "agent_deleted",
        hadActiveRun,
        wasInFlight,
      });
      runner?.cancelBackgroundShellRewatches();
      groupRunner?.cancelBackgroundShellRewatches();
    }
    await this.tm.runLifecycle.drainExclusiveRuns(agentId);
    await runner?.drainBackgroundSubagents();
    await groupRunner?.drainBackgroundSubagents();
  }

  async updateAgent(agentId: string, profile: any): Promise<unknown> {
    const trimmed = {
      ...(profile.avatarShape === undefined
        ? {}
        : { avatarShape: profile.avatarShape.trim() }),
      ...(profile.avatarColor === undefined
        ? {}
        : { avatarColor: profile.avatarColor.trim() }),
      name: profile.name.trim(),
      description: profile.description.trim(),
      ...(profile.title === undefined ? {} : { title: profile.title.trim() }),
      ...(typeof profile.voiceId === "string"
        ? { voiceId: profile.voiceId.trim() }
        : {}),
    };
    const stamp = this.tm.roster.reserveSnapshotStamp();
    const active = this.tm.sessions.activeSession;
    const summary =
      active?.id === agentId
        ? (this.tm.sessionStore.writeAgentProfileFile(agentId, trimmed),
          await this.tm.sessionStore.summarizeOpenSession(active))
        : await this.tm.sessionStore.updateAgentProfile(agentId, trimmed);
    await this.tm.roster.emitAgentUpdate(agentId);
    this.tm.roster.emitProfileChanged(agentId);
    return summary == null
      ? null
      : this.tm.roster.finalizeSummaryForRpc(summary, stamp);
  }
  async setAgentUnread(
    agentId: string,
    isUnread: boolean,
    atMs?: number,
  ): Promise<void> {
    const active = this.tm.sessions.activeSession;
    if (active?.id === agentId) {
      if (isUnread) {
        await this.tm.sessionStore.seedSessionActivityFromDbMtime(active);
        active.db.markUnread(atMs);
      } else active.db.markRead();
    } else await this.tm.sessionStore.setSessionUnread(agentId, isUnread, atMs);
    await this.tm.roster.emitAgentUpdate(agentId);
  }
  async setAgentNotifyOnUpdates(
    agentId: string,
    enabled: boolean,
  ): Promise<void> {
    this.tm.sessionStore.setSessionNotifyOnUpdates(agentId, enabled);
    await this.tm.roster.emitAgentUpdate(agentId);
  }
  async setAgentHiddenFromSidebar(
    agentId: string,
    hidden: boolean,
  ): Promise<void> {
    this.tm.sessionStore.setSessionHiddenFromSidebar(agentId, hidden);
    await this.tm.roster.emitAgentUpdate(agentId);
  }
  async setAgentAvatarBytes(
    agentId: string,
    pngBytes: Uint8Array,
  ): Promise<unknown> {
    const active = this.tm.sessions.activeSession,
      stamp = this.tm.roster.reserveSnapshotStamp();
    const summary =
      active?.id === agentId
        ? await this.tm.sessionStore.setAgentAvatarBytes(
            active.db,
            active.dbPath,
            agentId,
            pngBytes,
            agentId,
          )
        : await this.tm.sessionStore.setAgentAvatarBytesById(agentId, pngBytes);
    await this.tm.roster.emitAgentUpdate(agentId);
    this.tm.roster.emitProfileChanged(agentId);
    return summary == null
      ? null
      : this.tm.roster.finalizeSummaryForRpc(summary, stamp);
  }
  getAgentAvatar(agentId: string): Promise<unknown> {
    return this.tm.sessionStore.getAgentAvatar(agentId);
  }
}
