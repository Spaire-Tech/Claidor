// The chat's card that offers Claude Code and Codex to connect
// (`model-connect`, 13 November 2026, the founder: "when neither of them is
// connected, the user is given a choice of both cards to connect"): the
// Mac's `ModelConnectCardView` (mac/Simeon/Cards.swift), the shared core's
// `ModelConnectCard`. A cloud agent codes in Claude Code on the person's
// Claude plan, or in Codex on their ChatGPT plan; a launch that finds
// neither connected puts this card in the chat.
//
// Each row is a program, by its own name and its own logo (the founder, the
// same day: "its connect codex or connect claude code. and its full logo no
// white or dark background. for the card specifically its that. but
// settings is claude and chat gpt"): the logo whole and bare in an app
// icon's place (40), "Connect Codex" over whose plan it runs on, and Connect
// in the cards' blue pill. Connect shows the consent, then the plan's own
// sign-in sheet (SettingsModels.tsx's), over the window, both under the
// program's name and logo when they open from here (`codingConsent`, the
// sheets' `coding`); from Settings they name the plan. A connected program reads as a connected app does: its name and
// "Connected" in the green capsule. What is connected is the window's own accounts
// (`store.aiModels`), read again every four seconds while the card is on
// screen and both rows wait, for ten minutes at most. The agent goes on by
// itself once one is connected.
//
// Cursor is the third row (13 November 2026, the founder: "Cursor now"). It
// is no plan in AI Models: it is signed in on the cloud computer, so its row
// reads the computer (`store.cursorSignIn`) on the same clock, and its
// Connect opens the consent and then Cursor's own sheet
// (CursorConnectSheet.tsx).
//
// In a file of its own: the sign-in sheets are SettingsModels.tsx's, which
// itself draws ConnectCards.tsx's icons.

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { claude } from '../core/aiModels'
import {
  connectedWord,
  cursor,
  modelConnectLine,
  modelConnectLogo,
  modelConnectNextPoll,
  modelConnectOnComputer,
  modelConnectPolls,
  modelConnectProgram,
  modelConnectTitle,
  type CursorSignIn,
  type ModelConnectCard,
} from '../core/connectCards'
import { codingConsent } from '../core/connectConsent'
import { connectWord } from '../core/connecting'
import type { AppStore } from '../core/store'
import { t } from '../l10n'
import { CardShell } from './Cards'
import { ProgramLogo } from './ConnectCards'
import './ConnectCards.css'
import { useConnector } from './connector'
import { CursorConnectSheet } from './CursorConnectSheet'
import { ChatGPTConnectSheet, ClaudeConnectSheet } from './SettingsModels'
import { useWatched } from './useStore'

export function ModelConnectCardView({
  card,
  store,
}: {
  card: ModelConnectCard
  store: AppStore
}) {
  const model = store.aiModels
  useWatched(model)
  const connector = useConnector()
  /** The provider whose sign-in sheet is open. */
  const [signingIn, setSigningIn] = useState<string>()
  /** What the computer last said of Cursor's sign-in; `asked` once it has answered (or couldn't be asked). */
  const [cursorSignIn, setCursorSignIn] = useState<CursorSignIn>()
  const [cursorAsked, setCursorAsked] = useState(false)
  const connected = (provider: string): boolean =>
    modelConnectOnComputer(provider)
      ? cursorSignIn?.state === 'connected'
      : model.connected(provider)
  const box = useRef<HTMLDivElement>(null)
  const [onScreen, setOnScreen] = useState(false)
  useEffect(() => {
    const element = box.current
    if (!element) return
    const watch = new IntersectionObserver((seen) =>
      setOnScreen(seen.some((one) => one.isIntersecting)),
    )
    watch.observe(element)
    return () => watch.disconnect()
  }, [])

  // Asked again only when the providers change, not each time the chat draws the card anew.
  const providers = card.providers.join(',')
  useEffect(() => {
    if (!onScreen) return
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let left = modelConnectPolls
    const offered = providers.split(',')
    const ask = async () => {
      // Cursor's row reads the computer; the plans' rows, the window's own accounts.
      const [, said] = await Promise.all([
        model.load(),
        offered.includes(cursor) ? store.cursorSignIn() : undefined,
      ])
      if (stopped) return
      setCursorSignIn(said)
      setCursorAsked(true)
      left -= 1
      const wait = modelConnectNextPoll(
        offered.some((one) =>
          modelConnectOnComputer(one)
            ? said?.state === 'connected'
            : model.connected(one),
        ),
      )
      if (wait != null && left > 0)
        timer = setTimeout(() => void ask(), wait * 1000)
    }
    void ask()
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [model, store, providers, onScreen])

  const connect = (provider: string) => {
    const open = async () => setSigningIn(provider)
    // The consent an app's Connect shows, then the sign-in, as in AI Models,
    // both under the program's name here (the founder: "it should say codex
    // and claude code but only when it opens from the card").
    if (connector)
      connector.ask(modelConnectProgram(provider), open, {
        signIn: false,
        consent: codingConsent(provider),
      })
    else void open()
  }

  return (
    <div ref={box} className="github-watch">
      <CardShell className="model-connect-card">
        {card.providers.map((provider) => {
          const isConnected = connected(provider)
          const line = modelConnectLine(provider, isConnected)
          // Still being read: the accounts for a plan's row, the computer for Cursor's.
          const reading = modelConnectOnComputer(provider)
            ? !cursorAsked
            : !model.loaded && model.problem === undefined
          return (
            <div key={provider} className="connector-row">
              <ProgramLogo name={modelConnectLogo(provider)} />
              <div className="connector-words">
                <span className="connector-title">
                  {modelConnectTitle(provider, isConnected)}
                </span>
                {line !== '' && (
                  <span className="connector-line listener-reason">{line}</span>
                )}
              </div>
              {isConnected ? (
                <span className="connector-connected" role="status">
                  {connectedWord()}
                </span>
              ) : reading ? (
                <span
                  className="connect-spinner"
                  role="progressbar"
                  aria-label={t('Checking connection status')}
                />
              ) : (
                <button
                  type="button"
                  className="card-button prominent"
                  onClick={() => connect(provider)}
                >
                  {connectWord()}
                </button>
              )}
            </div>
          )
        })}
      </CardShell>
      {/* Over the window, as in AI Models: never inside the chat's own scrolling box. */}
      {signingIn !== undefined &&
        createPortal(
          signingIn === cursor ? (
            <CursorConnectSheet
              store={store}
              close={() => {
                setSigningIn(undefined)
                // The row follows what the sheet left on the computer.
                void store.cursorSignIn().then(setCursorSignIn)
              }}
            />
          ) : signingIn === claude ? (
            <ClaudeConnectSheet
              model={model}
              coding
              close={() => setSigningIn(undefined)}
            />
          ) : (
            <ChatGPTConnectSheet
              model={model}
              provider={signingIn}
              coding
              close={() => setSigningIn(undefined)}
            />
          ),
          document.body,
        )}
    </div>
  )
}
