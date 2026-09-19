var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// ../../../../private/var/folders/6x/3ly9x_r91n79twv0l75cwbn40000gp/T/openclaw-plugin-staging-dxrN1K/openclaw-plugin-source-6P3hMg/src/nim-token.ts
function parseNimToken(nimToken) {
  if (!nimToken) return null;
  const separator = nimToken.includes("|") ? "|" : "-";
  const parts = nimToken.split(separator);
  if (parts.length !== 3) return null;
  const [appKey, account, token] = parts.map((part) => part.trim());
  if (!appKey || !account || !token) return null;
  return { appKey, account, token };
}
var init_nim_token = __esm({
  "../../../../private/var/folders/6x/3ly9x_r91n79twv0l75cwbn40000gp/T/openclaw-plugin-staging-dxrN1K/openclaw-plugin-source-6P3hMg/src/nim-token.ts"() {
  }
});

// ../../../../private/var/folders/6x/3ly9x_r91n79twv0l75cwbn40000gp/T/openclaw-plugin-staging-dxrN1K/openclaw-plugin-source-6P3hMg/src/accounts.ts
var accounts_exports = {};
__export(accounts_exports, {
  DEFAULT_NIM_ACCOUNT_ID: () => DEFAULT_NIM_ACCOUNT_ID,
  deriveNimAccountId: () => deriveNimAccountId,
  isNimP2pAllowed: () => isNimP2pAllowed,
  isNimTeamAllowed: () => isNimTeamAllowed,
  isQChatAllowed: () => isQChatAllowed,
  listNimAccountIds: () => listNimAccountIds,
  normalizeNimAllowFrom: () => normalizeNimAllowFrom,
  resolveAllNimAccounts: () => resolveAllNimAccounts,
  resolveNimAccount: () => resolveNimAccount,
  resolveNimAccountById: () => resolveNimAccountById,
  resolveNimAccountByKey: () => resolveNimAccountByKey,
  resolveNimAllowlistMatch: () => resolveNimAllowlistMatch,
  resolveNimCredentials: () => resolveNimCredentials
});
function coerceToString(value) {
  if (typeof value === "number") {
    return String(value);
  }
  return String(value ?? "");
}
function resolveNimCredentials(cfg) {
  const fromToken = parseNimToken(cfg?.nimToken);
  if (fromToken) {
    return fromToken;
  }
  if (!cfg?.appKey || !cfg?.account || !cfg?.token) {
    return null;
  }
  return {
    appKey: coerceToString(cfg.appKey),
    account: coerceToString(cfg.account),
    token: coerceToString(cfg.token)
  };
}
function deriveNimAccountId(cfg) {
  const creds = resolveNimCredentials(cfg);
  if (!creds) return null;
  return `${creds.appKey}:${creds.account}`;
}
function resolveConfigKey(entryKey, inst) {
  const normalized = entryKey.trim();
  if (normalized) return normalized;
  return deriveNimAccountId(inst) ?? "";
}
function resolveInstance(entryKey, inst) {
  const creds = resolveNimCredentials(inst);
  const runtimeAccountId = creds ? `${creds.appKey}:${creds.account}` : "";
  const configKey = resolveConfigKey(entryKey, inst) || runtimeAccountId;
  return {
    id: configKey,
    accountId: configKey,
    configKey,
    runtimeAccountId,
    appKey: creds?.appKey ?? coerceToString(inst.appKey),
    account: creds?.account ?? coerceToString(inst.account),
    token: creds?.token ?? "",
    enabled: inst.enabled ?? false,
    configured: Boolean(creds),
    p2pPolicy: inst.p2p?.policy ?? "open",
    allowFrom: inst.p2p?.allowFrom ?? [],
    teamPolicy: inst.team?.policy ?? "open",
    teamIds: inst.team?.allowFrom ?? [],
    config: inst
  };
}
function resolveAllNimAccounts(params) {
  const { cfg } = params;
  const nimCfg = cfg.channels?.nim;
  if (!nimCfg) return [];
  const accounts = nimCfg.accounts;
  if (accounts && typeof accounts === "object") {
    const entries = Object.entries(
      accounts
    );
    if (entries.length > 0) {
      return entries.map(([entryKey, inst]) => resolveInstance(entryKey, inst));
    }
  }
  return [];
}
function resolveNimAccountById(params) {
  const { cfg, accountId } = params;
  const all = resolveAllNimAccounts({ cfg });
  const normalizedAccountId = accountId.trim();
  const found = all.find(
    (a) => a.accountId === normalizedAccountId || a.configKey === normalizedAccountId || a.runtimeAccountId === normalizedAccountId
  );
  if (found) return found;
  return {
    id: normalizedAccountId,
    accountId: normalizedAccountId,
    configKey: normalizedAccountId,
    runtimeAccountId: normalizedAccountId,
    appKey: "",
    account: "",
    token: "",
    enabled: false,
    configured: false,
    p2pPolicy: "open",
    allowFrom: [],
    teamPolicy: "open",
    teamIds: [],
    config: {}
  };
}
function resolveNimAccountByKey(params) {
  return resolveNimAccountById(params);
}
function listNimAccountIds(cfg) {
  return resolveAllNimAccounts({ cfg }).map((a) => a.accountId);
}
function resolveNimAccount(params) {
  const { cfg, accountId } = params;
  if (accountId) {
    return resolveNimAccountById({ cfg, accountId });
  }
  const all = resolveAllNimAccounts({ cfg });
  if (all.length > 0) return all[0];
  return resolveNimAccountById({ cfg, accountId: "" });
}
function normalizeNimAllowFrom(configAllowFrom) {
  const combined = (configAllowFrom ?? []).map((v) => String(v).trim().toLowerCase()).filter(Boolean);
  const hasWildcard = combined.includes("*");
  const entries = new Set(combined.filter((e) => e !== "*"));
  return { hasWildcard, hasEntries: entries.size > 0, entries };
}
function resolveNimAllowlistMatch(params) {
  const { senderId } = params;
  const { hasWildcard, entries } = normalizeNimAllowFrom(params.allowFrom);
  if (hasWildcard) {
    return { allowed: true, matchedEntry: "*", matchSource: "wildcard" };
  }
  const normalizedSenderId = senderId.toLowerCase();
  if (entries.has(normalizedSenderId)) {
    return {
      allowed: true,
      matchedEntry: normalizedSenderId,
      matchSource: "id"
    };
  }
  return { allowed: false };
}
function isNimP2pAllowed(params) {
  const { p2pPolicy, senderId } = params;
  if (p2pPolicy === "disabled") {
    return { allowed: false, reason: "disabled" };
  }
  if (p2pPolicy === "open") {
    return { allowed: true };
  }
  if (!params.allowFrom || params.allowFrom.length === 0) {
    return { allowed: false, reason: "disabled" };
  }
  const match = resolveNimAllowlistMatch({
    allowFrom: params.allowFrom,
    senderId
  });
  if (match.allowed) {
    return { allowed: true };
  }
  return { allowed: false, reason: "blocked" };
}
function isNimTeamAllowed(params) {
  const { teamPolicy, teamIds, groupId, senderId, sessionType } = params;
  if (teamPolicy === "disabled") return false;
  if (teamPolicy === "open") return true;
  if (!teamIds || teamIds.length === 0) return false;
  const nGroupId = groupId.toLowerCase();
  const nSenderId = senderId.toLowerCase();
  return teamIds.some((entry) => {
    const parts = String(entry).split("|");
    const first = parts[0].trim();
    let entryType = null;
    let entryTeamId;
    let entrySender;
    if (first === "1" || first === "2") {
      entryType = first;
      entryTeamId = (parts[1] ?? "").trim().toLowerCase();
      entrySender = (parts[2] ?? "").trim().toLowerCase();
    } else {
      entryTeamId = first.toLowerCase();
      entrySender = (parts[1] ?? "").trim().toLowerCase();
    }
    if (entryType !== null) {
      const expectedType = entryType === "1" ? "team" : "superTeam";
      if (sessionType !== expectedType) return false;
    }
    if (entryTeamId !== nGroupId) return false;
    return !entrySender || entrySender === nSenderId;
  });
}
function isQChatAllowed(params) {
  const { policy, allowFrom, serverId, channelId, senderAccid } = params;
  if (policy === "disabled") return { allowed: false, reason: "disabled" };
  if (policy === "open") return { allowed: true };
  if (!allowFrom || allowFrom.length === 0)
    return { allowed: false, reason: "disabled" };
  const nServer = serverId.toLowerCase();
  const nChannel = channelId.toLowerCase();
  const nSender = senderAccid.toLowerCase();
  const matched = allowFrom.some((entry) => {
    const parts = String(entry).split("|");
    const entryServer = parts[0].trim().toLowerCase();
    const entryChannel = (parts[1] ?? "").trim().toLowerCase();
    const entrySender = (parts[2] ?? "").trim().toLowerCase();
    if (entryServer !== nServer) return false;
    if (entryChannel && entryChannel !== nChannel) return false;
    if (entrySender && entrySender !== nSender) return false;
    return true;
  });
  if (matched) return { allowed: true };
  return { allowed: false, reason: "no_match", allowFrom };
}
var DEFAULT_NIM_ACCOUNT_ID;
var init_accounts = __esm({
  "../../../../private/var/folders/6x/3ly9x_r91n79twv0l75cwbn40000gp/T/openclaw-plugin-staging-dxrN1K/openclaw-plugin-source-6P3hMg/src/accounts.ts"() {
    init_nim_token();
    DEFAULT_NIM_ACCOUNT_ID = "default";
  }
});

// ../../../../private/var/folders/6x/3ly9x_r91n79twv0l75cwbn40000gp/T/openclaw-plugin-staging-dxrN1K/openclaw-plugin-source-6P3hMg/src/targets.ts
function normalizeNimTarget(target) {
  if (!target || typeof target !== "string") {
    return null;
  }
  let normalized = target.trim();
  const prefixes = [
    "superTeam:",
    "nim:qchat:",
    "nim:",
    "user:",
    "account:",
    "p2p:",
    "team:"
  ];
  for (const prefix of prefixes) {
    if (normalized.toLowerCase().startsWith(prefix.toLowerCase())) {
      normalized = normalized.slice(prefix.length);
      break;
    }
  }
  normalized = normalized.trim();
  if (!normalized) {
    return null;
  }
  return normalized;
}
function parseNimTarget(target) {
  if (!target || typeof target !== "string") {
    return null;
  }
  const trimmed = target.trim().toLowerCase();
  if (trimmed.startsWith("superteam:")) {
    const id2 = target.trim().slice("superTeam:".length).trim();
    return id2 ? { id: id2, sessionType: "superTeam" } : null;
  }
  if (trimmed.startsWith("team:")) {
    const id2 = target.trim().slice("team:".length).trim();
    return id2 ? { id: id2, sessionType: "team" } : null;
  }
  const id = normalizeNimTarget(target);
  return id ? { id, sessionType: "p2p" } : null;
}
function looksLikeNimId(value) {
  if (!value || typeof value !== "string") {
    return false;
  }
  const lc = value.trim().toLowerCase();
  if (lc.startsWith("team:") || lc.startsWith("superteam:")) {
    const parsed = parseNimTarget(value);
    return parsed !== null && parsed.id.length > 0;
  }
  const normalized = normalizeNimTarget(value);
  if (!normalized) {
    return false;
  }
  return /^[a-zA-Z0-9_]{1,32}$/.test(normalized);
}
function formatNimTarget(target) {
  const normalized = normalizeNimTarget(target);
  if (!normalized) {
    return target;
  }
  return `nim:${normalized}`;
}
var init_targets = __esm({
  "../../../../private/var/folders/6x/3ly9x_r91n79twv0l75cwbn40000gp/T/openclaw-plugin-staging-dxrN1K/openclaw-plugin-source-6P3hMg/src/targets.ts"() {
  }
});

