var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// vendor/openclaw-runtime/mac-arm64/third-party-extensions/openclaw-weixin/src/storage/state-dir.ts
import os from "os";
import path from "path";
function resolveStateDir() {
  return process.env.OPENCLAW_STATE_DIR?.trim() || process.env.CLAWDBOT_STATE_DIR?.trim() || path.join(os.homedir(), ".openclaw");
}
var init_state_dir = __esm({
  "vendor/openclaw-runtime/mac-arm64/third-party-extensions/openclaw-weixin/src/storage/state-dir.ts"() {
    "use strict";
  }
});

// vendor/openclaw-runtime/mac-arm64/third-party-extensions/openclaw-weixin/src/util/logger.ts
import fs from "fs";
import os2 from "os";
import path2 from "path";
import { resolvePreferredOpenClawTmpDir } from "openclaw/plugin-sdk/infra-runtime";
function resolveMinLevel() {
  const env = process.env.OPENCLAW_LOG_LEVEL?.toUpperCase();
  if (env && env in LEVEL_IDS) return LEVEL_IDS[env];
  return LEVEL_IDS[DEFAULT_LOG_LEVEL];
}
function toLocalISO(now) {
  const offsetMs = -now.getTimezoneOffset() * 6e4;
  const sign = offsetMs >= 0 ? "+" : "-";
  const abs = Math.abs(now.getTimezoneOffset());
  const offStr = `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
  return new Date(now.getTime() + offsetMs).toISOString().replace("Z", offStr);
}
function localDateKey(now) {
  return toLocalISO(now).slice(0, 10);
}
function resolveMainLogPath() {
  const dateKey = localDateKey(/* @__PURE__ */ new Date());
  return path2.join(MAIN_LOG_DIR, `openclaw-${dateKey}.log`);
}
function buildLoggerName(accountId) {
  return accountId ? `${SUBSYSTEM}/${accountId}` : SUBSYSTEM;
}
function writeLog(level, message, accountId) {
  const levelId = LEVEL_IDS[level] ?? LEVEL_IDS.INFO;
  if (levelId < minLevelId) return;
  const now = /* @__PURE__ */ new Date();
  const loggerName = buildLoggerName(accountId);
  const prefixedMessage = accountId ? `[${accountId}] ${message}` : message;
  const entry = JSON.stringify({
    "0": loggerName,
    "1": prefixedMessage,
    _meta: {
      runtime: RUNTIME,
      runtimeVersion: RUNTIME_VERSION,
      hostname: HOSTNAME,
      name: loggerName,
      parentNames: PARENT_NAMES,
      date: now.toISOString(),
      logLevelId: LEVEL_IDS[level] ?? LEVEL_IDS.INFO,
      logLevelName: level
    },
    time: toLocalISO(now)
  });
  try {
    if (!logDirEnsured) {
      fs.mkdirSync(MAIN_LOG_DIR, { recursive: true });
      logDirEnsured = true;
    }
    fs.appendFileSync(resolveMainLogPath(), `${entry}
`, "utf-8");
  } catch {
  }
}
function createLogger(accountId) {
  return {
    info(message) {
      writeLog("INFO", message, accountId);
    },
    debug(message) {
      writeLog("DEBUG", message, accountId);
    },
    warn(message) {
      writeLog("WARN", message, accountId);
    },
    error(message) {
      writeLog("ERROR", message, accountId);
    },
    withAccount(id) {
      return createLogger(id);
    },
    getLogFilePath() {
      return resolveMainLogPath();
    },
    close() {
    }
  };
}
var MAIN_LOG_DIR, SUBSYSTEM, RUNTIME, RUNTIME_VERSION, HOSTNAME, PARENT_NAMES, LEVEL_IDS, DEFAULT_LOG_LEVEL, minLevelId, logDirEnsured, logger;
var init_logger = __esm({
  "vendor/openclaw-runtime/mac-arm64/third-party-extensions/openclaw-weixin/src/util/logger.ts"() {
    "use strict";
    MAIN_LOG_DIR = resolvePreferredOpenClawTmpDir();
    SUBSYSTEM = "gateway/channels/openclaw-weixin";
    RUNTIME = "node";
    RUNTIME_VERSION = process.versions.node;
    HOSTNAME = os2.hostname() || "unknown";
    PARENT_NAMES = ["openclaw"];
    LEVEL_IDS = {
      TRACE: 1,
      DEBUG: 2,
      INFO: 3,
      WARN: 4,
      ERROR: 5,
      FATAL: 6
    };
    DEFAULT_LOG_LEVEL = "INFO";
    minLevelId = resolveMinLevel();
    logDirEnsured = false;
    logger = createLogger();
  }
});

// vendor/openclaw-runtime/mac-arm64/third-party-extensions/openclaw-weixin/src/auth/pairing.ts
import fs2 from "fs";
import path3 from "path";
import { withFileLock } from "openclaw/plugin-sdk/infra-runtime";
function resolveCredentialsDir() {
  const override = process.env.OPENCLAW_OAUTH_DIR?.trim();
  if (override) return override;
  return path3.join(resolveStateDir(), "credentials");
}
function safeKey(raw) {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) throw new Error("invalid key for allowFrom path");
  const safe = trimmed.replace(/[\\/:*?"<>|]/g, "_").replace(/\.\./g, "_");
  if (!safe || safe === "_") throw new Error("invalid key for allowFrom path");
  return safe;
}
function resolveFrameworkAllowFromPath(accountId) {
  const base = safeKey("openclaw-weixin");
  const safeAccount = safeKey(accountId);
  return path3.join(resolveCredentialsDir(), `${base}-${safeAccount}-allowFrom.json`);
}
function readFrameworkAllowFromList(accountId) {
  const filePath = resolveFrameworkAllowFromPath(accountId);
  try {
    if (!fs2.existsSync(filePath)) return [];
    const raw = fs2.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.allowFrom)) {
      return parsed.allowFrom.filter((id) => typeof id === "string" && id.trim() !== "");
    }
  } catch {
  }
  return [];
}
var init_pairing = __esm({
  "vendor/openclaw-runtime/mac-arm64/third-party-extensions/openclaw-weixin/src/auth/pairing.ts"() {
    "use strict";
    init_state_dir();
    init_logger();
  }
});

// vendor/openclaw-runtime/mac-arm64/third-party-extensions/openclaw-weixin/src/auth/accounts.ts
import fs3 from "fs";
import path4 from "path";
import { normalizeAccountId } from "openclaw/plugin-sdk/account-id";
function deriveRawAccountId(normalizedId) {
  if (normalizedId.endsWith("-im-bot")) {
    return `${normalizedId.slice(0, -7)}@im.bot`;
  }
  if (normalizedId.endsWith("-im-wechat")) {
    return `${normalizedId.slice(0, -10)}@im.wechat`;
  }
  return void 0;
}
function resolveWeixinStateDir() {
  return path4.join(resolveStateDir(), "openclaw-weixin");
}
function resolveAccountIndexPath() {
  return path4.join(resolveWeixinStateDir(), "accounts.json");
}
function listIndexedWeixinAccountIds() {
  const filePath = resolveAccountIndexPath();
  try {
    if (!fs3.existsSync(filePath)) return [];
    const raw = fs3.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id) => typeof id === "string" && id.trim() !== "");
  } catch {
    return [];
  }
}
function registerWeixinAccountId(accountId) {
  const dir = resolveWeixinStateDir();
  fs3.mkdirSync(dir, { recursive: true });
  const existing = listIndexedWeixinAccountIds();
  if (existing.includes(accountId)) return;
  const updated = [...existing, accountId];
  fs3.writeFileSync(resolveAccountIndexPath(), JSON.stringify(updated, null, 2), "utf-8");
}
function unregisterWeixinAccountId(accountId) {
  const existing = listIndexedWeixinAccountIds();
  const updated = existing.filter((id) => id !== accountId);
  if (updated.length !== existing.length) {
    fs3.writeFileSync(resolveAccountIndexPath(), JSON.stringify(updated, null, 2), "utf-8");
  }
}
function clearStaleAccountsForUserId(currentAccountId, userId, onClearContextTokens) {
  if (!userId) return;
  const allIds = listIndexedWeixinAccountIds();
  for (const id of allIds) {
    if (id === currentAccountId) continue;
    const data = loadWeixinAccount(id);
    if (data?.userId?.trim() === userId) {
      logger.info(`clearStaleAccountsForUserId: removing stale account=${id} (same userId=${userId})`);
      onClearContextTokens?.(id);
      clearWeixinAccount(id);
      unregisterWeixinAccountId(id);
    }
  }
}
function resolveAccountsDir() {
  return path4.join(resolveWeixinStateDir(), "accounts");
}
function resolveAccountPath(accountId) {
  return path4.join(resolveAccountsDir(), `${accountId}.json`);
}
function loadLegacyToken() {
  const legacyPath = path4.join(resolveStateDir(), "credentials", "openclaw-weixin", "credentials.json");
  try {
    if (!fs3.existsSync(legacyPath)) return void 0;
    const raw = fs3.readFileSync(legacyPath, "utf-8");
    const parsed = JSON.parse(raw);
    return typeof parsed.token === "string" ? parsed.token : void 0;
  } catch {
    return void 0;
  }
}
function readAccountFile(filePath) {
  try {
    if (fs3.existsSync(filePath)) {
      return JSON.parse(fs3.readFileSync(filePath, "utf-8"));
    }
  } catch {
  }
  return null;
}
function loadWeixinAccount(accountId) {
  const primary = readAccountFile(resolveAccountPath(accountId));
  if (primary) return primary;
  const rawId = deriveRawAccountId(accountId);
  if (rawId) {
    const compat = readAccountFile(resolveAccountPath(rawId));
    if (compat) return compat;
  }
  const token = loadLegacyToken();
  if (token) return { token };
  return null;
}
function saveWeixinAccount(accountId, update) {
  const dir = resolveAccountsDir();
  fs3.mkdirSync(dir, { recursive: true });
  const existing = loadWeixinAccount(accountId) ?? {};
  const token = update.token?.trim() || existing.token;
  const baseUrl = update.baseUrl?.trim() || existing.baseUrl;
  const userId = update.userId !== void 0 ? update.userId.trim() || void 0 : existing.userId?.trim() || void 0;
  const data = {
    ...token ? { token, savedAt: (/* @__PURE__ */ new Date()).toISOString() } : {},
    ...baseUrl ? { baseUrl } : {},
    ...userId ? { userId } : {}
  };
  const filePath = resolveAccountPath(accountId);
  fs3.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  try {
    fs3.chmodSync(filePath, 384);
  } catch {
  }
}
function clearWeixinAccount(accountId) {
  const dir = resolveAccountsDir();
  const accountFiles = [
    `${accountId}.json`,
    `${accountId}.sync.json`,
    `${accountId}.context-tokens.json`
  ];
  for (const file of accountFiles) {
    try {
      fs3.unlinkSync(path4.join(dir, file));
    } catch {
    }
  }
  try {
    fs3.unlinkSync(resolveFrameworkAllowFromPath(accountId));
  } catch {
  }
}
function resolveConfigPath() {
  const envPath = process.env.OPENCLAW_CONFIG?.trim();
  if (envPath) return envPath;
  return path4.join(resolveStateDir(), "openclaw.json");
}
function loadRouteTagSection() {
  if (cachedRouteTagSection !== void 0) return cachedRouteTagSection;
  try {
    const configPath = resolveConfigPath();
    if (!fs3.existsSync(configPath)) {
      cachedRouteTagSection = null;
      return null;
    }
    const raw = fs3.readFileSync(configPath, "utf-8");
    const cfg = JSON.parse(raw);
    const channels = cfg.channels;
    const section = channels?.["openclaw-weixin"] ?? null;
    cachedRouteTagSection = section;
    return section;
  } catch {
    cachedRouteTagSection = null;
    return null;
  }
}
function loadConfigRouteTag(accountId) {
  const section = loadRouteTagSection();
  if (!section) return void 0;
  if (accountId) {
    const accounts = section.accounts;
    const tag = accounts?.[accountId]?.routeTag;
    if (typeof tag === "number") return String(tag);
    if (typeof tag === "string" && tag.trim()) return tag.trim();
  }
  if (typeof section.routeTag === "number") return String(section.routeTag);
  return typeof section.routeTag === "string" && section.routeTag.trim() ? section.routeTag.trim() : void 0;
}
function loadConfigBotAgent() {
  const section = loadRouteTagSection();
  if (!section) return void 0;
  const value = section.botAgent;
  return typeof value === "string" && value.trim() ? value : void 0;
}
async function triggerWeixinChannelReload() {
  try {
    const { loadConfig, writeConfigFile } = await import("openclaw/plugin-sdk/config-runtime");
    const cfg = loadConfig();
    const channels = cfg.channels ?? {};
    const existing = channels["openclaw-weixin"] ?? {};
    const updated = {
      ...cfg,
      channels: {
        ...channels,
        "openclaw-weixin": {
          ...existing,
          channelConfigUpdatedAt: (/* @__PURE__ */ new Date()).toISOString()
        }
      }
    };
    await writeConfigFile(updated);
    logger.info("triggerWeixinChannelReload: wrote channel config to openclaw.json");
  } catch (err) {
    logger.warn(`triggerWeixinChannelReload: failed to update config: ${String(err)}`);
  }
}
function listWeixinAccountIds(_cfg) {
  return listIndexedWeixinAccountIds();
}
function resolveWeixinAccount(cfg, accountId) {
  const raw = accountId?.trim();
  if (!raw) {
    throw new Error("weixin: accountId is required (no default account)");
  }
  const id = normalizeAccountId(raw);
  const section = cfg.channels?.["openclaw-weixin"];
  const accountCfg = section?.accounts?.[id] ?? section ?? {};
  const accountData = loadWeixinAccount(id);
  const token = accountData?.token?.trim() || void 0;
  const stateBaseUrl = accountData?.baseUrl?.trim() || "";
  return {
    accountId: id,
    baseUrl: stateBaseUrl || DEFAULT_BASE_URL,
    cdnBaseUrl: accountCfg.cdnBaseUrl?.trim() || CDN_BASE_URL,
    token,
    enabled: accountCfg.enabled !== false,
    configured: Boolean(token),
    name: accountCfg.name?.trim() || void 0
  };
}
var DEFAULT_BASE_URL, CDN_BASE_URL, cachedRouteTagSection;
var init_accounts = __esm({
  "vendor/openclaw-runtime/mac-arm64/third-party-extensions/openclaw-weixin/src/auth/accounts.ts"() {
    "use strict";
    init_state_dir();
    init_pairing();
    init_logger();
    DEFAULT_BASE_URL = "https://ilinkai.weixin.qq.com";
    CDN_BASE_URL = "https://novac2c.cdn.weixin.qq.com/c2c";
  }
});

// vendor/openclaw-runtime/mac-arm64/third-party-extensions/openclaw-weixin/src/util/redact.ts
function truncate(s, max) {
  if (!s) return "";
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\u2026(len=${s.length})`;
}
function redactToken(token, prefixLen = DEFAULT_TOKEN_PREFIX_LEN) {
  if (!token) return "(none)";
  if (token.length <= prefixLen) return `****(len=${token.length})`;
  return `${token.slice(0, prefixLen)}\u2026(len=${token.length})`;
}
function redactBody(body, maxLen = DEFAULT_BODY_MAX_LEN) {
  if (!body) return "(empty)";
  const redacted = body.replace(
    /"(context_token|bot_token|token|authorization|Authorization)"\s*:\s*"[^"]*"/g,
    '"$1":"<redacted>"'
  );
  if (redacted.length <= maxLen) return redacted;
  return `${redacted.slice(0, maxLen)}\u2026(truncated, totalLen=${redacted.length})`;
}
function redactUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    const base = `${u.origin}${u.pathname}`;
    return u.search ? `${base}?<redacted>` : base;
  } catch {
    return truncate(rawUrl, 80);
  }
}
var DEFAULT_BODY_MAX_LEN, DEFAULT_TOKEN_PREFIX_LEN;
var init_redact = __esm({
  "vendor/openclaw-runtime/mac-arm64/third-party-extensions/openclaw-weixin/src/util/redact.ts"() {
    "use strict";
    DEFAULT_BODY_MAX_LEN = 200;
    DEFAULT_TOKEN_PREFIX_LEN = 6;
  }
});

