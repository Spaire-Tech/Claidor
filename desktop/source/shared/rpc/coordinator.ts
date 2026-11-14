/**
 * What the coordinator can be asked. The table at the end names every method
 * it serves, with what the method takes and the shape of what it answers; a
 * method that is not in the table is refused. Above it are the two transcript
 * calls, a window of an agent's transcript and one thread of it, with the
 * checks both ends make of what is asked and what is answered.
 */

/** One entry of a transcript: which one it is and of what kind. What else it holds is its kind's own. */
export interface CoordinatorTranscriptEntry {
  readonly id: string;
  readonly kind: string;
  readonly [key: string]: unknown;
}

/** Asks for a window of the transcript of agent `id`: `limit` entries, those before the place `beforeSeq` when it is given. */
export interface CoordinatorTranscriptWindowRequest {
  readonly id: string;
  readonly beforeSeq?: number;
  readonly limit?: number;
}

/**
 * A window: its entries, the place to ask before for the entries earlier
 * than these (when there are any), and a count for each thread in it, under
 * the thread's root.
 */
export interface CoordinatorTranscriptWindowResponse {
  readonly entries: readonly CoordinatorTranscriptEntry[];
  readonly nextBeforeSeq?: number;
  readonly threadCounts: Readonly<Record<string, number>>;
}

/** Asks for the thread under entry `rootId` in the transcript of agent `id`. */
export interface CoordinatorAgentThreadRequest {
  readonly id: string;
  readonly rootId: string;
}

export interface CoordinatorAgentThreadResponse {
  readonly entries: readonly CoordinatorTranscriptEntry[];
}

/** Something with fields: an object that is not a list. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isWholeNumber(value: unknown): value is number {
  return Number.isInteger(value);
}

function isTranscriptEntry(value: unknown): value is CoordinatorTranscriptEntry {
  return isRecord(value)
    && typeof value.id === "string"
    && value.id !== ""
    && typeof value.kind === "string"
    && value.kind !== "";
}

/** Whether a record's `entries` is a list of transcript entries. A gap in the list is not looked at. */
function holdsEntries(value: Record<string, unknown>): value is Record<string, unknown> & { entries: CoordinatorTranscriptEntry[] } {
  return Array.isArray(value.entries) && value.entries.every(isTranscriptEntry);
}

/**
 * The counts of a window, copied into an object of our own. Null when a
 * count is not a number or stands under no name.
 */
function countsOf(given: Record<string, unknown>): Record<string, number> | null {
  const counts: Record<string, number> = {};
  for (const [rootId, count] of Object.entries(given)) {
    if (rootId === "" || !isFiniteNumber(count)) return null;
    counts[rootId] = count;
  }
  return counts;
}

/**
 * A window as it was answered, or null when it is not one. The entries are
 * handed back as the list they came in; what the answer held besides its
 * three fields is dropped.
 */
export function parseCoordinatorTranscriptWindowResponse(value: unknown): CoordinatorTranscriptWindowResponse | null {
  if (!isRecord(value) || !holdsEntries(value) || !isRecord(value.threadCounts)) return null;
  const threadCounts = countsOf(value.threadCounts);
  if (threadCounts === null) return null;
  if (value.nextBeforeSeq !== undefined && !isFiniteNumber(value.nextBeforeSeq)) return null;
  const entries = value.entries;
  if (value.nextBeforeSeq === undefined) return { entries, threadCounts };
  return { entries, nextBeforeSeq: value.nextBeforeSeq, threadCounts };
}

/**
 * A request for a window, or null when it is not one: it needs an id, the
 * place to read before must be a whole number, and the limit a number.
 */
export function parseCoordinatorTranscriptWindowRequest(value: unknown): CoordinatorTranscriptWindowRequest | null {
  if (!isRecord(value)) return null;
  const { id, beforeSeq, limit } = value;
  if (typeof id !== "string" || id === "") return null;
  if (beforeSeq !== undefined && !isWholeNumber(beforeSeq)) return null;
  if (limit !== undefined && !isFiniteNumber(limit)) return null;
  const request: { id: string; beforeSeq?: number; limit?: number } = { id };
  if (beforeSeq !== undefined) request.beforeSeq = beforeSeq;
  if (limit !== undefined) request.limit = limit;
  return request;
}

/** A thread as it was answered, or null when it is not one. The entries are handed back as the list they came in. */
export function parseCoordinatorAgentThreadResponse(value: unknown): CoordinatorAgentThreadResponse | null {
  if (!isRecord(value) || !holdsEntries(value)) return null;
  return { entries: value.entries };
}

/** A request for a thread, or null when it is not one: it needs an id and a root. */
export function parseCoordinatorAgentThreadRequest(value: unknown): CoordinatorAgentThreadRequest | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || value.id === "") return null;
  if (typeof value.rootId !== "string" || value.rootId === "") return null;
  return { id: value.id, rootId: value.rootId };
}

