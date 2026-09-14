import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { agentService } from '../../services/agent';
import { coworkService } from '../../services/cowork';
import type { AppDispatch, RootState } from '../../store';
import { setCurrentAgentId } from '../../store/slices/agentSlice';
import { setCurrentSession } from '../../store/slices/coworkSlice';
import { systemPromptFor } from '../agents/voices';
import type { EngineMessage } from '../thread/fromEngine';
import { decisionNote } from '../thread/fromEngine';
import type { AuthHandlers, ChoiceHandlers } from '../thread/ThreadItemView';
import { AuthDecision } from '../thread/types';
import type { AgentDraftSubmit } from './Compose';
import { ThreadMode } from './MessagesShell';
import {
  dayStamp as dayStampOf,
  sidebarAgents,
  type StoreSession,
  threadItems,
} from './select';

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
  onSelect: (agentId: string) => void;
  onSend: (message: string) => void;
  onMode: (mode: ThreadMode) => void;
  /** True while the compose pane has taken over the conversation. */
  composing: boolean;
  onCompose: () => void;
  onCloseCompose: () => void;
  onPickAgent: (agentId: string) => void;
  onCreateAgent: (draft: AgentDraftSubmit) => void;
}

export function useMessagesShell(): MessagesShellState {
  const dispatch = useDispatch<AppDispatch>();
  const agents = useSelector((state: RootState) => state.agent.agents);
  const activeId = useSelector((state: RootState) => state.agent.currentAgentId);
  const currentSession = useSelector((state: RootState) => state.cowork.currentSession);
  const sessions = useSelector((state: RootState) => state.cowork.sessions);
  const pendingPermissions = useSelector((state: RootState) => state.cowork.pendingPermissions);

  const [mode, setMode] = useState<ThreadMode>(ThreadMode.Text);

  // Nothing else loads these. The old shell filled the agent list from the
  // screens that showed it and the session list from its sidebar tree;
  // this shell has neither, so it asks for both itself.
  //
  // `loadSessions()` is called with no agent id on purpose. Passing one
  // replaces the whole list with that agent's sessions (`setAgentSessions`),
  // which would blank the preview and timestamp on every other row the
  // moment you clicked one. The sidebar wants the global list; a single
  // conversation is opened from it by id.
  useEffect(() => {
    void agentService.loadAgents();
    void coworkService.loadSessions();
  }, []);
  // An answered approval leaves a line behind. It is local because it is
  // a presentation fact: the engine's record is the decision itself.
  const [notes, setNotes] = useState<EngineMessage[]>([]);

  const sessionsByAgent = useMemo(() => {
    const newest: Record<string, StoreSession | undefined> = {};
    for (const summary of sessions) {
      const agentId = summary.agentId;
      if (!agentId) continue;
      const at = summary.updatedAt ?? 0;
      if ((newest[agentId]?.updatedAt ?? -1) >= at) continue;
      newest[agentId] = { id: summary.id, agentId, updatedAt: at };
    }
    // The open conversation is the one with messages loaded; the rest are
    // summaries, which is all a sidebar row needs.
    if (currentSession?.agentId) {
      newest[currentSession.agentId] = {
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
      session: session ? { ...session, messages } : undefined,
      pendingPermissions,
    }),
    [activeId, active, session, messages, pendingPermissions],
  );

  const typing = currentSession?.status === 'running';

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

  const auth = useMemo<AuthHandlers>(() => ({
    onDecide: (itemId, decision) => {
      // `auth:<requestId>` — the mapper builds it, this takes it apart.
      const requestId = itemId.replace(/^auth:/, '');
      const allow = decision !== AuthDecision.Never;
      void coworkService.respondToPermission(
        requestId,
        allow
          ? { behavior: 'allow' }
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
    onSelect,
    onSend,
    onMode: setMode,
    composing,
    onCompose,
    onCloseCompose,
    onPickAgent,
    onCreateAgent: (draft: AgentDraftSubmit) => { void onCreateAgent(draft); },
  };
}
