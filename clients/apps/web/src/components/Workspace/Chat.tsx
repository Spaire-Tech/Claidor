'use client'

/**
 * The chat column, on the right of everything.
 *
 * Slightly more transparent than the left panel — `rgba(255,255,255,.74)`
 * against `.92` — which is what makes the left surface read as the document
 * and this one as the margin beside it.
 *
 * **Its width is a fixed basis, not a fraction.** `0 1 430px` beside the
 * left panel, `0 1 340px` below the breakpoint, and never less than 330 (or
 * 280). A percentage would grow the margin as the window grew, which is the
 * opposite of what a margin does. Alone, it takes the room and centres a
 * 720px column inside itself, so the empty state reads as a page rather
 * than a stretched sidebar.
 *
 * **The empty state is three blocks, not one.** The thread keeps its flex,
 * the mark and greeting sit under it, the composer under those, and a
 * second flexible spacer sits under the composer — which is what floats the
 * whole group at the optical centre instead of the geometric one. The
 * composer is the same element in both states and does not move house when
 * the first message arrives.
 */

import { useState } from 'react'

import { ChatIcon, Mark, MicIcon, PlusIcon, SendIcon } from './Icons'
import {
  chatPanel,
  chatWidth,
  colour,
  composer,
  font,
  sendFill,
  size,
  tabChip,
} from './design'

export type Message =
  | {
      kind: 'file'
      name: string
      app: string
      host: 'ppt' | 'xls' | 'doc' | 'mail'
    }
  | { kind: 'user'; text: string }
  | { kind: 'tools'; text: string }
  | { kind: 'agent'; text: string }
  | { kind: 'working'; text: string }
  | { kind: 'action'; text: string; onClick: () => void }

const ICON: Record<string, string> = {
  ppt: '/icons/powerpoint.webp',
  xls: '/icons/excel.webp',
  doc: '/icons/word.webp',
  mail: '/icons/outlook.webp',
}

