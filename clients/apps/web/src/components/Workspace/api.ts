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

/**
 * A change to a document: proposed, decided, and reversible.
 *
 * Both sides travel on it — `before` is what the document says and
 * `after` is what it would say — which is what makes « Undo » a write
 * rather than a revision format the .pptx specification does not have.
 */
export interface Correction {
  id: string
  /** The finding's durable identity, which survives a re-check. */
  fingerprint: string
  state: 'proposed' | 'applied' | 'rejected' | 'reversed' | 'failed'
  /** `file` — the deal's copy, one version further on — or `document`,
   *  meaning somebody accepted it in the copy open in Office. */
  where: 'file' | 'document'
  before: string
  after: string
  /** The cell the figure ties to once this is applied — `Model!D26`. */
  source: string
  page: number
  location: string
  artifact_id: string
  wrote_artifact_id: string | null
  /** Why a write was refused, in the server's own words. */
  error: string | null
  decided_by: { id: string; name: string; avatar_url: string | null } | null
  decided_at: string | null
  created_at: string
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
  /** The change proposed for this finding, once anybody has looked at
   *  it. Null means nothing has been proposed — never « nothing can be ». */
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
  /**
   * What this step reads that could not be followed, each already a
   * sentence — "in another workbook, which is not in this deal", "a
   * defined name pointing at #REF!".
   *
   * **Not yet rendered anywhere.** The engine and the wire carry it; no
   * screen shows it. Measured across two real Ofgem models, 4.4% of
   * formulas had a chain short by an input and no way to say so, so a
   * chain drawn without this is a chain that may be quietly incomplete.
   */
  unresolved: string[]
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
  /**
   * How many *checks* the open findings belong to — distinct rules, the
   * tie-out counting as one. The row says « 6 checks fail », never a
   * findings count: one check can produce forty findings, and the row
   * would read like forty problems.
   */
  failing_checks: number
  /**
   * When the deal was last reconciled. **Null means never**, and that is
   * a different thing from « no findings » — a list that let those two
   * share a word would be claiming a check nobody ran.
   */
  checked_at: string | null
  visited_at: string | null
  arrived_since_visit: number
  findings_since_visit: number
  /**
   * A current document arrived after that check, so its results are out
   * of date. The row leads with this over any count, because the count
   * is one of the things that is now stale.
   */
  stale: boolean
  /** What changed after the check — an artifact kind — and when. The
   *  server sends the fact; the sentence is built here, where the
   *  reader's clock lives. */
  stale_kind: string | null
  stale_at: string | null
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
  alternatives?: {
    cell_id: string | null
    ref: string
    name: string
    value: string | null
    confidence: number
  }[]
  confirmed_by: { id: string; name: string; avatar_url: string | null } | null
  confirmed_at: string | null
}

export interface Cell {
  id: string
  ref: string
  sheet: string
  name: string
  value: string | null
  formula: string | null
}

export interface ArtifactPage {
  items: Artifact[]
  total: number
  limit: number
  offset: number
}

/**
 * A connected file store, and whose access it is.
 *
 * The account is on it deliberately: a deal syncing through somebody's
 * credentials is a fact the team should be able to see, both because it
 * stops working when they leave and because « why can this product read
 * our deal room » should never be a question without an answer on screen.
 */
export interface ConnectorConnection {
  id: string
  provider: 'microsoft'
  status: 'active' | 'expired' | 'revoked'
  account_name: string
  account_email: string
  error: string | null
  connected_at: string
}

/** Three states, and they are three different sentences. */
export interface ConnectorState {
  /** Whether this server has a Microsoft application at all. */
  configured: boolean
  connection: ConnectorConnection | null
  authorize_url: string | null
}

export interface Drive {
  id: string
  name: string
  owner: string
}

export interface DriveItem {
  id: string
  name: string
  folder: boolean
  size: number
  modified_at: string
  modified_by: string
  drive_id: string
  /** Whether this product could read it if a sync took it. */
  readable: boolean
  /**
   * The store's content tag. Only ever compared, never shown: the deal
   * holds this item at the same tag or at a different one.
   */
  content_tag: string
}

