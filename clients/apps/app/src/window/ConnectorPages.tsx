// Connectors' pages (mac/Simeon/PluginsWindow.swift 1126-2035,
// `PluginPages`): a plugin's page, an installed server's page, the setup
// page, a skill's page. Step 6d's; the frame of them (step 6c) is the
// panel in Connectors.tsx, which shows the page on top of `model.path`
// over the list, with Back and its title in the head.
//
// The panel gives a page the area under the head, scrolling
// (`.connectors-page`), drawn afresh for each page; the page draws its own
// room and width (the Mac's 16 above, 24 a side, 32 at the foot, at most
// 720 in the middle). A section of Available on its own page (`category`)
// is 6c's, drawn by Connectors.tsx: it never comes here.
//
// The parts are drawn from plain values in ConnectorPageParts.tsx; here
// each page says what they show, from the model (pluginsModel.ts), the
// store (an app's accounts on Simeon Labs' server) and the window's
// connector (Add Another Account, step 6b).

import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { canAddAnother } from '../core/appAccounts'
import { comingSoonWord } from '../core/connectCards'
import { byline, connectorPage } from '../core/connectorPages'
import {
  type AgentSkill,
  type PluginEntry,
  type PluginInstallMode,
  type PluginServer,
  accountLabel,
  connectWord,
  connectorList,
  countWord,
  entryForServer,
  hasSetupFields,
  serverAccounts,
  serverInstallMode,
  skillHasPage,
  skillKindLine,
  statusWord,
  toolNames,
} from '../core/plugins'
import {
  type PageAction,
  canSaveSkill,
  detailValue,
  enabledLine,
  fillInLine,
  hostLine,
  pageAction,
  requiredLine,
  setupIntro,
  setupMissing,
  setupStart,
  setupSubmit,
  setupValues,
  signInButton,
  skillDescriptionHint,
  sourceWord,
  tone,
  toolsValue,
  transportWord,
} from '../core/pluginsOverlay'
import type { AppStore } from '../core/store'
import { t } from '../l10n'
import { useConnector } from './connector'
import {
  AppAccountsList,
  CardRow,
  ConnectPill,
  Description,
  DetailPair,
  ExamplesCard,
  FoldCard,
  InformationCard,
  MetaLine,
  PageCard,
  PageHead,
  PageIcon,
  PagePill,
  PageSpinner,
  RemoveGroup,
  ServerAccountsCard,
  SetupField,
  SkillField,
  SkillTile,
  ToolsCard,
} from './ConnectorPageParts'
import type { PluginsModel, PluginsPage } from './pluginsModel'
import { SettingsActionRow, SettingsGroup } from './SettingsParts'
import { useWatched } from './useStore'

/** Nothing to watch: a page drawn without the window's connector (never in the window). */
const unwatched = { subscribe: () => () => {}, getVersion: () => 0 }

/** The page on top of the stack (`PluginPages`): a plugin's, a server's, the setup page, a skill's; one whose thing has gone closes itself (`model.closePage`). */
export function PluginPages({
  page,
  model,
  store,
}: {
  page: PluginsPage
  model: PluginsModel
  store: AppStore
}) {
  useWatched(model)
  useWatched(store)
  let body: ReactNode = undefined
  switch (page.kind) {
    case 'category':
      return null
    case 'plugin': {
      const entry = model.catalog.find((one) => one.id === page.id)
      if (entry)
        body = (
          <PluginPage
            key={entry.id}
            entry={entry}
            model={model}
            store={store}
          />
        )
      break
    }
    case 'installed': {
      const server = model.onePerServer.find((one) => one.id === page.id)
      if (server) {
        const entry = entryForServer(server, model.catalog)
        body = entry ? (
          <PluginPage
            key={entry.id}
            entry={entry}
            model={model}
            store={store}
          />
        ) : (
          <ServerPage key={server.id} server={server} model={model} />
        )
      }
      break
    }
    case 'setup': {
      const entry = model.catalog.find((one) => one.id === page.id)
      const setup = model.setup
      if (entry && setup?.entryId === page.id)
        body = (
          <SetupPage
            key={`${entry.id}\u001f${setup.editing}`}
            entry={entry}
            editing={setup.editing}
            model={model}
          />
        )
      break
    }
    case 'skill': {
      const skill = model.skills.find((one) => one.id === page.id)
      if (skill && skillHasPage(skill))
        body = <SkillPage key={skill.id} skill={skill} model={model} />
      break
    }
  }
  return (
    <div className="page-column">
      {body ?? <Missing page={page} model={model} />}
    </div>
  )
}

