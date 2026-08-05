'use client'

import { useEntitlements } from '@/hooks/queries/entitlements'
import { useAuth } from '@/hooks/auth'
import Link from 'next/link'
import {
  BroadcastWritePayload,
  FilterRule,
  FilterRules,
  useBroadcastEngagementHeatmap,
  useCreateEmailBroadcast,
  useDeleteEmailBroadcastABTest,
  useEmailBroadcast,
  useEmailBroadcastABTest,
  useEmailSegments,
  useEmailSubscriberStats,
  useScheduleEmailBroadcast,
  useSegmentFilterPreview,
  useSendEmailBroadcast,
  useSendTestEmailBroadcast,
  useUpdateEmailBroadcast,
  useUploadEmailImage,
  useUpsertEmailBroadcastABTest,
} from '@/hooks/queries/emailMarketing'
import { schemas } from '@spaire/client'
import { useRouter, useSearchParams } from 'next/navigation'
import { memo, useMemo, useRef, useState } from 'react'
import { BroadcastEditor } from '../blockEditor/BroadcastEditor'
import { renderBlocksToHtml } from '../blockEditor/render'
import {
  Block,
  ContentDoc,
  isContentDoc,
  newId,
  normalizeContentDoc,
} from '../blockEditor/types'
import { useDialogs } from '../dialogs'
import { Icon } from '../Icon'
import { sanitizeEmailHtml } from '../sanitize'
import { KV, Section, Toggle } from '../shared'

type Step = 'details' | 'content' | 'audience' | 'preview' | 'review'

const STEPS: { id: Step; label: string; icon: string }[] = [
  { id: 'details', label: 'Details', icon: 'mail' },
  { id: 'content', label: 'Content', icon: 'edit' },
  { id: 'audience', label: 'Audience', icon: 'users' },
  { id: 'preview', label: 'Preview', icon: 'eye' },
  { id: 'review', label: 'Review & send', icon: 'send' },
]

type Draft = {
  subject: string
  preview_text: string
  sender_name: string
  // From-address. Empty string means "use the org default"; on save we map
  // empty → null so the server keeps its notifications-domain default
  // (audit issue #49).
  sender_email: string
  reply_to_email: string
  // Block document is the editable shape. content_html is regenerated from
  // the document each render and sent to the API alongside the JSON.
  content_doc: ContentDoc
  segment_id: string | null
  filter_rules: FilterRules | null
}

const STARTER_DOC: ContentDoc = {
  version: 1,
  blocks: [
    {
      id: newId(),
      type: 'heading',
      level: 2,
      text: 'Hi friends,',
    } satisfies Block,
    {
      id: newId(),
      type: 'paragraph',
      text: "Write your update here. We'll wrap it in your branded template before sending.",
    } satisfies Block,
  ],
}

const adoptContentJson = (raw: unknown): ContentDoc => {
  if (isContentDoc(raw)) {
    // Defensive: ensure each block has an id even if a legacy doc didn't,
    // and migrate string[] list items / id-less columns to the canonical
    // shape so the editor's React keys stay stable.
    const withIds = {
      version: 1 as const,
      accent: raw.accent,
      blocks: raw.blocks.map((b) =>
        'id' in b && b.id ? b : ({ ...b, id: newId() } as Block),
      ),
    }
    return normalizeContentDoc(withIds)
  }
  return STARTER_DOC
}

type ABDraft = {
  subject_b: string
  slice_pct: number
  decide_after_minutes: number
  winner_metric: 'open_rate' | 'click_rate'
}

const blankAb = (): ABDraft => ({
  subject_b: '',
  slice_pct: 20,
  decide_after_minutes: 240,
  winner_metric: 'open_rate',
})

const blankDraft = (organization: schemas['Organization']): Draft => ({
  subject: '',
  preview_text: '',
  sender_name: organization.name,
  sender_email: '',
  reply_to_email: '',
  content_doc: STARTER_DOC,
  segment_id: null,
  filter_rules: null,
})

/**
 * Pick a "best time to send" from the org's engagement heatmap, falling
 * back to a Tuesday-9am rule when we don't have enough signal yet.
 *
 * Audit issue #25 / fix-list #2: the previous implementation hardcoded
 * "next Tuesday at 08:42 local" and surfaced it under the "Optimal time"
 * radio as if it were ML-derived, even though `useBroadcastEngagementHeatmap`
 * had been available all along. We now read the matrix, find the highest-
 * engagement (day-of-week, hour) cell, and project it to the next future
 * occurrence in the user's timezone.
 *
 * Returns `{ date, source }` so the UI can label the recommendation as
 * either "from your last 90 days" or "default (not enough data yet)".
 */
const MIN_HEATMAP_SAMPLE = 30

type OptimalTime = {
  date: Date
  source: 'heatmap' | 'default'
}

const computeOptimalTime = (
  heatmap: { matrix: (number | null)[][]; sample_size: number } | undefined,
): OptimalTime => {
  const fallback = (): OptimalTime => {
    const d = new Date()
    d.setSeconds(0, 0)
    d.setMinutes(0)
    d.setHours(9)
    const day = d.getDay() // 0=Sun..6=Sat
    const daysToTuesday = (2 - day + 7) % 7 || 7
    d.setDate(d.getDate() + daysToTuesday)
    return { date: d, source: 'default' }
  }

  if (!heatmap || heatmap.sample_size < MIN_HEATMAP_SAMPLE) {
    return fallback()
  }
  const matrix = heatmap.matrix
  if (!Array.isArray(matrix) || matrix.length === 0) {
    return fallback()
  }

  // The backend exposes a 7×24 grid keyed by Postgres extract(dow):
  //   row 0 = Sunday, row 1 = Monday, … row 6 = Saturday.
  // JS Date.getDay() is also 0=Sun..6=Sat so the indexing is direct.
  let bestVal = -Infinity
  let bestDow = 2
  let bestHour = 9
  for (let dow = 0; dow < matrix.length; dow++) {
    const row = matrix[dow]
    if (!Array.isArray(row)) continue
    for (let hour = 0; hour < row.length; hour++) {
      const val = row[hour]
      if (typeof val !== 'number') continue
      if (val > bestVal) {
        bestVal = val
        bestDow = dow
        bestHour = hour
      }
    }
  }
  if (bestVal === -Infinity) return fallback()

  // Project (bestDow, bestHour) to the next future occurrence.
  const now = new Date()
  const target = new Date(now)
  target.setSeconds(0, 0)
  target.setMinutes(0)
  target.setHours(bestHour)
  let daysAhead = (bestDow - now.getDay() + 7) % 7
  if (daysAhead === 0 && target.getTime() <= now.getTime()) {
    daysAhead = 7
  }
  target.setDate(target.getDate() + daysAhead)
  return { date: target, source: 'heatmap' }
}

const toLocalDateTimeInputValue = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

type ExistingBroadcast = ReturnType<typeof useEmailBroadcast>['data']

const draftFromExisting = (
  existing: NonNullable<ExistingBroadcast>,
  organization: schemas['Organization'],
): Draft => ({
  subject: existing.subject ?? '',
  preview_text: (existing as { preview_text?: string }).preview_text ?? '',
  sender_name: existing.sender_name ?? organization.name,
  sender_email:
    (existing as { sender_email?: string | null }).sender_email ?? '',
  reply_to_email: existing.reply_to_email ?? '',
  content_doc: adoptContentJson(existing.content_json),
  segment_id: existing.segment_id ?? null,
  filter_rules:
    (existing as { filter_rules?: FilterRules | null }).filter_rules ?? null,
})

