"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectionMonogram = exports.mcpServerName = exports.MCP_SERVER_PREFIX = exports.signsInItself = exports.composioToolkit = exports.connectMethod = exports.findConnection = exports.searchConnections = exports.getConnectionGroups = exports.CONNECTION_ITEMS = exports.CONNECTION_GROUPS = exports.ConnectionGroupId = exports.ConnectionTag = exports.OAuthRegistration = exports.ConnectVia = exports.ConnectionKind = exports.APP_LOGO_DIRECTORY = void 0;
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
exports.APP_LOGO_DIRECTORY = 'logos/apps';
exports.ConnectionKind = {
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
};
/**
 * How an account connects. The whole of the route decision lives in this
 * one field, which is what lets a service move between routes without
 * anything else changing.
 */
exports.ConnectVia = {
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
};
exports.OAuthRegistration = {
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
};
/** The founder's tag lines under a name. */
exports.ConnectionTag = {
    ThroughYourBrowser: 'through-your-browser',
};
exports.ConnectionGroupId = {
    MailCalendar: 'mail-calendar',
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
};
/**
 * Eleven groups: the canvas's, in its order and with its titles, minus
 * Messaging and Shopping & Travel, which held nothing a person can plug
 * in (see the note above `CONNECTION_ITEMS`), plus the three the new
 * list added for services the canvas never drew a group for.
 */
exports.CONNECTION_GROUPS = [
    { id: exports.ConnectionGroupId.MailCalendar, title: 'Mail & Calendar' },
    { id: exports.ConnectionGroupId.FilesDocs, title: 'Files & Docs' },
    { id: exports.ConnectionGroupId.Productivity, title: 'Productivity & Tasks' },
    { id: exports.ConnectionGroupId.Meetings, title: 'Meetings' },
    { id: exports.ConnectionGroupId.Creativity, title: 'Creativity' },
    { id: exports.ConnectionGroupId.Finance, title: 'Finance & Money' },
    { id: exports.ConnectionGroupId.Sales, title: 'Sales & Customers' },
    { id: exports.ConnectionGroupId.Developer, title: 'Developer' },
    { id: exports.ConnectionGroupId.Marketing, title: 'Marketing & Growth' },
    { id: exports.ConnectionGroupId.Hiring, title: 'Hiring & People' },
    { id: exports.ConnectionGroupId.Social, title: 'Social' },
];
const G = exports.ConnectionGroupId;
const K = exports.ConnectionKind;
const C = exports.ConnectVia;
const R = exports.OAuthRegistration;
/** The vendor's own MCP server, and it registers us itself. */
const self = (url, scope) => ({ via: C.Mcp, url, ...(scope ? { scope } : {}) });
/** The vendor's own MCP server, but it wants a client we have not registered. */
const own = (url, scope) => ({ via: C.Mcp, url, registration: R.Preregistered, ...(scope ? { scope } : {}) });
/** A token pasted, `Bearer` unless said otherwise. */
const token = (url, tokenEnv, header = 'Authorization', prefix = 'Bearer ') => ({ via: C.Token, url, header, tokenEnv, ...(prefix ? { prefix } : {}) });
/** No vendor MCP found; the middleman would carry it, and that is not wired. */
const viaUs = (appSlug) => ({ via: C.Pipedream, appSlug });
/**
 * Every service, grouped, in order. Forty-five, and every one of them is
 * a Connect button that works.
 *
 * **Cut on 16 September 2026 from a hundred and thirty-four.** The
 * founder: *"remove all the junks in connectors … i want nothing that is
 * browser. or that cant be connected. its noise. cause what is it doing
 * there? it says plugins, so you should plug it … no social media
 * either cause i cant do anything there either. leave linkedin."* So:
 *
 * - No browser cards (Amazon, DoorDash, Instagram…): the agent uses the
 *   person's browser for those and nothing is plugged in.
 * - No "on this Mac" cards (Word, Apple Notes…): already there.
 * - No channels (WhatsApp, Telegram, Slack…): those are ways to reach
 *   the agent, they need a pairing flow, and they belong to a channel
 *   screen the new shell does not have yet.
 * - Nothing that says "Not yet", "Needs a key" or "No way in yet".
 * - No long tail: one meeting recorder, not four; one CRM tier, not
 *   Clay and Gong and Amplemarket.
 *
 * The test that holds the rule is "every card in the real catalogue is a
 * Connect button" (`shelf.test.ts`). The kinds and routes the type still
 * allows (browser, local, channel, soon, token, middleman) are kept for
 * the channel screen and for a vendor that one day registers us; no card
 * uses them today.
 *
 * Four services have no vendor MCP and are here on Composio's account
 * alone: Shopify, Mailchimp, Gusto and LinkedIn. Their `viaUs` slugs
 * are the middleman's app names as I know them and are **unverified**;
 * that route is not wired, so nothing rides on them — Composio draws
 * the button.
 */
