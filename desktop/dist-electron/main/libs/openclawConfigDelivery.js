"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CONFIG_DELIVERY_FALLBACK_REASON_PREFIX = exports.OpenClawConfigDeliveryMode = void 0;
exports.__resetOpenClawConfigDeliveryStateForTests = __resetOpenClawConfigDeliveryStateForTests;
exports.stripPluginIndexManagedKeysFromRawConfig = stripPluginIndexManagedKeysFromRawConfig;
exports.deliverOpenClawConfigToGateway = deliverOpenClawConfigToGateway;
const constants_1 = require("../../shared/openclawEngine/constants");
/**
 * Reliable delivery of openclaw.json changes to a RUNNING gateway.
 *
 * Background: the hot-reload sync path used to write the config file and rely
 * entirely on the gateway's own file watcher to pick the change up. The watcher
 * can miss writes that land right after a gateway (re)start, leaving the
 * gateway validating against a stale in-memory config ("model not allowed"
 * on sessions.patch) until the next restart.
 *
 * This module pushes the already-written file content through the gateway's
 * `config.set` RPC instead. The gateway's reload evaluation diffs against its
 * LIVE (last-applied) config — not the file — so re-sending content that is
 * already on disk still hot-applies exactly what the live config is missing,
 * and is a harmless no-op when the watcher already caught up. The RPC response
 * is a positive ack: the reload evaluation completes before `ok` is returned.
 *
 * See specs/bugfixes/openclaw-config-hot-reload-delivery/.
 */
exports.OpenClawConfigDeliveryMode = {
    /** Gateway acked config.set — the live config now matches the file. */
    Rpc: 'rpc',
    /** Gateway not running; the file on disk will be read at next start. */
    Skipped: 'skipped',
    /** RPC path failed; a deferred gateway restart guarantees convergence. */
    Fallback: 'fallback',
    /**
     * Gateway rejected the payload as invalid config. A restart cannot fix an
     * invalid payload (and would interrupt the user for nothing), so no restart
     * is scheduled — the failure is surfaced as an error instead.
     */
    Rejected: 'rejected',
};
/**
 * Reason prefix for deferred restarts scheduled by the fallback path. Their
 * only goal is "make the gateway load the already-on-disk config", so a
 * gateway self-restart satisfies them without a supervisor respawn.
 */
exports.CONFIG_DELIVERY_FALLBACK_REASON_PREFIX = 'config-delivery-fallback:';
const CONFIG_GET_TIMEOUT_MS = 10_000;
const CONFIG_SET_TIMEOUT_MS = 15_000;
/** Rate limit for fallback-triggered auto restarts, guarding against loops. */
const FALLBACK_RESTART_MIN_INTERVAL_MS = 10 * 60 * 1000;
let lastFallbackRestartAtMs = 0;
function __resetOpenClawConfigDeliveryStateForTests() {
    lastFallbackRestartAtMs = 0;
}
const isBaseHashConflict = (error) => {
    const message = error instanceof Error ? error.message : String(error);
    return /base hash|changed since last load/i.test(message);
};
const isConfigValidationRejection = (error) => {
    const message = error instanceof Error ? error.message : String(error);
    return /invalid config|INVALID_REQUEST/i.test(message);
};
/**
 * Remove `plugins` keys the gateway's `config.set` schema rejects (they are
 * owned by the plugin index, not the config file — see
 * OPENCLAW_PLUGIN_INDEX_MANAGED_KEYS). The on-disk file tolerates them via a
 * load-time migration, but the RPC validation is strict, so leaving them in
 * turns every hot delivery into a guaranteed fallback restart. Returns the
 * input unchanged when there is nothing to strip or it is not JSON.
 */