/** Waits for the catalogue; once it is in and the thing is not, the page goes, and what is over it (`missing`). */
function Missing({ page, model }: { page: PluginsPage; model: PluginsModel }) {
  const loaded = model.catalogLoaded
  useEffect(() => {
    if (loaded) model.closePage(page)
  }, [loaded, model, page])
  if (loaded) return null
  return (
    <div className="page-waiting">
      <span className="settings-spinner" aria-hidden="true" />
    </div>
  )
}

/** The page's name in the head (`PluginPages.title`); a section's is 6c's. */
export function pluginPageTitle(
  page: PluginsPage,
  model: PluginsModel,
): string {
  switch (page.kind) {
    case 'category':
      return ''
    case 'plugin':
    case 'setup':
      return model.catalog.find((one) => one.id === page.id)?.displayName ?? ''
    case 'installed': {
      const server = model.onePerServer.find((one) => one.id === page.id)
      if (!server) return ''
      return entryForServer(server, model.catalog)?.displayName ?? server.name
    }
    case 'skill':
      return model.skills.find((one) => one.id === page.id)?.name ?? ''
  }
}

/** Uninstall or Remove at a page's foot, for its action; none for the team's own or what isn't added. */
function removeKind(action: PageAction): 'uninstall' | 'remove' | undefined {
  return action.kind === 'uninstall' || action.kind === 'remove'
    ? action.kind
    : undefined
}

/**
 * A plugin's page (`PluginPage`, in the design of the founder's reference,
 * 29 October 2026): its head (the logo, the name, "By its maker · what it
 * does", Connect at the right); for a connector with its own page
 * (`ConnectorPage`), the card of three messages naming it, then a few lines
 * on it; its accounts and tools when added; Setup; its connectors and
 * skills; Information; Uninstall at the foot.
 */
