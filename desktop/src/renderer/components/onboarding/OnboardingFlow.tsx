import './onboarding.css';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';

import {
  type AssistantVoice,
  DEFAULT_ASSISTANT_NAME,
  DEFAULT_ASSISTANT_VOICE,
  normalizeAssistantName,
  ONBOARDING_STEP_COUNT,
  OnboardingStep,
} from '../../../shared/onboarding/constants';
import { authService } from '../../services/auth';
import { getPortalPrivacyUrl, getPortalTermsUrl } from '../../services/endpoints';
import { i18nService } from '../../services/i18n';
import {
  getMachineTimezone,
  nextOnboardingStep,
  onboardingService,
  previousOnboardingStep,
} from '../../services/onboarding';
import type { RootState } from '../../store';
import ConnectionsStep from './ConnectionsStep';
import DoneStep from './DoneStep';
import NameStep from './NameStep';
import ReachStep from './ReachStep';
import VoiceStep from './VoiceStep';
import WelcomeStep from './WelcomeStep';

/**
 * The six screens a person sees once (docs/maties/onboarding.md): the
 * 60px top bar with the back chevron and the dots, the scrolling body, the
 * footer with the links and the one dark button. Replaces the workspace
 * until « Go to workspace ».
 */

const TOP_BAR_HEIGHT = 60;
const STEP_INDICES = Array.from({ length: ONBOARDING_STEP_COUNT }, (_, index) => index + 1);

const BackChevron: React.FC = () => (
  <svg width="9" height="15" viewBox="0 0 9 15" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="7.5,1.5 1.5,7.5 7.5,13.5" />
  </svg>
);

const openExternal = async (url: string): Promise<void> => {
  try {
    await window.electron.shell.openExternal(url);
  } catch (error) {
    console.warn('[Onboarding] could not open the page:', error);
  }
};

export interface OnboardingFlowProps {
  /** Continue on Welcome counts as agreeing to the privacy policy; the app keeps that flag too. */
  onAcceptPrivacy: () => Promise<void>;
  /** « Go to workspace » was pressed and the flow is complete. */
  onFinished: () => void;
}

