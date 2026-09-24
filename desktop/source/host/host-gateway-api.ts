
import {
  parseCoordinatorAgentThreadRequest,
  parseCoordinatorTranscriptWindowRequest,
} from "../shared/rpc/coordinator.js";
import {
  getPluginForGateway,
  installPluginForGateway,
  searchPluginsForGateway,
} from "./host-plugin-gateway.js";
import { executeRoutedAgentTool as runRoutedAgentTool } from "./extensions/transcript/routed-agent-tools.js";

export const HOST_CAPABILITIES = [
  "orderedReplicasV1",
  "sendAcceptanceV1"
] as const;
export const CREATE_AGENT_NONCE_LEDGER_CAP = 64;
export const DISABLE_SEND_ACCEPT_RETURN_ENV = "SAND_DISABLE_SEND_ACCEPT_RETURN";

const SAND_AGENT_PURPOSES = new Set(["disk-saver", "plugin-auth"]);
const TEMPLATE_ID_PATTERN = /^[a-z0-9-]{1,64}$/;

type DynamicMethod = (...args: any[]) => any;
export type DynamicGatewayApi = Record<string, any>;

export interface HostGatewayDependencies {
  readonly extensions: {
    api(id: string): DynamicGatewayApi;
  };
  readonly hostEvents: {
    emit(event: unknown): unknown;
  };
  readonly rosterBookkeeping?: {
    readonly latestActiveAgentId: string | null;
  };
  decorateForeverBoxStatus(status: any): any;
  getHealth(): { readonly isBusy: boolean };
  kickstartIfPending(agentId: string): Promise<boolean>;
  requestDiskSaverAudit(agentId: string): Promise<boolean>;
  releaseAgentBox(agentId: string): Promise<void>;
  handleDesktopMcpAuthCompletion(completion: unknown): Promise<void>;
  forgetLocalToolPermission(agentId: string): void;
  readonly now?: () => number;
}

function isSandAgentPurpose(value: unknown): value is string {
  return typeof value === "string" && SAND_AGENT_PURPOSES.has(value);
}

function sanitizeTemplateId(value: unknown): string | undefined {
  return typeof value === "string" && TEMPLATE_ID_PATTERN.test(value)
    ? value
    : undefined;
}

function method(api: DynamicGatewayApi, name: string): DynamicMethod {
  const candidate = api[name];
  if (typeof candidate !== "function") {
    throw new Error(`host extension method is unavailable: ${name}`);
  }
  return candidate.bind(api);
}

/**
 * Restores the shipped gateway method table. Each method delegates to the
 * extension that owned the behavior in the artifact; the host layer retains
 * cross-cutting nonce dedupe, telemetry, cleanup, feature gates, and status
 * decoration.
 */
