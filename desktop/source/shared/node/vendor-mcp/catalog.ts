import { getConfiguredBackendUrl } from "../simeon-token.js";

export const VENDOR_MCP_GROUP = {
  MailCalendar: "Mail & Calendar",
  FilesDocs: "Files & Docs",
  Productivity: "Productivity & Tasks",
  Meetings: "Meetings",
  Creativity: "Creativity",
  Finance: "Finance & Money",
  Sales: "Sales & Customers",
  Developer: "Developer",
  Marketing: "Marketing & Growth",
  Hiring: "Hiring & People",
  Social: "Social",
} as const;

export type VendorMcpGroup = (typeof VENDOR_MCP_GROUP)[keyof typeof VENDOR_MCP_GROUP];

export interface VendorMcpConnector {
  readonly id: string;
  readonly name: string;
  readonly category: VendorMcpGroup;
  readonly description: string;
  readonly url?: string;
  readonly comingSoon?: true;
  /**
   * The key of an app Simeon Labs registered in the vendor's own console, a
   * public client signing in with PKCE. When set, the sign-in skips dynamic
   * registration. Measured 24 September 2026: Dropbox answers every
   * self-registered client with one shared id (`ydww2fwnzkxganl`) and names
   * it "Self host app (Unknown agent)" on its consent page whatever
   * `client_name` said; only an app made in its App Console carries our name.
   */
  readonly clientId?: string;
  /**
   * An app served by Simeon Labs' own apps service (`server/simeon/desktop/apps.py`)
   * instead of a vendor's MCP: the tools and the sign-in link come from our
   * server, the app's slug is this. Added 28 September 2026 ("for the rest of
   * the connectors … white label it"); `url` is our server's address for it.
   */
  readonly appsToolkit?: string;
}

/** Our server's MCP address for an app it serves (`/desktop/api/apps/mcp/<toolkit>`). */
export function appsMcpUrl(toolkit: string, backendUrl: string = getConfiguredBackendUrl()): string {
  return new URL(`desktop/api/apps/mcp/${encodeURIComponent(toolkit)}`, backendUrl.endsWith("/") ? backendUrl : `${backendUrl}/`).toString();
}

function app(connector: Omit<VendorMcpConnector, "url" | "appsToolkit" | "comingSoon">, toolkit: string): VendorMcpConnector {
  return { ...connector, appsToolkit: toolkit, get url() { return appsMcpUrl(toolkit); } };
}

const G = VENDOR_MCP_GROUP;

/**
 * Our store. Live cards are vendor-hosted remote MCP (http) that advertised
 * dynamic registration on 15 September and still answered here on 19 September.
 * Coming soon is everything the person will look for that cannot Connect yet:
 * no public MCP, or OAuth that needs an app we register.
 */
