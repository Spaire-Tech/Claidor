// The cards an agent sends into the chat (mac/Simeon/Cards.swift), copied
// from the Electron window's: as wide as a message may be, grey like an
// agent's bubble, 16 round, padded 12. This part: the frame, the status
// pill and the two buttons, and the three cards that wait on the person
// most: a question, an email or Slack message drafted, and an auto-review
// approval.

import { useEffect, useRef, useState } from 'react'
import {
  type ApprovalCard,
  type DraftCard,
  type QuestionCard,
  addresses,
  approvalBadge,
  approvalLocation,
  approvalTitle,
  attachmentNames,
  clip,
  draftStatus,
  proposedRule,
  questionAnswers,
  questionsReply,
  settledNote,
  summaryLine,
} from '../core/cards'
import type { Entry } from '../core/entry'
import { brandLogos } from '../core/generatedBrands'
import type { JSONValue } from '../core/json'
import type { AppStore } from '../core/store'
import { t } from '../l10n'
import { CodeBlock } from './MessageText'
import { classes } from './classes'

/** What every card is given: its line, the chat it is in, the store, the messages' column, and a way to another agent's chat. */
export interface CardProps {
  entry: Entry
  entryId: string
  agentId: string
  store: AppStore
  /** The messages' column: the chat's width less its 16 on each side. */
  column: number
  openAgent: (agentId: string) => void
}

/** A card's widest (`max-width: min(88%, cap, 100% - 82px)`). */
export function cardWidth(column: number, cap: number): number {
  return Math.max(0, Math.min(column * 0.88, cap, column - 82))
}

/** The card's frame: the agent's grey, 16 round, padded 12, its parts 10 apart. */
export function CardShell({
  children,
  label,
  className,
}: {
  children: React.ReactNode
  label?: string
  className?: string
}) {
  return (
    <div
      className={classes('card-shell', className)}
      role={label ? 'group' : undefined}
      aria-label={label}
    >
      {children}
    </div>
  )
}

/** A card's state in a small grey pill with a dot: "Ready to send", "Sent", "Dismissed". */
export function StatusPill({
  words,
  dot,
  large = false,
}: {
  words: string
  /** The dot's colour, when not the grey. */
  dot?: 'green'
  large?: boolean
}) {
  return (
    <span className={classes('status-pill', large && 'large')} role="status">
      <span className={classes('status-dot', dot)} />
      {words}
    </span>
  )
}

/** A card's button: a pill 32 high, grey, or our blue for the main one (`prominent`). */
export function CardButton({
  title,
  prominent = false,
  tone,
  help,
  disabled,
  onClick,
}: {
  title: string
  /** The card's main action: a pill in our blue. */
  prominent?: boolean
  /** `danger`: a grey pill in red words; `money`: the blue pill, kept for paying. */
  tone?: 'danger' | 'money'
  /** What it does, under the pointer. */
  help?: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={classes('card-button', prominent && 'prominent', tone)}
      title={help}
      disabled={disabled}
      onClick={onClick}
    >
      {title}
    </button>
  )
}

function Tick() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M3 8.5 6.5 12l6.5-8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// MARK: Questions

/**
 * A question card (10 November 2026, the founder's reference: "change our
 * card style to this. but keep the round check and our blue color"): the
 * question in bold; each choice with its letter on a small tile (A, B, C…)
 * that becomes our blue round check once picked; "Something else" last when
 * the agent allows the person's own words. A card may ask several questions
 * ("have the thing swipe when there's many questions"): one at a time,
 * sliding to the next, dots at the foot, Back, Skip and Next (Send on the
 * last); the answers go together, a line each (`questionsReply`). A pick
 * moves on by itself, and on the last question sends; Skip on a card of one
 * declines it. Answered: each question in grey with its answer after a thin
 * blue tick, as before the new style (11 November 2026, the founder), Back
 * and Next to look through several (Mac's `QuestionCardView`).
 */
