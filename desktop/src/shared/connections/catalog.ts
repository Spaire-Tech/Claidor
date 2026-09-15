import type { Platform } from '../platform/constants';

/**
 * The connections catalogue: every service an agent can reach, and how.
 *
 * **Rebuilt on 15 September against what the endpoints actually said.**
 * The founder asked for "a brand new list of connectors we should use …
 * a full list, categories", and the list is
 * `docs/product/connectors-list-2026-09-15.md`. Every route below was
 * checked that day by talking to the vendor's own MCP endpoint
 * (`docs/product/connectors-probe-2026-09-15.txt` and `-new-list.txt`):
 *
 * - **Self** — the vendor runs an MCP server and lets a client register
 *   itself (RFC 7591), so the engine signs the person in with nothing
 *   from us. `via: Mcp` with no `registration`. Sixty-three of them.
 * - **Own client** — the vendor's MCP server wants a client we register
 *   with them first. Our config cannot pass a client id, so these are
 *   `registration: Preregistered` and the card says "Not yet".
 * - **Open** — an MCP server with no sign-in at all. `open: true`.
 * - **Channel** — the engine carries the plugin (`openclaw/extensions/`)
 *   and the service is a way to reach the agent, not an account it reads.
 * - **Browser** / **Local** — no account: the person's own browser, or
 *   this computer.
 * - **Soon** — no vendor MCP was found. The card says so.
 *
 * The first nine groups and their order are the founder's, from the
 * 15 September canvas. The other four hold what the new list added and
 * the canvas never had a group for.
 *
 * Nothing here records whether a service *is* connected. That is read
 * from the engine's own state, because a copy drifts and then lies.
 */

/** Where a logo file lives; `logo` is a file name under it. */
export const APP_LOGO_DIRECTORY = 'logos/apps';

export const ConnectionKind = {
  /** An account somewhere. Connect means sign in; see `connect`. */
  Account: 'account',
  /** A way to reach the agent; `platformId` when the app offers it today. */
  Channel: 'channel',
  /** No account needed: the agent uses the person's own browser. */
  Browser: 'browser',
  /** On this computer already. */
  Local: 'local',
  /** No honest way in yet. The card says so rather than offering a button. */
  Soon: 'soon',
} as const;
export type ConnectionKind = typeof ConnectionKind[keyof typeof ConnectionKind];

/**
 * How an account connects. The whole of the route decision lives in this
 * one field, which is what lets a service move between routes without
 * anything else changing.
 */
export const ConnectVia = {
  /**
   * The vendor's own MCP endpoint, with the engine doing OAuth
   * (`openclaw/src/agents/mcp-oauth.ts`). No middleman, nothing of ours
   * between the person and their data.
   */
  Mcp: 'mcp',
  /** The vendor's MCP endpoint, but it wants a token pasted, not a sign-in. */
  Token: 'token',
  /** An MCP server that runs on this computer. */
  Local: 'local',
  /** Pipedream Connect, through our proxy. The fallback, and not wired. */
  Pipedream: 'pipedream',
} as const;
export type ConnectVia = typeof ConnectVia[keyof typeof ConnectVia];

export const OAuthRegistration = {
  /** The engine registers itself with the provider at first sign-in. */
  Dynamic: 'dynamic',
  /**
   * The provider expects a client registered up front — the probe found
   * no registration endpoint. Our config cannot pass a client id
   * (`openclaw/src/config/types.mcp.ts` has scope, redirectUrl and
   * clientMetadataUrl and nothing else), so until we register one with
   * each of these vendors the card says "Not yet". Marked rather than
   * hidden, so the card is honest and a test can count them.
   */
  Preregistered: 'preregistered',
} as const;
export type OAuthRegistration = typeof OAuthRegistration[keyof typeof OAuthRegistration];

export type ConnectMethod =
  | {
    readonly via: typeof ConnectVia.Mcp;
    readonly url: string;
    readonly scope?: string;
    readonly registration?: typeof OAuthRegistration.Preregistered;
    /** No sign-in at all: the server answered the probe with 200 and no challenge. */
    readonly open?: true;
  }
  | {
    readonly via: typeof ConnectVia.Token;
    readonly url: string;
    /** The header the token rides in; not always `Authorization`. */
    readonly header: string;
    /** The name the vendor's own docs give the token. */
    readonly tokenEnv: string;
    /** What goes before it, when anything does — usually `Bearer `. */
    readonly prefix?: string;
  }
  | {
    readonly via: typeof ConnectVia.Local;
    readonly command: string;
    readonly args: readonly string[];
    readonly env?: readonly string[];
  }
  | { readonly via: typeof ConnectVia.Pipedream; readonly appSlug: string };

/** The founder's tag lines under a name. */
export const ConnectionTag = {
  ThroughYourBrowser: 'through-your-browser',
} as const;
export type ConnectionTag = typeof ConnectionTag[keyof typeof ConnectionTag];