/** One email, as the mail screen draws it. */
export interface MailMessage {
  id: string
  subject: string
  from_name: string
  from_email: string
  to: string[]
  received_at: string
  preview: string
  is_draft: boolean
  is_read: boolean
  has_attachments: boolean
  /** Empty in a listing; present when one message is opened. */
  body: string
  /**
   * The artifact this was read into, when it has been checked. **Null
   * means nobody has checked it** — a different sentence from « checked
   * and clean », and the screen says which.
   */
  artifact_id: string | null
  /** Whether what was checked is what is on screen. */
  current: boolean
}

/** Where a deal's files are, and what the last sync made of it. */
export interface ConnectedFolder {
  id: string
  drive_id: string
  item_id: string
  name: string
  path: string
  site_name: string
  connection: ConnectorConnection | null
  last_synced_at: string | null
  last_result: {
    read?: number
    unchanged?: number
    failed?: number
    skipped?: { reason: string; count: number }[]
  }
  error: string | null
}

/** One pass of one checker over named versions of named files. */
export interface CheckRun {
  id: string
  kind: 'tieout' | 'audit' | 'crosscheck'
  status: 'queued' | 'running' | 'done' | 'failed'
  summary: Record<string, unknown>
  /** Present when the run could not happen, in words for a person. */
  error: string | null
  started_at: string | null
  finished_at: string | null
}

export interface DealPage {
  id: string
  name: string
  client: string | null
  /**
   * Whose deal it is. A connection is made once per organization and per
   * person, not per deal, so the connector screens ask about this rather
   * than about the deal they happen to be open on.
   */
  organization_id: string
  coverage: Coverage
  /** The current model, deck and memo. Tens, not thousands. */
  documents: Artifact[]
  /** How many artifacts the deal holds, and how many documents that is. */
  files: number
  lineages: number
  findings: { open: number; accepted: number; dismissed: number; fixed: number }
  /**
   * The last run of each checker, or null where one has never run.
   *
   * Null is the field the whole product's honesty rests on here: a deal
   * that was checked and is clean and a deal nobody has run have the same
   * coverage and the same empty findings list, and only this tells them
   * apart.
   */
  last_tieout: CheckRun | null
  last_audit: CheckRun | null
  /** A current document arrived after that check — same fact and fields
   *  as the deals list, plus what the banner's second line counts. */
  stale: boolean
  stale_kind: string | null
  stale_at: string | null
  stale_documents: number
  stale_figures: number
  /** What the team decided, newest first. Derived server-side from the
   *  findings and corrections it describes — never authored. */
  decisions: Decision[]
}

/** One judgement somebody made about a number. */
export interface Decision {
  id: string
  who: { id: string; name: string; avatar_url: string | null } | null
  at: string
  action: 'accepted' | 'kept' | 'reversed' | 'dismissed'
  /** The server's factual sentence. */
  text: string
  /** The person's reason, verbatim. Beats `text` on screen when present. */
  note: string
}

export interface Coverage {
  reconciled: number
  agreeing: number
  drifting: number
  unlinked: number
  confirmed: number
  reasons: { reason: string; count: number }[]
}

/** One figure on a page, and what became of it. */
export interface Figure {
  id: string
  printed: string
  label: string
  location: string
  /** `agreeing` · `drifting` · `confirmed` · `unlinked`. */
  state: 'agreeing' | 'drifting' | 'confirmed' | 'unlinked'
  link_id: string | null
  /** Only on `unlinked`, and the point of the screen. */
  reason: string | null
  anchor: Record<string, unknown>
}

export interface FigureMap {
  artifact_id: string
  filename: string
  /** `page` is a slide in a deck and a paragraph in a memo. */
  slides: { page: number; figures: Figure[] }[]
}

/** One earlier exchange, replayed so a follow-up reads as one. */
export interface AskTurn {
  who: 'you' | 'pierce'
  text: string
}

