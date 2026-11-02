// Connectors (mac/Simeon/PluginsWindow.swift 1-1125, `overlay:plugins`;
// "Plugins" until 13 October 2026): in Settings' place over the whole
// window (`model.overlay`, kind `connectors`; one overlay at a time), the
// same dim and panel. "Connectors", the search with the categories beside
// it, Available | Yours as the reference's two halves; the catalogue by
// section, two apps to a line, each section's first six under its name and
// its ›, which opens all of its apps; Yours with the GitHub banner,
// Installed and the open agent's private skills; each app's icon, its name
// over what it does, and + at the row's end (the green tick once it is in,
// the spinner while it connects, "Coming soon" said quietly); the notice at
// the foot. A page (an app's, a server's, the setup page, a skill's: step
// 6d's, ConnectorPages.tsx) stands over the list with Back, and the list
// stays drawn under it so Back finds it where it was.
//
// Opened by Connect apps, ⌘K and "/", ⌘⇧M and ⌘⇧W (Control off a Mac),
// and an ask for an app's page (Wallet's rows). Each opening is drawn afresh
// and reads the computer; its servers are read every 15 s while it is open
// and when the window comes forward, the skills when the open agent
// changes. ⌘F (Control-F off a Mac) gives the search the keys on the list;
// Escape clears the search, then lets go of the field, then closes; × or a
// click on the dim closes; closing forgets the view (`PluginsModel.reset`).

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { appLogo, comingSoonWord, connectedWord } from '../core/connectCards'
import { connectWord } from '../core/connecting'
import {
  type AgentSkill,
  type PluginEntry,
  type PluginItem,
  type PluginServer,
  authBlockedLine,
  connectorList,
  entryContributions,
  entryForServer,
  entryKept,
  filterIsAll,
  itemKept,
  itemKeptByQuery,
  pluginItems,
  pluginSections,
  privateSkills,
  searchCatalog,
  searchServers,
  serverContributions,
  skillKept,
  skillSubtitle,
  statusWord,
} from '../core/plugins'
import {
  installedEmpty,
  marketplaceEmpty,
  modeLabel,
  noFilterMatch,
  privateEmpty,
  signInButton,
  teamMark,
  tone,
} from '../core/pluginsOverlay'
import type { AppStore } from '../core/store'
import { t } from '../l10n'
import { classes } from './classes'
import { AppLogoTile } from './ConnectCards'
import { useConnector } from './connector'
import { PluginPages, pluginPageTitle } from './ConnectorPages'
import './Connectors.css'
import { ContextMenu, type MenuLine } from './ContextMenu'
import { apple } from './keys'
import { PluginsModel, type PluginsPage } from './pluginsModel'
import { PanelDisc, SettingsSymbol } from './SettingsParts'
import { overSlot } from './SettingsWindow'
import { listOrder } from './Sidebar'
import { useWatched } from './useStore'
import { type WindowModel, useWindowModel } from './windowModel'

/** How many of a section's apps Available shows under its name (two columns of three, the founder's reference); the name opens the rest (`PluginsPreview.count`). */
const previewCount = 6

/**
 * A press outside an open menu only closes it, as the Mac's menu takes that
 * click: what it lands on (×, a row, +, the dim, the button that opened the
 * menu) does nothing. Its press is kept from focusing or closing anything
 * (`preventDefault`), and the click that follows it is swallowed.
 */
function swallowNextClick(): void {
  const swallow = (event: MouseEvent) => {
    event.stopPropagation()
    event.preventDefault()
    done()
  }
  // The click comes in the same task as its mouseup; none came (a drag off the window), let go.
  const later = () => setTimeout(done, 0)
  const done = () => {
    window.removeEventListener('click', swallow, true)
    window.removeEventListener('mouseup', later, true)
  }
  window.addEventListener('click', swallow, true)
  window.addEventListener('mouseup', later, true)
}

// MARK: Symbols (SF Symbols, outlined on a 16 grid)

type ConnectorsSymbolName =
  | 'magnifyingglass'
  | 'person2'
  | 'listBulletRectangle'
  | 'plus'
  | 'checkmark'

const symbols: Record<ConnectorsSymbolName, React.ReactNode> = {
  magnifyingglass: (
    <>
      <circle cx="6.8" cy="6.8" r="4.6" />
      <path d="M10.2 10.2 14 14" />
    </>
  ),
  person2: (
    <>
      <circle cx="5.8" cy="5.4" r="2.3" />
      <path d="M1.6 13.2c.4-2.3 2.1-3.7 4.2-3.7s3.8 1.4 4.2 3.7Z" />
      <path d="M10.4 3.4a2.2 2.2 0 1 1 .3 4.3M11.4 9.6c1.6.3 2.7 1.6 3 3.4h-2.6" />
    </>
  ),
  listBulletRectangle: (
    <>
      <rect x="1.5" y="2.5" width="13" height="11" rx="2.2" />
      <path d="M7 6h4.8M7 8h4.8M7 10h4.8" />
      <circle cx="4.6" cy="6" r=".35" />
      <circle cx="4.6" cy="8" r=".35" />
      <circle cx="4.6" cy="10" r=".35" />
    </>
  ),
  plus: <path d="M8 2.5v11M2.5 8h11" />,
  checkmark: <path d="M3 8.6 6.4 12 13 4.4" />,
}