function PluginPage({
  entry,
  model,
  store,
}: {
  entry: PluginEntry
  model: PluginsModel
  store: AppStore
}) {
  const installed = model.installed(entry)
  const item = model.yoursItems.find(
    (one) => one.kind === 'plugin' && one.entry.id === entry.id,
  )
  const mode: PluginInstallMode | undefined =
    installed.plugin?.installMode ??
    (installed.server ? serverInstallMode(installed.server) : undefined) ??
    item?.installMode
  const action = pageAction(installed.isInstalled, mode)
  const page = connectorPage(entry.id)
  const server = installed.server
  const serverId = server?.id
  // Its tools, as the page shows (`.task`), and once its server is there (the Mac's wait for the page to show again).
  useEffect(() => {
    if (serverId !== undefined) void model.loadTools(serverId)
  }, [model, serverId])
  const connectors = connectorList(entry)
  const skills = entry.skills ?? []
  return (
    <div className="plugin-page">
      <div className="plugin-page-top">
        <div className="plugin-page-head">
          <PageIcon
            name={entry.displayName}
            id={entry.id}
            iconUrl={entry.iconUrl}
            side={64}
            logos={model.logos}
            loadLogo={(address) => void model.loadLogo(address)}
          />
          <div className="plugin-page-words">
            <span className="plugin-page-name">{entry.displayName}</span>
            {page ? (
              <span className="plugin-page-byline">
                {entry.description === ''
                  ? byline(page)
                  : `${byline(page)} · ${entry.description}`}
              </span>
            ) : (
              <MetaLine
                market={entry.marketplace?.displayName}
                homepage={entry.homepage}
              />
            )}
          </div>
          <PageActionView
            action={action}
            adding={model.adding === entry.id}
            busy={model.isBusy}
            name={entry.displayName}
            comingSoon={!installed.isInstalled && model.comingSoon(entry)}
            large
            add={() => model.requestAdd(entry, model.agentId)}
          />
        </div>
        {page ? (
          <>
            <ExamplesCard examples={page.examples} />
            <Description text={page.about} />
          </>
        ) : (
          entry.description !== '' && <Description text={entry.description} />
        )}
      </div>
      <div className="plugin-page-cards">
        {server && (
          <>
            <AppAccountsCard
              serverId={server.id}
              name={entry.displayName}
              pluginId={entry.id}
              model={model}
              store={store}
            />
            <ServerTools serverId={server.id} model={model} />
          </>
        )}
        {installed.isInstalled && item && hasSetupFields(entry) && (
          <PageCard heading={t('Setup')}>
            <CardRow>
              <span className="page-row-words">{t('Setup Values')}</span>
              <PagePill
                title={t('Edit Values')}
                disabled={model.isBusy}
                onClick={() => model.editValues(entry)}
              />
            </CardRow>
          </PageCard>
        )}
        {connectors.length > 0 && (
          <FoldCard
            heading={t('Connectors')}
            summary={countWord(connectors.length, 'connector')}
            rows={connectors.map((one) => [
              one.name,
              one.description === '' ? t('Connector') : one.description,
            ])}
          />
        )}
        {skills.length > 0 && (
          <FoldCard
            heading={t('Skills')}
            summary={countWord(skills.length, 'skill')}
            rows={skills.map((one) => [
              one.name,
              one.description === '' ? t('Skill') : one.description,
            ])}
          />
        )}
        <InformationCard
          category={entry.category}
          page={page}
          homepage={entry.homepage}
        />
        <RemoveGroup
          kind={removeKind(action)}
          disabled={model.isBusy}
          onRemove={() => {
            if (installed.plugin) void model.uninstall(entry.id, model.agentId)
            else if (server) void model.remove(server.id, model.agentId)
          }}
        />
      </div>
    </div>
  )
}

/**
 * The page's action in its head (`PageActionView`, the iPhone's): Connect
 * (the reference's black pill on an app's page, the blue elsewhere; the
 * spinner while it is added; Coming soon for an app that can't be added
 * yet), or the team's label. Uninstall and Remove are the page's foot.
 */
function PageActionView({
  action,
  adding,
  busy,
  name,
  comingSoon,
  large,
  add,
}: {
  action: PageAction
  adding: boolean
  busy: boolean
  name: string
  comingSoon?: boolean
  large?: boolean
  add: () => void
}) {
  switch (action.kind) {
    case 'add':
      if (comingSoon)
        return (
          <PagePill
            kind="soon"
            title={comingSoonWord()}
            label={t`${name} is coming soon`}
          />
        )
      if (adding) return <PageSpinner name={name} />
      if (large)
        return (
          <ConnectPill
            label={t`Connect ${name}`}
            disabled={busy}
            onClick={add}
          />
        )
      return (
        <PagePill
          kind="primary"
          title={connectWord()}
          label={t`Connect ${name}`}
          disabled={busy}
          onClick={add}
        />
      )
    case 'uninstall':
      return null
    case 'remove':
    case 'managed':
      return <PagePill kind="label" title={action.label} />
  }
}

