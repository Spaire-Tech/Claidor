export const COORDINATOR_MAIN_METHOD_TABLE = {
  uploadAttachment: { args: "object" },
  readAttachmentImage: { args: "object" },
  readAttachmentText: { args: "object" },
  readAttachmentChunk: { args: "object" },
  getHostSettings: { args: "none" },
  setHostSettings: { args: "object" },
  setBoxSecrets: { args: "object" },
  refreshMcp: { args: "object" },
  listBoxMcpServers: { args: "object" },
  updateForeverBox: { args: "object" },
  setWindowFocused: { args: "object" },
  getHostStatus: { args: "none" },
  listAgents: { args: "none" },
  createAgent: { args: "object" },
  deleteAgents: { args: "object" },
  getConversationOutline: { args: "object" },
  getSubagents: { args: "object" },
  setDevGatewayOffline: { args: "object" },
  setGatewayPaused: { args: "object" },
  // Voice calls (30 September 2026): the call banner hands work to the
  // agent as a typed message, reads its recent chat and its replies, keeps
  // its voice in its profile, and leaves the call's record in its chat.
  sendPrompt: { args: "object" },
  getAgentTranscriptTail: { args: "object" },
  updateAgent: { args: "object" },
  appendSendMessage: { args: "object" }
} as const;

export type CoordinatorMainMethod = keyof typeof COORDINATOR_MAIN_METHOD_TABLE;

export function isCoordinatorMainMethod(name: string): name is CoordinatorMainMethod {
  return Object.hasOwn(COORDINATOR_MAIN_METHOD_TABLE, name);
}

