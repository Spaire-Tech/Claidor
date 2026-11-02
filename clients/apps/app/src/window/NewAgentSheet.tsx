// New Agent on a sheet (mac/Simeon/NewAgentSheet.swift, `MacNewAgentSheet`;
// the founder, 28 October 2026: "the same components as the iphone, with
// being able to choose the avatar"), from ⌘N and the sidebar's compose
// button while group chats are off. Drawn by App.tsx while
// `WindowModel.newAgent`.
//
// The glass disc that closes it and the title at its top; the face it will
// wear at 120 with Edit under it, both opening the avatar editor under the
// face (another face, a picture generated or uploaded, its voice; kept in an
// AgentDraft and sent with the agent at Create); Name and Title in one
// group, the keys in Name; Create, the sheet's one wide button in the blue.
// The face is given once and stays while the name is typed, changing only
// for a name of the other gender. The agent keeps that face, is asked to
// introduce itself, and its chat opens.

import {
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { AgentDraft, base64Of } from '../core/agentDraft'
import { faceURL } from '../core/faces'
import type { AppStore } from '../core/store'
import { t } from '../l10n'
import { AgentPicture } from './AgentMark'
import { AvatarEditorCard, AvatarEditorModel } from './AvatarEditor'
import { classes } from './classes'
import { Sheet } from './Dialogs'
import './NewAgentSheet.css'
import { useWatched } from './useStore'
import { useWindowModel } from './windowModel'

/** The first `count` characters (as the Mac counts them: what a person sees as one). */
function firstCharacters(value: string, count: number): string {
  const characters =
    typeof Intl !== 'undefined' && 'Segmenter' in Intl
      ? [
          ...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(
            value,
          ),
        ].map((part) => part.segment)
      : [...value]
  return characters.length > count ? characters.slice(0, count).join('') : value
}

/** Its words one space apart, as the Mac trims a name. */
function collapsed(value: string): string {
  return value
    .split(/\s+/)
    .filter((word) => word !== '')
    .join(' ')
}

/** New Agent's sheet, while the window asks for it; made, the pane closes and its chat opens (MainWindow.swift). */
export function NewAgentLayer({ store }: { store: AppStore }) {
  const model = useWindowModel()
  useWatched(model)
  if (!model.newAgent) return null
  return (
    <NewAgentSheet
      store={store}
      close={() => model.closeNewAgent()}
      created={(id) => {
        model.closePane()
        model.choose(id)
      }}
    />
  )
}

/**
 * The sheet (`MacNewAgentSheet`): 440 wide on the grouped ground. Escape and
 * a click outside close it, but not while the agent is made, and not while
 * the avatar editor is open (they close the editor first, as the Mac's
 * popover takes them).
 */
function NewAgentSheet({
  store,
  close,
  created,
}: {
  store: AppStore
  close: () => void
  created: (id: string) => void
}) {
  useWatched(store)
  // The face its name gets, settled as it opens.
  const [editor] = useState(() =>
    AvatarEditorModel.forDraft(new AgentDraft().settleFace(store.agents)),
  )
  useWatched(editor)
  const [name, setName] = useState('')
  const [title, setTitle] = useState('')
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const nameField = useRef<HTMLInputElement>(null)
  const titleField = useRef<HTMLInputElement>(null)
  const faceButton = useRef<HTMLButtonElement>(null)
  const editButton = useRef<HTMLButtonElement>(null)
  const keep = useMemo(() => [faceButton, editButton], [])
  const trimmed = collapsed(name)
  const draft = editor.draft ?? new AgentDraft()
  // The keys in Name as it opens, once the sheet has taken them.
  useEffect(() => {
    const frame = requestAnimationFrame(() => nameField.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [])
  // Gone with the editor open: a picture still being drawn is not shown again.
  useEffect(() => () => editor.closeNow(), [editor])
  // The picture drawn or uploaded, else the face picked, else the one the name gets.
  const picture = useMemo(
    () =>
      draft.picture
        ? `data:image/png;base64,${base64Of(draft.picture)}`
        : undefined,
    [draft.picture],
  )
  const shownFace = draft.shownFace(store.agents)
  const pictureURL = picture ?? (shownFace ? faceURL(shownFace) : undefined)

  const closeEditor = () => {
    editor.closeNow()
    editor.closeVoiceMenu()
    setEditing(false)
  }
  const editAvatar = () => {
    // The fields let go of the keys, as the Mac's `field = nil`.
    if (document.activeElement instanceof HTMLElement)
      document.activeElement.blur()
    editor.reopen()
    setEditing(true)
  }
  /** Escape or a click outside: the voices' list, then the editor, then the sheet (not while the agent is made). */
  const dismiss = () => {
    if (editor.voiceMenu) editor.closeVoiceMenu()
    else if (editing) closeEditor()
    else if (!busy) close()
  }
  const create = async () => {
    const made = trimmed
    if (made === '' || busy) return
    setBusy(true)
    setFailed(false)
    const id = await store.createAgentFromDraft(made, draft)
    setBusy(false)
    if (id) {
      close()
      created(id)
    } else {
      // The Mac beeps too; a page has no system alert sound.
      setFailed(true)
    }
  }
  // Return where no field takes it creates the agent, as the Mac's Create is the sheet's default button (`.keyboardShortcut(.defaultAction)`); not while the editor is open, whose popover has the keys.
  const returnCreates = useRef<() => void>(undefined)
  useLayoutEffect(() => {
    returnCreates.current = editing ? undefined : () => void create()
  })
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || event.isComposing || event.keyCode === 229)
        return
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey)
        return
      if (isTextField(event.target)) return
      const run = returnCreates.current
      if (!run) return
      event.preventDefault()
      run()
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [])
  return (
    <Sheet label={t('New Agent')} close={dismiss} className="new-agent-sheet">
      <div className="new-agent-top">
        <div className="new-agent-title" role="heading" aria-level={2}>
          {t('New Agent')}
        </div>
        <button
          type="button"
          className="new-agent-close glass-disc"
          title={t('Close')}
          aria-label={t('Close')}
          disabled={busy}
          onClick={() => {
            if (!busy) close()
          }}
        >
          <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M3.5 3.5l9 9M12.5 3.5l-9 9"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.4}
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
      <div className="new-agent-body">
        <div className="new-agent-face">
          <button
            ref={faceButton}
            type="button"
            className="new-agent-picture"
            aria-label={t('Edit agent avatar')}
            aria-expanded={editing}
            onClick={editAvatar}
          >
            <AgentPicture url={pictureURL} size={120} />
          </button>
          <button
            ref={editButton}
            type="button"
            className="new-agent-edit"
            onClick={editAvatar}
          >
            {t('Edit')}
          </button>
        </div>
        <div className="new-agent-group">
          <div className="new-agent-rows">
            <input
              ref={nameField}
              className="new-agent-line"
              value={name}
              placeholder={t('Name')}
              aria-label={t('Name')}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => {
                const next = firstCharacters(event.target.value, 60)
                setName(next)
                editor.setDraft(
                  draft.named(collapsed(next)).settleFace(store.agents),
                )
              }}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing || event.key !== 'Enter')
                  return
                event.preventDefault()
                titleField.current?.focus()
              }}
            />
            <div className="new-agent-divider" />
            <input
              ref={titleField}
              className="new-agent-line"
              value={title}
              placeholder={t('Title')}
              aria-label={t('Title')}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => {
                const next = firstCharacters(event.target.value, 60)
                setTitle(next)
                // Its job, not just a name (the founder, 19 October 2026); may stay empty.
                editor.setDraft(draft.titled(collapsed(next)))
              }}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing || event.key !== 'Enter')
                  return
                event.preventDefault()
                void create()
              }}
            />
          </div>
          {failed && (
            <div className="new-agent-footer" role="alert">
              {t('Couldn’t create the agent. Try again.')}
            </div>
          )}
        </div>
      </div>
      <div className="new-agent-create-row">
        {/* Not greyed while it makes the agent: the blue stays under the spinner. */}
        <button
          type="button"
          className={classes('new-agent-create', trimmed === '' && 'empty')}
          disabled={trimmed === ''}
          onClick={() => void create()}
        >
          {busy && <span className="new-agent-spinner" aria-hidden="true" />}
          {t('Create')}
        </button>
      </div>
      {editing && (
        <EditorPopover
          anchor={faceButton}
          keep={keep}
          editor={editor}
          close={closeEditor}
        >
          <AvatarEditorCard
            store={store}
            agent={editor.shown(undefined, store)}
            model={editor}
            width={294}
            chrome={false}
            close={closeEditor}
          />
        </EditorPopover>
      )}
    </Sheet>
  )
}

