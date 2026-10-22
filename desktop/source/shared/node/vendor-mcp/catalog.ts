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
  Learning: "Learning",
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
   * The vendor sends a sign-in back only to this computer's own address
   * (`http://localhost:8787/callback`), never to Simeon Labs' hosted one,
   * so the computer asks for the loopback even when the sign-in is started
   * from the iPhone, the Mac app in Swift or the web; the two apps listen
   * there while their sign-in sheet is open (`SimeonCore/LoopbackSignIn.swift`).
   * Measured 11 October 2026: Canva's authorize page answers "Invalid
   * redirect URI", Square's and Vercel's registration refuse the hosted
   * address, and Dropbox registers no client for it; each took the loopback.
   */
  readonly loopbackOnly?: true;
  /**
   * An app served by Simeon Labs' own apps service (`server/simeon/desktop/apps.py`)
   * instead of a vendor's MCP: the tools and the sign-in link come from our
   * server, the app's slug is this. Added 28 September 2026 ("for the rest of
   * the connectors … white label it"); `url` is our server's address for it.
   */
  readonly appsToolkit?: string;
  /**
   * An app run on the person's cloud computer instead of at a server
   * (13 October 2026): Link, Stripe's agent wallet, through
   * `@stripe/link-cli` (`../link-wallet/`); since 14 October 2026 Shop,
   * Shopify's Shop MCP called from the computer with the person's own
   * sign-in kept there (`../shop-wallet/`). Its tools and its device-code
   * sign-in come from the computer; `url` is the app's own page.
   */
  readonly boxCli?: "link" | "shop";
  /**
   * The maker's server needs no sign-in (17 October 2026: Excalidraw's,
   * which answers its tools to anyone). Adding it connects it: its tools are
   * called with no bearer, and its row is marked connected at once.
   */
  readonly noSignIn?: true;
}

/** Our server's MCP address for an app it serves (`/desktop/api/apps/mcp/<toolkit>`). */
export function appsMcpUrl(toolkit: string, backendUrl: string = getConfiguredBackendUrl()): string {
  return new URL(`desktop/api/apps/mcp/${encodeURIComponent(toolkit)}`, backendUrl.endsWith("/") ? backendUrl : `${backendUrl}/`).toString();
}

function app(connector: Omit<VendorMcpConnector, "url" | "appsToolkit" | "comingSoon">, toolkit: string): VendorMcpConnector {
  return { ...connector, appsToolkit: toolkit, get url() { return appsMcpUrl(toolkit); } };
}

/**
 * A connector taken out of the store keeps its place in the list, so no other
 * connector's server id moves (17 October 2026, the founder: "Can we remove
 * all zohos"). The place is listed nowhere and answers no plugin id.
 */
interface RetiredPlace {
  readonly retired: string;
}

function retired(id: string): RetiredPlace {
  return { retired: id };
}

function isConnector(place: VendorMcpConnector | RetiredPlace): place is VendorMcpConnector {
  return !("retired" in place);
}

const G = VENDOR_MCP_GROUP;

/**
 * Our store. Live cards are vendor-hosted remote MCP (http) that advertised
 * dynamic registration on 15 September and still answered here on 19 September.
 * Coming soon is everything the person will look for that cannot Connect yet:
 * no public MCP, or OAuth that needs an app we register. A vendor that
 * registers no clients but reads client metadata documents gets Simeon's, on
 * our server (13 October 2026, `oauth.ts`); Shopify's takes only the clients
 * it has approved, so Shopify stays with our apps service for now.
 */
