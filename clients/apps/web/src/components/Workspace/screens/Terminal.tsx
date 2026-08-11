'use client'

/**
 * Terminal — the check, reporting itself, and a prompt that means it.
 *
 * The design draws a log of timestamped lines: a command, the files it
 * resolved, what it reconciled, warnings in amber, criticals in red, and a
 * `done` line with a duration. That is not decoration around a shell — it
 * is *exactly* what a check run produces, and every line below comes off
 * one. Nothing here is written by this file except the punctuation.
 *
 * **Why a terminal earns its place in a product with screens.** Check
 * shows the findings; this shows the *run* — what it read, how long it
 * took, what it could not do. When somebody asks « why does it say 27 not
 * checked », the answer is a run, and a run is a log.
 *
 * **Every command is an API call that already existed.** Nothing here can
 * do anything the screens cannot, which is the property that keeps a
 * command line from becoming a second product with its own rules. An
 * unknown word says so and lists the ones that are not.
 *
 * The blinking cursor is the design's `pcDim`, on the design's `›` gutter,
 * with a real input behind it — a prompt drawn but not wired would be
 * furniture pretending to be a control.
 */

import { useEffect, useRef, useState } from 'react'

import type { CheckRun, Finding, TieOutApi } from '../api'
import { ApiError } from '../api'
import { colour, font } from '../design'

export interface Line {
  /** `08:14:02`. Real, and the terminal's whole claim to being a log. */
  t: string
  text: string
  ink: string
}

const QUIET = colour.slateDeep
const LOUD = colour.dark

const COMMANDS: Record<string, string> = {
  check: 'reconcile the deck against the model, and audit the model',
  coverage: 'what was reconciled, and what was not',
  findings: 'every open finding · findings critical | warning | note',
  files: 'the documents this deal is built on',
  corrections: 'what has been written into a document, and by whom',
  clear: 'empty the log',
  help: 'this',
}

const now = () => new Date().toTimeString().slice(0, 8)

/** How the design writes a duration: `11.2s`. */
function elapsed(run: CheckRun): string | null {
  if (!run.started_at || !run.finished_at) return null
  const ms = Date.parse(run.finished_at) - Date.parse(run.started_at)
  if (!Number.isFinite(ms) || ms < 0) return null
  return `${(ms / 1000).toFixed(1)}s`
}

const count = (summary: Record<string, unknown>, key: string): number => {
  const value = summary[key]
  return typeof value === 'number' ? value : 0
}

