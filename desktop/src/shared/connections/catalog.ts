import type { Platform } from '../platform/constants';

/**
 * The connections catalogue: every service an agent can reach, and how.
 *
 * The groups, the order within them, and the sixty-five original cards
 * are the founder's own (`docs/maties/connectors.md`). What is new is the
 * `connect` clause, which says **how** a card connects — because as of
 * 14 September there are three ways and a card has to name its one.
 *
 * Service names, one-line descriptions and MCP endpoints for the services
 * marked `Mcp`, `Token` and `Local` come from
 * `github.com/cursor/plugins` (`third_party/`), MIT, Copyright 2026
 * Cursor. Endpoints were copied, not guessed, by
 * `scripts/build-connections-catalogue.py`. Two rules were applied while
 * copying, and both matter:
 *
 * - **Cursor's own proxy is not ours to use.** Four of their manifests
 *   point at `api.cursor.com` rather than the vendor (the Microsoft
 *   ones). Putting our people behind somebody else's middleman is the
 *   thing route C exists to avoid, so those fall back to Pipedream.
 * - **A `${PLACEHOLDER}` is not an address.** Salesforce's manifest
 *   carries one; it falls back too.
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
   * Route C, and the default: the vendor's own MCP endpoint, with the
   * engine doing OAuth (`openclaw/src/agents/mcp-oauth.ts`). No
   * middleman, nothing of ours between the person and their data.
   */
  Mcp: 'mcp',
  /** The vendor's MCP endpoint, but it wants a token pasted, not a sign-in. */
  Token: 'token',
  /** An MCP server that runs on this computer. */
  Local: 'local',
  /** Route A: Pipedream Connect, through our proxy. The fallback. */
  Pipedream: 'pipedream',
} as const;
export type ConnectVia = typeof ConnectVia[keyof typeof ConnectVia];

