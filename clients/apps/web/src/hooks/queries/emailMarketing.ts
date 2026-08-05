import { getServerURL } from '@/utils/api'
import { getQueryClient } from '@/utils/api/query'
import { api } from '@/utils/client'
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'
import { defaultRetry } from './retry'

// Helper for fetching JSON from API endpoints with credentials
const fetchApi = async <T>(path: string): Promise<T> => {
  const res = await fetch(getServerURL(path), { credentials: 'include' })
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

const fetchApiWrite = async <T>(
  path: string,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  body?: unknown,
): Promise<T> => {
  const res = await fetch(getServerURL(path), {
    method,
    credentials: 'include',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  if (res.status === 204) return undefined as T
  return res.json()
}

// ── Subscribers ──

export const useEmailSubscribers = (
  organizationId: string,
  parameters?: {
    status?: string
    q?: string
    page?: number
    limit?: number
  },
) =>
  useQuery({
    queryKey: ['email_subscribers', { organizationId, ...(parameters || {}) }],
    queryFn: () => {
      const qs = new URLSearchParams({ organization_id: organizationId })
      if (parameters?.status) qs.set('status', parameters.status)
      if (parameters?.q) qs.set('q', parameters.q)
      if (parameters?.page) qs.set('page', String(parameters.page))
      if (parameters?.limit) qs.set('limit', String(parameters.limit))
      return fetchApi<{
        items: SubscriberRow[]
        pagination: { total_count: number; max_page: number }
      }>(`/v1/email-subscribers/?${qs}`)
    },
    retry: defaultRetry,
    placeholderData: keepPreviousData,
  })

export type SubscriberRow = {
  id: string
  organization_id: string
  email: string
  name: string | null
  status: 'active' | 'unsubscribed' | 'archived' | 'invalid'
  source: string
  import_source: string | null
  customer_id: string | null
  email_verified_at: string | null
  unsubscribed_at: string | null
  created_at: string
  modified_at: string | null
}

export type SubscriberStats = {
  total: number
  active: number
  unsubscribed: number
  archived: number
  invalid: number
  added_30d: number
  unsubs_30d: number
  avg_daily_growth_30d: number
  unsub_rate_30d: number
}

export const useEmailSubscriberStats = (organizationId: string) =>
  useQuery({
    queryKey: ['email_subscriber_stats', organizationId],
    queryFn: () =>
      fetchApi<SubscriberStats>(
        `/v1/email-subscribers/stats?organization_id=${organizationId}`,
      ),
    retry: defaultRetry,
  })

export const useSubscriberDailyGrowth = (organizationId: string, days = 30) =>
  useQuery({
    queryKey: ['subscriber_daily_growth', organizationId, days],
    queryFn: () =>
      fetchApi<{ day: string; count: number }[]>(
        `/v1/email-subscribers/daily-growth?organization_id=${organizationId}&days=${days}`,
      ),
    retry: defaultRetry,
  })

export const useSubscriberDailyUnsubscribes = (
  organizationId: string,
  days = 30,
) =>
  useQuery({
    queryKey: ['subscriber_daily_unsubscribes', organizationId, days],
    queryFn: () =>
      fetchApi<{ day: string; count: number }[]>(
        `/v1/email-subscribers/daily-unsubscribes?organization_id=${organizationId}&days=${days}`,
      ),
    retry: defaultRetry,
  })

export const useCreateEmailSubscriber = (organizationId: string) =>
  useMutation({
    mutationFn: (body: { email: string; name?: string }) =>
      api.POST('/v1/email-subscribers/', {
        params: { query: { organization_id: organizationId } },
        body,
      }),
    onSuccess: () => {
      getQueryClient().invalidateQueries({
        queryKey: ['email_subscribers'],
      })
      getQueryClient().invalidateQueries({
        queryKey: ['email_subscriber_stats'],
      })
    },
  })

export const useUpdateEmailSubscriber = () =>
  useMutation({
    mutationFn: ({
      subscriberId,
      body,
    }: {
      subscriberId: string
      body: { name?: string; status?: string }
    }) =>
      api.PATCH('/v1/email-subscribers/{subscriber_id}', {
        params: { path: { subscriber_id: subscriberId } },
        body,
      }),
    onSuccess: () => {
      getQueryClient().invalidateQueries({
        queryKey: ['email_subscribers'],
      })
      getQueryClient().invalidateQueries({
        queryKey: ['email_subscriber_stats'],
      })
    },
  })

export const useDeleteEmailSubscriber = () =>
  useMutation({
    mutationFn: (subscriberId: string) =>
      fetchApiWrite<void>(`/v1/email-subscribers/${subscriberId}`, 'DELETE'),
    onSuccess: () => {
      getQueryClient().invalidateQueries({ queryKey: ['email_subscribers'] })
      getQueryClient().invalidateQueries({
        queryKey: ['email_subscriber_stats'],
      })
    },
  })

export const usePermanentlyDeleteEmailSubscriber = () =>
  useMutation({
    mutationFn: (subscriberId: string) =>
      fetchApiWrite<void>(
        `/v1/email-subscribers/${subscriberId}/permanent`,
        'DELETE',
      ),
    onSuccess: () => {
      getQueryClient().invalidateQueries({ queryKey: ['email_subscribers'] })
      getQueryClient().invalidateQueries({
        queryKey: ['email_subscriber_stats'],
      })
    },
  })

export const useBulkCreateEmailSubscribers = (organizationId: string) =>
  useMutation({
    mutationFn: (body: {
      rows: { email: string; name?: string }[]
      import_source?: string
    }) =>
      fetchApiWrite<{ created: number; updated: number; skipped: number }>(
        `/v1/email-subscribers/bulk?organization_id=${organizationId}`,
        'POST',
        body,
      ),
    onSuccess: () => {
      getQueryClient().invalidateQueries({ queryKey: ['email_subscribers'] })
      getQueryClient().invalidateQueries({
        queryKey: ['email_subscriber_stats'],
      })
    },
  })

export type SubscribersImportResult = {
  created: number
  updated: number
  skipped: number
  errors: { row: number; message: string }[]
}

/**
 * Multipart upload to the server-side CSV importer (audit #36 / fix-list
 * #36). The previous flow parsed the file in the browser with a naive
 * comma-split, dropping any row with quoted fields, embedded newlines,
 * or a BOM. The endpoint uses Python's csv.DictReader and returns
 * row-level error messages so the dashboard can show what failed.
 */
export const useImportEmailSubscribersCsv = (organizationId: string) =>
  useMutation({
    mutationFn: async (
      file: File,
    ): Promise<SubscribersImportResult> => {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(
        getServerURL(
          `/v1/email-subscribers/import-csv?organization_id=${organizationId}`,
        ),
        {
          method: 'POST',
          body: form,
          credentials: 'include',
        },
      )
      if (!res.ok) {
        let detail = `${res.status} ${res.statusText}`
        try {
          const body = (await res.json()) as { detail?: string }
          if (body.detail) detail = body.detail
        } catch {
          // body wasn't JSON — keep status as the message.
        }
        throw new Error(detail)
      }
      return (await res.json()) as SubscribersImportResult
    },
    onSuccess: () => {
      getQueryClient().invalidateQueries({ queryKey: ['email_subscribers'] })
      getQueryClient().invalidateQueries({
        queryKey: ['email_subscriber_stats'],
      })
    },
  })

// ── Broadcasts ──

export type BroadcastAggregateMetrics = {
  total_sent: number
  delivered: number
  opened: number
  clicked: number
  unsubscribed: number
  // Audit issue #11 / fix-list #30: rates are null when we have no
  // delivery signal (Resend webhooks not wired). Tiles show "—" in that
  // case; previously the backend silently fell back to total_sent and
  // displayed inflated rates.
  open_rate: number | null
  click_rate: number | null
  unsub_rate: number | null
  // True when the org has at least one webhook-confirmed delivery, so
  // rates above can be trusted. False means the dashboard is showing
  // raw send counts only and the Resend webhook hasn't fired yet.
  webhook_signal_present: boolean
}

export type BroadcastAggregateAnalytics = {
  current: BroadcastAggregateMetrics
  prior: BroadcastAggregateMetrics | null
  delta: {
    total_sent_pct?: number | null
    open_rate_pt?: number | null
    click_rate_pt?: number | null
    unsub_rate_pt?: number | null
  }
  industry: {
    slug: string
    label: string
    source: string
    open_rate: number
    click_rate: number
    unsub_rate: number
  }
}

export const useBroadcastAggregateAnalytics = (
  organizationId: string,
  options: { days?: number; comparePrior?: boolean } = {},
) => {
  const { days, comparePrior = false } = options
  const params = new URLSearchParams({ organization_id: organizationId })
  if (days != null) params.set('days', String(days))
  if (comparePrior) params.set('compare_prior', 'true')
  return useQuery({
    queryKey: [
      'broadcast_aggregate_analytics',
      organizationId,
      days,
      comparePrior,
    ],
    queryFn: () =>
      fetchApi<BroadcastAggregateAnalytics>(
        `/v1/email-broadcasts/aggregate-analytics?${params.toString()}`,
      ),
    retry: defaultRetry,
  })
}

export type BroadcastEngagementHeatmap = {
  matrix: (number | null)[][]
  sample_size: number
  threshold: number
}

export const useBroadcastEngagementHeatmap = (
  organizationId: string,
  days = 90,
) =>
  useQuery({
    queryKey: ['broadcast_engagement_heatmap', organizationId, days],
    queryFn: () =>
      fetchApi<BroadcastEngagementHeatmap>(
        `/v1/email-broadcasts/engagement-heatmap?organization_id=${organizationId}&days=${days}`,
      ),
    retry: defaultRetry,
  })

export const useBroadcastDailySends = (organizationId: string, days = 30) =>
  useQuery({
    queryKey: ['broadcast_daily_sends', organizationId, days],
    queryFn: () =>
      fetchApi<{ day: string; count: number }[]>(
        `/v1/email-broadcasts/daily-sends?organization_id=${organizationId}&days=${days}`,
      ),
    retry: defaultRetry,
  })

export type BroadcastRowAnalytics = {
  recipients: number
  delivered: number
  opens: number
  clicks: number
  unsubs: number
  open_rate: number
  click_rate: number
}

export type FilterRule = {
  field: string
  op: string
  value?: string | number | null
}

export type FilterRules = {
  all?: FilterRule[]
}

export type BroadcastRow = {
  id: string
  organization_id: string
  subject: string
  preview_text: string | null
  sender_name: string
  sender_email: string
  reply_to_email: string | null
  filter_rules: FilterRules | null
  content_json: Record<string, unknown> | null
  content_html: string | null
  segment_id: string | null
  status:
    | 'draft'
    | 'pending_approval'
    | 'sending'
    | 'sent'
    | 'failed'
    | 'scheduled'
  scheduled_at: string | null
  sent_at: string | null
  total_recipients: number
  created_at: string
  modified_at: string | null
  analytics: BroadcastRowAnalytics | null
}

export const useEmailBroadcasts = (
  organizationId: string,
  parameters?: {
    status?: string
    q?: string
    page?: number
    limit?: number
    include_analytics?: boolean
  },
) =>
  useQuery({
    queryKey: ['email_broadcasts', { organizationId, ...(parameters || {}) }],
    queryFn: () => {
      const qs = new URLSearchParams({ organization_id: organizationId })
      if (parameters?.status) qs.set('status', parameters.status)
      if (parameters?.q) qs.set('q', parameters.q)
      if (parameters?.page) qs.set('page', String(parameters.page))
      if (parameters?.limit) qs.set('limit', String(parameters.limit))
      if (parameters?.include_analytics === false)
        qs.set('include_analytics', 'false')
      return fetchApi<{
        items: BroadcastRow[]
        pagination: { total_count: number; max_page: number }
      }>(`/v1/email-broadcasts/?${qs}`)
    },
    retry: defaultRetry,
    placeholderData: keepPreviousData,
  })

export const useEmailBroadcast = (broadcastId: string) =>
  useQuery({
    queryKey: ['email_broadcast', broadcastId],
    queryFn: () =>
      api
        .GET('/v1/email-broadcasts/{broadcast_id}', {
          params: { path: { broadcast_id: broadcastId } },
        })
        .then((r) => r.data),
    retry: defaultRetry,
    enabled: !!broadcastId,
  })

export type BroadcastSendRow = {
  id: string
  subscriber_id: string
  subscriber_email: string
  subscriber_name: string | null
  status: string
  sent_at: string | null
  opened_at: string | null
  open_count: number
  clicked_at: string | null
  click_count: number
  bounced_at: string | null
  unsubscribed_at: string | null
}

export const useEmailBroadcastSends = (
  broadcastId: string,
  parameters?: { page?: number; limit?: number },
) =>
  useQuery({
    queryKey: ['email_broadcast_sends', { broadcastId, ...(parameters || {}) }],
    queryFn: () => {
      const qs = new URLSearchParams()
      if (parameters?.page) qs.set('page', String(parameters.page))
      if (parameters?.limit) qs.set('limit', String(parameters.limit))
      return fetchApi<{
        items: BroadcastSendRow[]
        pagination: { total_count: number; max_page: number }
      }>(`/v1/email-broadcasts/${broadcastId}/sends?${qs}`)
    },
    retry: defaultRetry,
    enabled: !!broadcastId,
    placeholderData: keepPreviousData,
  })

export const useDuplicateEmailBroadcast = () =>
  useMutation({
    mutationFn: (broadcastId: string) =>
      fetchApiWrite<BroadcastRow>(
        `/v1/email-broadcasts/${broadcastId}/duplicate`,
        'POST',
      ),
    onSuccess: () => {
      getQueryClient().invalidateQueries({ queryKey: ['email_broadcasts'] })
    },
  })

export const useCancelScheduledEmailBroadcast = () =>
  useMutation({
    mutationFn: (broadcastId: string) =>
      fetchApiWrite<BroadcastRow>(
        `/v1/email-broadcasts/${broadcastId}/cancel-schedule`,
        'POST',
      ),
    onSuccess: () => {
      getQueryClient().invalidateQueries({ queryKey: ['email_broadcasts'] })
    },
  })

export type ABTestConfig = {
  id: string
  broadcast_id: string
  subject_b: string
  slice_pct: number
  decide_after_minutes: number
  winner_metric: 'open_rate' | 'click_rate'
  winner_variant: 'a' | 'b' | null
  test_sent_at: string | null
  winner_picked_at: string | null
}

export type ABVariantStats = {
  total: number
  delivered: number
  opened: number
  clicked: number
  open_rate: number
  click_rate: number
}

export type ABTestState = {
  config: ABTestConfig | null
  variants: { a: ABVariantStats; b: ABVariantStats } | null
}

export const useEmailBroadcastABTest = (broadcastId: string) =>
  useQuery({
    queryKey: ['email_broadcast_ab_test', broadcastId],
    queryFn: () =>
      fetchApi<ABTestState>(`/v1/email-broadcasts/${broadcastId}/ab-test`),
    retry: defaultRetry,
    enabled: !!broadcastId,
  })

export const useUpsertEmailBroadcastABTest = () =>
  useMutation({
    mutationFn: ({
      broadcastId,
      body,
    }: {
      broadcastId: string
      body: {
        subject_b: string
        slice_pct: number
        decide_after_minutes: number
        winner_metric: 'open_rate' | 'click_rate'
      }
    }) =>
      fetchApiWrite<ABTestConfig>(
        `/v1/email-broadcasts/${broadcastId}/ab-test`,
        'PUT',
        body,
      ),
    onSuccess: (_data, vars) => {
      getQueryClient().invalidateQueries({
        queryKey: ['email_broadcast_ab_test', vars.broadcastId],
      })
    },
  })

export const useDeleteEmailBroadcastABTest = () =>
  useMutation({
    mutationFn: (broadcastId: string) =>
      fetchApiWrite<void>(
        `/v1/email-broadcasts/${broadcastId}/ab-test`,
        'DELETE',
      ),
    onSuccess: (_data, broadcastId) => {
      getQueryClient().invalidateQueries({
        queryKey: ['email_broadcast_ab_test', broadcastId],
      })
    },
  })

export type GeneratedEmailCopy = {
  subject: string
  preview: string
  heading: string
  body: string[]
}

/** Generate lifecycle recap copy from a course (Claude) — brick 16. */
export const useGenerateEmailCopy = () =>
  useMutation({
    mutationFn: ({ courseId, moment }: { courseId: string; moment: string }) =>
      fetchApiWrite<GeneratedEmailCopy>(
        `/v1/email-broadcasts/generate-copy`,
        'POST',
        { course_id: courseId, moment },
      ),
  })

export const useUploadEmailImage = (organizationId: string) =>
  useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(
        getServerURL(
          `/v1/email-broadcasts/upload-image?organization_id=${organizationId}`,
        ),
        { method: 'POST', credentials: 'include', body: form },
      )
      if (!res.ok) {
        throw new Error(`Upload failed: ${res.status}`)
      }
      return (await res.json()) as { url: string }
    },
  })