// vendor/openclaw-runtime/mac-arm64/third-party-extensions/openclaw-weixin/src/api/api.ts
import crypto from "crypto";
import fs4 from "fs";
import path5 from "path";
import { fileURLToPath } from "url";
function isOwnPackageJson(parsed) {
  if (parsed.ilink_appid !== void 0) return true;
  return typeof parsed.name === "string" && parsed.name.includes("openclaw-weixin");
}
function readPackageJsonFromDir(startDir) {
  try {
    let dir = startDir;
    const { root } = path5.parse(dir);
    while (dir && dir !== root) {
      const candidate = path5.join(dir, "package.json");
      if (fs4.existsSync(candidate)) {
        try {
          const parsed = JSON.parse(fs4.readFileSync(candidate, "utf-8"));
          if (isOwnPackageJson(parsed)) {
            return parsed;
          }
        } catch {
        }
      }
      dir = path5.dirname(dir);
    }
  } catch {
  }
  return {};
}
function readPackageJson() {
  return readPackageJsonFromDir(path5.dirname(fileURLToPath(import.meta.url)));
}
function buildClientVersion(version) {
  const parts = version.split(".").map((p) => parseInt(p, 10));
  const major = parts[0] ?? 0;
  const minor = parts[1] ?? 0;
  const patch = parts[2] ?? 0;
  return (major & 255) << 16 | (minor & 255) << 8 | patch & 255;
}
function sanitizeBotAgent(raw) {
  if (!raw || typeof raw !== "string") return DEFAULT_BOT_AGENT;
  const trimmed = raw.trim();
  if (!trimmed) return DEFAULT_BOT_AGENT;
  const productRe = /^[A-Za-z0-9_.\-]{1,32}\/[A-Za-z0-9_.+\-]{1,32}$/;
  const commentCharRe = /^[\x20-\x27\x2A-\x7E]{1,64}$/;
  const rawTokens = trimmed.split(/\s+/);
  const tokens = [];
  for (let i = 0; i < rawTokens.length; i += 1) {
    const tok = rawTokens[i];
    if (tok.startsWith("(") && !tok.endsWith(")")) {
      let acc = tok;
      while (i + 1 < rawTokens.length && !acc.endsWith(")")) {
        i += 1;
        acc += " " + rawTokens[i];
      }
      tokens.push(acc);
    } else {
      tokens.push(tok);
    }
  }
  const accepted = [];
  let pendingProduct = null;
  for (const tok of tokens) {
    if (tok.startsWith("(") && tok.endsWith(")")) {
      const inner = tok.slice(1, -1);
      if (pendingProduct && commentCharRe.test(inner)) {
        accepted.push(`${pendingProduct} (${inner})`);
        pendingProduct = null;
      } else {
        if (pendingProduct) {
          accepted.push(pendingProduct);
          pendingProduct = null;
        }
      }
      continue;
    }
    if (pendingProduct) {
      accepted.push(pendingProduct);
      pendingProduct = null;
    }
    if (productRe.test(tok)) {
      pendingProduct = tok;
    }
  }
  if (pendingProduct) accepted.push(pendingProduct);
  if (accepted.length === 0) return DEFAULT_BOT_AGENT;
  const joined = accepted.join(" ");
  if (Buffer.byteLength(joined, "utf-8") <= BOT_AGENT_MAX_LEN) return joined;
  const truncated = [];
  let len = 0;
  for (const t of accepted) {
    const add = (truncated.length === 0 ? 0 : 1) + Buffer.byteLength(t, "utf-8");
    if (len + add > BOT_AGENT_MAX_LEN) break;
    truncated.push(t);
    len += add;
  }
  return truncated.length > 0 ? truncated.join(" ") : DEFAULT_BOT_AGENT;
}
function buildBaseInfo() {
  return {
    channel_version: CHANNEL_VERSION,
    bot_agent: sanitizeBotAgent(loadConfigBotAgent())
  };
}
function ensureTrailingSlash(url) {
  return url.endsWith("/") ? url : `${url}/`;
}
function randomWechatUin() {
  const uint32 = crypto.randomBytes(4).readUInt32BE(0);
  return Buffer.from(String(uint32), "utf-8").toString("base64");
}
function buildCommonHeaders() {
  const headers = {
    "iLink-App-Id": ILINK_APP_ID,
    "iLink-App-ClientVersion": String(ILINK_APP_CLIENT_VERSION)
  };
  const routeTag = loadConfigRouteTag();
  if (routeTag) {
    headers.SKRouteTag = routeTag;
  }
  return headers;
}
function buildHeaders(opts) {
  const headers = {
    "Content-Type": "application/json",
    AuthorizationType: "ilink_bot_token",
    "X-WECHAT-UIN": randomWechatUin(),
    ...buildCommonHeaders()
  };
  if (opts.token?.trim()) {
    headers.Authorization = `Bearer ${opts.token.trim()}`;
  }
  logger.debug(
    `requestHeaders: ${JSON.stringify({ ...headers, Authorization: headers.Authorization ? "Bearer ***" : void 0 })}`
  );
  return headers;
}
async function apiGetFetch(params) {
  const base = ensureTrailingSlash(params.baseUrl);
  const url = new URL(params.endpoint, base);
  const hdrs = buildCommonHeaders();
  logger.debug(`GET ${redactUrl(url.toString())}`);
  const timeoutMs = params.timeoutMs;
  const controller = timeoutMs != null && timeoutMs > 0 ? new AbortController() : void 0;
  const t = controller != null && timeoutMs != null ? setTimeout(() => controller.abort(), timeoutMs) : void 0;
  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: hdrs,
      ...controller ? { signal: controller.signal } : {}
    });
    if (t !== void 0) clearTimeout(t);
    const rawText = await res.text();
    logger.debug(`${params.label} status=${res.status} raw=${redactBody(rawText)}`);
    if (!res.ok) {
      throw new Error(`${params.label} ${res.status}: ${rawText}`);
    }
    return rawText;
  } catch (err) {
    if (t !== void 0) clearTimeout(t);
    throw err;
  }
}
async function apiPostFetch(params) {
  const base = ensureTrailingSlash(params.baseUrl);
  const url = new URL(params.endpoint, base);
  const hdrs = buildHeaders({ token: params.token });
  logger.debug(`POST ${redactUrl(url.toString())} body=${redactBody(params.body)}`);
  const controller = params.timeoutMs !== void 0 ? new AbortController() : void 0;
  const t = controller != null && params.timeoutMs !== void 0 ? setTimeout(() => controller.abort(), params.timeoutMs) : void 0;
  try {
    const res = await fetch(url.toString(), {
      method: "POST",
      headers: hdrs,
      body: params.body,
      ...controller ? { signal: controller.signal } : {}
    });
    if (t !== void 0) clearTimeout(t);
    const rawText = await res.text();
    logger.debug(`${params.label} status=${res.status} raw=${redactBody(rawText)}`);
    if (!res.ok) {
      throw new Error(`${params.label} ${res.status}: ${rawText}`);
    }
    return rawText;
  } catch (err) {
    if (t !== void 0) clearTimeout(t);
    throw err;
  }
}
async function getUpdates(params) {
  const timeout = params.timeoutMs ?? DEFAULT_LONG_POLL_TIMEOUT_MS;
  try {
    const rawText = await apiPostFetch({
      baseUrl: params.baseUrl,
      endpoint: "ilink/bot/getupdates",
      body: JSON.stringify({
        get_updates_buf: params.get_updates_buf ?? "",
        base_info: buildBaseInfo()
      }),
      token: params.token,
      timeoutMs: timeout,
      label: "getUpdates"
    });
    const resp = JSON.parse(rawText);
    return resp;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      logger.debug(`getUpdates: client-side timeout after ${timeout}ms, returning empty response`);
      return { ret: 0, msgs: [], get_updates_buf: params.get_updates_buf };
    }
    throw err;
  }
}
async function getUploadUrl(params) {
  const rawText = await apiPostFetch({
    baseUrl: params.baseUrl,
    endpoint: "ilink/bot/getuploadurl",
    body: JSON.stringify({
      filekey: params.filekey,
      media_type: params.media_type,
      to_user_id: params.to_user_id,
      rawsize: params.rawsize,
      rawfilemd5: params.rawfilemd5,
      filesize: params.filesize,
      thumb_rawsize: params.thumb_rawsize,
      thumb_rawfilemd5: params.thumb_rawfilemd5,
      thumb_filesize: params.thumb_filesize,
      no_need_thumb: params.no_need_thumb,
      aeskey: params.aeskey,
      base_info: buildBaseInfo()
    }),
    token: params.token,
    timeoutMs: params.timeoutMs ?? DEFAULT_API_TIMEOUT_MS,
    label: "getUploadUrl"
  });
  const resp = JSON.parse(rawText);
  return resp;
}
async function sendMessage(params) {
  await apiPostFetch({
    baseUrl: params.baseUrl,
    endpoint: "ilink/bot/sendmessage",
    body: JSON.stringify({ ...params.body, base_info: buildBaseInfo() }),
    token: params.token,
    timeoutMs: params.timeoutMs ?? DEFAULT_API_TIMEOUT_MS,
    label: "sendMessage"
  });
}
async function getConfig(params) {
  const rawText = await apiPostFetch({
    baseUrl: params.baseUrl,
    endpoint: "ilink/bot/getconfig",
    body: JSON.stringify({
      ilink_user_id: params.ilinkUserId,
      context_token: params.contextToken,
      base_info: buildBaseInfo()
    }),
    token: params.token,
    timeoutMs: params.timeoutMs ?? DEFAULT_CONFIG_TIMEOUT_MS,
    label: "getConfig"
  });
  const resp = JSON.parse(rawText);
  return resp;
}
async function sendTyping(params) {
  await apiPostFetch({
    baseUrl: params.baseUrl,
    endpoint: "ilink/bot/sendtyping",
    body: JSON.stringify({ ...params.body, base_info: buildBaseInfo() }),
    token: params.token,
    timeoutMs: params.timeoutMs ?? DEFAULT_CONFIG_TIMEOUT_MS,
    label: "sendTyping"
  });
}
async function notifyStop(params) {
  const rawText = await apiPostFetch({
    baseUrl: params.baseUrl,
    endpoint: "ilink/bot/msg/notifystop",
    body: JSON.stringify({ base_info: buildBaseInfo() }),
    token: params.token,
    timeoutMs: params.timeoutMs ?? DEFAULT_CONFIG_TIMEOUT_MS,
    label: "notifyStop"
  });
  return JSON.parse(rawText);
}
async function notifyStart(params) {
  const rawText = await apiPostFetch({
    baseUrl: params.baseUrl,
    endpoint: "ilink/bot/msg/notifystart",
    body: JSON.stringify({ base_info: buildBaseInfo() }),
    token: params.token,
    timeoutMs: params.timeoutMs ?? DEFAULT_CONFIG_TIMEOUT_MS,
    label: "notifyStart"
  });
  return JSON.parse(rawText);
}
var pkg, CHANNEL_VERSION, ILINK_APP_ID, ILINK_APP_CLIENT_VERSION, DEFAULT_BOT_AGENT, BOT_AGENT_MAX_LEN, DEFAULT_LONG_POLL_TIMEOUT_MS, DEFAULT_API_TIMEOUT_MS, DEFAULT_CONFIG_TIMEOUT_MS;
var init_api = __esm({
  "vendor/openclaw-runtime/mac-arm64/third-party-extensions/openclaw-weixin/src/api/api.ts"() {
    "use strict";
    init_accounts();
    init_logger();
    init_redact();
    pkg = readPackageJson();
    CHANNEL_VERSION = pkg.version ?? "unknown";
    ILINK_APP_ID = pkg.ilink_appid ?? "";
    ILINK_APP_CLIENT_VERSION = buildClientVersion(pkg.version ?? "0.0.0");
    DEFAULT_BOT_AGENT = "OpenClaw";
    BOT_AGENT_MAX_LEN = 256;
    DEFAULT_LONG_POLL_TIMEOUT_MS = 35e3;
    DEFAULT_API_TIMEOUT_MS = 15e3;
    DEFAULT_CONFIG_TIMEOUT_MS = 1e4;
  }
});

// vendor/openclaw-runtime/mac-arm64/third-party-extensions/openclaw-weixin/src/api/session-guard.ts
function pauseSession(accountId) {
  const until = Date.now() + SESSION_PAUSE_DURATION_MS;
  pauseUntilMap.set(accountId, until);
  logger.info(
    `session-guard: paused accountId=${accountId} until=${new Date(until).toISOString()} (${SESSION_PAUSE_DURATION_MS / 1e3}s)`
  );
}
function isSessionPaused(accountId) {
  const until = pauseUntilMap.get(accountId);
  if (until === void 0) return false;
  if (Date.now() >= until) {
    pauseUntilMap.delete(accountId);
    return false;
  }
  return true;
}
function getRemainingPauseMs(accountId) {
  const until = pauseUntilMap.get(accountId);
  if (until === void 0) return 0;
  const remaining = until - Date.now();
  if (remaining <= 0) {
    pauseUntilMap.delete(accountId);
    return 0;
  }
  return remaining;
}
function assertSessionActive(accountId) {
  if (isSessionPaused(accountId)) {
    const remainingMin = Math.ceil(getRemainingPauseMs(accountId) / 6e4);
    throw new Error(
      `session paused for accountId=${accountId}, ${remainingMin} min remaining (errcode ${SESSION_EXPIRED_ERRCODE})`
    );
  }
}
var SESSION_PAUSE_DURATION_MS, SESSION_EXPIRED_ERRCODE, pauseUntilMap;
var init_session_guard = __esm({
  "vendor/openclaw-runtime/mac-arm64/third-party-extensions/openclaw-weixin/src/api/session-guard.ts"() {
    "use strict";
    init_logger();
    SESSION_PAUSE_DURATION_MS = 60 * 60 * 1e3;
    SESSION_EXPIRED_ERRCODE = -14;
    pauseUntilMap = /* @__PURE__ */ new Map();
  }
});

// vendor/openclaw-runtime/mac-arm64/third-party-extensions/openclaw-weixin/src/util/random.ts
import crypto2 from "crypto";
function generateId(prefix) {
  return `${prefix}:${Date.now()}-${crypto2.randomBytes(4).toString("hex")}`;
}
function tempFileName(prefix, ext) {
  return `${prefix}-${Date.now()}-${crypto2.randomBytes(4).toString("hex")}${ext}`;
}
var init_random = __esm({
  "vendor/openclaw-runtime/mac-arm64/third-party-extensions/openclaw-weixin/src/util/random.ts"() {
    "use strict";
  }
});

// vendor/openclaw-runtime/mac-arm64/third-party-extensions/openclaw-weixin/src/api/types.ts
var UploadMediaType, MessageType, MessageItemType, MessageState, TypingStatus;
var init_types = __esm({
  "vendor/openclaw-runtime/mac-arm64/third-party-extensions/openclaw-weixin/src/api/types.ts"() {
    "use strict";
    UploadMediaType = {
      IMAGE: 1,
      VIDEO: 2,
      FILE: 3,
      VOICE: 4
    };
    MessageType = {
      NONE: 0,
      USER: 1,
      BOT: 2
    };
    MessageItemType = {
      NONE: 0,
      TEXT: 1,
      IMAGE: 2,
      VOICE: 3,
      FILE: 4,
      VIDEO: 5
    };
    MessageState = {
      NEW: 0,
      GENERATING: 1,
      FINISH: 2
    };
    TypingStatus = {
      TYPING: 1,
      CANCEL: 2
    };
  }
});

// vendor/openclaw-runtime/mac-arm64/third-party-extensions/openclaw-weixin/src/messaging/inbound.ts
import fs5 from "fs";
import path6 from "path";
function contextTokenKey(accountId, userId) {
  return `${accountId}:${userId}`;
}
function resolveContextTokenFilePath(accountId) {
  return path6.join(
    resolveStateDir(),
    "openclaw-weixin",
    "accounts",
    `${accountId}.context-tokens.json`
  );
}
function persistContextTokens(accountId) {
  const prefix = `${accountId}:`;
  const tokens = {};
  for (const [k, v] of contextTokenStore) {
    if (k.startsWith(prefix)) {
      tokens[k.slice(prefix.length)] = v;
    }
  }
  const filePath = resolveContextTokenFilePath(accountId);
  try {
    const dir = path6.dirname(filePath);
    fs5.mkdirSync(dir, { recursive: true });
    fs5.writeFileSync(filePath, JSON.stringify(tokens, null, 0), "utf-8");
  } catch (err) {
    logger.warn(`persistContextTokens: failed to write ${filePath}: ${String(err)}`);
  }
}
function restoreContextTokens(accountId) {
  const filePath = resolveContextTokenFilePath(accountId);
  try {
    if (!fs5.existsSync(filePath)) return;
    const raw = fs5.readFileSync(filePath, "utf-8");
    const tokens = JSON.parse(raw);
    let count = 0;
    for (const [userId, token] of Object.entries(tokens)) {
      if (typeof token === "string" && token) {
        contextTokenStore.set(contextTokenKey(accountId, userId), token);
        count++;
      }
    }
    logger.info(`restoreContextTokens: restored ${count} tokens for account=${accountId}`);
  } catch (err) {
    logger.warn(`restoreContextTokens: failed to read ${filePath}: ${String(err)}`);
  }
}
function clearContextTokensForAccount(accountId) {
  const prefix = `${accountId}:`;
  for (const k of [...contextTokenStore.keys()]) {
    if (k.startsWith(prefix)) {
      contextTokenStore.delete(k);
    }
  }
  const filePath = resolveContextTokenFilePath(accountId);
  try {
    if (fs5.existsSync(filePath)) fs5.unlinkSync(filePath);
  } catch (err) {
    logger.warn(`clearContextTokensForAccount: failed to remove ${filePath}: ${String(err)}`);
  }
  logger.info(`clearContextTokensForAccount: cleared tokens for account=${accountId}`);
}
function setContextToken(accountId, userId, token) {
  const k = contextTokenKey(accountId, userId);
  logger.debug(`setContextToken: key=${k}`);
  contextTokenStore.set(k, token);
  persistContextTokens(accountId);
}
function getContextToken(accountId, userId) {
  const k = contextTokenKey(accountId, userId);
  const val = contextTokenStore.get(k);
  logger.debug(
    `getContextToken: key=${k} found=${val !== void 0} storeSize=${contextTokenStore.size}`
  );
  return val;
}
function findAccountIdsByContextToken(accountIds, userId) {
  return accountIds.filter((id) => contextTokenStore.has(contextTokenKey(id, userId)));
}
function generateMessageSid() {
  return generateId("openclaw-weixin");
}
function isMediaItem(item) {
  return item.type === MessageItemType.IMAGE || item.type === MessageItemType.VIDEO || item.type === MessageItemType.FILE || item.type === MessageItemType.VOICE;
}
function bodyFromItemList(itemList) {
  if (!itemList?.length) return "";
  for (const item of itemList) {
    if (item.type === MessageItemType.TEXT && item.text_item?.text != null) {
      const text = String(item.text_item.text);
      const ref = item.ref_msg;
      if (!ref) return text;
      if (ref.message_item && isMediaItem(ref.message_item)) return text;
      const parts = [];
      if (ref.title) parts.push(ref.title);
      if (ref.message_item) {
        const refBody = bodyFromItemList([ref.message_item]);
        if (refBody) parts.push(refBody);
      }
      if (!parts.length) return text;
      return `[\u5F15\u7528: ${parts.join(" | ")}]
${text}`;
    }
    if (item.type === MessageItemType.VOICE && item.voice_item?.text) {
      return item.voice_item.text;
    }
  }
  return "";
}
function weixinMessageToMsgContext(msg, accountId, opts) {
  const from_user_id = msg.from_user_id ?? "";
  const ctx = {
    Body: bodyFromItemList(msg.item_list),
    From: from_user_id,
    To: from_user_id,
    AccountId: accountId,
    OriginatingChannel: "openclaw-weixin",
    OriginatingTo: from_user_id,
    MessageSid: generateMessageSid(),
    Timestamp: msg.create_time_ms,
    Provider: "openclaw-weixin",
    ChatType: "direct"
  };
  if (msg.context_token) {
    ctx.context_token = msg.context_token;
  }
  if (opts?.decryptedPicPath) {
    ctx.MediaPath = opts.decryptedPicPath;
    ctx.MediaType = "image/*";
  } else if (opts?.decryptedVideoPath) {
    ctx.MediaPath = opts.decryptedVideoPath;
    ctx.MediaType = "video/mp4";
  } else if (opts?.decryptedFilePath) {
    ctx.MediaPath = opts.decryptedFilePath;
    ctx.MediaType = opts.fileMediaType ?? "application/octet-stream";
  } else if (opts?.decryptedVoicePath) {
    ctx.MediaPath = opts.decryptedVoicePath;
    ctx.MediaType = opts.voiceMediaType ?? "audio/wav";
  }
  return ctx;
}
function getContextTokenFromMsgContext(ctx) {
  return ctx.context_token;
}
var contextTokenStore;
var init_inbound = __esm({
  "vendor/openclaw-runtime/mac-arm64/third-party-extensions/openclaw-weixin/src/messaging/inbound.ts"() {
    "use strict";
    init_logger();
    init_random();
    init_types();
    init_state_dir();
    contextTokenStore = /* @__PURE__ */ new Map();
  }
});

