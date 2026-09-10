/**
 * The connections catalogue (docs/maties/onboarding.md, screens 4 and 5,
 * « In the workspace »): the six ways to reach the assistant and the
 * sixty-five services in eleven groups, as the founder listed them. One
 * catalogue, shown in the onboarding and in Skills & Connectors.
 *
 * Every entry knows what it is (`kind`), so every card can do something
 * honest. « Connected » is never stored here: the renderer reads it from
 * the app's real state (an MCP server installed, a channel configured).
 *
 * Titles, notes and tag lines are i18n keys resolved by the renderer; the
 * names are product names and stay literal.
 */
import { assistantEmailFor } from '../onboarding/constants';
import type { Platform } from '../platform/constants';

/** Where a logo file lives; `logo` is a file name under it. */
export const APP_LOGO_DIRECTORY = 'logos/apps';

export const ConnectionKind = {
  /** One of the servers in Claidor's MCP catalogue: Connect opens the install form. */
  Mcp: 'mcp',
  /** A way to reach the assistant; `platformId` when the app offers it today. */
  Channel: 'channel',
  /** No account needed: the assistant uses the person's own browser. */
  Browser: 'browser',
  /** On this computer already. */
  Local: 'local',
  /** Not wired yet: the honest sheet. */
  Soon: 'soon',
} as const;
export type ConnectionKind = typeof ConnectionKind[keyof typeof ConnectionKind];

export const ReachKind = {
  /** The assistant's own address. */
  Address: 'address',
  /** A channel the app offers today (`platformId`). */
  Channel: 'channel',
  /** Not wired yet: the honest sheet. */
  Soon: 'soon',
} as const;
export type ReachKind = typeof ReachKind[keyof typeof ReachKind];

/** The founder's tag lines under a name; the renderer turns them into words. */
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
  Sales: 'sales',
  ShoppingTravel: 'shopping-travel',
  Developer: 'developer',
} as const;
export type ConnectionGroupId = typeof ConnectionGroupId[keyof typeof ConnectionGroupId];

export interface ConnectionGroupDef {
  readonly id: ConnectionGroupId;
  /** i18n key of the group's title. */
  readonly titleKey: string;
  /** i18n key of the founder's note under the title, when there is one. */
  readonly noteKey?: string;
}

interface ConnectionItemBase {
  /** Stable id, unique across the catalogue (stored in `connections.wanted`). */
  readonly id: string;
  /** The product's name, literal. */
  readonly name: string;
  readonly group: ConnectionGroupId;
  readonly tag?: ConnectionTag;
  /** File name under `APP_LOGO_DIRECTORY`; none shows the monogram. */
  readonly logo?: string;
}

export type ConnectionItem = ConnectionItemBase & (
  | { readonly kind: typeof ConnectionKind.Mcp; readonly mcpEntryId: string }
  | { readonly kind: typeof ConnectionKind.Channel; readonly platformId?: Platform }
  | { readonly kind: typeof ConnectionKind.Browser }
  | { readonly kind: typeof ConnectionKind.Local }
  | { readonly kind: typeof ConnectionKind.Soon }
);

export const ReachId = {
  Address: 'reach-address',
  SlackBot: 'reach-slack-bot',
  IMessage: 'reach-imessage',
  WhatsApp: 'reach-whatsapp',
  Telegram: 'reach-telegram',
  Ios: 'reach-ios',
} as const;
export type ReachId = typeof ReachId[keyof typeof ReachId];

interface ReachEntryBase {
  readonly id: ReachId;
  readonly name: string;
  readonly logo?: string;
  /** i18n key of the line under the name (the address card builds its own). */
  readonly lineKey?: string;
  /** i18n key of the button's label when it is not « Connect ». */
  readonly buttonKey?: string;
}

export type ReachEntry = ReachEntryBase & (
  | { readonly kind: typeof ReachKind.Address }
  | { readonly kind: typeof ReachKind.Channel; readonly platformId: Platform }
  | { readonly kind: typeof ReachKind.Soon }
);

/** The six cards of « How to reach {name} », in the founder's order. */
export const REACH_ENTRIES: readonly ReachEntry[] = [
  { id: ReachId.Address, name: 'Gmail', kind: ReachKind.Address, logo: 'gmail.webp' },
  { id: ReachId.SlackBot, name: 'Slack Bot', kind: ReachKind.Soon, lineKey: 'matiesConnectionsReachSlackLine' },
  { id: ReachId.IMessage, name: 'iMessage', kind: ReachKind.Soon, logo: 'imessage.webp', lineKey: 'matiesConnectionsReachImessageLine' },
  { id: ReachId.WhatsApp, name: 'WhatsApp', kind: ReachKind.Soon, logo: 'whatsapp.svg', lineKey: 'matiesConnectionsReachWhatsappLine' },
  { id: ReachId.Telegram, name: 'Telegram', kind: ReachKind.Channel, platformId: 'telegram', logo: 'telegram.svg', lineKey: 'matiesConnectionsReachTelegramLine' },
  { id: ReachId.Ios, name: 'iOS', kind: ReachKind.Soon, logo: 'apple.svg', lineKey: 'matiesConnectionsReachIosLine', buttonKey: 'matiesConnectionsInstall' },
];

