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
// "@", "/", "#" and ":" before the caret open their lists over the words,
// hung 4 over the trigger's line and from its left (ComposerPicks.tsx);
// while one is open its keys go to it: ↑ and ↓ choose, Return and Tab pick,
// Escape puts it away. A pick sits in the words as its own words ("@Nora",
// "#12") on the Mac's grey, kept track of while the words change (the
// iPhone's way); Delete takes it whole, and it goes with the message in the
// editor's document (`richText`), as the window's does.
//
// While there is nothing to send, the grey microphone sits in Send's place
// (Dictation.tsx): while it listens the recording chip takes that place and
// the field says "Listening…", then "Transcribing…" with a small spinner;
// what was said goes in at the caret. Escape drops the recording.
//
// Over it all, 8 over the field and as wide, the access notice
// (ComputerStates.tsx, step 5c): this account can't send, and why; Send
// waits under it, as it waits while the computer is rebuilt
// (`isSendingPaused`). Else, in its place, the credits' line
// (CreditsLine.tsx, step 6f): the credits spent, or near the limit; it
// opens Usage & Billing. Then, in the Windows app, the agent's ask to use
// this PC (LocalAskDock.tsx, step 7f).

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { accessNotice } from '../core/access'
import { maxStaged } from '../core/attachmentLimits'
import {
  type ChipNode,
  type ComposerChip,
  carry,
  chipEnd,
  chipText,
  draftFrom,
  prompt,
  richText,
} from '../core/composerDocument'
import { type AppStore, draftScope } from '../core/store'
import { t } from '../l10n'
import {
  AttachButton,
  AttachmentStrip,
  type Staging,
  pastedFiles,
} from './Attachments'
import { ComposerModelMenu } from './ComposerModelMenu'
import {
  type ListKey,
  PickList,
  type PickRow,
  listWidth,
  placeInField,
  useComposerPicks,
} from './ComposerPicks'
import { AccessNotice } from './ComputerStates'
import { CreditsLine, useCreditsReads } from './CreditsLine'
import {
  Dictation,
  MicButton,
  RecordingChip,
  Transcribing,
  spacedDictation,
} from './Dictation'
import { LocalAskDock } from './LocalAskDock'
import { type Reply, ReplyPill } from './MessageActions'
import { useWatched } from './useStore'
import { useWindowModel } from './windowModel'

/** Six lines of 20, then the words scroll. */
const tallest = 120
/** Attach's disc, its gap and the field's 16: the words start this far in. */
const wordsLeft = 64

/** Each field's picks while its words wait (the window keeps them in the draft's document; the Mac, `keptChips`). */
const keptChips = new Map<string, { draft: string; chips: ComposerChip[] }>()