// vendor/openclaw-runtime/mac-arm64/third-party-extensions/openclaw-weixin/src/messaging/outbound-hooks.ts
import {
  fireAndForgetHook,
  buildCanonicalSentMessageHookContext,
  toPluginMessageContext,
  toPluginMessageSentEvent
} from "openclaw/plugin-sdk/hook-runtime";
import { getGlobalHookRunner } from "openclaw/plugin-sdk/plugin-runtime";
async function applyWeixinMessageSendingHook(params) {
  const hookRunner = getGlobalHookRunner();
  if (!hookRunner?.hasHooks("message_sending")) {
    return { cancelled: false, text: params.text };
  }
  try {
    const hookResult = await hookRunner.runMessageSending(
      {
        to: params.to,
        content: params.text,
        metadata: {
          channel: CHANNEL_ID,
          accountId: params.accountId,
          ...params.mediaUrl ? { mediaUrls: [params.mediaUrl] } : {}
        }
      },
      { channelId: CHANNEL_ID, accountId: params.accountId }
    );
    if (hookResult?.cancel) {
      return { cancelled: true, text: params.text };
    }
    return {
      cancelled: false,
      text: hookResult?.content ?? params.text
    };
  } catch (err) {
    logger.warn(`message_sending hook error, proceeding with send: ${String(err)}`);
    return { cancelled: false, text: params.text };
  }
}
function emitWeixinMessageSent(params) {
  const hookRunner = getGlobalHookRunner();
  if (!hookRunner?.hasHooks("message_sent")) return;
  const canonical = buildCanonicalSentMessageHookContext({
    to: params.to,
    content: params.content,
    success: params.success,
    error: params.error,
    channelId: CHANNEL_ID,
    accountId: params.accountId,
    conversationId: params.to
  });
  fireAndForgetHook(
    Promise.resolve(
      hookRunner.runMessageSent(
        toPluginMessageSentEvent(canonical),
        toPluginMessageContext(canonical)
      )
    ),
    "weixin: message_sent plugin hook failed"
  );
}
var CHANNEL_ID;
var init_outbound_hooks = __esm({
  "vendor/openclaw-runtime/mac-arm64/third-party-extensions/openclaw-weixin/src/messaging/outbound-hooks.ts"() {
    "use strict";
    init_logger();
    CHANNEL_ID = "openclaw-weixin";
  }
});

// vendor/openclaw-runtime/mac-arm64/third-party-extensions/openclaw-weixin/src/media/mime.ts
import path7 from "path";
function getMimeFromFilename(filename) {
  const ext = path7.extname(filename).toLowerCase();
  return EXTENSION_TO_MIME[ext] ?? "application/octet-stream";
}
function getExtensionFromMime(mimeType) {
  const ct = mimeType.split(";")[0].trim().toLowerCase();
  return MIME_TO_EXTENSION[ct] ?? ".bin";
}
function getExtensionFromContentTypeOrUrl(contentType, url) {
  if (contentType) {
    const ext2 = getExtensionFromMime(contentType);
    if (ext2 !== ".bin") return ext2;
  }
  const ext = path7.extname(new URL(url).pathname).toLowerCase();
  const knownExts = new Set(Object.keys(EXTENSION_TO_MIME));
  return knownExts.has(ext) ? ext : ".bin";
}
var EXTENSION_TO_MIME, MIME_TO_EXTENSION;
var init_mime = __esm({
  "vendor/openclaw-runtime/mac-arm64/third-party-extensions/openclaw-weixin/src/media/mime.ts"() {
    "use strict";
    EXTENSION_TO_MIME = {
      ".pdf": "application/pdf",
      ".doc": "application/msword",
      ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ".xls": "application/vnd.ms-excel",
      ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ".ppt": "application/vnd.ms-powerpoint",
      ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      ".txt": "text/plain",
      ".csv": "text/csv",
      ".zip": "application/zip",
      ".tar": "application/x-tar",
      ".gz": "application/gzip",
      ".mp3": "audio/mpeg",
      ".ogg": "audio/ogg",
      ".wav": "audio/wav",
      ".mp4": "video/mp4",
      ".mov": "video/quicktime",
      ".webm": "video/webm",
      ".mkv": "video/x-matroska",
      ".avi": "video/x-msvideo",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
      ".webp": "image/webp",
      ".bmp": "image/bmp"
    };
    MIME_TO_EXTENSION = {
      "image/jpeg": ".jpg",
      "image/jpg": ".jpg",
      "image/png": ".png",
      "image/gif": ".gif",
      "image/webp": ".webp",
      "image/bmp": ".bmp",
      "video/mp4": ".mp4",
      "video/quicktime": ".mov",
      "video/webm": ".webm",
      "video/x-matroska": ".mkv",
      "video/x-msvideo": ".avi",
      "audio/mpeg": ".mp3",
      "audio/ogg": ".ogg",
      "audio/wav": ".wav",
      "application/pdf": ".pdf",
      "application/zip": ".zip",
      "application/x-tar": ".tar",
      "application/gzip": ".gz",
      "text/plain": ".txt",
      "text/csv": ".csv"
    };
  }
});

// vendor/openclaw-runtime/mac-arm64/third-party-extensions/openclaw-weixin/src/messaging/markdown-filter.ts
var StreamingMarkdownFilter;
var init_markdown_filter = __esm({
  "vendor/openclaw-runtime/mac-arm64/third-party-extensions/openclaw-weixin/src/messaging/markdown-filter.ts"() {
    "use strict";
    StreamingMarkdownFilter = class _StreamingMarkdownFilter {
      buf = "";
      fence = false;
      sol = true;
      inl = null;
      feed(delta) {
        this.buf += delta;
        return this.pump(false);
      }
      flush() {
        return this.pump(true);
      }
      pump(eof) {
        let out = "";
        while (this.buf) {
          const sLen = this.buf.length;
          const sSol = this.sol;
          const sFence = this.fence;
          const sInl = this.inl;
          if (this.fence) out += this.pumpFence(eof);
          else if (this.inl) out += this.pumpInline(eof);
          else if (this.sol) out += this.pumpSOL(eof);
          else out += this.pumpBody(eof);
          if (this.buf.length === sLen && this.sol === sSol && this.fence === sFence && this.inl === sInl) break;
        }
        if (eof && this.inl) {
          const markers = { image: "![", bold3: "***", italic: "*", ubold3: "___", uitalic: "_" };
          out += (markers[this.inl.type] ?? "") + this.inl.acc;
          this.inl = null;
        }
        return out;
      }
      /** Inside a code fence: pass content and markers through verbatim. */
      pumpFence(eof) {
        if (this.sol) {
          if (this.buf.length < 3 && !eof) return "";
          if (this.buf.startsWith("```")) {
            const nl2 = this.buf.indexOf("\n", 3);
            if (nl2 !== -1) {
              this.fence = false;
              const line = this.buf.slice(0, nl2 + 1);
              this.buf = this.buf.slice(nl2 + 1);
              this.sol = true;
              return line;
            }
            if (eof) {
              this.fence = false;
              const line = this.buf;
              this.buf = "";
              return line;
            }
            return "";
          }
          this.sol = false;
        }
        const nl = this.buf.indexOf("\n");
        if (nl !== -1) {
          const chunk2 = this.buf.slice(0, nl + 1);
          this.buf = this.buf.slice(nl + 1);
          this.sol = true;
          return chunk2;
        }
        const chunk = this.buf;
        this.buf = "";
        return chunk;
      }
      /** At start of line: detect and consume line-start patterns, then transition to body. */
      pumpSOL(eof) {
        const b = this.buf;
        if (b[0] === "\n") {
          this.buf = b.slice(1);
          return "\n";
        }
        if (b[0] === "`") {
          if (b.length < 3 && !eof) return "";
          if (b.startsWith("```")) {
            const nl = b.indexOf("\n", 3);
            if (nl !== -1) {
              this.fence = true;
              const line = b.slice(0, nl + 1);
              this.buf = b.slice(nl + 1);
              this.sol = true;
              return line;
            }
            if (eof) {
              this.buf = "";
              return b;
            }
            return "";
          }
          this.sol = false;
          return "";
        }
        if (b[0] === ">") {
          this.sol = false;
          return "";
        }
        if (b[0] === "#") {
          let n = 0;
          while (n < b.length && b[n] === "#") n++;
          if (n === b.length && !eof) return "";
          if (n >= 5 && n <= 6 && n < b.length && b[n] === " ") {
            this.buf = b.slice(n + 1);
            this.sol = false;
            return "";
          }
          this.sol = false;
          return "";
        }
        if (b[0] === " " || b[0] === "	") {
          if (b.search(/[^ \t]/) === -1 && !eof) return "";
          this.sol = false;
          return "";
        }
        if (b[0] === "-" || b[0] === "*" || b[0] === "_") {
          const ch = b[0];
          let j = 0;
          while (j < b.length && (b[j] === ch || b[j] === " ")) j++;
          if (j === b.length && !eof) return "";
          if (j === b.length || b[j] === "\n") {
            let count = 0;
            for (let k = 0; k < j; k++) if (b[k] === ch) count++;
            if (count >= 3) {
              if (j < b.length) {
                this.buf = b.slice(j + 1);
                this.sol = true;
                return b.slice(0, j + 1);
              }
              this.buf = "";
              return b;
            }
          }
          this.sol = false;
          return "";
        }
        this.sol = false;
        return "";
      }
      /** Scan line body for inline pattern triggers; output safe chars eagerly. */
      pumpBody(eof) {
        let out = "";
        let i = 0;
        while (i < this.buf.length) {
          const c = this.buf[i];
          if (c === "\n") {
            out += this.buf.slice(0, i + 1);
            this.buf = this.buf.slice(i + 1);
            this.sol = true;
            return out;
          }
          if (c === "!" && i + 1 < this.buf.length && this.buf[i + 1] === "[") {
            out += this.buf.slice(0, i);
            this.buf = this.buf.slice(i + 2);
            this.inl = { type: "image", acc: "" };
            return out;
          }
          if (c === "~") {
            i++;
            continue;
          }
          if (c === "*") {
            if (i + 2 < this.buf.length && this.buf[i + 1] === "*" && this.buf[i + 2] === "*") {
              out += this.buf.slice(0, i);
              this.buf = this.buf.slice(i + 3);
              this.inl = { type: "bold3", acc: "" };
              return out;
            }
            if (i + 1 < this.buf.length && this.buf[i + 1] === "*") {
              i += 2;
              continue;
            }
            if (i + 1 < this.buf.length && this.buf[i + 1] !== " " && this.buf[i + 1] !== "\n") {
              out += this.buf.slice(0, i);
              this.buf = this.buf.slice(i + 1);
              this.inl = { type: "italic", acc: "" };
              return out;
            }
            i++;
            continue;
          }
          if (c === "_") {
            if (i + 2 < this.buf.length && this.buf[i + 1] === "_" && this.buf[i + 2] === "_") {
              out += this.buf.slice(0, i);
              this.buf = this.buf.slice(i + 3);
              this.inl = { type: "ubold3", acc: "" };
              return out;
            }
            if (i + 1 < this.buf.length && this.buf[i + 1] === "_") {
              i += 2;
              continue;
            }
            if (i + 1 < this.buf.length && this.buf[i + 1] !== " " && this.buf[i + 1] !== "\n") {
              out += this.buf.slice(0, i);
              this.buf = this.buf.slice(i + 1);
              this.inl = { type: "uitalic", acc: "" };
              return out;
            }
            i++;
            continue;
          }
          i++;
        }
        let hold = 0;
        if (!eof) {
          if (this.buf.endsWith("**")) hold = 2;
          else if (this.buf.endsWith("__")) hold = 2;
          else if (this.buf.endsWith("*")) hold = 1;
          else if (this.buf.endsWith("_")) hold = 1;
          else if (this.buf.endsWith("!")) hold = 1;
        }
        out += this.buf.slice(0, this.buf.length - hold);
        this.buf = hold > 0 ? this.buf.slice(-hold) : "";
        return out;
      }
      /** Accumulate inline content until closing marker is found. */
      pumpInline(_eof) {
        if (!this.inl) return "";
        this.inl.acc += this.buf;
        this.buf = "";
        switch (this.inl.type) {
          case "bold3": {
            const idx = this.inl.acc.indexOf("***");
            if (idx !== -1) {
              const content = this.inl.acc.slice(0, idx);
              this.buf = this.inl.acc.slice(idx + 3);
              this.inl = null;
              if (_StreamingMarkdownFilter.containsCJK(content)) return content;
              return `***${content}***`;
            }
            return "";
          }
          case "ubold3": {
            const idx = this.inl.acc.indexOf("___");
            if (idx !== -1) {
              const content = this.inl.acc.slice(0, idx);
              this.buf = this.inl.acc.slice(idx + 3);
              this.inl = null;
              if (_StreamingMarkdownFilter.containsCJK(content)) return content;
              return `___${content}___`;
            }
            return "";
          }
          case "italic": {
            for (let j = 0; j < this.inl.acc.length; j++) {
              if (this.inl.acc[j] === "\n") {
                const r = "*" + this.inl.acc.slice(0, j + 1);
                this.buf = this.inl.acc.slice(j + 1);
                this.inl = null;
                this.sol = true;
                return r;
              }
              if (this.inl.acc[j] === "*") {
                if (j + 1 < this.inl.acc.length && this.inl.acc[j + 1] === "*") {
                  j++;
                  continue;
                }
                const content = this.inl.acc.slice(0, j);
                this.buf = this.inl.acc.slice(j + 1);
                this.inl = null;
                if (_StreamingMarkdownFilter.containsCJK(content)) return content;
                return `*${content}*`;
              }
            }
            return "";
          }
          case "uitalic": {
            for (let j = 0; j < this.inl.acc.length; j++) {
              if (this.inl.acc[j] === "\n") {
                const r = "_" + this.inl.acc.slice(0, j + 1);
                this.buf = this.inl.acc.slice(j + 1);
                this.inl = null;
                this.sol = true;
                return r;
              }
              if (this.inl.acc[j] === "_") {
                if (j + 1 < this.inl.acc.length && this.inl.acc[j + 1] === "_") {
                  j++;
                  continue;
                }
                const content = this.inl.acc.slice(0, j);
                this.buf = this.inl.acc.slice(j + 1);
                this.inl = null;
                if (_StreamingMarkdownFilter.containsCJK(content)) return content;
                return `_${content}_`;
              }
            }
            return "";
          }
          case "image": {
            const cb = this.inl.acc.indexOf("]");
            if (cb === -1) return "";
            if (cb + 1 >= this.inl.acc.length) return "";
            if (this.inl.acc[cb + 1] !== "(") {
              const r = "![" + this.inl.acc.slice(0, cb + 1);
              this.buf = this.inl.acc.slice(cb + 1);
              this.inl = null;
              return r;
            }
            const cp = this.inl.acc.indexOf(")", cb + 2);
            if (cp !== -1) {
              this.buf = this.inl.acc.slice(cp + 1);
              this.inl = null;
              return "";
            }
            return "";
          }
        }
        return "";
      }
      static containsCJK(text) {
        return /[\u2E80-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF]/.test(text);
      }
    };
  }
});

// vendor/openclaw-runtime/mac-arm64/third-party-extensions/openclaw-weixin/src/messaging/send.ts
function generateClientId() {
  return generateId("openclaw-weixin");
}
function buildTextMessageReq(params) {
  const { to, text, contextToken, clientId } = params;
  const item_list = text ? [{ type: MessageItemType.TEXT, text_item: { text } }] : [];
  return {
    msg: {
      from_user_id: "",
      to_user_id: to,
      client_id: clientId,
      message_type: MessageType.BOT,
      message_state: MessageState.FINISH,
      item_list: item_list.length ? item_list : void 0,
      context_token: contextToken ?? void 0
    }
  };
}
function buildSendMessageReq(params) {
  const { to, contextToken, payload, clientId } = params;
  return buildTextMessageReq({
    to,
    text: payload.text ?? "",
    contextToken,
    clientId
  });
}
async function sendMessageWeixin(params) {
  const { to, text, opts } = params;
  if (!opts.contextToken) {
    logger.warn(`sendMessageWeixin: contextToken missing for to=${to}, sending without context`);
  }
  const clientId = generateClientId();
  const req = buildSendMessageReq({
    to,
    contextToken: opts.contextToken,
    payload: { text },
    clientId
  });
  try {
    await sendMessage({
      baseUrl: opts.baseUrl,
      token: opts.token,
      timeoutMs: opts.timeoutMs,
      body: req
    });
  } catch (err) {
    logger.error(`sendMessageWeixin: failed to=${to} clientId=${clientId} err=${String(err)}`);
    throw err;
  }
  return { messageId: clientId };
}
async function sendMediaItems(params) {
  const { to, text, mediaItem, opts, label } = params;
  const items = [];
  if (text) {
    items.push({ type: MessageItemType.TEXT, text_item: { text } });
  }
  items.push(mediaItem);
  let lastClientId = "";
  for (const item of items) {
    lastClientId = generateClientId();
    const req = {
      msg: {
        from_user_id: "",
        to_user_id: to,
        client_id: lastClientId,
        message_type: MessageType.BOT,
        message_state: MessageState.FINISH,
        item_list: [item],
        context_token: opts.contextToken ?? void 0
      }
    };
    try {
      await sendMessage({
        baseUrl: opts.baseUrl,
        token: opts.token,
        timeoutMs: opts.timeoutMs,
        body: req
      });
    } catch (err) {
      logger.error(
        `${label}: failed to=${to} clientId=${lastClientId} err=${String(err)}`
      );
      throw err;
    }
  }
  logger.info(`${label}: success to=${to} clientId=${lastClientId}`);
  return { messageId: lastClientId };
}
async function sendImageMessageWeixin(params) {
  const { to, text, uploaded, opts } = params;
  if (!opts.contextToken) {
    logger.warn(`sendImageMessageWeixin: contextToken missing for to=${to}, sending without context`);
  }
  logger.info(
    `sendImageMessageWeixin: to=${to} filekey=${uploaded.filekey} fileSize=${uploaded.fileSize} aeskey=present`
  );
  const imageItem = {
    type: MessageItemType.IMAGE,
    image_item: {
      media: {
        encrypt_query_param: uploaded.downloadEncryptedQueryParam,
        aes_key: Buffer.from(uploaded.aeskey).toString("base64"),
        encrypt_type: 1
      },
      mid_size: uploaded.fileSizeCiphertext
    }
  };
  return sendMediaItems({ to, text, mediaItem: imageItem, opts, label: "sendImageMessageWeixin" });
}
async function sendVideoMessageWeixin(params) {
  const { to, text, uploaded, opts } = params;
  if (!opts.contextToken) {
    logger.warn(`sendVideoMessageWeixin: contextToken missing for to=${to}, sending without context`);
  }
  const videoItem = {
    type: MessageItemType.VIDEO,
    video_item: {
      media: {
        encrypt_query_param: uploaded.downloadEncryptedQueryParam,
        aes_key: Buffer.from(uploaded.aeskey).toString("base64"),
        encrypt_type: 1
      },
      video_size: uploaded.fileSizeCiphertext
    }
  };
  return sendMediaItems({ to, text, mediaItem: videoItem, opts, label: "sendVideoMessageWeixin" });
}
async function sendFileMessageWeixin(params) {
  const { to, text, fileName, uploaded, opts } = params;
  if (!opts.contextToken) {
    logger.warn(`sendFileMessageWeixin: contextToken missing for to=${to}, sending without context`);
  }
  const fileItem = {
    type: MessageItemType.FILE,
    file_item: {
      media: {
        encrypt_query_param: uploaded.downloadEncryptedQueryParam,
        aes_key: Buffer.from(uploaded.aeskey).toString("base64"),
        encrypt_type: 1
      },
      file_name: fileName,
      len: String(uploaded.fileSize)
    }
  };
  return sendMediaItems({ to, text, mediaItem: fileItem, opts, label: "sendFileMessageWeixin" });
}
var init_send = __esm({
  "vendor/openclaw-runtime/mac-arm64/third-party-extensions/openclaw-weixin/src/messaging/send.ts"() {
    "use strict";
    init_api();
    init_logger();
    init_random();
    init_types();
    init_markdown_filter();
  }
});

