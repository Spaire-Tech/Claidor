/**
 * QChat Client - 圈组客户端封装
 *
 * 使用 V2 IM 登录后，QChat 功能已内部融合，不需要单独初始化和登录。
 * 本模块仅使用 QChat 类进行 server/channel 订阅和消息收发。
 *
 * Two-phase lifecycle:
 *   1. initListeners() — register passive event handlers (call AFTER IM init, BEFORE login)
 *   2. activate()      — discover servers & subscribe (call AFTER IM login succeeds)
 */

type QChatMessagePayload = {
  serverId?: string;
  channelId?: string;
  fromAccount?: string;
  fromNick?: string;
  body?: string;
  type?: string;
  msgIdServer?: string;
  time?: number;
  mentionAll?: boolean;
  mentionAccids?: string[];
  server_id?: string;
  channel_id?: string;
  from_accid?: string;
  from_nick?: string;
  msg_body?: string;
  msg_type?: number | string;
  msg_server_id?: string;
  timestamp?: number;
  mention_all?: boolean;
  mention_accids?: string[];
};

type QChatSystemNotificationPayload = {
  type?: string;
  serverId?: string;
  msg_type?: number | string;
  server_id?: string;
  /** Inviter's account ID (present in serverMemberInvite notifications) */
  fromAccount?: string;
  from_accid?: string;
  /** Notification attach data (contains serverInfo, requestId, etc.) */
  attach?: {
    type?: string;
    serverInfo?: { serverId?: string };
    requestId?: string;
    [key: string]: unknown;
  };
};

type QChatRecvMsgResp = {
  message: QChatMessagePayload;
};

type QChatRecvSystemNotificationResp = {
  notification?: QChatSystemNotificationPayload;
};

export type QChatClientOptions = {
  appKey: string;
  account: string;
  nim?: unknown;
  /**
   * Server IDs to subscribe to. If empty, the client will auto-discover
   * all joined servers via getServersByPage and subscribe to all of them.
   */
  serverIds?: string[];
  /**
   * Server invite acceptance policy:
   *  - "open": auto-accept all server invites
   *  - "allowlist": auto-accept only if server ID is in serverAllowlist
   *  - "disabled": ignore invites (do not auto-accept)
   */
  serverPolicy?: "open" | "allowlist" | "disabled";
  /**
   * List of server IDs to auto-accept invites from (used when serverPolicy is "allowlist").
   */
  serverAllowlist?: string[];
  onMessage?: (msg: QChatRecvMsgResp) => void | Promise<void>;
  onLoginStatus?: (status: unknown) => void;
  onError?: (error: Error) => void;
  log?: {
    info: (msg: string) => void;
    error: (msg: string) => void;
    debug?: (msg: string) => void;
  };
};

/**
 * Manages QChat subscriptions and messaging.
 *
 * Unlike the standalone QChat plugin, this client does NOT init or login QChat separately.
 * V2 IM login already covers QChat initialization internally.
 *
 * Two-phase lifecycle:
 *   Phase 1 — initListeners(): Register passive event handlers (message, system notification,
 *             login status, kick). Safe to call before IM login completes.
 *   Phase 2 — activate(): Discover servers + subscribe channels. MUST be called only
 *             after IM login succeeds, because these are active API calls.
 */