/** The eleven groups, in the founder's order. */
export const CONNECTION_GROUPS: readonly ConnectionGroupDef[] = [
  { id: ConnectionGroupId.MailCalendar, titleKey: 'matiesConnectionsGroupMailCalendar' },
  { id: ConnectionGroupId.Messaging, titleKey: 'matiesConnectionsGroupMessaging', noteKey: 'matiesConnectionsGroupMessagingNote' },
  { id: ConnectionGroupId.FilesDocs, titleKey: 'matiesConnectionsGroupFilesDocs' },
  { id: ConnectionGroupId.Productivity, titleKey: 'matiesConnectionsGroupProductivity' },
  { id: ConnectionGroupId.Meetings, titleKey: 'matiesConnectionsGroupMeetings' },
  { id: ConnectionGroupId.Social, titleKey: 'matiesConnectionsGroupSocial', noteKey: 'matiesConnectionsGroupSocialNote' },
  { id: ConnectionGroupId.Creativity, titleKey: 'matiesConnectionsGroupCreativity', noteKey: 'matiesConnectionsGroupCreativityNote' },
  { id: ConnectionGroupId.Finance, titleKey: 'matiesConnectionsGroupFinance', noteKey: 'matiesConnectionsGroupFinanceNote' },
  { id: ConnectionGroupId.Sales, titleKey: 'matiesConnectionsGroupSales' },
  { id: ConnectionGroupId.ShoppingTravel, titleKey: 'matiesConnectionsGroupShoppingTravel', noteKey: 'matiesConnectionsGroupShoppingTravelNote' },
  { id: ConnectionGroupId.Developer, titleKey: 'matiesConnectionsGroupDeveloper' },
];

const G = ConnectionGroupId;
const K = ConnectionKind;

