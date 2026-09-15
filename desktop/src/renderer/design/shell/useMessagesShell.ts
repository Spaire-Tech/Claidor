import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { AgentId } from '../../../shared/agent';
import { isRoomId, type Room } from '../../../shared/rooms/constants';
import { agentService } from '../../services/agent';
import { collectSessionArtifacts, loadDetectedFileArtifact } from '../../services/artifactDetection';
import { coworkService } from '../../services/cowork';
import type { AppDispatch, RootState } from '../../store';
import { setCurrentAgentId } from '../../store/slices/agentSlice';
import { addArtifact } from '../../store/slices/artifactSlice';
import { setCurrentSession } from '../../store/slices/coworkSlice';
import type { PresetAgent } from '../../types/agent';
import { ArtifactTypeValue } from '../../types/artifact';
import type { CoworkMessage } from '../../types/cowork';
import { openLocalPathWithToast, showToast } from '../../utils/localFileActions';
import { extractUserMessageFileAttachments } from '../../utils/userMessageFileAttachments';
import { systemPromptFor } from '../agents/voices';
import type { EngineMessage } from '../thread/fromEngine';
import { askUserQuestions, decisionNote, parseChoiceId } from '../thread/fromEngine';
import { basename, type KnownFile } from '../thread/parts';
import type { AuthHandlers, ChoiceHandlers, PartHandlers } from '../thread/ThreadItemView';
import { AuthDecision } from '../thread/types';
import type { AgentDraftSubmit } from './Compose';
import { ThreadMode } from './MessagesShell';
import { installedPresetIds } from './roles';
import { mergeRoomThread, roomTyping } from './room';
import {
  dayStamp as dayStampOf,
  sidebarAgents,
  sidebarRooms,
  type StoreSession,
  threadItems,
} from './select';
import { agentTemplate, templateBase64, templateFileName } from './template';

/**
 * The shell, connected.
 *
 * Everything that decides anything lives in `select.ts` and is tested
 * without a store. This reads Redux, calls those, and hands the result
 * down — so when something looks wrong on screen, the question is which
 * of the two, and the answer is usually already covered by a test.
 *
 * What it deliberately does not do: own state the store already owns.
 * Sessions, messages, streaming and the permission queue are the app's,
 * not this hook's. The only state here is what the shell alone knows —
 * which mode the header is in, and the notes left by answered approvals.
 */

export interface MessagesShellState {
  agents: ReturnType<typeof sidebarAgents>;
  activeId: string;
  activeName: string;
  items: ReturnType<typeof threadItems>;
  dayStamp: string | undefined;
  typing: boolean;
  mode: ThreadMode;
  choice: ChoiceHandlers;
  auth: AuthHandlers;
  /** What a file or a link named in a message can do. */
  parts: PartHandlers;
  onSelect: (agentId: string) => void;
  /** Delete a conversation, permanently. Rooms and agents both. */
  onDelete: (id: string) => void;
  onSend: (message: string) => void;
  onMode: (mode: ThreadMode) => void;
  /** "Teach a task", from the composer's `+` menu. */
  onTeach: () => void;
  /** "Share as template", from the share button in the header. */
  onShareTemplate: () => void;
  /** True while the compose pane has taken over the conversation. */
  composing: boolean;
  onCompose: () => void;
  onCloseCompose: () => void;
  onPickAgent: (agentId: string) => void;
  onCreateAgent: (draft: AgentDraftSubmit) => void;
  /** True while the roles list is over the app. */
  appsOpen: boolean;
  onApps: () => void;
  onCloseApps: () => void;
  /** The twelve roles, whether or not they are already here. */
  presets: readonly PresetAgent[];
  /** Which of them are already agents. */
  installedIds: ReadonlySet<string>;
  /** The one being added, while it is being added. */
  busyPresetId: string | undefined;
  onInstallPreset: (presetId: string) => void;
  /** The open conversation, for the panel to watch. */
  sessionId: string | undefined;
  workingDirectory: string | undefined;
  panelOpen: boolean;
  onOpenPanel: () => void;
  onClosePanel: () => void;
}

