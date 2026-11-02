// Connectors' pages as the panel draws them (PluginsWindow.swift's
// `PluginPages`), against a stand-in computer (the core's `PluginsBox`)
// and server: a written app's page and an unwritten one, an installed
// app's accounts on Simeon Labs' server and its tools, a server's page, the
// setup page (its secrets never in the page's HTML), a skill's page, a page
// waiting for the catalogue, and the titles. The web's own choices: links
// in a new tab without `opener` or the referrer, http and https only.

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { JSONValue } from '../core/json'
import { PluginsBox } from '../core/pluginsTesting'
import { AppStore } from '../core/store'
import { Connector, ConnectorContext } from './connector'
import { PluginPages, pluginPageTitle } from './ConnectorPages'
import { PluginsModel, type PluginsPage } from './pluginsModel'

const gmailURL = 'https://api.simeonlabs.com/desktop/api/apps/mcp/gmail'

const catalogue: JSONValue[] = [
  {
    id: 'gmail',
    name: 'gmail',
    displayName: 'Gmail',
    description: 'Search, read and send email.',
    category: 'Communication',
    vendorMcpUrl: gmailURL,
  },
  {
    id: 'acme-notes',
    name: 'acme-notes',
    displayName: 'Acme Notes',
    description: 'Notes for the team.',
    category: '',
    homepage: 'https://acme.example/notes',
    marketplace: { name: 'acme', displayName: 'Acme Market' },
    connectors: [{ name: 'Acme Notes', description: '' }],
    skills: [{ name: 'summarize', description: 'Sums up a note.' }],
  },
  {
    id: 'sneaky',
    name: 'sneaky',
    displayName: 'Sneaky',
    description: '',
    category: '',
    homepage: 'javascript:alert(1)',
  },
  {
    id: 'weather',
    name: 'weather',
    displayName: 'Weather',
    description: 'Forecasts.',
    category: 'Travel',
    fields: [
      { key: 'API_KEY', label: 'API key', isRequired: true, isSecret: true },
      {
        key: 'CITY',
        label: 'City',
        isRequired: false,
        isSecret: false,
        defaultValue: 'Paris',
        hint: 'Where the forecasts are for',
      },
    ],
  },
]

const servers: JSONValue[] = [
  {
    id: 'g1',
    name: 'Gmail',
    pluginId: 'gmail',
    url: gmailURL,
    status: 'connected',
    transport: 'http',
  },
  {
    id: 'w1',
    name: 'Weather',
    pluginId: 'weather',
    status: 'needsAuth',
    transport: 'http',
  },
  {
    id: 'w1',
    name: 'Weather',
    pluginId: 'weather',
    accountKey: 'work',
    status: 'error',
    statusDetail: 'Token expired.',
    transport: 'http',
  },
  {
    id: 'house',
    name: 'House Tools',
    url: 'https://tools.example.com/mcp',
    transport: 'sse',
    status: 'connected',
    toolCount: 3,
    isTeamServer: true,
  },
]

async function opened(answers: Record<string, JSONValue> = {}) {
  const box = new PluginsBox()
  box.answers['desktopMcp:getCatalog'] = { plugins: catalogue }
  box.answers['desktopMcp:listServers'] = { servers }
  box.answers['desktopMcp:listEffectivePlugins'] = [
    { pluginId: 'gmail', isEnabled: true, installMode: 'user' },
    { pluginId: 'weather', isEnabled: true, installMode: 'user' },
  ]
  box.answers['desktopMcp:listServerTools'] = [
    { name: 'gmail_send_email', description: 'Sends an email.' },
    { name: 'gmail_read_inbox', description: 'Reads.', isDisabled: true },
  ]
  box.answers.getAgentWorkflows = [
    {
      id: 'w-mine',
      name: 'Weekly report',
      description: 'Use when the week ends.',
      body: 'Write the report.',
      source: 'workflow',
    },
    {
      id: 'w-org',
      name: 'Expenses',
      description: 'Use for expenses.',
      body: 'File them.',
      source: 'managed',
    },
  ]
  box.answers.getPluginSyncStatus = { authBlocked: [] }
  box.answers.syncPluginSkills = []
  Object.assign(box.answers, answers)
  box.serverAnswers.apps = { available: true, comingSoon: [] }
  box.serverAnswers['apps/gmail/accounts'] = {
    toolkit: 'gmail',
    max: 5,
    accounts: [
      { id: 'ca_h', name: 'Home', identity: 'jo@gmail.com', label: 'Home' },
      { id: 'ca_w', identity: 'jo@acme.com', label: 'jo@acme.com' },
    ],
  }
  const store = new AppStore()
  await store.attach(box)
  const model = new PluginsModel(store)
  await model.load('theo')
  return { store, model, box }
}

