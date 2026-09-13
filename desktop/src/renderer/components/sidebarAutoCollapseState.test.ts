import { describe, expect, test } from 'vitest';

import {
  resolveSidebarAutoCollapse,
  SidebarAutoCollapseEffect,
} from './sidebarAutoCollapseState';

describe('resolveSidebarAutoCollapse', () => {
  test('closes the sidebar when a panel opens', () => {
    expect(resolveSidebarAutoCollapse({
      isPanelOpen: true,
      wasPanelOpen: false,
      isSidebarCollapsed: false,
      ownsCollapse: false,
    })).toEqual({ effect: SidebarAutoCollapseEffect.Collapse, ownsCollapse: true });
  });

  test('reopens the sidebar it closed when the panel closes', () => {
    expect(resolveSidebarAutoCollapse({
      isPanelOpen: false,
      wasPanelOpen: true,
      isSidebarCollapsed: true,
      ownsCollapse: true,
    })).toEqual({ effect: SidebarAutoCollapseEffect.Restore, ownsCollapse: false });
  });

  test('leaves a sidebar the person had already closed alone', () => {
    const opened = resolveSidebarAutoCollapse({
      isPanelOpen: true,
      wasPanelOpen: false,
      isSidebarCollapsed: true,
      ownsCollapse: false,
    });
    expect(opened).toEqual({ effect: SidebarAutoCollapseEffect.None, ownsCollapse: false });

    // ...and does not force it open again when the panel closes.
    expect(resolveSidebarAutoCollapse({
      isPanelOpen: false,
      wasPanelOpen: true,
      isSidebarCollapsed: true,
      ownsCollapse: opened.ownsCollapse,
    })).toEqual({ effect: SidebarAutoCollapseEffect.None, ownsCollapse: false });
  });

  test('hands the sidebar back to the person once they move it themselves', () => {
    // The person collapsed or expanded the sidebar while the panel was open,
    // which clears our claim on it; closing the panel leaves it as they left it.
    expect(resolveSidebarAutoCollapse({
      isPanelOpen: false,
      wasPanelOpen: true,
      isSidebarCollapsed: false,
      ownsCollapse: false,
    })).toEqual({ effect: SidebarAutoCollapseEffect.None, ownsCollapse: false });
  });

  test('does nothing while the panel state has not changed', () => {
    for (const isPanelOpen of [true, false]) {
      for (const ownsCollapse of [true, false]) {
        expect(resolveSidebarAutoCollapse({
          isPanelOpen,
          wasPanelOpen: isPanelOpen,
          isSidebarCollapsed: true,
          ownsCollapse,
        })).toEqual({ effect: SidebarAutoCollapseEffect.None, ownsCollapse });
      }
    }
  });

  test('a second panel after a manual expand is collapsed again', () => {
    const reopened = resolveSidebarAutoCollapse({
      isPanelOpen: true,
      wasPanelOpen: false,
      isSidebarCollapsed: false,
      ownsCollapse: false,
    });
    expect(reopened.effect).toBe(SidebarAutoCollapseEffect.Collapse);
    expect(reopened.ownsCollapse).toBe(true);
  });
});