// ../../../../private/var/folders/6x/3ly9x_r91n79twv0l75cwbn40000gp/T/openclaw-plugin-staging-dxrN1K/openclaw-plugin-source-6P3hMg/src/client.ts
var client_exports = {};
__export(client_exports, {
  clearNimClientCache: () => clearNimClientCache,
  createNimClient: () => createNimClient,
  getCachedNimClient: () => getCachedNimClient
});
import NIM from "@yxim/nim-bot";
function convertMessageType(v2Type) {
  const typeMap = {
    0: "text",
    1: "image",
    2: "audio",
    3: "video",
    4: "geo",
    5: "notification",
    6: "file",
    10: "tip",
    11: "robot",
    100: "custom"
  };
  return typeMap[v2Type] || "unknown";
}
function parseConversationId(conversationId) {
  const parts = conversationId.split("|");
  if (parts.length >= 3) {
    const typeNum = parseInt(parts[1], 10);
    const sessionType = typeNum === 1 ? "p2p" : typeNum === 2 ? "team" : typeNum === 3 ? "superTeam" : "p2p";
    return { sessionType, targetId: parts[2] };
  }
  return { sessionType: "p2p", targetId: "" };
}
function buildConversationId(nim, accountId, sessionType) {
  const conversationIdUtil = nim.V2NIMConversationIdUtil;
  if (conversationIdUtil) {
    switch (sessionType) {
      case "p2p":
        return conversationIdUtil.p2pConversationId(accountId) || "";
      case "team":
        return conversationIdUtil.teamConversationId(accountId) || "";
      case "superTeam":
        return conversationIdUtil.superTeamConversationId(accountId) || "";
      default:
        return conversationIdUtil.p2pConversationId(accountId) || "";
    }
  }
  const typeNum = sessionType === "p2p" ? 1 : sessionType === "team" ? 2 : 3;
  return `0|${typeNum}|${accountId}`;
}
function parseV2Attachment(msg) {
  const attachment = msg.attachment;
  if (!attachment) return void 0;
  return {
    name: attachment.name,
    size: attachment.size,
    url: attachment.url,
    ext: attachment.ext,
    md5: attachment.md5,
    w: attachment.width,
    h: attachment.height,
    dur: attachment.duration
  };
}
function convertV2ToMessageEvent(msg) {
  const { sessionType } = parseConversationId(msg.conversationId || "");
  const forcePushAccountIds = msg.pushConfig?.forcePushAccountIds ?? void 0;
  return {
    msgId: String(msg.messageServerId || msg.messageClientId || ""),
    clientMsgId: String(msg.messageClientId || ""),
    sessionType,
    from: String(msg.senderId || ""),
    to: String(msg.receiverId || ""),
    type: convertMessageType(msg.messageType),
    text: msg.text || "",
    time: msg.createTime || Date.now(),
    attach: parseV2Attachment(msg),
    ext: msg.serverExtension ? JSON.parse(msg.serverExtension) : void 0,
    forcePushAccountIds,
    threadReply: msg.threadReply ?? void 0,
    fromNick: msg.senderName || void 0,
    rawMsg: msg
  };
}
async function createNimClient(cfg) {
  const creds = resolveNimCredentials(cfg);
  if (!creds) {
    throw new Error("NIM credentials not configured");
  }
  const cacheKey = `${creds.appKey}:${creds.account}`;
  const cached = clientCache.get(cacheKey);
  if (cached && cached.initialized) {
    return cached;
  }
  const privateConf = {};
  const adv = cfg.advanced;
  if (adv?.weblbsUrl) privateConf.weblbsUrl = adv.weblbsUrl;
  if (adv?.link_web) privateConf.link_web = adv.link_web;
  if (adv?.nos_uploader) privateConf.nos_uploader = adv.nos_uploader;
  if (adv?.nos_downloader_v2) privateConf.nos_downloader_v2 = adv.nos_downloader_v2;
  if (adv?.nosSsl !== void 0) privateConf.nosSsl = adv.nosSsl;
  if (adv?.nos_accelerate) privateConf.nos_accelerate = adv.nos_accelerate;
  if (adv?.nos_accelerate_host !== void 0) privateConf.nos_accelerate_host = adv.nos_accelerate_host;
  const otherOptions = {};
  if (Object.keys(privateConf).length > 0) {
    otherOptions.privateConf = privateConf;
  }
  if (adv?.weblbsUrl || adv?.link_web) {
    const loginServiceConfig = {};
    if (adv?.weblbsUrl) loginServiceConfig.lbsUrls = [adv.weblbsUrl];
    if (adv?.link_web) loginServiceConfig.linkUrl = adv.link_web;
    otherOptions.V2NIMLoginServiceConfig = loginServiceConfig;
  }
  const nim = new NIM(
    {
      appkey: creds.appKey,
      apiVersion: "v2",
      debugLevel: cfg.advanced?.debug ? "debug" : "off"
    },
    Object.keys(otherOptions).length > 0 ? otherOptions : void 0
  );
  if (Object.keys(privateConf).length > 0) {
    console.log(`[nim] privateConf applied \u2014 keys: ${Object.keys(privateConf).join(", ")}`);
  }
  let loggedIn = false;
  const msgCallbackSet = /* @__PURE__ */ new Set();
  const connCallbackSet = /* @__PURE__ */ new Set();
  messageCallbacks.set(cacheKey, msgCallbackSet);
  connectionCallbacks.set(cacheKey, connCallbackSet);
  const loginService = nim.V2NIMLoginService;
  const messageService = nim.V2NIMMessageService;
  const messageCreator = nim.V2NIMMessageCreator;
  const friendService = nim.V2NIMFriendService;
  let liveP2pPolicy = cfg.p2p?.policy ?? "open";
  let liveP2pAllowFrom = cfg.p2p?.allowFrom ?? [];
  if (friendService) {
    friendService.on("onFriendAddApplication", async (application) => {
      const applicantId = String(application.applicantAccountId ?? "");
      if (!applicantId) {
        console.log("[nim] friend request ignored \u2014 missing applicant id");
        return;
      }
      console.log(`[nim] friend request received \u2014 applicant: ${applicantId}`);
      const check = isNimP2pAllowed({
        p2pPolicy: liveP2pPolicy,
        allowFrom: liveP2pAllowFrom,
        senderId: applicantId
      });
      if (!check.allowed) {
        console.log(
          `[nim] friend request not auto-accepted \u2014 applicant: ${applicantId}, reason: ${check.reason ?? "policy"}`
        );
        return;
      }
      try {
        await friendService.acceptAddApplication(application);
        console.log(`[nim] friend request auto-accepted \u2014 applicant: ${applicantId}`);
      } catch (err) {
        const errorMessage = err?.message ?? err?.desc ?? String(err);
        console.error(`[nim] friend request accept failed \u2014 applicant: ${applicantId}, error: ${errorMessage}`);
      }
    });
    console.log(`[nim] friend request listener registered \u2014 policy: ${liveP2pPolicy}`);
  }
  if (!loginService || !messageService) {
    throw new Error("NIM SDK V2 services not available");
  }
  messageService.on("onReceiveMessages", (messages) => {
    console.log(`[nim] received messages \u2014 count: ${messages.length}`);
    const p2pMessages = [];
    const teamMessages = [];
    for (const msg of messages) {
      const event = convertV2ToMessageEvent(msg);
      console.log(
        `[nim] received message \u2014 sender: ${event.from}, type: ${event.type}, session: ${event.sessionType}, target: ${event.to}, message id: ${event.msgId}, timestamp: ${event.time}`
      );
      msgCallbackSet.forEach((cb) => cb(event));
      if (event.sessionType === "p2p") {
        p2pMessages.push(msg);
      } else if (event.sessionType === "team" || event.sessionType === "superTeam") {
        teamMessages.push(msg);
      }
    }
    for (const msg of p2pMessages) {
      messageService.sendP2PMessageReceipt(msg).catch((err) => {
        console.error(`[nim] send p2p read receipt failed \u2014 error: ${err?.message ?? String(err)}`);
      });
    }
    for (let i = 0; i < teamMessages.length; i += 50) {
      const batch = teamMessages.slice(i, i + 50);
      messageService.sendTeamMessageReceipts(batch).catch((err) => {
        console.error(`[nim] send team read receipt failed \u2014 error: ${err?.message ?? String(err)}`);
      });
    }
  });
  messageService.on("onSendMessage", (msg) => {
    console.log(
      `[nim] send status update \u2014 message id: ${msg.messageClientId ?? "unknown"}, state: ${msg.sendingState}`
    );
  });
  loginService.on("onLoginStatus", (status) => {
    console.log(`[nim] login status changed \u2014 status: ${status}`);
    if (status === 1) {
      loggedIn = true;
      connCallbackSet.forEach((cb) => cb("connected"));
    } else if (status === 0) {
      loggedIn = false;
      connCallbackSet.forEach((cb) => cb("logout"));
    }
  });
  loginService.on("onKickedOffline", (detail) => {
    const detailMessage = detail?.reasonDesc ?? detail?.reason ?? String(detail);
    console.log(`[nim] kicked offline \u2014 reason: ${detailMessage}`);
    loggedIn = false;
    connCallbackSet.forEach((cb) => cb("kickout"));
  });
  loginService.on("onDisconnected", (error) => {
    const errorMessage = error?.message ?? error?.desc ?? String(error);
    console.log(`[nim] disconnected \u2014 error: ${errorMessage}`);
    connCallbackSet.forEach((cb) => cb("disconnected"));
  });
  const instance = {
    initialized: true,
    loggedIn: false,
    account: creds.account,
    nativeNim: nim,
    updateP2pPolicy(policy, allowFrom) {
      liveP2pPolicy = policy;
      liveP2pAllowFrom = allowFrom;
    },
    async login() {
      try {
        const legacyLogin = cfg.advanced?.legacyLogin ?? false;
        const aiBotValue = legacyLogin ? 0 : 2;
        console.log(
          `[nim] login started \u2014 account: ${creds.account}, aiBot: ${aiBotValue} (legacyLogin: ${legacyLogin})`
        );
        await loginService.login(creds.account, creds.token, {
          aiBot: aiBotValue
        });
        loggedIn = true;
        instance.loggedIn = true;
        console.log(
          [
            "[nim]",
            "\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557",
            "\u2551   \u2713 NIM LOGIN SUCCESSFUL             \u2551",
            `\u2551   account : ${creds.account.padEnd(22)}\u2551`,
            `\u2551   aiBot   : ${String(aiBotValue).padEnd(22)}\u2551`,
            "\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D",
            ""
          ].join("\n")
        );
        return true;
      } catch (error) {
        const errorMessage = error?.message ?? error?.desc ?? String(error);
        const errorCode = error?.code ?? error?.res_code;
        console.error(
          [
            "",
            "\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557",
            "\u2551   \u2717 NIM LOGIN FAILED                 \u2551",
            `\u2551   account : ${creds.account.padEnd(22)}\u2551`,
            `\u2551   error   : ${errorMessage.slice(0, 22).padEnd(22)}\u2551`,
            "\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D",
            ""
          ].join("\n")
        );
        return false;
      }
    },
    async logout() {
      try {
        await loginService.logout();
        loggedIn = false;
        instance.loggedIn = false;
        console.log(`[nim] logout complete \u2014 account: ${creds.account}`);
      } catch (error) {
        const errorMessage = error?.message ?? String(error);
        console.error(`[nim] logout failed \u2014 error: ${errorMessage}`);
      }
    },
    async sendText(to, text, sessionType = "p2p") {
      try {
        const message = messageCreator?.createTextMessage(text);
        if (!message) {
          return { success: false, error: "Failed to create text message" };
        }
        const conversationId = buildConversationId(nim, to, sessionType);
        console.log(`[nim] sending text \u2014 target: ${conversationId}, session: ${sessionType}, length: ${text.length}`);
        return new Promise((resolve) => {
          let sendCallbackFired = false;
          const messageClientId = message.messageClientId;
          const sendListener = (msg) => {
            if (msg.messageClientId !== messageClientId) return;
            if (msg.sendingState === 3) {
              console.log(`[nim] text sending (intermediate) \u2014 messageClientId: ${messageClientId}`);
              return;
            }
            if (sendCallbackFired) return;
            sendCallbackFired = true;
            messageService.off("onSendMessage", sendListener);
            const errorCode = msg.messageStatus?.errorCode;
            const isFailed = msg.sendingState === 2 || msg.sendingState === 1 && errorCode !== 200;
            if (isFailed) {
              const errorMessage = msg.messageStatus?.errorDesc || `\u53D1\u9001\u5931\u8D25(${errorCode})`;
              console.error(
                `[nim] text send failed (callback) \u2014 error: ${errorMessage}, code: ${errorCode}, messageServerId: ${msg.messageServerId}`
              );
              resolve({
                success: false,
                error: errorMessage,
                errorCode
              });
            } else {
              console.log(`[nim] text sent (callback) \u2014 message id: ${msg.messageServerId ?? "unknown"}`);
              resolve({
                success: true,
                msgId: msg.messageServerId,
                clientMsgId: msg.messageClientId
              });
            }
          };
          messageService.on("onSendMessage", sendListener);
          messageService.sendMessage(message, conversationId, {
            antispamConfig: {
              antispamEnabled: cfg.antispamEnabled ?? true
            }
          }).catch((error) => {
            if (!sendCallbackFired) {
              sendCallbackFired = true;
              messageService.off("onSendMessage", sendListener);
              const errorMessage = error?.message ?? error?.desc ?? String(error);
              const errorCode = error?.code ?? error?.res_code;
              console.error(
                `[nim] text send failed (sync) \u2014 error: ${errorMessage}${errorCode ? ` (code: ${errorCode})` : ""}`
              );
              resolve({
                success: false,
                error: errorMessage,
                errorCode
              });
            }
          });
          setTimeout(() => {
            if (!sendCallbackFired) {
              sendCallbackFired = true;
              messageService.off("onSendMessage", sendListener);
              console.error(`[nim] text send timeout \u2014 messageClientId: ${messageClientId}`);
              resolve({
                success: false,
                error: "\u53D1\u9001\u8D85\u65F6",
                errorCode: 508
              });
            }
          }, 3e4);
        });
      } catch (error) {
        const errorMessage = error?.message ?? error?.desc ?? String(error);
        const errorCode = error?.code ?? error?.res_code;
        console.error(`[nim] text send failed \u2014 error: ${errorMessage}${errorCode ? ` (code: ${errorCode})` : ""}`);
        return {
          success: false,
          error: errorMessage,
          errorCode
        };
      }
    },
    async sendImage(to, filePath, sessionType = "p2p") {
      try {
        const { basename } = await import("path");
        const message = messageCreator?.createImageMessage(filePath, basename(filePath));
        if (!message) {
          return { success: false, error: "Failed to create image message" };
        }
        const conversationId = buildConversationId(nim, to, sessionType);
        console.log(
          `[nim] sending image \u2014 target: ${conversationId}, session: ${sessionType}, file: ${basename(filePath)}`
        );
        const result = await messageService.sendMessage(message, conversationId, {});
        return {
          success: true,
          msgId: result.message?.messageServerId,
          clientMsgId: result.message?.messageClientId
        };
      } catch (error) {
        const errorMessage = error?.message ?? error?.desc ?? String(error);
        const errorCode = error?.code ?? error?.res_code;
        console.error(`[nim] image send failed \u2014 error: ${errorMessage}${errorCode ? ` (code: ${errorCode})` : ""}`);
        return {
          success: false,
          error: errorMessage,
          errorCode
        };
      }
    },
    async sendFile(to, filePath, sessionType = "p2p") {
      try {
        const { basename } = await import("path");
        const message = messageCreator?.createFileMessage(filePath, basename(filePath));
        if (!message) {
          return { success: false, error: "Failed to create file message" };
        }
        const conversationId = buildConversationId(nim, to, sessionType);
        console.log(
          `[nim] sending file \u2014 target: ${conversationId}, session: ${sessionType}, file: ${basename(filePath)}`
        );
        const result = await messageService.sendMessage(message, conversationId, {});
        return {
          success: true,
          msgId: result.message?.messageServerId,
          clientMsgId: result.message?.messageClientId
        };
      } catch (error) {
        const errorMessage = error?.message ?? error?.desc ?? String(error);
        const errorCode = error?.code ?? error?.res_code;
        console.error(`[nim] file send failed \u2014 error: ${errorMessage}${errorCode ? ` (code: ${errorCode})` : ""}`);
        return {
          success: false,
          error: errorMessage,
          errorCode
        };
      }
    },
    async sendAudio(to, filePath, duration, sessionType = "p2p") {
      try {
        const { basename } = await import("path");
        const message = messageCreator?.createAudioMessage?.(filePath, basename(filePath), "", duration);
        if (!message) {
          return { success: false, error: "Failed to create audio message" };
        }
        const conversationId = buildConversationId(nim, to, sessionType);
        const result = await messageService.sendMessage(message, conversationId, {});
        return {
          success: true,
          msgId: result.message?.messageServerId,
          clientMsgId: result.message?.messageClientId
        };
      } catch (error) {
        const errorMessage = error?.message ?? error?.desc ?? String(error);
        const errorCode = error?.code ?? error?.res_code;
        console.error(`[nim] audio send failed \u2014 error: ${errorMessage}${errorCode ? ` (code: ${errorCode})` : ""}`);
        return {
          success: false,
          error: errorMessage,
          errorCode
        };
      }
    },
    async sendVideo(to, filePath, duration, width, height, sessionType = "p2p") {
      try {
        const { basename } = await import("path");
        const message = messageCreator?.createVideoMessage?.(filePath, basename(filePath), "", duration, width, height);
        if (!message) {
          return { success: false, error: "Failed to create video message" };
        }
        const conversationId = buildConversationId(nim, to, sessionType);
        const result = await messageService.sendMessage(message, conversationId, {});
        return {
          success: true,
          msgId: result.message?.messageServerId,
          clientMsgId: result.message?.messageClientId
        };
      } catch (error) {
        const errorMessage = error?.message ?? error?.desc ?? String(error);
        const errorCode = error?.code ?? error?.res_code;
        console.error(`[nim] video send failed \u2014 error: ${errorMessage}${errorCode ? ` (code: ${errorCode})` : ""}`);
        return {
          success: false,
          error: errorMessage,
          errorCode
        };
      }
    },
    async replyText(to, text, originalMsg, forcePushAccountIds, sessionType = "p2p") {
      try {
        const replyMsg = messageCreator?.createTextMessage(text);
        if (!replyMsg) {
          return {
            success: false,
            error: "Failed to create reply text message"
          };
        }
        const sendParams = {
          pushConfig: {
            forcePush: true,
            forcePushAccountIds
          },
          antispamConfig: {
            antispamEnabled: cfg.antispamEnabled ?? true
          }
        };
        const conversationId = buildConversationId(nim, to, sessionType);
        console.log(
          `[nim] sending reply \u2014 target: ${conversationId}, session: ${sessionType}, force-push: [${forcePushAccountIds.join(", ")}]`
        );
        const result = await messageService.replyMessage(replyMsg, originalMsg, sendParams);
        console.log(`[nim] reply sent \u2014 message id: ${result.message?.messageServerId ?? "unknown"}`);
        return {
          success: true,
          msgId: result.message?.messageServerId,
          clientMsgId: result.message?.messageClientId
        };
      } catch (error) {
        const errorMessage = error?.message ?? error?.desc ?? String(error);
        const errorCode = error?.code ?? error?.res_code;
        console.error(`[nim] reply failed \u2014 error: ${errorMessage}${errorCode ? ` (code: ${errorCode})` : ""}`);
        return {
          success: false,
          error: error.message || error.desc || String(error)
        };
      }
    },
    async sendStreamMessage(params) {
      try {
        const { to, sessionType = "p2p", baseMessage, streamChunkParams } = params;
        let message = baseMessage;
        if (!message) {
          message = messageCreator?.createTextMessage(streamChunkParams.text);
          if (!message) {
            return {
              success: false,
              error: "Failed to create base message for stream"
            };
          }
        }
        const conversationId = buildConversationId(nim, to, sessionType);
        const result = await messageService.sendStreamMessage(
          message,
          // 基础消息体（复用）
          conversationId,
          // 会话 ID
          {},
          // sendParams
          streamChunkParams
          // 流式分片参数（包含实际文本内容）
        );
        return {
          success: true,
          msgId: result.messageServerId,
          clientMsgId: result.messageClientId,
          baseMessage: result
        };
      } catch (error) {
        const errorMessage = error?.message ?? error?.desc ?? String(error);
        const errorCode = error?.code ?? error?.res_code;
        console.error(
          `[nim] stream message failed \u2014 error: ${errorMessage}${errorCode ? ` (code: ${errorCode})` : ""}`
        );
        return {
          success: false,
          error: error.message || error.desc || String(error)
        };
      }
    },
    onMessage(callback) {
      msgCallbackSet.add(callback);
    },
    offMessage(callback) {
      msgCallbackSet.delete(callback);
    },
    onConnectionChange(callback) {
      connCallbackSet.add(callback);
    },
    async destroy() {
      await instance.logout();
      await nim.destroy();
      clientCache.delete(cacheKey);
      messageCallbacks.delete(cacheKey);
      connectionCallbacks.delete(cacheKey);
    }
  };
  clientCache.set(cacheKey, instance);
  return instance;
}
function getCachedNimClient(cfg) {
  const creds = resolveNimCredentials(cfg);
  if (!creds) return void 0;
  const cacheKey = `${creds.appKey}:${creds.account}`;
  return clientCache.get(cacheKey);
}
async function clearNimClientCache(cfg) {
  if (cfg) {
    const creds = resolveNimCredentials(cfg);
    if (!creds) return;
    const cacheKey = `${creds.appKey}:${creds.account}`;
    const client = clientCache.get(cacheKey);
    if (client) {
      await client.destroy();
    }
  } else {
    for (const client of clientCache.values()) {
      await client.destroy();
    }
    clientCache.clear();
  }
}
var clientCache, messageCallbacks, connectionCallbacks;
var init_client = __esm({
  "../../../../private/var/folders/6x/3ly9x_r91n79twv0l75cwbn40000gp/T/openclaw-plugin-staging-dxrN1K/openclaw-plugin-source-6P3hMg/src/client.ts"() {
    init_accounts();
    clientCache = /* @__PURE__ */ new Map();
    messageCallbacks = /* @__PURE__ */ new Map();
    connectionCallbacks = /* @__PURE__ */ new Map();
  }
});

