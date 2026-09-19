import type { ChannelPlugin, OpenClawConfig } from "openclaw/plugin-sdk";
import type { RuntimeEnv } from "openclaw/plugin-sdk/runtime-env";
import { monitorBeeProvider } from "./monitor.js";
import { beeOutboundConfig } from "./outbound.js";

const DEFAULT_BEE_ACCOUNT_ID = "default";

type BeeChannelConfig = { enabled?: boolean; clientId?: string; secret?: string };

function getBeeCfg(cfg: OpenClawConfig): BeeChannelConfig | undefined {
  return (cfg.channels as Record<string, unknown> | undefined)?.[
    "netease-bee"
  ] as BeeChannelConfig | undefined;
}

/**
 * NetEase Bee channel plugin implementation.
 */
export const beePlugin: ChannelPlugin = {
  id: "netease-bee",
  meta: {
    id: "netease-bee",
    label: "NetEase Bee",
    selectionLabel: "NetEase Bee (小蜜蜂)",
    docsPath: "/channels/netease-bee",
    docsLabel: "netease-bee",
    blurb: "网易小蜜蜂 IM 即时通讯。",
    aliases: ["bee", "xiaomifeng"],
    order: 85,
  },
  capabilities: {
    chatTypes: ["direct"],
    polls: false,
    threads: false,
    media: false,
    reactions: false,
    edit: false,
    reply: false,
  },
  agentPrompt: {
    messageToolHints: () => [
      "- NetEase Bee: always reply to the current conversation (target is auto-inferred).",
      "- Only text messages are supported.",
    ],
  },
  reload: { configPrefixes: ["channels.netease-bee"] },
  configSchema: {
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled:  { type: "boolean" },
        clientId: { type: "string" },
        secret:   { type: "string" },
        debug:    { type: "boolean" },
      },
    },
    uiHints: {
      enabled:  { label: "Enable" },
      clientId: { label: "Client ID (NIM Account)" },
      secret:   { label: "Secret (NIM Token)", sensitive: true },
      debug:    { label: "Debug Mode", advanced: true },
    },
  },
  config: {
    listAccountIds: () => [DEFAULT_BEE_ACCOUNT_ID],
    resolveAccount: (cfg) => {
      const bee = getBeeCfg(cfg);
      const configured = !!(bee?.clientId && bee?.secret);
      return {
        id: DEFAULT_BEE_ACCOUNT_ID,
        accountId: DEFAULT_BEE_ACCOUNT_ID,
        enabled: bee?.enabled ?? false,
        configured,
      };
    },
    defaultAccountId: () => DEFAULT_BEE_ACCOUNT_ID,
    setAccountEnabled: ({ cfg, enabled }) => ({
      ...cfg,
      channels: {
        ...(cfg.channels as Record<string, unknown> | undefined),
        "netease-bee": { ...getBeeCfg(cfg), enabled },
      } as OpenClawConfig["channels"],
    }),
    deleteAccount: ({ cfg }) => {
      const channels = { ...(cfg.channels as Record<string, unknown> | undefined) };
      delete channels["netease-bee"];
      return {
        ...cfg,
        channels: Object.keys(channels).length > 0
          ? (channels as OpenClawConfig["channels"])
          : undefined,
      };
    },
    isConfigured: (_account, cfg) => {
      const bee = getBeeCfg(cfg);
      return !!(bee?.clientId && bee?.secret);
    },
    describeAccount: (account) => ({
      accountId: account.accountId,
      enabled: account.enabled,
      configured: account.configured,
    }),
    resolveAllowFrom: () => [],
    formatAllowFrom: () => [],
  },
  security: {
    resolveDmPolicy: () => ({
      policy: "open",
      allowFrom: [],
      allowFromPath: "channels.netease-bee.",
      approveHint: "netease-bee:<chatId>",
      normalizeEntry: (raw: string) => raw.trim(),
    }),
    collectWarnings: () => [],
  },
  setup: {
    resolveAccountId: () => DEFAULT_BEE_ACCOUNT_ID,
    applyAccountConfig: ({ cfg }) => ({
      ...cfg,
      channels: {
        ...(cfg.channels as Record<string, unknown> | undefined),
        "netease-bee": { ...getBeeCfg(cfg), enabled: true },
      } as OpenClawConfig["channels"],
    }),
  },
  messaging: {
    normalizeTarget: (target: string) => target.trim(),
    targetResolver: {
      looksLikeId: (s: string) => s.includes("@"),
      hint: "<chatId>",
    },
  },
  outbound: beeOutboundConfig,
  status: {
    defaultRuntime: {
      accountId: DEFAULT_BEE_ACCOUNT_ID,
      running: false,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null,
    },
    buildChannelSummary: ({ snapshot }) => ({
      configured: snapshot.configured ?? false,
      running: snapshot.running ?? false,
      connected: snapshot.connected ?? false,
      lastStartAt: snapshot.lastStartAt ?? null,
      lastStopAt: snapshot.lastStopAt ?? null,
      lastError: snapshot.lastError ?? null,
    }),
    buildAccountSnapshot: ({ account, runtime }) => ({
      accountId: account.accountId,
      enabled: account.enabled,
      configured: account.configured,
      running: runtime?.running ?? false,
      connected: runtime?.running ?? false,
      lastStartAt: runtime?.lastStartAt ?? null,
      lastStopAt: runtime?.lastStopAt ?? null,
      lastError: runtime?.lastError ?? null,
    }),
  },
  gateway: {
    startAccount: async (ctx) => {
      const bee = getBeeCfg(ctx.cfg);
      ctx.setStatus({ accountId: ctx.accountId });
      ctx.log?.info(`[netease-bee] provider starting — account: ${bee?.clientId ?? "unknown"}`);

      return monitorBeeProvider({
        cfg: ctx.cfg,
        runtime: ctx.runtime as unknown as RuntimeEnv,
        abortSignal: ctx.abortSignal,
      });
    },
  },
};
