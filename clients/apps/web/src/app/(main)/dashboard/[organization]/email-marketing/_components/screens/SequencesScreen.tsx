'use client'

import { FeatureGate } from '@/components/Entitlements/FeatureGate'
import {
  SequenceTemplate,
  useCreateSequenceFromTemplate,
  useDeleteEmailSequence,
  useDuplicateEmailSequence,
  useEmailSequenceTemplates,
  useEmailSequences,
  useUpdateEmailSequence,
} from '@/hooks/queries/emailMarketing'
import { schemas } from '@spaire/client'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { ActionMenu } from '../ActionMenu'
import { useDialogs } from '../dialogs'
import { StepNode } from '../flow'
import { Icon } from '../Icon'
import { Modal } from '../Modal'
import { SequenceFlowPreview } from '../SequenceFlowPreview'
import { MetricTile, Stat } from '../shared'

type Sequence = {
  id: string
  organization_id: string
  name: string
  description: string | null
  trigger_type: string
  trigger_config: Record<string, unknown>
  status: 'draft' | 'active' | 'paused'
  step_count: number
  enrollment_count: number
  created_at: string
}

const TRIGGER_LABEL: Record<string, string> = {
  on_subscribe: 'On subscribe',
  on_purchase: 'On purchase',
  on_subscription_created: 'Subscription started',
  on_subscription_cancelled: 'Subscription cancelled',
  on_form_submit: 'Tag added',
  manual: 'Manual',
}

const TEMPLATE_CATEGORIES: { id: string; label: string }[] = [
  { id: 'all', label: 'All templates' },
  { id: 'Course', label: 'Onboarding' },
  { id: 'Launch', label: 'Sales & launch' },
  { id: 'Audience', label: 'Audience' },
  { id: 'Commerce', label: 'Commerce' },
  { id: 'Customer', label: 'Customer' },
  { id: 'Retention', label: 'Retention' },
  { id: 'Conversion', label: 'Conversion' },
]

export const SequencesScreen = ({
  organization,
  onNew,
  onEdit,
}: {
  organization: schemas['Organization']
  onNew: () => void
  onEdit: (sequenceId: string) => void
}) => {
  const [view, setView] = useState<'mine' | 'templates'>('mine')
  const sequencesQuery = useEmailSequences(organization.id, { limit: 100 })
  const sequences: Sequence[] = sequencesQuery.data?.items ?? []

  const totalEnrolled = sequences.reduce(
    (acc, s) => acc + (s.enrollment_count ?? 0),
    0,
  )
  const activeCount = sequences.filter((s) => s.status === 'active').length
  const totalEmails = sequences.reduce((acc, s) => acc + (s.step_count ?? 0), 0)
  const draftCount = sequences.filter((s) => s.status === 'draft').length

  return (
    <div className="fade-up">
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          marginBottom: 40,
        }}
      >
        <div>
          <div className="eyebrow" style={{ marginBottom: 12 }}>
            Automations
          </div>
          <h1 className="h-display">Sequences</h1>
          <p
            className="muted"
            style={{ fontSize: 15, marginTop: 12, maxWidth: 560 }}
          >
            Automated email series triggered by what subscribers do — joining
            your list, buying a course, finishing a lesson.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setView('templates')}
          >
            <Icon name="grid" size={15} />
            Browse templates
          </button>
          <button type="button" className="btn btn-primary" onClick={onNew}>
            <Icon name="plus" size={15} />
            New sequence
          </button>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 16,
          marginBottom: 56,
        }}
      >
        <MetricTile
          value={String(activeCount)}
          label="Active sequences"
          delta={String(sequences.length)}
          deltaLabel="total"
          subtle
        />
        <MetricTile
          value={totalEnrolled.toLocaleString()}
          label="Total enrolled"
          delta=""
          deltaLabel="across all sequences"
        />
        <MetricTile
          value={String(totalEmails)}
          label="Total emails"
          delta=""
          deltaLabel="across all sequences"
        />
        <MetricTile
          value={String(draftCount)}
          label="Drafts"
          delta=""
          deltaLabel="not yet active"
        />
      </div>

      <div className="tabs" style={{ marginBottom: 24 }}>
        <button
          type="button"
          className={`tab ${view === 'mine' ? 'tab-active' : ''}`}
          onClick={() => setView('mine')}
        >
          Your sequences
        </button>
        <button
          type="button"
          className={`tab ${view === 'templates' ? 'tab-active' : ''}`}
          onClick={() => setView('templates')}
        >
          Templates
        </button>
      </div>

      {view === 'mine' ? (
        <MySequences
          sequences={sequences}
          isLoading={sequencesQuery.isLoading}
          onEdit={onEdit}
          onNew={onNew}
        />
      ) : (
        <TemplateGallery
          organization={organization}
          onCreated={(id) => onEdit(id)}
        />
      )}
    </div>
  )
}

