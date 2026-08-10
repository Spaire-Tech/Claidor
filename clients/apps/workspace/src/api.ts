/**
 * Talking to the tie-out API.
 *
 * The shapes here mirror `polar/tieout/schemas.py`. When they drift, the
 * server is right — its schemas carry the reasoning.
 *
 * The workspace runs in a browser on the dashboard's own origin, so it
 * sends the session cookie and needs no token. The Office panel is the
 * one that cannot: it is an iframe on a different origin, where a
 * `SameSite=Lax` cookie is never sent. Both talk to the same routes.
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

export interface Link {
  id: string
  state: 'proposed' | 'confirmed' | 'rejected'
  confidence: number
  transformation: string
  figure: {
    id: string
    printed: string
    label: string
    location: string
    page: number
    artifact_id: string
  } | null
  cell: {
    id: string
    ref: string
    name: string
    value: string | null
    basis: string | null
    artifact_id: string
  } | null
  confirmed_by: { id: string; name: string; avatar_url: string | null } | null
  confirmed_at: string | null
}

export interface DealPage {
  id: string
  name: string
  client: string | null
  coverage: Coverage
  artifacts: Artifact[]
  findings: { open: number; accepted: number; dismissed: number; fixed: number }
  last_tieout: { status: string; summary: Record<string, unknown> } | null
  last_audit: { status: string; summary: Record<string, unknown> } | null
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
  /** A bearer token, for callers that cannot send the cookie. */
  token?: () => string | null
}

export class TieOutApi {
  constructor(private readonly options: ApiOptions) {}

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = this.options.token?.() ?? null
    const response = await fetch(`${this.options.baseUrl}/v1/tieout${path}`, {
      ...init,
      // The cookie carries the session in the browser; the panel sends a
      // token instead. Sending both is harmless and keeps one client.
      credentials: 'include',
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

  /**
   * Every figure that was reconciled, with the cell behind it.
   *
   * This is what the figure library is: not the findings, which are only
   * the figures that disagreed. A library built from findings would show
   * the eight that broke and hide the ninety-four that held, which is
   * exactly the wrong way round.
   */
  links(dealId: string): Promise<Link[]> {
    return this.call(`/deals/${dealId}/links`)
  }

  /** Everything the deal page needs, in one request. */
  deal(dealId: string): Promise<DealPage> {
    return this.call(`/deals/${dealId}`)
  }

  /** Coverage alone, for the panel, where the rest is not wanted. */
  async coverage(dealId: string): Promise<Coverage> {
    return (await this.deal(dealId)).coverage
  }

  /** The deals this person is on. */
  deals(): Promise<DealListItem[]> {
    return this.call('/deals')
  }

  check(dealId: string): Promise<unknown> {
    return this.call(`/deals/${dealId}/check`, { method: 'POST' })
  }
}
