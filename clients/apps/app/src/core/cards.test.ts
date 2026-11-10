// The waiting cards as the core reads them: the approval card's words
// against the shipped window's own functions (SimeonCore's `ApprovalTests`,
// fixtures/approvals.json copied from the core), and the question and draft
// cards (`CoreTests`).

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  addingAllowRule,
  approvalBadge,
  approvalLocation,
  approvalTitle,
  attachmentNames,
  autoReviewJSON,
  clip,
  draftCard,
  isOpenQuestion,
  proposedRule,
  questionAnswers,
  questionCard,
  questionsReply,
  redact,
  settledNote,
  shownAnswer,
  summaryLine,
  summarySaysNothing,
} from './cards'
import { Entry } from './entry'
import type { JSONObject, JSONValue } from './json'

const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/approvals.json', import.meta.url), 'utf8'),
) as { autoReview: JSONObject }
const autoReview = fixture.autoReview as Record<string, JSONValue>
const record = (value: JSONValue) => value as Record<string, JSONValue>

function entry(json: JSONObject): Entry {
  const made = Entry.from(json)
  if (!made) throw new Error('no entry')
  return made
}

describe('the approval card', () => {
  it('has the window’s titles and says where it runs', () => {
    for (const [surface, row] of Object.entries(record(autoReview.titles!))) {
      const key = surface === 'undefined' ? undefined : surface
      const heading = approvalTitle(key)
      expect(heading.title, surface).toBe(record(row).title)
      expect(heading.subject, surface).toBe(record(row).subject)
      expect(approvalLocation(key) ?? null, surface).toBe(
        record(row).location ?? null,
      )
    }
  })

  it('has the window’s badges', () => {
    for (const [status, row] of Object.entries(record(autoReview.badges!))) {
      const badge = approvalBadge(status)
      // Waiting has no badge: the window's row for it is null.
      const shipped = row == null ? undefined : record(row)
      expect(badge?.kind ?? null, status).toBe(shipped?.kind ?? null)
      expect(badge?.label ?? null, status).toBe(shipped?.label ?? null)
    }
  })

  it('takes out what the window takes out', () => {
    for (const row of autoReview.redact as JSONObject[])
      expect(redact(String(row.in))).toBe(row.out)
    for (const row of autoReview.proposedRule as JSONObject[])
      expect(proposedRule((row.in as string | null) ?? undefined) ?? null).toBe(
        row.out ?? null,
      )
  })

  it('says the summary only when it says more, and the note under Always allow', () => {
    for (const row of autoReview.summaryHidden as JSONObject[])
      expect(summarySaysNothing(String(row.summary))).toBe(
        row.hiddenWhenCommandPresent,
      )
    const notes = autoReview.settledNote as string[]
    expect(settledNote('always')).toBe(notes[0])
    expect(settledNote('always', 'Allow npm test')).toBe(notes[1])
    expect(settledNote('approved', 'x')).toBeUndefined()
  })

  it('folds a long command at 340 characters', () => {
    expect(clip('a'.repeat(340))).toBe('a'.repeat(340))
    expect(clip('a'.repeat(341)).endsWith('aaaaa...[1 chars omitted]...')).toBe(
      true,
    )
    expect(clip('x'.repeat(400)).slice(330)).toBe(
      record(autoReview.cards!).longCommand,
    )
  })

  it('draws each card the window drew', () => {
    const cases: [
      string,
      string | undefined,
      string,
      string | undefined,
      string,
    ][] = [
      [
        'hostShellPending',
        'host_shell',
        'List the files in Downloads on your local computer',
        'ls -la ~/Downloads',
        'pending',
      ],
      [
        'hostShellGenericSummary',
        'host_shell',
        'Run a command on your local computer',
        'rm -rf build',
        'pending',
      ],
      ['mcpPending', 'mcp', 'Send an email with Gmail', undefined, 'pending'],
      [
        'subagentPending',
        'subagent',
        "Run a task on Simeon's computer: “x”",
        undefined,
        'pending',
      ],
      [
        'computerPending',
        'computer',
        'Click “Buy” on shop.example in the box browser',
        undefined,
        'pending',
      ],
      ['alwaysWithRule', 'box_shell', 'Run npm test', 'npm test', 'always'],
      ['expired', 'mcp', 's', undefined, 'expired'],
    ]
    const cards = record(autoReview.cards!)
    for (const [name, surface, summary, command, status] of cases) {
      const shipped = record(cards[name]!)
      expect(approvalTitle(surface).title, name).toBe(shipped.title)
      expect(approvalLocation(surface) ?? null, name).toBe(
        shipped.location ?? null,
      )
      expect(summaryLine(summary, command) ?? null, name).toBe(
        shipped.summaryLine ?? null,
      )
      expect(`Show the ${approvalTitle(surface).subject}`, name).toBe(
        record(shipped.disclosure!).button,
      )
      expect(command ?? summary, name).toBe(record(shipped.disclosure!).text)
      expect(approvalBadge(status)?.label ?? 'Approval needed', name).toBe(
        record(shipped.badge!).label,
      )
    }
    expect(settledNote('always', proposedRule('Allow running npm test'))).toBe(
      record(cards.alwaysWithRule!).settledNote,
    )
  })

  it('adds Always allow’s rule as the window does', () => {
    const always = record(autoReview.alwaysAllow!)
    const one = { isEnabled: true, allow: ['a'], ask: [] }
    expect(
      autoReviewJSON(addingAllowRule(one, 'Allow running npm test')),
    ).toEqual(record(always.withRule!).written)
    expect(autoReviewJSON(addingAllowRule(one, 'a'))).toEqual(
      record(always.duplicateRule!).written,
    )
    const full = {
      isEnabled: true,
      allow: Array.from({ length: 20 }, (_, i) => `r${i}`),
      ask: [],
    }
    expect(addingAllowRule(full, 'new').allow).toEqual(always.fullList)
    expect(
      addingAllowRule(
        { isEnabled: true, allow: [], ask: [] },
        'z'.repeat(1_200),
      ).allow[0],
    ).toHaveLength(1_000)
  })
})

