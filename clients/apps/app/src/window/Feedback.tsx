// Send Feedback and Report an Issue (mac/Simeon/Feedback.swift, the core's
// Feedback.swift; the founder, 30 October 2026, with two other apps' for
// reference: "we already have a report issue button in mac. just make it
// work"): Settings › Help & support's two rows and the account menu's Report
// an issue open them (`model.feedback`), on a sheet over the window in the
// Mac's parts (New Agent's: the title and its glass discs at the top, the
// groups, the one wide blue button). What is sent is e-mailed to Simeon Labs
// (`POST feedback`).
//
// Feedback, as the reference's: the words, the agent it was about, Send
// Feedback. An issue, as Muse's: first whether the logs and diagnostics go
// with it, then what went wrong, screenshots, what it is about, and Submit.
// Once sent, it says so and Done closes it. In a browser the screenshots
// come from its own file chooser (the Mac's open panel) or a drop on their
// row, each made a JPEG in a canvas as the Mac's ImageIO makes it; the
// diagnostics are what the tab keeps (its recent activity, the screens'
// connections), never a token.

import {
  type DragEvent as ReactDragEvent,
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { base64Of } from '../core/agentDraft'
import { SimeonAPIError } from '../core/api'
import { streamLog } from '../core/cloudComputer'
import {
  type FeedbackKind,
  type FeedbackReport,
  type FeedbackShot,
  type FeedbackTopic,
  browserSays,
  canSendReport,
  clippedMessage,
  deviceFactsFrom,
  diagnosticsText,
  feedbackAgentChoices,
  feedbackAgentLabel,
  feedbackTopics,
  newFeedbackReport,
  pictureQuality,
  roomForScreenshots,
  shrunkSize,
  toggledTopic,
} from '../core/feedback'
import { detectedTimeZone } from '../core/generalSettings'
import { currentLanguage } from '../core/language'
import { recentActivity } from '../core/recentActivity'
import type { AppStore } from '../core/store'
import { t, tk } from '../l10n'
import { clientVersion } from '../session'
import { classes } from './classes'
import { Glyph } from './ContextMenu'
import { Sheet } from './Dialogs'
import './Feedback.css'
import {
  PanelDisc,
  SettingsGroup,
  SettingsLine,
  SettingsMenuLabel,
  SettingsSymbol,
} from './SettingsParts'
import { useWatched } from './useStore'
import { useWindowModel } from './windowModel'

/** The sheet the window shows (`FeedbackSheets.showing`), drawn afresh for each kind. */
export function FeedbackLayer({ store }: { store: AppStore }) {
  const model = useWindowModel()
  useWatched(model)
  const kind = model.feedback
  if (kind === undefined) return null
  return (
    <FeedbackSheet
      key={kind}
      kind={kind}
      store={store}
      close={() => model.closeFeedback()}
    />
  )
}

/** A screenshot added: the JPEG sent, and its picture shown in the sheet (the page's own address for it, let go when it goes). */
interface Shot extends FeedbackShot {
  url: string
}

/**
 * A picture made a JPEG of at most 1,600 on its long side, at 80%
 * (`FeedbackPictures.shrink`): drawn by the browser, turned as its EXIF
 * says, in a canvas; none when the browser can't read it as a picture.
 */
async function shrink(file: Blob): Promise<Shot | undefined> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    return undefined
  }
  const size = shrunkSize(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  const context = size ? canvas.getContext('2d') : null
  if (!size || !context) {
    bitmap.close()
    return undefined
  }
  canvas.width = size.width
  canvas.height = size.height
  context.imageSmoothingQuality = 'high'
  context.drawImage(bitmap, 0, 0, size.width, size.height)
  bitmap.close()
  const jpeg = await new Promise<Blob | null>((done) =>
    canvas.toBlob(done, 'image/jpeg', pictureQuality),
  )
  if (!jpeg) return undefined
  return {
    base64: base64Of(new Uint8Array(await jpeg.arrayBuffer())),
    url: URL.createObjectURL(jpeg),
  }
}

/** The logs the tab keeps: the screens' connections (step 5b's log, the Mac's `computer-stream.log`). The Mac's `voice-call.log` is only written to the browser's console here, and doesn't go. */
function tabLogs(): { name: string; text: string }[] {
  return streamLog.lines.length > 0
    ? [{ name: 'computer-stream.log', text: streamLog.lines.join('\n') }]
    : []
}

/** A text field or a menu of the page's own: Return is theirs. */
function takesReturn(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLButtonElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  )
}

/**
 * The sheet (`MacFeedbackSheet`): 480 wide on the grouped ground. Escape,
 * × and a click outside close it, except while it sends.
 */
