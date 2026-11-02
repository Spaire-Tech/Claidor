// Step 3c (mac/Simeon/Cards.swift): apps an agent needs connected, Slack or
// GitHub for a routine, the cloud agent's card, and a new teammate joined.
// Read by `src/core/connectCards.ts`.
//
// Left for their steps, so no button here does nothing: an app's Connect
// (the consent, then the app added and its sign-in, step 6, "connecting"),
// and the joined card's View Profile (the agent's pane, step 4).

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CardKind } from '../core/chat'
import {
  appLogo,
  cloudAgentCard,
  cloudAgentChangedLabel,
  cloudAgentNextPoll,
  cloudAgentStatusLabel,
  comingSoonWord,
  connectedWord,
  connectorsCard,
  cssColour,
  goToChatWord,
  joinedAgent,
  joinedCard,
  joinedColours,
  joinedTitleIn,
  listenerCard,
  middleCut,
  standingFace,
  standingURL,
  unavailableCloudAgent,
  webPage,
  type CloudAgentInfo,
  type ConnectorsCard,
  type JoinedCard,
  type ListenerCard,
} from '../core/connectCards'
import { pictureURL } from '../core/faces'
import type { AppStore } from '../core/store'
import { t } from '../l10n'
import { AgentPicture } from './AgentMark'
import { CardShell, type CardProps } from './Cards'
import './ConnectCards.css'
import { classes } from './classes'

type ConnectKind = Extract<
  CardKind,
  'connectors' | 'listenerConnect' | 'cloudAgent' | 'joined'
>

/** The card for one of 3c's kinds, or none when its line doesn't read as one. */
export function connectCardView(
  kind: ConnectKind,
  card: CardProps,
): React.ReactNode {
  switch (kind) {
    case 'connectors': {
      const read = connectorsCard(card.entry)
      return read && <ConnectorCardsView card={read} store={card.store} />
    }
    case 'listenerConnect': {
      const read = listenerCard(card.entry)
      return read && <ListenerConnectCardView card={read} store={card.store} />
    }
    case 'cloudAgent': {
      const read = cloudAgentCard(card.entry)
      return read && <CloudAgentCardView bcId={read.bcId} store={card.store} />
    }
    case 'joined': {
      const read = joinedCard(card.entry)
      return (
        read && (
          <JoinedCardView
            card={read}
            store={card.store}
            openAgent={card.openAgent}
          />
        )
      )
    }
  }
}

/** A page opened in the browser's own new tab, never in the app's. */
const pageLink = {
  target: '_blank',
  rel: 'noopener noreferrer',
} as const

// MARK: Apps to connect

/**
 * Apps the agent needs (`sand-connector-card`), one card each, 8 apart. The
 * person's connected apps, the catalogue and the apps that can't be
 * connected yet are read as the cards show, as the Mac's do.
 */
function ConnectorCardsView({
  card,
  store,
}: {
  card: ConnectorsCard
  store: AppStore
}) {
  useEffect(() => {
    void store.loadAppCards()
  }, [store])
  return (
    <div className="connector-cards">
      {card.names.map((name, index) => (
        <ConnectorCardView
          key={`${index}-${name}`}
          name={name}
          reason={card.reason}
          markedConnected={card.connected}
          store={store}
        />
      ))}
    </div>
  )
}

/**
 * One app: its icon (40), its name (13 on 18, 500), the agent's reason or
 * else what the app does (60%), how many tools it brings once connected
 * (12, 40%); at the right "Connected" in green, or "Coming soon" for an app
 * that can't be connected yet. Connect comes with step 6.
 */
