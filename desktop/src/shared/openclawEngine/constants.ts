export const OpenClawEngineIpc = {
  GetStatus: 'openclaw:engine:getStatus',
  Install: 'openclaw:engine:install',
  RetryInstall: 'openclaw:engine:retryInstall',
  RestartGateway: 'openclaw:engine:restartGateway',
  RepairGatewayState: 'openclaw:engine:repairGatewayState',
  OnProgress: 'openclaw:engine:onProgress',
} as const;

export type OpenClawEngineIpc =
  typeof OpenClawEngineIpc[keyof typeof OpenClawEngineIpc];

export const OpenClawEnginePhase = {
  NotInstalled: 'not_installed',
  Installing: 'installing',
  Ready: 'ready',
  Starting: 'starting',
  Running: 'running',
  Error: 'error',
} as const;

export type OpenClawEnginePhase =
  typeof OpenClawEnginePhase[keyof typeof OpenClawEnginePhase];

export const OpenClawGatewayRepairErrorCode = {
  Busy: 'busy',
  ConfigApplyPending: 'config_apply_pending',
} as const;

export type OpenClawGatewayRepairErrorCode =
  typeof OpenClawGatewayRepairErrorCode[keyof typeof OpenClawGatewayRepairErrorCode];

/**
 * openclaw.json `plugins` keys that OpenClaw owns exclusively through its
 * plugin index (SQLite state DB). The gateway tolerates them in the on-disk
 * file via a load-time migration, but the `config.set` RPC rejects them
 * ("plugins.installs is managed by the plugin index and cannot be edited with
 * config set"). Left on disk they turn every hot config delivery into a
 * guaranteed fallback hard restart, so LobsterAI strips them both when
 * writing openclaw.json and from every config.set payload.
 */
export const OPENCLAW_PLUGIN_INDEX_MANAGED_KEYS = ['installs'] as const;

export const OpenClawEngineErrorCode = {
  /**
   * resources/cfmind has no runtime entry file. On packaged Windows builds
   * this means the installer never finished unpacking win-resources.tar
   * (typically killed or frozen by security software) and automatic recovery
   * from the leftover archive was not possible.
   */
  RuntimeEntryMissing: 'runtime_entry_missing',
} as const;

export type OpenClawEngineErrorCode =
  typeof OpenClawEngineErrorCode[keyof typeof OpenClawEngineErrorCode];

export const OpenClawGatewayFailureKind = {
  HeapOutOfMemory: 'heap_out_of_memory',
} as const;

export type OpenClawGatewayFailureKind =
  typeof OpenClawGatewayFailureKind[keyof typeof OpenClawGatewayFailureKind];

export type OpenClawGatewayFailureSnapshot = {
  generation: number;
  kind: OpenClawGatewayFailureKind;
  detectedAt: number;
  exitCode?: number | null;
};

/**
 * The line in a workspace AGENTS.md that separates the person's own notes
 * (above) from the section the app rewrites on every config sync (below).
 *
 * The app writes `AGENTS_MD_MANAGED_MARKER`. Installs made before the
 * rename still carry a legacy marker, so every reader must accept both:
 * use `findAgentsMdManagedMarker` to locate whichever is present. The next
 * sync then rewrites the file with the current marker.
 */
export const AGENTS_MD_MANAGED_MARKER = '<!-- Caisra managed: do not edit below this line -->';

export const AGENTS_MD_LEGACY_MANAGED_MARKERS = [
  '<!-- LobsterAI managed: do not edit below this line -->',
] as const;

export const AGENTS_MD_MANAGED_MARKERS = [
  AGENTS_MD_MANAGED_MARKER,
  ...AGENTS_MD_LEGACY_MANAGED_MARKERS,
] as const;

export type AgentsMdManagedMarkerMatch = {
  index: number;
  marker: string;
};

/**
 * Find the first managed marker (current or legacy) in an AGENTS.md body.
 * Returns the earliest occurrence when more than one is present.
 */
export function findAgentsMdManagedMarker(content: string): AgentsMdManagedMarkerMatch | null {
  let best: AgentsMdManagedMarkerMatch | null = null;
  for (const marker of AGENTS_MD_MANAGED_MARKERS) {
    const index = content.indexOf(marker);
    if (index < 0) continue;
    if (!best || index < best.index) best = { index, marker };
  }
  return best;
}

/** Remove every managed marker (current or legacy) from a piece of text. */
export function stripAgentsMdManagedMarkers(content: string): string {
  let result = content;
  for (const marker of AGENTS_MD_MANAGED_MARKERS) {
    result = result.split(marker).join('');
  }
  return result;
}
