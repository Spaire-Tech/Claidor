import { StrictMode, useCallback, useState } from 'react'
import { createRoot } from 'react-dom/client'

import { runAll, type Step } from './checks'
import './selftest.css'

/**
 * The self-test page.
 *
 * Its own HTML entry point rather than a screen inside the app, so that
 * nothing stands between the reader and the results: no sign-in, no
 * routing, no edition gate, no API. Every failure it can report is a
 * failure of the thing being tested.
 *
 * The output is written to be read out loud or pasted into a message. That
 * is the whole interface: somebody with a real Word runs this, and what
 * comes back settles four assumptions that have been guesses since the
 * first line of Office.js code was written here.
 */

const MARK: Record<Step['outcome'], string> = {
  pass: 'OK',
  fail: 'NO',
  skip: '--',
}

function App() {
  const [steps, setSteps] = useState<Step[]>([])
  const [running, setRunning] = useState(false)
  const [copied, setCopied] = useState(false)

  const run = useCallback(async () => {
    setSteps([])
    setCopied(false)
    setRunning(true)
    try {
      // Report as each step finishes rather than at the end. If one of them
      // hangs — and hanging is a real outcome for an Office call that never
      // syncs — the reader still sees everything before it.
      await runAll((step) => setSteps((all) => [...all, step]))
    } catch (error) {
      setSteps((all) => [
        ...all,
        {
          name: 'The test itself',
          outcome: 'fail',
          detail: `stopped early: ${(error as Error).message}`,
        },
      ])
    } finally {
      setRunning(false)
    }
  }, [])

  const failures = steps.filter((step) => step.outcome === 'fail').length
  const asText = steps
    .map((step) => `${MARK[step.outcome]}  ${step.name}: ${step.detail}`)
    .join('\n')

  async function copy() {
    try {
      await navigator.clipboard.writeText(asText)
      setCopied(true)
    } catch {
      // Clipboard access is blocked in some hosts. The text is on screen
      // and selectable, so this is a convenience, not the only route.
      setCopied(false)
    }
  }

  return (
    <main className="st">
      <h1 className="st__title">Claidor self-test</h1>
      <p className="st__lede">
        Open a contract, then press the button. Everything this writes goes
        into one scratch paragraph at the end of the document, and that
        paragraph is removed when the test finishes.
      </p>

      <button className="st__run" onClick={() => void run()} disabled={running}>
        {running ? 'Running...' : steps.length ? 'Run again' : 'Run the test'}
      </button>

      {steps.length > 0 && (
        <>
          <p className="st__score">
            {failures === 0
              ? `All ${steps.length} passed.`
              : `${failures} of ${steps.length} failed.`}
          </p>

          <ol className="st__steps">
            {steps.map((step, index) => (
              <li key={index} className={`st__step st__step--${step.outcome}`}>
                <span className="st__mark">{MARK[step.outcome]}</span>
                <span className="st__body">
                  <strong className="st__name">{step.name}</strong>
                  <span className="st__detail">{step.detail}</span>
                </span>
              </li>
            ))}
          </ol>

          {!running && (
            <button className="st__copy" onClick={() => void copy()}>
              {copied ? 'Copied' : 'Copy the results'}
            </button>
          )}
        </>
      )}
    </main>
  )
}

const root = document.getElementById('root')!

// Office.onReady never fires outside an Office host, so a plain browser
// would sit on "Waiting for Word..." forever with no explanation. Say what
// is wrong instead.
const notWord = setTimeout(() => {
  root.textContent =
    'This page only works inside Microsoft Word. Open it from the Claidor button on the ribbon.'
}, 4000)

Office.onReady(() => {
  clearTimeout(notWord)
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