// vendor/openclaw-runtime/mac-arm64/third-party-extensions/openclaw-weixin/src/cdn/aes-ecb.ts
import { createCipheriv, createDecipheriv } from "crypto";
function encryptAesEcb(plaintext, key) {
  const cipher = createCipheriv("aes-128-ecb", key, null);
  return Buffer.concat([cipher.update(plaintext), cipher.final()]);
}
function decryptAesEcb(ciphertext, key) {
  const decipher = createDecipheriv("aes-128-ecb", key, null);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
function aesEcbPaddedSize(plaintextSize) {
  return Math.ceil((plaintextSize + 1) / 16) * 16;
}
var init_aes_ecb = __esm({
  "vendor/openclaw-runtime/mac-arm64/third-party-extensions/openclaw-weixin/src/cdn/aes-ecb.ts"() {
    "use strict";
  }
});

// vendor/openclaw-runtime/mac-arm64/third-party-extensions/openclaw-weixin/src/cdn/cdn-url.ts
function buildCdnDownloadUrl(encryptedQueryParam, cdnBaseUrl) {
  return `${cdnBaseUrl}/download?encrypted_query_param=${encodeURIComponent(encryptedQueryParam)}`;
}
function buildCdnUploadUrl(params) {
  return `${params.cdnBaseUrl}/upload?encrypted_query_param=${encodeURIComponent(params.uploadParam)}&filekey=${encodeURIComponent(params.filekey)}`;
}
var ENABLE_CDN_URL_FALLBACK;
var init_cdn_url = __esm({
  "vendor/openclaw-runtime/mac-arm64/third-party-extensions/openclaw-weixin/src/cdn/cdn-url.ts"() {
    "use strict";
    ENABLE_CDN_URL_FALLBACK = true;
  }
});

// vendor/openclaw-runtime/mac-arm64/third-party-extensions/openclaw-weixin/src/cdn/cdn-upload.ts
async function uploadBufferToCdn(params) {
  const { buf, uploadFullUrl, uploadParam, filekey, cdnBaseUrl, label, aeskey } = params;
  const ciphertext = encryptAesEcb(buf, aeskey);
  const trimmedFull = uploadFullUrl?.trim();
  let cdnUrl;
  if (trimmedFull) {
    cdnUrl = trimmedFull;
  } else if (uploadParam) {
    cdnUrl = buildCdnUploadUrl({ cdnBaseUrl, uploadParam, filekey });
  } else {
    throw new Error(`${label}: CDN upload URL missing (need upload_full_url or upload_param)`);
  }
  logger.debug(`${label}: CDN POST url=${redactUrl(cdnUrl)} ciphertextSize=${ciphertext.length}`);
  let downloadParam;
  let lastError;
  for (let attempt = 1; attempt <= UPLOAD_MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(cdnUrl, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: new Uint8Array(ciphertext)
      });
      if (res.status >= 400 && res.status < 500) {
        const errMsg = res.headers.get("x-error-message") ?? await res.text();
        logger.error(
          `${label}: CDN client error attempt=${attempt} status=${res.status} errMsg=${errMsg}`
        );
        throw new Error(`CDN upload client error ${res.status}: ${errMsg}`);
      }
      if (res.status !== 200) {
        const errMsg = res.headers.get("x-error-message") ?? `status ${res.status}`;
        logger.error(
          `${label}: CDN server error attempt=${attempt} status=${res.status} errMsg=${errMsg}`
        );
        throw new Error(`CDN upload server error: ${errMsg}`);
      }
      downloadParam = res.headers.get("x-encrypted-param") ?? void 0;
      if (!downloadParam) {
        logger.error(
          `${label}: CDN response missing x-encrypted-param header attempt=${attempt}`
        );
        throw new Error("CDN upload response missing x-encrypted-param header");
      }
      logger.debug(`${label}: CDN upload success attempt=${attempt}`);
      break;
    } catch (err) {
      lastError = err;
      if (err instanceof Error && err.message.includes("client error")) throw err;
      if (attempt < UPLOAD_MAX_RETRIES) {
        logger.error(`${label}: attempt ${attempt} failed, retrying... err=${String(err)}`);
      } else {
        logger.error(`${label}: all ${UPLOAD_MAX_RETRIES} attempts failed err=${String(err)}`);
      }
    }
  }
  if (!downloadParam) {
    throw lastError instanceof Error ? lastError : new Error(`CDN upload failed after ${UPLOAD_MAX_RETRIES} attempts`);
  }
  return { downloadParam };
}
var UPLOAD_MAX_RETRIES;
var init_cdn_upload = __esm({
  "vendor/openclaw-runtime/mac-arm64/third-party-extensions/openclaw-weixin/src/cdn/cdn-upload.ts"() {
    "use strict";
    init_aes_ecb();
    init_cdn_url();
    init_logger();
    init_redact();
    UPLOAD_MAX_RETRIES = 3;
  }
});

// vendor/openclaw-runtime/mac-arm64/third-party-extensions/openclaw-weixin/src/cdn/upload.ts
import crypto3 from "crypto";
import fs6 from "fs/promises";
import path8 from "path";
async function downloadRemoteImageToTemp(url, destDir) {
  logger.debug(`downloadRemoteImageToTemp: fetching url=${url}`);
  const res = await fetch(url);
  if (!res.ok) {
    const msg = `remote media download failed: ${res.status} ${res.statusText} url=${url}`;
    logger.error(`downloadRemoteImageToTemp: ${msg}`);
    throw new Error(msg);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  logger.debug(`downloadRemoteImageToTemp: downloaded ${buf.length} bytes`);
  await fs6.mkdir(destDir, { recursive: true });
  const ext = getExtensionFromContentTypeOrUrl(res.headers.get("content-type"), url);
  const name = tempFileName("weixin-remote", ext);
  const filePath = path8.join(destDir, name);
  await fs6.writeFile(filePath, buf);
  logger.debug(`downloadRemoteImageToTemp: saved to ${filePath} ext=${ext}`);
  return filePath;
}
async function uploadMediaToCdn(params) {
  const { filePath, toUserId, opts, cdnBaseUrl, mediaType, label } = params;
  const plaintext = await fs6.readFile(filePath);
  const rawsize = plaintext.length;
  const rawfilemd5 = crypto3.createHash("md5").update(plaintext).digest("hex");
  const filesize = aesEcbPaddedSize(rawsize);
  const filekey = crypto3.randomBytes(16).toString("hex");
  const aeskey = crypto3.randomBytes(16);
  logger.debug(
    `${label}: file=${filePath} rawsize=${rawsize} filesize=${filesize} md5=${rawfilemd5} filekey=${filekey}`
  );
  const uploadUrlResp = await getUploadUrl({
    ...opts,
    filekey,
    media_type: mediaType,
    to_user_id: toUserId,
    rawsize,
    rawfilemd5,
    filesize,
    no_need_thumb: true,
    aeskey: aeskey.toString("hex")
  });
  const uploadFullUrl = uploadUrlResp.upload_full_url?.trim();
  const uploadParam = uploadUrlResp.upload_param;
  if (!uploadFullUrl && !uploadParam) {
    logger.error(
      `${label}: getUploadUrl returned no upload URL (need upload_full_url or upload_param), resp=${JSON.stringify(uploadUrlResp)}`
    );
    throw new Error(`${label}: getUploadUrl returned no upload URL`);
  }
  const { downloadParam: downloadEncryptedQueryParam } = await uploadBufferToCdn({
    buf: plaintext,
    uploadFullUrl: uploadFullUrl || void 0,
    uploadParam: uploadParam ?? void 0,
    filekey,
    cdnBaseUrl,
    aeskey,
    label: `${label}[orig filekey=${filekey}]`
  });
  return {
    filekey,
    downloadEncryptedQueryParam,
    aeskey: aeskey.toString("hex"),
    fileSize: rawsize,
    fileSizeCiphertext: filesize
  };
}
async function uploadFileToWeixin(params) {
  return uploadMediaToCdn({
    ...params,
    mediaType: UploadMediaType.IMAGE,
    label: "uploadFileToWeixin"
  });
}
async function uploadVideoToWeixin(params) {
  return uploadMediaToCdn({
    ...params,
    mediaType: UploadMediaType.VIDEO,
    label: "uploadVideoToWeixin"
  });
}
async function uploadFileAttachmentToWeixin(params) {
  return uploadMediaToCdn({
    ...params,
    mediaType: UploadMediaType.FILE,
    label: "uploadFileAttachmentToWeixin"
  });
}
var init_upload = __esm({
  "vendor/openclaw-runtime/mac-arm64/third-party-extensions/openclaw-weixin/src/cdn/upload.ts"() {
    "use strict";
    init_api();
    init_aes_ecb();
    init_cdn_upload();
    init_logger();
    init_mime();
    init_random();
    init_types();
  }
});

// vendor/openclaw-runtime/mac-arm64/third-party-extensions/openclaw-weixin/src/messaging/send-media.ts
import path9 from "path";
async function sendWeixinMediaFile(params) {
  const { filePath, to, text, opts, cdnBaseUrl } = params;
  const mime = getMimeFromFilename(filePath);
  const uploadOpts = { baseUrl: opts.baseUrl, token: opts.token };
  if (mime.startsWith("video/")) {
    logger.info(`[weixin] sendWeixinMediaFile: uploading video filePath=${filePath} to=${to}`);
    const uploaded2 = await uploadVideoToWeixin({
      filePath,
      toUserId: to,
      opts: uploadOpts,
      cdnBaseUrl
    });
    logger.info(
      `[weixin] sendWeixinMediaFile: video upload done filekey=${uploaded2.filekey} size=${uploaded2.fileSize}`
    );
    return sendVideoMessageWeixin({ to, text, uploaded: uploaded2, opts });
  }
  if (mime.startsWith("image/")) {
    logger.info(`[weixin] sendWeixinMediaFile: uploading image filePath=${filePath} to=${to}`);
    const uploaded2 = await uploadFileToWeixin({
      filePath,
      toUserId: to,
      opts: uploadOpts,
      cdnBaseUrl
    });
    logger.info(
      `[weixin] sendWeixinMediaFile: image upload done filekey=${uploaded2.filekey} size=${uploaded2.fileSize}`
    );
    return sendImageMessageWeixin({ to, text, uploaded: uploaded2, opts });
  }
  const fileName = path9.basename(filePath);
  logger.info(
    `[weixin] sendWeixinMediaFile: uploading file attachment filePath=${filePath} name=${fileName} to=${to}`
  );
  const uploaded = await uploadFileAttachmentToWeixin({
    filePath,
    fileName,
    toUserId: to,
    opts: uploadOpts,
    cdnBaseUrl
  });
  logger.info(
    `[weixin] sendWeixinMediaFile: file upload done filekey=${uploaded.filekey} size=${uploaded.fileSize}`
  );
  return sendFileMessageWeixin({ to, text, fileName, uploaded, opts });
}
var init_send_media = __esm({
  "vendor/openclaw-runtime/mac-arm64/third-party-extensions/openclaw-weixin/src/messaging/send-media.ts"() {
    "use strict";
    init_logger();
    init_mime();
    init_send();
    init_upload();
  }
});

// vendor/openclaw-runtime/mac-arm64/third-party-extensions/openclaw-weixin/src/api/config-cache.ts
var CONFIG_CACHE_TTL_MS, CONFIG_CACHE_INITIAL_RETRY_MS, CONFIG_CACHE_MAX_RETRY_MS, WeixinConfigManager;
var init_config_cache = __esm({
  "vendor/openclaw-runtime/mac-arm64/third-party-extensions/openclaw-weixin/src/api/config-cache.ts"() {
    "use strict";
    init_api();
    CONFIG_CACHE_TTL_MS = 24 * 60 * 60 * 1e3;
    CONFIG_CACHE_INITIAL_RETRY_MS = 2e3;
    CONFIG_CACHE_MAX_RETRY_MS = 60 * 60 * 1e3;
    WeixinConfigManager = class {
      constructor(apiOpts, log) {
        this.apiOpts = apiOpts;
        this.log = log;
      }
      cache = /* @__PURE__ */ new Map();
      async getForUser(userId, contextToken) {
        const now = Date.now();
        const entry = this.cache.get(userId);
        const shouldFetch = !entry || now >= entry.nextFetchAt;
        if (shouldFetch) {
          let fetchOk = false;
          try {
            const resp = await getConfig({
              baseUrl: this.apiOpts.baseUrl,
              token: this.apiOpts.token,
              ilinkUserId: userId,
              contextToken
            });
            if (resp.ret === 0) {
              this.cache.set(userId, {
                config: { typingTicket: resp.typing_ticket ?? "" },
                everSucceeded: true,
                nextFetchAt: now + Math.random() * CONFIG_CACHE_TTL_MS,
                retryDelayMs: CONFIG_CACHE_INITIAL_RETRY_MS
              });
              this.log(
                `[weixin] config ${entry?.everSucceeded ? "refreshed" : "cached"} for ${userId}`
              );
              fetchOk = true;
            }
          } catch (err) {
            this.log(`[weixin] getConfig failed for ${userId} (ignored): ${String(err)}`);
          }
          if (!fetchOk) {
            const prevDelay = entry?.retryDelayMs ?? CONFIG_CACHE_INITIAL_RETRY_MS;
            const nextDelay = Math.min(prevDelay * 2, CONFIG_CACHE_MAX_RETRY_MS);
            if (entry) {
              entry.nextFetchAt = now + nextDelay;
              entry.retryDelayMs = nextDelay;
            } else {
              this.cache.set(userId, {
                config: { typingTicket: "" },
                everSucceeded: false,
                nextFetchAt: now + CONFIG_CACHE_INITIAL_RETRY_MS,
                retryDelayMs: CONFIG_CACHE_INITIAL_RETRY_MS
              });
            }
          }
        }
        return this.cache.get(userId)?.config ?? { typingTicket: "" };
      }
    };
  }
});

// vendor/openclaw-runtime/mac-arm64/third-party-extensions/openclaw-weixin/src/cdn/pic-decrypt.ts
async function fetchCdnBytes(url, label) {
  let res;
  try {
    res = await fetch(url);
  } catch (err) {
    const cause = err.cause ?? err.code ?? "(no cause)";
    logger.error(
      `${label}: fetch network error url=${url} err=${String(err)} cause=${String(cause)}`
    );
    throw err;
  }
  logger.debug(`${label}: response status=${res.status} ok=${res.ok}`);
  if (!res.ok) {
    const body = await res.text().catch(() => "(unreadable)");
    const msg = `${label}: CDN download ${res.status} ${res.statusText} body=${body}`;
    logger.error(msg);
    throw new Error(msg);
  }
  return Buffer.from(await res.arrayBuffer());
}
function parseAesKey(aesKeyBase64, label) {
  const decoded = Buffer.from(aesKeyBase64, "base64");
  if (decoded.length === 16) {
    return decoded;
  }
  if (decoded.length === 32 && /^[0-9a-fA-F]{32}$/.test(decoded.toString("ascii"))) {
    return Buffer.from(decoded.toString("ascii"), "hex");
  }
  const msg = `${label}: aes_key must decode to 16 raw bytes or 32-char hex string, got ${decoded.length} bytes (base64="${aesKeyBase64}")`;
  logger.error(msg);
  throw new Error(msg);
}
async function downloadAndDecryptBuffer(encryptedQueryParam, aesKeyBase64, cdnBaseUrl, label, fullUrl) {
  const key = parseAesKey(aesKeyBase64, label);
  let url;
  if (fullUrl) {
    url = fullUrl;
  } else if (ENABLE_CDN_URL_FALLBACK) {
    url = buildCdnDownloadUrl(encryptedQueryParam, cdnBaseUrl);
  } else {
    throw new Error(`${label}: fullUrl is required (CDN URL fallback is disabled)`);
  }
  logger.debug(`${label}: fetching url=${url}`);
  const encrypted = await fetchCdnBytes(url, label);
  logger.debug(`${label}: downloaded ${encrypted.byteLength} bytes, decrypting`);
  const decrypted = decryptAesEcb(encrypted, key);
  logger.debug(`${label}: decrypted ${decrypted.length} bytes`);
  return decrypted;
}
async function downloadPlainCdnBuffer(encryptedQueryParam, cdnBaseUrl, label, fullUrl) {
  let url;
  if (fullUrl) {
    url = fullUrl;
  } else if (ENABLE_CDN_URL_FALLBACK) {
    url = buildCdnDownloadUrl(encryptedQueryParam, cdnBaseUrl);
  } else {
    throw new Error(`${label}: fullUrl is required (CDN URL fallback is disabled)`);
  }
  logger.debug(`${label}: fetching url=${url}`);
  return fetchCdnBytes(url, label);
}
var init_pic_decrypt = __esm({
  "vendor/openclaw-runtime/mac-arm64/third-party-extensions/openclaw-weixin/src/cdn/pic-decrypt.ts"() {
    "use strict";
    init_aes_ecb();
    init_cdn_url();
    init_logger();
  }
});

// vendor/openclaw-runtime/mac-arm64/third-party-extensions/openclaw-weixin/src/media/silk-transcode.ts
function pcmBytesToWav(pcm, sampleRate) {
  const pcmBytes = pcm.byteLength;
  const totalSize = 44 + pcmBytes;
  const buf = Buffer.allocUnsafe(totalSize);
  let offset = 0;
  buf.write("RIFF", offset);
  offset += 4;
  buf.writeUInt32LE(totalSize - 8, offset);
  offset += 4;
  buf.write("WAVE", offset);
  offset += 4;
  buf.write("fmt ", offset);
  offset += 4;
  buf.writeUInt32LE(16, offset);
  offset += 4;
  buf.writeUInt16LE(1, offset);
  offset += 2;
  buf.writeUInt16LE(1, offset);
  offset += 2;
  buf.writeUInt32LE(sampleRate, offset);
  offset += 4;
  buf.writeUInt32LE(sampleRate * 2, offset);
  offset += 4;
  buf.writeUInt16LE(2, offset);
  offset += 2;
  buf.writeUInt16LE(16, offset);
  offset += 2;
  buf.write("data", offset);
  offset += 4;
  buf.writeUInt32LE(pcmBytes, offset);
  offset += 4;
  Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength).copy(buf, offset);
  return buf;
}
async function silkToWav(silkBuf) {
  try {
    const { decode } = await import("silk-wasm");
    logger.debug(`silkToWav: decoding ${silkBuf.length} bytes of SILK`);
    const result = await decode(silkBuf, SILK_SAMPLE_RATE);
    logger.debug(
      `silkToWav: decoded duration=${result.duration}ms pcmBytes=${result.data.byteLength}`
    );
    const wav = pcmBytesToWav(result.data, SILK_SAMPLE_RATE);
    logger.debug(`silkToWav: WAV size=${wav.length}`);
    return wav;
  } catch (err) {
    logger.warn(`silkToWav: transcode failed, will use raw silk err=${String(err)}`);
    return null;
  }
}
var SILK_SAMPLE_RATE;
var init_silk_transcode = __esm({
  "vendor/openclaw-runtime/mac-arm64/third-party-extensions/openclaw-weixin/src/media/silk-transcode.ts"() {
    "use strict";
    init_logger();
    SILK_SAMPLE_RATE = 24e3;
  }
});