function FeedbackSheet({
  kind,
  store,
  close,
}: {
  kind: FeedbackKind
  store: AppStore
  close: () => void
}) {
  useWatched(store)
  const [report, setReport] = useState<FeedbackReport>(() =>
    newFeedbackReport(kind),
  )
  // The logs question answered (an issue's first step); feedback has none.
  const [asked, setAsked] = useState(kind === 'feedback')
  const [sending, setSending] = useState(false)
  const busy = useRef(false)
  const [failure, setFailure] = useState<string>()
  const [sent, setSent] = useState(false)
  const stepBack = kind === 'issue' && asked && !sent
  const title = kind === 'feedback' ? t('Send Feedback') : t('Report an Issue')

  // The screenshots' pictures let go when the sheet goes.
  const pictures = useRef(new Set<string>())
  useEffect(() => {
    const kept = pictures.current
    return () => {
      for (const url of kept) URL.revokeObjectURL(url)
    }
  }, [])

  const dismiss = () => {
    if (!busy.current) close()
  }

  const go = (including: boolean) => {
    setReport((now) => ({ ...now, includesDiagnostics: including }))
    setAsked(true)
  }

  const send = async () => {
    if (!canSendReport(report) || busy.current) return
    busy.current = true
    setSending(true)
    setFailure(undefined)
    const snapshot = report
    const facts = deviceFactsFrom(
      await browserSays(),
      clientVersion,
      currentLanguage(),
      detectedTimeZone(),
    )
    const diagnostics = snapshot.includesDiagnostics
      ? diagnosticsText(
          facts,
          store.diagnosticsState,
          recentActivity(),
          tabLogs(),
        )
      : undefined
    try {
      await store.sendFeedback(snapshot, facts, diagnostics)
      setSent(true)
    } catch (error) {
      setFailure(
        error instanceof SimeonAPIError && error.status === 400
          ? error.message
          : t('Couldn’t send it. Check your connection and try again.'),
      )
    }
    busy.current = false
    setSending(false)
  }

  /** Screenshots chosen or dropped: pictures only, as many as there is room for. */
  const add = async (files: readonly File[]) => {
    const chosen = files
      .filter((file) => file.type === '' || file.type.startsWith('image/'))
      .slice(0, roomForScreenshots(report))
    if (chosen.length === 0) return
    const shrunk: Shot[] = []
    for (const file of chosen) {
      const shot = await shrink(file)
      if (shot) shrunk.push(shot)
    }
    setReport((now) => {
      const kept = shrunk.slice(0, roomForScreenshots(now))
      for (const shot of shrunk.slice(kept.length))
        URL.revokeObjectURL(shot.url)
      for (const shot of kept) pictures.current.add(shot.url)
      return { ...now, screenshots: [...now.screenshots, ...kept] }
    })
  }

  const remove = (index: number) =>
    setReport((now) => {
      const shot = now.screenshots[index] as Shot | undefined
      if (shot) {
        URL.revokeObjectURL(shot.url)
        pictures.current.delete(shot.url)
      }
      return {
        ...now,
        screenshots: now.screenshots.filter((_, at) => at !== index),
      }
    })

  // Under the words ⌘Return (Control-Return off a Mac) sends, so Return makes a new line; elsewhere Return presses the wide button.
  const keys = useRef<{ submit?: () => void; primary?: () => void }>({})
  useLayoutEffect(() => {
    keys.current = {
      submit: asked && !sent ? () => void send() : undefined,
      primary: !asked ? () => go(true) : sent ? close : undefined,
    }
  })
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || event.isComposing || event.keyCode === 229)
        return
      if (!document.querySelector('.feedback-sheet')) return
      if (event.metaKey || event.ctrlKey) {
        const run = keys.current.submit
        if (!run) return
        event.preventDefault()
        run()
        return
      }
      if (event.altKey || event.shiftKey || takesReturn(event.target)) return
      const run = keys.current.primary
      if (!run) return
      event.preventDefault()
      run()
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [])

  const step = sent ? 'sent' : !asked ? 'question' : kind
  return (
    <Sheet label={title} close={dismiss} className="feedback-sheet">
      <div className="feedback-top">
        <div className="feedback-title" role="heading" aria-level={2}>
          {title}
        </div>
        <span className="feedback-top-left">
          {stepBack ? (
            <PanelDisc
              symbol="chevronLeft"
              label={t('Back')}
              disabled={sending}
              onClick={() => setAsked(false)}
            />
          ) : (
            <PanelDisc
              symbol="xmark"
              label={t('Close')}
              disabled={sending}
              onClick={dismiss}
            />
          )}
        </span>
        {stepBack && (
          <span className="feedback-top-right">
            <PanelDisc
              symbol="xmark"
              label={t('Close')}
              disabled={sending}
              onClick={dismiss}
            />
          </span>
        )}
      </div>
      <div key={step} className="feedback-step">
        {step === 'sent' ? (
          <>
            <div className="feedback-done">
              <span className="feedback-done-mark">
                <FeedbackSymbol name="checkmark.circle.fill" size={40} />
              </span>
              <div className="feedback-done-title">
                {kind === 'feedback' ? t('Feedback sent') : t('Report sent')}
              </div>
              <div className="feedback-done-line">
                {kind === 'feedback'
                  ? t('Thank you. We read every one.')
                  : t('Thank you. We’ll look into it.')}
              </div>
            </div>
            <WideButton title={t('Done')} enabled onClick={close} />
          </>
        ) : step === 'question' ? (
          <>
            <div className="feedback-question">
              <div className="feedback-question-title">
                {t('Include logs and diagnostics?')}
              </div>
              <p>
                {t(
                  'Your device, the app’s version and your account always come with a report, so we can find the problem.',
                )}
              </p>
              <p>
                {t(
                  'You can also include the app’s recent activity: what it asked our server and when, and how the connections to your computer went. Never your messages.',
                )}
              </p>
              <p>
                {t(
                  'Next, you’ll say what went wrong and can add screenshots. What you send goes to Simeon Labs and is only used to fix the problem.',
                )}
              </p>
            </div>
            <WideButton
              title={t('Include and Continue')}
              enabled
              onClick={() => go(true)}
            />
            <button
              type="button"
              className="feedback-skip"
              onClick={() => go(false)}
            >
              {t('Don’t Include and Continue')}
            </button>
          </>
        ) : step === 'feedback' ? (
          <>
            <div className="feedback-body">
              <SettingsGroup
                footer={t(
                  'Ideas, questions, things you’d change. We read every one.',
                )}
              >
                <FeedbackEditor
                  value={report.message}
                  placeholder={t('What’s on your mind?')}
                  onChange={(message) =>
                    setReport((now) => ({ ...now, message }))
                  }
                />
              </SettingsGroup>
              <AgentGroup
                store={store}
                report={report}
                pick={(agent) => setReport((now) => ({ ...now, agent }))}
              />
              <FailureLine failure={failure} />
            </div>
            <WideButton
              title={t('Send Feedback')}
              enabled={canSendReport(report)}
              sending={sending}
              onClick={() => void send()}
            />
          </>
        ) : (
          <>
            <div className="feedback-body">
              <SettingsGroup title={t('What went wrong?')}>
                <FeedbackEditor
                  value={report.message}
                  placeholder={t('What happened, and what did you expect?')}
                  onChange={(message) =>
                    setReport((now) => ({ ...now, message }))
                  }
                />
              </SettingsGroup>
              <Screenshots
                shots={report.screenshots as Shot[]}
                room={roomForScreenshots(report)}
                add={(files) => void add(files)}
                remove={remove}
              />
              <Topics
                picked={report.topics}
                toggle={(topic) => setReport((now) => toggledTopic(now, topic))}
              />
              <div className="feedback-notes">
                <FailureLine failure={failure} />
                <p className="feedback-note">
                  {t(
                    'What you send goes to Simeon Labs and is only used to fix the problem.',
                  )}
                </p>
              </div>
            </div>
            <WideButton
              title={t('Submit')}
              enabled={canSendReport(report)}
              sending={sending}
              onClick={() => void send()}
            />
          </>
        )}
      </div>
    </Sheet>
  )
}

