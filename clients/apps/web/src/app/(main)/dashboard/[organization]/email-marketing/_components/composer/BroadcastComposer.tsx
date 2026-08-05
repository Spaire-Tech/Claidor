'use client'

// Broadcast composer — your design (the screenshot), now powered by the real
// @react-email/editor instead of the hand-rolled execCommand editor. Same
// chrome (top bar, To/Exclude, Subject, Broadcast-settings panel, Send), but
// the message body is the React Email visual editor: per-selection bubble-menu
// formatting, slash commands, normalized paste, and email-ready HTML via
// getEmail() — which fixes the selection/font-size/paste bugs at the root.

import { useAuth } from '@/hooks/auth'
import {
  useArchiveEmailBroadcast,
  useCreateEmailBroadcast,
  useEmailBroadcast,
  useScheduleEmailBroadcast,
  useSendEmailBroadcast,
  useSendTestEmailBroadcast,
  useUpdateEmailBroadcast,
  useUploadEmailImage,
  type BroadcastWritePayload,
} from '@/hooks/queries/emailMarketing'
import { EmailEditor, type EmailEditorRef } from '@react-email/editor'
import { schemas } from '@spaire/client'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

import { AudienceFields, fmt, useSegments } from './fields'
import { Icon, type IconName } from './Icon'
import { SendOptions } from './panel'
import { type SendOptionsState } from './types'

import './composer.css'
// React Email editor styles. NB: the package's exports map lists
// link/button/image-bubble-menu.css but ships no such files (their bubble-menu
// styles live in bubble-menu.css), so we import only the ones that exist.
import '@react-email/editor/themes/default.css'
import '@react-email/editor/styles/bubble-menu.css'
import '@react-email/editor/styles/slash-command.css'
import '@react-email/editor/styles/inspector.css'

// ── small local chrome helpers (same markup/classes as the original) ──
function Toast({ msg }: { msg: string }) {
  return <div className={'toast' + (msg ? ' show' : '')}>{msg}</div>
}

type MenuItem =
  | { sep: true }
  | { icon: IconName; label: string; danger?: boolean; fn: () => void }

function Menu({ items, onClose }: { items: MenuItem[]; onClose: () => void }) {
  return (
    <Fragment>
      <div className="menu-backdrop" onClick={onClose}></div>
      <div className="c-menu">
        {items.map((it, i) =>
          'sep' in it ? (
            <div className="menu-sep" key={i}></div>
          ) : (
            <button
              key={i}
              className={'menu-item' + (it.danger ? ' danger' : '')}
              onClick={() => {
                it.fn()
                onClose()
              }}
            >
              <Icon name={it.icon} size={18} /> {it.label}
            </button>
          ),
        )}
      </div>
    </Fragment>
  )
}

