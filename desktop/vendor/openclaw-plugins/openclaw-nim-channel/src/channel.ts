import type { ChannelPlugin, OpenClawConfig } from "openclaw/plugin-sdk";
import type {
  ResolvedNimAccount,
  NimConfig,
  NimInstanceConfig,
  NimTeamPolicy,
} from "./types.js";
import {
  resolveNimAccount,
  resolveNimCredentials,
  resolveAllNimAccounts,
  listNimAccountIds,
  resolveNimAccountById,
} from "./accounts.js";
import { normalizeNimTarget, looksLikeNimId } from "./targets.js";
import { probeNim } from "./probe.js";
import { nimOutboundConfig } from "./outbound.js";
import { QChatClient } from "./qchat-client.js";
import {
  setSharedQChatClient,
  setQchatReplyEnabled,
  getQchatClientForAccount,
} from "./qchat-send.js";
import { parseQChatMessage, handleQChatInbound } from "./qchat-inbound.js";
import { isQChatAllowed } from "./accounts.js";
import {
  nimChannelConfigJsonSchema,
  nimChannelConfigUiHints,
} from "./config-schema.js";

/**
 * Channel plugin metadata.
 */
const meta = {
  id: "nim",
  label: "NIM",
  selectionLabel: "NetEase IM (网易云信)",
  docsPath: "/channels/nim",
  docsLabel: "nim",
  blurb: "网易云信 IM 即时通讯。",
  aliases: ["netease", "yunxin"] as string[],
  order: 80,
};

function getNimAccountsMap(nimCfg: NimConfig | undefined): Record<string, any> {
  const accounts = (nimCfg as { accounts?: unknown } | undefined)?.accounts;
  if (!accounts || typeof accounts !== "object" || Array.isArray(accounts)) {
    return {};
  }
  return accounts as Record<string, any>;
}

function findAccountEntryKey(
  accounts: Record<string, any>,
  accountId: string,
): string | null {
  if (accountId in accounts) return accountId;
  for (const [entryKey, inst] of Object.entries(accounts)) {
    const creds = resolveNimCredentials(inst);
    const derived = creds ? `${creds.appKey}:${creds.account}` : null;
    if (derived === accountId) return entryKey;
  }
  return null;
}

function resolveDmScope(cfg: OpenClawConfig): string {
  const sessionCfg = (cfg as { session?: { dmScope?: unknown } }).session;
  return typeof sessionCfg?.dmScope === "string" ? sessionCfg.dmScope : "";
}

function buildDmScopeWarning(cfg: OpenClawConfig): string | null {
  const accounts = resolveAllNimAccounts({ cfg }).filter((account) => account.enabled);
  if (accounts.length <= 1) return null;

  const dmScope = resolveDmScope(cfg);
  if (dmScope === "per-account-channel-peer") return null;

  return `[nim] multi-account DM isolation requires session.dmScope="per-account-channel-peer"; current value is "${dmScope || "unset"}", so different bot accounts may share one direct-message session`;
}

/**
 * NIM channel plugin implementation.
 */