/** Why it wasn't sent: 12, in red (`failureLine`). */
function FailureLine({ failure }: { failure: string | undefined }) {
  if (failure === undefined) return null
  return (
    <p className="feedback-failure" role="alert">
      {failure}
    </p>
  )
}

/**
 * The sheet's one wide button in the blue (New Agent's Create): 36 high, a
 * capsule, white words (14, 600) with a small white spinner while it sends;
 * grey words on the grey until it can be pressed. Padded 28 above, 32 a
 * side, 24 below.
 */
function WideButton({
  title,
  enabled,
  sending,
  onClick,
}: {
  title: string
  enabled: boolean
  sending?: boolean
  onClick: () => void
}) {
  return (
    <div className="feedback-wide-row">
      <button
        type="button"
        className={classes('feedback-wide', !enabled && 'off')}
        disabled={!enabled}
        onClick={onClick}
      >
        {sending && <span className="feedback-spinner" aria-hidden="true" />}
        {title}
      </button>
    </div>
  )
}

/** The words, in the group's grey: 13, 140 high, with the placeholder until something is written; cut at 5,000 characters as they come (`MacFeedbackEditor`). */
function FeedbackEditor({
  value,
  placeholder,
  onChange,
}: {
  value: string
  placeholder: string
  onChange: (words: string) => void
}) {
  const field = useRef<HTMLTextAreaElement>(null)
  // The words take the keys as the form shows, as the Mac's sheet's first field (after the sheet itself has taken them).
  useEffect(() => {
    const frame = requestAnimationFrame(() => field.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [])
  return (
    <textarea
      ref={field}
      className="feedback-editor"
      value={value}
      placeholder={placeholder}
      aria-label={placeholder}
      onChange={(event) => onChange(clippedMessage(event.target.value))}
    />
  )
}

/**
 * "Was it about one of your agents?" and the agent, None first: the
 * person's own agents, not a group, a hidden one or a helper. The list is
 * the browser's own, laid unseen over "value ⌄" (step 3d's way), so it takes
 * the keys as a system menu does.
 */
function AgentGroup({
  store,
  report,
  pick,
}: {
  store: AppStore
  report: FeedbackReport
  pick: (agent: FeedbackReport['agent']) => void
}) {
  const id = useId()
  const agents = feedbackAgentChoices(store.agents)
  if (agents.length === 0) return null
  const none = tk('feedback.agent.none')
  const shown = report.agent ? feedbackAgentLabel(report.agent) : none
  return (
    <SettingsGroup title={t('Was it about one of your agents?')}>
      <SettingsLine label={t('Agent')}>
        <span className="feedback-agent">
          <SettingsMenuLabel text={shown} />
          <select
            id={id}
            className="feedback-agent-select"
            aria-label={t('Agent')}
            value={report.agent?.id ?? ''}
            onChange={(event) =>
              pick(agents.find((agent) => agent.id === event.target.value))
            }
          >
            <option value="">{none}</option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {feedbackAgentLabel(agent)}
              </option>
            ))}
          </select>
        </span>
      </SettingsLine>
    </SettingsGroup>
  )
}

