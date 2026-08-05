'use client'

import CancellationsDistributionChart from '@/components/Metrics/CancellationsDistributionChart'
import CancellationsStackedChart from '@/components/Metrics/CancellationsStackedChart'
import { DashboardBody } from '@/components/Layout/DashboardLayout'
import MetricChartBox from '@/components/Metrics/MetricChartBox'
import { Modal } from '@/components/Modal'
import { useModal } from '@/components/Modal/useModal'
import { OrdersWidget } from '@/components/Widgets/OrdersWidget'
import {
  useMetrics,
  useOrganizationPaymentStatus,
} from '@/hooks/queries'
import { ALL_METRICS, getChartRangeParams } from '@/utils/metrics'
import { schemas } from '@spaire/client'
import ArrowForwardOutlined from '@mui/icons-material/ArrowForwardOutlined'
import CheckOutlined from '@mui/icons-material/CheckOutlined'
import TuneOutlined from '@mui/icons-material/TuneOutlined'
import Button from '@spaire/ui/components/atoms/Button'
import Link from 'next/link'
import { useCallback, useMemo, useState } from 'react'
import { twMerge } from 'tailwind-merge'
import { CANCELLATION_METRICS } from '../analytics/metrics/components/metrics-config'

// --- Overview Metrics Config ---

const DEFAULT_OVERVIEW_METRICS: (keyof schemas['Metrics'])[] = [
  'revenue',
  'orders',
  'average_order_value',
  'cumulative_revenue',
]

const OVERVIEW_METRICS_KEY = 'spaire-overview-metrics'

function useOverviewMetrics() {
  const [metrics, setMetrics] = useState<(keyof schemas['Metrics'])[]>(() => {
    if (typeof window === 'undefined') return DEFAULT_OVERVIEW_METRICS
    try {
      const stored = localStorage.getItem(OVERVIEW_METRICS_KEY)
      return stored ? (JSON.parse(stored) as (keyof schemas['Metrics'])[]) : DEFAULT_OVERVIEW_METRICS
    } catch {
      return DEFAULT_OVERVIEW_METRICS
    }
  })

  const updateMetrics = useCallback((newMetrics: (keyof schemas['Metrics'])[]) => {
    setMetrics(newMetrics)
    localStorage.setItem(OVERVIEW_METRICS_KEY, JSON.stringify(newMetrics))
  }, [])

  return { metrics, updateMetrics }
}

// --- Manage Metrics Modal Content ---