export const ConnectionGroupId = {
  MailCalendar: 'mail-calendar',
  Messaging: 'messaging',
  FilesDocs: 'files-docs',
  Productivity: 'productivity',
  Meetings: 'meetings',
  Creativity: 'creativity',
  Finance: 'finance',
  Sales: 'sales',
  Developer: 'developer',
  Marketing: 'marketing',
  Hiring: 'hiring',
  Social: 'social',
  ShoppingTravel: 'shopping-travel',
} as const;
export type ConnectionGroupId = typeof ConnectionGroupId[keyof typeof ConnectionGroupId];

export interface ConnectionGroupDef {
  readonly id: ConnectionGroupId;
  readonly title: string;
}

/**
 * Thirteen groups. The first nine are the canvas's, in its order and
 * with its titles. The last four are the new list's, for the services
 * the canvas never drew a group for — filing Ahrefs under Sales and
 * Ashby under Productivity would have made two groups meaningless.
 */
export const CONNECTION_GROUPS: readonly ConnectionGroupDef[] = [
  { id: ConnectionGroupId.MailCalendar, title: 'Mail & Calendar' },
  { id: ConnectionGroupId.Messaging, title: 'Messaging' },
  { id: ConnectionGroupId.FilesDocs, title: 'Files & Docs' },
  { id: ConnectionGroupId.Productivity, title: 'Productivity & Tasks' },
  { id: ConnectionGroupId.Meetings, title: 'Meetings' },
  { id: ConnectionGroupId.Creativity, title: 'Creativity' },
  { id: ConnectionGroupId.Finance, title: 'Finance & Money' },
  { id: ConnectionGroupId.Sales, title: 'Sales & Customers' },
  { id: ConnectionGroupId.Developer, title: 'Developer' },
  { id: ConnectionGroupId.Marketing, title: 'Marketing & Growth' },
  { id: ConnectionGroupId.Hiring, title: 'Hiring & People' },
  { id: ConnectionGroupId.Social, title: 'Social' },
  { id: ConnectionGroupId.ShoppingTravel, title: 'Shopping & Travel' },
];

interface ConnectionItemBase {
  /** Stable id, unique across the catalogue. */
  readonly id: string;
  /** The product's name, literal. */
  readonly name: string;
  readonly group: ConnectionGroupId;
  /** One line about what the service does. Searched, not shown on the card. */
  readonly line?: string;
  readonly tag?: ConnectionTag;
  /** File name under `APP_LOGO_DIRECTORY`; none shows the monogram. */
  readonly logo?: string;
}

export type ConnectionItem = ConnectionItemBase & (
  | { readonly kind: typeof ConnectionKind.Account; readonly connect: ConnectMethod }
  | { readonly kind: typeof ConnectionKind.Channel; readonly platformId?: Platform }
  | { readonly kind: typeof ConnectionKind.Browser }
  | { readonly kind: typeof ConnectionKind.Local }
  | { readonly kind: typeof ConnectionKind.Soon }
);

const G = ConnectionGroupId;
const K = ConnectionKind;
const C = ConnectVia;
const R = OAuthRegistration;

/** The vendor's own MCP server, and it registers us itself. */
const self = (url: string, scope?: string): ConnectMethod => (
  { via: C.Mcp, url, ...(scope ? { scope } : {}) }
);
/** The vendor's own MCP server, but it wants a client we have not registered. */
const own = (url: string, scope?: string): ConnectMethod => (
  { via: C.Mcp, url, registration: R.Preregistered, ...(scope ? { scope } : {}) }
);
/** The vendor's own MCP server, with no sign-in. */
const open = (url: string): ConnectMethod => ({ via: C.Mcp, url, open: true });
/** A token pasted, `Bearer` unless said otherwise. */
const token = (url: string, tokenEnv: string, header = 'Authorization', prefix: string | undefined = 'Bearer '): ConnectMethod => (
  { via: C.Token, url, header, tokenEnv, ...(prefix ? { prefix } : {}) }
);
/** No vendor MCP found; the middleman would carry it, and that is not wired. */
const viaUs = (appSlug: string): ConnectMethod => ({ via: C.Pipedream, appSlug });