/** One tool call, as the chat shows it under « Used N tools ». */
export interface AskedStep {
  ordinal: number
  tool: string
  ok: boolean
  summary: string
  milliseconds: number
}

export interface Asked {
  id: string
  prompt: string
  answer: string
  /** `answered` · `step_limit` · `failed`. Anything else means partial. */
  stopped: 'answered' | 'step_limit' | 'failed'
  error: string | null
  steps: AskedStep[]
}

export interface GridCell {
  ref: string
  /** Exactly as Excel computed it, to every digit it holds. */
  value: string | null
  /**
   * The same number as the model itself draws it — « 12.2% », « $1,235 »,
   * « 9.9x » — from the workbook's own format code. `null` when the
   * workbook says nothing the server understands, and then the screen
   * shows `value`: an unformatted number is honest, a guessed one is not.
   */
  display: string | null
  /** A deliverable is standing on this cell. */
  linked: boolean
}

export interface ModelGrid {
  artifact_id: string
  filename: string
  version: number
  uploaded_at: string
  sheets: {
    name: string
    columns: string[]
    /** `cells` is one entry per column, `null` where the row has nothing. */
    rows: { label: string; cells: (GridCell | null)[] }[]
    rows_total: number
  }[]
}

/** One thing in the file that is not on its screen. */
export interface HiddenFinding {
  rule: string
  /** `leak` — content a recipient can read that the sender did not put
   *  on the page. `trace` — who, when, how it was filed. Never added. */
  severity: 'leak' | 'trace'
  where: string
  detail: string
  evidence: string
}

/** The metadata checker on the wire — computed from the stored bytes. */
export interface HiddenReport {
  kind: string
  parts: number
  findings: HiddenFinding[]
  /** The checker's refusal sentence for a file it does not read — a PDF,
   *  a legacy .doc. An answer about the file, not an error. */
  refused: string | null
}

/** One upload of a document, newest first. */
export interface Version {
  id: string
  version: number
  uploaded_by: { id: string; name: string; avatar_url: string | null } | null
  uploaded_at: string
  counts: Record<string, unknown>
}

/** One place a file states a figure, for the check-a-file card. */
export interface SoloStatement {
  printed: string
  location: string
  page: number
  /** The slide's title or the heading over the block. */
  section: string
  /** The sentence around the figure, when there is one. */
  context: string
}

/**
 * One name carrying two figures in the same file.
 *
 * Which one is *right* is not knowable from the file alone, and the
 * shape deliberately does not guess — the finding is that the file says
 * both.
 */
export interface SoloFinding {
  label: string
  /** How many times the file states this name, counting the agreeing ones. */
  statements: number
  first: SoloStatement
  other: SoloStatement
}

/** A printed figure that disagrees with the picked deal's model. */
export interface OneOffDrift {
  printed: string
  expected: string
  label: string
  page: number
  location: string
  context: string
  ref: string
  name: string
  basis: string
  confidence: number
  one_tick: boolean
  /** A real artifact in that deal — the same grid endpoint the document
   *  panel uses works here. */
  model_artifact_id: string | null
}

/** One mechanical defect from a model's own audit. */
export interface OneOffDefect {
  rule: string
  /** Never added into one number with the other. */
  severity: 'error' | 'smell'
  ref: string
  sheet: string
  name: string
  detail: string
  standard: string
}

/** One model the file was compared with — the « Compared with » card. */
export interface AgainstModel {
  artifact_id: string
  filename: string
  version: number
  read_at: string
}

/** One loose file, checked, with everything the screen draws. */
export interface OneOffResult {
  id: string
  filename: string
  kind: string
  checked_at: string
  /** The deal's name at check time, or empty for a check on its own. */
  against: string
  dossier_id: string | null
  models: AgainstModel[]
  counts: Record<string, number>
  disagreements: SoloFinding[]
  drifts: OneOffDrift[]
  defects: OneOffDefect[]
}