/** A server no entry claims (`ServerPage`): its head with its address's host, its team's label, its accounts, tools and Details, Uninstall or Remove. */
function ServerPage({
  server,
  model,
}: {
  server: PluginServer
  model: PluginsModel
}) {
  const action = pageAction(true, serverInstallMode(server))
  const host = hostLine(server.url)
  useEffect(() => {
    void model.loadTools(server.id)
  }, [model, server.id])
  return (
    <div className="plugin-page">
      <PageHead
        name={server.name}
        icon={
          <PageIcon
            name={server.name}
            side={48}
            logos={model.logos}
            loadLogo={(address) => void model.loadLogo(address)}
          />
        }
        meta={
          host !== undefined && <span className="page-head-host">{host}</span>
        }
        action={
          <PageActionView
            action={action}
            adding={false}
            busy={model.isBusy}
            name={server.name}
            add={() => {}}
          />
        }
      />
      <div className="plugin-page-cards">
        <AccountsCard serverId={server.id} model={model} />
        <ServerTools serverId={server.id} model={model} />
        <PageCard heading={t('Details')}>
          <CardRow>
            <DetailPair
              term={t('Source')}
              value={sourceWord(server.isTeamServer)}
            />
          </CardRow>
          <CardRow divided>
            <DetailPair
              term={t('Transport')}
              value={transportWord(server.transport)}
            />
          </CardRow>
          <CardRow divided>
            {server.url !== undefined ? (
              // "URL" as the Mac writes it, in every language (a `String`, not a key).
              <DetailPair term="URL" value={detailValue(server.url)} />
            ) : (
              <DetailPair
                term={t('Command')}
                value={detailValue(server.command)}
              />
            )}
          </CardRow>
          <CardRow divided>
            <DetailPair
              term={t('Tools')}
              value={toolsValue(model.tools.get(server.id), server.toolCount)}
            />
          </CardRow>
        </PageCard>
        <RemoveGroup
          kind={removeKind(action)}
          disabled={model.isBusy}
          onRemove={() => void model.remove(server.id, model.agentId)}
        />
      </div>
    </div>
  )
}

/** Accounts (`AccountsCard`): the computer's rows of a server, the default first: its name (and an error's detail), its status, and its sign-in (Connect, Reopen, Retry after ten minutes). */
function AccountsCard({
  serverId,
  model,
}: {
  serverId: string
  model: PluginsModel
}) {
  const rows = serverAccounts(model.servers, serverId)
  return (
    <ServerAccountsCard
      rows={rows.map((row) => ({
        label: accountLabel(row.accountKey),
        status: statusWord(row.status),
        tone: tone(row.status),
        detail: row.status === 'error' ? row.statusDetail : undefined,
        signIn:
          row.status === 'needsAuth'
            ? {
                title: signInButton(model.signInState(row, row.accountKey)),
                disabled: model.isBusy,
                go: () => model.requestSignIn(row, row.accountKey),
              }
            : undefined,
      }))}
    />
  )
}

/**
 * The accounts Simeon Labs' server keeps for an app (`AppAccountsCard`,
 * Add Another Account, 29 October 2026): once the app is connected and
 * they are read, each by its name, Connected, the pencil, Remove while
 * another stays, and Add Another Account while there is room (no consent:
 * the app is the person's already). Until then the computer's own rows,
 * with their sign-in.
 */
function AppAccountsCard({
  serverId,
  name,
  pluginId,
  model,
  store,
}: {
  serverId: string
  name: string
  pluginId: string
  model: PluginsModel
  store: AppStore
}) {
  const connector = useConnector()
  useWatched(connector ?? unwatched)
  const rows = serverAccounts(model.servers, serverId)
  const connected = rows.some((row) => row.status === 'connected')
  const toolkit = store.appsToolkit(rows[0]?.url, pluginId)
  // Read again each time the app (or whether it is connected) changes (`.task(id:)`).
  useEffect(() => {
    if (connected && toolkit !== undefined) void store.loadAppAccounts(toolkit)
  }, [store, connected, toolkit])
  const held = toolkit !== undefined ? store.appAccounts[toolkit] : undefined
  if (
    !connected ||
    toolkit === undefined ||
    !held ||
    held.accounts.length === 0
  )
    return <AccountsCard serverId={serverId} model={model} />
  return (
    <AppAccountsList
      name={name}
      accounts={held.accounts}
      // Without the window's connector (never in the window) there is no sign-in to open: no Add Another Account.
      canAdd={connector !== undefined && canAddAnother(held)}
      adding={connector?.connecting === name}
      addDisabled={connector?.connecting !== undefined}
      add={() => connector?.addAccount(toolkit, name)}
      rename={(account, next) =>
        void store.renameAppAccount(toolkit, account, next)
      }
      remove={(account) => void store.removeAppAccount(toolkit, account)}
    />
  )
}