const ManageMetricsContent = ({
  selectedMetrics,
  onUpdate,
}: {
  selectedMetrics: (keyof schemas['Metrics'])[]
  onUpdate: (metrics: (keyof schemas['Metrics'])[]) => void
}) => {
  const toggleMetric = (slug: keyof schemas['Metrics']) => {
    if (selectedMetrics.includes(slug)) {
      if (selectedMetrics.length <= 1) return
      onUpdate(selectedMetrics.filter((m) => m !== slug))
    } else {
      onUpdate([...selectedMetrics, slug])
    }
  }

  return (
    <div className="flex flex-col gap-y-4 p-6">
      <p className=" text-sm text-gray-500">
        Choose which metrics appear on your overview page.
      </p>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {ALL_METRICS.map((metric) => {
          const isSelected = selectedMetrics.includes(metric.slug)
          return (
            <button
              key={metric.slug}
              onClick={() => toggleMetric(metric.slug)}
              className={twMerge(
                'flex items-center justify-between rounded-xl border px-4 py-3 text-left text-sm transition-colors',
                isSelected
                  ? 'border-blue-500 bg-blue-50 text-blue-700  '
                  : '  border-gray-200 text-gray-700 hover:border-gray-300',
              )}
            >
              <span>{metric.display_name}</span>
              {isSelected && <CheckOutlined fontSize="small" />}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// --- Profile Completion Banner ---

const ProfileCompletionBanner = ({
  organization,
}: {
  organization: schemas['Organization']
}) => {
  const { data: paymentStatus, isLoading } =
    useOrganizationPaymentStatus(organization.id)

  if (isLoading || !paymentStatus || paymentStatus.payment_ready) {
    return null
  }

  return (
    <div className=" flex flex-col gap-4 rounded-2xl border border-blue-100 bg-blue-50/50 p-6 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-y-1">
        <h3 className="text-sm font-medium text-gray-900">
          Complete your profile to start receiving payouts
        </h3>
        <p className=" text-sm text-gray-500">
          Set up your payout account so you can get paid when customers purchase your products.
        </p>
      </div>
      <Link href={`/dashboard/${organization.slug}/finance/account`} className="shrink-0">
        <Button size="sm">
          <span>Set Up Payouts</span>
          <ArrowForwardOutlined className="ml-1.5" fontSize="small" />
        </Button>
      </Link>
    </div>
  )
}

// --- Overview Metrics ---

const OverviewMetrics = ({
  organization,
}: {
  organization: schemas['Organization']
}) => {
  const { metrics: overviewMetrics, updateMetrics } = useOverviewMetrics()
  const { isShown: isManageOpen, show: showManage, hide: hideManage } = useModal()

  const [startDate, endDate, interval] = useMemo(
    () => getChartRangeParams('30d', organization.created_at),
    [organization.created_at],
  )

  const { data, isLoading } = useMetrics({
    organization_id: organization.id,
    startDate,
    endDate,
    interval,
    metrics: overviewMetrics,
  })

  const [firstMetric, ...restMetrics] = overviewMetrics

  return (
    <div className="flex flex-col gap-y-4">
      <div className="flex justify-end">
        <Button
          variant="secondary"
          size="sm"
          onClick={showManage}
          className="gap-x-1.5"
        >
          <TuneOutlined fontSize="small" />
          <span>Edit metrics</span>
        </Button>
      </div>

      <div className=" flex flex-col overflow-hidden rounded-2xl border border-gray-200">
        <div className="[clip-path:inset(1px_1px_1px_1px)]">
          {/* First metric — full width */}
          <MetricChartBox
            data={data}
            interval={interval}
            metric={firstMetric}
            loading={isLoading}
            height={200}
            chartType="line"
            className=" rounded-none! border-t-0 border-r-0 border-b border-l-0 border-gray-200 bg-transparent shadow-none"
          />

          {/* Rest of metrics — responsive grid */}
          {restMetrics.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
              {restMetrics.map((metricKey) => (
                <MetricChartBox
                  key={metricKey}
                  data={data}
                  interval={interval}
                  metric={metricKey}
                  loading={isLoading}
                  height={200}
                  chartType="line"
                  className={twMerge(
                    'rounded-none! bg-transparent',
                    ' border-t-0 border-r border-b border-l-0 border-gray-200 shadow-none',
                  )}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <Modal
        title="Edit Overview Metrics"
        isShown={isManageOpen}
        hide={hideManage}
        modalContent={
          <ManageMetricsContent
            selectedMetrics={overviewMetrics}
            onUpdate={updateMetrics}
          />
        }
      />
    </div>
  )
}

// --- Cancellation Insights ---

const CancellationInsights = ({
  organization,
}: {
  organization: schemas['Organization']
}) => {
  const [startDate, endDate, interval] = useMemo(
    () => getChartRangeParams('30d', organization.created_at),
    [organization.created_at],
  )

  const { data, isLoading } = useMetrics({
    organization_id: organization.id,
    startDate,
    endDate,
    interval,
    metrics: CANCELLATION_METRICS,
  })

  if (isLoading || !data) {
    return null
  }

  const hasCancellations = data.periods.some(
    (p) => (p.canceled_subscriptions ?? 0) > 0,
  )

  if (!hasCancellations) {
    return null
  }

  return (
    <div className="flex flex-col gap-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Cancellation Insights</h2>
        <Link
          href={`/dashboard/${organization.slug}/analytics/metrics/cancellations`}
          className=" text-sm text-gray-500 hover:underline"
        >
          View full analytics
        </Link>
      </div>
      <div className=" flex flex-col overflow-hidden rounded-2xl border border-gray-200">
        <div className="grid grid-cols-1 [clip-path:inset(1px_1px_1px_1px)] lg:grid-cols-3">
          <div className=" col-span-2 border-t-0 border-r border-b border-l-0 border-gray-200 p-4">
            <CancellationsStackedChart
              data={data}
              interval={interval}
              height={300}
            />
          </div>
          <div className=" border-t-0 border-r border-b border-l-0 border-gray-200 p-4">
            <CancellationsDistributionChart
              data={data}
              interval={interval}
              height={20}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

// --- Overview Page ---

interface OverviewPageProps {
  organization: schemas['Organization']
}

export default function OverviewPage({ organization }: OverviewPageProps) {
  return (
    <DashboardBody className="gap-y-8 pb-16 md:gap-y-10">
      {/* Profile completion banner — disappears when payout is set up */}
      <ProfileCompletionBanner organization={organization} />

      {/* Metric charts — 30-day snapshot */}
      <OverviewMetrics organization={organization} />

      {/* Cancellation insights — only shows if there are cancellations */}
      <CancellationInsights organization={organization} />

      {/* Recent transactions */}
      <OrdersWidget />
    </DashboardBody>
  )
}