export function QuestionCardView({
  entryId,
  agentId,
  card,
  store,
}: {
  entryId: string
  agentId: string
  card: QuestionCard
  store: AppStore
}) {
  const pending = store.pendingAnswers[entryId]
  if (card.isDismissed || card.isSkipped || pending === '')
    return (
      <div className="qcard">
        <div className="qcard-head">
          <div className="qcard-prompt quiet">{card.prompt}</div>
        </div>
        <div className="qcard-dismissed">
          <StatusPill words={t('Dismissed')} />
        </div>
      </div>
    )
  const answer = card.answer ?? pending
  if (answer != null)
    return <AnsweredQuestions key={answer} card={card} answer={answer} />
  return (
    <AskingQuestions
      entryId={entryId}
      agentId={agentId}
      card={card}
      store={store}
    />
  )
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const letter = (place: number) =>
  LETTERS[Math.max(0, Math.min(place, LETTERS.length - 1))]!

type Picks = Record<number, number[]>
type Words = Record<number, string>

/** The answer given to one question: the options picked (one per line), else, or with them for several, the words typed. */
function answerOf(
  card: QuestionCard,
  at: number,
  picks: Picks,
  own: Words,
): string | undefined {
  const question = card.questions[at]
  if (!question) return undefined
  const words = (own[at] ?? '').trim()
  const chosen = [...(picks[at] ?? [])]
    .sort((a, b) => a - b)
    .map((place) => question.options[place]?.value)
    .filter((value): value is string => value != null)
  const all = question.multiSelect
    ? [...chosen, ...(words ? [words] : [])]
    : words
      ? [words]
      : chosen
  return all.length > 0 ? all.join('\n') : undefined
}

function AskingQuestions({
  entryId,
  agentId,
  card,
  store,
}: {
  entryId: string
  agentId: string
  card: QuestionCard
  store: AppStore
}) {
  const questions = card.questions
  const [index, setIndex] = useState(0)
  const [forward, setForward] = useState(true)
  const [picks, setPicks] = useState<Picks>({})
  const [own, setOwn] = useState<Words>({})
  const [writing, setWriting] = useState<number | null>(null)
  const [sending, setSending] = useState(false)
  const at = useRef(0)
  useEffect(() => {
    at.current = index
  }, [index])
  const isLast = index >= questions.length - 1

  const move = (target: number) => {
    if (target < 0 || target >= questions.length || target === index) return
    setForward(target > index)
    setWriting(null)
    setIndex(target)
  }
  const send = (nowPicks: Picks, nowOwn: Words) => {
    setSending(true)
    const reply = questionsReply(
      card,
      questions.map((_, place) => answerOf(card, place, nowPicks, nowOwn)),
    )
    void (async () => {
      if (reply != null) await store.answer(reply, entryId, agentId)
      else await store.dismissQuestion(entryId, agentId)
      setSending(false)
    })()
  }
  const goOn = (from: number, nowPicks: Picks, nowOwn: Words) => {
    if (sending || answerOf(card, from, nowPicks, nowOwn) == null) return
    if (from >= questions.length - 1) send(nowPicks, nowOwn)
    else {
      setForward(true)
      setWriting(null)
      setIndex(from + 1)
    }
  }
  const choose = (place: number, question: number) => {
    if (sending) return
    if (questions[question]!.multiSelect) {
      const now = picks[question] ?? []
      setPicks({
        ...picks,
        [question]: now.includes(place)
          ? now.filter((one) => one !== place)
          : [...now, place],
      })
      return
    }
    const nowPicks = { ...picks, [question]: [place] }
    const nowOwn = { ...own, [question]: '' }
    setPicks(nowPicks)
    setOwn(nowOwn)
    setWriting(null)
    // A pick moves on by itself once its check has shown: to the next question, or, on the last, sends.
    window.setTimeout(() => {
      if (at.current === question) goOn(question, nowPicks, nowOwn)
    }, 220)
  }
  const skip = () => {
    if (sending) return
    const nowPicks = { ...picks, [index]: [] }
    const nowOwn = { ...own, [index]: '' }
    setPicks(nowPicks)
    setOwn(nowOwn)
    if (isLast) send(nowPicks, nowOwn)
    else move(index + 1)
  }
  const typed = (question: number, words: string) => {
    setOwn({ ...own, [question]: words })
    if (!questions[question]!.multiSelect && words !== '')
      setPicks({ ...picks, [question]: [] })
  }

  const page = (place: number, live: boolean) => {
    const question = questions[place]!
    const words = own[place] ?? ''
    const given = words.trim() !== ''
    const open = writing === place || words !== ''
    return (
      <div
        key={live ? `live-${place}` : `shadow-${place}`}
        className={classes(
          'qcard-page',
          live ? (forward ? 'slide-forward' : 'slide-back') : 'shadow',
        )}
        aria-hidden={live ? undefined : true}
      >
        <div className="qcard-head">
          <div className="qcard-prompt">{question.prompt}</div>
          {question.help && <div className="qcard-help">{question.help}</div>}
        </div>
        <div
          className="qcard-options"
          role="group"
          aria-label={question.prompt}
        >
          {question.options.map((option, choice) => {
            const picked = (picks[place] ?? []).includes(choice)
            return (
              <button
                key={choice}
                type="button"
                tabIndex={live ? undefined : -1}
                className={classes('qcard-option', picked && 'picked')}
                aria-pressed={picked}
                onClick={() => choose(choice, place)}
              >
                <QuestionTile letter={letter(choice)} picked={picked} />
                <span className="option-words">
                  <span className={classes('option-label', option.style)}>
                    {option.label}
                  </span>
                  {option.description && (
                    <span className="option-line">{option.description}</span>
                  )}
                </span>
              </button>
            )
          })}
          {question.allowsOwnAnswer &&
            (open ? (
              <div
                className={classes('qcard-option', 'own', given && 'picked')}
              >
                <QuestionTile
                  letter={letter(question.options.length)}
                  picked={given}
                />
                <GrowingField
                  className="qcard-own-field"
                  value={words}
                  onChange={(value) => typed(place, value)}
                  placeholder={t('Something else')}
                  label={t('Your own answer')}
                  maxLines={4}
                  lineHeight={22}
                  onReturn={() => goOn(place, picks, own)}
                  disabled={!live}
                  focusOnOpen={live}
                />
              </div>
            ) : (
              <button
                type="button"
                tabIndex={live ? undefined : -1}
                className="qcard-option own"
                onClick={() => setWriting(place)}
              >
                <QuestionTile
                  letter={letter(question.options.length)}
                  picked={false}
                />
                <span className="qcard-else">{t('Something else')}</span>
              </button>
            ))}
        </div>
      </div>
    )
  }

  return (
    <div className="qcard" role="group" aria-label={card.prompt}>
      <div className="qcard-pages">
        {questions.map((_, place) => page(place, false))}
        {page(index, true)}
      </div>
      <div className="qcard-foot">
        {questions.length > 1 && (
          <QuestionDots count={questions.length} at={index} />
        )}
        <span className="qcard-gap" />
        {index > 0 && (
          <button
            type="button"
            className="qcard-pill"
            onClick={() => move(index - 1)}
          >
            {t('Back')}
          </button>
        )}
        <button
          type="button"
          className="qcard-pill"
          title={
            questions.length > 1
              ? t('Skip this question')
              : t('Dismiss without answering')
          }
          onClick={skip}
        >
          {t('Skip')}
        </button>
        <button
          type="button"
          className="qcard-pill prominent"
          disabled={answerOf(card, index, picks, own) == null || sending}
          onClick={() => goOn(index, picks, own)}
        >
          {isLast ? t('Send') : t('Next')}
        </button>
      </div>
    </div>
  )
}

function AnsweredQuestions({
  card,
  answer,
}: {
  card: QuestionCard
  answer: string
}) {
  const [index, setIndex] = useState(0)
  const [forward, setForward] = useState(true)
  const answers = questionAnswers(card, answer)
  const several = card.questions.length > 1
  const move = (target: number) => {
    if (target < 0 || target >= card.questions.length) return
    setForward(target > index)
    setIndex(target)
  }
  const page = (place: number, live: boolean) => {
    const given = answers[place]
    return (
      <div
        key={live ? `live-${place}` : `shadow-${place}`}
        className={classes(
          'qcard-page',
          live ? (forward ? 'slide-forward' : 'slide-back') : 'shadow',
        )}
        aria-hidden={live ? undefined : true}
      >
        <div className="qcard-head">
          <div className="qcard-prompt quiet">
            {card.questions[place]!.prompt}
          </div>
        </div>
        {given != null ? (
          <div className="qcard-answer" aria-label={t`Your answer: ${given}`}>
            <span className="qcard-check">
              <Tick />
            </span>
            <span>{given}</span>
          </div>
        ) : (
          <div className="qcard-answer skipped">{t('Skipped')}</div>
        )}
      </div>
    )
  }
  return (
    <div className="qcard">
      <div className="qcard-pages">
        {card.questions.map((_, place) => page(place, false))}
        {page(index, true)}
      </div>
      {several && (
        <div className="qcard-foot">
          <QuestionDots count={card.questions.length} at={index} />
          <span className="qcard-gap" />
          <button
            type="button"
            className="qcard-pill"
            disabled={index === 0}
            onClick={() => move(index - 1)}
          >
            {t('Back')}
          </button>
          <button
            type="button"
            className="qcard-pill"
            disabled={index >= card.questions.length - 1}
            onClick={() => move(index + 1)}
          >
            {t('Next')}
          </button>
        </div>
      )}
    </div>
  )
}

/** A choice's letter on a small tile, or our blue round check once picked. */
function QuestionTile({ letter, picked }: { letter: string; picked: boolean }) {
  return (
    <span className={classes('qcard-tile', picked && 'picked')} aria-hidden>
      {picked ? <Tick /> : letter}
    </span>
  )
}

/** Where the person is among a card's questions. */
function QuestionDots({ count, at }: { count: number; at: number }) {
  return (
    <span
      className="qcard-dots"
      role="img"
      aria-label={t`Question ${at + 1} of ${count}`}
    >
      {Array.from({ length: count }, (_, place) => (
        <span
          key={place}
          className={classes('qcard-dot', place === at && 'on')}
        />
      ))}
    </span>
  )
}

/** A field that grows with its words, one line to `maxLines`, then scrolls. Return does `onReturn` when given (Shift-Return a new line). */
export function GrowingField({
  value,
  onChange,
  placeholder,
  label,
  maxLines,
  minLines = 1,
  lineHeight = 20,
  onReturn,
  disabled,
  className,
  id,
  focusOnOpen,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  label: string
  maxLines: number
  minLines?: number
  lineHeight?: number
  onReturn?: () => void
  disabled?: boolean
  className?: string
  /** For a `<label htmlFor>` naming the field. */
  id?: string
  /** Takes the typing as it appears (a question's "Something else", opened by a click). */
  focusOnOpen?: boolean
}) {
  const field = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (focusOnOpen) field.current?.focus()
  }, [focusOnOpen])
  useEffect(() => {
    const box = field.current
    if (!box) return
    const style = getComputedStyle(box)
    const padding =
      parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
    const border =
      parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth)
    // At no height, the field's scroll height is its words' and its padding.
    box.style.height = '0px'
    const words = box.scrollHeight - padding
    const lines = Math.max(
      minLines,
      Math.min(maxLines, Math.ceil(words / lineHeight - 0.05)),
    )
    box.style.height = `${lines * lineHeight + padding + border}px`
    box.style.overflowY = words > maxLines * lineHeight + 1 ? 'auto' : 'hidden'
  }, [value, maxLines, minLines, lineHeight])
  return (
    <textarea
      ref={field}
      id={id}
      className={classes('growing-field', className)}
      value={value}
      rows={minLines}
      placeholder={placeholder}
      aria-label={label}
      disabled={disabled}
      spellCheck
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (
          onReturn &&
          event.key === 'Enter' &&
          !event.shiftKey &&
          !event.nativeEvent.isComposing
        ) {
          event.preventDefault()
          onReturn()
        }
      }}
    />
  )
}

