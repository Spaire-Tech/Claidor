/**
 * What the add-in has never been able to prove about itself.
 *
 * Every Office.js path in this repository is written and unproven: there is
 * no Word in the environment it was written in, and Office.js exists only
 * inside an Office host, so there is no honest way to fake one. These are
 * the assumptions that have been sitting in `worklog.md` marked
 * **Unresolved**, turned into something a person can run in a minute and
 * read out loud.
 *
 * Three rules, because this runs against somebody's real document:
 *
 * **It leaves the document as it found it.** Everything that writes does so
 * inside a paragraph the test appends itself, and that paragraph is removed
 * at the end whatever happened. The reader's own text is only ever read.
 *
 * **Every step reports, including the ones that fail.** A failure here is
 * the point of running it. Steps continue after one fails, because knowing
 * that four of five work is worth much more than stopping at the first.
 *
 * **It says what it saw, not whether it approves.** « 1 of 3 matches, wanted
 * the 3rd » is a result somebody can act on; « occurrence test failed » is
 * not.
 */

export type Outcome = 'pass' | 'fail' | 'skip'

export interface Step {
  name: string
  outcome: Outcome
  /** One line, plain enough to read down a phone. */
  detail: string
}

/** The phrase the sandbox repeats. Chosen to appear in no real agreement. */
const MARKER = 'Zorbex'
const REPEATS = 5
/** Which repeat the occurrence test asks for. 1-based, like the server's. */
const WANTED = 3

const REQUIREMENT_SETS = ['1.1', '1.2', '1.3', '1.4', '1.5', '1.6', '1.7', '1.8', '1.9']

/** What `document.changeTrackingMode` actually reads back as. The typings
 *  widen it to the enum plus its raw string values, so this is the honest
 *  type for carrying one around. */
type TrackingMode = Word.ChangeTrackingMode | 'Off' | 'TrackAll' | 'TrackMineOnly'

function ok(name: string, detail: string): Step {
  return { name, outcome: 'pass', detail }
}

function bad(name: string, detail: string): Step {
  return { name, outcome: 'fail', detail }
}

function describe(error: unknown): string {
  const e = error as { message?: string; code?: string; debugInfo?: unknown }
  const code = e?.code ? ` [${e.code}]` : ''
  return `${e?.message ?? String(error)}${code}`
}

/** Which Office host this is, and what it admits to supporting. */
export function capabilities(): Step[] {
  const steps: Step[] = []

  try {
    const info = Office.context.diagnostics
    steps.push(
      ok(
        'Host',
        `${info.host ?? 'unknown'} on ${info.platform ?? 'unknown'}, Office ${info.version ?? 'unknown'}`,
      ),
    )
  } catch (error) {
    steps.push(bad('Host', `Office.context.diagnostics threw: ${describe(error)}`))
  }

  try {
    const supported = REQUIREMENT_SETS.filter((set) =>
      Office.context.requirements.isSetSupported('WordApi', set),
    )
    const highest = supported[supported.length - 1]
    // The manifests declare a WordApi 1.6 floor. If this host is below it,
    // the add-in would not load at all in production — which is exactly the
    // kind of thing worth learning from a page that loads anyway.
    const meetsFloor = supported.includes('1.6')
    steps.push({
      name: 'WordApi',
      outcome: meetsFloor ? 'pass' : 'fail',
      detail: meetsFloor
        ? `up to ${highest} — the manifest's 1.6 floor is met`
        : `only up to ${highest ?? 'none'} — below the manifest's 1.6 floor, so the real add-in would refuse to load here`,
    })
  } catch (error) {
    steps.push(bad('WordApi', `Requirement probe threw: ${describe(error)}`))
  }

  return steps
}

/**
 * Read the document the way production reads it, and describe the string.
 *
 * This is the assumption everything else rests on. The server is sent a
 * string and returns character offsets into it; if what Word hands back
 * here is not what the server indexed, every jump in the panel lands
 * somewhere plausible and wrong, and nothing throws. So this reports the
 * shape of the string — its length, and what it uses between paragraphs —
 * rather than merely that a read succeeded.
 */
export async function readDocument(): Promise<{ steps: Step[]; text: string }> {
  try {
    const text = await Word.run(async (context) => {
      const reviewed = context.document.body.getReviewedText(
        Word.ChangeTrackingVersion.current,
      )
      await context.sync()
      return reviewed.value ?? ''
    })

    const carriage = (text.match(/\r/g) ?? []).length
    const newline = (text.match(/\n/g) ?? []).length
    const separator =
      carriage && !newline
        ? 'carriage returns (\\r)'
        : newline && !carriage
          ? 'newlines (\\n)'
          : carriage && newline
            ? `both (${carriage} \\r, ${newline} \\n)`
            : 'neither — one long paragraph, or an empty document'

    return {
      text,
      steps: [
        ok(
          'Read the document',
          `${text.length.toLocaleString()} characters, separated by ${separator}`,
        ),
        ok(
          'First words',
          text.trim().slice(0, 60).replace(/\s+/g, ' ') || '(the document is empty)',
        ),
      ],
    }
  } catch (error) {
    return {
      text: '',
      steps: [bad('Read the document', describe(error))],
    }
  }
}