function ConnectorsSymbol({
  name,
  size,
  weight,
}: {
  name: ConnectorsSymbolName
  size: number
  weight: number
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth={weight}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {symbols[name]}
      </g>
    </svg>
  )
}

/** `xmark.circle.fill`: a filled disc with its × cut out. */
function ClearSymbol({ size }: { size: number }) {
  const id = useId()
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <mask id={id}>
        <rect width="16" height="16" fill="#fff" />
        <path
          d="M5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8"
          stroke="#000"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </mask>
      <circle cx="8" cy="8" r="7" fill="currentColor" mask={`url(#${id})`} />
    </svg>
  )
}

// MARK: The row's parts (`PluginIcon`, `SkillTile`, `PluginPill`, the marks), shared with the pages (6d)

/**
 * An app's icon (`PluginIcon`), as the iPhone draws it: the app's own icon,
 * whole, with an app icon's corners and a hairline (`AppLogoTile`, step
 * 3c); else its logo at 76% of a white tile with a hairline (the raised
 * grey on dark), the one Simeon ships, else the catalogue's own read from
 * the computer (`resolvePluginLogo`); else its first letter. 36 on a row,
 * 48 on a page.
 */
export function PluginIcon({
  name,
  iconUrl,
  id,
  side = 36,
  model,
}: {
  name: string
  iconUrl?: string
  /** The catalogue's id, when the caller has it; the name finds the icon otherwise. */
  id?: string
  side?: number
  model: PluginsModel
}) {
  const logo = appLogo(name, id)
  const reads = logo.kind === 'letter' && iconUrl != null
  useEffect(() => {
    if (reads) void model.loadLogo(iconUrl)
  }, [model, reads, iconUrl])
  if (logo.kind === 'icon')
    return <AppLogoTile name={name} id={id} side={side} />
  const read = reads ? model.logos.get(iconUrl) : undefined
  return (
    <span
      className="plugin-tile"
      style={{
        width: side,
        height: side,
        borderRadius: (side * 11) / 40,
        fontSize: side * 0.36,
      }}
      aria-hidden="true"
    >
      {logo.kind === 'logo' ? (
        logo.mono ? (
          <span
            className="plugin-tile-mask"
            style={{
              maskImage: `url("${logo.url}")`,
              WebkitMaskImage: `url("${logo.url}")`,
            }}
          />
        ) : (
          <img src={logo.url} alt="" />
        )
      ) : read ? (
        <img src={read} alt="" />
      ) : (
        logo.letter
      )}
    </span>
  )
}

/** A skill's tile (`SkillTile`): the list mark on a faint fill, an app icon's corners (a row's, 36, without its edge; larger, with it). */
export function SkillTile({ side = 36 }: { side?: number }) {
  const row = side < 50
  return (
    <span
      className={classes('plugin-skill-tile', !row && 'large')}
      style={{ width: side, height: side, borderRadius: (side * 11) / 40 }}
      aria-hidden="true"
    >
      <ConnectorsSymbol
        name="listBulletRectangle"
        size={row ? 15 : 19}
        weight={1.2}
      />
    </span>
  )
}

/** Team (`TeamBadge`): people and "Team"; its tooltip the marketplace's name or the team's words. */
export function TeamBadge({ tip }: { tip: string }) {
  return (
    <span className="plugin-team" title={tip}>
      <ConnectorsSymbol name="person2" size={11} weight={1.2} />
      {t('Team')}
    </span>
  )
}

/**
 * A pill (`PluginPill`): secondary (the grey, darker under the pointer),
 * primary (Connect's blue), a team's label or Coming soon (neither a
 * button); faded while it waits.
 */
export function PluginPill({
  title,
  kind = 'secondary',
  disabled,
  label,
  onClick,
}: {
  title: string
  kind?: 'secondary' | 'primary' | 'label' | 'soon'
  disabled?: boolean
  /** Its name for a screen reader, when not its words. */
  label?: string
  onClick?: () => void
}) {
  if (kind === 'label' || kind === 'soon')
    return <span className={classes('plugin-pill', kind)}>{title}</span>
  return (
    <button
      type="button"
      className={classes('plugin-pill', kind, disabled && 'waiting')}
      disabled={disabled}
      aria-label={label}
      onClick={onClick}
    >
      {title}
    </button>
  )
}