export const VENDOR_MCP_CONNECTORS: readonly VendorMcpConnector[] = [
  app({ id: "gmail", name: "Gmail", category: G.MailCalendar, description: "Search, read, draft, and manage email." }, "gmail"),
  app({ id: "outlook", name: "Outlook", category: G.MailCalendar, description: "Mail and Microsoft 365 calendar." }, "outlook"),
  app({ id: "google-calendar", name: "Google Calendar", category: G.MailCalendar, description: "Search events and schedule meetings." }, "googlecalendar"),
  { id: "notion", name: "Notion", category: G.FilesDocs, url: "https://mcp.notion.com/mcp", description: "Search, read, and write pages and databases." },
  app({ id: "google-drive", name: "Google Drive", category: G.FilesDocs, description: "Search, read, create, and share files." }, "googledrive"),
  { id: "dropbox", name: "Dropbox", category: G.FilesDocs, url: "https://mcp.dropbox.com/mcp", description: "Search, read, and organise files." },
  { id: "airtable", name: "Airtable", category: G.Productivity, url: "https://mcp.airtable.com/mcp", description: "Query and update bases, tables, and records." },
  app({ id: "asana", name: "Asana", category: G.Productivity, description: "Search and update tasks and projects." }, "asana"),
  { id: "clickup", name: "ClickUp", category: G.Productivity, url: "https://mcp.clickup.com/mcp", description: "Tasks, docs, and spaces." },
  { id: "monday", name: "monday.com", category: G.Productivity, url: "https://mcp.monday.com/mcp", description: "Boards, items, and the week." },
  app({ id: "todoist", name: "Todoist", category: G.Productivity, description: "Create, find, and complete tasks and projects." }, "todoist"),
  app({ id: "zoom", name: "Zoom", category: G.Meetings, description: "Search meetings, pull transcripts, and work with Zoom Docs." }, "zoom"),
  app({ id: "google-meet", name: "Google Meet", category: G.Meetings, description: "Meetings and recordings in Google." }, "googlemeet"),
  app({ id: "figma", name: "Figma", category: G.Creativity, description: "Read files, frames, and design context." }, "figma"),
  { id: "canva", name: "Canva", category: G.Creativity, url: "https://mcp.canva.com/mcp", description: "Create and edit designs." },
  { id: "miro", name: "Miro", category: G.Creativity, url: "https://mcp.miro.com/mcp", description: "Read and build boards." },
  { id: "webflow", name: "Webflow", category: G.Creativity, url: "https://mcp.webflow.com/mcp", description: "Sites, CMS, and collections." },
  { id: "wix", name: "Wix", category: G.Creativity, url: "https://mcp.wix.com/mcp", description: "Sites and the Wix collection." },
  { id: "stripe", name: "Stripe", category: G.Finance, url: "https://mcp.stripe.com", description: "Customers, payments, subscriptions, and invoices." },
  { id: "paypal", name: "PayPal", category: G.Finance, url: "https://mcp.paypal.com/mcp", description: "Invoices, orders, and transactions." },
  { id: "square", name: "Square", category: G.Finance, url: "https://mcp.squareup.com/mcp", description: "Payments, catalog, and the shop." },
  { id: "ramp", name: "Ramp", category: G.Finance, url: "https://mcp.ramp.com/mcp", description: "Expenses, cards, bills, and reimbursements." },
  app({ id: "quickbooks", name: "QuickBooks", category: G.Finance, description: "Books, invoices, and expenses." }, "quickbooks"),
  app({ id: "hubspot", name: "HubSpot", category: G.Sales, description: "Search and update contacts, companies, deals, and tickets." }, "hubspot"),
  app({ id: "salesforce", name: "Salesforce", category: G.Sales, description: "Leads, accounts, opportunities, and cases." }, "salesforce"),
  app({ id: "intercom", name: "Intercom", category: G.Sales, description: "Search conversations, contacts, and Help Center articles." }, "intercom"),
  { id: "apollo", name: "Apollo", category: G.Sales, url: "https://mcp.apollo.io/mcp", description: "People, accounts, and sequences." },
  { id: "linear", name: "Linear", category: G.Developer, url: "https://mcp.linear.app/mcp", description: "Issues, projects, and cycles." },
  { id: "jira", name: "Jira", category: G.Developer, url: "https://mcp.atlassian.com/v1/mcp", description: "Jira and Confluence, through Atlassian." },
  app({ id: "github", name: "GitHub", category: G.Developer, description: "Manage repos, issues, pull requests, and Actions." }, "github"),
  { id: "vercel", name: "Vercel", category: G.Developer, url: "https://mcp.vercel.com", description: "Projects, deployments, and logs." },
  { id: "supabase", name: "Supabase", category: G.Developer, url: "https://mcp.supabase.com/mcp", description: "Projects, tables, and SQL." },
  { id: "sentry", name: "Sentry", category: G.Developer, url: "https://mcp.sentry.dev/mcp", description: "Errors, releases, and performance." },
  { id: "cloudflare", name: "Cloudflare", category: G.Developer, url: "https://bindings.mcp.cloudflare.com/mcp", description: "Workers, KV, and bindings." },
  app({ id: "mailchimp", name: "Mailchimp", category: G.Marketing, description: "Audiences, campaigns, and automations." }, "mailchimp"),
  { id: "greenhouse", name: "Greenhouse", category: G.Hiring, url: "https://mcp.greenhouse.io/mcp", description: "Jobs, candidates, and the pipeline." },
  app({ id: "gusto", name: "Gusto", category: G.Hiring, description: "Payroll, people, and time off." }, "gusto"),
  app({ id: "slack", name: "Slack", category: G.Social, description: "Read and send messages in channels and DMs." }, "slack"),
  app({ id: "linkedin", name: "LinkedIn", category: G.Social, description: "Post to LinkedIn and read your own profile. Not the feed or messages." }, "linkedin"),
  // Appended, never inserted: a connector's server id is its place in this list.
  app({ id: "google-docs", name: "Google Docs", category: G.FilesDocs, description: "Read and write documents." }, "googledocs"),
  app({ id: "google-sheets", name: "Google Sheets", category: G.FilesDocs, description: "Read and write spreadsheets." }, "googlesheets"),
  app({ id: "google-slides", name: "Google Slides", category: G.FilesDocs, description: "Read and build presentations." }, "googleslides"),
  app({ id: "onedrive", name: "OneDrive", category: G.FilesDocs, description: "Files in Microsoft 365." }, "one_drive"),
  app({ id: "google-tasks", name: "Google Tasks", category: G.Productivity, description: "Tasks and lists in Google." }, "googletasks"),
  app({ id: "trello", name: "Trello", category: G.Productivity, description: "Boards, lists, and cards." }, "trello"),
  app({ id: "xero", name: "Xero", category: G.Finance, description: "Read and write invoices, contacts, reports, and payroll." }, "xero"),
  app({ id: "shopify", name: "Shopify", category: G.Finance, description: "Orders, products, customers, and your store." }, "shopify"),
  app({ id: "brex", name: "Brex", category: G.Finance, description: "Query expenses, receipts, bills, cards, and travel." }, "brex"),
  app({ id: "pipedrive", name: "Pipedrive", category: G.Sales, description: "Deals, people, and the pipeline." }, "pipedrive"),
  app({ id: "docusign", name: "Docusign", category: G.Sales, description: "Manage envelopes, templates, workflows, and agreements." }, "docusign"),
  app({ id: "klaviyo", name: "Klaviyo", category: G.Marketing, description: "Manage profiles, segments, campaigns, and flows." }, "klaviyo"),
  app({ id: "ashby", name: "Ashby", category: G.Hiring, description: "Search candidates, prep interviews, and manage pipeline tasks." }, "ashby"),
  // 3 October 2026, for founders and small businesses ("we're selling to
  // founders"): each one checked that day against Composio's toolkit page
  // (Composio-managed sign-in, so Add works without an app of ours) or, for
  // Mercury and PostHog, against the vendor's own MCP server (401 to an
  // unsigned initialize, OAuth metadata with a registration endpoint and S256).
  app({ id: "google-analytics", name: "Google Analytics", category: G.Marketing, description: "Traffic, conversions, and GA4 reports." }, "google_analytics"),
  app({ id: "google-search-console", name: "Google Search Console", category: G.Marketing, description: "Search queries, clicks, and indexing for your site." }, "google_search_console"),
  app({ id: "youtube", name: "YouTube", category: G.Marketing, description: "Your channel's videos, playlists, and stats." }, "youtube"),
  app({ id: "kit", name: "Kit", category: G.Marketing, description: "Newsletter subscribers, tags, and broadcasts (ConvertKit)." }, "kit"),
  app({ id: "instagram", name: "Instagram", category: G.Social, description: "Posts, comments, messages, and insights. Business and Creator accounts." }, "instagram"),
  app({ id: "facebook", name: "Facebook Pages", category: G.Social, description: "Your Pages' posts, comments, messages, and insights." }, "facebook"),
  app({ id: "calendly", name: "Calendly", category: G.Meetings, description: "Booking links, scheduled meetings, and invitees." }, "calendly"),
  app({ id: "cal-com", name: "Cal.com", category: G.Meetings, description: "Bookings, event types, and availability." }, "cal"),
  app({ id: "attio", name: "Attio", category: G.Sales, description: "People, companies, deals, and lists in your CRM." }, "attio"),
  app({ id: "zendesk", name: "Zendesk", category: G.Sales, description: "Support tickets, customers, and help center." }, "zendesk"),
  app({ id: "microsoft-teams", name: "Microsoft Teams", category: G.Social, description: "Chats, channels, and meetings in Teams." }, "microsoft_teams"),
  app({ id: "discord", name: "Discord", category: G.Social, description: "Your servers, channels, and invites." }, "discord"),
  { id: "mercury", name: "Mercury", category: G.Finance, url: "https://mcp.mercury.com/mcp", description: "Business bank accounts, balances, and transactions. Read-only." },
  { id: "posthog", name: "PostHog", category: G.Developer, url: "https://mcp.posthog.com/mcp", description: "Product analytics, insights, and feature flags." },
];

