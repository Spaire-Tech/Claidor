/**
 * Talking to the tie-out API from inside Office.
 *
 * The shapes here mirror `polar/tieout/schemas.py`. They are written out
 * rather than generated because the panel ships separately from the web
 * app and should not need the whole generated SDK to render a list of
 * eight findings in a 320-pixel column. When they drift, the server is
 * right — its schemas carry the reasoning.
 *
 * **Bearer tokens, not cookies, and this is not a preference.** The panel
 * is an iframe on its own origin inside Office. A `SameSite=Lax` session
 * cookie is never sent with its requests, and Safari and Edge block
 * third-party cookies outright. That is why `tieout:read` and
 * `tieout:write` exist as scopes a token can hold — the whole story is in
 * `polar/tieout/auth.py`.
 */

export interface Anchored {
  kind?: string
  shape_id?: number
  shape_name?: string
  row?: number
  column?: number
  series?: string
  point?: number
  paragraph?: number
  start?: number
  end?: number
  ref?: string
  sheet?: string
}

export interface Finding {
  id: string
  kind: 'drift' | 'audit' | 'contradiction' | 'stale'
  severity: 'error' | 'smell'
  state: 'open' | 'accepted' | 'dismissed' | 'fixed'
  confidence: number | null
  one_tick: boolean
  page: number
  printed: string
  expected: string
  title: string
  where: {
    artifact_id: string | null
    filename: string | null
    label: string
    detail: string
    anchor: Anchored
  }
  source: {
    ref: string | null
    name: string | null
    basis: string | null
    artifact_id: string | null
  }
  context: string
  standard: string | null
  rule: string | null
  created_at: string
}

export interface ChainStep {
  kind: string
  label?: string | null
  ref?: string | null
  name?: string | null
  printed?: string | null
  value?: string | null
  formula?: string | null
  basis?: string | null
  note?: string | null
  inputs: { ref: string; name: string; value: string | null }[]
}

export interface Chain {
  finding_id: string | null
  steps: ChainStep[]
  summary: string
}

export interface Artifact {
  id: string
  kind: 'model' | 'deck' | 'memo' | 'source'
  filename: string
  version: number
  lineage_id: string
  status: 'uploading' | 'processing' | 'ready' | 'failed'
  error: string | null
  counts: Record<string, unknown>
  uploaded_by: { id: string; name: string; avatar_url: string | null } | null
  uploaded_at: string
}

export interface Identified {
  matched_by: 'stamp' | 'filename' | 'none'
  dossier_id: string | null
  dossier_name: string | null
  artifact: Artifact | null
  stamp_lineage_id: string | null
}

export interface DealListItem {
  id: string
  name: string
  client: string | null
  artifacts: number
  open_findings: number
}

export interface Coverage {
  reconciled: number
  agreeing: number
  drifting: number
  unlinked: number
  confirmed: number
  reasons: { reason: string; count: number }[]
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

export interface ApiOptions {
  /** Where the server is. Set once at start-up from the build's config. */
  baseUrl: string
  /** How to get the current bearer token, or null when signed out. */
  token: () => string | null
}

export class TieOutApi {
  constructor(private readonly options: ApiOptions) {}

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = this.options.token()
    const response = await fetch(`${this.options.baseUrl}/v1/tieout${path}`, {
      ...init,
      headers: {
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    })

    if (response.status === 204) return undefined as T
    if (!response.ok) {
      // The server's own sentence, when it wrote one. Every message it
      // sends is meant to be shown to a person as it stands.
      const body = await response.json().catch(() => null)
      const detail =
        (body as { detail?: string } | null)?.detail ??
        (response.status === 401
          ? 'signed out — sign in again from the panel'
          : 'something went wrong')
      throw new ApiError(response.status, detail)
    }
    return (await response.json()) as T
  }

  /** Which deal and which file the open document is. The panel's first call. */
  identify(body: {
    lineage_id?: string | null
    filename?: string | null
    dossier_id?: string | null
  }): Promise<Identified> {
    return this.call('/identify', { method: 'POST', body: JSON.stringify(body) })
  }

  /** The deals this person is on — for « which deal is this document ». */
  deals(): Promise<DealListItem[]> {
    return this.call('/deals')
  }

  /** Findings for one document. What the panel shows, filtered to here. */
  findings(dealId: string, artifactId?: string): Promise<Finding[]> {
    const query = artifactId ? `?artifact_id=${artifactId}` : ''
    return this.call(`/deals/${dealId}/findings${query}`)
  }

  chain(findingId: string): Promise<Chain> {
    return this.call(`/findings/${findingId}/chain`)
  }

  dismiss(findingId: string, state: Finding['state']): Promise<Finding> {
    return this.call(`/findings/${findingId}`, {
      method: 'PATCH',
      body: JSON.stringify({ state }),
    })
  }

  /** Coverage for the deal — « 34 of 40 figures on this deck checked ». */
  async coverage(dealId: string): Promise<Coverage> {
    const deal = await this.call<{ coverage: Coverage }>(`/deals/${dealId}`)
    return deal.coverage
  }

  check(dealId: string): Promise<unknown> {
    return this.call(`/deals/${dealId}/check`, { method: 'POST' })
  }
}
