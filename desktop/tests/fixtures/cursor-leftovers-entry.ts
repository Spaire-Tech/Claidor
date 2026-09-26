// Bundle entry for tests/cursor-leftovers.test.mjs: the defaults an
// unpackaged run falls back to, the DevTools gate, and the switch that keeps
// the Statsig client from logging exposures to Cursor.
export { getConfiguredBackendUrl, DEFAULT_CURSOR_BACKEND_URL, DEFAULT_SAND_BACKEND_URL } from "../../source/shared/node/cursor-token.js";
export { getAuthWebsiteUrl, DEFAULT_CURSOR_WEBSITE_URL } from "../../source/electron-main/account/cursor-auth.js";
export { createDevToolsGate } from "../../source/electron-main/devtools-gate.js";
export { isConnectServed } from "../../source/shared/cloud-agents-availability.js";
export { parseSandDeepLink, SAND_HTTPS_DEEP_LINK_ORIGIN } from "../../source/shared/deep-link.js";
export { SIMEON_FEATURE_GATE_DEFAULTS } from "../../source/shared/node/experiments/simeon-gate-defaults.js";
