// What the person reads before an app's sign-in page opens (the core's
// ConnectConsent.swift; the founder, 9 October 2026: "when you click on add
// … before you go to the link to connect"): the app, what the agents will
// be able to reach in it, that the person stays in charge, that agents can
// get things wrong, who handles the sign-in (Simeon, through its sign-in
// partner, for the apps Simeon's server serves; the app itself for the
// rest), where the information goes, and, for some apps, one more thing
// worth knowing about that app. One template; each app fills it a little
// differently. The partner is not named (the founder, 13 October 2026:
// "white label composio as best as you can"); the privacy policy covers it
// as a provider of app connections.
//
// Each app's part is the Swift's tables as they are (the test compares them
// with ConnectConsent.swift), every sentence in the core's catalogue.

import { providerName } from './aiModels'
import { type CatalogApp, slug } from './connectCards'
import { t } from './l10n'

/** Who handles the sign-in and holds the access (`ConnectConsent.Route`). */
export type ConsentRoute =
  /** Composio, through Simeon's own server (`/desktop/api/apps/mcp/…`). */
  | { kind: 'composio' }
  /** The app's own server (`vendorMcpUrl`). */
  | { kind: 'vendor'; host: string }
  /** Not in the catalogue: the app's page, said plainly. */
  | { kind: 'unknown' }

/** The three points' symbols (SF Symbols), drawn by the screen. */
export type ConsentSymbol =
  | 'square.stack.3d.up'
  | 'hand.raised'
  | 'checkmark.circle'
  | 'lock.shield'

export interface ConsentPoint {
  symbol: ConsentSymbol
  title: string
  body: string
}

export interface ConnectConsent {
  id: string
  title: string
  summary: string
  route: ConsentRoute
  points: ConsentPoint[]
  /** The small print under the points: sign-in, where the information goes, the app's own terms. */
  smallPrint: string[]
  /** One more thing about this app, when there is one (the founder's reference gives Shopify an extra paragraph). */
  note?: string
}

/** The consent for `name`, the catalogue's app when there is one (`ConnectConsent(app:name:)`). */
export function connectConsent(
  app: CatalogApp | undefined,
  name: string,
): ConnectConsent {
  const title = app?.title ?? name
  const key = app?.id ?? slug(name)
  const route = consentRoute(app)

  let reach: string
  const custom = reachSentences()[key]
  const things = reaches()[key]
  if (custom != null) reach = custom.replaceAll('{App}', () => title)
  else if (things != null)
    reach = readOnly.has(key)
      ? t`Your agents can read ${things} in ${title}.`
      : t`Your agents can read and use ${things} in ${title}.`
  else reach = t`Your agents can read and use what's in your ${title} account.`

  const points: ConsentPoint[] = [
    {
      symbol: 'square.stack.3d.up',
      title: t`Put ${title} to work`,
      body: reach,
    },
    {
      symbol: 'hand.raised',
      title: t('You stay in charge'),
      body: t`Auto-review asks for your OK before steps it judges risky. Turn off any of ${title}'s tools, or remove it, in Settings → Connect apps.`,
    },
    {
      symbol: 'checkmark.circle',
      title: t('Check their work'),
      body: t`Agents can misread a request or take a step you didn't expect. Look over what they do in ${title}, especially at first.`,
    },
  ]

  const signIn =
    signInSentences()[key]?.replaceAll('{App}', () => title) ??
    signInLine(route, title)
  const smallPrint = [
    signIn,
    t`What your agents read in ${title} becomes part of your chats with them and is sent to the AI models that do the work.`,
    t`${title}'s own terms and privacy policy apply to the information it shares with Simeon.`,
  ]
  const note =
    notes()[key] ??
    (money.has(key)
      ? t`Anything that moves money in ${title} is real. Ask your agents to check with you before they move any.`
      : undefined)
  return {
    id: key,
    title,
    summary: app?.summary.trim() ?? '',
    route,
    points,
    smallPrint,
    note,
  }
}

/**
 * The consent for one of the person's own AI plans, ChatGPT's or Claude's
 * (`ConnectConsent(modelProvider:)`; 9 November 2026, the founder: "have it
 * like when you connect an app"): the same page, its words for a plan.
 */
