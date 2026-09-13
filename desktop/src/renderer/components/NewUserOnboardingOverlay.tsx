import { ArrowUpIcon } from '@heroicons/react/24/solid';
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { i18nService } from '../services/i18n';
import Pill, { PillTone } from './design/Pill';
import Sphere from './design/Sphere';

export const NewUserOnboardingStep = {
  NewTask: 'new-task',
  PromptInput: 'prompt-input',
} as const;
export type NewUserOnboardingStep =
  typeof NewUserOnboardingStep[keyof typeof NewUserOnboardingStep];

const ONBOARDING_TARGET_SELECTOR_BY_STEP: Record<NewUserOnboardingStep, string> = {
  [NewUserOnboardingStep.NewTask]: '[data-onboarding-target="new-task"]',
  [NewUserOnboardingStep.PromptInput]: '[data-onboarding-target="home-prompt"]',
};
const SPOTLIGHT_PADDING = 2;
const SPOTLIGHT_RADIUS = 12;
const POPOVER_GAP = 28;
const POPOVER_WIDTH = 308;
const POPOVER_MARGIN = 16;
const POPOVER_ARROW_WIDTH = 14;
const POPOVER_ARROW_CARD_OVERLAP = 2;
const POPOVER_ARROW_HALF_HEIGHT = 12;
const PROMPT_TEXTAREA_SELECTOR = '[data-onboarding-target="home-prompt-textarea"]';
const PROMPT_SEND_BUTTON_SELECTOR = '[data-onboarding-target="home-prompt-send"]';
const PROMPT_TEXTAREA_PADDING_LEFT = 16;
const PROMPT_TEXTAREA_PADDING_TOP = 12;
const SEND_EFFECT_SIZE = 48;
const TYPEWRITER_INTERVAL_MS = 90;
const PROMPT_RESULT_POPOVER_DELAY_MS = 600;
const PROMPT_RESULT_POPOVER_DEFAULT_HEIGHT = 196;
const PROMPT_RESULT_POPOVER_MIN_HEIGHT = 176;
const PROMPT_RESULT_POPOVER_MIN_WIDTH = 560;
const PROMPT_RESULT_POPOVER_MAX_WIDTH = 720;
const PROMPT_RESULT_POPOVER_GAP = 24;
const PROMPT_RESULT_POPOVER_ARROW_WIDTH = 28;
const PROMPT_RESULT_POPOVER_ARROW_HEIGHT = 16;

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface NewUserOnboardingOverlayProps {
  step: NewUserOnboardingStep;
  onNext: () => void;
  onSkip: () => void;
  onStartExperience: () => void;
}

const OnboardingCursorIcon: React.FC<React.SVGProps<SVGSVGElement>> = ({
  className,
  ...props
}) => (
  <svg
    className={className}
    viewBox="13.5 13.5 21 23"
    fill="none"
    aria-hidden="true"
    focusable="false"
    {...props}
  >
    <path
      d="M15.0502 17.4398C14.6729 15.7408 16.4955 14.4039 18.0027 15.2743L32.5432 23.6706C34.1315 24.5878 33.7507 26.9807 31.9561 27.3595L26.7512 28.4581C26.2442 28.5652 25.7984 28.8649 25.508 29.2941L22.2182 34.155C21.2346 35.6083 18.9898 35.1807 18.6094 33.4676L15.0502 17.4398Z"
      fill="#090002"
    />
    <path
      d="M16.0261 17.2227C15.8379 16.3733 16.7492 15.7055 17.5027 16.1406L32.0427 24.5361C32.8368 24.9947 32.6469 26.1913 31.7498 26.3809L26.5447 27.4795C25.7841 27.64 25.1151 28.0896 24.6794 28.7334L21.3904 33.5947C20.8986 34.3213 19.776 34.1074 19.5857 33.251L16.0261 17.2227Z"
      stroke="white"
      strokeWidth="2"
      strokeLinejoin="round"
    />
  </svg>
);

