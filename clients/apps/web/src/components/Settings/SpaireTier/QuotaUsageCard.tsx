'use client'

import { QuotaUsage, useSpaireUsage } from '@/hooks/queries/spaireTier'
import { schemas } from '@spaire/client'
import { useMemo } from 'react'

interface QuotaUsageCardProps {
  organization: schemas['Organization']
}

const QUOTA_LABELS: Record<string, { label: string; unit: string }> = {
  video_hours_hosted: { label: 'Video hours hosted', unit: 'hours' },
  video_views_monthly: { label: 'Video views', unit: 'views' },
  storage_gb: { label: 'File storage', unit: 'GB' },
}

// Order the rows in a UX-friendly sequence rather than enum order.
const ORDER = ['storage_gb', 'video_hours_hosted', 'video_views_monthly']

const QuotaUsageCard = ({ organization }: QuotaUsageCardProps) => {
  const usage = useSpaireUsage(organization.id)

  const sorted = useMemo(() => {
    if (!usage.data?.items) return []
    const byKey = new Map(usage.data.items.map((q) => [q.quota, q]))
    return ORDER.map((k) => byKey.get(k)).filter((q): q is QuotaUsage =>
      Boolean(q),
    )
  }, [usage.data])

  return (
    <div className="dark:border-spaire-700 overflow-hidden rounded-2xl border border-gray-200 bg-white dark:bg-transparent">
      {usage.isLoading ? (
        <div className="flex flex-col gap-y-6 p-6">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-10 w-full animate-pulse rounded-lg bg-gray-100"
            />
          ))}
        </div>
      ) : (
        <div className="dark:divide-spaire-700 divide-y divide-gray-100">
          {sorted.map((q) => (
            <QuotaRow key={q.quota} quota={q} />
          ))}
        </div>
      )}
    </div>
  )
}

const QuotaRow = ({ quota }: { quota: QuotaUsage }) => {
  const meta = QUOTA_LABELS[quota.quota] ?? {
    label: quota.quota,
    unit: 'units',
  }
  const isUnlimited = quota.is_unlimited
  // The API's `used` floors to whole display units (0.9 GB -> 0); prefer
  // the exact figure so real-but-small usage never reads as zero.
  const usedExact = quota.used_exact ?? quota.used
  const percent =
    isUnlimited || quota.limit === 0 || quota.limit === null
      ? 0
      : Math.min(100, Math.round((usedExact / quota.limit) * 100))
  // Any non-zero usage renders at least a 2% sliver so tiny usage is
  // visible on the track instead of rounding away to an empty bar.
  const barPercent = usedExact > 0 ? Math.max(percent, 2) : percent
  const usedLabel =
    usedExact > 0 && usedExact < 1
      ? usedExact.toLocaleString(undefined, { maximumFractionDigits: 2 })
      : Math.floor(usedExact).toLocaleString()

  return (
    <div className="flex flex-col gap-y-2.5 px-6 py-5">
      {/* Label + headline figure, aligned to the edges so the numbers form a
          clean column down the card. */}
      <div className="flex items-baseline justify-between gap-x-4">
        <span className="text-sm font-medium text-gray-900 dark:text-white">
          {meta.label}
        </span>
        <span className="text-sm text-gray-900 tabular-nums dark:text-white">
          {isUnlimited ? (
            'Unlimited'
          ) : (
            <>
              {usedLabel}
              <span className="text-gray-400">
                {' '}
                / {quota.limit?.toLocaleString()} {meta.unit}
              </span>
            </>
          )}
        </span>
      </div>

      {!isUnlimited && (
        <div className="dark:bg-spaire-700 h-2 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className={`h-full rounded-full transition-all ${
              quota.is_exceeded ? 'bg-red-500' : 'bg-blue-500'
            }`}
            style={{ width: `${barPercent}%` }}
          />
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-gray-400">
        <span>
          {isUnlimited ? 'Unlimited on your current plan' : `${percent}% used`}
        </span>
        <span className="tabular-nums">
          {isUnlimited
            ? `${quota.used.toLocaleString()} ${meta.unit}`
            : quota.is_exceeded
              ? 'Over limit'
              : `${quota.remaining?.toLocaleString() ?? 0} ${meta.unit} left`}
        </span>
      </div>

      {quota.is_exceeded && (
        <a
          href="#plans"
          className="text-xs font-medium text-blue-500 underline underline-offset-2 hover:text-blue-600"
        >
          Upgrade your plan to raise this limit
        </a>
      )}
    </div>
  )
}

export default QuotaUsageCard
