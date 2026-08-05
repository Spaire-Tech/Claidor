import { useMutation, useQuery } from '@tanstack/react-query'

// ── Masterclass Architect — engine API ──────────────────────────────────────
// POST resolves the pasted channel synchronously (the instant-confirmation
// beat) and enqueues the analysis; the wizard then polls GET until the
// mirror lands (fast pass, ~20s) and the proposals land (deep pass, minutes).
// Failures are never thrown at the creator: they arrive as status="failed"
// with a typed reason the wizard maps to warm fork copy.

export type ArchitectStatus = 'queued' | 'mirror_ready' | 'completed' | 'failed'

export type ArchitectFailureReason =
  | 'not_youtube'
  | 'channel_not_found'
  | 'channel_too_small'
  | 'quota_exhausted'
  | 'upstream_unavailable'
  | 'ai_unavailable'
  | 'ai_output_invalid'

export type ArchitectChannel = {
  title?: string
  handle?: string
  about?: string
  avatar_url?: string
  created_at?: string
  subscriber_count?: number
  video_count?: number
}

export type ArchitectQuote = { text: string; likes: number }

export type ArchitectHighlight = {
  video_id: string
  title: string
  views: number
  baseline_views: number
  outlier_ratio: number
  demand_comment_count: number
  top_quotes?: ArchitectQuote[]
}

export type ArchitectMirror = {
  channel?: ArchitectChannel
  highlights?: ArchitectHighlight[]
}

export type ArchitectEpisode = {
  title: string
  description?: string
  status: 'have' | 'refilm' | 'film'
  source_video_ids?: string[]
  status_reason?: string
}

export type ArchitectSeason = {
  title: string
  episodes: ArchitectEpisode[]
}

export type ArchitectProposal = {
  title: string
  promise: string
  format: 'seasons' | 'chapters'
  format_reason?: string
  confidence: 'high' | 'medium'
  confidence_rationale?: string
  receipts?: {
    videos?: {
      video_id: string
      title: string
      outlier_ratio?: number
      why_it_matters?: string
    }[]
    quotes?: (ArchitectQuote & { video_id?: string })[]
  }
  seasons: ArchitectSeason[]
}

export type ArchitectProposals = {
  recipe_version?: string
  mirror_pattern?: string
  proposals: ArchitectProposal[]
  banked_themes?: { name: string; one_liner?: string }[]
  flagship?: boolean
  no_proposal_reason?: string | null
}

export type ArchitectAnalysis = {
  id: string
  organization_id: string
  input_ref: string
  status: ArchitectStatus
  failure_reason?: ArchitectFailureReason | null
  channel?: ArchitectChannel | null
  faq_answer?: string | null
  mirror?: ArchitectMirror | null
  proposals?: ArchitectProposals | null
  mirror_ready_at?: string | null
  completed_at?: string | null
}

async function architectApiFetch<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`API ${res.status}: ${text}`)
  }
  return res.json()
}

export const useStartArchitectAnalysis = () =>
  useMutation({
    mutationFn: (body: {
      organization_id: string
      ref: string
      faq_answer?: string | null
    }) =>
      architectApiFetch<ArchitectAnalysis>(
        '/v1/masterclass-architect/analyses',
        { method: 'POST', body: JSON.stringify(body) },
      ),
  })

const TERMINAL: ArchitectStatus[] = ['completed', 'failed']

export const useArchitectAnalysis = (analysisId: string | null) =>
  useQuery({
    queryKey: ['masterclass-architect', 'analysis', analysisId],
    queryFn: () =>
      architectApiFetch<ArchitectAnalysis>(
        `/v1/masterclass-architect/analyses/${analysisId}`,
      ),
    enabled: !!analysisId,
    // Poll while the engine works; stop the moment the run is terminal.
    refetchInterval: (query) => {
      const status = query.state.data?.status
      if (status && TERMINAL.includes(status)) return false
      return 2500
    },
    refetchIntervalInBackground: true,
  })

export const useSetArchitectFaq = () =>
  useMutation({
    mutationFn: ({
      analysisId,
      faqAnswer,
    }: {
      analysisId: string
      faqAnswer: string
    }) =>
      architectApiFetch<ArchitectAnalysis>(
        `/v1/masterclass-architect/analyses/${analysisId}/faq`,
        { method: 'PATCH', body: JSON.stringify({ faq_answer: faqAnswer }) },
      ),
  })

// Footage-map roll-up for a proposal card: "7 of 11 episodes have source
// material · 2 worth re-filming · 2 to film".
export const footageCounts = (proposal: ArchitectProposal) => {
  const counts = { have: 0, refilm: 0, film: 0, total: 0 }
  for (const season of proposal.seasons ?? []) {
    for (const episode of season.episodes ?? []) {
      counts.total += 1
      counts[episode.status] = (counts[episode.status] ?? 0) + 1
    }
  }
  return counts
}
