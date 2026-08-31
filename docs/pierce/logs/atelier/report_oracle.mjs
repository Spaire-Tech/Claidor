/**
 * The hostile read, mechanised.
 *
 * The DONE test for this piece is « no sentence in it that the engine
 * cannot defend ». That is an opinion until there is an oracle, so this
 * is the oracle: render a real model's report, pull **every number** off
 * the page, and check each one against what the API actually served.
 *
 * A number the payload cannot account for is a sentence the engine
 * cannot defend. The script does not judge prose — it judges arithmetic
 * and provenance, which is the part a person cannot hold in their head.
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs'

const COOKIE = process.env.COOKIE
const DEAL = process.env.DEAL
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const context = await browser.newContext({ viewport: { width: 1680, height: 1200 } })
await context.addCookies([{ name: 'claidor_session', value: COOKIE, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }])
const page = await context.newPage()

// Everything the API served for this deal, captured as it is fetched.
const served = []
page.on('response', async (r) => {
  const url = r.url()
  if (!url.includes('/v1/tieout/') && !url.includes('/v1/chain/')) return
  try { served.push({ url, body: await r.text() }) } catch {}
})

await page.goto('http://127.0.0.1:3000/dashboard', { waitUntil: 'domcontentloaded', timeout: 120000 })
await page.waitForTimeout(8000)
await page.getByText(DEAL, { exact: false }).first().click({ timeout: 20000 })
await page.waitForTimeout(7000)
await page.getByText('Read the full report', { exact: false }).first().click({ timeout: 20000 })
await page.waitForTimeout(4000)

const sheets = await page.evaluate(() =>
  [...document.querySelectorAll('[data-report="sheet"]')].map((s) => s.innerText),
)
const text = sheets.join('\n')

// Every number the page prints, normalised the way a payload holds it.
const printed = [...text.matchAll(/-?\d[\d,]*\.?\d*/g)].map((m) => m[0])
const payload = served.map((s) => s.body).join('\n')

// **The first oracle lied and said everything was fine.** It asked
// whether the number appeared *anywhere* in the concatenated JSON, so
// « 3 » matched a timestamp and « 4 » matched a UUID. Substring
// presence in a payload is not provenance.
//
// This one collects the payload's actual *values*: every numeric leaf,
// and every number written inside a string. A printed number is traced
// only when it equals one of those exactly.
const values = new Set()
const walk = (node) => {
  if (node === null || node === undefined) return
  if (typeof node === 'number') { values.add(String(node)); return }
  if (typeof node === 'string') {
    for (const m of node.matchAll(/-?\d[\d,]*\.?\d*/g)) values.add(m[0].replace(/,/g, ''))
    return
  }
  if (Array.isArray(node)) { node.forEach(walk); return }
  if (typeof node === 'object') { Object.values(node).forEach(walk) }
}
for (const s of served) { try { walk(JSON.parse(s.body)) } catch {} }

// Counts the report is entitled to compute for itself: how many
// findings, how many of each severity, how many versions. Derived, not
// invented — and listed so the score cannot quietly absorb anything.
const derived = new Set()
for (const s of served) {
  try {
    const body = JSON.parse(s.body)
    if (Array.isArray(body)) {
      derived.add(String(body.length))
      const bySev = {}
      for (const one of body) {
        const k = one?.severity ?? one?.kind ?? ''
        bySev[k] = (bySev[k] ?? 0) + 1
      }
      Object.values(bySev).forEach((n) => derived.add(String(n)))
    }
  } catch {}
}
// The report's own furniture: « Section 1 of 4 », « 01 », « 02 ».
for (let i = 0; i <= 20; i++) { derived.add(String(i)); derived.add(String(i).padStart(2, '0')) }

const bare = (n) => n.replace(/,/g, '')
const traced = []
const orphan = []
const how = new Map()
for (const n of new Set(printed)) {
  const b = bare(n)
  const trimmed = b.includes('.') ? b.replace(/0+$/, '').replace(/\.$/, '') : b
  let why = ''
  if (values.has(b) || values.has(n)) why = 'served'
  else if (values.has(trimmed)) why = 'served (trailing zeros)'
  else if ([...values].some((v) => v.startsWith(b) && v.includes('.'))) why = 'served (rounded)'
  else if (derived.has(b)) why = 'derived/furniture'
  if (why) { traced.push(n); how.set(n, why) } else orphan.push(n)
}

