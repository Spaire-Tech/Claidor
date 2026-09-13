import React, { useEffect, useRef, useState } from 'react';

import { coworkService } from '../../services/cowork';
import { i18nService } from '../../services/i18n';
import type { OpenClawEngineStatus } from '../../types/cowork';
import Shimmer from '../design/Shimmer';
import Sphere from '../design/Sphere';

const SLOW_HINT_AFTER_MS = 15000;

// Module-level so the fade decision survives the remount when App switches
// from the bootstrap tree to the main tree. index.html's static splash
// shows this same page before React mounts, so the overlay must not fade
// in on app start, only when it appears mid-session.
let overlayWasVisible = true;

const resolveEngineStatusText = (status: OpenClawEngineStatus): string => {
  switch (status.phase) {
    case 'not_installed':
      return i18nService.t('coworkOpenClawNotInstalledNotice');
    case 'installing':
      return i18nService.t('coworkOpenClawInstalling');
    case 'ready':
      return i18nService.t('coworkOpenClawReadyNotice');
    case 'starting':
      return i18nService.t('coworkOpenClawStarting');
    case 'error':
      return i18nService.t('coworkOpenClawError');
    case 'running':
    default:
      return i18nService.t('coworkOpenClawRunning');
  }
};

interface EngineStartupOverlayProps {
  /**
   * Keep the overlay visible while the renderer is still initializing, before
   * engine status gating applies. Lets App render it from the very first
   * frame so startup is one continuous screen.
   */
  bootstrapping?: boolean;
}

/**
 * Engine starting (docs/maties/design.md, section 6): the sphere breathing
 * at 48px and « Starting up » with the shimmer. The status line under it is
 * the engine's own word for the moment; a slow start says so after 15 s.
 * index.html contains a static pre-React replica of this page; keep the
 * layout in sync so the handoff between the two is invisible.
 */
const EngineStartupOverlay: React.FC<EngineStartupOverlayProps> = ({ bootstrapping = false }) => {
  const [status, setStatus] = useState<OpenClawEngineStatus | null>(
    () => coworkService.getOpenClawEngineStatusSnapshot()
  );
  const [showSlowHint, setShowSlowHint] = useState(false);

  useEffect(() => {
    coworkService.getOpenClawEngineStatus()
      .then((s) => {
        if (s) setStatus(s);
      })
      .catch(() => { /* keep last known status */ });

    const unsubscribe = coworkService.onOpenClawEngineStatus((s) => {
      setStatus(s);
    });

    return unsubscribe;
  }, []);

  const isStarting = status?.phase === 'starting';
  const visible = bootstrapping || isStarting;

  const wasVisibleRef = useRef(overlayWasVisible);
  const animateIn = visible && !wasVisibleRef.current;
  wasVisibleRef.current = visible;
  overlayWasVisible = visible;

  useEffect(() => {
    if (!visible) {
      setShowSlowHint(false);
      return;
    }

    const slowHintTimer = setTimeout(() => {
      setShowSlowHint(true);
    }, SLOW_HINT_AFTER_MS);

    return () => {
      clearTimeout(slowHintTimer);
    };
  }, [visible]);

  if (!visible) {
    return null;
  }

  const progressPercent = typeof status?.progressPercent === 'number'
    ? Math.max(0, Math.min(100, Math.round(status.progressPercent)))
    : null;

  return (
    <div className={`fixed inset-0 z-[100] flex items-center justify-center bg-white dark:bg-[#141518] ${animateIn ? 'maties-in' : ''}`}>
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{ background: 'radial-gradient(120% 120% at 100% 100%, #e2e4e9 0%, rgba(226,228,233,0) 60%)' }}
      />

      <div className="relative z-10 flex w-[420px] flex-col items-center px-6 text-center" role="status">
        <span className="maties-breathe inline-flex">
          <Sphere size={48} title="Maties" />
        </span>

        <div className="mt-6">
          <Shimmer text={i18nService.t('matiesStartingUp')} />
        </div>

        <p className="maties-caption mt-2 min-h-[18px]">
          {status ? resolveEngineStatusText(status) : ''}
          {progressPercent !== null && (
            <span className="maties-mono ml-2 tabular-nums">{progressPercent}%</span>
          )}
        </p>

        <p
          className={`maties-caption mt-6 max-w-[40ch] transition-opacity duration-500 ${showSlowHint ? 'opacity-100' : 'opacity-0'}`}
          aria-hidden={!showSlowHint}
        >
          {i18nService.t('matiesStartingSlow')}
        </p>
      </div>
    </div>
  );
};

export default EngineStartupOverlay;
