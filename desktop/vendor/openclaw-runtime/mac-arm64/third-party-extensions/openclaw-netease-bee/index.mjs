// ../../../../private/var/folders/6x/3ly9x_r91n79twv0l75cwbn40000gp/T/openclaw-plugin-staging-CMUoTs/openclaw-plugin-source-tAtRWx/index.ts
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";

// ../../../../private/var/folders/6x/3ly9x_r91n79twv0l75cwbn40000gp/T/openclaw-plugin-staging-CMUoTs/openclaw-plugin-source-tAtRWx/src/client.ts
var BEE_APP_KEY = "1c114416fb93ec4d5489e885a64eb6c5";
async function createBeeClient(config) {
  const NIM = (await import("nim-web-sdk-ng/dist/nodejs/nim.js")).default;
  const nim = new NIM({
    appkey: BEE_APP_KEY,
    debugLevel: config.debug ? "debug" : "warn",
    apiVersion: "v2"
  });
  const messageCallbacks = /* @__PURE__ */ new Set();
  const connectionCallbacks = /* @__PURE__ */ new Set();
  nim.V2NIMMessageService?.on("onReceiveMessages", (messages) => {
    for (const cb of messageCallbacks) {
      try {
        cb(messages);
      } catch {
      }
    }
  });
  nim.V2NIMLoginService?.on("onLoginStatus", (status) => {
    if (status === 1) {
      for (const cb of connectionCallbacks) {
        try {
          cb("connected");
        } catch {
        }
      }
    } else if (status === 0) {
      for (const cb of connectionCallbacks) {
        try {
          cb("disconnected");
        } catch {
        }
      }
    }
  });
  nim.V2NIMLoginService?.on("onKickedOffline", () => {
    for (const cb of connectionCallbacks) {
      try {
        cb("kickout");
      } catch {
      }
    }
  });
  nim.V2NIMLoginService?.on("onDisconnected", () => {
    for (const cb of connectionCallbacks) {
      try {
        cb("disconnected");
      } catch {
      }
    }
  });
  return {
    login() {
      return new Promise((resolve) => {
        const onStatus = (status) => {
          if (status === 1) {
            nim.V2NIMLoginService?.off?.("onLoginStatus", onStatus);
            resolve(true);
          }
        };
        nim.V2NIMLoginService?.on("onLoginStatus", onStatus);
        nim.V2NIMLoginService?.on("onLoginFailed", () => {
          nim.V2NIMLoginService?.off?.("onLoginStatus", onStatus);
          resolve(false);
        });
        nim.V2NIMLoginService?.login(config.clientId, config.secret, {}).catch(() => {
          resolve(false);
        });
      });
    },
    async logout() {
      try {
        await nim.V2NIMLoginService?.logout();
      } catch {
      }
    },
    onMessage(callback) {
      messageCallbacks.add(callback);
    },
    onConnectionChange(callback) {
      connectionCallbacks.add(callback);
    },
    destroy() {
      messageCallbacks.clear();
      connectionCallbacks.clear();
    }
  };
}

// ../../../../private/var/folders/6x/3ly9x_r91n79twv0l75cwbn40000gp/T/openclaw-plugin-staging-CMUoTs/openclaw-plugin-source-tAtRWx/src/runtime.ts
var beeRuntime = null;
function setBeeRuntime(runtime) {
  beeRuntime = runtime;
}
function getBeeRuntime() {
  if (!beeRuntime) {
    throw new Error("NetEase Bee runtime not initialized. Call setBeeRuntime first.");
  }
  return beeRuntime;
}