console.log(`report on ${DEAL}`)
console.log(`  sheets rendered : ${sheets.length}`)
console.log(`  api payloads    : ${served.length}`)
console.log(`  distinct numbers printed : ${traced.length + orphan.length}`)
console.log(`  traced to a payload      : ${traced.length}`)
console.log(`  NOT traced               : ${orphan.length}`)
console.log('\n  every number on the page, and where it came from:')
for (const n of [...new Set(printed)].sort((a, b) => bare(b).length - bare(a).length)) {
  console.log(`    ${n.padStart(12)}  ${(how.get(n) ?? 'NOT TRACED').padEnd(24)}`)
}
if (orphan.length) {
  console.log('\n  numbers the payload cannot account for:')
  for (const n of orphan.sort()) {
    const line = text.split('\n').find((l) => l.includes(n)) ?? ''
    console.log(`    ${n.padStart(12)}   « ${line.trim().slice(0, 96)} »`)
  }
}

// ---- the rest of the DONE test, checked rather than admired --------
//
// « findings ranked, coverage stated on its face, every claim citable
//   to a cell, refusals in words ». Numbers above; these four here.

const findings = (() => {
  for (const s of served) {
    if (!s.url.includes('/findings')) continue
    try {
      const body = JSON.parse(s.body)
      if (Array.isArray(body)) return body
    } catch {}
  }
  return []
})()
const open = findings.filter((f) => (f.state ?? 'open') === 'open')
const material = open.filter((f) => f.severity === 'error')

const problems = []

// 1. Ranked: every material finding is printed before any that is not.
const sheet3 = sheets[2] ?? ''
const sheet4 = sheets[3] ?? ''
for (const f of material) {
  const said = (f.plain || f.title || '').slice(0, 40)
  if (said && !sheet3.includes(said) && sheet4.includes(said))
    problems.push(`ranked: material finding printed among the rest — « ${said} »`)
}

// 2. Coverage on its face.
if (!/How much was covered/i.test(sheets[1] ?? ''))
  problems.push('coverage: the section is missing')

// 3. Citable: every finding the page prints carries a cell, or a
//    document and page. Checked against the page, not the payload —
//    a citation in the JSON that never renders is not a citation.
// **How many findings this check actually examined**, because a check
// that skips everything reports zero problems and means nothing. Every
// number below is printed, including the skips.
let examined = 0
let sentenceOfItsOwn = 0
let skippedNotOnPage = 0
for (const f of open) {
  const whole = f.plain || f.title || ''
  if (!whole) continue
  const ref = f.where?.anchor?.ref || f.where?.label || ''
  // The report groups repeated findings and prints the sentence once
  // with the reference taken out of it, so the payload's title is not
  // the printed string. Match on either form — and count the skips, so
  // a matcher that quietly stops matching is visible rather than
  // reported as « no problems ».
  const bareSaid = ref ? whole.replace(ref, '').replace(/\s+at\s*$/, '').trim() : whole
  // **The clause is « every claim citable to a cell », not « every
  // finding gets its own paragraph ».** When the report collapses a
  // group that makes one statement fifty-three times, the fifty-three
  // sentences become one and every reference stays on the page. So the
  // check is the reference; whether the sentence is its own is counted
  // separately, because it is worth knowing, not worth failing.
  const onPage =
    text.includes(whole.slice(0, 40)) || text.includes(bareSaid.slice(0, 40))
  if (onPage) sentenceOfItsOwn += 1
  if (!ref) { problems.push(`citable: no reference at all — « ${whole.slice(0, 40)} »`); continue }
  if (!text.includes(ref)) { skippedNotOnPage += 1 }
  examined += 1
  const said = whole.slice(0, 40)
  if (!text.includes(ref))
    problems.push(`citable: « ${said} » is printed without its « ${ref} »`)
}

// 4. Refusals in words: an abstention recorded by the run has to be a
//    sentence on the page, not a silence.
const abstentions = (() => {
  for (const s of served) {
    try {
      const body = JSON.parse(s.body)
      const runs = Array.isArray(body) ? body : [body]
      for (const r of runs) {
        const list = r?.summary?.abstentions
        if (Array.isArray(list) && list.length) return list
      }
    } catch {}
  }
  return []
})()
for (const a of abstentions) {
  const why = String(a.why ?? '').slice(0, 30)
  if (why && !text.includes(why))
    problems.push(`refusal: an abstention is not on the page — « ${why} »`)
}

console.log(`\n  open findings served : ${open.length} (${material.length} material)`)
console.log(`  references checked   : ${examined} of ${open.length}` +
  (skippedNotOnPage ? `  (${skippedNotOnPage} MISSING from the page)` : ''))
console.log(`  with a sentence of their own : ${sentenceOfItsOwn}` +
  (sentenceOfItsOwn < open.length
    ? `  (${open.length - sentenceOfItsOwn} share a collapsed one)`
    : ''))
console.log(`  abstentions served   : ${abstentions.length}`)
console.log(`  DONE-test problems   : ${problems.length}`)
for (const one of problems) console.log(`    - ${one}`)

await browser.close()