/** The replies that are read through before they are handed on: what reads each, and what is said when it cannot. */
const CHECKED_REPLIES = new Map<string, { readonly read: (value: unknown) => unknown; readonly refusal: string }>([
  ["getAgentTranscriptWindow", {
    read: parseCoordinatorTranscriptWindowResponse,
    refusal: "getAgentTranscriptWindow returned a malformed transcript window",
  }],
  ["getAgentThread", {
    read: parseCoordinatorAgentThreadResponse,
    refusal: "getAgentThread returned a malformed agent thread",
  }],
]);

/**
 * A method's reply, as it came, once it has been read through. Only the two
 * transcript calls are checked; any other method's reply passes as it is.
 */
export function validateCoordinatorReply(method: string, value: unknown): unknown {
  const check = CHECKED_REPLIES.get(method);
  if (check !== undefined && check.read(value) === null) throw new Error(check.refusal);
  return value;
}

/**
 * Every method the coordinator serves. `args` says whether the method takes
 * an object or nothing; `reply` names the shape of its answer. The order of
 * the rows is the order the methods are listed in wherever the table is
 * walked.
 */
export const COORDINATOR_METHOD_TABLE = {
  getAgentTranscriptWindow: { args: "object", reply: "transcript-window" },
  getAgentThread: { args: "object", reply: "agent-thread" },
  getAgentTranscriptTail: { args: "object", reply: "transcript-page" },
  openAgentTail: { args: "object", reply: "transcript-page" },
  sendPrompt: { args: "object", reply: "send-result" },
  promptAcceptanceStatus: { args: "object", reply: "acceptance-lookup" },
  respondToWidget: { args: "object", reply: "record-or-null" },
  resolveAutoReviewApproval: { args: "object", reply: "void" },
  resolveLocalToolPermission: { args: "object", reply: "void" },
  dismissWidget: { args: "object", reply: "record" },
  submitSecret: { args: "object", reply: "void" },
  reactToMessage: { args: "object", reply: "void" },
  sendDraft: { args: "object", reply: "record-or-null" },
  discardDraft: { args: "object", reply: "record-or-null" },
  // Allow and Deny on the checkout card (`purchase-cards.ts`, 13 October 2026).
  answerPurchase: { args: "object", reply: "record-or-null" },
  // Buy on the products card (`purchase-cards.ts`, 14 October 2026).
  buyProduct: { args: "object", reply: "record-or-null" },
  // A flight booking (`flight-bookings.ts`, 13 October 2026). Answers `{ ok, entryId }`, or `{ ok: false, message }`.
  startFlightBooking: { args: "object", reply: "record" },
  submitFlightPassengers: { args: "object", reply: "record" },
  // The form in the chat (`user-forms.ts`, 28 October 2026). Submitting answers `{ ok }`, or
  // `{ ok: false, message, field? }`; dismissing answers `{ accepted }`.
  submitUserForm: { args: "object", reply: "record" },
  dismissUserForm: { args: "object", reply: "record" },
  // The 1Password cards (`onepassword-cards.ts`, 28 October 2026).
  answerCredentialRequest: { args: "object", reply: "record" },
  connectOnePassword: { args: "object", reply: "record" },
  dismissOnePasswordConnect: { args: "object", reply: "record" },
  // The card of the Credentials Store (`store-cards.ts`, 9 November 2026). Answers `{ accepted }`.
  answerStoreEntry: { args: "object", reply: "record" },
  appendConnectorCard: { args: "object", reply: "void" },
  appendSendMessage: { args: "object", reply: "record" },
  // The voice channel (1 October 2026): this one method opens a call, relays to it, reads it and ends it.
  voiceCall: { args: "object", reply: "record" },
  searchPlugins: { args: "object", reply: "string" },
  getPlugin: { args: "object", reply: "string" },
  installPlugin: { args: "object", reply: "string" },
  listAgents: { args: "none", reply: "array" },
  countAgents: { args: "none", reply: "count" },
  searchAgents: { args: "object", reply: "array" },
  searchMedia: { args: "object", reply: "array" },
  createAgent: { args: "object", reply: "record" },
  createGroup: { args: "object", reply: "record" },
  setGroupMembers: { args: "object", reply: "record-or-null" },
  updateAgent: { args: "object", reply: "record-or-null" },
  deleteAgents: { args: "object", reply: "record" },
  duplicateAgent: { args: "object", reply: "record" },
  kickstartAgent: { args: "object", reply: "record-or-null" },
  // Reads the person's name again from the server, for the first run (29 October 2026). Answers `{ name }`.
  refreshUserName: { args: "none", reply: "record" },
  requestDiskSaverAudit: { args: "object", reply: "record-or-null" },
  broadcastToAgents: { args: "object", reply: "record" },
  getCloudAgentInfo: { args: "object", reply: "record-or-null" },
  getCloudAgentConversation: { args: "object", reply: "record-or-null" },
  // The sign-in on the computer behind the chat's Connect GitHub card (`cloud-agents/coding-github.ts`,
  // 11 November 2026).
  getGitHubSignIn: { args: "none", reply: "record" },
  getCursorSignIn: { args: "none", reply: "record" },
  startCursorSignIn: { args: "none", reply: "record" },
  signOutCursor: { args: "none", reply: "record" },
  getListenerIntegrations: { args: "none", reply: "record" },
  getListenerConnectUrl: { args: "object", reply: "connect-url" },
  setAgentUnread: { args: "object", reply: "void" },
  setAgentHiddenFromSidebar: { args: "object", reply: "void" },
  setAgentNotificationsEnabled: { args: "object", reply: "void" },
  setAgentNotifyOnUpdates: { args: "object", reply: "void" },
  setAgentAvatarBytes: { args: "object", reply: "record-or-null" },
  getAgentAvatar: { args: "object", reply: "record" },
  getAgentWorkflows: { args: "object", reply: "array" },
  createAgentWorkflow: { args: "object", reply: "array" },
  updateAgentWorkflow: { args: "object", reply: "array" },
  setAgentWorkflowEnabled: { args: "object", reply: "array" },
  deleteAgentWorkflow: { args: "object", reply: "array" },
  runAgentWorkflowNow: { args: "object", reply: "void" },
  importAgentWorkflowText: { args: "object", reply: "import-result" },
  importAgentWorkflowUrl: { args: "object", reply: "import-result" },
  portAgentLocalSkills: { args: "object", reply: "import-result" },
  getConversationOutline: { args: "object", reply: "array" },
  skillsCatalog: { args: "none", reply: "array" },
  syncPluginSkills: { args: "none", reply: "array" },
  getPluginSyncStatus: { args: "none", reply: "record" },
  listRoutedMcpTools: { args: "none", reply: "array" },
  executeRoutedMcpTool: { args: "object", reply: "record" },
  executeRoutedAgentTool: { args: "object", reply: "record" },
  getSkillPublishTargets: { args: "none", reply: "record" },
  publishSkill: { args: "object", reply: "record" },
  resyncPublishedSkill: { args: "object", reply: "record" },
  unpublishSkill: { args: "object", reply: "record" },
  getSubagents: { args: "object", reply: "array" },
  getAsyncTasks: { args: "object", reply: "array" },
  getForeverBoxStatus: { args: "object", reply: "box-status" },
  ensureForeverBox: { args: "object", reply: "box-status" },
  handBackForeverBox: { args: "object", reply: "void" },
  startTeachRecording: { args: "object", reply: "record" },
  stopTeachRecording: { args: "object", reply: "record" },
  getTeachRecordingStatus: { args: "none", reply: "record" },
  getTrays: { args: "none", reply: "array" },
  dismissTray: { args: "object", reply: "void" },
  clearTrays: { args: "none", reply: "void" },
  getAgentChannels: { args: "object", reply: "channels-view" },
  connectChannel: { args: "object", reply: "channels-view" },
  disconnectChannel: { args: "object", reply: "channels-view" },
  refreshChannel: { args: "object", reply: "channels-view" },
  getBoxSecretsStatus: { args: "none", reply: "box-secrets" },
  getAgentAutomations: { args: "object", reply: "array" },
  // The host's memory commands. The Mac has reached them since 25 September 2026 (design-audit-ledger.md,
  // F-064); whether the pinned window calls them was never measured.
  getAgentMemories: { args: "object", reply: "array" },
  deleteAgentMemory: { args: "object", reply: "boolean" },
  clearAgentMemories: { args: "object", reply: "void" },
  listAllAutomations: { args: "none", reply: "array" },
  isAgentNetworkEnabled: { args: "none", reply: "boolean" },
  isGlobalSearchEnabled: { args: "none", reply: "boolean" },
  isEgressTunnelAvailable: { args: "none", reply: "boolean" },
  getSharingState: { args: "none", reply: "record" },
  createRoomFromAgent: { args: "object", reply: "record" },
  createRoomInvite: { args: "object", reply: "record" },
  joinSharedRoom: { args: "object", reply: "record" },
  respondToRoomJoinRequest: { args: "object", reply: "record" },
  createSharedRoom: { args: "object", reply: "record" },
  addOwnAgentToSharedRoom: { args: "object", reply: "record" },
  removeOwnAgentFromSharedRoom: { args: "object", reply: "record" },
  setSharedRoomTyping: { args: "object", reply: "void" },
  leaveSharedRoom: { args: "object", reply: "record" },
  setAgentAutomationEnabled: { args: "object", reply: "array" },
  createAgentAutomation: { args: "object", reply: "array" },
  updateAgentAutomation: { args: "object", reply: "array" },
  deleteAgentAutomation: { args: "object", reply: "array" },
  runAgentAutomationNow: { args: "object", reply: "void" },
} as const;

export type CoordinatorMethod = keyof typeof COORDINATOR_METHOD_TABLE;

export function isCoordinatorMethod(name: string): name is CoordinatorMethod {
  return Object.hasOwn(COORDINATOR_METHOD_TABLE, name);
}