const MySequences = ({
  sequences,
  isLoading,
  onEdit,
  onNew,
}: {
  sequences: Sequence[]
  isLoading: boolean
  onEdit: (id: string) => void
  onNew: () => void
}) => {
  const updateMutation = useUpdateEmailSequence()
  const dialogs = useDialogs()
  const duplicateMutation = useDuplicateEmailSequence()
  const deleteMutation = useDeleteEmailSequence()

  if (isLoading) {
    return (
      <div
        className="card"
        style={{ padding: 40, textAlign: 'center', color: 'var(--ink-3)' }}
      >
        Loading…
      </div>
    )
  }

  if (sequences.length === 0) {
    return (
      <div className="card" style={{ padding: 60, textAlign: 'center' }}>
        <div style={{ fontSize: 16, color: 'var(--ink)', marginBottom: 8 }}>
          No sequences yet
        </div>
        <div style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 18 }}>
          Build a multi-step automation, or start from a proven template.
        </div>
        <button type="button" className="btn btn-primary" onClick={onNew}>
          <Icon name="plus" size={14} />
          New sequence
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {sequences.map((s) => {
        const active = s.status === 'active'
        const paused = s.status === 'paused'
        const trigger = TRIGGER_LABEL[s.trigger_type] ?? s.trigger_type

        const setStatus = (status: 'active' | 'paused' | 'draft') =>
          updateMutation.mutate({ sequenceId: s.id, status })

        return (
          <div
            key={s.id}
            className="card"
            style={{
              padding: 24,
              display: 'grid',
              gridTemplateColumns: '1fr 140px 140px 140px 40px',
              gap: 24,
              alignItems: 'center',
              cursor: 'pointer',
            }}
            onClick={() => onEdit(s.id)}
          >
            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  marginBottom: 6,
                }}
              >
                {active ? (
                  <span className="chip chip-success">
                    <span className="dot" />
                    Active
                  </span>
                ) : paused ? (
                  <span className="chip">
                    <span
                      className="dot"
                      style={{ background: 'var(--ink-4)' }}
                    />
                    Paused
                  </span>
                ) : (
                  <span className="chip">
                    <span
                      className="dot"
                      style={{ background: 'var(--ink-4)' }}
                    />
                    Draft
                  </span>
                )}
                <span className="chip">{trigger}</span>
                <span className="chip">{s.step_count} emails</span>
              </div>
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 500,
                  color: 'var(--ink)',
                  letterSpacing: '-0.01em',
                }}
              >
                {s.name}
              </div>
              {s.description && (
                <div
                  style={{
                    fontSize: 12.5,
                    color: 'var(--ink-3)',
                    marginTop: 4,
                  }}
                >
                  {s.description}
                </div>
              )}
            </div>
            <Stat
              label="Enrolled"
              value={(s.enrollment_count ?? 0).toLocaleString()}
            />
            <Stat label="Steps" value={String(s.step_count)} />
            <Stat
              label="Status"
              value={active ? 'Running' : paused ? 'Paused' : 'Draft'}
            />
            <div onClick={(e) => e.stopPropagation()}>
              <ActionMenu
                items={[
                  { label: 'Edit', icon: 'edit', onClick: () => onEdit(s.id) },
                  {
                    label: 'Activate',
                    icon: 'play',
                    hidden: active,
                    onClick: () => setStatus('active'),
                  },
                  {
                    label: 'Pause',
                    icon: 'x-circle',
                    hidden: !active,
                    onClick: () => setStatus('paused'),
                  },
                  {
                    label: 'Duplicate',
                    icon: 'copy',
                    onClick: () => duplicateMutation.mutate(s.id),
                  },
                  {
                    label: 'Archive',
                    icon: 'trash',
                    destructive: true,
                    onClick: async () => {
                      const ok = await dialogs.confirm({
                        title: 'Archive sequence?',
                        message: (
                          <>
                            Archive <strong>{s.name}</strong>? Active
                            enrolments will stop receiving emails.
                          </>
                        ),
                        confirmLabel: 'Archive',
                        tone: 'danger',
                      })
                      if (ok) deleteMutation.mutate(s.id)
                    },
                  },
                ]}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

const TemplateGallery = ({
  organization,
  onCreated,
}: {
  organization: schemas['Organization']
  onCreated: (sequenceId: string) => void
}) => {
  const templatesQuery = useEmailSequenceTemplates()
  const fromTemplate = useCreateSequenceFromTemplate(organization.id)
  const templates = templatesQuery.data ?? []

  const [cat, setCat] = useState<string>('all')
  const [q, setQ] = useState<string>('')
  const [previewSlug, setPreviewSlug] = useState<string | null>(null)
  const previewing = previewSlug
    ? (templates.find((t) => t.slug === previewSlug) ?? null)
    : null

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    return templates.filter((t) => {
      if (cat !== 'all' && t.category !== cat) return false
      if (term && !`${t.name} ${t.description}`.toLowerCase().includes(term))
        return false
      return true
    })
  }, [templates, cat, q])

  const featured = templates[0]

  const onUse = async (slug: string) => {
    const created = await fromTemplate.mutateAsync({ slug })
    if (created?.id) onCreated(created.id)
  }

  // Estimate "days" from step_count for display only (real days will live
  // in the template payload once the backend extends the registry shape).
  const estimateDays = (stepCount: number) => Math.max(2, stepCount * 2)

  if (templatesQuery.isLoading || !featured) {
    return (
      <div
        className="card"
        style={{ padding: 40, textAlign: 'center', color: 'var(--ink-3)' }}
      >
        Loading templates…
      </div>
    )
  }

  return (
    <div>
      {/* Featured hero */}
      <div
        className="card"
        style={{
          padding: 0,
          marginBottom: 28,
          overflow: 'hidden',
          background: 'linear-gradient(135deg, #1d1d1f 0%, #312e81 100%)',
          borderColor: 'transparent',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.2fr 1fr',
            gap: 0,
          }}
        >
          <div style={{ padding: '36px 36px 36px 40px', color: '#fff' }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: '#2997ff',
                marginBottom: 18,
              }}
            >
              <Icon
                name="sparkles"
                size={11}
                style={{ verticalAlign: '-1px', marginRight: 6 }}
              />
              {/* Audit issue #41 / fix-list #41: the previous label
                  was "Most-used template" but the hero card simply
                  picked templates[0]. Until template usage is tracked
                  on the backend (a `template_slug` column on
                  email_sequences would let us COUNT(*) GROUP BY), call
                  it "Featured template" so the copy isn't a lie. */}
              Featured template
            </div>
            <div
              style={{
                fontSize: 32,
                fontWeight: 400,
                letterSpacing: '-0.02em',
                lineHeight: 1.15,
              }}
            >
              {featured.name}
            </div>
            <div
              style={{
                fontSize: 14,
                color: 'rgba(255,255,255,0.75)',
                marginTop: 14,
                lineHeight: 1.6,
                maxWidth: 440,
              }}
            >
              {featured.description}
            </div>
            <div
              style={{
                display: 'flex',
                gap: 16,
                marginTop: 22,
                fontSize: 12.5,
                color: 'rgba(255,255,255,0.7)',
              }}
            >
              <span>
                <strong style={{ color: '#fff', fontWeight: 500 }}>
                  {featured.step_count}
                </strong>{' '}
                emails
              </span>
              <span style={{ opacity: 0.4 }}>·</span>
              <span>
                <strong style={{ color: '#fff', fontWeight: 500 }}>
                  {estimateDays(featured.step_count)}
                </strong>{' '}
                days
              </span>
              <span style={{ opacity: 0.4 }}>·</span>
              <span>
                Trigger:{' '}
                <strong style={{ color: '#fff', fontWeight: 500 }}>
                  {TRIGGER_LABEL[featured.trigger_type] ??
                    featured.trigger_type}
                </strong>
              </span>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 26 }}>
              <button
                type="button"
                className="btn"
                style={{ background: '#fff', color: 'var(--ink)' }}
                onClick={() => onUse(featured.slug)}
              >
                <Icon name="plus" size={13} />
                Use this template
              </button>
              <button
                type="button"
                className="btn"
                style={{
                  background: 'transparent',
                  color: '#fff',
                  border: '1px solid rgba(255,255,255,0.25)',
                }}
                onClick={() => setPreviewSlug(featured.slug)}
              >
                Preview flow
              </button>
            </div>
          </div>
          <div
            style={{
              padding: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <FlowMiniature dark />
          </div>
        </div>
      </div>

      {/* Category chips + search */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 20,
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {TEMPLATE_CATEGORIES.map((c) => {
            const count =
              c.id === 'all'
                ? templates.length
                : templates.filter((t) => t.category === c.id).length
            if (c.id !== 'all' && count === 0) return null
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setCat(c.id)}
                className={cat === c.id ? 'chip chip-dark' : 'chip'}
                style={{
                  cursor: 'pointer',
                  padding: '7px 14px',
                  fontSize: 12.5,
                }}
              >
                {c.label}
                <span
                  style={{
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: 10.5,
                    opacity: 0.7,
                    marginLeft: 4,
                  }}
                >
                  {count}
                </span>
              </button>
            )
          })}
        </div>
        <div style={{ position: 'relative', width: 240 }}>
          <input
            className="input"
            placeholder="Search templates…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ paddingLeft: 36, fontSize: 13 }}
          />
          <div
            style={{
              position: 'absolute',
              left: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--ink-4)',
            }}
          >
            <Icon name="search" size={14} />
          </div>
        </div>
      </div>

      {/* Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 16,
        }}
      >
        {filtered.map((t) => (
          <TemplateCard
            key={t.slug}
            t={t}
            estimatedDays={estimateDays(t.step_count)}
            onUse={() => onUse(t.slug)}
            onPreview={() => setPreviewSlug(t.slug)}
            busy={fromTemplate.isPending}
          />
        ))}
      </div>

      {previewing && (
        <Modal
          open
          onClose={() => setPreviewSlug(null)}
          title={`Preview · ${previewing.name}`}
          width={920}
        >
          <TemplatePreview
            template={previewing}
            onUse={async () => {
              setPreviewSlug(null)
              await onUse(previewing.slug)
            }}
            busy={fromTemplate.isPending}
          />
        </Modal>
      )}
    </div>
  )
}

const TemplatePreview = ({
  template,
  onUse,
  busy,
}: {
  template: SequenceTemplate
  onUse: () => void
  busy: boolean
}) => {
  // Coerce the template's flow_doc into the StepNode shape the preview
  // renderer expects. The doc shipped from the backend matches the same
  // shape the editor authors, so this is a structural cast.
  const steps = (template.flow_doc?.steps ?? []) as unknown as StepNode[]
  if (steps.length === 0) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink-3)' }}>
        This template has no flow preview yet.
      </div>
    )
  }
  return (
    <div>
      <div
        style={{
          maxHeight: '70vh',
          overflowY: 'auto',
          padding: '4px 4px 0',
        }}
      >
        <SequenceFlowPreview
          steps={steps}
          name={template.name}
          trigger={template.trigger_type}
          onBack={() => {}}
          onEdit={() => {}}
          compact
        />
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 10,
          marginTop: 16,
          paddingTop: 14,
          borderTop: '1px solid var(--line)',
        }}
      >
        <button
          type="button"
          className="btn btn-primary"
          onClick={onUse}
          disabled={busy}
        >
          {busy ? 'Creating…' : 'Use this template'}
        </button>
      </div>
    </div>
  )
}

const CATEGORY_ICON: Record<string, string> = {
  Course: 'book',
  Launch: 'package',
  Audience: 'mic',
  Commerce: 'shopping-cart',
  Customer: 'gift',
  Retention: 'rotate',
  Conversion: 'sparkles',
}

const CATEGORY_COLOR: Record<string, string> = {
  Course: '#1d1d1f',
  Launch: '#0066CC',
  Audience: '#7B5BFF',
  Commerce: '#FF6B35',
  Customer: '#1A7A3E',
  Retention: '#D6336C',
  Conversion: '#5856D6',
}

const TemplateCard = ({
  t,
  estimatedDays,
  onUse,
  onPreview,
  busy,
}: {
  t: SequenceTemplate
  estimatedDays: number
  onUse: () => void
  onPreview: () => void
  busy: boolean
}) => {
  const [hover, setHover] = useState(false)
  const icon = CATEGORY_ICON[t.category] ?? 'sparkles'
  const color = CATEGORY_COLOR[t.category] ?? '#1d1d1f'
  return (
    <div
      className="card"
      onClick={onPreview}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: 0,
        overflow: 'hidden',
        transition: 'all 0.18s',
        cursor: busy ? 'wait' : 'pointer',
        transform: hover ? 'translateY(-2px)' : 'none',
        boxShadow: hover ? 'var(--shadow-md)' : '0 1px 2px rgba(15,23,42,0.04)',
        borderColor: hover ? 'var(--line-2)' : 'var(--line)',
        display: 'flex',
        flexDirection: 'column',
        opacity: busy ? 0.6 : 1,
      }}
    >
      <div
        style={{
          background: '#fafafa',
          borderBottom: '1px solid var(--line)',
          height: 132,
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <FlowMiniature accent={color} />
      </div>
      <div
        style={{
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
            marginBottom: 10,
          }}
        >
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 9,
              background: color,
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Icon name={icon} size={15} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 14.5,
                fontWeight: 500,
                color: 'var(--ink)',
                letterSpacing: '-0.01em',
                lineHeight: 1.3,
              }}
            >
              {t.name}
            </div>
            <div
              style={{
                fontSize: 11,
                color: 'var(--ink-3)',
                marginTop: 4,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              {t.category}
            </div>
          </div>
        </div>
        <div
          style={{
            fontSize: 12.5,
            color: 'var(--ink-3)',
            lineHeight: 1.55,
            flex: 1,
          }}
        >
          {t.description}
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginTop: 16,
            paddingTop: 14,
            borderTop: '1px solid var(--line)',
            fontSize: 11.5,
            color: 'var(--ink-3)',
          }}
        >
          <span>
            <Icon
              name="mail"
              size={11}
              style={{ verticalAlign: '-2px', marginRight: 4 }}
            />
            <strong style={{ color: 'var(--ink-2)', fontWeight: 500 }}>
              {t.step_count}
            </strong>{' '}
            emails
          </span>
          <span>
            <Icon
              name="clock"
              size={11}
              style={{ verticalAlign: '-2px', marginRight: 4 }}
            />
            <strong style={{ color: 'var(--ink-2)', fontWeight: 500 }}>
              {estimatedDays}
            </strong>{' '}
            days
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onPreview()
            }}
            className="btn btn-ghost btn-sm"
            style={{ marginLeft: 'auto', padding: '5px 9px' }}
          >
            <Icon name="eye" size={11} />
            Preview
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={(e) => {
              e.stopPropagation()
              onUse()
            }}
            className="btn btn-secondary btn-sm"
            style={{ padding: '5px 11px' }}
          >
            {busy ? 'Creating…' : 'Use'}
            <Icon name="arrow-right" size={10} />
          </button>
        </div>
      </div>
    </div>
  )
}

// — Tiny SVG flow miniature: trigger pill → email → wait → branch with two paths
const FlowMiniature = ({
  dark,
  accent,
}: {
  dark?: boolean
  accent?: string
}) => {
  const stroke = dark ? 'rgba(255,255,255,0.4)' : 'var(--indigo-line)'
  const cardBg = dark ? 'rgba(255,255,255,0.08)' : '#fff'
  const cardBorder = dark ? 'rgba(255,255,255,0.18)' : 'var(--line)'
  const ink = dark ? '#fff' : 'var(--ink)'
  const accentColor = accent || (dark ? '#2997ff' : 'var(--indigo)')
  return (
    <svg
      viewBox="0 0 280 200"
      width="100%"
      height="100%"
      style={{
        maxWidth: dark ? 360 : 240,
        maxHeight: dark ? 240 : 132,
      }}
    >
      <path
        d="M140 22 V 50"
        stroke={stroke}
        strokeWidth="1.5"
        strokeDasharray="3 3"
        fill="none"
      />
      <path
        d="M140 88 V 116"
        stroke={stroke}
        strokeWidth="1.5"
        strokeDasharray="3 3"
        fill="none"
      />
      <path
        d="M140 142 L 80 164"
        stroke={stroke}
        strokeWidth="1.5"
        strokeDasharray="3 3"
        fill="none"
      />
      <path
        d="M140 142 L 200 164"
        stroke={stroke}
        strokeWidth="1.5"
        strokeDasharray="3 3"
        fill="none"
      />
      <rect
        x="100"
        y="6"
        width="80"
        height="18"
        rx="9"
        fill={dark ? '#fff' : 'var(--ink)'}
      />
      <circle cx="113" cy="15" r="3" fill={dark ? 'var(--ink)' : '#fff'} />
      <rect
        x="120"
        y="12"
        width="50"
        height="3"
        rx="1.5"
        fill={dark ? 'var(--ink)' : 'rgba(255,255,255,0.85)'}
      />
      <rect
        x="120"
        y="17"
        width="34"
        height="2"
        rx="1"
        fill={dark ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.55)'}
      />
      <rect
        x="80"
        y="50"
        width="120"
        height="38"
        rx="6"
        fill={cardBg}
        stroke={cardBorder}
      />
      <rect x="86" y="56" width="14" height="26" rx="3" fill={accentColor} />
      <rect
        x="106"
        y="60"
        width="80"
        height="3"
        rx="1.5"
        fill={ink}
        opacity="0.85"
      />
      <rect
        x="106"
        y="68"
        width="64"
        height="2"
        rx="1"
        fill={ink}
        opacity="0.4"
      />
      <rect
        x="106"
        y="74"
        width="54"
        height="2"
        rx="1"
        fill={ink}
        opacity="0.3"
      />
      <rect
        x="116"
        y="116"
        width="48"
        height="14"
        rx="7"
        fill={cardBg}
        stroke={accentColor}
      />
      <circle
        cx="126"
        cy="123"
        r="2.5"
        stroke={accentColor}
        strokeWidth="1"
        fill="none"
      />
      <rect x="132" y="121" width="26" height="4" rx="1" fill={accentColor} />
      <rect
        x="20"
        y="164"
        width="120"
        height="30"
        rx="6"
        fill={cardBg}
        stroke={cardBorder}
      />
      <rect
        x="26"
        y="170"
        width="10"
        height="18"
        rx="2"
        fill={accentColor}
        opacity="0.85"
      />
      <rect
        x="42"
        y="172"
        width="62"
        height="3"
        rx="1.5"
        fill={ink}
        opacity="0.8"
      />
      <rect
        x="42"
        y="180"
        width="44"
        height="2"
        rx="1"
        fill={ink}
        opacity="0.35"
      />
      <rect
        x="140"
        y="164"
        width="120"
        height="30"
        rx="6"
        fill={cardBg}
        stroke={cardBorder}
      />
      <rect
        x="146"
        y="170"
        width="10"
        height="18"
        rx="2"
        fill={ink}
        opacity="0.45"
      />
      <rect
        x="162"
        y="172"
        width="62"
        height="3"
        rx="1.5"
        fill={ink}
        opacity="0.6"
      />
      <rect
        x="162"
        y="180"
        width="44"
        height="2"
        rx="1"
        fill={ink}
        opacity="0.3"
      />
      <rect
        x="65"
        y="148"
        width="22"
        height="11"
        rx="5.5"
        fill={dark ? 'rgba(34,163,94,0.4)' : 'var(--green-soft)'}
        stroke={dark ? 'rgba(34,163,94,0.6)' : 'rgba(26,122,62,0.25)'}
        strokeWidth="0.5"
      />
      <text
        x="76"
        y="156"
        fontSize="6"
        fill={dark ? '#86efac' : 'var(--green)'}
        textAnchor="middle"
        fontFamily="Poppins, sans-serif"
        fontWeight="500"
      >
        YES
      </text>
      <rect
        x="193"
        y="148"
        width="22"
        height="11"
        rx="5.5"
        fill={dark ? 'rgba(255,255,255,0.1)' : 'var(--bg-softer)'}
        stroke={cardBorder}
        strokeWidth="0.5"
      />
      <text
        x="204"
        y="156"
        fontSize="6"
        fill={ink}
        opacity="0.6"
        textAnchor="middle"
        fontFamily="Poppins, sans-serif"
        fontWeight="500"
      >
        NO
      </text>
    </svg>
  )
}

export const SequencesRoute = ({
  organization,
}: {
  organization: schemas['Organization']
}) => {
  const router = useRouter()
  const base = `/dashboard/${organization.slug}/email-marketing/sequences`
  return (
    <FeatureGate
      feature="email_sequences_and_segments"
      organizationId={organization.id}
      organizationSlug={organization.slug}
    >
      <SequencesScreen
        organization={organization}
        onNew={() => router.push(`${base}/new`)}
        onEdit={(id) => router.push(`${base}/${id}/edit`)}
      />
    </FeatureGate>
  )
}