/** While its add runs (`AddingSpinner`). */
export function AddingSpinner({ name }: { name: string }) {
  return (
    <span
      className="plugin-spinner"
      role="img"
      aria-label={t`Connecting ${name}`}
    />
  )
}

/** Connected (`AddedMark`; "Added" for a plugin of skills alone): the tick in green, its word for the ear and the pointer. Not a button. */
export function AddedMark({ title = connectedWord() }: { title?: string }) {
  return (
    <span className="plugin-added" title={title} role="img" aria-label={title}>
      <ConnectorsSymbol name="checkmark" size={13} weight={1.6} />
    </span>
  )
}

/** Connect (`PlusMark`): + in the ink, a faint disc under the pointer. */
export function PlusMark({
  disabled,
  label,
  onClick,
}: {
  disabled?: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className="plugin-plus"
      disabled={disabled}
      title={connectWord()}
      aria-label={label}
      onClick={onClick}
    >
      <ConnectorsSymbol name="plus" size={16} weight={1.1} />
    </button>
  )
}

/** An app that can't be added yet (`SoonWord`): said quietly, no +. */
export function SoonWord({ label }: { label?: string }) {
  // Its sentence ("Notion is coming soon") is what a screen reader says, as the Mac's label: a name on a plain span is not read.
  if (label != null)
    return (
      <span className="plugin-soon" role="img" aria-label={label}>
        {comingSoonWord()}
      </span>
    )
  return <span className="plugin-soon">{comingSoonWord()}</span>
}

/** A status (`StatusWord`): its word, green, orange, red or grey; an error's detail as its tooltip. */
export function StatusWord({
  status,
  detail,
}: {
  status: string
  detail?: string
}) {
  return (
    <span
      className={classes('plugin-status', tone(status))}
      title={status === 'error' ? (detail ?? '') : undefined}
    >
      {statusWord(status)}
    </span>
  )
}

/** The iPhone's switch (`PluginSwitch`): Apple's, in Settings' blue; changed at once. */
export function PluginSwitch({
  on,
  label,
  disabled,
  flip,
}: {
  on: boolean
  label: string
  disabled?: boolean
  flip: () => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={classes('settings-switch', on && 'on')}
      disabled={disabled}
      onClick={flip}
    >
      <span className="settings-switch-knob" />
    </button>
  )
}

// MARK: Rows

/**
 * A row (`PluginRow`), the founder's reference and the iPhone's `AppRow`:
 * the open part (the icon, then the name with its Team mark over what it
 * does, each cut short) and its mark. No card and no line: the grey under
 * the pointer.
 */
function PluginRow({
  title,
  line,
  team,
  dimmed,
  icon,
  open,
  children,
}: {
  title: string
  line: string
  team?: string
  dimmed?: boolean
  icon: React.ReactNode
  open: () => void
  children?: React.ReactNode
}) {
  return (
    <div className="connectors-row">
      <button
        type="button"
        className={classes('connectors-row-open', dimmed && 'dimmed')}
        aria-label={t`Open ${title}`}
        onClick={open}
      >
        {icon}
        <span className="connectors-row-words">
          <span className="connectors-row-title">
            <span className="connectors-row-name">{title}</span>
            {team != null && <TeamBadge tip={team} />}
          </span>
          {line !== '' && <span className="connectors-row-line">{line}</span>}
        </span>
      </button>
      {children != null && children !== false && (
        <span className="connectors-row-end">{children}</span>
      )}
    </div>
  )
}

/**
 * A server at a row's end (`ServerMark`), as the iPhone's rows end: the
 * green tick once it is signed in; + when it waits on a sign-in (+ then
 * only signs it in), or Reopen and Retry while its page is open or has
 * waited too long; else its status word.
 */
function ServerMark({
  server,
  name,
  model,
}: {
  server: PluginServer
  name: string
  model: PluginsModel
}) {
  if (server.status === 'connected') return <AddedMark />
  if (server.status === 'needsAuth') {
    const state = model.signInState(server, server.accountKey)
    const go = () => model.requestSignIn(server, server.accountKey)
    if (state === 'none')
      return (
        <PlusMark
          disabled={model.isBusy}
          label={t`Connect ${name}`}
          onClick={go}
        />
      )
    return (
      <PluginPill
        title={signInButton(state)}
        disabled={model.isBusy}
        label={t`Connect ${name}`}
        onClick={go}
      />
    )
  }
  return <StatusWord status={server.status} detail={server.statusDetail} />
}

