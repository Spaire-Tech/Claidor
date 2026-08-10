/**
 * The chat column, on the right of everything.
 *
 * It is narrower than the left panel and slightly more transparent — the
 * design uses `rgba(255,255,255,.74)` here against `.92` there, which is
 * what makes the left surface read as the document and this one as the
 * margin beside it.
 *
 * With nothing in it, the column centres the mark and the greeting and
 * puts the composer under them. With a conversation, the greeting goes and
 * the composer drops to the bottom. That is the whole of its layout logic.
 */

import { useState } from 'react'

import { ChatIcon, Mark, MicIcon, PlusIcon, SendIcon } from './Icons'
import { colour, font, size, tabChip } from './design'

export type Message =
  | { kind: 'file'; name: string; app: string; host: 'ppt' | 'xls' | 'doc' | 'mail' }
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
          <span style={{ display: 'block', fontSize: size.small, color: colour.slate }}>
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
    return <div style={{ color: colour.slate, fontSize: size.meta }}>{message.text}</div>
  }

  if (message.kind === 'working') {
    return (
      <div
        style={{
          color: colour.slate,
          fontSize: size.meta,
          animation: 'pcDim 1.4s ease-in-out infinite',
        }}
      >
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
          borderRadius: 11,
          padding: '9px 15px',
          font: 'inherit',
          cursor: 'pointer',
        }}
      >
        {message.text}
      </button>
    )
  }

  return <div style={{ lineHeight: 1.7, color: colour.darker }}>{message.text}</div>
}

function Composer({ onSend }: { onSend: (text: string) => void }) {
  const [text, setText] = useState('')
  const send = () => {
    if (!text.trim()) return
    onSend(text.trim())
    setText('')
  }
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        background: colour.paper,
        border: '1px solid rgba(21,23,27,.10)',
        borderRadius: 999,
        padding: '8px 8px 8px 16px',
        boxShadow: '0 4px 16px rgba(16,20,28,.07)',
      }}
    >
      <button
        title="Attach"
        style={{
          border: 0,
          background: 'transparent',
          cursor: 'pointer',
          display: 'flex',
          color: colour.slateDeep,
          padding: 0,
        }}
      >
        <PlusIcon size={19} />
      </button>
      <input
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => event.key === 'Enter' && send()}
        placeholder="Ask anything"
        style={{
          flex: 1,
          border: 0,
          outline: 'none',
          background: 'transparent',
          font: 'inherit',
          fontSize: size.body,
          color: colour.ink,
          minWidth: 0,
        }}
      />
      <button
        title="Dictate"
        style={{
          border: 0,
          background: 'transparent',
          cursor: 'pointer',
          display: 'flex',
          color: colour.slateDeep,
          padding: 0,
        }}
      >
        <MicIcon size={19} />
      </button>
      <button
        onClick={send}
        title="Send"
        style={{
          border: 0,
          background: colour.blue,
          color: colour.paper,
          cursor: 'pointer',
          borderRadius: 999,
          width: 34,
          height: 34,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <SendIcon size={18} />
      </button>
    </div>
  )
}

export function Chat({
  messages,
  greeting,
  deal,
  onSend,
  onNew,
  wide,
}: {
  messages: Message[]
  greeting: string
  deal: string
  onSend: (text: string) => void
  onNew: () => void
  wide: boolean
}) {
  const empty = messages.length === 0

  return (
    <div
      style={{
        // 28% against the design's own split, not a round number: the
        // chat is a margin beside the document, and at a third it starts
        // competing with it.
        flex: wide ? '1 1 0' : '0 0 28%',
        minWidth: wide ? 0 : 360,
        display: 'flex',
        flexDirection: 'column',
        background: 'rgba(255,255,255,.74)',
        backdropFilter: 'blur(20px) saturate(1.5)',
        WebkitBackdropFilter: 'blur(20px) saturate(1.5)',
        border: '1px solid rgba(255,255,255,.9)',
        borderRadius: 20,
        boxShadow:
          '0 14px 40px rgba(16,20,28,.10), 0 0 0 1px rgba(16,20,28,.04), inset 0 1px 0 rgba(255,255,255,.9)',
        overflow: 'hidden',
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
            <ChatIcon size={16} />
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
        <span style={{ color: colour.slateMid, fontSize: size.meta, paddingRight: 6 }}>
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
          alignItems: empty ? 'center' : 'stretch',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: wide ? 720 : '100%',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          {empty ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 18,
              }}
            >
              <Mark />
              <div
                style={{
                  fontSize: wide ? 26 : 21,
                  textAlign: 'center',
                  lineHeight: 1.35,
                }}
              >
                {greeting}
              </div>
              <div style={{ width: '100%', maxWidth: 560 }}>
                <Composer onSend={onSend} />
              </div>
            </div>
          ) : (
            messages.map((message, index) => (
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
            ))
          )}
        </div>
      </div>

      {!empty && (
        <div style={{ flex: '0 0 auto', padding: '0 18px 16px' }}>
          <Composer onSend={onSend} />
        </div>
      )}
    </div>
  )
}
