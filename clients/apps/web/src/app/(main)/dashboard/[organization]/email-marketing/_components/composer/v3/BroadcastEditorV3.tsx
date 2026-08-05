'use client'

// Spaire broadcast editor v3 — FRAME (brick 1).
//
// Pixel-exact port of the uploaded design's chrome: top bar, left palette,
// canvas (envelope + email surface), right inspector. Built as real React so
// it's the foundation the live editor engine + blocks mount into next.
//
// Brick 1 scope (this file): the faithful shell + working chrome interactions
// (light/dark theme, Desktop/Mobile stage resize). The live TipTap engine,
// palette inserts, per-block editing and inspector controls are the next
// bricks — each added and verified on top of this frame.

import { EditorContent } from '@tiptap/react'
import {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react'

import { BlockChrome, type BlockSel } from './BlockChrome'
import { ColorPicker } from './colorPicker'
import { FormatBubble } from './FormatBubble'
import { THEMES, themeByKey, themeVars, type ThemeKey } from './themes'
import { TRIGGERS, triggerByKey, type TriggerKey } from './triggers'
import { COURSE_VARIANTS, type CourseVariant } from './courseBlock'
import { SAMPLE_COURSE, type CourseData } from './courseData'
import {
  documentJSON,
  dropIndexForY,
  dropLineY,
  emailHtml,
  insertBlock,
  insertBlockAt,
  insertCourseBlock,
  moveBlockTo,
  setBlockAttr,
  syncCourseBlocks,
  topBlocks,
  useEmailEditor,
  type InsertableBlock,
} from './engine'

import './editor.css'

const WIRED = new Set<InsertableBlock>([
  'text',
  'heading',
  'button',
  'quote',
  'divider',
  'spacer',
  'image',
])

const readAsDataURL = (file: File) =>
  new Promise<string>((resolve) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.readAsDataURL(file)
  })

// ── tiny inline icon set (stroke-based, matches the design's line icons) ──
function I({ d, size = 16, fill }: { d: string; size?: number; fill?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ? 'currentColor' : 'none'}
      stroke={fill ? 'none' : 'currentColor'}
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  )
}
const IC = {
  back: 'M15 18l-6-6 6-6',
  caret: 'M6 9l6 6 6-6',
  sun: 'M12 3v2M12 19v2M5 5l1.5 1.5M17.5 17.5L19 19M3 12h2M19 12h2M5 19l1.5-1.5M17.5 6.5L19 5M12 8a4 4 0 100 8 4 4 0 000-8z',
  moon: 'M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z',
  send: 'M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z',
  check: 'M20 6L9 17l-5-5',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  desktop: 'M3 5h18v11H3zM8 20h8M12 16v4',
  mobile: 'M7 3h10v18H7zM11 18h2',
  drag: 'M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01',
  up: 'M12 19V5M5 12l7-7 7 7',
  down: 'M12 5v14M19 12l-7 7-7-7',
  dup: 'M9 9h11v11H9zM5 15H4V4h11v1',
  trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6',
  info: 'M12 8h.01M11 12h1v4h1M12 3a9 9 0 100 18 9 9 0 000-18z',
}

// ── block palette definition (matches the design groups) ──
type PalItem = { key: string; label: string; d: string }
const PALETTE: { group: string; items: PalItem[] }[] = [
  {
    group: 'Course',
    items: [
      { key: 'cover', label: 'Cover', d: 'M3 5h18v14H3zM3 15l5-5 4 4 3-3 6 6' },
      { key: 'welcome', label: 'Welcome note', d: 'M4 5h16v11H4zM4 8l8 5 8-5' },
      { key: 'facts', label: 'Course facts', d: 'M4 6h16M4 12h16M4 18h10' },
      { key: 'curriculum', label: 'Curriculum', d: 'M6 4h12v16l-6-3-6 3z' },
      { key: 'progress', label: 'Progress bar', d: 'M3 12h18M3 12a3 3 0 013-3h6v6H6a3 3 0 01-3-3z' },
      { key: 'trailer', label: 'Trailer', d: 'M5 4l14 8-14 8z' },
      { key: 'instructor', label: 'Instructor', d: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0' },
      { key: 'cta', label: 'Call to action', d: 'M4 8h12v8H4zM16 12h4l-2-2m2 2l-2 2' },
    ],
  },
  {
    group: 'Content',
    items: [
      { key: 'image', label: 'Image', d: 'M3 5h18v14H3zM3 15l5-5 4 4 3-3 6 6' },
      { key: 'heading', label: 'Heading', d: 'M6 4v16M18 4v16M6 12h12' },
      { key: 'text', label: 'Text', d: 'M4 6h16M4 12h16M4 18h10' },
      { key: 'button', label: 'Button', d: 'M3 8h18v8H3zM7 12h10' },
      { key: 'quote', label: 'Quote', d: 'M7 7H5v6h4V9M19 7h-2v6h4V9' },
      { key: 'divider', label: 'Divider', d: 'M4 12h16' },
      { key: 'spacer', label: 'Spacer', d: 'M12 4v16M8 8l4-4 4 4M8 16l4 4 4-4' },
    ],
  },
  { group: 'Footer', items: [{ key: 'footer', label: 'Footer', d: 'M4 4h16v16H4zM4 15h16' }] },
]
// [label, tag] — tag becomes a {{token}} the backend swaps per-subscriber at
// send (matches the design's MERGE list exactly).
const MERGE: [string, string][] = [
  ['First name', 'first_name'],
  ['Last name', 'last_name'],
  ['Email', 'email'],
  ['Company', 'company'],
]

function Ctl({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="ctl">
      <div className="ctl-l">{label}</div>
      {children}
    </div>
  )
}

export type SavePayload = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json: Record<string, any>
  html: string
  subject: string
  preview: string
  from: string
}