export function modelConsent(provider: string): ConnectConsent {
  const title = providerName(provider)
  return {
    id: `model:${provider}`,
    title,
    summary: t`Your ${title} plan, for your agents.`,
    route: { kind: 'unknown' },
    points: [
      {
        symbol: 'square.stack.3d.up',
        title: t`Put ${title} to work`,
        body: t`Your agents work on your ${title} plan, not on your Simeon credits.`,
      },
      {
        symbol: 'hand.raised',
        title: t('You stay in charge'),
        body: t(
          "Choose the model in the message field, or go back to Simeon's anytime. Disconnect in Settings → AI Models.",
        ),
      },
      {
        symbol: 'checkmark.circle',
        title: t('When your plan runs out'),
        body: t("Your agents use Simeon's models until it resets."),
      },
    ],
    smallPrint: [
      signInLine({ kind: 'unknown' }, title),
      t('Voice calls, dictation and video still use your Simeon credits.'),
    ],
  }
}

/**
 * Connect on an API key's line (`ConnectConsent(keyProvider:)`; 10 November
 * 2026): the same page as a plan's, its words for a key the person pastes,
 * which the provider bills.
 */
export function keyConsent(provider: string, title: string): ConnectConsent {
  return {
    id: `key:${provider}`,
    title,
    summary: t`Your ${title} API key, for your agents.`,
    route: { kind: 'unknown' },
    points: [
      {
        symbol: 'square.stack.3d.up',
        title: t`Put ${title} to work`,
        body: t`Your agents work on ${title}'s models with your key, not on your Simeon credits.`,
      },
      {
        symbol: 'lock.shield',
        title: t('Your key stays with Simeon'),
        body: t`It's kept encrypted on Simeon's server and sent only to ${title}. Your agents never see it.`,
      },
      {
        symbol: 'hand.raised',
        title: t('You stay in charge'),
        body: t(
          "Choose the model in the message field, or go back to Simeon's anytime. Disconnect in Settings → AI Models.",
        ),
      },
    ],
    smallPrint: [
      t`${title} bills each call on your key, at its own prices.`,
      t('Voice calls, dictation and video still use your Simeon credits.'),
    ],
  }
}

/** The AI provider of a plan's or a key's consent (`model:` or `key:`), whose own logo the page shows; none for an app, found by its name (`ConnectConsent.provider`). */
export function consentProvider(consent: ConnectConsent): string | undefined {
  return /^(?:model|key):([a-z0-9]+)$/.exec(consent.id)?.[1]
}

/** Who handles the sign-in, by the app's route (`signInLine`). */
export function signInLine(route: ConsentRoute, title: string): string {
  switch (route.kind) {
    case 'composio':
      // The app's own sign-in page may name the partner (Google's does, for Simeon has no Google app of its own yet): said here without its name, so the person isn't surprised.
      return t`Simeon connects ${title} through a secure sign-in partner, who keeps its access for your agents. ${title}'s page may show the partner's name. Simeon never sees your password.`
    case 'vendor':
      return t`You'll sign in on ${title}'s own page, and ${title} runs this connection from its own server (${route.host}). Simeon never sees your password.`
    case 'unknown':
      return t`You'll sign in on ${title}'s own page. Simeon never sees your password.`
  }
}

/** Composio when the catalogue names its toolkit or the app is served from Simeon's own apps address; the app's server otherwise (`route`). */
export function consentRoute(app: CatalogApp | undefined): ConsentRoute {
  if (!app) return { kind: 'unknown' }
  if (app.composioToolkit != null) return { kind: 'composio' }
  const url = app.serverURL
  if (url == null) return { kind: 'unknown' }
  if (url.includes('/desktop/api/apps/mcp/')) return { kind: 'composio' }
  let host: string
  try {
    host = new URL(url).hostname
  } catch {
    return { kind: 'unknown' }
  }
  return host === '' ? { kind: 'unknown' } : { kind: 'vendor', host }
}

// MARK: Each app's part

/** Each app's part as the tables hold it (the tests compare them with the Swift's, both ways). */
export function consentTables() {
  return {
    reaches: reaches(),
    reachSentences: reachSentences(),
    signInSentences: signInSentences(),
    notes: notes(),
    readOnly,
    money,
  }
}

