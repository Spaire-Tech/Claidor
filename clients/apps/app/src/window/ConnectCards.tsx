// Step 3c (mac/Simeon/Cards.swift): apps an agent needs connected, Slack or
// GitHub for a routine, the cloud agent's card, GitHub on the computer for
// a cloud agent's coding (11 November 2026), and a new teammate joined.
// Read by `src/core/connectCards.ts`.
//
// An app's Connect (step 6b): the consent, then the app added and its
// sign-in in one go, through the window's connector (connector.ts).

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
  gitHubConnectedLabel,
  gitHubSignInCard,
  gitHubSignInLine,
  gitHubSignInNextPoll,
  gitHubSignInState,
  gitHubSignInTitle,
  gitHubSignInWords,
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
  viewProfileWord,
  webPage,
  type AppLogo,
  type CloudAgentInfo,
  type ConnectorsCard,
  type GitHubSignInCard,
  type GitHubSignInState,
  type JoinedCard,
  type ListenerCard,
} from '../core/connectCards'
import { connectWord, retryWord } from '../core/connecting'
import { pictureURL } from '../core/faces'
import type { AppStore } from '../core/store'
import { t } from '../l10n'
import { AgentPicture } from './AgentMark'
import { CardButton, CardShell, type CardProps } from './Cards'
import './ConnectCards.css'
import { classes } from './classes'
import { copyText } from './clipboard'
import { useConnector, useConnectorWatched } from './connector'
import { openPending } from './outside'
import { useDarkScheme } from './theme'
import { useWindowModel } from './windowModel'

