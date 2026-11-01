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
// Attach, the 40-point glass disc, sits left of the field, 8 from it (the
// field starts 48 in); the files waiting to go sit over the field and lined
// up with it, under the lines and over the message answered, in the
// iPhone's order (Attachments.tsx). Files pasted go there too.
//
// ":" and two letters open the emoji list over the words, hung 4 over the
// colon's line and from its left (ComposerPicks.tsx); while it is open its
// keys go to it: ↑ and ↓ choose, Return and Tab pick, Escape puts it away.
//
// Still to come, each with its part (docs/web-app/PROGRESS.md): the
// microphone and dictation, "@", "/" and "#" (2e), the access notice and the
// credits line (step 6).

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { maxStaged } from '../core/attachmentLimits'
import type { Emoji } from '../core/emoji'
import { type AppStore, draftScope } from '../core/store'
import { t } from '../l10n'
import {
  AttachButton,
  AttachmentStrip,
  type Staging,
  pastedFiles,
} from './Attachments'
import {
  EmojiList,
  type ListKey,
  placeInField,
  useComposerPicks,
} from './ComposerPicks'
import { type Reply, ReplyPill } from './MessageActions'
import { useWatched } from './useStore'

/** Six lines of 20, then the words scroll. */
const tallest = 120
/** Attach's disc, its gap and the field's 16: the words start this far in. */
const wordsLeft = 64
/** The emoji list's width. */
const emojiListWidth = 320

