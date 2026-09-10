import React from 'react';

import { i18nService } from '@/services/i18n';

import Pill, { PillTone } from './design/Pill';
import Shimmer from './design/Shimmer';
import Sphere from './design/Sphere';

const SERVICE_TERMS_URL = 'https://app.claidor.com/terms';

interface WelcomeDialogProps {
  onLogin: () => void;
  loginPending: boolean;
  onCancelLogin: () => void;
  /** Kept for the caller; the design has one way in, the Claidor sign-in. */
  onCustomModel?: () => void;
}

/**
 * The welcome screen (docs/maties/design.md, section 6): the sphere at
 * 64px, the sentence, one blue pill, the small print. Continuing counts as
 * accepting the terms; the small print says so.
 */
const WelcomeDialog: React.FC<WelcomeDialogProps> = ({
  onLogin,
  loginPending,
  onCancelLogin,
}) => {
  const handleTermsClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    await window.electron.shell.openExternal(SERVICE_TERMS_URL);
  };

  const smallPrint = i18nService.t('matiesWelcomeSmallPrint');
  const linkText = i18nService.t('matiesWelcomeTermsLink');
  const [printBefore, printAfter] = smallPrint.split('{link}');
  const copyright = i18nService
    .t('welcomeCopyright')
    .replace('{year}', String(new Date().getFullYear()));

  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center overflow-hidden bg-white dark:bg-[#141518]">
      {/* The only outer background: a faint wash from white to #e2e4e9 at the far corner. */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{ background: 'radial-gradient(120% 120% at 100% 100%, #e2e4e9 0%, rgba(226,228,233,0) 60%)' }}
      />

      <div className="maties-in relative z-10 flex w-[360px] flex-1 flex-col items-center justify-center text-center">
        <Sphere size={64} title="Maties" />

        <h1 className="maties-headline mt-7 text-[26px]">
          {i18nService.t('matiesWelcomeSentence')}
        </h1>

        {/* The actions keep one height across the idle and pending states. */}
        <div className="mt-8 flex min-h-[88px] w-full flex-col items-center">
          {loginPending ? (
            <>
              <div className="flex h-9 items-center">
                <Shimmer text={i18nService.t('matiesWelcomeWaiting')} />
              </div>
              <Pill tone={PillTone.Ghost} compact className="mt-3" onClick={onCancelLogin}>
                {i18nService.t('back')}
              </Pill>
            </>
          ) : (
            <Pill tone={PillTone.Primary} onClick={onLogin} className="px-6">
              {i18nService.t('matiesSignInWithClaidor')}
            </Pill>
          )}
        </div>
      </div>

      <div className="relative z-10 flex flex-col items-center gap-1 px-8 pb-8 text-center">
        <p className="maties-caption max-w-[52ch]">
          {printBefore}
          <a
            href={SERVICE_TERMS_URL}
            onClick={handleTermsClick}
            className="text-[#1c1f23] underline decoration-[rgba(16,22,35,.25)] underline-offset-2 hover:decoration-[#1c1f23] dark:text-[#f2f3f5]"
          >
            {linkText}
          </a>
          {printAfter}
        </p>
        <p className="maties-caption">{copyright}</p>
      </div>
    </div>
  );
};

export default WelcomeDialog;
