/**
 * Nothing invented may reach a real workspace.
 *
 * The dashboard was drawn before it had a backend, so every screen renders
 * `liveX || scriptedX` and the scripted half is a full demonstration
 * cabinet: lawyers at `diallo-associes.com`, a matter for SODICA, watches
 * on articles nobody subscribed to — and, worst of all, a CCJA arrêt that
 * does not exist, complete with chamber and holding.
 *
 * As a first-run illustration that is defensible. As a *fallback* it is
 * not: any list that fails to load, for any reason, silently swaps in
 * fiction and presents it as this cabinet's own activity. A lawyer cannot
 * tell the two apart, which in a legal product is the worst failure the
 * interface can have — worse than an error, because an error is honest.
 *
 * So: with a live corpus, no invented string may appear on any screen,
 * whatever the backends do. Both passes matter. The second fails every
 * request, because that is the state where the fallback used to fire.
 *
 * Usage:  node dev/design_port/no-fiction-audit.mjs [url]
 * Exit code 0 = clean, 1 = fiction reached a live screen.
 */

const playwright = await import(
  process.env.PLAYWRIGHT_CORE || 'playwright-core'
)
const { chromium } = playwright.chromium ? playwright : playwright.default

const PAGE_URL =
  process.argv[2] || 'http://127.0.0.1:8914/design-preview?org=org-preview'
const ORIGIN = new globalThis.URL(PAGE_URL).origin

/**
 * Strings no live backend can ever produce. Each is invented, and each
 * would read to a lawyer as their own data.
 */
const FICTION = [
  'diallo-associes', // invented colleagues, with email addresses
  'SODICA', // invented client
  'Groupe Ndiaye',
  'CIMA Finance',
  'forclusion confirmée', // an invented CCJA arrêt, with a holding
  'Signal ce matin', // a watch nobody created
  'Formalisme du cautionnement', // invented conversations
  'Contestation de la saisie',
  'M. Traoré', // an invented client, named
]

/** Screens to sweep, by nav label. */
const VIEWS = [
  'Recherche',
  'Dossiers',
  'Analyses',
  'Veilles',
  'Lecteur',
  'Historique',
  'Bibliothèque',
]

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--no-sandbox'],
})

const offenders = []

const sweep = async (label, answering) => {
  const page = await browser.newPage()
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': ORIGIN,
    'Access-Control-Allow-Credentials': 'true',
  }
  // Catch-all first: Playwright tries the most recent route first.
  await page.route('**/v1/**', (route) =>
    answering
      ? route.fulfill({ status: 200, headers, body: '[]' })
      : route.fulfill({ status: 500, headers, body: '{"detail":"audit"}' }),
  )
  // Search answers with its own shape, not a bare list: a stub that lies
  // about the contract tests the stub, not the product.
  await page.route('**/v1/corpus/search*', (route) =>
    answering
      ? route.fulfill({
          status: 200,
          headers,
          body: JSON.stringify({ decisions: [], articles: [], chambers: [] }),
        })
      : route.fulfill({ status: 500, headers, body: '{"detail":"audit"}' }),
  )
  // The corpus decides live mode, so it answers in both passes: a library
  // with law in it is the whole premise of the test.
  await page.route('**/v1/corpus/acts*', (route) =>
    route.fulfill({
      status: 200,
      headers,
      body: JSON.stringify([{ id: 'act-1', short_code: 'AUPSRVE' }]),
    }),
  )

  await page.goto(PAGE_URL, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(1500)

  const check = async (where) => {
    const text = await page.locator('.claidor-design').innerText()
    for (const bad of FICTION) {
      if (text.includes(bad)) {
        offenders.push(`[${label}] ${where}: « ${bad} »`)
      }
    }
  }

  await check('Assistant')
  for (const view of VIEWS) {
    try {
      await page.click(`text="${view}"`, { timeout: 8000 })
      await page.waitForTimeout(700)
      await check(view)
    } catch (e) {
      offenders.push(
        `[${label}] ${view}: could not be opened — ${String(e).split('\n')[0].slice(0, 120)}`,
      )
    }
  }
  await page.close()
}

await sweep('backends answering', true)
await sweep('backends failing', false)
await browser.close()

if (offenders.length) {
  console.error('FAIL — invented data reached a live screen:')
  for (const o of [...new Set(offenders)]) console.error('  ·', o)
  process.exit(1)
}
console.log(
  `OK — no invented string on ${VIEWS.length + 1} screens, answering and failing.`,
)
