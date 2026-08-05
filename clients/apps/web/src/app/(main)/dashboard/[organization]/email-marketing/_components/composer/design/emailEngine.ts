/* ============================================================
   BROADCAST EDITOR — engine. Faithful port of the creator's
   design controller, adapted to mount into a host-provided root
   element (React renders the shell; this drives it imperatively).

   Consumes the design data module (THEMES, TEMPLATES, REG, …) and
   drives the 3-pane editor: palette · themed email canvas · inspector.

   Differences from the standalone design, by product decision:
   • No theme picker — each template carries its own theme.
   • No "generate copy" button — templates are bound to the real
     course automatically (opts.applyCourse).
   • Save hands the authored subject + inbox-correct HTML + JSON
     back to the host via opts.onSave.
   ============================================================ */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  GROUPS,
  ICO,
  REG,
  THEMES,
  TEMPLATES,
  svg,
  setAssetResolver,
  type Props,
  type Theme,
} from './emailData'
import { buildEmailHTML } from './emailRender'
import { pastedTextToHtml, sanitizePastedHtml } from './sanitizeHtml'

export interface Block {
  id: string
  type: string
  props: Props
}

export interface BroadcastMeta {
  from: string
  audience: string
  count: string
  subject: string
  preview: string
}

export interface EditorState {
  version: 3
  trigger: string
  themeKey: string
  /** Per-email overrides of the base theme (e.g. a changed email background or
   *  backdrop). Saved + restored so a chosen colour survives a reopen. */
  themeOverrides?: Partial<Theme>
  blocks: { type: string; props: Props }[]
  broadcast: BroadcastMeta
}

export interface CreateEditorOpts {
  /** Real course name, shown in the top-bar crumb. */
  courseName?: string
  /** Lifecycle trigger to open on (enrolment, firstLesson, …). */
  initialTrigger?: string
  /** When true, the top-bar template/trigger switcher is disabled. In an
   *  automation the sequence's trigger governs the moment, and switching
   *  templates here would wipe the authored blocks and desync the email from
   *  what actually sends. */
  lockTrigger?: boolean
  /** Real number of students enrolled in the course (replaces the placeholder). */
  enrolledCount?: number
  /** Default "from" name — the course instructor or the creator/organization. */
  fromName?: string
  /** Previously-saved editor state to restore instead of a fresh template. */
  initialState?: EditorState | null
  /** Resolve a design asset key (e.g. 'assets/southern-cooking.jpg') to a URL. */
  resolveAsset?: (key: string) => string
  /** Overlay real course data onto a freshly-loaded template's blocks (mutates/returns). */
  applyCourse?: (blocks: Block[], trigger: string) => Block[]
  /** Upload a chosen image file, returning its hosted URL (S3). */
  onUploadImage?: (file: File) => Promise<string>
  /** Persist: subject + inbox HTML + serialisable JSON + trigger. Return
   *  `false` when the host could NOT persist (e.g. the automation itself
   *  hasn't been created yet) so the status tells the truth. */
  onSave?: (v: { subject: string; preview: string; html: string; json: EditorState; trigger: string }) => void | boolean
  /** Persist edits in the background WITHOUT closing the editor. When wired,
   *  the engine autosaves on a debounce after every edit (and flushes on close)
   *  so the "Saved" status is truthful and work is never lost on Back. Return
   *  `false` when the edits could not be persisted yet. */
  onAutosave?: (v: { subject: string; preview: string; html: string; json: EditorState; trigger: string }) => void | boolean
  /** Back / close. */
  onClose?: () => void
  /** Fired on every content/structure change (autosave hint). */
  onChange?: () => void
  /** Send a test of the current authored email to the creator's inbox. */
  onSendTest?: (v: { subject: string; preview: string; html: string }) => Promise<void>
}

export interface EditorHandle {
  getState: () => EditorState
  getHTML: () => string
  /** The host reports the outcome of its (async, debounced) write so the
   *  status chip never claims "Saved" after a failed request. */
  notifySaveResult: (ok: boolean) => void
  /** Update the real enrolled total after it loads, WITHOUT remounting the
   *  engine (a remount would drop the caret/selection mid-edit). */
  setEnrolledCount: (n: number | null) => void
  destroy: () => void
}

const uid = () => 'b' + Math.random().toString(36).slice(2, 8)

/* the six behavioural triggers in the sequence */
const TRIGGERS = [
  { key: 'enrolment', name: 'Enrolment', desc: 'Sent the moment access is granted', subject: 'Welcome to Southern Cooking', preview: 'Your course is ready. Here is your first lesson.', audience: 'New enrollments', count: '' },
  { key: 'firstLesson', name: 'First lesson completed', desc: 'Fires on their first finish', subject: 'You finished your first lesson', preview: 'One down — here is what comes next.', audience: 'Finished lesson 1', count: '' },
  { key: 'specificLesson', name: 'Specific lesson completed', desc: 'Fires when they clear a chosen lesson', subject: 'You hit the turning point', preview: 'The hardest lesson is behind you.', audience: 'Finished a key lesson', count: '' },
  { key: 'halfway', name: 'Halfway', desc: 'Fires at 50% — the retention email', subject: 'You are halfway through Southern Cooking', preview: 'Don’t stop now — the best is still ahead.', audience: 'Reached 50%', count: '' },
  { key: 'courseComplete', name: 'Course completed', desc: 'Fires when every lesson is done', subject: 'You finished Southern Cooking', preview: 'Look how far you have come.', audience: 'Completed the course', count: '' },
  { key: 'inactive', name: 'Inactive for N days', desc: 'Win-back after a quiet stretch', subject: 'Your class is waiting', preview: 'Pick up right where you left off.', audience: 'Inactive 7+ days', count: '' },
]

/* tool icons (block hover toolbar) */
const ICO_up = '<path d="M12 19V5M6 11l6-6 6 6"/>'
const ICO_down = '<path d="M12 5v14M6 13l6 6 6-6"/>'
const ICO_dup = '<rect x="8.5" y="8.5" width="11" height="11" rx="2.5"/><path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5"/>'
const ICO_del = '<path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"/>'
const ICO_drag = '<circle cx="9" cy="6" r="1.3"/><circle cx="15" cy="6" r="1.3"/><circle cx="9" cy="12" r="1.3"/><circle cx="15" cy="12" r="1.3"/><circle cx="9" cy="18" r="1.3"/><circle cx="15" cy="18" r="1.3"/>'
const eyeIco = '<path d="m2 22 1.4-4.8L14 6.6l3.4 3.4L6.8 20.6 2 22Z"/><path d="M13.8 6.8 16.4 4.2a2 2 0 0 1 2.9 0l.5.5a2 2 0 0 1 0 2.9L17.2 10.2"/>'

/* nested prop get/set (supports "body.0", "items.1.title") */
function getPath(obj: any, path: string): any {
  return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj)
}
function setPath(obj: any, path: string, val: any): void {
  const keys = path.split('.')
  let o = obj
  for (let i = 0; i < keys.length - 1; i++) {
    if (o[keys[i]] == null) o[keys[i]] = isNaN(Number(keys[i + 1])) ? {} : []
    o = o[keys[i]]
  }
  o[keys[keys.length - 1]] = val
}

/* ---------- colour maths (HSV picker) ---------- */
function clampN(v: number, a: number, b: number) { return Math.max(a, Math.min(b, v)) }
function hexToRgb(hex: string) { hex = String(hex).replace('#', ''); if (hex.length === 3) hex = hex.split('').map((c) => c + c).join(''); const n = parseInt(hex || '808080', 16); return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 } }
function rgbToHex(r: number, g: number, b: number) { return '#' + [r, g, b].map((x) => clampN(Math.round(x), 0, 255).toString(16).padStart(2, '0')).join('') }
function rgbToHsv(r: number, g: number, b: number) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0; if (d) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360 } return { h, s: mx ? d / mx : 0, v: mx } }
function hsvToRgb(h: number, s: number, v: number) { const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c; let a: number[]; if (h < 60) a = [c, x, 0]; else if (h < 120) a = [x, c, 0]; else if (h < 180) a = [0, c, x]; else if (h < 240) a = [0, x, c]; else if (h < 300) a = [x, 0, c]; else a = [c, 0, x]; return { r: (a[0] + m) * 255, g: (a[1] + m) * 255, b: (a[2] + m) * 255 } }
function hexToHsv(hex: string) { const { r, g, b } = hexToRgb(hex); return rgbToHsv(r, g, b) }
function hsvToHex(h: number, s: number, v: number) { const { r, g, b } = hsvToRgb(h, s, v); return rgbToHex(r, g, b) }

const el = (tag: string, cls?: string, html?: string): HTMLElement => {
  const n = document.createElement(tag)
  if (cls) n.className = cls
  if (html != null) n.innerHTML = html
  return n
}

