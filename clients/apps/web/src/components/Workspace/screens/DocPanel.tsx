'use client'

/**
 * The document panel — one file, everything Pierce knows about it.
 *
 * Source of truth: `docs/pierce/design/markup.html`, the `docOpen`
 * section. Facts, version history, what is hidden inside it, and the
 * findings on this document with their evidence.
 *
 * Every number is the server's. The facts come from the artifact's own
 * counts and the figure map; « Hidden inside it » is the metadata
 * checker run on the stored bytes, and a file the checker does not read
 * shows the checker's own refusal sentence in place of the list. The
 * design's fourth fact row — « Checked against an older model » — needs
 * per-figure staleness the server cannot yet say, so it is not drawn:
 * a number that cannot be computed is not shown as zero.
 *
 * Evidence, by the finding's shape: a cell finding shows four rows of
 * the model around its cell, from the real grid; a prose finding shows
 * its sentence with the figure marked; a slide finding shows the
 * design's slide sketch carrying the real figure and label.
 *
 * « Not a problem » dismisses — and a dismissal must say why, so the
 * button opens the design's own writing box (no border, no outline) for
 * one sentence. The server refuses a bare dismissal; the input exists
 * because the contract does.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { ago } from '../files'
import {
  Artifact,
  ChainFact,
  DocumentFacts,
  Finding,
  HiddenReport,
  ModelGrid,
  RecalcMark,
  TieOutApi,
  Version,
} from './../api'
import {
  cardRing,
  fileIcon,
  font,
  hairline,
  ink,
  inputGlow,
  well,
} from './../design'

const OPEN_LABEL: Record<string, string> = {
  deck: 'Open in PowerPoint',
  memo: 'Open in Word',
  model: 'Open in Excel',
  message: 'Open in Outlook',
  source: 'Open',
}

//: The denylist's categories, said in words a person can act on. The
//: category names are the engine's own (`polar.tieout.recalc.denylist`).
const REFUSAL_WORDS: Record<string, string> = {
  rtd: 'a real-time feed — its value was gone the moment the file was saved',
  udf: 'a macro or add-in function — the code is not in the cells',
  'external-link': 'a reference reaching outside this file',
  lambda: 'a LAMBDA — a construct our free engine does not have',
  cube: 'an OLAP cube connection a headless engine does not have',
  'engine-gap': 'a function our engine measurably cannot compute',
}

//: The mark's ink, one colour per verdict — the same palette the rest
//: of the workspace speaks.
const VERDICT_INK: Record<string, string> = {
  pass: '#1f8a4c',
  fail: '#e0322d',
  refused: '#e8a300',
  'nothing-compared': '#8f96a0',
}

const panelHead = {
  fontSize: 12,
  fontWeight: 500,
  letterSpacing: '.05em',
  textTransform: 'uppercase',
  color: '#86868b',
  padding: '20px 4px 8px',
} as const

const panelCard = {
  background: '#fff',
  borderRadius: 13,
  boxShadow: cardRing,
  overflow: 'hidden',
} as const

export interface DocPanelProps {
  api: TieOutApi
  dealId: string
  doc: Artifact
  /** « Open the cell » — a finding id to arrive open on, so the panel
   *  lands with that finding's cell and its neighbourhood showing. */
  openAt?: string | null
  onClose: () => void
  /** A ruling changed a finding — the page behind should reload. */
  onChanged: () => void
  /** A finding opened or closed — the shell opens the chat on it. */
  onChat?: (
    ctx: { findingId: string; title: string; says: string } | null,
  ) => void
}

