// The message field (`Composer` in mac/Simeon/Composer.swift,
// `sand-chat-input-dock`, padded 0 16 16): the field in glass, 20 round, 40
// high on one line and growing a line at a time (14 on 20, the words 16 in
// and 10 over and under; six lines, 120, then they scroll); the blue send at
// its right, 2 in, once there is something to send. Over the field, a
// send's error. Return sends, Shift-Return starts a new line, and what is
// typed is kept per chat (and per thread).
//
// The message being answered sits over the field (`ReplyPill`), the field
// saying what it answers; Escape lets go of it.
//
// Still to come, each with its part (docs/web-app/PROGRESS.md): Attach and
// the files (2b), the microphone and dictation, "@", "/" and "#" (2e), the
// access notice and the credits line (step 6).

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { type AppStore, draftScope } from '../core/store'
import { t } from '../l10n'
import { type Reply, ReplyPill } from './MessageActions'
import { useWatched } from './useStore'

/** Six lines of 20, then the words scroll. */
const tallest = 120

export function Composer({
  store,
  agentId,
  name,
  threadRoot,
  reply,
  onCancelReply,
  focusKey,
  onHeight,
}: {
  store: AppStore
  agentId: string
  name: string
  threadRoot?: string
  reply?: Reply
  onCancelReply: () => void
  /** Bumped when the field should take the keys: a reply chosen, a thread started. */
  focusKey: number
  onHeight: (height: number) => void
}) {
  useWatched(store)
  const scope = draftScope(agentId, threadRoot)
  const [words, setWords] = useState(() => store.drafts[scope] ?? '')
  const field = useRef<HTMLTextAreaElement>(null)
  const dock = useRef<HTMLDivElement>(null)

  // Another chat, or a thread: its own words, and the keys.
  useEffect(() => {
    setWords(store.drafts[scope] ?? '')
    field.current?.focus()
  }, [scope, store])

  // A reply chosen, or a thread started: the keys come here.
  useEffect(() => {
    if (focusKey > 0) field.current?.focus()
  }, [focusKey])

  // A message canceled before it went comes back into the field it came from, when that field is empty.
  const canceled = store.canceledDraft
  useEffect(() => {
    if (!canceled || canceled.scope !== scope) return
    if (words.trim() === '') {
      setWords(canceled.text)
      store.setDraft(canceled.text, scope)
    }
    store.takeCanceledDraft(canceled.id)
  }, [canceled, scope, store, words])

  // The field grows with its words, a line at a time, to six.
  useLayoutEffect(() => {
    const element = field.current
    if (!element) return
    element.style.height = '20px'
    element.style.height = `${Math.min(element.scrollHeight, tallest)}px`
    element.style.overflowY = element.scrollHeight > tallest ? 'auto' : 'hidden'
  }, [words])

  // The chat ends over the field, whatever its height.
  useLayoutEffect(() => {
    const element = dock.current
    if (!element) return
    const observer = new ResizeObserver(() => onHeight(element.offsetHeight))
    observer.observe(element)
    onHeight(element.offsetHeight)
    return () => observer.disconnect()
  }, [onHeight])

  const payload = words.trim() !== ''
  const notice =
    store.composerNotice?.agentId === agentId ? store.composerNotice : undefined

  const send = () => {
    const message = words.trim()
    if (message === '') return
    // The message answered, or the thread's first; in a thread, it stays there.
    const answering = reply?.id ?? threadRoot
    onCancelReply()
    setWords('')
    store.setDraft('', scope)
    void store.send(message, agentId, {
      replyTo: answering,
      inThread: threadRoot != null,
    })
  }

  return (
    <div className="composer" ref={dock}>
      {notice && (
        <div className="composer-line error" role="status">
          {notice.text}
        </div>
      )}
      {reply && <ReplyPill reply={reply} cancel={onCancelReply} />}
      <div className="field-box" onClick={() => field.current?.focus()}>
        <textarea
          ref={field}
          className="field"
          rows={1}
          value={words}
          placeholder={reply?.placeholder ?? t`Message ${name}`}
          aria-label={t`Message ${name}`}
          onChange={(event) => {
            setWords(event.target.value)
            store.setDraft(event.target.value, scope)
          }}
          onKeyDown={(event) => {
            // Letters still being composed (an accent, Japanese) are not a send.
            if (event.nativeEvent.isComposing) return
            // Escape lets go of a reply (unless it just closed a menu over the chat).
            if (event.key === 'Escape' && reply && !event.defaultPrevented) {
              event.preventDefault()
              onCancelReply()
              return
            }
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              send()
            }
          }}
        />
        {payload && (
          <button
            type="button"
            className="send-button"
            aria-label={t('Send message')}
            title={t('Send message')}
            onClick={(event) => {
              event.stopPropagation()
              send()
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path
                d="M7 12V2M2.5 6.5 7 2l4.5 4.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}