// Send a test of in-progress authored content to the creator's own inbox —
// used by the sequence email editor's "Send test to me".
export const useSendTestEmail = (organizationId: string) =>
  useMutation({
    mutationFn: async (payload: {
      subject: string
      content_html: string
      preview_text?: string | null
      sender_name?: string | null
      to_email?: string | null
    }) => {
      const res = await fetch(
        getServerURL(
          `/v1/email-broadcasts/test-inline?organization_id=${organizationId}`,
        ),
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      )
      if (!res.ok) {
        throw new Error(`Test send failed: ${res.status}`)
      }
    },
  })

export const useArchiveEmailBroadcast = () =>
  useMutation({
    mutationFn: (broadcastId: string) =>
      fetchApiWrite<void>(`/v1/email-broadcasts/${broadcastId}`, 'DELETE'),
    onSuccess: () => {
      getQueryClient().invalidateQueries({ queryKey: ['email_broadcasts'] })
    },
  })

export type BroadcastWritePayload = {
  subject?: string
  preview_text?: string | null
  sender_name?: string
  // Optional From-address. The server falls back to the org's notifications
  // sender when omitted; phase 4 plumbed this through Create as well so the
  // editor's From input can write a real value.
  sender_email?: string | null
  reply_to_email?: string | null
  content_html?: string | null
  content_json?: Record<string, unknown> | null
  segment_id?: string | null
  filter_rules?: FilterRules | null
}