/** A section's name (`SectionHeading`), with its › opening all its apps when it has a page. */
function SectionHeading({ title, open }: { title: string; open?: () => void }) {
  if (!open) return <h3 className="connectors-heading">{title}</h3>
  return (
    <h3 className="connectors-heading">
      <button
        type="button"
        className="connectors-heading-button"
        aria-description={t`Shows every app in ${title}`}
        onClick={open}
      >
        <span>{title}</span>
        <span className="connectors-heading-chevron">
          <SettingsSymbol name="chevronRight" size={9} weight={1.6} />
        </span>
      </button>
    </h3>
  )
}

function EmptyLine({ text, first }: { text: string; first?: boolean }) {
  return <p className={classes('connectors-empty', first && 'first')}>{text}</p>
}

/** A section of Available (`MarketplaceSection`): its name over its apps (none on its own page). */
function MarketplaceSection({
  title,
  entries,
  model,
  open,
}: {
  title?: string
  entries: readonly PluginEntry[]
  model: PluginsModel
  open?: () => void
}) {
  return (
    <section>
      {title != null && <SectionHeading title={title} open={open} />}
      <div className="connectors-grid">
        {entries.map((entry) => (
          <MarketplaceRow key={entry.id} entry={entry} model={model} />
        ))}
      </div>
    </section>
  )
}

/** An app of Available: +, the spinner, the tick or its sign-in, or Coming soon, dimmed (`AppsComingSoon`). */
function MarketplaceRow({
  entry,
  model,
}: {
  entry: PluginEntry
  model: PluginsModel
}) {
  const installed = model.installed(entry).isInstalled
  const soon = !installed && model.comingSoon(entry)
  let mark: React.ReactNode
  if (model.adding === entry.id)
    mark = <AddingSpinner name={entry.displayName} />
  else if (installed) {
    const server = model.serverState(entry)
    mark =
      connectorList(entry).length === 0 || !server ? (
        <AddedMark title={t('Added')} />
      ) : (
        <ServerMark server={server} name={entry.displayName} model={model} />
      )
  } else if (soon)
    mark = <SoonWord label={t`${entry.displayName} is coming soon`} />
  else
    mark = (
      <PlusMark
        disabled={model.isBusy}
        label={t`Connect ${entry.displayName}`}
        onClick={() => model.requestAdd(entry, model.agentId)}
      />
    )
  return (
    <PluginRow
      title={entry.displayName}
      line={entry.description}
      team={teamMark(entry)}
      dimmed={soon}
      icon={
        <PluginIcon
          name={entry.displayName}
          iconUrl={entry.iconUrl}
          id={entry.id}
          model={model}
        />
      }
      open={() => model.push({ kind: 'plugin', id: entry.id })}
    >
      {mark}
    </PluginRow>
  )
}

/** What Available lists: the catalogue as the search, the filter and the category keep it. */
function marketplaceEntries(model: PluginsModel): PluginEntry[] {
  const kept = searchCatalog(model.catalog, model.query).filter((entry) =>
    entryKept(entry, model.marketplaceFilter),
  )
  const section =
    model.category != null
      ? pluginSections(model.catalog).find((one) => one.key === model.category)
      : undefined
  if (!section) return kept
  const ids = new Set(section.items.map((entry) => entry.id))
  return kept.filter((entry) => ids.has(entry.id))
}

/** Available (`MarketplaceList`): the sections, each its first six under its name and ›; "Results" while searching; a category alone, every app in it. */
function MarketplaceList({ model }: { model: PluginsModel }) {
  const entries = marketplaceEntries(model)
  const searching = model.query.trim() !== ''
  if (entries.length === 0)
    return (
      <EmptyLine
        first
        text={marketplaceEmpty(
          model.catalogLoaded,
          model.catalog.length === 0,
          !filterIsAll(model.marketplaceFilter) || model.category != null,
          model.query,
        )}
      />
    )
  if (searching)
    return (
      <MarketplaceSection
        title={t('Results')}
        entries={entries}
        model={model}
      />
    )
  const sections = pluginSections(entries)
  if (model.category != null)
    return sections.map((section) => (
      <MarketplaceSection
        key={section.key}
        title={section.title}
        entries={section.items}
        model={model}
      />
    ))
  return sections.map((section) => (
    <MarketplaceSection
      key={section.key}
      title={section.title}
      entries={section.items.slice(0, previewCount)}
      model={model}
      open={() => model.push({ kind: 'category', key: section.key })}
    />
  ))
}

/** A section's apps on a page of their own (`CategoryPage`): all of them, in two columns. */
function CategoryPage({
  sectionKey,
  model,
}: {
  sectionKey: string
  model: PluginsModel
}) {
  const section = pluginSections(
    model.catalog.filter((entry) => entryKept(entry, model.marketplaceFilter)),
  ).find((one) => one.key === sectionKey)
  return (
    <div className="connectors-category-page">
      {section ? (
        <MarketplaceSection entries={section.items} model={model} />
      ) : (
        <EmptyLine text={noFilterMatch()} />
      )}
    </div>
  )
}