// vendor/openclaw-runtime/mac-arm64/third-party-extensions/openclaw-weixin/src/media/media-download.ts
async function downloadMediaFromItem(item, deps) {
  const { cdnBaseUrl, saveMedia, log, errLog, label } = deps;
  const result = {};
  if (item.type === MessageItemType.IMAGE) {
    const img = item.image_item;
    if (!img?.media?.encrypt_query_param && !img?.media?.full_url) return result;
    const aesKeyBase64 = img.aeskey ? Buffer.from(img.aeskey, "hex").toString("base64") : img.media.aes_key;
    logger.debug(
      `${label} image: encrypt_query_param=${(img.media.encrypt_query_param ?? "").slice(0, 40)}... hasAesKey=${Boolean(aesKeyBase64)} aeskeySource=${img.aeskey ? "image_item.aeskey" : "media.aes_key"} full_url=${Boolean(img.media.full_url)}`
    );
    try {
      const buf = aesKeyBase64 ? await downloadAndDecryptBuffer(
        img.media.encrypt_query_param ?? "",
        aesKeyBase64,
        cdnBaseUrl,
        `${label} image`,
        img.media.full_url
      ) : await downloadPlainCdnBuffer(
        img.media.encrypt_query_param ?? "",
        cdnBaseUrl,
        `${label} image-plain`,
        img.media.full_url
      );
      const saved = await saveMedia(buf, void 0, "inbound", WEIXIN_MEDIA_MAX_BYTES);
      result.decryptedPicPath = saved.path;
      logger.debug(`${label} image saved: ${saved.path}`);
    } catch (err) {
      logger.error(`${label} image download/decrypt failed: ${String(err)}`);
      errLog(`weixin ${label} image download/decrypt failed: ${String(err)}`);
    }
  } else if (item.type === MessageItemType.VOICE) {
    const voice = item.voice_item;
    if (!voice?.media?.encrypt_query_param && !voice?.media?.full_url || !voice?.media?.aes_key)
      return result;
    try {
      const silkBuf = await downloadAndDecryptBuffer(
        voice.media.encrypt_query_param ?? "",
        voice.media.aes_key,
        cdnBaseUrl,
        `${label} voice`,
        voice.media.full_url
      );
      logger.debug(`${label} voice: decrypted ${silkBuf.length} bytes, attempting silk transcode`);
      const wavBuf = await silkToWav(silkBuf);
      if (wavBuf) {
        const saved = await saveMedia(wavBuf, "audio/wav", "inbound", WEIXIN_MEDIA_MAX_BYTES);
        result.decryptedVoicePath = saved.path;
        result.voiceMediaType = "audio/wav";
        logger.debug(`${label} voice: saved WAV to ${saved.path}`);
      } else {
        const saved = await saveMedia(silkBuf, "audio/silk", "inbound", WEIXIN_MEDIA_MAX_BYTES);
        result.decryptedVoicePath = saved.path;
        result.voiceMediaType = "audio/silk";
        logger.debug(`${label} voice: silk transcode unavailable, saved raw SILK to ${saved.path}`);
      }
    } catch (err) {
      logger.error(`${label} voice download/transcode failed: ${String(err)}`);
      errLog(`weixin ${label} voice download/transcode failed: ${String(err)}`);
    }
  } else if (item.type === MessageItemType.FILE) {
    const fileItem = item.file_item;
    if (!fileItem?.media?.encrypt_query_param && !fileItem?.media?.full_url || !fileItem?.media?.aes_key)
      return result;
    try {
      const buf = await downloadAndDecryptBuffer(
        fileItem.media.encrypt_query_param ?? "",
        fileItem.media.aes_key,
        cdnBaseUrl,
        `${label} file`,
        fileItem.media.full_url
      );
      const mime = getMimeFromFilename(fileItem.file_name ?? "file.bin");
      const saved = await saveMedia(
        buf,
        mime,
        "inbound",
        WEIXIN_MEDIA_MAX_BYTES,
        fileItem.file_name ?? void 0
      );
      result.decryptedFilePath = saved.path;
      result.fileMediaType = mime;
      logger.debug(`${label} file: saved to ${saved.path} mime=${mime}`);
    } catch (err) {
      logger.error(`${label} file download failed: ${String(err)}`);
      errLog(`weixin ${label} file download failed: ${String(err)}`);
    }
  } else if (item.type === MessageItemType.VIDEO) {
    const videoItem = item.video_item;
    if (!videoItem?.media?.encrypt_query_param && !videoItem?.media?.full_url || !videoItem?.media?.aes_key)
      return result;
    try {
      const buf = await downloadAndDecryptBuffer(
        videoItem.media.encrypt_query_param ?? "",
        videoItem.media.aes_key,
        cdnBaseUrl,
        `${label} video`,
        videoItem.media.full_url
      );
      const saved = await saveMedia(buf, "video/mp4", "inbound", WEIXIN_MEDIA_MAX_BYTES);
      result.decryptedVideoPath = saved.path;
      logger.debug(`${label} video: saved to ${saved.path}`);
    } catch (err) {
      logger.error(`${label} video download failed: ${String(err)}`);
      errLog(`weixin ${label} video download failed: ${String(err)}`);
    }
  }
  return result;
}
var WEIXIN_MEDIA_MAX_BYTES;
var init_media_download = __esm({
  "vendor/openclaw-runtime/mac-arm64/third-party-extensions/openclaw-weixin/src/media/media-download.ts"() {
    "use strict";
    init_logger();
    init_mime();
    init_pic_decrypt();
    init_silk_transcode();
    init_types();
    WEIXIN_MEDIA_MAX_BYTES = 100 * 1024 * 1024;
  }
});

// vendor/openclaw-runtime/mac-arm64/third-party-extensions/openclaw-weixin/src/messaging/debug-mode.ts
import fs7 from "fs";
import path10 from "path";
function resolveDebugModePath() {
  return path10.join(resolveStateDir(), "openclaw-weixin", "debug-mode.json");
}
function loadState() {
  try {
    const raw = fs7.readFileSync(resolveDebugModePath(), "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.accounts === "object") return parsed;
  } catch {
  }
  return { accounts: {} };
}
function saveState(state) {
  const filePath = resolveDebugModePath();
  fs7.mkdirSync(path10.dirname(filePath), { recursive: true });
  fs7.writeFileSync(filePath, JSON.stringify(state, null, 2), "utf-8");
}
function toggleDebugMode(accountId) {
  const state = loadState();
  const next = !state.accounts[accountId];
  state.accounts[accountId] = next;
  try {
    saveState(state);
  } catch (err) {
    logger.error(`debug-mode: failed to persist state: ${String(err)}`);
  }
  return next;
}
function isDebugMode(accountId) {
  return loadState().accounts[accountId] === true;
}
var init_debug_mode = __esm({
  "vendor/openclaw-runtime/mac-arm64/third-party-extensions/openclaw-weixin/src/messaging/debug-mode.ts"() {
    "use strict";
    init_state_dir();
    init_logger();
  }
});

// vendor/openclaw-runtime/mac-arm64/third-party-extensions/openclaw-weixin/src/messaging/error-notice.ts
async function sendWeixinErrorNotice(params) {
  if (!params.contextToken) {
    logger.warn(`sendWeixinErrorNotice: no contextToken for to=${params.to}, sending without context`);
  }
  try {
    await sendMessageWeixin({ to: params.to, text: params.message, opts: {
      baseUrl: params.baseUrl,
      token: params.token,
      contextToken: params.contextToken
    } });
    logger.debug(`sendWeixinErrorNotice: sent to=${params.to}`);
  } catch (err) {
    params.errLog(`[weixin] sendWeixinErrorNotice failed to=${params.to}: ${String(err)}`);
  }
}
var init_error_notice = __esm({
  "vendor/openclaw-runtime/mac-arm64/third-party-extensions/openclaw-weixin/src/messaging/error-notice.ts"() {
    "use strict";
    init_logger();
    init_send();
  }
});

// vendor/openclaw-runtime/mac-arm64/third-party-extensions/openclaw-weixin/src/messaging/slash-commands.ts
async function sendReply(ctx, text) {
  const opts = {
    baseUrl: ctx.baseUrl,
    token: ctx.token,
    contextToken: ctx.contextToken
  };
  await sendMessageWeixin({ to: ctx.to, text, opts });
}
async function handleEcho(ctx, args, receivedAt, eventTimestamp) {
  const message = args.trim();
  if (message) {
    await sendReply(ctx, message);
  }
  const eventTs = eventTimestamp ?? 0;
  const platformDelay = eventTs > 0 ? `${receivedAt - eventTs}ms` : "N/A";
  const timing = [
    "\u23F1 \u901A\u9053\u8017\u65F6",
    `\u251C \u4E8B\u4EF6\u65F6\u95F4: ${eventTs > 0 ? new Date(eventTs).toISOString() : "N/A"}`,
    `\u251C \u5E73\u53F0\u2192\u63D2\u4EF6: ${platformDelay}`,
    `\u2514 \u63D2\u4EF6\u5904\u7406: ${Date.now() - receivedAt}ms`
  ].join("\n");
  await sendReply(ctx, timing);
}
async function handleSlashCommand(content, ctx, receivedAt, eventTimestamp) {
  const trimmed = content.trim();
  if (!trimmed.startsWith("/")) {
    return { handled: false };
  }
  const spaceIdx = trimmed.indexOf(" ");
  const command = spaceIdx === -1 ? trimmed.toLowerCase() : trimmed.slice(0, spaceIdx).toLowerCase();
  const args = spaceIdx === -1 ? "" : trimmed.slice(spaceIdx + 1);
  logger.info(`[weixin] Slash command: ${command}, args: ${args.slice(0, 50)}`);
  try {
    switch (command) {
      case "/echo":
        await handleEcho(ctx, args, receivedAt, eventTimestamp);
        return { handled: true };
      case "/toggle-debug": {
        const enabled = toggleDebugMode(ctx.accountId);
        await sendReply(
          ctx,
          enabled ? "Debug \u6A21\u5F0F\u5DF2\u5F00\u542F" : "Debug \u6A21\u5F0F\u5DF2\u5173\u95ED"
        );
        return { handled: true };
      }
      default:
        return { handled: false };
    }
  } catch (err) {
    logger.error(`[weixin] Slash command error: ${String(err)}`);
    try {
      await sendReply(ctx, `\u274C \u6307\u4EE4\u6267\u884C\u5931\u8D25: ${String(err).slice(0, 200)}`);
    } catch {
    }
    return { handled: true };
  }
}
var init_slash_commands = __esm({
  "vendor/openclaw-runtime/mac-arm64/third-party-extensions/openclaw-weixin/src/messaging/slash-commands.ts"() {
    "use strict";
    init_logger();
    init_debug_mode();
    init_send();
  }
});

// vendor/openclaw-runtime/mac-arm64/third-party-extensions/openclaw-weixin/src/messaging/process-message.ts
import path11 from "path";
import { createTypingCallbacks } from "openclaw/plugin-sdk/channel-runtime";
import {
  resolveSenderCommandAuthorizationWithRuntime,
  resolveDirectDmAuthorizationOutcome
} from "openclaw/plugin-sdk/command-auth";
import { resolvePreferredOpenClawTmpDir as resolvePreferredOpenClawTmpDir2 } from "openclaw/plugin-sdk/infra-runtime";
function extractTextBody(itemList) {
  if (!itemList?.length) return "";
  for (const item of itemList) {
    if (item.type === MessageItemType.TEXT && item.text_item?.text != null) {
      return String(item.text_item.text);
    }
  }
  return "";
}
async function processOneMessage(full, deps) {
  if (!deps?.channelRuntime) {
    logger.error(
      `processOneMessage: channelRuntime is undefined, skipping message from=${full.from_user_id}`
    );
    deps.errLog("processOneMessage: channelRuntime is undefined, skip");
    return;
  }
  const receivedAt = Date.now();
  const debug = isDebugMode(deps.accountId);
  const debugTrace = [];
  const debugTs = { received: receivedAt };
  const textBody = extractTextBody(full.item_list);
  if (textBody.startsWith("/")) {
    const slashResult = await handleSlashCommand(textBody, {
      to: full.from_user_id ?? "",
      contextToken: full.context_token,
      baseUrl: deps.baseUrl,
      token: deps.token,
      accountId: deps.accountId,
      log: deps.log,
      errLog: deps.errLog
    }, receivedAt, full.create_time_ms);
    if (slashResult.handled) {
      logger.info(`[weixin] Slash command handled, skipping AI pipeline`);
      return;
    }
  }
  if (debug) {
    const itemTypes = full.item_list?.map((i) => i.type).join(",") ?? "none";
    debugTrace.push(
      "\u2500\u2500 \u6536\u6D88\u606F \u2500\u2500",
      `\u2502 seq=${full.seq ?? "?"} msgId=${full.message_id ?? "?"} from=${full.from_user_id ?? "?"}`,
      `\u2502 body="${textBody.slice(0, 40)}${textBody.length > 40 ? "\u2026" : ""}" (len=${textBody.length}) itemTypes=[${itemTypes}]`,
      `\u2502 sessionId=${full.session_id ?? "?"} contextToken=${full.context_token ? "present" : "none"}`
    );
  }
  const mediaOpts = {};
  const hasDownloadableMedia = (m) => m?.encrypt_query_param || m?.full_url;
  const mainMediaItem = full.item_list?.find(
    (i) => i.type === MessageItemType.IMAGE && hasDownloadableMedia(i.image_item?.media)
  ) ?? full.item_list?.find(
    (i) => i.type === MessageItemType.VIDEO && hasDownloadableMedia(i.video_item?.media)
  ) ?? full.item_list?.find(
    (i) => i.type === MessageItemType.FILE && hasDownloadableMedia(i.file_item?.media)
  ) ?? full.item_list?.find(
    (i) => i.type === MessageItemType.VOICE && hasDownloadableMedia(i.voice_item?.media) && !i.voice_item?.text
  );
  const refMediaItem = !mainMediaItem ? full.item_list?.find(
    (i) => i.type === MessageItemType.TEXT && i.ref_msg?.message_item && isMediaItem(i.ref_msg.message_item)
  )?.ref_msg?.message_item : void 0;
  const mediaDownloadStart = Date.now();
  const mediaItem = mainMediaItem ?? refMediaItem;
  if (mediaItem) {
    const label = refMediaItem ? "ref" : "inbound";
    const downloaded = await downloadMediaFromItem(mediaItem, {
      cdnBaseUrl: deps.cdnBaseUrl,
      saveMedia: deps.channelRuntime.media.saveMediaBuffer,
      log: deps.log,
      errLog: deps.errLog,
      label
    });
    Object.assign(mediaOpts, downloaded);
  }
  const mediaDownloadMs = Date.now() - mediaDownloadStart;
  if (debug) {
    debugTrace.push(
      mediaItem ? `\u2502 mediaDownload: type=${mediaItem.type} cost=${mediaDownloadMs}ms` : "\u2502 mediaDownload: none"
    );
  }
  const ctx = weixinMessageToMsgContext(full, deps.accountId, mediaOpts);
  const rawBody = ctx.Body?.trim() ?? "";
  ctx.CommandBody = rawBody;
  const senderId = full.from_user_id ?? "";
  const { senderAllowedForCommands, commandAuthorized } = await resolveSenderCommandAuthorizationWithRuntime({
    cfg: deps.config,
    rawBody,
    isGroup: false,
    dmPolicy: (() => {
      const _cc = deps.config.channels?.["openclaw-weixin"] ?? {};
      return _cc.dmPolicy || "pairing";
    })(),
    configuredAllowFrom: (() => {
      const _cc = deps.config.channels?.["openclaw-weixin"] ?? {};
      return Array.isArray(_cc.allowFrom) ? _cc.allowFrom.map(String) : [];
    })(),
    configuredGroupAllowFrom: [],
    senderId,
    isSenderAllowed: (id, list) => list.length === 0 || list.includes("*") || list.includes(id),
    /** Pairing: framework credentials `*-allowFrom.json`, with account `userId` fallback for legacy installs. */
    readAllowFromStore: async () => {
      const fromStore = readFrameworkAllowFromList(deps.accountId);
      if (fromStore.length > 0) return fromStore;
      const uid = loadWeixinAccount(deps.accountId)?.userId?.trim();
      return uid ? [uid] : [];
    },
    runtime: deps.channelRuntime.commands
  });
  const directDmOutcome = resolveDirectDmAuthorizationOutcome({
    isGroup: false,
    dmPolicy: (() => {
      const _cc = deps.config.channels?.["openclaw-weixin"] ?? {};
      return _cc.dmPolicy || "pairing";
    })(),
    senderAllowedForCommands
  });
  if (directDmOutcome === "disabled" || directDmOutcome === "unauthorized") {
    logger.info(
      `authorization: dropping message from=${senderId} outcome=${directDmOutcome}`
    );
    return;
  }
  ctx.CommandAuthorized = commandAuthorized;
  logger.debug(
    `authorization: senderId=${senderId} commandAuthorized=${String(commandAuthorized)} senderAllowed=${String(senderAllowedForCommands)}`
  );
  if (debug) {
    debugTrace.push(
      "\u2500\u2500 \u9274\u6743 & \u8DEF\u7531 \u2500\u2500",
      `\u2502 auth: cmdAuthorized=${String(commandAuthorized)} senderAllowed=${String(senderAllowedForCommands)}`
    );
  }
  const route = deps.channelRuntime.routing.resolveAgentRoute({
    cfg: deps.config,
    channel: "openclaw-weixin",
    accountId: deps.accountId,
    peer: { kind: "direct", id: ctx.To }
  });
  logger.debug(
    `resolveAgentRoute: agentId=${route.agentId ?? "(none)"} sessionKey=${route.sessionKey ?? "(none)"} mainSessionKey=${route.mainSessionKey ?? "(none)"}`
  );
  if (!route.agentId) {
    logger.error(
      `resolveAgentRoute: no agentId resolved for peer=${ctx.To} accountId=${deps.accountId} \u2014 message will not be dispatched`
    );
  }
  if (debug) {
    debugTrace.push(
      `\u2502 route: agent=${route.agentId ?? "none"} session=${route.sessionKey ?? "none"}`
    );
    debugTs.preDispatch = Date.now();
  }
  ctx.SessionKey = route.sessionKey;
  const storePath = deps.channelRuntime.session.resolveStorePath(deps.config.session?.store, {
    agentId: route.agentId
  });
  const finalized = deps.channelRuntime.reply.finalizeInboundContext(
    ctx
  );
  logger.info(
    `inbound: from=${finalized.From} to=${finalized.To} bodyLen=${(finalized.Body ?? "").length} hasMedia=${Boolean(finalized.MediaPath ?? finalized.MediaUrl)}`
  );
  logger.debug(`inbound context: ${redactBody(JSON.stringify(finalized))}`);
  await deps.channelRuntime.session.recordInboundSession({
    storePath,
    sessionKey: route.sessionKey,
    ctx: finalized,
    updateLastRoute: {
      sessionKey: route.mainSessionKey,
      channel: "openclaw-weixin",
      to: ctx.To,
      accountId: deps.accountId
    },
    onRecordError: (err) => deps.errLog(`recordInboundSession: ${String(err)}`)
  });
  logger.debug(
    `recordInboundSession: done storePath=${storePath} sessionKey=${route.sessionKey ?? "(none)"}`
  );
  const contextToken = getContextTokenFromMsgContext(ctx);
  if (contextToken) {
    setContextToken(deps.accountId, full.from_user_id ?? "", contextToken);
  }
  const humanDelay = deps.channelRuntime.reply.resolveHumanDelayConfig(deps.config, route.agentId);
  const hasTypingTicket = Boolean(deps.typingTicket);
  const typingCallbacks = createTypingCallbacks({
    start: hasTypingTicket ? () => sendTyping({
      baseUrl: deps.baseUrl,
      token: deps.token,
      body: {
        ilink_user_id: ctx.To,
        typing_ticket: deps.typingTicket,
        status: TypingStatus.TYPING
      }
    }) : async () => {
    },
    stop: hasTypingTicket ? () => sendTyping({
      baseUrl: deps.baseUrl,
      token: deps.token,
      body: {
        ilink_user_id: ctx.To,
        typing_ticket: deps.typingTicket,
        status: TypingStatus.CANCEL
      }
    }) : async () => {
    },
    onStartError: (err) => deps.log(`[weixin] typing send error: ${String(err)}`),
    onStopError: (err) => deps.log(`[weixin] typing cancel error: ${String(err)}`),
    keepaliveIntervalMs: 5e3
  });
  const debugDeliveries = [];
  const { dispatcher, replyOptions, markDispatchIdle } = deps.channelRuntime.reply.createReplyDispatcherWithTyping({
    humanDelay,
    typingCallbacks,
    deliver: async (payload) => {
      const rawText = payload.text ?? "";
      let text = (() => {
        const f = new StreamingMarkdownFilter();
        return f.feed(rawText) + f.flush();
      })();
      const mediaUrl = payload.mediaUrl ?? payload.mediaUrls?.[0];
      logger.debug(`outbound payload: ${redactBody(JSON.stringify(payload))}`);
      logger.info(
        `outbound: to=${ctx.To} contextToken=${redactToken(contextToken)} textLen=${text.length} mediaUrl=${mediaUrl ? "present" : "none"}`
      );
      if (debug) {
        debugDeliveries.push({
          textLen: text.length,
          media: mediaUrl ? "present" : "none",
          preview: `${text.slice(0, 60)}${text.length > 60 ? "\u2026" : ""}`,
          ts: Date.now()
        });
      }
      const sendingResult = await applyWeixinMessageSendingHook({
        to: ctx.To,
        text,
        accountId: deps.accountId,
        mediaUrl
      });
      if (sendingResult.cancelled) {
        logger.info(`outbound: cancelled by message_sending hook to=${ctx.To}`);
        return;
      }
      text = sendingResult.text;
      try {
        if (mediaUrl) {
          let filePath;
          if (!mediaUrl.includes("://") || mediaUrl.startsWith("file://")) {
            if (mediaUrl.startsWith("file://")) {
              filePath = new URL(mediaUrl).pathname;
            } else if (!path11.isAbsolute(mediaUrl)) {
              filePath = path11.resolve(mediaUrl);
              logger.debug(`outbound: resolved relative path ${mediaUrl} -> ${filePath}`);
            } else {
              filePath = mediaUrl;
            }
            logger.debug(`outbound: local file path resolved filePath=${filePath}`);
          } else if (mediaUrl.startsWith("http://") || mediaUrl.startsWith("https://")) {
            logger.debug(`outbound: downloading remote mediaUrl=${mediaUrl.slice(0, 80)}...`);
            filePath = await downloadRemoteImageToTemp(mediaUrl, MEDIA_OUTBOUND_TEMP_DIR);
            logger.debug(`outbound: remote image downloaded to filePath=${filePath}`);
          } else {
            logger.warn(
              `outbound: unrecognized mediaUrl scheme, sending text only mediaUrl=${mediaUrl.slice(0, 80)}`
            );
            await sendMessageWeixin({ to: ctx.To, text, opts: {
              baseUrl: deps.baseUrl,
              token: deps.token,
              contextToken
            } });
            emitWeixinMessageSent({ to: ctx.To, content: text, success: true, accountId: deps.accountId });
            logger.info(`outbound: text sent to=${ctx.To}`);
            return;
          }
          await sendWeixinMediaFile({
            filePath,
            to: ctx.To,
            text,
            opts: { baseUrl: deps.baseUrl, token: deps.token, contextToken },
            cdnBaseUrl: deps.cdnBaseUrl
          });
          emitWeixinMessageSent({ to: ctx.To, content: text, success: true, accountId: deps.accountId });
          logger.info(`outbound: media sent OK to=${ctx.To}`);
        } else {
          logger.debug(`outbound: sending text message to=${ctx.To}`);
          await sendMessageWeixin({ to: ctx.To, text, opts: {
            baseUrl: deps.baseUrl,
            token: deps.token,
            contextToken
          } });
          emitWeixinMessageSent({ to: ctx.To, content: text, success: true, accountId: deps.accountId });
          logger.info(`outbound: text sent OK to=${ctx.To}`);
        }
      } catch (err) {
        emitWeixinMessageSent({ to: ctx.To, content: text, success: false, error: String(err), accountId: deps.accountId });
        logger.error(
          `outbound: FAILED to=${ctx.To} mediaUrl=${mediaUrl ?? "none"} err=${String(err)} stack=${err.stack ?? ""}`
        );
        throw err;
      }
    },
    onError: (err, info) => {
      deps.errLog(`weixin reply ${info.kind}: ${String(err)}`);
      const errMsg = err instanceof Error ? err.message : String(err);
      let notice;
      if (errMsg.includes("remote media download failed") || errMsg.includes("fetch")) {
        notice = `\u26A0\uFE0F \u5A92\u4F53\u6587\u4EF6\u4E0B\u8F7D\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u94FE\u63A5\u662F\u5426\u53EF\u8BBF\u95EE\u3002`;
      } else if (errMsg.includes("getUploadUrl") || errMsg.includes("CDN upload") || errMsg.includes("upload_param")) {
        notice = `\u26A0\uFE0F \u5A92\u4F53\u6587\u4EF6\u4E0A\u4F20\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002`;
      } else {
        notice = `\u26A0\uFE0F \u6D88\u606F\u53D1\u9001\u5931\u8D25\uFF1A${errMsg}`;
      }
      void sendWeixinErrorNotice({
        to: ctx.To,
        contextToken,
        message: notice,
        baseUrl: deps.baseUrl,
        token: deps.token,
        errLog: deps.errLog
      });
    }
  });
  logger.debug(`dispatchReplyFromConfig: starting agentId=${route.agentId ?? "(none)"}`);
  try {
    await deps.channelRuntime.reply.withReplyDispatcher({
      dispatcher,
      run: () => deps.channelRuntime.reply.dispatchReplyFromConfig({
        ctx: finalized,
        cfg: deps.config,
        dispatcher,
        replyOptions: { ...replyOptions, disableBlockStreaming: true }
      })
    });
    logger.debug(`dispatchReplyFromConfig: done agentId=${route.agentId ?? "(none)"}`);
  } catch (err) {
    logger.error(
      `dispatchReplyFromConfig: error agentId=${route.agentId ?? "(none)"} err=${String(err)}`
    );
    throw err;
  } finally {
    markDispatchIdle();
    logger.info(
      `debug-check: accountId=${deps.accountId} debug=${String(debug)} hasContextToken=${Boolean(contextToken)}`
    );
    if (debug && contextToken) {
      const dispatchDoneAt = Date.now();
      const eventTs = full.create_time_ms ?? 0;
      const platformDelay = eventTs > 0 ? `${receivedAt - eventTs}ms` : "N/A";
      const inboundProcessMs = (debugTs.preDispatch ?? receivedAt) - receivedAt;
      const aiMs = dispatchDoneAt - (debugTs.preDispatch ?? receivedAt);
      const totalTime = eventTs > 0 ? `${dispatchDoneAt - eventTs}ms` : `${dispatchDoneAt - receivedAt}ms`;
      if (debugDeliveries.length > 0) {
        debugTrace.push("\u2500\u2500 \u56DE\u590D \u2500\u2500");
        for (const d of debugDeliveries) {
          debugTrace.push(
            `\u2502 textLen=${d.textLen} media=${d.media}`,
            `\u2502 text="${d.preview}"`
          );
        }
        const firstTs = debugDeliveries[0].ts;
        debugTrace.push(`\u2502 deliver\u8017\u65F6: ${dispatchDoneAt - firstTs}ms`);
      } else {
        debugTrace.push("\u2500\u2500 \u56DE\u590D \u2500\u2500", "\u2502 (deliver\u672A\u6355\u83B7)");
      }
      debugTrace.push(
        "\u2500\u2500 \u8017\u65F6 \u2500\u2500",
        `\u251C \u5E73\u53F0\u2192\u63D2\u4EF6: ${platformDelay}`,
        `\u251C \u5165\u7AD9\u5904\u7406(auth+route+media): ${inboundProcessMs}ms (mediaDownload: ${mediaDownloadMs}ms)`,
        `\u251C AI\u751F\u6210+\u56DE\u590D: ${aiMs}ms`,
        `\u251C \u603B\u8017\u65F6: ${totalTime}`,
        `\u2514 eventTime: ${eventTs > 0 ? new Date(eventTs).toISOString() : "N/A"}`
      );
      const timingText = `\u23F1 Debug \u5168\u94FE\u8DEF
${debugTrace.join("\n")}`;
      logger.info(`debug-timing: sending to=${ctx.To}`);
      try {
        await sendMessageWeixin({
          to: ctx.To,
          text: timingText,
          opts: { baseUrl: deps.baseUrl, token: deps.token, contextToken }
        });
        logger.info(`debug-timing: sent OK`);
      } catch (debugErr) {
        logger.error(`debug-timing: send FAILED err=${String(debugErr)}`);
      }
    }
  }
}
var MEDIA_OUTBOUND_TEMP_DIR;
var init_process_message = __esm({
  "vendor/openclaw-runtime/mac-arm64/third-party-extensions/openclaw-weixin/src/messaging/process-message.ts"() {
    "use strict";
    init_api();
    init_types();
    init_accounts();
    init_pairing();
    init_upload();
    init_media_download();
    init_logger();
    init_redact();
    init_debug_mode();
    init_error_notice();
    init_outbound_hooks();
    init_inbound();
    init_send_media();
    init_markdown_filter();
    init_send();
    init_slash_commands();
    MEDIA_OUTBOUND_TEMP_DIR = path11.join(resolvePreferredOpenClawTmpDir2(), "weixin/media/outbound-temp");
  }
});

// vendor/openclaw-runtime/mac-arm64/third-party-extensions/openclaw-weixin/src/storage/sync-buf.ts
import fs8 from "fs";
import path12 from "path";
function resolveAccountsDir2() {
  return path12.join(resolveStateDir(), "openclaw-weixin", "accounts");
}
function getSyncBufFilePath(accountId) {
  return path12.join(resolveAccountsDir2(), `${accountId}.sync.json`);
}
function getLegacySyncBufDefaultJsonPath() {
  return path12.join(
    resolveStateDir(),
    "agents",
    "default",
    "sessions",
    ".openclaw-weixin-sync",
    "default.json"
  );
}
function readSyncBufFile(filePath) {
  try {
    const raw = fs8.readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw);
    if (typeof data.get_updates_buf === "string") {
      return data.get_updates_buf;
    }
  } catch {
  }
  return void 0;
}
function loadGetUpdatesBuf(filePath) {
  const value = readSyncBufFile(filePath);
  if (value !== void 0) return value;
  const accountId = path12.basename(filePath, ".sync.json");
  const rawId = deriveRawAccountId(accountId);
  if (rawId) {
    const compatPath = path12.join(resolveAccountsDir2(), `${rawId}.sync.json`);
    const compatValue = readSyncBufFile(compatPath);
    if (compatValue !== void 0) return compatValue;
  }
  return readSyncBufFile(getLegacySyncBufDefaultJsonPath());
}
function saveGetUpdatesBuf(filePath, getUpdatesBuf) {
  const dir = path12.dirname(filePath);
  fs8.mkdirSync(dir, { recursive: true });
  fs8.writeFileSync(filePath, JSON.stringify({ get_updates_buf: getUpdatesBuf }, null, 0), "utf-8");
}
var init_sync_buf = __esm({
  "vendor/openclaw-runtime/mac-arm64/third-party-extensions/openclaw-weixin/src/storage/sync-buf.ts"() {
    "use strict";
    init_accounts();
    init_state_dir();
  }
});