/** What the agents reach in each app, in Simeon's words. */
function reaches(): Record<string, string> {
  return {
    gmail: t('your emails, threads, labels and drafts'),
    outlook: t('your email, folders and calendar'),
    'google-calendar': t('your calendars, events and invitations'),
    notion: t('your pages and databases'),
    'google-drive': t("your files and folders, and who they're shared with"),
    dropbox: t('your files and folders'),
    airtable: t('your bases, tables and records'),
    asana: t('your tasks, projects and comments'),
    clickup: t('your tasks, docs and spaces'),
    monday: t('your boards and items'),
    todoist: t('your tasks and projects'),
    zoom: t('your meetings, recordings, transcripts and Zoom Docs'),
    'google-meet': t('your meetings and recordings'),
    figma: t('your files, frames and design details'),
    canva: t('your designs and brand assets'),
    miro: t("your boards and what's on them"),
    webflow: t('your sites, CMS collections and items'),
    wix: t('your sites and collections'),
    stripe: t('customers, payments, subscriptions and invoices'),
    paypal: t('invoices, orders and transactions'),
    square: t('payments, your catalog and orders'),
    ramp: t('expenses, cards, bills and reimbursements'),
    quickbooks: t('your books, invoices, bills and expenses'),
    hubspot: t('contacts, companies, deals and tickets'),
    salesforce: t('leads, accounts, opportunities and cases'),
    intercom: t('conversations, contacts and Help Center articles'),
    apollo: t('people, accounts and sequences'),
    linear: t('issues, projects and cycles'),
    jira: t('Jira issues and Confluence pages'),
    github: t('repositories, issues, pull requests and Actions'),
    vercel: t('projects, deployments and logs'),
    supabase: t('projects, tables and data'),
    sentry: t('errors, releases and performance data'),
    cloudflare: t('Workers, KV and their bindings'),
    mailchimp: t('audiences, campaigns and automations'),
    greenhouse: t('jobs, candidates and your pipeline'),
    gusto: t('payroll, employees and time off'),
    slack: t('channels, direct messages and the people in them'),
    'google-docs': t('your documents'),
    'google-sheets': t('your spreadsheets'),
    'google-slides': t('your presentations'),
    onedrive: t('your files in Microsoft 365'),
    'google-tasks': t('your tasks and lists'),
    trello: t('boards, lists and cards'),
    xero: t('invoices, contacts, reports and payroll'),
    shopify: t("products, orders, customers and your store's settings"),
    brex: t('expenses, receipts, bills, cards and travel'),
    pipedrive: t('deals, people and your pipeline'),
    docusign: t('envelopes, templates and agreements'),
    klaviyo: t('profiles, segments, campaigns and flows'),
    ashby: t('candidates, interviews and pipeline tasks'),
    'google-analytics': t('traffic, conversions and GA4 reports'),
    'google-search-console': t('search queries, clicks and indexing'),
    youtube: t("your channel's videos, playlists and stats"),
    kit: t('subscribers, tags and broadcasts'),
    instagram: t('posts, comments, messages and insights'),
    facebook: t("your Pages' posts, comments, messages and insights"),
    calendly: t('booking links, meetings and invitees'),
    'cal-com': t('bookings, event types and availability'),
    attio: t('people, companies, deals and lists'),
    zendesk: t('tickets, customers and your help center'),
    'microsoft-teams': t('chats, channels and meetings'),
    discord: t('your servers, channels and invites'),
    mercury: t('your accounts, balances and transactions'),
    posthog: t('analytics, insights and feature flags'),
    'google-ads': t('campaigns, ad groups, keywords and results'),
    'tiktok-ads': t('campaigns, ads, audiences and reports'),
    granola: t('your meeting notes, transcripts and folders'),
    resend: t('your emails, domains, audiences and broadcasts'),
    sharepoint: t('your sites, lists and files'),
    onenote: t('your notebooks, sections and pages'),
    'microsoft-to-do': t('your tasks and lists'),
    lovable: t('your projects, workspaces and their code'),
    // 17 October 2026: the ones added that day (the Zoho apps left the same day).
    whatsapp: t('your WhatsApp Business messages and templates'),
    twitch: t('your channel, streams, clips and chat'),
    'reddit-ads': t('campaigns, ad groups, ads and reports'),
    'pinterest-ads': t('campaigns, ad groups and their results'),
    omnisend: t('contacts, campaigns and automations'),
    dub: t('your short links, QR codes and clicks'),
    eventbrite: t('your events, tickets, orders and attendees'),
    'google-photos': t('your photos and albums'),
    mural: t('your workspaces, murals and sticky notes'),
    zeplin: t('projects, screens, components and style guides'),
    contentful: t('your spaces, content types and entries'),
    box: t("your files and folders, and who they're shared with"),
    confluence: t('your spaces and pages'),
    notebooklm: t('your notebooks, sources and audio overviews'),
    basecamp: t('your projects, to-dos, messages and schedules'),
    wrike: t('your tasks, projects and folders'),
    ticktick: t('your tasks and lists'),
    harvest: t('time entries, projects, clients and invoices'),
    typeform: t('your forms and their responses'),
    productboard: t('features, notes and customer feedback'),
    'google-maps': t('places, directions and travel times'),
    webex: t('your meetings, recordings and messages'),
    fathom: t('your recorded meetings, summaries and transcripts'),
    freshbooks: t('invoices, clients, expenses and time'),
    ynab: t('your budgets, accounts and transactions'),
    splitwise: t('your shared expenses, groups and balances'),
    shippo: t('shipping rates, labels and tracking'),
    'dynamics-365': t('leads, accounts, contacts and opportunities'),
    gitlab: t('projects, issues, merge requests and pipelines'),
    bitbucket: t('repositories, pull requests and pipelines'),
    pagerduty: t('incidents, on-call schedules and services'),
    'google-bigquery': t('your datasets and tables'),
    'hugging-face': t('your models, datasets and Spaces'),
    excalidraw: t('the diagrams they draw'),
    heygen: t('your videos, avatars and voices'),
    higgsfield: t('your images, videos and characters'),
    gamma: t('your presentations, documents and pages'),
    descript: t('your projects, media and edits'),
    lucid: t('your diagrams and boards'),
    eraser: t('your diagrams and documents'),
    mobbin: t("Mobbin's library of app screens and flows"),
    'magic-patterns': t('your designs and their history'),
    pandadoc: t('your documents, templates and their status'),
    otter: t('your meeting transcripts and summaries'),
    'read-ai': t('your meeting summaries, transcripts and action items'),
    fellow: t('your meeting notes, action items and agendas'),
    plaid: t("your Plaid integration's Items, Link conversion and usage"),
    clay: t('your tables, and research on companies and people'),
    netlify: t('your sites, deploys and environment settings'),
    neon: t('your projects, branches and databases'),
    // 17 October 2026, later: 52 on their makers' own servers.
    beehiiv: t('your publications, posts and subscribers'),
    mailerlite: t('subscribers, groups, campaigns and automations'),
    getresponse: t('contacts, lists, newsletters and automations'),
    'customer-io': t('people, segments, campaigns and messages'),
    lemlist: t('your campaigns, leads and replies'),
    mixpanel: t("your projects' events, funnels and retention"),
    amplitude: t('your charts, dashboards, cohorts and experiments'),
    bitly: t('your short links, QR codes and clicks'),
    brevo: t('contacts, lists, and email and SMS campaigns'),
    creatomate: t('your templates and the videos and images made from them'),
    shotstack: t('your video edits and renders'),
    bannerbear: t('your templates and the images and videos made from them'),
    cloudinary: t('your images, videos and folders'),
    sanity: t('your projects, documents and schemas'),
    wistia: t('your videos, channels and stats'),
    captions: t('your videos and projects'),
    storyblok: t('your spaces, stories, components and assets'),
    coda: t('your docs, tables and pages'),
    make: t('your scenarios and their runs'),
    tally: t('your forms and their submissions'),
    jotform: t('your forms and their submissions'),
    surveymonkey: t('your surveys and their responses'),
    canny: t('feature requests, votes, comments and your roadmap'),
    fireflies: t('your meeting transcripts, summaries and action items'),
    tldv: t('your meeting recordings, transcripts and notes'),
    avoma: t('your meeting notes, transcripts and deal insights'),
    missive: t("your team inbox's conversations, drafts and tasks"),
    mixmax: t('your sequences, meetings and email tracking'),
    close: t('leads, contacts, opportunities and calls'),
    aircall: t("your team's calls and their details"),
    workable: t('jobs, candidates and your hiring pipeline'),
    'breezy-hr': t('positions, candidates and your pipeline'),
    postman: t('your workspaces, collections and APIs'),
    railway: t('your projects, services, deploys and logs'),
    datadog: t('logs, metrics, monitors and incidents'),
    shortcut: t('stories, epics and iterations'),
    razorpay: t('payments, orders, refunds and settlements'),
    typefully: t('your drafts, scheduled posts and social accounts'),
    // 22 October 2026: the 45 the teams in `server/simeon/desktop/packs.json` ask for (those that answer from their own data are in `reachSentence`).
    gem: t('candidates, jobs, your pipeline and outreach'),
    'meta-ads': t('campaigns, ad sets, ads and results'),
    'loop-returns': t("your store's returns, exchanges and refunds"),
    upwork: t('jobs, freelancers, proposals and contracts'),
    karbon: t('your clients, work items and deadlines'),
    ignition: t('proposals, clients, invoices and payments'),
    appfolio: t('properties, units, tenants and work orders'),
    jobber: t('clients, quotes, jobs and invoices'),
    companycam: t('your projects, job site photos and checklists'),
    bamboohr: t('employees, time off, job openings and applicants'),
    '7shifts': t('your shifts, locations and team'),
    tiktok: t('your videos, posts and stats'),
    'follow-up-boss': t('leads, people, deals and appointments'),
    matterport: t('your 3D tours and their spaces'),
    'zoho-inventory': t('items, stock, sales orders and invoices'),
    toggl: t('time entries, projects, clients and reports'),
    heyreach: t('your LinkedIn campaigns, leads and conversations'),
    hireflix: t("your positions, interviews and candidates' answers"),
    clio: t('clients, matters, calendars, tasks and bills'),
    draftable: t('your document comparisons and their links'),
    chaser: t('customers, invoices and who owes what'),
    taxjar: t('sales tax rates, transactions and customers'),
    maintainx: t('work orders, requests, assets and locations'),
    seam: t('your smart locks, spaces and access codes'),
    route4me: t('your routes, stops and orders'),
    gatherup: t('your businesses, customers and feedback requests'),
    oneup: t('your scheduled posts, social accounts and their results'),
    mindbody: t("your studio's classes, appointments, clients and sales"),
  }
}