/** Tools (`ToolsCard`): folded, "n of m enabled"; open, each tool's switch, changed at once; a failure under them, in red. */
function ServerTools({
  serverId,
  model,
}: {
  serverId: string
  model: PluginsModel
}) {
  const tools = model.tools.get(serverId) ?? []
  const names = toolNames(tools)
  return (
    <ToolsCard
      summary={enabledLine(tools)}
      tools={tools.map((tool) => ({
        name: names[tool.name] ?? tool.name,
        description: tool.description,
        on: !tool.isDisabled,
      }))}
      failure={model.toolFailures.get(serverId)}
      toggle={(index) => {
        const tool = tools[index]
        if (tool) void model.toggle(tool, serverId)
      }}
    />
  )
}

/**
 * The setup page (`SetupPage`): what it is for, each value (secrets
 * hidden, " (optional)"), what is required, and Add or Save Values. It
 * starts from each field's default; values given before are never shown.
 * The words stay the browser's: read when they are sent, and a secret
 * emptied then.
 */
function SetupPage({
  entry,
  editing,
  model,
}: {
  entry: PluginEntry
  editing: boolean
  model: PluginsModel
}) {
  const fields = entry.fields ?? []
  const [start] = useState(() => setupStart(fields))
  const inputs = useRef(new Map<string, HTMLInputElement>())
  /** Which fields hold more than spaces; never what. */
  const [filled, setFilled] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      fields.map((one) => [one.key, (start[one.key] ?? '').trim() !== '']),
    ),
  )
  const [tried, setTried] = useState(false)
  // `setupMissing` on what the fields hold.
  const missing = fields.filter((one) => one.isRequired && !filled[one.key])
  const submit = () => {
    setTried(true)
    const values = Object.fromEntries(
      fields.map((one) => [one.key, inputs.current.get(one.key)?.value ?? '']),
    )
    if (setupMissing(fields, values).length > 0 || model.isBusy) return
    for (const one of fields) {
      const input = inputs.current.get(one.key)
      if (one.isSecret && input) input.value = ''
    }
    setFilled((now) => ({
      ...now,
      ...Object.fromEntries(
        fields.filter((one) => one.isSecret).map((one) => [one.key, false]),
      ),
    }))
    void model.submitSetup(setupValues(values), model.agentId)
  }
  return (
    <div className="setup-page">
      <Description text={setupIntro(entry.displayName, editing)} />
      <div className="setup-fields">
        {fields.map((one) => {
          const invalid = tried && missing.includes(one)
          return (
            <div key={one.key} className="setup-value">
              <span className="setup-label">
                {one.label}
                {/* As the Mac draws it, in every language: it is in no catalogue. */}
                {!one.isRequired && (
                  <span className="setup-optional"> (optional)</span>
                )}
              </span>
              <SetupField
                label={one.label}
                secret={one.isSecret}
                placeholder={one.placeholder ?? one.key}
                initial={start[one.key] ?? ''}
                invalid={invalid}
                field={(input) => {
                  if (input) inputs.current.set(one.key, input)
                  else inputs.current.delete(one.key)
                }}
                filled={(now) =>
                  setFilled((was) =>
                    was[one.key] === now ? was : { ...was, [one.key]: now },
                  )
                }
                submit={submit}
              />
              {invalid ? (
                <span className="setup-required">
                  {requiredLine(one.label)}
                </span>
              ) : (
                one.hint !== undefined && (
                  <span className="setup-hint" title={one.hint}>
                    {one.hint}
                  </span>
                )
              )}
            </div>
          )
        })}
      </div>
      <div className="setup-foot">
        {tried && missing.length > 0 && (
          <span className="setup-missing">{fillInLine(missing.length)}</span>
        )}
        <PagePill
          kind="primary"
          title={setupSubmit(entry.displayName, editing)}
          disabled={model.isBusy}
          onClick={submit}
        />
      </div>
    </div>
  )
}