export const useCreateEmailBroadcast = (organizationId: string) =>
  useMutation({
    mutationFn: (
      body: BroadcastWritePayload & { subject: string; sender_name: string },
    ) =>
      fetchApiWrite<BroadcastRow>(
        `/v1/email-broadcasts/?organization_id=${organizationId}`,
        'POST',
        body,
      ),
    onSuccess: () => {
      getQueryClient().invalidateQueries({ queryKey: ['email_broadcasts'] })
    },
  })

export const useUpdateEmailBroadcast = () =>
  useMutation({
    mutationFn: ({
      broadcastId,
      body,
    }: {
      broadcastId: string
      body: BroadcastWritePayload
    }) =>
      fetchApiWrite<BroadcastRow>(
        `/v1/email-broadcasts/${broadcastId}`,
        'PATCH',
        body,
      ),
    onSuccess: (_d, { broadcastId }) => {
      getQueryClient().invalidateQueries({ queryKey: ['email_broadcasts'] })
      getQueryClient().invalidateQueries({
        queryKey: ['email_broadcast', broadcastId],
      })
    },
  })

export const useScheduleEmailBroadcast = () =>
  useMutation({
    mutationFn: ({
      broadcastId,
      scheduledAt,
    }: {
      broadcastId: string
      scheduledAt: string
    }) =>
      fetchApiWrite<BroadcastRow>(
        `/v1/email-broadcasts/${broadcastId}/schedule`,
        'POST',
        { scheduled_at: scheduledAt },
      ),
    onSuccess: () => {
      getQueryClient().invalidateQueries({ queryKey: ['email_broadcasts'] })
    },
  })

