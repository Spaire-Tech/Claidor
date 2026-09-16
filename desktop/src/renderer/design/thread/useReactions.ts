import { useCallback, useEffect, useState } from 'react';

import type { AgentReaction } from '../../../shared/reactions/constants';
import { loadReactions, type Reactions, saveReactions, toggleReaction, withReaction } from './actions';

/**
 * A conversation's reactions, kept in the renderer's own storage.
 *
 * They live beside the conversation rather than in it: a reaction is
 * the person's mark on a message, not a message, and the engine never
 * sees it. `localStorage` is enough for that — it sits in the app's own
 * user-data directory, survives restarts, and costs no IPC. If reactions
 * ever need to travel with the account, this is the one place to change.
 *
 * The agent's tapbacks (`ReactToMessage`, from 17 September) arrive
 * from main with the conversation they belong to and go into the same
 * storage, so they survive a restart like the person's own. One that
 * belongs to a conversation not on screen is saved and shows when that
 * conversation opens.
 */
export function useReactions(conversationId: string): {
  reactions: Reactions;
  onReact: (messageId: string, emoji: string) => void;
} {
  const storage = typeof localStorage === 'undefined' ? undefined : localStorage;
  const [reactions, setReactions] = useState<Reactions>(() => loadReactions(storage, conversationId));

  useEffect(() => {
    setReactions(loadReactions(storage, conversationId));
  }, [storage, conversationId]);

  useEffect(() => {
    const api = window.electron?.reactions;
    if (!api) return undefined;
    return api.onAgent((reaction: AgentReaction) => {
      const stored = loadReactions(storage, reaction.conversationId);
      saveReactions(storage, reaction.conversationId, withReaction(stored, reaction.messageId, reaction.emoji));
      if (reaction.conversationId === conversationId) {
        setReactions(current => withReaction(current, reaction.messageId, reaction.emoji));
      }
    });
  }, [storage, conversationId]);

  const onReact = useCallback((messageId: string, emoji: string) => {
    setReactions(current => {
      const next = toggleReaction(current, messageId, emoji);
      saveReactions(storage, conversationId, next);
      return next;
    });
  }, [storage, conversationId]);

  return { reactions, onReact };
}