function stripPluginIndexManagedKeysFromRawConfig(raw) {
    try {
        const config = JSON.parse(raw);
        const plugins = config?.plugins;
        if (typeof plugins !== 'object' || plugins === null || Array.isArray(plugins)) {
            return raw;
        }
        const pluginsRecord = plugins;
        const managedKeys = constants_1.OPENCLAW_PLUGIN_INDEX_MANAGED_KEYS;
        if (!managedKeys.some((key) => key in pluginsRecord)) {
            return raw;
        }
        const cleaned = Object.fromEntries(Object.entries(pluginsRecord).filter(([key]) => !managedKeys.includes(key)));
        if (Object.keys(cleaned).length === 0) {
            delete config.plugins;
        }
        else {
            config.plugins = cleaned;
        }
        return `${JSON.stringify(config, null, 2)}\n`;
    }
    catch {
        return raw;
    }
}
const describeError = (error) => {
    const message = error instanceof Error ? error.message : String(error);
    return message.slice(0, 200);
};
async function requestConfigSet(client, raw) {
    const snapshot = await client.request('config.get', {}, { timeoutMs: CONFIG_GET_TIMEOUT_MS });
    const baseHash = typeof snapshot?.hash === 'string' && snapshot.hash.trim()
        ? snapshot.hash.trim()
        : undefined;
    await client.request('config.set', { raw, ...(baseHash ? { baseHash } : {}) }, { timeoutMs: CONFIG_SET_TIMEOUT_MS });
}
/**
 * Push the current config file content to a running gateway and return how the
 * delivery concluded. Never throws: transient failures degrade to the
 * deferred-restart fallback, while invalid payloads return `Rejected` so the
 * caller can surface the configuration error without restarting in a loop.
 */
async function deliverOpenClawConfigToGateway(input) {
    const now = input.nowMs ?? Date.now;
    const startedAtMs = now();
    const finish = (mode, detail, restartScheduled = false) => {
        const result = {
            mode,
            detail,
            restartScheduled,
            elapsedMs: now() - startedAtMs,
        };
        const log = mode === exports.OpenClawConfigDeliveryMode.Rejected
            ? console.error
            : mode === exports.OpenClawConfigDeliveryMode.Fallback ? console.warn : console.log;
        log(`[ConfigDelivery] mode=${result.mode} reason=${input.reason} detail=${result.detail}`
            + ` restartScheduled=${result.restartScheduled} elapsedMs=${result.elapsedMs}`);
        return result;
    };
    const fallback = (detail) => {
        const sinceLast = now() - lastFallbackRestartAtMs;
        if (sinceLast < FALLBACK_RESTART_MIN_INTERVAL_MS) {
            return finish(exports.OpenClawConfigDeliveryMode.Fallback, `${detail}; restart rate-limited (${Math.round(sinceLast / 1000)}s since last)`, false);
        }
        lastFallbackRestartAtMs = now();
        input.scheduleDeferredRestart(`${exports.CONFIG_DELIVERY_FALLBACK_REASON_PREFIX}${input.reason}`);
        return finish(exports.OpenClawConfigDeliveryMode.Fallback, detail, true);
    };
    if (input.gatewayPhase !== constants_1.OpenClawEnginePhase.Running
        && input.gatewayPhase !== constants_1.OpenClawEnginePhase.Starting) {
        return finish(exports.OpenClawConfigDeliveryMode.Skipped, `gateway not running (phase=${input.gatewayPhase}); config loads at next start`);
    }
    let raw;
    try {
        raw = input.readConfigFile();
    }
    catch (error) {
        return fallback(`config file read failed: ${describeError(error)}`);
    }
    if (!raw.trim()) {
        return fallback('config file is empty');
    }
    raw = stripPluginIndexManagedKeysFromRawConfig(raw);
    let client = null;
    try {
        client = await input.ensureRpcClient();
    }
    catch (error) {
        return fallback(`gateway client unavailable: ${describeError(error)}`);
    }
    if (!client) {
        return fallback('gateway client unavailable');
    }
    try {
        await requestConfigSet(client, raw);
        return finish(exports.OpenClawConfigDeliveryMode.Rpc, 'config.set acked');
    }
    catch (error) {
        if (!isBaseHashConflict(error)) {
            if (isConfigValidationRejection(error)) {
                return finish(exports.OpenClawConfigDeliveryMode.Rejected, `config.set rejected payload: ${describeError(error)}; restart skipped`);
            }
            return fallback(`config.set failed: ${describeError(error)}`);
        }
        // Another writer (e.g. the gateway itself) touched the file between our
        // hash read and the set. Re-read the hash once and retry.
        try {
            await requestConfigSet(client, raw);
            return finish(exports.OpenClawConfigDeliveryMode.Rpc, 'config.set acked after hash retry');
        }
        catch (retryError) {
            if (!isBaseHashConflict(retryError) && isConfigValidationRejection(retryError)) {
                return finish(exports.OpenClawConfigDeliveryMode.Rejected, `config.set rejected payload: ${describeError(retryError)}; restart skipped`);
            }
            return fallback(`config.set retry failed: ${describeError(retryError)}`);
        }
    }
}
//# sourceMappingURL=openclawConfigDelivery.js.map