// MARK: Drafts

/**
 * An email or a Slack message the agent drafted: "New email" (or "Reply")
 * or Slack's logo and "Slack message" with its state in a pill; the fields
 * on the ground, 10 round, one per line with a hairline under it; the To,
 * Cc and Subject of an email and the words of either can be changed before
 * sending. Send email or Send message in the blue, Discard plain.
 */
export function DraftCardView({
  entryId,
  agentId,
  card,
  store,
}: {
  entryId: string
  agentId: string
  card: DraftCard
  store: AppStore
}) {
  const [to, setTo] = useState(card.to.join(', '))
  const [cc, setCc] = useState(card.cc.join(', '))
  const [subject, setSubject] = useState(card.subject)
  const [words, setWords] = useState(card.body)
  const editable = card.state === 'editable' && !card.isDismissed
  const email = card.kind === 'email'
  const send = () => {
    const draft: Record<string, JSONValue> = { body: words }
    if (email) {
      draft.from = card.from
      draft.to = addresses(to)
      draft.cc = addresses(cc)
      draft.subject = subject
    } else {
      draft.workspace = card.workspace
      draft.target = card.target
      if (card.thread !== '') draft.thread = card.thread
    }
    void store.sendDraft(entryId, agentId, draft)
  }
  const value = (words: string) => <span className="draft-value">{words}</span>
  const input = (
    current: string,
    set: (value: string) => void,
    label: string,
    placeholder: string,
  ) => (
    <input
      className="draft-input"
      value={current}
      placeholder={placeholder}
      aria-label={label}
      disabled={!editable}
      onChange={(event) => set(event.target.value)}
    />
  )
  const line = (name: string, content: React.ReactNode) => (
    <div className="draft-field">
      <span className="draft-name">{name}</span>
      {content}
    </div>
  )
  const slackLogo = brandLogos.slack
  return (
    <CardShell>
      <div className="draft-head">
        <span className="draft-title">
          {!email && slackLogo && (
            <img className="draft-logo" src={slackLogo} alt="" />
          )}
          {email
            ? card.isReply
              ? t('Reply')
              : t('New email')
            : t('Slack message')}
        </span>
        <StatusPill
          words={draftStatus(card)}
          dot={card.state === 'sent' ? 'green' : undefined}
        />
      </div>
      <div className="draft-box">
        {email ? (
          <>
            {line(t('From'), value(card.from))}
            {line(t('To'), input(to, setTo, t('To'), t('name@example.com')))}
            {line(t('Cc'), input(cc, setCc, t('Cc'), ''))}
            {line(
              t('Subject'),
              input(subject, setSubject, t('Subject'), t('Subject')),
            )}
          </>
        ) : (
          <>
            {line(t('Workspace'), value(card.workspace))}
            {line(t('To'), value(card.target))}
            {line(
              t('Thread'),
              value(card.thread === '' ? t('New message') : card.thread),
            )}
          </>
        )}
        <GrowingField
          className="draft-words"
          value={words}
          onChange={setWords}
          placeholder={t('Write a message')}
          label={t('Message')}
          minLines={3}
          maxLines={12}
          lineHeight={22}
          disabled={!editable}
        />
        {attachmentNames(card).map((name, index) => (
          <div key={index} className="draft-file">
            <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
              <path
                d="M10.5 4.5 5.6 9.4a1.6 1.6 0 0 0 2.3 2.3l5-5a3 3 0 0 0-4.3-4.3l-5 5a4.4 4.4 0 0 0 6.2 6.2l4.2-4.2"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
            </svg>
            <span>{name}</span>
          </div>
        ))}
      </div>
      {editable && (
        <div className="card-buttons">
          <CardButton
            title={t('Discard')}
            onClick={() => void store.discardDraft(entryId, agentId)}
          />
          <CardButton
            title={email ? t('Send email') : t('Send message')}
            prominent
            onClick={send}
          />
        </div>
      )}
    </CardShell>
  )
}