// ../../../../private/var/folders/6x/3ly9x_r91n79twv0l75cwbn40000gp/T/openclaw-plugin-staging-CMUoTs/openclaw-plugin-source-tAtRWx/src/send.ts
var BEE_TOKEN_API_URL = "https://api.mifengs.com/worklife-go/api/v1/claw/im/oauth2/accessToken";
var BEE_HTTP_API_URL = "https://api.mifengs.com/worklife-go/api/v1/claw/im/send";
var HTTP_FROM = "youdaoClaw";
var MAX_CHUNK_LENGTH = 1500;
var tokenCache = /* @__PURE__ */ new Map();
async function getAccessToken(config) {
  const cacheKey = config.clientId;
  const now = Date.now();
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > now + 6e4) {
    return cached.accessToken;
  }
  const response = await fetch(BEE_TOKEN_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ appKey: config.clientId, appSecret: config.secret })
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Bee token API error ${response.status}: ${text}`);
  }
  const result = JSON.parse(text);
  const accessToken = result.data?.accessToken ?? result.accessToken ?? result.access_token;
  const expiresIn = result.data?.expireIn ?? result.data?.expiresIn ?? result.expireIn ?? result.expiresIn ?? 7200;
  if (!accessToken) {
    throw new Error(`Bee token API returned no accessToken: ${text}`);
  }
  tokenCache.set(cacheKey, { accessToken, expiresAt: now + expiresIn * 1e3 });
  return accessToken;
}
function clearAccessToken(clientId) {
  tokenCache.delete(clientId);
}
function splitMessageIntoChunks(text, maxLength = MAX_CHUNK_LENGTH) {
  if (text.length <= maxLength) return [text];
  const chunks = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }
    let idx = remaining.lastIndexOf("\n", maxLength);
    if (idx === -1 || idx < maxLength * 0.5) idx = remaining.lastIndexOf(" ", maxLength);
    if (idx === -1 || idx < maxLength * 0.5) idx = maxLength;
    chunks.push(remaining.slice(0, idx));
    remaining = remaining.slice(idx).trimStart();
  }
  return chunks;
}
async function sendBeeText(config, chatId, text, isRetry = false) {
  const chunks = splitMessageIntoChunks(text);
  let accessToken;
  try {
    accessToken = await getAccessToken(config);
  } catch (err) {
    return { success: false, error: String(err) };
  }
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const payload = {
      from: HTTP_FROM,
      appKey: config.clientId,
      accessToken,
      chatType: "single",
      msgType: "text",
      chatId,
      content: JSON.stringify({ text: chunk })
    };
    try {
      const response = await fetch(BEE_HTTP_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const responseText = await response.text();
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${responseText}`);
      }
      let result;
      try {
        result = JSON.parse(responseText);
      } catch {
        result = responseText;
      }
      if (result && typeof result === "object" && result.code === 144e4) {
        if (isRetry) {
          return { success: false, error: `Token validation failed after retry` };
        }
        clearAccessToken(config.clientId);
        return sendBeeText(config, chatId, text, true);
      }
    } catch (err) {
      return { success: false, error: String(err) };
    }
    if (i < chunks.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  return { success: true };
}

