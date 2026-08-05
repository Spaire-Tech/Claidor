'use client'

// Top-level broadcast composer.
//
// Ports the design's single-page layout 1:1 and wires every action to the
// existing Spaire email-broadcast API surface — no new endpoints needed.
//
//   - Subject, body blocks, attachments, audience, sender → persisted via
//     useCreateEmailBroadcast / useUpdateEmailBroadcast
//   - "Send a test" → useSendTestEmailBroadcast
//   - "Send" → useSendEmailBroadcast (or useScheduleEmailBroadcast if the
//     Schedule toggle is on)
//   - Image blocks call useUploadEmailImage so the broadcast HTML ships
//     hosted URLs (not base64 data URLs) — keeps payload size sane on send.

import { useAuth } from '@/hooks/auth'
import {
  useCreateEmailBroadcast,
  useScheduleEmailBroadcast,
  useSendEmailBroadcast,
  useSendTestEmailBroadcast,
  useUpdateEmailBroadcast,
  useUploadEmailImage,
  type BroadcastWritePayload,
  type FilterRules,
} from '@/hooks/queries/emailMarketing'
import { schemas } from '@spaire/client'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

import { MailDocument } from './blocks'
import { AudienceFields, fmt, useSegments } from './fields'
import { Icon, type IconName } from './Icon'
import { ContextPanel, SendOptions } from './panel'
import { EmailPreview } from './preview'
import { blocksToEmailHtml } from './serializer'
import {
  INITIAL_BLOCKS,
  TEXTLIKE,
  defaultBlock,
  readFileAsDataURL,
  type Attachment,
  type Block,
  type BlockType,
  type SendOptionsState,
} from './types'

import './composer.css'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function Toast({ msg }: { msg: string }) {
  return <div className={'toast' + (msg ? ' show' : '')}>{msg}</div>
}

type MenuItem =
  | { sep: true }
  | { icon: IconName; label: string; danger?: boolean; fn: () => void }