export const DocPanel = ({
  api,
  dealId,
  doc,
  openAt = null,
  onClose,
  onChanged,
  onChat,
}: DocPanelProps) => {
  const [findings, setFindings] = useState<Finding[]>([])
  const [versions, setVersions] = useState<Version[] | null>(null)
  const [hidden, setHidden] = useState<HiddenReport | null>(null)
  const [hiddenError, setHiddenError] = useState<string | null>(null)
  const [traced, setTraced] = useState<{ yes: number; no: number } | null>(null)
  const [grid, setGrid] = useState<ModelGrid | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  //: The source viewer (source PDFs only): the Chain's stored facts,
  //: the fact whose page is on screen, and that page's pixels. Page
  //: object URLs are cached per page and revoked when the panel moves
  //: to another document.
  const isSourcePdf =
    doc.kind === 'source' && doc.filename.toLowerCase().endsWith('.pdf')
  const [chain, setChain] = useState<DocumentFacts | null>(null)
  const [chainWord, setChainWord] = useState<string | null>(null)
  const [reading, setReading] = useState(false)
  //: The recalculation mark (ready models only): the stored verdict
  //: arrives on the artifact's own counts; running the gate replaces
  //: it live and the server keeps it for every later read.
  const isModel = doc.kind === 'model' && doc.status === 'ready'
  const [mark, setMark] = useState<RecalcMark | null>(
    (doc.counts['recalc'] as RecalcMark | undefined) ?? null,
  )
  const [recalcing, setRecalcing] = useState(false)
  const [recalcWord, setRecalcWord] = useState<string | null>(null)
  const [activeFact, setActiveFact] = useState<string | null>(null)
  const [pageShown, setPageShown] = useState<number | null>(null)
  const [pageUrl, setPageUrl] = useState<string | null>(null)
  const [pageWord, setPageWord] = useState<string | null>(null)
  const pageCache = useRef<Map<number, string>>(new Map())

  useEffect(() => {
    let live = true
    setVersions(null)
    setHidden(null)
    setHiddenError(null)
    setTraced(null)
    setOpen(null)
    api
      .findings(dealId, doc.id)
      .then((found) => live && setFindings(found))
      .catch(() => undefined)
    api
      .versions(doc.id)
      .then((found) => live && setVersions(found))
      .catch(() => undefined)
    api
      .metadata(doc.id)
      .then((found) => live && setHidden(found))
      .catch(
        (problem) => live && setHiddenError(String(problem.message ?? problem)),
      )
    api
      .figures(doc.id)
      .then((map) => {
        if (!live) return
        let yes = 0
        let no = 0
        for (const slide of map.slides)
          for (const figure of slide.figures) {
            if (figure.state === 'unlinked') no++
            else yes++
          }
        setTraced({ yes, no })
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [api, dealId, doc.id])

  //: The Chain's stored record for a source PDF, loaded with the
  //: panel; page pixels cached per page, revoked when the document
  //: changes.
  useEffect(() => {
    setChain(null)
    setChainWord(null)
    setActiveFact(null)
    setPageShown(null)
    setPageUrl(null)
    setPageWord(null)
    const cache = pageCache.current
    if (!isSourcePdf) return
    let live = true
    api
      .documentFacts(doc.id)
      .then((got) => live && setChain(got))
      .catch(
        (problem: unknown) =>
          live &&
          setChainWord(
            problem instanceof Error ? problem.message : 'something went wrong',
          ),
      )
    return () => {
      live = false
      for (const url of cache.values()) URL.revokeObjectURL(url)
      cache.clear()
    }
  }, [api, doc.id, isSourcePdf])

  //: The mark travels with the artifact, so a panel opened on a marked
  //: version starts from the stored verdict rather than a blank.
  useEffect(() => {
    setMark((doc.counts['recalc'] as RecalcMark | undefined) ?? null)
    setRecalcing(false)
    setRecalcWord(null)
  }, [doc.id, doc.counts])

  //: « Run the recalculation » — deliberate and heavy: the whole model
  //: goes through the engine. The failure sentence is the server's own
  //: (no adequate LibreOffice, a file the engine died on) and is shown
  //: as it stands; nothing is stored on failure.
  const runRecalc = () => {
    if (recalcing) return
    setRecalcing(true)
    setRecalcWord(null)
    api
      .recalculate(doc.id)
      .then((got) => {
        setMark(got)
        onChanged()
      })
      .catch((problem: unknown) =>
        setRecalcWord(
          problem instanceof Error ? problem.message : 'something went wrong',
        ),
      )
      .finally(() => setRecalcing(false))
  }

  //: Click a number, see the page: fetch (or reuse) that page's
  //: pixels and put the fact's box on top. A refusal is the server's
  //: own sentence, shown where the page would be.
  const showFact = (fact: ChainFact) => {
    setActiveFact(fact.id)
    setPageWord(null)
    setPageShown(fact.page)
    const held = pageCache.current.get(fact.page)
    if (held) {
      setPageUrl(held)
      return
    }
    setPageUrl(null)
    api
      .pageImage(doc.id, fact.page)
      .then((url) => {
        pageCache.current.set(fact.page, url)
        setPageUrl(url)
      })
      .catch((problem: unknown) =>
        setPageWord(
          problem instanceof Error ? problem.message : 'something went wrong',
        ),
      )
  }

  //: « Read the document » — the deliberate write that fills the
  //: store. Idempotent server-side, so a re-read replaces wholesale.
  const readDocument = () => {
    if (reading) return
    setReading(true)
    setChainWord(null)
    api
      .extractDocument(doc.id)
      .then((got) => setChain(got))
      .catch((problem: unknown) =>
        setChainWord(
          problem instanceof Error ? problem.message : 'something went wrong',
        ),
      )
      .finally(() => setReading(false))
  }

  //: « Open the cell » from a finding's modal: the panel arrives with
  //: that finding open, scrolled into view — the cell and its
  //: neighbourhood are its evidence.
  useEffect(() => {
    if (!openAt || findings.every((one) => one.id !== openAt)) return
    setOpen(openAt)
    document
      .getElementById(`finding-${openAt}`)
      ?.scrollIntoView({ block: 'center' })
  }, [openAt, findings])

  //: The model grid, once, for cell evidence. Loaded lazily on the first
  //: cell finding opened rather than with the panel.
  const wantGrid = useMemo(() => {
    const finding = findings.find((one) => one.id === open)
    return finding?.source.artifact_id ?? null
  }, [findings, open])
  useEffect(() => {
    if (!wantGrid || grid?.artifact_id === wantGrid) return
    let live = true
    api
      .grid(wantGrid)
      .then((found) => live && setGrid(found))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [api, wantGrid, grid])

  const mine = findings.filter(
    (one) => one.where.artifact_id === doc.id && one.state === 'open',
  )
  const figures = Number(doc.counts['figures'] ?? 0)
  const slides = Number(doc.counts['slides'] ?? 0)
  const pages = Number(doc.counts['pages'] ?? 0)
  const cells = Number(doc.counts['cells'] ?? 0)

  const facts: { label: string; value: string }[] = []
  if (figures > 0)
    facts.push({
      label: 'Figures read',
      value:
        slides > 0
          ? `${figures} across ${slides} slides`
          : pages > 0
            ? `${figures} across ${pages} pages`
            : String(figures),
    })
  if (cells > 0) facts.push({ label: 'Named cells', value: String(cells) })
  if (traced !== null && figures > 0) {
    facts.push({ label: 'Traced to the model', value: String(traced.yes) })
    facts.push({ label: 'Not traced', value: String(traced.no) })
  }

  return (
    <div
      style={{
        //: The design pane: full-bleed white beside the main pane's
        //: seam — the floating glass card is retired with its design.
        flex: '1 1 0',
        minWidth: 380,
        order: 2,
        display: 'flex',
        flexDirection: 'column',
        background: '#ffffff',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          flex: '0 0 auto',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '14px 16px 13px 20px',
          borderBottom: '1px solid #f0eeec',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={
            doc.kind === 'model'
              ? fileIcon.xls
              : doc.kind === 'deck'
                ? fileIcon.ppt
                : fileIcon.doc
          }
          alt=""
          style={{
            flex: '0 0 22px',
            width: 22,
            height: 22,
            objectFit: 'contain',
          }}
        />
        <span
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 15.5,
            fontWeight: 500,
            letterSpacing: '-.015em',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {doc.filename}
        </span>
        <button
          onClick={onClose}
          title="Close"
          style={{
            flex: '0 0 auto',
            border: 0,
            background: 'transparent',
            borderRadius: 8,
            padding: 5,
            cursor: 'pointer',
            display: 'flex',
            color: '#8e8e93',
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <line x1="6" y1="6" x2="18" y2="18" />
            <line x1="18" y1="6" x2="6" y2="18" />
          </svg>
        </button>
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          background: well,
          padding: 18,
        }}
      >
        {/* Open + Download. Both fetch the stored file — a deep link into
            the host application arrives with the connector metadata. */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() =>
              api
                .download(doc.id)
                .then(({ url }) => window.open(url, '_blank'))
                .catch(() => undefined)
            }
            style={{
              flex: 1,
              border: 0,
              background: ink.accent,
              color: '#fff',
              borderRadius: 11,
              padding: 11,
              font: 'inherit',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            {OPEN_LABEL[doc.kind] ?? 'Open'}
          </button>
          <button
            onClick={() =>
              api
                .download(doc.id)
                .then(({ url }) => window.open(url, '_blank'))
                .catch(() => undefined)
            }
            style={{
              flex: '0 0 auto',
              border: 0,
              background: '#fff',
              color: ink.primary,
              borderRadius: 11,
              padding: '11px 16px',
              font: 'inherit',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
              boxShadow: cardRing,
            }}
          >
            Download
          </button>
        </div>

        {/* The recalculation mark — agent-designed (no founder drawing
            covers it). The gate's four verdicts, each with its honest
            face: validated names the engine and the count; a failure
            names the differing cells; a refusal says, in words, which
            constructs no engine of ours may honestly compute and where
            that routes the file. Never run is a state too, with the
            deliberate button — recalculation is heavy and is never
            done behind anyone's back. */}
        {isModel && (
          <>
            <div style={panelHead}>Validated by recalculation</div>
            <div style={{ ...panelCard, padding: '14px 16px' }}>
              {mark === null ? (
                <>
                  <div
                    style={{
                      fontSize: 13.5,
                      color: ink.secondary,
                      lineHeight: 1.55,
                    }}
                  >
                    This version has not been recalculated. The engine re-runs
                    every formula from the file&rsquo;s own inputs and compares
                    what Excel left behind, cell by cell — or refuses, in
                    words, a file it may not honestly compute.
                  </div>
                  {recalcWord !== null && (
                    <div
                      style={{
                        paddingTop: 10,
                        fontSize: 13,
                        color: '#c9302c',
                        lineHeight: 1.5,
                      }}
                    >
                      {recalcWord}
                    </div>
                  )}
                  <button
                    onClick={runRecalc}
                    disabled={recalcing}
                    style={{
                      marginTop: 12,
                      border: 0,
                      background: recalcing ? '#eceef1' : ink.accent,
                      color: recalcing ? ink.secondary : '#fff',
                      borderRadius: 9,
                      padding: '9px 14px',
                      font: 'inherit',
                      fontSize: 13.5,
                      fontWeight: 500,
                      cursor: recalcing ? 'default' : 'pointer',
                    }}
                  >
                    {recalcing
                      ? 'Recalculating — the whole model is going through the engine…'
                      : 'Run the recalculation'}
                  </button>
                </>
              ) : (
                <>
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: 9 }}
                  >
                    <span
                      style={{
                        flex: '0 0 auto',
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: VERDICT_INK[mark.verdict] ?? '#8f96a0',
                      }}
                    />
                    <span
                      style={{
                        fontSize: 14,
                        fontWeight: 500,
                        letterSpacing: '-.01em',
                        color: ink.primary,
                      }}
                    >
                      {mark.verdict === 'pass'
                        ? 'Validated by recalculation'
                        : mark.verdict === 'fail'
                          ? 'The engine could not reproduce this file'
                          : mark.verdict === 'refused'
                            ? 'Not recalculated — refused, in words'
                            : 'Nothing to compare'}
                    </span>
                  </div>
                  <div
                    style={{
                      paddingTop: 8,
                      fontSize: 13.5,
                      color: ink.secondary,
                      lineHeight: 1.55,
                    }}
                  >
                    {mark.verdict === 'pass' && (
                      <>
                        The engine re-ran the file&rsquo;s formulas from their
                        own inputs and reproduced all {mark.matched} compared
                        cells exactly.
                        {mark.volatile_cone > 0 &&
                          ` ${mark.volatile_cone} live cells (TODAY, NOW, RAND and their dependents) were set aside — their stored values belong to the moment the file was saved.`}
                      </>
                    )}
                    {mark.verdict === 'fail' && (
                      <>
                        {mark.mismatch_count > 0 &&
                          `${mark.mismatch_count} of ${mark.compared} compared cells came back different. `}
                        {mark.engine_error_count > 0 &&
                          `${mark.engine_error_count} cells returned engine errors against stored numbers — the engine's measured inability on those constructs, not the model's defect. `}
                        {mark.not_computed > 0 &&
                          `${mark.not_computed} formula cells came back with nothing.`}
                      </>
                    )}
                    {mark.verdict === 'refused' && (
                      <>
                        The prescan found constructs no engine of ours may
                        honestly compute, so no number is claimed:
                      </>
                    )}
                    {mark.verdict === 'nothing-compared' && (
                      <>
                        The file&rsquo;s formula cells carry no stored values —
                        a generator wrote it and Excel never computed it — so
                        there was nothing to compare and nothing is certified.
                      </>
                    )}
                  </div>
                  {mark.verdict === 'fail' &&
                    [...mark.mismatches, ...mark.engine_errors].length > 0 && (
                      <div
                        style={{
                          marginTop: 10,
                          borderTop: hairline,
                          paddingTop: 4,
                        }}
                      >
                        {[...mark.mismatches, ...mark.engine_errors]
                          .slice(0, 12)
                          .map((diff) => (
                            <div
                              key={diff.ref}
                              style={{
                                display: 'flex',
                                alignItems: 'baseline',
                                gap: 10,
                                padding: '6px 0',
                                fontFamily: font.mono,
                                fontSize: 12,
                              }}
                            >
                              <span style={{ color: ink.primary }}>
                                {diff.ref}
                              </span>
                              <span
                                style={{
                                  flex: 1,
                                  minWidth: 0,
                                  textAlign: 'right',
                                  color: ink.secondary,
                                }}
                              >
                                {diff.stored ?? '—'} stored
                              </span>
                              <span
                                style={{ color: '#c9302c', textAlign: 'right' }}
                              >
                                {diff.computed ?? 'nothing'} recalculated
                              </span>
                            </div>
                          ))}
                      </div>
                    )}
                  {mark.verdict === 'refused' && (
                    <>
                      <div
                        style={{
                          marginTop: 10,
                          borderTop: hairline,
                          paddingTop: 4,
                        }}
                      >
                        {mark.refusals.map((refusal) => (
                          <div
                            key={`${refusal.ref}-${refusal.target}`}
                            style={{
                              display: 'flex',
                              alignItems: 'baseline',
                              gap: 10,
                              padding: '6px 0',
                            }}
                          >
                            <span
                              style={{
                                flex: '0 0 auto',
                                fontFamily: font.mono,
                                fontSize: 12,
                                color: ink.primary,
                              }}
                            >
                              {refusal.ref}
                            </span>
                            <span
                              style={{
                                flex: 1,
                                minWidth: 0,
                                fontSize: 12.5,
                                color: ink.secondary,
                                lineHeight: 1.5,
                              }}
                            >
                              {refusal.target} —{' '}
                              {REFUSAL_WORDS[refusal.category] ??
                                refusal.category}
                            </span>
                          </div>
                        ))}
                        {mark.refusal_count > mark.refusals.length && (
                          <div
                            style={{
                              padding: '6px 0',
                              fontSize: 12.5,
                              color: ink.faint,
                            }}
                          >
                            …and {mark.refusal_count - mark.refusals.length}{' '}
                            more.
                          </div>
                        )}
                      </div>
                      <div
                        style={{
                          paddingTop: 8,
                          fontSize: 13,
                          color: ink.secondary,
                          lineHeight: 1.55,
                        }}
                      >
                        {mark.route === 'arbiter'
                          ? 'Real Excel could settle this file. Until an arbiter run exists, the honest answer is « we did not check this ».'
                          : 'Nothing we could run recomputes these, so the honest answer is « we did not check this ».'}
                      </div>
                    </>
                  )}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      gap: 10,
                      marginTop: 12,
                      borderTop: hairline,
                      paddingTop: 10,
                    }}
                  >
                    <span
                      style={{
                        flex: 1,
                        minWidth: 0,
                        fontFamily: font.mono,
                        fontSize: 11,
                        color: ink.faint,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      run {ago(mark.computed_at)}
                      {mark.engine ? ` · ${mark.engine}` : ''}
                    </span>
                    <button
                      onClick={runRecalc}
                      disabled={recalcing}
                      style={{
                        flex: '0 0 auto',
                        border: 0,
                        background: 'transparent',
                        padding: 0,
                        font: 'inherit',
                        fontSize: 12.5,
                        fontWeight: 500,
                        color: recalcing ? ink.faint : ink.accent,
                        cursor: recalcing ? 'default' : 'pointer',
                      }}
                    >
                      {recalcing ? 'Recalculating…' : 'Run again'}
                    </button>
                  </div>
                  {recalcWord !== null && (
                    <div
                      style={{
                        paddingTop: 8,
                        fontSize: 13,
                        color: '#c9302c',
                        lineHeight: 1.5,
                      }}
                    >
                      {recalcWord}
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}

        {/* The source viewer — agent-designed (no founder drawing
            covers it). The click-a-number, see-the-highlighted-page
            moment: the Chain's stored facts, each cited to a page and
            a box; the page rendered from the stored bytes with the
            fact's box ringed. Coverage is part of the answer — pages
            the extractor refused are listed in its own words. */}
        {isSourcePdf && (
          <>
            <div style={panelHead}>Every number, cited to its page</div>
            {pageShown !== null && (
              <div style={{ ...panelCard, padding: 10 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 10,
                    padding: '2px 6px 10px',
                  }}
                >
                  <span
                    style={{
                      fontFamily: font.mono,
                      fontSize: 12,
                      color: ink.secondary,
                    }}
                  >
                    p. {pageShown}
                  </span>
                  <span style={{ fontSize: 12.5, color: ink.faint }}>
                    rendered from the stored file, the cited box ringed
                  </span>
                </div>
                {pageWord !== null ? (
                  <div
                    style={{
                      padding: '18px 6px',
                      fontSize: 13.5,
                      color: ink.secondary,
                      lineHeight: 1.5,
                    }}
                  >
                    {pageWord}
                  </div>
                ) : pageUrl === null ? (
                  <div
                    style={{
                      minHeight: 220,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 13.5,
                      color: ink.faint,
                      background: well,
                      borderRadius: 9,
                    }}
                  >
                    Rendering page {pageShown}…
                  </div>
                ) : (
                  <div
                    style={{
                      position: 'relative',
                      borderRadius: 9,
                      overflow: 'hidden',
                      boxShadow: cardRing,
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={pageUrl}
                      alt={`Page ${pageShown} of ${doc.filename}`}
                      style={{ display: 'block', width: '100%' }}
                    />
                    {(chain?.facts ?? [])
                      .filter(
                        (fact) =>
                          fact.page === pageShown && fact.id === activeFact,
                      )
                      .map((fact) => (
                        //: Percent coordinates off the page's own point
                        //: size, so the ring lands regardless of render
                        //: resolution. Padded a hair so the glyphs
                        //: breathe inside the ring.
                        <span
                          key={fact.id}
                          style={{
                            position: 'absolute',
                            left: `${((fact.box.x0 - 2) / fact.page_width) * 100}%`,
                            top: `${((fact.box.top - 2) / fact.page_height) * 100}%`,
                            width: `${((fact.box.x1 - fact.box.x0 + 4) / fact.page_width) * 100}%`,
                            height: `${((fact.box.bottom - fact.box.top + 4) / fact.page_height) * 100}%`,
                            border: '2px solid #0060d0',
                            borderRadius: 4,
                            boxShadow:
                              '0 0 0 3px rgba(0,96,208,.18), 0 0 18px rgba(0,96,208,.25)',
                            pointerEvents: 'none',
                          }}
                        />
                      ))}
                  </div>
                )}
              </div>
            )}
            <div style={panelCard}>
              {chainWord !== null && (
                <div
                  style={{
                    padding: '13px 16px',
                    fontSize: 13.5,
                    color: ink.secondary,
                    lineHeight: 1.5,
                  }}
                >
                  {chainWord}
                </div>
              )}
              {chainWord === null && chain === null && (
                <div
                  style={{
                    padding: '13px 16px',
                    fontSize: 13.5,
                    color: ink.faint,
                  }}
                >
                  Looking up what the Chain holds…
                </div>
              )}
              {chain !== null &&
                chain.facts.length === 0 &&
                chain.refusals.length === 0 && (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                      padding: '14px 16px',
                    }}
                  >
                    <span
                      style={{
                        fontSize: 13.5,
                        color: ink.secondary,
                        lineHeight: 1.5,
                      }}
                    >
                      This document has not been read into the Chain yet.
                      Reading it extracts every number with its page and
                      highlight box — nothing is sent anywhere.
                    </span>
                    <button
                      onClick={readDocument}
                      style={{
                        alignSelf: 'flex-start',
                        border: 0,
                        background: ink.accent,
                        color: '#fff',
                        borderRadius: 11,
                        padding: '9px 16px',
                        font: 'inherit',
                        fontSize: 13.5,
                        fontWeight: 500,
                        cursor: reading ? 'progress' : 'pointer',
                      }}
                    >
                      {reading ? 'Reading…' : 'Read the document'}
                    </button>
                  </div>
                )}
              {chain !== null &&
                chain.facts
                  .slice()
                  .sort((a, b) => a.page - b.page || a.box.top - b.box.top)
                  .map((fact, index) => {
                    const on = activeFact === fact.id
                    return (
                      <button
                        key={fact.id}
                        onClick={() => showFact(fact)}
                        style={{
                          display: 'flex',
                          alignItems: 'baseline',
                          gap: 10,
                          width: '100%',
                          textAlign: 'left',
                          border: 0,
                          borderTop: index === 0 ? 0 : hairline,
                          background: on
                            ? 'rgba(0,96,208,.045)'
                            : 'transparent',
                          font: 'inherit',
                          cursor: 'pointer',
                          padding: '10px 16px',
                        }}
                      >
                        <span
                          style={{
                            flex: '0 0 auto',
                            fontFamily: font.mono,
                            fontSize: 13,
                            fontWeight: 500,
                            color: on ? '#0060d0' : ink.primary,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {fact.text}
                        </span>
                        <span
                          style={{
                            flex: 1,
                            minWidth: 0,
                            fontSize: 12.5,
                            color: ink.secondary,
                            lineHeight: 1.45,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {fact.line}
                        </span>
                        <span
                          style={{
                            flex: '0 0 auto',
                            fontSize: 11.5,
                            color: ink.faint,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          p. {fact.page}
                        </span>
                      </button>
                    )
                  })}
              {chain !== null && chain.refusals.length > 0 && (
                <div
                  style={{
                    borderTop: hairline,
                    padding: '11px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                  }}
                >
                  {/* Coverage said out loud: the pages the extractor
                      refused, each with its reason — a gap is part of
                      the answer, never a silence. */}
                  {chain.refusals.map((refusal) => (
                    <span
                      key={`${refusal.page}-${refusal.reason}`}
                      style={{
                        fontSize: 12.5,
                        color: ink.faint,
                        lineHeight: 1.5,
                      }}
                    >
                      p. {refusal.page} not read — {refusal.reason}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {facts.length > 0 && (
          <>
            <div style={panelHead}>What Swens found in it</div>
            <div style={panelCard}>
              {facts.map((fact, index) => (
                <div
                  key={fact.label}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    borderTop: index === 0 ? 0 : hairline,
                    padding: '11px 16px',
                  }}
                >
                  <span style={{ flex: 1, minWidth: 0, fontSize: 14.5 }}>
                    {fact.label}
                  </span>
                  <span
                    style={{
                      flex: '0 0 auto',
                      fontSize: 14.5,
                      fontWeight: 500,
                      color: ink.primary,
                    }}
                  >
                    {fact.value}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        {versions !== null && versions.length > 0 && (
          <>
            <div style={panelHead}>Version history</div>
            <div style={panelCard}>
              {versions.map((one, index) => (
                <div
                  key={one.id}
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 12,
                    borderTop: index === 0 ? 0 : hairline,
                    padding: '11px 16px',
                  }}
                >
                  <span
                    style={{
                      flex: '0 0 auto',
                      fontFamily: font.mono,
                      fontSize: 13,
                      color: ink.primary,
                    }}
                  >
                    v{one.version}
                  </span>
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontSize: 14,
                      color: ink.primary,
                    }}
                  >
                    {/* The design's mid column is a change summary, which
                        needs a diff engine per pair. What is true today
                        is who brought the version. */}
                    {one.uploaded_by
                      ? `uploaded by ${one.uploaded_by.name}`
                      : 'received'}
                  </span>
                  <span
                    style={{
                      flex: '0 0 auto',
                      fontSize: 12.5,
                      color: ink.faint,
                    }}
                  >
                    {ago(one.uploaded_at)}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        <div style={panelHead}>Hidden inside it</div>
        <div style={panelCard}>
          {hidden === null && hiddenError === null && (
            <div
              style={{
                padding: '11px 16px',
                fontSize: 13.5,
                color: ink.secondary,
              }}
            >
              Reading the file…
            </div>
          )}
          {hiddenError !== null && (
            <div
              style={{
                padding: '11px 16px',
                fontSize: 13.5,
                color: ink.secondary,
              }}
            >
              {hiddenError}
            </div>
          )}
          {hidden !== null && hidden.refused !== null && (
            <div
              style={{
                padding: '11px 16px',
                fontSize: 13.5,
                color: ink.secondary,
              }}
            >
              {hidden.refused}
            </div>
          )}
          {hidden !== null && hidden.refused === null && (
            <>
              {hidden.findings.filter((one) => one.severity === 'leak')
                .length === 0 && (
                <div
                  style={{
                    padding: '11px 16px',
                    fontSize: 13.5,
                    color: ink.secondary,
                  }}
                >
                  Nothing in this file that is not on its page.
                </div>
              )}
              {hidden.findings
                .filter((one) => one.severity === 'leak')
                .map((one, index) => (
                  <div
                    key={`${one.rule}-${index}`}
                    style={{
                      borderTop: index === 0 ? 0 : hairline,
                      padding: '11px 16px',
                    }}
                  >
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 12 }}
                    >
                      <span style={{ flex: 1, minWidth: 0, fontSize: 14.5 }}>
                        {one.detail}
                      </span>
                      <span
                        style={{
                          flex: '0 0 auto',
                          fontSize: 14.5,
                          fontWeight: 500,
                          color: ink.stale,
                        }}
                      >
                        {one.where}
                      </span>
                    </div>
                    {one.evidence && (
                      <div
                        style={{
                          fontFamily: font.mono,
                          fontSize: 12,
                          color: ink.secondary,
                          marginTop: 3,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {one.evidence}
                      </div>
                    )}
                  </div>
                ))}
            </>
          )}
        </div>

        {mine.length > 0 && (
          <>
            <div style={panelHead}>Findings</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {mine.map((finding) => (
                <FindingCard
                  key={finding.id}
                  id={`finding-${finding.id}`}
                  api={api}
                  finding={finding}
                  grid={grid}
                  open={open === finding.id}
                  onToggle={() => {
                    const closing = open === finding.id
                    setOpen(closing ? null : finding.id)
                    //: The design opens the chat on the finding as the
                    //: card opens, and clears it as the card closes.
                    onChat?.(
                      closing
                        ? null
                        : {
                            findingId: finding.id,
                            title: finding.title,
                            says: saysOf(finding),
                          },
                    )
                  }}
                  onChanged={onChanged}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/** The card's second line, shared with the chat's opening sentence. */
const saysOf = (finding: Finding): string =>
  finding.printed && finding.expected
    ? `The document says ${finding.printed} · the model says ${finding.expected}`
    : finding.context || finding.where.detail

const FindingCard = ({
  api,
  id,
  finding,
  grid,
  open,
  onToggle,
  onChanged,
}: {
  api: TieOutApi
  id?: string
  finding: Finding
  grid: ModelGrid | null
  open: boolean
  onToggle: () => void
  onChanged: () => void
}) => {
  const [dismissing, setDismissing] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  const says = saysOf(finding)
  const where = [finding.where.label, finding.source.ref]
    .filter(Boolean)
    .join(' · ')

  const dismiss = () => {
    if (!note.trim() || busy) return
    setBusy(true)
    api
      .dismiss(finding.id, 'dismissed', note.trim())
      .then(() => onChanged())
      .catch((error) => setProblem(String(error.message ?? error)))
      .finally(() => setBusy(false))
  }

  const rebase = () => {
    if (busy) return
    setBusy(true)
    api
      .propose(finding.id)
      .then((correction) => api.decideCorrection(correction.id, 'applied'))
      .then(() => onChanged())
      .catch((error) => setProblem(String(error.message ?? error)))
      .finally(() => setBusy(false))
  }

  return (
    <div
      id={id}
      style={{
        background: open ? 'rgba(255,255,255,.62)' : '#fff',
        backdropFilter: open ? 'blur(30px) saturate(1.8)' : 'none',
        WebkitBackdropFilter: open ? 'blur(30px) saturate(1.8)' : 'none',
        border: open ? '1px solid rgba(255,255,255,.95)' : 0,
        borderRadius: open ? 17 : 13,
        boxShadow: open
          ? '0 16px 40px rgba(16,20,28,.18), 0 0 0 1px rgba(16,20,28,.05), inset 0 1px 0 rgba(255,255,255,.95)'
          : cardRing,
        overflow: 'hidden',
        transition: 'box-shadow .18s ease',
      }}
    >
      <button
        onClick={onToggle}
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12,
          width: '100%',
          textAlign: 'left',
          border: 0,
          background: 'transparent',
          font: 'inherit',
          cursor: 'pointer',
          padding: '13px 14px 13px 16px',
        }}
      >
        <span
          style={{
            flex: '0 0 8px',
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: finding.kind === 'stale' ? ink.staleDot : ink.accent,
            marginTop: 6,
          }}
        />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span
            style={{
              display: 'block',
              fontSize: 14.5,
              fontWeight: 500,
              letterSpacing: '-.01em',
            }}
          >
            {finding.title}
          </span>
          <span
            style={{
              display: 'block',
              fontSize: 13.5,
              color: '#3a3a3c',
              marginTop: 3,
            }}
          >
            {says}
          </span>
          <span
            style={{
              display: 'block',
              fontFamily: font.mono,
              fontSize: 12,
              color: ink.secondary,
              marginTop: 3,
            }}
          >
            {where}
          </span>
        </span>
      </button>

      {open && (
        <div
          style={{
            borderTop: '1px solid rgba(255,255,255,.7)',
            padding: '15px 17px 17px',
          }}
        >
          <Evidence finding={finding} grid={grid} />

          <div
            style={{
              fontSize: 13.5,
              color: '#3a3a3c',
              lineHeight: 1.5,
              marginTop: 12,
            }}
          >
            {finding.where.detail || finding.context}
          </div>
          {problem !== null && (
            <div
              style={{
                fontSize: 13.5,
                color: ink.stale,
                lineHeight: 1.5,
                marginTop: 8,
              }}
            >
              {problem}
            </div>
          )}
          {dismissing ? (
            <div
              style={{
                display: 'flex',
                gap: 8,
                marginTop: 12,
                alignItems: 'center',
              }}
            >
              {/* The design's writing box: no border, no outline, focus
                  is the soft glow. A dismissal must say why — the server
                  refuses one that does not. */}
              <input
                autoFocus
                value={note}
                onChange={(event) => setNote(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') dismiss()
                  if (event.key === 'Escape') setDismissing(false)
                }}
                placeholder="Why is it fine?"
                style={{
                  flex: 1,
                  minWidth: 0,
                  border: 0,
                  background: '#f0f0f2',
                  borderRadius: 9,
                  padding: '8px 12px',
                  font: 'inherit',
                  fontSize: 13.5,
                  color: ink.primary,
                  outline: 'none',
                  boxShadow: note ? inputGlow : 'none',
                }}
              />
              <button
                onClick={dismiss}
                style={{
                  border: 0,
                  background: note.trim() ? ink.accent : '#c4c4c9',
                  color: '#fff',
                  borderRadius: 9,
                  padding: '8px 14px',
                  font: 'inherit',
                  fontSize: 13.5,
                  fontWeight: 500,
                  cursor: note.trim() ? 'pointer' : 'default',
                }}
              >
                Dismiss
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              {finding.kind === 'drift' && (
                <button
                  onClick={rebase}
                  style={{
                    border: 0,
                    background: ink.accent,
                    color: '#fff',
                    borderRadius: 9,
                    padding: '8px 14px',
                    font: 'inherit',
                    fontSize: 13.5,
                    fontWeight: 500,
                    cursor: 'pointer',
                    opacity: busy ? 0.55 : 1,
                  }}
                >
                  Rebase
                </button>
              )}
              <button
                onClick={() => setDismissing(true)}
                style={{
                  border: 0,
                  background: '#f0f0f2',
                  color: ink.primary,
                  borderRadius: 9,
                  padding: '8px 14px',
                  font: 'inherit',
                  fontSize: 13.5,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Not a problem
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** The finding's evidence, in the design's three shapes. */
const Evidence = ({
  finding,
  grid,
}: {
  finding: Finding
  grid: ModelGrid | null
}) => {
  //: A cell finding: four rows of the model around its cell.
  const ref = finding.source.ref
  if (ref !== null && grid !== null) {
    const [sheetName, coordinate] = ref.includes('!')
      ? [ref.split('!')[0]!, ref.split('!')[1]!]
      : [null, ref]
    const rowNumber = Number(coordinate!.match(/\d+/)?.[0] ?? 0)
    const sheet =
      grid.sheets.find((one) => one.name === sheetName) ?? grid.sheets[0]
    if (sheet !== undefined && rowNumber > 0) {
      const rows = sheet.rows
        .map((row, index) => ({ row, index }))
        .filter(({ row }) =>
          row.cells.some((cell) => cell !== null && cell.ref.match(/\d+/)),
        )
      const hit = rows.findIndex(({ row }) =>
        row.cells.some((cell) => cell?.ref === ref),
      )
      if (hit !== -1) {
        const around = rows.slice(Math.max(0, hit - 2), hit + 2)
        const columnOf = (cells: (typeof sheet.rows)[0]['cells']) =>
          cells.findIndex((cell) => cell?.ref === ref)
        const column = columnOf(rows[hit]!.row.cells)
        return (
          <div
            style={{
              background: '#fff',
              borderRadius: 9,
              boxShadow: '0 0 0 .5px rgba(0,0,0,.12)',
              overflow: 'hidden',
              fontFamily: font.mono,
              fontSize: 12,
            }}
          >
            {around.map(({ row }, index) => {
              const cell = row.cells[column] ?? row.cells.find(Boolean) ?? null
              const isTarget = cell?.ref === ref
              const number = cell?.ref.match(/\d+/)?.[0] ?? ''
              return (
                <div
                  key={index}
                  style={{ display: 'flex', borderTop: '.5px solid #eef0f2' }}
                >
                  <span
                    style={{
                      flex: '0 0 34px',
                      padding: '7px 6px',
                      textAlign: 'right',
                      color: ink.faint,
                      background: '#f7f7f9',
                    }}
                  >
                    {number}
                  </span>
                  <span
                    style={{
                      flex: 1,
                      padding: '7px 9px',
                      color: ink.primary,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {row.label}
                  </span>
                  <span
                    style={{
                      flex: '0 0 96px',
                      padding: '7px 9px',
                      textAlign: 'right',
                      background: isTarget
                        ? 'rgba(255,159,10,.28)'
                        : 'transparent',
                      color: ink.primary,
                    }}
                  >
                    {cell?.display ?? cell?.value ?? ''}
                  </span>
                </div>
              )
            })}
          </div>
        )
      }
    }
  }

  //: A prose finding: the sentence, its figure marked.
  if (
    finding.context &&
    finding.printed &&
    finding.context.includes(finding.printed)
  ) {
    const at = finding.context.indexOf(finding.printed)
    return (
      <div
        style={{
          background: '#fff',
          borderRadius: 9,
          boxShadow: '0 0 0 .5px rgba(0,0,0,.12)',
          padding: '14px 16px',
          fontSize: 14.5,
          lineHeight: 1.6,
        }}
      >
        {finding.context.slice(0, at)}
        <span
          style={{
            background: 'rgba(255,159,10,.28)',
            boxShadow: '0 0 0 2px rgba(255,159,10,.28)',
            borderRadius: 3,
          }}
        >
          {finding.printed}
        </span>
        {finding.context.slice(at + finding.printed.length)}
      </div>
    )
  }

  //: A slide finding: the design's slide sketch, carrying the real
  //: figure and label. The grey bars are the design's own shorthand for
  //: « the rest of the slide » — decoration, not data.
  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 9,
        boxShadow: '0 0 0 .5px rgba(0,0,0,.12)',
        padding: '16px 18px',
        aspectRatio: '16/9',
        display: 'flex',
        flexDirection: 'column',
        gap: 9,
      }}
    >
      <div
        style={{
          fontSize: 12.5,
          fontWeight: 600,
          letterSpacing: '-.01em',
          color: ink.primary,
        }}
      >
        {finding.where.label}
      </div>
      <div
        style={{
          height: 5,
          width: '62%',
          background: '#eaeaee',
          borderRadius: 3,
        }}
      />
      <div
        style={{
          height: 5,
          width: '48%',
          background: '#eaeaee',
          borderRadius: 3,
        }}
      />
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 8,
          marginTop: 6,
        }}
      >
        <span
          style={{
            fontFamily: font.mono,
            fontSize: 15,
            fontWeight: 500,
            background: 'rgba(255,159,10,.28)',
            boxShadow: '0 0 0 2px rgba(255,159,10,.28)',
            borderRadius: 3,
          }}
        >
          {finding.printed}
        </span>
        <span style={{ fontSize: 11.5, color: ink.secondary }}>
          {finding.title}
        </span>
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ display: 'flex', gap: 6 }}>
        <div
          style={{
            flex: 1,
            height: 22,
            background: '#f2f2f5',
            borderRadius: 3,
          }}
        />
        <div
          style={{
            flex: 1,
            height: 32,
            background: '#f2f2f5',
            borderRadius: 3,
          }}
        />
        <div
          style={{
            flex: 1,
            height: 42,
            background: '#f2f2f5',
            borderRadius: 3,
          }}
        />
      </div>
    </div>
  )
}
