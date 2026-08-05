'use client'

import { getServerURL } from '@/utils/api'
import {
  useBroadcastAggregateAnalytics,
  useBroadcastDailyEngagement,
  useBroadcastDevices,
  useBroadcastEngagementHeatmap,
  useBroadcastTopLinks,
  useEmailBroadcasts,
  useEmailSubscriberStats,
  useSubscriberDailyGrowth,
} from '@/hooks/queries/emailMarketing'
import { schemas } from '@spaire/client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ActionMenu } from '../ActionMenu'
import { fmtPctDelta, fmtPtDelta } from '../analyticsFormat'
import { Icon } from '../Icon'
import { MetricTile } from '../shared'

const RANGE_DAYS: Record<'7d' | '14d' | '30d' | '90d', number> = {
  '7d': 7,
  '14d': 14,
  '30d': 30,
  '90d': 90,
}

export const AnalyticsScreen = ({
  organization,
  onOpenBroadcast,
}: {
  organization: schemas['Organization']
  onOpenBroadcast?: (broadcastId: string) => void
}) => {
  const [range, setRange] = useState<'7d' | '14d' | '30d' | '90d'>('14d')
  const days = RANGE_DAYS[range]

  const broadcastsQuery = useEmailBroadcasts(organization.id, {
    status: 'sent',
    page: 1,
    limit: 50,
  })
  const sentBroadcasts = broadcastsQuery.data?.items ?? []

  const aggregateQuery = useBroadcastAggregateAnalytics(organization.id, {
    days,
    comparePrior: true,
  })
  const aggregate = aggregateQuery.data?.current
  const aggregateDelta = aggregateQuery.data?.delta
  const aggregateIndustry = aggregateQuery.data?.industry

  const heatmapQuery = useBroadcastEngagementHeatmap(organization.id, 90)

  const engagementQuery = useBroadcastDailyEngagement(organization.id, days)
  const engagementSeries = engagementQuery.data ?? []

  const growthQuery = useSubscriberDailyGrowth(organization.id, days)
  const growthSeries = growthQuery.data ?? []
  // Compare against the immediately-prior window of the same length so
  // the tile can show "+24 vs prior 14d" instead of just "+24" with no
  // baseline (audit issue #46 / fix-list #37). We pull 2× the window
  // and split it locally — the hook only supports a single days
  // parameter, so a second hook with `days * 2` is the cheapest way
  // to land this without a new endpoint.
  const growthDoubleQuery = useSubscriberDailyGrowth(
    organization.id,
    days * 2,
  )
  const growthDoubleSeries = growthDoubleQuery.data ?? []
  const subStatsQuery = useEmailSubscriberStats(organization.id)
  const totalSubscribers = subStatsQuery.data?.total ?? 0
  // Net new in the current window. The label below now reads "vs prior
  // {N}d" so it's clear this is a delta, not a one-off count (audit
  // issue #46 / fix-list #37 — the previous tile rendered the sum with
  // no comparison and treated it as a delta).
  const currentNetNew = growthSeries.reduce((acc, p) => acc + p.count, 0)
  const priorWindowSeries = growthDoubleSeries.slice(
    0,
    Math.max(0, growthDoubleSeries.length - growthSeries.length),
  )
  const priorNetNew = priorWindowSeries.reduce((acc, p) => acc + p.count, 0)
  const growthDelta = currentNetNew
  const growthVsPrior = currentNetNew - priorNetNew

  const topLinksQuery = useBroadcastTopLinks(organization.id, days, 5)
  const topLinks = topLinksQuery.data ?? []

  const devicesQuery = useBroadcastDevices(organization.id, 90)
  const devices = devicesQuery.data ?? []

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
            Performance
          </div>
          <h1 className="h-display">Analytics</h1>
          <p
            className="muted"
            style={{ fontSize: 15, marginTop: 12, maxWidth: 520 }}
          >
            How your emails actually perform — opens, clicks, growth, and
            what&apos;s getting attention.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div className="tabs">
            {(
              [
                { id: '7d', l: '7d' },
                { id: '14d', l: '14d' },
                { id: '30d', l: '30d' },
                { id: '90d', l: '90d' },
              ] as const
            ).map((r) => (
              <button
                key={r.id}
                className={`tab ${range === r.id ? 'tab-active' : ''}`}
                onClick={() => setRange(r.id)}
              >
                {r.l}
              </button>
            ))}
          </div>
          <button
            className="btn btn-secondary"
            onClick={() =>
              window.open(
                getServerURL(
                  `/v1/email-broadcasts/export-analytics?organization_id=${organization.id}&days=${days}`,
                ),
                '_blank',
              )
            }
          >
            <Icon name="download" size={15} />
            Export
          </button>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 16,
          marginBottom: 16,
        }}
      >
        <MetricTile
          value={(aggregate?.total_sent ?? 0).toLocaleString()}
          label="Emails sent"
          delta={fmtPctDelta(aggregateDelta?.total_sent_pct)}
          deltaLabel={`vs prior ${days}d`}
          down={(aggregateDelta?.total_sent_pct ?? 0) < 0}
        />
        <MetricTile
          value={
            // "—" when the backend has no webhook signal (audit issue #11
            // / fix-list #30) — better than rendering a fabricated 0%.
            aggregate?.open_rate == null
              ? '—'
              : `${aggregate.open_rate.toFixed(1)}%`
          }
          label="Open rate"
          delta={fmtPtDelta(aggregateDelta?.open_rate_pt)}
          deltaLabel={
            aggregateIndustry
              ? `vs ${aggregateIndustry.label} (${aggregateIndustry.open_rate.toFixed(0)}%)`
              : `vs prior ${days}d`
          }
          down={(aggregateDelta?.open_rate_pt ?? 0) < 0}
        />
        <MetricTile
          value={
            aggregate?.click_rate == null
              ? '—'
              : `${aggregate.click_rate.toFixed(1)}%`
          }
          label="Click rate"
          delta={fmtPtDelta(aggregateDelta?.click_rate_pt)}
          deltaLabel={
            aggregateIndustry
              ? `vs ${aggregateIndustry.label} (${aggregateIndustry.click_rate.toFixed(1)}%)`
              : `vs prior ${days}d`
          }
          down={(aggregateDelta?.click_rate_pt ?? 0) < 0}
        />
        <MetricTile
          value={(aggregate?.unsubscribed ?? 0).toLocaleString()}
          label="Unsubscribes"
          delta={fmtPtDelta(aggregateDelta?.unsub_rate_pt)}
          deltaLabel={`vs prior ${days}d`}
          down={(aggregateDelta?.unsub_rate_pt ?? 0) > 0}
        />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '2fr 1fr',
          gap: 16,
          marginBottom: 16,
        }}
      >
        <div className="card" style={{ padding: 28 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              marginBottom: 24,
            }}
          >
            <div>
              <div className="eyebrow" style={{ marginBottom: 6 }}>
                Engagement
              </div>
              <h3 className="h2">Open & click rate</h3>
            </div>
            <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
              <Legend color="#0066cc" label="Open rate" />
              <Legend color="#ec4899" label="Click rate" />
            </div>
          </div>
          {engagementSeries.length === 0 && !engagementQuery.isLoading ? (
            <div
              style={{
                padding: 40,
                color: 'var(--ink-3)',
                fontSize: 13,
                textAlign: 'center',
              }}
            >
              No sends in the last {days} days yet.
            </div>
          ) : (
            <LineChart data={engagementSeries} />
          )}
        </div>
        <div className="card" style={{ padding: 28 }}>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            List growth
          </div>
          <h3 className="h2" style={{ marginBottom: 18 }}>
            Subscribers
          </h3>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 12,
              marginBottom: 18,
            }}
          >
            <span
              style={{
                fontSize: 40,
                fontWeight: 400,
                letterSpacing: '-0.025em',
              }}
            >
              {totalSubscribers.toLocaleString()}
            </span>
            <span
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: '#0066cc',
              }}
              title={`Net new in the last ${days} days. Prior ${days}d: ${priorNetNew >= 0 ? '+' : ''}${priorNetNew}.`}
            >
              {growthDelta >= 0 ? `+${growthDelta}` : growthDelta}
              <span
                style={{
                  fontSize: 11,
                  color: 'var(--ink-4)',
                  marginLeft: 6,
                  fontWeight: 400,
                }}
              >
                {growthVsPrior >= 0 ? `▲ ${growthVsPrior}` : `▼ ${Math.abs(growthVsPrior)}`} vs prior {days}d
              </span>
            </span>
          </div>
          {growthSeries.length === 0 && !growthQuery.isLoading ? (
            <div
              style={{
                padding: 40,
                color: 'var(--ink-3)',
                fontSize: 13,
                textAlign: 'center',
              }}
            >
              No new subscribers yet.
            </div>
          ) : (
            <AreaChart data={growthSeries} />
          )}
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 16,
          marginBottom: 16,
        }}
      >
        <div className="card" style={{ padding: 28 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              marginBottom: 20,
            }}
          >
            <h3 className="h2">Top broadcasts</h3>
            <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
              by open rate
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {sentBroadcasts
              .filter((b) => b.analytics && b.analytics.delivered > 0)
              .slice()
              .sort(
                (a, b) =>
                  (b.analytics?.open_rate ?? 0) - (a.analytics?.open_rate ?? 0),
              )
              .slice(0, 5)
              .map((b) => {
                const rate = b.analytics?.open_rate ?? 0
                const handleOpen = () => onOpenBroadcast?.(b.id)
                return (
                  <button
                    type="button"
                    key={b.id}
                    onClick={handleOpen}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      padding: 0,
                      textAlign: 'left',
                      cursor: onOpenBroadcast ? 'pointer' : 'default',
                      width: '100%',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        marginBottom: 6,
                        fontSize: 13,
                      }}
                    >
                      <span
                        style={{
                          color: 'var(--ink)',
                          fontWeight: 500,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          maxWidth: 280,
                        }}
                      >
                        {b.subject}
                      </span>
                      <span
                        style={{
                          color: 'var(--ink-2)',
                          fontWeight: 500,
                        }}
                      >
                        {rate.toFixed(1)}%
                      </span>
                    </div>
                    <div
                      style={{
                        height: 6,
                        background: 'var(--bg-softer)',
                        borderRadius: 3,
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          width: `${rate}%`,
                          background: 'linear-gradient(90deg,#4998fe,#0066cc)',
                          borderRadius: 3,
                        }}
                      />
                    </div>
                  </button>
                )
              })}
            {!broadcastsQuery.isLoading && sentBroadcasts.length === 0 && (
              <div
                style={{
                  fontSize: 13,
                  color: 'var(--ink-3)',
                  padding: '8px 0',
                }}
              >
                No sent broadcasts yet.
              </div>
            )}
          </div>
        </div>

        <div className="card" style={{ padding: 28 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              marginBottom: 20,
            }}
          >
            <h3 className="h2">Top links</h3>
            <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
              last {days} days
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {topLinks.length === 0 && !topLinksQuery.isLoading && (
              <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>
                No tracked link clicks yet.
              </div>
            )}
            {topLinks.map((l, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '8px 0',
                  borderBottom: i < 4 ? '1px solid var(--line)' : 'none',
                }}
              >
                <div
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 6,
                    background: 'var(--bg-softer)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon
                    name="link"
                    size={11}
                    style={{ color: 'var(--ink-3)' }}
                  />
                </div>
                <a
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    flex: 1,
                    fontSize: 12.5,
                    color: 'var(--ink-2)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontFamily: 'JetBrains Mono, monospace',
                    textDecoration: 'none',
                  }}
                  title={l.url}
                >
                  {l.url}
                </a>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: 'var(--ink)',
                  }}
                >
                  {l.clicks}
                </div>
                <div
                  style={{
                    fontSize: 11.5,
                    color: 'var(--ink-3)',
                    width: 50,
                    textAlign: 'right',
                  }}
                >
                  {l.ctr.toFixed(1)}%
                </div>
                <ActionMenu
                  items={[
                    {
                      label: 'Copy URL',
                      icon: 'copy',
                      onClick: () => navigator.clipboard?.writeText(l.url),
                    },
                    {
                      label: 'Open in new tab',
                      icon: 'link',
                      onClick: () => window.open(l.url, '_blank'),
                    },
                  ]}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 16,
        }}
      >
        <div className="card" style={{ padding: 28 }}>
          <h3 className="h2" style={{ marginBottom: 20 }}>
            Where readers open
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {devices.length === 0 && !devicesQuery.isLoading && (
              <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>
                Not enough open data yet.
              </div>
            )}
            {(() => {
              // Audit issue #47 / fix-list #35: the previous bar width was
              // `d.share * 2.2`, a magic factor that pushed a 50% share to
              // 110% width and overflowed the track. Normalize each bar
              // against the largest share in the set so the leader fills
              // the row and everything else scales proportionally — that's
              // what the * 2.2 was reaching for, just done correctly.
              const maxShare = devices.reduce(
                (m, d) => Math.max(m, d.share || 0),
                0,
              )
              return devices.map((d, i) => {
                const ratio = maxShare > 0 ? Math.min(1, d.share / maxShare) : 0
                return (
                  <div key={i}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        marginBottom: 5,
                        fontSize: 13,
                      }}
                    >
                      <span style={{ color: 'var(--ink-2)' }}>{d.name}</span>
                      <span style={{ color: 'var(--ink)', fontWeight: 500 }}>
                        {d.share}%
                      </span>
                    </div>
                    <div
                      style={{
                        height: 6,
                        background: 'var(--bg-softer)',
                        borderRadius: 3,
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          width: `${(ratio * 100).toFixed(2)}%`,
                          background:
                            ['#0054b1', '#0066cc', '#4998fe', '#8fc9ff', '#b9dfff'][
                              i
                            ] || '#b9dfff',
                          borderRadius: 3,
                        }}
                      />
                    </div>
                  </div>
                )
              })
            })()}
          </div>
        </div>

        <div className="card" style={{ padding: 28 }}>
          <h3 className="h2" style={{ marginBottom: 6 }}>
            Best time to send
          </h3>
          <p
            className="muted"
            style={{ fontSize: 12.5, marginTop: 0, marginBottom: 18 }}
          >
            Open-rate heatmap by day & hour, last 90 days.
          </p>
          <Heatmap data={heatmapQuery.data ?? null} />
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: 14,
              fontSize: 11.5,
              color: 'var(--ink-3)',
            }}
          >
            <span>Lower</span>
            <div style={{ display: 'flex', gap: 2 }}>
              {/* Match the matrix's actual opacity scale (Math.max(0.05,
                  Math.min(0.95, value / max))) — audit issue #51 / fix-
                  list #4. The previous alphas (0.1 / 0.3 / 0.5 / 0.7 / 0.9)
                  diverged from what the heatmap renders, so the legend
                  said "this shade = X" but cells of the same value had
                  a different shade. */}
              {[0.05, 0.275, 0.5, 0.725, 0.95].map((o) => (
                <div
                  key={o}
                  style={{
                    width: 16,
                    height: 8,
                    background: `rgba(79,70,229,${o})`,
                    borderRadius: 1,
                  }}
                />
              ))}
            </div>
            <span>Higher</span>
          </div>
          {heatmapQuery.data && heatmapQuery.data.sample_size > 0 && (
            <div
              style={{
                marginTop: 8,
                fontSize: 11,
                color: 'var(--ink-4)',
                textAlign: 'center',
              }}
            >
              {heatmapQuery.data.sample_size.toLocaleString()} sends ·
              buckets with under {heatmapQuery.data.threshold} sends are
              greyed out.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const Legend = ({
  color,
  label,
  dashed,
}: {
  color: string
  label: string
  dashed?: boolean
}) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      color: 'var(--ink-3)',
    }}
  >
    <div
      style={{
        width: 14,
        height: 0,
        borderTop: `2px ${dashed ? 'dashed' : 'solid'} ${color}`,
      }}
    />
    {label}
  </div>
)

