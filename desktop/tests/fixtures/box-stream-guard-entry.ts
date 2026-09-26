// Bundle entry for tests/box-stream-guard.test.mjs: the host's stream
// guard, the local connector's stream pieces and the coordinator's rewrite.
export { startBoxStreamGuard, startBoxStreamGuardFromEnv, readBoxStreamNetworkToken, isBoxStreamRequestAllowed, BOX_STREAM_ROUTES } from "../../source/host/box-stream-guard.js";
export { localDockerVncProxy, readOrCreateStreamToken, streamTokenFingerprint, localDockerContainerNeedsReplace, LOCAL_DOCKER_SCHEMA_VERSION, LOCAL_DOCKER_STREAM_PUBLISH } from "../../source/electron-main/box/local-docker-host-connector.js";
export { proxifyBoxVncUrl, proxifyForeverBoxStatus } from "../../source/node-agent-coordinator/gateway/box-vnc-proxy.js";
export { PERSISTED_GATEWAY_DESCRIPTOR_VERSION } from "../../source/electron-main/box/gateway-descriptor-cache.js";
