import React, { useEffect, useState } from 'react';

import { OpenClawEngineErrorCode, OpenClawGatewayRepairErrorCode } from '../../../shared/openclawEngine/constants';
import { coworkService } from '../../services/cowork';
import { i18nService } from '../../services/i18n';
import { LogReporterAction, reportYdAnalyzer } from '../../services/logReporter';
import type { OpenClawEngineStatus, OpenClawGatewayRepairResult } from '../../types/cowork';
import Pill, { PillTone } from '../design/Pill';
import Sphere from '../design/Sphere';
import type { SettingsOpenOptions } from '../Settings';

interface EngineFailureOverlayProps {
  onRequestAppSettings?: (options?: SettingsOpenOptions) => void;
  suspended?: boolean;
}

const resolveGatewayRepairErrorText = (result: OpenClawGatewayRepairResult): string => {
  if (result.errorCode === OpenClawGatewayRepairErrorCode.Busy) {
    return i18nService.t('openClawRepairBusyError');
  }
  if (result.errorCode === OpenClawGatewayRepairErrorCode.ConfigApplyPending) {
    return i18nService.t('openClawRepairConfigApplyPendingError');
  }
  return result.error?.trim() || i18nService.t('openClawRepairFailed');
};

/**
 * The engine did not start (docs/maties/design.md, section 6): the plain
 * reason and « Try again ». Repairing (rebuild the engine's settings, then
 * start) stays as the second pill; the exact error, when there is one, sits
 * in mono under the sentence.
 */