describe('the question and draft cards', () => {
  it('reads a question, its answer, each option’s reply and style, several at once', () => {
    const answered = questionCard(
      entry({
        kind: 'send-message',
        id: 'q',
        message: {
          type: 'widget',
          widget: {
            prompt: 'What first?',
            options: [{ label: 'Inbox' }, { label: 'Calendar' }],
            allowCustom: true,
          },
        },
        respondedValue: 'Inbox',
      }),
    )!
    expect(answered.options.map((option) => option.label)).toEqual([
      'Inbox',
      'Calendar',
    ])
    expect(answered.answer).toBe('Inbox')
    expect(isOpenQuestion(answered)).toBe(false)

    const several = questionCard(
      entry({
        kind: 'send-message',
        id: 'q',
        message: {
          type: 'widget',
          widget: {
            prompt: 'Which ones?',
            multiSelect: true,
            options: [
              { label: 'Refund', value: 'Yes, refund it', style: 'primary' },
              { label: 'Delete', style: 'danger' },
              { label: 'Keep' },
            ],
          },
        },
        respondedValue: 'Yes, refund it\nDelete',
      }),
    )!
    expect(several.multiSelect).toBe(true)
    expect(several.options.map((option) => option.value)).toEqual([
      'Yes, refund it',
      'Delete',
      'Keep',
    ])
    expect(several.options.map((option) => option.style)).toEqual([
      'primary',
      'danger',
      'default',
    ])
    expect(shownAnswer(several, several.answer!)).toBe('Refund, Delete')
    expect(shownAnswer(several, 'my own words')).toBe('my own words')
  })

  it('reads a card of several questions and writes their reply a line each, as the engine reads it', () => {
    const card = questionCard(
      entry({
        kind: 'send-message',
        id: 'q',
        message: {
          type: 'widget',
          widget: {
            prompt: 'Which city is she in?',
            options: [{ label: 'Toronto' }, { label: 'Montreal' }],
            allowCustom: true,
            questions: [
              {
                prompt: 'Which city is she in?',
                options: [{ label: 'Toronto' }, { label: 'Montreal' }],
                allowCustom: true,
              },
              {
                prompt: 'Budget?',
                options: [
                  { label: 'Under $75 CAD', value: 'Under $75' },
                  { label: '$75–$125 CAD' },
                ],
              },
              {
                prompt: "What's the occasion",
                options: [{ label: 'Birthday' }, { label: 'Just because' }],
                multiSelect: true,
              },
            ],
          },
        },
      }),
    )!
    expect(card.questions.map((question) => question.prompt)).toEqual([
      'Which city is she in?',
      'Budget?',
      "What's the occasion",
    ])
    expect(card.questions[0]!.allowsOwnAnswer).toBe(true)
    expect(card.questions[2]!.multiSelect).toBe(true)
    const reply = questionsReply(card, [
      'Toronto',
      undefined,
      'Birthday\nJust because',
    ])!
    expect(reply).toBe(
      "Which city is she in? Toronto\nBudget? (skipped)\nWhat's the occasion: Birthday, Just because",
    )
    expect(questionAnswers(card, reply)).toEqual([
      'Toronto',
      undefined,
      'Birthday, Just because',
    ])
    expect(
      questionAnswers(card, questionsReply(card, [undefined, 'Under $75'])!),
    ).toEqual([undefined, 'Under $75 CAD', undefined])
    expect(questionsReply(card, [undefined, ' '])).toBeUndefined()
    // An older app answers the card's own question only.
    expect(questionAnswers(card, 'Toronto')).toEqual([
      'Toronto',
      undefined,
      undefined,
    ])
    // A card of one: its answer as it is.
    const one = questionCard(
      entry({
        kind: 'send-message',
        id: 'one',
        message: {
          type: 'widget',
          widget: {
            prompt: 'Send it?',
            options: [{ label: 'Yes', value: 'Yes, send it' }],
          },
        },
      }),
    )!
    expect(one.questions).toHaveLength(1)
    expect(questionsReply(one, ['Yes, send it'])).toBe('Yes, send it')
    expect(questionAnswers(one, 'Yes, send it')).toEqual(['Yes'])
  })

  it('knows a reply from a new email, and names its files', () => {
    const reply = draftCard(
      entry({
        kind: 'send-message',
        id: 'r',
        message: {
          type: 'email-draft',
          draft: {
            to: ['sam@example.com'],
            cc: ['startups@example.com'],
            subject: 'Re: Your application',
            body: 'Hello',
            via: 'outlook',
            replyTo: { messageId: 'AAMk' },
            attachments: ['/home/user/attachments/Certificate.pdf'],
          },
        },
      }),
    )!
    const fresh = draftCard(
      entry({
        kind: 'send-message',
        id: 'n',
        message: {
          type: 'email-draft',
          draft: { to: ['sam@example.com'], subject: 'Friday', body: 'Hi' },
        },
      }),
    )!
    expect(reply.isReply).toBe(true)
    expect(reply.cc).toEqual(['startups@example.com'])
    expect(attachmentNames(reply)).toEqual(['Certificate.pdf'])
    expect(fresh.isReply).toBe(false)
    expect(fresh.attachments).toEqual([])
  })
})
