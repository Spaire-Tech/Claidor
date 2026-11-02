// Step 5d: calls with an agent (mac/Simeon/CallBannerWindow.swift,
// CallChat.swift; SimeonCore's Call.swift, CallTones.swift,
// VoiceCall.swift), and two agents' messages to each other over the chat
// (mac/Simeon/Exchange.swift). 5d's screens go in this file (and its own
// CSS); the window places them (App.tsx, ChatPane.tsx).

import type { ReactNode } from 'react'
import { voiceChatLabel } from '../core/chat'
import type { Agent } from '../core/models'
import type { AppStore } from '../core/store'

/** The call's banner (the Mac's floating `CallBannerWindow`), over the window while a call is up or just failed. */
export function CallBanner({ store }: { store: AppStore }): ReactNode {
  void store
  return null
}

/**
 * The name's row in the chat's head: the pill, with the phone 8 past it
 * and a place as wide on its other side while calls are on (ChatPane.swift's
 * `identity`). For now the pill alone.
 */
export function CallHeadRow({
  store,
  agent,
  children,
}: {
  store: AppStore
  agent: Agent
  children: ReactNode
}): ReactNode {
  void store
  void agent
  return children
}

/** A call in the chat (`CallLineRow`): "Voice chat · now", "Voice chat · 02:48". */
export function CallLineRow({
  store,
  agentId,
  id,
  seconds,
  live,
}: {
  store: AppStore
  agentId: string
  id: string
  seconds: number
  live: boolean
}): ReactNode {
  void store
  void agentId
  void id
  return (
    <div className="call-line" title={voiceChatLabel(seconds, live)}>
      <VoiceGlyph />
      <span>{voiceChatLabel(seconds, live)}</span>
    </div>
  )
}

/** What covers the chat and its field (`WindowModel.chatCover`): a call's lines, or two agents' exchange. */
export function ChatCoverView({
  store,
  agentId,
}: {
  store: AppStore
  agentId: string
}): ReactNode {
  void store
  void agentId
  return null
}

/** The call's glyph: five strokes of a voice, the middle ones tallest. */
export function VoiceGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M5 10v4M9 7v10M13 9v6M17 6v12M21 10v4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}
