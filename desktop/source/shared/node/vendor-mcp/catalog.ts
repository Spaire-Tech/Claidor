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
}

const G = VENDOR_MCP_GROUP;

/**
 * Our store. Live cards are vendor-hosted remote MCP (http) that advertised
 * dynamic registration on 15 September and still answered here on 19 September.
 * Coming soon is everything the person will look for that cannot Connect yet:
 * no public MCP, or OAuth that needs an app we register.
 */
export const VENDOR_MCP_CONNECTORS: readonly VendorMcpConnector[] = [
  { id: "gmail", name: "Gmail", category: G.MailCalendar, comingSoon: true, description: "Coming soon. Google needs an app we register first." },
  { id: "outlook", name: "Outlook", category: G.MailCalendar, comingSoon: true, description: "Coming soon. Microsoft needs an app we register first." },
  { id: "google-calendar", name: "Google Calendar", category: G.MailCalendar, comingSoon: true, description: "Coming soon. Google needs an app we register first." },
  { id: "notion", name: "Notion", category: G.FilesDocs, url: "https://mcp.notion.com/mcp", description: "Search, read, and write pages and databases." },
  { id: "google-drive", name: "Google Drive", category: G.FilesDocs, comingSoon: true, description: "Coming soon. Google needs an app we register first." },
  { id: "dropbox", name: "Dropbox", category: G.FilesDocs, url: "https://mcp.dropbox.com/mcp", description: "Search, read, and organise files." },
  { id: "airtable", name: "Airtable", category: G.Productivity, url: "https://mcp.airtable.com/mcp", description: "Query and update bases, tables, and records." },
  { id: "asana", name: "Asana", category: G.Productivity, comingSoon: true, description: "Coming soon. Asana's sign-in takes no self-registered client (measured 24 September 2026: no registration endpoint); it needs an app we register first." },
  { id: "clickup", name: "ClickUp", category: G.Productivity, url: "https://mcp.clickup.com/mcp", description: "Tasks, docs, and spaces." },
  { id: "monday", name: "monday.com", category: G.Productivity, url: "https://mcp.monday.com/mcp", description: "Boards, items, and the week." },
  { id: "todoist", name: "Todoist", category: G.Productivity, comingSoon: true, description: "Coming soon. Confirm the hosted MCP URL before Connect." },
  { id: "zoom", name: "Zoom", category: G.Meetings, comingSoon: true, description: "Coming soon. Zoom needs an app we register first." },
  { id: "google-meet", name: "Google Meet", category: G.Meetings, comingSoon: true, description: "Coming soon. Google needs an app we register first." },
  // Figma only lets clients on its MCP Catalog connect ("apply to register your client for remote access … reach out to your account team"); its registration endpoint answers 403 to any other client (measured 24 September 2026). Live again once Figma lists Simeon.
  { id: "figma", name: "Figma", category: G.Creativity, comingSoon: true, description: "Coming soon. Figma admits MCP clients by application through its MCP Catalog; Simeon Labs has applied and Connect works once Figma lists Simeon." },
  { id: "canva", name: "Canva", category: G.Creativity, url: "https://mcp.canva.com/mcp", description: "Create and edit designs." },
  { id: "miro", name: "Miro", category: G.Creativity, url: "https://mcp.miro.com/mcp", description: "Read and build boards." },
  { id: "webflow", name: "Webflow", category: G.Creativity, url: "https://mcp.webflow.com/mcp", description: "Sites, CMS, and collections." },
  { id: "wix", name: "Wix", category: G.Creativity, url: "https://mcp.wix.com/mcp", description: "Sites and the Wix collection." },
  { id: "stripe", name: "Stripe", category: G.Finance, url: "https://mcp.stripe.com", description: "Customers, payments, subscriptions, and invoices." },
  { id: "paypal", name: "PayPal", category: G.Finance, url: "https://mcp.paypal.com/mcp", description: "Invoices, orders, and transactions." },
  { id: "square", name: "Square", category: G.Finance, url: "https://mcp.squareup.com/mcp", description: "Payments, catalog, and the shop." },
  { id: "ramp", name: "Ramp", category: G.Finance, url: "https://mcp.ramp.com/mcp", description: "Expenses, cards, bills, and reimbursements." },
  { id: "quickbooks", name: "QuickBooks", category: G.Finance, comingSoon: true, description: "Coming soon. No public vendor MCP yet." },
  { id: "hubspot", name: "HubSpot", category: G.Sales, comingSoon: true, description: "Coming soon. HubSpot needs an app we register first." },
  { id: "salesforce", name: "Salesforce", category: G.Sales, comingSoon: true, description: "Coming soon. No public vendor MCP yet." },
  { id: "intercom", name: "Intercom", category: G.Sales, comingSoon: true, description: "Coming soon. Intercom needs an app we register first." },
  { id: "apollo", name: "Apollo", category: G.Sales, url: "https://mcp.apollo.io/mcp", description: "People, accounts, and sequences." },
  { id: "linear", name: "Linear", category: G.Developer, url: "https://mcp.linear.app/mcp", description: "Issues, projects, and cycles." },
  { id: "jira", name: "Jira", category: G.Developer, url: "https://mcp.atlassian.com/v1/mcp", description: "Jira and Confluence, through Atlassian." },
  { id: "github", name: "GitHub", category: G.Developer, comingSoon: true, description: "Coming soon. GitHub needs an app we register first." },
  { id: "vercel", name: "Vercel", category: G.Developer, url: "https://mcp.vercel.com", description: "Projects, deployments, and logs." },
  { id: "supabase", name: "Supabase", category: G.Developer, url: "https://mcp.supabase.com/mcp", description: "Projects, tables, and SQL." },
  { id: "sentry", name: "Sentry", category: G.Developer, url: "https://mcp.sentry.dev/mcp", description: "Errors, releases, and performance." },
  { id: "cloudflare", name: "Cloudflare", category: G.Developer, url: "https://bindings.mcp.cloudflare.com/mcp", description: "Workers, KV, and bindings." },
  { id: "mailchimp", name: "Mailchimp", category: G.Marketing, comingSoon: true, description: "Coming soon. No public vendor MCP yet." },
  { id: "greenhouse", name: "Greenhouse", category: G.Hiring, url: "https://mcp.greenhouse.io/mcp", description: "Jobs, candidates, and the pipeline." },
  { id: "gusto", name: "Gusto", category: G.Hiring, comingSoon: true, description: "Coming soon. No public vendor MCP yet." },
  { id: "slack", name: "Slack", category: G.Social, comingSoon: true, description: "Coming soon. Slack needs an app we register first." },
  { id: "linkedin", name: "LinkedIn", category: G.Social, comingSoon: true, description: "Coming soon. No public vendor MCP yet." },
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
 * (`mcp-server-id.ts`), because Cursor's backend numbered its servers. A
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
