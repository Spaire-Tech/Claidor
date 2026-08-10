/**
 * The panel's state machine, with no opinion about how it looks.
 *
 * Everything the panel *does* lives here — sign in, work out which
 * document this is, remember the answer inside the file, load the
 * findings, jump to one. Everything it *looks like* lives in the
 * components, which is somebody else's half of this build and should stay
 * that way: this hook returns data and functions, never markup.
 *
 * The stages are a sequence, and each has a screen behind it:
 *
 * | Stage | What the panel shows |
 * |---|---|
 * | `loading` | Working out where it is |
 * | `signed-out` | One button |
 * | `choose-deal` | Which deal does this document belong to? Asked once |
 * | `unsupported` | Open in a host with no document — say so plainly |
 * | `ready` | The findings for this document, and the coverage line |
 * | `failed` | What went wrong, in the server's own words |
 *
 * `choose-deal` is asked **once per document**, not once per session. The
 * answer is written into the file itself, so the next person to open it
 * gets straight to `ready`.
 */

import { useCallback, useEffect, useState } from 'react'

import { ApiError, TieOutApi } from './api'
import type { Coverage, Finding, Identified } from './api'
import { current, signIn as openSignIn, signOut as forget } from './auth'
import type { GoToResult, HostBridge, OpenDocument } from './host'

export type Stage =
  | 'loading'
  | 'signed-out'
  | 'choose-deal'
  | 'unsupported'
  | 'ready'
  | 'failed'

export interface PanelState {
  stage: Stage
  document: OpenDocument | null
  identity: Identified | null
  findings: Finding[]
  coverage: Coverage | null
  error: string | null
  /** True while a check is running, so a button can say so. */
  working: boolean
}

const EMPTY: PanelState = {
  stage: 'loading',
  document: null,
  identity: null,
  findings: [],
  coverage: null,
  error: null,
  working: false,
}

export function usePanel(bridge: HostBridge, api: TieOutApi, signInUrl: string) {
  const [state, setState] = useState<PanelState>(EMPTY)

  /** Load everything for a document we have already identified. */
  const load = useCallback(
    async (identity: Identified) => {
      if (!identity.dossier_id) return
      const [findings, coverage] = await Promise.all([
        api.findings(identity.dossier_id, identity.artifact?.id),
        api.coverage(identity.dossier_id),
      ])
      setState((was) => ({ ...was, stage: 'ready', identity, findings, coverage }))
    },
    [api],
  )

  /**
   * Work out which document this is, and get to a stage.
   *
   * The stamp is tried first because it is the only answer that is not a
   * guess. A filename match comes back marked as a guess *and* with a
   * lineage to write, so the guess is made once and never again.
   */
  const resolve = useCallback(
    async (dossierId?: string) => {
      try {
        const document = await bridge.read()
        setState((was) => ({ ...was, document }))

        const identity = await api.identify({
          lineage_id: document.lineageId,
          filename: document.filename,
          dossier_id: dossierId ?? null,
        })

        if (identity.matched_by === 'none' || !identity.dossier_id) {
          setState((was) => ({ ...was, stage: 'choose-deal', identity }))
          return
        }

        // Settle the guess so the next open is a lookup. A host with no
        // document to write to — Outlook — returns false and is asked
        // again next time, which is correct: there is nothing to remember.
        if (identity.stamp_lineage_id) {
          await bridge.stamp(identity.stamp_lineage_id)
        }
        await load(identity)
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          forget()
          setState((was) => ({ ...was, stage: 'signed-out', error: null }))
          return
        }
        setState((was) => ({
          ...was,
          stage: 'failed',
          error: error instanceof Error ? error.message : 'something went wrong',
        }))
      }
    },
    [api, bridge, load],
  )

  useEffect(() => {
    if (!current()) {
      setState((was) => ({ ...was, stage: 'signed-out' }))
      return
    }
    void resolve()
  }, [resolve])

  const signIn = useCallback(async () => {
    try {
      await openSignIn(signInUrl)
      setState((was) => ({ ...was, stage: 'loading', error: null }))
      await resolve()
    } catch (error) {
      setState((was) => ({
        ...was,
        stage: 'signed-out',
        error: error instanceof Error ? error.message : 'sign-in failed',
      }))
    }
  }, [resolve, signInUrl])

  const signOut = useCallback(() => {
    forget()
    setState({ ...EMPTY, stage: 'signed-out' })
  }, [])

  /** « This document belongs to that deal. » Asked once, then remembered. */
  const chooseDeal = useCallback(
    async (dossierId: string) => {
      setState((was) => ({ ...was, stage: 'loading' }))
      await resolve(dossierId)
    },
    [resolve],
  )

  /** Take the reader to what a finding is about, in whichever host. */
  const goTo = useCallback(
    (finding: Finding): Promise<GoToResult> =>
      bridge.goTo(finding.where.anchor, finding.page),
    [bridge],
  )

  const dismiss = useCallback(
    async (finding: Finding, next: Finding['state']) => {
      const updated = await api.dismiss(finding.id, next)
      setState((was) => ({
        ...was,
        findings: was.findings.map((one) => (one.id === updated.id ? updated : one)),
      }))
    },
    [api],
  )

  /** Re-run both checks against the current files, then reload. */
  const recheck = useCallback(async () => {
    if (!state.identity?.dossier_id) return
    setState((was) => ({ ...was, working: true }))
    try {
      await api.check(state.identity.dossier_id)
      await load(state.identity)
    } finally {
      setState((was) => ({ ...was, working: false }))
    }
  }, [api, load, state.identity])

  return { ...state, signIn, signOut, chooseDeal, goTo, dismiss, recheck, api }
}