export const NewBroadcastScreen = (props: {
  organization: schemas['Organization']
  broadcastId: string | null
  onBack: () => void
  onOpened?: (id: string) => void
}) => {
  const { broadcastId } = props
  const existingQuery = useEmailBroadcast(broadcastId ?? '')
  const abQuery = useEmailBroadcastABTest(broadcastId ?? '')

  // Wait for both fetches before mounting the editor so useState's lazy
  // initializer can synchronously seed from real data (no hydration effect
  // needed). React 19 compiler is happier with this split.
  if (broadcastId && (existingQuery.isLoading || abQuery.isLoading)) {
    return (
      <div
        className="card"
        style={{ padding: 60, textAlign: 'center', color: 'var(--ink-3)' }}
      >
        Loading draft…
      </div>
    )
  }

  return (
    <ComposerInner
      {...props}
      existing={existingQuery.data ?? null}
      existingAb={abQuery.data?.config ?? null}
    />
  )
}

const ComposerInner = ({
  organization,
  broadcastId,
  onBack,
  onOpened,
  existing,
  existingAb,
}: {
  organization: schemas['Organization']
  broadcastId: string | null
  onBack: () => void
  onOpened?: (id: string) => void
  existing: NonNullable<ExistingBroadcast> | null
  existingAb: {
    subject_b: string
    slice_pct: number
    decide_after_minutes: number
    winner_metric: 'open_rate' | 'click_rate'
  } | null
}) => {
  const isNew = !broadcastId

  const [draft, setDraft] = useState<Draft>(() =>
    existing
      ? draftFromExisting(existing, organization)
      : blankDraft(organization),
  )
  const [step, setStep] = useState<Step>('details')
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [abDraft, setAbDraft] = useState<ABDraft | null>(() =>
    existingAb
      ? {
          subject_b: existingAb.subject_b,
          slice_pct: existingAb.slice_pct,
          decide_after_minutes: existingAb.decide_after_minutes,
          winner_metric: existingAb.winner_metric,
        }
      : null,
  )
  // Track whether the inner has ever seen a server-side A/B config — drives
  // whether we issue DELETE on clearing the toggle.
  const hadServerAbRef = useRef<boolean>(existingAb !== null)

  const upsertAb = useUpsertEmailBroadcastABTest()
  const deleteAb = useDeleteEmailBroadcastABTest()
  const dialogs = useDialogs()

  const updateDraft = (patch: Partial<Draft>) =>
    setDraft((d) => ({ ...d, ...patch }))

  const createMutation = useCreateEmailBroadcast(organization.id)
  const updateMutation = useUpdateEmailBroadcast()
  const scheduleMutation = useScheduleEmailBroadcast()
  const sendMutation = useSendEmailBroadcast()
  const sendTestMutation = useSendTestEmailBroadcast()

  const persisting =
    createMutation.isPending ||
    updateMutation.isPending ||
    scheduleMutation.isPending ||
    sendMutation.isPending

  // The send pipeline uses content_html, but the editor writes both fields so
  // the server can round-trip the document on edit and so the worker has
  // ready-to-send HTML.
  const renderedHtml = renderBlocksToHtml(draft.content_doc)

  const isReadyToSend =
    draft.subject.trim().length > 0 &&
    draft.sender_name.trim().length > 0 &&
    draft.content_doc.blocks.length > 0 &&
    renderedHtml.trim().length > 0

  const persistableUpdate = (): BroadcastWritePayload => ({
    subject: draft.subject,
    preview_text: draft.preview_text || null,
    sender_name: draft.sender_name,
    // Empty string → null so the server keeps its column-level default
    // instead of overwriting it with an invalid empty address.
    sender_email: draft.sender_email.trim() || null,
    reply_to_email: draft.reply_to_email || null,
    content_html: renderedHtml,
    content_json: draft.content_doc as unknown as Record<string, unknown>,
    segment_id: draft.segment_id,
    filter_rules: draft.filter_rules,
  })

  // Skip the round-trip when neither the draft nor the A/B config has
  // changed since the last persist (audit issue #38 / fix-list #38). Each
  // step transition used to fire a PATCH unconditionally — clicking
  // through Details → Content → Audience → Preview → Review issued four
  // empty saves.
  const lastPersistedSig = useRef<string | null>(null)
  const currentSig = (): string =>
    JSON.stringify({
      d: persistableUpdate(),
      ab:
        abDraft && abDraft.subject_b.trim().length > 0
          ? {
              s: abDraft.subject_b.trim(),
              p: abDraft.slice_pct,
              w: abDraft.decide_after_minutes,
              m: abDraft.winner_metric,
            }
          : null,
    })

  // Returns the persisted broadcast id (creates first if needed). When
  // `force` is false (the default) and nothing has changed since the last
  // successful persist, this returns the existing id without firing.
  const persist = async (
    options: { force?: boolean } = {},
  ): Promise<string | null> => {
    const sig = currentSig()
    if (
      !options.force &&
      broadcastId &&
      lastPersistedSig.current === sig
    ) {
      return broadcastId
    }
    let id = broadcastId
    if (id) {
      await updateMutation.mutateAsync({
        broadcastId: id,
        body: persistableUpdate(),
      })
    } else {
      if (!draft.subject.trim() || !draft.sender_name.trim()) return null
      const created = await createMutation.mutateAsync({
        subject: draft.subject,
        sender_name: draft.sender_name,
        sender_email: draft.sender_email.trim() || null,
        preview_text: draft.preview_text || null,
        reply_to_email: draft.reply_to_email || null,
        content_html: renderedHtml,
        content_json: draft.content_doc as unknown as Record<string, unknown>,
        segment_id: draft.segment_id,
        filter_rules: draft.filter_rules,
      })
      id = created.id
      onOpened?.(id)
    }

    // Sync the A/B test config alongside the broadcast.
    if (abDraft && abDraft.subject_b.trim().length > 0) {
      await upsertAb.mutateAsync({
        broadcastId: id,
        body: {
          subject_b: abDraft.subject_b.trim(),
          slice_pct: abDraft.slice_pct,
          decide_after_minutes: abDraft.decide_after_minutes,
          winner_metric: abDraft.winner_metric,
        },
      })
      hadServerAbRef.current = true
    } else if (hadServerAbRef.current && !abDraft) {
      await deleteAb.mutateAsync(id)
      hadServerAbRef.current = false
    }

    setSavedAt(new Date())
    lastPersistedSig.current = sig
    return id
  }

  const onSchedule = async (date: Date) => {
    const id = await persist()
    if (!id) return
    await scheduleMutation.mutateAsync({
      broadcastId: id,
      scheduledAt: date.toISOString(),
    })
    onBack()
  }

  const onSendNow = async () => {
    // Confirm BEFORE persisting (audit issue #24 / fix-list #33). The
    // previous order was persist → confirm: cancelling the dialog still
    // mutated the draft on the server, leaving the user with an
    // unintended save and a confusing edit history.
    const ok = await dialogs.confirm({
      title: 'Send now?',
      message: (
        <>
          Send <strong>{draft.subject || 'this broadcast'}</strong> to your
          audience now? This can&rsquo;t be undone.
        </>
      ),
      confirmLabel: 'Send now',
      tone: 'danger',
    })
    if (!ok) return
    const id = await persist()
    if (!id) return
    await sendMutation.mutateAsync(id)
    onBack()
  }

  return (
    <div className="fade-up" style={{ paddingBottom: 80 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 32,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button className="btn-icon" onClick={onBack} aria-label="Back">
            <Icon name="arrow-left" size={16} />
          </button>
          <div>
            <div className="eyebrow">
              {existing
                ? `${existing.status === 'scheduled' ? 'Scheduled' : 'Draft'} · ${isNew ? 'New' : 'Editing'}`
                : 'New broadcast · Draft'}
            </div>
            <h1 className="h1" style={{ marginTop: 6 }}>
              {draft.subject || 'Untitled broadcast'}
            </h1>
            {savedAt && (
              <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
                Saved {savedAt.toLocaleTimeString()}
              </div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost" onClick={() => setStep('preview')}>
            <Icon name="eye" size={15} />
            Preview
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => persist()}
            disabled={persisting}
          >
            {persisting ? 'Saving…' : 'Save draft'}
          </button>
          <button
            className="btn btn-primary"
            onClick={() => setStep('review')}
            disabled={!isReadyToSend}
            style={{ opacity: !isReadyToSend ? 0.5 : 1 }}
          >
            <Icon name="send" size={15} />
            Schedule send
          </button>
        </div>
      </div>

      <div
        style={{
          marginBottom: 24,
          display: 'flex',
          gap: 6,
          flexWrap: 'wrap',
        }}
      >
        <div className="tabs">
          {STEPS.map((s) => (
            <button
              key={s.id}
              onClick={() => setStep(s.id)}
              className={`tab ${step === s.id ? 'tab-active' : ''}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div>
          {step === 'details' && (
            <DetailsSection
              draft={draft}
              setDraft={updateDraft}
              abDraft={abDraft}
              setAbDraft={setAbDraft}
              organization={organization}
            />
          )}
          {step === 'content' && (
            <ContentSection
              draft={draft}
              setDraft={updateDraft}
              organization={organization}
            />
          )}
          {step === 'audience' && (
            <AudienceSection
              organization={organization}
              draft={draft}
              setDraft={updateDraft}
            />
          )}
          {step === 'preview' && (
            <PreviewSection
              draft={draft}
              broadcastId={broadcastId}
              persist={persist}
              sendTest={async (email) => {
                const id = await persist()
                if (!id) return
                await sendTestMutation.mutateAsync({
                  broadcastId: id,
                  email,
                })
              }}
              sending={sendTestMutation.isPending}
            />
          )}
          {step === 'review' && (
            <ReviewSection
              organization={organization}
              draft={draft}
              isReadyToSend={isReadyToSend}
              onSendNow={onSendNow}
              onSchedule={onSchedule}
              persisting={persisting}
            />
          )}

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginTop: 40,
              paddingTop: 24,
              borderTop: '1px solid var(--line)',
            }}
          >
            <button
              className="btn btn-ghost"
              onClick={() => {
                const i = STEPS.findIndex((s) => s.id === step)
                if (i > 0) setStep(STEPS[i - 1].id)
              }}
              disabled={step === 'details'}
              style={{ opacity: step === 'details' ? 0.4 : 1 }}
            >
              <Icon name="arrow-left" size={15} />
              Back
            </button>
            <button
              className="btn btn-primary"
              onClick={async () => {
                const i = STEPS.findIndex((s) => s.id === step)
                if (i < STEPS.length - 1) {
                  await persist()
                  setStep(STEPS[i + 1].id)
                }
              }}
              disabled={persisting}
            >
              Continue
              <Icon name="arrow-right" size={15} />
            </button>
          </div>
      </div>
    </div>
  )
}

const StudioOnlyPill = () => (
  <span
    style={{
      fontSize: 10,
      fontWeight: 600,
      letterSpacing: 0.4,
      color: '#3b82f6',
      background: '#eff6ff',
      padding: '2px 8px',
      borderRadius: 9999,
    }}
  >
    STUDIO
  </span>
)

const DetailsSection = ({
  draft,
  setDraft,
  abDraft,
  setAbDraft,
  organization,
}: {
  draft: Draft
  setDraft: (p: Partial<Draft>) => void
  abDraft: ABDraft | null
  setAbDraft: (next: ABDraft | null) => void
  organization: schemas['Organization']
}) => {
  const { hasFeature } = useEntitlements(organization.id)
  const abTestingUnlocked = hasFeature('email_ab_testing')

  return (
  <Section
    title="The basics"
    sub="Subject and preview text are the first — sometimes only — thing your readers see."
  >
    <div className="card" style={{ padding: 28 }}>
      <div style={{ marginBottom: 24 }}>
        <label className="label">Subject line</label>
        <input
          className="input"
          value={draft.subject}
          onChange={(e) => setDraft({ subject: e.target.value })}
          style={{ fontSize: 15 }}
          maxLength={255}
        />
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: 8,
            fontSize: 11.5,
            color: 'var(--ink-4)',
          }}
        >
          <span>{draft.subject.length}/255</span>
        </div>
      </div>
      <div style={{ marginBottom: 24 }}>
        <label className="label">Preview text</label>
        <input
          className="input"
          value={draft.preview_text}
          onChange={(e) => setDraft({ preview_text: e.target.value })}
          maxLength={150}
        />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <label className="label">Sender name</label>
          <input
            className="input"
            value={draft.sender_name}
            onChange={(e) => setDraft({ sender_name: e.target.value })}
            maxLength={100}
          />
        </div>
        <div>
          <label className="label">From address</label>
          <input
            className="input"
            type="email"
            value={draft.sender_email}
            onChange={(e) => setDraft({ sender_email: e.target.value })}
            placeholder="hi@yourdomain.com (optional)"
          />
          <div style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 4 }}>
            Leave blank to use your default notifications sender.
          </div>
        </div>
        <div>
          <label className="label">Reply-to email</label>
          <input
            className="input"
            type="email"
            value={draft.reply_to_email}
            onChange={(e) => setDraft({ reply_to_email: e.target.value })}
            placeholder="you@yourdomain.com"
          />
        </div>
      </div>
    </div>

    <div className="card" style={{ marginTop: 16, padding: 24 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: abDraft && abTestingUnlocked ? 24 : 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Icon name="flask" size={18} style={{ color: 'var(--ink-2)' }} />
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              Run an A/B test
              {!abTestingUnlocked && <StudioOnlyPill />}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>
              {abTestingUnlocked
                ? "Test subject lines on a slice of your audience first; we'll send the winner to the rest."
                : 'A/B testing is part of Studio and Scale. Upgrade to test subject lines on a slice of your audience.'}
            </div>
          </div>
        </div>
        {abTestingUnlocked ? (
          <Toggle
            on={abDraft !== null}
            onChange={(next) =>
              setAbDraft(next ? (abDraft ?? blankAb()) : null)
            }
          />
        ) : (
          <Link
            href={`/dashboard/${organization.slug}/settings/plan`}
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: 'white',
              background: '#000',
              padding: '6px 12px',
              borderRadius: 9999,
              textDecoration: 'none',
            }}
          >
            Upgrade to Studio
          </Link>
        )}
      </div>
      {abDraft && abTestingUnlocked && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <span
              style={{
                fontSize: 11.5,
                fontWeight: 600,
                width: 22,
                height: 22,
                borderRadius: '50%',
                background: 'var(--bg-softer)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--ink-2)',
              }}
            >
              A
            </span>
            {/* Variant A IS the broadcast's canonical subject — that's
                how the backend's A/B test reads it (`subject_b` is the
                only variant-specific column). Show it read-only here so
                users edit it in one place (the main Subject field above)
                and don't think they're authoring two independent fields
                that happen to share state. Audit issue #27 / fix-list #32:
                the previous implementation re-rendered an editable input
                that wrote back to draft.subject, making it look like a
                truly distinct variant when it wasn't. */}
            <div
              className="input"
              style={{
                background: 'var(--bg-softer)',
                color: draft.subject ? 'var(--ink)' : 'var(--ink-4)',
                cursor: 'default',
              }}
              aria-readonly="true"
              title="Variant A uses the broadcast's main subject above."
            >
              {draft.subject || 'Edit the subject above'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <span
              style={{
                fontSize: 11.5,
                fontWeight: 600,
                width: 22,
                height: 22,
                borderRadius: '50%',
                background: 'var(--bg-softer)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--ink-2)',
              }}
            >
              B
            </span>
            <input
              className="input"
              value={abDraft.subject_b}
              onChange={(e) =>
                setAbDraft({ ...abDraft, subject_b: e.target.value })
              }
              placeholder="Subject B"
              maxLength={255}
            />
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: 12,
              marginTop: 8,
              padding: 16,
              background: 'var(--bg-soft)',
              borderRadius: 10,
            }}
          >
            <div>
              <div className="label" style={{ marginBottom: 4 }}>
                Test slice
              </div>
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                }}
              >
                <input
                  className="input"
                  type="number"
                  min={5}
                  max={50}
                  value={abDraft.slice_pct}
                  onChange={(e) =>
                    setAbDraft({
                      ...abDraft,
                      slice_pct: Math.min(
                        50,
                        Math.max(5, Number(e.target.value) || 20),
                      ),
                    })
                  }
                  style={{ width: 80 }}
                />
                <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>%</span>
              </div>
            </div>
            <div>
              <div className="label" style={{ marginBottom: 4 }}>
                Decide after
              </div>
              <select
                className="select"
                value={abDraft.decide_after_minutes}
                onChange={(e) =>
                  setAbDraft({
                    ...abDraft,
                    decide_after_minutes: Number(e.target.value),
                  })
                }
              >
                <option value={60}>1 hour</option>
                <option value={240}>4 hours</option>
                <option value={720}>12 hours</option>
                <option value={1440}>1 day</option>
                <option value={4320}>3 days</option>
              </select>
            </div>
            <div>
              <div className="label" style={{ marginBottom: 4 }}>
                Winner by
              </div>
              <select
                className="select"
                value={abDraft.winner_metric}
                onChange={(e) =>
                  setAbDraft({
                    ...abDraft,
                    winner_metric: e.target.value as 'open_rate' | 'click_rate',
                  })
                }
              >
                <option value="open_rate">Open rate</option>
                <option value="click_rate">Click rate</option>
              </select>
            </div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
            Half of the {abDraft.slice_pct}% test slice gets subject A, the
            other half gets subject B. After {abDraft.decide_after_minutes}{' '}
            minutes the winner is sent to the rest of your audience.
          </div>
        </div>
      )}
    </div>
  </Section>
  )
}

const ContentSection = ({
  draft,
  setDraft,
  organization,
}: {
  draft: Draft
  setDraft: (p: Partial<Draft>) => void
  organization: schemas['Organization']
}) => {
  const uploadMutation = useUploadEmailImage(organization.id)
  // Wrap the mutation in a stable async function so the editor doesn't
  // reach into TanStack Query directly.
  const uploadImage = async (file: File): Promise<string> => {
    const result = await uploadMutation.mutateAsync(file)
    return result.url
  }
  return (
    <BroadcastEditor
      doc={draft.content_doc}
      setDoc={(next) => setDraft({ content_doc: next })}
      uploadImage={uploadImage}
      sender={{
        name: draft.sender_name || organization.name,
        email: draft.reply_to_email || '',
      }}
    />
  )
}

type AudienceMode = 'all' | 'segment' | 'filter'

const audienceMode = (draft: Draft): AudienceMode => {
  if (draft.filter_rules) return 'filter'
  if (draft.segment_id) return 'segment'
  return 'all'
}

const SOURCE_OPTIONS = [
  { value: 'space_signup', label: 'Newsletter form' },
  { value: 'purchase', label: 'Purchase' },
  { value: 'manual', label: 'Manual' },
  { value: 'import', label: 'CSV import' },
]

const AudienceSection = ({
  organization,
  draft,
  setDraft,
}: {
  organization: schemas['Organization']
  draft: Draft
  setDraft: (p: Partial<Draft>) => void
}) => {
  const segmentsQuery = useEmailSegments(organization.id)
  const subStatsQuery = useEmailSubscriberStats(organization.id)
  const segments = segmentsQuery.data ?? []
  const mode = audienceMode(draft)
  const totalActive = subStatsQuery.data?.active ?? 0

  const previewQuery = useSegmentFilterPreview(
    organization.id,
    draft.filter_rules,
    mode === 'filter',
  )

  const selectedSegment = segments.find((s) => s.id === draft.segment_id)
  const audienceCount =
    mode === 'all'
      ? totalActive
      : mode === 'segment'
        ? (selectedSegment?.subscriber_count ?? 0)
        : (previewQuery.data?.count ?? 0)
  const audiencePct =
    totalActive > 0 ? Math.round((audienceCount / totalActive) * 100) : 0

  const setFilterRules = (rules: FilterRule[] | null) => {
    if (rules === null) {
      setDraft({ filter_rules: null })
      return
    }
    setDraft({ filter_rules: { all: rules }, segment_id: null })
  }

  const rules = draft.filter_rules?.all ?? []

  return (
    <Section
      title="Who gets this?"
      sub="Send to your whole list, pick a saved segment, or build a filter."
    >
      <div className="card" style={{ padding: 8, marginBottom: 16 }}>
        <div className="tabs" style={{ width: '100%' }}>
          <button
            className={`tab ${mode === 'all' ? 'tab-active' : ''}`}
            onClick={() => setDraft({ segment_id: null, filter_rules: null })}
            style={{ flex: 1 }}
          >
            All active{' '}
            <span style={{ color: 'var(--ink-4)', marginLeft: 6 }}>
              {totalActive.toLocaleString()}
            </span>
          </button>
          <button
            className={`tab ${mode === 'segment' ? 'tab-active' : ''}`}
            onClick={() => {
              if (segments.length > 0)
                setDraft({
                  segment_id: segments[0].id,
                  filter_rules: null,
                })
            }}
            style={{ flex: 1 }}
            disabled={segments.length === 0}
            title={
              segments.length === 0
                ? 'No segments yet — create one from the segments area.'
                : undefined
            }
          >
            By segment
            <span style={{ color: 'var(--ink-4)', marginLeft: 6 }}>
              {segments.length}
            </span>
          </button>
          <button
            className={`tab ${mode === 'filter' ? 'tab-active' : ''}`}
            onClick={() =>
              setDraft({
                segment_id: null,
                filter_rules: draft.filter_rules ?? {
                  all: [{ field: 'source', op: 'is', value: 'space_signup' }],
                },
              })
            }
            style={{ flex: 1 }}
          >
            Custom segment
          </button>
          {/* The legacy "Upload list" tab was a permanently disabled dead
              affordance (audit issue #31 / fix-list #26). CSV import lives
              under Subscribers; we'll surface a deeper link in Phase 5
              instead of teasing a button that does nothing. */}
        </div>
      </div>

      {mode === 'segment' && (
        <div className="card" style={{ padding: 24, marginBottom: 16 }}>
          <label className="label">Pick a segment</label>
          <select
            className="select"
            value={draft.segment_id ?? ''}
            onChange={(e) =>
              setDraft({
                segment_id: e.target.value || null,
                filter_rules: null,
              })
            }
          >
            {segments.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.subscriber_count} subscribers
              </option>
            ))}
          </select>
        </div>
      )}

      {mode === 'filter' && (
        <div className="card" style={{ padding: 24, marginBottom: 16 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: 'var(--ink-2)',
              marginBottom: 16,
            }}
          >
            Subscribers who match all of:
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {rules.map((rule, i) => (
              <FilterRowEditor
                key={i}
                rule={rule}
                onChange={(next) => {
                  const copy = [...rules]
                  copy[i] = next
                  setFilterRules(copy)
                }}
                onRemove={() => {
                  const copy = rules.filter((_, j) => j !== i)
                  setFilterRules(copy.length ? copy : null)
                }}
              />
            ))}
          </div>
          <button
            className="btn btn-ghost btn-sm"
            style={{ marginTop: 14, color: 'var(--ink-2)' }}
            onClick={() =>
              setFilterRules([
                ...rules,
                { field: 'source', op: 'is', value: 'space_signup' },
              ])
            }
          >
            <Icon name="plus" size={13} />
            Add filter
          </button>
        </div>
      )}

      <div
        style={{
          padding: 18,
          background: 'var(--bg-soft)',
          borderRadius: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 4 }}>
            Estimated audience
          </div>
          <div
            style={{
              fontSize: 24,
              fontWeight: 600,
              letterSpacing: '-0.02em',
            }}
          >
            {mode === 'filter' && previewQuery.isFetching && !previewQuery.data
              ? '…'
              : audienceCount.toLocaleString()}{' '}
            subscribers
          </div>
        </div>
        <div
          style={{ fontSize: 12, color: 'var(--ink-3)', textAlign: 'right' }}
        >
          {mode === 'all'
            ? 'Everyone marked active.'
            : `≈ ${audiencePct}% of your list`}
          <br />
          updates live as your list grows
        </div>
      </div>

      {mode === 'filter' &&
        previewQuery.data &&
        previewQuery.data.sample.length > 0 && (
          <div
            className="card"
            style={{
              marginTop: 16,
              padding: '12px 18px',
              fontSize: 12.5,
              color: 'var(--ink-3)',
            }}
          >
            <div
              style={{
                marginBottom: 6,
                color: 'var(--ink-2)',
                fontWeight: 500,
              }}
            >
              Sample matches
            </div>
            {previewQuery.data.sample.slice(0, 5).map((s) => (
              <div key={s.id} style={{ padding: '2px 0' }}>
                {s.name ? `${s.name} · ` : ''}
                <span style={{ color: 'var(--ink-2)' }}>{s.email}</span>
              </div>
            ))}
          </div>
        )}
    </Section>
  )
}

const FILTER_FIELDS = [
  {
    field: 'source',
    label: 'Source',
    ops: [
      { op: 'is', label: 'is' },
      { op: 'is_not', label: 'is not' },
    ],
    valueKind: 'source' as const,
  },
  {
    field: 'subscribed_at',
    label: 'Subscribed',
    ops: [
      { op: 'within_days', label: 'in the last' },
      { op: 'more_than_days_ago', label: 'more than days ago' },
    ],
    valueKind: 'days' as const,
  },
  {
    field: 'last_opened_at',
    label: 'Last opened',
    ops: [
      { op: 'within_days', label: 'within' },
      { op: 'more_than_days_ago', label: 'more than days ago' },
      { op: 'never_opened', label: 'never opened' },
    ],
    valueKind: 'days' as const,
  },
]

const FilterRowEditor = ({
  rule,
  onChange,
  onRemove,
}: {
  rule: FilterRule
  onChange: (next: FilterRule) => void
  onRemove: () => void
}) => {
  const fieldDef =
    FILTER_FIELDS.find((f) => f.field === rule.field) ?? FILTER_FIELDS[0]
  const showValue = rule.op !== 'never_opened'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <select
        className="select"
        style={{ width: 160 }}
        value={rule.field}
        onChange={(e) => {
          const next = FILTER_FIELDS.find((f) => f.field === e.target.value)!
          onChange({
            field: next.field,
            op: next.ops[0].op,
            value: next.valueKind === 'days' ? 30 : 'space_signup',
          })
        }}
      >
        {FILTER_FIELDS.map((f) => (
          <option key={f.field} value={f.field}>
            {f.label}
          </option>
        ))}
      </select>
      <select
        className="select"
        style={{ width: 170 }}
        value={rule.op}
        onChange={(e) =>
          onChange({
            ...rule,
            op: e.target.value,
            value:
              e.target.value === 'never_opened'
                ? null
                : (rule.value ??
                  (fieldDef.valueKind === 'days' ? 30 : 'space_signup')),
          })
        }
      >
        {fieldDef.ops.map((o) => (
          <option key={o.op} value={o.op}>
            {o.label}
          </option>
        ))}
      </select>
      {showValue && fieldDef.valueKind === 'source' && (
        <select
          className="select"
          style={{ flex: 1 }}
          value={typeof rule.value === 'string' ? rule.value : ''}
          onChange={(e) => onChange({ ...rule, value: e.target.value })}
        >
          {SOURCE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
      {showValue && fieldDef.valueKind === 'days' && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flex: 1,
          }}
        >
          <input
            className="input"
            type="number"
            min={1}
            max={365}
            value={typeof rule.value === 'number' ? rule.value : 30}
            onChange={(e) =>
              onChange({ ...rule, value: Number(e.target.value) || 30 })
            }
            style={{ width: 100 }}
          />
          <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>days</span>
        </div>
      )}
      {!showValue && <div style={{ flex: 1 }} />}
      <button
        className="btn-ghost"
        style={{ padding: 8, borderRadius: 8 }}
        onClick={onRemove}
        aria-label="Remove filter"
      >
        <Icon name="trash" size={15} />
      </button>
    </div>
  )
}

const PreviewSection = ({
  draft,
  broadcastId,
  persist,
  sendTest,
  sending,
}: {
  draft: Draft
  broadcastId: string | null
  persist: () => Promise<string | null>
  sendTest: (email: string) => Promise<void>
  sending: boolean
}) => {
  const { currentUser } = useAuth()
  const [device, setDevice] = useState<'desktop' | 'mobile' | 'inbox'>(
    'desktop',
  )
  const [testEmail, setTestEmail] = useState(currentUser?.email ?? '')
  const [testSent, setTestSent] = useState<string | null>(null)
  const validEmail = /[^@\s]+@[^@\s]+\.[^@\s]+/.test(testEmail.trim())

  const submit = async () => {
    if (!validEmail) return
    await sendTest(testEmail.trim())
    setTestSent(testEmail.trim())
    setTimeout(() => setTestSent(null), 4000)
  }

  return (
    <Section
      title="Preview"
      sub="See what this looks like in the inbox and across devices."
    >
      <div className="card" style={{ padding: 0 }}>
        <div
          style={{
            padding: 16,
            borderBottom: '1px solid var(--line)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div className="tabs">
            <button
              className={`tab ${device === 'desktop' ? 'tab-active' : ''}`}
              onClick={() => setDevice('desktop')}
            >
              <Icon name="monitor" size={13} /> Desktop
            </button>
            <button
              className={`tab ${device === 'mobile' ? 'tab-active' : ''}`}
              onClick={() => setDevice('mobile')}
            >
              <Icon name="phone" size={13} /> Mobile
            </button>
            <button
              className={`tab ${device === 'inbox' ? 'tab-active' : ''}`}
              onClick={() => setDevice('inbox')}
            >
              <Icon name="mail" size={13} /> Inbox
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              className="input"
              type="email"
              placeholder="you@example.com"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              style={{ width: 240, height: 36 }}
            />
            <button
              className="btn btn-secondary btn-sm"
              onClick={submit}
              disabled={!validEmail || sending}
              style={{ opacity: !validEmail || sending ? 0.5 : 1 }}
              title={
                broadcastId
                  ? 'Send test'
                  : 'Saves a draft first, then sends a test render.'
              }
            >
              <Icon name="send" size={13} />
              {sending ? 'Sending…' : 'Send test'}
            </button>
          </div>
        </div>
        {testSent && (
          <div
            style={{
              padding: '10px 18px',
              background: 'var(--green-soft)',
              color: 'var(--green)',
              fontSize: 12.5,
              borderBottom: '1px solid var(--line)',
            }}
          >
            Test sent to {testSent}.
          </div>
        )}
        <div
          style={{
            padding: 40,
            background: 'var(--bg-soft)',
            display: 'flex',
            justifyContent: 'center',
            minHeight: 420,
          }}
        >
          {device === 'desktop' && <DesktopPreview draft={draft} />}
          {device === 'mobile' && <MobilePreview draft={draft} />}
          {device === 'inbox' && <InboxPreview draft={draft} />}
        </div>
      </div>
      {/* "Persist guard: Save current draft" debug button removed
          (audit issue #28 / fix-list #41) — that was a leftover
          developer affordance, not user-facing. Continue / Send /
          Schedule already trigger persistence. */}
    </Section>
  )
}

const SF_FONT =
  '-apple-system, BlinkMacSystemFont, "SF Pro", "Helvetica Neue", sans-serif'

// MacBook preview — lid + screen + base/hinge — to match the design's
// realistic desktop frame. Inside the screen we render a Mail.app window
// chrome (menu bar + traffic lights + email body).
//
// Wrapped in React.memo with a custom comparator (audit issue #22 / fix-
// list #60): the parent recreates `draft` on every keystroke, so default
// shallow compare wouldn't help. We compare only the fields the preview
// actually reads, so typing anywhere outside the email body (audience
// rules, segment id, filter rules, etc.) doesn't repaint the 200-line
// MacBook chrome.
const DesktopPreviewBase = ({ draft }: { draft: Draft }) => {
  const html = renderBlocksToHtml(draft.content_doc)
  const initials = draft.sender_name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}
    >
      <div
        style={{
          width: 720,
          padding: 14,
          background: 'linear-gradient(180deg, #2a2a2c 0%, #1a1a1c 100%)',
          borderRadius: '18px 18px 4px 4px',
          boxShadow:
            '0 30px 60px -20px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.08)',
          border: '1px solid #0a0a0c',
        }}
      >
        <div
          style={{ display: 'flex', justifyContent: 'center', marginBottom: 6 }}
        >
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: '#0a0a0a',
              boxShadow: 'inset 0 0 0 1px #2a2a2c',
            }}
          />
        </div>
        <div
          style={{
            background: '#f5f5f7',
            borderRadius: 4,
            overflow: 'hidden',
            border: '1px solid #000',
          }}
        >
          <div
            style={{
              height: 26,
              background: 'rgba(255,255,255,0.7)',
              backdropFilter: 'blur(20px)',
              borderBottom: '0.5px solid rgba(0,0,0,0.1)',
              display: 'flex',
              alignItems: 'center',
              padding: '0 12px',
              gap: 16,
              fontFamily: SF_FONT,
              fontSize: 12.5,
            }}
          >
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ fontWeight: 600 }}>Mail</span>
            </div>
            <span style={{ color: 'rgba(0,0,0,0.85)' }}>File</span>
            <span style={{ color: 'rgba(0,0,0,0.85)' }}>Edit</span>
            <span style={{ color: 'rgba(0,0,0,0.85)' }}>View</span>
            <span style={{ color: 'rgba(0,0,0,0.85)' }}>Mailbox</span>
            <span style={{ color: 'rgba(0,0,0,0.85)' }}>Message</span>
            <div style={{ flex: 1 }} />
            <span style={{ color: 'rgba(0,0,0,0.7)', fontSize: 12 }}>
              Tue 9:41 AM
            </span>
          </div>
          <div
            style={{
              background: '#ebebed',
              borderBottom: '0.5px solid rgba(0,0,0,0.08)',
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', gap: 6 }}>
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  background: '#ff5f57',
                }}
              />
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  background: '#febc2e',
                }}
              />
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  background: '#28c840',
                }}
              />
            </div>
            <div
              style={{
                flex: 1,
                textAlign: 'center',
                fontFamily: SF_FONT,
                fontSize: 12,
                fontWeight: 600,
                color: 'rgba(0,0,0,0.7)',
              }}
            >
              Inbox — {draft.reply_to_email || 'you@yourdomain.com'}
            </div>
            <div style={{ width: 60 }} />
          </div>
          <div
            style={{
              background: '#fff',
              padding: '22px 30px 28px',
              fontFamily: SF_FONT,
            }}
          >
            <div
              style={{
                display: 'flex',
                gap: 12,
                alignItems: 'flex-start',
                paddingBottom: 14,
                borderBottom: '0.5px solid rgba(60,60,67,0.18)',
                marginBottom: 18,
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  background: '#1d1d1f',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 13,
                  fontWeight: 600,
                  flexShrink: 0,
                }}
              >
                {initials}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: '#000',
                  }}
                >
                  {draft.sender_name}{' '}
                  {draft.reply_to_email && (
                    <span
                      style={{
                        fontWeight: 400,
                        color: 'rgba(60,60,67,0.6)',
                      }}
                    >
                      &lt;{draft.reply_to_email}&gt;
                    </span>
                  )}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: 'rgba(60,60,67,0.6)',
                    marginTop: 2,
                  }}
                >
                  to me · Today, 9:41 AM
                </div>
              </div>
              <div style={{ fontSize: 12, color: 'rgba(60,60,67,0.6)' }}>
                ↩ Reply
              </div>
            </div>
            <h3
              style={{
                fontSize: 22,
                fontWeight: 600,
                letterSpacing: '-0.02em',
                margin: '0 0 18px',
                color: '#000',
                lineHeight: 1.25,
              }}
            >
              {draft.subject || 'Untitled broadcast'}
            </h3>
            <div
              style={{ fontSize: 14, lineHeight: 1.65, color: '#000' }}
              dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(html) }}
            />
          </div>
        </div>
      </div>
      <div
        style={{
          width: 800,
          height: 14,
          background:
            'linear-gradient(180deg, #c5c5c8 0%, #9a9a9d 50%, #5a5a5d 100%)',
          borderRadius: '0 0 14px 14px',
          position: 'relative',
          boxShadow: '0 10px 20px -8px rgba(0,0,0,0.4)',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 100,
            height: 4,
            background: 'linear-gradient(180deg, #4a4a4c 0%, #6a6a6c 100%)',
            borderRadius: '0 0 6px 6px',
          }}
        />
      </div>
    </div>
  )
}

const draftPreviewFieldsEqual = (
  a: { draft: Draft },
  b: { draft: Draft },
): boolean =>
  a.draft.subject === b.draft.subject &&
  a.draft.preview_text === b.draft.preview_text &&
  a.draft.sender_name === b.draft.sender_name &&
  a.draft.sender_email === b.draft.sender_email &&
  a.draft.reply_to_email === b.draft.reply_to_email &&
  a.draft.content_doc === b.draft.content_doc

const DesktopPreview = memo(DesktopPreviewBase, draftPreviewFieldsEqual)

// iPhone-style preview — Dynamic Island + status bar + Mail app chrome.
// Same memoization story as DesktopPreview above.
const MobilePreviewBase = ({ draft }: { draft: Draft }) => {
  const html = renderBlocksToHtml(draft.content_doc)
  const initials = draft.sender_name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
  return (
    <div
      style={{
        width: 360,
        height: 720,
        background: '#000',
        borderRadius: 48,
        padding: 6,
        boxShadow:
          '0 30px 60px -20px rgba(0,0,0,0.45), inset 0 0 0 2px rgba(255,255,255,0.05)',
        position: 'relative',
      }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#fff',
          borderRadius: 42,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* Dynamic Island */}
        <div
          style={{
            position: 'absolute',
            top: 12,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 110,
            height: 32,
            background: '#000',
            borderRadius: 20,
            zIndex: 5,
          }}
        />
        {/* Status bar */}
        <div
          style={{
            position: 'absolute',
            top: 14,
            left: 0,
            right: 0,
            height: 28,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 28px',
            fontFamily: SF_FONT,
            fontSize: 14,
            fontWeight: 600,
            color: '#000',
            zIndex: 4,
          }}
        >
          <span>9:41</span>
          <span style={{ width: 110 }} />
          <span style={{ fontSize: 12 }}>● ● ●</span>
        </div>
        {/* Mail header */}
        <div
          style={{
            paddingTop: 56,
            paddingBottom: 8,
            background: '#fff',
            position: 'relative',
            zIndex: 1,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 16px',
              height: 44,
            }}
          >
            <span
              style={{ fontSize: 17, color: '#007aff', fontFamily: SF_FONT }}
            >
              ‹ Inbox
            </span>
            <div style={{ display: 'flex', gap: 18 }}>
              <span style={{ fontSize: 17, color: '#007aff' }}>⌃</span>
              <span style={{ fontSize: 17, color: '#007aff' }}>⌄</span>
            </div>
          </div>
        </div>
        {/* Email body */}
        <div
          style={{
            background: '#fff',
            padding: '14px 16px 24px',
            overflowY: 'auto',
            height: 'calc(100% - 110px)',
          }}
        >
          <h3
            style={{
              fontSize: 19,
              fontWeight: 600,
              margin: '0 0 12px',
              letterSpacing: '-0.01em',
              color: '#000',
              lineHeight: 1.25,
              fontFamily: SF_FONT,
            }}
          >
            {draft.subject || 'Untitled broadcast'}
          </h3>
          <div
            style={{
              display: 'flex',
              gap: 10,
              alignItems: 'center',
              marginBottom: 14,
              paddingBottom: 14,
              borderBottom: '0.5px solid rgba(60,60,67,0.18)',
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: '#1d1d1f',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 12,
                fontWeight: 600,
                fontFamily: SF_FONT,
              }}
            >
              {initials}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: '#000',
                  fontFamily: SF_FONT,
                }}
              >
                {draft.sender_name}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: 'rgba(60,60,67,0.6)',
                  fontFamily: SF_FONT,
                }}
              >
                to me · Today, 9:41 AM
              </div>
            </div>
          </div>
          <div
            style={{
              fontSize: 14,
              lineHeight: 1.55,
              color: '#000',
              fontFamily: SF_FONT,
            }}
            dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(html) }}
          />
        </div>
      </div>
    </div>
  )
}

const MobilePreview = memo(MobilePreviewBase, draftPreviewFieldsEqual)

const InboxPreview = ({ draft }: { draft: Draft }) => (
  <div
    style={{
      width: 560,
      background: '#fff',
      borderRadius: 10,
      border: '1px solid var(--line)',
      overflow: 'hidden',
    }}
  >
    {[1, 2, 3].map((i) => (
      <div
        key={i}
        style={{
          padding: '14px 18px',
          display: 'flex',
          gap: 14,
          alignItems: 'center',
          borderBottom: '1px solid var(--line)',
          opacity: i === 2 ? 1 : 0.45,
        }}
      >
        <div
          className="avatar"
          style={{ background: i === 2 ? '#1d1d1f' : '#86868b' }}
        >
          {i === 2
            ? draft.sender_name
                .split(' ')
                .map((p) => p[0])
                .join('')
                .slice(0, 2)
                .toUpperCase()
            : 'XX'}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: 2,
            }}
          >
            <span style={{ fontSize: 13, fontWeight: i === 2 ? 600 : 500 }}>
              {i === 2 ? draft.sender_name : 'Other sender'}
            </span>
            <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>
              {i === 2 ? '8:01 AM' : 'Yesterday'}
            </span>
          </div>
          <div
            style={{
              fontSize: 13,
              fontWeight: i === 2 ? 500 : 400,
              marginBottom: 2,
            }}
          >
            {i === 2 ? draft.subject || 'Untitled broadcast' : '—'}
          </div>
          <div
            style={{
              fontSize: 12,
              color: 'var(--ink-3)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {i === 2 ? draft.preview_text || '—' : '—'}
          </div>
        </div>
      </div>
    ))}
  </div>
)

const ReviewSection = ({
  organization,
  draft,
  isReadyToSend,
  onSendNow,
  onSchedule,
  persisting,
}: {
  organization: schemas['Organization']
  draft: Draft
  isReadyToSend: boolean
  onSendNow: () => Promise<void>
  onSchedule: (date: Date) => Promise<void>
  persisting: boolean
}) => {
  const [scheduleType, setScheduleType] = useState<
    'now' | 'optimal' | 'custom'
  >('optimal')
  // Pull the engagement heatmap (~90 days). When sample_size clears
  // MIN_HEATMAP_SAMPLE we use the highest-engagement (dow, hour) cell;
  // otherwise we fall back to a Tuesday-9am default and the option
  // copy says so explicitly so the user knows it's not ML-derived.
  const heatmapQuery = useBroadcastEngagementHeatmap(organization.id, 90)
  const optimal = useMemo(
    () => computeOptimalTime(heatmapQuery.data),
    [heatmapQuery.data],
  )
  const [customWhen, setCustomWhen] = useState(() =>
    toLocalDateTimeInputValue(optimal.date),
  )
  const [customMin] = useState(() =>
    toLocalDateTimeInputValue(new Date(Date.now() + 5 * 60_000)),
  )
  const subStatsQuery = useEmailSubscriberStats(organization.id)
  const segmentsQuery = useEmailSegments(organization.id)
  const dialogs = useDialogs()
  const segment = (segmentsQuery.data ?? []).find(
    (s) => s.id === draft.segment_id,
  )
  const filterPreviewQuery = useSegmentFilterPreview(
    organization.id,
    draft.filter_rules,
    !!draft.filter_rules,
  )
  const audienceCount = draft.filter_rules
    ? (filterPreviewQuery.data?.count ?? 0)
    : draft.segment_id
      ? (segment?.subscriber_count ?? 0)
      : (subStatsQuery.data?.active ?? 0)
  const audienceLabel = draft.filter_rules
    ? 'Custom segment'
    : segment
      ? segment.name
      : null

  const fmtFull = (d: Date) =>
    d.toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })

  const onConfirm = async () => {
    if (!isReadyToSend) return
    if (scheduleType === 'now') return onSendNow()
    if (scheduleType === 'optimal') return onSchedule(optimal.date)
    const date = new Date(customWhen)
    if (Number.isNaN(date.getTime())) {
      await dialogs.alert({
        title: 'Invalid date',
        message: "We couldn't read that date. Please pick another.",
      })
      return
    }
    if (date.getTime() <= Date.now()) {
      await dialogs.alert({
        title: 'Pick a future time',
        message: 'Scheduled sends have to be at least one minute in the future.',
      })
      return
    }
    return onSchedule(date)
  }

  return (
    <Section
      title="Review & send"
      sub="Last look. Ship it now, schedule it, or pick the time most likely to be opened."
    >
      <div className="card" style={{ padding: 28, marginBottom: 16 }}>
        <h3 className="h3" style={{ marginBottom: 18 }}>
          Schedule
        </h3>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 12,
          }}
        >
          <ScheduleOption
            id="now"
            current={scheduleType}
            onClick={setScheduleType}
            icon="send"
            title="Send now"
            sub="Immediately"
          />
          <ScheduleOption
            id="optimal"
            current={scheduleType}
            onClick={setScheduleType}
            icon="sparkles"
            title={
              optimal.source === 'heatmap'
                ? 'Optimal time'
                : 'Suggested time'
            }
            sub={
              optimal.source === 'heatmap'
                ? fmtFull(optimal.date)
                : `${fmtFull(optimal.date)} · default until you have more sends`
            }
          />
          <ScheduleOption
            id="custom"
            current={scheduleType}
            onClick={setScheduleType}
            icon="calendar"
            title="Pick a time"
            sub="Choose date & time"
          />
        </div>
        {scheduleType === 'custom' && (
          <div style={{ marginTop: 16 }}>
            <label className="label">Send at (your timezone)</label>
            <input
              type="datetime-local"
              className="input"
              value={customWhen}
              min={customMin}
              onChange={(e) => setCustomWhen(e.target.value)}
            />
          </div>
        )}
      </div>

      <div className="card" style={{ padding: 28, marginBottom: 24 }}>
        <h3 className="h3" style={{ marginBottom: 18 }}>
          Summary
        </h3>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 24,
          }}
        >
          <KV
            k="From"
            v={`${draft.sender_name}${draft.reply_to_email ? ` <${draft.reply_to_email}>` : ''}`}
          />
          <KV
            k="Audience"
            v={`${audienceCount.toLocaleString()} subscribers${audienceLabel ? ` · ${audienceLabel}` : ''}`}
          />
          <KV k="Subject" v={draft.subject || '—'} />
          <KV k="Preview" v={draft.preview_text || '—'} />
          <KV
            k="Delivery"
            v={
              scheduleType === 'now'
                ? 'Right away'
                : scheduleType === 'optimal'
                  ? `${fmtFull(optimal.date)} (${
                      optimal.source === 'heatmap' ? 'optimal' : 'suggested'
                    })`
                  : customWhen
                    ? fmtFull(new Date(customWhen))
                    : '—'
            }
          />
          <KV k="Estimated cost" v="Included in plan" />
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <button
          className="btn btn-primary btn-lg"
          onClick={onConfirm}
          disabled={!isReadyToSend || persisting}
          style={{ opacity: !isReadyToSend || persisting ? 0.5 : 1 }}
        >
          <Icon name={scheduleType === 'now' ? 'send' : 'calendar'} size={15} />
          {scheduleType === 'now'
            ? persisting
              ? 'Sending…'
              : `Send to ${audienceCount.toLocaleString()}`
            : persisting
              ? 'Scheduling…'
              : 'Confirm & schedule'}
        </button>
      </div>
    </Section>
  )
}

const ScheduleOption = ({
  id,
  current,
  onClick,
  icon,
  title,
  sub,
}: {
  id: 'now' | 'optimal' | 'custom'
  current: 'now' | 'optimal' | 'custom'
  onClick: (id: 'now' | 'optimal' | 'custom') => void
  icon: string
  title: string
  sub: string
}) => {
  const active = current === id
  return (
    <button
      onClick={() => onClick(id)}
      className="card"
      style={{
        padding: 18,
        textAlign: 'left',
        borderColor: active ? 'var(--indigo)' : 'var(--line)',
        borderWidth: active ? 2 : 1,
        background: active ? 'var(--indigo-soft)' : '#fff',
        boxShadow: active ? '0 8px 24px -10px rgba(99,91,255,0.25)' : 'none',
        transition: 'all 0.15s',
      }}
    >
      <Icon
        name={icon}
        size={18}
        style={{
          color: active ? 'var(--indigo-2)' : 'var(--ink-2)',
          marginBottom: 12,
        }}
      />
      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)' }}>
        {title}
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 4 }}>
        {sub}
      </div>
    </button>
  )
}

export const NewBroadcastRoute = ({
  organization,
  broadcastId,
}: {
  organization: schemas['Organization']
  broadcastId: string | null
}) => {
  const router = useRouter()
  const searchParams = useSearchParams()
  const base = `/dashboard/${organization.slug}/email-marketing/broadcasts`
  // Return to the Space Broadcast tab when launched from there (?returnTo=),
  // otherwise back to the marketing broadcasts list.
  const exitTo = searchParams.get('returnTo') || base
  return (
    <NewBroadcastScreen
      organization={organization}
      broadcastId={broadcastId}
      onBack={() => router.push(exitTo)}
      // When the user starts a fresh draft and the API hands back the new
      // broadcast id, swap the URL to /broadcasts/<id>/edit so refresh and
      // share work afterwards.
      onOpened={(id) => {
        if (broadcastId !== id) {
          router.replace(`${base}/${id}/edit`)
        }
      }}
    />
  )
}