export const useSendTestEmailBroadcast = () =>
  useMutation({
    mutationFn: ({
      broadcastId,
      email,
    }: {
      broadcastId: string
      email: string
    }) =>
      fetchApiWrite<void>(`/v1/email-broadcasts/${broadcastId}/test`, 'POST', {
        email,
      }),
  })

export const useSendEmailBroadcast = () =>
  useMutation({
    mutationFn: (broadcastId: string) =>
      fetchApiWrite<BroadcastRow>(
        `/v1/email-broadcasts/${broadcastId}/send`,
        'POST',
      ),
    onSuccess: () => {
      getQueryClient().invalidateQueries({ queryKey: ['email_broadcasts'] })
    },
  })

export type BroadcastAnalytics = {
  total_recipients: number
  sent: number
  delivered: number
  opened: number
  clicked: number
  bounced: number
  unsubscribed: number
  open_rate: number
  click_rate: number
  // True if any delivered / opened / clicked webhook has landed for
  // this broadcast — false means tracking probably isn't configured
  // on the sending domain. The detail page uses this to distinguish
  // "0% engagement" from "tracking off". Backend started returning
  // this with the open/click rate tracking fix.
  webhook_signal_present?: boolean
}

export const useEmailBroadcastAnalytics = (broadcastId: string) =>
  useQuery({
    queryKey: ['email_broadcast_analytics', broadcastId],
    queryFn: () =>
      fetchApi<BroadcastAnalytics>(
        `/v1/email-broadcasts/${broadcastId}/analytics`,
      ),
    retry: defaultRetry,
    enabled: !!broadcastId,
  })