function Modal({
  children,
  onClose,
}: {
  children: ReactNode
  onClose: () => void
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="c-modal" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

const todayISO = () => {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function BroadcastComposer({
  organization,
  broadcastId: initialBroadcastId = null,
}: {
  organization: schemas['Organization']
  broadcastId?: string | null
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const exitTo =
    searchParams.get('returnTo') ||
    `/dashboard/${organization.slug}/email-marketing/broadcasts`
  const { currentUser } = useAuth()

  // Load an existing broadcast when editing (gated until ready so the editor
  // mounts with its content already in place).
  const existingQuery = useEmailBroadcast(initialBroadcastId ?? '')
  const existing = initialBroadcastId ? existingQuery.data : null
  const loading = !!initialBroadcastId && existingQuery.isLoading

  if (loading) {
    return createPortalSafe(
      <div className="composer-shell">
        <div className="topbar">
          <span className="tb-saved">Loading…</span>
        </div>
      </div>,
    )
  }

  return (
    <ComposerInner
      key={existing?.id ?? 'new'}
      organization={organization}
      existing={existing ?? null}
      exitTo={exitTo}
      router={router}
      currentUserEmail={currentUser?.email ?? ''}
      initialBroadcastId={initialBroadcastId}
    />
  )
}

// Render into document.body so the composer sits above the dashboard chrome.
function createPortalSafe(node: ReactNode): ReactNode {
  if (typeof document === 'undefined') return null
  return createPortal(node, document.body)
}

type Existing = ReturnType<typeof useEmailBroadcast>['data']

function ComposerInner({
  organization,
  existing,
  exitTo,
  router,
  currentUserEmail,
  initialBroadcastId,
}: {
  organization: schemas['Organization']
  existing: NonNullable<Existing> | null
  exitTo: string
  router: ReturnType<typeof useRouter>
  currentUserEmail: string
  initialBroadcastId: string | null
}) {
  const [audience, setAudience] = useState<string>(
    existing?.segment_id ?? 'all',
  )
  const [excludes, setExcludes] = useState<string[]>([])
  const [showExclude, setShowExclude] = useState(false)
  const [subject, setSubject] = useState(existing?.subject ?? '')
  const [so, setSo] = useState<SendOptionsState>({
    replyTo: 'self',
    schedule: false,
    date: todayISO(),
    time: '09:00',
    tracking: true,
    webVersion: true,
    labels: ['Newsletter'],
    customTags: [],
  })
  const [save, setSave] = useState<'saved' | 'saving'>('saved')
  const [status, setStatus] = useState<'draft' | 'scheduled' | 'sent'>(
    (existing?.status as 'draft' | 'scheduled' | 'sent') ?? 'draft',
  )
  const [toast, setToastMsg] = useState('')
  const [menu, setMenu] = useState(false)
  const [sendMenu, setSendMenu] = useState(false)
  const [modal, setModal] = useState<
    null | 'send' | 'nosubject' | 'close' | 'discard'
  >(null)
  const [broadcastId, setBroadcastId] = useState<string | null>(
    initialBroadcastId,
  )
  const [mounted, setMounted] = useState(false)
  const [mode, setMode] = useState<'edit' | 'preview'>('edit')
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')
  const [previewHtml, setPreviewHtml] = useState('')
  // Real autosave state — drives the honest "Draft saved" label.
  const [hasSaved, setHasSaved] = useState(!!initialBroadcastId)

  const editorRef = useRef<EmailEditorRef | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const persistingRef = useRef(false)
  // Initial editor content — existing HTML when editing, empty otherwise.
  // `existing` is stable for this mount (the parent keys ComposerInner by id),
  // so a plain derived const is correct here (no ref needed).
  // Seed the editor from its OWN saved JSON (lossless round-trip), not the
  // rendered email HTML. Guard the JSON so a legacy/non-editor content_json
  // can't be handed to the editor; fall back to HTML, then empty.
  const savedJson = (existing as { content_json?: unknown } | null)
    ?.content_json
  const initialContent: string | object =
    savedJson &&
    typeof savedJson === 'object' &&
    (savedJson as { type?: string }).type === 'doc'
      ? (savedJson as object)
      : (existing?.content_html ?? '')

  const createBroadcast = useCreateEmailBroadcast(organization.id)
  const updateBroadcast = useUpdateEmailBroadcast()
  const sendBroadcast = useSendEmailBroadcast()
  const scheduleBroadcast = useScheduleEmailBroadcast()
  const sendTest = useSendTestEmailBroadcast()
  const uploadImage = useUploadEmailImage(organization.id)
  const archiveBroadcast = useArchiveEmailBroadcast()

  const segments = useSegments(organization.id)
  const audSeg = segments.find((s) => s.id === audience) ?? segments[0]
  const excTotal = excludes.reduce(
    (s, id) => s + (segments.find((x) => x.id === id)?.count ?? 0),
    0,
  )
  const reach = Math.max(0, (audSeg?.count ?? 0) - excTotal)

  useEffect(() => setMounted(true), [])

  const showToast = (m: string) => {
    setToastMsg(m)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToastMsg(''), 2400)
  }

  // Pull the email HTML + JSON from the editor at save time.
  const getContent = async (): Promise<{
    html: string
    json: Record<string, unknown> | null
  }> => {
    const ref = editorRef.current
    if (!ref) return { html: '', json: null }
    const { html } = await ref.getEmail()
    return { html, json: ref.getJSON() as unknown as Record<string, unknown> }
  }

  // Enter preview: render the email exactly as it will send (getEmail HTML)
  // into the device-framed preview. Toggling back to Edit keeps the editor
  // mounted (its content is never unmounted, only hidden).
  const togglePreview = async () => {
    if (mode === 'preview') {
      setMode('edit')
      return
    }
    const { html } = await getContent()
    setPreviewHtml(html)
    setMode('preview')
  }

  const buildPayload = (
    html: string,
    json: Record<string, unknown> | null,
  ): BroadcastWritePayload & { subject: string; sender_name: string } => ({
    subject: subject || 'Untitled broadcast',
    preview_text: null,
    sender_name: organization.name,
    sender_email: null,
    reply_to_email:
      so.replyTo === 'noreply'
        ? null
        : so.replyTo === 'support'
          ? `support@${organization.slug}.com`
          : currentUserEmail || null,
    content_html: html,
    content_json: json,
    segment_id: audience === 'all' ? null : audience,
    filter_rules: null,
  })

  const persist = async (): Promise<string | null> => {
    const { html, json } = await getContent()
    const payload = buildPayload(html, json)
    setSave('saving')
    persistingRef.current = true
    try {
      let id = broadcastId
      if (id) {
        await updateBroadcast.mutateAsync({ broadcastId: id, body: payload })
      } else {
        const created = await createBroadcast.mutateAsync(payload)
        id = created.id
        setBroadcastId(id)
      }
      setSave('saved')
      setHasSaved(true)
      return id
    } catch (err) {
      setSave('saved')
      showToast(err instanceof Error ? err.message : 'Save failed')
      return null
    } finally {
      persistingRef.current = false
    }
  }

  // Debounced autosave on edits. Skips while a save is in flight and never
  // creates a blank draft (requires a subject or some body content).
  const autosave = async () => {
    if (persistingRef.current) return
    const { html } = await getContent()
    const bodyText = html.replace(/<[^>]*>/g, '').trim()
    if (!subject.trim() && !bodyText) return
    await persist()
  }
  const scheduleAutosave = () => {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    autosaveTimer.current = setTimeout(() => void autosave(), 1500)
  }

  const doSendTest = async () => {
    if (!currentUserEmail) {
      showToast('No email on file for test send')
      return
    }
    const id = await persist()
    if (!id) return
    try {
      await sendTest.mutateAsync({ broadcastId: id, email: currentUserEmail })
      showToast('Test sent to ' + currentUserEmail)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Test failed')
    }
  }

  const trySend = () => {
    if (reach < 1) {
      showToast('This audience is empty')
      return
    }
    if (!subject.trim()) {
      setModal('nosubject')
      return
    }
    setModal('send')
  }

  const doSend = async () => {
    setModal(null)
    const id = await persist()
    if (!id) return
    try {
      if (so.schedule) {
        const dt = new Date(`${so.date}T${so.time}`)
        if (Number.isNaN(dt.getTime()) || dt.getTime() <= Date.now()) {
          showToast('Pick a future date and time')
          return
        }
        await scheduleBroadcast.mutateAsync({
          broadcastId: id,
          scheduledAt: dt.toISOString(),
        })
        setStatus('scheduled')
        showToast('Broadcast scheduled for ' + so.date + ' at ' + so.time)
      } else {
        await sendBroadcast.mutateAsync(id)
        setStatus('sent')
        showToast('Broadcast sent to ' + fmt(reach) + ' subscribers')
      }
      router.push(exitTo)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Send failed')
    }
  }

  const onUploadImage = async (file: File): Promise<{ url: string }> => {
    const res = await uploadImage.mutateAsync(file)
    return { url: res.url }
  }

  const savedLabel =
    save === 'saving'
      ? 'Saving…'
      : status === 'sent'
        ? 'Sent'
        : status === 'scheduled'
          ? 'Scheduled'
          : hasSaved
            ? 'Draft saved'
            : 'Draft'

  const senderEmailDisplay = currentUserEmail
  const senderNameDisplay = organization.name
  const senderAvatarUrl = organization.avatar_url ?? null

  const menuItems: MenuItem[] = [
    { icon: 'flask', label: 'Send a test', fn: doSendTest },
    {
      icon: 'drafts',
      label: 'Save draft',
      fn: async () => {
        const id = await persist()
        if (id) showToast('Draft saved')
      },
    },
    { sep: true },
    {
      icon: 'trash',
      label: 'Discard draft',
      danger: true,
      fn: () => setModal('discard'),
    },
  ]
  const sendMenuItems: MenuItem[] = [
    {
      icon: 'sendFill',
      label: 'Send now',
      fn: () => {
        setSo({ ...so, schedule: false })
        trySend()
      },
    },
    {
      icon: 'clock',
      label: 'Schedule send',
      fn: () => {
        setSo({ ...so, schedule: true })
        showToast('Pick a date in settings →')
      },
    },
    { icon: 'flask', label: 'Send a test first', fn: doSendTest },
  ]

  if (!mounted) return null

  const shell = (
    <div className="composer-shell">
      {/* ── Top bar ───────────────────────────────────────────────── */}
      <div className="topbar">
        <button
          className="tb-x"
          title="Close"
          onClick={() => setModal('close')}
        >
          <Icon name="close" size={22} />
        </button>
        <span className={'tb-saved' + (save === 'saving' ? ' saving' : '')}>
          {savedLabel}
        </span>
        <span className="tb-spacer"></span>
        <div style={{ position: 'relative' }}>
          <button
            className={'tb-round' + (menu ? ' on' : '')}
            title="More"
            onClick={() => setMenu(!menu)}
          >
            <Icon name="dots" size={20} />
          </button>
          {menu && <Menu items={menuItems} onClose={() => setMenu(false)} />}
        </div>
        <button
          className={'pill pill-soft' + (mode === 'preview' ? ' on' : '')}
          onClick={() => void togglePreview()}
        >
          <Icon name="eye" size={19} /> Preview
        </button>
        <div className="split-pill" style={{ position: 'relative' }}>
          <button className="pill pill-dark pill-main" onClick={trySend}>
            <Icon name="send" size={18} /> {so.schedule ? 'Schedule' : 'Send'}
          </button>
          <span className="pill-cv"></span>
          <button className="pill-chev" onClick={() => setSendMenu(!sendMenu)}>
            <Icon name="chevronDown" size={16} />
          </button>
          {sendMenu && (
            <Menu items={sendMenuItems} onClose={() => setSendMenu(false)} />
          )}
        </div>
      </div>

      {/* ── Workspace ─────────────────────────────────────────────── */}
      <div className="work">
        <div className="doc-col">
          {mode === 'preview' && (
            <div className="mid-bar">
              <div className="mid-seg">
                <button onClick={() => setMode('edit')}>
                  <Icon name="type" size={15} /> Edit
                </button>
                <button className="on">
                  <Icon name="eye" size={15} /> Preview
                </button>
              </div>
              <div className="mid-dev">
                <button
                  className={device === 'desktop' ? 'on' : ''}
                  onClick={() => setDevice('desktop')}
                >
                  <Icon name="monitor" size={18} />
                </button>
                <button
                  className={device === 'mobile' ? 'on' : ''}
                  onClick={() => setDevice('mobile')}
                >
                  <Icon name="smartphone" size={18} />
                </button>
              </div>
            </div>
          )}

          {/* Edit surface — kept mounted (only hidden) so the editor content
              survives preview toggles. */}
          <div
            className="compose"
            style={{ display: mode === 'edit' ? undefined : 'none' }}
          >
            <AudienceFields
              organization={organization}
              audience={audience}
              setAudience={setAudience}
              excludes={excludes}
              setExcludes={setExcludes}
              showExclude={showExclude}
              setShowExclude={setShowExclude}
              subject={subject}
              setSubject={setSubject}
              reach={reach}
              onTouch={scheduleAutosave}
              allowExclude={false}
            />
            <div className="re-editor">
              {/* EmailEditor mounts its own bubble menu (select text to
                  format) and slash command (type "/" to insert image, button,
                  columns, lists, quote, divider…). Do NOT add them as children
                  — that double-registers the keyed plugins and crashes. */}
              <EmailEditor
                ref={editorRef}
                content={
                  (initialContent || undefined) as ComponentProps<
                    typeof EmailEditor
                  >['content']
                }
                placeholder="Write your message, or press “/” to insert an image, button, columns…"
                onUploadImage={onUploadImage}
                onUpdate={scheduleAutosave}
              />
            </div>
          </div>

          {mode === 'preview' && (
            <div className="preview-stage">
              <div className={'screen ' + device}>
                <div className="screen-inner">
                  <div className="pv-mailhead">
                    <h1 className="pv-subject">
                      {subject || 'Untitled broadcast'}
                    </h1>
                    <div className="pv-sender">
                      <div className="av">
                        {senderAvatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={senderAvatarUrl} alt="" />
                        ) : (
                          senderNameDisplay
                            .split(' ')
                            .map((p) => p[0])
                            .join('')
                            .slice(0, 2)
                            .toUpperCase()
                        )}
                      </div>
                      <div className="sm">
                        <div className="l1">
                          <b>{senderNameDisplay}</b>
                          <span className="em">{senderEmailDisplay}</span>
                        </div>
                        <div className="to">to subscribers</div>
                      </div>
                    </div>
                  </div>
                  {/* Isolated in an iframe so the email's own styles can't
                      leak into the dashboard; auto-sized to its content. */}
                  <iframe
                    className="pv-frame"
                    title="Email preview"
                    srcDoc={previewHtml}
                    onLoad={(e) => {
                      const f = e.currentTarget
                      try {
                        const h = f.contentWindow?.document.body?.scrollHeight
                        if (h) f.style.height = h + 'px'
                      } catch {
                        /* same-origin srcDoc — guard just in case */
                      }
                    }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="panel-col">
          <SendOptions
            organization={organization}
            senderEmail={senderEmailDisplay}
            senderName={senderNameDisplay}
            senderAvatarUrl={senderAvatarUrl}
            so={so}
            setSo={setSo}
            onTouch={scheduleAutosave}
            onTest={doSendTest}
            sequence={false}
          />
        </div>
      </div>

      <Toast msg={toast} />

      {/* ── Modals ────────────────────────────────────────────────── */}
      {modal === 'send' && (
        <Modal onClose={() => setModal(null)}>
          <div className="modal-ic">
            <Icon name="sendFill" size={24} />
          </div>
          <h3>
            {so.schedule ? 'Schedule this broadcast?' : 'Send this broadcast?'}
          </h3>
          <p>
            It will go to <b>{fmt(reach)} subscribers</b>{' '}
            {so.schedule ? `on ${so.date} at ${so.time}` : 'right now'}.
          </p>
          <div className="modal-actions">
            <button className="m-ghost" onClick={() => setModal(null)}>
              Cancel
            </button>
            <button className="m-dark" onClick={() => void doSend()}>
              {so.schedule ? 'Schedule' : 'Send to ' + fmt(reach)}
            </button>
          </div>
        </Modal>
      )}

      {modal === 'nosubject' && (
        <Modal onClose={() => setModal(null)}>
          <h3>Send without a subject?</h3>
          <p>
            This broadcast doesn&apos;t have a subject line. Subscribers are far
            more likely to skip it.
          </p>
          <div className="modal-actions">
            <button className="m-ghost" onClick={() => setModal(null)}>
              Add subject
            </button>
            <button className="m-dark" onClick={() => setModal('send')}>
              Send anyway
            </button>
          </div>
        </Modal>
      )}

      {modal === 'close' && (
        <Modal onClose={() => setModal(null)}>
          <h3>Close this draft?</h3>
          <p>Your broadcast is saved when you hit Save draft or Send.</p>
          <div className="modal-actions">
            <button className="m-ghost" onClick={() => setModal(null)}>
              Keep editing
            </button>
            <button
              className="m-dark"
              onClick={() => {
                setModal(null)
                router.push(exitTo)
              }}
            >
              Close
            </button>
          </div>
        </Modal>
      )}

      {modal === 'discard' && (
        <Modal onClose={() => setModal(null)}>
          <h3>Discard this draft?</h3>
          <p>
            {broadcastId
              ? 'This removes the saved draft. It can’t be undone.'
              : 'This clears everything you’ve written.'}
          </p>
          <div className="modal-actions">
            <button className="m-ghost" onClick={() => setModal(null)}>
              Cancel
            </button>
            <button
              className="m-danger"
              onClick={async () => {
                setModal(null)
                if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
                // Actually delete the persisted draft (not just navigate away).
                if (broadcastId) {
                  try {
                    await archiveBroadcast.mutateAsync(broadcastId)
                  } catch {
                    /* best-effort; navigate regardless */
                  }
                }
                router.push(exitTo)
              }}
            >
              Discard
            </button>
          </div>
        </Modal>
      )}
    </div>
  )

  return createPortal(shell, document.body)
}