/**
 * Screenshots: each added one (96 × 64, round 10, with an × to take it
 * out), then Add while there is room (four at most): a dashed tile the size
 * of a screenshot, the blue + over the word. Add opens the browser's file
 * chooser, pictures only; pictures dropped on the row are added too.
 */
function Screenshots({
  shots,
  room,
  add,
  remove,
}: {
  shots: Shot[]
  room: number
  add: (files: File[]) => void
  remove: (index: number) => void
}) {
  const chooser = useRef<HTMLInputElement>(null)
  const heading = useId()
  const dropping = (event: ReactDragEvent) => {
    if (!event.dataTransfer.types.includes('Files')) return
    event.preventDefault()
    event.dataTransfer.dropEffect = room > 0 ? 'copy' : 'none'
  }
  return (
    <div className="feedback-section" aria-labelledby={heading} role="group">
      <h3 id={heading} className="feedback-section-title">
        {t('Screenshots')}
      </h3>
      <div
        className="feedback-shots"
        onDragOver={dropping}
        onDrop={(event) => {
          if (!event.dataTransfer.types.includes('Files')) return
          event.preventDefault()
          add([...event.dataTransfer.files])
        }}
      >
        {shots.map((shot, index) => (
          <div key={shot.url} className="feedback-shot">
            <img src={shot.url} alt="" />
            <button
              type="button"
              className="feedback-shot-remove glass-disc"
              title={t('Remove screenshot')}
              aria-label={t('Remove screenshot')}
              onClick={() => remove(index)}
            >
              <svg width="8" height="8" viewBox="0 0 16 16" aria-hidden="true">
                <path
                  d="M3 3l10 10M13 3 3 13"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.4}
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        ))}
        {room > 0 && (
          <button
            type="button"
            className="feedback-add"
            title={t('Add screenshots')}
            aria-label={t('Add screenshots')}
            onClick={() => chooser.current?.click()}
          >
            <FeedbackSymbol name="plus.circle.fill" size={18} />
            <span>{t('Add')}</span>
          </button>
        )}
        <input
          ref={chooser}
          type="file"
          accept="image/*"
          multiple
          hidden
          aria-label={t('Choose screenshots to add')}
          onChange={(event) => {
            const files = [...(event.target.files ?? [])]
            event.target.value = ''
            add(files)
          }}
        />
      </div>
    </div>
  )
}