export const useBroadcastTopLinks = (
  organizationId: string,
  days = 14,
  limit = 5,
) =>
  useQuery({
    queryKey: ['broadcast_top_links', organizationId, days, limit],
    queryFn: () =>
      fetchApi<{ url: string; clicks: number; ctr: number }[]>(
        `/v1/email-broadcasts/top-links?organization_id=${organizationId}&days=${days}&limit=${limit}`,
      ),
    retry: defaultRetry,
  })

export const useBroadcastDevices = (organizationId: string, days = 90) =>
  useQuery({
    queryKey: ['broadcast_devices', organizationId, days],
    queryFn: () =>
      fetchApi<{ name: string; share: number }[]>(
        `/v1/email-broadcasts/devices?organization_id=${organizationId}&days=${days}`,
      ),
    retry: defaultRetry,
  })

export const useBroadcastDailyEngagement = (
  organizationId: string,
  days = 14,
) =>
  useQuery({
    queryKey: ['broadcast_daily_engagement', organizationId, days],
    queryFn: () =>
      fetchApi<{ day: string; open_rate: number; click_rate: number }[]>(
        `/v1/email-broadcasts/daily-engagement?organization_id=${organizationId}&days=${days}`,
      ),
    retry: defaultRetry,
  })

export const useSegmentFilterPreview = (
  organizationId: string,
  filterRules: FilterRules | null,
  enabled: boolean,
) =>
  useQuery({
    queryKey: ['segment_filter_preview', organizationId, filterRules],
    queryFn: () =>
      fetchApiWrite<{
        count: number
        sample: SubscriberRow[]
      }>(
        `/v1/email-subscribers/segment-preview?organization_id=${organizationId}`,
        'POST',
        { filter_rules: filterRules },
      ),
    retry: defaultRetry,
    enabled,
    placeholderData: keepPreviousData,
  })

