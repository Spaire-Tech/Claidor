'use client'

/**
 * The workspace: two panels above a dock.
 *
 * The left panel is whatever is being looked at. The right is the chat,
 * always there. When the left is hidden the chat takes the whole width and
 * centres itself — that is the state the app opens in, and the reason the
 * first thing anyone sees is a question rather than a dashboard.
 *
 * Every screen the backend can feed reads live: the data room lists real
 * artifacts, Check lists real findings, Chain walks a real chain. The
 * screens that need work that does not exist yet — Mail, Calendar,
 * SharePoint, the Word and Excel surfaces — are not faked here. They say
 * plainly that they are not connected, which is the honest state and takes
 * one line to replace when the wiring lands.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Chat, type Message } from './Chat'
import { Dock } from './Dock'
import type {
  Artifact,
  Chain,
  Correction,
  Coverage,
  FigureMap,
  Finding,
  Link,
  ModelGrid,
} from './api'
import { ApiError, TieOutApi } from './api'
import {
  colour,
  font,
  pageBackground,
  panel,
  size,
  space,
  tabChip,
} from './design'
import { Applications } from './screens/Applications'
import { Checks } from './screens/Checks'
import { Confirm } from './screens/Confirm'
import { Document } from './screens/Document'
import { Files } from './screens/Files'
import { Library, type Row } from './screens/Library'
import { Sheets } from './screens/Sheets'
import { Trace } from './screens/Trace'
import { useNarrow } from './useNarrow'
import type { View } from './views'
import './workspace.css'

/**
 * Where the server is.
 *
 * The dashboard and the API are the same deployment, so the browser talks
 * to a relative path and the session cookie is first-party. Only the
 * Office panel needs an absolute origin and a bearer token, and it has its
 * own client for that.
 */
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? ''

const api = new TieOutApi({ baseUrl: API_BASE })

/** What the tab chip says, per view. */
const TAB: Record<View, string> = {
  chat: 'Chat',
  files: 'File restructure',
  mail: 'Mail',
  calendar: 'Calendar',
  docs: 'Document review',
  sheets: 'Model audit',
  deck: 'Pitchbook reconciliation',
  sharepoint: 'SharePoint',
  projects: 'Projects',
  checks: 'Check',
  confirm: 'Confirm',
  trace: 'Chain',
  library: 'Figure library',
  terminal: 'Terminal',
  applications: 'Applications',
}

/** The surfaces that need connectors or the writing layer. */
const NOT_CONNECTED: Partial<Record<View, string>> = {
  mail: 'Mail is not connected yet. It reads the draft you are writing and the files attached to it.',
  calendar: 'Calendar is not connected yet.',
  sharepoint:
    'SharePoint is not connected yet. Connected, it keeps the deal in step with the files as they change.',
  projects:
    'One deal is open. Projects lists them all once there is more than one.',
  terminal: 'Not connected.',
}

/** Which document each of the three document screens is about. */
const OPENS: Partial<Record<View, Artifact['kind']>> = {
  deck: 'deck',
  sheets: 'model',
  docs: 'memo',
}

/**
 * And the way back: which screen opens a file from the data room.
 *
 * A `source` is anything else in the room — a PDF, a contract — which
 * nothing reads yet. It opens the data room's own list rather than a
 * screen that would have nothing on it.
 */
const SCREEN: Record<Artifact['kind'], View> = {
  deck: 'deck',
  model: 'sheets',
  memo: 'docs',
  source: 'files',
}