export class QChatClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private nim: any = null;
  private opts: QChatClientOptions;
  private subscribedServerIds: string[] = [];
  private listenersInitialized = false;
  private activated = false;
  private stopped = false;
  // Store bound handlers so we can remove them on stop()
  private messageHandler: ((msg: QChatMessagePayload) => void) | null = null;
  private systemNotificationHandler:
    | ((resp: QChatSystemNotificationPayload) => void)
    | null = null;

  // 🔥 频道信息缓存：channelId -> ChannelInfo
  private channelInfoCache = new Map<string, any>();
  // 🔥 缓存过期时间：1小时
  private readonly CACHE_EXPIRE_MS = 60 * 60 * 1000;
  // 🔥 缓存时间戳：channelId -> timestamp
  private channelCacheTimestamps = new Map<string, number>();

  constructor(opts: QChatClientOptions) {
    this.opts = opts;
  }

  /**
   * 设置复用的 NIM SDK 实例（避免重复创建）。
   * 应在 initListeners() 之前调用。
   */
  setNim(nim: unknown): void {
    this.nim = nim;
  }

  private ensureNim() {
    if (!this.nim) {
      if (this.opts.nim) {
        this.nim = this.opts.nim;
      } else {
        throw new Error(
          "QChatClient requires a NIM instance — call setNim() or pass opts.nim before use",
        );
      }
    }
    return this.nim;
  }

  /**
   * 🔥 获取频道信息（带缓存）
   * @param channelId 频道ID
   * @param serverId 服务器ID（用于日志）
   * @returns 频道信息对象，包含 topic 等字段
   */
  private async getChannelInfo(
    channelId?: string,
    serverId?: string,
  ): Promise<any | null> {
    console.log(
      `[qchat] 🔍 getChannelInfo called — channelId: ${channelId}, serverId: ${serverId}`,
    );
    console.log(`[qchat] 🔍 nim object:`, !!this.nim);
    console.log(
      `[qchat] 🔍 nim keys:`,
      this.nim ? Object.keys(this.nim) : "no nim",
    );
    console.log(`[qchat] 🔍 nim.qchatChannel:`, !!this.nim?.qchatChannel);
    if (this.nim?.qchatChannel) {
      console.log(
        `[qchat] 🔍 qchatChannel methods:`,
        Object.keys(this.nim.qchatChannel),
      );
    }

    if (!channelId || !this.nim?.qchatChannel) {
      console.log(
        `[qchat] ❌ getChannelInfo early return — channelId: ${!!channelId}, qchatChannel: ${!!this.nim?.qchatChannel}`,
      );
      return null;
    }

    const now = Date.now();
    const cached = this.channelInfoCache.get(channelId);
    const cacheTime = this.channelCacheTimestamps.get(channelId);

    // 检查缓存是否有效（1小时内）
    if (cached && cacheTime && now - cacheTime < this.CACHE_EXPIRE_MS) {
      console.log(`[qchat] channel info from cache — channelId: ${channelId}`);
      return cached;
    }

    try {
      // 调用 NIM SDK 获取频道信息
      console.log(
        `[qchat] fetching channel info — channelId: ${channelId}, serverId: ${serverId || "unknown"}`,
      );

      const result = await this.nim.qchatChannel.getChannels({
        channelIds: [channelId],
      });

      if (result && result.length > 0) {
        const channelInfo = result[0];

        // 缓存结果
        this.channelInfoCache.set(channelId, channelInfo);
        this.channelCacheTimestamps.set(channelId, now);

        console.log(
          `[qchat] channel info cached — channelId: ${channelId}, name: "${channelInfo.name}", topic: "${channelInfo.topic}"`,
        );

        return channelInfo;
      } else {
        console.warn(`[qchat] channel not found — channelId: ${channelId}`);
        return null;
      }
    } catch (error) {
      console.error(
        `[qchat] failed to get channel info — channelId: ${channelId}, error:`,
        error,
      );
      return null;
    }
  }

  private normalizeMessage(msg: QChatMessagePayload): QChatMessagePayload {
    const serverId = msg.serverId ?? msg.server_id;
    const channelId = msg.channelId ?? msg.channel_id;
    const fromAccount = msg.fromAccount ?? msg.from_accid;
    const fromNick = msg.fromNick ?? msg.from_nick;
    const body = msg.body ?? msg.msg_body;
    const type =
      msg.type ?? (typeof msg.msg_type === "string" ? msg.msg_type : undefined);
    const msgIdServer = msg.msgIdServer ?? msg.msg_server_id;
    const time = msg.time ?? msg.timestamp;
    const mentionAll = msg.mentionAll ?? msg.mention_all;
    const mentionAccids = msg.mentionAccids ?? msg.mention_accids;

    return {
      ...msg,
      serverId,
      channelId,
      fromAccount,
      fromNick,
      body,
      type,
      msgIdServer,
      time,
      mentionAll,
      mentionAccids,
      server_id: serverId,
      channel_id: channelId,
      from_accid: fromAccount,
      from_nick: fromNick,
      msg_body: body,
      msg_type: type,
      msg_server_id: msgIdServer,
      timestamp: time,
      mention_all: mentionAll,
      mention_accids: mentionAccids,
    };
  }

  private normalizeSystemNotification(
    notification: QChatSystemNotificationPayload,
  ): QChatSystemNotificationPayload {
    const serverId = notification.serverId ?? notification.server_id;
    const type =
      notification.type ??
      (typeof notification.msg_type === "string"
        ? notification.msg_type
        : undefined);
    const legacyType =
      typeof notification.msg_type === "number"
        ? notification.msg_type
        : undefined;
    const normalizedType =
      type ??
      (legacyType === 1
        ? "serverMemberInvite"
        : legacyType === 8
          ? "serverMemberInviteDone"
          : undefined);

    return {
      ...notification,
      serverId,
      type: normalizedType,
      server_id: serverId,
      msg_type: normalizedType,
    };
  }

  /** The accid this client is associated with. */
  get account(): string {
    return this.opts.account;
  }

  /** Whether listeners have been registered (phase 1 complete). */
  get isListening(): boolean {
    return this.listenersInitialized;
  }

  /** Whether active subscriptions are in place (phase 2 complete). */
  get isActivated(): boolean {
    return this.activated;
  }

  /**
   * Phase 1 — Register passive event handlers.
   *
   * Call this AFTER V2NIMClient.init() but BEFORE loginService.login().
   * Only registers listeners; makes NO outgoing API calls.
   */
  async initListeners(): Promise<void> {
    if (this.listenersInitialized) return;

    const log = this.opts.log;
    const nim = this.ensureNim();
    const loginService = nim.V2NIMLoginService;

    log?.info("event handlers initialized — web sdk handles qchat auth");

    // Login status
    loginService?.on("onLoginStatus", (resp: unknown) => {
      this.opts.onLoginStatus?.(resp);
    });

    // Kicked out
    loginService?.on(
      "onKickedOffline",
      (resp: { reasonDesc?: string; reason?: string } | null) => {
        const reason =
          resp?.reasonDesc ?? resp?.reason ?? String(resp ?? "unknown");
        this.opts.onError?.(new Error(`kicked out — reason: ${reason}`));
      },
    );

    // Message listener (fires for ALL subscribed channels)
    if (!nim.qchatMsg) {
      log?.error(
        "nim.qchatMsg is not available on this SDK instance — QChat message events will NOT be received. Ensure @yxim/nim-bot supports QChat APIs.",
      );
    }

    this.messageHandler = async (msg: QChatMessagePayload) => {
      if (this.stopped) return;
      console.log("[qchat] 📨 received message:", JSON.stringify(msg, null, 2));

      // 🔥 获取频道信息并添加到消息上下文
      console.log(
        `[qchat] 🔍 attempting to get channel info — channelId: ${msg.channelId}, serverId: ${msg.serverId}`,
      );

      const channelInfo = await this.getChannelInfo(
        msg.channelId,
        msg.serverId,
      );

      console.log(`[qchat] 💡 channel info result:`, channelInfo);

      const normalized = this.normalizeMessage(msg);
      // 将频道信息添加到标准化消息中
      if (channelInfo) {
        (normalized as any).channelInfo = channelInfo;
        console.log(`[qchat] ✅ channel info attached to message`);
      } else {
        console.log(`[qchat] ⚠️ no channel info available`);
      }

      console.log(`[qchat] 📤 calling onMessage with normalized message`);
      this.opts.onMessage?.({ message: normalized });
    };
    nim.qchatMsg?.on("message", this.messageHandler);

    this.systemNotificationHandler = (
      notificationResp: QChatSystemNotificationPayload,
    ) => {
      if (this.stopped) return;
      const notification = this.normalizeSystemNotification(
        notificationResp ?? {},
      );
      if (!notification) return;

      // Auto-accept server invite based on serverPolicy
      if (notification.type === "serverMemberInvite") {
        const serverId =
          notification.serverId ??
          notification.server_id ??
          notification.attach?.serverInfo?.serverId;
        const inviterAccid =
          notification.fromAccount ?? notification.from_accid;
        const requestId = notification.attach?.requestId as string | undefined;

        if (!serverId || !inviterAccid || !requestId) {
          log?.info(
            `[sysnotify] server invite ignored — missing fields (server: ${serverId ?? "n/a"}, inviter: ${inviterAccid ?? "n/a"}, requestId: ${requestId ?? "n/a"})`,
          );
          return;
        }

        const policy = this.opts.serverPolicy ?? "open";
        const allowlist = this.opts.serverAllowlist ?? [];

        if (policy === "disabled") {
          log?.info(
            `[sysnotify] server invite ignored — server: ${serverId}, reason: serverPolicy is disabled`,
          );
          return;
        }

        if (policy === "allowlist" && !allowlist.includes(serverId)) {
          log?.info(
            `[sysnotify] server invite ignored — server: ${serverId}, reason: not in serverAllowlist`,
          );
          return;
        }

        log?.info(
          `[sysnotify] auto-accepting server invite — server: ${serverId}, inviter: ${inviterAccid}, policy: ${policy}`,
        );
        nim.qchatServer
          .acceptServerInvite({
            serverId,
            accid: inviterAccid,
            recordInfo: { requestId },
          })
          .then(() => {
            log?.info(
              `[sysnotify] server invite accepted — server: ${serverId}`,
            );
          })
          .catch((err: unknown) => {
            log?.error(
              `[sysnotify] server invite accept failed — server: ${serverId}, error: ${String(err)}`,
            );
          });
        return;
      }

      if (notification.type === "serverMemberInviteDone") {
        const serverId = notification.serverId ?? notification.server_id;
        if (!serverId) return;

        // Skip if already subscribed
        if (this.subscribedServerIds.includes(serverId)) {
          log?.info(
            `[sysnotify] invite received — server: ${serverId}, status: already subscribed`,
          );
          return;
        }

        if (!this.activated) {
          log?.info(
            `[sysnotify] invite queued — server: ${serverId}, status: not activated`,
          );
          return;
        }

        log?.info(`[sysnotify] auto-subscribing — server: ${serverId}`);
        this.subscribeServer(serverId).catch((err) => {
          log?.error(
            `[sysnotify] subscribe failed — server: ${serverId}, error: ${String(err)}`,
          );
        });
      }
    };
    nim.qchatMsg?.on("systemNotification", this.systemNotificationHandler);
    this.listenersInitialized = true;
    log?.info("listeners registered — phase: passive");
  }

  /**
   * Phase 2 — Discover servers and subscribe to channels.
   *
   * Call this AFTER IM login succeeds. Makes active API calls
   * (getServersByPage, subscribeAllChannel) that require authentication.
   */
  async activate(): Promise<void> {
    if (this.activated) return;
    if (!this.listenersInitialized) {
      await this.initListeners();
    }

    const log = this.opts.log;

    // Resolve which servers to subscribe to
    let serverIds = this.opts.serverIds ?? [];

    if (serverIds.length === 0) {
      // Auto-discover all joined servers
      log?.info("no servers configured — discovering joined servers");
      serverIds = await this.discoverJoinedServers();
      log?.info(
        `servers discovered — count: ${serverIds.length}, servers: ${serverIds.join(", ")}`,
      );
    }

    if (serverIds.length === 0) {
      log?.info("no servers found — waiting for server join");
      this.activated = true;
      return;
    }

    // Subscribe to ALL channels in each server
    const nim = this.ensureNim();
    const resp = await nim.qchatServer.subscribeAllChannel({
      type: 1, // kNIMQChatSubscribeTypeMsg
      serverIds,
    });

    const failedServers = resp.failServerIds ?? [];
    if (failedServers.length > 0) {
      log?.error(`subscribe failed — servers: ${failedServers.join(", ")}`);
    }

    this.subscribedServerIds = serverIds.filter(
      (id) => !failedServers.includes(id),
    );
    log?.info(
      `subscribed to all channels — servers: ${this.subscribedServerIds.length}`,
    );
    this.activated = true;
  }

  /**
   * Legacy one-shot start (calls both phases sequentially).
   * Prefer initListeners() + activate() for proper lifecycle control.
   */
  async start(): Promise<void> {
    await this.initListeners();
    await this.activate();
  }

  /**
   * Auto-discover joined servers by paginating through getServersByPage.
   */
  private async discoverJoinedServers(): Promise<string[]> {
    const serverIds: string[] = [];
    let timestamp = 0;
    const PAGE_LIMIT = 100;

    const nim = this.ensureNim();

    for (let page = 0; page < 20; page++) {
      const resp = await nim.qchatServer.getServersByPage({
        timestamp,
        limit: PAGE_LIMIT,
      });

      const servers = resp.datas ?? [];
      if (servers.length === 0) break;

      for (const s of servers) {
        if (s.serverId) {
          serverIds.push(s.serverId);
        }
      }

      const hasMore =
        resp.listQueryTag?.hasMore ?? servers.length >= PAGE_LIMIT;
      if (!hasMore) break;

      const lastServer = servers[servers.length - 1];
      if (lastServer.createTime) {
        timestamp = lastServer.createTime;
      } else {
        break;
      }
    }

    return serverIds;
  }

  /**
   * Subscribe to all channels in a single server.
   * Used for dynamic subscription when the bot is invited to a new server.
   */
  private async subscribeServer(serverId: string): Promise<void> {
    const log = this.opts.log;

    const nim = this.ensureNim();

    const resp = await nim.qchatServer.subscribeAllChannel({
      type: 1, // kNIMQChatSubscribeTypeMsg
      serverIds: [serverId],
    });

    const failed = resp.failServerIds ?? [];
    if (failed.includes(serverId)) {
      log?.error(`[sysnotify] subscribe failed — server: ${serverId}`);
      return;
    }

    this.subscribedServerIds.push(serverId);
    log?.info(
      `[sysnotify] subscribed — server: ${serverId}, total servers: ${this.subscribedServerIds.length}`,
    );
  }

  async sendText(params: {
    serverId: string;
    channelId: string;
    text: string;
  }): Promise<{ ok: boolean; msgServerId?: string; error?: string }> {
    const nim = this.ensureNim();

    try {
      const resp = await nim.qchatMsg.sendMessage({
        serverId: params.serverId,
        channelId: params.channelId,
        type: "text",
        body: params.text,
      });
      return {
        ok: true,
        msgServerId: resp.message?.msgIdServer ?? resp.msgIdServer ?? undefined,
      };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }

  async replyText(params: {
    serverId: string;
    channelId: string;
    text: string;
    /** The original QChatMessage object to reply to */
    replyMessage: unknown;
  }): Promise<{ ok: boolean; msgServerId?: string; error?: string }> {
    const nim = this.ensureNim();

    try {
      const resp = await nim.qchatMsg.replyMessage({
        serverId: params.serverId,
        channelId: params.channelId,
        type: "text",
        body: params.text,
        replyMessage: params.replyMessage,
      });
      return {
        ok: true,
        msgServerId: resp.message?.msgIdServer ?? resp.msgIdServer ?? undefined,
      };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }

  async stop(): Promise<void> {
    // Mark stopped immediately — prevents any in-flight callbacks from processing.
    this.stopped = true;

    if (!this.activated && !this.listenersInitialized) return;

    // Remove event listeners from the shared NIM instance to prevent
    // listener accumulation across gateway restarts (config reloads).
    if (this.nim?.qchatMsg) {
      if (this.messageHandler) {
        this.nim.qchatMsg.off("message", this.messageHandler);
        this.messageHandler = null;
      }
      if (this.systemNotificationHandler) {
        this.nim.qchatMsg.off(
          "systemNotification",
          this.systemNotificationHandler,
        );
        this.systemNotificationHandler = null;
      }
    }

    // Unsubscribe all servers
    if (this.subscribedServerIds.length > 0) {
      const nim = this.ensureNim();
      try {
        await nim.qchatServer.subscribeAllChannel({
          type: 1,
          serverIds: [], // empty = unsubscribe all
        });
      } catch {
        // ignore unsubscribe errors during shutdown
      }
    }

    this.activated = false;
    this.listenersInitialized = false;
  }
}
