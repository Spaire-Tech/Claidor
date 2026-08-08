/**
 * Historique must survive a page load.
 *
 * « Recherches récentes » and the Historique screen read `liveHistory`,
 * which is null until the questions endpoint answers. Null is what the
 * sidebar reads as « no corpus yet », so it falls back to the scripted
 * demo conversations — and a lawyer who asked a real question yesterday
 * comes back to somebody else's placeholder titles.
 *
 * The subtle part is *when* the load is asked for. Live mode is decided in
 * a promise callback; React batches state updates there, so a refresh that
 * guards on `this.state.live` reads the value from before the switch and
 * silently declines to load. The screen then looks exactly like an empty
 * workspace. Nothing errors.
 *
 * This stubs a live corpus and one stored question, loads the page cold,
 * and asserts the stored question is what the sidebar shows.
 *
 * Usage:  node dev/design_port/history-audit.mjs [url]
 * Exit code 0 = history loads on mount, 1 = it does not.
 */

const playwright = await import(
  process.env.PLAYWRIGHT_CORE || 'playwright-core'
)
const { chromium } = playwright.chromium ? playwright : playwright.default

const PAGE_URL = process.argv[2] || 'http://127.0.0.1:8914/design-preview?org=org-preview'

/** The stored question the server holds. Nothing in the demo says this. */
const STORED = 'QUESTION ENREGISTRÉE — délai de contestation'
//: The sidebar shortens long titles, so the assertion uses a prefix that
//: survives truncation rather than the whole sentence.
const STORED_MARK = 'QUESTION ENREGISTRÉE'

/** Titles only the scripted demo can produce. */
const DEMO_CONVERSATIONS = [
  'Contestation de la saisie — SODICA',
  'Formalisme du cautionnement',
]

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--no-sandbox'],
})
const page = await browser.newPage()

// The API is a different origin in development, so a stub without CORS
// headers is rejected by the browser and the app's own `.catch` swallows
// it — which looks exactly like a backend that answered nothing. The
// requests are credentialed, so the origin must be echoed exactly: `*` is
// refused outright.
const ORIGIN = new globalThis.URL(PAGE_URL).origin

const json = (route, body) =>
  route.fulfill({
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': ORIGIN,
      'Access-Control-Allow-Credentials': 'true',
    },
    body: JSON.stringify(body),
  })

// Order matters: Playwright tries the most recently registered route
// first, so the catch-all goes down before the specific ones or it
// swallows them — and a stubbed corpus that answers `[]` looks exactly
// like an empty library, which is the state this test exists to rule out.
//
// Everything unnamed answers empty rather than erroring, so this test
// fails for one reason only.
await page.route('**/v1/**', (route) => json(route, []))

// A corpus with law in it: this is what flips the dashboard to live mode.
await page.route('**/v1/corpus/acts*', (route) =>
  json(route, [{ id: 'act-1', short_code: 'AUPSRVE', title: "Voies d'exécution" }]),
)

let questionsRequested = 0
await page.route('**/v1/librarian/questions*', (route) => {
  questionsRequested += 1
  return json(route, [
    {
      id: 'q-1',
      question: STORED,
      answer: 'Un mois à compter de la dénonciation.',
      status: 'answered',
      versions_used: ['1998'],
      sources: [
        {
          kind: 'article',
          id: 'art-170',
          title: 'SOURCE ENREGISTRÉE — AUPSRVE (1998) — Article 170',
          quote: 'À peine d’irrecevabilité, les contestations…',
          nature: 'law',
        },
      ],
      authority_label: 'jurisprudence constante',
      authority_count: 3,
      created_at: '2026-08-01T10:00:00Z',
      answered_at: '2026-08-01T10:00:04Z',
    },
  ])
})

await page.goto(PAGE_URL, { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)

const text = await page.locator('.claidor-design').innerText()

const failures = []
if (questionsRequested === 0) {
  failures.push(
    'the questions endpoint was never called on mount — Historique cannot load',
  )
}
if (!text.includes(STORED_MARK)) {
  failures.push(`the stored question is not on screen: « ${STORED} »`)
}
for (const demo of DEMO_CONVERSATIONS) {
  if (text.includes(demo)) {
    failures.push(`demo conversation still shown in live mode: « ${demo} »`)
  }
}

// Reopening the question must bring back what the answer stood on. An
// answer without its citations is a legal conclusion standing on nothing,
// and Historique showed exactly that for as long as the sources went
// unrecorded.
try {
  await page.getByText(STORED_MARK).first().click({ timeout: 5000 })
  await page.waitForTimeout(800)
  const reopened = await page.locator('.claidor-design').innerText()
  if (!reopened.includes('SOURCE ENREGISTRÉE')) {
    failures.push('the stored answer reopened with none of its sources')
  }
} catch {
  // Already reported above as "not on screen"; do not drown that in a
  // stack trace for a row that was never rendered.
  if (!failures.length) failures.push('the stored question could not be opened')
}

await browser.close()

if (failures.length) {
  console.error('FAIL — Historique does not survive a page load:')
  for (const failure of failures) console.error('  ·', failure)
  process.exit(1)
}
console.log('OK — the stored question loads on mount and no demo row remains.')