// ── Segments ──

export const useEmailSegments = (organizationId: string) =>
  useQuery({
    queryKey: ['email_segments', organizationId],
    queryFn: () =>
      api
        .GET('/v1/email-segments/', {
          params: { query: { organization_id: organizationId } },
        })
        .then((r) => r.data),
    retry: defaultRetry,
  })

export const useCreateEmailSegment = (organizationId: string) =>
  useMutation({
    mutationFn: (body: {
      name: string
      slug: string
      type?: string
      product_id?: string
    }) =>
      api.POST('/v1/email-segments/', {
        params: { query: { organization_id: organizationId } },
        body,
      }),
    onSuccess: () => {
      getQueryClient().invalidateQueries({
        queryKey: ['email_segments'],
      })
    },
  })

export const useDeleteEmailSegment = () =>
  useMutation({
    mutationFn: (segmentId: string) =>
      api.DELETE('/v1/email-segments/{segment_id}', {
        params: { path: { segment_id: segmentId } },
      }),
    onSuccess: () => {
      getQueryClient().invalidateQueries({
        queryKey: ['email_segments'],
      })
    },
  })

// ── Storefront Subscribe (public) ──

export const useStorefrontSubscribe = () =>
  useMutation({
    mutationFn: ({
      slug,
      email,
      name,
    }: {
      slug: string
      email: string
      name?: string
    }) =>
      api.POST('/v1/storefronts/{slug}/subscribe', {
        params: { path: { slug } },
        body: { email, name },
      }),
  })

// ── Sequence raw fetch helpers (endpoints not yet in generated client) ──