export function createHostGatewayApi(
  deps: HostGatewayDependencies
): Record<string, DynamicMethod> {
  const manager = deps.extensions.api("transcript");
  const attachments = deps.extensions.api("attachments");
  const automations = deps.extensions.api("automations");
  const managedSetup = deps.extensions.api("managed-setup");
  const settings = deps.extensions.api("settings");
  const localToolPermission = deps.extensions.api("local-tool-permission");
  const telemetry = deps.extensions.api("telemetry");
  const sharing = deps.extensions.api("cross-user-sharing");
  const now = deps.now ?? Date.now;
  const createAgentMintsByNonce = new Map<string, Promise<any>>();

  const markActive = (reason: "user_action" | "app_open") => {
    method(telemetry.analytics, "markActive")(reason);
  };

  const mintAgent = async (args: any) => {
    const result = await method(manager, "createAgent")(
      {
        name: args.name,
        description: args.description,
        ...(args.title === undefined ? {} : { title: args.title }),
        ...(args.avatarShape === undefined
          ? {}
          : { avatarShape: args.avatarShape }),
        ...(args.avatarColor === undefined
          ? {}
          : { avatarColor: args.avatarColor })
      },
      args.origin,
      {
        isIntroductionSuppressed: args.isIntroductionSuppressed ?? false,
        isKickstartRequested: args.isKickstartRequested ?? false,
        ...(isSandAgentPurpose(args.purpose)
          ? { purpose: args.purpose }
          : {})
      }
    );
    markActive("user_action");
    const templateId = sanitizeTemplateId(args.templateId);
    method(telemetry.analytics, "trackEvent")("sand.agent.created", {
      agent_id: result.agent.id,
      origin: args.origin ?? "user",
      ...(templateId === undefined ? {} : { template_id: templateId })
    });
    return result;
  };

  const openAgent = async (
    args: any,
    operation: "switchAgent" | "openAgentWindowed" | "openAgentTail"
  ) => {
    markActive("app_open");
    method(telemetry, "noteSandModelExperimentActive")();
    const wasActive = method(manager, "getActiveAgentId")() === args.id;
    const startedAt = now();
    const result = operation === "switchAgent"
      ? await method(manager, operation)(args.id)
      : await method(manager, operation)(args.id, args.limit);
    const entries = operation === "switchAgent" ? result : result.entries;
    method(telemetry.logs, "reportAgentOpen")({
      conversationId: args.id,
      durationMs: now() - startedAt,
      entryCount: entries.length,
      wasActive
    });
    void deps.kickstartIfPending(args.id);
    return result;
  };

  const markSharingAction = async (name: string, args: any) => {
    markActive("user_action");
    return await method(sharing, name)(args);
  };

  const listRoutedMcpTools = async () => {
    const extension = deps.extensions.api("mcp");
    const mcp = extension.mcp;
    const tools = await method(mcp, "listTools")({});
    return tools.map((tool: any) => ({
      name: tool.name,
      providerIdentifier: tool.providerIdentifier,
      toolName: tool.toolName,
      ...(tool.description == null ? {} : { description: tool.description }),
      ...(tool.inputSchema == null ? {} : { inputSchema: typeof tool.inputSchema.toJson === "function" ? tool.inputSchema.toJson() : tool.inputSchema }),
    }));
  };
  const executeRoutedMcpTool = async (args: any) => {
    const mcp = deps.extensions.api("mcp").mcp;
    const executor = method(mcp, "createExecutor")(undefined, undefined, { agentId: args.agentId });
    return await method(executor, "execute")({}, {
      name: args.toolName,
      toolName: args.name,
      providerIdentifier: args.providerIdentifier,
      args: args.args,
      toolCallId: args.toolCallId,
    });
  };

  return {
    getTranscript: () => method(manager, "ensureLoaded")(),
    getAgentTranscript: (args: any) =>
      method(manager, "getAgentTranscript")(args.id),
    getAgentTranscriptPage: (args: any) =>
      method(manager, "getAgentTranscriptPage")(args.id, args),
    getAgentTranscriptWindow: (args: unknown) => {
      const request = parseCoordinatorTranscriptWindowRequest(args);
      if (request == null) throw new Error("Malformed getAgentTranscriptWindow request");
      return method(manager, "getAgentTranscriptWindow")(request.id, args);
    },
    getAgentTranscriptTail: (args: any) =>
      method(manager, "getAgentTranscriptTail")(args.id, args),
    getAgentThread: (args: unknown) => {
      const request = parseCoordinatorAgentThreadRequest(args);
      if (request == null) throw new Error("Malformed getAgentThread request");
      return method(manager, "getAgentThread")(request.id, request.rootId);
    },

    sendPrompt: async (args: any) => {
      const agentId =
        (typeof args.agentId === "string" && args.agentId.length > 0
          ? args.agentId
          : undefined) ??
        method(manager, "getActiveAgentId")() ??
        deps.rosterBookkeeping?.latestActiveAgentId ??
        "unknown";
      method(telemetry, "reportMessageSent")({
        ...args,
        agentId,
        isGroupRoom: method(manager, "listAgentsSync")()
          .find((agent: any) => agent.id === agentId)?.isGroup === true
      });
      await method(manager, "sendPrompt")(args.prompt, {
        agentId: args.agentId,
        directAddressedAcceptance: args.directAddressedAcceptance,
        attachmentPaths: args.attachmentPaths ?? [],
        attachmentNames: args.attachmentNames ?? [],
        richText: args.richText,
        replyToId: args.replyToId,
        clientNonce: args.clientNonce,
        isFork: args.isFork,
        traceparent: args.traceparent,
        enterEpochMs: args.enterEpochMs,
        composedAtMs: args.composedAtMs,
        awaitTurn: process.env[DISABLE_SEND_ACCEPT_RETURN_ENV] === "1"
      });
      return { accepted: true };
    },
    promptAcceptanceStatus: (args: any) =>
      method(manager, "promptAcceptanceStatus")(args),
    respondToWidget: (args: any) => {
      markActive("user_action");
      method(telemetry.analytics, "trackEvent")("sand.widget.responded", {
        agent_id: args.agentId
      });
      return method(manager, "respondToWidget")(
        args.entryId,
        args.value,
        args.agentId,
        args.skipTurn === true ? { skipTurn: true } : undefined,
      );
    },
    resolveAutoReviewApproval: (args: any) => {
      markActive("user_action");
      return method(
        deps.extensions.api("auto-review"),
        "resolveApproval"
      )(args);
    },
    resolveLocalToolPermission: async (args: any) => {
      markActive("user_action");
      await method(localToolPermission, "resolveAsk")(args);
    },
    dismissWidget: (args: any) => {
      markActive("user_action");
      method(telemetry.analytics, "trackEvent")("sand.widget.dismissed", {
        agent_id: args.agentId
      });
      return method(manager, "dismissWidget")(args);
    },
    submitSecret: (args: any) =>
      method(manager, "submitSecret")(
        args.entryId,
        args.value,
        args.agentId
      ),
    reactToMessage: (args: any) => {
      markActive("user_action");
      method(telemetry.analytics, "trackEvent")("sand.reaction.added", {
        agent_id: args.agentId
      });
      return method(manager, "reactToMessage")(
        args.entryId,
        args.emoji,
        args.agentId
      );
    },
    appendConnectorCard: (args: any) =>
      method(manager, "appendConnectorCard")(args),
    appendSendMessage: (args: any) =>
      method(manager, "appendSendMessage")(args),
    searchPlugins: async (args: any) =>
      searchPluginsForGateway(deps.extensions.api("mcp").management, typeof args?.query === "string" ? args.query : ""),
    getPlugin: async (args: any) =>
      getPluginForGateway(deps.extensions.api("mcp").management, typeof args?.plugin_id === "string" ? args.plugin_id : ""),
    installPlugin: async (args: any) =>
      installPluginForGateway(
        deps.extensions.api("mcp").management,
        args ?? {},
        (card) => method(manager, "appendConnectorCard")(card),
        typeof args?.agentId === "string" ? args.agentId : undefined,
      ),

    listAgents: () => method(manager, "listAgents")(),
    countAgents: () => method(manager, "countAgentsOnDisk")(),
    searchAgents: async (args: any) =>
      await method(deps.extensions.api("content-search"), "isEnabled")()
        ? method(manager, "searchAgents")(args.query, args.limit)
        : [],
    searchMedia: async (args: any) =>
      await method(deps.extensions.api("content-search"), "isEnabled")()
        ? method(manager, "searchMedia")(args.query, args.limit)
        : [],
    createAgent: (args: any) => {
      const nonce = args.clientNonce;
      if (nonce == null || nonce.length === 0) return mintAgent(args);
      const pending = createAgentMintsByNonce.get(nonce);
      if (pending != null) return pending;

      const minted = mintAgent(args);
      createAgentMintsByNonce.set(nonce, minted);
      void minted.catch(() => createAgentMintsByNonce.delete(nonce));
      for (const oldest of createAgentMintsByNonce.keys()) {
        if (createAgentMintsByNonce.size <= CREATE_AGENT_NONCE_LEDGER_CAP) break;
        createAgentMintsByNonce.delete(oldest);
      }
      return minted;
    },
    kickstartAgent: async (args: any) => ({
      isIntroductionInFlight: await deps.kickstartIfPending(args.id)
    }),
    requestDiskSaverAudit: async (args: any) => ({
      isAuditInFlight: await deps.requestDiskSaverAudit(args.id)
    }),
    createGroup: (args: any) => method(manager, "createGroup")({
      name: args.name,
      description: args.description,
      memberIds: args.memberAgentIds
    }),
    setGroupMembers: (args: any) =>
      method(manager, "setGroupMembers")(args.id, args.memberAgentIds),
    updateAgent: (args: any) =>
      method(manager, "updateAgent")(args.id, args.profile),
    deleteAgent: async (args: any) => {
      await method(sharing, "noteAgentDeleted")(args.id);
      const result = await method(manager, "deleteAgent")(args.id);
      method(deps.extensions.api("session"), "forgetHandoff")(args.id);
      await method(automations, "deleteAgentSchedules")(args.id).catch(
        () => undefined
      );
      await deps.releaseAgentBox(args.id);
      deps.hostEvents.emit({
        kind: "notification-agent-forgotten",
        agentId: args.id
      });
      deps.forgetLocalToolPermission(args.id);
      return result;
    },
    deleteAgents: async (args: any) => {
      for (const id of args.ids) {
        await method(sharing, "noteAgentDeleted")(id);
      }
      const result = await method(manager, "deleteAgents")(args.ids);
      for (const id of args.ids) {
        method(deps.extensions.api("session"), "forgetHandoff")(id);
        await method(automations, "deleteAgentSchedules")(id).catch(
          () => undefined
        );
        await deps.releaseAgentBox(id);
        deps.hostEvents.emit({
          kind: "notification-agent-forgotten",
          agentId: id
        });
        deps.forgetLocalToolPermission(id);
      }
      return result;
    },
    duplicateAgent: (args: any) => method(manager, "cloneAgent")(args.id),
    setAgentUnread: (args: any) =>
      method(manager, "setAgentUnread")(args.id, args.isUnread, args.atMs),
    setAgentNotificationsEnabled: async () => undefined,
    setAgentNotifyOnUpdates: (args: any) =>
      method(manager, "setAgentNotifyOnUpdates")(args.id, args.isEnabled),
    setAgentHiddenFromSidebar: (args: any) =>
      method(manager, "setAgentHiddenFromSidebar")(args.id, args.isHidden),
    openAgent: (args: any) => openAgent(args, "switchAgent"),
    openAgentWindowed: (args: any) => openAgent(args, "openAgentWindowed"),
    openAgentTail: (args: any) => openAgent(args, "openAgentTail"),
    setWindowFocused: (args: any) =>
      method(manager, "setWindowFocused")(args.isFocused),

    getAgentMemories: (args: any) =>
      method(manager, "getAgentMemories")(args.id),
    deleteAgentMemory: (args: any) =>
      method(manager, "deleteAgentMemory")(args.id, args.memoryId),
    clearAgentMemories: (args: any) =>
      method(manager, "clearAgentMemories")(args.id),
    getAgentAutomations: (args: any) =>
      method(manager, "getAgentAutomations")(args.id),
    listAllAutomations: () => method(manager, "listAllAutomations")(),
    isAgentNetworkEnabled: () =>
      method(deps.extensions.api("experiments"), "isAgentNetworkEnabled")(),
    isGlobalSearchEnabled: () =>
      method(deps.extensions.api("content-search"), "isEnabled")(),
    isEgressTunnelAvailable: async () =>
      process.env.SAND_EGRESS_TUNNEL_ENABLED === "1",

    getSharingState: () => method(sharing, "getSharingState")(),
    createRoomFromAgent: (args: any) =>
      markSharingAction("createRoomFromAgent", args),
    createRoomInvite: (args: any) =>
      markSharingAction("createRoomInvite", args),
    joinSharedRoom: (args: any) => markSharingAction("joinSharedRoom", args),
    respondToRoomJoinRequest: (args: any) =>
      markSharingAction("respondToRoomJoinRequest", args),
    createSharedRoom: (args: any) =>
      markSharingAction("createSharedRoom", args),
    addOwnAgentToSharedRoom: (args: any) =>
      markSharingAction("addOwnAgentToSharedRoom", args),
    removeOwnAgentFromSharedRoom: (args: any) =>
      markSharingAction("removeOwnAgentFromSharedRoom", args),
    setSharedRoomTyping: (args: any) =>
      method(sharing, "setSharedRoomTyping")(args),
    leaveSharedRoom: (args: any) => markSharingAction("leaveSharedRoom", args),

    setAgentAutomationEnabled: (args: any) =>
      method(manager, "setAgentAutomationEnabled")(
        args.id,
        args.automationId,
        args.isEnabled
      ),
    createAgentAutomation: async (args: any) => {
      markActive("user_action");
      const countBefore = (await method(manager, "getAgentAutomations")(
        args.id
      )).length;
      const created = await method(manager, "createAgentAutomation")(
        args.id,
        args.spec
      );
      if (created.length > countBefore) {
        method(telemetry.analytics, "trackEvent")("sand.automation.created", {
          agent_id: args.id,
          trigger_type: args.spec.trigger.type,
          source: "automations_ui"
        });
      }
      return created;
    },
    updateAgentAutomation: (args: any) =>
      method(manager, "updateAgentAutomation")(
        args.id,
        args.automationId,
        args.spec
      ),
    deleteAgentAutomation: (args: any) =>
      method(manager, "deleteAgentAutomation")(args.id, args.automationId),
    runAgentAutomationNow: (args: any) => {
      markActive("user_action");
      return method(manager, "runAgentAutomationNow")(
        args.id,
        args.automationId
      );
    },
    broadcastToAgents: async (args: any) => {
      markActive("user_action");
      const result = await method(manager, "broadcastToAgents")(
        args.targets,
        args.message
      );
      method(telemetry.analytics, "trackEvent")("sand.broadcast.sent", {
        total: result.total,
        scheduled: result.scheduled,
        targets: args.targets === "all" ? "all" : "subset"
      });
      return result;
    },

    getAgentWorkflows: (args: any) =>
      method(manager, "getAgentWorkflows")(args.id),
    createAgentWorkflow: async (args: any) => {
      const isAutomation = args.spec.trigger != null;
      if (isAutomation) markActive("user_action");
      const countBefore = isAutomation
        ? (await method(manager, "getAgentAutomations")(args.id)).length
        : 0;
      const workflows = await method(manager, "createAgentWorkflow")(
        args.id,
        args.spec
      );
      if (isAutomation) {
        const countAfter = (await method(manager, "getAgentAutomations")(
          args.id
        )).length;
        if (countAfter > countBefore) {
          method(telemetry.analytics, "trackEvent")(
            "sand.automation.created",
            {
              agent_id: args.id,
              trigger_type: "cron",
              source: "workflow_ui"
            }
          );
        }
      }
      return workflows;
    },
    updateAgentWorkflow: (args: any) =>
      method(manager, "updateAgentWorkflow")(
        args.id,
        args.workflowId,
        args.spec
      ),
    setAgentWorkflowEnabled: (args: any) =>
      method(manager, "setAgentWorkflowEnabled")(
        args.id,
        args.workflowId,
        args.isEnabled
      ),
    deleteAgentWorkflow: (args: any) =>
      method(manager, "deleteAgentWorkflow")(args.id, args.workflowId),
    runAgentWorkflowNow: (args: any) =>
      method(manager, "runAgentWorkflowNow")(args.id, args.workflowId),
    importAgentWorkflowText: (args: any) =>
      method(manager, "importAgentWorkflowMarkdown")(
        args.id,
        args.markdown,
        args.name
      ),
    importAgentWorkflowUrl: (args: any) =>
      method(manager, "importAgentWorkflowUrl")(args.id, args.url, args.name),
    portAgentLocalSkills: (args: any) =>
      method(manager, "portAgentLocalSkills")(args.id),
    getConversationOutline: (args: any) =>
      method(manager, "getConversationOutline")(args.id),

    skillsCatalog: () => method(managedSetup, "skillsCatalog")(),
    syncPluginSkills: () =>
      method(deps.extensions.api("mcp"), "syncPluginSkills")(),
    getPluginSyncStatus: () =>
      method(deps.extensions.api("mcp"), "pluginSyncStatus")(),
    getSkillPublishTargets: () =>
      method(deps.extensions.api("mcp").skillPublish, "listTargets")(),
    publishSkill: (args: any) =>
      method(deps.extensions.api("mcp").skillPublish, "publish")(args),
    resyncPublishedSkill: (args: any) =>
      method(deps.extensions.api("mcp").skillPublish, "resync")(args),
    unpublishSkill: (args: any) =>
      method(deps.extensions.api("mcp").skillPublish, "unpublish")(args),

    getAgentChannels: (args: any) =>
      method(automations, "getAgentChannels")(args.id),
    connectChannel: async (args: any) => {
      method(manager, "connectChannel")(args.id, args.platform, args.token);
      return method(automations, "getAgentChannels")(args.id);
    },
    disconnectChannel: async (args: any) => {
      method(manager, "disconnectChannel")(args.id, args.platform);
      return method(automations, "getAgentChannels")(args.id);
    },
    refreshChannel: (args: any) =>
      method(automations, "getAgentChannels")(args.id),
    getListenerIntegrations: () =>
      method(automations, "getListenerIntegrations")(),
    getListenerConnectUrl: async (args: any) => ({
      url: await method(automations, "getListenerConnectUrl")(args.platform)
    }),
    getSubagents: (args: any) => method(manager, "getSubagents")(args.id),
    getAsyncTasks: (args: any) => method(manager, "getAsyncTasks")(args.id),
    setAgentAvatarBytes: (args: any) =>
      method(manager, "setAgentAvatarBytes")(
        args.id,
        args.pngBase64 == null
          ? null
          : Uint8Array.from(Buffer.from(args.pngBase64, "base64"))
      ),
    getAgentAvatar: (args: any) => method(manager, "getAgentAvatar")(args.id),

    getForeverBoxStatus: async (args: any) =>
      deps.decorateForeverBoxStatus(
        await method(deps.extensions.api("forever-box"), "getStatus")(args)
      ),
    getCloudAgentInfo: (args: any) =>
      method(deps.extensions.api("cloud-agents"), "getInfo")(
        args.bcId,
        args.includeFiles
      ),
    ensureForeverBox: async (args: any) =>
      deps.decorateForeverBoxStatus(
        await method(deps.extensions.api("forever-box"), "ensure")(args)
      ),
    resetForeverBox: async (args: any) =>
      deps.decorateForeverBoxStatus(
        await method(deps.extensions.api("forever-box"), "reset")(args)
      ),
    updateForeverBox: async (args: any) =>
      deps.decorateForeverBoxStatus(
        await method(deps.extensions.api("forever-box"), "update")(args)
      ),
    autoUpdateBoxNow: () =>
      method(deps.extensions.api("forever-box"), "autoUpdateNow")(),
    snapshotBoxStoreNow: (args: any) =>
      method(deps.extensions.api("box-store-sync"), "snapshotBoxStoreNow")(
        args
      ),
    getBoxStoreStatus: () =>
      method(deps.extensions.api("box-store-sync"), "getBoxStoreStatus")(),
    clearBoxStoreNow: () =>
      method(deps.extensions.api("box-store-sync"), "clearBoxStoreNow")(),
    updateHostNow: (args: any) =>
      method(deps.extensions.api("host-upgrade"), "updateHostNow")(args),
    getHostStatus: async () => ({
      ...method(deps.extensions.api("host-upgrade"), "getVersionState")(),
      isBusy: deps.getHealth().isBusy,
      capabilities: HOST_CAPABILITIES
    }),
    setBoxMigrating: async (args: any) => {
      method(deps.extensions.api("forever-box"), "setMigrating")({
        migrating: args.migrating === true
      });
      return { ok: true };
    },
    prepareBoxForRecreate: async () => {
      await method(automations, "suspendWakes")();
      return await method(manager, "quiesceForRecreate")();
    },
    resumeBoxAfterRecreate: async (args: any) => {
      method(automations, "resumeWakes")();
      await method(sharing, "resumeAfterRecreate")();
      return await method(manager, "resumeAfterRecreate")(
        args.agentIds ?? [],
        args.pendingWakes
      );
    },
    handBackForeverBox: (args: any) =>
      method(deps.extensions.api("session"), "endHandoff")(
        args.id,
        args.trigger ?? "button"
      ),

    startTeachRecording: (args: any) =>
      method(deps.extensions.api("teach-recording"), "start")(args),
    stopTeachRecording: (args: any) =>
      method(deps.extensions.api("teach-recording"), "stop")(args),
    getTeachRecordingStatus: () =>
      method(deps.extensions.api("teach-recording"), "getStatus")(),
    getTrays: () => method(deps.extensions.api("trays"), "list")(),
    dismissTray: (args: any) =>
      method(deps.extensions.api("trays"), "dismiss")(args),
    clearTrays: () => method(deps.extensions.api("trays"), "clearAll")(),

    uploadAttachment: (args: any) => method(attachments, "upload")(args),
    readAttachmentImage: (args: any) => method(attachments, "readImage")(args),
    readAttachmentText: (args: any) => method(attachments, "readText")(args),
    readAttachmentChunk: (args: any) => method(attachments, "readChunk")(args),
    getHostSettings: () => method(settings, "getHostSettings")(),
    setHostSettings: (args: any) => {
      const { vendorMcpStore, accountMcpStore, ...settingsArgs } = args ?? {};
      if (vendorMcpStore !== undefined) {
        method(deps.extensions.api("mcp"), "replaceVendorMcpStore")(vendorMcpStore);
        void Promise.resolve()
          .then(() => method(deps.extensions.api("mcp").management, "restart")())
          .catch(() => undefined);
      }
      // The Mac's account MCP store merges into the box's copy, newer entry
      // per name (`account-mcp/store.ts`); only a change restarts the manager.
      if (accountMcpStore !== undefined && method(deps.extensions.api("mcp"), "replaceAccountMcpStore")(accountMcpStore) === true) {
        void Promise.resolve()
          .then(() => method(deps.extensions.api("mcp").management, "restart")())
          .catch(() => undefined);
      }
      const result = method(settings, "setHostSettings")(settingsArgs);
      if (args.localToolPermission !== undefined) {
        method(localToolPermission, "notePermissionChanged")();
      }
      if (args.webauthnProxyEnabled !== undefined) {
        method(deps.extensions.api("webauthn-proxy"), "applyEnablement")(
          args.webauthnProxyEnabled
        );
      }
      return result;
    },

    refreshMcp: async ({ completion, routedAction, routedArgs, vendorMcpStore, accountMcpStore }: any) => {
      if (routedAction === "list-tools") return await listRoutedMcpTools();
      if (routedAction === "execute-tool") return await executeRoutedMcpTool(routedArgs);
      // The Mac pulls the box's account MCP store with this action, so a
      // server the agent added here shows in Settings and its connect card
      // finds its row on the Mac.
      if (routedAction === "account-mcp-store") return { accountMcpStore: method(deps.extensions.api("mcp"), "readAccountMcpStore")() };
      // The Mac's vendor credential store comes with every refresh; the box
      // only ever reads it (`vendor-mcp/backend-exec.ts`).
      if (vendorMcpStore !== undefined) method(deps.extensions.api("mcp"), "replaceVendorMcpStore")(vendorMcpStore);
      // The Mac's account MCP store too, merged newer-entry-wins; the merged
      // copy goes back in the answer so the Mac learns what the agent wrote.
      if (accountMcpStore !== undefined) method(deps.extensions.api("mcp"), "replaceAccountMcpStore")(accountMcpStore);
      const answer = () => ({ accountMcpStore: method(deps.extensions.api("mcp"), "readAccountMcpStore")() });
      if (completion != null) {
        await deps.handleDesktopMcpAuthCompletion(completion);
        return answer();
      }
      await method(deps.extensions.api("mcp").management, "restart")();
      return answer();
    },
    listRoutedMcpTools,
    executeRoutedMcpTool,
    executeRoutedAgentTool: async (args: any) => {
      let foreverBox: { captureScreenshot?(agentId: string): Promise<Uint8Array | null>; ensure?(input: { id: string }): Promise<unknown> } | undefined;
      try { foreverBox = deps.extensions.api("forever-box"); } catch { foreverBox = undefined; }
      const result = await runRoutedAgentTool({
        transcript: {
          appendSendMessage: messageArgs => method(manager, "appendSendMessage")(messageArgs),
          sendToAgent: (fromAgentId, toAgentId, text) => method(manager, "sendToAgent")(fromAgentId, toAgentId, text),
          reactToMessage: (entryId, emoji, agentId) => method(manager, "reactToMessage")(entryId, emoji, agentId),
        },
        localToolPermission: {
          subscribe: listener => method(localToolPermission, "subscribe")(listener),
          authorize: (scope, request) => method(localToolPermission, "authorize")(scope, request),
        },
        ...(foreverBox == null ? {} : { foreverBox }),
      }, {
        agentId: typeof args?.agentId === "string" ? args.agentId : "",
        name: typeof args?.name === "string" ? args.name : "",
        args: args?.args,
        ...(typeof args?.toolCallId === "string" ? { toolCallId: args.toolCallId } : {}),
      });
      return { result };
    },
    listBoxMcpServers: async ({ serverIdentifiers }: any) => {
      const servers = await method(
        deps.extensions.api("mcp"),
        "listBoxServers"
      )(serverIdentifiers);
      return {
        servers: servers.map((server: any) => ({
          serverIdentifier: server.serverIdentifier,
          status: server.status,
          ...(server.statusDetail == null
            ? {}
            : { statusDetail: server.statusDetail }),
          toolCount: server.toolCount
        }))
      };
    },
    completeMcpOAuth: async () => undefined,
    requestWebAuthnCeremony: (args: any) =>
      method(deps.extensions.api("webauthn-proxy"), "requestCeremony")(args),
    setBoxSecrets: ({ secrets }: any) =>
      method(deps.extensions.api("secrets"), "set")({ secrets }),
    getBoxSecretsStatus: () =>
      method(deps.extensions.api("secrets"), "getStatus")()
  };
}