function Bubble({ message }: { message: Message }) {
  if (message.kind === 'file') {
    return (
      <div
        style={{
          alignSelf: 'flex-end',
          display: 'flex',
          alignItems: 'center',
          gap: 11,
          border: '1px solid rgba(255,255,255,.7)',
          background: 'rgba(255,255,255,.7)',
          borderRadius: 13,
          padding: '9px 13px',
          maxWidth: '88%',
        }}
      >
        <img
          src={ICON[message.host]}
          alt=""
          style={{ width: 22, height: 22, objectFit: 'contain' }}
        />
        <span style={{ minWidth: 0 }}>
          <span
            style={{
              display: 'block',
              fontSize: size.meta,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {message.name}
          </span>
          <span
            style={{
              display: 'block',
              fontSize: size.small,
              color: colour.slate,
            }}
          >
            {message.app}
          </span>
        </span>
      </div>
    )
  }

  if (message.kind === 'user') {
    return (
      <div
        style={{
          alignSelf: 'flex-end',
          background: 'rgba(255,255,255,.78)',
          border: '1px solid rgba(255,255,255,.7)',
          borderRadius: 15,
          padding: '11px 15px',
          maxWidth: '90%',
          lineHeight: 1.6,
        }}
      >
        {message.text}
      </div>
    )
  }

  if (message.kind === 'tools') {
    return (
      <div style={{ color: colour.slate, fontSize: size.meta }}>
        {message.text}
      </div>
    )
  }

  if (message.kind === 'working') {
    return (
      <div style={{ color: colour.slateMid, animation: 'pcDim 1.4s infinite' }}>
        {message.text}
      </div>
    )
  }

  if (message.kind === 'action') {
    return (
      <button
        onClick={message.onClick}
        style={{
          alignSelf: 'flex-start',
          border: '1px solid rgba(21,23,27,.14)',
          background: 'rgba(255,255,255,.7)',
          borderRadius: 10,
          padding: '8px 14px',
          font: 'inherit',
          fontSize: size.meta,
          fontWeight: 500,
          cursor: 'pointer',
        }}
      >
        {message.text}
      </button>
    )
  }

  return (
    <div style={{ lineHeight: 1.7, color: colour.darker }}>{message.text}</div>
  )
}

/** The two quiet controls either side of what is typed. */
const quiet = {
  border: 0,
  background: 'transparent',
  color: colour.slateDeep,
  cursor: 'pointer',
  padding: 4,
  borderRadius: 999,
  display: 'flex',
  flex: '0 0 auto',
} as const

function Composer({
  onSend,
  width,
}: {
  onSend: (text: string) => void
  width: string | number
}) {
  const [text, setText] = useState('')
  const send = () => {
    if (!text.trim()) return
    onSend(text.trim())
    setText('')
  }
  return (
    <div
      style={{
        flex: '0 0 auto',
        padding: '10px 14px 16px',
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <div style={{ ...composer, width: '100%', maxWidth: width }}>
        <button title="Attach" style={quiet}>
          <PlusIcon size={20} stroke={1.7} />
        </button>
        {/* A textarea, not an input: what a banker asks runs to two lines
            more often than one, and Enter has to mean send while
            Shift+Enter means a new line — which an input cannot express. */}
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              send()
            }
          }}
          placeholder="Ask anything"
          rows={1}
          style={{
            flex: 1,
            minWidth: 0,
            border: 0,
            outline: 'none',
            resize: 'none',
            font: 'inherit',
            fontSize: size.prompt,
            lineHeight: 1.5,
            color: colour.dark,
            background: 'transparent',
            padding: '6px 0',
          }}
        />
        <button title="Dictate" style={quiet}>
          <MicIcon />
        </button>
        <button
          onClick={send}
          title="Send"
          style={{
            width: 34,
            height: 34,
            borderRadius: '50%',
            border: 0,
            background: sendFill.rest,
            boxShadow: sendFill.shadow,
            color: colour.paper,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            flex: '0 0 auto',
          }}
        >
          <SendIcon />
        </button>
      </div>
    </div>
  )
}

export function Chat({
  messages,
  greeting,
  deal,
  onSend,
  onNew,
  alone,
  narrow,
}: {
  messages: Message[]
  greeting: string
  deal: string
  onSend: (text: string) => void
  onNew: () => void
  /** Nothing beside it — the state the workspace opens in. */
  alone: boolean
  narrow: boolean
}) {
  const empty = messages.length === 0
  const column = alone ? chatWidth.column.alone : chatWidth.column.beside

  return (
    <div
      style={{
        flex: alone
          ? chatWidth.alone
          : narrow
            ? chatWidth.beside.narrow
            : chatWidth.beside.wide,
        minWidth:
          !alone && narrow
            ? chatWidth.minWidth.narrow
            : chatWidth.minWidth.wide,
        display: 'flex',
        flexDirection: 'column',
        ...chatPanel,
        fontFamily: font.ui,
      }}
    >
      <div
        style={{
          flex: '0 0 auto',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '9px 10px 9px 14px',
          borderBottom: '1px solid rgba(21,23,27,.07)',
        }}
      >
        <div style={tabChip}>
          <span style={{ display: 'flex', color: colour.blue }}>
            <ChatIcon size={16} stroke={1.7} />
          </span>
          Chat
        </div>
        <button
          onClick={onNew}
          title="New chat"
          style={{
            border: 0,
            background: 'transparent',
            cursor: 'pointer',
            padding: 7,
            borderRadius: 9,
            display: 'flex',
            color: colour.blue,
          }}
        >
          <PlusIcon />
        </button>
        <div style={{ flex: 1 }} />
        <span
          style={{
            color: colour.slateMid,
            fontSize: size.meta,
            paddingRight: 6,
          }}
        >
          {deal}
        </span>
      </div>

      <div
        style={{
          flex: '1 1 0',
          minHeight: 0,
          overflow: 'auto',
          padding: '14px 18px 12px',
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: column,
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          {messages.map((message, index) => (
            <div
              key={index}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                animation: 'pcIn .22s ease both',
              }}
            >
              <Bubble message={message} />
            </div>
          ))}
        </div>
      </div>

      {empty && (
        <div
          style={{
            flex: '0 0 auto',
            padding: '0 14px 20px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 18,
          }}
        >
          <Mark />
          <span
            style={{
              fontSize: size.greeting,
              color: colour.dark,
              letterSpacing: '-.015em',
              textAlign: 'center',
            }}
          >
            {greeting}
          </span>
        </div>
      )}

      <Composer onSend={onSend} width={column} />

      {/* The counterweight. With the thread's flex above and this below,
          the greeting and the composer settle above the middle — which is
          where a first question wants to be. */}
      {empty && <div style={{ flex: '1 1 0' }} />}
    </div>
  )
}
