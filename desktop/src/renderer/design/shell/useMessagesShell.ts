import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

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
import { decisionNote } from '../thread/fromEngine';
import { basename, type KnownFile } from '../thread/parts';
import type { AuthHandlers, ChoiceHandlers, PartHandlers } from '../thread/ThreadItemView';
import { AuthDecision } from '../thread/types';
import type { AgentDraftSubmit } from './Compose';
import { ThreadMode } from './MessagesShell';
import { installedPresetIds } from './roles';
import {
  dayStamp as dayStampOf,
  sidebarAgents,
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

  const sessionsByAgent = useMemo(() => {
    const newest: Record<string, StoreSession | undefined> = {};
    for (const summary of sessions) {
      const agentId = summary.agentId;
      if (!agentId) continue;
      const at = summary.updatedAt ?? 0;
      if ((newest[agentId]?.updatedAt ?? -1) >= at) continue;
      newest[agentId] = {
        id: summary.id,
        agentId,
        updatedAt: at,
        ...(summary.lastMessage ? { lastMessage: summary.lastMessage } : {}),
      };
    }
    // The open conversation is the one with messages loaded; the rest are
    // summaries, which is all a sidebar row needs.
    if (currentSession?.agentId) {
      newest[currentSession.agentId] = {
        ...newest[currentSession.agentId],
        id: currentSession.id,
        agentId: currentSession.agentId,
        updatedAt: currentSession.updatedAt ?? Date.now(),
        messages: currentSession.messages as readonly EngineMessage[],
      };
    }
    return newest;
  }, [sessions, currentSession]);

  const rows = useMemo(
    () => sidebarAgents({ agents, sessionsByAgent }),
    [agents, sessionsByAgent],
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

  const items = useMemo(
    () => threadItems({
      agentId: activeId,
      // The id identifies, the name is what a person reads. Passing the
      // id for both put "Allow juno to continue" on an approval card.
      ...(active?.name ? { agentName: active.name } : {}),
      ...(computerName ? { deviceName: computerName } : {}),
      session: session ? { ...session, messages } : undefined,
      pendingPermissions,
    }),
    [activeId, active, session, messages, pendingPermissions, computerName],
  );

  const typing = currentSession?.status === 'running';

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

  const onSend = useCallback((message: string) => {
    const sessionId = currentSession?.id;
    if (sessionId) {
      void coworkService.continueSession({ sessionId, prompt: message });
      return;
    }
    void coworkService.startSession({ prompt: message, agentId: activeId });
  }, [currentSession, activeId]);

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

  const choice = useMemo<ChoiceHandlers>(() => ({
    // A choice card is answered by saying the answer, which is what a
    // person would do anyway — so the agent sees a normal reply rather
    // than a protocol.
    onPick: (_itemId, optionKey) => onSend(optionKey),
    onFreeAnswer: (_itemId, answer) => onSend(answer),
  }), [onSend]);

  return {
    agents: rows,
    activeId,
    activeName: active?.name ?? '',
    items,
    dayStamp: dayStampOf(messages),
    typing,
    mode,
    choice,
    auth,
    parts,
    onSelect,
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