/** Apps the agents can only read (the catalogue says so). */
const readOnly: ReadonlySet<string> = new Set([
  'mercury',
  'figma',
  'otter',
  'plaid',
  'tldv',
  'draftable',
])

/** Apps whose reach is said another way. */
function reachSentences(): Record<string, string> {
  return {
    linkedin: t(
      'Your agents can read your profile and publish posts on {App}.',
    ),
    link: t(
      'Your agents can ask {App} for a one-time card to pay for something you asked them to buy, and read the bank and card accounts you choose to share.',
    ),
    shop: t(
      'Your agents can find products across Shopify stores, pay for what you asked them to buy with your {App} card, and track your orders.',
    ),
    // Services that answer from their own data (the web, search engines, contact databases) or run AI models, not an account's records.
    ahrefs: t(
      'Your agents can look up backlinks, keywords and site audits in {App}.',
    ),
    moz: t(
      'Your agents can look up domain authority, links and keywords in {App}.',
    ),
    dataforseo: t(
      'Your agents can look up search results, keywords and backlinks with {App}.',
    ),
    semrush: t(
      'Your agents can look up keywords, traffic and backlinks for any site in {App}.',
    ),
    hunter: t(
      'Your agents can find and verify professional email addresses with {App}.',
    ),
    lusha: t('Your agents can look up contact and company details with {App}.'),
    tavily: t('Your agents can search the web and read pages through {App}.'),
    exa: t('Your agents can search the web and read pages through {App}.'),
    runway: t(
      "Your agents can make and edit videos and images with {App}'s AI models.",
    ),
    'black-forest-labs': t(
      "Your agents can make and edit images with {App}, Black Forest Labs' AI models.",
    ),
    fal: t(
      "Your agents can run {App}'s AI models for images, video and audio.",
    ),
    replicate: t('Your agents can run AI models on {App}.'),
    elevenlabs: t(
      'Your agents can make speech, sound effects and music with {App}, and use your voices.',
    ),
    coinbase: t(
      'Your agents can use your {App} account through Coinbase for Agents, within what you allow when you sign in.',
    ),
    // 22 October 2026, the same kind among the 45 of `packs.json`: data, search and estimates; Uber, Instacart and TaskRabbit hand the booking or the order to the person.
    crunchbase: t(
      'Your agents can look up companies, funding rounds, investors and the people behind them in {App}.',
    ),
    courtlistener: t(
      'Your agents can search case law, court dockets and judges in {App}, and set up alerts.',
    ),
    uber: t(
      'Your agents can get ride estimates from {App}, and links to book a ride.',
    ),
    instacart: t(
      'Your agents can turn recipes and shopping lists into {App} pages to order from.',
    ),
    taskrabbit: t(
      "Your agents can check {App}'s services, prices and Taskers near you, and start a booking for you to finish.",
    ),
    veryfi: t(
      'Your agents can turn receipts, invoices and bills into data with {App}.',
    ),
    yelp: t(
      'Your agents can find businesses and events on {App}, and read their reviews and ratings.',
    ),
    vidiq: t(
      "Your agents can research YouTube channels, videos, trends and keywords with {App}, and read your own channel's stats.",
    ),
    'youtube-transcript': t(
      'Your agents can get the transcripts of YouTube videos, playlists and channels with {App}.',
    ),
    hypeauditor: t(
      'Your agents can find influencers and look up their audiences and reach with {App}.',
    ),
    zoominfo: t(
      'Your agents can look up companies, contacts, buying intent and news with {App}.',
    ),
    contactout: t(
      'Your agents can find emails and phone numbers for people and companies with {App}.',
    ),
    midpage: t(
      'Your agents can search case law, court filings and statutes in {App}, with citations.',
    ),
    vaquill: t(
      'Your agents can look up US statutes, session laws and citations with {App}.',
    ),
    'aiwyn-tax': t(
      'Your agents can estimate federal and state taxes with {App}.',
    ),
    ignav: t(
      'Your agents can search flights and fares with {App}, and get links to book them.',
    ),
    tripadvisor: t(
      'Your agents can look up hotels, restaurants and things to do on {App}, with their reviews and photos.',
    ),
  }
}