export const nimPlugin: ChannelPlugin<ResolvedNimAccount> = {
  id: "nim",
  meta: {
    ...meta,
  },
  capabilities: {
    chatTypes: ["direct", "group"],
    polls: false,
    threads: false,
    media: true,
    reactions: false,
    edit: false,
    reply: false,
  },
  agentPrompt: {
    messageToolHints: () => [
      "- NIM targeting: omit `target` to reply to the current conversation (auto-inferred). Explicit targets: `user:<accountId>` for P2P, `team:<teamId>` for team group.",
      "- For group conversations, always send to the group (do NOT send P2P to individual users unless explicitly asked).",
      "- NIM supports text, image, file, audio, and video messages.",
      "- To send an image: use the `mediaUrl` or `mediaPath` parameter with an image file path (png, jpg, gif, webp).",
      "- To send a file: use `mediaUrl` or `mediaPath` with any file path.",
      "- To send audio: use `mediaUrl` or `mediaPath` with an audio file (mp3, wav, aac, m4a).",
      "- To send video: use `mediaUrl` or `mediaPath` with a video file (mp4, mov, avi, webm).",
    ],
  },
  reload: { configPrefixes: ["channels.nim"] },
  configSchema: {
    schema: nimChannelConfigJsonSchema,
    uiHints: nimChannelConfigUiHints,
  },
  config: {
    listAccountIds: (cfg) => {
      const ids = listNimAccountIds(cfg);
      console.log(
        `[nim] listAccountIds — raw nim type: ${Array.isArray((cfg as any)?.channels?.nim) ? "array" : typeof (cfg as any)?.channels?.nim}, ids: [${ids.join(", ")}]`,
      );
      return ids;
    },
    resolveAccount: (cfg, accountId) =>
      accountId
        ? resolveNimAccountById({ cfg, accountId })
        : resolveNimAccount({ cfg }),
    defaultAccountId: (cfg) => listNimAccountIds(cfg)[0] ?? "",
    setAccountEnabled: ({ cfg, accountId, enabled }) => {
      const nimCfg = cfg.channels?.nim as NimConfig | undefined;
      const accounts = getNimAccountsMap(nimCfg);
      const entryKey = findAccountEntryKey(accounts, accountId);
      if (!entryKey) return cfg;
      return {
        ...cfg,
        channels: {
          ...cfg.channels,
          nim: {
            ...nimCfg,
            accounts: {
              ...accounts,
              [entryKey]: { ...accounts[entryKey], enabled },
            },
          },
        },
      };
    },
    deleteAccount: ({ cfg, accountId }) => {
      const nimCfg = cfg.channels?.nim as NimConfig | undefined;
      const deleteChannel = () => {
        const next = { ...cfg } as OpenClawConfig;
        const nextChannels = { ...cfg.channels };
        delete (nextChannels as Record<string, unknown>).nim;
        if (Object.keys(nextChannels).length > 0) next.channels = nextChannels;
        else delete next.channels;
        return next;
      };
      const accounts = getNimAccountsMap(nimCfg);
      const entryKey = findAccountEntryKey(accounts, accountId);
      if (!entryKey) return cfg;
      const nextAccounts = { ...accounts };
      delete nextAccounts[entryKey];
      if (Object.keys(nextAccounts).length === 0) return deleteChannel();
      return {
        ...cfg,
        channels: {
          ...cfg.channels,
          nim: { ...nimCfg, accounts: nextAccounts },
        },
      };
    },
    isConfigured: (_account, cfg) => {
      const all = resolveAllNimAccounts({ cfg });
      return all.some((a) => a.configured);
    },
    describeAccount: (account) => ({
      accountId: account.accountId,
      runtimeAccountId: account.runtimeAccountId,
      enabled: account.enabled,
      configured: account.configured,
    }),
    resolveAllowFrom: ({ cfg, accountId }) => {
      const account = accountId
        ? resolveNimAccountById({ cfg, accountId })
        : resolveNimAccount({ cfg });
      return account.allowFrom ?? [];
    },
    formatAllowFrom: ({ allowFrom }) =>
      allowFrom
        .map((entry) => String(entry).trim())
        .filter(Boolean)
        .map((entry) => entry.toLowerCase()),
  },
  security: {
    resolveDmPolicy: ({ account }) => ({
      policy: account.p2pPolicy ?? "open",
      allowFrom: account.allowFrom ?? [],
      allowFromPath: "channels.nim.accounts.<accountKey>.p2p.",
      normalizeEntry: (raw: string) => raw.replace(/^(nim|user|account):/i, ""),
      approveHint:
        "Set p2p.policy to 'allowlist' and configure p2p.allowFrom to control who can message the bot.",
    }),
    collectWarnings: ({ cfg }) => {
      const all = resolveAllNimAccounts({ cfg });
      const warnings: string[] = [];
      const dmScopeWarning = buildDmScopeWarning(cfg);

      if (dmScopeWarning) {
        warnings.push(`- ${dmScopeWarning.replace(/^\[nim\]\s*/, "")}.`);
      }

      for (const account of all) {
        const label = account.runtimeAccountId || account.accountId || account.account;
        const inst = account.config as NimInstanceConfig | undefined;

        // P2P policy warnings
        if (account.p2pPolicy === "open") {
          warnings.push(
            `- NIM [${label}] P2P: p2p.policy="open" allows any user to message. Set p2p.policy="allowlist" + p2p.allowFrom to restrict senders.`,
          );
        }

        // Team policy warnings
        if (account.teamPolicy === "open") {
          warnings.push(
            `- NIM [${label}] teams: team.policy="open" allows any group to trigger (mention-gated). Set team.policy="allowlist" + team.allowFrom to restrict by group ID.`,
          );
        }

        // QChat warnings
        const qchatCfg = (inst as Record<string, unknown> | undefined)
          ?.qchat as { policy?: string; allowFrom?: unknown[] } | undefined;
        if (qchatCfg) {
          const qchatPolicy = qchatCfg.policy ?? "open";
          if (qchatPolicy === "open") {
            warnings.push(
              `- QChat [${label}]: policy="open" accepts all @-mentioned messages and auto-accepts all server invites. Set qchat.policy="allowlist" + qchat.allowFrom to restrict.`,
            );
          }
        }
      }

      return warnings;
    },
  },
  setup: {
    resolveAccountId: ({ cfg }) => listNimAccountIds(cfg)[0] ?? "",
    applyAccountConfig: ({ cfg }) => {
      const nimCfg = cfg.channels?.nim as NimConfig | undefined;
      const accounts = getNimAccountsMap(nimCfg);
      const firstEntryKey = Object.keys(accounts)[0];
      if (!firstEntryKey) return cfg;
      return {
        ...cfg,
        channels: {
          ...cfg.channels,
          nim: {
            ...nimCfg,
            accounts: {
              ...accounts,
              [firstEntryKey]: { ...accounts[firstEntryKey], enabled: true },
            },
          },
        },
      };
    },
  },
  messaging: {
    normalizeTarget: normalizeNimTarget,
    targetResolver: {
      looksLikeId: looksLikeNimId,
      hint: "<accountId|user:accountId|team:teamId|superTeam:teamId>",
    },
  },
  outbound: nimOutboundConfig,
  status: {
    defaultRuntime: null as any, // Multi-instance: no single default runtime
    buildChannelSummary: ({ snapshot }) => ({
      configured: snapshot.configured ?? false,
      running: snapshot.running ?? false,
      connected: snapshot.connected ?? false,
      lastStartAt: snapshot.lastStartAt ?? null,
      lastStopAt: snapshot.lastStopAt ?? null,
      lastError: snapshot.lastError ?? null,
      probe: snapshot.probe,
      lastProbeAt: snapshot.lastProbeAt ?? null,
    }),
    probeAccount: async ({ account, cfg }) => {
      const accountId = account.accountId;
      const inst = accountId
        ? resolveNimAccountById({ cfg, accountId })
        : resolveNimAccount({ cfg });
      return await probeNim(inst.configured ? inst.config : undefined);
    },
    buildAccountSnapshot: ({ account, runtime, probe }) => {
      const running = runtime?.running ?? false;
      const probeConnected = (probe as { connected?: boolean } | undefined)
        ?.connected;
      return {
        accountId: account.accountId,
        enabled: account.enabled,
        configured: account.configured,
        running,
        connected: probeConnected ?? running,
        lastStartAt: runtime?.lastStartAt ?? null,
        lastStopAt: runtime?.lastStopAt ?? null,
        lastError: runtime?.lastError ?? null,
        probe,
      };
    },
  },
  gateway: {
    startAccount: async (ctx) => {
      const { monitorNimProvider } = await import("./monitor.js");

      // Resolve this specific instance by accountId
      const account = resolveNimAccountById({
        cfg: ctx.cfg,
        accountId: ctx.accountId,
      });
      const nimCfg = account.configured ? account.config : undefined;

      ctx.setStatus({ accountId: ctx.accountId });
      ctx.log?.info(
        `[nim] provider starting — account: ${account.account || "unknown"}, instanceId: ${ctx.accountId}`,
      );
      const dmScopeWarning = buildDmScopeWarning(ctx.cfg);
      if (dmScopeWarning) {
        ctx.log?.warn(dmScopeWarning);
      }

      // Prepare QChat client for this instance
      const qchatCfg = (nimCfg as Record<string, unknown> | undefined)
        ?.qchat as
        | { policy?: string; allowFrom?: Array<string | number> }
        | undefined;

      const qchatPolicy = (qchatCfg?.policy ?? "open") as
        | "open"
        | "allowlist"
        | "disabled";
      const qchatAllowFrom = qchatCfg?.allowFrom ?? [];

      const isEffectivelyDisabled =
        qchatPolicy === "disabled" ||
        (qchatPolicy === "allowlist" && qchatAllowFrom.length === 0);
      setQchatReplyEnabled(ctx.accountId, !isEffectivelyDisabled);
      ctx.log?.info(
        `[qchat] reply enabled: ${!isEffectivelyDisabled} — policy: ${qchatPolicy}, allowFrom count: ${qchatAllowFrom.length}, instance: ${ctx.accountId}`,
      );

      let gatewayAborted = false;
      ctx.abortSignal.addEventListener(
        "abort",
        () => {
          gatewayAborted = true;
        },
        { once: true },
      );

      let qchatClient: QChatClient | null = null;

      if (nimCfg?.appKey && nimCfg?.account) {
        const qchatLogAdapter = ctx.log
          ? {
              info: (msg: string) => ctx.log!.info(`[qchat] ${msg}`),
              error: (msg: string) => ctx.log!.error(`[qchat] ${msg}`),
              debug: ctx.log.debug
                ? (msg: string) => ctx.log!.debug!(`[qchat] ${msg}`)
                : undefined,
            }
          : undefined;

        const allowFrom = qchatCfg?.allowFrom ?? [];
        const derivedServerIds =
          qchatPolicy === "allowlist"
            ? [
                ...new Set(
                  allowFrom
                    .map((e) => String(e).split("|")[0].trim())
                    .filter(Boolean),
                ),
              ]
            : [];

        const serverIdsLabel =
          derivedServerIds.length > 0
            ? `servers=[${derivedServerIds.join(",")}]`
            : "servers=auto-discover";

        ctx.log?.info(
          `[qchat] client preparing — ${serverIdsLabel}, instance: ${ctx.accountId}`,
        );

        qchatClient = new QChatClient({
          appKey: nimCfg.appKey as string,
          account: nimCfg.account as string,
          serverIds: derivedServerIds.length > 0 ? derivedServerIds : undefined,
          serverPolicy: qchatPolicy,
          serverAllowlist: derivedServerIds,
          log: qchatLogAdapter,
          onMessage: async (resp) => {
            const raw = resp.message;
            ctx.log?.info(
              `[qchat] received message — server: ${raw?.serverId ?? raw?.server_id ?? "unknown"}, channel: ${raw?.channelId ?? raw?.channel_id ?? "unknown"}, sender: ${raw?.fromAccount ?? raw?.from_accid ?? "unknown"}, message id: ${raw?.msgIdServer ?? raw?.msg_server_id ?? "unknown"}, timestamp: ${raw?.time ?? raw?.timestamp ?? "unknown"}`,
            );

            // Resolve live config for this specific instance
            const liveAccount = resolveNimAccountById({
              cfg: ctx.cfg,
              accountId: ctx.accountId,
            });
            const liveInstCfg = liveAccount.configured
              ? liveAccount.config
              : undefined;

            const msg = parseQChatMessage(
              resp,
              (liveInstCfg?.account as string) ?? "",
            );
            if (!msg) {
              ctx.log?.info(
                "[qchat] message dropped — reason: unsupported or missing fields",
              );
              return;
            }

            ctx.log?.info(
              `[qchat] parsed message — sender: ${msg.senderAccid}, target: ${msg.serverId}:${msg.channelId}, mentioned: ${msg.wasMentioned ? "yes" : "no"}, message id: ${msg.messageId}`,
            );

            if (msg.senderAccid === ((liveInstCfg?.account as string) ?? "")) {
              ctx.log?.info("[qchat] skipped — reason: message from self");
              return;
            }

            if (gatewayAborted) return;

            const liveQchatCfg = (
              liveInstCfg as Record<string, unknown> | undefined
            )?.qchat as
              | { policy?: string; allowFrom?: Array<string | number> }
              | undefined;
            const livePolicy = (liveQchatCfg?.policy ?? "open") as
              | "open"
              | "allowlist"
              | "disabled";
            const liveAllowFrom = liveQchatCfg?.allowFrom ?? [];

            const policyResult = isQChatAllowed({
              policy: livePolicy,
              allowFrom: liveAllowFrom,
              serverId: msg.serverId,
              channelId: msg.channelId,
              senderAccid: msg.senderAccid,
            });

            ctx.log?.info(
              `[qchat] policy check — policy: ${livePolicy}, server: ${msg.serverId}, channel: ${msg.channelId}, sender: ${msg.senderAccid}`,
            );

            if (!policyResult.allowed) {
              const blocked = policyResult as Exclude<
                typeof policyResult,
                { allowed: true }
              >;
              if (blocked.reason === "disabled") {
                ctx.log?.info(
                  `[qchat] dispatch skipped — reason: policy disabled, server: ${msg.serverId}, channel: ${msg.channelId}, sender: ${msg.senderAccid}`,
                );
                ctx.setStatus({
                  accountId: ctx.accountId,
                  lastInboundAt: msg.timestamp,
                });
              } else {
                ctx.log?.info(
                  `[qchat] dispatch skipped — reason: no matching allowFrom entry, server: ${msg.serverId}, channel: ${msg.channelId}, sender: ${msg.senderAccid}, allowFrom: [${(blocked as any).allowFrom?.join(", ")}]`,
                );
              }
              return;
            }

            ctx.log?.info(
              `[qchat] dispatching to agent — server: ${msg.serverId}, channel: ${msg.channelId}, sender: ${msg.senderAccid}`,
            );

            try {
              await handleQChatInbound({
                message: msg,
                botAccid: (liveInstCfg?.account as string) ?? "",
                accountId: ctx.accountId,
                config: ctx.cfg,
                runtime: ctx.runtime,
                statusSink: (patch) =>
                  ctx.setStatus({ accountId: ctx.accountId, ...patch }),
              });
              ctx.log?.info(
                `[qchat] agent pipeline completed — server: ${msg.serverId}, channel: ${msg.channelId}`,
              );
            } catch (dispatchErr) {
              ctx.log?.error(
                `[qchat] agent pipeline error — error: ${String(dispatchErr)}`,
              );
            }
          },
          onLoginStatus: (status) => {
            ctx.log?.info(
              `[qchat] login status changed — status: ${typeof status === "object" ? ((status as any)?.code ?? String(status)) : status}`,
            );
          },
          onError: (err) => {
            ctx.log?.error(`[qchat] error — message: ${err.message}`);
          },
        });

        // Register QChat client keyed by this instance's accountId
        setSharedQChatClient(ctx.accountId, qchatClient);
      }

      // Handle abort: stop QChat for this instance
      if (qchatClient) {
        ctx.abortSignal.addEventListener(
          "abort",
          () => {
            qchatClient!.stop().catch((err) => {
              ctx.log?.error(`[qchat] shutdown failed — error: ${String(err)}`);
            });
            setSharedQChatClient(ctx.accountId, null);
            setQchatReplyEnabled(ctx.accountId, false);
          },
          { once: true },
        );
      }

      // Start IM monitor for this specific instance
      return monitorNimProvider({
        cfg: ctx.cfg,
        accountId: ctx.accountId,
        runtime: ctx.runtime,
        abortSignal: ctx.abortSignal,
        qchatClient,
      });
    },
  },
};