/** Every service, grouped, in order. */
export const CONNECTION_ITEMS: readonly ConnectionItem[] = [
  // Mail & Calendar
  { id: 'gmail', name: 'Gmail', group: G.MailCalendar, kind: K.Account, connect: own('https://gmailmcp.googleapis.com/mcp/v1'), line: 'Search, read, draft, and manage email.', logo: 'gmail.webp' },
  { id: 'outlook', name: 'Outlook', group: G.MailCalendar, kind: K.Account, connect: viaUs('microsoft_outlook'), line: 'Mail and Microsoft 365 calendar.', logo: 'outlook.webp' },
  { id: 'google-calendar', name: 'Google Calendar', group: G.MailCalendar, kind: K.Account, connect: own('https://calendarmcp.googleapis.com/mcp/v1'), line: 'Search events and schedule meetings.', logo: 'google-calendar.webp' },
  { id: 'apple-calendar', name: 'Apple Calendar', group: G.MailCalendar, kind: K.Local, logo: 'apple-calendar-mac.png' },
  // Not a service: any mailbox the person already has, reached over
  // IMAP and SMTP with an app password. Two things use it — the
  // `@clawemail/email` plugin, which makes the mailbox a way to reach
  // the agent, and the bundled `imap-smtp-email` skill, which reads and
  // sends from it. It is also the honest way into Gmail and Outlook
  // today, since their own servers want a client we have not registered.
  { id: 'email', name: 'IMAP mailbox', group: G.MailCalendar, kind: K.Channel, platformId: 'email', line: 'Your own mailbox over IMAP and SMTP with an app password: Gmail, Outlook, iCloud, Fastmail, work mail. The agent reads, searches and sends from it, and can be emailed at it.' },
  { id: 'calendly', name: 'Calendly', group: G.MailCalendar, kind: K.Account, connect: self('https://mcp.calendly.com/'), line: 'Check availability and book, cancel, or reschedule.', logo: 'calendly.svg' },
  // Messaging
  { id: 'whatsapp', name: 'WhatsApp', group: G.Messaging, kind: K.Channel, logo: 'whatsapp.svg' },
  { id: 'imessage', name: 'iMessage', group: G.Messaging, kind: K.Channel, logo: 'imessage.webp' },
  { id: 'slack', name: 'Slack', group: G.Messaging, kind: K.Channel, line: 'Reach the agent from Slack; reading a workspace needs a client Slack has not given us.' },
  { id: 'microsoft-teams', name: 'Microsoft Teams', group: G.Messaging, kind: K.Channel },
  { id: 'telegram', name: 'Telegram', group: G.Messaging, kind: K.Channel, platformId: 'telegram', logo: 'telegram.svg' },
  { id: 'discord', name: 'Discord', group: G.Messaging, kind: K.Channel, platformId: 'discord', logo: 'discord.svg' },
  { id: 'signal', name: 'Signal', group: G.Messaging, kind: K.Channel, logo: 'signal.svg' },
  { id: 'google-chat', name: 'Google Chat', group: G.Messaging, kind: K.Channel },
  // Files & Docs
  { id: 'google-drive', name: 'Google Drive', group: G.FilesDocs, kind: K.Account, connect: own('https://drivemcp.googleapis.com/mcp/v1'), line: 'Search, read, create, and share files.', logo: 'google-drive.svg' },
  { id: 'google-docs', name: 'Google Docs', group: G.FilesDocs, kind: K.Account, connect: own('https://docsmcp.googleapis.com/mcp/v1'), line: 'Read and write documents.', logo: 'google-docs.svg' },
  { id: 'google-sheets', name: 'Google Sheets', group: G.FilesDocs, kind: K.Account, connect: own('https://sheetsmcp.googleapis.com/mcp/v1'), line: 'Read and write spreadsheets.', logo: 'google-sheets.webp' },
  { id: 'google-slides', name: 'Google Slides', group: G.FilesDocs, kind: K.Account, connect: own('https://slidesmcp.googleapis.com/mcp/v1'), line: 'Read and build presentations.', logo: 'google-slides.webp' },
  { id: 'onedrive', name: 'OneDrive', group: G.FilesDocs, kind: K.Account, connect: viaUs('microsoft_onedrive'), logo: 'onedrive.jpg' },
  { id: 'word', name: 'Word', group: G.FilesDocs, kind: K.Local, logo: 'word.webp' },
  { id: 'excel', name: 'Excel', group: G.FilesDocs, kind: K.Local, logo: 'excel.webp' },
  { id: 'powerpoint', name: 'PowerPoint', group: G.FilesDocs, kind: K.Local, logo: 'powerpoint.webp' },
  { id: 'dropbox', name: 'Dropbox', group: G.FilesDocs, kind: K.Account, connect: self('https://mcp.dropbox.com/mcp'), line: 'Search, read, and organise files.', logo: 'dropbox.svg' },
  { id: 'box', name: 'Box', group: G.FilesDocs, kind: K.Account, connect: own('https://mcp.box.com'), line: 'Search and read files and folders.' },
  { id: 'notion', name: 'Notion', group: G.FilesDocs, kind: K.Account, connect: self('https://mcp.notion.com/mcp'), line: 'Search, read, and write pages and databases.', logo: 'notion.svg' },
  { id: 'apple-notes', name: 'Apple Notes', group: G.FilesDocs, kind: K.Local, logo: 'apple-notes.webp' },
  { id: 'coda', name: 'Coda', group: G.FilesDocs, kind: K.Account, connect: self('https://docs.superhuman.com/apis/mcp'), line: 'Search docs, read pages, and update tables.' },
  { id: 'craft', name: 'Craft', group: G.FilesDocs, kind: K.Account, connect: self('https://mcp.craft.do/my/mcp'), line: 'Search, create, and update documents and daily notes.' },
  { id: 'mem', name: 'Mem', group: G.FilesDocs, kind: K.Account, connect: self('https://mcp.mem.ai/mcp'), line: 'Capture, search, and organize notes and collections.' },
  { id: 'guru', name: 'Guru', group: G.FilesDocs, kind: K.Account, connect: self('https://mcp.api.getguru.com/mcp'), line: 'Search company knowledge and draft verified answers.' },
  { id: 'readwise', name: 'Readwise', group: G.FilesDocs, kind: K.Account, connect: self('https://mcp2.readwise.io/mcp'), line: 'Search highlights and Reader documents, save articles.' },
  // Productivity & Tasks
  { id: 'todoist', name: 'Todoist', group: G.Productivity, kind: K.Account, connect: self('https://ai.todoist.net/mcp'), line: 'Create, find, and complete tasks and projects.', logo: 'todoist.svg' },
  { id: 'apple-reminders', name: 'Apple Reminders', group: G.Productivity, kind: K.Local, logo: 'apple-reminders.png' },
  { id: 'google-tasks', name: 'Google Tasks', group: G.Productivity, kind: K.Account, connect: viaUs('google_tasks'), logo: 'googletasks.svg' },
  { id: 'trello', name: 'Trello', group: G.Productivity, kind: K.Account, connect: viaUs('trello'), line: 'Boards, lists, and cards.', logo: 'trello.svg' },
  { id: 'asana', name: 'Asana', group: G.Productivity, kind: K.Account, connect: self('https://mcp.asana.com/mcp'), line: 'Search and update tasks and projects.', logo: 'asana.svg' },
  { id: 'monday', name: 'Monday', group: G.Productivity, kind: K.Account, connect: self('https://mcp.monday.com/mcp'), line: 'Read and update boards and items.' },
  { id: 'clickup', name: 'ClickUp', group: G.Productivity, kind: K.Account, connect: self('https://mcp.clickup.com/mcp'), line: 'Search and update tasks, docs, and lists.' },
  { id: 'airtable', name: 'Airtable', group: G.Productivity, kind: K.Account, connect: self('https://mcp.airtable.com/mcp'), line: 'Query and update bases, tables, and records.' },
  { id: 'jotform', name: 'Jotform', group: G.Productivity, kind: K.Account, connect: self('https://mcp.jotform.com'), line: 'Create and edit forms, then read submissions.' },
  { id: 'typeform', name: 'Typeform', group: G.Productivity, kind: K.Account, connect: self('https://api.typeform.com/mcp'), line: 'Build forms, analyze responses, and manage contacts.' },
  { id: 'smartsheet', name: 'Smartsheet', group: G.Productivity, kind: K.Account, connect: token('https://mcp.smartsheet.com', 'SMARTSHEET_API_TOKEN'), line: 'Query and update sheets, rows, and workspaces.' },
  { id: 'wrike', name: 'Wrike', group: G.Productivity, kind: K.Account, connect: token('https://mcp.wrike.com/v2', 'WRIKE_ACCESS_TOKEN'), line: 'Search projects, create tasks, and post comments.' },
  // Meetings
  { id: 'zoom', name: 'Zoom', group: G.Meetings, kind: K.Account, connect: own('https://mcp.zoom.us/mcp/zoom/streamable'), line: 'Search meetings, pull transcripts, and work with Zoom Docs.', logo: 'zoom.webp' },
  { id: 'google-meet', name: 'Google Meet', group: G.Meetings, kind: K.Account, connect: viaUs('google_meet'), logo: 'google-meet.webp' },
  { id: 'fathom', name: 'Fathom', group: G.Meetings, kind: K.Account, connect: self('https://api.fathom.ai/mcp'), line: 'Search meetings and pull transcripts and summaries.', logo: 'fathom.jpg' },
  { id: 'otter', name: 'Otter', group: G.Meetings, kind: K.Account, connect: self('https://mcp.otter.ai/mcp'), line: 'Search meeting history and pull full transcripts.' },
  { id: 'fireflies', name: 'Fireflies', group: G.Meetings, kind: K.Account, connect: self('https://api.fireflies.ai/mcp'), line: 'Search meeting transcripts, summaries, and action items.' },
  { id: 'circleback', name: 'Circleback', group: G.Meetings, kind: K.Account, connect: self('https://circleback.ai/api/mcp'), line: 'Search meetings, transcripts, action items, and emails.' },
  { id: 'loom', name: 'Loom', group: G.Meetings, kind: K.Soon },
  // Creativity
  { id: 'canva', name: 'Canva', group: G.Creativity, kind: K.Account, connect: self('https://mcp.canva.com/mcp'), line: 'Create and edit designs.' },
  { id: 'figma', name: 'Figma', group: G.Creativity, kind: K.Account, connect: self('https://mcp.figma.com/mcp'), line: 'Read files, frames, and design context.', logo: 'figma.svg' },
  { id: 'miro', name: 'Miro', group: G.Creativity, kind: K.Account, connect: self('https://mcp.miro.com/mcp'), line: 'Read and build boards.' },
  { id: 'gamma', name: 'Gamma', group: G.Creativity, kind: K.Account, connect: self('https://mcp.gamma.app/mcp'), line: 'Generate presentations, documents, and webpages.' },
  { id: 'webflow', name: 'Webflow', group: G.Creativity, kind: K.Account, connect: self('https://mcp.webflow.com/mcp'), line: 'Manage sites, pages, and CMS content.' },
  { id: 'wix', name: 'Wix', group: G.Creativity, kind: K.Account, connect: self('https://mcp.wix.com/mcp'), line: 'Manage sites, stores, and bookings.' },
  { id: 'excalidraw', name: 'Excalidraw', group: G.Creativity, kind: K.Account, connect: open('https://mcp.excalidraw.com/mcp'), line: 'Draw and export hand-drawn diagrams from chat.' },
  { id: 'adobe-express', name: 'Adobe Express', group: G.Creativity, kind: K.Browser },
  { id: 'youtube-studio', name: 'YouTube Studio', group: G.Creativity, kind: K.Browser, logo: 'youtubestudio.svg' },
  // Finance & Money
  { id: 'stripe', name: 'Stripe', group: G.Finance, kind: K.Account, connect: self('https://mcp.stripe.com'), line: 'Customers, payments, subscriptions, and invoices.', logo: 'stripe.svg' },
  { id: 'paypal', name: 'PayPal', group: G.Finance, kind: K.Account, connect: self('https://mcp.paypal.com/mcp'), line: 'Invoices, orders, and transactions.', logo: 'paypal.svg' },
  { id: 'square', name: 'Square', group: G.Finance, kind: K.Account, connect: self('https://mcp.squareup.com/mcp'), line: 'Payments, orders, catalog, and customers.' },
  { id: 'quickbooks', name: 'QuickBooks', group: G.Finance, kind: K.Account, connect: viaUs('quickbooks'), logo: 'quickbooks.svg' },
  { id: 'xero', name: 'Xero', group: G.Finance, kind: K.Account, connect: { via: C.Local, command: 'npx', args: ['-y', '@xeroapi/xero-mcp-server@latest'], env: ['XERO_CLIENT_ID', 'XERO_CLIENT_SECRET'] }, line: 'Read and write invoices, contacts, reports, and payroll.', logo: 'xero.svg' },
  { id: 'shopify', name: 'Shopify', group: G.Finance, kind: K.Browser, logo: 'shopify.svg' },
  { id: 'amazon-seller', name: 'Amazon Seller', group: G.Finance, kind: K.Browser },
  { id: 'brex', name: 'Brex', group: G.Finance, kind: K.Account, connect: self('https://api.brex.com/mcp'), line: 'Query expenses, receipts, bills, cards, and travel.' },
  { id: 'mercury', name: 'Mercury', group: G.Finance, kind: K.Account, connect: self('https://mcp.mercury.com/mcp'), line: 'Read balances, transactions, statements, and cards.' },
  { id: 'ramp', name: 'Ramp', group: G.Finance, kind: K.Account, connect: self('https://mcp.ramp.com/mcp'), line: 'Expenses, cards, bills, and reimbursements.' },
  { id: 'navan', name: 'Navan', group: G.Finance, kind: K.Account, connect: self('https://mcp.navan.com/mcp'), line: 'Query expenses, travel bookings, policies, and cards.' },
  { id: 'interactive-brokers', name: 'Interactive Brokers', group: G.Finance, kind: K.Account, connect: self('https://api.ibkr.com/v1/api/mcp-public'), line: 'Review positions, balances, P&L, and draft trade instructions.' },
  { id: 'webull', name: 'Webull', group: G.Finance, kind: K.Account, connect: self('https://api.webull.com/mcp'), line: 'View accounts, positions, orders, watchlists, and market data.' },
  { id: 'daloopa', name: 'Daloopa', group: G.Finance, kind: K.Account, connect: self('https://mcp.daloopa.com/server/mcp'), line: 'Pull source-linked fundamentals, KPIs, filings, and prices.' },
  { id: 'sp-global', name: 'S&P Global', group: G.Finance, kind: K.Account, connect: self('https://kfinance.kensho.com/integrations/mcp'), line: 'Query S&P Capital IQ financials, prices, and transcripts.' },
  // Sales & Customers
  { id: 'hubspot', name: 'HubSpot', group: G.Sales, kind: K.Account, connect: own('https://mcp.hubspot.com'), line: 'Search and update contacts, companies, deals, and tickets.', logo: 'hubspot.svg' },
  { id: 'salesforce', name: 'Salesforce', group: G.Sales, kind: K.Account, connect: viaUs('salesforce_rest_api') },
  { id: 'pipedrive', name: 'Pipedrive', group: G.Sales, kind: K.Account, connect: viaUs('pipedrive') },
  { id: 'intercom', name: 'Intercom', group: G.Sales, kind: K.Account, connect: own('https://mcp.intercom.com/mcp'), line: 'Search conversations, contacts, and Help Center articles.', logo: 'intercom.svg' },
  { id: 'attio', name: 'Attio', group: G.Sales, kind: K.Account, connect: self('https://mcp.attio.com/mcp'), line: 'Search and update CRM records, lists, notes, and tasks.' },
  { id: 'clay', name: 'Clay', group: G.Sales, kind: K.Account, connect: self('https://api.clay.com/v3/mcp'), line: 'Enrich people and companies, run AI research agents.' },
  { id: 'outreach', name: 'Outreach', group: G.Sales, kind: K.Account, connect: self('https://api.outreach.io/mcp'), line: 'Search sequences, prospects, and Kaia meetings.' },
  { id: 'amplemarket', name: 'Amplemarket', group: G.Sales, kind: K.Account, connect: self('https://mcp.amplemarket.com/mcp'), line: 'Search people and companies, enrich leads, run sequences.' },
  { id: 'gong', name: 'Gong', group: G.Sales, kind: K.Account, connect: self('https://mcp.gong.io/mcp'), line: 'Pull account summaries, deal insights, and call briefs.' },
  { id: 'docusign', name: 'Docusign', group: G.Sales, kind: K.Account, connect: own('https://mcp.docusign.com/mcp'), line: 'Manage envelopes, templates, workflows, and agreements.' },
  { id: 'upwork', name: 'Upwork', group: G.Sales, kind: K.Account, connect: self('https://mcp.upwork.com/mcp'), line: 'Search talent, post jobs, and manage contracts.' },
  // Developer
  { id: 'github', name: 'GitHub', group: G.Developer, kind: K.Account, connect: token('https://api.githubcopilot.com/mcp/', 'GITHUB_PERSONAL_ACCESS_TOKEN'), line: 'Manage repos, issues, pull requests, and Actions.', logo: 'github.svg' },
  { id: 'gitlab', name: 'GitLab', group: G.Developer, kind: K.Account, connect: viaUs('gitlab'), logo: 'gitlab.svg' },
  { id: 'linear', name: 'Linear', group: G.Developer, kind: K.Account, connect: self('https://mcp.linear.app/mcp'), line: 'Issues, projects, and cycles.', logo: 'linear.svg' },
  { id: 'jira', name: 'Jira', group: G.Developer, kind: K.Account, connect: self('https://mcp.atlassian.com/v1/mcp'), line: 'Jira and Confluence, through Atlassian.', logo: 'jira.svg' },
  { id: 'supabase', name: 'Supabase', group: G.Developer, kind: K.Account, connect: self('https://mcp.supabase.com/mcp'), line: 'Projects, tables, and SQL.', logo: 'supabase.svg' },
  { id: 'vercel', name: 'Vercel', group: G.Developer, kind: K.Account, connect: self('https://mcp.vercel.com'), line: 'Projects, deployments, and logs.', logo: 'vercel.svg' },
  { id: 'sentry', name: 'Sentry', group: G.Developer, kind: K.Account, connect: self('https://mcp.sentry.dev/mcp'), line: 'Issues, errors, and traces.' },
  { id: 'cloudflare', name: 'Cloudflare', group: G.Developer, kind: K.Account, connect: self('https://bindings.mcp.cloudflare.com/mcp'), line: 'Workers, KV, R2, and D1.' },
  { id: 'zapier', name: 'Zapier', group: G.Developer, kind: K.Account, connect: self('https://mcp.zapier.com/api/mcp/mcp'), line: 'Run actions across thousands of apps.' },
  { id: 'make', name: 'Make', group: G.Developer, kind: K.Account, connect: self('https://mcp.make.com/mcp'), line: 'Run scenarios and automations.' },
  { id: 'deepl', name: 'DeepL', group: G.Developer, kind: K.Account, connect: self('https://mcp.deepl.com/mcp'), line: 'Translate text and documents.' },
  { id: 'google-cloud-bigquery', name: 'Google Cloud BigQuery', group: G.Developer, kind: K.Account, connect: own('https://bigquery.googleapis.com/mcp'), line: 'Explore datasets and tables and run SQL queries.' },
  { id: 'playwright', name: 'Playwright', group: G.Developer, kind: K.Account, connect: { via: C.Local, command: 'npx', args: ['-y', '@playwright/mcp@latest'] }, line: 'Navigate, click, screenshot, and test in a real browser.' },
  // Marketing & Growth
  { id: 'klaviyo', name: 'Klaviyo', group: G.Marketing, kind: K.Account, connect: self('https://mcp.klaviyo.com/mcp'), line: 'Manage profiles, segments, campaigns, and flows.' },
  { id: 'customer-io', name: 'Customer.io', group: G.Marketing, kind: K.Account, connect: self('https://mcp.customer.io/mcp'), line: 'Build campaigns, manage segments, and query people.' },
  { id: 'mailerlite', name: 'MailerLite', group: G.Marketing, kind: K.Account, connect: self('https://mcp.mailerlite.com/mcp'), line: 'Manage subscribers, groups, campaigns, and automations.' },
  { id: 'brevo', name: 'Brevo', group: G.Marketing, kind: K.Account, connect: token('https://mcp.brevo.com/v1/brevo/mcp', 'BREVO_MCP_TOKEN'), line: 'Manage contacts, email and SMS campaigns, and CRM deals.' },
  { id: 'meltwater', name: 'Meltwater', group: G.Marketing, kind: K.Account, connect: self('https://api.meltwater.com/v2/mcp'), line: 'Search media and social mentions and pull analytics.' },
  { id: 'profound', name: 'Profound', group: G.Marketing, kind: K.Account, connect: self('https://mcp.tryprofound.com/mcp'), line: 'Track AI visibility, sentiment, and citations.' },
  { id: 'ahrefs', name: 'Ahrefs', group: G.Marketing, kind: K.Account, connect: self('https://api.ahrefs.com/mcp/mcp'), line: 'Research keywords, backlinks, rankings, and site health.' },
  { id: 'semrush', name: 'Semrush', group: G.Marketing, kind: K.Account, connect: self('https://mcp.semrush.com/v2/mcp'), line: 'Research keywords, backlinks, traffic, and competitors.' },
  { id: 'apollo', name: 'Apollo', group: G.Marketing, kind: K.Account, connect: self('https://mcp.apollo.io/mcp'), line: 'Find and enrich contacts and accounts, run sequences.' },
  { id: 'similarweb', name: 'Similarweb', group: G.Marketing, kind: K.Account, connect: token('https://mcp.similarweb.com', 'SIMILARWEB_API_KEY', 'api-key', undefined), line: 'Analyze website traffic, audiences, and competitors.' },
  { id: 'hunter', name: 'Hunter', group: G.Marketing, kind: K.Account, connect: token('https://mcp.hunter.io/mcp', 'HUNTER_API_KEY', 'X-API-Key', undefined), line: 'Find and verify emails, discover companies, and save leads.' },
  { id: 'godaddy', name: 'GoDaddy', group: G.Marketing, kind: K.Account, connect: open('https://api.godaddy.com/v1/domains/mcp'), line: 'Brainstorm domain names and check availability.' },
  { id: 'x-ads', name: 'X Ads', group: G.Marketing, kind: K.Account, connect: own('https://ads-api.x.com/mcp', 'ads.read ads.write media.write offline.access'), line: 'Manage ad campaigns, create ads, track conversions, and pull performance stats.' },
  { id: 'mailchimp', name: 'Mailchimp', group: G.Marketing, kind: K.Soon },
  // Hiring & People
  { id: 'ashby', name: 'Ashby', group: G.Hiring, kind: K.Account, connect: self('https://mcp.ashbyhq.com/mcp/v1'), line: 'Search candidates, prep interviews, and manage pipeline tasks.' },
  { id: 'workable', name: 'Workable', group: G.Hiring, kind: K.Account, connect: self('https://mcp.workable.com/mcp'), line: 'Search candidates, move pipelines, and manage HR records.' },
  { id: 'greenhouse', name: 'Greenhouse', group: G.Hiring, kind: K.Account, connect: self('https://mcp.greenhouse.io/mcp'), line: 'Jobs, candidates, applications, and scorecards.' },
  { id: 'juicebox', name: 'Juicebox', group: G.Hiring, kind: K.Account, connect: self('https://mcp.juicebox.ai/v1'), line: 'Query recruiting analytics, shortlists, and sourcing agents.' },
  { id: 'rippling', name: 'Rippling', group: G.Hiring, kind: K.Account, connect: own('https://mcp.rippling.com/mcp'), line: 'People, payroll, and time off.' },
  { id: 'gusto', name: 'Gusto', group: G.Hiring, kind: K.Soon },
  { id: 'deel', name: 'Deel', group: G.Hiring, kind: K.Soon },
  { id: 'bamboohr', name: 'BambooHR', group: G.Hiring, kind: K.Soon },
  { id: 'lever', name: 'Lever', group: G.Hiring, kind: K.Soon },
  // Social
  { id: 'x', name: 'X', group: G.Social, kind: K.Account, connect: own('https://api.x.com/mcp'), line: 'Post, read, and search on X.', logo: 'x.svg' },
  { id: 'linkedin', name: 'LinkedIn', group: G.Social, kind: K.Browser },
  { id: 'instagram', name: 'Instagram', group: G.Social, kind: K.Browser, logo: 'instagram.svg' },
  { id: 'tiktok', name: 'TikTok', group: G.Social, kind: K.Browser, logo: 'tiktok.svg' },
  { id: 'youtube', name: 'YouTube', group: G.Social, kind: K.Browser, logo: 'youtube.svg' },
  { id: 'facebook', name: 'Facebook', group: G.Social, kind: K.Browser, logo: 'facebook.svg' },
  // Shopping & Travel
  { id: 'amazon', name: 'Amazon', group: G.ShoppingTravel, kind: K.Browser, tag: ConnectionTag.ThroughYourBrowser },
  { id: 'google-flights', name: 'Google Flights', group: G.ShoppingTravel, kind: K.Browser, tag: ConnectionTag.ThroughYourBrowser },
  { id: 'airbnb', name: 'Airbnb', group: G.ShoppingTravel, kind: K.Browser, tag: ConnectionTag.ThroughYourBrowser, logo: 'airbnb.svg' },
  { id: 'booking', name: 'Booking', group: G.ShoppingTravel, kind: K.Browser, tag: ConnectionTag.ThroughYourBrowser, logo: 'bookingdotcom.svg' },
  { id: 'opentable', name: 'OpenTable', group: G.ShoppingTravel, kind: K.Browser, tag: ConnectionTag.ThroughYourBrowser },
  { id: 'doordash', name: 'DoorDash', group: G.ShoppingTravel, kind: K.Browser, tag: ConnectionTag.ThroughYourBrowser, logo: 'doordash.svg' },
  { id: 'uber', name: 'Uber', group: G.ShoppingTravel, kind: K.Browser, tag: ConnectionTag.ThroughYourBrowser },
];

