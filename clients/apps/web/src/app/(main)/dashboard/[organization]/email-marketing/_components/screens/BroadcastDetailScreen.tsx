'use client'

import {
  useArchiveEmailBroadcast,
  useCancelScheduledEmailBroadcast,
  useDuplicateEmailBroadcast,
  useEmailBroadcast,
  useEmailBroadcastABTest,
  useEmailBroadcastAnalytics,
  useEmailBroadcastSends,
} from '@/hooks/queries/emailMarketing'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ActionMenu } from '../ActionMenu'
import { useDialogs } from '../dialogs'
import { Icon } from '../Icon'
import { sanitizeEmailHtml } from '../sanitize'
import { MetricTile } from '../shared'

const PAGE_SIZE = 20

const formatTime = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—'

const sendStatusChip = (status: string) => {
  if (status === 'clicked')
    return (
      <span className="chip chip-success">
        <Icon name="mouse-pointer" size={11} />
        Clicked
      </span>
    )
  if (status === 'opened')
    return (
      <span className="chip chip-success">
        <Icon name="eye" size={11} />
        Opened
      </span>
    )
  if (status === 'delivered')
    return (
      <span className="chip chip-info">
        <Icon name="check" size={11} />
        Delivered
      </span>
    )
  if (status === 'sent')
    return (
      <span className="chip chip-info">
        <Icon name="send" size={11} />
        Sent
      </span>
    )
  if (status === 'bounced')
    return (
      <span className="chip chip-error">
        <Icon name="x-circle" size={11} />
        Bounced
      </span>
    )
  if (status === 'failed')
    return (
      <span className="chip chip-error">
        <Icon name="x-circle" size={11} />
        Failed
      </span>
    )
  return (
    <span className="chip">
      <span className="dot" style={{ background: 'var(--ink-4)' }} />
      {status}
    </span>
  )
}

