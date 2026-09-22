/**
 * The forty-three connectors Composio actually carries for Simeon.
 *
 * Cut on 16 September 2026: every card is a Connect button. Slugs were
 * checked against composio.dev/toolkits/<slug> (200). Fathom and Mercury
 * stayed off this list because they had no verified slug.
 */
export const COMPOSIO_GROUP = {
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

export type ComposioGroup = (typeof COMPOSIO_GROUP)[keyof typeof COMPOSIO_GROUP];

export interface ComposioConnector {
  readonly id: string;
  readonly name: string;
  readonly toolkit: string;
  readonly category: ComposioGroup;
  readonly description: string;
}

const G = COMPOSIO_GROUP;

export const COMPOSIO_CONNECTORS: readonly ComposioConnector[] = [
  { id: "gmail", name: "Gmail", toolkit: "gmail", category: G.MailCalendar, description: "Search, read, draft, and manage email." },
  { id: "outlook", name: "Outlook", toolkit: "outlook", category: G.MailCalendar, description: "Mail and Microsoft 365 calendar." },
  { id: "google-calendar", name: "Google Calendar", toolkit: "googlecalendar", category: G.MailCalendar, description: "Search events and schedule meetings." },
  { id: "google-drive", name: "Google Drive", toolkit: "googledrive", category: G.FilesDocs, description: "Search, read, create, and share files." },
  { id: "google-docs", name: "Google Docs", toolkit: "googledocs", category: G.FilesDocs, description: "Read and write documents." },
  { id: "google-sheets", name: "Google Sheets", toolkit: "googlesheets", category: G.FilesDocs, description: "Read and write spreadsheets." },
  { id: "google-slides", name: "Google Slides", toolkit: "googleslides", category: G.FilesDocs, description: "Read and build presentations." },
  { id: "onedrive", name: "OneDrive", toolkit: "one_drive", category: G.FilesDocs, description: "Files in Microsoft 365." },
  { id: "dropbox", name: "Dropbox", toolkit: "dropbox", category: G.FilesDocs, description: "Search, read, and organise files." },
  { id: "notion", name: "Notion", toolkit: "notion", category: G.FilesDocs, description: "Search, read, and write pages and databases." },
  { id: "todoist", name: "Todoist", toolkit: "todoist", category: G.Productivity, description: "Create, find, and complete tasks and projects." },
  { id: "google-tasks", name: "Google Tasks", toolkit: "googletasks", category: G.Productivity, description: "Tasks and lists in Google." },
  { id: "trello", name: "Trello", toolkit: "trello", category: G.Productivity, description: "Boards, lists, and cards." },
  { id: "asana", name: "Asana", toolkit: "asana", category: G.Productivity, description: "Search and update tasks and projects." },
  { id: "airtable", name: "Airtable", toolkit: "airtable", category: G.Productivity, description: "Query and update bases, tables, and records." },
  { id: "zoom", name: "Zoom", toolkit: "zoom", category: G.Meetings, description: "Search meetings, pull transcripts, and work with Zoom Docs." },
  { id: "google-meet", name: "Google Meet", toolkit: "googlemeet", category: G.Meetings, description: "Meetings and recordings in Google." },
  { id: "canva", name: "Canva", toolkit: "canva", category: G.Creativity, description: "Create and edit designs." },
  { id: "figma", name: "Figma", toolkit: "figma", category: G.Creativity, description: "Read files, frames, and design context." },
  { id: "miro", name: "Miro", toolkit: "miro", category: G.Creativity, description: "Read and build boards." },
  { id: "stripe", name: "Stripe", toolkit: "stripe", category: G.Finance, description: "Customers, payments, subscriptions, and invoices." },
  { id: "paypal", name: "PayPal", toolkit: "paypal", category: G.Finance, description: "Invoices, orders, and transactions." },
  { id: "quickbooks", name: "QuickBooks", toolkit: "quickbooks", category: G.Finance, description: "Books, invoices, and expenses." },
  { id: "xero", name: "Xero", toolkit: "xero", category: G.Finance, description: "Read and write invoices, contacts, reports, and payroll." },
  { id: "shopify", name: "Shopify", toolkit: "shopify", category: G.Finance, description: "Orders, products, customers, and your store." },
  { id: "brex", name: "Brex", toolkit: "brex", category: G.Finance, description: "Query expenses, receipts, bills, cards, and travel." },
  { id: "ramp", name: "Ramp", toolkit: "ramp", category: G.Finance, description: "Expenses, cards, bills, and reimbursements." },
  { id: "hubspot", name: "HubSpot", toolkit: "hubspot", category: G.Sales, description: "Search and update contacts, companies, deals, and tickets." },
  { id: "salesforce", name: "Salesforce", toolkit: "salesforce", category: G.Sales, description: "Leads, accounts, opportunities, and cases." },
  { id: "pipedrive", name: "Pipedrive", toolkit: "pipedrive", category: G.Sales, description: "Deals, people, and the pipeline." },
  { id: "intercom", name: "Intercom", toolkit: "intercom", category: G.Sales, description: "Search conversations, contacts, and Help Center articles." },
  { id: "docusign", name: "Docusign", toolkit: "docusign", category: G.Sales, description: "Manage envelopes, templates, workflows, and agreements." },
  { id: "github", name: "GitHub", toolkit: "github", category: G.Developer, description: "Manage repos, issues, pull requests, and Actions." },
  { id: "linear", name: "Linear", toolkit: "linear", category: G.Developer, description: "Issues, projects, and cycles." },
  { id: "jira", name: "Jira", toolkit: "jira", category: G.Developer, description: "Jira and Confluence, through Atlassian." },
  { id: "supabase", name: "Supabase", toolkit: "supabase", category: G.Developer, description: "Projects, tables, and SQL." },
  { id: "vercel", name: "Vercel", toolkit: "vercel", category: G.Developer, description: "Projects, deployments, and logs." },
  { id: "mailchimp", name: "Mailchimp", toolkit: "mailchimp", category: G.Marketing, description: "Audiences, campaigns, and automations." },
  { id: "klaviyo", name: "Klaviyo", toolkit: "klaviyo", category: G.Marketing, description: "Manage profiles, segments, campaigns, and flows." },
  { id: "greenhouse", name: "Greenhouse", toolkit: "greenhouse", category: G.Hiring, description: "Jobs, candidates, applications, and scorecards." },
  { id: "ashby", name: "Ashby", toolkit: "ashby", category: G.Hiring, description: "Search candidates, prep interviews, and manage pipeline tasks." },
  { id: "gusto", name: "Gusto", toolkit: "gusto", category: G.Hiring, description: "Payroll, people, and time off." },
  { id: "linkedin", name: "LinkedIn", toolkit: "linkedin", category: G.Social, description: "Post to LinkedIn and read your own profile. Not the feed or messages." },
];

const byId = new Map(COMPOSIO_CONNECTORS.map((item) => [item.id, item]));
const byToolkit = new Map(COMPOSIO_CONNECTORS.map((item) => [item.toolkit, item]));

export function composioConnectorById(id: string): ComposioConnector | undefined {
  return byId.get(id.trim());
}

export function composioConnectorByToolkit(toolkit: string): ComposioConnector | undefined {
  return byToolkit.get(toolkit.trim().toLowerCase());
}

export function isComposioPluginId(id: string): boolean {
  return composioConnectorById(id) != null;
}
