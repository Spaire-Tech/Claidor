// What the harness shows the renderer. Nothing here reaches a server: the
// fake bridge and the fake coordinator answer every call from these values.
//
// Agent rows carry every field the shipped roster store checks when it
// restores a persisted roster (`strictPersistedAgent`), so the same rows
// are valid whichever path reads them.

// "Now" is the moment the pictures are taken, so the sidebar's relative times read the same on any day.
const NOW = Date.now();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

function agent(id, name, description, extra) {
  return {
    id,
    name,
    description,
    path: `/Users/bass/Caisra/${id}`,
    createdAt: NOW - 12 * DAY,
    updatedAt: NOW - 5 * MIN,
    hasUnread: false,
    notificationsEnabled: true,
    notifyOnUpdatesEnabled: true,
    isGroup: false,
    origin: "user",
    lastMessageId: `${id}-last`,
    lastEntry: null,
    awaitingUserResponse: null,
    memberIds: [],
    conversationPartnerIds: [],
    avatarDataUrl: null,
    avatarVersion: null,
    isRunning: false,
    currentActivity: null,
    ...extra,
  };
}

export const agents = [
  agent("juno", "Juno", "Documents and decks. Practical, quick.", {
    avatarColor: "blue", avatarShape: "blob",
    updatedAt: NOW - 3 * MIN,
    lastEntry: { kind: "text", text: "Already pulled it. 24 slides, two of them have numbers that don't match the model." },
    hasUnread: true,
  }),
  agent("mira", "Mira", "Inbox triage and cleanup. Terse, factual.", {
    avatarColor: "cyan", avatarShape: "pebble",
    updatedAt: NOW - 7 * HOUR,
    lastEntry: { kind: "text", text: "Left anything with a person's name on it. 14 need you." },
  }),
  agent("perrin", "Perrin", "Connectors, integrations and browser automation.", {
    avatarColor: "orange", avatarShape: "cloud",
    updatedAt: NOW - 3 * DAY,
    isRunning: true,
    currentActivity: { kind: "tool", tool: "WebSearch", verb: "searching" },
    lastEntry: { kind: "text", text: "On it — finding the newest Excel file on that computer." },
  }),
  agent("sable", "Sable", "Filing, naming and where things live. Calm, orderly.", {
    avatarColor: "magenta", avatarShape: "teardrop",
    updatedAt: NOW - 4 * DAY,
    lastEntry: { kind: "attachment", count: 3, kinds: { pdf: 1, xlsx: 1, docx: 1 } },
  }),
  agent("board-pack", "Board pack", "Juno, Mira and Sable on the Q4 pack.", {
    avatarColor: "green", avatarShape: "hex",
    isGroup: true,
    memberIds: ["juno", "mira", "sable"],
    updatedAt: NOW - 6 * DAY,
    lastEntry: { kind: "text", text: "Sable: Filed under Board / 2026, old version kept beside it as v1." },
  }),
];

let seq = 0;
function message(role, content, minutesAgo, extra) {
  seq += 1;
  return { id: `m-${seq}`, kind: "message", role, content, timestampMs: NOW - minutesAgo * MIN, ...extra };
}

export const transcripts = {
  perrin: [
    message("user", "so you actually understand what i'm doing", 4 * 24 * 60 + 40),
    message("assistant", "Yes — it doesn't just \"remember the vibe.\" When you teach me a task, I turn it into a clear recipe: what to watch for, which steps to take, what \"done\" looks like. Next time I follow that, not improvise from a blurry memory.", 4 * 24 * 60 + 39),
    message("assistant", "Best way to teach me is walk through it once (say what you're doing, or screen-record a demo). I watch the flow, ask only if something's ambiguous, then save it so I can run it again. Want to try with a small task you do often?", 4 * 24 * 60 + 39),
    message("user", "i will later on.", 4 * 24 * 60 + 20),
    message("assistant", "Sounds good — whenever you're ready.", 4 * 24 * 60 + 19),
    message("user", "what can you do for me if i add linkedin?", 3 * 24 * 60 + 10),
    message("assistant", "There's no full LinkedIn connector (DMs, feed, profile edits) in the catalog right now. Closest add-on is Postiz, which is mainly for scheduling and posting to LinkedIn (and other networks).", 3 * 24 * 60 + 9),
    message("assistant", "Without that, I can still help via the site in my browser once you're signed in, and I already see LinkedIn noise through Gmail. What did you want LinkedIn for — posting, outreach, or inbox triage?", 3 * 24 * 60 + 9),
    message("user", "can you access my computer?", 15),
    message("assistant", "Yes — if that computer is registered with Caisra, I can use it when a task needs it, and you'll get an approval prompt first. I don't have always-on access; it's per action, with your okay.", 14),
    message("user", "check my most recent excel file", 6),
    { id: "n-1", kind: "notice", content: "Perrin can run commands on your computer from now on.", timestampMs: NOW - 5 * MIN },
    message("assistant", "On it — finding the newest Excel file on that computer.", 5),
  ],
  juno: [
    message("user", "can you read the board deck before the call", 30),
    message("assistant", "Already pulled it. 24 slides, two of them have numbers that don't match the model — want me to flag those now or in a note after?", 28),
  ],
  mira: [
    message("user", "inbox is unusable, do something", 7 * 60 + 2),
    message("assistant", "Cleared ~499 promotional threads.", 7 * 60),
    message("assistant", "Left anything with a person's name on it. 14 need you — I put them at the top.", 7 * 60),
  ],
  sable: [
    message("user", "where did the q4 deck end up", 4 * 24 * 60),
    message("assistant", "Filed the Q4 deck under Board / 2026. Kept the old version beside it as v1 so nothing got overwritten.", 4 * 24 * 60 - 1),
  ],
  "board-pack": [
    message("user", "send me the whole pack", 6 * 24 * 60),
    message("assistant", "Here it is — deck, model and the memo that went out with them.", 6 * 24 * 60 - 1),
  ],
};