function ConnectorCardView({
  name,
  reason,
  markedConnected,
  store,
}: {
  name: string
  reason?: string
  markedConnected: boolean
  store: AppStore
}) {
  const app = store.catalogApp(name)
  const title = app?.title ?? name
  const connected = markedConnected || store.isConnected(name)
  const tools = store.connectedToolCount(name)
  const line = reason ?? app?.summary ?? ''
  return (
    <CardShell>
      <div className="connector-row">
        <AppLogoTile name={title} />
        <div className="connector-words">
          <span className="connector-title">{title}</span>
          {line !== '' && (
            <span className="connector-line" title={line}>
              {line}
            </span>
          )}
          {connected && tools > 0 && (
            <span className="connector-tools">
              {tools === 1 ? t('1 tool') : t`${tools} tools`}
            </span>
          )}
        </div>
        {connected ? (
          <span className="connector-connected">{connectedWord()}</span>
        ) : (
          store.isComingSoon(name) && (
            <span className="connector-soon">
              <span aria-hidden="true">{comingSoonWord()}</span>
              <span className="connect-unseen">{t`${title} is coming soon`}</span>
            </span>
          )
        )}
      </div>
    </CardShell>
  )
}

/**
 * An app's icon: its own app icon, whole, with an app icon's corners (22.37%
 * of its side) and a hairline that keeps a black icon in view on the dark
 * ground; else the brand's logo on its grey tile (11 round at 40), or its
 * first letter.
 */
export function AppLogoTile({
  name,
  side = 40,
  id,
}: {
  name: string
  side?: number
  id?: string
}) {
  const logo = appLogo(name, id)
  if (logo.kind === 'icon')
    return (
      <span
        className="app-icon"
        style={{ width: side, height: side, borderRadius: side * 0.2237 }}
        aria-hidden="true"
      >
        <img src={logo.url} alt="" />
      </span>
    )
  return (
    <span
      className="logo-tile"
      style={{
        width: side,
        height: side,
        borderRadius: (side * 11) / 40,
        fontSize: side * 0.42,
      }}
      aria-hidden="true"
    >
      {logo.kind === 'letter' ? (
        logo.letter
      ) : logo.mono ? (
        <span
          className="logo-mask"
          style={{
            maskImage: `url("${logo.url}")`,
            WebkitMaskImage: `url("${logo.url}")`,
          }}
        />
      ) : (
        <img src={logo.url} alt="" />
      )}
    </span>
  )
}

// MARK: Routines that wake on Slack or GitHub

const listenerLogos = {
  slack: {
    light: new URL(
      '../../../../../desktop/brand/connector-logos/slack.svg',
      import.meta.url,
    ).href,
  },
  github: {
    light: new URL(
      '../../../../../desktop/brand/connector-logos/github.svg',
      import.meta.url,
    ).href,
    dark: new URL(
      '../../../../../desktop/brand/connector-logos-dark/github.svg',
      import.meta.url,
    ).href,
  },
} as Record<ListenerCard['platform'], { light: string; dark?: string }>

/**
 * "Connect Slack" (`sand-listener-connect-card`, at most 520 wide, 14
 * round): the platform's logo on a faint tile (30, 8 round), its title (12
 * on 16, 600) and the reason under it (60%); at the right "Connected" with
 * a green tick, Connect, or a spinner while the computer is asked. Connect
 * opens the page that links it in a new tab; the card asks again when the
 * tab comes back to the front.
 */
