export const ConversationSearchShortcutTarget = {
  Conversation: 'conversation',
  History: 'history',
  None: 'none',
} as const;

export type ConversationSearchShortcutTarget =
  typeof ConversationSearchShortcutTarget[keyof typeof ConversationSearchShortcutTarget];

interface ResolveConversationSearchShortcutTargetOptions {
  isCoworkView: boolean;
  hasCurrentSession: boolean;
  isTextEditing: boolean;
  isCoworkSearchEligibleEditor: boolean;
}
export function resolveConversationSearchShortcutTarget({
  isCoworkView,
  hasCurrentSession,
  isTextEditing,
  isCoworkSearchEligibleEditor,
}: ResolveConversationSearchShortcutTargetOptions): ConversationSearchShortcutTarget {
  if (
    isCoworkView
    && hasCurrentSession
    && (!isTextEditing || isCoworkSearchEligibleEditor)
  ) {
    return ConversationSearchShortcutTarget.Conversation;
  }
  // The prompt is focused whenever the home screen opens, and the sidebar
  // promises « Search chats » for this key: from the prompt it opens the
  // chat search. Other editors keep the key for themselves.
  if (isTextEditing && !isCoworkSearchEligibleEditor) {
    return ConversationSearchShortcutTarget.None;
  }
  return ConversationSearchShortcutTarget.History;
}