export interface ConnectionGroup extends ConnectionGroupDef {
  readonly items: readonly ConnectionItem[];
}

/** The groups with their items, in order; a group with no items is left out. */
export const getConnectionGroups = (
  items: readonly ConnectionItem[] = CONNECTION_ITEMS,
): ConnectionGroup[] => (
  CONNECTION_GROUPS
    .map(group => ({ ...group, items: items.filter(item => item.group === group.id) }))
    .filter(group => group.items.length > 0)
);

const normalizeQuery = (query: string): string => query.trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * The items matching a search, by name, by what the service does, or by
 * the name of its group — all three are how somebody looks for a thing
 * whose name they half remember. An empty query returns everything.
 */
export const searchConnections = (
  query: string,
  items: readonly ConnectionItem[] = CONNECTION_ITEMS,
): ConnectionItem[] => {
  const needle = normalizeQuery(query);
  if (!needle) return [...items];
  const matchingGroups = new Set<ConnectionGroupId>(
    CONNECTION_GROUPS
      .filter(group => normalizeQuery(group.title).includes(needle))
      .map(group => group.id),
  );
  return items.filter(item => (
    item.name.toLowerCase().includes(needle)
    || item.line?.toLowerCase().includes(needle)
    || matchingGroups.has(item.group)
  ));
};