/** A row of Installed (`InstalledRow`): a plugin with its first connector's state, or a server of its own. */
function InstalledRow({
  item,
  model,
}: {
  item: PluginItem
  model: PluginsModel
}) {
  if (item.kind === 'plugin') {
    const first = item.connectors[0]
    return (
      <PluginRow
        title={item.entry.displayName}
        line={entryContributions(item.entry)}
        team={modeLabel(item.installMode)}
        icon={
          <PluginIcon
            name={item.entry.displayName}
            iconUrl={item.entry.iconUrl}
            id={item.entry.id}
            model={model}
          />
        }
        open={() => model.push({ kind: 'plugin', id: item.entry.id })}
      >
        {first && (
          <ServerMark
            server={first}
            name={item.entry.displayName}
            model={model}
          />
        )}
      </PluginRow>
    )
  }
  const server = item.server
  const entry = entryForServer(server, model.catalog)
  return (
    <PluginRow
      title={server.name}
      line={serverContributions(server, model.catalog)}
      team={modeLabel(item.installMode)}
      icon={
        <PluginIcon
          name={server.name}
          iconUrl={entry?.iconUrl}
          id={entry?.id}
          model={model}
        />
      }
      open={() => model.push({ kind: 'installed', id: server.id })}
    >
      <ServerMark server={server} name={server.name} model={model} />
    </PluginRow>
  )
}

/** A private skill: its switch for a skill made here. */
function SkillRow({
  skill,
  model,
}: {
  skill: AgentSkill
  model: PluginsModel
}) {
  return (
    <PluginRow
      title={skill.name}
      line={skillSubtitle(skill)}
      icon={<SkillTile />}
      open={() => model.push({ kind: 'skill', id: skill.id })}
    >
      {skill.source === 'workflow' && (
        <PluginSwitch
          on={skill.isEnabledForAgent}
          label={t`Enable ${skill.name}`}
          flip={() => void model.setEnabled(skill, model.agentId)}
        />
      )}
    </PluginRow>
  )
}

/**
 * The GitHub banner (`GitHubBanner`): what can't be fetched, and Fix with
 * agent ("Opening…" while it starts), which opens the Plugin Setup agent's
 * chat and closes Connectors.
 */
function GitHubBanner({
  model,
  window: win,
}: {
  model: PluginsModel
  window: WindowModel
}) {
  return (
    <div
      className="connectors-banner"
      role="group"
      aria-label={t('Plugin content needs GitHub authentication')}
    >
      <span className="connectors-banner-words">
        <span className="connectors-banner-title">
          {t('Complete GitHub auth to sync installed plugins')}
        </span>
        <span className="connectors-banner-line">
          {authBlockedLine(model.authBlocked)}
        </span>
      </span>
      <PluginPill
        title={model.launchingFix ? t('Opening…') : t('Fix with agent')}
        disabled={model.launchingFix}
        onClick={() => {
          void model.fixWithAgent().then((id) => {
            if (id == null) return
            win.choose(id)
            win.closeConnectors()
          })
        }}
      />
    </div>
  )
}

/** Yours (`YoursList`): the GitHub banner, Installed (all of them), Private (the open agent's skills). */
function YoursList({
  model,
  window: win,
}: {
  model: PluginsModel
  window: WindowModel
}) {
  const q = model.query.trim()
  const filter = model.yoursFilter
  const found = searchServers(model.onePerServer, q)
  const items = pluginItems(found, model.catalog, model.plugins).filter(
    (item) => itemKeptByQuery(item, q) && itemKept(item, filter),
  )
  const skills = privateSkills(model.skills).filter(
    (skill) =>
      (q === '' || skill.name.toLowerCase().includes(q.toLowerCase())) &&
      skillKept(skill, filter),
  )
  const agentId = model.agentId
  const showsInstalled = filterIsAll(filter) || items.length > 0
  const showsPrivate =
    filterIsAll(filter) || agentId == null || skills.length > 0
  return (
    <>
      {model.authBlocked.length > 0 && (
        <GitHubBanner model={model} window={win} />
      )}
      {!showsInstalled && !showsPrivate && <EmptyLine text={noFilterMatch()} />}
      {showsInstalled && (
        <section>
          <SectionHeading title={t('Installed')} />
          {items.length === 0 ? (
            <EmptyLine text={installedEmpty(q)} />
          ) : (
            <div className="connectors-grid">
              {items.map((item, index) => (
                <InstalledRow key={index} item={item} model={model} />
              ))}
            </div>
          )}
        </section>
      )}
      {showsPrivate && (
        <section>
          <SectionHeading title={t('Private')} />
          {agentId == null || skills.length === 0 ? (
            <EmptyLine text={privateEmpty(agentId != null, q)} />
          ) : (
            <div className="connectors-grid">
              {skills.map((skill) => (
                <SkillRow key={skill.id} skill={skill} model={model} />
              ))}
            </div>
          )}
        </section>
      )}
    </>
  )
}

