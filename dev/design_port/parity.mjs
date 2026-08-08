/**
 * Side-by-side parity: the designed original against the native port.
 *
 * The design is the source of truth, so the port is not allowed to drift
 * from it quietly. This sweeps every view in both, normalises the two
 * deliberate sources of noise (the random greeting, and the additions
 * listed below), and fails on any remaining difference.
 *
 * ADDITIONS are the divergences the founder approved. Each one is written
 * out here, so a difference is either on this list or a bug — there is no
 * third case. Adding a line to this list is the act of documenting a
 * divergence; nothing else in the harness lets one through.
 *
 * The port side is the /design-preview route, which exists in development
 * builds only and 404s in production — it carries no workspace, so it
 * renders scripted, which is the state the original is in.
 *
 * Usage (with the app running, and the original served beside it):
 *
 *   node dev/design_port/parity.mjs [portURL] [originalURL]
 *
 * Defaults to a dev server on :8914 with the port at /design-preview and
 * the original at /design/claidor-v1.html. playwright-core is resolved
 * from PLAYWRIGHT_CORE when set (an absolute path to its entry point),
 * otherwise as an ordinary import.
 *
 * Exit code 0 = identical (modulo the documented additions), 1 = drift.
 */

const playwright = await import(
  process.env.PLAYWRIGHT_CORE || 'playwright-core'
)
// PLAYWRIGHT_CORE may point at the CommonJS entry point, which arrives
// under `default`; a bare package name resolves to the namespace directly.
const { chromium } = playwright.chromium ? playwright : playwright.default

const PORT_URL = process.argv[2] || 'http://127.0.0.1:8914/design-preview'
const ORIGINAL_URL =
  process.argv[3] || 'http://127.0.0.1:8914/design/claidor-v1.html'

const VIEWS = [
  'Recherche',
  'Dossiers',
  'Analyses',
  'Veilles',
  'Lecteur',
  'Historique',
  'Bibliothèque',
  'Guides',
  'Assistant',
]

/** Text the port shows and the design does not — each one approved. */
const ADDITIONS = [
  // Dossiers: the design draws the list and the detail, but no way to
  // create, delete or reach a matter's own settings.
  '+ Nouveau dossier ',
  'Supprimer le dossier ',
  ' Supprimer le dossier',
  // Bibliothèque: the design lists saved prompts without a way to add one.
  '+ Nouveau prompt ',
  ' + Nouveau prompt',
  // Historique: the design draws a list that can only grow. A record of
  // trial questions with no way to clear it becomes noise a lawyer scrolls
  // past, so each row carries a × and the header a « Tout effacer ».
  'Tout effacer ',
  ' Tout effacer',
  // …and the per-row × that removes a single question.
  ' ×',
  '× ',
]

/**
 * Replacements: text the design draws that the port deliberately words
 * differently. Written as [design, port] and checked as a substitution
 * before the comparison, so the rest of the screen is still compared
 * exactly.
 */
const REPLACEMENTS = [
  // The design's example button names an invented client. Offering an
  // example is right; naming a fictional party on a real lawyer's screen
  // is the habit this product is trying to lose.
  [
    'Analyser un exemple — conclusions adverses (SODICA)',
    'Analyser un exemple de conclusions',
  ],
]

/**
 * Screens the port has and the design does not. Reached from the cabinet
 * menu rather than the nav, so they never enter the sweep above; listed
 * here so the addition is on the record either way.
 */
const ADDED_SCREENS = [
  { name: 'Réglages', reachedBy: 'the cabinet menu in the sidebar footer' },
]

/** The design picks a greeting at random; both sides get the same token. */
const GREETINGS = [
  'What are we working on today?',
  'What legal question can I help with?',
  "What's on your desk today?",
  'Where should we begin?',
  "What's the matter at hand?",
]

const sweep = async (browser, url) => {
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 150)))
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(2500)
  const seen = {}
  for (const view of VIEWS) {
    await page.click(`text="${view}"`, { timeout: 10000 }).catch(() => {})
    await page.waitForTimeout(700)
    seen[view] = await page.evaluate(() =>
      document.body.innerText.replace(/\s+/g, ' ').trim(),
    )
  }
  await page.close()
  return { seen, errors }
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',
  args: ['--no-sandbox'],
})
const original = await sweep(browser, ORIGINAL_URL)
const port = await sweep(browser, PORT_URL)
await browser.close()

let failed = false
if (port.errors.length) {
  failed = true
  console.log('PORT ERRORS:', JSON.stringify(port.errors.slice(0, 4)))
}

for (const view of VIEWS) {
  let left = original.seen[view]
  let right = port.seen[view]
  // replaceAll, not replace: a per-row control appears once per row, and
  // documenting it should not mean documenting it five times.
  for (const addition of ADDITIONS) right = right.replaceAll(addition, '')
  for (const [drawn, worded] of REPLACEMENTS) left = left.replace(drawn, worded)
  for (const greeting of GREETINGS) {
    left = left.replace(greeting, '<G>')
    right = right.replace(greeting, '<G>')
  }
  if (left === right) {
    console.log(`${view}: identical (${left.length} chars)`)
    continue
  }
  failed = true
  let i = 0
  while (i < Math.min(left.length, right.length) && left[i] === right[i]) i++
  console.log(`${view}: DIFF at ${i}`)
  console.log('  DESIGN:', left.slice(Math.max(0, i - 60), i + 100))
  console.log('  PORT:  ', right.slice(Math.max(0, i - 60), i + 100))
}

for (const screen of ADDED_SCREENS) {
  console.log(`${screen.name}: added screen, reached by ${screen.reachedBy}`)
}

console.log(failed ? 'PARITY: DRIFT' : 'PARITY: OK')
process.exit(failed ? 1 : 0)
