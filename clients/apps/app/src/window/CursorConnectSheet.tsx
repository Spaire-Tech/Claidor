// Connect Cursor, from the chat's connect card (13 November 2026, the
// founder: "Cursor now"): the Mac's `MacCursorConnectSheet`
// (mac/Simeon/SettingsModels.swift), the shared core's `CursorSignIn`.
//
// Cursor is signed in on the person's cloud computer, with Cursor's own
// program (the engine's `startCursorSignIn`): the first time the program is
// put on the computer ("Setting up Cursor on your computer…"); then it
// gives a page on Cursor's own site, which the person opens and approves on.
// There is no code to type. The sheet asks the computer again every three
// seconds until it says connected. Closing the sheet leaves the sign-in
// running on the computer: the card's row turns to Connected by itself.
//
// In the AI Models sheets' design (SettingsModels.tsx): the same head, the
// same words' sizes, the same end.

import { useEffect, useState } from 'react'
import {
  cursor,
  cursorPollSeconds,
  cursorSheetWords,
  modelConnectLogo,
  modelConnectProgram,
  type CursorSignIn,
} from '../core/connectCards'
import type { AppStore } from '../core/store'
import { t } from '../l10n'
import { ProgramLogo } from './ConnectCards'
import { Sheet } from './Dialogs'
import { ConnectedEnd, openPage } from './SettingsModels'
import './SettingsModels.css'
import { PanelDisc } from './SettingsParts'

export function CursorConnectSheet({
  store,
  close,
}: {
  store: AppStore
  close: () => void
}) {
  const name = modelConnectProgram(cursor)
  /** What the computer last said; none while it is first asked. */
  const [signIn, setSignIn] = useState<CursorSignIn>()
  /** Try Again starts the sign-in over. */
  const [round, setRound] = useState(0)

  useEffect(() => {
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const ask = async (start: boolean) => {
      const said = start
        ? await store.startCursorSignIn()
        : await store.cursorSignIn()
      if (stopped) return
      // A computer that couldn't be asked reads as a sign-in that didn't finish.
      const next: CursorSignIn = said ?? { state: 'failed', why: '' }
      setSignIn(next)
      if (next.state === 'installing' || next.state === 'waiting')
        timer = setTimeout(() => void ask(false), cursorPollSeconds * 1000)
    }
    setSignIn(undefined)
    void ask(true)
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [store, round])

  const body = () => {
    if (signIn === undefined || signIn.state === 'installing')
      return (
        <div className="models-waiting" role="status">
          <span className="settings-spinner" aria-hidden="true" />
          {cursorSheetWords.settingUp(name)}
        </div>
      )
    if (signIn.state === 'connected')
      return <ConnectedEnd provider={cursor} name={name} close={close} />
    if (signIn.state === 'waiting')
      return (
        <>
          <p className="models-sheet-words">{cursorSheetWords.steps(name)}</p>
          <div className="models-sheet-end">
            <button
              type="button"
              className="models-wide"
              onClick={() => openPage(signIn.url)}
            >
              {cursorSheetWords.open(name)}
            </button>
          </div>
          <div className="models-waiting" role="status">
            <span className="settings-spinner" aria-hidden="true" />
            {cursorSheetWords.waiting()}
          </div>
        </>
      )
    return (
      <>
        <p className="models-sheet-problem" role="alert">
          {cursorSheetWords.didNotFinish(name)}
        </p>
        <div className="models-sheet-end">
          <button
            type="button"
            className="models-wide"
            onClick={() => setRound((one) => one + 1)}
          >
            {cursorSheetWords.tryAgain()}
          </button>
        </div>
      </>
    )
  }

  return (
    <Sheet label={t`Connect ${name}`} close={close} className="models-sheet">
      <div className="models-sheet-head">
        <ProgramLogo name={modelConnectLogo(cursor)} side={36} />
        <h2 className="models-sheet-title">{t`Connect ${name}`}</h2>
        <PanelDisc symbol="xmark" label={t('Close')} onClick={close} />
      </div>
      {body()}
    </Sheet>
  )
}