/**
 * Can we select the *n*th occurrence of a phrase, rather than the first?
 *
 * The server counts occurrences with a substring scan and tells the panel
 * « this is the 3rd ». Word finds text by searching and hands back every
 * match. If the two counts disagree, the reader clicks « Go to », Word
 * selects a real occurrence of the right words, and the check looks like
 * noise. So this plants a phrase it controls exactly, asks for a specific
 * one, and reads back what got selected.
 */
export async function occurrence(): Promise<Step[]> {
  try {
    return await Word.run(async (context) => {
      const matches = context.document.body.search(MARKER, {
        matchCase: true,
        matchWholeWord: false,
      })
      matches.load('items/text')
      await context.sync()

      if (matches.items.length !== REPEATS) {
        return [
          bad(
            'Count the matches',
            `found ${matches.items.length} of the ${REPEATS} planted — Word's search does not agree with the text that was inserted`,
          ),
        ]
      }

      // « Zorbex » on its own cannot tell you *which* Zorbex was selected,
      // so the answer comes from asking Word where the two ranges sit
      // relative to each other. The sandbox numbers every repeat, which
      // makes « Zorbex 3 » a phrase with exactly one home in the document.
      const target = matches.items[WANTED - 1]
      const truth = context.document.body.search(`${MARKER} ${WANTED}`, {
        matchCase: true,
      })
      truth.load('items')
      await context.sync()

      if (truth.items.length !== 1) {
        return [
          bad(
            `Select match ${WANTED}`,
            `the sandbox marker "${MARKER} ${WANTED}" was found ${truth.items.length} times, so this test cannot tell right from wrong`,
          ),
        ]
      }

      const relation = target.compareLocationWith(truth.items[0])
      target.select(Word.SelectionMode.select)
      await context.sync()

      // The nth « Zorbex » should be the opening of « Zorbex n », so the
      // two ranges share a start. Anything else means Word's search order
      // is not the server's counting order.
      // `insideStart` is the expected answer: the 6 characters of « Zorbex »
      // sit inside « Zorbex 3 » and share its start. `equal` would mean Word
      // returned the longer range for both searches, which is also right.
      const landed =
        relation.value === Word.LocationRelation.insideStart ||
        relation.value === Word.LocationRelation.equal ||
        relation.value === Word.LocationRelation.inside

      return [
        ok('Count the matches', `${matches.items.length} of ${REPEATS}, as planted`),
        {
          name: `Select match ${WANTED}`,
          outcome: landed ? ('pass' as const) : ('fail' as const),
          detail: landed
            ? `match ${WANTED} sits at "${MARKER} ${WANTED}" (relation "${relation.value}") — Word's order matches the server's`
            : `match ${WANTED} sits "${relation.value}" relative to "${MARKER} ${WANTED}" — Word's search order is not the server's counting order`,
        },
      ]
    })
  } catch (error) {
    return [bad('Select an occurrence', describe(error))]
  }
}

/**
 * Does Word actually turn change tracking on when told to?
 *
 * The add-in forces `trackAll`, reads it back, and refuses to write if it
 * did not take. That refusal is the single most important line of code in
 * the product: an untracked edit to a client's agreement is not noticed
 * until somebody compares versions, which is far too late. Whether the
 * write is honoured or silently ignored is documented one way and behaves
 * the other often enough that it has to be seen.
 */
export async function changeTracking(): Promise<{
  steps: Step[]
  prior: TrackingMode
}> {
  try {
    return await Word.run(async (context) => {
      const doc = context.document
      doc.load('changeTrackingMode')
      await context.sync()
      const prior = doc.changeTrackingMode

      doc.changeTrackingMode = Word.ChangeTrackingMode.trackAll
      await context.sync()

      doc.load('changeTrackingMode')
      await context.sync()
      const took = doc.changeTrackingMode === Word.ChangeTrackingMode.trackAll

      return {
        prior,
        steps: [
          {
            name: 'Turn on change tracking',
            outcome: took ? ('pass' as const) : ('fail' as const),
            detail: took
              ? `it took (was "${prior}", now "${doc.changeTrackingMode}")`
              : `asked for trackAll and the document is still "${doc.changeTrackingMode}" — the refusal is silent, which is why the code reads it back`,
          },
        ],
      }
    })
  } catch (error) {
    return {
      prior: Word.ChangeTrackingMode.off,
      steps: [bad('Turn on change tracking', describe(error))],
    }
  }
}

