import { getServerURL } from '@/utils/api'

/**
 * The generated API client does not cover the corpus endpoints yet: these are
 * plain typed fetches against `/v1/corpus/*`, same base URL + cookie
 * credentials as the librarian stream.
 */

export interface CorpusActVersion {
  id: string
  label: string
  adopted_on: string | null
  in_force_from: string | null
  gazette_reference: string | null
  transitional_rule: string | null
  article_count: number
}

export interface CorpusAct {
  id: string
  short_code: string
  title: string
  versions: CorpusActVersion[]
}

export interface CorpusArticleListItem {
  id: string
  number: string
  sort_key: number
  heading: string | null
}

export type CorpusEquivalenceRelation =
  | 'unchanged'
  | 'renumbered'
  | 'amended'
  | 'split'
  | 'merged'
  | 'new'
  | 'repealed'

export interface CorpusArticleEquivalence {
  article_id: string
  number: string
  version_label: string
  relation: CorpusEquivalenceRelation
  note: string | null
}

export interface CorpusLinkedDecision {
  id: string
  number: string
  decided_on: string
  summary: string | null
  /** Always null for now: no treatment has been human-accepted yet. */
  treatment: string | null
}

export interface CorpusProvenance {
  source: string | null
  kind: string | null
  authority_crosscheck: string | null
}

export interface CorpusArticleDetail {
  id: string
  number: string
  heading: string | null
  text: string
  alineas: string[]
  version_label: string
  act_short_code: string
  provenance: CorpusProvenance | null
  equivalences: CorpusArticleEquivalence[]
  decisions: CorpusLinkedDecision[]
}

export interface CorpusDecisionArticle {
  article_id: string
  number: string
  version_label: string
}

export interface CorpusDecisionDetail {
  id: string
  number: string
  decided_on: string
  chamber: string | null
  urn_lex: string | null
  ohadata_code: string | null
  source_url: string | null
  summary: string | null
  full_text: string | null
  articles: CorpusDecisionArticle[]
}

export class CorpusRequestError extends Error {
  constructor(public readonly status?: number) {
    super(`Corpus request failed${status ? ` (${status})` : ''}`)
  }
}

const get = async <T>(path: string, signal?: AbortSignal): Promise<T> => {
  const response = await fetch(getServerURL(`/v1/corpus${path}`), {
    credentials: 'include',
    signal,
  })
  if (!response.ok) {
    throw new CorpusRequestError(response.status)
  }
  return (await response.json()) as T
}

export const fetchActs = (signal?: AbortSignal): Promise<CorpusAct[]> =>
  get('/acts', signal)

export const fetchVersionArticles = (
  versionId: string,
  signal?: AbortSignal,
): Promise<CorpusArticleListItem[]> =>
  get(`/versions/${versionId}/articles`, signal)

export const fetchArticle = (
  articleId: string,
  signal?: AbortSignal,
): Promise<CorpusArticleDetail> => get(`/articles/${articleId}`, signal)

export const fetchDecision = (
  decisionId: string,
  signal?: AbortSignal,
): Promise<CorpusDecisionDetail> => get(`/decisions/${decisionId}`, signal)

/** French labels for the old↔new concordance relations. */
export const RELATION_LABELS: Record<CorpusEquivalenceRelation, string> = {
  unchanged: 'inchangé',
  renumbered: 'renuméroté',
  amended: 'modifié',
  split: 'scindé',
  merged: 'fusionné',
  new: 'nouveau',
  repealed: 'abrogé',
}
