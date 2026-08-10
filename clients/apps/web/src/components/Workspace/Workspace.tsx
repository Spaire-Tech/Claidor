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

import { useCallback, useEffect, useRef, useState } from 'react'

import { Chat, type Message } from './Chat'
import { Dock } from './Dock'
import { ApiError, TieOutApi } from './api'
import type { Artifact, Chain, Coverage, Finding, Link } from './api'
import { colour, font, pageBackground, panel, size, tabChip } from './design'
import { Applications } from './screens/Applications'
import { Checks } from './screens/Checks'
import { Confirm } from './screens/Confirm'
import { Files } from './screens/Files'
import { Library, type Row } from './screens/Library'
import { Trace } from './screens/Trace'
import type { View } from './views'

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
  docs: 'Open a memo from the data room to review it here.',
  sheets: 'Open a model from the data room to audit it here.',
  deck: 'Open a deck from the data room to reconcile it here.',
  projects: 'One deal is open. Projects lists them all once there is more than one.',
  terminal: 'Not connected.',
}

export function Workspace({ dealId }: { dealId: string }) {
  const [view, setView] = useState<View>('chat')
  const [showLeft, setShowLeft] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])

  const [deal, setDeal] = useState('')
  //: The id `load` settled on — the one passed in, or the first this
  //: person is on. Upload and re-check both need it and neither can ask
  //: again without racing the list.
  const dealFor = useRef('')
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [findings, setFindings] = useState<Finding[]>([])
  const [coverage, setCoverage] = useState<Coverage | null>(null)
  const [links, setLinks] = useState<Link[]>([])
  const [chain, setChain] = useState<Chain | null>(null)
  const [traced, setTraced] = useState<Finding | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [linkDetail, setLinkDetail] = useState<Link | null>(null)
  const [uploading, setUploading] = useState<string[]>([])
  const [rejected, setRejected] = useState<string | null>(null)

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
      const [page, found, linked] = await Promise.all([
        api.deal(id),
        api.findings(id),
        api.links(id),
      ])
      dealFor.current = id
      setDeal(page.name)
      setArtifacts(page.artifacts)
      setCoverage(page.coverage)
      setFindings(found)
      setLinks(linked)
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

  const go = (next: View) => {
    setView(next)
    setShowLeft(next !== 'chat')
  }

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
  const coverageLine = coverage
    ? `${coverage.reconciled} figures reconciled · ${coverage.unlinked} not checked · ` +
      `${findings.filter((one) => !one.one_tick).length} findings`
    : 'not checked yet'

  // Every reconciled figure, with what became of it. Drift is looked up
  // from the findings; a figure a person confirmed outranks both, because
  // from then on the check is arithmetic rather than a guess.
  const drifted = new Set(
    findings.filter((one) => one.kind === 'drift').map((one) => one.source.ref),
  )
  const rows: Row[] = links.map((link) => ({
    id: link.id,
    name: link.cell?.name || link.figure?.label || 'unnamed',
    source: link.cell?.ref ?? '—',
    value: link.cell?.value ?? link.figure?.printed ?? '',
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
          problem instanceof ApiError ? problem.message : 'that file could not be read',
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
    await load()
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

  const send = (text: string) => {
    setMessages((was) => [...was, { kind: 'user', text }])
  }

  return (
    <div
      style={{
        height: '100vh',
        width: '100%',
        padding: '18px 18px 0',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        fontFamily: font.ui,
        color: colour.ink,
        fontSize: size.body,
        lineHeight: 1.5,
        overflow: 'hidden',
        background: pageBackground,
      }}
    >
      <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 14 }}>
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
                style={{ color: colour.muted, fontSize: size.meta, paddingRight: 6 }}
              >
                {deal}
              </span>
            </div>

            {error ? (
              <div style={{ padding: 26, color: colour.critical, fontSize: size.meta }}>
                {error}
              </div>
            ) : view === 'files' ? (
              <Files
                artifacts={artifacts}
                deal={deal}
                onOpen={() => go('deck')}
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
                    v: traced?.kind === 'drift' ? 'Drifted from the model' : 'Checked',
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
                  void api.link(link.id).then(setLinkDetail).catch(() => {})
                }}
                onDecide={(link, state, cellId) => void decide(link, state, cellId)}
                onSearch={(artifactId, query) => api.cells(artifactId, query)}
              />
            ) : view === 'library' ? (
              <Library rows={rows} onOpen={() => go('checks')} />
            ) : view === 'applications' ? (
              <Applications onGo={go} />
            ) : (
              <div style={{ padding: 26, color: colour.muted, fontSize: size.meta }}>
                {NOT_CONNECTED[view] ?? 'Not connected yet.'}
              </div>
            )}
          </div>
        )}

        <Chat
          messages={messages}
          greeting="Good morning. What are we checking?"
          deal={deal}
          onSend={send}
          onNew={() => setMessages([])}
          wide={!showLeft}
        />
      </div>

      <Dock
        view={view}
        onGo={go}
        showLeft={showLeft}
        onToggleLeft={() => setShowLeft((was) => !was)}
        deal={deal}
      />
    </div>
  )
}