export const BroadcastDetailScreen = ({
  broadcastId,
  onBack,
}: {
  broadcastId: string
  onBack: () => void
}) => {
  const [page, setPage] = useState(1)
  const broadcastQuery = useEmailBroadcast(broadcastId)
  const analyticsQuery = useEmailBroadcastAnalytics(broadcastId)
  const abQuery = useEmailBroadcastABTest(broadcastId)
  const sendsQuery = useEmailBroadcastSends(broadcastId, {
    page,
    limit: PAGE_SIZE,
  })

  const duplicateMutation = useDuplicateEmailBroadcast()
  const cancelMutation = useCancelScheduledEmailBroadcast()
  const archiveMutation = useArchiveEmailBroadcast()
  const dialogs = useDialogs()

  const broadcast = broadcastQuery.data
  const analytics = analyticsQuery.data
  const sends = sendsQuery.data?.items ?? []
  const sendsTotal = sendsQuery.data?.pagination.total_count ?? 0
  const sendsMaxPage = sendsQuery.data?.pagination.max_page ?? 1

  // Surface mutation failures via dialogs.alert so the user knows a
  // click did nothing. Previously every mutation used .mutate() with
  // no onError, so a 500 here would silently leave the user on the
  // same screen.
  const runMutation = async <T,>(
    mutation: { mutateAsync: (input: T) => Promise<unknown> },
    input: T,
    failedLabel: string,
  ): Promise<boolean> => {
    try {
      await mutation.mutateAsync(input)
      return true
    } catch (err) {
      const message =
        err instanceof Error && err.message ? err.message : 'Unknown error.'
      await dialogs.alert({ title: failedLabel, message })
      return false
    }
  }

  const onArchive = async () => {
    if (!broadcast) return
    const ok = await dialogs.confirm({
      title: 'Archive broadcast?',
      message: (
        <>
          Archive <strong>{broadcast.subject || 'this broadcast'}</strong>?
          You can still find it in the archive list later.
        </>
      ),
      confirmLabel: 'Archive',
    })
    if (!ok) return
    const archived = await runMutation(
      archiveMutation,
      broadcastId,
      'Could not archive',
    )
    if (archived) onBack()
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
              {broadcast?.status === 'sent' && 'Broadcast · Sent'}
              {broadcast?.status === 'sending' && 'Broadcast · Sending'}
              {broadcast?.status === 'scheduled' && 'Broadcast · Scheduled'}
              {broadcast?.status === 'draft' && 'Broadcast · Draft'}
              {broadcast?.status === 'failed' && 'Broadcast · Failed'}
              {!broadcast && 'Broadcast'}
            </div>
            <h1 className="h1" style={{ marginTop: 6 }}>
              {broadcast?.subject ?? '—'}
            </h1>
            {broadcast?.sent_at && (
              <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                Sent {formatTime(broadcast.sent_at)}
              </div>
            )}
            {broadcast?.scheduled_at && broadcast?.status === 'scheduled' && (
              <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                Scheduled for {formatTime(broadcast.scheduled_at)}
              </div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            className="btn btn-secondary"
            onClick={() =>
              runMutation(duplicateMutation, broadcastId, 'Could not duplicate')
            }
          >
            <Icon name="copy" size={14} />
            Duplicate
          </button>
          <ActionMenu
            trigger={<Icon name="more" size={16} />}
            items={[
              {
                label: 'Cancel schedule',
                icon: 'x-circle',
                hidden: broadcast?.status !== 'scheduled',
                onClick: () =>
                  runMutation(
                    cancelMutation,
                    broadcastId,
                    'Could not cancel schedule',
                  ),
              },
              {
                label: 'Archive',
                icon: 'trash',
                destructive: true,
                onClick: onArchive,
              },
            ]}
          />
        </div>
      </div>

      {/*
        Tracking-status banner. "Open rate / Click rate = 0%" used to be
        indistinguishable from "tracking not configured" — every customer
        who saw a zero-rate broadcast thought the product was broken.
        Now: if the broadcast has been delivered for at least an hour and
        no engagement webhooks have landed, surface a hint that domain-
        level tracking is the likely culprit.
       */}
      {analytics &&
        analytics.delivered > 0 &&
        analytics.webhook_signal_present === false && (
          <div
            style={{
              marginBottom: 16,
              padding: '12px 14px',
              borderRadius: 12,
              border: '1px solid #fcd34d',
              background: '#fffbeb',
              color: '#78350f',
              fontSize: 13,
              lineHeight: 1.5,
            }}
            role="status"
          >
            <strong style={{ fontWeight: 600 }}>
              Tracking not detected.
            </strong>{' '}
            We delivered{' '}
            {analytics.delivered.toLocaleString()} emails but haven't seen
            any open or click events. Open/click tracking has to be
            enabled on your sending domain — check Resend's dashboard or
            verify your custom sender domain is fully set up. Engagement
            metrics will fill in retroactively once events start arriving.
          </div>
        )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 16,
          marginBottom: 24,
        }}
      >
        <MetricTile
          value={(analytics?.total_recipients ?? 0).toLocaleString()}
          label="Recipients"
          delta={
            analytics ? `${analytics.delivered.toLocaleString()}` : undefined
          }
          deltaLabel="delivered"
          subtle
        />
        <MetricTile
          value={`${(analytics?.open_rate ?? 0).toFixed(1)}%`}
          label="Open rate"
          delta={analytics ? analytics.opened.toLocaleString() : undefined}
          deltaLabel="opens"
          subtle
        />
        <MetricTile
          value={`${(analytics?.click_rate ?? 0).toFixed(1)}%`}
          label="Click rate"
          delta={analytics ? analytics.clicked.toLocaleString() : undefined}
          deltaLabel="clicks"
          subtle
        />
        <MetricTile
          value={(analytics?.unsubscribed ?? 0).toLocaleString()}
          label="Unsubscribes"
          delta={analytics ? analytics.bounced.toLocaleString() : undefined}
          deltaLabel="bounced"
          subtle
          down
        />
      </div>

      {abQuery.data?.config && (
        <ABTestPanel
          subject_a={broadcast?.subject ?? ''}
          state={abQuery.data}
        />
      )}

      {broadcast?.content_html && (
        <div className="card" style={{ padding: 0, marginBottom: 24 }}>
          <div
            style={{
              padding: '14px 22px',
              borderBottom: '1px solid var(--line)',
              fontSize: 12,
              color: 'var(--ink-3)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              fontWeight: 500,
            }}
          >
            Content preview
          </div>
          <div
            style={{
              padding: 28,
              maxHeight: 400,
              overflowY: 'auto',
              fontSize: 14,
              lineHeight: 1.6,
              color: 'var(--ink-2)',
            }}
            // Email content is HTML produced by the org owner inside our composer.
            // It still goes through the same render pipeline used by the email worker.
            dangerouslySetInnerHTML={{
              __html: sanitizeEmailHtml(broadcast.content_html),
            }}
          />
        </div>
      )}

      <div className="card" style={{ overflow: 'visible' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '18px 22px',
            borderBottom: '1px solid var(--line)',
          }}
        >
          <h3 className="h3">Recipients</h3>
          <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
            {sendsTotal.toLocaleString()} total
          </span>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th style={{ paddingLeft: 24 }}>Subscriber</th>
              <th>Status</th>
              <th>Sent</th>
              <th>Opened</th>
              <th>Clicked</th>
            </tr>
          </thead>
          <tbody>
            {sendsQuery.isLoading && sends.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: 32, textAlign: 'center' }}>
                  Loading…
                </td>
              </tr>
            )}
            {!sendsQuery.isLoading && sends.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  style={{
                    padding: 32,
                    textAlign: 'center',
                    color: 'var(--ink-3)',
                  }}
                >
                  No recipient activity yet.
                </td>
              </tr>
            )}
            {sends.map((s) => (
              <tr key={s.id}>
                <td style={{ paddingLeft: 24 }}>
                  <div
                    style={{
                      fontSize: 13.5,
                      fontWeight: 500,
                      color: 'var(--ink)',
                    }}
                  >
                    {s.subscriber_name || s.subscriber_email}
                  </div>
                  {s.subscriber_name && (
                    <div
                      style={{
                        fontSize: 12.5,
                        color: 'var(--ink-3)',
                        marginTop: 2,
                      }}
                    >
                      {s.subscriber_email}
                    </div>
                  )}
                </td>
                <td>{sendStatusChip(s.status)}</td>
                <td>{formatTime(s.sent_at)}</td>
                <td>
                  {s.opened_at ? (
                    <span>
                      {formatTime(s.opened_at)}
                      {s.open_count > 1 && (
                        <span
                          style={{
                            color: 'var(--ink-4)',
                            marginLeft: 6,
                            fontSize: 12,
                          }}
                        >
                          · {s.open_count}×
                        </span>
                      )}
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
                <td>
                  {s.clicked_at ? (
                    <span>
                      {formatTime(s.clicked_at)}
                      {s.click_count > 1 && (
                        <span
                          style={{
                            color: 'var(--ink-4)',
                            marginLeft: 6,
                            fontSize: 12,
                          }}
                        >
                          · {s.click_count}×
                        </span>
                      )}
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {sendsTotal > PAGE_SIZE && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '14px 22px',
              borderTop: '1px solid var(--line)',
              fontSize: 12.5,
              color: 'var(--ink-3)',
            }}
          >
            <div>
              Page {page} of {sendsMaxPage}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn btn-ghost btn-sm"
                disabled={page <= 1}
                style={{ opacity: page <= 1 ? 0.4 : 1 }}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <button
                className="btn btn-ghost btn-sm"
                disabled={page >= sendsMaxPage}
                style={{ opacity: page >= sendsMaxPage ? 0.4 : 1 }}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const ABTestPanel = ({
  subject_a,
  state,
}: {
  subject_a: string
  state: import('@/hooks/queries/emailMarketing').ABTestState
}) => {
  const { config, variants } = state
  if (!config) return null
  const a = variants?.a
  const b = variants?.b
  const metric = config.winner_metric
  const winner = config.winner_variant

  return (
    <div className="card" style={{ padding: 0, marginBottom: 24 }}>
      <div
        style={{
          padding: '14px 22px',
          borderBottom: '1px solid var(--line)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <div
            style={{
              fontSize: 12,
              color: 'var(--ink-3)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              fontWeight: 500,
              marginBottom: 4,
            }}
          >
            A/B test · winner by{' '}
            {metric === 'click_rate' ? 'click rate' : 'open rate'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>
            {config.slice_pct}% of recipients tested · decided after{' '}
            {config.decide_after_minutes} minutes
          </div>
        </div>
        {winner ? (
          <span className="chip chip-success">
            <Icon name="check" size={11} />
            Winner · {winner.toUpperCase()}
          </span>
        ) : config.test_sent_at ? (
          <span className="chip chip-info">
            <Icon name="clock" size={11} />
            Test running
          </span>
        ) : (
          <span className="chip">
            <Icon name="flask" size={11} />
            Configured
          </span>
        )}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 0,
        }}
      >
        <ABVariantBlock
          label="A"
          subject={subject_a}
          stats={a}
          metric={metric}
          isWinner={winner === 'a'}
        />
        <div
          style={{
            borderLeft: '1px solid var(--line)',
          }}
        >
          <ABVariantBlock
            label="B"
            subject={config.subject_b}
            stats={b}
            metric={metric}
            isWinner={winner === 'b'}
          />
        </div>
      </div>
    </div>
  )
}

const ABVariantBlock = ({
  label,
  subject,
  stats,
  metric,
  isWinner,
}: {
  label: string
  subject: string
  stats: import('@/hooks/queries/emailMarketing').ABVariantStats | undefined
  metric: 'open_rate' | 'click_rate'
  isWinner: boolean
}) => {
  const value =
    stats == null
      ? null
      : metric === 'click_rate'
        ? stats.click_rate
        : stats.open_rate
  return (
    <div style={{ padding: 24 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 8,
        }}
      >
        <span
          style={{
            fontSize: 11.5,
            fontWeight: 600,
            width: 22,
            height: 22,
            borderRadius: '50%',
            background: isWinner ? 'var(--ink)' : 'var(--bg-softer)',
            color: isWinner ? '#fff' : 'var(--ink-2)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {label}
        </span>
        <div
          style={{
            fontSize: 13,
            color: 'var(--ink)',
            fontWeight: 500,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {subject || '—'}
        </div>
      </div>
      <div
        style={{
          fontSize: 32,
          fontWeight: 600,
          letterSpacing: '-0.03em',
          color: 'var(--ink)',
        }}
      >
        {value == null ? '—' : `${value.toFixed(1)}%`}
      </div>
      <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 4 }}>
        {stats
          ? `${stats.opened} opens · ${stats.clicked} clicks · ${stats.delivered} delivered`
          : 'No data yet'}
      </div>
    </div>
  )
}

export const BroadcastDetailRoute = ({
  organizationSlug,
  broadcastId,
}: {
  organizationSlug: string
  broadcastId: string
}) => {
  const router = useRouter()
  return (
    <BroadcastDetailScreen
      broadcastId={broadcastId}
      onBack={() =>
        router.push(`/dashboard/${organizationSlug}/email-marketing/broadcasts`)
      }
    />
  )
}