// MARK: The bar

/** "Search connectors" (`PluginsSearch`): follows each key; ⌘F gives it the keys with its words picked. */
function ConnectorsSearch({ model }: { model: PluginsModel }) {
  const field = useRef<HTMLInputElement>(null)
  const asked = useRef(model.searchFocus)
  useEffect(() => {
    if (asked.current === model.searchFocus) return
    asked.current = model.searchFocus
    field.current?.focus()
    field.current?.select()
  }, [model.searchFocus])
  return (
    <div
      className="connectors-search"
      onMouseDown={(event) => {
        // A click anywhere in the capsule gives the field the keys (`onTapGesture`); not one that only closes a menu.
        if (event.defaultPrevented) return
        if (event.target !== field.current) {
          event.preventDefault()
          field.current?.focus()
        }
      }}
    >
      <span className="connectors-search-glass">
        <ConnectorsSymbol name="magnifyingglass" size={13} weight={1.4} />
      </span>
      <input
        ref={field}
        type="text"
        value={model.query}
        placeholder={t('Search connectors')}
        aria-label={t('Search connectors')}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        onChange={(event) => model.setQuery(event.target.value)}
      />
      {model.query !== '' && (
        <button
          type="button"
          className="connectors-search-clear"
          aria-label={t('Clear search')}
          onClick={() => model.setQuery('')}
        >
          <ClearSymbol size={13} />
        </button>
      )}
    </div>
  )
}

/**
 * The categories (`CategoryButton`), on Available only: "All Categories ⌄"
 * or the one chosen; the window's menu of them under it, All Categories
 * then each of Available's sections (Featured first, the rest A to Z), the
 * chosen one ticked.
 */
function CategoryButton({ model }: { model: PluginsModel }) {
  const button = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState<{ x: number; y: number; width: number }>()
  const menu = useRef<HTMLDivElement>(null)
  const nameId = useId()
  // While the menu is open, a press outside it only closes it (the window's `useDismiss` sees the press and closes the menu).
  useEffect(() => {
    if (!open) return
    const press = (event: MouseEvent) => {
      if (menu.current?.contains(event.target as Node)) return
      event.preventDefault()
      swallowNextClick()
    }
    window.addEventListener('mousedown', press, true)
    return () => window.removeEventListener('mousedown', press, true)
  }, [open])
  if (model.tab !== 'marketplace') return null
  const sections = pluginSections(model.catalog)
  const chosen = sections.find((section) => section.key === model.category)
  const name = chosen?.title ?? t('All Categories')
  const items: MenuLine[] = [
    {
      label: t('All Categories'),
      checked: model.category == null,
      action: () => model.setCategory(undefined),
    },
    'separator',
    ...sections.map((section) => ({
      label: section.title,
      checked: model.category === section.key,
      action: () => model.setCategory(section.key),
    })),
  ]
  return (
    <>
      <button
        ref={button}
        type="button"
        className="connectors-category"
        aria-label={t('Category')}
        aria-describedby={nameId}
        aria-haspopup="menu"
        aria-expanded={open !== undefined}
        onClick={() => {
          const box = button.current?.getBoundingClientRect()
          if (box) setOpen({ x: box.left, y: box.bottom + 4, width: box.width })
        }}
      >
        <span
          id={nameId}
          className={classes('connectors-category-name', chosen && 'chosen')}
        >
          {name}
        </span>
        <SettingsSymbol name="chevronDown" size={9} weight={1.6} />
      </button>
      {open && (
        <div
          ref={menu}
          className="connectors-category-menu"
          style={
            {
              '--menu-width': `${Math.max(180, open.width)}px`,
            } as React.CSSProperties
          }
        >
          <ContextMenu
            items={items}
            at={open}
            label={t('Category')}
            close={() => setOpen(undefined)}
          />
        </div>
      )}
    </>
  )
}

/** Available | Yours (`GlassSegments`): the chosen half slides to the other. */
function Segments({ model }: { model: PluginsModel }) {
  const halves: { tab: 'marketplace' | 'yours'; title: string }[] = [
    { tab: 'marketplace', title: t('Available') },
    { tab: 'yours', title: t('Yours') },
  ]
  return (
    <div
      className="connectors-segments"
      role="radiogroup"
      aria-label={t('Show')}
    >
      <span
        className={classes(
          'connectors-segments-thumb',
          model.tab === 'yours' && 'right',
        )}
        aria-hidden="true"
      />
      {halves.map(({ tab, title }) => {
        const chosen = model.tab === tab
        return (
          <button
            key={tab}
            type="button"
            role="radio"
            aria-checked={chosen}
            className={classes('connectors-segment', chosen && 'chosen')}
            onClick={() => model.setTab(tab)}
          >
            {title}
          </button>
        )
      })}
    </div>
  )
}

