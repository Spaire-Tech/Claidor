/** Sending messages is on for a project only in its root conversation, and only when its state says so with `true` itself. */
export function isProjectSendMessageEnabled(state: { isRootProjectConversation?: boolean }): boolean {
  return state.isRootProjectConversation === true;
}
