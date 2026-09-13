import { useCallback, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';

import { coworkService } from '../../services/cowork';
import type { RootState } from '../../store';
import type { EngineMessage } from '../thread/fromEngine';
import { decisionNote } from '../thread/fromEngine';
import type { AuthHandlers, ChoiceHandlers } from '../thread/ThreadItemView';
import { AuthDecision } from '../thread/types';
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
}

export function useMessagesShell(): MessagesShellState {
  const agents = useSelector((state: RootState) => state.agent.agents);
  const activeId = useSelector((state: RootState) => state.agent.currentAgentId);
  const currentSession = useSelector((state: RootState) => state.cowork.currentSession);
  const sessions = useSelector((state: RootState) => state.cowork.sessions);
  const pendingPermissions = useSelector((state: RootState) => state.cowork.pendingPermissions);

  const [mode, setMode] = useState<ThreadMode>(ThreadMode.Text);
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
      session: session ? { ...session, messages } : undefined,
      pendingPermissions,
    }),
    [activeId, session, messages, pendingPermissions],
  );

  const typing = currentSession?.status === 'running';

  const onSelect = useCallback((agentId: string) => {
    void coworkService.loadSessions(agentId);
  }, []);

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
  };
}