// ../../../../private/var/folders/6x/3ly9x_r91n79twv0l75cwbn40000gp/T/openclaw-plugin-staging-CMUoTs/openclaw-plugin-source-tAtRWx/src/inbound.ts
var processedMessages = /* @__PURE__ */ new Map();
var DEDUP_TTL = 5 * 60 * 1e3;
function isProcessed(msgId) {
  const now = Date.now();
  for (const [id, ts] of processedMessages) {
    if (now - ts > DEDUP_TTL) processedMessages.delete(id);
  }
  if (processedMessages.has(msgId)) return true;
  processedMessages.set(msgId, now);
  return false;
}
function parseBeeMessage(msg, selfAccountId, lastProcessedTimestamp) {
  const msgId = String(msg.messageServerId ?? msg.messageClientId ?? "");
  const messageSource = msg.messageSource ?? 0;
  if (messageSource !== 1) return null;
  const rawSenderId = String(msg.senderId ?? "");
  if (rawSenderId === selfAccountId) return null;
  if (isProcessed(msgId)) return null;
  const createTime = msg.createTime ?? 0;
  if (createTime > 0 && createTime <= lastProcessedTimestamp) return null;
  const messageType = msg.messageType;
  if (messageType === 100) {
    return parseCustomBeeMessage(msg, msgId, createTime);
  }
  if (messageType === 0) {
    const text = String(msg.text ?? "").trim();
    if (!text) return null;
    const conversationId = String(msg.conversationId ?? rawSenderId);
    return {
      msgId,
      senderId: rawSenderId,
      chatId: conversationId,
      text,
      timestamp: createTime || Date.now(),
      rawNimMsg: msg
    };
  }
  return null;
}
function parseCustomBeeMessage(msg, msgId, createTime) {
  const rawContent = msg.attachment?.raw ?? msg.text ?? "";
  if (!rawContent) return null;
  let outer;
  try {
    outer = typeof rawContent === "string" ? JSON.parse(rawContent) : rawContent;
  } catch {
    return null;
  }
  const beeSenderId = String(outer.senderId ?? msg.senderId ?? "");
  const beeChatId = String(outer.chatId ?? "");
  let inner;
  try {
    inner = typeof outer.content === "string" ? JSON.parse(outer.content) : { text: outer.content };
  } catch {
    inner = { text: String(outer.content ?? "") };
  }
  if (inner.subType !== void 0 && inner.subType !== 1) return null;
  const text = String(inner.text ?? "").trim();
  if (!text) return null;
  return {
    msgId,
    senderId: beeSenderId,
    chatId: beeChatId || beeSenderId,
    text,
    timestamp: createTime || Date.now(),
    rawNimMsg: msg
  };
}
function createBeeReplyDispatcher(params) {
  const { runtime, chatId, config } = params;
  const core = getBeeRuntime();
  const log = runtime?.log ?? console.log;
  const deliver = async (payload) => {
    const text = payload.text ?? "";
    if (!text) return;
    const result = await sendBeeText(config, chatId, text);
    if (!result.success) {
      log(`[netease-bee] send failed \u2014 chat: ${chatId}, error: ${result.error}`);
    }
  };
  const { dispatcher, replyOptions: sdkReplyOptions, markDispatchIdle } = core.channel.reply.createReplyDispatcherWithTyping({
    deliver,
    humanDelay: { mode: "off" },
    onIdle: () => {
    },
    onError: (err, info) => {
      log(`[netease-bee] dispatcher error \u2014 kind: ${info.kind}, error: ${String(err)}`);
    },
    onSkip: (_payload, info) => {
      log(`[netease-bee] reply skipped \u2014 kind: ${info.kind}, reason: ${info.reason}`);
    }
  });
  return {
    dispatcher,
    replyOptions: {
      channel: "netease-bee",
      targetId: chatId,
      ...sdkReplyOptions
    },
    markDispatchIdle
  };
}
async function handleBeeMessage(params) {
  const { cfg, runtime, message, config } = params;
  const { senderId, chatId, text, msgId, timestamp } = message;
  const log = runtime.log ?? console.log;
  const error = runtime.error ?? console.error;
  let core;
  try {
    core = getBeeRuntime();
  } catch (err) {
    error(`[netease-bee] runtime not initialized \u2014 error: ${String(err)}`);
    return;
  }
  const route = core.channel.routing.resolveAgentRoute({
    cfg,
    channel: "netease-bee",
    peer: { kind: "dm", id: chatId }
  });
  if (!route) {
    log(`[netease-bee] route unresolved \u2014 chat: ${chatId}`);
    return;
  }
  const preview = text.replace(/\s+/g, " ").slice(0, 160);
  core.system.enqueueSystemEvent(`NetEase Bee DM from ${senderId}: ${preview}`, {
    sessionKey: route.sessionKey,
    contextKey: `netease-bee:message:${chatId}:${msgId}`
  });
  const envelopeOptions = core.channel.reply.resolveEnvelopeFormatOptions(cfg);
  const body = core.channel.reply.formatAgentEnvelope({
    channel: "NetEase Bee",
    from: senderId,
    timestamp: new Date(timestamp),
    envelope: envelopeOptions,
    body: text
  });
  const ctxPayload = core.channel.reply.finalizeInboundContext({
    Body: body,
    RawBody: text,
    CommandBody: text,
    From: `netease-bee:${senderId}`,
    To: `netease-bee:${chatId}`,
    SessionKey: route.sessionKey,
    AccountId: route.accountId,
    ChatType: "direct",
    SenderName: senderId,
    SenderId: senderId,
    Provider: "netease-bee",
    Surface: "netease-bee",
    MessageSid: msgId,
    Timestamp: timestamp,
    CommandAuthorized: true,
    OriginatingChannel: "netease-bee",
    OriginatingTo: `netease-bee:${chatId}`
  });
  const { dispatcher, replyOptions, markDispatchIdle } = createBeeReplyDispatcher({
    cfg,
    agentId: route.agentId,
    runtime,
    chatId,
    config
  });
  log(
    `[netease-bee] dispatching to agent \u2014 session: ${route.sessionKey}, agent: ${route.agentId}, chat: ${chatId}`
  );
  try {
    const { queuedFinal, counts } = await core.channel.reply.dispatchReplyFromConfig({
      ctx: ctxPayload,
      cfg,
      dispatcher,
      replyOptions
    });
    markDispatchIdle();
    log(
      `[netease-bee] dispatch complete \u2014 final: ${counts.final}, tool: ${counts.tool}, queued: ${queuedFinal}`
    );
  } catch (err) {
    error(`[netease-bee] dispatch failed \u2014 error: ${String(err)}`);
  }
}