const byId = new Map(VENDOR_MCP_CONNECTORS.map((item) => [item.id, item]));

export function vendorMcpConnectorById(id: string): VendorMcpConnector | undefined {
  return byId.get(id.trim());
}

export function isVendorMcpPluginId(id: string): boolean {
  return vendorMcpConnectorById(id) != null;
}

export function isVendorMcpComingSoon(id: string): boolean {
  return vendorMcpConnectorById(id)?.comingSoon === true;
}

/**
 * The MCP manager validates every server id as a positive decimal string
 * (`mcp-server-id.ts`), because the upstream's backend numbered its servers. A
 * vendor connector gets a stable number from its place in the store, far
 * above anything a real account ever held; the plugin id stays the
 * server *identifier* ("figma"), which is what tools and the box use.
 */
export const VENDOR_MCP_SERVER_ID_BASE = 900_000;

export function vendorMcpServerId(pluginId: string): string | undefined {
  const index = VENDOR_MCP_CONNECTORS.findIndex((item) => item.id === pluginId.trim());
  return index < 0 ? undefined : String(VENDOR_MCP_SERVER_ID_BASE + index + 1);
}

export function vendorMcpPluginIdForServerId(serverId: string | number): string | undefined {
  const numeric = typeof serverId === "number" ? serverId : Number(String(serverId).trim());
  if (!Number.isSafeInteger(numeric)) return undefined;
  const index = numeric - VENDOR_MCP_SERVER_ID_BASE - 1;
  return index >= 0 && index < VENDOR_MCP_CONNECTORS.length ? VENDOR_MCP_CONNECTORS[index]?.id : undefined;
}