type ConnectKind = Extract<
  CardKind,
  'connectors' | 'listenerConnect' | 'cloudAgent' | 'gitHubSignIn' | 'joined'
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
      return (
        read && (
          <CloudAgentCardView
            bcId={read.bcId}
            agentId={card.agentId}
            store={card.store}
          />
        )
      )
    }
    case 'gitHubSignIn': {
      const read = gitHubSignInCard(card.entry)
      return read && <GitHubSignInCardView card={read} store={card.store} />
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
 * (12, 40%); at the right "Connected" in green, "Coming soon" for an app
 * that can't be connected yet, or Connect (`ConnectorCard`): the consent,
 * then the app added and its sign-in in a tab (step 6b). A spinner in it
 * while its sign-in is asked for and open; every other Connect waits
 * meanwhile, one sign-in at a time. A Connect the computer refused turns
 * the button to Retry, with no reason, as the window's connector card does
 * (3 November 2026: the card had said nothing).
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
  const connector = useConnector()
  useConnectorWatched(connector)
  // Its last Connect was refused: Retry, until the next one begins.
  const [refused, setRefused] = useState(false)
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
        ) : store.isComingSoon(name) ? (
          <span className="connector-soon">
            <span aria-hidden="true">{comingSoonWord()}</span>
            <span className="connect-unseen">{t`${title} is coming soon`}</span>
          </span>
        ) : (
          connector && (
            // The consent first, then the app's sign-in in a tab (`MacConnector`).
            <button
              type="button"
              className="connector-connect"
              disabled={connector.connecting !== undefined}
              aria-busy={connector.connecting === name}
              aria-label={refused ? retryWord() : t`Connect ${name}`}
              onClick={() => connector.connect(name, setRefused)}
            >
              {connector.connecting === name ? (
                <span className="connect-spinner" aria-hidden="true" />
              ) : refused ? (
                retryWord()
              ) : (
                connectWord()
              )}
            </button>
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
  icon,
}: {
  name: string
  side?: number
  id?: string
  /** The icon itself, when the caller has it (an AI provider's own, `providerIconURL`); the name finds it otherwise. */
  icon?: string
}) {
  const logo: AppLogo =
    icon !== undefined ? { kind: 'icon', url: icon } : appLogo(name, id)
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
 * "Connect Slack" (`sand-listener-connect-card`), drawn as an app to connect
 * is (13 November 2026, the founder of its green tick: "this is nowhere
 * near our design"): the card's own shell, the app's icon (40), "Connect
 * Slack" and the reason under it; at the right Connect, or a spinner while
 * the computer is asked. Once connected it reads as a connected app's card:
 * "Slack" and "Connected" in the green capsule. Connect opens the page that
 * links it in a new tab; the card asks again when the tab comes back to the
 * front.
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
    // Opened at once, before the computer answers, so the browser lets it open; sent to the page once it is known (the Windows app: the default browser then, as the Mac's).
    const tab = openPending()
    const page = webPage(await store.listenerConnectURL(platform))
    if (!page) tab.drop()
    else if (!tab.closed) {
      opened.current = true
      tab.go(page)
    }
    // A tab the person closed before the page was known stays closed: they changed their mind.
    setOpening(false)
  }

  return (
    <CardShell className="listener-card">
      <div className="connector-row">
        <ListenerLogo platform={platform} />
        <div className="connector-words">
          {/* Once connected: the app's name alone, as a connected app's card (its reason was what to do). */}
          <span className="connector-title">
            {connected === true ? name : t`Connect ${name}`}
          </span>
          {connected !== true && (
            <span className="connector-line listener-reason">
              {card.reason != null
                ? t`Connect ${name} ${card.reason}.`
                : t`Connect ${name} so this routine can fire.`}
            </span>
          )}
        </div>
        {connected === true ? (
          <span className="connector-connected" role="status">
            {connectedWord()}
          </span>
        ) : connected === false ? (
          <button
            type="button"
            className="card-button prominent"
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
    </CardShell>
  )
}

/** Slack's or GitHub's own app icon (40), as an app to connect shows it; its logo on the grey tile where the catalogue has no icon. */
function ListenerLogo({ platform }: { platform: ListenerCard['platform'] }) {
  const logo = listenerLogos[platform]
  const dark = useDarkScheme()
  const name = platform === 'slack' ? 'Slack' : 'GitHub'
  if (appLogo(name).kind === 'icon') return <AppLogoTile name={name} />
  return (
    <span className="logo-tile listener-logo" aria-hidden="true">
      <img src={dark && logo.dark ? logo.dark : logo.light} alt="" />
    </span>
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
 * works. Open shows its conversation over the chat (13 November 2026,
 * Call.tsx's `ExchangeView`): what the agent asked it, what it said along
 * the way and its answers.
 */
function CloudAgentCardView({
  bcId,
  agentId,
  store,
}: {
  bcId: string
  /** The agent whose chat the card is in: its side of the conversation. */
  agentId: string
  store: AppStore
}) {
  const model = useWindowModel()
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
        {(pull || bcId !== '') && (
          <div className="card-buttons">
            {bcId !== '' && (
              <CardButton
                title={t('Open')}
                onClick={() =>
                  model.coverChat({
                    kind: 'exchange',
                    agentId,
                    peerId: bcId,
                    cloudAgent: {
                      name: shown.name,
                      ...(shown.coder === '' ? {} : { coder: shown.coder }),
                    },
                  })
                }
              />
            )}
            {pull && (
              <a
                className="card-button prominent"
                href={pull}
                title={openPull}
                {...pageLink}
              >
                {t('View PR')}
              </a>
            )}
          </div>
        )}
      </CardShell>
    </div>
  )
}

// MARK: GitHub on the computer

/**
 * "Connect GitHub" (`github-sign-in`, the upstream's card 8), drawn as an
 * app to connect is (13 November 2026, the founder of "Connected as" with
 * its green tick beside the stale "Enter this code": "this is nowhere near
 * our design"): the card's own shell, GitHub's icon (40), the title and what
 * to do; while it waits, the one-time code (20, 600, monospaced, selectable)
 * with Copy code and Open GitHub (GitHub's own page, in a new tab). The
 * computer is asked every three seconds while the card is on screen; once
 * GitHub is connected the code and its line go, and the card reads as a
 * connected app's: "GitHub", the account under it, "Connected" in the green
 * capsule. The agent carries on by itself. A code past its quarter of an
 * hour, or replaced by a newer one, says it expired.
 */
function GitHubSignInCardView({
  card,
  store,
}: {
  card: GitHubSignInCard
  store: AppStore
}) {
  const [state, setState] = useState<GitHubSignInState>()
  const [copied, setCopied] = useState(false)
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

  // Asked again only when the code changes, not each time the chat draws the card anew.
  const { code, url, expiresAtMs } = card
  useEffect(() => {
    if (!onScreen) return
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let known: GitHubSignInState | undefined
    const ask = async () => {
      const read = gitHubSignInState(
        { code, url, expiresAtMs },
        await store.gitHubSignIn(),
        Date.now(),
      )
      if (stopped) return
      if (read) {
        known = read
        setState(read)
      }
      const wait = gitHubSignInNextPoll(read ?? known)
      if (wait != null) timer = setTimeout(() => void ask(), wait * 1000)
    }
    void ask()
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [store, code, url, expiresAtMs, onScreen])

  const words = gitHubSignInWords()
  const waiting = state == null || state.kind === 'waiting'
  const line = gitHubSignInLine(state)
  return (
    <div ref={box} className="github-watch">
      <CardShell className="github-card">
        <div className="connector-row">
          <ListenerLogo platform="github" />
          <div className="connector-words">
            <span className="connector-title">{gitHubSignInTitle(state)}</span>
            {line !== '' && (
              <span
                className={classes(
                  'connector-line',
                  state?.kind !== 'connected' && 'listener-reason',
                )}
              >
                {line}
              </span>
            )}
          </div>
          {state?.kind === 'connected' && (
            <span
              className="connector-connected"
              role="status"
              aria-label={gitHubConnectedLabel(state.login)}
            >
              {connectedWord()}
            </span>
          )}
        </div>
        {waiting && (
          <div className="github-code-row">
            <span className="github-code">{card.code}</span>
            {/* The two buttons together, at the right; under the code when the card is narrow. */}
            <div className="card-buttons">
              <button
                type="button"
                className="card-button"
                onClick={() =>
                  void copyText(card.code).then(
                    () => setCopied(true),
                    () => setCopied(false),
                  )
                }
              >
                {copied ? words.copied : words.copy}
              </button>
              <a
                className="card-button prominent"
                href={card.url}
                {...pageLink}
              >
                {words.open}
              </a>
            </div>
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
 * 600), what it does in two lines at most, and Go to Chat and View Profile
 * (the agent's pane on its Profile) at the bottom; the card in the colour
 * of the face's own background, its words white. One height for every
 * card, 168. The agent gone (deleted since), the words stay on the chat's
 * grey and the face and the buttons go.
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
  const model = useWindowModel()
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
            <JoinedButton
              title={viewProfileWord()}
              quiet
              onClick={() => model.openPaneFor('profile', card.agentId)}
            />
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Go to Chat and View Profile (`JoinedButton`), each half the row with
 * round ends. Go to Chat: white with its words in the colour's deep shade
 * on the colour, the window's blue on the grey. View Profile (`quiet`): a
 * white pane over the colour with its edge, the wash on the grey.
 */
function JoinedButton({
  title,
  quiet = false,
  onClick,
}: {
  title: string
  quiet?: boolean
  onClick: () => void
}) {
  const words = useFitted<HTMLSpanElement>(14, 0.85, title)
  return (
    <button
      type="button"
      className={classes('joined-button', quiet && 'quiet')}
      onClick={onClick}
    >
      <span ref={words} className="joined-button-words">
        {title}
      </span>
    </button>
  )
}