function ListenerConnectCardView({
  card,
  store,
}: {
  card: ListenerCard
  store: AppStore
}) {
  const [connected, setConnected] = useState<boolean>()
  const [opening, setOpening] = useState(false)
  const opened = useRef(false)
  const { platform } = card
  const name = platform === 'slack' ? 'Slack' : 'GitHub'

  useEffect(() => {
    let live = true
    let asking = false
    const read = async () => {
      // One question at a time: coming back fires both focus and visibilitychange.
      if (asking) return
      asking = true
      try {
        const now = await store.listenerConnected(platform)
        if (!live) return
        setConnected(now ?? false)
        // Connected: nothing more to wait for.
        if (now === true) opened.current = false
      } finally {
        asking = false
      }
    }
    void read()
    // Back from the page Connect opened: asked again, so the card says Connected once it is.
    const back = () => {
      if (opened.current && document.visibilityState === 'visible') void read()
    }
    window.addEventListener('focus', back)
    document.addEventListener('visibilitychange', back)
    return () => {
      live = false
      window.removeEventListener('focus', back)
      document.removeEventListener('visibilitychange', back)
    }
  }, [store, platform])

  const connect = async () => {
    setOpening(true)
    // Opened at once, before the computer answers, so the browser lets it open; sent to the page once it is known.
    const tab = window.open('', '_blank')
    if (tab) tab.opener = null
    const page = webPage(await store.listenerConnectURL(platform))
    if (!page) tab?.close()
    else if (!tab) {
      opened.current = true
      window.open(page, '_blank', 'noopener')
    } else if (!tab.closed) {
      opened.current = true
      tab.location.href = page
    }
    // A tab the person closed before the page was known stays closed: they changed their mind.
    setOpening(false)
  }

  const logo = listenerLogos[platform]
  return (
    <div className="listener-card">
      <span className="listener-logo" aria-hidden="true">
        <picture>
          {logo.dark && (
            <source srcSet={logo.dark} media="(prefers-color-scheme: dark)" />
          )}
          <img src={logo.light} alt="" />
        </picture>
      </span>
      <div className="listener-words">
        <div className="listener-title">{t`Connect ${name}`}</div>
        <div className="listener-reason">
          {card.reason != null
            ? t`Connect ${name} ${card.reason}.`
            : t`Connect ${name} so this routine can fire.`}
        </div>
      </div>
      <div className="listener-end">
        {connected === true ? (
          <span className="listener-connected">
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
              <circle cx="8" cy="8" r="7.5" fill="currentColor" />
              <path
                d="M4.9 8.3 7.1 10.4l4.1-4.6"
                fill="none"
                // Cut out of the green, as `checkmark.circle.fill`: the card's grey shows through.
                style={{ stroke: 'var(--theirs)' }}
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>{t('Connected')}</span>
          </span>
        ) : connected === false ? (
          <button
            type="button"
            className="listener-connect"
            disabled={opening}
            onClick={() => void connect()}
          >
            {t('Connect')}
          </button>
        ) : (
          <span
            className="connect-spinner"
            role="progressbar"
            aria-label={t('Checking connection status')}
          />
        )}
      </div>
    </div>
  )
}

// MARK: Cloud agents

function BranchGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M5 14.5V2.6M2.6 5 5 2.6 7.4 5M5 11.5c0-4 6.2-3.4 6.2-8.6M8.9 4.9l2.3-2.3 2.3 2.3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function DocumentGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M3.5 1.6h6l3 3v9.8h-9zM9.5 1.6v3h3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** One line cut in its middle when it doesn't fit (a branch's name): it takes the room its whole words would, and no more. */
function MiddleLine({
  words,
  className,
}: {
  words: string
  className: string
}) {
  const box = useRef<HTMLSpanElement>(null)
  const [shown, setShown] = useState(words)
  useLayoutEffect(() => {
    const line = box.current
    const pen = line && document.createElement('canvas').getContext('2d')
    if (!line || !pen) return
    const style = getComputedStyle(line)
    pen.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
    const spacing = parseFloat(style.letterSpacing) || 0
    const width = (some: string) =>
      pen.measureText(some).width + spacing * [...some].length
    line.style.flexBasis = `${Math.ceil(width(words)) + 1}px`
    const fit = () => setShown(middleCut(words, line.clientWidth, width))
    fit()
    const watch = new ResizeObserver(fit)
    watch.observe(line)
    return () => watch.disconnect()
  }, [words])
  return (
    <span ref={box} className={className}>
      {shown}
    </span>
  )
}

/**
 * A cloud agent the agent started (`sand-cloud-agent-card`): its name (14
 * on 22, 500, opening the pull request) with its state in a pill (Done in
 * green, Error in red, the rest grey); what it was asked; its branch and
 * "PR #412"; how many files changed with the lines added in green and taken
 * out in red; View PR in the blue. Asked again every five seconds while it
 * works. The Mac's Open is left out until its page exists: it goes to
 * app.simeonlabs.com/agents/<id>, which doesn't yet (docs/services-agents.md,
 * "Cloud agents"), so it would land on a page not found.
 */