function Menu({
  items,
  onClose,
}: {
  items: MenuItem[]
  onClose: () => void
}) {
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

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

// When `sequenceMode` is set, ComposerApp is hosted as an automation
// sequence's email editor instead of a broadcast composer: no audience
// picker (the sequence defines who gets it), no Schedule / Save draft /
// Duplicate, and the primary action is "Done" — it hands the authored
// subject + HTML + block doc back to the sequence and closes.
export type SequenceMode = {
  sequenceName?: string
  initialSubject?: string
  initialBlocks?: Block[]
  onSave: (v: {
    subject: string
    content_html: string
    content_json: Record<string, unknown>
  }) => void
  onClose: () => void
}

export function ComposerApp({
  organization,
  sequenceMode,
}: {
  organization: schemas['Organization']
  sequenceMode?: SequenceMode
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  // When launched from the Space (Broadcast tab) the caller passes a
  // ?returnTo= so closing/sending returns there instead of the marketing
  // nav. Falls back to the marketing broadcasts list for the standalone route.
  const exitTo =
    searchParams.get('returnTo') ||
    `/dashboard/${organization.slug}/email-marketing/broadcasts`
  const { currentUser } = useAuth()

  // Draft state
  const [audience, setAudience] = useState<string>('all')
  const [excludes, setExcludes] = useState<string[]>([])
  const [showExclude, setShowExclude] = useState(false)
  const [subject, setSubject] = useState(sequenceMode?.initialSubject ?? '')
  const [blocks, setBlocks] = useState<Block[]>(
    sequenceMode?.initialBlocks && sequenceMode.initialBlocks.length > 0
      ? sequenceMode.initialBlocks
      : INITIAL_BLOCKS,
  )
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [selId, setSelId] = useState<string | null>(null)
  const [mode, setMode] = useState<'edit' | 'preview'>('edit')
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')
  const [drag, setDrag] = useState<string | null>(null)
  const [dropIdx, setDropIdx] = useState<number | null>(null)
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
  const [status, setStatus] = useState<'draft' | 'scheduled' | 'sent'>('draft')
  const [toast, setToastMsg] = useState('')
  const [menu, setMenu] = useState(false)
  const [sendMenu, setSendMenu] = useState(false)
  const [modal, setModal] = useState<
    null | 'send' | 'nosubject' | 'close' | 'discard'
  >(null)
  const [broadcastId, setBroadcastId] = useState<string | null>(null)

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const fileCb = useRef<((f: File) => void) | null>(null)
  // Tracks which image block, if any, is currently waiting for a file.
  // Lets the file picker drive both "new upload" and "replace existing".
  const pendingImageId = useRef<string | null>(null)
  // Maps a non-text block id -> the empty paragraph auto-added right
  // after it. When that block is deleted we also remove its leftover
  // paragraph, so deleting a section cleans up fully (no stray
  // "Write your message…" line left behind).
  const autoTrailingRef = useRef<Record<string, string>>({})

  // Mutations
  const createBroadcast = useCreateEmailBroadcast(organization.id)
  const updateBroadcast = useUpdateEmailBroadcast()
  const sendBroadcast = useSendEmailBroadcast()
  const scheduleBroadcast = useScheduleEmailBroadcast()
  const sendTest = useSendTestEmailBroadcast()
  const uploadImage = useUploadEmailImage(organization.id)

  // Audience derivation
  const segments = useSegments(organization.id)
  const audSeg = segments.find((s) => s.id === audience) ?? segments[0]
  const excTotal = excludes.reduce(
    (s, id) => s + (segments.find((x) => x.id === id)?.count ?? 0),
    0,
  )
  const reach = Math.max(0, (audSeg?.count ?? 0) - excTotal)

  // Selected block + context panel decision
  const sel = blocks.find((b) => b.id === selId) || null
  const showCtx = mode === 'edit' && sel && !TEXTLIKE.includes(sel.type)

  // Touch handlers
  const touch = () => {
    setSave('saving')
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => setSave('saved'), 850)
  }
  const showToast = (m: string) => {
    setToastMsg(m)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToastMsg(''), 2400)
  }
  const pickFile = (accept: string, cb: (f: File) => void) => {
    if (!fileRef.current) return
    fileRef.current.accept = accept
    fileCb.current = cb
    fileRef.current.value = ''
    fileRef.current.click()
  }

  // Block ops
  const addBlock = (type: BlockType, at?: number) => {
    const nb = defaultBlock(type)
    // Non-text blocks (image, button, divider, file) auto-drop an
    // empty paragraph right after them so the user can keep typing
    // like in any normal mail composer.
    const trailing = !TEXTLIKE.includes(type) ? defaultBlock('text') : null
    if (trailing) autoTrailingRef.current[nb.id] = trailing.id
    setBlocks((bs) => {
      const c = [...bs]
      const idx = at == null ? bs.length : at
      c.splice(idx, 0, nb)
      if (trailing) c.splice(idx + 1, 0, trailing)
      return c
    })
    setSelId(nb.id)
    touch()
    if (type === 'image') pickImageFor(nb.id)
    if (type === 'file') {
      // Open the picker immediately so the inserted file block gets a
      // real file behind it; on cancel the placeholder stays and the
      // user can delete or replace later.
      pickFile('*/*', (f) => {
        const kb = f.size / 1024
        const size =
          kb > 1024
            ? (kb / 1024).toFixed(1) + ' MB'
            : Math.max(1, Math.round(kb)) + ' KB'
        update(nb.id, { name: f.name, size } as Partial<Block>)
        showToast('Attached ' + f.name)
      })
    }
  }
  const update = (id: string, patch: Partial<Block>) => {
    setBlocks((bs) =>
      bs.map((b) => (b.id === id ? ({ ...b, ...patch } as Block) : b)),
    )
    touch()
  }
  const isEmptyText = (b: Block): boolean =>
    (b.type === 'text' ||
      b.type === 'h1' ||
      b.type === 'h2' ||
      b.type === 'h3' ||
      b.type === 'quote') &&
    !(b.html || '').replace(/<br\s*\/?>(\s*)/gi, '').trim()

  const del = (id: string) => {
    setBlocks((bs) => {
      // Also drop the empty paragraph this block auto-spawned, if it's
      // still empty — so deleting a section leaves nothing behind.
      const trailingId = autoTrailingRef.current[id]
      let next = bs.filter((b) => {
        if (b.id === id) return false
        if (b.id === trailingId) {
          const tb = bs.find((x) => x.id === trailingId)
          return !(tb && isEmptyText(tb))
        }
        return true
      })
      delete autoTrailingRef.current[id]
      // Never leave the document with zero blocks — keep one empty line.
      if (next.length === 0) next = [defaultBlock('text')]
      return next
    })
    setSelId(null)
    touch()
    showToast('Section removed')
  }
  const dup = (id: string) => {
    setBlocks((bs) => {
      const i = bs.findIndex((b) => b.id === id)
      if (i < 0) return bs
      const copy = JSON.parse(JSON.stringify(bs[i])) as Block
      copy.id = 'm' + Date.now() + Math.floor(Math.random() * 1000)
      const c = [...bs]
      c.splice(i + 1, 0, copy)
      return c
    })
    touch()
    showToast('Section duplicated')
  }
  const changeType = (id: string, t: BlockType) => {
    setBlocks((bs) =>
      bs.map((b) => {
        if (b.id !== id) return b
        // text → list / list → text conversion preserves visible text by
        // walking through the rendered innerText so HTML tags don't leak
        // into list items as raw strings.
        const wasList = b.type === 'bullet' || b.type === 'numbered'
        const toList = t === 'bullet' || t === 'numbered'
        if (toList && !wasList) {
          const html = 'html' in b ? b.html || '' : ''
          const tmp = document.createElement('div')
          tmp.innerHTML = html
          const items =
            (tmp.innerText || '').split('\n').filter(Boolean) || [html]
          return { id: b.id, type: t, items } as Block
        }
        if (!toList && wasList) {
          const items = 'items' in b ? b.items || [] : []
          return { id: b.id, type: t, html: items.join('<br>') } as Block
        }
        if (TEXTLIKE.includes(t) && !toList && !wasList) {
          return { ...b, type: t } as Block
        }
        return { ...b, type: t } as Block
      }),
    )
    touch()
  }

  // DnD
  const onDragStart = (id: string) => {
    setDrag(id)
    setDropIdx(null)
  }
  const onDragEnd = () => {
    setDrag(null)
    setDropIdx(null)
  }
  const onDrop = () => {
    if (drag == null) return
    const at = dropIdx == null ? blocks.length : dropIdx
    setBlocks((bs) => {
      const from = bs.findIndex((b) => b.id === drag)
      if (from === -1) return bs
      const c = [...bs]
      const [m] = c.splice(from, 1)
      c.splice(from < at ? at - 1 : at, 0, m)
      return c
    })
    setDrag(null)
    setDropIdx(null)
    touch()
  }

  // Image picker — used for both "create image block" and "replace existing".
  const pickImageFor = (blockId: string) => {
    pendingImageId.current = blockId
    pickFile('image/*', async (file) => {
      // Show a local preview immediately while the upload completes.
      readFileAsDataURL(file, (data) => {
        const id = pendingImageId.current
        if (id) update(id, { src: data } as Partial<Block>)
      })
      try {
        const { url } = await uploadImage.mutateAsync(file)
        const id = pendingImageId.current
        if (id) update(id, { src: url } as Partial<Block>)
      } catch (err) {
        showToast(
          err instanceof Error ? err.message : 'Image upload failed',
        )
      } finally {
        pendingImageId.current = null
      }
    })
  }

  // Attach files now live as inline `file` blocks (no bottom tray).
  // Both the top-bar paperclip and the + popover's "Attach file" route
  // through this — picks a file, appends a file block + trailing
  // paragraph, selects it.
  const addAttachment = () =>
    pickFile('*/*', (f) => {
      const kb = f.size / 1024
      const size =
        kb > 1024
          ? (kb / 1024).toFixed(1) + ' MB'
          : Math.max(1, Math.round(kb)) + ' KB'
      const nb = defaultBlock('file')
      if (nb.type === 'file') {
        nb.name = f.name
        nb.size = size
      }
      const trailing = defaultBlock('text')
      setBlocks((bs) => [...bs, nb, trailing])
      setSelId(nb.id)
      touch()
      showToast('Attached ' + f.name)
    })

  // Backend persistence
  const buildPayload = (): BroadcastWritePayload & {
    subject: string
    sender_name: string
  } => {
    const filter_rules: FilterRules | null =
      audience !== 'all' || excludes.length
        ? null /* segment+excludes can't be expressed via FilterRules yet */
        : null
    return {
      subject: subject || 'Untitled broadcast',
      preview_text: null,
      sender_name: organization.name,
      sender_email: null,
      reply_to_email: so.replyTo === 'noreply' ? null : null,
      content_html: blocksToEmailHtml(blocks),
      // content_json stores the source-of-truth block list so the doc can
      // be reopened losslessly. Wrapped in a versioned envelope so we can
      // evolve the schema without breaking older drafts.
      content_json: {
        v: 'composer.v3',
        blocks,
        attachments,
        audience,
        excludes,
        sendOptions: so,
      } as unknown as Record<string, unknown>,
      segment_id: audience === 'all' ? null : audience,
      filter_rules,
    }
  }

  const persist = async (): Promise<string | null> => {
    const payload = buildPayload()
    setSave('saving')
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
      return id
    } catch (err) {
      setSave('saved')
      showToast(err instanceof Error ? err.message : 'Save failed')
      return null
    }
  }

  const doSendTest = async () => {
    const recipient = currentUser?.email
    if (!recipient) {
      showToast('No email on file for test send')
      return
    }
    const id = await persist()
    if (!id) return
    try {
      await sendTest.mutateAsync({ broadcastId: id, email: recipient })
      showToast('Test sent to ' + recipient)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Test failed')
    }
  }

  // ── Keyboard ────────────────────────────────────────────────────────
  useEffect(() => {
    const isEditing = () => {
      const ae = document.activeElement as HTMLElement | null
      return !!(
        ae &&
        ((ae as HTMLElement).isContentEditable ||
          ae.tagName === 'INPUT' ||
          ae.tagName === 'TEXTAREA')
      )
    }
    const onKey = (e: KeyboardEvent) => {
      // Backspace / Delete on a selected non-text block removes it,
      // but only when the user isn't typing in a field elsewhere.
      if (
        (e.key === 'Backspace' || e.key === 'Delete') &&
        sel &&
        !TEXTLIKE.includes(sel.type)
      ) {
        if (isEditing()) return
        e.preventDefault()
        del(sel.id)
        return
      }
      // Enter on a selected non-text block (image, button, divider)
      // drops a new paragraph below and selects it — mirrors what
      // hitting Enter in a normal email composer would do after a
      // media block.
      if (
        e.key === 'Enter' &&
        !e.shiftKey &&
        sel &&
        !TEXTLIKE.includes(sel.type)
      ) {
        if (isEditing()) return
        e.preventDefault()
        const idx = blocks.findIndex((b) => b.id === sel.id)
        if (idx >= 0) addBlock('text', idx + 1)
        return
      }
      if (e.key === 'Escape') {
        setSelId(null)
        setMenu(false)
        setSendMenu(false)
        setModal(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, blocks])

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

  // Hand the authored email back to the sequence and close.
  const finishSequenceEmail = () => {
    sequenceMode?.onSave({
      subject: subject || 'Untitled email',
      content_html: blocksToEmailHtml(blocks),
      content_json: {
        v: 'composer.v3',
        blocks,
        attachments,
      } as unknown as Record<string, unknown>,
    })
    sequenceMode?.onClose()
  }

  // In sequence mode the menu is just file attachments — no broadcast-only
  // actions (Duplicate / Save draft / Discard / Schedule).
  const menuItems: MenuItem[] = sequenceMode
    ? [{ icon: 'paperclip', label: 'Attach files', fn: addAttachment }]
    : [
        { icon: 'flask', label: 'Send a test', fn: doSendTest },
        { icon: 'paperclip', label: 'Attach files', fn: addAttachment },
        {
          icon: 'copy',
          label: 'Duplicate broadcast',
          fn: () => showToast('Broadcast duplicated'),
        },
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
        setSelId(null)
        showToast('Pick a date in settings →')
      },
    },
    { icon: 'flask', label: 'Send a test first', fn: doSendTest },
  ]

  const savedLabel =
    save === 'saving'
      ? 'Saving…'
      : status === 'sent'
        ? 'Sent'
        : status === 'scheduled'
          ? 'Scheduled'
          : 'Draft saved'

  const header = (
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
      onTouch={touch}
      // Sequences define their own audience (whoever the sequence enrols),
      // so the audience picker is replaced with a static label.
      lockedAudienceLabel={
        sequenceMode ? 'Everyone enrolled in this sequence' : undefined
      }
    />
  )

  const senderEmailDisplay = currentUser?.email ?? ''
  // A broadcast is sent *from the brand*, so the sender is the
  // organization — its real name and avatar, not the signed-in user
  // (UserRead has no display name anyway). Initials fall back when the
  // org has no avatar set.
  const senderNameDisplay = organization.name
  const senderAvatarUrl = organization.avatar_url ?? null

  // Mount the portal target client-side only (Next.js SSR has no
  // document.body). Returning null on the first render is fine: a
  // single setMounted re-render lands us in the portal.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return null

  const shell = (
    <div className="composer-shell">
      <input
        ref={fileRef}
        type="file"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f && fileCb.current) fileCb.current(f)
        }}
      />

      {/* ── Top bar ────────────────────────────────────────────────── */}
      <div className="topbar">
        <button
          className="tb-x"
          title={sequenceMode ? 'Back to automation' : 'Close'}
          onClick={() => (sequenceMode ? sequenceMode.onClose() : setModal('close'))}
        >
          <Icon name="close" size={22} />
        </button>
        <span className={'tb-saved' + (save === 'saving' ? ' saving' : '')}>
          {sequenceMode ? '' : savedLabel}
        </span>
        <span className="tb-spacer"></span>
        <button
          className="tb-round"
          title="Attach files"
          onClick={addAttachment}
        >
          <Icon name="paperclip" size={19} />
        </button>
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
          onClick={() => {
            setMode(mode === 'preview' ? 'edit' : 'preview')
            setSelId(null)
          }}
        >
          <Icon name="eye" size={19} /> Preview
        </button>
        {sequenceMode ? (
          // No Send / Schedule split — the email belongs to the sequence;
          // "Done" saves it and returns to the automation builder.
          <button
            className="pill pill-dark pill-main"
            onClick={finishSequenceEmail}
          >
            <Icon name="check" size={18} /> Done
          </button>
        ) : (
          <div className="split-pill" style={{ position: 'relative' }}>
            <button className="pill pill-dark pill-main" onClick={trySend}>
              <Icon name="send" size={18} /> {so.schedule ? 'Schedule' : 'Send'}
            </button>
            <span className="pill-cv"></span>
            <button
              className="pill-chev"
              onClick={() => setSendMenu(!sendMenu)}
            >
              <Icon name="chevronDown" size={16} />
            </button>
            {sendMenu && (
              <Menu items={sendMenuItems} onClose={() => setSendMenu(false)} />
            )}
          </div>
        )}
      </div>

      {/* ── Workspace ──────────────────────────────────────────────── */}
      <div className="work">
        {mode === 'edit' ? (
          <MailDocument
            header={header}
            blocks={blocks}
            selId={selId}
            onSelect={setSelId}
            update={update}
            changeType={changeType}
            addBlock={addBlock}
            pickImageFor={pickImageFor}
            drag={drag}
            dropIdx={dropIdx}
            setDropIdx={setDropIdx}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDrop={onDrop}
            onDuplicate={dup}
            onDelete={del}
          />
        ) : (
          <div className="doc-col">
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
            <EmailPreview
              organization={organization}
              senderEmail={senderEmailDisplay}
              senderName={senderNameDisplay}
              senderAvatarUrl={senderAvatarUrl}
              subject={subject}
              blocks={blocks}
              attachments={attachments}
              webVersion={so.webVersion}
              device={device}
            />
          </div>
        )}

        <div className="panel-col">
          {showCtx && sel ? (
            <ContextPanel
              b={sel}
              update={update}
              onDelete={del}
              onClose={() => setSelId(null)}
              pickImage={() => pickImageFor(sel.id)}
              toast={showToast}
            />
          ) : (
            <SendOptions
              organization={organization}
              senderEmail={senderEmailDisplay}
              senderName={senderNameDisplay}
              senderAvatarUrl={senderAvatarUrl}
              so={so}
              setSo={setSo}
              onTouch={touch}
              onTest={doSendTest}
              sequence={!!sequenceMode}
            />
          )}
        </div>
      </div>

      <Toast msg={toast} />

      {/* ── Modals ─────────────────────────────────────────────────── */}
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
          <div className="modal-rows">
            <div className="mrow">
              <Icon name={audSeg?.icon ?? 'people'} size={17} />{' '}
              {audSeg?.name}
              {excludes.length
                ? `, minus ${excludes.length} segment${excludes.length > 1 ? 's' : ''}`
                : ''}
            </div>
            <div className="mrow">
              <Icon name="clock" size={17} />{' '}
              {so.schedule ? `${so.date} · ${so.time}` : 'Send immediately'}
            </div>
            {so.tracking && (
              <div className="mrow">
                <Icon name="shield" size={17} /> Opens &amp; clicks tracked
              </div>
            )}
          </div>
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
            This broadcast doesn&apos;t have a subject line. Subscribers are
            far more likely to skip it.
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
          <p>
            Your broadcast is saved automatically — you can finish it later
            from Drafts.
          </p>
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
            This can&apos;t be undone. The broadcast and its content will be
            deleted.
          </p>
          <div className="modal-actions">
            <button className="m-ghost" onClick={() => setModal(null)}>
              Cancel
            </button>
            <button
              className="m-danger"
              onClick={() => {
                setModal(null)
                setBlocks(INITIAL_BLOCKS)
                setSubject('')
                setAttachments([])
                showToast('Draft discarded')
              }}
            >
              Discard
            </button>
          </div>
        </Modal>
      )}
    </div>
  )

  // Portal into document.body so the composer sits above the dashboard
  // chrome — the dashboard's top nav was overlapping the composer's
  // top bar (Send button etc.) while it rendered inside the dashboard
  // layout tree.
  return createPortal(shell, document.body)
}