// ../../../../private/var/folders/6x/3ly9x_r91n79twv0l75cwbn40000gp/T/openclaw-plugin-staging-CMUoTs/openclaw-plugin-source-tAtRWx/src/monitor.ts
var monitorStates = /* @__PURE__ */ new Map();
var lastTimestamps = /* @__PURE__ */ new Map();
async function monitorBeeProvider(params) {
  const { cfg, runtime, abortSignal } = params;
  const beeCfg = cfg.channels?.["netease-bee"];
  if (!beeCfg?.clientId || !beeCfg?.secret) {
    console.error("[netease-bee] credentials not configured");
    return;
  }
  const monitorKey = beeCfg.clientId;
  if (monitorStates.has(monitorKey)) {
    throw new Error(`NetEase Bee monitor already running for ${monitorKey}`);
  }
  console.log(`[netease-bee] monitor starting \u2014 account: ${monitorKey}`);
  const client = await createBeeClient(beeCfg);
  const loginSuccess = await client.login();
  if (!loginSuccess) {
    console.error("[netease-bee] login failed \u2014 monitor not started");
    client.destroy();
    return;
  }
  console.log(`[netease-bee] login successful \u2014 account: ${monitorKey}`);
  const abortController = new AbortController();
  const state = { running: true, abortController };
  monitorStates.set(monitorKey, state);
  let lastProcessedTimestamp = lastTimestamps.get(monitorKey) ?? 0;
  client.onMessage(async (rawMessages) => {
    if (!state.running) return;
    for (const rawMsg of rawMessages) {
      try {
        const msg = parseBeeMessage(
          rawMsg,
          beeCfg.clientId,
          lastProcessedTimestamp
        );
        if (!msg) continue;
        if (msg.timestamp > lastProcessedTimestamp) {
          lastProcessedTimestamp = msg.timestamp;
          lastTimestamps.set(monitorKey, lastProcessedTimestamp);
        }
        console.log(
          `[netease-bee] received message \u2014 sender: ${msg.senderId}, chat: ${msg.chatId}, id: ${msg.msgId}`
        );
        await handleBeeMessage({ cfg, runtime, message: msg, config: beeCfg });
      } catch (err) {
        console.error(`[netease-bee] message handling failed \u2014 error: ${String(err)}`);
      }
    }
  });
  client.onConnectionChange((status) => {
    console.log(`[netease-bee] connection status changed \u2014 status: ${status}`);
    if (status === "kickout") {
      console.warn("[netease-bee] account kicked out \u2014 stopping monitor");
      stopBeeMonitor(beeCfg);
    }
  });
  console.log(`[netease-bee] monitor started \u2014 account: ${monitorKey}`);
  await new Promise((resolve) => {
    const onAbort = () => {
      console.log("[netease-bee] abort signal received \u2014 stopping monitor");
      stopBeeMonitor(beeCfg).finally(resolve);
    };
    if (abortSignal?.aborted) {
      onAbort();
      return;
    }
    if (abortSignal) abortSignal.addEventListener("abort", onAbort, { once: true });
    abortController.signal.addEventListener("abort", () => resolve(), { once: true });
  });
}
async function stopBeeMonitor(config) {
  const state = monitorStates.get(config.clientId);
  if (!state) return;
  state.running = false;
  monitorStates.delete(config.clientId);
  state.abortController.abort();
  console.log(`[netease-bee] monitor stopped \u2014 account: ${config.clientId}`);
}
function isBeeMonitorRunning(config) {
  return monitorStates.has(config.clientId);
}