export const findConnection = (id: string): ConnectionItem | undefined => (
  CONNECTION_ITEMS.find(item => item.id === id)
);

/** How a card connects, or undefined when it is not an account. */
export const connectMethod = (item: ConnectionItem): ConnectMethod | undefined => (
  item.kind === ConnectionKind.Account ? item.connect : undefined
);

/**
 * Whether a card can be signed into today, with nothing from us: the
 * vendor's own server, registering us itself, or open to anyone.
 */
export const signsInItself = (item: ConnectionItem): boolean => {
  const method = connectMethod(item);
  return method?.via === ConnectVia.Mcp && method.registration !== OAuthRegistration.Preregistered;
};

/**
 * The MCP server name the engine knows a service by.
 *
 * Prefixed, because the engine's `mcp.servers` is one namespace shared
 * with whatever else a person has added by hand, and a bare `gmail`
 * would collide with theirs and silently replace it.
 */
export const MCP_SERVER_PREFIX = 'connection-';
export const mcpServerName = (id: string): string => `${MCP_SERVER_PREFIX}${id}`;

/** The single letter shown in a logo tile when there is no logo file. */
export const connectionMonogram = (name: string): string => (
  name.replace(/[^A-Za-z]/g, '').slice(0, 1).toUpperCase() || '?'
);
