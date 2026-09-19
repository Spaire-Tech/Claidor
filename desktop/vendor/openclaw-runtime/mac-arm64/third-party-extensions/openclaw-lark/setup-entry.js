"use strict";
// Lightweight setup entry for deferred loading (patched by LobsterAI).
// Only static channel metadata - no heavy dependencies.
// The full plugin (index.js) loads after the HTTP server starts listening.
const DEFAULT_ACCOUNT_ID = 'default';
function getFeishuSection(cfg) {
  return (cfg && cfg.channels && cfg.channels.feishu) || {};
}
function getAccountIds(cfg) {
  const section = getFeishuSection(cfg);
  const accounts = section.accounts && typeof section.accounts === 'object' ? section.accounts : undefined;
  const ids = accounts ? Object.keys(accounts) : [];
  if (ids.length === 0) return [DEFAULT_ACCOUNT_ID];
  if (!ids.includes(DEFAULT_ACCOUNT_ID) && section.appId && section.appSecret) {
    return [DEFAULT_ACCOUNT_ID, ...ids];
  }
  return ids;
}
function baseConfig(section) {
  const copy = { ...section };
  delete copy.accounts;
  return copy;
}
function resolveAccount(cfg, accountId) {
  const requestedId = accountId || DEFAULT_ACCOUNT_ID;
  const section = getFeishuSection(cfg);
  const accountOverride = requestedId !== DEFAULT_ACCOUNT_ID && section.accounts
    ? section.accounts[requestedId]
    : undefined;
  const merged = { ...baseConfig(section), ...(accountOverride || {}) };
  const configured = Boolean(merged.appId && merged.appSecret);
  return {
    accountId: requestedId,
    enabled: Boolean(merged.enabled ?? configured),
    configured,
    name: merged.name,
    appId: merged.appId,
    appSecret: merged.appSecret,
    brand: merged.domain || 'feishu',
    config: merged,
  };
}
exports.plugin = {
  // id must match the plugin manifest id (openclaw-lark), NOT the channel id (feishu).
  // The loader checks: setupEntry.plugin.id === record.id (the manifest id).
  // The full plugin (index.js) registers the channel with id 'feishu' during deferred reload.
  id: 'openclaw-lark',
  meta: {
    id: 'feishu',
    label: 'Feishu',
    selectionLabel: 'Lark/Feishu (\u98DE\u4E66)',
    docsPath: '/channels/feishu',
    docsLabel: 'feishu',
    blurb: '\u98DE\u4E66/Lark enterprise messaging.',
    aliases: ['lark'],
    order: 70,
  },
  pairing: {
    idLabel: 'feishuUserId',
    normalizeAllowEntry: (entry) => entry.replace(/^(feishu|user|open_id):/i, ''),
  },
  capabilities: {
    chatTypes: ['direct', 'group'],
    media: true,
    reactions: true,
    threads: true,
    polls: false,
    nativeCommands: true,
    blockStreaming: true,
  },
  config: {
    listAccountIds: getAccountIds,
    resolveAccount,
    defaultAccountId: (cfg) => getAccountIds(cfg)[0],
    isConfigured: (account) => Boolean(account && account.configured),
    describeAccount: (account) => ({
      accountId: account.accountId,
      enabled: account.enabled,
      configured: account.configured,
      name: account.name,
      appId: account.appId,
      brand: account.brand,
    }),
  },
  reload: { configPrefixes: ['channels.feishu'] },
};
