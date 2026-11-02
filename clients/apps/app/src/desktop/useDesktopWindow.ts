// The signed-in window's part of the Windows app's own surfaces
// (MacServices.swift's `open(agent:)`, MenuBar.swift, SimeonMacApp.swift's
// Agent › Call): what the tray's menu lists while the window is up (the
// agents, Call <name>), and what the tray and a notification ask of the
// window (an agent's chat, New Agent, About, Call, Settings › Updates).
// Nothing on the web.

import { useEffect, useMemo, useRef } from 'react'
import type { Agent } from '../core/models'
import type { AppStore } from '../core/store'
import { t } from '../l10n'
import { callAgent } from '../window/Call'
import type { WindowModel } from '../window/windowModel'
import { desktop } from './desktop'
import { type WindowTray, desktopSurfaces } from './surfaces'

/** How many agents the tray's menu lists (`MenuBarMenu.agentsShown`). */
export const trayAgentsShown = 8

/**
 * The tray's part from the window: the agents in the sidebar's order
 * (`sortRoster`: newest activity first), hidden ones aside, a mark on those
 * with something unread (`MenuBarMenu.listed`); Call <name> for the open
 * agent (a person, not a group), else a disabled Call Agent, none while
 * calls are off (`CallItem`).
 */
export function windowTray(
  agents: readonly Agent[],
  open: Agent | undefined,
  canCall: boolean,
): WindowTray {
  const callee = open && !open.isGroup ? open : undefined
  return {
    agents: agents
      .filter((agent) => !agent.isHidden)
      .slice(0, trayAgentsShown)
      .map((agent) => ({
        id: agent.id,
        name: agent.name,
        unread: agent.hasUnread || agent.unreadCount > 0,
      })),
    ...(canCall
      ? {
          call: callee
            ? { title: t`Call ${callee.name}`, enabled: true }
            : { title: t('Call Agent'), enabled: false },
        }
      : {}),
  }
}

/** In MainWindow (App.tsx): the tray's part, and the tray's and the notifications' asks. */
export function useDesktopWindow(
  store: AppStore,
  model: WindowModel,
  shown: string | undefined,
): void {
  const host = desktop()
  const open = shown != null ? store.agent(shown) : undefined
  const tray = useMemo(
    () => (host ? windowTray(store.agents, open, store.canCall) : undefined),
    [host, store.agents, open, store.canCall],
  )
  useEffect(() => {
    if (tray) desktopSurfaces()?.setWindowTray(tray)
  }, [tray])
  useEffect(() => {
    if (!host) return
    return () => desktopSurfaces()?.setWindowTray(undefined)
  }, [host])

  // A notification's agent clicked before the agents were read (one that started Simeon): opened with the first list, if it is there.
  const pending = useRef<string | undefined>(undefined)
  const openRef = useRef(open)
  useEffect(() => {
    openRef.current = open
  }, [open])
  useEffect(() => {
    if (!host) return
    const choose = (agentId: string) => {
      if (store.agents.length === 0) {
        pending.current = agentId
        return
      }
      // An agent that is gone only brought the window forward (decision 2).
      if (store.agent(agentId)) model.choose(agentId)
    }
    const stops = [
      host.on('openAgent', (agentId) => {
        if (typeof agentId === 'string') choose(agentId)
      }),
      host.on('newChat', () => model.startNewChat()),
      host.on('openAbout', () => model.openAbout()),
      host.on('callOpenAgent', () => {
        const callee = openRef.current
        if (callee && !callee.isGroup && store.canCall) callAgent(store, callee)
      }),
      // The window's way to the updater (7e answers it on the page it opens).
      host.on('checkForUpdates', () => model.openSettings('updates')),
    ]
    return () => {
      for (const stop of stops) stop()
    }
  }, [host, store, model])
  useEffect(() => {
    const agentId = pending.current
    if (agentId == null || store.agents.length === 0) return
    pending.current = undefined
    if (store.agent(agentId)) model.choose(agentId)
  }, [store, model, store.agents])
}