/** Under the head on the list (`PluginsBar`): the search with the categories beside it, then Available | Yours. */
function ConnectorsBar({ model }: { model: PluginsModel }) {
  return (
    <div className="connectors-bar">
      <div className="connectors-bar-line">
        <ConnectorsSearch model={model} />
        <CategoryButton model={model} />
      </div>
      <Segments model={model} />
    </div>
  )
}

// MARK: The notice and the panel

/** The notice (`NoticeBar`): the tick or the cross, the words, Dismiss. */
function NoticeBar({ model }: { model: PluginsModel }) {
  const notice = model.notice
  return (
    <div className="connectors-notice-slot" role="status" aria-live="polite">
      {notice && (
        <div
          className={classes('connectors-notice', notice.isError && 'error')}
        >
          <span className="connectors-notice-mark">
            {notice.isError ? (
              <SettingsSymbol name="xmark" size={11} weight={2} />
            ) : (
              <ConnectorsSymbol name="checkmark" size={12} weight={2} />
            )}
          </span>
          <span className="connectors-notice-text">{notice.text}</span>
          <button
            type="button"
            className="connectors-notice-dismiss"
            aria-label={t('Dismiss')}
            onClick={() => model.show(undefined)}
          >
            <SettingsSymbol name="xmark" size={10} weight={2} />
          </button>
        </div>
      )}
    </div>
  )
}

/** The page's name in the head (`PluginPages.title`): a section's here, the rest the pages'. */
function pageTitle(page: PluginsPage, model: PluginsModel): string {
  if (page.kind === 'category')
    return (
      pluginSections(model.catalog).find((one) => one.key === page.key)
        ?.title ?? ''
    )
  return pluginPageTitle(page, model)
}

/** A key for a page, so each is drawn afresh. */
function pageKey(page: PluginsPage): string {
  return page.kind === 'category'
    ? `category:${page.key}`
    : `${page.kind}:${page.id}`
}

/** The panel (`PluginsPanel`): the head, the bar on the list, the list kept drawn under a page, the notice at the foot. */
function ConnectorsPanel({
  model,
  store,
  window: win,
}: {
  model: PluginsModel
  store: AppStore
  window: WindowModel
}) {
  const panel = useRef<HTMLDivElement>(null)
  const page = model.path.at(-1)
  // The panel takes the keys as it opens, so nothing behind keeps them (the message field would take Escape and the letters).
  useEffect(() => {
    panel.current?.focus()
  }, [])
  return (
    <div
      ref={panel}
      className="overlay-panel connectors-panel"
      role="dialog"
      aria-modal="true"
      aria-label={t('Connectors')}
      data-window-slot=""
      tabIndex={-1}
    >
      <div className="panel-head">
        {page && (
          <PanelDisc
            symbol="chevronLeft"
            label={t('Back')}
            onClick={() => model.back()}
          />
        )}
        <h2 className="panel-title">
          {page ? pageTitle(page, model) : t('Connectors')}
        </h2>
        <PanelDisc
          symbol="xmark"
          label={t('Close')}
          onClick={() => win.closeConnectors()}
        />
      </div>
      {!page && <ConnectorsBar model={model} />}
      <div className="connectors-body">
        <div
          key={model.tab}
          className={classes('connectors-list', page && 'under-page')}
          inert={page != null}
          aria-hidden={page != null}
        >
          <div className="connectors-list-parts">
            {model.tab === 'marketplace' ? (
              <MarketplaceList model={model} />
            ) : (
              <YoursList model={model} window={win} />
            )}
          </div>
        </div>
        {page && (
          <div key={pageKey(page)} className="connectors-page">
            {page.kind === 'category' ? (
              <CategoryPage sectionKey={page.key} model={model} />
            ) : (
              <PluginPages page={page} model={model} store={store} />
            )}
          </div>
        )}
      </div>
      <NoticeBar model={model} />
    </div>
  )
}

/** The agent the window shows: the one asked for while the roster has it, else the first in the sidebar's order (`window.selected`). */
function shownAgent(store: AppStore, win: WindowModel): string | undefined {
  const asked = win.selected
  if (asked != null && store.agents.some((agent) => agent.id === asked))
    return asked
  return listOrder(store)[0]
}

/** Whether something that takes typed words has the keys. */
function fieldHasKeys(target: EventTarget | null): target is HTMLElement {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement)
  )
}