/** Apps whose sign-in is said another way. */
function signInSentences(): Record<string, string> {
  return {
    // Link signs in with a code on link.com or in its app, and runs on Simeon's cloud computer (desktop/source/shared/node/link-wallet/).
    link: t(
      "You'll approve the connection on link.com or in the {App} app; your cloud computer keeps it. Simeon never sees your password or your card numbers.",
    ),
    // Shop signs in with a code on Shop's own page, and runs from Simeon's cloud computer (desktop/source/shared/node/shop-wallet/).
    shop: t(
      "You'll approve the connection on {App}'s own page with your {App} account; your cloud computer keeps it. Simeon never sees your password or your card numbers.",
    ),
    // Excalidraw's server answers anyone (`noSignIn` in the catalog): there is nothing to sign in to.
    excalidraw: t(
      "There's nothing to sign in to: your agents draw on {App}'s own server (mcp.excalidraw.com), and Simeon holds no account of yours there.",
    ),
    // TaskRabbit's answers anyone too (`noSignIn`, 22 October 2026); the booking it starts is finished on TaskRabbit, by the person.
    taskrabbit: t(
      "There's nothing to sign in to: your agents search on {App}'s own server (mcp.taskrabbit.com), and Simeon holds no account of yours there.",
    ),
  }
}

