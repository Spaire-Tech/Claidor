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

import type { Coverage, Finding, Identified } from './api'
import { ApiError, TieOutApi } from './api'
import { current, signOut as forget, signIn as openSignIn } from './auth'
import type { GoToResult, HostBridge, OpenDocument, WriteResult } from './host'

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

export function usePanel(
  bridge: HostBridge,
  api: TieOutApi,
  signInUrl: string,
) {
  const [state, setState] = useState<PanelState>(EMPTY)

  /** Load everything for a document we have already identified. */
  const load = useCallback(
    async (identity: Identified) => {
      if (!identity.dossier_id) return
      const [findings, coverage] = await Promise.all([
        api.findings(identity.dossier_id, identity.artifact?.id),
        api.coverage(identity.dossier_id),
      ])
      setState((was) => ({
        ...was,
        stage: 'ready',
        identity,
        findings,
        coverage,
      }))
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
          error:
            error instanceof Error ? error.message : 'something went wrong',
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

  /**
   * « That is not the right deal. » Ask again.
   *
   * Offered only when the match was made on the *filename*, which is a
   * guess: two deals can each hold a « Model_v12.xlsx ». A stamped
   * document is definitive and never offers this — being asked to confirm
   * something that cannot be wrong is how people learn to click through
   * the question that can.
   */
  const rechoose = useCallback(() => {
    setState((was) => ({
      ...was,
      stage: 'choose-deal',
      findings: [],
      coverage: null,
      error: null,
    }))
  }, [])

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
        findings: was.findings.map((one) =>
          one.id === updated.id ? updated : one,
        ),
      }))
    },
    [api],
  )

  /**
   * Accept a correction, into the document open right here.
   *
   * Three steps, and the order is the whole of the safety: the change is
   * **proposed on the server first**, then written into the document, then
   * — only if the write landed — recorded as done. A panel that recorded
   * first and wrote second would leave a deal claiming a correction that
   * is not in anybody's file, which is worse than not offering the button.
   *
   * The banker's own copy is the one that gets sent, so this is where the
   * correction belongs when the panel is what is being used. The deal's
   * copy stays as it was and says so; uploading the saved file brings the
   * two back together, and that is an ordinary new version.
   */
  const accept = useCallback(
    async (finding: Finding): Promise<WriteResult> => {
      try {
        const correction = finding.correction ?? (await api.propose(finding.id))
        const written = await bridge.write(
          finding.where.anchor,
          correction.before,
          correction.after,
          finding.page,
        )
        if (!written.written) return written

        await api.decideCorrection(correction.id, 'applied')
        if (state.identity) await load(state.identity)
        return written
      } catch (error) {
        return {
          written: false,
          by: 'none',
          reason:
            error instanceof ApiError
              ? error.message
              : 'that change could not be recorded',
        }
      }
    },
    [api, bridge, load, state.identity],
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

  return {
    ...state,
    signIn,
    signOut,
    chooseDeal,
    rechoose,
    goTo,
    accept,
    dismiss,
    recheck,
    api,
  }
}
