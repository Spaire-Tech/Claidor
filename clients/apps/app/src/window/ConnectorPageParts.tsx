// A connector page's parts (mac/Simeon/PluginsWindow.swift 1197-2034,
// step 6d), drawn from plain values so the pages (ConnectorPages.tsx) only
// say what each shows: a page's head, the card of three messages on the
// founder's blue picture, a page's words, its cards and rows, Information
// with its links, Connect in the head, Uninstall or Remove at the foot, the
// folds, the accounts (the computer's and those Simeon Labs' server keeps,
// with the rename alert), the tools, the setup and skill fields.
//
// The pills, the spinner and the switch are the list's own (6c's
// Connectors.tsx), as the Mac's pages share the window's row parts.
//
// The web's own choices (docs/web-app/PROGRESS.md, "Decisions"): the links
// open in a new tab without `opener` or the referrer, and only http and
// https ones are drawn as links; the rename is the window's own alert with a
// field; the picture ships with the app; a value cut short is cut in its
// middle as the Mac's.

import {
  type CSSProperties,
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import {
  type AppAccount,
  accountDetail,
  accountTitle,
} from '../core/appAccounts'
import { middleCut } from '../core/connectCards'
import {
  type ConnectorPage,
  informationWords,
  shownAddress,
} from '../core/connectorPages'
import { t as coreT } from '../core/l10n'
import { t } from '../l10n'
import { classes } from './classes'
import './ConnectorPages.css'
import { AddingSpinner, PluginPill, PluginSwitch } from './Connectors'
import { Line, MentionContext, type MentionSetting } from './MessageText'
import {
  SettingsActionRow,
  SettingsGroup,
  SettingsSymbol,
} from './SettingsParts'

// MARK: Symbols of the pages' own

/** The SF Symbols the pages draw that Settings' don't: plus, pencil. */
function PageSymbol({
  name,
  size,
  weight = 1.5,
}: {
  name: 'plus' | 'pencil'
  size: number
  weight?: number
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="page-symbol"
    >
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth={weight}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {name === 'plus' ? (
          <path d="M8 2.5v11M2.5 8h11" />
        ) : (
          <path d="M10.6 2.6a1.5 1.5 0 0 1 2.1 0l.7.7a1.5 1.5 0 0 1 0 2.1L6 12.8l-3.4.8.8-3.4ZM9.4 3.8l2.8 2.8" />
        )}
      </g>
    </svg>
  )
}

// MARK: A page's head and words

/** A page's head (48), the iPhone's (`PageHead`): the icon, the name (13 medium) with its line under it, the action at the right. */
export function PageHead({
  name,
  icon,
  meta,
  action,
}: {
  name: string
  icon: ReactNode
  meta?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="page-head">
      {icon}
      <div className="page-head-words">
        <span className="page-head-name">{name}</span>
        {meta}
      </div>
      {action}
    </div>
  )
}

/** A page's description (`Description`): the row's type in grey, 3 between its lines, wrapped, its words selectable. */
export function Description({ text }: { text: string }) {
  return <p className="page-description">{text}</p>
}

/** Under a page's name (`MetaLine`): the marketplace's name and View Source ↗ (12, grey, darker under the pointer), joined by "·". */
export function MetaLine({
  market,
  homepage,
}: {
  market?: string
  homepage?: string
}) {
  const source = webAddress(homepage)
  if (market === undefined && source === undefined) return null
  return (
    <span className="page-meta">
      {market !== undefined && <span>{market}</span>}
      {market !== undefined && source !== undefined && <span>·</span>}
      {source !== undefined && (
        <a
          className="page-meta-source"
          href={source}
          target="_blank"
          rel="noopener noreferrer"
        >
          {t('View Source')}
          <SettingsSymbol name="arrowUpRight" size={11} weight={1.4} />
        </a>
      )}
    </span>
  )
}

/** An address a link may open: http or https only (a catalogue's homepage could hold anything). */
export function webAddress(address: string | undefined): string | undefined {
  if (address === undefined) return undefined
  try {
    const url = new URL(address)
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? address
      : undefined
  } catch {
    return undefined
  }
}

// MARK: The examples on the picture

/** The founder's blue picture behind every connector's examples (the Mac's asset `ConnectorHero`), shipped with the app. */
const heroPicture = new URL(
  '../../../../../mac/Simeon/Assets.xcassets/ConnectorHero.imageset/connector-hero.jpg',
  import.meta.url,
).href

/** The names in the examples are read as a message's with no agents: apps only, and nothing opens. */
const exampleNames: MentionSetting = {
  agents: [],
  introducing: false,
  picture: () => undefined,
  open: () => {},
}

/**
 * The card of three messages a person might send their agent naming the
 * connector (`ExamplesCard`), on the founder's blue picture, the same for
 * every connector: each in a light pill (13 on 18, centred, 16 and 9 in,
 * 17 round, at most 520), 10 apart, the name in its colour with its logo
 * as in a chat. They show what to ask; a click does nothing. On dark, the
 * picture dimmed and the pills dark.
 */
export function ExamplesCard({ examples }: { examples: readonly string[] }) {
  return (
    <div
      className="page-examples"
      style={{ '--hero': `url("${heroPicture}")` } as CSSProperties}
    >
      <MentionContext.Provider value={exampleNames}>
        {examples.map((example) => (
          <p key={example} className="page-example">
            <Line markdown={example} />
          </p>
        ))}
      </MentionContext.Provider>
    </div>
  )
}

// MARK: Cards and rows

/** A page's group (`PageCard`), Settings': its heading (13 medium, grey) over its rows on the grey, 16 round. */
export function PageCard({
  heading,
  children,
}: {
  heading?: string
  children: ReactNode
}) {
  return <SettingsGroup title={heading}>{children}</SettingsGroup>
}

/** A group's row (`CardRow`, Settings' row: 18 in, 14 above and below, at least 56, its parts 8 apart): Settings' line above it when it follows another. */
export function CardRow({
  divided,
  className,
  children,
}: {
  divided?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <div className={classes('page-row', divided && 'divided', className)}>
      {children}
    </div>
  )
}

/**
 * Words on one line cut in their middle when they don't fit
 * ("policies.goo…le.com"), as the Mac's `.truncationMode(.middle)`: the
 * element asks for the room its whole words take (and `reserve` more, for
 * what follows them in it) and no more, and its words are cut to the room
 * it is given.
 */
function useMiddleCut<Element extends HTMLElement>(
  words: string,
  reserve = 0,
): [RefObject<Element | null>, string] {
  const element = useRef<Element>(null)
  const [shown, setShown] = useState(words)
  useLayoutEffect(() => {
    const line = element.current
    const pen = line && document.createElement('canvas').getContext('2d')
    if (!line || !pen) return
    const style = getComputedStyle(line)
    pen.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
    const width = (some: string) => pen.measureText(some).width
    line.style.flexBasis = `${Math.ceil(width(words) + reserve) + 1}px`
    const fit = () =>
      setShown(middleCut(words, line.clientWidth - reserve, width))
    fit()
    const watch = new ResizeObserver(fit)
    watch.observe(line)
    return () => watch.disconnect()
  }, [words, reserve])
  return [element, shown]
}

/** Details' line (`DetailPair`): the term, then its value in the faint grey at the right, cut in its middle with the whole as its tooltip. */
export function DetailPair({ term, value }: { term: string; value: string }) {
  const [box, shown] = useMiddleCut<HTMLSpanElement>(value)
  return (
    <span className="page-pair">
      <span className="page-term">{term}</span>
      <span className="page-spacer" />
      <span ref={box} className="page-pair-value" title={value}>
        {shown}
      </span>
    </span>
  )
}

// MARK: Information

/** A link's line (`InformationLink`): the term, then the address's host in the link blue with ↗ (10, 3 after it), opened in a new tab; the whole address as its tooltip. */
function InformationLink({ term, address }: { term: string; address: string }) {
  const [link, shown] = useMiddleCut<HTMLAnchorElement>(
    shownAddress(address),
    13,
  )
  return (
    <span className="page-pair">
      <span className="page-term">{term}</span>
      <span className="page-spacer" />
      <a
        ref={link}
        className="page-link"
        href={address}
        target="_blank"
        rel="noopener noreferrer"
        title={address}
      >
        <span className="page-link-host">{shown}</span>
        <SettingsSymbol name="arrowUpRight" size={10} weight={1.6} />
      </a>
    </span>
  )
}

/** Information (`InformationCard`, the reference's): Category, Developer, and the maker's website, privacy policy and terms, each opened in a new tab. Nothing when there is nothing to say. */
export function InformationCard({
  category,
  page,
  homepage,
}: {
  category: string
  page?: ConnectorPage
  homepage?: string
}) {
  const words = informationWords
  const website = webAddress(page?.website ?? homepage)
  const links: [string, string][] = []
  if (website !== undefined) links.push([words.website(), website])
  if (page) {
    const privacy = webAddress(page.privacy)
    const terms = webAddress(page.terms)
    if (privacy !== undefined) links.push([words.privacy(), privacy])
    if (terms !== undefined) links.push([words.terms(), terms])
  }
  if (category === '' && !page && links.length === 0) return null
  return (
    <PageCard heading={words.information()}>
      {category !== '' && (
        <CardRow>
          <DetailPair term={words.category()} value={category} />
        </CardRow>
      )}
      {page && (
        <CardRow divided={category !== ''}>
          <DetailPair term={words.developer()} value={page.maker} />
        </CardRow>
      )}
      {links.map(([term, address], index) => (
        <CardRow
          key={term}
          divided={index > 0 || category !== '' || page !== undefined}
        >
          <InformationLink term={term} address={address} />
        </CardRow>
      ))}
    </PageCard>
  )
}

// MARK: Actions

/** Connect in a connector page's head (`ConnectPill`, the reference's Install plugin): a plus and the word in the ground's colour on the ink, 30 high. */
export function ConnectPill({
  label,
  disabled,
  onClick,
}: {
  /** For the ear: "Connect Gmail". */
  label: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className="page-connect"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      <PageSymbol name="plus" size={12} weight={1.9} />
      {coreT('Connect')}
    </button>
  )
}

/** Uninstall for what the person added, Remove for what the team added (`RemoveGroup`, the iPhone's): a red row in a group of its own, at the page's foot. No question asked. */
export function RemoveGroup({
  kind,
  disabled,
  onRemove,
}: {
  kind: 'uninstall' | 'remove' | undefined
  disabled?: boolean
  onRemove: () => void
}) {
  if (kind === undefined) return null
  return (
    <div className="page-remove">
      <SettingsGroup>
        <SettingsActionRow
          title={kind === 'uninstall' ? t('Uninstall') : t('Remove')}
          destructive
          disabled={disabled}
          onClick={onRemove}
        />
      </SettingsGroup>
    </div>
  )
}

// MARK: The folds

/** The fold (`FoldShell`): a summary row that opens and shuts it (the chevron turns in 0.12 s; the rows come at once), then what stays under it. */
export function FoldShell({
  heading,
  summary,
  children,
  footer,
}: {
  heading: string
  summary: string
  children: ReactNode
  footer?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const rows = useId()
  return (
    <PageCard heading={heading}>
      <button
        type="button"
        className="page-fold"
        aria-expanded={open}
        aria-controls={rows}
        onClick={() => setOpen(!open)}
      >
        <span className="page-fold-summary">{summary}</span>
        <span className={classes('page-fold-chevron', open && 'open')}>
          <SettingsSymbol name="chevronDown" size={10} weight={1.6} />
        </span>
      </button>
      <div id={rows} className="page-fold-rows" hidden={!open}>
        {open && children}
      </div>
      {footer}
    </PageCard>
  )
}

/** A folded card (`FoldCard`): its summary ("1 connector", "2 skills"), then each line, the name at the left and what it does at the right, cut short with the whole as its tooltip. */
export function FoldCard({
  heading,
  summary,
  rows,
}: {
  heading: string
  summary: string
  rows: readonly (readonly [name: string, does: string])[]
}) {
  return (
    <FoldShell heading={heading} summary={summary}>
      {rows.map(([name, does], index) => (
        <CardRow key={index} divided>
          <span className="page-fold-name">{name}</span>
          <span className="page-spacer wide" />
          <span className="page-fold-does" title={does}>
            {does}
          </span>
        </CardRow>
      ))}
    </FoldShell>
  )
}

// MARK: Accounts and tools

/** One of the computer's accounts of a server (`AccountsCard`'s row): its name, its status in its tone, an error's detail, and its sign-in when it needs one. */
export interface ServerAccountRow {
  label: string
  status: string
  tone: 'success' | 'warning' | 'danger' | 'tertiary'
  /** An error's detail, under the status. */
  detail?: string
  /** Connect, Reopen or Retry, when it needs signing in. */
  signIn?: { title: string; disabled: boolean; go: () => void }
}

/** Accounts (`AccountsCard`): one row each, the default first. Nothing without rows. */
export function ServerAccountsCard({
  rows,
}: {
  rows: readonly ServerAccountRow[]
}) {
  if (rows.length === 0) return null
  return (
    <PageCard heading={t('Accounts')}>
      {rows.map((row, index) => (
        <CardRow key={index} divided={index > 0}>
          <span className="page-account">
            <span className="page-account-title">{row.label}</span>
            <span className={`page-account-status ${row.tone}`}>
              {row.status}
            </span>
            {row.detail !== undefined && (
              <span className="page-account-detail">{row.detail}</span>
            )}
          </span>
          {row.signIn && (
            <PluginPill
              title={row.signIn.title}
              disabled={row.signIn.disabled}
              onClick={row.signIn.go}
            />
          )}
        </CardRow>
      ))}
    </PageCard>
  )
}

/**
 * The accounts Simeon Labs' server keeps for an app (`AppAccountsCard`'s
 * card; the iPhone's `appAccountsSection`): each by the name the person gave
 * it or who it signs in as, Connected, the pencil to name it, and Remove
 * while another stays; Add Another Account below them while there is room
 * (the spinner while its sign-in is open; it waits while another app's is).
 */
export function AppAccountsList({
  name,
  accounts,
  canAdd,
  adding,
  addDisabled,
  add,
  rename,
  remove,
}: {
  /** The app's name ("Gmail"). */
  name: string
  accounts: readonly AppAccount[]
  canAdd: boolean
  adding: boolean
  addDisabled: boolean
  add: () => void
  rename: (account: AppAccount, name: string) => void
  remove: (account: AppAccount) => void
}) {
  const [renaming, setRenaming] = useState<AppAccount>()
  return (
    <PageCard heading={t('Accounts')}>
      {accounts.map((account, place) => {
        const title = accountTitle(account, place + 1)
        const detail = accountDetail(account)
        return (
          <CardRow key={account.id} divided={place > 0}>
            <span className="page-account">
              <span className="page-account-title">{title}</span>
              <span className="page-account-line">
                <span className="page-account-status success">
                  {coreT('Connected')}
                </span>
                {detail !== undefined && (
                  <span className="page-account-who">{`· ${detail}`}</span>
                )}
              </span>
            </span>
            <button
              type="button"
              className="page-pencil"
              title={t('Rename')}
              aria-label={t`Rename ${title}`}
              onClick={() => setRenaming(account)}
            >
              <PageSymbol name="pencil" size={13} weight={1.25} />
            </button>
            {accounts.length > 1 && (
              <PluginPill title={t('Remove')} onClick={() => remove(account)} />
            )}
          </CardRow>
        )
      })}
      {canAdd && (
        <CardRow divided>
          {adding ? (
            <>
              <AddingSpinner name={name} />
              <span className="page-spacer" />
            </>
          ) : (
            <button
              type="button"
              className="page-add-account"
              disabled={addDisabled}
              onClick={add}
            >
              <PageSymbol name="plus" size={12} weight={1.6} />
              {t('Add Another Account')}
            </button>
          )}
        </CardRow>
      )}
      {renaming && (
        <RenameAlert
          account={renaming}
          rename={(next) => {
            setRenaming(undefined)
            rename(renaming, next)
          }}
          cancel={() => setRenaming(undefined)}
        />
      )}
    </PageCard>
  )
}

/**
 * The pencil's question (the Mac's alert with a field, "Rename account"):
 * the window's own alert, the field holding the account's name (who it signs
 * in as, or "Account name", when it has none), Cancel and Rename. Return
 * renames, Escape cancels.
 */
function RenameAlert({
  account,
  rename,
  cancel,
}: {
  account: AppAccount
  rename: (name: string) => void
  cancel: () => void
}) {
  const [name, setName] = useState(account.name ?? '')
  const field = useRef<HTMLInputElement>(null)
  const latest = useRef(cancel)
  useEffect(() => {
    latest.current = cancel
  })
  // The field takes the keys as the alert opens, and gives them back to what had them when it closes.
  useEffect(() => {
    const before =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    field.current?.focus()
    field.current?.select()
    return () => {
      if (before?.isConnected) before.focus()
    }
  }, [])
  // Escape over the window, before anything under it (the panel's own).
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (event.isComposing || event.keyCode === 229) return
      event.preventDefault()
      event.stopPropagation()
      latest.current()
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [])
  const title = t('Rename account')
  return (
    <div
      className="sheet-scrim"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) event.preventDefault()
      }}
    >
      <form
        className="alert"
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onSubmit={(event) => {
          event.preventDefault()
          rename(name)
        }}
      >
        <img
          className="alert-mark"
          src={`${import.meta.env.BASE_URL}favicon.svg`}
          alt=""
          aria-hidden="true"
        />
        <div className="alert-title">{title}</div>
        <input
          ref={field}
          className="page-alert-field"
          value={name}
          placeholder={account.identity ?? t('Account name')}
          aria-label={t('Account name')}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setName(event.target.value)}
        />
        <div className="alert-buttons">
          <button type="button" className="alert-button" onClick={cancel}>
            {t('Cancel')}
          </button>
          <button type="submit" className="alert-button default">
            {t('Rename')}
          </button>
        </div>
      </form>
    </div>
  )
}