/** The sixty-five items, in the founder's order within each group. */
export const CONNECTION_ITEMS: readonly ConnectionItem[] = [
  // Mail & Calendar
  { id: 'gmail', name: 'Gmail', group: G.MailCalendar, kind: K.Mcp, mcpEntryId: 'gmail', logo: 'gmail.webp' },
  { id: 'outlook', name: 'Outlook', group: G.MailCalendar, kind: K.Soon, logo: 'outlook.webp' },
  { id: 'google-calendar', name: 'Google Calendar', group: G.MailCalendar, kind: K.Mcp, mcpEntryId: 'google-calendar', logo: 'google-calendar.webp' },
  { id: 'apple-calendar', name: 'Apple Calendar', group: G.MailCalendar, kind: K.Local, logo: 'apple-calendar-mac.png' },
  // Messaging
  { id: 'whatsapp', name: 'WhatsApp', group: G.Messaging, kind: K.Channel, logo: 'whatsapp.svg' },
  { id: 'imessage', name: 'iMessage', group: G.Messaging, kind: K.Channel, logo: 'imessage.webp' },
  { id: 'slack', name: 'Slack', group: G.Messaging, kind: K.Mcp, mcpEntryId: 'slack' },
  { id: 'microsoft-teams', name: 'Microsoft Teams', group: G.Messaging, kind: K.Channel },
  { id: 'telegram', name: 'Telegram', group: G.Messaging, kind: K.Channel, platformId: 'telegram', logo: 'telegram.svg' },
  { id: 'discord', name: 'Discord', group: G.Messaging, kind: K.Channel, platformId: 'discord', logo: 'discord.svg' },
  // Files & Docs
  { id: 'google-drive', name: 'Google Drive', group: G.FilesDocs, kind: K.Mcp, mcpEntryId: 'google-drive', logo: 'google-drive.svg' },
  { id: 'google-docs', name: 'Google Docs', group: G.FilesDocs, kind: K.Soon, logo: 'google-docs.svg' },
  { id: 'google-sheets', name: 'Google Sheets', group: G.FilesDocs, kind: K.Soon, logo: 'google-sheets.webp' },
  { id: 'google-slides', name: 'Google Slides', group: G.FilesDocs, kind: K.Soon, logo: 'google-slides.webp' },
  { id: 'onedrive', name: 'OneDrive', group: G.FilesDocs, kind: K.Soon, logo: 'onedrive.jpg' },
  { id: 'word', name: 'Word', group: G.FilesDocs, kind: K.Local, logo: 'word.webp' },
  { id: 'excel', name: 'Excel', group: G.FilesDocs, kind: K.Local, logo: 'excel.webp' },
  { id: 'powerpoint', name: 'PowerPoint', group: G.FilesDocs, kind: K.Local, logo: 'powerpoint.webp' },
  { id: 'dropbox', name: 'Dropbox', group: G.FilesDocs, kind: K.Soon, logo: 'dropbox.svg' },
  { id: 'notion', name: 'Notion', group: G.FilesDocs, kind: K.Mcp, mcpEntryId: 'notion', logo: 'notion.svg' },
  { id: 'apple-notes', name: 'Apple Notes', group: G.FilesDocs, kind: K.Local, logo: 'apple-notes.webp' },
  // Productivity & Tasks
  { id: 'notion-tasks', name: 'Notion', group: G.Productivity, kind: K.Mcp, mcpEntryId: 'notion', logo: 'notion.svg' },
  { id: 'todoist', name: 'Todoist', group: G.Productivity, kind: K.Mcp, mcpEntryId: 'todoist', logo: 'todoist.svg' },
  { id: 'apple-reminders', name: 'Apple Reminders', group: G.Productivity, kind: K.Local, logo: 'apple-reminders.png' },
  { id: 'google-tasks', name: 'Google Tasks', group: G.Productivity, kind: K.Soon, logo: 'googletasks.svg' },
  { id: 'trello', name: 'Trello', group: G.Productivity, kind: K.Soon, logo: 'trello.svg' },
  { id: 'asana', name: 'Asana', group: G.Productivity, kind: K.Soon, logo: 'asana.svg' },
  { id: 'monday', name: 'Monday', group: G.Productivity, kind: K.Soon },
  // Meetings
  { id: 'zoom', name: 'Zoom', group: G.Meetings, kind: K.Soon, logo: 'zoom.webp' },
  { id: 'google-meet', name: 'Google Meet', group: G.Meetings, kind: K.Soon, logo: 'google-meet.webp' },
  { id: 'fathom', name: 'Fathom', group: G.Meetings, kind: K.Soon, logo: 'fathom.jpg' },
  { id: 'otter', name: 'Otter', group: G.Meetings, kind: K.Soon },
  // Social Media
  { id: 'linkedin', name: 'LinkedIn', group: G.Social, kind: K.Browser },
  { id: 'x', name: 'X', group: G.Social, kind: K.Browser, logo: 'x.svg' },
  { id: 'instagram', name: 'Instagram', group: G.Social, kind: K.Browser, logo: 'instagram.svg' },
  { id: 'tiktok', name: 'TikTok', group: G.Social, kind: K.Browser, logo: 'tiktok.svg' },
  { id: 'youtube', name: 'YouTube', group: G.Social, kind: K.Browser, logo: 'youtube.svg' },
  { id: 'facebook', name: 'Facebook', group: G.Social, kind: K.Browser, logo: 'facebook.svg' },
  // Creativity
  { id: 'canva', name: 'Canva', group: G.Creativity, kind: K.Mcp, mcpEntryId: 'canva' },
  { id: 'figma', name: 'Figma', group: G.Creativity, kind: K.Mcp, mcpEntryId: 'figma', logo: 'figma.svg' },
  { id: 'adobe-express', name: 'Adobe Express', group: G.Creativity, kind: K.Soon },
  { id: 'youtube-studio', name: 'YouTube Studio', group: G.Creativity, kind: K.Browser, logo: 'youtubestudio.svg' },
  // Finance & Money
  { id: 'stripe', name: 'Stripe', group: G.Finance, kind: K.Soon, logo: 'stripe.svg' },
  { id: 'paypal', name: 'PayPal', group: G.Finance, kind: K.Soon, logo: 'paypal.svg' },
  { id: 'quickbooks', name: 'QuickBooks', group: G.Finance, kind: K.Soon, logo: 'quickbooks.svg' },
  { id: 'xero', name: 'Xero', group: G.Finance, kind: K.Soon, logo: 'xero.svg' },
  { id: 'shopify', name: 'Shopify', group: G.Finance, kind: K.Soon, logo: 'shopify.svg' },
  { id: 'amazon-seller', name: 'Amazon Seller', group: G.Finance, kind: K.Browser },
  // Sales & Customers
  { id: 'hubspot', name: 'HubSpot', group: G.Sales, kind: K.Soon, logo: 'hubspot.svg' },
  { id: 'salesforce', name: 'Salesforce', group: G.Sales, kind: K.Soon },
  { id: 'pipedrive', name: 'Pipedrive', group: G.Sales, kind: K.Soon },
  { id: 'intercom', name: 'Intercom', group: G.Sales, kind: K.Soon, logo: 'intercom.svg' },
  { id: 'calendly', name: 'Calendly', group: G.Sales, kind: K.Soon, logo: 'calendly.svg' },
  // Shopping & Travel
  { id: 'amazon', name: 'Amazon', group: G.ShoppingTravel, kind: K.Browser, tag: ConnectionTag.ThroughYourBrowser },
  { id: 'google-flights', name: 'Google Flights', group: G.ShoppingTravel, kind: K.Browser, tag: ConnectionTag.ThroughYourBrowser },
  { id: 'airbnb', name: 'Airbnb', group: G.ShoppingTravel, kind: K.Browser, tag: ConnectionTag.ThroughYourBrowser, logo: 'airbnb.svg' },
  { id: 'booking', name: 'Booking', group: G.ShoppingTravel, kind: K.Browser, tag: ConnectionTag.ThroughYourBrowser, logo: 'bookingdotcom.svg' },
  { id: 'opentable', name: 'OpenTable', group: G.ShoppingTravel, kind: K.Browser, tag: ConnectionTag.ThroughYourBrowser },
  { id: 'doordash', name: 'DoorDash', group: G.ShoppingTravel, kind: K.Browser, tag: ConnectionTag.ThroughYourBrowser, logo: 'doordash.svg' },
  // Developer
  { id: 'github', name: 'GitHub', group: G.Developer, kind: K.Mcp, mcpEntryId: 'github', logo: 'github.svg' },
  { id: 'gitlab', name: 'GitLab', group: G.Developer, kind: K.Mcp, mcpEntryId: 'gitlab', logo: 'gitlab.svg' },
  { id: 'linear', name: 'Linear', group: G.Developer, kind: K.Soon, logo: 'linear.svg' },
  { id: 'jira', name: 'Jira', group: G.Developer, kind: K.Soon, logo: 'jira.svg' },
  { id: 'supabase', name: 'Supabase', group: G.Developer, kind: K.Soon, logo: 'supabase.svg' },
  { id: 'vercel', name: 'Vercel', group: G.Developer, kind: K.Soon, logo: 'vercel.svg' },
];

