// Bundle entry for tests/box-store-backups.test.mjs: the restore before the
// host starts, the host's start that runs it, and the bucket allowlist.
export { restoreBoxStoreFromEnv, spawnBoxCopyIn, BOX_STORE_RESTORE_MARKER, BOX_STORE_RESTORE_MAX_ATTEMPTS } from "../../source/host/box/box-store-restore.js";
export { main } from "../../source/host/main.js";
export { agentStoreBucketHosts, createAgentStorePresignedUrlValidatorForBackend } from "../../source/packages/agent-store-sync/presigned-url.js";