function chipsFor(scope: string, draft: string): ComposerChip[] {
  const kept = keptChips.get(scope)
  return kept?.draft === draft ? kept.chips : []
}

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
  const model = useWindowModel()
  // The usage and the computer's notices, for the credits' line (6f).
  useCreditsReads(store, agentId)
  const scope = draftScope(agentId, threadRoot)
  const [words, setWords] = useState(() => store.drafts[scope] ?? '')
  const [chips, setChips] = useState<ComposerChip[]>(() =>
    chipsFor(scope, store.drafts[scope] ?? ''),
  )
  const field = useRef<HTMLTextAreaElement>(null)
  const picksLayer = useRef<HTMLDivElement>(null)
  const dock = useRef<HTMLDivElement>(null)
  // The caret, for the lists, and where it goes once words were set from outside the field.
  const [caret, setCaret] = useState<{ start: number; end: number }>()
  const caretAfter = useRef<number>(undefined)
  /** The pick being put in through the field's own typing (so ⌘Z takes it out again). */
  const pendingChip = useRef<ComposerChip>(undefined)
  /** The picks each version of the words had, so the field's undo and redo bring a pick back as one (the browser's history knows only the words). */
  const versions = useRef(new Map<string, ComposerChip[]>())
  const picks = useComposerPicks({ store, agentId, words, caret, chips })
  const [anchor, setAnchor] = useState<{ left: number; top: number }>()

  /** The words and their picks set together, kept for this field while they wait. */
  const place = (next: string, nextChips: ComposerChip[]) => {
    const kept = versions.current
    kept.delete(next)
    kept.set(next, nextChips)
    if (kept.size > 100) kept.delete(kept.keys().next().value!)
    setWords(next)
    setChips(nextChips)
    store.setDraft(next, scope)
    if (nextChips.length > 0)
      keptChips.set(scope, { draft: next, chips: nextChips })
    else keptChips.delete(scope)
  }

  // Another chat, or a thread: its own words and picks, and the keys.
  useEffect(() => {
    const draft = store.drafts[scope] ?? ''
    setWords(draft)
    setChips(chipsFor(scope, draft))
    field.current?.focus()
  }, [scope, store])

  // A reply chosen, or a thread started: the keys come here.
  useEffect(() => {
    if (focusKey > 0) field.current?.focus()
  }, [focusKey])

  // A message canceled before it went comes back into the field it came from, its picks and files too, when that field is empty.
  const canceled = store.canceledDraft
  const files = staging.files
  // Dictation, this field's own; it stops with the chat.
  const dictation = useMemo(
    () => new Dictation((audio, kind) => store.transcribe(audio, kind)),
    [store],
  )
  useWatched(dictation)
  useEffect(() => () => dictation.cancel(), [dictation])
  const restore = staging.restore
  useEffect(() => {
    if (!canceled || canceled.scope !== scope) return
    if (words.trim() === '' && files.length === 0) {
      const back = draftFrom(canceled.richText) ?? {
        draft: canceled.text,
        chips: [],
      }
      setWords(back.draft)
      setChips(back.chips)
      store.setDraft(back.draft, scope)
      if (back.chips.length > 0)
        keptChips.set(scope, { draft: back.draft, chips: back.chips })
      restore(canceled.files)
    }
    store.takeCanceledDraft(canceled.id)
  }, [canceled, scope, store, words, files, restore])

  // The field grows with its words, a line at a time, to six; the picks' wash follows its words and its scrolling.
  useLayoutEffect(() => {
    const element = field.current
    if (!element) return
    element.style.height = '20px'
    element.style.height = `${Math.min(element.scrollHeight, tallest)}px`
    element.style.overflowY = element.scrollHeight > tallest ? 'auto' : 'hidden'
    const layer = picksLayer.current
    if (layer) {
      layer.style.width = `${element.clientWidth}px`
      layer.scrollTop = element.scrollTop
    }
    const after = caretAfter.current
    if (after != null) {
      caretAfter.current = undefined
      element.setSelectionRange(after, after)
      setCaret({ start: after, end: after })
    }
  }, [words, chips])

  // The open list hangs from its trigger's line, from the trigger's left, kept inside the chat at the right.
  const request = picks.request
  const triggerAt = request?.start
  const width = request ? listWidth(request.kind) : 0
  const listOpen = picks.open
  useLayoutEffect(() => {
    const element = field.current
    const row = dock.current
    if (!element || !row || triggerAt == null || !listOpen) {
      setAnchor(undefined)
      return
    }
    const spot = placeInField(element, triggerAt)
    // The row is the composer less its 16 each side.
    const room = row.clientWidth - 32
    setAnchor({
      left: Math.max(0, Math.min(spot.left, room + 16 - wordsLeft - width)),
      top: spot.top,
    })
  }, [triggerAt, listOpen, width, words])

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

  /**
   * `from` to `to` swapped for `text` through the field's own typing, so
   * ⌘Z undoes it and the caret lands after it; with `chip`, that text is a
   * pick. Set from outside the field where the browser won't.
   */
  const insert = (
    from: number,
    to: number,
    text: string,
    chip?: ComposerChip,
  ) => {
    const element = field.current
    if (!element) return
    element.focus()
    element.setSelectionRange(from, to)
    pendingChip.current = chip
    const typed =
      text === ''
        ? from === to || document.execCommand('delete')
        : document.execCommand('insertText', false, text)
    if (typed) return
    pendingChip.current = undefined
    const next = words.slice(0, from) + text + words.slice(to)
    const nextChips = carry(chips, words, next)
    caretAfter.current = from + text.length
    place(next, chip ? [...nextChips, chip] : nextChips)
  }

  /** A row picked: its pick in place of the trigger and what was typed after it, and a space; an emoji and a space. */
  const pick = (row: PickRow) => {
    if (!request) return
    picks.remember(row)
    let node: ChipNode | undefined
    switch (row.kind) {
      case 'emoji':
        insert(request.start, request.end, `${row.emoji.character} `)
        return
      case 'mention':
        node = row.row.insert
        break
      case 'slash':
        // An action runs at once and takes the "/" and what followed it out of the field (`run`); a skill goes in as a pick.
        if (row.item.kind === 'action') {
          insert(request.start, request.end, '')
          model.runAction(row.item.action.id)
          return
        }
        node = {
          kind: 'workflow',
          id: row.item.skill.id,
          label: row.item.skill.name,
          iconId: row.item.skill.iconId,
          iconURL: row.item.skill.iconURL,
        }
        break
      case 'pull':
        node = {
          kind: 'pullRequest',
          number: row.pull.number,
          title: row.pull.title,
          url: row.pull.url === '' ? undefined : row.pull.url,
        }
        break
    }
    insert(request.start, request.end, `${chipText(node)} `, {
      start: request.start,
      node,
    })
  }

  /** A key the field passes while a list is open: true when the list used it. "#" and ":" with nothing found show nothing: their keys are the field's. */
  const listKey = (key: ListKey): boolean => {
    if (!listOpen) return false
    const rows = picks.rows
    switch (key) {
      case 'close':
        picks.dismiss()
        return true
      case 'up':
      case 'down':
        if (rows.length === 0) return false
        picks.step(key === 'up' ? -1 : 1)
        return true
      case 'choose': {
        const row = rows[picks.selected]
        if (!row) return false
        pick(row)
        return true
      }
    }
  }

  // What was said goes in at the caret through the field's own typing, a space before it when the word before runs on; the field takes the keys.
  useEffect(() => {
    dictation.onWords = (said) => {
      const element = field.current
      if (!element) return
      const from = element.selectionStart
      const to = element.selectionEnd
      insert(from, to, spacedDictation(element.value.slice(0, from), said))
    }
  })

  // While the computer is rebuilt or this account has no Simeon, Send is off and Return keeps the words (decision 3).
  const paused = store.isSendingPaused
  const send = () => {
    if (paused) return
    // The message has gone: dictation still on its way writes nothing more.
    if (dictation.phase !== 'idle') dictation.cancel()
    const message = prompt(words)
    if (message === '' && files.length === 0) return
    // The editor's document goes with the words when they hold a pick (`richText`).
    const rich = chips.length > 0 ? richText(words, chips) : undefined
    // The message answered, or the thread's first; in a thread, it stays there.
    const answering = reply?.id ?? threadRoot
    onCancelReply()
    place('', [])
    const sent = staging.take().map(({ name, data }) => ({ name, data }))
    void store.send(message, agentId, {
      files: sent,
      replyTo: answering,
      inThread: threadRoot != null,
      richText: rich,
    })
  }

  return (
    <div className="composer" ref={dock}>
      {/* Whether this account may use Simeon (`Qvn`, step 5c), else the credits' line (6f): one at a time, over everything, 8 over it. */}
      <AccessNotice store={store} />
      {accessNotice(store.access) === undefined && (
        <CreditsLine store={store} agentId={agentId} />
      )}
      {/* Then the agent's first waiting ask to use this PC (`BLn`, the Windows app's hands, step 7f). */}
      <LocalAskDock store={store} agentId={agentId} />
      {/* The lines: a send refused (six seconds) in red, then the files' (five seconds) at 40%. */}
      {notice && (
        <div className="composer-line error" role="status">
          {notice.text}
        </div>
      )}
      {dictation.error && (
        <div className="composer-line error" role="status">
          {dictation.error}
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
        {listOpen && request && anchor && (
          <PickList
            kind={request.kind}
            rows={picks.rows}
            empty={picks.empty}
            selected={picks.selected}
            agents={store.agents}
            hover={picks.choose}
            pick={pick}
            // Its foot 4 over the trigger's line (the words are 10 down in the field).
            style={{ left: wordsLeft + anchor.left, top: 10 + anchor.top - 4 }}
          />
        )}
        <AttachButton full={files.length >= maxStaged} stage={staging.stage} />
        <div className="field-box" onClick={() => field.current?.focus()}>
          <div className="field-words">
            {/* The picks on the Mac's grey, drawn under the words where they are. */}
            {chips.length > 0 && (
              <div className="field-picks" ref={picksLayer} aria-hidden="true">
                <PicksLayer words={words} chips={chips} />
              </div>
            )}
            <textarea
              ref={field}
              className="field"
              rows={1}
              value={words}
              placeholder={
                dictation.isListening
                  ? t('Listening…')
                  : dictation.phase === 'transcribing'
                    ? t('Transcribing…')
                    : (reply?.placeholder ??
                      (files.length > 0
                        ? t('Add a message, or hit send.')
                        : t`Message ${name}`))
              }
              aria-label={t`Message ${name}`}
              onChange={(event) => {
                const next = event.target.value
                // Picks move with the words around them, and go when edited; one being put in joins them.
                let nextChips = carry(chips, words, next)
                const putIn = pendingChip.current
                pendingChip.current = undefined
                if (
                  putIn &&
                  next.slice(putIn.start, chipEnd(putIn)) ===
                    chipText(putIn.node)
                )
                  nextChips = [...nextChips, putIn].sort(
                    (a, b) => a.start - b.start,
                  )
                // Undo and redo: the words as they were, with the picks they had.
                const how = (event.nativeEvent as InputEvent).inputType
                const was = versions.current.get(next)
                if (
                  (how === 'historyUndo' || how === 'historyRedo') &&
                  was &&
                  was.length > nextChips.length
                )
                  nextChips = was
                place(next, nextChips)
                const { selectionStart, selectionEnd } = event.target
                setCaret({ start: selectionStart, end: selectionEnd })
              }}
              onScroll={(event) => {
                if (picksLayer.current)
                  picksLayer.current.scrollTop = event.currentTarget.scrollTop
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
                // Delete takes a pick whole (the window's node).
                const element = event.currentTarget
                if (
                  (event.key === 'Backspace' || event.key === 'Delete') &&
                  !event.metaKey &&
                  !event.ctrlKey &&
                  !event.altKey &&
                  element.selectionStart === element.selectionEnd
                ) {
                  const at = element.selectionStart
                  const hit = chips.find((chip) =>
                    event.key === 'Backspace'
                      ? chip.start < at && at <= chipEnd(chip)
                      : chip.start <= at && at < chipEnd(chip),
                  )
                  if (hit) {
                    event.preventDefault()
                    insert(hit.start, chipEnd(hit), '')
                    return
                  }
                }
                // Escape while listening or transcribing drops the recording; else it lets go of a reply.
                if (event.key === 'Escape' && dictation.phase !== 'idle') {
                  event.preventDefault()
                  dictation.cancel()
                  return
                }
                // Escape lets go of a reply (unless it just closed a menu over the chat).
                if (
                  event.key === 'Escape' &&
                  reply &&
                  !event.defaultPrevented
                ) {
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
          </div>
          {/* The model the agents use, before the microphone (9 November 2026, the founder: "the model chosen is on the composer"). */}
          {dictation.phase === 'idle' && <ComposerModelMenu store={store} />}
          {dictation.isListening ? (
            <RecordingChip
              meter={dictation.meter}
              stop={() => void dictation.stop()}
            />
          ) : dictation.phase === 'transcribing' ? (
            <Transcribing />
          ) : !payload ? (
            <MicButton start={() => dictation.start()} />
          ) : (
            <button
              type="button"
              className={paused ? 'send-button paused' : 'send-button'}
              disabled={paused}
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

/** The words, unseen, with each pick marked where it is: the field's own layout, so the marks sit under the picks. */
function PicksLayer({
  words,
  chips,
}: {
  words: string
  chips: readonly ComposerChip[]
}) {
  const pieces: React.ReactNode[] = []
  let cursor = 0
  for (const chip of [...chips].sort((a, b) => a.start - b.start)) {
    if (chip.start < cursor || chipEnd(chip) > words.length) continue
    pieces.push(words.slice(cursor, chip.start))
    pieces.push(
      <mark key={chip.start}>{words.slice(chip.start, chipEnd(chip))}</mark>,
    )
    cursor = chipEnd(chip)
  }
  // A last empty line still takes its height.
  pieces.push(`${words.slice(cursor)}\u200b`)
  return <>{pieces}</>
}