/** One tool of a server, as its card lists it. */
export interface ToolLine {
  /** Its name as shown (`Plugins.toolNames`). */
  name: string
  description: string
  on: boolean
}

/** Tools (`ToolsCard`): folded, "n of m enabled"; open, each tool's name (its description as its tooltip) and its switch, changed at once; a failure under them, in red. Nothing without tools. */
export function ToolsCard({
  summary,
  tools,
  failure,
  toggle,
}: {
  summary: string
  tools: readonly ToolLine[]
  failure?: string
  toggle: (index: number) => void
}) {
  if (tools.length === 0) return null
  return (
    <FoldShell
      heading={t('Tools')}
      summary={summary}
      footer={
        failure !== undefined && (
          <CardRow divided>
            <span className="page-failure">{failure}</span>
          </CardRow>
        )
      }
    >
      {tools.map((tool, index) => {
        const label = tool.on ? t`Disable ${tool.name}` : t`Enable ${tool.name}`
        return (
          <CardRow key={`${tool.name}\u001f${index}`} divided>
            <span className="page-tool" title={tool.description}>
              {tool.name}
            </span>
            <PluginSwitch
              on={tool.on}
              label={label}
              flip={() => toggle(index)}
            />
          </CardRow>
        )
      })}
    </FoldShell>
  )
}