/**
 * The editor in its own popover under the face (the Mac's `.popover` with
 * its arrow on the face's bottom edge, padded 4): the raised ground, round
 * 16, a hairline and a soft shadow; no arrow. Kept inside the window: under
 * the face, or over it when there is no room under it. A click anywhere
 * else but the face and Edit closes it; ⌘V outside a field pastes a picture
 * into Upload.
 */
function EditorPopover({
  anchor,
  keep,
  editor,
  close,
  children,
}: {
  anchor: RefObject<HTMLElement | null>
  keep: RefObject<HTMLElement | null>[]
  editor: AvatarEditorModel
  close: () => void
  children: ReactNode
}) {
  const box = useRef<HTMLDivElement>(null)
  const latest = useRef(close)
  useLayoutEffect(() => {
    latest.current = close
  })
  // Placed before it is painted, again as it changes size or the window does.
  useLayoutEffect(() => {
    const element = box.current
    if (!element) return
    const place = () => {
      const face = anchor.current?.getBoundingClientRect()
      if (!face) return
      const width = element.offsetWidth
      const height = element.offsetHeight
      const left = Math.min(
        Math.max(8, face.left + face.width / 2 - width / 2),
        Math.max(8, window.innerWidth - 8 - width),
      )
      let top = face.bottom + 6
      if (top + height > window.innerHeight - 8) {
        const above = face.top - 6 - height
        top = above >= 8 ? above : Math.max(8, window.innerHeight - 8 - height)
      }
      element.style.left = `${left}px`
      element.style.top = `${top}px`
      element.style.visibility = 'visible'
    }
    place()
    const watch = new ResizeObserver(place)
    watch.observe(element)
    window.addEventListener('resize', place)
    return () => {
      watch.disconnect()
      window.removeEventListener('resize', place)
    }
  }, [anchor])
  useEffect(() => {
    const down = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (editor.voiceMenu) {
        // The voices' list closes itself (`useDismiss`); as the Mac's menu, it takes the click outside it: nothing under it gets it, the sheet's dimmed window neither.
        const inList =
          target instanceof Element && target.closest('.context-menus')
        if (!inList) swallowClick(event)
        return
      }
      if (box.current?.contains(target)) return
      if (keep.some((one) => one.current?.contains(target))) return
      // On the dimmed window, the click closes only the editor, as the Mac's sheet waits while it is open (`!editingAvatar`).
      if (!(target instanceof Element && target.closest('.sheet')))
        event.preventDefault()
      latest.current()
    }
    const paste = (event: ClipboardEvent) => {
      if (isTextField(event.target)) return
      event.preventDefault()
      editor.paste([...(event.clipboardData?.files ?? [])])
    }
    document.addEventListener('mousedown', down, true)
    document.addEventListener('paste', paste)
    return () => {
      document.removeEventListener('mousedown', down, true)
      document.removeEventListener('paste', paste)
    }
  }, [editor, keep])
  return (
    <div ref={box} className="new-agent-popover">
      {children}
    </div>
  )
}

/** A mousedown taken by an open list: it reaches nothing under it (the sheet's dimmed window reads `defaultPrevented`), nor does the click it makes. */
function swallowClick(event: MouseEvent) {
  event.preventDefault()
  event.stopPropagation()
  const click = (next: MouseEvent) => {
    next.preventDefault()
    next.stopPropagation()
  }
  document.addEventListener('click', click, true)
  document.addEventListener(
    'mouseup',
    () =>
      setTimeout(() => document.removeEventListener('click', click, true), 0),
    { capture: true, once: true },
  )
}

/** A field that takes words (its own Return and paste come first); not a slider or a checkbox. */
function isTextField(target: EventTarget | null): boolean {
  if (target instanceof HTMLTextAreaElement) return true
  if (target instanceof HTMLElement && target.isContentEditable) return true
  if (!(target instanceof HTMLInputElement)) return false
  return ![
    'range',
    'checkbox',
    'radio',
    'button',
    'submit',
    'reset',
    'file',
    'color',
    'image',
  ].includes(target.type)
}