const LeftPopoverArrow: React.FC<React.SVGProps<SVGSVGElement>> = ({
  className,
  ...props
}) => (
  <svg
    className={className}
    viewBox="0 0 14 24"
    fill="none"
    aria-hidden="true"
    focusable="false"
    preserveAspectRatio="none"
    {...props}
  >
    <path
      d="M14 0V24L1.7 13.45C0.62 12.52 0.62 11.48 1.7 10.55L14 0Z"
      fill="currentColor"
    />
  </svg>
);

const TopPopoverArrow: React.FC<React.SVGProps<SVGSVGElement>> = ({
  className,
  ...props
}) => (
  <svg
    className={className}
    viewBox="0 0 36 20"
    fill="none"
    aria-hidden="true"
    focusable="false"
    preserveAspectRatio="none"
    {...props}
  >
    <path
      d="M0 20H36L20.2 2.35C18.94 0.94 17.06 0.94 15.8 2.35L0 20Z"
      fill="currentColor"
    />
  </svg>
);

const clamp = (value: number, min: number, max: number): number => (
  Math.min(Math.max(value, min), max)
);

const readElementRect = (selector: string): TargetRect | null => {
  const target = document.querySelector<HTMLElement>(selector);
  if (!target) return null;
  const rect = target.getBoundingClientRect();
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
};

const readTargetRect = (step: NewUserOnboardingStep): TargetRect | null => {
  const rect = readElementRect(ONBOARDING_TARGET_SELECTOR_BY_STEP[step]);
  if (!rect) return null;
  return {
    top: rect.top - SPOTLIGHT_PADDING,
    left: rect.left - SPOTLIGHT_PADDING,
    width: rect.width + SPOTLIGHT_PADDING * 2,
    height: rect.height + SPOTLIGHT_PADDING * 2,
  };
};