// MARK: Fields

/**
 * A setup value's field (`SetupField`: 32, 8 round, padded 10, 13): white
 * with a faint ring (light) or the grey (dark); the blue edge with the
 * keys, red when it is missing. Its words are the browser's, never the
 * page's (a secret's especially): read when sent. A secret is masked and
 * never offered the person's saved logins.
 */
export function SetupField({
  label,
  secret,
  placeholder,
  initial,
  invalid,
  field,
  filled,
  submit,
}: {
  label: string
  secret: boolean
  placeholder: string
  /** What it starts with: the field's default (current values are never shown). */
  initial: string
  invalid: boolean
  field: (input: HTMLInputElement | null) => void
  /** Told whether it holds more than spaces, as it changes; never what. */
  filled: (filled: boolean) => void
  submit: () => void
}) {
  return (
    <input
      ref={field}
      className={classes('page-setup-field', invalid && 'invalid')}
      type={secret ? 'password' : 'text'}
      defaultValue={initial}
      placeholder={placeholder}
      aria-label={label}
      aria-invalid={invalid || undefined}
      autoComplete={secret ? 'new-password' : 'off'}
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      {...(secret
        ? {
            'data-1p-ignore': 'true',
            'data-lpignore': 'true',
            'data-bwignore': 'true',
            'data-form-type': 'other',
          }
        : {})}
      onInput={(event) => filled(event.currentTarget.value.trim() !== '')}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
          event.preventDefault()
          submit()
        }
      }}
    />
  )
}

/** A skill's field (`SkillField`): its label (a group's name, 13 medium, grey) 8 over an 8-round field (at least 32, padded 7 and 10), the row's type; the instructions' field at least 80 and growing with its words. */
export function SkillField({
  label,
  value,
  placeholder,
  lines,
  disabled,
  change,
}: {
  label: string
  value: string
  placeholder: string
  lines?: boolean
  disabled?: boolean
  change: (value: string) => void
}) {
  const id = useId()
  return (
    <div className="page-skill-field">
      <label className="page-skill-label" htmlFor={id}>
        {label}
      </label>
      {lines ? (
        <textarea
          id={id}
          className="page-skill-input lines"
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          spellCheck={false}
          autoCorrect="off"
          onChange={(event) => change(event.target.value)}
        />
      ) : (
        <input
          id={id}
          className="page-skill-input"
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          spellCheck={false}
          autoCorrect="off"
          autoComplete="off"
          onChange={(event) => change(event.target.value)}
        />
      )}
    </div>
  )
}
