// The first run (mac/Simeon/FirstRun.swift): one screen, "What should we
// call you?", the name from Google already in the field, and Continue.
// Simeon's computer wakes meanwhile, out of sight (`AppStore.handOff`, from
// the moment the screen shows); Continue saves the name, and Simeon is made
// once it is, so his first words call the person by it; the window opens on
// his chat, after one line while that is done. A failure says why, with
// Try again (no second Simeon).

import { useEffect, useRef, useState } from 'react'
import {
  failedLine,
  handOffLine,
  nameLabel,
  nameTitle,
  normalizedName,
} from '../core/onboarding'
import { plainError } from '../core/plainWords'
import type { AppStore } from '../core/store'
import { t } from '../l10n'

/** The SimeonLabs mark, in the text's colour (the Mac's template image). */
export const markStyle = {
  '--mark': `url(${import.meta.env.BASE_URL}favicon.svg)`,
} as React.CSSProperties

export function FirstRunScreen({
  store,
  open,
}: {
  store: AppStore
  /** The window, on Simeon's chat when he was made. */
  open: (agentId: string | undefined) => void
}) {
  const [name, setName] = useState('')
  const touched = useRef(false)
  const [leaving, setLeaving] = useState(false)
  const leavingNow = useRef(false)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string>()
  /** Simeon's id once the hand-off is done: undefined while it runs, null when nothing was made. */
  const made = useRef<string | null | undefined>(undefined)
  const handing = useRef(false)
  const opened = useRef(false)
  const openOnce = (id: string | null | undefined) => {
    if (opened.current) return
    opened.current = true
    open(id ?? undefined)
  }

  /** The hand-off, started as the screen shows; again with Try again. Leaving the screen does not stop the making of Simeon. */
  const handOff = () => {
    if (handing.current || made.current !== undefined) return
    handing.current = true
    setError(undefined)
    store
      .handOff('web', () => setReady(true))
      .then((id) => {
        made.current = id ?? null
        if (leavingNow.current) openOnce(made.current)
      })
      .catch((failure: unknown) => {
        const words =
          failure instanceof Error ? failure.message : String(failure)
        setError(plainError(words) || failedLine())
      })
      .finally(() => {
        handing.current = false
      })
  }
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    handOff()
    // Once, as the screen shows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Continue: the name saved, which the hand-off waits for; then the window once Simeon is made. */
  const forward = () => {
    if (normalizedName(name) === '') return
    void store.finishNameStep(name)
    leavingNow.current = true
    setLeaving(true)
    if (made.current !== undefined) openOnce(made.current)
  }

  return (
    <main className="first-run">
      {leaving ? (
        <HandOffLine ready={ready} error={error} retry={handOff} />
      ) : (
        <NameScreen
          name={name}
          setName={(next) => {
            touched.current = true
            setName(next)
          }}
          suggest={(suggested) => {
            if (!touched.current) setName(suggested)
          }}
          store={store}
          submit={forward}
        />
      )}
    </main>
  )
}

/**
 * "What should we call you?": the mark (40), the title (28), one field
 * (300 × 38, 10 round, the words centred at 16) and Continue (288 × 36).
 * The field takes the keys after 0.45 s and offers the name the person
 * chose or Google's first name until they type. Return is Continue; it
 * stays dim until there is a name.
 */
function NameScreen({
  name,
  setName,
  suggest,
  store,
  submit,
}: {
  name: string
  setName: (name: string) => void
  suggest: (name: string) => void
  store: AppStore
  submit: () => void
}) {
  const field = useRef<HTMLInputElement>(null)
  const ready = normalizedName(name) !== ''
  useEffect(() => {
    const timer = setTimeout(() => field.current?.focus(), 450)
    return () => clearTimeout(timer)
  }, [])
  useEffect(() => {
    let current = true
    void store.namePrompt().then((suggested) => {
      if (current && suggested) suggest(suggested)
    })
    return () => {
      current = false
    }
    // The suggestion is asked for once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store])
  return (
    <form
      className="name-screen"
      onSubmit={(event) => {
        event.preventDefault()
        if (ready) submit()
      }}
    >
      <span className="first-run-mark" style={markStyle} aria-hidden="true" />
      <h1 className="first-run-title">{nameTitle()}</h1>
      <input
        ref={field}
        className="first-run-field"
        value={name}
        placeholder={nameLabel()}
        aria-label={nameLabel()}
        maxLength={60}
        autoComplete="given-name"
        spellCheck={false}
        onChange={(event) => setName(event.target.value)}
      />
      <button
        type="submit"
        className={ready ? 'flow-button' : 'flow-button dim'}
        aria-disabled={!ready}
      >
        {t('Continue')}
      </button>
    </form>
  )
}

/**
 * Continue pressed before Simeon is made: one line on the centre in the
 * window's moving light (17), "Getting your team ready…" once the computer
 * answers. A failure: "Simeon couldn’t finish setting up", why in red (13),
 * and Try again (16, the window's blue), 22 apart.
 */
function HandOffLine({
  ready,
  error,
  retry,
}: {
  ready: boolean
  error?: string
  retry: () => void
}) {
  const again = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (error) again.current?.focus()
  }, [error])
  if (error)
    return (
      <div className="hand-off" role="alert">
        <div className="hand-off-failed">{failedLine()}</div>
        <div className="hand-off-why">{error}</div>
        <button
          ref={again}
          type="button"
          className="hand-off-again"
          onClick={retry}
        >
          {t('Try again')}
        </button>
      </div>
    )
  const line = handOffLine(ready)
  return (
    <div className="hand-off" role="status" aria-label={line}>
      <span className="shimmer hand-off-line" aria-hidden="true">
        {line}
      </span>
    </div>
  )
}