// MARK: Approvals

/** "Approval needed" in the blue, with a raised hand. */
export function ApprovalNeededBadge() {
  return (
    <span className="approval-needed">
      <svg width="10" height="12" viewBox="0 0 12 14" aria-hidden="true">
        <path
          fill="currentColor"
          d="M4 1.2c.5 0 .9.4.9.9v4.4h.4V1c0-.5.4-.9.9-.9s.9.4.9.9v5.5h.4V1.8c0-.5.4-.9.9-.9s.9.4.9.9v6.4l.5-1.1c.3-.5.9-.7 1.4-.4.4.2.6.8.4 1.2l-1.6 3.6C10 13 8.6 14 7 14H6c-2.2 0-3.9-1.8-3.9-3.9V3.3c0-.5.4-.9.9-.9s.9.4.9.9v3.3h.2V2.1c0-.5.4-.9.9-.9Z"
        />
      </svg>
      {t('Approval needed')}
    </span>
  )
}

/**
 * An auto-review approval (at most 520 wide), its parts 12 apart: what the
 * agent wants to do (14 on 22, 500) with "Approval needed" beside it, or
 * once answered its outcome with a dot; where it runs; what it does; while
 * it waits, why it was paused; "Show the command" or "Show the details",
 * which unfolds it (cut at 340 characters). Allow once in the blue, Always
 * allow (which adds the proposed rule to Auto-review) and Deny plain.
 */