export function BroadcastEditorV3({
  courseName = 'Southern Cooking',
  course: courseProp = SAMPLE_COURSE,
  initialDocument,
  initialSubject,
  onSave,
  onClose,
  onGenerateCopy,
  onUploadImage,
}: {
  courseName?: string
  /** The bound course — Course blocks auto-fill from it and live-sync on
      change. Defaults to the sample course (harness); the app passes a real
      course here (brick 15). */
  course?: CourseData
  /** Restore a previously saved document (TipTap JSON from content_json). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  initialDocument?: Record<string, any>
  /** Seed the subject (e.g. an existing sequence step's subject). */
  initialSubject?: string
  /** Close / exit the editor — wired to the top-bar back button. */
  onClose?: () => void
  /** Persist the email. Receives the TipTap JSON, the inbox-correct HTML, and
      the broadcast meta. The route wires this to create/patch the broadcast. */
  onSave?: (payload: SavePayload) => Promise<void> | void
  /** Generate recap copy from the course for the current lifecycle moment.
      The route wires this to POST /email-broadcasts/generate-copy (Claude). */
  onGenerateCopy?: (
    moment: string,
  ) => Promise<{
    subject: string
    preview: string
    heading: string
    body: string[]
  } | null>
  /** Upload a picked file and return its hosted URL. Defaults to an inline
      data URL (used by the harness); the app wires S3 upload here. */
  onUploadImage?: (file: File) => Promise<{ url: string }>
}) {
  const [dark, setDark] = useState(false)
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')
  const [toast, setToast] = useState('')
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const editor = useEmailEditor(initialDocument)
  const emailRef = useRef<HTMLDivElement>(null)
  const [sel, setSel] = useState<BlockSel>(null)
  // Which inspector colour the HSV picker is editing, + where it opens.
  const [picker, setPicker] = useState<
    { which: 'bg' | 'fg' | 'email-bg' | 'backdrop'; top: number; left: number } | null
  >(null)
  // Canvas theming: a preset theme (null = the default light surface) plus
  // optional manual background / backdrop overrides.
  const [themeKey, setThemeKey] = useState<ThemeKey | null>(null)
  const [bgOverride, setBgOverride] = useState<string | null>(null)
  const [backdropOverride, setBackdropOverride] = useState<string | null>(null)
  // Drag-to-insert (palette) / drag-to-reorder (block grip) state.
  const [drag, setDrag] = useState<
    | { kind: 'insert'; type: string; label: string }
    | { kind: 'move'; index: number }
    | null
  >(null)
  const [dropY, setDropY] = useState<number | null>(null)
  const dropIndexRef = useRef<number | null>(null)
  // ── Top-bar: lifecycle trigger + broadcast meta + menus/modal ──
  const [triggerKey, setTriggerKey] = useState<TriggerKey>('enrolment')
  const trigger = triggerByKey(triggerKey)
  const [broadcast, setBroadcast] = useState({
    subject: initialSubject || trigger.subject,
    preview: trigger.preview,
    from: 'Adaeze Bello',
  })
  // AI recap copy overrides the bound course's welcome note (brick 16). The
  // course blocks live-sync from this merged `course`.
  const [aiCopy, setAiCopy] = useState<{
    welcomeHeading?: string
    welcome?: string[]
  } | null>(null)
  const [generating, setGenerating] = useState(false)
  const course = useMemo(
    () =>
      aiCopy
        ? {
            ...courseProp,
            welcomeHeading: aiCopy.welcomeHeading ?? courseProp.welcomeHeading,
            welcome: aiCopy.welcome ?? courseProp.welcome,
          }
        : courseProp,
    [courseProp, aiCopy],
  )
  // Anchored popovers (trigger switcher / send menu) + the save sheet.
  const [menu, setMenu] = useState<
    { kind: 'trigger' | 'send'; top: number; left: number } | null
  >(null)
  const [saveOpen, setSaveOpen] = useState(false)

  // Re-render the chrome (inspector live values, empty-state) on editor edits.
  const [, forceTick] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    if (!editor) return
    const f = () => forceTick()
    editor.on('transaction', f)
    editor.on('selectionUpdate', f)
    return () => {
      editor.off('transaction', f)
      editor.off('selectionUpdate', f)
    }
  }, [editor])

  const setHeadingLevel = (level: number) =>
    // React Email's heading ships a custom setHeading command (updateAttributes
    // doesn't re-render its node view).
    editor
      ?.chain()
      .focus()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .setHeading({ level } as any)
      .run()
  const setButtonLink = (href: string) => {
    if (sel) setBlockAttr(editor, sel.index, { href })
  }

  const showToast = (m: string) => {
    setToast(m)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 2200)
  }

  const isCourse = (key: string): key is CourseVariant =>
    (COURSE_VARIANTS as readonly string[]).includes(key)
  const onPalette = (key: string, label: string) => {
    if (isCourse(key)) {
      insertCourseBlock(editor, key, course)
      showToast(`${label} added`)
    } else if (WIRED.has(key as InsertableBlock)) {
      insertBlock(editor, key as InsertableBlock)
    } else {
      showToast(`“${label}” block is coming next`)
    }
  }

  // Current spacer height for the inspector stepper.
  const spacerHeight =
    sel?.type === 'spacer'
      ? ((topBlocks(editor)[sel.index]?.node.attrs.height as number) ?? 24)
      : 24
  const setSpacerHeight = (h: number) => {
    if (sel) setBlockAttr(editor, sel.index, { height: Math.max(4, h) })
  }

  // ── Image upload + attrs ──
  const fileInputRef = useRef<HTMLInputElement>(null)
  const uploadIndexRef = useRef<number | null>(null)
  const uploadImage = onUploadImage ?? (async (f: File) => ({ url: await readAsDataURL(f) }))
  const triggerUpload = (index: number) => {
    uploadIndexRef.current = index
    fileInputRef.current?.click()
  }
  const onFilePicked = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    const idx = uploadIndexRef.current
    e.target.value = ''
    if (!file || idx == null) return
    const { url } = await uploadImage(file)
    setBlockAttr(editor, idx, { src: url })
    // Keep the image selected so the inspector stays on it after upload.
    const pos = topBlocks(editor)[idx]?.pos
    if (pos != null) editor?.commands.setNodeSelection(pos)
  }
  const imgAttrs =
    sel?.type === 'image'
      ? ((topBlocks(editor)[sel.index]?.node.attrs as {
          src: string | null
          alt: string
          href: string
          align: string
        }) ?? null)
      : null

  // ── Alignment + button colours ──
  const blockAttrs = (i: number) =>
    (topBlocks(editor)[i]?.node.attrs ?? {}) as Record<string, string>
  const ALIGNABLE = new Set(['paragraph', 'heading', 'blockquote', 'button'])
  const curAlign = sel ? blockAttrs(sel.index).alignment || 'left' : 'left'
  const setAlign = (a: string) => {
    if (sel) setBlockAttr(editor, sel.index, { alignment: a })
  }
  const parseStyle = (s?: string): Record<string, string> =>
    Object.fromEntries(
      (s || '')
        .split(';')
        .map((x) => x.trim())
        .filter(Boolean)
        .map((x) => {
          const i = x.indexOf(':')
          return [x.slice(0, i).trim(), x.slice(i + 1).trim()]
        }),
    )
  const btnStyle = sel?.type === 'button' ? parseStyle(blockAttrs(sel.index).style) : {}
  const setBtnColor = (patch: { bg?: string; color?: string }) => {
    if (!sel) return
    const st = parseStyle(blockAttrs(sel.index).style)
    if (patch.bg !== undefined) st['background-color'] = patch.bg
    if (patch.color !== undefined) st['color'] = patch.color
    setBlockAttr(editor, sel.index, {
      style: Object.entries(st)
        .map(([k, v]) => `${k}:${v}`)
        .join(';'),
    })
  }
  // Insert a {{token}} at the cursor — only into editable text (matches the
  // design's "Click into a text block first" guard). The backend swaps the
  // real value per subscriber at send.
  const insertMerge = (tag: string) => {
    if (!editor) return
    const { $from } = editor.state.selection
    if (!$from.parent.isTextblock) {
      showToast('Click into a text block first')
      return
    }
    editor.chain().focus().insertContent(`{{${tag}}}`).run()
  }
  // ── Drag & drop: palette → insert, block grip → reorder ──
  const onCanvasDragOver = (e: ReactDragEvent) => {
    if (!drag || !editor) return
    e.preventDefault()
    e.dataTransfer.dropEffect = drag.kind === 'insert' ? 'copy' : 'move'
    const idx = dropIndexForY(editor, e.clientY)
    dropIndexRef.current = idx
    if (emailRef.current) setDropY(dropLineY(editor, idx, emailRef.current))
  }
  const endDrag = () => {
    setDrag(null)
    setDropY(null)
    dropIndexRef.current = null
  }
  const onCanvasDrop = (e: ReactDragEvent) => {
    if (!drag || !editor) return endDrag()
    e.preventDefault()
    const idx = dropIndexRef.current ?? topBlocks(editor).length
    if (drag.kind === 'insert') {
      if (isCourse(drag.type)) insertCourseBlock(editor, drag.type, course, idx)
      else insertBlockAt(editor, drag.type as InsertableBlock, idx)
      showToast(`${drag.label} added`)
    } else {
      moveBlockTo(editor, drag.index, idx)
    }
    endDrag()
  }

  // Open the HSV picker beside the clicked trigger (toggle if same one).
  const openPicker = (
    which: 'bg' | 'fg' | 'email-bg' | 'backdrop',
    e: ReactMouseEvent,
  ) => {
    if (picker?.which === which) return setPicker(null)
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setPicker({ which, top: r.bottom + 6, left: r.left - 232 + r.width })
  }

  // ── Resolved canvas theme ──
  const theme = themeByKey(themeKey)
  const emailBg = bgOverride ?? theme?.emailBg ?? null
  const backdrop = backdropOverride ?? theme?.outerBg ?? null
  const emailStyle = {
    ...(theme ? themeVars(theme) : {}),
    ...(emailBg ? { background: emailBg } : {}),
  } as CSSProperties
  const pickTheme = (k: ThemeKey | null) => {
    setThemeKey(k)
    setBgOverride(null)
    setBackdropOverride(null)
    setPicker(null)
  }

  // ── Top-bar handlers ──
  const openMenu = (kind: 'trigger' | 'send', e: ReactMouseEvent) => {
    if (menu?.kind === kind) return setMenu(null)
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setMenu({ kind, top: r.bottom + 6, left: r.left })
  }
  const selectTrigger = (key: TriggerKey) => {
    setMenu(null)
    if (key === triggerKey) return
    setTriggerKey(key)
    // switching the trigger re-seeds the broadcast defaults (design behaviour)
    const t = triggerByKey(key)
    setBroadcast((b) => ({ ...b, subject: t.subject, preview: t.preview }))
  }
  const doTest = () => {
    setMenu(null)
    showToast(`Test of “${broadcast.subject || 'Untitled'}” sent to you`)
  }
  // Generate the welcome-note recap copy from the course for this moment.
  const runGenerate = async () => {
    if (!onGenerateCopy || generating) return
    setGenerating(true)
    try {
      const c = await onGenerateCopy(triggerKey)
      if (c) {
        setBroadcast((b) => ({
          ...b,
          subject: c.subject || b.subject,
          preview: c.preview || b.preview,
        }))
        setAiCopy({
          welcomeHeading: c.heading || undefined,
          welcome: c.body?.length ? c.body : undefined,
        })
        showToast('Copy generated from the course')
      }
    } catch {
      showToast('Couldn’t generate copy')
    } finally {
      setGenerating(false)
    }
  }
  const [saving, setSaving] = useState(false)
  const commitSave = async () => {
    const json = documentJSON(editor)
    if (onSave && json) {
      try {
        setSaving(true)
        const html = await emailHtml(editor)
        await onSave({
          json,
          html,
          subject: broadcast.subject,
          preview: broadcast.preview,
          from: broadcast.from,
        })
      } catch {
        setSaving(false)
        showToast('Couldn’t save — please try again')
        return
      }
      setSaving(false)
    }
    setSaveOpen(false)
    showToast(onSave ? 'Saved' : 'Saved to the sequence')
  }

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current)
    },
    [],
  )
  // Live-sync: whenever the bound course changes, re-stamp every course block.
  useEffect(() => {
    syncCourseBlocks(editor, course)
  }, [editor, course])
  // Escape closes the top-bar menus / save sheet (design parity).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenu(null)
        setSaveOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className={'bem' + (dark ? ' dark' : '')}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        data-testid="image-file-input"
        onChange={onFilePicked}
      />
      {/* ── Top bar ─────────────────────────────────────────── */}
      <header className="topbar">
        <button className="tb-back" data-testid="tb-back" onClick={onClose}>
          <I d={IC.back} size={16} /> {onClose ? 'Back' : 'Broadcasts'}
        </button>
        <span className="tb-divide" />
        <button
          className="tb-crumb"
          data-testid="crumb"
          onClick={(e) => openMenu('trigger', e)}
        >
          <span className="tb-course">{courseName}</span>
          <span className="tb-sep">/</span>
          <span className="tb-name">{trigger.name}</span>
          <span className="tb-caret">
            <I d={IC.caret} size={14} />
          </span>
        </button>
        <span className="tb-status">
          <span className="saved-dot" /> Saved
        </span>
        <div className="tb-actions">
          <button
            className="icon-circ theme-toggle"
            onClick={() => setDark((d) => !d)}
            aria-label="Toggle theme"
          >
            <I d={dark ? IC.sun : IC.moon} size={18} />
          </button>
          <div className="btn-split">
            <button
              className="bs-main"
              data-testid="save-btn"
              onClick={() => setSaveOpen(true)}
            >
              <I d={IC.check} size={15} /> Save
            </button>
            <button
              className="bs-caret"
              data-testid="send-caret"
              onClick={(e) => openMenu('send', e)}
            >
              <I d={IC.caret} size={14} />
            </button>
          </div>
        </div>
      </header>

      {/* ── Shell ───────────────────────────────────────────── */}
      <div className="shell">
        {/* Palette */}
        <aside className="side">
          {PALETTE.map((g) => (
            <div className="pal-group" key={g.group}>
              <div className="pal-label">{g.group}</div>
              <div className="pal-grid">
                {g.items.map((it) => {
                  const wired =
                    WIRED.has(it.key as InsertableBlock) || isCourse(it.key)
                  return (
                    <button
                      className={
                        'pal-item' +
                        (drag?.kind === 'insert' && drag.type === it.key
                          ? ' dragging'
                          : '')
                      }
                      key={it.key}
                      data-block={it.key}
                      draggable={wired}
                      onClick={() => onPalette(it.key, it.label)}
                      onDragStart={(e) => {
                        if (!wired) return e.preventDefault()
                        e.dataTransfer.effectAllowed = 'copy'
                        e.dataTransfer.setData('text/plain', it.key)
                        setDrag({
                          kind: 'insert',
                          type: it.key,
                          label: it.label,
                        })
                      }}
                      onDragEnd={endDrag}
                    >
                      <span className="pal-droplet">
                        <I d={it.d} size={15} />
                      </span>
                      <span className="pal-t">{it.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
          <div className="pal-group">
            <div className="pal-label">Personalize</div>
            <div className="merge-wrap">
              {MERGE.map(([label, tag]) => (
                <button
                  className="merge-chip"
                  key={tag}
                  data-merge={tag}
                  // keep the editor selection so the token lands at the cursor
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => insertMerge(tag)}
                >
                  <I d="M12 5v14M5 12h14" size={11} /> {label}
                </button>
              ))}
            </div>
            <div className="merge-hint">
              Click a tag while editing to insert it. We swap in each
              subscriber&apos;s details on send.
            </div>
          </div>
        </aside>

        {/* Canvas */}
        <div className="canvas-col">
          <div className="canvas-head">
            <div className="seg">
              <button
                className={device === 'desktop' ? 'on' : ''}
                onClick={() => setDevice('desktop')}
              >
                <I d={IC.desktop} size={15} /> Desktop
              </button>
              <button
                className={device === 'mobile' ? 'on' : ''}
                onClick={() => setDevice('mobile')}
              >
                <I d={IC.mobile} size={15} /> Mobile
              </button>
            </div>
            <div className="ch-spacer" />
            <span className="ch-meta" data-testid="audience-count">
              {trigger.count.toLocaleString('en-US')} enrolled
            </span>
          </div>

          <main
            className="canvas"
            style={backdrop ? { background: backdrop } : undefined}
            onDragOver={onCanvasDragOver}
            onDrop={onCanvasDrop}
            onMouseDown={(e) => {
              // Clicking the backdrop (not a block) deselects → email settings.
              const t = e.target as HTMLElement
              if (t.classList.contains('canvas') || t.classList.contains('stage')) {
                editor?.commands.blur()
                setSel(null)
                setPicker(null)
              }
            }}
          >
            <div className={'stage' + (device === 'mobile' ? ' mobile' : '')}>
              <div
                ref={emailRef}
                className={'email' + (editor?.isEmpty ? ' empty-hint' : '')}
                style={emailStyle}
              >
                {drag && dropY !== null && (
                  <div
                    className="drop-line show"
                    data-testid="drop-line"
                    style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      top: dropY,
                      height: 2,
                      background: 'var(--accent)',
                      borderRadius: 2,
                      zIndex: 9,
                      pointerEvents: 'none',
                    }}
                  />
                )}
                {editor?.isEmpty && (
                  <div className="email-empty">
                    <div className="ee-ic">
                      <I d="M12 5v14M5 12h14" size={20} />
                    </div>
                    Add a block from the left to start your email — Text,
                    Heading or Button.
                  </div>
                )}
                <EditorContent editor={editor} />
                <BlockChrome
                  editor={editor}
                  emailRef={emailRef}
                  onGripDragStart={(index) =>
                    setDrag({ kind: 'move', index })
                  }
                  onGripDragEnd={endDrag}
                  onSelect={(s) => {
                    // Keep the inspector sticky while the user is in its own
                    // controls. Focusing a field (the HSV hex input, a text
                    // box) blurs the editor; the blurred selection collapses to
                    // the doc start and BlockChrome then reports null — or a
                    // spurious first-block selection on the next edit-dispatch.
                    // Either would yank the panel out from under the user, so
                    // ignore editor selection entirely while focus is in our UI.
                    if (document.activeElement?.closest('.inspector, .color-pop'))
                      return
                    // Otherwise close the picker only when the block actually
                    // changes (BlockChrome re-emits onSelect every transaction).
                    if (s?.index !== sel?.index || s?.type !== sel?.type)
                      setPicker(null)
                    setSel(s)
                  }}
                />
              </div>
            </div>
          </main>
        </div>

        {/* Inspector */}
        <aside className="inspector">
          <div className="insp-head">
            <div className="ih-main">
              <span className="ih-k">{sel ? 'Block' : ''}</span>
              <span className="ih-t">{sel ? sel.label : 'Email settings'}</span>
            </div>
          </div>
          <div className="insp-body" data-testid="inspector-body">
            {sel ? (
              // ── Selected-block settings ──
              <div className="ig">
                <div className="ig-h">{sel.label}</div>
                {sel.type === 'heading' && (
                  <Ctl label="Level">
                    <div className="iseg">
                      {[1, 2, 3].map((lv) => (
                        <button
                          key={lv}
                          // Keep the editor's selection while clicking (toolbar
                          // pattern) so the command targets the right block.
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => setHeadingLevel(lv)}
                          data-level={lv}
                        >
                          H{lv}
                        </button>
                      ))}
                    </div>
                  </Ctl>
                )}
                {sel.type === 'button' && (
                  <>
                    <Ctl label="Link">
                      <input
                        className="fld"
                        placeholder="https://…"
                        data-testid="btn-link"
                        defaultValue="https://example.com"
                        onChange={(e) => setButtonLink(e.target.value)}
                      />
                    </Ctl>
                    <Ctl label="Background">
                      <button
                        className="cp-trigger"
                        data-testid="btn-bg"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={(e) => openPicker('bg', e)}
                      >
                        <span
                          className="cp-tsw"
                          style={{
                            background: btnStyle['background-color'] || '#127c2b',
                          }}
                        />
                        {(btnStyle['background-color'] || '#127c2b').toUpperCase()}
                      </button>
                    </Ctl>
                    <Ctl label="Text colour">
                      <button
                        className="cp-trigger"
                        data-testid="btn-fg"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={(e) => openPicker('fg', e)}
                      >
                        <span
                          className="cp-tsw"
                          style={{ background: btnStyle['color'] || '#ffffff' }}
                        />
                        {(btnStyle['color'] || '#ffffff').toUpperCase()}
                      </button>
                    </Ctl>
                  </>
                )}
                {sel.type === 'image' && imgAttrs && (
                  <>
                    <Ctl label={imgAttrs.src ? 'Replace image' : 'Image'}>
                      <button
                        className="upload-btn"
                        data-testid="img-upload"
                        onClick={() => triggerUpload(sel.index)}
                      >
                        <I d="M12 5v14M5 12h14" size={15} />{' '}
                        {imgAttrs.src ? 'Replace image' : 'Upload image'}
                      </button>
                    </Ctl>
                    <Ctl label="Alt text">
                      <input
                        className="fld"
                        data-testid="img-alt"
                        placeholder="Describe the image"
                        value={imgAttrs.alt}
                        onChange={(e) =>
                          setBlockAttr(editor, sel.index, { alt: e.target.value })
                        }
                      />
                    </Ctl>
                    <Ctl label="Link">
                      <input
                        className="fld"
                        placeholder="https://…"
                        value={imgAttrs.href}
                        onChange={(e) =>
                          setBlockAttr(editor, sel.index, { href: e.target.value })
                        }
                      />
                    </Ctl>
                    <Ctl label="Alignment">
                      <div className="iseg">
                        {(['left', 'center', 'full'] as const).map((a) => (
                          <button
                            key={a}
                            className={imgAttrs.align === a ? 'on' : ''}
                            data-align={a}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() =>
                              setBlockAttr(editor, sel.index, { align: a })
                            }
                          >
                            {a[0].toUpperCase() + a.slice(1)}
                          </button>
                        ))}
                      </div>
                    </Ctl>
                  </>
                )}
                {sel.type === 'spacer' && (
                  <Ctl label={<span>Height<span className="val">{spacerHeight}px</span></span>}>
                    <div className="stepper">
                      <button
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => setSpacerHeight(spacerHeight - 4)}
                        data-step="down"
                      >
                        −
                      </button>
                      <span className="num">{spacerHeight}</span>
                      <button
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => setSpacerHeight(spacerHeight + 4)}
                        data-step="up"
                      >
                        +
                      </button>
                    </div>
                  </Ctl>
                )}
                {ALIGNABLE.has(sel.type) && (
                  <Ctl label="Alignment">
                    <div className="iseg">
                      {(['left', 'center', 'right'] as const).map((a) => (
                        <button
                          key={a}
                          className={curAlign === a ? 'on' : ''}
                          data-textalign={a}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => setAlign(a)}
                        >
                          {a[0].toUpperCase() + a.slice(1)}
                        </button>
                      ))}
                    </div>
                  </Ctl>
                )}
                {sel.type === 'courseBlock' && (
                  <div className="insp-empty-note" data-testid="course-note">
                    <span className="n-ic">
                      <I d={IC.info} size={15} />
                    </span>
                    This block fills automatically from{' '}
                    <strong>{course.title}</strong> and updates whenever the
                    course changes.
                  </div>
                )}
                {!ALIGNABLE.has(sel.type) &&
                  sel.type !== 'spacer' &&
                  sel.type !== 'image' &&
                  sel.type !== 'courseBlock' && (
                    <div className="insp-empty-note">
                      <span className="n-ic">
                        <I d={IC.info} size={15} />
                      </span>
                      Formatting is on the toolbar. More settings for this block
                      are coming.
                    </div>
                  )}
              </div>
            ) : (
              // ── Email-level settings ──
              <>
                <div className="ig">
                  <div className="ig-h">Details</div>
                  {onGenerateCopy && (
                    <button
                      className={'ai-generate' + (generating ? ' busy' : '')}
                      data-testid="ai-generate"
                      // don't use `disabled` — it blurs the button and the
                      // sticky-inspector guard (which keys on focus staying in
                      // .inspector) would drop email settings on the sync tick.
                      aria-disabled={generating}
                      onClick={runGenerate}
                    >
                      <I d="M5 3v4M3 5h4M6 17v4M4 19h4M13 3l3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7z" size={15} />
                      {generating ? 'Generating…' : 'Generate copy from course'}
                    </button>
                  )}
                  <Ctl label="Subject">
                    <input
                      className="fld"
                      data-testid="set-subject"
                      value={broadcast.subject}
                      onChange={(e) =>
                        setBroadcast((b) => ({ ...b, subject: e.target.value }))
                      }
                    />
                  </Ctl>
                  <Ctl label="Preview text">
                    <input
                      className="fld"
                      value={broadcast.preview}
                      onChange={(e) =>
                        setBroadcast((b) => ({ ...b, preview: e.target.value }))
                      }
                    />
                  </Ctl>
                  <Ctl label="From name">
                    <input
                      className="fld"
                      value={broadcast.from}
                      onChange={(e) =>
                        setBroadcast((b) => ({ ...b, from: e.target.value }))
                      }
                    />
                  </Ctl>
                  <Ctl label="Audience">
                    <button className="aud-pill">
                      <span className="aud-dot" />
                      <span className="aud-name">{trigger.audience}</span>
                      <span className="aud-cnt">
                        {trigger.count.toLocaleString('en-US')}
                      </span>
                    </button>
                  </Ctl>
                </div>
                <div className="ig">
                  <div className="ig-h">Theme</div>
                  <div className="theme-grid" data-testid="theme-grid">
                    <button
                      className={'theme-chip' + (themeKey === null ? ' on' : '')}
                      data-theme="default"
                      onClick={() => pickTheme(null)}
                    >
                      <span className="tc-sw" style={{ background: '#ffffff' }}>
                        <span className="tc-bar" style={{ background: '#1d1d1f' }} />
                        <span
                          className="tc-pill"
                          style={{ background: 'var(--accent)' }}
                        />
                      </span>
                      <span className="tc-name">Default</span>
                    </button>
                    {THEMES.map((t) => (
                      <button
                        key={t.key}
                        className={'theme-chip' + (themeKey === t.key ? ' on' : '')}
                        data-theme={t.key}
                        onClick={() => pickTheme(t.key)}
                      >
                        <span className="tc-sw" style={{ background: t.emailBg }}>
                          <span
                            className="tc-bar"
                            style={{ background: t.heading }}
                          />
                          <span
                            className="tc-pill"
                            style={{ background: t.accent }}
                          />
                        </span>
                        <span className="tc-name">{t.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="ig">
                  <div className="ig-h">Canvas</div>
                  <Ctl label="Email background">
                    <button
                      className="cp-trigger"
                      data-testid="email-bg"
                      onClick={(e) => openPicker('email-bg', e)}
                    >
                      <span
                        className="cp-tsw"
                        style={{ background: emailBg ?? '#ffffff' }}
                      />
                      {(emailBg ?? '#ffffff').toUpperCase()}
                    </button>
                  </Ctl>
                  <Ctl label="Backdrop">
                    <button
                      className="cp-trigger"
                      data-testid="backdrop"
                      onClick={(e) => openPicker('backdrop', e)}
                    >
                      <span
                        className="cp-tsw"
                        style={{ background: backdrop ?? '#eeeef0' }}
                      />
                      {(backdrop ?? '#EEEEF0').toUpperCase()}
                    </button>
                  </Ctl>
                </div>
                <div className="insp-empty-note">
                  <span className="n-ic">
                    <I d={IC.info} size={15} />
                  </span>
                  Select any block to edit it. Every colour control draws from
                  the template&apos;s presets.
                </div>
              </>
            )}
          </div>
        </aside>
      </div>

      <FormatBubble editor={editor} />

      {/* Inspector HSV picker for button background / text colour. */}
      {picker && sel?.type === 'button' && (
        <ColorPicker
          value={
            picker.which === 'bg'
              ? btnStyle['background-color'] || '#127c2b'
              : btnStyle['color'] || '#ffffff'
          }
          anchor={{ top: picker.top, left: picker.left }}
          onChange={(c) =>
            setBtnColor(picker.which === 'bg' ? { bg: c } : { color: c })
          }
          onClose={() => setPicker(null)}
        />
      )}

      {/* Canvas pickers (email background / backdrop) — email-level settings. */}
      {picker && !sel && (picker.which === 'email-bg' || picker.which === 'backdrop') && (
        <ColorPicker
          value={
            picker.which === 'email-bg'
              ? emailBg ?? '#ffffff'
              : backdrop ?? '#eeeef0'
          }
          anchor={{ top: picker.top, left: picker.left }}
          onChange={(c) =>
            picker.which === 'email-bg'
              ? setBgOverride(c)
              : setBackdropOverride(c)
          }
          onClose={() => setPicker(null)}
        />
      )}

      {/* ── Top-bar popovers (trigger switcher / send menu) ── */}
      {menu && (
        <>
          <div className="float-backdrop" onMouseDown={() => setMenu(null)} />
          {menu.kind === 'trigger' ? (
            <div
              className="float-pop trig-menu"
              data-testid="trigger-menu"
              style={{ position: 'fixed', top: menu.top, left: menu.left, zIndex: 500 }}
            >
              {TRIGGERS.map((t) => (
                <button
                  key={t.key}
                  className={'trig-item' + (t.key === triggerKey ? ' on' : '')}
                  data-trigger={t.key}
                  onClick={() => selectTrigger(t.key)}
                >
                  <span className="ti-tick">
                    {t.key === triggerKey && <I d="M20 6 9 17l-5-5" size={14} />}
                  </span>
                  <span className="ti-text">
                    <span className="ti-name">{t.name}</span>
                    <span className="ti-desc">{t.desc}</span>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div
              className="float-pop send-menu"
              data-testid="send-menu"
              style={{ position: 'fixed', top: menu.top, left: menu.left, zIndex: 500 }}
            >
              <button className="fp-item" data-testid="send-test" onClick={doTest}>
                <I d="M3 7l9 6 9-6M3 5h18v14H3z" size={15} />
                <span>Send test to me</span>
              </button>
            </div>
          )}
        </>
      )}

      {/* ── Save sheet ── */}
      {saveOpen && (
        <div
          className="save-ov show"
          data-testid="save-sheet"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSaveOpen(false)
          }}
        >
          <div className="save-sheet">
            <div className="ss-t">Save to sequence</div>
            <div className="ss-s">
              Confirm the details before saving the {trigger.name} email.
            </div>
            <div className="ss-rows">
              <div className="ss-field">
                <div className="ss-l">Subject</div>
                <input
                  className="ss-in"
                  data-testid="ss-subject"
                  autoFocus
                  value={broadcast.subject}
                  onChange={(e) =>
                    setBroadcast((b) => ({ ...b, subject: e.target.value }))
                  }
                />
              </div>
              <div className="ss-field">
                <div className="ss-l">Preview text</div>
                <textarea
                  className="ss-in"
                  rows={2}
                  value={broadcast.preview}
                  onChange={(e) =>
                    setBroadcast((b) => ({ ...b, preview: e.target.value }))
                  }
                />
              </div>
              <div className="ss-field">
                <div className="ss-l">From name</div>
                <input
                  className="ss-in"
                  value={broadcast.from}
                  onChange={(e) =>
                    setBroadcast((b) => ({ ...b, from: e.target.value }))
                  }
                />
              </div>
              <div className="ss-field">
                <div className="ss-l">Audience</div>
                <div className="ss-readonly">
                  <span className="ss-dot" />
                  <span>
                    {trigger.audience} · {trigger.count.toLocaleString('en-US')}
                  </span>
                  <span className="ss-lock">Set by trigger</span>
                </div>
              </div>
            </div>
            <div className="ss-foot">
              <button className="ss-cancel" onClick={() => setSaveOpen(false)}>
                Cancel
              </button>
              <button
                className="ss-save"
                data-testid="ss-save"
                disabled={saving}
                onClick={commitSave}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={'toast' + (toast ? ' show' : '')}>
        <span className="tk">
          <I d={IC.check} size={15} />
        </span>
        <span>{toast}</span>
      </div>
    </div>
  )
}
