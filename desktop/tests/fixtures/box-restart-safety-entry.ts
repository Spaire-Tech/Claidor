// Bundle entry for tests/box-restart-safety.test.mjs: what a box does in the
// first minutes after it starts (its first credential, its first backup) and
// a connector sign-in started before a restart.
export { SandInferenceCredentialRenewer, FIRST_CREDENTIAL_FAST_RETRIES } from "../../source/host/extensions/auth/credential-renewer.js";
export { createBoxStoreSyncService } from "../../source/host/extensions/box-store-sync/box-store-sync-service.js";
export { persistPendingSignInsAt, PENDING_SIGN_IN_LOST_MESSAGE } from "../../source/shared/node/mcp/pending-sign-ins-file.js";
export { rememberVendorMcpPendingAuth, takeVendorMcpPendingAuth } from "../../source/shared/node/vendor-mcp/oauth.js";