/**
 * The dim and the panel over the window, under search (`PluginsLayer`):
 * each opening drawn afresh and the computer read; the servers every 15 s
 * while it is open and when the window comes forward; the skills read
 * again when the open agent changes.
 */
export function ConnectorsLayer({ store }: { store: AppStore }) {
  const win = useWindowModel()
  const connector = useConnector()
  const [model] = useState(() => new PluginsModel(store))
  useWatched(store)
  useWatched(model)
  const overlay = win.overlay?.kind === 'connectors' ? win.overlay : undefined
  const open = overlay !== undefined
  const opening = overlay?.opening
  const asks = overlay?.asks
  const agentId = shownAgent(store, win)

  // The window's connector, for the consent and the sign-in (the Mac's `model.store = store`).
  useLayoutEffect(() => {
    model.setConnector(connector)
  }, [model, connector])

  // Each ask followed, before the panel is drawn: a fresh opening starts from nothing (`PluginsState.open`); closing forgets the view.
  const followed = useRef<{ opening: number; asks: number }>(undefined)
  useLayoutEffect(() => {
    if (!overlay) {
      if (followed.current) {
        followed.current = undefined
        model.reset()
      }
      return
    }
    const last = followed.current
    if (last?.opening === overlay.opening && last.asks === overlay.asks) return
    followed.current = { opening: overlay.opening, asks: overlay.asks }
    model.follow(overlay.ask, last?.opening !== overlay.opening)
  }, [model, overlay, opening, asks])

  // The open agent, kept on the model for its rows and pages; another one's skills read while open.
  const agentRef = useRef(agentId)
  useLayoutEffect(() => {
    agentRef.current = agentId
    model.setAgent(agentId)
  }, [model, agentId])
  const skillsFor = useRef(agentId)

  // Each opening: which apps can't be added yet, and the computer read; then its servers every 15 s while it is open,
  // but not while the page is hidden: a browser tab left behind on Connectors doesn't keep the computer from resting.
  // (Before the skills' effect, so an opening reads the open agent's skills once.)
  useEffect(() => {
    if (opening === undefined) return
    let stopped = false
    let timer: ReturnType<typeof setInterval> | undefined
    skillsFor.current = agentRef.current
    void store.loadAppsComingSoon()
    void model.load(agentRef.current).then(() => {
      if (stopped) return
      timer = setInterval(() => {
        if (!document.hidden) void model.refreshServers()
      }, 15_000)
    })
    return () => {
      stopped = true
      clearInterval(timer)
    }
  }, [model, store, opening])

  useEffect(() => {
    if (!open || skillsFor.current === agentId) return
    skillsFor.current = agentId
    void model.loadSkills(agentId)
  }, [model, open, agentId])

  // The window coming forward (the tab's focus), or the page shown again: the servers read once.
  useEffect(() => {
    if (!open) return
    let readAt = -Infinity
    const forward = () => {
      if (document.hidden || performance.now() - readAt < 1000) return
      readAt = performance.now()
      void model.refreshServers()
    }
    window.addEventListener('focus', forward)
    document.addEventListener('visibilitychange', forward)
    return () => {
      window.removeEventListener('focus', forward)
      document.removeEventListener('visibilitychange', forward)
    }
  }, [model, open])

  // ⌘F and Escape while it is open and nothing stands over it (MainWindow.swift 496-512).
  useEffect(() => {
    if (!open) return
    const key = (event: KeyboardEvent) => {
      if (event.isComposing || event.keyCode === 229) return
      const command = apple ? event.metaKey : event.ctrlKey
      const other = apple ? event.ctrlKey : event.metaKey
      if (
        command &&
        !other &&
        !event.shiftKey &&
        !event.altKey &&
        event.key.toLowerCase() === 'f'
      ) {
        // The search, on the list; on a page nothing, and the chat behind never gets it.
        event.preventDefault()
        if (!overSlot()) model.focusSearch()
        return
      }
      if (event.key !== 'Escape' || event.defaultPrevented) return
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey)
        return
      if (overSlot()) return
      event.preventDefault()
      const target = document.activeElement
      if (fieldHasKeys(target)) {
        // The search's words first; then the field lets go (a page's field too, so what is typed is not lost with Connectors).
        if (model.path.length === 0 && model.query !== '') model.setQuery('')
        else target.blur()
        return
      }
      win.closeConnectors()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [model, win, open])

  if (!overlay) return null
  return (
    <div
      className="overlay-dim"
      onMouseDown={(event) => {
        if (event.target !== event.currentTarget || event.defaultPrevented)
          return
        win.closeConnectors()
      }}
    >
      <ConnectorsPanel
        key={overlay.opening}
        model={model}
        store={store}
        window={win}
      />
    </div>
  )
}