// vendor/openclaw-runtime/mac-arm64/third-party-extensions/openclaw-weixin/src/monitor/monitor.ts
var monitor_exports = {};
__export(monitor_exports, {
  monitorWeixinProvider: () => monitorWeixinProvider
});
async function monitorWeixinProvider(opts) {
  const {
    baseUrl,
    cdnBaseUrl,
    token,
    accountId,
    config,
    channelRuntime,
    abortSignal,
    longPollTimeoutMs,
    setStatus
  } = opts;
  const log = opts.runtime?.log ?? (() => {
  });
  const errLog = opts.runtime?.error ?? ((m) => log(m));
  const aLog = logger.withAccount(accountId);
  if (!channelRuntime) {
    const msg = "channelRuntime missing on monitor opts; gateway must inject ChannelGatewayContext.channelRuntime";
    aLog.error(msg);
    throw new Error(msg);
  }
  log(`weixin monitor started (${baseUrl}, account=${accountId})`);
  aLog.info(
    `Monitor started: baseUrl=${baseUrl} timeoutMs=${longPollTimeoutMs ?? DEFAULT_LONG_POLL_TIMEOUT_MS2}`
  );
  const syncFilePath = getSyncBufFilePath(accountId);
  aLog.debug(`syncFilePath: ${syncFilePath}`);
  const previousGetUpdatesBuf = loadGetUpdatesBuf(syncFilePath);
  let getUpdatesBuf = previousGetUpdatesBuf ?? "";
  if (previousGetUpdatesBuf) {
    log(`[weixin] resuming from previous sync buf (${getUpdatesBuf.length} bytes)`);
    aLog.debug(`Using previous get_updates_buf (${getUpdatesBuf.length} bytes)`);
  } else {
    log(`[weixin] no previous sync buf, starting fresh`);
    aLog.info(`No previous get_updates_buf found, starting fresh`);
  }
  const configManager = new WeixinConfigManager({ baseUrl, token }, log);
  let nextTimeoutMs = longPollTimeoutMs ?? DEFAULT_LONG_POLL_TIMEOUT_MS2;
  let consecutiveFailures = 0;
  while (!abortSignal?.aborted) {
    try {
      aLog.debug(
        `getUpdates: get_updates_buf=${getUpdatesBuf.substring(0, 50)}..., timeoutMs=${nextTimeoutMs}`
      );
      const resp = await getUpdates({
        baseUrl,
        token,
        get_updates_buf: getUpdatesBuf,
        timeoutMs: nextTimeoutMs
      });
      aLog.debug(
        `getUpdates response: ret=${resp.ret}, msgs=${resp.msgs?.length ?? 0}, get_updates_buf_length=${resp.get_updates_buf?.length ?? 0}`
      );
      if (resp.longpolling_timeout_ms != null && resp.longpolling_timeout_ms > 0) {
        nextTimeoutMs = resp.longpolling_timeout_ms;
        aLog.debug(`Updated next poll timeout: ${nextTimeoutMs}ms`);
      }
      const isApiError = resp.ret !== void 0 && resp.ret !== 0 || resp.errcode !== void 0 && resp.errcode !== 0;
      if (isApiError) {
        const isSessionExpired = resp.errcode === SESSION_EXPIRED_ERRCODE || resp.ret === SESSION_EXPIRED_ERRCODE;
        if (isSessionExpired) {
          pauseSession(accountId);
          const pauseMs = getRemainingPauseMs(accountId);
          errLog(
            `weixin getUpdates: session expired (errcode ${SESSION_EXPIRED_ERRCODE}), pausing bot for ${Math.ceil(pauseMs / 6e4)} min`
          );
          aLog.error(
            `getUpdates: session expired (errcode=${resp.errcode} ret=${resp.ret}), pausing all requests for ${Math.ceil(pauseMs / 6e4)} min`
          );
          consecutiveFailures = 0;
          await sleep(pauseMs, abortSignal);
          continue;
        }
        consecutiveFailures += 1;
        errLog(
          `weixin getUpdates failed: ret=${resp.ret} errcode=${resp.errcode} errmsg=${resp.errmsg ?? ""} (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES})`
        );
        aLog.error(
          `getUpdates failed: ret=${resp.ret} errcode=${resp.errcode} errmsg=${resp.errmsg} response=${redactBody(JSON.stringify(resp))}`
        );
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          errLog(
            `weixin getUpdates: ${MAX_CONSECUTIVE_FAILURES} consecutive failures, backing off 30s`
          );
          aLog.error(
            `getUpdates: ${MAX_CONSECUTIVE_FAILURES} consecutive failures, backing off 30s`
          );
          consecutiveFailures = 0;
          await sleep(BACKOFF_DELAY_MS, abortSignal);
        } else {
          await sleep(RETRY_DELAY_MS, abortSignal);
        }
        continue;
      }
      consecutiveFailures = 0;
      setStatus?.({ accountId, lastEventAt: Date.now() });
      if (resp.get_updates_buf != null && resp.get_updates_buf !== "") {
        saveGetUpdatesBuf(syncFilePath, resp.get_updates_buf);
        getUpdatesBuf = resp.get_updates_buf;
        aLog.debug(`Saved new get_updates_buf (${getUpdatesBuf.length} bytes)`);
      }
      const list = resp.msgs ?? [];
      for (const full of list) {
        aLog.info(
          `inbound message: from=${full.from_user_id} types=${full.item_list?.map((i) => i.type).join(",") ?? "none"}`
        );
        const now = Date.now();
        setStatus?.({ accountId, lastEventAt: now, lastInboundAt: now });
        const fromUserId = full.from_user_id ?? "";
        const cachedConfig = await configManager.getForUser(fromUserId, full.context_token);
        await processOneMessage(full, {
          accountId,
          config,
          channelRuntime,
          baseUrl,
          cdnBaseUrl,
          token,
          typingTicket: cachedConfig.typingTicket,
          log: opts.runtime?.log ?? (() => {
          }),
          errLog
        });
      }
    } catch (err) {
      if (abortSignal?.aborted) {
        aLog.info(`Monitor stopped (aborted)`);
        return;
      }
      consecutiveFailures += 1;
      errLog(
        `weixin getUpdates error (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}): ${String(err)}`
      );
      aLog.error(`getUpdates error: ${String(err)}, stack=${err.stack}`);
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        errLog(
          `weixin getUpdates: ${MAX_CONSECUTIVE_FAILURES} consecutive failures, backing off 30s`
        );
        aLog.error(
          `getUpdates: ${MAX_CONSECUTIVE_FAILURES} consecutive failures, backing off 30s`
        );
        consecutiveFailures = 0;
        await sleep(3e4, abortSignal);
      } else {
        await sleep(2e3, abortSignal);
      }
    }
  }
  aLog.info(`Monitor ended`);
}
function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new Error("aborted"));
      },
      { once: true }
    );
  });
}
var DEFAULT_LONG_POLL_TIMEOUT_MS2, MAX_CONSECUTIVE_FAILURES, BACKOFF_DELAY_MS, RETRY_DELAY_MS;
var init_monitor = __esm({
  "vendor/openclaw-runtime/mac-arm64/third-party-extensions/openclaw-weixin/src/monitor/monitor.ts"() {
    "use strict";
    init_api();
    init_config_cache();
    init_session_guard();
    init_process_message();
    init_sync_buf();
    init_logger();
    init_redact();
    DEFAULT_LONG_POLL_TIMEOUT_MS2 = 35e3;
    MAX_CONSECUTIVE_FAILURES = 3;
    BACKOFF_DELAY_MS = 3e4;
    RETRY_DELAY_MS = 2e3;
  }
});