export function useMessagesShell(): MessagesShellState {
  const dispatch = useDispatch<AppDispatch>();
  const agents = useSelector((state: RootState) => state.agent.agents);
  const activeId = useSelector((state: RootState) => state.agent.currentAgentId);
  const currentSession = useSelector((state: RootState) => state.cowork.currentSession);
  const sessions = useSelector((state: RootState) => state.cowork.sessions);
  const pendingPermissions = useSelector((state: RootState) => state.cowork.pendingPermissions);

  const [mode, setMode] = useState<ThreadMode>(ThreadMode.Text);

  // The rooms this person has made.
  //
  // Loaded once and kept, because a room is a handful of rows that only
  // changes when somebody changes it. Re-reading on every render would
  // be an IPC call per keystroke for data that is almost always the same.
  const [rooms, setRooms] = useState<readonly Room[]>([]);
  const reloadRooms = useCallback(() => {
    void window.electron?.rooms?.list?.().then(setRooms).catch(() => {
      // No rooms rather than a broken sidebar.
    });
  }, []);
  useEffect(() => { reloadRooms(); }, [reloadRooms]);

  const room = useMemo(
    () => rooms.find(one => one.id === activeId),
    [rooms, activeId],
  );

  // `init()` is the whole of the app's live wiring and it is not optional.
  //
  // It registers `onStreamMessage`, `onStreamMessageUpdate`,
  // `onStreamSessionStatus` and `onStreamPermission`
  // (`services/cowork.ts`, `setupStreamListeners`). Without it nothing
  // reaches Redux while a turn is running: a person's own message never
  // appears, the reply never appears, and an approval request never
  // becomes a card — the store's `pendingPermissions` has exactly one
  // producer and it lives in there.
  //
  // This shell shipped without the call for six stages. The app looked
  // like it had lost its messages; they were in SQLite the whole time,
  // which is why leaving a conversation and returning showed them —
  // that path reads the database instead of listening.
  //
  // It is idempotent (`if (this.initialized) return`) and loads the
  // config, the sessions and the engine status itself, so it replaces
  // the bare `loadSessions()` that used to be here.
  useEffect(() => {
    void agentService.loadAgents();
    void coworkService.init();
  }, []);
  // An answered approval leaves a line behind. It is local because it is
  // a presentation fact: the engine's record is the decision itself.
  const [notes, setNotes] = useState<EngineMessage[]>([]);
  // The name of this computer, for the approval card. Asked once: it is
  // the machine the app is running on and it does not change underneath
  // somebody mid-session.
  const [computerName, setComputerName] = useState<string>();
  useEffect(() => {
    let current = true;
    void window.electron?.appInfo?.getComputerName?.()
      .then(name => { if (current && name) setComputerName(name); })
      .catch(() => { /* the card simply omits the line */ });
    return () => { current = false; };
  }, []);

  /**
   * Every session, with the open one's loaded messages folded in.
   *
   * All of them, not one per agent. A row stands for an agent and shows
   * the last thing said with it; reducing to the newest session first
   * meant a fresh, empty conversation hid a full one. `standingFor` walks
   * this list, so it needs the list.
   */
  const sidebarSessions = useMemo(() => {
    const list: StoreSession[] = [];
    for (const summary of sessions) {
      if (!summary.agentId) continue;
      list.push({
        id: summary.id,
        agentId: summary.agentId,
        updatedAt: summary.updatedAt ?? 0,
        ...(summary.lastMessage ? { lastMessage: summary.lastMessage } : {}),
      });
    }
    if (currentSession?.agentId) {
      const at = list.findIndex(one => one.id === currentSession.id);
      const open: StoreSession = {
        ...(at >= 0 ? list[at] : { id: currentSession.id, agentId: currentSession.agentId }),
        updatedAt: currentSession.updatedAt ?? Date.now(),
        messages: currentSession.messages as readonly EngineMessage[],
      };
      if (at >= 0) list[at] = open;
      else list.push(open);
    }
    return list;
  }, [sessions, currentSession]);

  /**
   * The newest session per agent — which conversation to resume.
   *
   * A different question from what a row shows, and conflating the two is
   * what broke the preview. This one must stay "newest", because opening
   * an agent should land you in the conversation you were last in, empty
   * or not.
   */
  const sessionsByAgent = useMemo(() => {
    const newest: Record<string, StoreSession | undefined> = {};
    for (const session of sidebarSessions) {
      if ((newest[session.agentId]?.updatedAt ?? -1) >= (session.updatedAt ?? 0)) continue;
      newest[session.agentId] = session;
    }
    return newest;
  }, [sidebarSessions]);

  const rows = useMemo(
    () => [
      ...sidebarRooms({ rooms, agents, sessions: sidebarSessions }),
      ...sidebarAgents({ agents, sessions: sidebarSessions }),
    ],
    [rooms, agents, sidebarSessions],
  );

  const active = useMemo(
    () => agents.find(one => one.id === activeId),
    [agents, activeId],
  );

  const session = sessionsByAgent[activeId];

  const messages = useMemo<readonly EngineMessage[]>(
    () => [...((session?.messages ?? []) as readonly EngineMessage[]), ...notes],
    [session, notes],
  );

  /**
   * Answering the agent's questions.
   *
   * A choice card is one question out of an `AskUserQuestion` call, and
   * that call is only finished when every question in it has an answer —
   * the engine is holding a tool call open, waiting for one reply. So the
   * answers collect here, the answered cards leave the thread, and the
   * reply goes back once the last one lands.
   *
   * `answers` is keyed by request and then by the question's own text,
   * because that is the key the tool's `answers` object uses.
   */
  const [answers, setAnswers] = useState<Record<string, Record<string, string>>>({});

  /**
   * A room's thread: every member's session, merged.
   *
   * Built from the same `threadItems` each one-to-one conversation uses,
   * so nothing here is special-cased into existence — a bubble in a room
   * is the same bubble that agent's own conversation shows.
   */
  const roomItems = useMemo(() => {
    if (!room) return undefined;
    return mergeRoomThread(room.memberIds.flatMap(memberId => {
      const memberAgent = agents.find(one => one.id === memberId);
      // A member that no longer exists is left out rather than shown as
      // a blank voice. `removeAgentFromRooms` normally prevents this; the
      // guard is for the window between an agent going and a reload.
      if (!memberAgent) return [];
      const memberSession = sessionsByAgent[memberId];
      return [{
        agentId: memberId,
        agentName: memberAgent.name,
        items: threadItems({
          agentId: memberId,
          agentName: memberAgent.name,
          ...(computerName ? { deviceName: computerName } : {}),
          session: memberSession,
          pendingPermissions,
          answered: answers,
        }),
      }];
    }));
  }, [room, agents, sessionsByAgent, computerName, pendingPermissions, answers]);

  const items = useMemo(
    () => roomItems ?? threadItems({
      agentId: activeId,
      // The id identifies, the name is what a person reads. Passing the
      // id for both put "Allow juno to continue" on an approval card.
      ...(active?.name ? { agentName: active.name } : {}),
      ...(computerName ? { deviceName: computerName } : {}),
      session: session ? { ...session, messages } : undefined,
      pendingPermissions,
      answered: answers,
    }),
    [roomItems, activeId, active, session, messages, pendingPermissions, computerName, answers],
  );

  // A room is working while any member is. The person is waiting for the
  // room, not for one of its members.
  const typing = room
    // `sessionsByAgent` is a view for the sidebar and carries no status,
    // so this reads the store's own list. A member with no session yet is
    // not running, which is right: it has not been asked anything.
    ? roomTyping(room.memberIds.map(
      id => sessions.some(one => one.agentId === id && one.status === 'running'),
    ))
    : currentSession?.status === 'running';

  // The files this conversation has actually produced or touched.
  //
  // `collectSessionArtifacts` is the app's existing detector — tool inputs,
  // markdown file links, media tokens, bare paths inside the working
  // directory — and it has been here all along. Nothing in this shell ever
  // called it, which had two consequences the founder saw as one: a
  // document the agent had just written arrived as a percent-escaped
  // `file:///` URL in the middle of a sentence, and the Files tab of the
  // computer panel was permanently empty, because the store it reads has
  // no other producer.
  const detected = useMemo(() => {
    if (!currentSession?.id || !currentSession.messages?.length) return [];
    try {
      return collectSessionArtifacts(
        currentSession.messages as CoworkMessage[],
        currentSession.id,
        currentSession.cwd,
      );
    } catch (error) {
      console.error('[Faiser] artifact detection failed:', error);
      return [];
    }
  }, [currentSession]);

  // Named, deduplicated, for the chips inside a bubble.
  const files = useMemo<readonly KnownFile[]>(() => {
    const byName = new Map<string, KnownFile>();
    const add = (path: string | undefined): void => {
      if (!path) return;
      const name = basename(path);
      if (!name || byName.has(name.toLowerCase())) return;
      byName.set(name.toLowerCase(), { name, path });
    };
    for (const artifact of detected) add(artifact.filePath);
    // And what the person attached themselves. The detector only reads
    // the agent's messages, so without this a file you handed over is a
    // chip with nowhere to go.
    for (const message of messages) {
      if (message.type !== 'user') continue;
      for (const one of extractUserMessageFileAttachments(message.content).attachments) {
        add(one.path);
      }
    }
    return [...byName.values()];
  }, [detected, messages]);

  // And into the artifact store, which is what fills the computer panel's
  // Files tab. The same three steps the old shell takes: local services go
  // straight in, files are read off disk first, and an id is remembered
  // either way so a file that is not there is not retried forever.
  const loadedArtifactIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    const sessionId = currentSession?.id;
    if (!sessionId || typing) return;
    const cwd = currentSession?.cwd;

    for (const artifact of detected) {
      if (artifact.type === ArtifactTypeValue.LocalService) {
        dispatch(addArtifact({ sessionId, artifact, ...(cwd ? { defaultProjectDirectory: cwd } : {}) }));
      }
    }

    const toLoad = detected.filter(a => a.filePath && !loadedArtifactIds.current.has(a.id));
    if (!toLoad.length) return;

    void (async () => {
      for (const artifact of toLoad) {
        loadedArtifactIds.current.add(artifact.id);
        const loaded = await loadDetectedFileArtifact(artifact, cwd);
        if (loaded) dispatch(addArtifact({ sessionId, artifact: loaded }));
      }
    })();
  }, [detected, currentSession, typing, dispatch]);

  const parts = useMemo<PartHandlers>(() => ({
    files,
    onOpenFile: (path: string) => { void openLocalPathWithToast(path); },
    // A link belongs in the person's own browser, not inside a bubble.
    onOpenLink: (href: string) => { window.open(href, '_blank', 'noopener,noreferrer'); },
  }), [files]);

  // Open on a conversation rather than on nothing, the way Messages does.
  // Once only, and never over an open one: the guard is what stops this
  // from yanking somebody back to `main` every time the session list
  // refreshes.
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current || currentSession) return;
    const newest = sessionsByAgent[activeId];
    if (!newest) return;
    opened.current = true;
    void coworkService.loadSession(newest.id);
  }, [activeId, currentSession, sessionsByAgent]);

  // Selecting a row is the app's only navigation, so it has to do the whole
  // job: make that agent current, and open its newest conversation. Loading
  // the sessions and stopping there — which is what this did first — left
  // the header, the thread and the composer on the previous agent, so a
  // click looked like nothing happening.
  const onSelect = useCallback((agentId: string) => {
    dispatch(setCurrentAgentId(agentId));
    // The notes belong to the conversation that produced them. Left alone
    // they would follow you into the next one — "Mira can run commands
    // from now on" appearing in Juno's thread.
    setNotes([]);
    const newest = sessionsByAgent[agentId];
    if (!newest) {
      // No history with this agent. An empty thread, not the last one's.
      dispatch(setCurrentSession(null));
      return;
    }
    void coworkService.loadSession(newest.id);
  }, [dispatch, sessionsByAgent]);

  /**
   * Delete a conversation, permanently.
   *
   * A room and an agent are both rows in the same list and both delete
   * from the same gesture, but they are not the same act: deleting a room
   * puts nothing away, because its members are agents that go on
   * existing. Deleting an agent takes its transcript with it.
   *
   * The main agent has no delete. It is the one conversation that always
   * exists, and offering to remove it would mean an app with no way in.
   */
  const onDelete = useCallback((id: string) => {
    if (isRoomId(id)) {
      void window.electron?.rooms?.remove?.(id).then(reloadRooms).catch(() => {
        showToast('That could not be deleted.');
      });
      if (activeId === id) dispatch(setCurrentAgentId(AgentId.Main));
      return;
    }
    if (id === AgentId.Main) return;
    void agentService.deleteAgent(id).then(deleted => {
      if (!deleted) {
        showToast('That could not be deleted.');
        return;
      }
      // A room it sat in has lost a member, so the list is stale.
      reloadRooms();
      if (activeId === id) dispatch(setCurrentAgentId(AgentId.Main));
    });
  }, [activeId, dispatch, reloadRooms]);

  const onSend = useCallback((message: string) => {
    // A room has no session of its own. The message goes to each member's
    // conversation, which is what makes every reply a real reply the
    // person can go and read on its own.
    if (room) {
      for (const memberId of room.memberIds) {
        const memberSession = sessionsByAgent[memberId];
        if (memberSession?.id) {
          void coworkService.continueSession({ sessionId: memberSession.id, prompt: message });
        } else {
          void coworkService.startSession({ prompt: message, agentId: memberId });
        }
      }
      return;
    }

    const sessionId = currentSession?.id;
    if (sessionId) {
      void coworkService.continueSession({ sessionId, prompt: message });
      return;
    }
    void coworkService.startSession({ prompt: message, agentId: activeId });
  }, [room, sessionsByAgent, currentSession, activeId]);

  /**
   * "Teach a task", from the composer's `+` menu.
   *
   * The canvas draws a record dot beside it and the app has no recorder,
   * so this does the thing the founder's own copy describes: *"walk
   * through it once… I watch the flow, ask only if something's
   * ambiguous, then save it so I can run it again."* It opens that
   * conversation rather than pretending to film one.
   */
  const onTeach = useCallback(() => {
    onSend(
      "I want to teach you a task. I'll walk you through it once, step by step. "
      + 'Ask me only where something is genuinely ambiguous, and when we are done, '
      + 'write it up as a recipe you can follow next time: what to look at, which '
      + 'steps to take, and what finished looks like.',
    );
  }, [onSend]);

  /**
   * "Share as template", from the share button in the header.
   *
   * Written to a temporary file and then handed to the system's Save
   * dialog, because the app's only inline writer puts files in its own
   * attachment directory — which is the wrong place for something a
   * person means to send to somebody.
   */
  const onShareTemplate = useCallback(async () => {
    if (!active) return;
    // The store's agent is a summary and carries no instructions, which
    // are the most useful half of a template. They come from the same
    // place the agent's own screen reads them.
    const full = await window.electron?.agents?.get?.(active.id);
    const opening = messages.find(one => one.type === 'user')?.content;
    const template = agentTemplate({
      name: active.name,
      description: active.description,
      instructions: full?.systemPrompt ?? '',
      skillIds: active.skillIds,
      ...(opening ? { opening } : {}),
    });
    const fileName = templateFileName(active.name);

    const written = await window.electron?.dialog?.saveInlineFile?.({
      dataBase64: templateBase64(template),
      fileName,
      mimeType: 'application/json',
    });
    if (!written?.success || !written.path) {
      showToast('That template could not be written.');
      return;
    }
    await window.electron?.dialog?.saveFileCopy?.(written.path);
  }, [active, messages]);

  const auth = useMemo<AuthHandlers>(() => ({
    onDecide: (itemId, decision) => {
      // `auth:<requestId>` — the mapper builds it, this takes it apart.
      const requestId = itemId.replace(/^auth:/, '');
      const allow = decision !== AuthDecision.Never;
      void coworkService.respondToPermission(
        requestId,
        allow
          // The scope is the difference between the two allow buttons.
          // Without it they were the same press: the engine decided from
          // its own flag and the person's choice was thrown away.
          ? { behavior: 'allow', scope: decision === AuthDecision.Always ? 'always' : 'once' }
          : { behavior: 'deny', message: 'Declined.' },
      );
      // Answering consumes the card: the prompt is replaced by one quiet
      // line, so a thread never accumulates dead controls.
      setNotes(previous => [...previous, {
        id: `note:${requestId}`,
        type: 'system',
        content: decisionNote(active?.name ?? 'This agent', decision),
        timestamp: Date.now(),
      }]);
    },
  }), [active]);

  // Composing: who to message, or a new agent.
  const [composing, setComposing] = useState(false);

  // The computer panel. Local to the shell: upstream keeps an open flag
  // per session in the artifact slice, but that slice is the old shell's
  // and toggling it from here would move a panel it also draws.
  const [panelOpen, setPanelOpen] = useState(false);


  const onCompose = useCallback(() => setComposing(true), []);
  const onCloseCompose = useCallback(() => setComposing(false), []);

  const onPickAgent = useCallback((agentId: string) => {
    setComposing(false);
    onSelect(agentId);
  }, [onSelect]);

  const onCreateAgent = useCallback(async (draft: AgentDraftSubmit) => {
    const name = draft.name.trim();
    if (!name) return;
    // The voice and the brief go into the agent's own instructions, which
    // is where `direction.md` §4 says they belong — not into a wrapper
    // this shell adds at send time, where a second client would lose them.
    const agent = await agentService.createAgent({
      name,
      description: draft.description.trim(),
      systemPrompt: systemPromptFor({
        name,
        label: draft.label,
        description: draft.description,
        voiceId: draft.voiceId,
      }),
    });
    setComposing(false);
    if (agent) onSelect(agent.id);
  }, [onSelect]);

  // The roles list. `getPresetTemplates` returns all twelve; `getPresets`
  // returns only the ones not yet added, which would make the list shrink
  // as you used it and leave you wondering what you had just done.
  const [presets, setPresets] = useState<readonly PresetAgent[]>([]);
  const [appsOpen, setAppsOpen] = useState(false);
  const [busyPresetId, setBusyPresetId] = useState<string>();

  useEffect(() => {
    let current = true;
    void agentService.getPresetTemplates()
      .then(all => { if (current) setPresets(all); });
    return () => { current = false; };
  }, []);

  const installedIds = useMemo(() => installedPresetIds(agents), [agents]);

  const onApps = useCallback(() => setAppsOpen(true), []);
  const onCloseApps = useCallback(() => setAppsOpen(false), []);

  const onInstallPreset = useCallback(async (presetId: string) => {
    setBusyPresetId(presetId);
    try {
      const agent = await agentService.addPreset(presetId);
      if (!agent) return;
      // Adding somebody means going to talk to them. Landing back on the
      // list with a new row somewhere in the sidebar would make the button
      // look like it had done nothing.
      setAppsOpen(false);
      onSelect(agent.id);
    } finally {
      setBusyPresetId(undefined);
    }
  }, [onSelect]);

  const answer = useCallback((itemId: string, value: string) => {
    const parsed = parseChoiceId(itemId);
    if (!parsed) return;
    const request = pendingPermissions.find(one => one.requestId === parsed.requestId);
    if (!request) return;
    const questions = askUserQuestions(request);
    const question = questions[parsed.index];
    if (!question) return;

    setAnswers(previous => {
      const forRequest = { ...(previous[parsed.requestId] ?? {}), [question.question]: value };
      const done = questions.every(one => forRequest[one.question] !== undefined);
      if (done) {
        void coworkService.respondToPermission(parsed.requestId, {
          behavior: 'allow',
          // The tool's own input, with the answers added. This is the
          // shape the old shell's wizard sends and the shape the plugin
          // reads back; inventing a second one would work until it did
          // not.
          updatedInput: { ...request.toolInput, answers: forRequest },
        });
        const { [parsed.requestId]: _done, ...rest } = previous;
        return rest;
      }
      return { ...previous, [parsed.requestId]: forRequest };
    });
  }, [pendingPermissions]);

  const choice = useMemo<ChoiceHandlers>(() => ({
    onPick: (itemId, optionKey) => {
      const parsed = parseChoiceId(itemId);
      const request = parsed
        ? pendingPermissions.find(one => one.requestId === parsed.requestId)
        : undefined;
      const question = request && parsed
        ? askUserQuestions(request)[parsed.index]
        : undefined;
      // The key is the letter on the cap; the engine wants the label.
      const picked = question?.options[optionKey.charCodeAt(0) - 65];
      if (picked) answer(itemId, picked.label);
    },
    onFreeAnswer: (itemId, free) => answer(itemId, free),
    onDismiss: itemId => {
      const parsed = parseChoiceId(itemId);
      if (!parsed) return;
      // Dismissing one card answers nothing, so it declines the whole
      // question. Leaving the tool call open would hang the turn.
      void coworkService.respondToPermission(parsed.requestId, {
        behavior: 'deny',
        message: 'Dismissed.',
      });
      setAnswers(previous => {
        const { [parsed.requestId]: _gone, ...rest } = previous;
        return rest;
      });
    },
  }), [answer, pendingPermissions]);

  return {
    agents: rows,
    activeId,
    activeName: room?.name ?? active?.name ?? '',
    items,
    dayStamp: dayStampOf(messages),
    typing,
    mode,
    choice,
    auth,
    parts,
    onSelect,
    onDelete,
    onSend,
    onMode: setMode,
    onTeach,
    onShareTemplate: () => { void onShareTemplate(); },
    composing,
    onCompose,
    onCloseCompose,
    onPickAgent,
    onCreateAgent: (draft: AgentDraftSubmit) => { void onCreateAgent(draft); },
    appsOpen,
    onApps,
    onCloseApps,
    presets,
    installedIds,
    busyPresetId,
    onInstallPreset: (presetId: string) => { void onInstallPreset(presetId); },
    sessionId: currentSession?.id,
    workingDirectory: currentSession?.cwd,
    panelOpen,
    onOpenPanel: () => setPanelOpen(open => !open),
    onClosePanel: () => setPanelOpen(false),
  };
}