exports.CONNECTION_ITEMS = [
    // Mail & Calendar
    { id: 'gmail', name: 'Gmail', group: G.MailCalendar, kind: K.Account, connect: own('https://gmailmcp.googleapis.com/mcp/v1'), line: 'Search, read, draft, and manage email.', logo: 'gmail.webp', composio: 'gmail' },
    { id: 'outlook', name: 'Outlook', group: G.MailCalendar, kind: K.Account, connect: viaUs('microsoft_outlook'), line: 'Mail and Microsoft 365 calendar.', logo: 'outlook.webp', composio: 'outlook' },
    { id: 'google-calendar', name: 'Google Calendar', group: G.MailCalendar, kind: K.Account, connect: own('https://calendarmcp.googleapis.com/mcp/v1'), line: 'Search events and schedule meetings.', logo: 'google-calendar.webp', composio: 'googlecalendar' },
    // Files & Docs
    { id: 'google-drive', name: 'Google Drive', group: G.FilesDocs, kind: K.Account, connect: own('https://drivemcp.googleapis.com/mcp/v1'), line: 'Search, read, create, and share files.', logo: 'google-drive.svg', composio: 'googledrive' },
    { id: 'google-docs', name: 'Google Docs', group: G.FilesDocs, kind: K.Account, connect: own('https://docsmcp.googleapis.com/mcp/v1'), line: 'Read and write documents.', logo: 'google-docs.svg', composio: 'googledocs' },
    { id: 'google-sheets', name: 'Google Sheets', group: G.FilesDocs, kind: K.Account, connect: own('https://sheetsmcp.googleapis.com/mcp/v1'), line: 'Read and write spreadsheets.', logo: 'google-sheets.webp', composio: 'googlesheets' },
    { id: 'google-slides', name: 'Google Slides', group: G.FilesDocs, kind: K.Account, connect: own('https://slidesmcp.googleapis.com/mcp/v1'), line: 'Read and build presentations.', logo: 'google-slides.webp', composio: 'googleslides' },
    { id: 'onedrive', name: 'OneDrive', group: G.FilesDocs, kind: K.Account, connect: viaUs('microsoft_onedrive'), line: 'Files in Microsoft 365.', logo: 'onedrive.jpg', composio: 'one_drive' },
    { id: 'dropbox', name: 'Dropbox', group: G.FilesDocs, kind: K.Account, connect: self('https://mcp.dropbox.com/mcp'), line: 'Search, read, and organise files.', logo: 'dropbox.svg', composio: 'dropbox' },
    { id: 'notion', name: 'Notion', group: G.FilesDocs, kind: K.Account, connect: self('https://mcp.notion.com/mcp'), line: 'Search, read, and write pages and databases.', logo: 'notion.svg', composio: 'notion' },
    // Productivity & Tasks
    { id: 'todoist', name: 'Todoist', group: G.Productivity, kind: K.Account, connect: self('https://ai.todoist.net/mcp'), line: 'Create, find, and complete tasks and projects.', logo: 'todoist.svg', composio: 'todoist' },
    { id: 'google-tasks', name: 'Google Tasks', group: G.Productivity, kind: K.Account, connect: viaUs('google_tasks'), line: 'Tasks and lists in Google.', logo: 'googletasks.svg', composio: 'googletasks' },
    { id: 'trello', name: 'Trello', group: G.Productivity, kind: K.Account, connect: viaUs('trello'), line: 'Boards, lists, and cards.', logo: 'trello.svg', composio: 'trello' },
    { id: 'asana', name: 'Asana', group: G.Productivity, kind: K.Account, connect: self('https://mcp.asana.com/mcp'), line: 'Search and update tasks and projects.', logo: 'asana.svg', composio: 'asana' },
    { id: 'airtable', name: 'Airtable', group: G.Productivity, kind: K.Account, connect: self('https://mcp.airtable.com/mcp'), line: 'Query and update bases, tables, and records.', composio: 'airtable' },
    // Meetings
    { id: 'zoom', name: 'Zoom', group: G.Meetings, kind: K.Account, connect: own('https://mcp.zoom.us/mcp/zoom/streamable'), line: 'Search meetings, pull transcripts, and work with Zoom Docs.', logo: 'zoom.webp', composio: 'zoom' },
    { id: 'google-meet', name: 'Google Meet', group: G.Meetings, kind: K.Account, connect: viaUs('google_meet'), line: 'Meetings and recordings in Google.', logo: 'google-meet.webp', composio: 'googlemeet' },
    { id: 'fathom', name: 'Fathom', group: G.Meetings, kind: K.Account, connect: self('https://api.fathom.ai/mcp'), line: 'Search meetings and pull transcripts and summaries.', logo: 'fathom.jpg' },
    // Creativity
    { id: 'canva', name: 'Canva', group: G.Creativity, kind: K.Account, connect: self('https://mcp.canva.com/mcp'), line: 'Create and edit designs.', composio: 'canva' },
    { id: 'figma', name: 'Figma', group: G.Creativity, kind: K.Account, connect: self('https://mcp.figma.com/mcp'), line: 'Read files, frames, and design context.', logo: 'figma.svg', composio: 'figma' },
    { id: 'miro', name: 'Miro', group: G.Creativity, kind: K.Account, connect: self('https://mcp.miro.com/mcp'), line: 'Read and build boards.', composio: 'miro' },
    // Finance & Money
    { id: 'stripe', name: 'Stripe', group: G.Finance, kind: K.Account, connect: self('https://mcp.stripe.com'), line: 'Customers, payments, subscriptions, and invoices.', logo: 'stripe.svg', composio: 'stripe' },
    { id: 'paypal', name: 'PayPal', group: G.Finance, kind: K.Account, connect: self('https://mcp.paypal.com/mcp'), line: 'Invoices, orders, and transactions.', logo: 'paypal.svg', composio: 'paypal' },
    { id: 'quickbooks', name: 'QuickBooks', group: G.Finance, kind: K.Account, connect: viaUs('quickbooks'), line: 'Books, invoices, and expenses.', logo: 'quickbooks.svg', composio: 'quickbooks' },
    // Xero's own server runs on this Mac and wants a client id and secret
    // in its environment, which nobody types; Composio carries the card.
    { id: 'xero', name: 'Xero', group: G.Finance, kind: K.Account, connect: { via: C.Local, command: 'npx', args: ['-y', '@xeroapi/xero-mcp-server@latest'], env: ['XERO_CLIENT_ID', 'XERO_CLIENT_SECRET'] }, line: 'Read and write invoices, contacts, reports, and payroll.', logo: 'xero.svg', composio: 'xero' },
    { id: 'shopify', name: 'Shopify', group: G.Finance, kind: K.Account, connect: viaUs('shopify'), line: 'Orders, products, customers, and your store.', logo: 'shopify.svg', composio: 'shopify' },
    { id: 'brex', name: 'Brex', group: G.Finance, kind: K.Account, connect: self('https://api.brex.com/mcp'), line: 'Query expenses, receipts, bills, cards, and travel.', composio: 'brex' },
    { id: 'ramp', name: 'Ramp', group: G.Finance, kind: K.Account, connect: self('https://mcp.ramp.com/mcp'), line: 'Expenses, cards, bills, and reimbursements.', composio: 'ramp' },
    { id: 'mercury', name: 'Mercury', group: G.Finance, kind: K.Account, connect: self('https://mcp.mercury.com/mcp'), line: 'Read balances, transactions, statements, and cards.' },
    // Sales & Customers
    { id: 'hubspot', name: 'HubSpot', group: G.Sales, kind: K.Account, connect: own('https://mcp.hubspot.com'), line: 'Search and update contacts, companies, deals, and tickets.', logo: 'hubspot.svg', composio: 'hubspot' },
    { id: 'salesforce', name: 'Salesforce', group: G.Sales, kind: K.Account, connect: viaUs('salesforce_rest_api'), line: 'Leads, accounts, opportunities, and cases.', composio: 'salesforce' },
    { id: 'pipedrive', name: 'Pipedrive', group: G.Sales, kind: K.Account, connect: viaUs('pipedrive'), line: 'Deals, people, and the pipeline.', composio: 'pipedrive' },
    { id: 'intercom', name: 'Intercom', group: G.Sales, kind: K.Account, connect: own('https://mcp.intercom.com/mcp'), line: 'Search conversations, contacts, and Help Center articles.', logo: 'intercom.svg', composio: 'intercom' },
    { id: 'docusign', name: 'Docusign', group: G.Sales, kind: K.Account, connect: own('https://mcp.docusign.com/mcp'), line: 'Manage envelopes, templates, workflows, and agreements.', composio: 'docusign' },
    // Developer
    { id: 'github', name: 'GitHub', group: G.Developer, kind: K.Account, connect: token('https://api.githubcopilot.com/mcp/', 'GITHUB_PERSONAL_ACCESS_TOKEN'), line: 'Manage repos, issues, pull requests, and Actions.', logo: 'github.svg', composio: 'github' },
    { id: 'linear', name: 'Linear', group: G.Developer, kind: K.Account, connect: self('https://mcp.linear.app/mcp'), line: 'Issues, projects, and cycles.', logo: 'linear.svg', composio: 'linear' },
    { id: 'jira', name: 'Jira', group: G.Developer, kind: K.Account, connect: self('https://mcp.atlassian.com/v1/mcp'), line: 'Jira and Confluence, through Atlassian.', logo: 'jira.svg', composio: 'jira' },
    { id: 'supabase', name: 'Supabase', group: G.Developer, kind: K.Account, connect: self('https://mcp.supabase.com/mcp'), line: 'Projects, tables, and SQL.', logo: 'supabase.svg', composio: 'supabase' },
    { id: 'vercel', name: 'Vercel', group: G.Developer, kind: K.Account, connect: self('https://mcp.vercel.com'), line: 'Projects, deployments, and logs.', logo: 'vercel.svg', composio: 'vercel' },
    // Marketing & Growth
    { id: 'mailchimp', name: 'Mailchimp', group: G.Marketing, kind: K.Account, connect: viaUs('mailchimp'), line: 'Audiences, campaigns, and automations.', composio: 'mailchimp' },
    { id: 'klaviyo', name: 'Klaviyo', group: G.Marketing, kind: K.Account, connect: self('https://mcp.klaviyo.com/mcp'), line: 'Manage profiles, segments, campaigns, and flows.', composio: 'klaviyo' },
    // Hiring & People
    { id: 'greenhouse', name: 'Greenhouse', group: G.Hiring, kind: K.Account, connect: self('https://mcp.greenhouse.io/mcp'), line: 'Jobs, candidates, applications, and scorecards.', composio: 'greenhouse' },
    { id: 'ashby', name: 'Ashby', group: G.Hiring, kind: K.Account, connect: self('https://mcp.ashbyhq.com/mcp/v1'), line: 'Search candidates, prep interviews, and manage pipeline tasks.', composio: 'ashby' },
    { id: 'gusto', name: 'Gusto', group: G.Hiring, kind: K.Account, connect: viaUs('gusto'), line: 'Payroll, people, and time off.', composio: 'gusto' },
    // Social
    // Composio's LinkedIn is narrow: posting and the person's own profile,
    // not reading the feed or messages. The line says so.
    { id: 'linkedin', name: 'LinkedIn', group: G.Social, kind: K.Account, connect: viaUs('linkedin'), line: 'Post to LinkedIn and read your own profile. Not the feed or messages.', composio: 'linkedin' },
];
/** The groups with their items, in order; a group with no items is left out. */
const getConnectionGroups = (items = exports.CONNECTION_ITEMS) => (exports.CONNECTION_GROUPS
    .map(group => ({ ...group, items: items.filter(item => item.group === group.id) }))
    .filter(group => group.items.length > 0));