/** Apps where money moves for real. */
const money: ReadonlySet<string> = new Set([
  'stripe',
  'paypal',
  'square',
  'ramp',
  'brex',
  'quickbooks',
  'xero',
  'gusto',
  'freshbooks',
  'razorpay',
  'coinbase',
  'loop-returns',
  'upwork',
  'ignition',
])

/** One more thing worth knowing about an app. */
function notes(): Record<string, string> {
  return {
    shopify: t(
      'Changes your agents make to products, prices or orders show on your live store. Check their edits before your customers see them.',
    ),
    mercury: t(
      "Read only: your agents can see your accounts but can't move money.",
    ),
    linkedin: t(
      "Only posting and your own profile: your agents can't read your feed or your messages.",
    ),
    instagram: t('Works with Business and Creator accounts.'),
    facebook: t('Works with the Facebook Pages you manage.'),
    jira: t(
      'One sign-in with your Atlassian account covers Jira and Confluence.',
    ),
    kit: t('Kit was called ConvertKit.'),
    github: t(
      'Your agents act with your GitHub access, in every repository you can reach.',
    ),
    'google-ads': t('Changes to live campaigns and budgets can spend money.'),
    'tiktok-ads': t('Changes to live campaigns and budgets can spend money.'),
    vercel: t('Changes here can affect your live sites.'),
    cloudflare: t('Changes here can affect your live sites.'),
    supabase: t('Changes here can affect your live data.'),
    gmail: t('Emails your agents send go out from your own address.'),
    outlook: t('Emails your agents send go out from your own address.'),
    docusign: t('Envelopes your agents send go out in your name.'),
    resend: t('Emails your agents send go out from your own domains.'),
    lovable: t(
      'Your agents can change and publish your projects. Published changes go live.',
    ),
    whatsapp: t(
      'Works with WhatsApp Business accounts, not personal WhatsApp. Messages your agents send go out from your business number.',
    ),
    notebooklm: t(
      'Works with NotebookLM Enterprise in a licensed Google Cloud project, not the free NotebookLM.',
    ),
    'reddit-ads': t('Changes to live campaigns and budgets can spend money.'),
    'pinterest-ads': t(
      'Changes to live campaigns and budgets can spend money.',
    ),
    pandadoc: t('Documents your agents send go out in your name.'),
    shippo: t('Labels your agents buy are charged to your Shippo account.'),
    gitlab: t(
      'Your agents act with your GitLab access, in every project you can reach.',
    ),
    bitbucket: t(
      'Your agents act with your Bitbucket access, in every repository you can reach.',
    ),
    netlify: t('Changes here can affect your live sites.'),
    neon: t('Changes here can affect your live data.'),
    contentful: t('Entries your agents publish go live on your site.'),
    'google-bigquery': t('Queries are billed to your Google Cloud project.'),
    heygen: t('Making videos uses your HeyGen credits.'),
    higgsfield: t('Making images and videos uses your Higgsfield credits.'),
    gamma: t('Making presentations uses your Gamma credits.'),
    clay: t('Enrichment uses your Clay credits.'),
    excalidraw: t(
      'A drawing your agents share gets a link on excalidraw.com that anyone with the link can open.',
    ),
    plaid: t(
      "For teams building on Plaid: it reads your integration's dashboard, not your own bank accounts.",
    ),
    shop: t(
      'Nothing is paid until you press Allow on the purchase. At a Shopify store, Shop then places the order with your Shop card; anywhere else, you approve it in the Shop app and the store gets a one-time card, never your real one.',
    ),
    link: t(
      "Nothing is paid until you approve the purchase in the Link app, up to $500 each and $500 a day. Get the Link app on your phone (or add a passkey at link.com): Link approves agents' purchases only there. Each purchase gets its own one-time card, never your real one. US accounts only.",
    ),
    beehiiv: t('Posts your agents send reach your real subscribers.'),
    mailerlite: t('Campaigns your agents send reach your real subscribers.'),
    getresponse: t('Newsletters your agents send reach your real contacts.'),
    'customer-io': t('Messages your agents send reach real people.'),
    brevo: t('Emails and texts your agents send reach your real contacts.'),
    lemlist: t('Campaigns your agents start send real emails to your leads.'),
    mixmax: t('Emails your agents send go out from your own address.'),
    missive: t("Messages your agents send go out from your team's addresses."),
    typefully: t('Posts your agents publish go out on your accounts.'),
    sanity: t('Documents your agents publish go live on your site.'),
    storyblok: t('Stories your agents publish go live on your site.'),
    railway: t('Changes here can affect your live services.'),
    make: t(
      'Scenarios your agents run do real work in the apps they connect, and use your Make operations.',
    ),
    runway: t('Making videos and images uses your Runway credits.'),
    'black-forest-labs': t(
      'Making images uses your Black Forest Labs credits.',
    ),
    fal: t('Running models uses your fal.ai credits.'),
    replicate: t(
      "Replicate's page asks for an API token from your Replicate account. Running models is billed to that account.",
    ),
    elevenlabs: t(
      'Making speech, sound effects and music uses your ElevenLabs credits.',
    ),
    creatomate: t('Rendering uses your Creatomate credits.'),
    shotstack: t('Rendering uses your Shotstack credits.'),
    bannerbear: t('Making images and videos uses your Bannerbear credits.'),
    dataforseo: t('Each lookup is charged to your DataForSEO balance.'),
    hunter: t('Searches and verifications use your Hunter credits.'),
    lusha: t('Lookups use your Lusha credits.'),
    tavily: t('Searches use your Tavily credits.'),
    exa: t('Searches are billed to your Exa account.'),
    moz: t('Needs a Moz API plan.'),
    canny: t("Works on Canny's Pro plan."),
    tldv: t("Read only, on tl;dv's Pro plan."),
    datadog: t("Works with Datadog's US1 site (app.datadoghq.com)."),
    coinbase: t(
      "Anything that moves money or crypto in Coinbase is real. Ask your agents to check with you before they move any. Coinbase may let only apps it has approved sign in; if its page refuses, Coinbase can't be connected yet.",
    ),
    // 22 October 2026, the 45 of `packs.json`. Each app whose sign-in page asks for the person's own key says so, as Replicate's does.
    crunchbase: t(
      'Needs a Crunchbase plan with MCP access, given by your workspace owner.',
    ),
    'meta-ads': t('Changes to live campaigns and budgets can spend money.'),
    '7shifts': t(
      'The sign-in page asks for an access token from your 7shifts account.',
    ),
    veryfi: t(
      'The sign-in page asks for an API key from your Veryfi account. Each document read can be billed to that account.',
    ),
    tiktok: t(
      'Videos and photos your agents post go out on your TikTok account.',
    ),
    'zoho-inventory': t(
      'Invoices and statements your agents email go out to your real customers.',
    ),
    toggl: t('The sign-in page asks for an API token from your Toggl account.'),
    vidiq: t('Research uses your vidIQ credits.'),
    'youtube-transcript': t(
      "The sign-in page asks for an API key from your YouTube Transcript account. Fetching new transcripts uses that account's credits.",
    ),
    hypeauditor: t(
      'The sign-in page asks for an API key from your HypeAuditor account.',
    ),
    zoominfo: t('Enrichment uses your ZoomInfo credits.'),
    heyreach: t(
      'The sign-in page asks for an API key from your HeyReach account.',
    ),
    contactout: t(
      'The sign-in page asks for an API token from your ContactOut account. Lookups use your ContactOut credits.',
    ),
    hireflix: t(
      'The sign-in page asks for an API key from your Hireflix account. Invitations your agents send reach real candidates.',
    ),
    draftable: t(
      'The sign-in page asks for an API key from your Draftable account.',
    ),
    chaser: t('The sign-in page asks for an API key from your Chaser account.'),
    vaquill: t(
      'The sign-in page asks for an API key from your Vaquill account. Lookups use your Vaquill credits.',
    ),
    taxjar: t(
      'The sign-in page asks for an API token from your TaxJar account. Transactions your agents record count in your sales tax reports and filings.',
    ),
    maintainx: t(
      'The sign-in page asks for an API key from your MaintainX account.',
    ),
    seam: t(
      'The sign-in page asks for an API key from your Seam account. Access codes and keys your agents grant open real doors.',
    ),
    route4me: t(
      'The sign-in page asks for an API key from your Route4Me account.',
    ),
    gatherup: t(
      'The sign-in page asks for an API key from your GatherUp account. Feedback requests your agents send reach your real customers.',
    ),
    oneup: t(
      'The sign-in page asks for an API key from your OneUp account. Posts your agents publish go out on your accounts.',
    ),
    mindbody: t(
      'The sign-in page asks for an API key from your Mindbody account.',
    ),
    ignav: t('The sign-in page asks for an API key from your Ignav account.'),
    tripadvisor: t(
      'The sign-in page asks for an API key from your Tripadvisor account.',
    ),
  }
}