/* ============================================================ FACTORY */
export function createEditor(root: HTMLElement, opts: CreateEditorOpts = {}): EditorHandle {
  setAssetResolver(opts.resolveAsset || ((p) => p))

  const q = <T extends Element = HTMLElement>(sel: string) => root.querySelector(sel) as T | null
  const qa = (sel: string) => Array.from(root.querySelectorAll(sel)) as HTMLElement[]

  /* ---------- state ---------- */
  // The whole editor is scaled with CSS `zoom` to fit narrow widths (see
  // fitToWidth). `zoom` also scales the coordinate space of the fixed-position
  // popovers appended inside root, so a viewport coord from
  // getBoundingClientRect() must be divided by this factor before it's written
  // as a style.left/top — otherwise the bubble/picker/menu drift further from
  // their anchor the smaller the window. Positioners route through place().
  let zoomFactor = 1
  const place = (node: HTMLElement, left: number, top: number) => {
    node.style.left = left / zoomFactor + 'px'
    node.style.top = top / zoomFactor + 'px'
  }
  let blocks: Block[] = []
  // Structural undo/redo. Text edits keep the browser's native per-field undo;
  // this stack covers add / delete / duplicate / move / drag-reorder, which
  // were previously irreversible (a stray Backspace deleted a block for good).
  const undoStack: Block[][] = []
  const redoStack: Block[][] = []
  const UNDO_LIMIT = 60
  const snapshot = (): Block[] =>
    blocks.map((b) => ({ id: b.id, type: b.type, props: JSON.parse(JSON.stringify(b.props)) }))
  // Record the state BEFORE a structural change so it can be restored.
  function pushHistory() {
    undoStack.push(snapshot())
    if (undoStack.length > UNDO_LIMIT) undoStack.shift()
    redoStack.length = 0
  }
  function restoreHistory(from: Block[][], to: Block[][]) {
    if (!from.length) return
    to.push(snapshot())
    blocks = from.pop()!
    renderCanvas()
    deselect()
    flagSaving()
  }
  const undo = () => restoreHistory(undoStack, redoStack)
  const redo = () => restoreHistory(redoStack, undoStack)
  let selId: string | null = null
  let selPart: string | null = null
  let themeKey = 'studio'
  // Per-instance theme overrides. We never mutate the shared THEMES singleton
  // (that leaks a chosen colour into every other course/email in the session and
  // is never persisted). Instead we layer per-email overrides on top, and save
  // them in the editor state so the colour survives a reopen.
  const themeOverrides: Record<string, unknown> = {}
  const theme = (): Theme => ({ ...THEMES[themeKey], ...themeOverrides }) as Theme
  const broadcast: BroadcastMeta = {
    from: opts.fromName || 'Spaire',
    audience: 'New enrollments',
    // Never fabricated: the count is the course's real enrolled total, shown
    // only once it loads. The old design's placeholder numbers (1,204/860/…)
    // and the per-moment fake counts were pure fiction.
    count: '',
    subject: 'Welcome to Southern Cooking',
    preview: 'Your class is ready. Here is your first lesson.',
  }
  // The real enrolled total can arrive after mount (async query); keep it here
  // so a later update can refresh the label WITHOUT remounting the engine.
  let enrolledTotal: number | null = opts.enrolledCount ?? null
  let currentTrigger = 'enrolment'

  const courseName = opts.courseName || 'Southern Cooking'
  // Real enrolled count (commas) when known, else null — we never invent one.
  const fmtCount = (n: number) => n.toLocaleString()
  const realCount = () => (enrolledTotal != null ? fmtCount(enrolledTotal) : null)
  const cleanups: Array<() => void> = []
  const trailerHls: Array<{ destroy: () => void }> = []
  const on = (target: any, ev: string, fn: any, capture?: boolean) => {
    target.addEventListener(ev, fn, capture)
    cleanups.push(() => target.removeEventListener(ev, fn, capture))
  }

  const triggerMeta = (key: string) => TRIGGERS.find((t) => t.key === key) || TRIGGERS[0]
  function updateCrumb() {
    const m = triggerMeta(currentTrigger)
    const cn = q('#crumbName'); if (cn) cn.textContent = m.name
    const course = q('.tb-course'); if (course) course.textContent = courseName
    // Top-bar context: the course's real enrolled total (not the per-moment
    // send count, which we can't compute). Shown only once it's known.
    const am = q('#audienceMeta'); if (am) am.innerHTML = broadcast.count
      ? `${svg('<path d="M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9.5" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path>', 14)} ${broadcast.count} enrolled`
      : ''
  }

  let saveTimer: any
  let dirty = false
  function setStatus(html: string) {
    const s = q('#saveStatus')
    if (s) s.innerHTML = html
  }
  // Persist the current email in the background, without closing the editor.
  // Until this landed the "Saved" status was a pure 700ms animation that fired
  // on every keystroke while nothing was actually stored — so hitting Back lost
  // every edit since the last explicit Save. Now edits really persist, and the
  // status reflects it.
  function runAutosave() {
    if (!dirty) return
    dirty = false
    let persisted: void | boolean = true
    if (opts.onAutosave) {
      persisted = opts.onAutosave({
        subject: broadcast.subject,
        preview: broadcast.preview,
        html: buildHTML(),
        json: getState(),
        trigger: currentTrigger,
      })
    }
    // The host tells us whether it could actually write (a new, never-saved
    // automation can't). Showing "Saved" regardless was a lie that cost real
    // work on refresh/close.
    if (persisted === false) setStatus('Not saved yet — save the automation to keep it')
    else setStatus('<span class="saved-dot"></span>Saved')
  }
  // Force any pending autosave to run now (on Back / unmount) so the last edit
  // is never dropped by the debounce.
  function flushAutosave() {
    clearTimeout(saveTimer)
    runAutosave()
  }
  function flagSaving() {
    dirty = true
    setStatus('Saving…')
    clearTimeout(saveTimer)
    saveTimer = setTimeout(runAutosave, 900)
    if (opts.onChange) opts.onChange()
  }
  let toastTimer: any
  function toast(msg: string) {
    const t = q('#toast'); const tm = q('#toastMsg')
    if (!t || !tm) return
    tm.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200)
  }

  /* ---------- floating popovers ---------- */
  let floatEl: HTMLElement | null = null
  function closeFloat() { if (floatEl) { floatEl.remove(); floatEl = null } document.removeEventListener('mousedown', onFloatOutside, true); window.removeEventListener('resize', closeFloat) }
  function onFloatOutside(e: MouseEvent) { if (floatEl && !floatEl.contains(e.target as Node) && !(e.target as HTMLElement).closest('.tb-actions, .tb-crumb')) closeFloat() }
  function openFloat(anchor: HTMLElement, node: HTMLElement, w?: number) {
    closeFloat(); floatEl = node; root.appendChild(node)
    const r = anchor.getBoundingClientRect(); const width = w || node.offsetWidth || 220
    let left = r.right - width; if (left < 10) left = 10
    place(node, left, r.bottom + 8)
    setTimeout(() => document.addEventListener('mousedown', onFloatOutside, true), 0)
    window.addEventListener('resize', closeFloat)
  }

  /* ---------- save flow ---------- */
  function buildHTML(): string {
    // The editor canvas renders blocks with flex/gradient/absolute for a pretty
    // browser preview, but real inboxes strip all of that. buildEmailHTML
    // reproduces the SAME design with table layout + inline styles + bgcolor
    // attrs + mobile media queries so the inbox shows what the editor shows.
    return buildEmailHTML(blocks, theme(), broadcast, opts.resolveAsset || ((p) => p))
  }

  function getState(): EditorState {
    return {
      version: 3,
      trigger: currentTrigger,
      themeKey,
      themeOverrides: { ...themeOverrides },
      blocks: blocks.map((b) => ({ type: b.type, props: b.props })),
      broadcast: { ...broadcast },
    }
  }

  let saveOv: HTMLElement | null = null
  function closeSave() { if (saveOv) { saveOv.classList.remove('show'); const n = saveOv; saveOv = null; setTimeout(() => n.remove(), 200) } }
  function refreshDetails() { if (!selId) renderInspector() }
  function commitSave() {
    closeSave()
    let persisted: void | boolean = true
    if (opts.onSave) persisted = opts.onSave({ subject: broadcast.subject, preview: broadcast.preview, html: buildHTML(), json: getState(), trigger: currentTrigger })
    // The explicit save already persisted everything — cancel any pending
    // autosave and mark clean (don't call flagSaving, which would re-dirty it).
    dirty = false
    clearTimeout(saveTimer)
    if (persisted === false) {
      setStatus('Not saved yet — save the automation to keep it')
      toast('Staged — save the automation to keep it')
    } else {
      setStatus('<span class="saved-dot"></span>Saved')
      toast('Saved to the sequence')
    }
  }
  function openSaveConfirm() {
    closeSave()
    const ov = el('div', 'save-ov'); saveOv = ov
    const sheet = el('div', 'save-sheet')
    sheet.appendChild(el('div', 'ss-t', 'Save to sequence'))
    sheet.appendChild(el('div', 'ss-s', 'Confirm the details before saving the ' + triggerMeta(currentTrigger).name + ' email.'))
    const rows = el('div', 'ss-rows')
    const inputs: Record<string, HTMLInputElement | HTMLTextAreaElement> = {}
    const addField = (label: string, key: keyof BroadcastMeta, multiline?: boolean) => {
      const f = el('div', 'ss-field')
      f.appendChild(el('div', 'ss-l', label))
      const i = el(multiline ? 'textarea' : 'input', 'ss-in') as HTMLInputElement
      i.value = (broadcast[key] as string) || ''; i.spellcheck = false
      if (multiline) (i as unknown as HTMLTextAreaElement).rows = 2
      inputs[key] = i; f.appendChild(i); rows.appendChild(f)
    }
    addField('Subject', 'subject')
    addField('Preview text', 'preview', true)
    addField('From name', 'from')
    const aud = el('div', 'ss-field')
    aud.appendChild(el('div', 'ss-l', 'Audience'))
    const ar = el('div', 'ss-readonly')
    ar.innerHTML = `<span class="ss-dot"></span><span>${broadcast.audience}</span><span class="ss-lock">Set by trigger</span>`
    aud.appendChild(ar); rows.appendChild(aud)
    sheet.appendChild(rows)
    const foot = el('div', 'ss-foot')
    const cancel = el('button', 'ss-cancel', 'Cancel') as HTMLButtonElement; cancel.type = 'button'; on(cancel, 'click', closeSave)
    const save = el('button', 'ss-save', 'Save') as HTMLButtonElement; save.type = 'button'
    on(save, 'click', () => { Object.keys(inputs).forEach((k) => { (broadcast as any)[k] = inputs[k].value }); refreshDetails(); commitSave() })
    foot.append(cancel, save); sheet.appendChild(foot)
    ov.appendChild(sheet)
    on(ov, 'mousedown', (e: MouseEvent) => { if (e.target === ov) closeSave() })
    root.appendChild(ov)
    requestAnimationFrame(() => { ov.classList.add('show'); if (inputs.subject) inputs.subject.focus() })
  }
  function openSendMenu() {
    const m = el('div', 'float-pop send-menu')
    const ic = { test: '<path d="M3 7l9 6 9-6"/><rect x="3" y="5" width="18" height="14" rx="2"/>' }
    m.innerHTML = `<button class="fp-item" data-a="test">${svg(ic.test, 15)}<span>Send test to me</span></button>`
    const caret = q('#sendCaret'); if (caret) openFloat(caret, m, 196)
    on(m, 'click', (e: MouseEvent) => {
      const it = (e.target as HTMLElement).closest('.fp-item'); if (!it) return
      closeFloat()
      if (!opts.onSendTest) { toast('Test sending is unavailable here'); return }
      toast('Sending test…')
      opts
        .onSendTest({ subject: broadcast.subject, preview: broadcast.preview, html: buildHTML() })
        // The API call only confirms the test was accepted for delivery, not
        // that it landed — say so honestly ("on its way", not "sent").
        .then(() => toast('Test on its way to your inbox'))
        .catch(() => toast('Couldn’t send the test'))
    })
  }

  /* ---------- blocks ---------- */
  function makeBlock(type: string, props?: Props): Block {
    const d = REG[type].defaults(theme())
    return { id: uid(), type, props: Object.assign({}, d, props || {}) }
  }
  /* A brand-new block from the palette/drag carries only neutral placeholder
     defaults (empty course slots). Bind it to the live course on creation so it
     fills in with the real title / lessons / instructor like the rest of the email. */
  function makeBoundBlock(type: string): Block {
    const b = makeBlock(type)
    if (opts.applyCourse) opts.applyCourse([b], currentTrigger)
    return b
  }
  function loadTemplate(key: string) {
    const tpl = TEMPLATES[key]
    currentTrigger = key
    const m = triggerMeta(key)
    // Subjects/previews mention the placeholder course name — swap in the real
    // one so the lifecycle copy matches the course it's bound to.
    const swap = (s: string) => s.split('Southern Cooking').join(courseName)
    broadcast.subject = swap(m.subject); broadcast.preview = swap(m.preview); broadcast.audience = m.audience
    broadcast.count = realCount() ?? ''
    themeKey = tpl.theme
    // A freshly-loaded template starts from its own theme with no overrides.
    Object.keys(themeOverrides).forEach((k) => delete themeOverrides[k])
    blocks = tpl.blocks.map((s) => makeBlock(s.type, s.props))
    if (opts.applyCourse) blocks = opts.applyCourse(blocks, key)
    // A template switch is a clean slate — old structural history no longer
    // maps onto the new block set.
    undoStack.length = 0; redoStack.length = 0
    applyTheme(); updateCrumb(); renderCanvas(); deselect()
  }

  /* ---------- trigger switcher (top-bar crumb dropdown) ---------- */
  function openTriggerMenu() {
    if (opts.lockTrigger) {
      toast('This email’s moment is set by the automation')
      return
    }
    if (floatEl && (floatEl as any)._trig) { closeFloat(); return }
    const m = el('div', 'float-pop trig-menu'); (m as any)._trig = true
    TRIGGERS.forEach((t) => {
      const it = el('button', 'trig-item' + (t.key === currentTrigger ? ' on' : '')) as HTMLButtonElement
      it.type = 'button'
      it.innerHTML = `<span class="ti-tick">${t.key === currentTrigger ? svg('<path d="M20 6 9 17l-5-5"/>', 14, 2.2) : ''}</span><span class="ti-text"><span class="ti-name">${t.name}</span><span class="ti-desc">${t.desc}</span></span>`
      on(it, 'click', () => { closeFloat(); if (t.key !== currentTrigger) loadTemplate(t.key) })
      m.appendChild(it)
    })
    const crumb = q('#crumbBtn')
    if (crumb) { openFloat(crumb, m, 296); const r = crumb.getBoundingClientRect(); m.style.left = r.left / zoomFactor + 'px' }
  }

  function applyTheme() {
    const t = theme()
    const email = q('#email'); if (email) email.style.background = t.emailBg
    const canvas = q('#canvas'); if (canvas) canvas.style.background = t.outerBg
    root.style.setProperty('--email-shadow', '0 1px 3px rgba(0,0,0,.3), 0 20px 50px rgba(0,0,0,.35)')
    const tn = q('#themeName'); if (tn) tn.textContent = t.name
  }

  /* ============================================================ CANVAS */
  function renderCanvas() {
    const rootE = q('#email'); if (!rootE) return
    rootE.innerHTML = ''
    rootE.classList.toggle('empty-hint', blocks.length === 0)
    if (!blocks.length) {
      rootE.appendChild(el('div', 'email-empty', `<span class="ee-ic">${svg(ICO.cover, 22)}</span>Empty email.<br>Pick a template or drag a block in.`))
      return
    }
    blocks.forEach((b, i) => {
      const def = REG[b.type]
      const wrap = el('div', 'blk' + (b.id === selId ? ' sel' : ''))
      wrap.dataset.id = b.id; wrap.dataset.label = def.label
      const inner = el('div', 'eb')
      inner.innerHTML = def.render(b.props, theme())
      wrap.appendChild(inner)

      const tools = el('div', 'blk-tools')
      const mk = (cls: string, icon: string, title: string, fn: () => void) => {
        const t = el('button', 'bt-btn ' + cls, svg(icon, 14, 2)) as HTMLButtonElement
        t.title = title; t.type = 'button'
        on(t, 'mousedown', (e: MouseEvent) => e.stopPropagation())
        on(t, 'click', (e: MouseEvent) => { e.stopPropagation(); fn() })
        return t
      }
      const drag = mk('bt-drag', ICO_drag, 'Drag to reorder', () => {}); drag.draggable = true
      on(drag, 'dragstart', (e: DragEvent) => startBlockDrag(e, b.id)); on(drag, 'dragend', endDrag)
      tools.appendChild(drag)
      tools.appendChild(mk('', ICO_up, 'Move up', () => moveBlock(i, -1)))
      tools.appendChild(mk('', ICO_down, 'Move down', () => moveBlock(i, 1)))
      tools.appendChild(mk('', ICO_dup, 'Duplicate', () => dupBlock(i)))
      tools.appendChild(mk('del', ICO_del, 'Delete', () => delBlock(i)))
      wrap.appendChild(tools)

      on(wrap, 'mousedown', (e: MouseEvent) => {
        if ((e.target as HTMLElement).closest('.blk-tools')) return
        const pe = (e.target as HTMLElement).closest('[data-part]') as HTMLElement | null
        select(b.id, pe && wrap.contains(pe) ? pe.dataset.part || null : null)
      })
      bindEdits(wrap, b)
      wireTrailer(wrap, b)
      rootE.appendChild(wrap)
    })
  }
  function bindEdits(wrap: HTMLElement, b: Block) {
    wrap.querySelectorAll('[data-edit]').forEach((node) => {
      on(node, 'focus', () => { const pe = (node as HTMLElement).closest('[data-part]') as HTMLElement | null; select(b.id, pe ? pe.dataset.part || null : null) })
      on(node, 'input', () => { setPath(b.props, (node as HTMLElement).dataset.edit!, (node as HTMLElement).innerHTML); flagSaving() })
    })
  }
  function rerenderBlock(b: Block) {
    const wrap = q(`.blk[data-id="${b.id}"]`)
    if (!wrap) return renderCanvas()
    const inner = wrap.querySelector('.eb') as HTMLElement
    inner.innerHTML = REG[b.type].render(b.props, theme())
    bindEdits(wrap, b)
    wireTrailer(wrap, b)
    markPart()
  }

  /* Editor-only: a trailer's poster streams its Mux video inline on click.
     (The sent email keeps the poster + watch link — emails can't embed video.) */
  function wireTrailer(wrap: HTMLElement, b: Block) {
    if (b.type !== 'trailer') return
    const el = wrap.querySelector('[data-trailer-play]') as HTMLElement | null
    if (!el) return
    on(el, 'click', (e: MouseEvent) => {
      e.preventDefault(); e.stopPropagation()
      const pid = b.props.playbackId
      if (!pid) { toast('Add a Mux playback ID to play the trailer'); return }
      playTrailer(el, String(pid))
    })
  }
  function playTrailer(container: HTMLElement, playbackId: string) {
    const src = `https://stream.mux.com/${playbackId}.m3u8`
    const video = document.createElement('video')
    video.controls = true; video.autoplay = true
    video.setAttribute('playsinline', ''); video.setAttribute('data-mux-src', src)
    video.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;background:#000;border:0'
    container.style.cursor = 'default'
    container.innerHTML = ''
    container.appendChild(video)
    if (video.canPlayType('application/vnd.apple.mpegurl')) { video.src = src; return }
    import('hls.js')
      .then(({ default: Hls }) => {
        if (!container.isConnected) return
        const H = Hls as unknown as { isSupported: () => boolean; new (): { destroy: () => void; loadSource: (s: string) => void; attachMedia: (v: HTMLVideoElement) => void } }
        if (!H.isSupported()) { video.src = src; return }
        const inst = new H()
        inst.loadSource(src); inst.attachMedia(video); trailerHls.push(inst)
      })
      .catch(() => { video.src = src })
  }

  /* ============================================================ SELECTION + INSPECTOR */
  function select(id: string | null, part?: string | null) {
    selId = id; selPart = part || null
    qa('.blk').forEach((n) => n.classList.toggle('sel', n.dataset.id === id))
    markPart(); renderInspector()
  }
  function deselect() {
    selId = null; selPart = null
    qa('.blk').forEach((n) => n.classList.remove('sel'))
    qa('.part-sel').forEach((n) => n.classList.remove('part-sel'))
    renderInspector()
  }
  function markPart() {
    qa('.part-sel').forEach((n) => n.classList.remove('part-sel'))
    if (selId && selPart) {
      const w = q(`.blk[data-id="${selId}"]`)
      const pe = w && (w.querySelector(`[data-part="${selPart}"]`) as HTMLElement | null)
      if (pe) pe.classList.add('part-sel')
    }
  }
  function buildPartNav(b: Block, parts: Record<string, any>) {
    const g = el('div', 'ig')
    g.appendChild(el('div', 'ig-h', 'Edit a part'))
    const nav = el('div', 'part-nav')
    Object.keys(parts).forEach((id) => {
      const p = parts[id]
      const chip = el('button', 'part-chip', svg(p.icon || REG[b.type].icon, 14) + '<span>' + p.label + '</span>') as HTMLButtonElement
      chip.type = 'button'
      on(chip, 'click', () => select(b.id, id))
      nav.appendChild(chip)
    })
    g.appendChild(nav); return g
  }

  function setProp(key: string, val: any) {
    const b = blocks.find((x) => x.id === selId); if (!b) return
    setPath(b.props, key, val); rerenderBlock(b); flagSaving()
  }

  function renderInspector() {
    closePicker()
    const body = q('#inspBody'); if (!body) return
    body.innerHTML = ''
    const b = blocks.find((x) => x.id === selId)
    if (!b) {
      const ihK = q('#ihK'); const ihT = q('#ihT')
      if (ihK) ihK.textContent = ''
      if (ihT) ihT.textContent = 'Email settings'
      body.appendChild(buildBroadcastGroup())
      body.appendChild(
        buildGroup({
          kind: 'group',
          title: 'Canvas',
          ctls: [
            { kind: 'colorGlobal', label: 'Email background', prop: 'emailBg' },
            { kind: 'colorGlobal', label: 'Backdrop', prop: 'outerBg' },
          ],
        }),
      )
      const note = el('div', 'insp-empty-note')
      note.innerHTML = `<span class="n-ic">${svg('<circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/>', 16)}</span><span>Select any block to edit it. This email is bound to ${courseName} — lessons, cover and instructor pull from the live course.</span>`
      body.appendChild(note)
      return
    }
    const def = REG[b.type]
    const parts = def.parts
    if (selPart && parts && parts[selPart]) {
      const part = parts[selPart]
      const ihK = q('#ihK'); const ihT = q('#ihT')
      if (ihK) ihK.textContent = def.label
      if (ihT) ihT.textContent = part.label
      const back = el('button', 'part-back', svg('<path d="M13 17l-5-5 5-5"/>', 13, 2.2) + 'Back to ' + def.label) as HTMLButtonElement
      back.type = 'button'; on(back, 'click', () => select(b.id, null))
      body.appendChild(back)
      part.groups(b.props, theme()).forEach((g: any) => body.appendChild(buildGroup(g, b)))
      body.appendChild(buildActions(b))
      return
    }
    const ihK = q('#ihK'); const ihT = q('#ihT')
    if (ihK) ihK.textContent = def.group ?? ''
    if (ihT) ihT.textContent = def.label
    if (parts) body.appendChild(buildPartNav(b, parts))
    def.inspect(b.props, theme()).forEach((g) => body.appendChild(buildGroup(g, b)))
    body.appendChild(buildActions(b))
  }

  /* ---------- broadcast details (subject / preview / from / audience) ---------- */
  function buildBroadcastGroup() {
    const g = el('div', 'ig'); g.appendChild(el('div', 'ig-h', 'Details'))
    const field = (label: string, key: keyof BroadcastMeta, oninput?: () => void, mergeable?: boolean) => {
      const c = el('div', 'ctl'); const l = el('div', 'ctl-l'); l.appendChild(el('span', undefined, label)); c.appendChild(l)
      const i = el('input', 'fld') as HTMLInputElement; i.value = broadcast[key] as string; i.spellcheck = false
      on(i, 'input', () => { (broadcast as any)[key] = i.value; (oninput || flagSaving)() })
      // Mark subject/preview as merge-tag targets so a personalization chip can
      // drop {{first_name}} into them (the server substitutes tokens in the
      // subject too, but there was no UI path to put one there).
      if (mergeable) { i.dataset.bkey = key; on(i, 'focusin', () => { lastFieldEl = i; lastEditEl = null }) }
      c.appendChild(i); return c
    }
    g.appendChild(field('Subject', 'subject', () => { const cn = q('#crumbName'); if (cn && broadcast.subject) cn.textContent = triggerMeta(currentTrigger).name; flagSaving() }, true))
    g.appendChild(field('Preview text', 'preview', undefined, true))
    g.appendChild(field('From name', 'from'))
    const ca = el('div', 'ctl'); const la = el('div', 'ctl-l'); la.appendChild(el('span', undefined, 'Audience')); ca.appendChild(la)
    const pill = el('button', 'aud-pill') as HTMLButtonElement; pill.type = 'button'
    // The audience label describes WHO receives it; we don't show a number
    // here because the per-moment recipient count isn't something we can
    // compute (the old fixed number next to e.g. "Reached 50%" was a guess).
    pill.innerHTML = `<span class="aud-dot"></span><span class="aud-name">${broadcast.audience}</span>`
    on(pill, 'click', () => toast('Audience is set by the ' + triggerMeta(currentTrigger).name + ' trigger'))
    ca.appendChild(pill); g.appendChild(ca)
    return g
  }

  function buildGroup(g: any, b?: Block) {
    const wrap = el('div', 'ig')
    wrap.appendChild(el('div', 'ig-h', g.title))
    g.ctls.forEach((c: any) => { const n = buildCtl(c, b); if (n) wrap.appendChild(n) })
    return wrap
  }

  function buildCtl(c: any, b?: Block): HTMLElement | null {
    const props = b ? b.props : null
    const val = props ? getPath(props, c.key) : null
    switch (c.kind) {
      case 'field': return ctlField(c.label, c.key, val, c.ph)
      case 'textarea': return ctlTextarea(c.key, val)
      case 'num': return ctlStepper(c.label, c.key, val, c.min, c.max)
      case 'range': return ctlRange(c.label, c.key, val, c.min, c.max, c.step, c.fmt)
      case 'upload': return ctlUpload(c.key)
      case 'select': return ctlSelect(c.label, c.key, val, c.opts)
      case 'seg': return ctlSeg(c.label, c.key, val, c.opts)
      case 'align': return ctlAlign(c.key, val, c.opts)
      case 'radius': return ctlRadius(c.key, val)
      case 'color': return ctlColor(c.label, c.key, val)
      case 'switch': return ctlSwitch(c.label, c.key, val, c.sub)
      case 'colorGlobal': return ctlColorGlobal(c.label, c.prop)
    }
    return null
  }

  /* ---------- control widgets ---------- */
  function row(label: string | null, valNode?: HTMLElement) {
    const c = el('div', 'ctl')
    if (label != null) { const l = el('div', 'ctl-l'); l.appendChild(el('span', undefined, label)); if (valNode) l.appendChild(valNode); c.appendChild(l) }
    return c
  }
  function ctlField(label: string | null, key: string, val: any, ph?: string) {
    const c = row(label); const i = el('input', 'fld') as HTMLInputElement; i.value = val == null ? '' : val; if (ph) i.placeholder = ph
    on(i, 'input', () => setProp(key, i.value)); c.appendChild(i); return c
  }
  function ctlTextarea(key: string, val: any) {
    const c = row(null); const t = el('textarea', 'fld') as HTMLTextAreaElement; t.value = val == null ? '' : val; t.rows = 6
    on(t, 'input', () => setProp(key, t.value)); c.appendChild(t); return c
  }
  function ctlSelect(label: string, key: string, val: any, optsList: string[]) {
    const c = row(label); const s = el('select', 'iselect') as HTMLSelectElement
    optsList.forEach((o) => { const op = el('option', undefined, o) as HTMLOptionElement; op.value = o; if (o === val) op.selected = true; s.appendChild(op) })
    on(s, 'change', () => setProp(key, s.value)); c.appendChild(s); return c
  }
  function ctlSeg(label: string, key: string, val: any, optsList: [string, string][]) {
    const c = row(label); const seg = el('div', 'iseg')
    optsList.forEach((o) => {
      const v = o[0], lbl = o[1]
      const btn = el('button', String(v) === String(val) ? 'on' : '', lbl) as HTMLButtonElement; btn.type = 'button'
      on(btn, 'click', () => { setProp(key, v); seg.querySelectorAll('button').forEach((x) => x.classList.remove('on')); btn.classList.add('on') })
      seg.appendChild(btn)
    })
    c.appendChild(seg); return c
  }
  function ctlAlign(key: string, val: any, optsList: string[]) {
    const icons: Record<string, string> = {
      left: '<path d="M4 6h16M4 12h11M4 18h14"/>',
      center: '<path d="M4 6h16M6.5 12h11M5 18h14"/>',
      right: '<path d="M4 6h16M9 12h11M6 18h14"/>',
    }
    const c = row(null); const seg = el('div', 'iseg')
    optsList.forEach((o) => {
      const btn = el('button', o === val ? 'on' : '', svg(icons[o], 15, 1.9)) as HTMLButtonElement; btn.type = 'button'
      on(btn, 'click', () => { setProp(key, o); seg.querySelectorAll('button').forEach((x) => x.classList.remove('on')); btn.classList.add('on') })
      seg.appendChild(btn)
    })
    c.appendChild(seg); return c
  }
  /* corner radius as Square / Rounded / Pill — a 0–999 slider is useless on a button
     (everything past ~25px is identical), so this is a clean 3-way choice. */
  function ctlRadius(key: string, val: any) {
    const optsList: [string, number][] = [['Square', 0], ['Rounded', 12], ['Pill', 999]]
    const cur = Number(val) || 0
    const which = cur <= 3 ? 0 : cur >= 900 ? 999 : 12
    const c = row(null); const seg = el('div', 'iseg')
    optsList.forEach((o) => {
      const btn = el('button', o[1] === which ? 'on' : '', o[0]) as HTMLButtonElement; btn.type = 'button'
      on(btn, 'click', () => { setProp(key, o[1]); seg.querySelectorAll('button').forEach((x) => x.classList.remove('on')); btn.classList.add('on') })
      seg.appendChild(btn)
    })
    c.appendChild(seg); return c
  }
  function ctlStepper(label: string, key: string, val: any, min: number, max: number) {
    const v0 = Number(val) || 0
    const valNode = el('span', 'val', String(v0))
    const c = row(label, valNode); const st = el('div', 'stepper')
    const minus = el('button', undefined, '–') as HTMLButtonElement; minus.type = 'button'
    const num = el('span', 'num', String(v0)); const plus = el('button', undefined, '+') as HTMLButtonElement; plus.type = 'button'
    let v = v0
    const upd = (nv: number) => { v = Math.max(min, Math.min(max, nv)); num.textContent = String(v); valNode.textContent = String(v); setProp(key, v) }
    on(minus, 'click', () => upd(v - 1)); on(plus, 'click', () => upd(v + 1))
    st.append(minus, num, plus); c.appendChild(st); return c
  }
  function ctlRange(label: string, key: string, val: any, min: number, max: number, step: number, fmt?: (v: number) => string) {
    const f = fmt || ((v: number) => (step < 1 ? String(v) : v + 'px'))
    const valNode = el('span', 'val', f(Number(val) || 0))
    const c = row(label, valNode); const r = el('input', 'range') as HTMLInputElement
    r.type = 'range'; r.min = String(min); r.max = String(max); r.step = String(step); r.value = String(Number(val) || 0)
    on(r, 'input', () => { const v = parseFloat(r.value); valNode.textContent = f(v); setProp(key, v) })
    c.appendChild(r); return c
  }
  function ctlUpload(key: string) {
    const c = el('div', 'ctl')
    const btn = el('button', 'upload-btn') as HTMLButtonElement; btn.type = 'button'
    btn.innerHTML = svg('<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>', 15, 1.8) + '<span>Upload from device</span>'
    const inp = el('input') as HTMLInputElement; inp.type = 'file'; inp.accept = 'image/*'; inp.style.display = 'none'
    on(inp, 'change', async () => {
      const f = inp.files && inp.files[0]; if (!f) return
      if (opts.onUploadImage) {
        toast('Uploading image…')
        try { const url = await opts.onUploadImage(f); setProp(key, url); toast('Image added'); renderInspector() }
        catch { toast('Upload failed') }
      } else {
        if (f.size > 8 * 1024 * 1024) toast('Image is large — may be slow')
        const r = new FileReader(); r.onload = () => { setProp(key, r.result); toast('Image added'); renderInspector() }; r.readAsDataURL(f)
      }
    })
    on(btn, 'click', () => inp.click())
    c.append(btn, inp); return c
  }
  function ctlColor(label: string, key: string, val: any) { return colorTrigger(label, val, (v) => setProp(key, v)) }
  function ctlSwitch(label: string, key: string, val: any, sub?: string) {
    const c = el('div', 'ctl'); const r = el('div', 'row-sw'); const main = el('div', 'rs-main')
    main.appendChild(el('div', 'rs-t', label)); if (sub) main.appendChild(el('div', 'rs-s', sub))
    const sw = el('button', 'isw' + (val ? ' on' : '')) as HTMLButtonElement; sw.type = 'button'
    on(sw, 'click', () => { const nv = !sw.classList.contains('on'); sw.classList.toggle('on', nv); setProp(key, nv) })
    r.append(main, sw); c.appendChild(r); return c
  }
  function ctlColorGlobal(label: string, prop: string) {
    // The email/backdrop backgrounds can't be "None": a transparent email
    // background renders as bgcolor="none" (invalid) and shows white/broken in
    // the inbox. Force a real colour for these two.
    const allowNone = prop !== 'emailBg' && prop !== 'outerBg'
    return colorTrigger(label, (theme() as any)[prop], (v) => { themeOverrides[prop] = v; applyTheme(); renderCanvas(); flagSaving() }, allowNone)
  }

  /* ============================================================ COLOUR PICKER */
  let pickerEl: HTMLElement | null = null
  function closePicker() { if (pickerEl) { pickerEl.remove(); pickerEl = null } document.removeEventListener('mousedown', onPickerOutside, true); window.removeEventListener('resize', closePicker) }
  function onPickerOutside(e: MouseEvent) { if (pickerEl && !pickerEl.contains(e.target as Node) && !(e.target as HTMLElement).closest('.color-trigger')) closePicker() }
  function pickerDrag(node: HTMLElement, handler: (e: MouseEvent) => void) {
    node.addEventListener('mousedown', (e) => { e.preventDefault(); handler(e); const mv = (ev: MouseEvent) => handler(ev); const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up) }; document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up) })
  }
  function presetColors() {
    const t = theme()
    const set = [t.heading, t.text, t.muted, t.button, t.buttonText, t.border, t.panel, t.emailBg, '#ffffff', '#000000']
    const seen: Record<string, number> = {}; const out: string[] = []
    set.forEach((c) => { const k = String(c).toLowerCase(); if (c && k !== 'none' && !seen[k]) { seen[k] = 1; out.push(c) } })
    return out.slice(0, 10)
  }
  function colorTrigger(label: string, initial: any, onPick: (v: string) => void, allowNone = true) {
    const c = row(label)
    const t = el('button', 'color-trigger') as HTMLButtonElement; t.type = 'button'
    const sw = el('span', 'ct-sw'); const hex = el('span', 'ct-hex')
    let cur = initial
    const refresh = () => { if (!cur || cur === 'none') { sw.classList.add('none'); sw.style.background = ''; hex.textContent = 'None' } else { sw.classList.remove('none'); sw.style.background = cur; hex.textContent = String(cur).toUpperCase() } }
    refresh(); t.append(sw, hex)
    on(t, 'click', () => { if (pickerEl && (pickerEl as any)._anchor === t) { closePicker(); return } openPicker(t, cur, (v) => { cur = v; onPick(v); refresh() }, allowNone) })
    c.appendChild(t); return c
  }
  function openPicker(anchor: HTMLElement, current: any, onChange: (v: string) => void, allowNone = true) {
    closePicker()
    let hsv = hexToHsv(current && current !== 'none' ? current : '#808080')
    pickerEl = el('div', 'color-pop'); (pickerEl as any)._anchor = anchor
    const eye = 'EyeDropper' in window ? `<button class="cp-eye" type="button" title="Pick from screen">${svg(eyeIco, 15, 1.7)}</button>` : ''
    pickerEl.innerHTML = `<div class="cp-sv"><div class="cp-knob"></div></div><div class="cp-hue"><div class="cp-hknob"></div></div><div class="cp-foot"><span class="cp-prev"></span><div class="cp-hexwrap"><span class="cp-hash">#</span><input class="cp-hex" maxlength="7" spellcheck="false"/></div>${eye}</div><div class="cp-presets"></div>`
    root.appendChild(pickerEl)
    const sv = pickerEl.querySelector('.cp-sv') as HTMLElement, knob = pickerEl.querySelector('.cp-knob') as HTMLElement,
      hue = pickerEl.querySelector('.cp-hue') as HTMLElement, hknob = pickerEl.querySelector('.cp-hknob') as HTMLElement,
      prev = pickerEl.querySelector('.cp-prev') as HTMLElement, hexI = pickerEl.querySelector('.cp-hex') as HTMLInputElement
    function paint(emit: boolean) {
      const pure = hsvToHex(hsv.h, 1, 1)
      sv.style.background = `linear-gradient(to top, #000, rgba(0,0,0,0)), linear-gradient(to right, #fff, ${pure})`
      knob.style.left = hsv.s * 100 + '%'; knob.style.top = (1 - hsv.v) * 100 + '%'
      hknob.style.left = (hsv.h / 360) * 100 + '%'
      const hx = hsvToHex(hsv.h, hsv.s, hsv.v)
      knob.style.background = hx; prev.style.background = hx
      if (document.activeElement !== hexI) hexI.value = hx.replace('#', '').toUpperCase()
      if (emit) onChange(hx)
    }
    pickerDrag(sv, (e) => { const r = sv.getBoundingClientRect(); hsv.s = clampN((e.clientX - r.left) / r.width, 0, 1); hsv.v = clampN(1 - (e.clientY - r.top) / r.height, 0, 1); paint(true) })
    pickerDrag(hue, (e) => { const r = hue.getBoundingClientRect(); hsv.h = clampN((e.clientX - r.left) / r.width, 0, 1) * 360; paint(true) })
    hexI.addEventListener('input', () => { const v = hexI.value.replace(/[^0-9a-fA-F]/g, ''); if (v.length === 6 || v.length === 3) { hsv = hexToHsv('#' + v); paint(true) } })
    const eyeBtn = pickerEl.querySelector('.cp-eye') as HTMLButtonElement | null
    if (eyeBtn) eyeBtn.addEventListener('click', async () => { try { const res = await (new (window as any).EyeDropper()).open(); hsv = hexToHsv(res.sRGBHex); paint(true) } catch { /* cancelled */ } })
    const pre = pickerEl.querySelector('.cp-presets') as HTMLElement
    if (allowNone) { const noneB = el('button', 'cp-chip cp-none') as HTMLButtonElement; noneB.type = 'button'; noneB.title = 'None'; noneB.addEventListener('click', () => onChange('none')); pre.appendChild(noneB) }
    presetColors().forEach((cl) => { const b = el('button', 'cp-chip') as HTMLButtonElement; b.type = 'button'; b.style.background = cl; b.title = cl; b.addEventListener('click', () => { hsv = hexToHsv(cl); paint(true) }); pre.appendChild(b) })
    paint(false)
    const inspEl = q('.inspector')
    const insp = inspEl ? inspEl.getBoundingClientRect() : { left: window.innerWidth - 10 } as DOMRect
    const r = anchor.getBoundingClientRect()
    const w = 232
    let left = insp.left - w - 10; if (left < 10) left = Math.max(10, r.left - w)
    const top = clampN(r.top - 4, 10, window.innerHeight - 312)
    place(pickerEl, left, top)
    setTimeout(() => document.addEventListener('mousedown', onPickerOutside, true), 0)
    window.addEventListener('resize', closePicker)
  }

  function buildActions(b: Block) {
    const g = el('div', 'ig'); g.appendChild(el('div', 'ig-h', 'Block'))
    const c = el('div', 'ctl'); c.style.display = 'flex'; c.style.gap = '8px'
    const dup = el('button', 'btn-ghost', svg(ICO_dup, 14) + ' Duplicate') as HTMLButtonElement; dup.type = 'button'; dup.style.flex = '1'; dup.style.justifyContent = 'center'
    on(dup, 'click', () => dupBlock(blocks.indexOf(b)))
    const del = el('button', 'btn-ghost', svg(ICO_del, 14)) as HTMLButtonElement; del.type = 'button'; del.style.color = '#b62828'
    on(del, 'click', () => delBlock(blocks.indexOf(b)))
    c.append(dup, del); g.appendChild(c); return g
  }

  /* ============================================================ BLOCK OPS */
  function moveBlock(i: number, dir: number) { const j = i + dir; if (j < 0 || j >= blocks.length) return; pushHistory(); [blocks[i], blocks[j]] = [blocks[j], blocks[i]]; renderCanvas(); flagSaving() }
  function dupBlock(i: number) { pushHistory(); const copy = makeBlock(blocks[i].type, JSON.parse(JSON.stringify(blocks[i].props))); blocks.splice(i + 1, 0, copy); renderCanvas(); select(copy.id); toast('Block duplicated'); flagSaving() }
  function delBlock(i: number) { pushHistory(); const wasSel = blocks[i].id === selId; blocks.splice(i, 1); renderCanvas(); if (wasSel) deselect(); flagSaving() }
  function addBlock(type: string, atIndex?: number) {
    pushHistory()
    const b = makeBoundBlock(type)
    const idx = atIndex != null ? atIndex : selId ? blocks.findIndex((x) => x.id === selId) + 1 : blocks.length
    blocks.splice(idx, 0, b); renderCanvas(); select(b.id); flagSaving()
    const node = q(`.blk[data-id="${b.id}"]`)
    const cv = q('#canvas')
    if (node && cv) { const r = node.getBoundingClientRect(), cr = cv.getBoundingClientRect(); if (r.bottom > cr.bottom || r.top < cr.top) cv.scrollBy({ top: r.top - cr.top - 120, behavior: 'smooth' }) }
  }

  /* ============================================================ DRAG & DROP */
  let dragType: string | null = null, dragId: string | null = null, dropIndex: number | null = null
  let dropLine: HTMLElement | null = null
  function startPaletteDrag(e: DragEvent, type: string) { dragType = type; dragId = null; if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'copy'; e.dataTransfer.setData('text/plain', type) } }
  function startBlockDrag(e: DragEvent, id: string) { dragId = id; dragType = null; if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id) } setTimeout(() => { const n = q(`.blk[data-id="${id}"]`); if (n) n.style.opacity = '.35' }, 0) }
  function endDrag() { qa('.blk').forEach((n) => (n.style.opacity = '')); qa('.pal-item').forEach((n) => n.classList.remove('dragging')); clearDrop(); dragType = null; dragId = null; dropIndex = null }
  function clearDrop() { if (dropLine) { dropLine.remove(); dropLine = null } }
  function showDropAt(index: number) {
    if (!dropLine) dropLine = el('div', 'drop-line show')
    const rootE = q('#email'); if (!rootE) return
    const kids = qa('.blk')
    if (index >= kids.length) rootE.appendChild(dropLine!)
    else rootE.insertBefore(dropLine!, kids[index])
    dropIndex = index
  }
  function canvasDragOver(e: DragEvent) {
    if (dragType == null && dragId == null) return
    e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = dragType ? 'copy' : 'move'
    const kids = qa('.blk'); let idx = kids.length
    for (let k = 0; k < kids.length; k++) { const r = kids[k].getBoundingClientRect(); if (e.clientY < r.top + r.height / 2) { idx = k; break } }
    showDropAt(idx)
  }
  function canvasDrop(e: DragEvent) {
    if (dragType == null && dragId == null) return
    e.preventDefault()
    const idx = dropIndex != null ? dropIndex : blocks.length
    pushHistory()
    if (dragType) { const b = makeBoundBlock(dragType); blocks.splice(idx, 0, b); renderCanvas(); select(b.id); toast(REG[dragType].label + ' added') }
    else if (dragId) { const from = blocks.findIndex((x) => x.id === dragId); if (from > -1) { const [m] = blocks.splice(from, 1); let target = idx; if (from < idx) target--; blocks.splice(target, 0, m); renderCanvas(); select(m.id) } }
    endDrag(); flagSaving()
  }

  /* ============================================================ PALETTE + MERGE TAGS */
  function buildPalette() {
    const rootE = q('#palette'); if (!rootE) return
    rootE.innerHTML = ''
    GROUPS.forEach((group) => {
      const types = Object.keys(REG).filter((t) => REG[t].group === group)
      if (!types.length) return
      const g = el('div', 'pal-group'); g.appendChild(el('div', 'pal-label', group))
      const grid = el('div', 'pal-grid')
      types.forEach((t) => {
        const def = REG[t]; const item = el('button', 'pal-item') as HTMLButtonElement; item.type = 'button'; item.draggable = true
        item.innerHTML = `<span class="pal-droplet">${svg(def.icon, 16)}</span><span class="pal-t">${def.label}</span>`
        on(item, 'click', () => { addBlock(t); toast(def.label + ' added') })
        on(item, 'dragstart', (e: DragEvent) => { item.classList.add('dragging'); startPaletteDrag(e, t) })
        on(item, 'dragend', endDrag)
        grid.appendChild(item)
      })
      g.appendChild(grid); rootE.appendChild(g)
    })
  }

  // First name / Last name / Email are substituted per recipient at send time
  // by polar.email.personalize. "Company" was dropped: there is no `company`
  // variable in build_variables, so {{company}} rendered blank for everyone.
  const MERGE: [string, string][] = [['First name', 'first_name'], ['Last name', 'last_name'], ['Email', 'email']]
  let lastEditEl: HTMLElement | null = null
  // The most recently focused broadcast detail field (subject / preview), so a
  // merge chip can insert a token into it as well as into body text.
  let lastFieldEl: HTMLInputElement | null = null
  function buildMerge() {
    const w = q('#mergeWrap'); if (!w) return
    MERGE.forEach((m) => {
      const chip = el('button', 'merge-chip', svg('<path d="M12 5v14M5 12h14"/>', 11, 2.2) + m[0]) as HTMLButtonElement; chip.type = 'button'
      on(chip, 'mousedown', (e: MouseEvent) => e.preventDefault())
      on(chip, 'click', () => insertMerge(m[1]))
      w.appendChild(chip)
    })
  }
  function insertMerge(tag: string) {
    const token = `{{${tag}}}`
    // A detail field (subject / preview) was the last thing focused → insert at
    // its caret.
    if (lastFieldEl && document.contains(lastFieldEl)) {
      const i = lastFieldEl
      const s = i.selectionStart ?? i.value.length
      const e = i.selectionEnd ?? i.value.length
      i.value = i.value.slice(0, s) + token + i.value.slice(e)
      const key = i.dataset.bkey as keyof BroadcastMeta | undefined
      if (key) (broadcast as any)[key] = i.value
      const caret = s + token.length
      i.focus(); i.setSelectionRange(caret, caret)
      flagSaving()
      return
    }
    if (lastEditEl && document.contains(lastEditEl)) {
      lastEditEl.focus(); document.execCommand('insertText', false, token)
      const b = blocks.find((x) => x.id === selId)
      if (b && lastEditEl.dataset.edit) setPath(b.props, lastEditEl.dataset.edit, lastEditEl.innerHTML)
      flagSaving()
    } else toast('Click into the subject or a text block first')
  }

  /* ============================================================ FLOATING FORMAT BUBBLE
     One bubble for every editable text. Shows on a non-empty selection inside the
     email, applies inline formatting to ONLY the selected characters, and reflects
     the selection's current state (reactive B/I/U). */
  let fmtBubble: HTMLElement | null = null
  let fmtTarget: HTMLElement | null = null
  let fmtRange: Range | null = null
  let fmtRect: DOMRect | null = null
  let fmtLinkMode = false
  let fmtTimer: any = null
  const FMT_STATEFUL = ['bold', 'italic', 'underline']
  const fmtSafeState = (c: string) => { try { return document.queryCommandState(c) } catch { return false } }

  function buildFmtBubble() {
    const b = el('div', 'fmt-bubble'); b.id = 'fmtBubble'
    const linkIco = '<path d="M9 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1"/><path d="M15 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1"/>'
    const clearIco = '<path d="M5 7h13M9 7l-1 12M14 7l-.5 6M4 4l16 16"/>'
    b.innerHTML =
      '<button class="fmt-b" type="button" data-cmd="bold" title="Bold"><span class="gi">B</span></button>' +
      '<button class="fmt-b" type="button" data-cmd="italic" title="Italic"><span class="gi it">I</span></button>' +
      '<button class="fmt-b" type="button" data-cmd="underline" title="Underline"><span class="gi un">U</span></button>' +
      '<span class="fmt-divide"></span>' +
      '<button class="fmt-b" type="button" data-cmd="link" title="Add link">' + svg(linkIco, 16, 1.8) + '</button>' +
      '<button class="fmt-b" type="button" data-cmd="clear" title="Clear formatting">' + svg(clearIco, 16, 1.8) + '</button>' +
      '<div class="fmt-link"><input type="text" spellcheck="false" placeholder="Paste a link, press Enter"/>' +
      '<button class="fmt-b" type="button" data-cmd="applyLink" title="Apply">' + svg('<path d="M20 6 9 17l-5-5"/>', 16, 2.2) + '</button></div>'
    root.appendChild(b)
    // keep the text selection alive when pressing a button (but allow the input to focus)
    b.addEventListener('mousedown', (e) => { if (!(e.target as HTMLElement).closest('.fmt-link input')) e.preventDefault() })
    b.addEventListener('click', onFmtClick)
    const inp = b.querySelector('.fmt-link input') as HTMLInputElement
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); applyFmtLink(inp.value.trim()) }
      else if (e.key === 'Escape') { e.preventDefault(); exitLinkMode() }
    })
    fmtBubble = b; return b
  }

  function fmtSelectionInfo() {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null
    const range = sel.getRangeAt(0)
    let node: Node | null = range.commonAncestorContainer
    if (node.nodeType === 3) node = (node as Text).parentElement
    const editable = node && (node as HTMLElement).closest && (node as HTMLElement).closest('[contenteditable][data-edit]')
    const emailRoot = q('#email')
    if (!editable || !emailRoot || !emailRoot.contains(editable)) return null
    if (!String(sel).trim()) return null
    const rect = range.getBoundingClientRect()
    if (!rect || (rect.width === 0 && rect.height === 0)) return null
    return { range, editable: editable as HTMLElement, rect }
  }

  function updateFmtBubble() {
    if (fmtLinkMode) return
    const info = fmtSelectionInfo()
    if (!info) { hideFmtBubble(); return }
    if (!fmtBubble) buildFmtBubble()
    fmtTarget = info.editable
    fmtRange = info.range.cloneRange()
    fmtRect = info.rect
    positionFmtBubble(info.rect)
    updateFmtState()
    fmtBubble!.classList.add('show')
  }

  function positionFmtBubble(rect: DOMRect) {
    const b = fmtBubble!; b.classList.remove('below')
    const prevVis = b.style.visibility; b.style.visibility = 'hidden'; b.style.left = '0px'; b.style.top = '0px'
    const bw = b.offsetWidth, bh = b.offsetHeight; b.style.visibility = prevVis || ''
    let left = rect.left + rect.width / 2 - bw / 2
    let top = rect.top - bh - 10
    if (top < 8) { top = rect.bottom + 10; b.classList.add('below') }
    left = Math.max(8, Math.min(window.innerWidth - bw - 8, left))
    const arrowX = rect.left + rect.width / 2 - left
    b.style.setProperty('--arrow', Math.max(14, Math.min(bw - 14, arrowX)) + 'px')
    place(b, left, top)
  }

  function updateFmtState() {
    if (!fmtBubble) return
    FMT_STATEFUL.forEach((c) => { const btn = fmtBubble!.querySelector('.fmt-b[data-cmd="' + c + '"]'); if (btn) btn.classList.toggle('on', fmtSafeState(c)) })
  }

  function hideFmtBubble() { if (fmtBubble) fmtBubble.classList.remove('show'); fmtTarget = null; fmtRange = null; if (fmtLinkMode) exitLinkMode(true) }

  function restoreFmtRange() {
    if (!fmtTarget || !fmtRange) return false
    fmtTarget.focus({ preventScroll: true })
    const sel = window.getSelection(); if (!sel) return false
    sel.removeAllRanges(); sel.addRange(fmtRange)
    return true
  }
  function persistFmtTarget() {
    if (!fmtTarget) return
    const wrap = fmtTarget.closest('.blk') as HTMLElement | null; if (!wrap) return
    const b = blocks.find((x) => x.id === wrap.dataset.id); if (!b) return
    if (fmtTarget.dataset.edit) setPath(b.props, fmtTarget.dataset.edit, fmtTarget.innerHTML)
    flagSaving()
  }

  function onFmtClick(e: MouseEvent) {
    const btn = (e.target as HTMLElement).closest('.fmt-b') as HTMLElement | null; if (!btn) return
    const cmd = btn.dataset.cmd!
    if (cmd === 'link') { enterLinkMode(); return }
    if (cmd === 'applyLink') { applyFmtLink((fmtBubble!.querySelector('.fmt-link input') as HTMLInputElement).value.trim()); return }
    if (!restoreFmtRange()) return
    if (cmd === 'clear') { document.execCommand('removeFormat'); document.execCommand('unlink') }
    else document.execCommand(cmd, false)
    const sel = window.getSelection(); if (sel && sel.rangeCount) fmtRange = sel.getRangeAt(0).cloneRange()
    persistFmtTarget()
    updateFmtState()
  }

  function enterLinkMode() {
    if (!fmtBubble) return
    fmtLinkMode = true
    fmtBubble.querySelector('.fmt-link')!.classList.add('show')
    if (fmtRect) positionFmtBubble(fmtRect)
    const inp = fmtBubble.querySelector('.fmt-link input') as HTMLInputElement
    inp.value = ''; setTimeout(() => inp.focus(), 0)
  }
  function exitLinkMode(silent?: boolean) {
    fmtLinkMode = false
    if (fmtBubble) { fmtBubble.querySelector('.fmt-link')!.classList.remove('show'); (fmtBubble.querySelector('.fmt-link input') as HTMLInputElement).value = '' }
    if (!silent && fmtRect) positionFmtBubble(fmtRect)
  }
  function applyFmtLink(url: string) {
    if (!url) { exitLinkMode(); return }
    if (!/^(https?:|mailto:|tel:|#)/i.test(url)) url = 'https://' + url
    if (restoreFmtRange()) { document.execCommand('createLink', false, url); persistFmtTarget() }
    exitLinkMode(true)
    if (fmtBubble) fmtBubble.classList.remove('show'); fmtTarget = null
  }

  /* ============================================================ INIT */
  function restore(state: EditorState) {
    currentTrigger = state.trigger || 'enrolment'
    themeKey = state.themeKey || TEMPLATES[currentTrigger]?.theme || 'studio'
    // Re-hydrate the saved per-email colour overrides so a chosen background /
    // backdrop comes back on reopen instead of reverting to the template default.
    Object.keys(themeOverrides).forEach((k) => delete themeOverrides[k])
    Object.assign(themeOverrides, state.themeOverrides || {})
    Object.assign(broadcast, state.broadcast || {})
    const rc = realCount(); if (rc) broadcast.count = rc
    // Back-fill the current design defaults UNDER the saved props. A saved email
    // only persists whatever props existed when it was saved; re-opening it must
    // not render with `undefined` style props (which collapse the hero overlay,
    // drop the fonts to a fallback, and break every size/colour). Merging the
    // live REG defaults underneath restores the full design while keeping the
    // creator's authored values on top — exactly like makeBlock does for fresh
    // blocks. Unknown block types fall back to their saved props verbatim.
    blocks = (state.blocks || []).map((s) => ({
      id: uid(),
      type: s.type,
      props: REG[s.type]
        ? Object.assign({}, REG[s.type].defaults(theme()), s.props || {})
        : s.props || {},
    }))
    // Do NOT re-bind the live course onto saved blocks here. Re-binding
    // overwrote course-derived fields the creator had hand-edited (lesson
    // titles, instructor name/role/bio, the facts row) every time they reopened
    // the email — a silent, surprising data loss. A reopened email now shows
    // exactly what was saved. (Fresh templates still bind on first load via
    // loadTemplate; a future explicit "Sync from course" can re-pull on demand.)
    applyTheme(); updateCrumb(); renderCanvas(); deselect()
  }

  buildPalette(); buildMerge()
  if (opts.initialState && opts.initialState.blocks?.length) restore(opts.initialState)
  else loadTemplate(opts.initialTrigger || 'enrolment')

  const crumbBtn = q('#crumbBtn'); if (crumbBtn) on(crumbBtn, 'click', openTriggerMenu)
  // When the trigger is locked (automation context), the crumb can't switch
  // templates — hide its dropdown caret so it doesn't read as actionable.
  if (opts.lockTrigger) { const caret = q('.tb-caret'); if (caret) caret.style.display = 'none' }

  // Format bubble: reactive on selection within the email, reposition on scroll.
  on(document, 'selectionchange', () => { if (fmtLinkMode) return; clearTimeout(fmtTimer); fmtTimer = setTimeout(updateFmtBubble, 14) })
  on(window, 'resize', hideFmtBubble)

  const canvas = q('#canvas')
  if (canvas) {
    on(canvas, 'dragover', canvasDragOver)
    on(canvas, 'drop', canvasDrop)
    on(canvas, 'dragleave', (e: DragEvent) => { if (e.target === canvas) clearDrop() })
    on(canvas, 'mousedown', (e: MouseEvent) => { const t = e.target as HTMLElement; if (t === canvas || t.id === 'stage' || t.id === 'email') deselect() })
    on(canvas, 'scroll', () => { if (fmtBubble && fmtBubble.classList.contains('show')) updateFmtBubble() }, true)
  }

  const deviceSeg = q('#deviceSeg')
  if (deviceSeg) on(deviceSeg, 'click', (e: MouseEvent) => {
    const b = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null; if (!b) return
    deviceSeg.querySelectorAll('button').forEach((x) => x.classList.remove('on')); b.classList.add('on')
    const stage = q('#stage'); if (stage) stage.classList.toggle('mobile', b.dataset.d === 'mobile')
  })

  // The editor has no theme toggle of its own and needs no JS theme handling:
  // design.css keys dark mode off the app's `html.dark` ancestor (next-themes),
  // so the chrome flips with the dashboard theme via CSS alone.

  const sendBtn = q('#sendBtn'); if (sendBtn) on(sendBtn, 'click', openSaveConfirm)
  const sendCaret = q('#sendCaret'); if (sendCaret) on(sendCaret, 'click', openSendMenu)
  const backBtn = q('.tb-back'); if (backBtn) on(backBtn, 'click', () => { flushAutosave(); opts.onClose && opts.onClose() })

  on(root, 'keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape') { closeFloat(); closeSave(); closePicker(); hideFmtBubble(); deselect() }
    const tgt = e.target as HTMLElement
    const inText = !!(tgt.closest && tgt.closest('[contenteditable]')) || /INPUT|TEXTAREA|SELECT/.test(tgt.tagName)
    // Structural undo/redo — only when NOT inside a text field, so the browser's
    // native per-field text undo keeps working while you're typing.
    if ((e.metaKey || e.ctrlKey) && (e.key === 'z' || e.key === 'Z') && !inText) {
      e.preventDefault()
      if (e.shiftKey) redo(); else undo()
      return
    }
    if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || e.key === 'Y') && !inText) {
      e.preventDefault(); redo(); return
    }
    if ((e.key === 'Backspace' || e.key === 'Delete') && selId && !inText) {
      e.preventDefault(); const i = blocks.findIndex((x) => x.id === selId); if (i > -1) delBlock(i)
    }
  })
  on(root, 'focusin', (e: FocusEvent) => { const t = e.target as HTMLElement; if (t.matches && t.matches('[contenteditable][data-edit]')) { lastEditEl = t; lastFieldEl = null } })

  // Paste hygiene: the browser default would inject the clipboard's full
  // styled markup (Word/Docs fonts, sizes, spans) straight into the stored
  // props — and from there verbatim into the sent email. Reduce every paste
  // to structural formatting (bold/italic/underline/strike/safe links/breaks);
  // plain-text clipboards keep their line breaks.
  on(root, 'paste', (e: ClipboardEvent) => {
    const t = e.target as HTMLElement
    if (!t || !t.closest || !t.closest('[contenteditable]')) return
    e.preventDefault()
    const html = e.clipboardData?.getData('text/html') || ''
    const text = e.clipboardData?.getData('text/plain') || ''
    const safe = html ? sanitizePastedHtml(html) : pastedTextToHtml(text)
    if (safe) document.execCommand('insertHTML', false, safe)
  }, true)

  /* ---------- fit-to-width ----------
     The design is a fixed three-column layout (palette 296 + 640px email stage
     + inspector 360 ≈ 1360px to breathe). When the editor is handed less width
     — a smaller screen, a non-maximised window, or any constrained container —
     the 640px stage would otherwise shrink, the hero title would wrap, and the
     whole thing would look squished and "off". Instead we scale the ENTIRE
     editor down proportionally so it always renders as a faithful, pixel-exact
     mirror of the design, just smaller. Measured from the real parent box so it
     adapts to whatever width it's actually given. */
  const NATURAL_W = 1360
  const MIN_ZOOM = 0.5
  function fitToWidth() {
    const host = root.parentElement
    const avail = host ? host.getBoundingClientRect().width : window.innerWidth
    if (!avail) return
    const z = Math.max(MIN_ZOOM, Math.min(1, avail / NATURAL_W))
    zoomFactor = z
    // `zoom` (unlike transform: scale) reflows the layout, so the columns lay
    // out at full design width and then render scaled — no squish, fills width.
    ;(root.style as any).zoom = z === 1 ? '' : String(z)
    // zoom scales height too; compensate so the editor still fills the viewport.
    root.style.height = z === 1 ? '' : 100 / z + 'vh'
    // Re-place an open format bubble so it tracks its anchor after a resize
    // instead of freezing at the pre-resize offset (its coord space just
    // rescaled).
    if (fmtBubble && fmtBubble.classList.contains('show') && fmtRect)
      positionFmtBubble(fmtRect)
  }
  fitToWidth()
  const fitRO =
    typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fitToWidth) : null
  if (fitRO && root.parentElement) fitRO.observe(root.parentElement)
  on(window, 'resize', fitToWidth)
  cleanups.push(() => {
    if (fitRO) fitRO.disconnect()
  })

  return {
    getState,
    getHTML: buildHTML,
    notifySaveResult(ok: boolean) {
      if (!ok) setStatus("Couldn't save — check your connection")
      else if (!dirty) setStatus('<span class="saved-dot"></span>Saved')
    },
    setEnrolledCount(n: number | null) {
      enrolledTotal = n
      const rc = realCount()
      if (rc) broadcast.count = rc
      // Refresh only the count label; never re-render the canvas (that would
      // steal focus). No dirty flag — a count arriving isn't a creator edit.
      updateCrumb()
    },
    destroy() {
      // Persist any debounced-but-unsent edit before tearing down, so an
      // unmount (route change, parent close) never drops the last change.
      flushAutosave()
      closeFloat(); closeSave(); closePicker()
      if (fmtBubble) { fmtBubble.remove(); fmtBubble = null }
      trailerHls.forEach((h) => { try { h.destroy() } catch { /* ignore */ } })
      clearTimeout(saveTimer); clearTimeout(toastTimer); clearTimeout(fmtTimer)
      cleanups.forEach((fn) => fn())
    },
  }
}