const TypewriterPromptPreview: React.FC<{
  rect: TargetRect;
  textareaRect: TargetRect | null;
  sendButtonRect: TargetRect | null;
  showSendEffect: boolean;
  onTypingComplete: () => void;
}> = ({
  rect,
  textareaRect,
  sendButtonRect,
  showSendEffect,
  onTypingComplete,
}) => {
  const promptExample = i18nService.t('newUserOnboardingPromptExample');
  const promptCharacters = Array.from(promptExample);
  const [visibleCharacterCount, setVisibleCharacterCount] = useState(0);
  const textRect = textareaRect ?? {
    top: rect.top + 12,
    left: rect.left + 12,
    width: rect.width - 24,
    height: 72,
  };
  const textBandWidth = Math.max(
    0,
    textRect.width - PROMPT_TEXTAREA_PADDING_LEFT * 2,
  );
  const visiblePrompt = promptCharacters.slice(0, visibleCharacterCount).join('');

  useEffect(() => {
    setVisibleCharacterCount(0);
    if (promptCharacters.length === 0) return undefined;

    let nextCharacterCount = 0;
    const intervalId = window.setInterval(() => {
      nextCharacterCount += 1;
      setVisibleCharacterCount(nextCharacterCount);
      if (nextCharacterCount >= promptCharacters.length) {
        window.clearInterval(intervalId);
        onTypingComplete();
      }
    }, TYPEWRITER_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [onTypingComplete, promptExample, promptCharacters.length]);

  const sendRect = sendButtonRect ?? {
    top: rect.top + rect.height - 44,
    left: rect.left + rect.width - 48,
    width: 32,
    height: 32,
  };
  const isTypingStarted = visibleCharacterCount > 0;
  const sendIconSize = sendRect.width <= 28 ? 16 : 18;
  const sendCenterX = sendRect.left + sendRect.width / 2;
  const sendCenterY = sendRect.top + sendRect.height / 2;

  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      <style>
        {`
        @keyframes lobster-onboarding-caret {
          0%, 48% { opacity: 1; }
          49%, 100% { opacity: 0; }
        }

        @keyframes lobster-onboarding-send-pulse {
          0% { opacity: 0; transform: scale(0.58); }
          24% { opacity: 0.95; transform: scale(0.84); }
          62% { opacity: 0.5; transform: scale(1.22); }
          100% { opacity: 0; transform: scale(1.55); }
        }

        @keyframes lobster-onboarding-send-flash {
          0%, 38% { opacity: 0; transform: scale(0.88); }
          48% { opacity: 0.28; transform: scale(1); }
          68%, 100% { opacity: 0; transform: scale(1.2); }
        }

        @keyframes lobster-onboarding-send-cursor {
          0% { opacity: 0; transform: translate3d(46px, 34px, 0) scale(1); }
          30% { opacity: 1; transform: translate3d(2px, 2px, 0) scale(1); }
          46% { opacity: 1; transform: translate3d(2px, 2px, 0) scale(0.78); }
          64%, 100% { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
        }

        @keyframes lobster-onboarding-send-press {
          0%, 38% { transform: scale(1); box-shadow: 0 2px 8px rgba(0,0,0,0.12); }
          48% { transform: scale(0.9); box-shadow: 0 0 0 5px rgba(255,255,255,0.72), 0 8px 18px rgba(0,0,0,0.24); }
          66%, 100% { transform: scale(1); box-shadow: 0 2px 8px rgba(0,0,0,0.12); }
        }

        @keyframes lobster-onboarding-send-active {
          0% { opacity: 0; transform: scale(0.82); }
          100% { opacity: 1; transform: scale(1); }
        }

        .lobster-onboarding-caret {
          animation: lobster-onboarding-caret 0.8s step-end infinite;
        }

        .lobster-onboarding-send-pulse {
          animation: lobster-onboarding-send-pulse 1.18s ease-out 0.28s both;
        }

        .lobster-onboarding-send-pulse-delayed {
          animation-delay: 0.46s;
        }

        .lobster-onboarding-send-flash {
          animation: lobster-onboarding-send-flash 1.18s ease-out both;
        }

        .lobster-onboarding-send-cursor {
          animation: lobster-onboarding-send-cursor 1.18s cubic-bezier(0.2, 0.85, 0.22, 1) both;
        }

        .lobster-onboarding-send-active {
          animation: lobster-onboarding-send-active 0.18s ease-out both;
        }

        .lobster-onboarding-send-press {
          animation: lobster-onboarding-send-press 1.18s ease-out both;
        }

        @media (prefers-reduced-motion: reduce) {
          .lobster-onboarding-caret,
          .lobster-onboarding-send-pulse,
          .lobster-onboarding-send-flash,
          .lobster-onboarding-send-cursor,
          .lobster-onboarding-send-active,
          .lobster-onboarding-send-press {
            animation: none;
          }

          .lobster-onboarding-caret {
            opacity: 0;
          }
        }
      `}
      </style>
      <div
        className="absolute bg-surface"
        style={{
          top: textRect.top,
          left: textRect.left,
          width: textRect.width,
          height: textRect.height,
        }}
      />
      <div
        className="absolute flex items-center text-sm font-normal leading-[var(--lobster-leading-prompt)] text-foreground"
        style={{
          top: textRect.top + PROMPT_TEXTAREA_PADDING_TOP,
          left: textRect.left + PROMPT_TEXTAREA_PADDING_LEFT,
          width: textBandWidth,
        }}
      >
        <span className="inline-block max-w-full overflow-hidden whitespace-nowrap">
          {visiblePrompt}
        </span>
        <span className="lobster-onboarding-caret ml-1 h-5 w-px bg-foreground" />
      </div>
      {isTypingStarted && (
        <div
          className={`lobster-onboarding-send-active absolute z-10 flex items-center justify-center rounded-full bg-foreground text-background shadow-subtle ${showSendEffect ? 'lobster-onboarding-send-press' : ''}`}
          style={{
            top: sendRect.top,
            left: sendRect.left,
            width: sendRect.width,
            height: sendRect.height,
          }}
        >
          <ArrowUpIcon
            aria-hidden="true"
            style={{
              width: sendIconSize,
              height: sendIconSize,
            }}
          />
        </div>
      )}
      <div
        className="absolute z-20"
        style={{
          top: sendCenterY - SEND_EFFECT_SIZE / 2,
          left: sendCenterX - SEND_EFFECT_SIZE / 2,
          width: SEND_EFFECT_SIZE,
          height: SEND_EFFECT_SIZE,
        }}
      >
        {showSendEffect && (
          <>
            <div className="lobster-onboarding-send-flash absolute inset-2 rounded-full bg-foreground" />
            <div className="lobster-onboarding-send-pulse absolute inset-0 rounded-full border-2 border-background/95 bg-background/25 shadow-[0_0_0_1px_rgba(0,0,0,0.06)]" />
            <div className="lobster-onboarding-send-pulse lobster-onboarding-send-pulse-delayed absolute inset-0 rounded-full border border-background/80 bg-background/15" />
          </>
        )}
      </div>
      {showSendEffect && (
        <OnboardingCursorIcon
          className="lobster-onboarding-send-cursor absolute z-30 h-7 w-7 drop-shadow-[0_6px_7px_rgba(0,0,0,0.3)]"
          style={{
            top: sendCenterY - 3,
            left: sendCenterX - 3,
          }}
        />
      )}
    </div>
  );
};

const PromptResultPopover: React.FC<{
  rect: TargetRect;
  viewportWidth: number;
  viewportHeight: number;
  onSkip: () => void;
  onStartExperience: () => void;
}> = ({ rect, viewportWidth, viewportHeight, onSkip, onStartExperience }) => {
  const desiredPopoverWidth = Math.min(
    Math.max(rect.width * 0.72, PROMPT_RESULT_POPOVER_MIN_WIDTH),
    PROMPT_RESULT_POPOVER_MAX_WIDTH,
  );
  const popoverWidth = clamp(
    desiredPopoverWidth,
    Math.min(PROMPT_RESULT_POPOVER_MIN_WIDTH, viewportWidth - POPOVER_MARGIN * 2),
    Math.min(PROMPT_RESULT_POPOVER_MAX_WIDTH, viewportWidth - POPOVER_MARGIN * 2),
  );
  const popoverLeft = clamp(
    rect.left + (rect.width - popoverWidth) / 2,
    POPOVER_MARGIN,
    Math.max(POPOVER_MARGIN, viewportWidth - popoverWidth - POPOVER_MARGIN),
  );
  const preferredPopoverTop = rect.top + rect.height + PROMPT_RESULT_POPOVER_GAP;
  const popoverTop = Math.min(
    preferredPopoverTop,
    Math.max(POPOVER_MARGIN, viewportHeight - PROMPT_RESULT_POPOVER_MIN_HEIGHT - POPOVER_MARGIN),
  );
  const availablePopoverHeight = Math.max(
    PROMPT_RESULT_POPOVER_MIN_HEIGHT,
    viewportHeight - popoverTop - POPOVER_MARGIN,
  );
  const popoverHeight = clamp(
    availablePopoverHeight,
    PROMPT_RESULT_POPOVER_MIN_HEIGHT,
    PROMPT_RESULT_POPOVER_DEFAULT_HEIGHT,
  );
  const arrowLeft = clamp(
    rect.left + rect.width * 0.32 - popoverLeft - PROMPT_RESULT_POPOVER_ARROW_WIDTH / 2,
    28,
    popoverWidth - PROMPT_RESULT_POPOVER_ARROW_WIDTH - 28,
  );
  const useCompactActionLayout = popoverWidth < 560;

  return (
    <section
      className="maties-card-prose maties-in absolute p-6"
      style={{
        top: popoverTop,
        left: popoverLeft,
        width: popoverWidth,
        height: popoverHeight,
      }}
    >
      <TopPopoverArrow
        className="absolute text-white dark:text-[#1c1e23]"
        style={{
          top: -PROMPT_RESULT_POPOVER_ARROW_HEIGHT + 1,
          left: arrowLeft,
          width: PROMPT_RESULT_POPOVER_ARROW_WIDTH,
          height: PROMPT_RESULT_POPOVER_ARROW_HEIGHT,
        }}
      />
      <div className="relative flex h-full flex-col">
        <div className="flex items-start gap-4">
          <Sphere size={40} still />
          <div className="min-w-0">
            <h2 className="maties-headline text-[22px]">
              {i18nService.t('newUserOnboardingPromptResultTitle')}
            </h2>
            <p className={`maties-subtitle mt-1.5 ${useCompactActionLayout ? '' : 'whitespace-nowrap'}`}>
              {i18nService.t('newUserOnboardingPromptResultDescription')}
            </p>
          </div>
        </div>
        <div className="mt-auto flex items-center justify-between gap-3 pt-6">
          <span className="maties-caption">
            {i18nService.t('matiesTourStep').replace('{current}', '2').replace('{total}', '2')}
          </span>
          <div className="flex items-center gap-2">
            <Pill tone={PillTone.Ghost} compact onClick={onSkip}>
              {i18nService.t('newUserOnboardingSkip')}
            </Pill>
            <Pill tone={PillTone.Primary} compact onClick={onStartExperience}>
              {i18nService.t('newUserOnboardingStartExperience')}
            </Pill>
          </div>
        </div>
      </div>
    </section>
  );
};

export const RetiredNewUserOnboardingOverlay: React.FC<NewUserOnboardingOverlayProps> = ({
  step,
  onNext,
  onSkip,
  onStartExperience,
}) => {
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const [promptTextareaRect, setPromptTextareaRect] = useState<TargetRect | null>(null);
  const [promptSendButtonRect, setPromptSendButtonRect] = useState<TargetRect | null>(null);
  const [isPromptTypingComplete, setIsPromptTypingComplete] = useState(false);
  const [isPromptResultPopoverVisible, setIsPromptResultPopoverVisible] = useState(false);
  const animationFrameRef = useRef<number | null>(null);
  const promptResultTimerRef = useRef<number | null>(null);

  const measureTargetRect = useCallback(() => {
    setTargetRect(readTargetRect(step));
    setPromptTextareaRect(
      step === NewUserOnboardingStep.PromptInput
        ? readElementRect(PROMPT_TEXTAREA_SELECTOR)
        : null,
    );
    setPromptSendButtonRect(
      step === NewUserOnboardingStep.PromptInput
        ? readElementRect(PROMPT_SEND_BUTTON_SELECTOR)
        : null,
    );
  }, [step]);

  const updateTargetRect = useCallback(() => {
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
    }
    animationFrameRef.current = window.requestAnimationFrame(() => {
      animationFrameRef.current = null;
      measureTargetRect();
    });
  }, [measureTargetRect]);

  const handlePromptTypingComplete = useCallback(() => {
    setIsPromptTypingComplete(true);
    if (promptResultTimerRef.current !== null) {
      window.clearTimeout(promptResultTimerRef.current);
    }
    promptResultTimerRef.current = window.setTimeout(() => {
      setIsPromptResultPopoverVisible(true);
      promptResultTimerRef.current = null;
    }, PROMPT_RESULT_POPOVER_DELAY_MS);
  }, []);

  useLayoutEffect(() => {
    setIsPromptTypingComplete(false);
    setIsPromptResultPopoverVisible(false);
    if (promptResultTimerRef.current !== null) {
      window.clearTimeout(promptResultTimerRef.current);
      promptResultTimerRef.current = null;
    }
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    measureTargetRect();
    window.addEventListener('resize', updateTargetRect);
    window.addEventListener('scroll', updateTargetRect, true);

    const target = document.querySelector<HTMLElement>(ONBOARDING_TARGET_SELECTOR_BY_STEP[step]);
    const promptTextarea = step === NewUserOnboardingStep.PromptInput
      ? document.querySelector<HTMLElement>(PROMPT_TEXTAREA_SELECTOR)
      : null;
    const promptSendButton = step === NewUserOnboardingStep.PromptInput
      ? document.querySelector<HTMLElement>(PROMPT_SEND_BUTTON_SELECTOR)
      : null;
    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(updateTargetRect);
    if (target && resizeObserver) {
      resizeObserver.observe(target);
    }
    if (promptTextarea && resizeObserver) {
      resizeObserver.observe(promptTextarea);
    }
    if (promptSendButton && resizeObserver) {
      resizeObserver.observe(promptSendButton);
    }

    return () => {
      window.removeEventListener('resize', updateTargetRect);
      window.removeEventListener('scroll', updateTargetRect, true);
      resizeObserver?.disconnect();
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
      if (promptResultTimerRef.current !== null) {
        window.clearTimeout(promptResultTimerRef.current);
        promptResultTimerRef.current = null;
      }
    };
  }, [measureTargetRect, step, updateTargetRect]);

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const rect = targetRect ?? {
    top: step === NewUserOnboardingStep.NewTask ? 50 : 268,
    left: step === NewUserOnboardingStep.NewTask ? 4 : 380,
    width: step === NewUserOnboardingStep.NewTask ? 264 : 900,
    height: step === NewUserOnboardingStep.NewTask ? 44 : 140,
  };
  const popoverLeft = clamp(
    rect.left + rect.width + POPOVER_GAP,
    POPOVER_MARGIN,
    Math.max(POPOVER_MARGIN, viewportWidth - POPOVER_WIDTH - POPOVER_MARGIN),
  );
  const popoverTop = clamp(
    rect.top - 3,
    POPOVER_MARGIN,
    Math.max(POPOVER_MARGIN, viewportHeight - 292 - POPOVER_MARGIN),
  );
  const arrowCenterTop = rect.top + rect.height / 2 - popoverTop;
  const arrowTop = clamp(
    arrowCenterTop - POPOVER_ARROW_HALF_HEIGHT,
    10,
    258,
  );

  return (
    <div
      className="non-draggable fixed inset-0 z-[10040] cursor-default"
      role="dialog"
      aria-modal="true"
      aria-label={i18nService.t('newUserOnboardingAriaLabel')}
    >
      <div
        className="pointer-events-none absolute"
        style={{
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
          borderRadius: SPOTLIGHT_RADIUS,
          boxShadow:
            '0 0 0 9999px rgba(16,20,28,0.42), 0 0 0 1px rgba(255,255,255,0.72)',
        }}
      />
      {step === NewUserOnboardingStep.PromptInput && (
        <TypewriterPromptPreview
          rect={rect}
          textareaRect={promptTextareaRect}
          sendButtonRect={promptSendButtonRect}
          showSendEffect={isPromptTypingComplete}
          onTypingComplete={handlePromptTypingComplete}
        />
      )}
      {step === NewUserOnboardingStep.PromptInput && isPromptResultPopoverVisible && (
        <PromptResultPopover
          rect={rect}
          viewportWidth={viewportWidth}
          viewportHeight={viewportHeight}
          onSkip={onSkip}
          onStartExperience={onStartExperience}
        />
      )}
      {step === NewUserOnboardingStep.NewTask && (
        <section
          className="maties-card-prose maties-in absolute w-[308px] p-5"
          style={{ top: popoverTop, left: popoverLeft }}
        >
          <LeftPopoverArrow
            className="absolute text-white dark:text-[#1c1e23]"
            style={{
              top: arrowTop,
              left: -POPOVER_ARROW_WIDTH + POPOVER_ARROW_CARD_OVERLAP,
              width: POPOVER_ARROW_WIDTH,
              height: POPOVER_ARROW_HALF_HEIGHT * 2,
            }}
          />
          <Sphere size={40} still />
          <h2 className="maties-headline mt-4 text-[22px]">
            {i18nService.t('newUserOnboardingNewTaskTitle')}
          </h2>
          <p className="maties-subtitle mt-1.5">
            {i18nService.t('newUserOnboardingNewTaskDescription')}
          </p>
          <div className="mt-5 flex items-center justify-between gap-3">
            <span className="maties-caption">
              {i18nService.t('matiesTourStep').replace('{current}', '1').replace('{total}', '2')}
            </span>
            <div className="flex items-center gap-2">
              <Pill tone={PillTone.Ghost} compact onClick={onSkip}>
                {i18nService.t('newUserOnboardingSkip')}
              </Pill>
              <Pill tone={PillTone.Primary} compact onClick={onNext}>
                {i18nService.t('newUserOnboardingNext')}
              </Pill>
            </div>
          </div>
        </section>
      )}
    </div>
  );
};

// The tour cards are retired with the onboarding flow (docs/maties/onboarding.md):
// the six screens replaced them, and App.tsx no longer mounts this overlay.
const NewUserOnboardingOverlay: React.FC<NewUserOnboardingOverlayProps> = () => null;

export default NewUserOnboardingOverlay;