const seqFetch = async <T>(path: string): Promise<T> => {
  const res = await fetch(getServerURL(path), { credentials: 'include' })
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

const seqMutate = async <T>(
  path: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  body?: unknown,
): Promise<T> => {
  const res = await fetch(getServerURL(path), {
    method,
    credentials: 'include',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  if (res.status === 204) return undefined as T
  return res.json()
}

// ── Email Sequences ──

export const useEmailSequences = (
  organizationId: string,
  params?: {
    page?: number
    limit?: number
    courseId?: string
    lessonId?: string
  },
) =>
  useQuery({
    queryKey: ['email_sequences', { organizationId, ...(params ?? {}) }],
    queryFn: () => {
      const qs = new URLSearchParams({ organization_id: organizationId })
      if (params?.page) qs.set('page', String(params.page))
      if (params?.limit) qs.set('limit', String(params.limit))
      if (params?.courseId) qs.set('course_id', params.courseId)
      if (params?.lessonId) qs.set('lesson_id', params.lessonId)
      return seqFetch<any>(`/v1/email-sequences/?${qs}`)
    },
    retry: defaultRetry,
    placeholderData: keepPreviousData,
  })

export const useEmailSequence = (sequenceId: string) =>
  useQuery({
    queryKey: ['email_sequence', sequenceId],
    queryFn: () => seqFetch<any>(`/v1/email-sequences/${sequenceId}`),
    retry: defaultRetry,
    enabled: !!sequenceId,
  })

export const useCreateEmailSequence = (organizationId: string) =>
  useMutation({
    mutationFn: (body: {
      name: string
      description?: string
      trigger_type?: string
      trigger_config?: Record<string, unknown>
      // Optional flow_doc — server merges it into trigger_config.flow_doc.
      // The editor uses this so a fresh sequence can ship with the full
      // authored flow on first save (audit issue #27).
      flow_doc?: Record<string, unknown>
      course_id?: string
      lesson_id?: string
    }) =>
      seqMutate<any>(
        `/v1/email-sequences/?organization_id=${organizationId}`,
        'POST',
        body,
      ),
    onSuccess: () => {
      getQueryClient().invalidateQueries({ queryKey: ['email_sequences'] })
    },
  })

export const useUpdateEmailSequence = () =>
  useMutation({
    mutationFn: ({
      sequenceId,
      ...body
    }: {
      sequenceId: string
      name?: string
      description?: string
      trigger_type?: string
      trigger_config?: Record<string, unknown>
      lesson_id?: string | null
      status?: string
    }) => seqMutate<any>(`/v1/email-sequences/${sequenceId}`, 'PATCH', body),
    onSuccess: (_data, vars) => {
      getQueryClient().invalidateQueries({ queryKey: ['email_sequences'] })
      getQueryClient().invalidateQueries({
        queryKey: ['email_sequence', vars.sequenceId],
      })
    },
  })

export const useDeleteEmailSequence = () =>
  useMutation({
    mutationFn: (sequenceId: string) =>
      seqMutate<void>(`/v1/email-sequences/${sequenceId}`, 'DELETE'),
    onSuccess: () => {
      getQueryClient().invalidateQueries({ queryKey: ['email_sequences'] })
    },
  })

// ── Sequence Steps ──

export const useSequenceSteps = (sequenceId: string) =>
  useQuery({
    queryKey: ['email_sequence_steps', sequenceId],
    queryFn: () => seqFetch<any[]>(`/v1/email-sequences/${sequenceId}/steps`),
    retry: defaultRetry,
    enabled: !!sequenceId,
  })

export const useCreateSequenceStep = (sequenceId: string) =>
  useMutation({
    mutationFn: (body: {
      delay_hours?: number
      subject: string
      sender_name: string
      sender_email?: string
      reply_to_email?: string
      content_html?: string
      flow_step_id?: string
    }) =>
      seqMutate<{ id: string; flow_step_id: string | null }>(
        `/v1/email-sequences/${sequenceId}/steps`,
        'POST',
        body,
      ),
    onSuccess: () => {
      getQueryClient().invalidateQueries({
        queryKey: ['email_sequence_steps', sequenceId],
      })
    },
  })

export const useUpdateSequenceStep = (sequenceId: string) =>
  useMutation({
    mutationFn: ({
      stepId,
      ...body
    }: {
      stepId: string
      delay_hours?: number
      subject?: string
      sender_name?: string
      sender_email?: string
      reply_to_email?: string
      content_html?: string
      flow_step_id?: string
    }) =>
      seqMutate<any>(
        `/v1/email-sequences/${sequenceId}/steps/${stepId}`,
        'PATCH',
        body,
      ),
    onSuccess: () => {
      getQueryClient().invalidateQueries({
        queryKey: ['email_sequence_steps', sequenceId],
      })
    },
  })

export const useDeleteSequenceStep = (sequenceId: string) =>
  useMutation({
    mutationFn: (stepId: string) =>
      seqMutate<void>(
        `/v1/email-sequences/${sequenceId}/steps/${stepId}`,
        'DELETE',
      ),
    onSuccess: () => {
      getQueryClient().invalidateQueries({
        queryKey: ['email_sequence_steps', sequenceId],
      })
    },
  })

export const useReorderSequenceSteps = (sequenceId: string) =>
  useMutation({
    mutationFn: (items: Array<{ id: string; position: number }>) =>
      seqMutate<void>(
        `/v1/email-sequences/${sequenceId}/steps/reorder`,
        'POST',
        items,
      ),
    onSuccess: () => {
      getQueryClient().invalidateQueries({
        queryKey: ['email_sequence_steps', sequenceId],
      })
    },
  })

// ── Sequence Enrollments ──

export const useSequenceEnrollments = (sequenceId: string) =>
  useQuery({
    queryKey: ['email_sequence_enrollments', sequenceId],
    queryFn: () =>
      seqFetch<any[]>(`/v1/email-sequences/${sequenceId}/enrollments`),
    retry: defaultRetry,
    enabled: !!sequenceId,
  })

export const useEnrollSubscriber = (sequenceId: string) =>
  useMutation({
    mutationFn: (subscriberId: string) =>
      seqMutate<any>(`/v1/email-sequences/${sequenceId}/enrollments`, 'POST', {
        subscriber_id: subscriberId,
      }),
    onSuccess: () => {
      getQueryClient().invalidateQueries({
        queryKey: ['email_sequence_enrollments', sequenceId],
      })
    },
  })

export const useUnenrollSubscriber = (sequenceId: string) =>
  useMutation({
    mutationFn: (subscriberId: string) =>
      seqMutate<void>(
        `/v1/email-sequences/${sequenceId}/enrollments/${subscriberId}`,
        'DELETE',
      ),
    onSuccess: () => {
      getQueryClient().invalidateQueries({
        queryKey: ['email_sequence_enrollments', sequenceId],
      })
    },
  })

// ── Sequence Analytics ──

export const useSequenceAnalytics = (sequenceId: string) =>
  useQuery({
    queryKey: ['email_sequence_analytics', sequenceId],
    queryFn: () => seqFetch<any>(`/v1/email-sequences/${sequenceId}/analytics`),
    retry: defaultRetry,
    enabled: !!sequenceId,
  })

// ── Sequence Step Analytics + Send-test ──

export type SequenceStepAnalyticsRow = {
  step_id: string
  sent: number
  delivered: number
  opened: number
  clicked: number
  bounced: number
  open_rate: number
  click_rate: number
}

export const useSequenceStepAnalytics = (sequenceId: string) =>
  useQuery({
    queryKey: ['email_sequence_step_analytics', sequenceId],
    queryFn: () =>
      seqFetch<SequenceStepAnalyticsRow[]>(
        `/v1/email-sequences/${sequenceId}/step-analytics`,
      ),
    retry: defaultRetry,
    enabled: !!sequenceId,
  })

export const useSendTestSequenceStep = () =>
  useMutation({
    mutationFn: ({
      sequenceId,
      stepId,
      email,
    }: {
      sequenceId: string
      stepId: string
      email: string
    }) =>
      seqMutate<void>(
        `/v1/email-sequences/${sequenceId}/steps/${stepId}/test`,
        'POST',
        { email },
      ),
  })

// ── Sequence Duplicate / Image Upload ──

export const useDuplicateEmailSequence = () =>
  useMutation({
    mutationFn: (sequenceId: string) =>
      seqMutate<any>(`/v1/email-sequences/${sequenceId}/duplicate`, 'POST'),
    onSuccess: () => {
      getQueryClient().invalidateQueries({ queryKey: ['email_sequences'] })
    },
  })

export const useUploadSequenceImage = (organizationId: string) =>
  useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(
        getServerURL(
          `/v1/email-sequences/upload-image?organization_id=${organizationId}`,
        ),
        { method: 'POST', credentials: 'include', body: form },
      )
      if (!res.ok) throw new Error(`Upload failed: ${res.status}`)
      return (await res.json()) as { url: string }
    },
  })

// ── Sequence Templates ──

export type SequenceTemplateFlowDoc = {
  version: 1
  steps: Array<{ id: string; type: string; value: Record<string, unknown> }>
  [key: string]: unknown
}

export type SequenceTemplate = {
  slug: string
  name: string
  description: string
  category: string
  trigger_type: string
  step_count: number
  flow_doc: SequenceTemplateFlowDoc | null
}

export const useEmailSequenceTemplates = () =>
  useQuery({
    queryKey: ['email_sequence_templates'],
    queryFn: () =>
      seqFetch<SequenceTemplate[]>(`/v1/email-sequences/templates`),
    retry: defaultRetry,
  })

export const useCreateSequenceFromTemplate = (organizationId: string) =>
  useMutation({
    mutationFn: (body: {
      slug: string
      course_id?: string
      lesson_id?: string
    }) =>
      seqMutate<any>(
        `/v1/email-sequences/from-template?organization_id=${organizationId}`,
        'POST',
        body,
      ),
    onSuccess: () => {
      getQueryClient().invalidateQueries({ queryKey: ['email_sequences'] })
    },
  })