export function Terminal({
  api,
  dealId,
  deal,
  onChanged,
}: {
  api: TieOutApi
  dealId: string
  deal: string
  /** A check moves every other screen, so the workspace reloads after one. */
  onChanged: () => void
}) {
  const [lines, setLines] = useState<Line[]>([])
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  //: What has been typed before, newest last. Up and down walk it, which
  //: is the one thing every terminal has and nobody thinks to build.
  const [history, setHistory] = useState<string[]>([])
  const [walked, setWalked] = useState<number | null>(null)
  const foot = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)

  const say = (text: string, ink = QUIET) =>
    setLines((was) => [...was, { t: now(), text, ink }])

  // The banner is the last run, because an empty terminal on a deal that
  // was checked this morning is a screen throwing away the only thing it
  // knows. A deal nobody has run says that instead — never « clear ».
  useEffect(() => {
    let live = true
    setLines([])
    void (async () => {
      try {
        const runs = await api.runs(dealId)
        if (!live) return
        const tie = runs.find((one) => one.kind === 'tieout')
        if (!tie) {
          say(`${deal.toLowerCase()} · the check has not run here. type check`)
          return
        }
        report(tie, say)
      } catch {
        if (live) say('could not reach the server', colour.critical)
      }
    })()
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealId, deal])

  useEffect(() => {
    foot.current?.scrollIntoView({ block: 'end' })
  }, [lines])

  const run = async (raw: string) => {
    const line = raw.trim()
    if (!line) return
    setHistory((was) => [...was, line])
    setWalked(null)
    setLines((was) => [...was, { t: now(), text: `pierce ${line}`, ink: LOUD }])

    const [command, ...rest] = line.split(/\s+/)
    if (command === 'clear') {
      setLines([])
      return
    }
    if (command === 'help' || !(command in COMMANDS)) {
      if (!(command in COMMANDS)) {
        say(`${command}: not a command`, colour.critical)
      }
      for (const [name, what] of Object.entries(COMMANDS)) {
        say(`${name.padEnd(12)}${what}`)
      }
      return
    }

    setBusy(true)
    try {
      await execute(command, rest, api, dealId, say, onChanged)
    } catch (problem) {
      say(
        problem instanceof ApiError ? problem.message : 'that did not work',
        colour.critical,
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        overflow: 'auto',
        padding: '20px 24px',
        fontFamily: font.mono,
        fontSize: 12.5,
        lineHeight: 1.9,
        color: '#424242',
      }}
      onClick={() => input.current?.focus()}
    >
      {lines.map((line, index) => (
        <div key={index} style={{ display: 'flex', gap: 14 }}>
          <span style={{ flex: '0 0 62px', color: colour.fainter }}>
            {line.t}
          </span>
          <span
            style={{
              flex: 1,
              minWidth: 0,
              color: line.ink,
              overflowWrap: 'anywhere',
              whiteSpace: 'pre-wrap',
            }}
          >
            {line.text}
          </span>
        </div>
      ))}

      <div style={{ display: 'flex', gap: 14, marginTop: 6 }}>
        <span style={{ flex: '0 0 62px', color: colour.fainter }}>›</span>
        {busy ? (
          // Nothing is typed at while a check runs: a prompt that accepts a
          // second command and drops it is worse than one that waits.
          <span style={{ color: colour.ink, animation: 'pcDim 1.3s infinite' }}>
            working…
          </span>
        ) : (
          <input
            ref={input}
            autoFocus
            value={typed}
            spellCheck={false}
            onChange={(event) => setTyped(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                const line = typed
                setTyped('')
                void run(line)
                return
              }
              if (event.key === 'ArrowUp' && history.length) {
                event.preventDefault()
                const next =
                  walked === null ? history.length - 1 : Math.max(0, walked - 1)
                setWalked(next)
                setTyped(history[next])
                return
              }
              if (event.key === 'ArrowDown' && walked !== null) {
                event.preventDefault()
                const next = walked + 1
                if (next >= history.length) {
                  setWalked(null)
                  setTyped('')
                } else {
                  setWalked(next)
                  setTyped(history[next])
                }
              }
            }}
            style={{
              flex: 1,
              minWidth: 0,
              border: 0,
              outline: 'none',
              // The dashboard styles every focused input with a blue ring.
              // Right everywhere else and wrong here: the design's prompt
              // is a gutter and a caret, and a box around it makes the
              // terminal look like a form somebody embedded in one.
              boxShadow: 'none',
              background: 'transparent',
              font: 'inherit',
              color: colour.ink,
              padding: 0,
            }}
          />
        )}
      </div>
      <div ref={foot} />
    </div>
  )
}