const VENDOR_MCP_PLACES: readonly (VendorMcpConnector | RetiredPlace)[] = [
  app({ id: "gmail", name: "Gmail", category: G.MailCalendar, description: "Search, read, draft, and manage email." }, "gmail"),
  app({ id: "outlook", name: "Outlook", category: G.MailCalendar, description: "Mail and Microsoft 365 calendar." }, "outlook"),
  app({ id: "google-calendar", name: "Google Calendar", category: G.MailCalendar, description: "Search events and schedule meetings." }, "googlecalendar"),
  { id: "notion", name: "Notion", category: G.FilesDocs, url: "https://mcp.notion.com/mcp", description: "Search, read, and write pages and databases." },
  app({ id: "google-drive", name: "Google Drive", category: G.FilesDocs, description: "Search, read, create, and share files." }, "googledrive"),
  { id: "dropbox", name: "Dropbox", category: G.FilesDocs, url: "https://mcp.dropbox.com/mcp", loopbackOnly: true, description: "Search, read, and organise files." },
  { id: "airtable", name: "Airtable", category: G.Productivity, url: "https://mcp.airtable.com/mcp", description: "Query and update bases, tables, and records." },
  { id: "asana", name: "Asana", category: G.Productivity, url: "https://mcp.asana.com/mcp", description: "Search and update tasks and projects." },
  { id: "clickup", name: "ClickUp", category: G.Productivity, url: "https://mcp.clickup.com/mcp", description: "Tasks, docs, and spaces." },
  { id: "monday", name: "monday.com", category: G.Productivity, url: "https://mcp.monday.com/mcp", description: "Boards, items, and the week." },
  { id: "todoist", name: "Todoist", category: G.Productivity, url: "https://ai.todoist.net/mcp", description: "Create, find, and complete tasks and projects." },
  app({ id: "zoom", name: "Zoom", category: G.Meetings, description: "Search meetings, pull transcripts, and work with Zoom Docs." }, "zoom"),
  app({ id: "google-meet", name: "Google Meet", category: G.Meetings, description: "Meetings and recordings in Google." }, "googlemeet"),
  app({ id: "figma", name: "Figma", category: G.Creativity, description: "Read files, frames, and design context." }, "figma"),
  { id: "canva", name: "Canva", category: G.Creativity, url: "https://mcp.canva.com/mcp", loopbackOnly: true, description: "Create and edit designs." },
  { id: "miro", name: "Miro", category: G.Creativity, url: "https://mcp.miro.com/mcp", description: "Read and build boards." },
  { id: "webflow", name: "Webflow", category: G.Creativity, url: "https://mcp.webflow.com/mcp", description: "Sites, CMS, and collections." },
  { id: "wix", name: "Wix", category: G.Creativity, url: "https://mcp.wix.com/mcp", description: "Sites and the Wix collection." },
  { id: "stripe", name: "Stripe", category: G.Finance, url: "https://mcp.stripe.com", description: "Customers, payments, subscriptions, and invoices." },
  { id: "paypal", name: "PayPal", category: G.Finance, url: "https://mcp.paypal.com/mcp", description: "Invoices, orders, and transactions." },
  { id: "square", name: "Square", category: G.Finance, url: "https://mcp.squareup.com/mcp", loopbackOnly: true, description: "Payments, catalog, and the shop." },
  { id: "ramp", name: "Ramp", category: G.Finance, url: "https://mcp.ramp.com/mcp", description: "Expenses, cards, bills, and reimbursements." },
  app({ id: "quickbooks", name: "QuickBooks", category: G.Finance, description: "Books, invoices, and expenses." }, "quickbooks"),
  app({ id: "hubspot", name: "HubSpot", category: G.Sales, description: "Search and update contacts, companies, deals, and tickets." }, "hubspot"),
  app({ id: "salesforce", name: "Salesforce", category: G.Sales, description: "Leads, accounts, opportunities, and cases." }, "salesforce"),
  { id: "intercom", name: "Intercom", category: G.Sales, url: "https://mcp.intercom.com/mcp", description: "Search conversations, contacts, and Help Center articles." },
  { id: "apollo", name: "Apollo", category: G.Sales, url: "https://mcp.apollo.io/mcp", description: "People, accounts, and sequences." },
  { id: "linear", name: "Linear", category: G.Developer, url: "https://mcp.linear.app/mcp", description: "Issues, projects, and cycles." },
  { id: "jira", name: "Jira", category: G.Developer, url: "https://mcp.atlassian.com/v1/mcp", description: "Jira and Confluence, through Atlassian." },
  app({ id: "github", name: "GitHub", category: G.Developer, description: "Manage repos, issues, pull requests, and Actions." }, "github"),
  { id: "vercel", name: "Vercel", category: G.Developer, url: "https://mcp.vercel.com", loopbackOnly: true, description: "Projects, deployments, and logs." },
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
  { id: "klaviyo", name: "Klaviyo", category: G.Marketing, url: "https://mcp.klaviyo.com/mcp", description: "Manage profiles, segments, campaigns, and flows." },
  { id: "ashby", name: "Ashby", category: G.Hiring, url: "https://mcp.ashbyhq.com/mcp/v1", description: "Search candidates, prep interviews, and manage pipeline tasks." },
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
  { id: "calendly", name: "Calendly", category: G.Meetings, url: "https://mcp.calendly.com/", description: "Booking links, scheduled meetings, and invitees." },
  { id: "cal-com", name: "Cal.com", category: G.Meetings, url: "https://mcp.cal.com/mcp", description: "Bookings, event types, and availability." },
  { id: "attio", name: "Attio", category: G.Sales, url: "https://mcp.attio.com/mcp", description: "People, companies, deals, and lists in your CRM." },
  app({ id: "zendesk", name: "Zendesk", category: G.Sales, description: "Support tickets, customers, and help center." }, "zendesk"),
  app({ id: "microsoft-teams", name: "Microsoft Teams", category: G.Social, description: "Chats, channels, and meetings in Teams." }, "microsoft_teams"),
  app({ id: "discord", name: "Discord", category: G.Social, description: "Your servers, channels, and invites." }, "discord"),
  { id: "mercury", name: "Mercury", category: G.Finance, url: "https://mcp.mercury.com/mcp", description: "Business bank accounts, balances, and transactions. Read-only." },
  { id: "posthog", name: "PostHog", category: G.Developer, url: "https://mcp.posthog.com/mcp", description: "Product analytics, insights, and feature flags." },
  // 7 October 2026, the founder's hand-picked list: only the toolkits whose
  // Composio page marks the sign-in as Composio-managed OAuth, so Add works
  // in one click. The rest of that list asks for the person's own API key or
  // an OAuth app of ours (X, Spotify, Meta Ads, LinkedIn Ads) and waits.
  app({ id: "google-ads", name: "Google Ads", category: G.Marketing, description: "Campaigns, ad groups, keywords, and performance." }, "googleads"),
  app({ id: "tiktok-ads", name: "TikTok Ads", category: G.Marketing, description: "Campaigns, ads, audiences, and reports." }, "tiktok_ads"),
  app({ id: "microsoft-excel", name: "Excel", category: G.FilesDocs, description: "Read and write workbooks in Microsoft 365." }, "excel"),
  app({ id: "reddit", name: "Reddit", category: G.Social, description: "Search posts and comments, and post to communities." }, "reddit"),
  app({ id: "pinterest", name: "Pinterest", category: G.Social, description: "Boards, pins, and their analytics." }, "pinterest"),
  app({ id: "gumroad", name: "Gumroad", category: G.Finance, description: "Products, sales, and subscribers." }, "gumroad"),
  app({ id: "google-classroom", name: "Google Classroom", category: G.Learning, description: "Courses, assignments, students, and grades." }, "google_classroom"),
  { id: "gorgias", name: "Gorgias", category: G.Sales, url: "https://mcp.gorgias.com/mcp", description: "Support tickets, customers, and replies for your store." },
  retired("zoho-desk"),
  retired("zoho-bigin"),
  { id: "gong", name: "Gong", category: G.Sales, url: "https://mcp.gong.io/mcp", description: "Sales calls, transcripts, and deal insights." },
  app({ id: "capsule-crm", name: "Capsule", category: G.Sales, description: "Contacts, opportunities, and tasks in your CRM." }, "capsule_crm"),
  app({ id: "dialpad", name: "Dialpad", category: G.Sales, description: "Calls, texts, contacts, and call summaries." }, "dialpad"),
  // 13 October 2026, the founder: "add stripe/link-cli so that the agents can
  // make purchase for the user … and access their banks". Run on the cloud
  // computer (`boxCli`); purchases for US and Canadian Link accounts, bank
  // reading for US ones.
  { id: "link", name: "Link", category: G.Finance, url: "https://link.com/agents", boxCli: "link", description: "Buy what you ask for, with your OK in the Link app for each purchase, and read the bank accounts you share. US only." },
  // 13 October 2026, the founder ("there are plenty of MCPs out there"): two
  // apps on their makers' own servers, probed that day (401 with OAuth
  // metadata, open registration, S256). Asana, Todoist, Intercom, Klaviyo,
  // Ashby, Calendly, Cal.com, Attio, Gorgias and Gong moved from our apps
  // service to theirs in place, the same day (`installs.ts` moves an install
  // made through our apps service to the new address).
  { id: "granola", name: "Granola", category: G.Meetings, url: "https://mcp.granola.ai/mcp", description: "Your meeting notes, transcripts, and folders." },
  { id: "resend", name: "Resend", category: G.Developer, url: "https://mcp.resend.com", description: "Send email, and manage domains, audiences, and broadcasts." },
  // 13 October 2026, the founder ("add those microsoft suite ones basically. add lovable"): SharePoint through our apps service
  // (Composio signs anyone in); OneNote and Microsoft To Do need Simeon Labs' own Microsoft app first (`OWN_APP_NEEDED`), so they
  // say "Coming soon" until it is named; Lovable on its own server, which takes a hosted sign-in address only once Lovable approves
  // it and the loopback always (docs.lovable.dev, "Lovable MCP server"). Word and PowerPoint have no app of their own anywhere:
  // their files are OneDrive's and SharePoint's.
  app({ id: "sharepoint", name: "SharePoint", category: G.FilesDocs, description: "Sites, lists, and files in Microsoft 365." }, "share_point"),
  app({ id: "onenote", name: "OneNote", category: G.FilesDocs, description: "Notebooks, sections, and pages." }, "onenote"),
  app({ id: "microsoft-to-do", name: "Microsoft To Do", category: G.Productivity, description: "Your tasks and lists in Microsoft To Do." }, "microsoft_todo"),
  { id: "lovable", name: "Lovable", category: G.Developer, url: "https://mcp.lovable.dev", loopbackOnly: true, description: "Build and change apps and sites by describing them." },
  // 14 October 2026, the founder ("build the whole shop integration. make sure its the exact flow as link"): Shop, run from the
  // cloud computer (`boxCli`) against Shop MCP, the person's Shop sign-in kept there. Shopping search works without it.
  { id: "shop", name: "Shop", category: G.Finance, url: "https://shop.app", boxCli: "shop", description: "Find products across Shopify stores and buy them with your Shop card, with your OK for each purchase. Track your orders." },
  // 17 October 2026, the founder ("a lot more connectors … the best out there, most famous for each category"): the 36 whose
  // Composio toolkit page says "Composio-managed OAuth available? Yes", so Add works in one tap, read from Composio's toolkit
  // pages that day. NotebookLM's is NotebookLM Enterprise (a licensed Google Cloud project), and WhatsApp's is WhatsApp Business.
  // Zoho Mail, Zoho Books and Zoho CRM were retired the same day, with Zoho Desk and Bigin (the founder: "remove all zohos").
  app({ id: "whatsapp", name: "WhatsApp", category: G.Social, description: "Messages and templates on your WhatsApp Business account. Not personal WhatsApp." }, "whatsapp"),
  app({ id: "twitch", name: "Twitch", category: G.Social, description: "Your channel, streams, clips, and chat." }, "twitch"),
  app({ id: "reddit-ads", name: "Reddit Ads", category: G.Marketing, description: "Campaigns, ad groups, ads, and reports." }, "reddit_ads"),
  app({ id: "pinterest-ads", name: "Pinterest Ads", category: G.Marketing, description: "Campaigns, ad groups, and their results." }, "pinterest_ads"),
  app({ id: "omnisend", name: "Omnisend", category: G.Marketing, description: "Contacts, campaigns, and automations for your store's email and SMS." }, "omnisend"),
  app({ id: "dub", name: "Dub", category: G.Marketing, description: "Short links, QR codes, and click analytics." }, "dub"),
  app({ id: "eventbrite", name: "Eventbrite", category: G.Marketing, description: "Your events, tickets, orders, and attendees." }, "eventbrite"),
  app({ id: "google-photos", name: "Google Photos", category: G.Creativity, description: "Find, upload, and share photos and albums." }, "googlephotos"),
  app({ id: "mural", name: "Mural", category: G.Creativity, description: "Workspaces, murals, and the sticky notes on them." }, "mural"),
  app({ id: "zeplin", name: "Zeplin", category: G.Creativity, description: "Projects, screens, components, and style guides." }, "zeplin"),
  app({ id: "contentful", name: "Contentful", category: G.Creativity, description: "Spaces, content types, and entries in your CMS." }, "contentful"),
  app({ id: "box", name: "Box", category: G.FilesDocs, description: "Search, read, and share files and folders." }, "box"),
  app({ id: "confluence", name: "Confluence", category: G.FilesDocs, description: "Search, read, and write spaces and pages." }, "confluence"),
  app({ id: "notebooklm", name: "NotebookLM", category: G.FilesDocs, description: "Notebooks, sources, and audio overviews in NotebookLM Enterprise. Not the free NotebookLM." }, "notebook_lm"),
  app({ id: "basecamp", name: "Basecamp", category: G.Productivity, description: "Projects, to-dos, messages, and schedules." }, "basecamp"),
  app({ id: "wrike", name: "Wrike", category: G.Productivity, description: "Tasks, projects, and folders." }, "wrike"),
  app({ id: "ticktick", name: "TickTick", category: G.Productivity, description: "Tasks, lists, and due dates." }, "ticktick"),
  app({ id: "harvest", name: "Harvest", category: G.Productivity, description: "Time entries, projects, clients, and invoices." }, "harvest"),
  app({ id: "typeform", name: "Typeform", category: G.Productivity, description: "Forms and their responses." }, "typeform"),
  app({ id: "productboard", name: "Productboard", category: G.Productivity, description: "Features, notes, and customer feedback." }, "productboard"),
  app({ id: "google-maps", name: "Google Maps", category: G.Productivity, description: "Places, directions, and travel times." }, "google_maps"),
  app({ id: "webex", name: "Webex", category: G.Meetings, description: "Meetings, recordings, and messages." }, "webex"),
  app({ id: "fathom", name: "Fathom", category: G.Meetings, description: "Your recorded meetings, summaries, and transcripts." }, "fathom"),
  retired("zoho-mail"),
  app({ id: "freshbooks", name: "FreshBooks", category: G.Finance, description: "Invoices, clients, expenses, and time." }, "freshbooks"),
  retired("zoho-books"),
  app({ id: "ynab", name: "YNAB", category: G.Finance, description: "Budgets, accounts, and transactions (You Need A Budget)." }, "ynab"),
  app({ id: "splitwise", name: "Splitwise", category: G.Finance, description: "Shared expenses, groups, and who owes whom." }, "splitwise"),
  app({ id: "shippo", name: "Shippo", category: G.Finance, description: "Shipping rates, labels, and tracking." }, "shippo"),
  retired("zoho-crm"),
  app({ id: "dynamics-365", name: "Dynamics 365", category: G.Sales, description: "Leads, accounts, contacts, and opportunities in Microsoft Dynamics." }, "dynamics365"),
  app({ id: "gitlab", name: "GitLab", category: G.Developer, description: "Projects, issues, merge requests, and pipelines." }, "gitlab"),
  app({ id: "bitbucket", name: "Bitbucket", category: G.Developer, description: "Repositories, pull requests, and pipelines." }, "bitbucket"),
  app({ id: "pagerduty", name: "PagerDuty", category: G.Developer, description: "Incidents, on-call schedules, and services." }, "pagerduty"),
  app({ id: "google-bigquery", name: "Google BigQuery", category: G.Developer, description: "Datasets and tables, and the SQL to query them." }, "googlebigquery"),
  app({ id: "hugging-face", name: "Hugging Face", category: G.Developer, description: "Models, datasets, and Spaces." }, "hugging_face"),
  // The same day, 17 apps on their makers' own MCP servers, each probed then: a 401 naming OAuth metadata, an open
  // registration endpoint and S256, and a registration of Simeon with the hosted return address (Gamma refused it and took
  // the loopback, so it is loopback-only, as Canva is). Excalidraw's answers its tools to anyone (`noSignIn`). Plaid's
  // is Plaid's dashboard for teams building on Plaid, not a person's bank accounts (Link reads those).
  { id: "excalidraw", name: "Excalidraw", category: G.Creativity, url: "https://mcp.excalidraw.com/mcp", noSignIn: true, description: "Draw hand-drawn diagrams, and share them on excalidraw.com." },
  { id: "heygen", name: "HeyGen", category: G.Creativity, url: "https://mcp.heygen.com/mcp/v1/", description: "Make videos with AI avatars and voices." },
  { id: "higgsfield", name: "Higgsfield", category: G.Creativity, url: "https://mcp.higgsfield.ai/mcp", description: "Generate images and videos with AI models." },
  { id: "gamma", name: "Gamma", category: G.Creativity, url: "https://mcp.gamma.app/mcp", loopbackOnly: true, description: "Make presentations, documents, and web pages." },
  { id: "descript", name: "Descript", category: G.Creativity, url: "https://api.descript.com/v2/mcp", description: "Edit video and podcasts: import media, run edits, export." },
  { id: "lucid", name: "Lucid", category: G.Creativity, url: "https://mcp.lucid.app/mcp", description: "Diagrams and whiteboards in Lucidchart and Lucidspark." },
  { id: "eraser", name: "Eraser", category: G.Creativity, url: "https://app.eraser.io/api/mcp", description: "Technical diagrams and docs." },
  { id: "mobbin", name: "Mobbin", category: G.Creativity, url: "https://api.mobbin.com/mcp", description: "Search real apps' screens and flows for design ideas." },
  { id: "magic-patterns", name: "Magic Patterns", category: G.Creativity, url: "https://mcp.magicpatterns.com/mcp", description: "Design and change app screens by describing them." },
  { id: "pandadoc", name: "PandaDoc", category: G.FilesDocs, url: "https://mcp.pandadoc.com/v1/mcp", description: "Proposals, quotes, and contracts: create, send, and track." },
  { id: "otter", name: "Otter.ai", category: G.Meetings, url: "https://mcp.otter.ai/mcp", description: "Your meeting transcripts and summaries. Read-only." },
  { id: "read-ai", name: "Read AI", category: G.Meetings, url: "https://api.read.ai/mcp", description: "Meeting summaries, transcripts, and action items." },
  { id: "fellow", name: "Fellow", category: G.Meetings, url: "https://fellow.app/mcp", description: "Meeting notes, action items, and agendas." },
  { id: "plaid", name: "Plaid", category: G.Finance, url: "https://api.dashboard.plaid.com/mcp/", description: "Your Plaid integration's Items, Link conversion, and usage. For teams building on Plaid. Read-only." },
  { id: "clay", name: "Clay", category: G.Sales, url: "https://api.clay.com/v3/mcp", description: "Research companies and people, and enrich your lists." },
  { id: "netlify", name: "Netlify", category: G.Developer, url: "https://netlify-mcp.netlify.app/mcp", description: "Sites, deploys, and environment settings." },
  { id: "neon", name: "Neon", category: G.Developer, url: "https://mcp.neon.tech/mcp", description: "Postgres projects, branches, and SQL." },
  // 17 October 2026, the founder ("a lot of 🔑 … i see their mcps, not keys. please look online"): of the 85 apps that
  // Composio connects only with the person's own API key, these 52 run their own MCP server with a sign-in. Each address
  // is the maker's (its docs, or its listing in the official MCP registry under its own domain), and each was probed that
  // day: a 401 naming OAuth metadata with S256, and Simeon registered once with the hosted return address and its
  // authorize page opened without a session. Semrush, Brevo, Shortcut, SurveyMonkey, Avoma, Lusha, Storyblok and Coinbase
  // refused the hosted address and took the loopback. ElevenLabs, Canny and Aircall register no clients but read client
  // documents: their authorize pages opened with Simeon's (`oauth.ts`), where Shopify's answers `unauthorized_client`.
  { id: "beehiiv", name: "Beehiiv", category: G.Marketing, url: "https://mcp.beehiiv.com/mcp", description: "Newsletters, posts, and subscribers." },
  { id: "mailerlite", name: "MailerLite", category: G.Marketing, url: "https://mcp.mailerlite.com/mcp", description: "Subscribers, groups, campaigns, and automations." },
  { id: "getresponse", name: "GetResponse", category: G.Marketing, url: "https://mcp.getresponse.com", description: "Contacts, lists, newsletters, and automations." },
  { id: "customer-io", name: "Customer.io", category: G.Marketing, url: "https://mcp.customer.io/mcp", description: "People, segments, campaigns, and messages." },
  { id: "lemlist", name: "Lemlist", category: G.Marketing, url: "https://app.lemlist.com/mcp", description: "Outreach campaigns, leads, and replies." },
  { id: "mixpanel", name: "Mixpanel", category: G.Marketing, url: "https://mcp.mixpanel.com/mcp", description: "Product analytics: events, funnels, and retention." },
  { id: "amplitude", name: "Amplitude", category: G.Marketing, url: "https://mcp.amplitude.com/mcp", description: "Product analytics: charts, cohorts, and experiments." },
  { id: "bitly", name: "Bitly", category: G.Marketing, url: "https://api-ssl.bitly.com/v4/mcp", description: "Short links, QR codes, and clicks." },
  { id: "ahrefs", name: "Ahrefs", category: G.Marketing, url: "https://api.ahrefs.com/mcp/mcp", description: "SEO: backlinks, keywords, and site audits." },
  { id: "moz", name: "Moz", category: G.Marketing, url: "https://api.moz.com/mcp/v1/data", description: "SEO data: domain authority, links, and keywords. Needs a Moz API plan." },
  { id: "dataforseo", name: "DataForSEO", category: G.Marketing, url: "https://mcp.dataforseo.com/v3/mcp", description: "Search results, keywords, and backlinks data." },
  { id: "semrush", name: "Semrush", category: G.Marketing, url: "https://mcp.semrush.com/v1/mcp", loopbackOnly: true, description: "SEO and competitors: keywords, traffic, and backlinks." },
  { id: "brevo", name: "Brevo", category: G.Marketing, url: "https://mcp.brevo.com/v1/brevo/mcp", loopbackOnly: true, description: "Contacts, email and SMS campaigns." },
  { id: "runway", name: "Runway", category: G.Creativity, url: "https://mcp.runwayml.com/mcp", description: "Generate and edit video and images with AI." },
  { id: "black-forest-labs", name: "FLUX", category: G.Creativity, url: "https://mcp.bfl.ai", description: "Generate and edit images with Black Forest Labs' FLUX models." },
  { id: "fal", name: "fal.ai", category: G.Creativity, url: "https://mcp.fal.ai/mcp-relay", description: "Run AI image, video, and audio models." },
  { id: "replicate", name: "Replicate", category: G.Creativity, url: "https://mcp.replicate.com/mcp", description: "Run open-source AI models." },
  { id: "creatomate", name: "Creatomate", category: G.Creativity, url: "https://api.creatomate.com/mcp", description: "Make videos and images from templates." },
  { id: "shotstack", name: "Shotstack", category: G.Creativity, url: "https://mcp.shotstack.io/", description: "Edit and render videos." },
  { id: "bannerbear", name: "Bannerbear", category: G.Creativity, url: "https://mcp.bannerbear.com/", description: "Generate images and videos from templates." },
  { id: "cloudinary", name: "Cloudinary", category: G.Creativity, url: "https://asset-management.mcp.cloudinary.com/mcp", description: "Upload, organise, and transform images and videos." },
  { id: "sanity", name: "Sanity", category: G.Creativity, url: "https://mcp.sanity.io", description: "Content, schemas, and documents in your CMS." },
  { id: "wistia", name: "Wistia", category: G.Creativity, url: "https://api.wistia.com/mcp/api", description: "Your videos, channels, and stats." },
  { id: "captions", name: "Captions", category: G.Creativity, url: "https://mcp.captions.ai/mcp", description: "Edit talking videos and add captions with AI." },
  { id: "elevenlabs", name: "ElevenLabs", category: G.Creativity, url: "https://api.us.elevenlabs.io/v1/mcp", description: "Voices, speech, sound effects, and music." },
  { id: "storyblok", name: "Storyblok", category: G.Creativity, url: "https://mcp.storyblok.com/mcp", loopbackOnly: true, description: "Stories, components, and assets in your CMS." },
  { id: "coda", name: "Coda", category: G.FilesDocs, url: "https://coda.io/apis/mcp", description: "Docs, tables, and pages." },
  { id: "make", name: "Make", category: G.Productivity, url: "https://mcp.make.com", description: "Run and manage your automation scenarios." },
  { id: "tally", name: "Tally", category: G.Productivity, url: "https://api.tally.so/mcp", description: "Forms and their submissions." },
  { id: "jotform", name: "Jotform", category: G.Productivity, url: "https://mcp.jotform.com/", description: "Forms and their submissions." },
  { id: "surveymonkey", name: "SurveyMonkey", category: G.Productivity, url: "https://mcp.surveymonkey.com/mcp", loopbackOnly: true, description: "Surveys and their responses." },
  { id: "canny", name: "Canny", category: G.Productivity, url: "https://api.canny.io/api/mcp/v1", description: "Feature requests, votes, and your roadmap. Pro plan." },
  { id: "fireflies", name: "Fireflies", category: G.Meetings, url: "https://api.fireflies.ai/mcp", description: "Meeting transcripts, summaries, and action items." },
  { id: "tldv", name: "tl;dv", category: G.Meetings, url: "https://mcp.tldv.io/mcp", description: "Your meeting recordings and notes. Read-only, Pro plan." },
  { id: "avoma", name: "Avoma", category: G.Meetings, url: "https://mcp.avoma.com/mcp", loopbackOnly: true, description: "Meeting notes, transcripts, and deal insights." },
  { id: "missive", name: "Missive", category: G.MailCalendar, url: "https://mcp.missiveapp.com", description: "Your team inbox: conversations, drafts, and tasks." },
  { id: "mixmax", name: "Mixmax", category: G.MailCalendar, url: "https://mcp.mixmax.com/mcp", description: "Email sequences, meetings, and tracking." },
  { id: "close", name: "Close", category: G.Sales, url: "https://mcp.close.com/mcp", description: "Leads, contacts, opportunities, and calls in your CRM." },
  { id: "hunter", name: "Hunter", category: G.Sales, url: "https://mcp.hunter.io/mcp", description: "Find and verify professional email addresses." },
  { id: "lusha", name: "Lusha", category: G.Sales, url: "https://mcp.lusha.com", loopbackOnly: true, description: "Contact and company data for prospecting." },
  { id: "aircall", name: "Aircall", category: G.Sales, url: "https://mcp.aircall.io/mcp", description: "Your team's calls and their details." },
  { id: "workable", name: "Workable", category: G.Hiring, url: "https://mcp.workable.com/mcp", description: "Jobs, candidates, and the hiring pipeline." },
  { id: "breezy-hr", name: "Breezy HR", category: G.Hiring, url: "https://mcp.breezy.hr/mcp", description: "Positions, candidates, and the pipeline." },
  { id: "postman", name: "Postman", category: G.Developer, url: "https://mcp.postman.com/mcp", description: "APIs, collections, and workspaces." },
  { id: "railway", name: "Railway", category: G.Developer, url: "https://mcp.railway.com/", description: "Projects, services, deploys, and logs." },
  { id: "datadog", name: "Datadog", category: G.Developer, url: "https://mcp.datadoghq.com/api/unstable/mcp-server/mcp", description: "Logs, metrics, monitors, and incidents. US1 site." },
  { id: "tavily", name: "Tavily", category: G.Developer, url: "https://mcp.tavily.com/mcp", description: "Web search and page extraction for research." },
  { id: "exa", name: "Exa", category: G.Developer, url: "https://mcp.exa.ai/mcp", description: "Web search and page contents for research." },
  { id: "shortcut", name: "Shortcut", category: G.Developer, url: "https://mcp.shortcut.com/mcp", loopbackOnly: true, description: "Stories, epics, and iterations." },
  { id: "razorpay", name: "Razorpay", category: G.Finance, url: "https://mcp.razorpay.com/mcp", description: "Payments, orders, refunds, and settlements." },
  { id: "coinbase", name: "Coinbase", category: G.Finance, url: "https://agents.coinbase.com/mcp", loopbackOnly: true, description: "Your Coinbase account, through Coinbase for Agents." },
  { id: "typefully", name: "Typefully", category: G.Social, url: "https://mcp.typefully.com/mcp", description: "Draft, schedule, and publish posts to X, LinkedIn, and Threads." },
  // 22 October 2026, the apps the teams in `server/simeon/desktop/packs.json` ask for. On their makers' own servers, each probed
  // that day (an unsigned `initialize` answered 401 naming OAuth metadata with S256, Simeon registered once and its authorize
  // page opened without a session): Gem, CourtListener, Ignition, CompanyCam and Midpage took the hosted return address; Loop
  // Returns, Upwork, Karbon and vidIQ refused it and took the loopback. Crunchbase registers no clients but reads client
  // documents (Simeon's, `oauth.ts`); its authorize page answered the probe with Cloudflare's block, so it is checked only as far
  // as its metadata. TaskRabbit's server answers its tools to anyone (`noSignIn`). The rest through our apps service, read from
  // Composio's toolkit pages that day: Zoho Inventory signs anyone in; Meta Ads, Jobber, BambooHR, TikTok, Follow Up Boss,
  // Matterport, ZoomInfo and Clio need an OAuth app of ours first (`OWN_APP_NEEDED`: Meta's own server refuses registration,
  // Jobber's registers none, BambooHR's is per company); the others take the person's own API key on the sign-in page, and Yelp
  // and Aiwyn Tax need none.
  { id: "crunchbase", name: "Crunchbase", category: G.Sales, url: "https://mcp.crunchbase.com", description: "Companies, funding rounds, investors, and the people behind them." },
  { id: "gem", name: "Gem", category: G.Hiring, url: "https://mcp.gem.com/mcp", description: "Source candidates, and manage your talent pipeline and outreach." },
  app({ id: "meta-ads", name: "Meta Ads", category: G.Marketing, description: "Campaigns, ad sets, ads, and results on Facebook and Instagram." }, "metaads"),
  { id: "loop-returns", name: "Loop Returns", category: G.Sales, url: "https://api.loopreturns.com/mcp", loopbackOnly: true, description: "Returns, exchanges, and refunds for your Shopify store." },
  { id: "upwork", name: "Upwork", category: G.Hiring, url: "https://mcp.upwork.com/mcp", loopbackOnly: true, description: "Jobs, freelancers, proposals, and contracts." },
  { id: "courtlistener", name: "CourtListener", category: G.FilesDocs, url: "https://mcp.courtlistener.com/", description: "Case law, court dockets, and judges, from the Free Law Project." },
  { id: "karbon", name: "Karbon", category: G.Finance, url: "https://mcp.karbonhq.com/mcp", loopbackOnly: true, description: "Your accounting practice's clients, work, and deadlines." },
  { id: "ignition", name: "Ignition", category: G.Finance, url: "https://mcp.ignitionapp.com/mcp", description: "Proposals, engagement letters, billing, and payments for your firm." },
  // AppFolio's registration (Keycloak, `account.appfolio.com`) answered both return addresses "Policy 'Trusted Hosts' rejected
  // request … Host not trusted" (22 October 2026): it registers only the clients AppFolio lets in, and Composio has no AppFolio.
  { id: "appfolio", name: "AppFolio", category: G.Productivity, url: "https://mcp.appfolio.com/mcp", comingSoon: true, description: "Properties, units, tenants, and work orders." },
  app({ id: "jobber", name: "Jobber", category: G.Sales, description: "Clients, quotes, jobs, and invoices for your service business." }, "jobber"),
  { id: "companycam", name: "CompanyCam", category: G.Productivity, url: "https://api.companycam.com/public_api/mcp", description: "Job site photos, projects, and checklists." },
  // Uber's only open address is the one it made for Claude (22 October 2026): the path says so, its tool is
  // `get_estimates_between_two_locations_claude` with Claude's widget, and its booking links carry `utm_source=claude`; the
  // general `/rides-3p/mcp` answers "Access denied". Waits for an address Uber gives other apps; Composio has no Uber.
  { id: "uber", name: "Uber", category: G.Productivity, url: "https://mcp.uber.com/claude/rides-3p/mcp", comingSoon: true, description: "Ride estimates and links to book a ride." },
  // Instacart's server lists its tools to anyone but answers a call only with an Instacart Developer Platform key in the
  // `Authorization` header ("Authorization header is required", 22 October 2026): no sign-in, and Composio has no Instacart.
  { id: "instacart", name: "Instacart", category: G.Productivity, url: "https://mcp.instacart.com/mcp", comingSoon: true, description: "Turn recipes and shopping lists into Instacart pages to order from." },
  { id: "taskrabbit", name: "TaskRabbit", category: G.Productivity, url: "https://mcp.taskrabbit.com/mcp", noSignIn: true, description: "Find Taskers near you for jobs around the home, and start a booking." },
  app({ id: "bamboohr", name: "BambooHR", category: G.Hiring, description: "Employees, time off, job openings, and applicants." }, "bamboohr"),
  app({ id: "7shifts", name: "7shifts", category: G.Hiring, description: "Shifts, locations, and your restaurant team." }, "7shifts"),
  app({ id: "veryfi", name: "Veryfi", category: G.Finance, description: "Read receipts, invoices, and bills into data." }, "veryfi"),
  app({ id: "yelp", name: "Yelp", category: G.Marketing, description: "Find businesses and events, and read reviews and ratings." }, "yelp"),
  app({ id: "tiktok", name: "TikTok", category: G.Social, description: "Post videos and photos, and see your videos and stats." }, "tiktok"),
  app({ id: "follow-up-boss", name: "Follow Up Boss", category: G.Sales, description: "Leads, people, deals, and appointments in your real estate CRM." }, "follow_up_boss"),
  app({ id: "matterport", name: "Matterport", category: G.Creativity, description: "Your 3D tours and the spaces in them." }, "matterport"),
  app({ id: "zoho-inventory", name: "Zoho Inventory", category: G.Finance, description: "Items, stock, sales orders, and invoices." }, "zoho_inventory"),
  app({ id: "toggl", name: "Toggl", category: G.Productivity, description: "Time entries, projects, clients, and reports (Toggl Track)." }, "toggl_track"),
  { id: "vidiq", name: "vidIQ", category: G.Marketing, url: "https://mcp.vidiq.com/mcp", loopbackOnly: true, description: "YouTube research: trends, keywords, channels, and your channel's stats." },
  app({ id: "youtube-transcript", name: "YouTube Transcript", category: G.Marketing, description: "Transcripts of YouTube videos, playlists, and channels." }, "youtube_transcript"),
  app({ id: "hypeauditor", name: "HypeAuditor", category: G.Marketing, description: "Find influencers, and read their audiences and reach." }, "hypeauditor"),
  app({ id: "zoominfo", name: "ZoomInfo", category: G.Sales, description: "Company and contact data, intent, and news for prospecting." }, "zoominfo"),
  app({ id: "heyreach", name: "HeyReach", category: G.Sales, description: "LinkedIn outreach campaigns, leads, and conversations." }, "heyreach"),
  app({ id: "contactout", name: "ContactOut", category: G.Sales, description: "Find emails and phone numbers for people and companies." }, "contactout"),
  app({ id: "hireflix", name: "Hireflix", category: G.Hiring, description: "One-way video interviews: positions, invites, and answers." }, "hireflix"),
  app({ id: "clio", name: "Clio", category: G.Productivity, description: "Clients, matters, calendars, tasks, and billing for your law firm." }, "clio_manage"),
  app({ id: "draftable", name: "Draftable", category: G.FilesDocs, description: "Your document comparisons and their links." }, "draftable"),
  app({ id: "chaser", name: "Chaser", category: G.Finance, description: "Invoice reminders, customers, and who owes what." }, "chaser"),
  { id: "midpage", name: "Midpage", category: G.FilesDocs, url: "https://app.midpage.ai/mcp", description: "Legal research: case law and statutes, with citations." },
  app({ id: "vaquill", name: "Vaquill", category: G.FilesDocs, description: "US statutes, session laws, and citations for legal research." }, "vaquill"),
  app({ id: "taxjar", name: "TaxJar", category: G.Finance, description: "Sales tax rates, calculations, and transactions." }, "taxjar"),
  app({ id: "aiwyn-tax", name: "Aiwyn Tax", category: G.Finance, description: "Estimate federal and state taxes (formerly Column Tax)." }, "aiwyn_tax_mcp"),
  app({ id: "maintainx", name: "MaintainX", category: G.Productivity, description: "Work orders, requests, assets, and locations." }, "maintainx"),
  app({ id: "seam", name: "Seam", category: G.Productivity, description: "Smart locks and access codes for your spaces." }, "seam"),
  app({ id: "route4me", name: "Route4Me", category: G.Productivity, description: "Plan and optimise routes, stops, and orders." }, "route4me"),
  app({ id: "gatherup", name: "GatherUp", category: G.Marketing, description: "Ask customers for feedback and reviews." }, "gatherup"),
  app({ id: "oneup", name: "OneUp", category: G.Social, description: "Schedule posts to your social accounts, and see their results." }, "oneup"),
  app({ id: "mindbody", name: "Mindbody", category: G.Sales, description: "Classes, appointments, clients, and sales for your studio." }, "mindbody"),
  app({ id: "ignav", name: "Ignav", category: G.Productivity, description: "Search flights and fares, and get links to book them." }, "ignav_flights"),
  app({ id: "tripadvisor", name: "Tripadvisor", category: G.Productivity, description: "Hotels, restaurants, and things to do, with reviews and photos." }, "tripadvisor"),
];

export const VENDOR_MCP_CONNECTORS: readonly VendorMcpConnector[] = VENDOR_MCP_PLACES.filter(isConnector);

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
  const index = VENDOR_MCP_PLACES.findIndex((item) => isConnector(item) && item.id === pluginId.trim());
  return index < 0 ? undefined : String(VENDOR_MCP_SERVER_ID_BASE + index + 1);
}

export function vendorMcpPluginIdForServerId(serverId: string | number): string | undefined {
  const numeric = typeof serverId === "number" ? serverId : Number(String(serverId).trim());
  if (!Number.isSafeInteger(numeric)) return undefined;
  const place = VENDOR_MCP_PLACES[numeric - VENDOR_MCP_SERVER_ID_BASE - 1];
  return place != null && isConnector(place) ? place.id : undefined;
}

/** How many places the list has, the retired ones included: the next server id is the base plus this plus one. */
export const VENDOR_MCP_PLACE_COUNT = VENDOR_MCP_PLACES.length;