exports.getConnectionGroups = getConnectionGroups;
const normalizeQuery = (query) => query.trim().replace(/\s+/g, ' ').toLowerCase();
/**
 * The items matching a search, by name, by what the service does, or by
 * the name of its group — all three are how somebody looks for a thing
 * whose name they half remember. An empty query returns everything.
 */
const searchConnections = (query, items = exports.CONNECTION_ITEMS) => {
    const needle = normalizeQuery(query);
    if (!needle)
        return [...items];
    const matchingGroups = new Set(exports.CONNECTION_GROUPS
        .filter(group => normalizeQuery(group.title).includes(needle))
        .map(group => group.id));
    return items.filter(item => (item.name.toLowerCase().includes(needle)
        || item.line?.toLowerCase().includes(needle)
        || matchingGroups.has(item.group)));
};
exports.searchConnections = searchConnections;
const findConnection = (id) => (exports.CONNECTION_ITEMS.find(item => item.id === id));
exports.findConnection = findConnection;
/** How a card connects, or undefined when it is not an account. */
const connectMethod = (item) => (item.kind === exports.ConnectionKind.Account ? item.connect : undefined);
exports.connectMethod = connectMethod;
/** Composio's slug for a service, or undefined when Composio does not carry it. */
const composioToolkit = (item) => item.composio;
exports.composioToolkit = composioToolkit;
/**
 * Whether a card can be signed into today, with nothing from us: the
 * vendor's own server, registering us itself, or open to anyone.
 */
const signsInItself = (item) => {
    const method = (0, exports.connectMethod)(item);
    return method?.via === exports.ConnectVia.Mcp && method.registration !== exports.OAuthRegistration.Preregistered;
};
exports.signsInItself = signsInItself;
/**
 * The MCP server name the engine knows a service by.
 *
 * Prefixed, because the engine's `mcp.servers` is one namespace shared
 * with whatever else a person has added by hand, and a bare `gmail`
 * would collide with theirs and silently replace it.
 */
exports.MCP_SERVER_PREFIX = 'connection-';
const mcpServerName = (id) => `${exports.MCP_SERVER_PREFIX}${id}`;
exports.mcpServerName = mcpServerName;
/** The single letter shown in a logo tile when there is no logo file. */
const connectionMonogram = (name) => (name.replace(/[^A-Za-z]/g, '').slice(0, 1).toUpperCase() || '?');
exports.connectionMonogram = connectionMonogram;
//# sourceMappingURL=catalog.js.map