// vendor/openclaw-runtime/mac-arm64/third-party-extensions/openclaw-weixin/index.ts
import { buildChannelConfigSchema } from "openclaw/plugin-sdk/channel-config-schema";

// vendor/openclaw-runtime/mac-arm64/third-party-extensions/openclaw-weixin/src/channel.ts
init_accounts();
init_api();
init_session_guard();
init_inbound();
init_logger();
import path13 from "path";
import { normalizeAccountId as normalizeAccountId2 } from "openclaw/plugin-sdk/account-id";
import { resolvePreferredOpenClawTmpDir as resolvePreferredOpenClawTmpDir3 } from "openclaw/plugin-sdk/infra-runtime";

// vendor/openclaw-runtime/mac-arm64/third-party-extensions/openclaw-weixin/src/auth/login-qr.ts
init_api();
init_accounts();
init_logger();
init_redact();
import { randomUUID } from "crypto";
var ACTIVE_LOGIN_TTL_MS = 5 * 6e4;
var QR_LONG_POLL_TIMEOUT_MS = 35e3;
var DEFAULT_ILINK_BOT_TYPE = "3";
var FIXED_BASE_URL = "https://ilinkai.weixin.qq.com";
var activeLogins = /* @__PURE__ */ new Map();
function isLoginFresh(login) {
  return Date.now() - login.startedAt < ACTIVE_LOGIN_TTL_MS;
}
function purgeExpiredLogins() {
  for (const [id, login] of activeLogins) {
    if (!isLoginFresh(login)) {
      activeLogins.delete(id);
    }
  }
}
function getLocalBotTokenList() {
  const accountIds = listIndexedWeixinAccountIds();
  const tokens = [];
  for (let i = accountIds.length - 1; i >= 0 && tokens.length < 10; i--) {
    const data = loadWeixinAccount(accountIds[i]);
    const token = data?.token?.trim();
    if (token) {
      tokens.push(token);
    }
  }
  return tokens;
}
async function fetchQRCode(apiBaseUrl, botType) {
  logger.info(`NewFetching QR code from: ${apiBaseUrl} bot_type=${botType}`);
  const localTokenList = getLocalBotTokenList();
  logger.info(`newfetchQRCode: local_token_list count=${localTokenList.length}`);
  const rawText = await apiPostFetch({
    baseUrl: apiBaseUrl,
    endpoint: `ilink/bot/get_bot_qrcode?bot_type=${encodeURIComponent(botType)}`,
    body: JSON.stringify({ local_token_list: localTokenList }),
    label: "fetchQRCode"
  });
  return JSON.parse(rawText);
}
async function readVerifyCodeFromStdin(prompt) {
  process.stdout.write(prompt);
  return new Promise((resolve) => {
    let input = "";
    const onData = (chunk) => {
      const str = chunk.toString();
      input += str;
      if (input.includes("\n")) {
        process.stdin.removeListener("data", onData);
        process.stdin.pause();
        resolve(input.trim());
      }
    };
    process.stdin.resume();
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", onData);
  });
}
async function pollQRStatus(apiBaseUrl, qrcode, verifyCode) {
  logger.debug(`Long-poll QR status from: ${apiBaseUrl} qrcode=***`);
  try {
    let endpoint = `ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrcode)}`;
    if (verifyCode) {
      endpoint += `&verify_code=${encodeURIComponent(verifyCode)}`;
    }
    const rawText = await apiGetFetch({
      baseUrl: apiBaseUrl,
      endpoint,
      timeoutMs: QR_LONG_POLL_TIMEOUT_MS,
      label: "pollQRStatus"
    });
    logger.debug(`pollQRStatus: body=${rawText.substring(0, 200)}`);
    return JSON.parse(rawText);
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      logger.debug(`pollQRStatus: client-side timeout after ${QR_LONG_POLL_TIMEOUT_MS}ms, returning wait`);
      return { status: "wait" };
    }
    logger.warn(`pollQRStatus: network/gateway error, will retry: ${String(err)}`);
    return { status: "wait" };
  }
}
async function displayQRCode(qrcodeUrl) {
  try {
    const qrterm = await import("qrcode-terminal");
    qrterm.default.generate(qrcodeUrl, { small: true });
    process.stdout.write(`\u82E5\u4E8C\u7EF4\u7801\u672A\u80FD\u663E\u793A\u6216\u65E0\u6CD5\u4F7F\u7528\uFF0C\u4F60\u53EF\u4EE5\u8BBF\u95EE\u4EE5\u4E0B\u94FE\u63A5\u4EE5\u7EE7\u7EED\uFF1A
`);
    process.stdout.write(`${qrcodeUrl}
`);
  } catch {
    process.stdout.write(`\u82E5\u4E8C\u7EF4\u7801\u672A\u80FD\u663E\u793A\u6216\u65E0\u6CD5\u4F7F\u7528\uFF0C\u4F60\u53EF\u4EE5\u8BBF\u95EE\u4EE5\u4E0B\u94FE\u63A5\u4EE5\u7EE7\u7EED\uFF1A
`);
    process.stdout.write(`${qrcodeUrl}
`);
  }
}
async function startWeixinLoginWithQr(opts) {
  const sessionKey = opts.accountId || randomUUID();
  purgeExpiredLogins();
  const existing = activeLogins.get(sessionKey);
  if (!opts.force && existing && isLoginFresh(existing) && existing.qrcodeUrl) {
    return {
      qrcodeUrl: existing.qrcodeUrl,
      message: "\u4E8C\u7EF4\u7801\u5DF2\u663E\u793A\uFF0C\u8BF7\u7528\u624B\u673A\u5FAE\u4FE1\u626B\u63CF\u3002",
      sessionKey
    };
  }
  try {
    const botType = opts.botType || DEFAULT_ILINK_BOT_TYPE;
    logger.info(`Starting Weixin login with bot_type=${botType}`);
    const qrResponse = await fetchQRCode(FIXED_BASE_URL, botType);
    logger.info(
      `QR code received, qrcode=${redactToken(qrResponse.qrcode)} imgContentLen=${qrResponse.qrcode_img_content?.length ?? 0}`
    );
    logger.info(`\u4E8C\u7EF4\u7801\u94FE\u63A5: ${qrResponse.qrcode_img_content}`);
    const login = {
      sessionKey,
      id: randomUUID(),
      qrcode: qrResponse.qrcode,
      qrcodeUrl: qrResponse.qrcode_img_content,
      startedAt: Date.now()
    };
    activeLogins.set(sessionKey, login);
    return {
      qrcodeUrl: qrResponse.qrcode_img_content,
      message: "\u7528\u624B\u673A\u5FAE\u4FE1\u626B\u63CF\u4EE5\u4E0B\u4E8C\u7EF4\u7801\uFF0C\u4EE5\u7EE7\u7EED\u8FDE\u63A5\uFF1A",
      sessionKey
    };
  } catch (err) {
    logger.error(`Failed to start Weixin login: ${String(err)}`);
    return {
      message: `Failed to start login: ${String(err)}`,
      sessionKey
    };
  }
}
var MAX_QR_REFRESH_COUNT = 3;
async function refreshQRCode(activeLogin, botType, qrRefreshCount, onScannedReset) {
  process.stdout.write(`
\u23F3 \u6B63\u5728\u5237\u65B0\u4E8C\u7EF4\u7801...(${qrRefreshCount}/${MAX_QR_REFRESH_COUNT})
`);
  logger.info(`waitForWeixinLogin: refreshing QR code (${qrRefreshCount}/${MAX_QR_REFRESH_COUNT})`);
  try {
    const qrResponse = await fetchQRCode(FIXED_BASE_URL, botType);
    activeLogin.qrcode = qrResponse.qrcode;
    activeLogin.qrcodeUrl = qrResponse.qrcode_img_content;
    activeLogin.startedAt = Date.now();
    onScannedReset();
    logger.info(`waitForWeixinLogin: new QR code obtained qrcode=${redactToken(qrResponse.qrcode)}`);
    process.stdout.write(`\u{1F504} \u4E8C\u7EF4\u7801\u5DF2\u66F4\u65B0\uFF0C\u8BF7\u91CD\u65B0\u626B\u63CF\u3002

`);
    await displayQRCode(qrResponse.qrcode_img_content);
    return { success: true };
  } catch (refreshErr) {
    logger.error(`waitForWeixinLogin: failed to refresh QR code: ${String(refreshErr)}`);
    return { success: false, message: `\u5237\u65B0\u4E8C\u7EF4\u7801\u5931\u8D25: ${String(refreshErr)}` };
  }
}
async function waitForWeixinLogin(opts) {
  let activeLogin = activeLogins.get(opts.sessionKey);
  if (!activeLogin) {
    logger.warn(`waitForWeixinLogin: no active login sessionKey=${opts.sessionKey}`);
    return {
      connected: false,
      message: "\u5F53\u524D\u6CA1\u6709\u8FDB\u884C\u4E2D\u7684\u767B\u5F55\uFF0C\u8BF7\u5148\u53D1\u8D77\u767B\u5F55\u3002"
    };
  }
  if (!isLoginFresh(activeLogin)) {
    logger.warn(`waitForWeixinLogin: login QR expired sessionKey=${opts.sessionKey}`);
    activeLogins.delete(opts.sessionKey);
    return {
      connected: false,
      message: "\u4E8C\u7EF4\u7801\u5DF2\u8FC7\u671F\uFF0C\u8BF7\u91CD\u65B0\u751F\u6210\u3002"
    };
  }
  const timeoutMs = Math.max(opts.timeoutMs ?? 48e4, 1e3);
  const deadline = Date.now() + timeoutMs;
  let scannedPrinted = false;
  let qrRefreshCount = 1;
  activeLogin.currentApiBaseUrl = FIXED_BASE_URL;
  logger.info("Starting to poll QR code status...");
  while (Date.now() < deadline) {
    try {
      const currentBaseUrl = activeLogin.currentApiBaseUrl ?? FIXED_BASE_URL;
      const statusResponse = await pollQRStatus(currentBaseUrl, activeLogin.qrcode, activeLogin.pendingVerifyCode);
      logger.debug(`pollQRStatus: status=${statusResponse.status} hasBotToken=${Boolean(statusResponse.bot_token)} hasBotId=${Boolean(statusResponse.ilink_bot_id)}`);
      activeLogin.status = statusResponse.status;
      switch (statusResponse.status) {
        case "wait":
          if (opts.verbose) {
            process.stdout.write(".");
          }
          break;
        case "scaned":
          if (activeLogin.pendingVerifyCode) {
            logger.info("verify code accepted, resuming polling");
            activeLogin.pendingVerifyCode = void 0;
          }
          if (!scannedPrinted) {
            process.stdout.write("\n\u6B63\u5728\u9A8C\u8BC1\n");
            scannedPrinted = true;
          }
          break;
        case "need_verifycode": {
          const verifyPrompt = activeLogin.pendingVerifyCode ? "\u274C \u4F60\u8F93\u5165\u7684\u6570\u5B57\u4E0D\u5339\u914D\uFF0C\u8BF7\u91CD\u65B0\u8F93\u5165\uFF1A" : "\u8F93\u5165\u624B\u673A\u5FAE\u4FE1\u663E\u793A\u7684\u6570\u5B57\uFF0C\u4EE5\u7EE7\u7EED\u8FDE\u63A5\uFF1A";
          const code = await readVerifyCodeFromStdin(verifyPrompt);
          activeLogin.pendingVerifyCode = code;
          continue;
        }
        case "expired": {
          qrRefreshCount++;
          if (qrRefreshCount > MAX_QR_REFRESH_COUNT) {
            logger.warn(
              `waitForWeixinLogin: QR expired ${MAX_QR_REFRESH_COUNT} times, giving up sessionKey=${opts.sessionKey}`
            );
            activeLogins.delete(opts.sessionKey);
            return {
              connected: false,
              message: "\u4E8C\u7EF4\u7801\u591A\u6B21\u5931\u6548\uFF0C\u8FDE\u63A5\u6D41\u7A0B\u5DF2\u505C\u6B62\u3002\u8BF7\u7A0D\u540E\u518D\u8BD5\u3002"
            };
          }
          process.stdout.write(`
\u23F3 \u4E8C\u7EF4\u7801\u5DF2\u8FC7\u671F\uFF0C\u6B63\u5728\u5237\u65B0...
`);
          const expiredRefreshResult = await refreshQRCode(
            activeLogin,
            opts.botType || DEFAULT_ILINK_BOT_TYPE,
            qrRefreshCount,
            () => {
              scannedPrinted = false;
            }
          );
          if (!expiredRefreshResult.success) {
            activeLogins.delete(opts.sessionKey);
            return { connected: false, message: expiredRefreshResult.message };
          }
          break;
        }
        case "verify_code_blocked": {
          logger.warn(
            `waitForWeixinLogin: verify code blocked, qrRefreshCount=${qrRefreshCount} sessionKey=${opts.sessionKey}`
          );
          process.stdout.write("\n\u26D4 \u591A\u6B21\u8F93\u5165\u9519\u8BEF\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5\u3002\n");
          activeLogin.pendingVerifyCode = void 0;
          qrRefreshCount++;
          if (qrRefreshCount > MAX_QR_REFRESH_COUNT) {
            logger.warn(
              `waitForWeixinLogin: verify_code_blocked and QR refresh limit reached, giving up sessionKey=${opts.sessionKey}`
            );
            activeLogins.delete(opts.sessionKey);
            return {
              connected: false,
              message: "\u591A\u6B21\u8F93\u5165\u9519\u8BEF\uFF0C\u8FDE\u63A5\u6D41\u7A0B\u5DF2\u505C\u6B62\u3002\u8BF7\u7A0D\u540E\u518D\u8BD5\u3002"
            };
          }
          const blockedRefreshResult = await refreshQRCode(
            activeLogin,
            opts.botType || DEFAULT_ILINK_BOT_TYPE,
            qrRefreshCount,
            () => {
              scannedPrinted = false;
            }
          );
          if (!blockedRefreshResult.success) {
            activeLogins.delete(opts.sessionKey);
            return { connected: false, message: blockedRefreshResult.message };
          }
          break;
        }
        case "binded_redirect": {
          logger.info(`waitForWeixinLogin: binded_redirect received, bot already bound sessionKey=${opts.sessionKey}`);
          process.stdout.write("\n\u2705 \u5DF2\u8FDE\u63A5\u8FC7\u6B64 OpenClaw\uFF0C\u65E0\u9700\u91CD\u590D\u8FDE\u63A5\u3002\n");
          activeLogins.delete(opts.sessionKey);
          return {
            connected: false,
            alreadyConnected: true,
            message: "\u5DF2\u8FDE\u63A5\u8FC7\u6B64 OpenClaw\uFF0C\u65E0\u9700\u91CD\u590D\u8FDE\u63A5\u3002"
          };
        }
        case "scaned_but_redirect": {
          const redirectHost = statusResponse.redirect_host;
          if (redirectHost) {
            const newBaseUrl = `https://${redirectHost}`;
            activeLogin.currentApiBaseUrl = newBaseUrl;
            logger.info(`waitForWeixinLogin: IDC redirect, switching polling host to ${redirectHost}`);
          } else {
            logger.warn(`waitForWeixinLogin: received scaned_but_redirect but redirect_host is missing, continuing with current host`);
          }
          break;
        }
        case "confirmed": {
          if (!statusResponse.ilink_bot_id) {
            activeLogins.delete(opts.sessionKey);
            logger.error("Login confirmed but ilink_bot_id missing from response");
            return {
              connected: false,
              message: "\u767B\u5F55\u5931\u8D25\uFF1A\u670D\u52A1\u5668\u672A\u8FD4\u56DE ilink_bot_id\u3002"
            };
          }
          activeLogin.botToken = statusResponse.bot_token;
          activeLogins.delete(opts.sessionKey);
          logger.info(
            `\u2705 Login confirmed! ilink_bot_id=${statusResponse.ilink_bot_id} ilink_user_id=${redactToken(statusResponse.ilink_user_id)}`
          );
          return {
            connected: true,
            botToken: statusResponse.bot_token,
            accountId: statusResponse.ilink_bot_id,
            baseUrl: statusResponse.baseurl,
            userId: statusResponse.ilink_user_id,
            message: "\u5DF2\u5C06\u6B64 OpenClaw \u8FDE\u63A5\u5230\u5FAE\u4FE1\u3002"
          };
        }
      }
    } catch (err) {
      logger.error(`Error polling QR status: ${String(err)}`);
      activeLogins.delete(opts.sessionKey);
      return {
        connected: false,
        message: `Login failed: ${String(err)}`
      };
    }
    await new Promise((r) => setTimeout(r, 1e3));
  }
  logger.warn(
    `waitForWeixinLogin: timed out waiting for QR scan sessionKey=${opts.sessionKey} timeoutMs=${timeoutMs}`
  );
  activeLogins.delete(opts.sessionKey);
  return {
    connected: false,
    message: "\u767B\u5F55\u8D85\u65F6\uFF0C\u8BF7\u91CD\u8BD5\u3002"
  };
}

