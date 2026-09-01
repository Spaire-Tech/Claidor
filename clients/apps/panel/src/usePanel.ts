/**
 * The panel's state machine, with no opinion about how it looks.
 *
 * One job, the product's job: **check the model that is open.** The
 * panel reads the workbook's own bytes out of Excel, sends them to the
 * check, and shows what came back — no deal, no picker, no asking a
 * person where their own file "belongs". A model is one on its own.
 *
 * The stages are a sequence, and each has a screen behind it:
 *
 * | Stage | What the panel shows |
 * |---|---|
 * | `loading` | Working out where it is |
 * | `signed-out` | One button |
 * | `no-workbook` | A host with no workbook to check — say so plainly |
 * | `checking` | The ring — the check is running on this workbook |
 * | `checked` | The verdict and the findings, each one a jump |
 * | `failed` | What went wrong, in the server's own words |
 *
 * The deal-identification machinery this file used to hold — identify,
 * stamp, choose — is gone with the pivot: the panel no longer asks
 * which folder a model lives in before doing its work.
 */

import { useCallback, useEffect, useState } from 'react'

import type { AuditRule, PanelCheck, PanelDefect } from './api'
import { ApiError, TieOutApi } from './api'
import { current, signOut as forget, signIn as openSignIn } from './auth'
import type { GoToResult, HostBridge, OpenDocument, WriteResult } from './host'

export type Stage =
  | 'loading'
  | 'signed-out'
  | 'no-workbook'
  | 'checking'
  | 'checked'
  | 'failed'

export interface PanelState {
  stage: Stage
  document: OpenDocument | null
  /** The check's whole answer, straight from the engine. */
  result: PanelCheck | null
  /** The audit's catalogue with the firm's switches, for « N checks
   *  pass ». Null until the organization answers. */
  rules: AuditRule[] | null
  error: string | null
  /** True while a re-check is running, so the button can say so. */
  working: boolean
}

const EMPTY: PanelState = {
  stage: 'loading',
  document: null,
  result: null,
  rules: null,
  error: null,
  working: false,
}

export function usePanel(
  bridge: HostBridge,
  api: TieOutApi,
  signInUrl: string,
  //: The design's « Allow access » face gates Swens's own reading:
  //: until it is pressed once, the panel does not touch the workbook.
  allowed = true,
) {
  const [state, setState] = useState<PanelState>(EMPTY)

  /** Read the open workbook and put it through the check. */
  const check = useCallback(async () => {
    try {
      const document = await bridge.read()
      setState((was) => ({ ...was, document }))

      const file = await bridge.readFile()
      if (file === null) {
        setState((was) => ({ ...was, stage: 'no-workbook', error: null }))
        return
      }

      setState((was) => ({ ...was, stage: 'checking', error: null }))
      const result = await api.checkFile(file.bytes, file.filename)
      setState((was) => ({
        ...was,
        stage: 'checked',
        result,
        working: false,
      }))

      //: The catalogue arrives second and quietly — the findings list
      //: does not wait on a settings read to render.
      api
        .auditRules()
        .then((rules) => rules && setState((was) => ({ ...was, rules })))
        .catch(() => undefined)
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        forget()
        setState((was) => ({ ...was, stage: 'signed-out', error: null }))
        return
      }
      setState((was) => ({
        ...was,
        stage: 'failed',
        working: false,
        error: error instanceof Error ? error.message : 'something went wrong',
      }))
    }
  }, [api, bridge])

  useEffect(() => {
    if (!current()) {
      setState((was) => ({ ...was, stage: 'signed-out' }))
      return
    }
    if (!allowed) return
    void check()
  }, [check, allowed])

  const signIn = useCallback(async () => {
    try {
      await openSignIn(signInUrl)
      setState((was) => ({ ...was, stage: 'loading', error: null }))
      if (allowed) await check()
    } catch (error) {
      setState((was) => ({
        ...was,
        stage: 'signed-out',
        error: error instanceof Error ? error.message : 'sign-in failed',
      }))
    }
  }, [check, allowed, signInUrl])

  const signOut = useCallback(() => {
    forget()
    setState({ ...EMPTY, stage: 'signed-out' })
  }, [])

  /** Select the cell a finding is about — the panel is in Excel, so
   *  this is the native move. */
  const goTo = useCallback(
    (defect: PanelDefect): Promise<GoToResult> =>
      bridge.goTo({ kind: 'cell', ref: defect.ref, sheet: defect.sheet }),
    [bridge],
  )

  /** Run the whole check again, against the workbook as it is now. */
  const recheck = useCallback(async () => {
    setState((was) => ({ ...was, working: true }))
    await check()
  }, [check])

  /** « Fix the cell » — put the row's own formula back into the open
   *  workbook, live, then re-check the model as it now stands. Excel
   *  recalculates in front of the person; the re-check is the proof. */
  const fix = useCallback(
    async (defect: PanelDefect): Promise<WriteResult> => {
      const wrote = await bridge.write(
        { kind: 'cell', ref: defect.ref, sheet: defect.sheet },
        defect.fix_before,
        defect.fix,
      )
      if (wrote.written) {
        setState((was) => ({ ...was, working: true }))
        await check()
      }
      return wrote
    },
    [bridge, check],
  )

  return {
    ...state,
    signIn,
    signOut,
    goTo,
    recheck,
    fix,
    api,
  }
}