export const account = {
  kind: "logged-in",
  authId: "bass",
  email: "bass@spairehq.com",
  displayName: "Bass Fall",
};

export const usageSummary = {
  isEnterprise: false,
  sandUsagePercent: 74,
  sandUsageResetTimestampMs: NOW + 6 * DAY,
  hasAvailableUsage: true,
  isSandTrial: true,
  hasEndedSandTrial: false,
  hasNonZeroIncludedLimit: true,
  canCancelSandTrial: true,
  onDemand: null,
  upgradeCta: { label: "Upgrade to Pro", disabled: false, action: { kind: "open-url", url: "https://app.claidor.com/upgrade" } },
};

export const updateStatus = {
  state: { type: "idle", lastCheck: { at: NOW - 40 * MIN, result: "up-to-date" } },
  currentVersion: "0.18.0",
  currentTrack: "stable",
  trackOverride: null,
  buildDefaultTrack: "stable",
  availableTracks: ["stable", "nightly"],
  isTrackManagedByPolicy: false,
  isBelowMinimumVersion: false,
  autoUpdateWhenIdleOptIn: false,
  autoUpdateWhenIdleGateEnabled: true,
};

export const mcpCatalog = [
  { id: "gmail", name: "gmail", displayName: "Gmail", description: "Read, search and draft in the inbox.", category: "Mail & Calendar", connectors: [], skills: [] },
  { id: "google-calendar", name: "google-calendar", displayName: "Google Calendar", description: "Events, invites and free time.", category: "Mail & Calendar", connectors: [], skills: [] },
  { id: "slack", name: "slack", displayName: "Slack", description: "Channels, threads and mentions.", category: "Messaging", connectors: [], skills: [] },
  { id: "google-drive", name: "google-drive", displayName: "Google Drive", description: "Files, folders and sharing.", category: "Files & Docs", connectors: [], skills: [] },
  { id: "notion", name: "notion", displayName: "Notion", description: "Pages and databases.", category: "Files & Docs", connectors: [], skills: [] },
  { id: "github", name: "github", displayName: "GitHub", description: "Repositories, issues and pull requests.", category: "Developer", connectors: [], skills: [] },
];

export const mcpServers = [
  { id: "gmail", name: "Gmail", serverIdentifier: "gmail", accountKey: "bass@spairehq.com", rowServerIdentifier: "gmail", transport: "http", url: "https://mcp.claidor.com/gmail", toolCount: 12, customInstructions: "", isTeamServer: false, pluginId: "gmail", status: "connected" },
  { id: "github", name: "GitHub", serverIdentifier: "github", accountKey: "basszurich-cyber", rowServerIdentifier: "github", transport: "http", url: "https://mcp.claidor.com/github", toolCount: 31, customInstructions: "", isTeamServer: false, pluginId: "github", status: "needsAuth" },
];

export const scenarios = {
  light: { theme: { preference: "light", resolved: "light" } },
  dark: { theme: { preference: "dark", resolved: "dark" } },
};

export function fixturesFor(scenario = "light", activeAgentId = "perrin") {
  const picked = scenarios[scenario] ?? scenarios.light;
  return {
    now: NOW,
    theme: picked.theme,
    account,
    usageSummary,
    updateStatus,
    agents,
    transcripts,
    mcpCatalog,
    mcpServers,
    activeAgentId,
  };
}