// vendor/openclaw-runtime/mac-arm64/third-party-extensions/openclaw-weixin/src/channel.ts
init_outbound_hooks();
init_send_media();
init_send();
init_upload();
function isLocalFilePath(mediaUrl) {
  return !mediaUrl.includes("://");
}
function isRemoteUrl(mediaUrl) {
  return mediaUrl.startsWith("http://") || mediaUrl.startsWith("https://");
}
var MEDIA_OUTBOUND_TEMP_DIR2 = path13.join(resolvePreferredOpenClawTmpDir3(), "weixin/media/outbound-temp");
function resolveLocalPath(mediaUrl) {
  if (mediaUrl.startsWith("file://")) return new URL(mediaUrl).pathname;
  if (!path13.isAbsolute(mediaUrl)) return path13.resolve(mediaUrl);
  return mediaUrl;
}
function resolveOutboundAccountId(cfg, to) {
  const allIds = listWeixinAccountIds(cfg);
  if (allIds.length === 0) {
    throw new Error(
      `weixin: no accounts registered \u2014 run \`openclaw channels login --channel openclaw-weixin\``
    );
  }
  if (allIds.length === 1) {
    logger.info(`resolveOutboundAccountId: single account, using ${allIds[0]}`);
    return allIds[0];
  }
  const matched = findAccountIdsByContextToken(allIds, to);
  if (matched.length === 1) {
    logger.info(`resolveOutboundAccountId: matched accountId=${matched[0]} for to=${to}`);
    return matched[0];
  }
  if (matched.length > 1) {
    logger.warn(
      `resolveOutboundAccountId: ambiguous \u2014 ${matched.length} accounts matched for to=${to}: ${matched.join(", ")}`
    );
    throw new Error(
      `weixin: ambiguous account for to=${to} (${matched.length} accounts have active sessions with this recipient: ${matched.join(", ")}). Specify accountId in the delivery config to disambiguate.`
    );
  }
  throw new Error(
    `weixin: cannot determine which account to use for to=${to} (${allIds.length} accounts registered, none has an active session with this recipient). Specify accountId in the delivery config, or ensure the recipient has recently messaged the bot.`
  );
}
async function sendWeixinOutbound(params) {
  const account = resolveWeixinAccount(params.cfg, params.accountId);
  const aLog = logger.withAccount(account.accountId);
  assertSessionActive(account.accountId);
  if (!account.configured) {
    aLog.error(`sendWeixinOutbound: account not configured`);
    throw new Error("weixin not configured: please run `openclaw channels login --channel openclaw-weixin`");
  }
  if (!params.contextToken) {
    aLog.warn(`sendWeixinOutbound: contextToken missing for to=${params.to}, sending without context`);
  }
  const f = new StreamingMarkdownFilter();
  const rawText = params.text ?? "";
  let filteredText = f.feed(rawText) + f.flush();
  const sendingResult = await applyWeixinMessageSendingHook({
    to: params.to,
    text: filteredText,
    accountId: account.accountId
  });
  if (sendingResult.cancelled) {
    aLog.info(`sendWeixinOutbound: cancelled by message_sending hook to=${params.to}`);
    return { channel: "openclaw-weixin", messageId: "" };
  }
  filteredText = sendingResult.text;
  try {
    const result = await sendMessageWeixin({ to: params.to, text: filteredText, opts: {
      baseUrl: account.baseUrl,
      token: account.token,
      contextToken: params.contextToken
    } });
    emitWeixinMessageSent({ to: params.to, content: filteredText, success: true, accountId: account.accountId });
    return { channel: "openclaw-weixin", messageId: result.messageId };
  } catch (err) {
    emitWeixinMessageSent({ to: params.to, content: filteredText, success: false, error: String(err), accountId: account.accountId });
    throw err;
  }
}
var weixinPlugin = {
  id: "openclaw-weixin",
  meta: {
    id: "openclaw-weixin",
    label: "openclaw-weixin",
    selectionLabel: "openclaw-weixin (long-poll)",
    docsPath: "/channels/openclaw-weixin",
    docsLabel: "openclaw-weixin",
    blurb: "getUpdates long-poll upstream, sendMessage downstream; token auth.",
    order: 75
  },
  gatewayMethods: ["web.login.start", "web.login.wait"],
  configSchema: {
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {}
    }
  },
  capabilities: {
    chatTypes: ["direct"],
    media: true,
    blockStreaming: true
  },
  streaming: {
    blockStreamingCoalesceDefaults: {
      minChars: 200,
      idleMs: 3e3
    }
  },
  messaging: {
    targetResolver: {
      // Weixin user IDs always end with @im.wechat; treat as direct IDs, skip directory lookup.
      looksLikeId: (raw) => raw.endsWith("@im.wechat")
    }
  },
  agentPrompt: {
    messageToolHints: () => [
      "To send an image or file to the current user, use the message tool with action='send' and set 'media' to a local file path or a remote URL. You do not need to specify 'to' \u2014 the current conversation recipient is used automatically.",
      "When the user asks you to find an image from the web, use a web search or browser tool to find a suitable image URL, then send it using the message tool with 'media' set to that HTTPS image URL \u2014 do NOT download the image first.",
      "IMPORTANT: When generating or saving a file to send, always use an absolute path (e.g. /tmp/photo.png), never a relative path like ./photo.png. Relative paths cannot be resolved and the file will not be delivered.",
      "IMPORTANT: When creating a cron job (scheduled task) for the current Weixin user, you MUST set delivery.to to the user's Weixin ID (the xxx@im.wechat address from the current conversation) AND set delivery.accountId to the current AccountId. Without an explicit 'to', the cron delivery will fail with 'requires target'. Without an explicit 'accountId', the message may be sent from the wrong bot account. Example: delivery: { mode: 'announce', channel: 'openclaw-weixin', to: '<current_user_id@im.wechat>', accountId: '<current_AccountId>' }.",
      "IMPORTANT: When outputting a MEDIA: directive to send a file, the MEDIA: tag MUST be on its own line \u2014 never inline with other text. Correct:\nSome text here\nMEDIA:/path/to/file.mp4\nIncorrect: Some text here MEDIA:/path/to/file.mp4"
    ]
  },
  reload: { configPrefixes: ["channels.openclaw-weixin"] },
  config: {
    listAccountIds: (cfg) => listWeixinAccountIds(cfg),
    resolveAccount: (cfg, accountId) => resolveWeixinAccount(cfg, accountId),
    isConfigured: (account) => account.configured,
    describeAccount: (account) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: account.configured
    })
  },
  outbound: {
    deliveryMode: "direct",
    textChunkLimit: 4e3,
    sendText: async (ctx) => {
      const accountId = ctx.accountId || resolveOutboundAccountId(ctx.cfg, ctx.to);
      const result = await sendWeixinOutbound({
        cfg: ctx.cfg,
        to: ctx.to,
        text: ctx.text,
        accountId,
        contextToken: getContextToken(accountId, ctx.to)
      });
      return result;
    },
    sendMedia: async (ctx) => {
      const accountId = ctx.accountId || resolveOutboundAccountId(ctx.cfg, ctx.to);
      const account = resolveWeixinAccount(ctx.cfg, accountId);
      const aLog = logger.withAccount(account.accountId);
      assertSessionActive(account.accountId);
      if (!account.configured) {
        aLog.error(`sendMedia: account not configured`);
        throw new Error(
          "weixin not configured: please run `openclaw channels login --channel openclaw-weixin`"
        );
      }
      const mediaUrl = ctx.mediaUrl;
      let text = ctx.text ?? "";
      const sendingResult = await applyWeixinMessageSendingHook({
        to: ctx.to,
        text,
        accountId: account.accountId,
        mediaUrl
      });
      if (sendingResult.cancelled) {
        aLog.info(`sendMedia: cancelled by message_sending hook to=${ctx.to}`);
        return { channel: "openclaw-weixin", messageId: "" };
      }
      text = sendingResult.text;
      if (mediaUrl && (isLocalFilePath(mediaUrl) || isRemoteUrl(mediaUrl))) {
        let filePath;
        if (isLocalFilePath(mediaUrl)) {
          filePath = resolveLocalPath(mediaUrl);
          aLog.debug(`sendMedia: uploading local file ${filePath}`);
        } else {
          aLog.debug(`sendMedia: downloading remote mediaUrl=${mediaUrl.slice(0, 80)}...`);
          filePath = await downloadRemoteImageToTemp(mediaUrl, MEDIA_OUTBOUND_TEMP_DIR2);
          aLog.debug(`sendMedia: remote image downloaded to ${filePath}`);
        }
        const contextToken2 = getContextToken(account.accountId, ctx.to);
        try {
          const result = await sendWeixinMediaFile({
            filePath,
            to: ctx.to,
            text,
            opts: { baseUrl: account.baseUrl, token: account.token, contextToken: contextToken2 },
            cdnBaseUrl: account.cdnBaseUrl
          });
          emitWeixinMessageSent({ to: ctx.to, content: text, success: true, accountId: account.accountId });
          return { channel: "openclaw-weixin", messageId: result.messageId };
        } catch (err) {
          emitWeixinMessageSent({ to: ctx.to, content: text, success: false, error: String(err), accountId: account.accountId });
          throw err;
        }
      }
      const contextToken = getContextToken(account.accountId, ctx.to);
      try {
        const result = await sendMessageWeixin({ to: ctx.to, text, opts: {
          baseUrl: account.baseUrl,
          token: account.token,
          contextToken
        } });
        emitWeixinMessageSent({ to: ctx.to, content: text, success: true, accountId: account.accountId });
        return { channel: "openclaw-weixin", messageId: result.messageId };
      } catch (err) {
        emitWeixinMessageSent({ to: ctx.to, content: text, success: false, error: String(err), accountId: account.accountId });
        throw err;
      }
    }
  },
  status: {
    defaultRuntime: {
      accountId: "",
      lastError: null,
      lastInboundAt: null,
      lastOutboundAt: null
    },
    collectStatusIssues: () => [],
    buildChannelSummary: ({ snapshot }) => ({
      configured: snapshot.configured ?? false,
      lastError: snapshot.lastError ?? null,
      lastInboundAt: snapshot.lastInboundAt ?? null,
      lastOutboundAt: snapshot.lastOutboundAt ?? null
    }),
    buildAccountSnapshot: ({ account, runtime }) => ({
      ...runtime,
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: account.configured
    })
  },
  auth: {
    login: async ({ cfg, accountId, verbose, runtime }) => {
      const account = resolveWeixinAccount(cfg, accountId);
      const log = (msg) => {
        runtime?.log?.(msg);
      };
      log(`\u6B63\u5728\u542F\u52A8...`);
      const startResult = await startWeixinLoginWithQr({
        accountId: account.accountId,
        apiBaseUrl: account.baseUrl,
        botType: DEFAULT_ILINK_BOT_TYPE,
        verbose: Boolean(verbose)
      });
      if (!startResult.qrcodeUrl) {
        logger.warn(
          `auth.login: failed to get QR code accountId=${account.accountId} message=${startResult.message}`
        );
        log(startResult.message);
        throw new Error(startResult.message);
      }
      log(`
\u7528\u624B\u673A\u5FAE\u4FE1\u626B\u63CF\u4EE5\u4E0B\u4E8C\u7EF4\u7801\uFF0C\u4EE5\u7EE7\u7EED\u8FDE\u63A5\uFF1A
`);
      await displayQRCode(startResult.qrcodeUrl);
      const loginTimeoutMs = 48e4;
      log(`
\u6B63\u5728\u7B49\u5F85\u64CD\u4F5C...
`);
      const waitResult = await waitForWeixinLogin({
        sessionKey: startResult.sessionKey,
        apiBaseUrl: account.baseUrl,
        timeoutMs: loginTimeoutMs,
        verbose: Boolean(verbose),
        botType: DEFAULT_ILINK_BOT_TYPE
      });
      if (waitResult.connected && waitResult.botToken && waitResult.accountId) {
        try {
          const normalizedId = normalizeAccountId2(waitResult.accountId);
          saveWeixinAccount(normalizedId, {
            token: waitResult.botToken,
            baseUrl: waitResult.baseUrl,
            userId: waitResult.userId
          });
          registerWeixinAccountId(normalizedId);
          if (waitResult.userId) {
            clearStaleAccountsForUserId(normalizedId, waitResult.userId, clearContextTokensForAccount);
          }
          void triggerWeixinChannelReload();
          log(`
\u5DF2\u5C06\u6B64 OpenClaw \u8FDE\u63A5\u5230\u5FAE\u4FE1\u3002`);
        } catch (err) {
          logger.error(
            `auth.login: failed to save account data accountId=${waitResult.accountId} err=${String(err)}`
          );
          log(`\u26A0\uFE0F  \u4FDD\u5B58\u8D26\u53F7\u6570\u636E\u5931\u8D25: ${String(err)}`);
        }
      } else if (waitResult.alreadyConnected) {
        logger.info(
          `auth.login: bot already connected to this OpenClaw accountId=${account.accountId}`
        );
      } else {
        logger.warn(
          `auth.login: login did not complete accountId=${account.accountId} message=${waitResult.message}`
        );
        throw new Error(waitResult.message);
      }
    }
  },
  gateway: {
    startAccount: async (ctx) => {
      logger.debug(`startAccount entry`);
      if (!ctx) {
        logger.warn(`gateway.startAccount: called with undefined ctx, skipping`);
        return;
      }
      const account = ctx.account;
      const aLog = logger.withAccount(account.accountId);
      aLog.debug(`about to call monitorWeixinProvider`);
      restoreContextTokens(account.accountId);
      aLog.info(`starting weixin webhook`);
      ctx.setStatus?.({
        accountId: account.accountId,
        running: true,
        lastStartAt: Date.now(),
        lastEventAt: Date.now()
      });
      if (!account.configured) {
        aLog.error(`account not configured`);
        ctx.log?.error?.(
          `[${account.accountId}] weixin not logged in \u2014 run: openclaw channels login --channel openclaw-weixin`
        );
        ctx.setStatus?.({ accountId: account.accountId, running: false });
        throw new Error("weixin not configured: missing token");
      }
      ctx.log?.info?.(`[${account.accountId}] starting weixin provider (${DEFAULT_BASE_URL})`);
      try {
        const resp = await notifyStart({
          baseUrl: account.baseUrl,
          token: account.token
        });
        if (resp.ret !== void 0 && resp.ret !== 0) {
          aLog.warn(`notifyStart: ret=${resp.ret} errmsg=${resp.errmsg ?? ""}`);
        }
      } catch (err) {
        aLog.warn(`notifyStart failed during startup (ignored): ${String(err)}`);
      }
      const logPath = aLog.getLogFilePath();
      ctx.log?.info?.(`[${account.accountId}] weixin logs: ${logPath}`);
      if (!ctx.channelRuntime) {
        const msg = `ctx.channelRuntime missing \u2014 host too old or plugin SDK contract violated`;
        aLog.error(msg);
        ctx.log?.error?.(`[${account.accountId}] ${msg}`);
        ctx.setStatus?.({ accountId: account.accountId, running: false });
        throw new Error(msg);
      }
      const { monitorWeixinProvider: monitorWeixinProvider2 } = await Promise.resolve().then(() => (init_monitor(), monitor_exports));
      return monitorWeixinProvider2({
        baseUrl: account.baseUrl,
        cdnBaseUrl: account.cdnBaseUrl,
        token: account.token,
        accountId: account.accountId,
        config: ctx.cfg,
        runtime: ctx.runtime,
        channelRuntime: ctx.channelRuntime,
        abortSignal: ctx.abortSignal,
        setStatus: ctx.setStatus
      });
    },
    stopAccount: async (ctx) => {
      const account = ctx.account;
      const aLog = logger.withAccount(account.accountId);
      if (!account.configured || !account.token?.trim()) {
        aLog.debug(`gateway.stopAccount: skip notifyStop (not configured or no token)`);
        return;
      }
      try {
        const resp = await notifyStop({
          baseUrl: account.baseUrl,
          token: account.token
        });
        if (resp.ret !== void 0 && resp.ret !== 0) {
          aLog.warn(`notifyStop: ret=${resp.ret} errmsg=${resp.errmsg ?? ""}`);
        }
      } catch (err) {
        aLog.warn(`notifyStop failed during shutdown (ignored): ${String(err)}`);
      }
    },
    loginWithQrStart: async ({ accountId, force, verbose }) => {
      const savedBaseUrl = accountId ? loadWeixinAccount(accountId)?.baseUrl?.trim() : "";
      const result = await startWeixinLoginWithQr({
        accountId: accountId ?? void 0,
        apiBaseUrl: savedBaseUrl || DEFAULT_BASE_URL,
        botType: DEFAULT_ILINK_BOT_TYPE,
        force,
        verbose
      });
      return {
        qrDataUrl: result.qrcodeUrl,
        message: result.message,
        sessionKey: result.sessionKey
      };
    },
    loginWithQrWait: async (params) => {
      const sessionKey = params.sessionKey || params.accountId || "";
      const savedBaseUrl = params.accountId ? loadWeixinAccount(params.accountId)?.baseUrl?.trim() : "";
      const result = await waitForWeixinLogin({
        sessionKey,
        apiBaseUrl: savedBaseUrl || DEFAULT_BASE_URL,
        timeoutMs: params.timeoutMs
      });
      if (result.connected && result.botToken && result.accountId) {
        try {
          const normalizedId = normalizeAccountId2(result.accountId);
          saveWeixinAccount(normalizedId, {
            token: result.botToken,
            baseUrl: result.baseUrl,
            userId: result.userId
          });
          registerWeixinAccountId(normalizedId);
          if (result.userId) {
            clearStaleAccountsForUserId(normalizedId, result.userId, clearContextTokensForAccount);
          }
          triggerWeixinChannelReload();
          logger.info(`loginWithQrWait: saved account data for accountId=${normalizedId}`);
        } catch (err) {
          logger.error(`loginWithQrWait: failed to save account data err=${String(err)}`);
        }
      }
      return {
        connected: result.connected,
        message: result.message,
        accountId: result.accountId
      };
    }
  }
};

// vendor/openclaw-runtime/mac-arm64/third-party-extensions/openclaw-weixin/src/compat.ts
init_logger();
var SUPPORTED_HOST_MIN = "2026.3.22";
function parseOpenClawVersion(version) {
  const base = version.trim().split("-")[0];
  const parts = base.split(".");
  if (parts.length !== 3) return null;
  const [year, month, day] = parts.map(Number);
  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) return null;
  return { year, month, day };
}
function compareVersions(a, b) {
  for (const key of ["year", "month", "day"]) {
    if (a[key] < b[key]) return -1;
    if (a[key] > b[key]) return 1;
  }
  return 0;
}
function isHostVersionSupported(hostVersion) {
  const host = parseOpenClawVersion(hostVersion);
  if (!host) return false;
  const min = parseOpenClawVersion(SUPPORTED_HOST_MIN);
  return compareVersions(host, min) >= 0;
}
function assertHostCompatibility(hostVersion) {
  if (!hostVersion || hostVersion === "unknown") {
    logger.warn(
      `[compat] Could not determine host OpenClaw version; skipping compatibility check.`
    );
    return;
  }
  if (isHostVersionSupported(hostVersion)) {
    logger.info(`[compat] Host OpenClaw ${hostVersion} >= ${SUPPORTED_HOST_MIN}, OK.`);
    return;
  }
  throw new Error(
    `This version of openclaw-weixin requires OpenClaw >=${SUPPORTED_HOST_MIN}, but found ${hostVersion}. Please upgrade OpenClaw, or install the compatible track for older hosts:
  npx @tencent-weixin/openclaw-weixin-cli install`
  );
}

// vendor/openclaw-runtime/mac-arm64/third-party-extensions/openclaw-weixin/src/config/config-schema.ts
init_accounts();
import { z } from "zod";
var weixinAccountSchema = z.object({
  name: z.string().optional(),
  enabled: z.boolean().optional(),
  baseUrl: z.string().default(DEFAULT_BASE_URL),
  cdnBaseUrl: z.string().default(CDN_BASE_URL),
  routeTag: z.number().optional()
});
var WeixinConfigSchema = weixinAccountSchema.extend({
  accounts: z.record(z.string(), weixinAccountSchema).optional(),
  /** ISO 8601; bumped on each successful login to refresh gateway config from disk. */
  channelConfigUpdatedAt: z.string().optional()
});

// vendor/openclaw-runtime/mac-arm64/third-party-extensions/openclaw-weixin/index.ts
var openclaw_weixin_default = {
  id: "openclaw-weixin",
  name: "Weixin",
  description: "Weixin channel (getUpdates long-poll + sendMessage)",
  configSchema: buildChannelConfigSchema(WeixinConfigSchema),
  register(api) {
    assertHostCompatibility(api.runtime?.version);
    api.registerChannel({ plugin: weixinPlugin });
  }
};
export {
  openclaw_weixin_default as default
};