// ../../../../private/var/folders/6x/3ly9x_r91n79twv0l75cwbn40000gp/T/openclaw-plugin-staging-CMUoTs/openclaw-plugin-source-tAtRWx/src/outbound.ts
async function sendBeeOutbound(params) {
  const { cfg, chatId, text } = params;
  const beeCfg = cfg.channels?.["netease-bee"];
  if (!beeCfg?.clientId || !beeCfg?.secret) {
    return { channel: "netease-bee", ok: false, error: "netease-bee channel not configured" };
  }
  const result = await sendBeeText(beeCfg, chatId, text);
  return { channel: "netease-bee", ok: result.success, error: result.error };
}
async function sendBeeOutboundMedia(params) {
  const { cfg, chatId, text, mediaUrl } = params;
  const parts = [];
  if (text) parts.push(text);
  if (mediaUrl) parts.push(mediaUrl);
  if (parts.length === 0) {
    return { channel: "netease-bee", ok: true };
  }
  return sendBeeOutbound({ cfg, chatId, text: parts.join("\n") });
}
var beeOutboundConfig = {
  deliveryMode: "direct",
  sendText: async (params) => {
    if (!params.text) return { messageId: "" };
    const result = await sendBeeOutbound({ cfg: params.cfg, chatId: params.to, text: params.text });
    if (!result.ok) throw new Error(result.error ?? "netease-bee send failed");
    return { messageId: "" };
  },
  sendMedia: async (params) => {
    const result = await sendBeeOutboundMedia({ cfg: params.cfg, chatId: params.to, text: params.text, mediaUrl: params.mediaUrl });
    if (!result.ok) throw new Error(result.error ?? "netease-bee send failed");
    return { messageId: "" };
  }
};