function draw(
  page: PluginsPage,
  model: PluginsModel,
  store: AppStore,
  connector?: Connector,
): string {
  return renderToStaticMarkup(
    <ConnectorContext.Provider value={connector}>
      <PluginPages page={page} model={model} store={store} />
    </ConnectorContext.Provider>,
  )
}

/** The words a page shows, its tags gone. */
const words = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;/g, '’')
    .replace(/\s+/g, ' ')
    .trim()

describe('Connectors’ pages', () => {
  it('a written app’s page: its maker, the three examples on the picture, its words, Information and its links', async () => {
    const { model, store, box } = await opened()
    // Not added yet: Connect in its head.
    box.answers['desktopMcp:listServers'] = { servers: [] }
    box.answers['desktopMcp:listEffectivePlugins'] = []
    await model.refreshServers()
    await store.readEffectivePlugins()
    const page: PluginsPage = { kind: 'plugin', id: 'gmail' }
    expect(pluginPageTitle(page, model)).toBe('Gmail')
    const html = draw(page, model, store)
    const said = words(html)
    expect(said).toContain('By Google · Search, read and send email.')
    expect(html).toContain('aria-label="Connect Gmail"')
    // The three examples, each naming Gmail in its colour with its logo.
    expect(html.match(/class="page-example"/g)?.length).toBe(3)
    expect(html.match(/class="brand-name"/g)?.length).toBeGreaterThanOrEqual(3)
    expect(html).toContain('connector-hero')
    expect(said).toContain(
      'Your agents search and read your email in Gmail, summarize long threads',
    )
    // Information: Category, Developer and the maker's three links, in a new tab with neither opener nor referrer.
    expect(said).toContain('Category Communication')
    expect(said).toContain('Developer Google')
    expect(
      html.match(/target="_blank" rel="noopener noreferrer"/g)?.length,
    ).toBe(3)
    expect(html).toContain('href="https://policies.google.com/privacy"')
    expect(said).toContain('Website')
    expect(said).toContain('Privacy Policy')
    // Not added: no accounts, no Uninstall.
    expect(said).not.toContain('Uninstall')
    expect(said).not.toContain('Accounts')
  })

  it('an unwritten entry: its marketplace and View Source, its line, its connectors and skills folded; a homepage of another kind is no link', async () => {
    const { model, store } = await opened()
    const html = draw({ kind: 'plugin', id: 'acme-notes' }, model, store)
    const said = words(html)
    expect(said).toContain('Acme Market · View Source')
    expect(html).toContain('href="https://acme.example/notes"')
    expect(said).toContain('Notes for the team.')
    expect(html).not.toContain('page-examples')
    expect(said).toContain('Connectors 1 connector')
    expect(said).toContain('Skills 1 skill')
    // Folded: the rows come when it opens.
    expect(said).not.toContain('Sums up a note.')
    expect(html).toContain('aria-expanded="false"')
    // Information: only the website (no maker, no category).
    expect(said).toContain('Information Website acme.example')

    const sneaky = draw({ kind: 'plugin', id: 'sneaky' }, model, store)
    expect(sneaky).not.toContain('javascript:')
    expect(sneaky).not.toContain('View Source')
    expect(words(sneaky)).not.toContain('Information')
  })

  it('an app added: the accounts Simeon Labs’ server keeps, Add Another Account with the window’s connector, its tools, Uninstall', async () => {
    const { model, store } = await opened()
    await store.loadAppAccounts('gmail')
    await model.loadTools('g1')
    const page: PluginsPage = { kind: 'plugin', id: 'gmail' }
    const html = draw(page, model, store, new Connector(store))
    const said = words(html)
    expect(said).toContain('Accounts Home Connected · jo@gmail.com')
    expect(said).toContain('jo@acme.com Connected')
    expect(html).toContain('aria-label="Rename Home"')
    // Two accounts: each can go.
    expect(html.match(/>Remove</g)?.length).toBe(2)
    expect(said).toContain('Add Another Account')
    expect(said).toContain('Tools 1 of 2 enabled')
    expect(said).toContain('Uninstall')
    expect(html).not.toContain('aria-label="Connect Gmail"')
    // Drawn without the window's connector, there is no sign-in to open.
    expect(words(draw(page, model, store))).not.toContain('Add Another Account')
    // Coming from Yours: the same page.
    expect(pluginPageTitle({ kind: 'installed', id: 'g1' }, model)).toBe(
      'Gmail',
    )
  })

  it('until its accounts are read: the computer’s rows with their sign-in and an error’s detail; Setup with Edit Values', async () => {
    const { model, store } = await opened()
    const said = words(draw({ kind: 'plugin', id: 'weather' }, model, store))
    expect(said).toContain('Accounts Default Needs auth Connect')
    expect(said).toContain('work Error Token expired.')
    expect(said).toContain('Setup Setup Values Edit Values')
  })

  it('a server no entry claims: its host, the team’s label, its accounts, Details', async () => {
    const { model, store } = await opened()
    const page: PluginsPage = { kind: 'installed', id: 'house' }
    expect(pluginPageTitle(page, model)).toBe('House Tools')
    const said = words(draw(page, model, store))
    expect(said).toContain('House Tools tools.example.com Managed by your team')
    expect(said).toContain('Source Your team')
    expect(said).toContain('Transport SSE')
    expect(said).toContain('URL https://tools.example.com/mcp')
    expect(said).toContain('Tools 3')
    // The team's own: neither Uninstall nor Remove.
    expect(said).not.toContain('Uninstall')
    expect(said).not.toContain('Remove')
  })

  it('the setup page: each value, "(optional)", a secret masked and never in the page', async () => {
    const { model, store } = await opened()
    model.editValues(model.catalog.find((one) => one.id === 'weather')!)
    const page: PluginsPage = { kind: 'setup', id: 'weather' }
    expect(pluginPageTitle(page, model)).toBe('Weather')
    const html = draw(page, model, store)
    const said = words(html)
    expect(said).toContain('Saving replaces all of Weather')
    expect(said).toContain('API key')
    expect(said).toContain('City (optional)')
    expect(said).toContain('Where the forecasts are for')
    expect(said).toContain('Save Values')
    // The default shows; the secret starts empty, masked, never offered the person's logins (what is typed stays the browser's).
    expect(html).toContain('value="Paris"')
    const secret = html.match(/<input[^>]*type="password"[^>]*>/)![0]
    expect(secret).toContain('value=""')
    expect(secret).toMatch(/autocomplete="new-password"/i)
    expect(secret).toContain('data-1p-ignore="true"')
    // Another entry's setup isn't open: that page waits for nothing and goes.
    expect(draw({ kind: 'setup', id: 'gmail' }, model, store)).not.toContain(
      'setup-page',
    )
  })

  it('a skill’s page: the agent’s own with Save and Delete skill; the organization’s read only', async () => {
    const { model, store } = await opened()
    model.setAgent('theo')
    const mine: PluginsPage = { kind: 'skill', id: 'w-mine' }
    expect(pluginPageTitle(mine, model)).toBe('Weekly report')
    const html = draw(mine, model, store)
    const said = words(html)
    expect(said).toContain('Weekly report Private skill')
    expect(said).toContain('Delete skill')
    expect(html).toContain('value="Weekly report"')
    expect(html).toContain('Write the report.')
    // Nothing changed yet: Save waits.
    expect(html).toMatch(
      /<button[^>]*class="page-pill primary"[^>]*disabled=""/,
    )
    const org = draw({ kind: 'skill', id: 'w-org' }, model, store)
    expect(words(org)).toContain('Managed by your organization')
    expect(org).not.toContain('Delete skill')
    expect(org).not.toContain('page-pill primary')
  })

  it('waits for the catalogue; a page whose thing is gone has no title', async () => {
    const box = new PluginsBox()
    const store = new AppStore()
    await store.attach(box)
    const model = new PluginsModel(store)
    const html = draw({ kind: 'plugin', id: 'gmail' }, model, store)
    expect(html).toContain('page-waiting')
    expect(pluginPageTitle({ kind: 'plugin', id: 'gmail' }, model)).toBe('')
    expect(pluginPageTitle({ kind: 'skill', id: 'x' }, model)).toBe('')
    // A section's page is the list's own.
    expect(draw({ kind: 'category', key: 'Featured' }, model, store)).toBe('')
  })
})