export function ApprovalCardView({
  entryId,
  agentId,
  card,
  store,
}: {
  entryId: string
  agentId: string
  card: ApprovalCard
  store: AppStore
}) {
  const [unfolded, setUnfolded] = useState(false)
  const [answering, setAnswering] = useState(false)
  const settled = store.answeredApprovals[entryId] ?? card.status
  const heading = approvalTitle(card.surface)
  const place = approvalLocation(card.surface)
  const shown =
    card.command == null
      ? card.summary
      : summaryLine(card.summary, card.command)
  const folded =
    card.command ?? (card.summary === '' ? undefined : card.summary)
  const folds =
    folded != null && (heading.subject === 'command' || card.command != null)
  const badge = approvalBadge(settled)
  const note = settledNote(settled, proposedRule(card.proposedRule))
  const resolve = (resolution: string) => {
    setAnswering(true)
    void store
      .resolveApproval(
        card.requestId,
        resolution,
        card.proposedRule,
        entryId,
        agentId,
      )
      .finally(() => setAnswering(false))
  }
  const command = heading.subject === 'command'
  return (
    <div
      className="card-shell approval-card"
      role="group"
      aria-label={t('Auto-review approval')}
    >
      <div className="approval-words">
        <div className="approval-head">
          <span className="approval-title">{heading.title}</span>
          {settled === 'pending' ? (
            <ApprovalNeededBadge />
          ) : (
            badge && (
              <span className={classes('approval-badge', badge.kind)}>
                <span className="status-dot" />
                {badge.label}
              </span>
            )
          )}
        </div>
        {place && <div className="approval-place">{place}</div>}
        {shown && <div className="approval-summary">{shown}</div>}
        {settled === 'pending' && card.reason !== '' && (
          <div className="approval-reason">{card.reason}</div>
        )}
        {folds && (
          <>
            <button
              type="button"
              className="approval-fold"
              aria-expanded={unfolded}
              onClick={() => setUnfolded((now) => !now)}
            >
              <svg
                className={classes('fold-chevron', unfolded && 'open')}
                width="10"
                height="10"
                viewBox="0 0 16 16"
                aria-hidden="true"
              >
                <path
                  d="M6 3.5 10.5 8 6 12.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {unfolded
                ? command
                  ? t('Hide the command')
                  : t('Hide the details')
                : command
                  ? t('Show the command')
                  : t('Show the details')}
            </button>
            {unfolded && <CodeBlock words={clip(folded)} />}
          </>
        )}
        {note && <div className="approval-note">{note}</div>}
      </div>
      {settled === 'pending' && (
        <div className="card-buttons">
          <CardButton
            title={t('Deny')}
            tone="danger"
            disabled={answering}
            onClick={() => resolve('denied')}
          />
          <CardButton
            title={t('Always allow')}
            disabled={answering}
            onClick={() => resolve('always')}
          />
          <CardButton
            title={t('Allow once')}
            prominent
            disabled={answering}
            onClick={() => resolve('approved')}
          />
        </div>
      )}
    </div>
  )
}