const EngineFailureOverlay: React.FC<EngineFailureOverlayProps> = ({
  onRequestAppSettings,
  suspended = false,
}) => {
  const [status, setStatus] = useState<OpenClawEngineStatus | null>(
    () => coworkService.getOpenClawEngineStatusSnapshot()
  );
  const [isRestartingGateway, setIsRestartingGateway] = useState(false);
  const [isRepairingGateway, setIsRepairingGateway] = useState(false);
  const [gatewayRepairError, setGatewayRepairError] = useState<string | null>(null);
  const [isDeferred, setIsDeferred] = useState(false);

  useEffect(() => {
    coworkService.getOpenClawEngineStatus()
      .then((nextStatus) => {
        if (nextStatus) setStatus(nextStatus);
      })
      .catch(() => { /* keep last known status */ });

    return coworkService.onOpenClawEngineStatus((nextStatus) => {
      setStatus(nextStatus);
    });
  }, []);

  useEffect(() => {
    if (status?.phase === 'running') {
      setGatewayRepairError(null);
    }
    if (status?.phase !== 'error') {
      setIsDeferred(false);
    }
  }, [status?.phase]);

  const handleRestartGateway = async () => {
    if (isRestartingGateway || isRepairingGateway) return;
    setIsRestartingGateway(true);
    setGatewayRepairError(null);
    try {
      await coworkService.restartOpenClawGateway();
    } catch (error) {
      console.error('[EngineFailureOverlay] Failed to restart gateway:', error);
    } finally {
      setIsRestartingGateway(false);
    }
  };

  // Same repair flow as Settings > Agent Engine > Repair Startup: back up
  // openclaw.json, regenerate config, restart the gateway.
  const handleQuickRepairGateway = async () => {
    if (isRepairingGateway || isRestartingGateway) return;
    setIsRepairingGateway(true);
    setGatewayRepairError(null);
    try {
      const result = await coworkService.repairOpenClawGatewayState();
      void reportYdAnalyzer({
        action: LogReporterAction.AgentEngineMaintenanceAction,
        actionType: 'repair_gateway_state',
        result: result.success ? 'success' : 'failed',
        errorCode: result.success ? undefined : result.errorCode ?? 'unknown',
        source: 'cowork_engine_failure_overlay',
      });
      if (!result.success) {
        setGatewayRepairError(resolveGatewayRepairErrorText(result));
      }
    } catch (error) {
      console.error('[EngineFailureOverlay] Failed to repair gateway state:', error);
      const message = error instanceof Error ? error.message.trim() : '';
      setGatewayRepairError(message || i18nService.t('openClawRepairFailed'));
      void reportYdAnalyzer({
        action: LogReporterAction.AgentEngineMaintenanceAction,
        actionType: 'repair_gateway_state',
        result: 'failed',
        errorCode: 'unknown',
        source: 'cowork_engine_failure_overlay',
      });
    } finally {
      setIsRepairingGateway(false);
    }
  };

  if (suspended || status?.phase !== 'error') {
    return null;
  }

  // Incomplete installation (runtime files missing): rebuilding the OpenClaw
  // config cannot help. Quick repair still retries recovery from leftover
  // installer resources, but the honest fix is reinstalling.
  const isRuntimeMissing = status.errorCode === OpenClawEngineErrorCode.RuntimeEntryMissing;
  const busy = isRestartingGateway || isRepairingGateway;

  if (isDeferred) {
    return (
      <div className="pointer-events-none fixed inset-x-0 top-4 z-[90] flex justify-center px-4">
        <div className="maties-menu maties-in pointer-events-auto flex max-w-[calc(100vw-2rem)] items-center gap-1 py-1 pl-3 pr-1">
          <button
            type="button"
            onClick={() => setIsDeferred(false)}
            className="inline-flex min-w-0 items-center gap-2 text-[13px] font-medium text-[#1c1f23] dark:text-[#f2f3f5]"
          >
            <span className="maties-status-dot maties-status-wrong shrink-0" aria-hidden="true" />
            <span className="truncate">{i18nService.t('matiesEngineFailedShort')}</span>
          </button>
          <button
            type="button"
            onClick={() => { void handleRestartGateway(); }}
            disabled={busy}
            className="maties-pill-sm is-link"
          >
            {isRestartingGateway ? i18nService.t('loading') : i18nService.t('matiesTryAgain')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="maties-backdrop fixed inset-0 z-[90] flex items-center justify-center px-4">
      <div
        className="maties-card-prose maties-in w-full max-w-[440px] px-8 py-9"
        role="dialog"
        aria-modal="true"
        aria-labelledby="openclaw-gateway-failure-title"
      >
        <div className="flex flex-col items-center text-center">
          <Sphere size={48} still title="Maties" />
          <h3 id="openclaw-gateway-failure-title" className="maties-headline mt-5 text-[24px]">
            {i18nService.t('matiesCouldNotStart')}
          </h3>
          <p className="maties-subtitle mt-2 max-w-[42ch] text-[#4a4f57]">
            {i18nService.t(isRuntimeMissing ? 'matiesEngineMissingSentence' : 'matiesEngineFailedSentence')}
          </p>
          {status.message && (
            <div className="maties-mono-box mt-4 max-h-28 w-full max-w-full text-left break-words">
              {status.message}
            </div>
          )}
          {gatewayRepairError && (
            <p className="maties-caption maties-status-wrong mt-3">
              {gatewayRepairError}
            </p>
          )}
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <Pill tone={PillTone.Ghost} compact onClick={() => setIsDeferred(true)}>
            {i18nService.t('matiesNotNow')}
          </Pill>
          <Pill compact onClick={() => { void handleQuickRepairGateway(); }} disabled={busy}>
            {isRepairingGateway ? i18nService.t('openClawRepairRunning') : i18nService.t('matiesRepairAndTryAgain')}
          </Pill>
          <Pill tone={PillTone.Primary} compact onClick={() => { void handleRestartGateway(); }} disabled={busy}>
            {isRestartingGateway ? i18nService.t('loading') : i18nService.t('matiesTryAgain')}
          </Pill>
        </div>
        {onRequestAppSettings && (
          <div className="mt-3 flex justify-center">
            <button
              type="button"
              onClick={() => onRequestAppSettings({ initialTab: 'coworkAgentEngine' })}
              className="maties-pill-sm is-link"
            >
              {i18nService.t('matiesEngineSettings')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default EngineFailureOverlay;