/** "What's it about?": the topics as chips, one after another, onto the next line when a line is full; picked, in the blue. */
function Topics({
  picked,
  toggle,
}: {
  picked: readonly string[]
  toggle: (topic: FeedbackTopic) => void
}) {
  const heading = useId()
  return (
    <div className="feedback-section" aria-labelledby={heading} role="group">
      <h3 id={heading} className="feedback-section-title">
        {t('What’s it about?')}
      </h3>
      <div className="feedback-chips">
        {feedbackTopics().map((topic) => {
          const on = picked.includes(topic.id)
          return (
            <button
              key={topic.id}
              type="button"
              className={classes('feedback-chip', on && 'on')}
              aria-pressed={on}
              onClick={() => toggle(topic)}
            >
              <FeedbackSymbol name={topic.symbol} size={12} />
              {topic.title}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// MARK: The sheet's symbols (SF Symbols, outlined on a 16 grid)

const outlined: Record<string, ReactNode> = {
  'person.2': (
    <>
      <circle cx="6" cy="5.4" r="2.2" />
      <path d="M2 13c.4-2.4 1.9-3.8 4-3.8s3.6 1.4 4 3.8M10.6 3.9a1.9 1.9 0 1 1 .4 3.8M11.6 9.4c1.4.3 2.3 1.5 2.6 3.4" />
    </>
  ),
  'bubble.left.and.bubble.right': (
    <path d="M2.2 3h7.3a1.2 1.2 0 0 1 1.2 1.2v3.6a1.2 1.2 0 0 1-1.2 1.2H5.4L3.2 10.8V9h-1A1.2 1.2 0 0 1 1 7.8V4.2A1.2 1.2 0 0 1 2.2 3ZM12.6 6.2h1.2A1.2 1.2 0 0 1 15 7.4v3.4a1.2 1.2 0 0 1-1.2 1.2h-.6v1.8L11.3 12H8.4a1.2 1.2 0 0 1-1.2-1.2v-.4" />
  ),
  link: (
    <path d="M6.9 9.1a2.6 2.6 0 0 0 3.7 0l2.2-2.2a2.6 2.6 0 0 0-3.7-3.7l-.8.8M9.1 6.9a2.6 2.6 0 0 0-3.7 0L3.2 9.1a2.6 2.6 0 0 0 3.7 3.7l.8-.8" />
  ),
  'clock.arrow.circlepath': (
    <path d="M2.7 8a5.3 5.3 0 1 0 1.6-3.8M4.3 1.9v2.6h2.6M8 5.3V8l1.9 1.3" />
  ),
  waveform: (
    <path d="M2 7v2M4.5 5v6M7 2.8v10.4M9.5 5.2v5.6M12 3.8v8.4M14.5 6.8v2.4" />
  ),
  creditcard: (
    <path d="M3.2 3.5h9.6a1.4 1.4 0 0 1 1.4 1.4v6.2a1.4 1.4 0 0 1-1.4 1.4H3.2a1.4 1.4 0 0 1-1.4-1.4V4.9a1.4 1.4 0 0 1 1.4-1.4ZM1.8 6.6h12.4M4.2 10h2.4" />
  ),
  'ellipsis.circle': (
    <>
      <circle cx="8" cy="8" r="6.3" />
      <circle cx="5.2" cy="8" r=".5" fill="currentColor" />
      <circle cx="8" cy="8" r=".5" fill="currentColor" />
      <circle cx="10.8" cy="8" r=".5" fill="currentColor" />
    </>
  ),
}

/** One of the sheet's symbols, `size` square, in the ink of what holds it. */
function FeedbackSymbol({ name, size }: { name: string; size: number }) {
  switch (name) {
    case 'person.crop.circle':
      return <SettingsSymbol name="personCropCircle" size={size} />
    case 'desktopcomputer':
      return <SettingsSymbol name="desktopcomputer" size={size} />
    case 'gearshape':
      return <SettingsSymbol name="gearshape" size={size} />
    case 'bell':
      return <Glyph name="bell" size={size} />
    // The disc in the ink, its plus or its tick cut out (drawn in the ground under it).
    case 'plus.circle.fill':
      return (
        <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="8" r="7" fill="currentColor" />
          <path
            d="M8 4.6v6.8M4.6 8h6.8"
            stroke="var(--grouped-row)"
            strokeWidth={1.5}
            strokeLinecap="round"
          />
        </svg>
      )
    case 'checkmark.circle.fill':
      return (
        <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="8" r="7.2" fill="currentColor" />
          <path
            d="M4.9 8.2 7 10.3l4.1-4.6"
            fill="none"
            stroke="var(--grouped-ground)"
            strokeWidth={1.4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )
  }
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth={1.3}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {outlined[name]}
      </g>
    </svg>
  )
}