// ../../../../private/var/folders/6x/3ly9x_r91n79twv0l75cwbn40000gp/T/openclaw-plugin-staging-CMUoTs/openclaw-plugin-source-tAtRWx/src/channel.ts
var DEFAULT_BEE_ACCOUNT_ID = "default";
function getBeeCfg(cfg) {
  return cfg.channels?.["netease-bee"];
}
var beePlugin = {
  id: "netease-bee",
  meta: {
    id: "netease-bee",
    label: "NetEase Bee",
    selectionLabel: "NetEase Bee (\u5C0F\u871C\u8702)",
    docsPath: "/channels/netease-bee",
    docsLabel: "netease-bee",
    blurb: "\u7F51\u6613\u5C0F\u871C\u8702 IM \u5373\u65F6\u901A\u8BAF\u3002",
    aliases: ["bee", "xiaomifeng"],
    order: 85
  },
  capabilities: {
    chatTypes: ["direct"],
    polls: false,
    threads: false,
    media: false,
    reactions: false,
    edit: false,
    reply: false
  },
  agentPrompt: {
    messageToolHints: () => [
      "- NetEase Bee: always reply to the current conversation (target is auto-inferred).",
      "- Only text messages are supported."
    ]
  },
  reload: { configPrefixes: ["channels.netease-bee"] },
  configSchema: {
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: { type: "boolean" },
        clientId: { type: "string" },
        secret: { type: "string" },
        debug: { type: "boolean" }
      }
    },
    uiHints: {
      enabled: { label: "Enable" },
      clientId: { label: "Client ID (NIM Account)" },
      secret: { label: "Secret (NIM Token)", sensitive: true },
      debug: { label: "Debug Mode", advanced: true }
    }
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
        configured
      };
    },
    defaultAccountId: () => DEFAULT_BEE_ACCOUNT_ID,
    setAccountEnabled: ({ cfg, enabled }) => ({
      ...cfg,
      channels: {
        ...cfg.channels,
        "netease-bee": { ...getBeeCfg(cfg), enabled }
      }
    }),
    deleteAccount: ({ cfg }) => {
      const channels = { ...cfg.channels };
      delete channels["netease-bee"];
      return {
        ...cfg,
        channels: Object.keys(channels).length > 0 ? channels : void 0
      };
    },
    isConfigured: (_account, cfg) => {
      const bee = getBeeCfg(cfg);
      return !!(bee?.clientId && bee?.secret);
    },
    describeAccount: (account) => ({
      accountId: account.accountId,
      enabled: account.enabled,
      configured: account.configured
    }),
    resolveAllowFrom: () => [],
    formatAllowFrom: () => []
  },
  security: {
    resolveDmPolicy: () => ({
      policy: "open",
      allowFrom: [],
      allowFromPath: "channels.netease-bee.",
      approveHint: "netease-bee:<chatId>",
      normalizeEntry: (raw) => raw.trim()
    }),
    collectWarnings: () => []
  },
  setup: {
    resolveAccountId: () => DEFAULT_BEE_ACCOUNT_ID,
    applyAccountConfig: ({ cfg }) => ({
      ...cfg,
      channels: {
        ...cfg.channels,
        "netease-bee": { ...getBeeCfg(cfg), enabled: true }
      }
    })
  },
  messaging: {
    normalizeTarget: (target) => target.trim(),
    targetResolver: {
      looksLikeId: (s) => s.includes("@"),
      hint: "<chatId>"
    }
  },
  outbound: beeOutboundConfig,
  status: {
    defaultRuntime: {
      accountId: DEFAULT_BEE_ACCOUNT_ID,
      running: false,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null
    },
    buildChannelSummary: ({ snapshot }) => ({
      configured: snapshot.configured ?? false,
      running: snapshot.running ?? false,
      connected: snapshot.connected ?? false,
      lastStartAt: snapshot.lastStartAt ?? null,
      lastStopAt: snapshot.lastStopAt ?? null,
      lastError: snapshot.lastError ?? null
    }),
    buildAccountSnapshot: ({ account, runtime }) => ({
      accountId: account.accountId,
      enabled: account.enabled,
      configured: account.configured,
      running: runtime?.running ?? false,
      connected: runtime?.running ?? false,
      lastStartAt: runtime?.lastStartAt ?? null,
      lastStopAt: runtime?.lastStopAt ?? null,
      lastError: runtime?.lastError ?? null
    })
  },
  gateway: {
    startAccount: async (ctx) => {
      const bee = getBeeCfg(ctx.cfg);
      ctx.setStatus({ accountId: ctx.accountId });
      ctx.log?.info(`[netease-bee] provider starting \u2014 account: ${bee?.clientId ?? "unknown"}`);
      return monitorBeeProvider({
        cfg: ctx.cfg,
        runtime: ctx.runtime,
        abortSignal: ctx.abortSignal
      });
    }
  }
};

// ../../../../private/var/folders/6x/3ly9x_r91n79twv0l75cwbn40000gp/T/openclaw-plugin-staging-CMUoTs/openclaw-plugin-source-tAtRWx/index.ts
var plugin = {
  id: "openclaw-netease-bee",
  name: "NetEase Bee",
  description: "NetEase Bee (\u5C0F\u871C\u8702) channel plugin",
  configSchema: emptyPluginConfigSchema(),
  register(api) {
    setBeeRuntime(api.runtime);
    api.registerChannel({ plugin: beePlugin });
  }
};
var openclaw_plugin_source_tAtRWx_default = plugin;
export {
  beeOutboundConfig,
  beePlugin,
  clearAccessToken,
  openclaw_plugin_source_tAtRWx_default as default,
  getAccessToken,
  isBeeMonitorRunning,
  monitorBeeProvider,
  sendBeeOutbound,
  sendBeeText,
  splitMessageIntoChunks,
  stopBeeMonitor
};