export interface ConnectionGroup extends ConnectionGroupDef {
  readonly items: readonly ConnectionItem[];
}

/** The groups with their items, in order; a group with no items is left out. */
export const getConnectionGroups = (
  items: readonly ConnectionItem[] = CONNECTION_ITEMS,
): ConnectionGroup[] => (
  CONNECTION_GROUPS
    .map((group) => ({ ...group, items: items.filter((item) => item.group === group.id) }))
    .filter((group) => group.items.length > 0)
);

const normalizeQuery = (query: string): string => query.trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * The items matching a search, by name or by group title (the founder's
 * search matched both). `groupTitle` gives the title of a group in the
 * viewer's words; without it only names are searched. An empty query
 * returns everything.
 */
export const searchConnections = (
  query: string,
  groupTitle?: (groupId: ConnectionGroupId) => string,
): ConnectionItem[] => {
  const needle = normalizeQuery(query);
  if (!needle) return [...CONNECTION_ITEMS];
  const matchingGroups = new Set<ConnectionGroupId>();
  if (groupTitle) {
    for (const group of CONNECTION_GROUPS) {
      if (normalizeQuery(groupTitle(group.id)).includes(needle)) matchingGroups.add(group.id);
    }
  }
  return CONNECTION_ITEMS.filter((item) => (
    item.name.toLowerCase().includes(needle) || matchingGroups.has(item.group)
  ));
};

export const findConnection = (id: string): ConnectionItem | undefined => (
  CONNECTION_ITEMS.find((item) => item.id === id)
);

export const findReachEntry = (id: string): ReachEntry | undefined => (
  REACH_ENTRIES.find((entry) => entry.id === id)
);

/** How many connections the catalogue lists (the number beside the title). */
export const countConnections = (): number => CONNECTION_ITEMS.length;

export const countConnectionsByKind = (): Record<ConnectionKind, number> => {
  const counts: Record<ConnectionKind, number> = {
    [ConnectionKind.Mcp]: 0,
    [ConnectionKind.Channel]: 0,
    [ConnectionKind.Browser]: 0,
    [ConnectionKind.Local]: 0,
    [ConnectionKind.Soon]: 0,
  };
  for (const item of CONNECTION_ITEMS) counts[item.kind] += 1;
  return counts;
};

/** Every distinct MCP catalogue id the items point to. */
export const getConnectionMcpEntryIds = (): string[] => (
  [...new Set(CONNECTION_ITEMS.flatMap((item) => (item.kind === ConnectionKind.Mcp ? [item.mcpEntryId] : [])))]
);

/** The address the assistant answers at, for the reach card. */
export const reachAddressFor = (assistantName: string): string => assistantEmailFor(assistantName);

/** The single letter shown in a logo tile when there is no logo file. */
export const connectionMonogram = (name: string): string => (
  name.replace(/[^A-Za-z]/g, '').slice(0, 1).toUpperCase()
);