/** Replace a word inside the sandbox and confirm it landed as a revision. */
export async function trackedEdit(): Promise<Step[]> {
  try {
    return await Word.run(async (context) => {
      const matches = context.document.body.search(`${MARKER} 1`, { matchCase: true })
      matches.load('items')
      await context.sync()
      if (matches.items.length === 0) {
        return [bad('Make a tracked edit', 'the sandbox paragraph was not found')]
      }

      matches.items[0].insertText(`${MARKER} one`, Word.InsertLocation.replace)
      await context.sync()

      const changes = context.document.body.getTrackedChanges()
      changes.load('items/text,items/type,items/author')
      await context.sync()

      const mine = changes.items.filter((change) => change.text.includes(MARKER))
      if (mine.length === 0) {
        return [
          bad(
            'Make a tracked edit',
            'the edit was written but Word recorded no revision for it — it went in untracked',
          ),
        ]
      }
      const kinds = [...new Set(mine.map((change) => change.type))].join(' + ')
      return [
        ok(
          'Make a tracked edit',
          `${mine.length} revision${mine.length === 1 ? '' : 's'} recorded (${kinds}), author "${mine[0].author}"`,
        ),
      ]
    })
  } catch (error) {
    return [bad('Make a tracked edit', describe(error))]
  }
}

/**
 * Write into the document's hidden metadata and read it back.
 *
 * This is where a reader's dismissed findings live, so that they survive the
 * file being closed, emailed to a colleague and opened somewhere else. If
 * custom XML parts do not work in this host, the Ignored bucket has no home
 * and has to move to the pane's own storage, where it evaporates.
 */
export async function customXml(): Promise<Step[]> {
  const namespace = 'urn:claidor:selftest:1'
  try {
    return await Word.run(async (context) => {
      const doc = context.document
      doc.customXmlParts.add(`<t xmlns="${namespace}" v="1">hello</t>`)
      await context.sync()

      const parts = doc.customXmlParts.getByNamespace(namespace)
      parts.load('items')
      await context.sync()

      if (parts.items.length === 0) {
        return [bad('Hidden metadata', 'written, but nothing came back when read')]
      }

      const xml = parts.items[0].getXml()
      await context.sync()
      const survived = xml.value.includes('hello')

      for (const part of parts.items) part.delete()
      await context.sync()

      return [
        {
          name: 'Hidden metadata',
          outcome: survived ? ('pass' as const) : ('fail' as const),
          detail: survived
            ? 'written, read back and removed — dismissals can live in the document'
            : `read back as "${xml.value}", which is not what was written`,
        },
      ]
    })
  } catch (error) {
    return [bad('Hidden metadata', describe(error))]
  }
}

/** Append the paragraph everything that writes is confined to. */
export async function openSandbox(): Promise<Step[]> {
  const line = `CLAIDOR SELF-TEST — ${Array.from(
    { length: REPEATS },
    (_, i) => `${MARKER} ${i + 1}`,
  ).join(', ')}. This paragraph is removed when the test ends.`

  try {
    await Word.run(async (context) => {
      context.document.body.insertParagraph(line, Word.InsertLocation.end)
      await context.sync()
    })
    return [ok('Add a scratch paragraph', `${REPEATS} markers added at the end`)]
  } catch (error) {
    return [bad('Add a scratch paragraph', describe(error))]
  }
}

/**
 * Take the scratch paragraph out and put change tracking back.
 *
 * Deleting a paragraph while tracking is on would leave the deletion itself
 * as a revision, so tracking goes off first and back to `prior` after. This
 * runs whatever happened above, which is why it swallows its own failures
 * rather than reporting them as test results: a cleanup that throws would
 * otherwise read as a product defect.
 */
export async function closeSandbox(
  prior: TrackingMode,
): Promise<Step[]> {
  try {
    return await Word.run(async (context) => {
      const doc = context.document
      doc.changeTrackingMode = Word.ChangeTrackingMode.off
      await context.sync()

      const paragraphs = doc.body.paragraphs
      paragraphs.load('items/text')
      await context.sync()

      let removed = 0
      for (const paragraph of paragraphs.items) {
        if (paragraph.text.includes('CLAIDOR SELF-TEST')) {
          paragraph.delete()
          removed += 1
        }
      }
      await context.sync()

      doc.changeTrackingMode = prior
      await context.sync()

      return [
        {
          name: 'Clean up',
          outcome: removed > 0 ? ('pass' as const) : ('fail' as const),
          detail:
            removed > 0
              ? `scratch paragraph removed, change tracking back to "${prior}"`
              : `could not find the scratch paragraph to remove — please delete the line starting "CLAIDOR SELF-TEST" by hand`,
        },
      ]
    })
  } catch (error) {
    return [
      bad(
        'Clean up',
        `${describe(error)} — please delete the line starting "CLAIDOR SELF-TEST" by hand`,
      ),
    ]
  }
}

/** Every step, in the order that finds problems earliest. */
export async function runAll(
  report: (step: Step) => void,
): Promise<void> {
  for (const step of capabilities()) report(step)

  const read = await readDocument()
  for (const step of read.steps) report(step)

  for (const step of await openSandbox()) report(step)

  const tracking = await changeTracking()
  for (const step of tracking.steps) report(step)

  for (const step of await occurrence()) report(step)
  for (const step of await trackedEdit()) report(step)
  for (const step of await customXml()) report(step)
  for (const step of await closeSandbox(tracking.prior)) report(step)
}
