/**
 * Live-mode audit: no screen may show demo data once the corpus is real.
 *
 * The dashboard renders `liveX || scriptedX` on every screen, so the
 * scripted demo is the fallback for an empty corpus — deliberate, and the
 * reason a brand-new workspace looks like a product rather than eight
 * empty states.
 *
 * The failure that hides inside that design is a third state: a screen
 * that *looks* live and is not, because it was drawn before its backend
 * existed and nobody pointed it at the data afterwards. Nothing
 * distinguishes "falling back because empty" from "never wired", so those
 * leftovers survive until somebody reads the file.
 *
 * This forces live mode on with every backend stubbed — deliberately
 * returning data whose values appear nowhere in the demo — then sweeps the
 * screens looking for strings only the demo could produce. Anything found
 * is a screen still wired to the drawing.
 *
 * It runs the sweep twice. The second pass fails every backend, because
 * the nastiest version of this bug only appears when something is broken:
 * a request that errors used to leave the state unset, and unset is what
 * the screens read as « no corpus yet ». A server having a bad afternoon
 * showed the lawyer watches they never created and matters that were not
 * theirs, with nothing to say anything was wrong.
 *
 * Usage:  node dev/design_port/live-audit.mjs [url]
 * Exit code 0 = clean, 1 = demo data surfaced in live mode.
 */

const { chromium } = await import(
  process.env.PLAYWRIGHT_CORE || 'playwright-core'
)

const URL = process.argv[2] || 'http://127.0.0.1:8914/design-preview'

/**
 * Strings that exist only in the scripted demo. Each is a value a live
 * backend can never return, so seeing one in live mode means the screen
 * that rendered it never left the drawing.
 */
const DEMO_ONLY = [
  'Contestation de la saisie — SODICA', // sidebar conversations
  'Formalisme du cautionnement',
  'CCJA 084/2018', // omnisearch palette decisions
  'CCJA 118/2022',
  'Groupe Ndiaye', // client menu
  'CIMA Finance',
  'Art. 170, AUPSRVE', // analysis entry points
  'Art. 45, AUPSRVE',
  'Conclusions adverses — SODICA c/ BICIS.pdf', // Lecteur
]

/** Screens to sweep, by their nav label. */
const VIEWS = [
  'Recherche',
  'Dossiers',
  'Analyses',
  'Veilles',
  'Lecteur',
  'Historique',
  'Bibliothèque',
  'Assistant',
]

/** Live answers whose values collide with nothing in the demo. */
const STUBS = [
  [/\/v1\/corpus\/acts/, [{ id: 'act-1' }]],
  [
    /\/v1\/dossiers(\?|$)/,
    [
      {
        id: 'aud-1',
        name: 'Zzz Audit — matter',
        reference: null,
        client_name: 'Zzz Audit Client',
        status: 'open',
        notes: null,
        created_at: '2026-01-01T00:00:00Z',
        members: [],
        documents: [],
      },
    ],
  ],
  [
    /\/v1\/librarian\/questions/,
    [
      {
        id: 'aud-q1',
        question: 'Zzz audit question',
        answer: 'Zzz audit answer',
        status: 'answered',
        versions_used: [],
        authority_label: null,
        authority_count: null,
        created_at: '2026-01-01T00:00:00Z',
        user_email: 'audit@example.test',
      },
    ],
  ],
  [
    /\/v1\/prompts/,
    [
      {
        id: 'aud-p1',
        title: 'Zzz audit prompt',
        text: 'Zzz audit prompt text',
        created_at: '2026-01-01T00:00:00Z',
      },
    ],
  ],
  [/\/v1\/veilles\/signals/, []],
  [/\/v1\/veilles/, []],
  [/\/v1\/organizations/, { items: [] }],
  [
    /\/v1\/analyses\/suggestions/,
    {
      authority: [{ kind: 'decision', id: 'aud-d1', label: 'CCJA 999/2099' }],
      history: [{ kind: 'article', id: 'aud-a1', label: 'art. 999 (ZZZ 1900)' }],
      compare: [{ kind: 'article', id: 'aud-a1', label: 'art. 999 (ZZZ 1900)' }],
      citations: [{ kind: 'article', id: 'aud-a2', label: 'art. 998 (ZZZ 1900)' }],
    },
  ],
  [
    /\/v1\/corpus\/search/,
    { decisions: [], articles: [], chambers: [], total: 0 },
  ],
]

const FIND_INSTANCE = `(() => {
  const el = document.querySelector('.claidor-design')
  const key = Object.keys(el).find(
    (k) => k.startsWith('__reactFiber$') || k.startsWith('__reactContainer$'),
  )
  const queue = [el[key]]
  while (queue.length) {
    const node = queue.shift()
    if (!node) continue
    if (node.stateNode && typeof node.stateNode.refreshDossiers === 'function') {
      return node.stateNode
    }
    if (node.child) queue.push(node.child)
    if (node.sibling) queue.push(node.sibling)
  }
  return null
})()`

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',
  args: ['--no-sandbox'],
})

const offenders = []

/**
 * One pass over the app in live mode. ``answering`` decides whether the
 * backends reply or fail — both have to be free of demo data.
 */
const audit = async (label, answering) => {
  const page = await browser.newPage()
  for (const [pattern, body] of STUBS) {
    await page.route(pattern, (route) =>
      answering
        ? route.fulfill({
            status: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
        : route.fulfill({
            status: 500,
            headers: { 'Content-Type': 'application/json' },
            body: '{"detail":"audit"}',
          }),
    )
  }
  // The corpus check decides live mode, so it answers in both passes.
  await page.route(/\/v1\/corpus\/acts/, (route) =>
    route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([{ id: 'act-1' }]),
    }),
  )

  await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(2000)
  await page.evaluate(`
    const inst = ${FIND_INSTANCE}
    // The preview route carries no workspace; production always does.
    inst.orgId = () => 'audit-org'
    inst.setState({ live: true })
    inst.refreshDossiers()
    inst.refreshHistory()
    inst.refreshPrompts()
    inst.refreshVeilles()
    inst.refreshAnalysisSuggestions()
  `)
  await page.waitForTimeout(1500)

  const sweep = async (where) => {
    const text = await page.evaluate(() =>
      document.body.innerText.replace(/\s+/g, ' '),
    )
    for (const demo of DEMO_ONLY) {
      if (text.includes(demo)) offenders.push(`[${label}] ${where}: ${demo}`)
    }
  }

  for (const view of VIEWS) {
    await page.click(`text="${view}"`, { timeout: 10000 }).catch(() => {})
    await page.waitForTimeout(600)
    await sweep(view)
  }
  // The palette is not a view; open it explicitly.
  await page
    .evaluate(
      `${FIND_INSTANCE}.setState({ searchOpen: true, searchQ: '', menu: 'client' })`,
    )
    .catch(() => {})
  await page.waitForTimeout(600)
  await sweep('Omnisearch + client menu')
  await page.close()
}

await audit('backends answering', true)
await audit('backends failing', false)
await browser.close()

if (offenders.length) {
  console.log('DEMO DATA IN LIVE MODE:')
  for (const line of offenders) console.log('  ' + line)
  console.log('LIVE AUDIT: FAIL')
  process.exit(1)
}
console.log(
  `LIVE AUDIT: OK (${VIEWS.length} views + palette, answering and failing)`,
)
process.exit(0)