const OnboardingFlow: React.FC<OnboardingFlowProps> = ({ onAcceptPrivacy, onFinished }) => {
  const authUser = useSelector((state: RootState) => state.auth.user);
  const [loaded, setLoaded] = useState(false);
  const [step, setStep] = useState<OnboardingStep>(OnboardingStep.Welcome);
  const [assistantName, setAssistantName] = useState(DEFAULT_ASSISTANT_NAME);
  const [voice, setVoice] = useState<AssistantVoice>(DEFAULT_ASSISTANT_VOICE);
  const [timezone, setTimezone] = useState(() => getMachineTimezone());
  const [signInPending, setSignInPending] = useState(false);
  const [signInFailed, setSignInFailed] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let current = true;
    void onboardingService.readState().then((state) => {
      if (!current) return;
      setStep(state.step);
      setAssistantName(state.assistantName);
      setVoice(state.voice);
      setTimezone(state.timezone);
      setLoaded(true);
    });
    return () => {
      current = false;
    };
  }, []);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [step]);

  const goTo = useCallback((next: OnboardingStep) => {
    setStep(next);
    void onboardingService.saveStep(next);
  }, []);

  const tidyName = normalizeAssistantName(assistantName) || DEFAULT_ASSISTANT_NAME;

  const handleNameChange = useCallback((name: string) => {
    setAssistantName(name);
  }, []);

  const handleVoiceChange = useCallback((next: AssistantVoice) => {
    setVoice(next);
    void onboardingService.saveVoice(next);
  }, []);

  const handleTimezoneChange = useCallback((zone: string) => {
    setTimezone(zone);
    void onboardingService.saveTimezone(zone);
  }, []);

  const leaveWelcome = useCallback(async () => {
    try {
      await onAcceptPrivacy();
    } catch (error) {
      console.warn('[Onboarding] the privacy agreement could not be stored:', error);
    }
    await onboardingService.saveTimezone(timezone);
    goTo(OnboardingStep.Name);
  }, [goTo, onAcceptPrivacy, timezone]);

  // « Sign in to continue »: the browser sign-in runs, and the flow moves on when the account is there.
  useEffect(() => {
    if (!signInPending || !authUser) return;
    setSignInPending(false);
    void leaveWelcome();
  }, [authUser, leaveWelcome, signInPending]);

  const handleContinue = useCallback(async () => {
    switch (step) {
      case OnboardingStep.Welcome: {
        if (authUser) {
          await leaveWelcome();
          return;
        }
        setSignInFailed(false);
        setSignInPending(true);
        try {
          const result = await authService.login();
          if (!result.success) {
            console.warn(`[Onboarding] the sign-in page could not be opened: ${result.error ?? 'unknown error'}`);
            setSignInPending(false);
            setSignInFailed(true);
          }
        } catch (error) {
          console.warn('[Onboarding] the sign-in could not start:', error);
          setSignInPending(false);
          setSignInFailed(true);
        }
        return;
      }
      case OnboardingStep.Name: {
        setAssistantName(tidyName);
        await onboardingService.saveAssistantName(tidyName);
        goTo(OnboardingStep.Voice);
        return;
      }
      case OnboardingStep.Connections: {
        setFinishing(true);
        try {
          await onboardingService.applyProfile({ assistantName: tidyName, voice, timezone });
        } finally {
          setFinishing(false);
        }
        goTo(OnboardingStep.Done);
        return;
      }
      default:
        goTo(nextOnboardingStep(step));
    }
  }, [authUser, goTo, leaveWelcome, step, tidyName, timezone, voice]);

  const handleBack = useCallback(() => {
    if (step === OnboardingStep.Welcome) return;
    setSignInPending(false);
    goTo(previousOnboardingStep(step));
  }, [goTo, step]);

  const handleGoToWorkspace = useCallback(async () => {
    setFinishing(true);
    await onboardingService.markCompleted();
    onFinished();
  }, [onFinished]);

  const handleLogOut = useCallback(async () => {
    setSignInPending(false);
    try {
      await authService.logout();
    } catch (error) {
      console.warn('[Onboarding] sign-out failed:', error);
    }
  }, []);

  const continueLabel = (() => {
    if (step === OnboardingStep.Connections) return i18nService.t('matiesOnboardingFinishSetup');
    if (step === OnboardingStep.Welcome && !authUser) {
      return signInPending
        ? i18nService.t('matiesOnboardingSigningIn')
        : i18nService.t('matiesOnboardingSignInToContinue');
    }
    return i18nService.t('matiesOnboardingContinue');
  })();

  const renderStep = () => {
    switch (step) {
      case OnboardingStep.Name:
        return <NameStep name={assistantName} onNameChange={handleNameChange} />;
      case OnboardingStep.Voice:
        return <VoiceStep assistantName={tidyName} voice={voice} onVoiceChange={handleVoiceChange} />;
      case OnboardingStep.Reach:
        return <ReachStep assistantName={tidyName} />;
      case OnboardingStep.Connections:
        return <ConnectionsStep />;
      case OnboardingStep.Done:
        return <DoneStep assistantName={tidyName} finishing={finishing} onGoToWorkspace={() => void handleGoToWorkspace()} />;
      default:
        return <WelcomeStep timezone={timezone} onTimezoneChange={handleTimezoneChange} />;
    }
  };

  return (
    <div
      className="flex h-full w-full flex-col overflow-hidden bg-white text-[14.5px] leading-[1.5] text-[#1c1f23] dark:bg-[#141518] dark:text-[#f2f3f5]"
      data-onboarding-step={step}
    >
      <div className="relative flex shrink-0 items-center justify-center" style={{ height: TOP_BAR_HEIGHT }}>
        {step > OnboardingStep.Welcome && (
          <button
            type="button"
            onClick={handleBack}
            aria-label={i18nService.t('back')}
            title={i18nService.t('back')}
            className="maties-ob-back absolute left-[22px] top-[14px] flex h-8 w-8 cursor-pointer items-center justify-center rounded-[10px] border-0 bg-transparent"
          >
            <BackChevron />
          </button>
        )}
        <div className="flex items-center gap-2" role="progressbar" aria-valuemin={1} aria-valuemax={ONBOARDING_STEP_COUNT} aria-valuenow={step}>
          {STEP_INDICES.map((index) => (
            <span
              key={index}
              className="h-[5px] w-[5px] rounded-full bg-current transition-opacity duration-200"
              style={{ opacity: index === step ? 1 : 0.15 }}
            />
          ))}
        </div>
      </div>

      <div
        ref={bodyRef}
        className="flex min-h-0 flex-1 justify-center overflow-y-auto overflow-x-hidden"
        style={{ padding: '0 clamp(20px,3vw,36px)' }}
      >
        <div
          className="flex w-full min-w-0 max-w-[1040px] flex-col items-center"
          style={{ padding: 'clamp(14px,3vh,36px) 0 40px' }}
        >
          {loaded && renderStep()}
        </div>
      </div>

      {step !== OnboardingStep.Done && (
        <div
          className="flex shrink-0 justify-center border-t border-[rgba(16,22,35,.06)] bg-white dark:border-[rgba(255,255,255,.07)] dark:bg-[#141518]"
          style={{ padding: '16px clamp(20px,3vw,36px) 18px' }}
        >
          <div className="flex w-full items-center gap-[22px]">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-[14px] text-[12.5px]">
              <a href={getPortalPrivacyUrl()} className="maties-ob-link" onClick={(event) => { event.preventDefault(); void openExternal(getPortalPrivacyUrl()); }}>
                {i18nService.t('matiesOnboardingPrivacyPolicy')}
              </a>
              <span className="h-[3px] w-[3px] rounded-full bg-[rgba(16,22,35,.18)]" aria-hidden="true" />
              <a href={getPortalTermsUrl()} className="maties-ob-link" onClick={(event) => { event.preventDefault(); void openExternal(getPortalTermsUrl()); }}>
                {i18nService.t('matiesOnboardingTermsOfService')}
              </a>
              {authUser && (
                <>
                  <span className="h-[3px] w-[3px] rounded-full bg-[rgba(16,22,35,.18)]" aria-hidden="true" />
                  <button type="button" className="maties-ob-link cursor-pointer border-0 bg-transparent p-0 text-[12.5px]" onClick={() => void handleLogOut()}>
                    {i18nService.t('matiesOnboardingLogOut')}
                  </button>
                </>
              )}
              {signInPending && (
                <span className="text-[12.5px] text-[#8f96a0]">{i18nService.t('matiesWelcomeWaiting')}</span>
              )}
              {signInFailed && (
                <span className="text-[12.5px] text-[#e0322d]">{i18nService.t('matiesAccountLoginFailed')}</span>
              )}
            </div>
            <button
              type="button"
              onClick={() => void handleContinue()}
              disabled={!loaded || finishing}
              className="maties-ob-primary flex h-10 shrink-0 cursor-pointer items-center justify-center whitespace-nowrap rounded-full border-0 px-6 text-[14px] font-medium"
            >
              {continueLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default OnboardingFlow;