/** What a run says about itself, in the design's own log. */
function report(run: CheckRun, say: (text: string, ink?: string) => void) {
  if (run.error) {
    say(run.error, colour.warning)
    return
  }
  const summary = run.summary ?? {}
  if (run.kind === 'tieout') {
    say(`reconciled ${count(summary, 'reconciled')} figures`)
    const unlinked = count(summary, 'unlinked')
    if (unlinked) {
      // Coverage stays on screen, here as everywhere. A log that reported
      // only what it found would read as though it had checked everything.
      say(`${unlinked} not checked · reasons below`)
      const reasons = summary.reasons
      if (Array.isArray(reasons)) {
        for (const one of reasons as { reason: string; count: number }[]) {
          say(`  ${String(one.count).padEnd(4)}${one.reason}`)
        }
      }
    }
  } else if (run.kind === 'crosscheck') {
    // The chain's last hop, reported the same way as the others: what it
    // reached, and what it did not.
    say(
      `grounded ${count(summary, 'grounded')} inputs in ${count(summary, 'sources')} source ${
        count(summary, 'sources') === 1 ? 'document' : 'documents'
      }`,
    )
    const against = count(summary, 'contradicting')
    if (against) say(`${against} contradict the model`, colour.critical)
  } else {
    say(
      `audited ${count(summary, 'cells')} cells in ${count(summary, 'models')} model`,
    )
  }
  const took = elapsed(run)
  say(
    `done  ${run.kind} · ${run.status}${took ? ` · ${took}` : ''}`,
    run.status === 'done' ? LOUD : colour.critical,
  )
}

/** Every command, and the call it already had behind it. */
async function execute(
  command: string,
  rest: string[],
  api: TieOutApi,
  dealId: string,
  say: (text: string, ink?: string) => void,
  onChanged: () => void,
): Promise<void> {
  if (command === 'check') {
    const page = await api.deal(dealId)
    say(
      `resolved ${page.files} ${page.files === 1 ? 'file' : 'files'} · ${
        page.lineages
      } ${page.lineages === 1 ? 'document' : 'documents'}`,
    )
    const runs = await api.check(dealId)
    for (const one of runs) report(one, say)
    for (const finding of (await api.findings(dealId)).slice(0, 12)) {
      const [text, ink] = severity(finding)
      say(text, ink)
    }
    onChanged()
    return
  }

  if (command === 'coverage') {
    const { coverage } = await api.deal(dealId)
    say(
      `${coverage.reconciled} reconciled · ${coverage.agreeing} agree · ${coverage.drifting} drift · ${coverage.unlinked} not checked`,
    )
    for (const one of coverage.reasons ?? []) {
      say(`  ${String(one.count).padEnd(4)}${one.reason}`)
    }
    return
  }

  if (command === 'findings') {
    const wanted = rest[0]
    const all = (await api.findings(dealId)).filter(
      (one) => one.state === 'open',
    )
    const shown = wanted
      ? all.filter((one) => severity(one)[2] === wanted)
      : all
    if (shown.length === 0) {
      say(wanted ? `no ${wanted} findings open` : 'no findings open')
      return
    }
    for (const finding of shown) {
      const [text, ink] = severity(finding)
      say(text, ink)
    }
    say(`${shown.length} of ${all.length} open`, LOUD)
    return
  }

  if (command === 'files') {
    const page = await api.deal(dealId)
    for (const one of page.documents) {
      say(
        `${one.kind.padEnd(6)}v${String(one.version).padEnd(3)}${one.status.padEnd(11)}${one.filename}`,
        one.status === 'failed' ? colour.critical : QUIET,
      )
    }
    say(`${page.lineages} documents · ${page.files} files in the room`, LOUD)
    return
  }

  if (command === 'corrections') {
    const written = await api.corrections(dealId)
    if (written.length === 0) {
      say('nothing has been written into a document on this deal')
      return
    }
    for (const one of written) {
      say(
        `${one.state.padEnd(10)}${one.before} → ${one.after}  ${one.location}${
          one.decided_by ? ` · ${one.decided_by.name}` : ''
        }`,
        one.state === 'failed' ? colour.critical : QUIET,
      )
    }
    return
  }
}

/** A finding as one log line, in the design's `warn` / `crit` register. */
function severity(finding: Finding): [string, string, string] {
  const where = [finding.where.filename, finding.where.detail]
    .filter(Boolean)
    .join(' ')
  if (finding.one_tick) {
    return [`note  ${finding.title} · ${where}`, colour.note, 'note']
  }
  if (finding.severity === 'smell') {
    return [`warn  ${finding.title} · ${where}`, colour.warning, 'warning']
  }
  return [`crit  ${finding.title} · ${where}`, colour.critical, 'critical']
}