const LineChart = ({
  data,
}: {
  data: { day: string; open_rate: number; click_rate: number }[]
}) => {
  const W = 720
  const H = 220
  const P = 24
  const xs = data.map(
    (_, i) =>
      P + (data.length === 1 ? 0.5 : i / (data.length - 1)) * (W - 2 * P),
  )
  // Audit issue #48 / fix-list #2: previously the y-axis was clamped to a
  // floor of 70 — fine for open rates that hover around 30-50%, but it
  // pinned the click-rate line (typically 1-10%) to the bottom of the
  // chart and made all engagement movement invisible. Compute the floor
  // from the data with a small headroom so both lines have room to
  // breathe; cap the upper bound at 100 since these are percentages.
  const dataMax = data.reduce(
    (m, d) => Math.max(m, d.open_rate, d.click_rate),
    0,
  )
  const max = dataMax > 0 ? Math.min(100, dataMax * 1.2) : 10
  const yOpen = data.map((d) => H - P - (d.open_rate / max) * (H - 2 * P))
  const yClick = data.map((d) => H - P - (d.click_rate / max) * (H - 2 * P))

  const path = (ys: number[]) =>
    xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x},${ys[i]}`).join(' ')
  const fillPath = (ys: number[]) =>
    `${path(ys)} L${xs[xs.length - 1]},${H - P} L${xs[0]},${H - P} Z`

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 220 }}>
      {[0, 25, 50, 75].map((p) => (
        <line
          key={p}
          x1={P}
          x2={W - P}
          y1={H - P - (p / max) * (H - 2 * P)}
          y2={H - P - (p / max) * (H - 2 * P)}
          stroke="var(--line)"
          strokeDasharray="2 4"
        />
      ))}
      <defs>
        <linearGradient id="emailGradOpen" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="rgba(79,70,229,0.22)" />
          <stop offset="100%" stopColor="rgba(79,70,229,0)" />
        </linearGradient>
        <linearGradient id="emailGradClick" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="rgba(244,114,182,0.14)" />
          <stop offset="100%" stopColor="rgba(244,114,182,0)" />
        </linearGradient>
      </defs>
      <path d={fillPath(yClick)} fill="url(#emailGradClick)" />
      <path d={fillPath(yOpen)} fill="url(#emailGradOpen)" />
      <path
        d={path(yClick)}
        fill="none"
        stroke="#ec4899"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={path(yOpen)}
        fill="none"
        stroke="#0066cc"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {xs.length > 0 && (
        <>
          <circle
            cx={xs[xs.length - 1]}
            cy={yOpen[yOpen.length - 1]}
            r="4"
            fill="#0066cc"
            stroke="#fff"
            strokeWidth="2"
          />
          <circle
            cx={xs[xs.length - 1]}
            cy={yClick[yClick.length - 1]}
            r="4"
            fill="#ec4899"
            stroke="#fff"
            strokeWidth="2"
          />
        </>
      )}
      {/* Adaptive label density (audit issue #49 / fix-list #4): hard-
          coded `i % 2` looked fine on a 14d window but overlapped on
          90d. Aim for at most ~12 labels regardless of data length. */}
      {xs.map((x, i) => {
        const stride = Math.max(1, Math.ceil(data.length / 12))
        if (i % stride !== 0 && i !== data.length - 1) return null
        return (
          <text
            key={i}
            x={x}
            y={H - 4}
            fontSize="10"
            fill="var(--ink-4)"
            textAnchor="middle"
          >
            {data[i].day}
          </text>
        )
      })}
    </svg>
  )
}

const AreaChart = ({ data }: { data: { day: string; count: number }[] }) => {
  const W = 320
  const H = 140
  const P = 4
  // Cumulative net new subscribers over the window — gives the chart a
  // monotonic growth shape rather than a noisy daily bar.
  const cumulative: number[] = []
  let running = 0
  for (const d of data) {
    running += d.count
    cumulative.push(running)
  }
  // Audit issue #50 / fix-list #6: when cumulative is all-zero (no
  // growth in the window), `min = 0`, `max = max(1, ...) = 1`, but
  // every cumulative value is 0 — so every point lands at the very top
  // of the chart, which looked like a flat line at full height. Anchor
  // the all-zero case to the chart's bottom (where 0 belongs) instead.
  const rawMax = Math.max(...cumulative)
  const rawMin = Math.min(0, ...cumulative)
  const allZero = rawMax === 0 && rawMin === 0
  const min = allZero ? 0 : rawMin
  const max = allZero ? 1 : Math.max(1, rawMax)
  const xs = data.map(
    (_, i) =>
      P + (data.length === 1 ? 0.5 : i / (data.length - 1)) * (W - 2 * P),
  )
  const ys = cumulative.map((v) =>
    allZero
      ? H - P
      : H - P - ((v - min) / (max - min || 1)) * (H - 2 * P),
  )
  const path = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x},${ys[i]}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 140 }}>
      <defs>
        <linearGradient id="emailGrad2" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="rgba(79,70,229,0.28)" />
          <stop offset="100%" stopColor="rgba(79,70,229,0)" />
        </linearGradient>
      </defs>
      <path
        d={`${path} L${xs[xs.length - 1]},${H - P} L${xs[0]},${H - P} Z`}
        fill="url(#emailGrad2)"
      />
      <path
        d={path}
        fill="none"
        stroke="#0066cc"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {xs.length > 0 && (
        <circle
          cx={xs[xs.length - 1]}
          cy={ys[ys.length - 1]}
          r="4"
          fill="#0066cc"
          stroke="#fff"
          strokeWidth="2"
        />
      )}
    </svg>
  )
}

const Heatmap = ({
  data,
}: {
  data: { matrix: (number | null)[][] } | null
}) => {
  // Postgres extract(dow): 0=Sunday..6=Saturday. Reorder so the row
  // axis reads Mon→Sun like the design.
  const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const dowOrder = [1, 2, 3, 4, 5, 6, 0]
  const matrix = data?.matrix
  // Normalise so the busiest cell hits the strongest indigo. Without
  // this, a workspace with low overall opens would render a uniformly
  // pale grid.
  let max = 0
  if (matrix) {
    for (const row of matrix) {
      for (const cell of row) {
        if (cell != null && cell > max) max = cell
      }
    }
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 6 }}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
          paddingTop: 16,
          fontSize: 10,
          color: 'var(--ink-4)',
          alignItems: 'flex-end',
        }}
      >
        {labels.map((d) => (
          <div key={d} style={{ height: 18, lineHeight: '18px' }}>
            {d}
          </div>
        ))}
      </div>
      <div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(24, 1fr)',
            gap: 2,
            fontSize: 9,
            color: 'var(--ink-4)',
            marginBottom: 4,
          }}
        >
          {Array.from({ length: 24 }).map((_, h) => (
            <div
              key={h}
              style={{
                textAlign: 'center',
                visibility: h % 4 === 0 ? 'visible' : 'hidden',
              }}
            >
              {h}
            </div>
          ))}
        </div>
        {dowOrder.map((dow, di) => (
          <div
            key={di}
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(24, 1fr)',
              gap: 2,
              marginBottom: 3,
            }}
          >
            {Array.from({ length: 24 }).map((_, hi) => {
              // Defensive lookup (audit issue #52 / fix-list #11): the
              // server contract is "7 rows of 24 cells", but a partial
              // backfill or migration could ship a shorter row. Fall
              // back to null so we render a blank cell instead of
              // throwing on `.[hi]` of undefined.
              const row = Array.isArray(matrix) ? matrix[dow] : undefined
              const value = Array.isArray(row) ? row[hi] : null
              const filled = value != null
              const alpha =
                filled && max > 0
                  ? Math.max(0.05, Math.min(0.95, value / max))
                  : 0
              return (
                <div
                  key={hi}
                  title={
                    filled
                      ? `${labels[di]} ${hi}:00 — ${(value * 100).toFixed(1)}% open rate`
                      : `${labels[di]} ${hi}:00 — not enough data`
                  }
                  style={{
                    height: 18,
                    background: filled
                      ? `rgba(79,70,229,${alpha.toFixed(2)})`
                      : 'transparent',
                    border: filled ? 'none' : '1px solid var(--line)',
                    borderRadius: 2,
                  }}
                />
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

export const AnalyticsRoute = ({
  organization,
}: {
  organization: schemas['Organization']
}) => {
  const router = useRouter()
  return (
    <AnalyticsScreen
      organization={organization}
      onOpenBroadcast={(id) =>
        router.push(
          `/dashboard/${organization.slug}/email-marketing/broadcasts/${id}`,
        )
      }
    />
  )
}
