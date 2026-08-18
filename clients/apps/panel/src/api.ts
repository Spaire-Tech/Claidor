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

/**
 * A change to a document: proposed, decided, and reversible.
 *
 * Both sides travel on it, which is what lets « Undo » be a write rather
 * than a revision format `.pptx` does not have.
 */
export interface Correction {
  id: string
  fingerprint: string
  state: 'proposed' | 'applied' | 'rejected' | 'reversed' | 'failed'
  /** `file` — the deal's copy — or `document`, the one open in Office. */
  where: 'file' | 'document'
  before: string
  after: string
  source: string
  page: number
  location: string
  artifact_id: string
  wrote_artifact_id: string | null
  error: string | null
  decided_by: { id: string; name: string; avatar_url: string | null } | null
  decided_at: string | null
  created_at: string
}

/** One cell of the little Excel grid a finding carries. */
export interface GridCell {
  v: string
  hot: boolean
}

/** The finding's cell with its neighbours, composed at check time. */
export interface FindingGrid {
  sheet: string
  sel: string
  formula: string
  /** The workbook's tabs around the finding's sheet, for the tab strip. */
  sheets: string[]
  /** Each column: its letter, and the period label the model gives it. */
  cols: { l: string; p: string }[]
  rows: { n: number; label: string; cells: GridCell[] }[]
}

/** One defect from checking the open workbook — the panel's row. */
export interface PanelDefect {
  rule: string
  severity: 'error' | 'smell'
  ref: string
  sheet: string
  name: string
  /** What a person reads first. `detail` is the evidence beneath. */
  plain: string
  detail: string
  standard: string
  analytical: boolean
  figure: string
  figure_unit: string
  /** Where the cell's value goes, in the model's own words. Empty when
   *  nothing downstream reads the cell. */
  flow: string
  /** The fix, where one is derivable rather than a choice: the row's
   *  own formula, re-anchored to this cell — what « Fix the cell »
   *  writes. `fix_before` is the typed value it replaces; the write
   *  checks it is still there first. */
  fix: string
  fix_before: string
  /** What is wrong, in two or three words — the scan line. */
  headline: string
  grid: FindingGrid | null
}

/** The whole answer for the open workbook, from `/check-file`. */
export interface PanelCheck {
  id: string
  filename: string
  checked_at: string
  counts: Record<string, number>
  defects: PanelDefect[]
  values_only: boolean
  abstentions: { rule: string; why: string }[]
  tallies: Record<string, { total: number; clean: number }>
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
  /** The change proposed for this finding, once anybody has looked at it. */
  correction: Correction | null
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

/** Coverage, and whether a check ever produced it — plus the facts the
 *  Ances verdict line needs: whose rules to ask for, when the last
 *  check finished, and whether the model has changed since. */
export interface Checked extends Coverage {
  checked: boolean
  organization_id: string
  /** When the last finished check ended. Null: never. */
  checked_at: string | null
  /** The model changed after that check — the verdict is out of date. */
  stale: boolean
}

/** One audit rule, as the house-rules endpoint lists it. */
export interface AuditRule {
  key: string
  label: string
  on: boolean
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
    return this.call('/identify', {
      method: 'POST',
      body: JSON.stringify(body),
    })
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

  /** « The deck should read $48.9mm » — written down, not applied. */
  propose(findingId: string): Promise<Correction> {
    return this.call(`/findings/${findingId}/correction`, { method: 'POST' })
  }

  /**
   * Tell the server what became of a proposal.
   *
   * `applied` is the one the panel uses after it has written the change
   * into the document itself: the bytes stay on the banker's machine and
   * the deal records that the decision was taken and where.
   */
  decideCorrection(
    correctionId: string,
    action: 'accept' | 'reject' | 'reverse' | 'applied' | 'propose',
  ): Promise<Correction> {
    return this.call(`/corrections/${correctionId}`, {
      method: 'POST',
      body: JSON.stringify({ action }),
    })
  }

  dismiss(
    findingId: string,
    state: Finding['state'],
    note = '',
  ): Promise<Finding> {
    return this.call(`/findings/${findingId}`, {
      method: 'PATCH',
      body: JSON.stringify({ state, note }),
    })
  }

  /** The audit's own catalogue with the firm's switches — what
   *  « N checks pass » counts against. */
  async auditRules(organizationId: string): Promise<AuditRule[]> {
    const rules = await this.call<{ rules: AuditRule[] }>(
      `/house-rules?organization_id=${organizationId}`,
    )
    return rules.rules
  }

  /** The signed-in person's organization, for the catalogue. */
  async organization(): Promise<string | null> {
    const token = this.options.token()
    const response = await fetch(`${this.options.baseUrl}/v1/organizations/`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    })
    if (!response.ok) return null
    const body = (await response.json()) as
      | { id: string }[]
      | { items?: { id: string }[] }
    const rows = Array.isArray(body) ? body : (body.items ?? [])
    return rows[0]?.id ?? null
  }

  /**
   * Check the workbook that is open right here — the panel's one job.
   *
   * The bytes go up, the engine checks them, the bytes are dropped:
   * the same retention posture as the workspace's Check a model,
   * because it is the same endpoint.
   */
  async checkFile(bytes: Uint8Array, filename: string): Promise<PanelCheck> {
    const token = this.options.token()
    const body = new FormData()
    body.append(
      'file',
      new Blob([bytes.buffer as ArrayBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
      filename,
    )
    const response = await fetch(
      `${this.options.baseUrl}/v1/tieout/check-file`,
      {
        method: 'POST',
        headers: token ? { authorization: `Bearer ${token}` } : {},
        body,
      },
    )
    if (!response.ok) {
      const answer = await response.json().catch(() => null)
      throw new ApiError(
        response.status,
        (answer as { detail?: string } | null)?.detail ??
          'that workbook could not be checked',
      )
    }
    return (await response.json()) as PanelCheck
  }

  /**
   * Coverage for the deal, and whether it has ever been checked.
   *
   * The second half is not decoration. « Checked, and every figure here
   * ties back to the model » on a deal nobody has run says a check
   * happened, and a panel that says that about a deck nobody reconciled is
   * doing the one thing this product exists not to do. Coverage cannot
   * tell those apart — zero and zero look the same — so the run is asked
   * for alongside it.
   */
  async coverage(dealId: string): Promise<Checked> {
    const deal = await this.call<{
      coverage: Coverage
      organization_id: string
      stale: boolean
      last_tieout: {
        status: string
        error: string | null
        finished_at: string | null
      } | null
      last_audit: {
        status: string
        error: string | null
        finished_at: string | null
      } | null
    }>(`/deals/${dealId}`)
    //: The audit's clock beats the tie-out's for a model panel — it is
    //: the check whose findings this column shows.
    const checkedAt =
      deal.last_audit?.finished_at ?? deal.last_tieout?.finished_at ?? null
    return {
      ...deal.coverage,
      checked: Boolean(
        deal.last_tieout &&
        deal.last_tieout.status === 'done' &&
        !deal.last_tieout.error,
      ),
      organization_id: deal.organization_id,
      checked_at: checkedAt,
      stale: deal.stale,
    }
  }

  check(dealId: string): Promise<unknown> {
    return this.call(`/deals/${dealId}/check`, { method: 'POST' })
  }
}