/** One audit rule, as the settings screen shows it. */
export interface AuditRule {
  key: string
  label: string
  on: boolean
}

/** How the firm wants Pierce to behave. */
export interface HouseRules {
  /** `together` — rounding differences sit with everything else;
   *  `separate` — grouped under their own head. Found either way. */
  rounding: 'together' | 'separate'
  /** Ranges, fiscal years, units, negatives — as the firm writes them. */
  writing: Record<string, string>
  grounding: boolean
  /** The audit's own catalogue with the firm's switches — never a list
   *  the screen invented. */
  rules: AuditRule[]
}

/** One person on the team, with the deals they are on here. */
export interface TeamMember {
  id: string
  name: string
  email: string
  avatar_url: string | null
  you: boolean
  deals: string[]
}

export interface Team {
  members: TeamMember[]
  /** So « All six deals » is only said when it is true. */
  total_deals: number
}

/** One line of « Recent one-off checks ». */
export interface RecentCheck {
  id: string
  filename: string
  kind: string
  against: string
  checked_at: string
  counts: Record<string, number>
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

  /** A path under `/v1/tieout`, which is nearly everything here. */
  private call<T>(path: string, init: RequestInit = {}): Promise<T> {
    return this.at(`/v1/tieout${path}`, init)
  }

  /**
   * Any path on the API.
   *
   * The connector is not part of the tie-out — it is where a deal's
   * documents come from — so it lives under its own prefix and this is
   * how it is reached without a second client and a second idea of what
   * an error means.
   */
  private async at<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = this.options.token?.() ?? null
    const response = await fetch(`${this.options.baseUrl}${path}`, {
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
    return this.call('/identify', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  }

  /** Findings for one document. What the panel shows, filtered to here. */
  findings(dealId: string, artifactId?: string): Promise<Finding[]> {
    const query = artifactId ? `?artifact_id=${artifactId}` : ''
    return this.call(`/deals/${dealId}/findings${query}`)
  }

  /** Every change proposed on this deal, and what became of it. */
  corrections(dealId: string): Promise<Correction[]> {
    return this.call(`/deals/${dealId}/corrections`)
  }

  /**
   * « The deck should read $48.9mm » — written down, not applied.
   *
   * Idempotent, so a screen can ask on open. A finding nothing can be
   * written for comes back 422 with the sentence saying why.
   */
  propose(findingId: string): Promise<Correction> {
    return this.call(`/findings/${findingId}/correction`, { method: 'POST' })
  }

  /**
   * Accept it, keep the document as it is, or undo it.
   *
   * A write that fails comes back 200 with `state: 'failed'` and the
   * reason on it. That is not an error — the request was fine and the
   * document had moved — and the screen has to keep showing it.
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

  /** A link to the file itself — the corrected deck, in particular. */
  download(artifactId: string): Promise<{ url: string; filename: string }> {
    return this.call(`/artifacts/${artifactId}/download`)
  }

  chain(findingId: string): Promise<Chain> {
    return this.call(`/findings/${findingId}/chain`)
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

  /**
   * Put a file into the deal.
   *
   * Multipart, and deliberately not JSON: a model is megabytes and
   * base64 would add a third to that for nothing.
   *
   * A file the reader cannot open still comes back 200, with
   * `status: 'failed'` and a sentence somebody can act on. That is a
   * state of the deal, not a failed request, and the screen has to be
   * able to show it. Only a file this cannot read at all — a `.txt` —
   * is an error.
   */
  async upload(dealId: string, file: File): Promise<Artifact> {
    const body = new FormData()
    body.append('file', file)
    const token = this.options.token?.() ?? null
    const response = await fetch(
      `${this.options.baseUrl}/v1/tieout/deals/${dealId}/artifacts`,
      {
        method: 'POST',
        body,
        credentials: 'include',
        headers: token ? { authorization: `Bearer ${token}` } : {},
      },
    )
    if (!response.ok) {
      const problem = (await response.json().catch(() => null)) as {
        detail?: string
      } | null
      throw new ApiError(
        response.status,
        problem?.detail ?? 'that file could not be uploaded',
      )
    }
    return (await response.json()) as Artifact
  }

  /** One file's state, for polling while it is read. */
  artifact(artifactId: string): Promise<Artifact> {
    return this.call(`/artifacts/${artifactId}`)
  }

  /** Take a file out of the deal. */
  async remove(artifactId: string): Promise<void> {
    await this.call(`/artifacts/${artifactId}`, { method: 'DELETE' })
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

  /**
   * One link, with what else the figure could have been.
   *
   * The alternatives cost a re-score against the model, which is why they
   * are here and not on the list.
   */
  link(linkId: string): Promise<Link> {
    return this.call(`/links/${linkId}`)
  }

  /**
   * Confirm, reject, or point it somewhere else.
   *
   * Confirming is the moment a guess becomes data: the pair is recorded
   * as decided and no later run proposes over it, undoes it, or brings a
   * rejection back. `cellId` re-points first, which turns a wrong guess
   * into a right fact rather than throwing it away.
   */
  decide(
    linkId: string,
    state: 'confirmed' | 'rejected',
    cellId?: string,
  ): Promise<Link> {
    return this.call(`/links/${linkId}`, {
      method: 'PATCH',
      body: JSON.stringify({ state, cell_id: cellId ?? null }),
    })
  }

  /** Named cells matching a few words, for « point it somewhere else ». */
  cells(artifactId: string, query: string): Promise<Cell[]> {
    return this.call(
      `/artifacts/${artifactId}/cells?q=${encodeURIComponent(query)}`,
    )
  }

  /**
   * The model laid out as it is laid out, with what is standing on it.
   *
   * Everything else here asks a person to know already what they are
   * looking for — a search word, a cell reference carried by a finding.
   * This is the one call that lets somebody open a sheet and read down it.
   */
  grid(artifactId: string): Promise<ModelGrid> {
    return this.call(`/artifacts/${artifactId}/grid`)
  }

  /**
   * Ask a question about the deal.
   *
   * Slow by nature — it is a model call with tool calls inside it — so the
   * caller shows « Working » rather than a spinner, and the trace that
   * comes back with the answer is shown rather than logged.
   *
   * `finding_id` scopes the conversation to one finding; `history`
   * replays the last few exchanges so follow-ups read as follow-ups.
   */
  ask(
    dealId: string,
    prompt: string,
    options: { history?: AskTurn[]; findingId?: string | null } = {},
  ): Promise<Asked> {
    return this.call(`/deals/${dealId}/ask`, {
      method: 'POST',
      body: JSON.stringify({
        prompt,
        history: options.history ?? [],
        finding_id: options.findingId ?? null,
      }),
    })
  }

  /**
   * Ask about one stored one-off check — and only about it.
   *
   * The agent behind this holds the check's stored answer and two tools
   * over it, nothing else; a deal question gets the boundary sentence.
   */
  askFile(
    checkId: string,
    prompt: string,
    options: { history?: AskTurn[] } = {},
  ): Promise<Asked> {
    return this.call(`/check-file/${checkId}/ask`, {
      method: 'POST',
      body: JSON.stringify({ prompt, history: options.history ?? [] }),
    })
  }

  /** Every figure in a document, by page, and what became of each. */
  versions(artifactId: string): Promise<Version[]> {
    return this.call(`/artifacts/${artifactId}/versions`)
  }

  /** What travels with this file that is not on its screen. */
  metadata(artifactId: string): Promise<HiddenReport> {
    return this.call(`/artifacts/${artifactId}/metadata`)
  }

  figures(artifactId: string): Promise<FigureMap> {
    return this.call(`/artifacts/${artifactId}/figures`)
  }

  /** The deal's spine: coverage, counts, and the documents it is built on. */
  deal(dealId: string): Promise<DealPage> {
    return this.call(`/deals/${dealId}`)
  }

  /**
   * The data room, a page at a time.
   *
   * Searched on the server rather than in the browser: a deal holds
   * thousands of files and the point of paging is not to send them all.
   */
  artifacts(
    dealId: string,
    options: { q?: string; limit?: number; offset?: number } = {},
  ): Promise<ArtifactPage> {
    const query = new URLSearchParams()
    if (options.q) query.set('q', options.q)
    if (options.limit !== undefined) query.set('limit', String(options.limit))
    if (options.offset !== undefined)
      query.set('offset', String(options.offset))
    const suffix = query.toString()
    return this.call(`/deals/${dealId}/artifacts${suffix ? `?${suffix}` : ''}`)
  }

  /** Coverage alone, for the panel, where the rest is not wanted. */
  async coverage(dealId: string): Promise<Coverage> {
    return (await this.deal(dealId)).coverage
  }

  /** The deals this person is on. */
  deals(): Promise<DealListItem[]> {
    return this.call('/deals')
  }

  /** This person opened this deal — clears « since you looked ». */
  visit(dealId: string): Promise<void> {
    return this.call(`/deals/${dealId}/visit`, { method: 'POST' })
  }

  /** Remove a model from Antford. Soft on the server — findings and
   *  notes are kept, nothing a team wrote is destroyed by a cleanup. */
  removeDeal(dealId: string): Promise<void> {
    return this.call(`/deals/${dealId}`, { method: 'DELETE' })
  }

  /**
   * Run both checks. Comes back with the runs themselves — their status,
   * their summary and when they started and finished — which is what the
   * Terminal reads its output out of.
   */
  check(dealId: string): Promise<CheckRun[]> {
    return this.call(`/deals/${dealId}/check`, { method: 'POST' })
  }

  /** The last tie-out and the last audit: when this was last true. */
  runs(dealId: string): Promise<CheckRun[]> {
    return this.call(`/deals/${dealId}/runs`)
  }

  /**
   * Check a loose file without putting it in any deal.
   *
   * Multipart for the same reason `upload` is. The file is read, checked
   * and dropped in one request; the answer comes back whole and is also
   * kept as a recent. A file the reader cannot open is a 422 whose
   * message is the server's own sentence, meant to be shown in place.
   */
  async checkFile(
    file: File,
    dossierId?: string | null,
  ): Promise<OneOffResult> {
    const body = new FormData()
    body.append('file', file)
    const token = this.options.token?.() ?? null
    const query = dossierId ? `?dossier_id=${dossierId}` : ''
    const response = await fetch(
      `${this.options.baseUrl}/v1/tieout/check-file${query}`,
      {
        method: 'POST',
        body,
        credentials: 'include',
        headers: token ? { authorization: `Bearer ${token}` } : {},
      },
    )
    if (!response.ok) {
      const problem = (await response.json().catch(() => null)) as {
        detail?: string
      } | null
      throw new ApiError(
        response.status,
        problem?.detail ?? 'that file could not be checked',
      )
    }
    return (await response.json()) as OneOffResult
  }

  /** The caller's own recent one-off checks, newest first. */
  recentChecks(): Promise<RecentCheck[]> {
    return this.call('/check-file/recents')
  }

  /** A stored one-off check, replayed exactly as it was answered. */
  oneOffCheck(checkId: string): Promise<OneOffResult> {
    return this.call(`/check-file/${checkId}`)
  }

  /** How the firm wants Pierce to behave. Defaults until somebody decides. */
  houseRules(organizationId: string): Promise<HouseRules> {
    return this.call(`/house-rules?organization_id=${organizationId}`)
  }

  /** Change the firm's rules. Only what is sent changes. */
  putHouseRules(
    organizationId: string,
    update: {
      rounding?: 'together' | 'separate'
      writing?: Record<string, string>
      grounding?: boolean
      audit_rules_off?: string[]
    },
  ): Promise<HouseRules> {
    return this.call(`/house-rules?organization_id=${organizationId}`, {
      method: 'PUT',
      body: JSON.stringify(update),
    })
  }

  /** Who's on the team, with the deals each is on in this organization. */
  team(organizationId: string): Promise<Team> {
    return this.call(`/team?organization_id=${organizationId}`)
  }

  /**
   * Put a colleague on a deal, by the email they sign in with.
   *
   * The dossier route, and its rule: access is granted to a person the
   * system knows, never to an address on faith — an unknown email comes
   * back 404 with the server's own sentence.
   */
  addDealMember(dealId: string, email: string): Promise<unknown> {
    return this.at(`/v1/dossiers/${dealId}/members`, {
      method: 'POST',
      body: JSON.stringify({ email }),
    })
  }

  // --- the connected file store ---------------------------------------
  //
  // A different prefix from everything above: the connector is not part of
  // the tie-out, it is where a deal's documents come from. `call` is
  // hard-wired to /v1/tieout, so these build their own path.

  connectorState(organizationId: string): Promise<ConnectorState> {
    return this.at(`/v1/connector/state?organization_id=${organizationId}`)
  }

  drives(organizationId: string): Promise<Drive[]> {
    return this.at(`/v1/connector/drives?organization_id=${organizationId}`)
  }

  driveItems(
    organizationId: string,
    driveId: string,
    itemId?: string,
  ): Promise<DriveItem[]> {
    const where = itemId ? `&item_id=${encodeURIComponent(itemId)}` : ''
    return this.at(
      `/v1/connector/drives/${encodeURIComponent(driveId)}/items` +
        `?organization_id=${organizationId}${where}`,
    )
  }

  connectedFolder(dealId: string): Promise<ConnectedFolder | null> {
    return this.at(`/v1/connector/deals/${dealId}/folder`)
  }

  /**
   * What this deal already holds from the store, keyed by the store's own
   * id and valued by the content tag it was read at. The whole basis of
   * the library screen's status column.
   */
  held(dealId: string): Promise<Record<string, string>> {
    return this.at(`/v1/connector/deals/${dealId}/held`)
  }

  pointAt(
    dealId: string,
    body: { drive_id: string; item_id: string; model_item_id?: string | null },
  ): Promise<ConnectedFolder> {
    return this.at(`/v1/connector/deals/${dealId}/folder`, {
      method: 'PUT',
      body: JSON.stringify(body),
    })
  }

  /**
   * Open a deal. The dossier route, not the tie-out's — a deal is a
   * matter first, and the creator lands on it as lead. The New deal
   * flow names it after its folder and points it there right after.
   */
  createDeal(
    organizationId: string,
    body: { name: string; client_name: string },
  ): Promise<{ id: string; name: string }> {
    return this.at(`/v1/dossiers?organization_id=${organizationId}`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  }

  stopWatching(dealId: string): Promise<void> {
    return this.at(`/v1/connector/deals/${dealId}/folder`, { method: 'DELETE' })
  }

  /** Read what has changed, and re-check the deal. */
  syncFolder(dealId: string): Promise<ConnectedFolder> {
    return this.at(`/v1/connector/deals/${dealId}/sync`, { method: 'POST' })
  }

  // --- mail -------------------------------------------------------------

  mail(dealId: string, folder: string): Promise<MailMessage[]> {
    return this.at(`/v1/connector/deals/${dealId}/mail?folder=${folder}`)
  }

  message(dealId: string, messageId: string): Promise<MailMessage> {
    return this.at(
      `/v1/connector/deals/${dealId}/mail/${encodeURIComponent(messageId)}`,
    )
  }

  /** Read this message into the deal and reconcile it. On a press. */
  checkMessage(dealId: string, messageId: string): Promise<MailMessage> {
    return this.at(
      `/v1/connector/deals/${dealId}/mail/${encodeURIComponent(messageId)}/check`,
      { method: 'POST' },
    )
  }

  disconnect(connectionId: string): Promise<void> {
    return this.at(`/v1/connector/connections/${connectionId}`, {
      method: 'DELETE',
    })
  }
}