/** What a skill's fields start from, and start from again when it changes outside (Swift's `==` on the fields it shows). */
function skillShown(skill: AgentSkill): string {
  return [skill.id, skill.name, skill.description, skill.body].join('\u001f')
}

/** A skill's page (`SkillPage`): its tile, name and kind; Name, Description ("Use when…") and Instructions; Save; Delete skill for the agent's own. One the organization manages is read only. */
function SkillPage({
  skill,
  model,
}: {
  skill: AgentSkill
  model: PluginsModel
}) {
  const agentId = model.agentId
  const managed = skill.source === 'managed'
  const [shown, setShown] = useState(skillShown(skill))
  const [name, setName] = useState(skill.name)
  const [details, setDetails] = useState(skill.description)
  const [instructions, setInstructions] = useState(skill.body)
  const [working, setWorking] = useState(false)
  // The fields follow the skill when it changes from outside (`onChange(of: skill)`).
  if (shown !== skillShown(skill)) {
    setShown(skillShown(skill))
    setName(skill.name)
    setDetails(skill.description)
    setInstructions(skill.body)
  }
  const changed =
    name !== skill.name ||
    details !== skill.description ||
    instructions !== skill.body
  const ready = canSaveSkill(
    agentId !== undefined,
    changed,
    name,
    details,
    instructions,
    working,
  )
  const save = useCallback(async () => {
    if (agentId === undefined) return
    setWorking(true)
    await model.save(skill, name, details, instructions, agentId)
    setWorking(false)
  }, [agentId, model, skill, name, details, instructions])
  return (
    <div className="skill-page">
      <div className="skill-page-top">
        <div className="skill-page-head">
          <SkillTile side={48} />
          <div className="skill-page-words">
            <span className="page-head-name">{skill.name}</span>
            <span className="skill-page-kind">{skillKindLine(skill)}</span>
          </div>
        </div>
        {skill.description !== '' && <Description text={skill.description} />}
      </div>
      <SkillField
        label={t('Name')}
        value={name}
        placeholder=""
        disabled={managed}
        change={setName}
      />
      <div className="page-skill-field">
        <SkillField
          label={t('Description')}
          value={details}
          placeholder={t('Use when…')}
          disabled={managed}
          change={setDetails}
        />
        {details.trim() === '' && !managed && (
          <span className="skill-page-hint">{skillDescriptionHint()}</span>
        )}
      </div>
      <SkillField
        label={t('Instructions')}
        value={instructions}
        placeholder={t(
          'Markdown instructions the agent follows when it runs this skill',
        )}
        lines
        disabled={managed}
        change={setInstructions}
      />
      {!managed && (
        <div className="skill-page-save">
          <PagePill
            kind="primary"
            title={t('Save')}
            disabled={!ready}
            onClick={() => void save()}
          />
        </div>
      )}
      {!managed && agentId !== undefined && skill.source === 'workflow' && (
        <SettingsGroup>
          <SettingsActionRow
            title={t('Delete skill')}
            destructive
            onClick={() => void model.delete(skill, agentId)}
          />
        </SettingsGroup>
      )}
    </div>
  )
}