function CloudAgentCardView({
  bcId,
  store,
}: {
  bcId: string
  store: AppStore
}) {
  const [info, setInfo] = useState<CloudAgentInfo>()
  // Asked only while it is on screen, as the Mac's lazy chat asks (its `.task` ends when the card scrolls away).
  const box = useRef<HTMLDivElement>(null)
  const [onScreen, setOnScreen] = useState(false)
  useEffect(() => {
    const element = box.current
    if (!element) return
    const watch = new IntersectionObserver((seen) =>
      setOnScreen(seen.some((one) => one.isIntersecting)),
    )
    watch.observe(element)
    return () => watch.disconnect()
  }, [])

  useEffect(() => {
    if (!onScreen) return
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let known: CloudAgentInfo | undefined
    const ask = async () => {
      const read = await store.cloudAgent(bcId)
      if (stopped) return
      if (read.kind === 'info') {
        known = read.info
        setInfo(read.info)
      }
      const wait = cloudAgentNextPoll(read, known)
      if (wait != null) timer = setTimeout(() => void ask(), wait * 1000)
    }
    void ask()
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [store, bcId, onScreen])

  const shown = info ?? unavailableCloudAgent
  const pull = webPage(shown.pullRequestURL)
  const name = shown.name === '' ? t('Cloud agent') : shown.name
  const changed = cloudAgentChangedLabel(shown)
  const openPull = t('Open the pull request')
  return (
    <div ref={box} className="cloud-watch">
      <CardShell className="cloud-card">
        <div className="cloud-facts">
          <div className="cloud-head">
            {pull ? (
              <a
                className="cloud-name"
                href={pull}
                title={openPull}
                {...pageLink}
              >
                {name}
              </a>
            ) : (
              <span className="cloud-name">{name}</span>
            )}
            <span
              className={classes(
                'status-pill large',
                shown.status === 'finished' && 'cloud-done',
                shown.status === 'error' && 'cloud-error',
              )}
              role="status"
            >
              <span className="status-dot" />
              {cloudAgentStatusLabel(shown)}
            </span>
          </div>
          {shown.prompt !== '' && (
            <div className="cloud-prompt">{shown.prompt}</div>
          )}
          {(shown.branch !== '' || shown.pullRequestNumber != null) && (
            <div className="cloud-branch">
              <span className="cloud-glyph">
                <BranchGlyph />
              </span>
              {shown.branch !== '' && (
                <MiddleLine
                  words={shown.branch}
                  className="cloud-branch-name"
                />
              )}
              {shown.pullRequestNumber != null &&
                (pull ? (
                  <a
                    className="cloud-pull"
                    href={pull}
                    title={openPull}
                    {...pageLink}
                  >
                    {t`PR #${shown.pullRequestNumber}`}
                  </a>
                ) : (
                  <span className="cloud-pull">
                    {t`PR #${shown.pullRequestNumber}`}
                  </span>
                ))}
            </div>
          )}
          {changed && (
            <div className="cloud-changes">
              <span className="cloud-files">
                <span className="cloud-glyph">
                  <DocumentGlyph />
                </span>
                {changed}
              </span>
              <span className="cloud-lines">
                <span className="cloud-added">+{shown.linesAdded}</span>
                <span className="cloud-removed">-{shown.linesRemoved}</span>
              </span>
            </div>
          )}
        </div>
        {pull && (
          <div className="card-buttons">
            <a
              className="card-button prominent"
              href={pull}
              title={openPull}
              {...pageLink}
            >
              {t('View PR')}
            </a>
          </div>
        )}
      </CardShell>
    </div>
  )
}

// MARK: A new teammate joined

/** One line at `size`, made smaller to fit, down to `smallest` of it (`minimumScaleFactor`); cut with "…" past that. */
function useFitted<Element extends HTMLElement>(
  size: number,
  smallest: number,
  words: string,
) {
  const box = useRef<Element>(null)
  useLayoutEffect(() => {
    const line = box.current
    if (!line) return
    const fit = () => {
      line.style.fontSize = `${size}px`
      const room = line.clientWidth
      const needs = line.scrollWidth
      if (needs > room && room > 0)
        line.style.fontSize = `${size * Math.max(smallest, (room / needs) * 0.995)}px`
    }
    fit()
    const watch = new ResizeObserver(fit)
    watch.observe(line)
    return () => watch.disconnect()
  }, [size, smallest, words])
  return box
}

/**
 * "Iris just joined your team" (the founder's design B): the agent another
 * one hired, its face standing on its own on the card's bottom edge at the
 * left (a picture of its own sits round in that place), the title (17,
 * 600), what it does in two lines at most, and Go to Chat at the bottom; the
 * card in the colour of the face's own background, its words white. One
 * height for every card, 168. The agent gone (deleted since), the words
 * stay on the chat's grey and the face and the button go. View Profile joins
 * Go to Chat with the agent's pane (step 4).
 */
function JoinedCardView({
  card,
  store,
  openAgent,
}: {
  card: JoinedCard
  store: AppStore
  openAgent: (agentId: string) => void
}) {
  const agents = store.agents
  const agent = joinedAgent(card, agents)
  const colours = joinedColours(card, agents)
  const title = joinedTitleIn(card, agents)
  const heading = useFitted<HTMLDivElement>(17, 0.8, title)
  const ground = useRef<HTMLDivElement>(null)
  const coloured = colours != null

  // The colour runs from the top leading corner to the bottom trailing one, across the card as it is drawn.
  useLayoutEffect(() => {
    const box = ground.current
    if (!box || !coloured) return
    const turn = () => {
      const { width, height } = box.getBoundingClientRect()
      if (width > 0 && height > 0)
        box.style.setProperty(
          '--joined-angle',
          `${180 - (Math.atan(width / height) * 180) / Math.PI}deg`,
        )
    }
    turn()
    const watch = new ResizeObserver(turn)
    watch.observe(box)
    return () => watch.disconnect()
  }, [coloured])

  const face = agent && standingFace(agent)
  const standing = face && standingURL(face)
  const style = colours
    ? ({
        '--joined-top': cssColour(colours.top),
        '--joined-bottom': cssColour(colours.bottom),
        '--joined-deep': cssColour(colours.deep),
      } as React.CSSProperties)
    : undefined
  return (
    <div
      ref={ground}
      className={classes(
        'joined-card',
        coloured && 'coloured',
        agent == null && 'gone',
      )}
      style={style}
      role="group"
    >
      {agent && (
        <div className={classes('joined-face', standing && 'standing')}>
          {standing ? (
            <img src={standing} alt="" />
          ) : (
            <AgentPicture url={pictureURL(agent)} size={72} />
          )}
        </div>
      )}
      <div className="joined-words">
        <div ref={heading} className="joined-title">
          {title}
        </div>
        {card.line !== '' && <div className="joined-line">{card.line}</div>}
        {agent && (
          <div className="joined-buttons">
            <JoinedButton
              title={goToChatWord()}
              onClick={() => openAgent(card.agentId)}
            />
          </div>
        )}
      </div>
    </div>
  )
}

/** Go to Chat: round ends, half the row (View Profile takes the other half in step 4); white with its words in the colour's deep shade on the colour, the window's blue on the grey. */
function JoinedButton({
  title,
  onClick,
}: {
  title: string
  onClick: () => void
}) {
  const words = useFitted<HTMLSpanElement>(14, 0.85, title)
  return (
    <button type="button" className="joined-button" onClick={onClick}>
      <span ref={words} className="joined-button-words">
        {title}
      </span>
    </button>
  )
}
