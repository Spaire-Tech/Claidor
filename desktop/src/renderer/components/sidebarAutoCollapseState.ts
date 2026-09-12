/**
 * Whether the sidebar steps aside for the right-hand panel, and whether the
 * collapse is ours to undo.
 *
 * The window has room for two columns of work, not three. With the sidebar, the
 * conversation and a panel all open at once, the conversation — the thing the
 * person is actually doing — is squeezed to nothing, so the sidebar closes when
 * a panel opens.
 *
 * It comes back when the panel closes, because the person never asked for it to
 * go and a view that disappears for good is the more surprising of the two. But
 * only while the collapse is still ours: the moment the person moves the sidebar
 * themselves, their choice stands and we stop putting it back.
 */

export const SidebarAutoCollapseEffect = {
  None: 'none',
  Collapse: 'collapse',
  Restore: 'restore',
} as const;
export type SidebarAutoCollapseEffect =
  typeof SidebarAutoCollapseEffect[keyof typeof SidebarAutoCollapseEffect];

export interface SidebarAutoCollapseInput {
  isPanelOpen: boolean;
  wasPanelOpen: boolean;
  isSidebarCollapsed: boolean;
  /** True while the sidebar is closed because we closed it. */
  ownsCollapse: boolean;
}

export interface SidebarAutoCollapseOutcome {
  effect: SidebarAutoCollapseEffect;
  ownsCollapse: boolean;
}

export const resolveSidebarAutoCollapse = (
  input: SidebarAutoCollapseInput,
): SidebarAutoCollapseOutcome => {
  if (input.isPanelOpen === input.wasPanelOpen) {
    return { effect: SidebarAutoCollapseEffect.None, ownsCollapse: input.ownsCollapse };
  }

  if (input.isPanelOpen) {
    // Already closed by the person: leave it, and do not claim it as ours.
    if (input.isSidebarCollapsed) {
      return { effect: SidebarAutoCollapseEffect.None, ownsCollapse: false };
    }
    return { effect: SidebarAutoCollapseEffect.Collapse, ownsCollapse: true };
  }

  if (!input.ownsCollapse) {
    return { effect: SidebarAutoCollapseEffect.None, ownsCollapse: false };
  }
  return { effect: SidebarAutoCollapseEffect.Restore, ownsCollapse: false };
};