export const OAuthRegistration = {
  /** The engine registers itself with the provider at first sign-in. */
  Dynamic: 'dynamic',
  /**
   * The provider expects a client registered up front. Cursor's manifest
   * carries their client id for these, which our config cannot pass —
   * `openclaw/src/config/types.mcp.ts` has scope, redirectUrl and
   * clientMetadataUrl and no client id. So these depend on the provider
   * also accepting dynamic registration, and **that is unproven**. Marked
   * rather than hidden, so a card can be honest and a test can count them.
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
  Social: 'social',
  Creativity: 'creativity',
  Finance: 'finance',
  Marketing: 'marketing',
  Sales: 'sales',
  Hiring: 'hiring',
  ShoppingTravel: 'shopping-travel',
  Developer: 'developer',
} as const;
export type ConnectionGroupId = typeof ConnectionGroupId[keyof typeof ConnectionGroupId];

export interface ConnectionGroupDef {
  readonly id: ConnectionGroupId;
  readonly title: string;
}

/**
 * Thirteen groups. Eleven are the founder's, in their order.
 *
 * **Marketing and Hiring are mine**, and the reason is arithmetic: the
 * eleven were drawn for sixty-five mostly-consumer services, and fifty
 * more arrived that are neither. Filing Ahrefs under Sales and Ashby
 * under Productivity would have made two groups meaningless rather than
 * made the list shorter.
 */
export const CONNECTION_GROUPS: readonly ConnectionGroupDef[] = [
  { id: ConnectionGroupId.MailCalendar, title: 'Mail & Calendar' },
  { id: ConnectionGroupId.Messaging, title: 'Messaging' },
  { id: ConnectionGroupId.FilesDocs, title: 'Files & Docs' },
  { id: ConnectionGroupId.Productivity, title: 'Productivity & Tasks' },
  { id: ConnectionGroupId.Meetings, title: 'Meetings' },
  { id: ConnectionGroupId.Social, title: 'Social' },
  { id: ConnectionGroupId.Creativity, title: 'Creativity' },
  { id: ConnectionGroupId.Finance, title: 'Finance & Money' },
  { id: ConnectionGroupId.Marketing, title: 'Marketing' },
  { id: ConnectionGroupId.Sales, title: 'Sales & Customers' },
  { id: ConnectionGroupId.Hiring, title: 'Hiring' },
  { id: ConnectionGroupId.ShoppingTravel, title: 'Shopping & Travel' },
  { id: ConnectionGroupId.Developer, title: 'Developer' },
];

interface ConnectionItemBase {
  /** Stable id, unique across the catalogue. */
  readonly id: string;
  /** The product's name, literal. */
  readonly name: string;
  readonly group: ConnectionGroupId;
  /** One line under the name, when the service says what it does. */
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

/** Every service, grouped, in order. */
export const CONNECTION_ITEMS: readonly ConnectionItem[] = [
  // MailCalendar
  { id: 'gmail', name: 'Gmail', group: G.MailCalendar, kind: K.Account, connect: { via: C.Mcp, url: 'https://gmailmcp.googleapis.com/mcp/v1' }, line: 'Search, read, draft, and manage email.', logo: 'gmail.webp' },
  { id: 'outlook', name: 'Outlook', group: G.MailCalendar, kind: K.Account, connect: { via: C.Pipedream, appSlug: 'microsoft_outlook' }, logo: 'outlook.webp' },
  { id: 'google-calendar', name: 'Google Calendar', group: G.MailCalendar, kind: K.Account, connect: { via: C.Mcp, url: 'https://calendarmcp.googleapis.com/mcp/v1' }, line: 'Search events and schedule meetings.', logo: 'google-calendar.webp' },
  { id: 'apple-calendar', name: 'Apple Calendar', group: G.MailCalendar, kind: K.Local, logo: 'apple-calendar-mac.png' },
  // Messaging
  { id: 'whatsapp', name: 'WhatsApp', group: G.Messaging, kind: K.Channel, logo: 'whatsapp.svg' },
  { id: 'imessage', name: 'iMessage', group: G.Messaging, kind: K.Channel, logo: 'imessage.webp' },
  { id: 'slack', name: 'Slack', group: G.Messaging, kind: K.Account, connect: { via: C.Pipedream, appSlug: 'slack_v2' } },
  { id: 'microsoft-teams', name: 'Microsoft Teams', group: G.Messaging, kind: K.Account, connect: { via: C.Pipedream, appSlug: 'microsoft_teams' } },
  { id: 'telegram', name: 'Telegram', group: G.Messaging, kind: K.Channel, platformId: 'telegram', logo: 'telegram.svg' },
  { id: 'discord', name: 'Discord', group: G.Messaging, kind: K.Channel, platformId: 'discord', logo: 'discord.svg' },
  // FilesDocs
  { id: 'google-drive', name: 'Google Drive', group: G.FilesDocs, kind: K.Account, connect: { via: C.Mcp, url: 'https://drivemcp.googleapis.com/mcp/v1' }, line: 'Search, read, create, and share files.', logo: 'google-drive.svg' },
  { id: 'google-docs', name: 'Google Docs', group: G.FilesDocs, kind: K.Account, connect: { via: C.Pipedream, appSlug: 'google_docs' }, logo: 'google-docs.svg' },
  { id: 'google-sheets', name: 'Google Sheets', group: G.FilesDocs, kind: K.Account, connect: { via: C.Pipedream, appSlug: 'google_sheets' }, logo: 'google-sheets.webp' },
  { id: 'google-slides', name: 'Google Slides', group: G.FilesDocs, kind: K.Account, connect: { via: C.Pipedream, appSlug: 'google_slides' }, logo: 'google-slides.webp' },
  { id: 'onedrive', name: 'OneDrive', group: G.FilesDocs, kind: K.Account, connect: { via: C.Pipedream, appSlug: 'microsoft_onedrive' }, logo: 'onedrive.jpg' },
  { id: 'word', name: 'Word', group: G.FilesDocs, kind: K.Local, logo: 'word.webp' },
  { id: 'excel', name: 'Excel', group: G.FilesDocs, kind: K.Local, logo: 'excel.webp' },
  { id: 'powerpoint', name: 'PowerPoint', group: G.FilesDocs, kind: K.Local, logo: 'powerpoint.webp' },
  { id: 'dropbox', name: 'Dropbox', group: G.FilesDocs, kind: K.Account, connect: { via: C.Pipedream, appSlug: 'dropbox' }, logo: 'dropbox.svg' },
  { id: 'notion', name: 'Notion', group: G.FilesDocs, kind: K.Account, connect: { via: C.Pipedream, appSlug: 'notion' }, logo: 'notion.svg' },
  { id: 'apple-notes', name: 'Apple Notes', group: G.FilesDocs, kind: K.Local, logo: 'apple-notes.webp' },
  { id: 'coda', name: 'Coda', group: G.FilesDocs, kind: K.Account, connect: { via: C.Mcp, url: 'https://docs.superhuman.com/apis/mcp' }, line: 'Search docs, read pages, and update tables.' },
  { id: 'craft', name: 'Craft', group: G.FilesDocs, kind: K.Account, connect: { via: C.Mcp, url: 'https://mcp.craft.do/my/mcp' }, line: 'Search, create, and update documents and daily notes.' },
  { id: 'mem', name: 'Mem', group: G.FilesDocs, kind: K.Account, connect: { via: C.Mcp, url: 'https://mcp.mem.ai/mcp' }, line: 'Capture, search, and organize notes and collections.' },
  { id: 'guru', name: 'Guru', group: G.FilesDocs, kind: K.Account, connect: { via: C.Mcp, url: 'https://mcp.api.getguru.com/mcp' }, line: 'Search company knowledge and draft verified answers.' },
  { id: 'readwise', name: 'Readwise', group: G.FilesDocs, kind: K.Account, connect: { via: C.Mcp, url: 'https://mcp2.readwise.io/mcp' }, line: 'Search highlights and Reader documents, save articles.' },
  // Productivity
  { id: 'notion-tasks', name: 'Notion', group: G.Productivity, kind: K.Account, connect: { via: C.Pipedream, appSlug: 'notion' }, logo: 'notion.svg' },
  { id: 'todoist', name: 'Todoist', group: G.Productivity, kind: K.Account, connect: { via: C.Mcp, url: 'https://ai.todoist.net/mcp' }, line: 'Create, find, and complete tasks and projects.', logo: 'todoist.svg' },
  { id: 'apple-reminders', name: 'Apple Reminders', group: G.Productivity, kind: K.Local, logo: 'apple-reminders.png' },
  { id: 'google-tasks', name: 'Google Tasks', group: G.Productivity, kind: K.Account, connect: { via: C.Pipedream, appSlug: 'google_tasks' }, logo: 'googletasks.svg' },
  { id: 'trello', name: 'Trello', group: G.Productivity, kind: K.Account, connect: { via: C.Pipedream, appSlug: 'trello' }, logo: 'trello.svg' },
  { id: 'asana', name: 'Asana', group: G.Productivity, kind: K.Account, connect: { via: C.Pipedream, appSlug: 'asana' }, logo: 'asana.svg' },
  { id: 'monday', name: 'Monday', group: G.Productivity, kind: K.Account, connect: { via: C.Pipedream, appSlug: 'monday' } },
  { id: 'jotform', name: 'Jotform', group: G.Productivity, kind: K.Account, connect: { via: C.Mcp, url: 'https://mcp.jotform.com' }, line: 'Create and edit forms, then read submissions.' },
  { id: 'typeform', name: 'Typeform', group: G.Productivity, kind: K.Account, connect: { via: C.Mcp, url: 'https://api.typeform.com/mcp' }, line: 'Build forms, analyze responses, and manage contacts.' },
  { id: 'smartsheet', name: 'Smartsheet', group: G.Productivity, kind: K.Account, connect: { via: C.Token, url: 'https://mcp.smartsheet.com', header: 'Authorization', tokenEnv: 'SMARTSHEET_API_TOKEN', prefix: 'Bearer ' }, line: 'Query and update sheets, rows, and workspaces.' },
  { id: 'wrike', name: 'Wrike', group: G.Productivity, kind: K.Account, connect: { via: C.Token, url: 'https://mcp.wrike.com/v2', header: 'Authorization', tokenEnv: 'WRIKE_ACCESS_TOKEN', prefix: 'Bearer ' }, line: 'Search projects, create tasks, and post comments.' },
  // Meetings
  { id: 'zoom', name: 'Zoom', group: G.Meetings, kind: K.Account, connect: { via: C.Mcp, url: 'https://mcp.zoom.us/mcp/zoom/streamable', registration: R.Preregistered }, line: 'Search meetings, pull transcripts, and work with Zoom Docs.', logo: 'zoom.webp' },
  { id: 'google-meet', name: 'Google Meet', group: G.Meetings, kind: K.Account, connect: { via: C.Pipedream, appSlug: 'google_meet' }, logo: 'google-meet.webp' },
  { id: 'fathom', name: 'Fathom', group: G.Meetings, kind: K.Account, connect: { via: C.Mcp, url: 'https://api.fathom.ai/mcp' }, line: 'Search meetings and pull transcripts and summaries.', logo: 'fathom.jpg' },
  { id: 'otter', name: 'Otter', group: G.Meetings, kind: K.Account, connect: { via: C.Mcp, url: 'https://mcp.otter.ai/mcp' }, line: 'Search meeting history and pull full transcripts.' },
  { id: 'circleback', name: 'Circleback', group: G.Meetings, kind: K.Account, connect: { via: C.Mcp, url: 'https://circleback.ai/api/mcp' }, line: 'Search meetings, transcripts, action items, and emails.' },
  { id: 'fireflies', name: 'Fireflies', group: G.Meetings, kind: K.Account, connect: { via: C.Mcp, url: 'https://api.fireflies.ai/mcp' }, line: 'Search meeting transcripts, summaries, and action items.' },
  // Social
  { id: 'linkedin', name: 'LinkedIn', group: G.Social, kind: K.Browser },
  { id: 'x', name: 'X', group: G.Social, kind: K.Browser, logo: 'x.svg' },
  { id: 'instagram', name: 'Instagram', group: G.Social, kind: K.Browser, logo: 'instagram.svg' },
  { id: 'tiktok', name: 'TikTok', group: G.Social, kind: K.Browser, logo: 'tiktok.svg' },
  { id: 'youtube', name: 'YouTube', group: G.Social, kind: K.Browser, logo: 'youtube.svg' },
  { id: 'facebook', name: 'Facebook', group: G.Social, kind: K.Browser, logo: 'facebook.svg' },
  // Creativity
  { id: 'canva', name: 'Canva', group: G.Creativity, kind: K.Account, connect: { via: C.Pipedream, appSlug: 'canva' } },
  { id: 'figma', name: 'Figma', group: G.Creativity, kind: K.Account, connect: { via: C.Pipedream, appSlug: 'figma' }, logo: 'figma.svg' },
  { id: 'adobe-express', name: 'Adobe Express', group: G.Creativity, kind: K.Soon },
  { id: 'youtube-studio', name: 'YouTube Studio', group: G.Creativity, kind: K.Browser, logo: 'youtubestudio.svg' },
  { id: 'gamma', name: 'Gamma', group: G.Creativity, kind: K.Account, connect: { via: C.Mcp, url: 'https://mcp.gamma.app/mcp' }, line: 'Generate presentations, documents, and webpages.' },
  { id: 'excalidraw', name: 'Excalidraw', group: G.Creativity, kind: K.Account, connect: { via: C.Mcp, url: 'https://mcp.excalidraw.com/mcp' }, line: 'Draw and export hand-drawn diagrams from chat.' },
  // Finance
  { id: 'stripe', name: 'Stripe', group: G.Finance, kind: K.Account, connect: { via: C.Pipedream, appSlug: 'stripe' }, logo: 'stripe.svg' },
  { id: 'paypal', name: 'PayPal', group: G.Finance, kind: K.Account, connect: { via: C.Pipedream, appSlug: 'paypal' }, logo: 'paypal.svg' },
  { id: 'quickbooks', name: 'QuickBooks', group: G.Finance, kind: K.Account, connect: { via: C.Pipedream, appSlug: 'quickbooks' }, logo: 'quickbooks.svg' },
  { id: 'xero', name: 'Xero', group: G.Finance, kind: K.Account, connect: { via: C.Local, command: 'npx', args: ['-y', '@xeroapi/xero-mcp-server@latest'], env: ['XERO_CLIENT_ID', 'XERO_CLIENT_SECRET'] }, line: 'Read and write invoices, contacts, reports, and payroll.', logo: 'xero.svg' },
  { id: 'shopify', name: 'Shopify', group: G.Finance, kind: K.Account, connect: { via: C.Pipedream, appSlug: 'shopify' }, logo: 'shopify.svg' },
  { id: 'amazon-seller', name: 'Amazon Seller', group: G.Finance, kind: K.Browser },
  { id: 'brex', name: 'Brex', group: G.Finance, kind: K.Account, connect: { via: C.Mcp, url: 'https://api.brex.com/mcp' }, line: 'Query expenses, receipts, bills, cards, and travel.' },
  { id: 'mercury', name: 'Mercury', group: G.Finance, kind: K.Account, connect: { via: C.Mcp, url: 'https://mcp.mercury.com/mcp' }, line: 'Read balances, transactions, statements, and cards.' },
  { id: 'navan', name: 'Navan', group: G.Finance, kind: K.Account, connect: { via: C.Mcp, url: 'https://mcp.navan.com/mcp' }, line: 'Query expenses, travel bookings, policies, and cards.' },
  { id: 'interactive-brokers', name: 'Interactive Brokers', group: G.Finance, kind: K.Account, connect: { via: C.Mcp, url: 'https://api.ibkr.com/v1/api/mcp-public' }, line: 'Review positions, balances, P&L, and draft trade instructions.' },
  { id: 'webull', name: 'Webull', group: G.Finance, kind: K.Account, connect: { via: C.Mcp, url: 'https://api.webull.com/mcp' }, line: 'View accounts, positions, orders, watchlists, and market data.' },
  { id: 'daloopa', name: 'Daloopa', group: G.Finance, kind: K.Account, connect: { via: C.Mcp, url: 'https://mcp.daloopa.com/server/mcp' }, line: 'Pull source-linked fundamentals, KPIs, filings, and prices.' },
  { id: 'sp-global', name: 'S&P Global', group: G.Finance, kind: K.Account, connect: { via: C.Mcp, url: 'https://kfinance.kensho.com/integrations/mcp' }, line: 'Query S&P Capital IQ financials, prices, and transcripts.' },
  // Marketing
  { id: 'klaviyo', name: 'Klaviyo', group: G.Marketing, kind: K.Account, connect: { via: C.Mcp, url: 'https://mcp.klaviyo.com/mcp' }, line: 'Manage profiles, segments, campaigns, and flows.' },
  { id: 'customer-io', name: 'Customer.io', group: G.Marketing, kind: K.Account, connect: { via: C.Mcp, url: 'https://mcp.customer.io/mcp' }, line: 'Build campaigns, manage segments, and query people.' },
  { id: 'mailerlite', name: 'MailerLite', group: G.Marketing, kind: K.Account, connect: { via: C.Mcp, url: 'https://mcp.mailerlite.com/mcp' }, line: 'Manage subscribers, groups, campaigns, and automations.' },
  { id: 'brevo', name: 'Brevo', group: G.Marketing, kind: K.Account, connect: { via: C.Token, url: 'https://mcp.brevo.com/v1/brevo/mcp', header: 'Authorization', tokenEnv: 'BREVO_MCP_TOKEN', prefix: 'Bearer ' }, line: 'Manage contacts, email and SMS campaigns, and CRM deals.' },
  { id: 'meltwater', name: 'Meltwater', group: G.Marketing, kind: K.Account, connect: { via: C.Mcp, url: 'https://api.meltwater.com/v2/mcp' }, line: 'Search media and social mentions and pull analytics.' },
  { id: 'profound', name: 'Profound', group: G.Marketing, kind: K.Account, connect: { via: C.Mcp, url: 'https://mcp.tryprofound.com/mcp' }, line: 'Track AI visibility, sentiment, and citations.' },
  { id: 'ahrefs', name: 'Ahrefs', group: G.Marketing, kind: K.Account, connect: { via: C.Mcp, url: 'https://api.ahrefs.com/mcp/mcp' }, line: 'Research keywords, backlinks, rankings, and site health.' },
  { id: 'semrush', name: 'Semrush', group: G.Marketing, kind: K.Account, connect: { via: C.Mcp, url: 'https://mcp.semrush.com/v2/mcp' }, line: 'Research keywords, backlinks, traffic, and competitors.' },
  { id: 'similarweb', name: 'Similarweb', group: G.Marketing, kind: K.Account, connect: { via: C.Token, url: 'https://mcp.similarweb.com', header: 'api-key', tokenEnv: 'SIMILARWEB_API_KEY' }, line: 'Analyze website traffic, audiences, and competitors.' },
  { id: 'hunter', name: 'Hunter', group: G.Marketing, kind: K.Account, connect: { via: C.Token, url: 'https://mcp.hunter.io/mcp', header: 'X-API-Key', tokenEnv: 'HUNTER_API_KEY' }, line: 'Find and verify emails, discover companies, and save leads.' },
  { id: 'godaddy', name: 'GoDaddy', group: G.Marketing, kind: K.Account, connect: { via: C.Mcp, url: 'https://api.godaddy.com/v1/domains/mcp' }, line: 'Brainstorm domain names and check availability.' },
  { id: 'x-ads', name: 'X Ads', group: G.Marketing, kind: K.Account, connect: { via: C.Mcp, url: 'https://ads-api.x.com/mcp', scope: 'ads.read ads.write media.write offline.access', registration: R.Preregistered }, line: 'Manage ad campaigns, create ads, track conversions, and pull performance stats.' },
  // Sales
  { id: 'hubspot', name: 'HubSpot', group: G.Sales, kind: K.Account, connect: { via: C.Mcp, url: 'https://mcp.hubspot.com', registration: R.Preregistered }, line: 'Search and update contacts, companies, deals, and tickets.', logo: 'hubspot.svg' },
  { id: 'salesforce', name: 'Salesforce', group: G.Sales, kind: K.Account, connect: { via: C.Pipedream, appSlug: 'salesforce_rest_api' } },
  { id: 'pipedrive', name: 'Pipedrive', group: G.Sales, kind: K.Account, connect: { via: C.Pipedream, appSlug: 'pipedrive' } },
  { id: 'intercom', name: 'Intercom', group: G.Sales, kind: K.Account, connect: { via: C.Mcp, url: 'https://mcp.intercom.com/mcp' }, line: 'Search conversations, contacts, and Help Center articles.', logo: 'intercom.svg' },
  { id: 'calendly', name: 'Calendly', group: G.Sales, kind: K.Account, connect: { via: C.Mcp, url: 'https://mcp.calendly.com/' }, line: 'Check availability and book, cancel, or reschedule.', logo: 'calendly.svg' },
  { id: 'attio', name: 'Attio', group: G.Sales, kind: K.Account, connect: { via: C.Mcp, url: 'https://mcp.attio.com/mcp' }, line: 'Search and update CRM records, lists, notes, and tasks.' },
  { id: 'clay', name: 'Clay', group: G.Sales, kind: K.Account, connect: { via: C.Mcp, url: 'https://api.clay.com/v3/mcp' }, line: 'Enrich people and companies, run AI research agents.' },
  { id: 'outreach', name: 'Outreach', group: G.Sales, kind: K.Account, connect: { via: C.Mcp, url: 'https://api.outreach.io/mcp' }, line: 'Search sequences, prospects, and Kaia meetings.' },
  { id: 'amplemarket', name: 'Amplemarket', group: G.Sales, kind: K.Account, connect: { via: C.Mcp, url: 'https://mcp.amplemarket.com/mcp' }, line: 'Search people and companies, enrich leads, run sequences.' },
  { id: 'docusign', name: 'Docusign', group: G.Sales, kind: K.Account, connect: { via: C.Mcp, url: 'https://mcp.docusign.com/mcp', registration: R.Preregistered }, line: 'Manage envelopes, templates, workflows, and agreements.' },
  { id: 'upwork', name: 'Upwork', group: G.Sales, kind: K.Account, connect: { via: C.Mcp, url: 'https://mcp.upwork.com/mcp' }, line: 'Search talent, post jobs, and manage contracts.' },
  { id: 'gong', name: 'Gong', group: G.Sales, kind: K.Account, connect: { via: C.Mcp, url: 'https://mcp.gong.io/mcp', registration: R.Preregistered }, line: 'Pull account summaries, deal insights, and call briefs.' },
  // Hiring
  { id: 'ashby', name: 'Ashby', group: G.Hiring, kind: K.Account, connect: { via: C.Mcp, url: 'https://mcp.ashbyhq.com/mcp/v1' }, line: 'Search candidates, prep interviews, and manage pipeline tasks.' },
  { id: 'workable', name: 'Workable', group: G.Hiring, kind: K.Account, connect: { via: C.Mcp, url: 'https://mcp.workable.com/mcp' }, line: 'Search candidates, move pipelines, and manage HR records.' },
  { id: 'juicebox', name: 'Juicebox', group: G.Hiring, kind: K.Account, connect: { via: C.Mcp, url: 'https://mcp.juicebox.ai/v1' }, line: 'Query recruiting analytics, shortlists, and sourcing agents.' },
  // ShoppingTravel
  { id: 'amazon', name: 'Amazon', group: G.ShoppingTravel, kind: K.Browser, tag: ConnectionTag.ThroughYourBrowser },
  { id: 'google-flights', name: 'Google Flights', group: G.ShoppingTravel, kind: K.Browser, tag: ConnectionTag.ThroughYourBrowser },
  { id: 'airbnb', name: 'Airbnb', group: G.ShoppingTravel, kind: K.Browser, tag: ConnectionTag.ThroughYourBrowser, logo: 'airbnb.svg' },
  { id: 'booking', name: 'Booking', group: G.ShoppingTravel, kind: K.Browser, tag: ConnectionTag.ThroughYourBrowser, logo: 'bookingdotcom.svg' },
  { id: 'opentable', name: 'OpenTable', group: G.ShoppingTravel, kind: K.Browser, tag: ConnectionTag.ThroughYourBrowser },
  { id: 'doordash', name: 'DoorDash', group: G.ShoppingTravel, kind: K.Browser, tag: ConnectionTag.ThroughYourBrowser, logo: 'doordash.svg' },
  // Developer
  { id: 'github', name: 'GitHub', group: G.Developer, kind: K.Account, connect: { via: C.Token, url: 'https://api.githubcopilot.com/mcp/', header: 'Authorization', tokenEnv: 'GITHUB_PERSONAL_ACCESS_TOKEN', prefix: 'Bearer ' }, line: 'Manage repos, issues, pull requests, and Actions.', logo: 'github.svg' },
  { id: 'gitlab', name: 'GitLab', group: G.Developer, kind: K.Account, connect: { via: C.Pipedream, appSlug: 'gitlab' }, logo: 'gitlab.svg' },
  { id: 'linear', name: 'Linear', group: G.Developer, kind: K.Account, connect: { via: C.Pipedream, appSlug: 'linear' }, logo: 'linear.svg' },
  { id: 'jira', name: 'Jira', group: G.Developer, kind: K.Account, connect: { via: C.Pipedream, appSlug: 'jira' }, logo: 'jira.svg' },
  { id: 'supabase', name: 'Supabase', group: G.Developer, kind: K.Account, connect: { via: C.Pipedream, appSlug: 'supabase' }, logo: 'supabase.svg' },
  { id: 'vercel', name: 'Vercel', group: G.Developer, kind: K.Account, connect: { via: C.Pipedream, appSlug: 'vercel_token_auth' }, logo: 'vercel.svg' },
  { id: 'google-cloud-bigquery', name: 'Google Cloud BigQuery', group: G.Developer, kind: K.Account, connect: { via: C.Mcp, url: 'https://bigquery.googleapis.com/mcp' }, line: 'Explore datasets and tables and run SQL queries.' },
  { id: 'playwright', name: 'Playwright', group: G.Developer, kind: K.Account, connect: { via: C.Local, command: 'npx', args: ['-y', '@playwright/mcp@latest'] }, line: 'Navigate, click, screenshot, and test in a real browser.' },
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
