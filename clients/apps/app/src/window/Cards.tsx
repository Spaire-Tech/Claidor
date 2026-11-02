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
  settledNote,
  shownAnswer,
  summaryLine,
} from '../core/cards'
import { brandLogos } from '../core/generatedBrands'
import type { JSONValue } from '../core/json'
import type { AppStore } from '../core/store'
import { t } from '../l10n'
import { CodeBlock } from './MessageText'
import { classes } from './classes'

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

/** The window's two button kinds on a card: the blue one and the plain one (14, 32 high, 8 round). */
export function CardButton({
  title,
  prominent = false,
  disabled,
  onClick,
}: {
  title: string
  prominent?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={classes('card-button', prominent && 'prominent')}
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

function Cross() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M3.5 3.5l9 9M12.5 3.5l-9 9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}

// MARK: Questions

/**
 * A question (`sand-widget--choices`): the question (14 on 20, 500) and its
 * help under it (60%), the X that dismisses it; the choices in one box,
 * each with an empty ring, its label and its line under it, a hairline
 * between; then "Type your own answer" when the agent allows one, with
 * Submit once something is written. Answered, the question and the answer
 * with a blue tick; dismissed, the question at 60% and a "Dismissed" pill.
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
  const [own, setOwn] = useState('')
  const [picked, setPicked] = useState<number[]>([])
  const pending = store.pendingAnswers[entryId]
  if (card.isDismissed || card.isSkipped || pending === '')
    return (
      <CardShell>
        <div className="question-prompt quiet">{card.prompt}</div>
        <StatusPill words={t('Dismissed')} />
      </CardShell>
    )
  const answer = card.answer ?? pending
  if (answer != null)
    return (
      <CardShell>
        <div className="question-prompt">{card.prompt}</div>
        <div
          className="question-answer"
          aria-label={t`Your answer: ${shownAnswer(card, answer)}`}
        >
          <span className="answer-tick">
            <Tick />
          </span>
          <span>{shownAnswer(card, answer)}</span>
        </div>
      </CardShell>
    )
  const submitOwn = () => {
    const words = own.trim()
    if (words === '') return
    setOwn('')
    void store.answer(words, entryId, agentId)
  }
  return (
    <CardShell>
      <div className="question-head">
        <div className="question-words">
          <div className="question-prompt">{card.prompt}</div>
          {card.help && <div className="question-help">{card.help}</div>}
        </div>
        <button
          type="button"
          className="card-close"
          title={t('Dismiss without answering')}
          aria-label={t('Dismiss question')}
          onClick={() => void store.dismissQuestion(entryId, agentId)}
        >
          <Cross />
        </button>
      </div>
      {card.options.length > 0 && (
        <div className="question-options">
          {card.options.map((option, index) => {
            const chosen = picked.includes(index)
            return (
              <button
                key={index}
                type="button"
                className="question-option"
                aria-pressed={card.multiSelect ? chosen : undefined}
                onClick={() => {
                  if (card.multiSelect)
                    setPicked((now) =>
                      now.includes(index)
                        ? now.filter((one) => one !== index)
                        : [...now, index],
                    )
                  // Picking sends the option's own reply (`value`).
                  else void store.answer(option.value, entryId, agentId)
                }}
              >
                <span className={classes('option-ring', chosen && 'picked')}>
                  {chosen && <Tick />}
                </span>
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
        </div>
      )}
      {card.multiSelect && picked.length > 0 && (
        <div>
          <CardButton
            title={t('Submit')}
            prominent
            onClick={() =>
              void store.answer(
                [...picked]
                  .sort((a, b) => a - b)
                  .map((index) => card.options[index]!.value)
                  .join('\n'),
                entryId,
                agentId,
              )
            }
          />
        </div>
      )}
      {card.allowsOwnAnswer && (
        <div className="question-own">
          <GrowingField
            value={own}
            onChange={setOwn}
            placeholder={t('Type your own answer')}
            label={t('Custom answer')}
            maxLines={6}
            onReturn={submitOwn}
          />
          {own.trim() !== '' && (
            <CardButton title={t('Submit')} onClick={submitOwn} />
          )}
        </div>
      )}
    </CardShell>
  )
}

/** A field that grows with its words, one line to `maxLines`, then scrolls. Return does `onReturn` when given (Shift-Return a new line). */
function GrowingField({
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
}) {
  const field = useRef<HTMLTextAreaElement>(null)
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
            title={email ? t('Send email') : t('Send message')}
            prominent
            onClick={send}
          />
          <CardButton
            title={t('Discard')}
            onClick={() => void store.discardDraft(entryId, agentId)}
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
            title={t('Allow once')}
            prominent
            disabled={answering}
            onClick={() => resolve('approved')}
          />
          <CardButton
            title={t('Always allow')}
            disabled={answering}
            onClick={() => resolve('always')}
          />
          <CardButton
            title={t('Deny')}
            disabled={answering}
            onClick={() => resolve('denied')}
          />
        </div>
      )}
    </div>
  )
}