// ../../../../private/var/folders/6x/3ly9x_r91n79twv0l75cwbn40000gp/T/openclaw-plugin-staging-dxrN1K/openclaw-plugin-source-6P3hMg/src/send.ts
import { V2NIMConst } from "@yxim/nim-bot";
function getNimErrorDescription(errorCode, _errorMessage) {
  if (errorCode === void 0) {
    return "\u53D1\u9001\u5931\u8D25";
  }
  const code = typeof errorCode === "string" ? parseInt(errorCode, 10) : errorCode;
  if (isNaN(code)) {
    return "\u53D1\u9001\u5931\u8D25";
  }
  if (ERROR_CODE_DESCRIPTIONS[code]) {
    return ERROR_CODE_DESCRIPTIONS[code];
  }
  if (V2NIMConst?.V2NIMErrorDesc && V2NIMConst.V2NIMErrorDesc[code]) {
    return V2NIMConst.V2NIMErrorDesc[code];
  }
  return "\u53D1\u9001\u5931\u8D25";
}
function formatSendFailureMessage(errorCode, errorMessage) {
  const description = getNimErrorDescription(errorCode, errorMessage);
  const codeStr = errorCode !== void 0 ? String(errorCode) : "unknown";
  if (description.includes(`(${codeStr})`)) {
    return `\u6D88\u606F\u53D1\u9001\u5931\u8D25\uFF1A${description}`;
  }
  return `\u6D88\u606F\u53D1\u9001\u5931\u8D25\uFF1A${description}(${codeStr})`;
}
function resolveInstCfg(cfg, accountId) {
  if (accountId) {
    const acct = resolveNimAccountById({ cfg, accountId });
    return acct.configured ? acct.config : null;
  }
  const all = resolveAllNimAccounts({ cfg });
  return all.find((a) => a.configured)?.config ?? null;
}
async function sendMessageNim(params) {
  const { cfg, to, text, sessionType = "p2p", accountId } = params;
  const nimCfg = resolveInstCfg(cfg, accountId);
  if (!nimCfg) {
    return { success: false, error: "NIM channel not configured" };
  }
  const targetId = normalizeNimTarget(to);
  console.log(
    `[nim] \u{1F50D} sendMessageNim \u2014 accountId: "${accountId ?? "none"}", target: ${targetId}, session: ${sessionType}, account in config: ${nimCfg.account}`
  );
  try {
    let client = getCachedNimClient(nimCfg);
    if (!client || !client.loggedIn) {
      client = await createNimClient(nimCfg);
      await client.login();
    }
    console.log(`[nim] \u2705 sendMessageNim using client \u2014 account: ${client.account}`);
    return await client.sendText(targetId, text, sessionType);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
async function replyMessageNim(params) {
  const { cfg, to, text, originalMsg, forcePushAccountIds, sessionType = "team", accountId } = params;
  const nimCfg = resolveInstCfg(cfg, accountId);
  if (!nimCfg) {
    console.log("[nim] reply skipped \u2014 channel not configured");
    return { success: false, error: "NIM channel not configured" };
  }
  const targetId = normalizeNimTarget(to);
  console.log(
    `[nim] \u{1F50D} replyMessageNim \u2014 accountId: "${accountId ?? "none"}", target: ${targetId}, session: ${sessionType}, force-push: [${forcePushAccountIds.join(", ")}], account in config: ${nimCfg.account}`
  );
  try {
    let client = getCachedNimClient(nimCfg);
    console.log(`[nim] reply client \u2014 cached: ${client ? "yes" : "no"}, logged in: ${client?.loggedIn ? "yes" : "no"}`);
    if (!client || !client.loggedIn) {
      console.log("[nim] reply client initializing");
      client = await createNimClient(nimCfg);
      await client.login();
    }
    console.log(`[nim] \u2705 replyMessageNim using client \u2014 account: ${client.account}`);
    const result = await client.replyText(targetId, text, originalMsg, forcePushAccountIds, sessionType);
    console.log(
      `[nim] reply completed \u2014 message id: ${result.msgId ?? "unknown"}, status: ${result.success ? "sent" : "failed"}`
    );
    return result;
  } catch (error) {
    const errorMessage = error?.message ?? String(error);
    console.error(`[nim] reply exception \u2014 error: ${errorMessage}`);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
async function editMessageNim(params) {
  const { cfg, to, newText, sessionType = "p2p" } = params;
  return sendMessageNim({ cfg, to, text: newText, sessionType });
}
function splitMessageIntoChunks(text, maxLength = MAX_MESSAGE_LENGTH) {
  if (text.length <= maxLength) {
    return [text];
  }
  const chunks = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }
    let splitIndex = remaining.lastIndexOf("\n", maxLength);
    if (splitIndex === -1 || splitIndex < maxLength * 0.5) {
      splitIndex = remaining.lastIndexOf(" ", maxLength);
    }
    if (splitIndex === -1 || splitIndex < maxLength * 0.5) {
      splitIndex = maxLength;
    }
    chunks.push(remaining.slice(0, splitIndex));
    remaining = remaining.slice(splitIndex).trimStart();
  }
  return chunks;
}
async function sendStreamMessageNim(params) {
  const { cfg, to, text, sessionType = "p2p", chunkIndex, isComplete, baseMessage, accountId } = params;
  const nimCfg = resolveInstCfg(cfg, accountId);
  console.log(
    `[nim] \u{1F50D} sendStreamMessageNim \u2014 accountId: "${accountId ?? "none"}", target: ${to}, session: ${sessionType}, chunk: ${chunkIndex}, complete: ${isComplete}, account in config: ${nimCfg?.account}`
  );
  if (!nimCfg) {
    return { success: false, error: "NIM channel not configured" };
  }
  const targetId = normalizeNimTarget(to);
  try {
    let client = getCachedNimClient(nimCfg);
    if (!client || !client.loggedIn) {
      client = await createNimClient(nimCfg);
      await client.login();
    }
    const sendParams = {
      to: targetId,
      sessionType,
      baseMessage,
      // 传递基础消息体
      streamChunkParams: {
        text,
        // 流式文本内容通过 streamChunkParams 传递
        index: chunkIndex,
        finish: isComplete ? 1 : 0
      }
    };
    return await client.sendStreamMessage(sendParams);
  } catch (error) {
    console.error(`[nim] stream message failed \u2014 error: ${error}`);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
async function replyStreamMessageNim(params) {
  const { cfg, conversationId, text, chunkIndex, isComplete, baseMessage, replyMessage, accountId } = params;
  const nimCfg = resolveInstCfg(cfg, accountId);
  console.log(
    `[nim] \u{1F50D} replyStreamMessageNim \u2014 accountId: "${accountId ?? "none"}", conversation: ${conversationId}, chunk: ${chunkIndex}, complete: ${isComplete}, account in config: ${nimCfg?.account}`
  );
  if (!nimCfg) {
    return { success: false, error: "NIM channel not configured" };
  }
  try {
    let client = getCachedNimClient(nimCfg);
    if (!client || !client.loggedIn) {
      client = await createNimClient(nimCfg);
      await client.login();
    }
    const streamChunkParams = {
      text,
      // 流式文本内容
      index: chunkIndex,
      finish: isComplete ? 1 : 0
    };
    const messageService = client.nativeNim.V2NIMMessageService;
    let message = baseMessage;
    if (!message) {
      const messageCreator = client.nativeNim.V2NIMMessageCreator;
      message = messageCreator?.createTextMessage(text);
      if (!message) {
        return {
          success: false,
          error: "Failed to create base message"
        };
      }
    }
    const result = await messageService.replyStreamMessage(
      message,
      // 基础消息体（复用）
      replyMessage,
      // 被回复的消息
      {},
      // sendMessageParams
      streamChunkParams
      // 流式分片参数
    );
    return {
      success: true,
      msgId: result?.messageServerId,
      baseMessage: result
    };
  } catch (error) {
    console.error(`[nim] reply stream message failed \u2014 error: ${error}`);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
var ERROR_CODE_DESCRIPTIONS, MAX_MESSAGE_LENGTH;
var init_send = __esm({
  "../../../../private/var/folders/6x/3ly9x_r91n79twv0l75cwbn40000gp/T/openclaw-plugin-staging-dxrN1K/openclaw-plugin-source-6P3hMg/src/send.ts"() {
    init_client();
    init_targets();
    init_accounts();
    ERROR_CODE_DESCRIPTIONS = {
      // 反垃圾
      195001: "\u6D88\u606F\u88AB\u672C\u5730\u53CD\u5783\u573E\u62E6\u622A",
      195002: "\u6D88\u606F\u88AB\u4E91\u7AEF\u53CD\u5783\u573E\u62E6\u622A",
      // 账号
      102404: "\u7528\u6237\u4E0D\u5B58\u5728",
      102426: "\u7528\u6237\u5DF2\u88AB\u62C9\u9ED1",
      102421: "\u7528\u6237\u88AB\u7981\u8A00",
      102422: "\u7528\u6237\u88AB\u7981\u7528",
      // 消息
      107451: "\u6D88\u606F\u547D\u4E2D\u53CD\u5783\u573E",
      107404: "\u6D88\u606F\u4E0D\u5B58\u5728",
      107323: "\u6D88\u606F\u53D1\u9001\u9891\u7387\u8D85\u9650",
      107410: "\u5E94\u7528\u88AB\u7981\u8A00",
      // 群组
      108404: "\u7FA4\u4E0D\u5B58\u5728",
      108306: "\u7FA4\u666E\u901A\u6210\u5458\u7981\u8A00",
      108423: "\u7FA4\u5168\u4F53\u7981\u8A00",
      109424: "\u7FA4\u6210\u5458\u88AB\u7981\u8A00",
      109404: "\u7FA4\u6210\u5458\u4E0D\u5B58\u5728",
      // 通用
      414: "\u53C2\u6570\u9519\u8BEF",
      416: "\u9891\u7387\u8D85\u9650",
      403: "\u6CA1\u6709\u6743\u9650",
      404: "\u8D44\u6E90\u4E0D\u5B58\u5728",
      // 连接
      192001: "\u8FDE\u63A5\u5931\u8D25",
      192002: "\u8FDE\u63A5\u8D85\u65F6",
      192004: "\u534F\u8BAE\u8D85\u65F6",
      191005: "\u8BF7\u6C42\u8D85\u65F6"
    };
    MAX_MESSAGE_LENGTH = 5e3;
  }
});

// ../../../../private/var/folders/6x/3ly9x_r91n79twv0l75cwbn40000gp/T/openclaw-plugin-staging-dxrN1K/openclaw-plugin-source-6P3hMg/src/media.ts
import { extname } from "path";
async function sendImageNim(params) {
  const { cfg, to, imagePath, sessionType = "p2p", accountId } = params;
  const nimCfg = resolveInstCfg(cfg, accountId);
  if (!nimCfg) {
    return { success: false, error: "NIM channel not configured" };
  }
  const targetId = normalizeNimTarget(to);
  try {
    let client = getCachedNimClient(nimCfg);
    if (!client || !client.loggedIn) {
      client = await createNimClient(nimCfg);
      await client.login();
    }
    return await client.sendImage(targetId, imagePath, sessionType);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
async function sendFileNim(params) {
  const { cfg, to, filePath, sessionType = "p2p", accountId } = params;
  const nimCfg = resolveInstCfg(cfg, accountId);
  if (!nimCfg) {
    return { success: false, error: "NIM channel not configured" };
  }
  const targetId = normalizeNimTarget(to);
  try {
    let client = getCachedNimClient(nimCfg);
    if (!client || !client.loggedIn) {
      client = await createNimClient(nimCfg);
      await client.login();
    }
    return await client.sendFile(targetId, filePath, sessionType);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
async function sendAudioNim(params) {
  const { cfg, to, audioPath, duration, sessionType = "p2p", accountId } = params;
  const nimCfg = resolveInstCfg(cfg, accountId);
  if (!nimCfg) {
    return { success: false, error: "NIM channel not configured" };
  }
  const targetId = normalizeNimTarget(to);
  try {
    let client = getCachedNimClient(nimCfg);
    if (!client || !client.loggedIn) {
      client = await createNimClient(nimCfg);
      await client.login();
    }
    return await client.sendAudio(targetId, audioPath, duration, sessionType);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
async function sendVideoNim(params) {
  const {
    cfg,
    to,
    videoPath,
    duration,
    width,
    height,
    sessionType = "p2p",
    accountId
  } = params;
  const nimCfg = resolveInstCfg(cfg, accountId);
  if (!nimCfg) {
    return { success: false, error: "NIM channel not configured" };
  }
  const targetId = normalizeNimTarget(to);
  try {
    let client = getCachedNimClient(nimCfg);
    if (!client || !client.loggedIn) {
      client = await createNimClient(nimCfg);
      await client.login();
    }
    return await client.sendVideo(
      targetId,
      videoPath,
      duration,
      width,
      height,
      sessionType
    );
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
function buildNimMediaPayload(mediaList) {
  if (!mediaList || mediaList.length === 0) {
    return {};
  }
  return {
    MediaAttachments: mediaList.map((m) => ({
      type: m.type,
      url: m.url,
      name: m.name,
      size: m.size
    }))
  };
}
function inferMediaPlaceholder(messageType) {
  switch (messageType) {
    case "image":
      return "[\u56FE\u7247]";
    case "audio":
      return "[\u8BED\u97F3\u6D88\u606F]";
    case "video":
      return "[\u89C6\u9891]";
    case "file":
      return "[\u6587\u4EF6]";
    case "geo":
    case "location":
      return "[\u4F4D\u7F6E]";
    default:
      return "[\u591A\u5A92\u4F53\u6D88\u606F]";
  }
}
function inferMessageType(filePath) {
  const ext = extname(filePath).toLowerCase();
  const imageExts = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"];
  const audioExts = [".mp3", ".wav", ".aac", ".m4a", ".ogg", ".amr"];
  const videoExts = [".mp4", ".mov", ".avi", ".mkv", ".webm", ".flv"];
  if (imageExts.includes(ext)) return "image";
  if (audioExts.includes(ext)) return "audio";
  if (videoExts.includes(ext)) return "video";
  return "file";
}
var init_media = __esm({
  "../../../../private/var/folders/6x/3ly9x_r91n79twv0l75cwbn40000gp/T/openclaw-plugin-staging-dxrN1K/openclaw-plugin-source-6P3hMg/src/media.ts"() {
    init_client();
    init_targets();
    init_send();
  }
});

// ../../../../private/var/folders/6x/3ly9x_r91n79twv0l75cwbn40000gp/T/openclaw-plugin-staging-dxrN1K/openclaw-plugin-source-6P3hMg/src/runtime.ts
function setNimRuntime(runtime) {
  nimRuntime = runtime;
}
function getNimRuntime() {
  if (!nimRuntime) {
    throw new Error("NIM runtime not initialized. Call setNimRuntime first.");
  }
  return nimRuntime;
}
var nimRuntime;
var init_runtime = __esm({
  "../../../../private/var/folders/6x/3ly9x_r91n79twv0l75cwbn40000gp/T/openclaw-plugin-staging-dxrN1K/openclaw-plugin-source-6P3hMg/src/runtime.ts"() {
    nimRuntime = null;
  }
});

// ../../../../private/var/folders/6x/3ly9x_r91n79twv0l75cwbn40000gp/T/openclaw-plugin-staging-dxrN1K/openclaw-plugin-source-6P3hMg/src/name-resolver.ts
function getCached(cache, key) {
  const entry = cache.get(key);
  if (!entry) return void 0;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return void 0;
  }
  return entry.value;
}
function setCache(cache, key, value) {
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}
async function resolveUserNick(nim, accid, fromNick) {
  if (fromNick) {
    setCache(userNickCache, accid, fromNick);
    return fromNick;
  }
  const cached = getCached(userNickCache, accid);
  if (cached) return cached;
  try {
    const userService = nim.V2NIMUserService;
    if (userService) {
      const users = await userService.getUserList([accid]);
      if (users && users.length > 0) {
        const nick = users[0].name || users[0].nick || "";
        if (nick) {
          setCache(userNickCache, accid, nick);
          return nick;
        }
      }
    }
  } catch (err) {
    console.error(
      `[nim] resolveUserNick failed \u2014 accid: ${accid}, error: ${String(err)}`
    );
  }
  return accid;
}
async function resolveTeamName(nim, teamId, sessionType = "team") {
  const cacheKey = `${sessionType}:${teamId}`;
  const cached = getCached(teamNameCache, cacheKey);
  if (cached) return cached;
  try {
    const teamService = nim.V2NIMTeamService;
    if (teamService) {
      const teamType = sessionType === "superTeam" ? 2 : 1;
      const teamInfo = await teamService.getTeamInfo(teamId, teamType);
      const name = teamInfo?.name || "";
      if (name) {
        setCache(teamNameCache, cacheKey, name);
        return name;
      }
    }
  } catch (err) {
    console.error(
      `[nim] resolveTeamName failed \u2014 teamId: ${teamId}, error: ${String(err)}`
    );
  }
  return teamId;
}
async function resolveQChatChannelName(nim, serverId, channelId) {
  const cacheKey = `${serverId}:${channelId}`;
  const fallback = cacheKey;
  const cached = getCached(qchatChannelNameCache, cacheKey);
  if (cached) return cached;
  try {
    const qchatChannelService = nim.qchatChannel ?? nim.qchat?.channelService ?? nim.V2NIMQChatChannelService;
    if (qchatChannelService) {
      const channels = await qchatChannelService.getChannels({
        channelIds: [channelId]
      });
      const name = channels?.[0]?.name || channels?.channels?.[0]?.name || "";
      if (name.trim()) {
        setCache(qchatChannelNameCache, cacheKey, name.trim());
        return name.trim();
      }
    }
  } catch (err) {
    console.error(
      `[nim] resolveQChatChannelName failed \u2014 server: ${serverId}, channel: ${channelId}, error: ${String(err)}`
    );
  }
  return fallback;
}
function buildConversationLabel(kind, displayName) {
  switch (kind) {
    case "p2p":
      return `\u4E91\u4FE1\xB7\u5355\u804A\xB7${displayName}`;
    case "team":
      return `\u4E91\u4FE1\xB7\u7FA4\u804A\xB7${displayName}`;
    case "qchat":
      return `\u4E91\u4FE1\xB7\u5708\u7EC4\xB7${displayName}`;
  }
}
var CACHE_TTL_MS, userNickCache, teamNameCache, qchatChannelNameCache;
var init_name_resolver = __esm({
  "../../../../private/var/folders/6x/3ly9x_r91n79twv0l75cwbn40000gp/T/openclaw-plugin-staging-dxrN1K/openclaw-plugin-source-6P3hMg/src/name-resolver.ts"() {
    CACHE_TTL_MS = 5 * 60 * 1e3;
    userNickCache = /* @__PURE__ */ new Map();
    teamNameCache = /* @__PURE__ */ new Map();
    qchatChannelNameCache = /* @__PURE__ */ new Map();
  }
});

// ../../../../private/var/folders/6x/3ly9x_r91n79twv0l75cwbn40000gp/T/openclaw-plugin-staging-dxrN1K/openclaw-plugin-source-6P3hMg/src/bot.ts
function extractMessageContent(message) {
  if (message.type === "text" && message.text) {
    return message.text;
  }
  if (message.type === "geo" && message.attach) {
    const geo = message.attach;
    return `[\u4F4D\u7F6E] ${geo.title ?? ""} (${geo.lat}, ${geo.lng})`;
  }
  if (message.type === "custom" && message.ext) {
    try {
      const parsed = message.ext;
      return parsed.text || parsed.content || JSON.stringify(parsed);
    } catch {
      return String(message.ext);
    }
  }
  if (["image", "file", "audio", "video"].includes(message.type)) {
    const placeholder = inferMediaPlaceholder(message.type);
    const url = message.attach?.url;
    return url ? `${placeholder} ${url}` : placeholder;
  }
  return message.text || "";
}
function extractReferencedText(message) {
  if (!message || typeof message !== "object") {
    return null;
  }
  if (message.messageType === 0 && typeof message.text === "string") {
    return message.text;
  }
  if (typeof message.messageType !== "number" && typeof message.text === "string") {
    return message.text;
  }
  return null;
}
function deriveBotAccountId(accountId) {
  const separatorIndex = accountId.indexOf(":");
  if (separatorIndex === -1) {
    return accountId;
  }
  return accountId.slice(separatorIndex + 1);
}
function parseNimMessageEvent(message) {
  const isDirectMessage = message.sessionType === "p2p";
  const sessionId = isDirectMessage ? `p2p-${message.from}` : `team-${message.to}`;
  return {
    id: message.clientMsgId,
    sessionId,
    sessionType: message.sessionType,
    senderId: message.from,
    type: message.type,
    text: extractMessageContent(message),
    timestamp: message.time,
    isDm: isDirectMessage,
    rawEvent: message
  };
}
async function handleNimMessage(params) {
  const { cfg, accountId, message, runtime } = params;
  const { resolveNimAccountById: resolveNimAccountById2 } = await Promise.resolve().then(() => (init_accounts(), accounts_exports));
  const account = resolveNimAccountById2({ cfg, accountId });
  const nimCfg = account.configured ? account.config : void 0;
  const log = runtime?.log ?? console.log;
  const error = runtime?.error ?? console.error;
  const botAccount = (nimCfg?.account ? String(nimCfg.account) : "") || account.account || deriveBotAccountId(accountId);
  const isP2P = message.sessionType === "p2p";
  const isTeam = message.sessionType === "team" || message.sessionType === "superTeam";
  if (!isP2P && !isTeam) {
    log(`[nim] ignoring message \u2014 session: ${message.sessionType}`);
    return;
  }
  if (isTeam) {
    const forcePushIds = message.forcePushAccountIds ?? [];
    log(`[nim] team mention gate \u2014 botAccount: ${botAccount || "unknown"}, forcePush: [${forcePushIds.join(", ")}]`);
    if (!forcePushIds.includes(botAccount)) {
      log(`[nim] ignoring team message \u2014 reason: bot not in force-push list`);
      return;
    }
    log(`[nim] team message accepted \u2014 reason: bot in force-push list`);
  }
  const ctx = parseNimMessageEvent(message);
  if (isP2P) {
    const p2pPolicy = nimCfg?.p2p?.policy ?? "open";
    const configAllowFrom = nimCfg?.p2p?.allowFrom ?? [];
    const result = isNimP2pAllowed({
      p2pPolicy,
      allowFrom: configAllowFrom,
      senderId: ctx.senderId
    });
    if (!result.allowed) {
      if (result.reason === "disabled") {
        log(`[nim] p2p disabled \u2014 sender: ${ctx.senderId}`);
      } else {
        log(`[nim] p2p blocked \u2014 sender: ${ctx.senderId}, policy: ${p2pPolicy}`);
      }
      return;
    }
  }
  if (isTeam) {
    const teamPolicy = nimCfg?.team?.policy ?? "open";
    const teamIds = nimCfg?.team?.allowFrom ?? [];
    if (!isNimTeamAllowed({
      teamPolicy,
      teamIds,
      groupId: message.to,
      senderId: ctx.senderId,
      sessionType: message.sessionType
    })) {
      log(`[nim] team message blocked \u2014 group: ${message.to}, sender: ${ctx.senderId}, policy: ${teamPolicy}`);
      return;
    }
  }
  try {
    const core = getNimRuntime();
    const replyTarget = isTeam ? message.to : ctx.senderId;
    const nimFrom = `nim:${ctx.senderId}`;
    const nimTo = isTeam ? `team:${message.to}` : `user:${ctx.senderId}`;
    const chatType = isTeam ? "group" : "direct";
    const peerKind = isTeam ? "group" : "direct";
    const peerId = isTeam ? message.to : ctx.senderId;
    const sessionType = isTeam ? message.sessionType : "p2p";
    const route = core.channel.routing.resolveAgentRoute({
      cfg,
      channel: "nim",
      accountId,
      peer: {
        kind: peerKind,
        id: peerId
      }
    });
    if (!route) {
      log(`[nim] route unresolved \u2014 peer: ${peerId}`);
      return;
    }
    const mediaMaxBytes = (nimCfg?.advanced?.mediaMaxMb ?? 30) * 1024 * 1024;
    const mediaList = [];
    if (["image", "file", "audio", "video"].includes(ctx.type)) {
      const attachUrl = message.attach?.url;
      if (attachUrl) {
        const mediaInfo = {
          type: ctx.type,
          url: attachUrl,
          name: message.attach?.name,
          size: message.attach?.size
        };
        mediaList.push(mediaInfo);
      }
    }
    const mediaPayload = buildNimMediaPayload(mediaList);
    const nimClient = getCachedNimClient(nimCfg);
    const nativeNim = nimClient?.nativeNim;
    const senderDisplayName = nativeNim ? await resolveUserNick(nativeNim, ctx.senderId, message.fromNick) : message.fromNick || ctx.senderId;
    let conversationLabel;
    let groupSubject;
    let teamName;
    if (isTeam) {
      teamName = nativeNim ? await resolveTeamName(nativeNim, message.to, message.sessionType) : message.to;
      log(`[nim] resolved team name \u2014 teamId: ${message.to}, teamName: ${teamName}, hasNativeNim: ${!!nativeNim}`);
      conversationLabel = buildConversationLabel("team", teamName);
      groupSubject = buildConversationLabel("team", teamName);
    } else {
      conversationLabel = buildConversationLabel("p2p", senderDisplayName);
    }
    let inboundPromptText = ctx.text;
    if (message.threadReply && nativeNim?.V2NIMMessageService && typeof ctx.text === "string" && ctx.text.trim().length > 0) {
      try {
        const referredMessages = await nativeNim.V2NIMMessageService.getMessageListByRefers([message.threadReply]);
        const repliedMessage = Array.isArray(referredMessages) ? referredMessages[0] : Array.isArray(referredMessages?.messages) ? referredMessages.messages[0] : Array.isArray(referredMessages?.data) ? referredMessages.data[0] : void 0;
        const repliedText = extractReferencedText(repliedMessage);
        if (repliedText && repliedText.trim().length > 0) {
          inboundPromptText = `${repliedText}
${ctx.text}`;
          log(`[nim] thread reply resolved \u2014 current: ${ctx.id}, referenced text length: ${repliedText.length}`);
        } else {
          log(`[nim] thread reply resolved without text payload \u2014 current: ${ctx.id}`);
        }
      } catch (err) {
        log(`[nim] thread reply lookup failed \u2014 current: ${ctx.id}, error: ${String(err)}`);
      }
    }
    const preview = inboundPromptText.replace(/\s+/g, " ").slice(0, 160);
    const inboundLabel = isTeam ? ` From ${senderDisplayName} in ${teamName ?? message.to}` : ` From ${senderDisplayName}`;
    core.system.enqueueSystemEvent(`${inboundLabel}`, {
      sessionKey: route.sessionKey,
      contextKey: `nim:message:${ctx.sessionId}:${ctx.id}`
    });
    const ctxPayload = core.channel.reply.finalizeInboundContext({
      Body: inboundPromptText,
      RawBody: inboundPromptText,
      CommandBody: inboundPromptText,
      From: nimFrom,
      To: nimTo,
      SessionKey: route.sessionKey,
      AccountId: route.accountId,
      ChatType: chatType,
      ConversationLabel: conversationLabel,
      SenderName: senderDisplayName,
      SenderId: ctx.senderId,
      Provider: "nim",
      Surface: "nim",
      MessageSid: ctx.id,
      Timestamp: ctx.timestamp,
      CommandAuthorized: true,
      OriginatingChannel: "nim",
      OriginatingTo: nimTo,
      ...isTeam ? { GroupSubject: groupSubject ?? message.to, WasMentioned: true } : {},
      ...mediaPayload
    });
    const chunkLimit = nimCfg?.advanced?.textChunkLimit ?? 4e3;
    let streamChunkIndex = 0;
    let baseMessage = null;
    const deliver = async (payload, info) => {
      const mediaList2 = payload.mediaUrls ?? (payload.mediaUrl ? [payload.mediaUrl] : []);
      const text = payload.text ?? "";
      const kind = info?.kind ?? "unknown";
      const isTeamMessage = sessionType === "team" || sessionType === "superTeam";
      if (text && kind === "block") {
        try {
          let result;
          if (isTeamMessage) {
            result = await replyStreamMessageNim({
              cfg,
              conversationId: ctx.sessionId,
              text,
              chunkIndex: streamChunkIndex++,
              isComplete: false,
              baseMessage,
              replyMessage: message.rawMsg,
              accountId
              // 🔥 Pass accountId
            });
          } else {
            result = await sendStreamMessageNim({
              cfg,
              to: ctx.senderId,
              text,
              sessionType,
              chunkIndex: streamChunkIndex++,
              isComplete: false,
              baseMessage,
              accountId
              // 🔥 Pass accountId
            });
          }
          if (result?.success && result.baseMessage) {
            baseMessage = result.baseMessage;
          }
          if (result?.success) {
            return;
          }
        } catch (err) {
          log(`[nim] stream send failed, falling back to normal send \u2014 error: ${String(err)}`);
        }
      }
      if (!text && mediaList2.length === 0) {
        log("[nim] skipping empty reply payload");
        return;
      }
      try {
        if (mediaList2.length > 0) {
          for (const mediaUrl of mediaList2) {
            const mediaType = inferMessageType(mediaUrl);
            log(`[nim] sending media \u2014 target: ${ctx.senderId}, type: ${mediaType}, file: ${mediaUrl}`);
            if (mediaType === "image") {
              await sendImageNim({
                cfg,
                to: ctx.senderId,
                imagePath: mediaUrl
              });
            } else if (mediaType === "audio") {
              await sendAudioNim({
                cfg,
                to: ctx.senderId,
                audioPath: mediaUrl,
                duration: 0
              });
            } else if (mediaType === "video") {
              await sendVideoNim({
                cfg,
                to: ctx.senderId,
                videoPath: mediaUrl,
                duration: 0,
                width: 1920,
                height: 1080
              });
            } else {
              await sendFileNim({ cfg, to: ctx.senderId, filePath: mediaUrl });
            }
            log(`[nim] media sent \u2014 target: ${ctx.senderId}`);
          }
        }
        if (text) {
          const isTeamReply = (sessionType === "team" || sessionType === "superTeam") && message.rawMsg && ctx.senderId;
          log(
            `[nim] reply mode selected \u2014 session: ${sessionType}, reply: ${isTeamReply ? "quoted" : "standard"}, streaming: ${isTeamMessage ? "disabled (team message)" : "enabled for P2P"}`
          );
          const chunks = splitMessageIntoChunks(text, chunkLimit);
          log(`[nim] reply chunking \u2014 chunks: ${chunks.length}, limit: ${chunkLimit}`);
          for (const chunk of chunks) {
            log(
              `[nim] \u{1F50D} preparing to send \u2014 accountId: "${accountId}", target: ${ctx.senderId}, session: ${sessionType}, isTeamReply: ${isTeamReply}`
            );
            if (isTeamReply) {
              log(
                `[nim] sending reply chunk \u2014 target: ${ctx.senderId}, session: ${sessionType}, force-push: [${ctx.senderId}]`
              );
              const result = await replyMessageNim({
                cfg,
                to: ctx.senderId,
                text: chunk,
                originalMsg: message.rawMsg,
                forcePushAccountIds: [ctx.senderId],
                sessionType,
                accountId
                // 🔥 Pass accountId
              });
              log(
                `[nim] reply result \u2014 message id: ${result.msgId ?? "unknown"}, status: ${result.success ? "sent" : "failed"}`
              );
              if (!result.success) {
                const failureMessage = formatSendFailureMessage(result.errorCode, result.error);
                log(`[nim] sending team failure notification \u2014 target: ${message.to}, message: ${failureMessage}`);
                try {
                  const notifyResult = await replyMessageNim({
                    cfg,
                    to: message.to,
                    text: failureMessage,
                    originalMsg: message.rawMsg,
                    forcePushAccountIds: [ctx.senderId],
                    sessionType,
                    accountId
                  });
                  if (notifyResult.success) {
                    log(`[nim] team failure notification sent \u2014 message id: ${notifyResult.msgId ?? "unknown"}`);
                  } else {
                    log(
                      `[nim] team failure notification also failed \u2014 error: ${notifyResult.error ?? "unknown"}, not retrying`
                    );
                  }
                } catch (notifyErr) {
                  log(`[nim] team failure notification exception \u2014 error: ${String(notifyErr)}, not retrying`);
                }
              }
            } else {
              const result = await sendMessageNim({
                cfg,
                to: ctx.senderId,
                text: chunk,
                sessionType,
                accountId
                // 🔥 Pass accountId
              });
              if (!result.success) {
                log(`[nim] send failed \u2014 target: ${ctx.senderId}, error: ${result.error ?? "unknown"}`);
                const failureMessage = formatSendFailureMessage(result.errorCode, result.error);
                log(`[nim] sending failure notification \u2014 target: ${ctx.senderId}, message: ${failureMessage}`);
                try {
                  const notifyResult = await sendMessageNim({
                    cfg,
                    to: ctx.senderId,
                    text: failureMessage,
                    sessionType,
                    accountId
                  });
                  if (notifyResult.success) {
                    log(`[nim] failure notification sent \u2014 message id: ${notifyResult.msgId ?? "unknown"}`);
                  } else {
                    log(
                      `[nim] failure notification also failed \u2014 error: ${notifyResult.error ?? "unknown"}, not retrying`
                    );
                  }
                } catch (notifyErr) {
                  log(`[nim] failure notification exception \u2014 error: ${String(notifyErr)}, not retrying`);
                }
              }
            }
            log(
              `[nim] reply chunk sent \u2014 target: ${ctx.senderId}, length: ${chunk.length}${isTeamReply ? `, mention: ${ctx.senderId}` : ""}`
            );
          }
        }
      } catch (err) {
        log(`[nim] reply send failed \u2014 error: ${String(err)}`);
        throw err;
      }
    };
    log(`[nim] dispatching to agent \u2014 session: ${route.sessionKey}, chat: ${chatType}, agent: ${route.agentId}`);
    await core.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
      ctx: ctxPayload,
      cfg,
      dispatcherOptions: {
        deliver,
        humanDelay: { mode: "off" },
        onIdle: () => {
          log(`[nim] reply dispatcher idle`);
        },
        onError: (err, info) => {
          log(`[nim] reply dispatcher error \u2014 kind: ${info.kind}, error: ${String(err)}`);
        },
        onSkip: (_payload, info) => {
          log(`[nim] reply skipped by normalizer \u2014 kind: ${info.kind}, reason: ${info.reason}`);
        }
      },
      replyOptions: {
        channel: "nim",
        targetId: ctx.senderId
      }
    });
    log(`[nim] dispatch complete`);
  } catch (err) {
    error(`[nim] dispatch failed \u2014 error: ${String(err)}`);
    if (err instanceof Error && err.stack) {
      error(`[nim] dispatch stack \u2014 error: ${err.stack}`);
    }
  }
}
var init_bot = __esm({
  "../../../../private/var/folders/6x/3ly9x_r91n79twv0l75cwbn40000gp/T/openclaw-plugin-staging-dxrN1K/openclaw-plugin-source-6P3hMg/src/bot.ts"() {
    init_accounts();
    init_runtime();
    init_media();
    init_send();
    init_name_resolver();
    init_client();
  }
});

// ../../../../private/var/folders/6x/3ly9x_r91n79twv0l75cwbn40000gp/T/openclaw-plugin-staging-dxrN1K/openclaw-plugin-source-6P3hMg/src/monitor.ts
var monitor_exports = {};
__export(monitor_exports, {
  isNimMonitorRunning: () => isNimMonitorRunning,
  monitorNimProvider: () => monitorNimProvider,
  stopAllNimMonitors: () => stopAllNimMonitors,
  stopNimMonitor: () => stopNimMonitor
});
async function monitorNimProvider(params) {
  const { cfg, runtime, abortSignal } = params;
  const rawNim = cfg?.channels?.nim;
  console.log(
    `[nim] monitor init \u2014 accountId: ${params.accountId}, channels.nim type: ${Array.isArray(rawNim) ? `array[${rawNim.length}]` : typeof rawNim}`
  );
  const account = resolveNimAccountById({ cfg, accountId: params.accountId });
  console.log(
    `[nim] monitor init \u2014 account resolved: configured=${account.configured}, account=${account.account || "none"}`
  );
  const nimInstCfg = account.configured ? account.config : void 0;
  if (!nimInstCfg) {
    console.error(
      `[nim] instance not configured \u2014 accountId: ${params.accountId}`
    );
    return;
  }
  const creds = resolveNimCredentials(nimInstCfg);
  if (!creds) {
    console.error(
      `[nim] credentials not configured \u2014 accountId: ${params.accountId}`
    );
    return;
  }
  const monitorKey = `${creds.appKey}:${creds.account}`;
  if (monitorStates.has(monitorKey)) {
    console.log(`[nim] monitor already running \u2014 account: ${creds.account}`);
    throw new Error(`NIM monitor already running for ${creds.account}`);
  }
  console.log(`[nim] monitor starting \u2014 account: ${creds.account}`);
  try {
    const client = await createNimClient(nimInstCfg);
    const liveP2pPolicy = nimInstCfg.p2p?.policy ?? "open";
    const liveP2pAllowFrom = nimInstCfg.p2p?.allowFrom ?? [];
    client.updateP2pPolicy(liveP2pPolicy, liveP2pAllowFrom);
    if (params.qchatClient) {
      params.qchatClient.setNim(client.nativeNim);
      console.log("[qchat] listeners registering \u2014 phase: pre-login");
      await params.qchatClient.initListeners();
    }
    const loginSuccess = await client.login();
    if (!loginSuccess) {
      return;
    }
    if (params.qchatClient) {
      console.log("[qchat] subscriptions activating \u2014 phase: post-login");
      try {
        await params.qchatClient.activate();
        console.log("[qchat] subscriptions active");
      } catch (qchatErr) {
        const errorMessage = qchatErr?.message ?? String(qchatErr);
        console.error(`[qchat] activation failed \u2014 error: ${errorMessage}`);
      }
    }
    const abortController = new AbortController();
    const state = {
      client,
      running: true,
      abortController
    };
    monitorStates.set(monitorKey, state);
    const messageHandler = async (msg) => {
      if (!state.running) return;
      if (msg.from === creds.account) {
        return;
      }
      console.log(
        [
          "[nim]",
          "\u250C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510",
          "\u2502  \u{1F4E8} NIM MESSAGE RECEIVED                \u2502",
          `\u2502  from    : ${msg.from.padEnd(28)}\u2502`,
          `\u2502  type    : ${String(msg.type).padEnd(28)}\u2502`,
          `\u2502  session : ${String(msg.sessionType).padEnd(28)}\u2502`,
          `\u2502  to      : ${String(msg.to).padEnd(28)}\u2502`,
          "\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518",
          ""
        ].join("\n")
      );
      try {
        await handleNimMessage({
          cfg,
          accountId: params.accountId,
          runtime,
          message: msg
        });
      } catch (error) {
        const errorMessage = error?.message ?? String(error);
        console.error(`[nim] message handling failed \u2014 error: ${errorMessage}`);
      }
    };
    client.onMessage(messageHandler);
    client.onConnectionChange((status) => {
      console.log(`[nim] connection status changed \u2014 status: ${status}`);
      if (status === "kickout") {
        console.warn(`[nim] account kicked out \u2014 account: ${creds.account}`);
        stopNimMonitorByKey(monitorKey);
      } else if (status === "disconnected") {
        console.warn("[nim] disconnected \u2014 reconnecting");
      }
    });
    console.log(`[nim] monitor started \u2014 account: ${creds.account}`);
    await new Promise((resolve) => {
      const onAbort = () => {
        console.log("[nim] abort signal received \u2014 stopping monitor");
        stopNimMonitorByKey(monitorKey).finally(resolve);
      };
      if (abortSignal?.aborted) {
        onAbort();
        return;
      }
      if (abortSignal) {
        abortSignal.addEventListener("abort", onAbort, { once: true });
      }
      abortController.signal.addEventListener("abort", () => resolve(), {
        once: true
      });
    });
  } catch (error) {
    const errorMessage = error?.message ?? String(error);
    console.error(`[nim] monitor start failed \u2014 error: ${errorMessage}`);
    throw error;
  }
}
async function stopNimMonitorByKey(monitorKey) {
  const state = monitorStates.get(monitorKey);
  if (!state) {
    console.log(`[nim] monitor not running \u2014 key: ${monitorKey}`);
    return;
  }
  console.log(`[nim] monitor stopping \u2014 key: ${monitorKey}`);
  state.running = false;
  state.abortController.abort();
  try {
    await state.client.logout();
  } catch (error) {
    const errorMessage = error?.message ?? String(error);
    console.error(
      `[nim] logout failed during monitor stop \u2014 error: ${errorMessage}`
    );
  }
  monitorStates.delete(monitorKey);
  console.log(`[nim] monitor stopped \u2014 key: ${monitorKey}`);
}
async function stopNimMonitor(cfg) {
  const creds = resolveNimCredentials(cfg);
  if (!creds) {
    console.log("[nim] monitor stop skipped \u2014 missing credentials");
    return;
  }
  await stopNimMonitorByKey(`${creds.appKey}:${creds.account}`);
}
function isNimMonitorRunning(cfg) {
  const creds = resolveNimCredentials(cfg);
  if (!creds) return false;
  const monitorKey = `${creds.appKey}:${creds.account}`;
  const state = monitorStates.get(monitorKey);
  return state?.running ?? false;
}
async function stopAllNimMonitors() {
  console.log("[nim] stopping all monitors");
  for (const [key, state] of monitorStates.entries()) {
    state.running = false;
    state.abortController.abort();
    try {
      await state.client.logout();
    } catch (error) {
      const errorMessage = error?.message ?? String(error);
      console.error(
        `[nim] monitor stop failed \u2014 account: ${key}, error: ${errorMessage}`
      );
    }
  }
  monitorStates.clear();
  await clearNimClientCache();
  console.log("[nim] all monitors stopped");
}
var monitorStates;
var init_monitor = __esm({
  "../../../../private/var/folders/6x/3ly9x_r91n79twv0l75cwbn40000gp/T/openclaw-plugin-staging-dxrN1K/openclaw-plugin-source-6P3hMg/src/monitor.ts"() {
    init_client();
    init_accounts();
    init_bot();
    monitorStates = /* @__PURE__ */ new Map();
  }
});

// ../../../../private/var/folders/6x/3ly9x_r91n79twv0l75cwbn40000gp/T/openclaw-plugin-staging-dxrN1K/openclaw-plugin-source-6P3hMg/index.ts
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";

// ../../../../private/var/folders/6x/3ly9x_r91n79twv0l75cwbn40000gp/T/openclaw-plugin-staging-dxrN1K/openclaw-plugin-source-6P3hMg/src/channel.ts
init_accounts();
init_targets();

// ../../../../private/var/folders/6x/3ly9x_r91n79twv0l75cwbn40000gp/T/openclaw-plugin-staging-dxrN1K/openclaw-plugin-source-6P3hMg/src/probe.ts
init_accounts();
init_client();
async function probeNim(cfg) {
  try {
    const creds = resolveNimCredentials(cfg);
    const client = getCachedNimClient(cfg);
    if (client && client.loggedIn) {
      return {
        connected: true,
        account: creds.account,
        loginState: "connected"
      };
    }
    return {
      connected: false,
      account: creds.account,
      loginState: "not_connected"
    };
  } catch (error) {
    return {
      connected: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
async function probeNimWithConnect(cfg) {
  try {
    const creds = resolveNimCredentials(cfg);
    const client = await createNimClient(cfg);
    const loginSuccess = await client.login();
    if (loginSuccess) {
      return {
        connected: true,
        account: creds.account,
        loginState: "connected"
      };
    } else {
      return {
        connected: false,
        account: creds.account,
        error: "Login failed",
        loginState: "login_failed"
      };
    }
  } catch (error) {
    return {
      connected: false,
      error: error instanceof Error ? error.message : String(error),
      loginState: "error"
    };
  }
}

// ../../../../private/var/folders/6x/3ly9x_r91n79twv0l75cwbn40000gp/T/openclaw-plugin-staging-dxrN1K/openclaw-plugin-source-6P3hMg/src/outbound.ts
init_send();
init_media();
init_targets();
var DEFAULT_TEXT_CHUNK_LIMIT = 5e3;
function resolveNimOutboundTarget(params) {
  const { to, allowFrom, mode } = params;
  const trimmed = to?.trim() ?? "";
  const allowListRaw = (allowFrom ?? []).map((entry) => String(entry).trim()).filter(Boolean);
  const hasWildcard = allowListRaw.includes("*");
  const allowList = allowListRaw.filter((entry) => entry !== "*").map((entry) => normalizeNimTarget(entry)).filter((entry) => Boolean(entry));
  if (trimmed) {
    const lc = trimmed.toLowerCase();
    if (lc.startsWith("team:") || lc.startsWith("superteam:")) {
      const parsed = parseNimTarget(trimmed);
      if (parsed) {
        return { ok: true, to: trimmed };
      }
    }
    const normalizedTo = normalizeNimTarget(trimmed);
    if (!normalizedTo) {
      if ((mode === "implicit" || mode === "heartbeat") && allowList.length > 0) {
        return { ok: true, to: allowList[0] };
      }
      return {
        ok: false,
        error: new Error(
          `Invalid NIM target: ${trimmed}. Provide a valid NIM account ID or configure channels.nim.allowFrom.`
        )
      };
    }
    if (mode === "implicit" || mode === "heartbeat") {
      if (hasWildcard || allowList.length === 0) {
        return { ok: true, to: normalizedTo };
      }
      if (allowList.includes(normalizedTo)) {
        return { ok: true, to: normalizedTo };
      }
      return { ok: true, to: allowList[0] };
    }
    return { ok: true, to: normalizedTo };
  }
  if (allowList.length > 0) {
    return { ok: true, to: allowList[0] };
  }
  return {
    ok: false,
    error: new Error(`Missing NIM target. Provide a target ID or configure channels.nim.allowFrom.`)
  };
}
async function sendNimOutboundText(params) {
  const { to, text, cfg, accountId, isFailureNotification = false } = params;
  const parsed = parseNimTarget(to);
  const targetId = parsed?.id ?? normalizeNimTarget(to) ?? to;
  const sessionType = parsed?.sessionType ?? "p2p";
  console.log(
    `[nim] outbound text send \u2014 target: ${targetId}, session: ${sessionType}, length: ${text.length}${isFailureNotification ? " (failure notification)" : ""}`
  );
  try {
    const result = await sendMessageNim({
      cfg,
      to: targetId,
      text,
      sessionType,
      accountId
    });
    if (result.success) {
      console.log(`[nim] outbound text sent \u2014 message id: ${result.msgId ?? "unknown"}`);
      return {
        channel: "nim",
        ok: true,
        messageId: result.msgId ?? "",
        msgId: result.msgId,
        clientMsgId: result.clientMsgId
      };
    } else {
      const errorCode = result.errorCode;
      const errorMsg = result.error ?? "unknown";
      console.error(`[nim] outbound text failed \u2014 error: ${errorMsg}${errorCode ? ` (code: ${errorCode})` : ""}`);
      if (!isFailureNotification) {
        const failureMessage = formatSendFailureMessage(errorCode, errorMsg);
        console.log(`[nim] sending failure notification \u2014 target: ${targetId}, message: ${failureMessage}`);
        try {
          const nimCfg = resolveInstCfg(cfg, accountId);
          if (nimCfg) {
            const { createNimClient: createNimClient2, getCachedNimClient: getCachedNimClient2 } = await Promise.resolve().then(() => (init_client(), client_exports));
            let client = getCachedNimClient2(nimCfg);
            if (!client || !client.loggedIn) {
              client = await createNimClient2(nimCfg);
              await client.login();
            }
            const notifyResult = await client.sendText(targetId, failureMessage, sessionType);
            if (notifyResult.success) {
              console.log(`[nim] failure notification sent \u2014 message id: ${notifyResult.msgId ?? "unknown"}`);
            } else {
              console.error(
                `[nim] failure notification also failed \u2014 error: ${notifyResult.error ?? "unknown"}, not retrying`
              );
            }
          }
        } catch (notifyError) {
          const notifyErrorMsg = notifyError instanceof Error ? notifyError.message : String(notifyError);
          console.error(`[nim] failure notification exception \u2014 error: ${notifyErrorMsg}, not retrying`);
        }
      }
      return {
        channel: "nim",
        ok: false,
        messageId: "",
        error: errorMsg
      };
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const errorCode = error?.code ?? error?.res_code;
    console.error(`[nim] outbound text exception \u2014 error: ${errorMsg}`);
    if (!isFailureNotification) {
      const failureMessage = formatSendFailureMessage(errorCode, errorMsg);
      console.log(`[nim] sending failure notification \u2014 target: ${targetId}, message: ${failureMessage}`);
      try {
        const nimCfg = resolveInstCfg(cfg, accountId);
        if (nimCfg) {
          const { createNimClient: createNimClient2, getCachedNimClient: getCachedNimClient2 } = await Promise.resolve().then(() => (init_client(), client_exports));
          let client = getCachedNimClient2(nimCfg);
          if (!client || !client.loggedIn) {
            client = await createNimClient2(nimCfg);
            await client.login();
          }
          const notifyResult = await client.sendText(targetId, failureMessage, sessionType);
          if (notifyResult.success) {
            console.log(`[nim] failure notification sent \u2014 message id: ${notifyResult.msgId ?? "unknown"}`);
          } else {
            console.error(
              `[nim] failure notification also failed \u2014 error: ${notifyResult.error ?? "unknown"}, not retrying`
            );
          }
        }
      } catch (notifyError) {
        const notifyErrorMsg = notifyError instanceof Error ? notifyError.message : String(notifyError);
        console.error(`[nim] failure notification exception \u2014 error: ${notifyErrorMsg}, not retrying`);
      }
    }
    return {
      channel: "nim",
      ok: false,
      messageId: "",
      error: errorMsg
    };
  }
}
async function sendNimOutboundMedia(params) {
  const { to, text, mediaUrl, mediaPath, cfg, accountId } = params;
  const media = mediaPath || mediaUrl;
  const parsed = parseNimTarget(to);
  const targetId = parsed?.id ?? normalizeNimTarget(to) ?? to;
  const sessionType = parsed?.sessionType ?? "p2p";
  console.log(
    `[nim] outbound media send \u2014 target: ${targetId}, session: ${sessionType}, media: ${media ?? "none"}, has text: ${text ? "yes" : "no"}`
  );
  try {
    if (media) {
      const mediaType = inferMessageType(media);
      let mediaResult;
      if (mediaType === "image") {
        mediaResult = await sendImageNim({
          cfg,
          to: targetId,
          imagePath: media,
          sessionType,
          accountId
        });
      } else if (mediaType === "audio") {
        mediaResult = await sendAudioNim({
          cfg,
          to: targetId,
          audioPath: media,
          duration: 0,
          sessionType,
          accountId
        });
      } else if (mediaType === "video") {
        mediaResult = await sendVideoNim({
          cfg,
          to: targetId,
          videoPath: media,
          duration: 0,
          width: 1920,
          height: 1080,
          sessionType,
          accountId
        });
      } else {
        mediaResult = await sendFileNim({
          cfg,
          to: targetId,
          filePath: media,
          sessionType,
          accountId
        });
      }
      if (!mediaResult.success) {
        console.error(`[nim] outbound media failed \u2014 error: ${mediaResult.error ?? "unknown"}`);
        return {
          channel: "nim",
          ok: false,
          messageId: "",
          error: mediaResult.error
        };
      }
      console.log(`[nim] outbound media sent \u2014 message id: ${mediaResult.msgId ?? "unknown"}`);
      if (!text) {
        return {
          channel: "nim",
          ok: true,
          messageId: mediaResult.msgId ?? "",
          msgId: mediaResult.msgId,
          clientMsgId: mediaResult.clientMsgId
        };
      }
    }
    if (text) {
      return await sendNimOutboundText({ to, text, cfg, accountId });
    }
    return {
      channel: "nim",
      ok: true,
      messageId: ""
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[nim] outbound media exception \u2014 error: ${errorMsg}`);
    return {
      channel: "nim",
      ok: false,
      messageId: "",
      error: errorMsg
    };
  }
}
var nimOutboundConfig = {
  /**
   * Delivery mode - "gateway" means messages go through the gateway process
   */
  deliveryMode: "gateway",
  /**
   * Text chunker function for splitting long messages
   */
  chunker: splitMessageIntoChunks,
  /**
   * Maximum characters per text chunk
   */
  textChunkLimit: DEFAULT_TEXT_CHUNK_LIMIT,
  /**
   * Resolve target address from various input formats
   */
  resolveTarget: resolveNimOutboundTarget,
  /**
   * Send a text message
   */
  sendText: async (params) => {
    return sendNimOutboundText(params);
  },
  /**
   * Send a media message (with optional text caption)
   */
  sendMedia: async (params) => {
    return sendNimOutboundMedia({ ...params, mediaPath: params.mediaUrl });
  }
};
async function nimOutbound(params) {
  const { cfg, to, text, mediaPath } = params;
  const nimCfg = resolveInstCfg(cfg);
  const targetId = normalizeNimTarget(to);
  if (!targetId) {
    throw new Error(`Invalid NIM target: ${to}`);
  }
  if (mediaPath) {
    const result = await sendNimOutboundMedia({
      cfg,
      to: targetId,
      mediaPath,
      text
    });
    if (!result.ok) {
      throw new Error(result.error || "Failed to send media");
    }
    return;
  }
  if (text) {
    const chunkLimit = nimCfg?.advanced?.textChunkLimit ?? DEFAULT_TEXT_CHUNK_LIMIT;
    const chunks = splitMessageIntoChunks(text, chunkLimit);
    for (const chunk of chunks) {
      const result = await sendNimOutboundText({
        cfg,
        to: targetId,
        text: chunk
      });
      if (!result.ok) {
        throw new Error(result.error || "Failed to send text");
      }
    }
  }
}

// ../../../../private/var/folders/6x/3ly9x_r91n79twv0l75cwbn40000gp/T/openclaw-plugin-staging-dxrN1K/openclaw-plugin-source-6P3hMg/src/qchat-client.ts
var QChatClient = class {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  nim = null;
  opts;
  subscribedServerIds = [];
  listenersInitialized = false;
  activated = false;
  stopped = false;
  // Store bound handlers so we can remove them on stop()
  messageHandler = null;
  systemNotificationHandler = null;
  // 🔥 频道信息缓存：channelId -> ChannelInfo
  channelInfoCache = /* @__PURE__ */ new Map();
  // 🔥 缓存过期时间：1小时
  CACHE_EXPIRE_MS = 60 * 60 * 1e3;
  // 🔥 缓存时间戳：channelId -> timestamp
  channelCacheTimestamps = /* @__PURE__ */ new Map();
  constructor(opts) {
    this.opts = opts;
  }
  /**
   * 设置复用的 NIM SDK 实例（避免重复创建）。
   * 应在 initListeners() 之前调用。
   */
  setNim(nim) {
    this.nim = nim;
  }
  ensureNim() {
    if (!this.nim) {
      if (this.opts.nim) {
        this.nim = this.opts.nim;
      } else {
        throw new Error(
          "QChatClient requires a NIM instance \u2014 call setNim() or pass opts.nim before use"
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
  async getChannelInfo(channelId, serverId) {
    console.log(
      `[qchat] \u{1F50D} getChannelInfo called \u2014 channelId: ${channelId}, serverId: ${serverId}`
    );
    console.log(`[qchat] \u{1F50D} nim object:`, !!this.nim);
    console.log(
      `[qchat] \u{1F50D} nim keys:`,
      this.nim ? Object.keys(this.nim) : "no nim"
    );
    console.log(`[qchat] \u{1F50D} nim.qchatChannel:`, !!this.nim?.qchatChannel);
    if (this.nim?.qchatChannel) {
      console.log(
        `[qchat] \u{1F50D} qchatChannel methods:`,
        Object.keys(this.nim.qchatChannel)
      );
    }
    if (!channelId || !this.nim?.qchatChannel) {
      console.log(
        `[qchat] \u274C getChannelInfo early return \u2014 channelId: ${!!channelId}, qchatChannel: ${!!this.nim?.qchatChannel}`
      );
      return null;
    }
    const now = Date.now();
    const cached = this.channelInfoCache.get(channelId);
    const cacheTime = this.channelCacheTimestamps.get(channelId);
    if (cached && cacheTime && now - cacheTime < this.CACHE_EXPIRE_MS) {
      console.log(`[qchat] channel info from cache \u2014 channelId: ${channelId}`);
      return cached;
    }
    try {
      console.log(
        `[qchat] fetching channel info \u2014 channelId: ${channelId}, serverId: ${serverId || "unknown"}`
      );
      const result = await this.nim.qchatChannel.getChannels({
        channelIds: [channelId]
      });
      if (result && result.length > 0) {
        const channelInfo = result[0];
        this.channelInfoCache.set(channelId, channelInfo);
        this.channelCacheTimestamps.set(channelId, now);
        console.log(
          `[qchat] channel info cached \u2014 channelId: ${channelId}, name: "${channelInfo.name}", topic: "${channelInfo.topic}"`
        );
        return channelInfo;
      } else {
        console.warn(`[qchat] channel not found \u2014 channelId: ${channelId}`);
        return null;
      }
    } catch (error) {
      console.error(
        `[qchat] failed to get channel info \u2014 channelId: ${channelId}, error:`,
        error
      );
      return null;
    }
  }
  normalizeMessage(msg) {
    const serverId = msg.serverId ?? msg.server_id;
    const channelId = msg.channelId ?? msg.channel_id;
    const fromAccount = msg.fromAccount ?? msg.from_accid;
    const fromNick = msg.fromNick ?? msg.from_nick;
    const body = msg.body ?? msg.msg_body;
    const type = msg.type ?? (typeof msg.msg_type === "string" ? msg.msg_type : void 0);
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
      mention_accids: mentionAccids
    };
  }
  normalizeSystemNotification(notification) {
    const serverId = notification.serverId ?? notification.server_id;
    const type = notification.type ?? (typeof notification.msg_type === "string" ? notification.msg_type : void 0);
    const legacyType = typeof notification.msg_type === "number" ? notification.msg_type : void 0;
    const normalizedType = type ?? (legacyType === 1 ? "serverMemberInvite" : legacyType === 8 ? "serverMemberInviteDone" : void 0);
    return {
      ...notification,
      serverId,
      type: normalizedType,
      server_id: serverId,
      msg_type: normalizedType
    };
  }
  /** The accid this client is associated with. */
  get account() {
    return this.opts.account;
  }
  /** Whether listeners have been registered (phase 1 complete). */
  get isListening() {
    return this.listenersInitialized;
  }
  /** Whether active subscriptions are in place (phase 2 complete). */
  get isActivated() {
    return this.activated;
  }
  /**
   * Phase 1 — Register passive event handlers.
   *
   * Call this AFTER V2NIMClient.init() but BEFORE loginService.login().
   * Only registers listeners; makes NO outgoing API calls.
   */
  async initListeners() {
    if (this.listenersInitialized) return;
    const log = this.opts.log;
    const nim = this.ensureNim();
    const loginService = nim.V2NIMLoginService;
    log?.info("event handlers initialized \u2014 web sdk handles qchat auth");
    loginService?.on("onLoginStatus", (resp) => {
      this.opts.onLoginStatus?.(resp);
    });
    loginService?.on(
      "onKickedOffline",
      (resp) => {
        const reason = resp?.reasonDesc ?? resp?.reason ?? String(resp ?? "unknown");
        this.opts.onError?.(new Error(`kicked out \u2014 reason: ${reason}`));
      }
    );
    if (!nim.qchatMsg) {
      log?.error(
        "nim.qchatMsg is not available on this SDK instance \u2014 QChat message events will NOT be received. Ensure @yxim/nim-bot supports QChat APIs."
      );
    }
    this.messageHandler = async (msg) => {
      if (this.stopped) return;
      console.log("[qchat] \u{1F4E8} received message:", JSON.stringify(msg, null, 2));
      console.log(
        `[qchat] \u{1F50D} attempting to get channel info \u2014 channelId: ${msg.channelId}, serverId: ${msg.serverId}`
      );
      const channelInfo = await this.getChannelInfo(
        msg.channelId,
        msg.serverId
      );
      console.log(`[qchat] \u{1F4A1} channel info result:`, channelInfo);
      const normalized = this.normalizeMessage(msg);
      if (channelInfo) {
        normalized.channelInfo = channelInfo;
        console.log(`[qchat] \u2705 channel info attached to message`);
      } else {
        console.log(`[qchat] \u26A0\uFE0F no channel info available`);
      }
      console.log(`[qchat] \u{1F4E4} calling onMessage with normalized message`);
      this.opts.onMessage?.({ message: normalized });
    };
    nim.qchatMsg?.on("message", this.messageHandler);
    this.systemNotificationHandler = (notificationResp) => {
      if (this.stopped) return;
      const notification = this.normalizeSystemNotification(
        notificationResp ?? {}
      );
      if (!notification) return;
      if (notification.type === "serverMemberInvite") {
        const serverId = notification.serverId ?? notification.server_id ?? notification.attach?.serverInfo?.serverId;
        const inviterAccid = notification.fromAccount ?? notification.from_accid;
        const requestId = notification.attach?.requestId;
        if (!serverId || !inviterAccid || !requestId) {
          log?.info(
            `[sysnotify] server invite ignored \u2014 missing fields (server: ${serverId ?? "n/a"}, inviter: ${inviterAccid ?? "n/a"}, requestId: ${requestId ?? "n/a"})`
          );
          return;
        }
        const policy = this.opts.serverPolicy ?? "open";
        const allowlist = this.opts.serverAllowlist ?? [];
        if (policy === "disabled") {
          log?.info(
            `[sysnotify] server invite ignored \u2014 server: ${serverId}, reason: serverPolicy is disabled`
          );
          return;
        }
        if (policy === "allowlist" && !allowlist.includes(serverId)) {
          log?.info(
            `[sysnotify] server invite ignored \u2014 server: ${serverId}, reason: not in serverAllowlist`
          );
          return;
        }
        log?.info(
          `[sysnotify] auto-accepting server invite \u2014 server: ${serverId}, inviter: ${inviterAccid}, policy: ${policy}`
        );
        nim.qchatServer.acceptServerInvite({
          serverId,
          accid: inviterAccid,
          recordInfo: { requestId }
        }).then(() => {
          log?.info(
            `[sysnotify] server invite accepted \u2014 server: ${serverId}`
          );
        }).catch((err) => {
          log?.error(
            `[sysnotify] server invite accept failed \u2014 server: ${serverId}, error: ${String(err)}`
          );
        });
        return;
      }
      if (notification.type === "serverMemberInviteDone") {
        const serverId = notification.serverId ?? notification.server_id;
        if (!serverId) return;
        if (this.subscribedServerIds.includes(serverId)) {
          log?.info(
            `[sysnotify] invite received \u2014 server: ${serverId}, status: already subscribed`
          );
          return;
        }
        if (!this.activated) {
          log?.info(
            `[sysnotify] invite queued \u2014 server: ${serverId}, status: not activated`
          );
          return;
        }
        log?.info(`[sysnotify] auto-subscribing \u2014 server: ${serverId}`);
        this.subscribeServer(serverId).catch((err) => {
          log?.error(
            `[sysnotify] subscribe failed \u2014 server: ${serverId}, error: ${String(err)}`
          );
        });
      }
    };
    nim.qchatMsg?.on("systemNotification", this.systemNotificationHandler);
    this.listenersInitialized = true;
    log?.info("listeners registered \u2014 phase: passive");
  }
  /**
   * Phase 2 — Discover servers and subscribe to channels.
   *
   * Call this AFTER IM login succeeds. Makes active API calls
   * (getServersByPage, subscribeAllChannel) that require authentication.
   */
  async activate() {
    if (this.activated) return;
    if (!this.listenersInitialized) {
      await this.initListeners();
    }
    const log = this.opts.log;
    let serverIds = this.opts.serverIds ?? [];
    if (serverIds.length === 0) {
      log?.info("no servers configured \u2014 discovering joined servers");
      serverIds = await this.discoverJoinedServers();
      log?.info(
        `servers discovered \u2014 count: ${serverIds.length}, servers: ${serverIds.join(", ")}`
      );
    }
    if (serverIds.length === 0) {
      log?.info("no servers found \u2014 waiting for server join");
      this.activated = true;
      return;
    }
    const nim = this.ensureNim();
    const resp = await nim.qchatServer.subscribeAllChannel({
      type: 1,
      // kNIMQChatSubscribeTypeMsg
      serverIds
    });
    const failedServers = resp.failServerIds ?? [];
    if (failedServers.length > 0) {
      log?.error(`subscribe failed \u2014 servers: ${failedServers.join(", ")}`);
    }
    this.subscribedServerIds = serverIds.filter(
      (id) => !failedServers.includes(id)
    );
    log?.info(
      `subscribed to all channels \u2014 servers: ${this.subscribedServerIds.length}`
    );
    this.activated = true;
  }
  /**
   * Legacy one-shot start (calls both phases sequentially).
   * Prefer initListeners() + activate() for proper lifecycle control.
   */
  async start() {
    await this.initListeners();
    await this.activate();
  }
  /**
   * Auto-discover joined servers by paginating through getServersByPage.
   */
  async discoverJoinedServers() {
    const serverIds = [];
    let timestamp = 0;
    const PAGE_LIMIT = 100;
    const nim = this.ensureNim();
    for (let page = 0; page < 20; page++) {
      const resp = await nim.qchatServer.getServersByPage({
        timestamp,
        limit: PAGE_LIMIT
      });
      const servers = resp.datas ?? [];
      if (servers.length === 0) break;
      for (const s of servers) {
        if (s.serverId) {
          serverIds.push(s.serverId);
        }
      }
      const hasMore = resp.listQueryTag?.hasMore ?? servers.length >= PAGE_LIMIT;
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
  async subscribeServer(serverId) {
    const log = this.opts.log;
    const nim = this.ensureNim();
    const resp = await nim.qchatServer.subscribeAllChannel({
      type: 1,
      // kNIMQChatSubscribeTypeMsg
      serverIds: [serverId]
    });
    const failed = resp.failServerIds ?? [];
    if (failed.includes(serverId)) {
      log?.error(`[sysnotify] subscribe failed \u2014 server: ${serverId}`);
      return;
    }
    this.subscribedServerIds.push(serverId);
    log?.info(
      `[sysnotify] subscribed \u2014 server: ${serverId}, total servers: ${this.subscribedServerIds.length}`
    );
  }
  async sendText(params) {
    const nim = this.ensureNim();
    try {
      const resp = await nim.qchatMsg.sendMessage({
        serverId: params.serverId,
        channelId: params.channelId,
        type: "text",
        body: params.text
      });
      return {
        ok: true,
        msgServerId: resp.message?.msgIdServer ?? resp.msgIdServer ?? void 0
      };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }
  async replyText(params) {
    const nim = this.ensureNim();
    try {
      const resp = await nim.qchatMsg.replyMessage({
        serverId: params.serverId,
        channelId: params.channelId,
        type: "text",
        body: params.text,
        replyMessage: params.replyMessage
      });
      return {
        ok: true,
        msgServerId: resp.message?.msgIdServer ?? resp.msgIdServer ?? void 0
      };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }
  async stop() {
    this.stopped = true;
    if (!this.activated && !this.listenersInitialized) return;
    if (this.nim?.qchatMsg) {
      if (this.messageHandler) {
        this.nim.qchatMsg.off("message", this.messageHandler);
        this.messageHandler = null;
      }
      if (this.systemNotificationHandler) {
        this.nim.qchatMsg.off(
          "systemNotification",
          this.systemNotificationHandler
        );
        this.systemNotificationHandler = null;
      }
    }
    if (this.subscribedServerIds.length > 0) {
      const nim = this.ensureNim();
      try {
        await nim.qchatServer.subscribeAllChannel({
          type: 1,
          serverIds: []
          // empty = unsubscribe all
        });
      } catch {
      }
    }
    this.activated = false;
    this.listenersInitialized = false;
  }
};

// ../../../../private/var/folders/6x/3ly9x_r91n79twv0l75cwbn40000gp/T/openclaw-plugin-staging-dxrN1K/openclaw-plugin-source-6P3hMg/src/qchat-send.ts
init_runtime();
var qchatClients = /* @__PURE__ */ new Map();
var qchatReplyEnabledMap = /* @__PURE__ */ new Map();
function setQchatReplyEnabled(accountId, enabled) {
  qchatReplyEnabledMap.set(accountId, enabled);
}
function isQchatReplyEnabled(accountId) {
  if (!accountId) {
    if (qchatReplyEnabledMap.size === 0) return true;
    return [...qchatReplyEnabledMap.values()].some(Boolean);
  }
  return qchatReplyEnabledMap.get(accountId) ?? true;
}
function setSharedQChatClient(accountId, client) {
  if (client === null) {
    qchatClients.delete(accountId);
  } else {
    qchatClients.set(accountId, client);
  }
}
function getSharedQChatClient() {
  const first = qchatClients.values().next();
  return first.done ? null : first.value;
}
async function sendQChatMessage(to, text, opts) {
  const log = getNimRuntime().logging.getChildLogger({
    channel: "nim-qchat"
  });
  const accountId = opts?.accountId;
  if (!isQchatReplyEnabled(accountId)) {
    log.info(
      `[qchat] send suppressed \u2014 reason: policy is disabled, target: ${to}, instance: ${accountId ?? "unknown"}`
    );
    return { ok: true, messageId: "" };
  }
  const [serverId, channelId] = to.split(":");
  if (!serverId || !channelId) {
    log.error(`[qchat] invalid target \u2014 value: ${to}`);
    return {
      ok: false,
      messageId: "",
      error: new Error(
        `Invalid QChat target "${to}" \u2014 expected "serverId:channelId"`
      )
    };
  }
  const allClientKeys = Array.from(qchatClients.keys());
  log.info(
    `[qchat] \u{1F50D} selecting client \u2014 requested accountId: "${accountId ?? "none"}", available clients: [${allClientKeys.join(", ")}], count: ${allClientKeys.length}`
  );
  const client = accountId ? qchatClients.get(accountId) ?? null : getSharedQChatClient();
  if (!client) {
    log.error(
      `[qchat] send failed \u2014 reason: client not connected, instance: ${accountId ?? "unknown"}, available: [${allClientKeys.join(", ")}]`
    );
    return {
      ok: false,
      messageId: "",
      error: new Error("QChat client not connected")
    };
  }
  log.info(
    `[qchat] \u2705 client selected \u2014 accountId: "${accountId ?? "fallback"}", using client for: ${client ? "found" : "none"}`
  );
  const isReply = !!opts?.replyMessage;
  log.info(
    `[qchat] sending ${isReply ? "reply" : "message"} \u2014 server: ${serverId}, channel: ${channelId}, length: ${text.length}`
  );
  const result = isReply ? await client.replyText({
    serverId,
    channelId,
    text,
    replyMessage: opts.replyMessage
  }) : await client.sendText({ serverId, channelId, text });
  if (!result.ok) {
    log.error(`[qchat] send failed \u2014 error: ${result.error ?? "unknown"}`);
  } else {
    log.info(
      `[qchat] message sent \u2014 message id: ${result.msgServerId ?? "unknown"}`
    );
  }
  return {
    ok: result.ok,
    messageId: result.msgServerId ?? "",
    error: result.error ? new Error(result.error) : void 0
  };
}

// ../../../../private/var/folders/6x/3ly9x_r91n79twv0l75cwbn40000gp/T/openclaw-plugin-staging-dxrN1K/openclaw-plugin-source-6P3hMg/src/qchat-inbound.ts
init_runtime();
init_accounts();
import {
  formatTextWithAttachmentLinks,
  resolveOutboundMediaUrls
} from "openclaw/plugin-sdk/reply-payload";
import { createChannelReplyPipeline } from "openclaw/plugin-sdk/channel-reply-pipeline";
init_name_resolver();
init_client();
var CHANNEL_ID = "nim";
var QCHAT_SURFACE = "nim-qchat";
function parseQChatMessage(resp, botAccid) {
  const msg = resp.message;
  if (!msg) return null;
  const messageType = msg.type ?? (typeof msg.msg_type === "string" ? msg.msg_type : void 0);
  const legacyType = typeof msg.msg_type === "number" ? msg.msg_type : void 0;
  if (messageType && messageType !== "text") return null;
  if (legacyType !== void 0 && legacyType !== 0) return null;
  const serverId = msg.serverId ?? msg.server_id ?? "";
  const channelId = msg.channelId ?? msg.channel_id ?? "";
  const senderAccid = msg.fromAccount ?? msg.from_accid ?? "";
  const text = msg.body ?? msg.msg_body ?? "";
  if (!serverId || !channelId || !senderAccid || !text.trim()) return null;
  const mentionAll = (msg.mentionAll ?? msg.mention_all) === true;
  const mentionAccids = msg.mentionAccids ?? msg.mention_accids ?? [];
  const wasMentioned = mentionAll || mentionAccids.includes(botAccid);
  return {
    messageId: msg.msgIdServer ?? msg.msg_server_id ?? `${Date.now()}`,
    serverId,
    channelId,
    senderAccid,
    senderNick: msg.fromNick ?? msg.from_nick,
    text: text.trim(),
    timestamp: msg.time ?? msg.timestamp ?? Date.now(),
    wasMentioned,
    mentionAccids,
    rawMessage: msg,
    channelInfo: msg.channelInfo
    // 🔥 传递频道信息
  };
}
async function deliverQChatReply(params) {
  const combined = formatTextWithAttachmentLinks(
    params.payload.text,
    resolveOutboundMediaUrls(params.payload)
  );
  params.runtime?.log?.(
    `[qchat] \u{1F4E4} delivering reply \u2014 target: ${params.target}, text length: ${combined?.length || 0}, has media: ${(resolveOutboundMediaUrls(params.payload) || []).length > 0}`
  );
  if (!combined) {
    params.runtime?.log?.(`[qchat] \u26A0\uFE0F skipping empty reply`);
    return;
  }
  params.runtime?.log?.(
    `[qchat] \u{1F4E8} sending QChat message \u2014 content preview: "${combined.substring(0, 50)}${combined.length > 50 ? "..." : ""}"`
  );
  await sendQChatMessage(params.target, combined, {
    accountId: params.accountId,
    replyMessage: params.replyMessage
  });
  params.runtime?.log?.(
    `[qchat] \u2705 QChat message sent successfully \u2014 target: ${params.target}`
  );
  params.statusSink?.({ lastOutboundAt: Date.now() });
}
async function handleQChatInbound(params) {
  const { message, botAccid, accountId, config, runtime, statusSink } = params;
  const core = getNimRuntime();
  const rawBody = message.text;
  if (!rawBody) return;
  statusSink?.({ lastInboundAt: message.timestamp });
  if (message.senderAccid === botAccid) return;
  if (!message.wasMentioned) return;
  const peerId = `${message.serverId}:${message.channelId}`;
  const nimCfg = config.channels?.nim;
  const nimClient = nimCfg ? getCachedNimClient(nimCfg) : void 0;
  const nativeNim = nimClient?.nativeNim;
  const senderDisplay = nativeNim ? await resolveUserNick(nativeNim, message.senderAccid, message.senderNick) : message.senderNick ?? message.senderAccid;
  const channelDisplayName = nativeNim ? await resolveQChatChannelName(
    nativeNim,
    message.serverId,
    message.channelId
  ) : peerId;
  const conversationLabel = buildConversationLabel("qchat", channelDisplayName);
  let resolvedBody = rawBody;
  const mentionAccids = message.mentionAccids ?? [];
  if (mentionAccids.length > 0 && nativeNim) {
    for (const accid of mentionAccids) {
      if (resolvedBody.includes(`@${accid}`)) {
        const nick = await resolveUserNick(nativeNim, accid);
        if (nick && nick !== accid) {
          resolvedBody = resolvedBody.split(`@${accid}`).join(`@${nick}`);
        }
      }
    }
  }
  core.channel.activity.record({
    channel: CHANNEL_ID,
    accountId,
    direction: "inbound",
    at: message.timestamp
  });
  const route = core.channel.routing.resolveAgentRoute({
    cfg: config,
    channel: CHANNEL_ID,
    accountId,
    peer: {
      kind: "channel",
      id: peerId
    }
  });
  if (!route) {
    runtime.error?.(`[qchat] route unresolved \u2014 target: ${peerId}`);
    return;
  }
  const channelInfo = message.channelInfo;
  let contextualBody = rawBody;
  runtime.log?.(
    `[qchat] \u{1F50D} checking channel info \u2014 channelInfo exists: ${!!channelInfo}, has topic: ${!!channelInfo?.topic}`
  );
  if (channelInfo) {
    runtime.log?.(
      `[qchat] \u{1F4CB} channel info details \u2014 name: "${channelInfo.name}", topic: "${channelInfo.topic}", keys: [${Object.keys(channelInfo).join(", ")}]`
    );
    runtime.log?.(
      `[qchat] \u{1F50D} topic type: ${typeof channelInfo.topic}, topic value: "${channelInfo.topic}", topic length: ${channelInfo.topic?.length}`
    );
  }
  runtime.log?.(
    `[qchat] \u{1F50D} conditional check: channelInfo=${!!channelInfo}, topic=${!!channelInfo?.topic}, will use context: ${!!channelInfo?.topic}`
  );
  if (channelInfo?.topic) {
    contextualBody = `[\u9891\u9053\u4FE1\u606F] \u5F53\u524D\u9891\u9053: "${channelInfo.name}", \u4E3B\u9898: "${channelInfo.topic}"

\u7528\u6237\u6D88\u606F: ${rawBody}`;
    runtime.log?.(
      `[qchat] channel context added \u2014 channel: "${channelInfo.name}", topic: "${channelInfo.topic}"`
    );
  } else {
    runtime.log?.(
      `[qchat] \u26A0\uFE0F no channel topic available \u2014 using original message body`
    );
  }
  const inboundLabel = ` From ${senderDisplay} in ${channelDisplayName}`;
  core.system.enqueueSystemEvent(`${inboundLabel}`, {
    sessionKey: route.sessionKey,
    contextKey: `nim:qchat:message:${peerId}:${message.messageId}`
  });
  const storePath = core.channel.session.resolveStorePath(
    config.session?.store,
    {
      agentId: route.agentId
    }
  );
  const envelopeOptions = core.channel.reply.resolveEnvelopeFormatOptions(config);
  const previousTimestamp = core.channel.session.readSessionUpdatedAt({
    storePath,
    sessionKey: route.sessionKey
  });
  const body = core.channel.reply.formatAgentEnvelope({
    channel: "QChat",
    from: senderDisplay,
    timestamp: message.timestamp,
    previousTimestamp,
    envelope: envelopeOptions,
    body: contextualBody
    // 🔥 使用包含频道信息的内容
  });
  runtime.log?.(
    `[qchat] \u{1F4CB} building context payload \u2014 From: nim:qchat:${message.senderAccid}, To: nim:qchat:${peerId}, SessionKey: ${route.sessionKey}, AccountId: ${route.accountId}, ChatType: group, ConversationLabel: server:${message.serverId}/channel:${message.channelId}, SenderName: ${senderDisplay}, SenderId: ${message.senderAccid}, GroupSubject: ${peerId}, Provider: ${CHANNEL_ID}, Surface: ${QCHAT_SURFACE}, WasMentioned: true, MessageSid: ${message.messageId}, Timestamp: ${message.timestamp}, OriginatingChannel: ${CHANNEL_ID}, OriginatingTo: nim:qchat:${peerId}, CommandAuthorized: true`
  );
  const ctxPayload = core.channel.reply.finalizeInboundContext({
    Body: body,
    RawBody: resolvedBody,
    CommandBody: resolvedBody,
    From: `nim:${message.senderAccid}`,
    To: `nim:qchat:${peerId}`,
    SessionKey: route.sessionKey,
    AccountId: route.accountId,
    ChatType: "direct",
    ConversationLabel: conversationLabel,
    SenderName: senderDisplay,
    SenderId: message.senderAccid,
    Provider: CHANNEL_ID,
    Surface: QCHAT_SURFACE,
    WasMentioned: true,
    MessageSid: message.messageId,
    Timestamp: message.timestamp,
    OriginatingChannel: CHANNEL_ID,
    OriginatingTo: `nim:qchat:${peerId}`,
    CommandAuthorized: true
  });
  runtime.log?.(
    `[qchat] \u2705 context payload finalized \u2014 Body: "${JSON.stringify(body)}", RawBody: "${JSON.stringify(rawBody)}"`
  );
  await core.channel.session.recordInboundSession({
    storePath,
    sessionKey: ctxPayload.SessionKey ?? route.sessionKey,
    ctx: ctxPayload,
    onRecordError: (err) => {
      runtime.error?.(`[qchat] session update failed \u2014 error: ${String(err)}`);
    }
  });
  const { onModelSelected, ...prefixOptions } = createChannelReplyPipeline({
    cfg: config,
    agentId: route.agentId,
    channel: CHANNEL_ID,
    accountId
  });
  const qchatBuffer = [];
  let qchatMediaUrls = [];
  let deliveryCount = 0;
  const deliverReply = async (payload) => {
    deliveryCount++;
    const liveNimCfg = config.channels?.nim;
    const liveQchatCfg = liveNimCfg?.qchat;
    const livePolicy = liveQchatCfg?.policy ?? "open";
    const liveAllowFrom = liveQchatCfg?.allowFrom ?? [];
    const deliveryCheck = isQChatAllowed({
      policy: livePolicy,
      allowFrom: liveAllowFrom,
      serverId: message.serverId,
      channelId: message.channelId,
      senderAccid: message.senderAccid
    });
    if (!deliveryCheck.allowed) {
      runtime.log(
        `[qchat] reply suppressed \u2014 reason: policy now blocks delivery (policy: ${livePolicy}), target: ${peerId}`
      );
      return;
    }
    const text = payload.text ?? "";
    const mediaUrls = resolveOutboundMediaUrls(payload) || [];
    if (text) {
      qchatBuffer.push(text);
      runtime.log(
        `[qchat] buffering text chunk #${deliveryCount} \u2014 length: ${text.length}, buffer size: ${qchatBuffer.length}`
      );
    }
    if (mediaUrls.length > 0) {
      qchatMediaUrls.push(...mediaUrls);
      runtime.log(
        `[qchat] buffering media \u2014 count: ${mediaUrls.length}, total: ${qchatMediaUrls.length}`
      );
    }
    runtime.log(
      `[qchat] chunk buffered (delivery #${deliveryCount}), waiting for more chunks...`
    );
  };
  runtime.log?.(
    `[qchat] streaming and chunking disabled for QChat \u2014 using complete message delivery`
  );
  await core.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
    ctx: ctxPayload,
    cfg: config,
    dispatcherOptions: {
      ...prefixOptions,
      deliver: deliverReply,
      disableStreaming: true,
      // 🔥 Disable streaming for QChat
      textChunkLimit: Infinity,
      // 🔥 Disable text chunking for QChat
      chunker: void 0,
      // 🔥 Disable chunker function
      onError: (err, info) => {
        runtime.error?.(
          `[qchat] ${info.kind} reply failed \u2014 error: ${String(err)}`
        );
      }
    },
    replyOptions: {
      onModelSelected
    }
  });
  if (qchatBuffer.length > 0) {
    const combinedText = qchatBuffer.join("");
    runtime.log(
      `[qchat] sending buffered complete message \u2014 total chunks: ${qchatBuffer.length}, total length: ${combinedText.length}`
    );
    const completePayload = {
      text: combinedText,
      mediaUrls: qchatMediaUrls.length > 0 ? qchatMediaUrls : void 0
    };
    try {
      await deliverQChatReply({
        payload: completePayload,
        target: peerId,
        accountId,
        replyMessage: message.rawMessage,
        statusSink,
        runtime
      });
      runtime.log(
        `[qchat] complete message delivered \u2014 length: ${combinedText.length}`
      );
    } catch (error) {
      runtime.error?.(
        `[qchat] failed to send buffered message \u2014 error: ${String(error)}`
      );
    }
  } else {
    runtime.log(
      `[qchat] no buffered content to send \u2014 buffer was empty`
    );
  }
}

// ../../../../private/var/folders/6x/3ly9x_r91n79twv0l75cwbn40000gp/T/openclaw-plugin-staging-dxrN1K/openclaw-plugin-source-6P3hMg/src/channel.ts
init_accounts();

// ../../../../private/var/folders/6x/3ly9x_r91n79twv0l75cwbn40000gp/T/openclaw-plugin-staging-dxrN1K/openclaw-plugin-source-6P3hMg/src/config-schema.ts
init_nim_token();
import { z } from "zod";
var coerceToString2 = z.preprocess(
  (val) => typeof val === "number" ? String(val) : val,
  z.string()
);
var AllowEntryArray = z.array(z.union([z.string(), z.number()])).optional();
var P2pSubConfigSchema = z.object({
  /**
   * Access policy.
   *   open      — accept messages from anyone (default)
   *   allowlist — only accept senders listed in allowFrom
   *   disabled  — reject all P2P messages
   */
  policy: z.enum(["open", "allowlist", "disabled"]).optional().default("open"),
  /** Allowed sender IDs (used when policy="allowlist") */
  allowFrom: AllowEntryArray
});
var TeamSubConfigSchema = z.object({
  /**
   * Access policy.
   *   open      — accept messages from any group (default)
   *   allowlist — only accept groups (and optionally senders) listed in allowFrom
   *   disabled  — reject all team messages
   */
  policy: z.enum(["open", "allowlist", "disabled"]).optional().default("open"),
  /**
   * Allowlist entries (used when policy="allowlist").
   * Supported formats (case-insensitive):
   *   "groupId"           — any sender in this group
   *   "groupId|accountId" — specific sender in this group
   */
  allowFrom: AllowEntryArray
});
var AdvancedSubConfigSchema = z.object({
  /** Maximum media file size in MB */
  mediaMaxMb: z.number().min(0).optional().default(30),
  /** Text chunk limit for splitting long messages */
  textChunkLimit: z.number().min(1).optional().default(4e3),
  /** Enable debug logging */
  debug: z.boolean().optional().default(false),
  /** Internal: legacy login mode */
  legacyLogin: z.boolean().optional().default(false),
  /** Private deployment: custom LBS URL */
  weblbsUrl: z.string().optional(),
  /** Private deployment: default WebSocket/TCP link address */
  link_web: z.string().optional(),
  /** Private deployment: NOS upload address */
  nos_uploader: z.string().optional(),
  /** Private deployment: NOS download URL format */
  nos_downloader_v2: z.string().optional(),
  /** Private deployment: whether NOS download uses HTTPS */
  nosSsl: z.boolean().optional(),
  /** Private deployment: CDN accelerate URL format */
  nos_accelerate: z.string().optional(),
  /** Private deployment: CDN accelerate host domain (empty string to disable) */
  nos_accelerate_host: z.string().optional()
});
var QChatSubConfigSchema = z.object({
  /**
   * Inbound message policy.
   *   open      — accept all @-mentioned messages (default)
   *   allowlist — only accept messages matching allowFrom entries
   *   disabled  — reject all inbound QChat messages
   */
  policy: z.enum(["open", "allowlist", "disabled"]).optional().default("open"),
  /**
   * Inbound message allowlist. Controls both message filtering and server invite auto-accept.
   * Empty = accept all @-mentioned messages and auto-accept all server invites.
   *
   * Supported formats (case-insensitive):
   *   "serverId"                     — any channel, any sender in this server
   *   "serverId|channelId"           — any sender in this server+channel
   *   "serverId|channelId|accountId" — specific sender in this server+channel
   *   "serverId||accountId"          — specific sender in any channel of this server
   *
   * Server IDs present in any entry are also used for subscription and invite auto-accept.
   */
  allowFrom: AllowEntryArray
});
var NimInstanceConfigSchema = z.object({
  /** Whether this account is enabled */
  enabled: z.boolean().optional().default(false),
  /**
   * Shorthand credential: "appKey|accid|token" (preferred) or legacy "appKey-accid-token".
   * When present and valid, takes priority over individual appKey/account/token fields.
   */
  nimToken: z.string().optional(),
  /** NIM App Key (coerced from number if needed) */
  appKey: coerceToString2.optional(),
  /** Bot account ID (coerced from number if needed) */
  account: coerceToString2.optional(),
  /** Authentication token (coerced from number if needed) */
  token: coerceToString2.optional(),
  /** Whether to enable anti-spam protection */
  antispamEnabled: z.boolean().optional().default(true),
  /** P2P (私聊) sub-configuration */
  p2p: P2pSubConfigSchema.optional(),
  /** Team (群组) sub-configuration */
  team: TeamSubConfigSchema.optional(),
  /** Advanced (基础设置) sub-configuration */
  advanced: AdvancedSubConfigSchema.optional(),
  /** QChat (圈组) sub-configuration */
  qchat: QChatSubConfigSchema.optional()
});
var NimAccountsSchema = z.record(z.string(), NimInstanceConfigSchema).superRefine((accounts, ctx) => {
  const entries = Object.entries(accounts);
  if (entries.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "channels.nim.accounts must have at least one account",
      path: []
    });
    return;
  }
  if (entries.length > 3) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "channels.nim.accounts may have at most 3 accounts",
      path: []
    });
  }
  const seen = /* @__PURE__ */ new Set();
  for (const [accountKey, inst] of entries) {
    let key = null;
    if (inst.nimToken) {
      const parsed = parseNimToken(inst.nimToken);
      if (parsed) key = `${parsed.appKey}:${parsed.account}`;
    } else if (inst.appKey && inst.account) {
      key = `${inst.appKey}:${inst.account}`;
    }
    if (key) {
      if (seen.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate NIM account credentials: "${key}" appears more than once`,
          path: [accountKey]
        });
      }
      seen.add(key);
    }
  }
});
var NimConfigSchema = z.object({
  accounts: NimAccountsSchema
});
var nimChannelConfigJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    accounts: {
      type: "object",
      minProperties: 1,
      maxProperties: 3,
      additionalProperties: {
        type: "object",
        additionalProperties: false,
        properties: {
          enabled: { type: "boolean" },
          nimToken: { type: "string" },
          appKey: { type: "string" },
          account: { type: "string" },
          token: { type: "string" },
          antispamEnabled: { type: "boolean" },
          p2p: {
            type: "object",
            additionalProperties: false,
            properties: {
              policy: {
                type: "string",
                enum: ["open", "allowlist", "disabled"]
              },
              allowFrom: {
                type: "array",
                items: { oneOf: [{ type: "string" }, { type: "number" }] }
              }
            }
          },
          team: {
            type: "object",
            additionalProperties: false,
            properties: {
              policy: {
                type: "string",
                enum: ["open", "allowlist", "disabled"]
              },
              allowFrom: {
                type: "array",
                items: { oneOf: [{ type: "string" }, { type: "number" }] }
              }
            }
          },
          advanced: {
            type: "object",
            additionalProperties: false,
            properties: {
              mediaMaxMb: { type: "number", minimum: 0 },
              textChunkLimit: { type: "integer", minimum: 1 },
              debug: { type: "boolean" },
              legacyLogin: { type: "boolean" },
              weblbsUrl: { type: "string" },
              link_web: { type: "string" },
              nos_uploader: { type: "string" },
              nos_downloader_v2: { type: "string" },
              nosSsl: { type: "boolean" },
              nos_accelerate: { type: "string" },
              nos_accelerate_host: { type: "string" }
            }
          },
          qchat: {
            type: "object",
            additionalProperties: false,
            properties: {
              policy: {
                type: "string",
                enum: ["open", "allowlist", "disabled"]
              },
              allowFrom: {
                type: "array",
                items: { oneOf: [{ type: "string" }, { type: "number" }] }
              }
            }
          }
        }
      }
    }
  }
};
var nimChannelConfigUiHints = {
  enabled: { label: "Enable" },
  nimToken: { label: "NIM Token", sensitive: true },
  appKey: { label: "App Key" },
  account: { label: "Account ID" },
  token: { label: "Token", sensitive: true },
  antispamEnabled: { label: "Anti-spam Protection" },
  p2p: { label: "P2P" },
  "p2p.policy": { label: "Message Policy" },
  "p2p.allowFrom": { label: "Account Allowlist" },
  team: { label: "Team" },
  "team.policy": { label: "Message Policy" },
  "team.allowFrom": { label: "Team Allowlist" },
  qchat: { label: "QChat" },
  "qchat.policy": { label: "Message Policy" },
  "qchat.allowFrom": {
    label: "Server / Channel / Account Allowlist"
  },
  advanced: { label: "Advanced", advanced: true },
  "advanced.mediaMaxMb": { label: "Max Media Size (MB)" },
  "advanced.textChunkLimit": { label: "Text Chunk Limit" },
  "advanced.debug": { label: "Debug Mode", advanced: true },
  "advanced.legacyLogin": { label: "Legacy Login Mode", advanced: true },
  "advanced.weblbsUrl": {
    label: "LBS URL (Private Deploy)",
    advanced: true
  },
  "advanced.link_web": {
    label: "Link Server URL (Private Deploy)",
    advanced: true
  },
  "advanced.nos_uploader": {
    label: "NOS Upload URL (Private Deploy)",
    advanced: true
  },
  "advanced.nos_downloader_v2": {
    label: "NOS Download URL Format (Private Deploy)",
    advanced: true
  },
  "advanced.nosSsl": {
    label: "NOS Download HTTPS (Private Deploy)",
    advanced: true
  },
  "advanced.nos_accelerate": {
    label: "CDN Accelerate URL (Private Deploy)",
    advanced: true
  },
  "advanced.nos_accelerate_host": {
    label: "CDN Accelerate Host (Private Deploy)",
    advanced: true
  }
};

// ../../../../private/var/folders/6x/3ly9x_r91n79twv0l75cwbn40000gp/T/openclaw-plugin-staging-dxrN1K/openclaw-plugin-source-6P3hMg/src/channel.ts
var meta = {
  id: "nim",
  label: "NIM",
  selectionLabel: "NetEase IM (\u7F51\u6613\u4E91\u4FE1)",
  docsPath: "/channels/nim",
  docsLabel: "nim",
  blurb: "\u7F51\u6613\u4E91\u4FE1 IM \u5373\u65F6\u901A\u8BAF\u3002",
  aliases: ["netease", "yunxin"],
  order: 80
};
function getNimAccountsMap(nimCfg) {
  const accounts = nimCfg?.accounts;
  if (!accounts || typeof accounts !== "object" || Array.isArray(accounts)) {
    return {};
  }
  return accounts;
}
function findAccountEntryKey(accounts, accountId) {
  if (accountId in accounts) return accountId;
  for (const [entryKey, inst] of Object.entries(accounts)) {
    const creds = resolveNimCredentials(inst);
    const derived = creds ? `${creds.appKey}:${creds.account}` : null;
    if (derived === accountId) return entryKey;
  }
  return null;
}
function resolveDmScope(cfg) {
  const sessionCfg = cfg.session;
  return typeof sessionCfg?.dmScope === "string" ? sessionCfg.dmScope : "";
}
function buildDmScopeWarning(cfg) {
  const accounts = resolveAllNimAccounts({ cfg }).filter((account) => account.enabled);
  if (accounts.length <= 1) return null;
  const dmScope = resolveDmScope(cfg);
  if (dmScope === "per-account-channel-peer") return null;
  return `[nim] multi-account DM isolation requires session.dmScope="per-account-channel-peer"; current value is "${dmScope || "unset"}", so different bot accounts may share one direct-message session`;
}
var nimPlugin = {
  id: "nim",
  meta: {
    ...meta
  },
  capabilities: {
    chatTypes: ["direct", "group"],
    polls: false,
    threads: false,
    media: true,
    reactions: false,
    edit: false,
    reply: false
  },
  agentPrompt: {
    messageToolHints: () => [
      "- NIM targeting: omit `target` to reply to the current conversation (auto-inferred). Explicit targets: `user:<accountId>` for P2P, `team:<teamId>` for team group.",
      "- For group conversations, always send to the group (do NOT send P2P to individual users unless explicitly asked).",
      "- NIM supports text, image, file, audio, and video messages.",
      "- To send an image: use the `mediaUrl` or `mediaPath` parameter with an image file path (png, jpg, gif, webp).",
      "- To send a file: use `mediaUrl` or `mediaPath` with any file path.",
      "- To send audio: use `mediaUrl` or `mediaPath` with an audio file (mp3, wav, aac, m4a).",
      "- To send video: use `mediaUrl` or `mediaPath` with a video file (mp4, mov, avi, webm)."
    ]
  },
  reload: { configPrefixes: ["channels.nim"] },
  configSchema: {
    schema: nimChannelConfigJsonSchema,
    uiHints: nimChannelConfigUiHints
  },
  config: {
    listAccountIds: (cfg) => {
      const ids = listNimAccountIds(cfg);
      console.log(
        `[nim] listAccountIds \u2014 raw nim type: ${Array.isArray(cfg?.channels?.nim) ? "array" : typeof cfg?.channels?.nim}, ids: [${ids.join(", ")}]`
      );
      return ids;
    },
    resolveAccount: (cfg, accountId) => accountId ? resolveNimAccountById({ cfg, accountId }) : resolveNimAccount({ cfg }),
    defaultAccountId: (cfg) => listNimAccountIds(cfg)[0] ?? "",
    setAccountEnabled: ({ cfg, accountId, enabled }) => {
      const nimCfg = cfg.channels?.nim;
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
              [entryKey]: { ...accounts[entryKey], enabled }
            }
          }
        }
      };
    },
    deleteAccount: ({ cfg, accountId }) => {
      const nimCfg = cfg.channels?.nim;
      const deleteChannel = () => {
        const next = { ...cfg };
        const nextChannels = { ...cfg.channels };
        delete nextChannels.nim;
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
          nim: { ...nimCfg, accounts: nextAccounts }
        }
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
      configured: account.configured
    }),
    resolveAllowFrom: ({ cfg, accountId }) => {
      const account = accountId ? resolveNimAccountById({ cfg, accountId }) : resolveNimAccount({ cfg });
      return account.allowFrom ?? [];
    },
    formatAllowFrom: ({ allowFrom }) => allowFrom.map((entry) => String(entry).trim()).filter(Boolean).map((entry) => entry.toLowerCase())
  },
  security: {
    resolveDmPolicy: ({ account }) => ({
      policy: account.p2pPolicy ?? "open",
      allowFrom: account.allowFrom ?? [],
      allowFromPath: "channels.nim.accounts.<accountKey>.p2p.",
      normalizeEntry: (raw) => raw.replace(/^(nim|user|account):/i, ""),
      approveHint: "Set p2p.policy to 'allowlist' and configure p2p.allowFrom to control who can message the bot."
    }),
    collectWarnings: ({ cfg }) => {
      const all = resolveAllNimAccounts({ cfg });
      const warnings = [];
      const dmScopeWarning = buildDmScopeWarning(cfg);
      if (dmScopeWarning) {
        warnings.push(`- ${dmScopeWarning.replace(/^\[nim\]\s*/, "")}.`);
      }
      for (const account of all) {
        const label = account.runtimeAccountId || account.accountId || account.account;
        const inst = account.config;
        if (account.p2pPolicy === "open") {
          warnings.push(
            `- NIM [${label}] P2P: p2p.policy="open" allows any user to message. Set p2p.policy="allowlist" + p2p.allowFrom to restrict senders.`
          );
        }
        if (account.teamPolicy === "open") {
          warnings.push(
            `- NIM [${label}] teams: team.policy="open" allows any group to trigger (mention-gated). Set team.policy="allowlist" + team.allowFrom to restrict by group ID.`
          );
        }
        const qchatCfg = inst?.qchat;
        if (qchatCfg) {
          const qchatPolicy = qchatCfg.policy ?? "open";
          if (qchatPolicy === "open") {
            warnings.push(
              `- QChat [${label}]: policy="open" accepts all @-mentioned messages and auto-accepts all server invites. Set qchat.policy="allowlist" + qchat.allowFrom to restrict.`
            );
          }
        }
      }
      return warnings;
    }
  },
  setup: {
    resolveAccountId: ({ cfg }) => listNimAccountIds(cfg)[0] ?? "",
    applyAccountConfig: ({ cfg }) => {
      const nimCfg = cfg.channels?.nim;
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
              [firstEntryKey]: { ...accounts[firstEntryKey], enabled: true }
            }
          }
        }
      };
    }
  },
  messaging: {
    normalizeTarget: normalizeNimTarget,
    targetResolver: {
      looksLikeId: looksLikeNimId,
      hint: "<accountId|user:accountId|team:teamId|superTeam:teamId>"
    }
  },
  outbound: nimOutboundConfig,
  status: {
    defaultRuntime: null,
    // Multi-instance: no single default runtime
    buildChannelSummary: ({ snapshot }) => ({
      configured: snapshot.configured ?? false,
      running: snapshot.running ?? false,
      connected: snapshot.connected ?? false,
      lastStartAt: snapshot.lastStartAt ?? null,
      lastStopAt: snapshot.lastStopAt ?? null,
      lastError: snapshot.lastError ?? null,
      probe: snapshot.probe,
      lastProbeAt: snapshot.lastProbeAt ?? null
    }),
    probeAccount: async ({ account, cfg }) => {
      const accountId = account.accountId;
      const inst = accountId ? resolveNimAccountById({ cfg, accountId }) : resolveNimAccount({ cfg });
      return await probeNim(inst.configured ? inst.config : void 0);
    },
    buildAccountSnapshot: ({ account, runtime, probe }) => {
      const running = runtime?.running ?? false;
      const probeConnected = probe?.connected;
      return {
        accountId: account.accountId,
        enabled: account.enabled,
        configured: account.configured,
        running,
        connected: probeConnected ?? running,
        lastStartAt: runtime?.lastStartAt ?? null,
        lastStopAt: runtime?.lastStopAt ?? null,
        lastError: runtime?.lastError ?? null,
        probe
      };
    }
  },
  gateway: {
    startAccount: async (ctx) => {
      const { monitorNimProvider: monitorNimProvider2 } = await Promise.resolve().then(() => (init_monitor(), monitor_exports));
      const account = resolveNimAccountById({
        cfg: ctx.cfg,
        accountId: ctx.accountId
      });
      const nimCfg = account.configured ? account.config : void 0;
      ctx.setStatus({ accountId: ctx.accountId });
      ctx.log?.info(
        `[nim] provider starting \u2014 account: ${account.account || "unknown"}, instanceId: ${ctx.accountId}`
      );
      const dmScopeWarning = buildDmScopeWarning(ctx.cfg);
      if (dmScopeWarning) {
        ctx.log?.warn(dmScopeWarning);
      }
      const qchatCfg = nimCfg?.qchat;
      const qchatPolicy = qchatCfg?.policy ?? "open";
      const qchatAllowFrom = qchatCfg?.allowFrom ?? [];
      const isEffectivelyDisabled = qchatPolicy === "disabled" || qchatPolicy === "allowlist" && qchatAllowFrom.length === 0;
      setQchatReplyEnabled(ctx.accountId, !isEffectivelyDisabled);
      ctx.log?.info(
        `[qchat] reply enabled: ${!isEffectivelyDisabled} \u2014 policy: ${qchatPolicy}, allowFrom count: ${qchatAllowFrom.length}, instance: ${ctx.accountId}`
      );
      let gatewayAborted = false;
      ctx.abortSignal.addEventListener(
        "abort",
        () => {
          gatewayAborted = true;
        },
        { once: true }
      );
      let qchatClient = null;
      if (nimCfg?.appKey && nimCfg?.account) {
        const qchatLogAdapter = ctx.log ? {
          info: (msg) => ctx.log.info(`[qchat] ${msg}`),
          error: (msg) => ctx.log.error(`[qchat] ${msg}`),
          debug: ctx.log.debug ? (msg) => ctx.log.debug(`[qchat] ${msg}`) : void 0
        } : void 0;
        const allowFrom = qchatCfg?.allowFrom ?? [];
        const derivedServerIds = qchatPolicy === "allowlist" ? [
          ...new Set(
            allowFrom.map((e) => String(e).split("|")[0].trim()).filter(Boolean)
          )
        ] : [];
        const serverIdsLabel = derivedServerIds.length > 0 ? `servers=[${derivedServerIds.join(",")}]` : "servers=auto-discover";
        ctx.log?.info(
          `[qchat] client preparing \u2014 ${serverIdsLabel}, instance: ${ctx.accountId}`
        );
        qchatClient = new QChatClient({
          appKey: nimCfg.appKey,
          account: nimCfg.account,
          serverIds: derivedServerIds.length > 0 ? derivedServerIds : void 0,
          serverPolicy: qchatPolicy,
          serverAllowlist: derivedServerIds,
          log: qchatLogAdapter,
          onMessage: async (resp) => {
            const raw = resp.message;
            ctx.log?.info(
              `[qchat] received message \u2014 server: ${raw?.serverId ?? raw?.server_id ?? "unknown"}, channel: ${raw?.channelId ?? raw?.channel_id ?? "unknown"}, sender: ${raw?.fromAccount ?? raw?.from_accid ?? "unknown"}, message id: ${raw?.msgIdServer ?? raw?.msg_server_id ?? "unknown"}, timestamp: ${raw?.time ?? raw?.timestamp ?? "unknown"}`
            );
            const liveAccount = resolveNimAccountById({
              cfg: ctx.cfg,
              accountId: ctx.accountId
            });
            const liveInstCfg = liveAccount.configured ? liveAccount.config : void 0;
            const msg = parseQChatMessage(
              resp,
              liveInstCfg?.account ?? ""
            );
            if (!msg) {
              ctx.log?.info(
                "[qchat] message dropped \u2014 reason: unsupported or missing fields"
              );
              return;
            }
            ctx.log?.info(
              `[qchat] parsed message \u2014 sender: ${msg.senderAccid}, target: ${msg.serverId}:${msg.channelId}, mentioned: ${msg.wasMentioned ? "yes" : "no"}, message id: ${msg.messageId}`
            );
            if (msg.senderAccid === (liveInstCfg?.account ?? "")) {
              ctx.log?.info("[qchat] skipped \u2014 reason: message from self");
              return;
            }
            if (gatewayAborted) return;
            const liveQchatCfg = liveInstCfg?.qchat;
            const livePolicy = liveQchatCfg?.policy ?? "open";
            const liveAllowFrom = liveQchatCfg?.allowFrom ?? [];
            const policyResult = isQChatAllowed({
              policy: livePolicy,
              allowFrom: liveAllowFrom,
              serverId: msg.serverId,
              channelId: msg.channelId,
              senderAccid: msg.senderAccid
            });
            ctx.log?.info(
              `[qchat] policy check \u2014 policy: ${livePolicy}, server: ${msg.serverId}, channel: ${msg.channelId}, sender: ${msg.senderAccid}`
            );
            if (!policyResult.allowed) {
              const blocked = policyResult;
              if (blocked.reason === "disabled") {
                ctx.log?.info(
                  `[qchat] dispatch skipped \u2014 reason: policy disabled, server: ${msg.serverId}, channel: ${msg.channelId}, sender: ${msg.senderAccid}`
                );
                ctx.setStatus({
                  accountId: ctx.accountId,
                  lastInboundAt: msg.timestamp
                });
              } else {
                ctx.log?.info(
                  `[qchat] dispatch skipped \u2014 reason: no matching allowFrom entry, server: ${msg.serverId}, channel: ${msg.channelId}, sender: ${msg.senderAccid}, allowFrom: [${blocked.allowFrom?.join(", ")}]`
                );
              }
              return;
            }
            ctx.log?.info(
              `[qchat] dispatching to agent \u2014 server: ${msg.serverId}, channel: ${msg.channelId}, sender: ${msg.senderAccid}`
            );
            try {
              await handleQChatInbound({
                message: msg,
                botAccid: liveInstCfg?.account ?? "",
                accountId: ctx.accountId,
                config: ctx.cfg,
                runtime: ctx.runtime,
                statusSink: (patch) => ctx.setStatus({ accountId: ctx.accountId, ...patch })
              });
              ctx.log?.info(
                `[qchat] agent pipeline completed \u2014 server: ${msg.serverId}, channel: ${msg.channelId}`
              );
            } catch (dispatchErr) {
              ctx.log?.error(
                `[qchat] agent pipeline error \u2014 error: ${String(dispatchErr)}`
              );
            }
          },
          onLoginStatus: (status) => {
            ctx.log?.info(
              `[qchat] login status changed \u2014 status: ${typeof status === "object" ? status?.code ?? String(status) : status}`
            );
          },
          onError: (err) => {
            ctx.log?.error(`[qchat] error \u2014 message: ${err.message}`);
          }
        });
        setSharedQChatClient(ctx.accountId, qchatClient);
      }
      if (qchatClient) {
        ctx.abortSignal.addEventListener(
          "abort",
          () => {
            qchatClient.stop().catch((err) => {
              ctx.log?.error(`[qchat] shutdown failed \u2014 error: ${String(err)}`);
            });
            setSharedQChatClient(ctx.accountId, null);
            setQchatReplyEnabled(ctx.accountId, false);
          },
          { once: true }
        );
      }
      return monitorNimProvider2({
        cfg: ctx.cfg,
        accountId: ctx.accountId,
        runtime: ctx.runtime,
        abortSignal: ctx.abortSignal,
        qchatClient
      });
    }
  }
};

// ../../../../private/var/folders/6x/3ly9x_r91n79twv0l75cwbn40000gp/T/openclaw-plugin-staging-dxrN1K/openclaw-plugin-source-6P3hMg/index.ts
init_runtime();
init_monitor();
init_send();
init_media();
init_targets();
init_accounts();
console.log("[nim] plugin module loaded \u2014 multi-instance v2");
var plugin = {
  id: "nimsuite-openclaw-nim-channel",
  name: "NIM",
  description: "NetEase IM (\u7F51\u6613\u4E91\u4FE1) channel plugin",
  configSchema: emptyPluginConfigSchema(),
  register(api) {
    setNimRuntime(api.runtime);
    api.registerChannel({ plugin: nimPlugin });
  }
};
var openclaw_plugin_source_6P3hMg_default = plugin;
export {
  QChatClient,
  openclaw_plugin_source_6P3hMg_default as default,
  editMessageNim,
  formatNimTarget,
  getSharedQChatClient,
  handleQChatInbound,
  isNimMonitorRunning,
  isNimP2pAllowed,
  looksLikeNimId,
  monitorNimProvider,
  nimOutbound,
  nimOutboundConfig,
  nimPlugin,
  normalizeNimTarget,
  parseQChatMessage,
  probeNim,
  probeNimWithConnect,
  resolveNimAccount,
  resolveNimCredentials,
  resolveNimOutboundTarget,
  sendAudioNim,
  sendFileNim,
  sendImageNim,
  sendMessageNim,
  sendNimOutboundMedia,
  sendNimOutboundText,
  sendQChatMessage,
  sendVideoNim,
  setSharedQChatClient,
  stopNimMonitor
};