export function Composer({
  store,
  agentId,
  name,
  threadRoot,
  reply,
  onCancelReply,
  focusKey,
  onHeight,
  staging,
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
  /** The chat's files waiting to go (`ChatControl.staged`). */
  staging: Staging
}) {
  useWatched(store)
  const scope = draftScope(agentId, threadRoot)
  const [words, setWords] = useState(() => store.drafts[scope] ?? '')
  const field = useRef<HTMLTextAreaElement>(null)
  const dock = useRef<HTMLDivElement>(null)
  // The caret, for the lists, and where it goes once a pick has changed the words.
  const [caret, setCaret] = useState<{ start: number; end: number }>()
  const caretAfter = useRef<number>(undefined)
  const picks = useComposerPicks(words, caret)
  const [anchor, setAnchor] = useState<{ left: number; top: number }>()

  // Another chat, or a thread: its own words, and the keys.
  useEffect(() => {
    setWords(store.drafts[scope] ?? '')
    field.current?.focus()
  }, [scope, store])

  // A reply chosen, or a thread started: the keys come here.
  useEffect(() => {
    if (focusKey > 0) field.current?.focus()
  }, [focusKey])

  // A message canceled before it went comes back into the field it came from, its files too, when that field is empty.
  const canceled = store.canceledDraft
  const files = staging.files
  const restore = staging.restore
  useEffect(() => {
    if (!canceled || canceled.scope !== scope) return
    if (words.trim() === '' && files.length === 0) {
      setWords(canceled.text)
      store.setDraft(canceled.text, scope)
      restore(canceled.files)
    }
    store.takeCanceledDraft(canceled.id)
  }, [canceled, scope, store, words, files, restore])

  // The field grows with its words, a line at a time, to six; a pick's caret goes after what it put in.
  useLayoutEffect(() => {
    const element = field.current
    if (!element) return
    element.style.height = '20px'
    element.style.height = `${Math.min(element.scrollHeight, tallest)}px`
    element.style.overflowY = element.scrollHeight > tallest ? 'auto' : 'hidden'
    const after = caretAfter.current
    if (after != null) {
      caretAfter.current = undefined
      element.setSelectionRange(after, after)
      setCaret({ start: after, end: after })
    }
  }, [words])

  // The open list hangs from its trigger's line, from the trigger's left, kept inside the chat at the right.
  const triggerAt = picks.request?.start
  const listOpen = picks.request != null && picks.rows.length > 0
  useLayoutEffect(() => {
    const element = field.current
    const row = dock.current
    if (!element || !row || triggerAt == null || !listOpen) {
      setAnchor(undefined)
      return
    }
    const place = placeInField(element, triggerAt)
    // The row is the composer less its 16 each side.
    const width = row.clientWidth - 32
    setAnchor({
      left: Math.max(
        0,
        Math.min(place.left, width + 16 - wordsLeft - emojiListWidth),
      ),
      top: place.top,
    })
  }, [triggerAt, listOpen, words])

  // The chat ends over the field, whatever its height.
  useLayoutEffect(() => {
    const element = dock.current
    if (!element) return
    const observer = new ResizeObserver(() => onHeight(element.offsetHeight))
    observer.observe(element)
    onHeight(element.offsetHeight)
    return () => observer.disconnect()
  }, [onHeight])

  // Something to send (`hasPayload`): words, or files.
  const payload = words.trim() !== '' || files.length > 0
  const notice =
    store.composerNotice?.agentId === agentId ? store.composerNotice : undefined

  /** A key the field passes while a list is open: true when the list used it. ":" with nothing found shows nothing: its keys are the field's. */
  const listKey = (key: ListKey): boolean => {
    if (!listOpen) return false
    switch (key) {
      case 'close':
        picks.dismiss()
        return true
      case 'up':
      case 'down':
        picks.step(key === 'up' ? -1 : 1)
        return true
      case 'choose': {
        const emoji = picks.rows[picks.selected]
        if (emoji) pickEmoji(emoji)
        return true
      }
    }
  }

  /** An emoji picked: it and a space in place of the ":" and what was typed after it. */
  const pickEmoji = (emoji: Emoji) => {
    const request = picks.request
    if (!request) return
    picks.remember(emoji)
    const before = words.slice(0, request.start) + emoji.character + ' '
    const next = before + words.slice(request.end)
    caretAfter.current = before.length
    setWords(next)
    store.setDraft(next, scope)
    field.current?.focus()
  }

  const send = () => {
    const message = words.trim()
    if (message === '' && files.length === 0) return
    // The message answered, or the thread's first; in a thread, it stays there.
    const answering = reply?.id ?? threadRoot
    onCancelReply()
    setWords('')
    store.setDraft('', scope)
    const sent = staging.take().map(({ name, data }) => ({ name, data }))
    void store.send(message, agentId, {
      files: sent,
      replyTo: answering,
      inThread: threadRoot != null,
    })
  }

  return (
    <div className="composer" ref={dock}>
      {/* The lines: a send refused (six seconds) in red, then the files' (five seconds) at 40%. */}
      {notice && (
        <div className="composer-line error" role="status">
          {notice.text}
        </div>
      )}
      {staging.notice && (
        <div className="composer-line" role="status">
          {staging.notice}
        </div>
      )}
      {files.length > 0 && (
        <AttachmentStrip files={files} remove={staging.unstage} />
      )}
      {reply && <ReplyPill reply={reply} cancel={onCancelReply} />}
      <div className="composer-row">
        {listOpen && anchor && (
          <EmojiList
            rows={picks.rows}
            selected={picks.selected}
            hover={picks.choose}
            pick={pickEmoji}
            // Its foot 4 over the trigger's line (the words are 10 down in the field).
            style={{ left: wordsLeft + anchor.left, top: 10 + anchor.top - 4 }}
          />
        )}
        <AttachButton full={files.length >= maxStaged} stage={staging.stage} />
        <div className="field-box" onClick={() => field.current?.focus()}>
          <textarea
            ref={field}
            className="field"
            rows={1}
            value={words}
            placeholder={
              reply?.placeholder ??
              (files.length > 0
                ? t('Add a message, or hit send.')
                : t`Message ${name}`)
            }
            aria-label={t`Message ${name}`}
            onChange={(event) => {
              setWords(event.target.value)
              store.setDraft(event.target.value, scope)
              const { selectionStart, selectionEnd } = event.target
              setCaret({ start: selectionStart, end: selectionEnd })
            }}
            onSelect={(event) => {
              const { selectionStart, selectionEnd } = event.currentTarget
              setCaret({ start: selectionStart, end: selectionEnd })
            }}
            onPaste={(event) => {
              // Files and pictures pasted wait to go; words come in as typed.
              const pasted = pastedFiles(event.clipboardData)
              if (pasted.length === 0) return
              event.preventDefault()
              staging.stage(pasted)
            }}
            onKeyDown={(event) => {
              // Letters still being composed (an accent, Japanese) are not a send.
              if (event.nativeEvent.isComposing) return
              // An open list takes ↑, ↓, Return, Tab and Escape first.
              const key: ListKey | undefined =
                event.key === 'ArrowUp'
                  ? 'up'
                  : event.key === 'ArrowDown'
                    ? 'down'
                    : (event.key === 'Enter' && !event.shiftKey) ||
                        (event.key === 'Tab' && !event.shiftKey)
                      ? 'choose'
                      : event.key === 'Escape'
                        ? 'close'
                        : undefined
              if (key && listKey(key)) {
                event.preventDefault()
                return
              }
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
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                aria-hidden="true"
              >
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
    </div>
  )
}