export function Workspace({ dealId }: { dealId: string }) {
  const [view, setView] = useState<View>('chat')
  const [messages, setMessages] = useState<Message[]>([])
  const narrow = useNarrow()

  //: The left panel is not a thing that can be toggled — it is the view.
  //: Chat is one column; everything else is two. The design has no control
  //: for hiding the panel and does not need one, since the dock's first
  //: button is the way back.
  const showLeft = view !== 'chat'

  const [deal, setDeal] = useState('')
  //: The id `load` settled on — the one passed in, or the first this
  //: person is on. Upload and re-check both need it and neither can ask
  //: again without racing the list.
  const dealFor = useRef('')
  const [documents, setDocuments] = useState<Artifact[]>([])
  const [findings, setFindings] = useState<Finding[]>([])
  const [coverage, setCoverage] = useState<Coverage | null>(null)
  const [links, setLinks] = useState<Link[]>([])
  //: What this product *did* to the documents, as opposed to what it
  //: found in them. Held beside the findings because a correction
  //: outlives the finding it came from — once it is applied the deck
  //: agrees and the drift is gone.
  const [corrections, setCorrections] = useState<Correction[]>([])
  const [chain, setChain] = useState<Chain | null>(null)
  const [traced, setTraced] = useState<Finding | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [linkDetail, setLinkDetail] = useState<Link | null>(null)
  const [uploading, setUploading] = useState<string[]>([])
  const [rejected, setRejected] = useState<string | null>(null)
  //: The three document screens. Each is one artifact's worth of detail
  //: and is fetched when the screen is opened rather than with the deal:
  //: a model's grid is every labelled cell in the workbook, and putting
  //: that on the deal page would make every screen pay for one.
  const [grid, setGrid] = useState<ModelGrid | null>(null)
  const [deckMap, setDeckMap] = useState<FigureMap | null>(null)
  const [memoMap, setMemoMap] = useState<FigureMap | null>(null)

  const load = useCallback(async () => {
    try {
      // No deal named, so take the first this person is on. One deal is
      // the normal case today; the moment it is not, Projects picks and
      // passes an id, and nothing else here changes.
      const id = dealId || (await api.deals())[0]?.id
      if (!id) {
        setError('You are not on any deals yet.')
        return
      }
      const [page, found, linked, written] = await Promise.all([
        api.deal(id),
        api.findings(id),
        api.links(id),
        api.corrections(id),
      ])
      dealFor.current = id
      setDeal(page.name)
      //: The documents the deal is built on — not the data room, which
      //: fetches its own pages. Holding every artifact here is what made
      //: this request 1.07 MB at three thousand files.
      setDocuments(page.documents)
      setCoverage(page.coverage)
      setFindings(found)
      setLinks(linked)
      setCorrections(written)
      setError(null)
    } catch (problem) {
      setError(
        problem instanceof ApiError
          ? problem.message
          : 'Could not reach the server. Is the API running?',
      )
    }
  }, [dealId])

  useEffect(() => {
    void load()
  }, [load])

  const go = (next: View) => setView(next)

  //: The data room asks for its own pages. Stable across renders, so the
  //: screen's effect does not refetch every time something else on the
  //: workspace changes.
  const roomPage = useCallback(
    (options: { q: string; limit: number; offset: number }) =>
      api.artifacts(dealFor.current, options),
    [],
  )
  //: Bumped when an upload lands — the one thing that changes the room
  //: from outside it.
  const [roomVersion, setRoomVersion] = useState(0)

  //: The newest upload of each kind. « The model » on a deal with one
  //: model is unambiguous, and on a deal with two the file the person
  //: last put in is the one they mean. Projects will have to let them
  //: choose; one deal with one of each is today.
  const opened = useMemo(() => {
    const kind = OPENS[view]
    if (!kind) return null
    return documents.find((one) => one.kind === kind) ?? null
  }, [documents, view])

  //: Fetch the open document's detail when the screen asks for it, and
  //: not before. Re-fetched when the artifact changes — a new upload of
  //: the deck is a different document, not a stale copy of this one.
  useEffect(() => {
    if (!opened) return
    let live = true
    const kind = opened.kind
    void (async () => {
      try {
        if (kind === 'model') {
          const answer = await api.grid(opened.id)
          if (live) setGrid(answer)
        } else {
          const answer = await api.figures(opened.id)
          if (!live) return
          if (kind === 'deck') setDeckMap(answer)
          else setMemoMap(answer)
        }
      } catch {
        // The screen's own empty state says what to do about it. A
        // document that cannot be read is already a row in the data room
        // carrying the server's sentence.
      }
    })()
    return () => {
      live = false
    }
  }, [opened])

  const trace = async (finding: Finding) => {
    setTraced(finding)
    setChain(null)
    go('trace')
    try {
      setChain(await api.chain(finding.id))
    } catch {
      setChain(null)
    }
  }

  /**
   * The coverage line, in the design's own register: a count and what was
   * not reached, in one clause.
   */
  //: Coverage only. The finding counts live on the filter row beneath,
  //: with one number per severity — and the two must never both try to
  //: total the same thing. The first version of this line said « 892
  //: findings » while the filter said « All 1217 », because one excluded
  //: the one-tick notes and the other did not. Two numbers for one fact,
  //: on a screen whose entire purpose is that numbers agree.
  const coverageLine = coverage
    ? `${coverage.reconciled} figures reconciled · ${coverage.unlinked} not checked`
    : 'not checked yet'

  // Every reconciled figure, with what became of it. Drift is looked up
  // from the findings; a figure a person confirmed outranks both, because
  // from then on the check is arithmetic rather than a guess.
  const drifted = new Set(
    findings.filter((one) => one.kind === 'drift').map((one) => one.source.ref),
  )
  //: Figures on superseded uploads are not published figures, and the
  //: server scopes the links to what is in force — it is the only side
  //: that can, since working that out needs every artifact in the deal.
  const rows: Row[] = links.map((link) => ({
    id: link.id,
    name: link.cell?.name || link.figure?.label || 'unnamed',
    source: link.cell?.ref ?? '—',
    where: link.figure?.location ?? '',
    //: **What was printed, not what the cell holds.** The cell holds
    //: 0.2136304063; the deck published « 21.4% ». On a product whose
    //: whole argument is that a deck's printed precision is the claim
    //: being made, showing ten decimal places of a float would be
    //: contradicting itself on its own screen. The cell's value is the
    //: fallback for a figure that was reconciled but never printed.
    value: link.figure?.printed || link.cell?.value || '',
    status:
      link.state === 'confirmed'
        ? 'CONFIRMED'
        : drifted.has(link.cell?.ref ?? '')
          ? 'DRIFTED'
          : 'MATCHING',
  }))

  /**
   * Read a dropped file into the deal, then re-check.
   *
   * The check is re-run because a new file changes the answer, and a data
   * room that quietly holds a model nobody reconciled against is the
   * failure this product exists to prevent. It is not conditional on the
   * upload succeeding: a *failed* file changes the answer too, by not
   * being in it.
   */
  const upload = async (files: FileList) => {
    if (!deal) return
    setRejected(null)
    const names = Array.from(files).map((one) => one.name)
    setUploading((was) => [...was, ...names])

    for (const file of Array.from(files)) {
      try {
        await api.upload(dealFor.current, file)
      } catch (problem) {
        // 415 is « this is not a file I can read at all » — a .txt. Every
        // other failure is a state of the deal and comes back on the
        // artifact itself, with a sentence, and shows in the list.
        setRejected(
          problem instanceof ApiError
            ? problem.message
            : 'that file could not be read',
        )
      } finally {
        setUploading((was) => was.filter((one) => one !== file.name))
      }
    }

    try {
      await api.check(dealFor.current)
    } catch {
      // A check that cannot run says so on the run itself; the reload
      // below will show it.
    }
    setRoomVersion((was) => was + 1)
    await load()
  }

  /**
   * Accept a correction, keep the document as it is, or undo.
   *
   * **This one writes.** Accepting fetches the deal's copy, puts the
   * model's figure into it, and stores the result as a new version of the
   * same document; the check then re-runs, so the drift is gone because
   * the deck agrees rather than because anything marked it settled. That
   * is why the whole deal is reloaded afterwards and not one row patched:
   * the document, the coverage and every finding on it have moved.
   *
   * A write that could not be made comes back as a correction in the
   * `failed` state carrying the reason, not as an error — the screen keeps
   * showing it, because a banker who pressed Accept has to be able to find
   * out whether the deck changed.
   */
  const settle = async (
    finding: Finding | null,
    correction: Correction | null,
    decision: 'accept' | 'reject' | 'reverse' | 'propose',
  ) => {
    try {
      const proposal =
        correction ?? (finding ? await api.propose(finding.id) : null)
      if (!proposal) return
      await api.decideCorrection(proposal.id, decision)
      await load()
    } catch (problem) {
      setError(
        problem instanceof ApiError
          ? problem.message
          : 'That change could not be made.',
      )
    }
  }

  /** Confirm, reject, or re-point — then reload, since coverage moved. */
  const decide = async (
    link: Link,
    state: 'confirmed' | 'rejected',
    cellId?: string,
  ) => {
    await api.decide(link.id, state, cellId)
    setLinkDetail(null)
    await load()
  }

  /**
   * Ask the agent, and show it working.
   *
   * The three message kinds the design already draws are exactly the three
   * an agent produces: what was asked, « Used N tools », and the answer.
   * Nothing new was needed for this.
   *
   * **The trace is shown, not logged.** It is most of why an answer reads
   * as looked up rather than composed, and the only way a reader can tell
   * which it was.
   */
  const send = async (text: string) => {
    setMessages((was) => [
      ...was,
      { kind: 'user', text },
      { kind: 'working', text: 'Working' },
    ])
    const drop = (was: Message[]) => was.filter((one) => one.kind !== 'working')

    try {
      const answer = await api.ask(dealFor.current, text)
      setMessages((was) => [
        ...drop(was),
        ...(answer.steps.length
          ? [
              {
                kind: 'tools' as const,
                text: `Used ${answer.steps.length} ${
                  answer.steps.length === 1 ? 'tool' : 'tools'
                } — ${answer.steps.map((one) => one.summary).join(' · ')}`,
              },
            ]
          : []),
        // A run that stopped early says so above its own answer rather
        // than letting a partial one read as a finished one.
        ...(answer.stopped === 'step_limit'
          ? [
              {
                kind: 'tools' as const,
                text: 'Ran out of tool calls — what follows is partial.',
              },
            ]
          : []),
        {
          kind: 'agent' as const,
          text:
            answer.answer ||
            answer.error ||
            'That did not finish, and there is no answer to show.',
        },
      ])
    } catch (problem) {
      setMessages((was) => [
        ...drop(was),
        {
          kind: 'agent',
          text:
            problem instanceof ApiError
              ? problem.message
              : 'Could not reach the server.',
        },
      ])
    }
  }

  return (
    <div
      className="pc-workspace"
      style={{
        height: '100vh',
        width: '100%',
        padding: `${space.page}px ${space.page}px 0`,
        display: 'flex',
        flexDirection: 'column',
        gap: space.gap,
        fontFamily: font.ui,
        color: colour.ink,
        fontSize: size.body,
        lineHeight: 1.5,
        overflow: 'hidden',
        background: pageBackground,
      }}
    >
      <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: space.gap }}>
        {showLeft && (
          <div
            style={{
              flex: '1 1 0',
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              ...panel,
              fontFamily: font.office,
            }}
          >
            <div
              style={{
                flex: '0 0 auto',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '9px 10px',
                borderBottom: `1px solid ${colour.rule}`,
              }}
            >
              <div style={tabChip}>
                <span>{TAB[view]}</span>
              </div>
              <div style={{ flex: 1 }} />
              <span
                style={{
                  color: colour.muted,
                  fontSize: size.meta,
                  paddingRight: 6,
                }}
              >
                {deal}
              </span>
            </div>

            {error ? (
              <div
                style={{
                  padding: 26,
                  color: colour.critical,
                  fontSize: size.meta,
                }}
              >
                {error}
              </div>
            ) : view === 'files' ? (
              <Files
                fetch={roomPage}
                reloadOn={roomVersion}
                deal={deal}
                onOpen={(artifact) => go(SCREEN[artifact.kind])}
                onUpload={(files) => void upload(files)}
                uploading={uploading}
                problem={rejected}
              />
            ) : view === 'checks' ? (
              <Checks
                findings={findings}
                deal={deal}
                coverage={coverageLine}
                onTrace={trace}
                onSlide={() => go('deck')}
                onCell={() => go('sheets')}
              />
            ) : view === 'trace' ? (
              <Trace
                chain={chain}
                title={traced?.source.name ?? traced?.title ?? 'Chain'}
                printed={traced?.printed ?? ''}
                expected={traced?.expected ?? ''}
                rows={[
                  { k: 'Figure', v: `${traced?.title ?? ''}` },
                  { k: 'Source', v: traced?.source.ref ?? '—' },
                  { k: 'Basis', v: traced?.source.basis || '—' },
                  { k: 'Where', v: traced?.where.detail ?? '—' },
                  {
                    k: 'Status',
                    v:
                      traced?.kind === 'drift'
                        ? 'Drifted from the model'
                        : 'Checked',
                  },
                ]}
                onSlide={() => go('deck')}
                onCell={() => go('sheets')}
              />
            ) : view === 'confirm' ? (
              <Confirm
                links={links.filter((one) => one.state === 'proposed')}
                deal={deal}
                detail={linkDetail}
                onSelect={(link) => {
                  void api
                    .link(link.id)
                    .then(setLinkDetail)
                    .catch(() => {})
                }}
                onDecide={(link, state, cellId) =>
                  void decide(link, state, cellId)
                }
                onSearch={(artifactId, query) => api.cells(artifactId, query)}
              />
            ) : view === 'library' ? (
              <Library rows={rows} onOpen={() => go('checks')} />
            ) : view === 'sheets' ? (
              <Sheets
                grid={grid}
                audit={findings.filter((one) => one.kind === 'audit')}
                onCell={trace}
              />
            ) : view === 'deck' || view === 'docs' ? (
              <Document
                map={view === 'deck' ? deckMap : memoMap}
                kind={view === 'deck' ? 'deck' : 'memo'}
                findings={findings}
                corrections={corrections}
                onTrace={trace}
                onDecide={(finding, correction, decision) =>
                  void settle(finding, correction, decision)
                }
              />
            ) : view === 'applications' ? (
              <Applications onGo={go} />
            ) : (
              <div
                style={{
                  padding: 26,
                  color: colour.muted,
                  fontSize: size.meta,
                }}
              >
                {NOT_CONNECTED[view] ?? 'Not connected yet.'}
              </div>
            )}
          </div>
        )}

        <Chat
          messages={messages}
          greeting="Good morning. What are we checking?"
          deal={deal}
          onSend={(text) => void send(text)}
          onNew={() => setMessages([])}
          alone={!showLeft}
          narrow={narrow}
        />
      </div>

      <Dock view={view} onGo={go} deal={deal} />
    </div>
  )
}
