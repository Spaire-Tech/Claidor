import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { useSkin } from '../../providers/SkinProvider';
import { i18nService } from '../../services/i18n';
import { type ThemeMode, themeService, ThemeServiceEvent } from '../../services/theme';
import Sphere from '../design/Sphere';
import { formatTimezoneLabel, formatTimezoneOption, listTimezones } from './timezones';

/**
 * Screen 1, « Welcome to Maties. »: the sphere, the sentence, the four
 * cards, then the two rows: time zone (the machine's zone by default) and
 * appearance (the app's theme setting, the same as in Settings).
 */

const SPHERE_SIZE = 72;

const THEME_MODES: readonly ThemeMode[] = ['system', 'light', 'dark'];
const THEME_MODE_LABEL_KEY: Record<ThemeMode, string> = {
  system: 'system',
  light: 'light',
  dark: 'dark',
};

const isThemeMode = (value: string): value is ThemeMode => (THEME_MODES as readonly string[]).includes(value);

const iconProps = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: '#6b7280',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  className: 'mt-[2px] shrink-0',
  'aria-hidden': true,
};

const CARDS = [
  {
    titleKey: 'matiesOnboardingWelcomeCardComputerTitle',
    lineKey: 'matiesOnboardingWelcomeCardComputerLine',
    icon: (
      <svg {...iconProps}><rect x="2.8" y="4.2" width="18.4" height="12.4" rx="1.8" /><path d="M8.4 20.2h7.2M12 16.6v3.6" /></svg>
    ),
  },
  {
    titleKey: 'matiesOnboardingWelcomeCardDocumentsTitle',
    lineKey: 'matiesOnboardingWelcomeCardDocumentsLine',
    icon: (
      <svg {...iconProps}><path d="M3.2 6.6a1.8 1.8 0 0 1 1.8-1.8h4l2.2 2.6h7.8a1.8 1.8 0 0 1 1.8 1.8v8.4a1.8 1.8 0 0 1-1.8 1.8H5a1.8 1.8 0 0 1-1.8-1.8Z" /></svg>
    ),
  },
  {
    titleKey: 'matiesOnboardingWelcomeCardAwayTitle',
    lineKey: 'matiesOnboardingWelcomeCardAwayLine',
    icon: (
      <svg {...iconProps}><path d="M20.2 14.4A8.6 8.6 0 0 1 9.6 3.8a8.6 8.6 0 1 0 10.6 10.6Z" /></svg>
    ),
  },
  {
    titleKey: 'matiesOnboardingWelcomeCardAsksTitle',
    lineKey: 'matiesOnboardingWelcomeCardAsksLine',
    icon: (
      <svg {...iconProps}><path d="M12 3.2 20 6v6c0 4.4-3.2 7.4-8 8.8-4.8-1.4-8-4.4-8-8.8V6Z" /><path d="M8.8 12.1 11.2 14.5 15.4 10.2" /></svg>
    ),
  },
] as const;

const RowChevron: React.FC = () => (
  <svg width="10" height="16" viewBox="0 0 10 16" fill="none" stroke="#c3c7ce" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="2,2 8,8 2,14" />
  </svg>
);

interface SettingRowProps {
  label: string;
  value: string;
  children: React.ReactNode;
}

/** A row of the settings card: the label, the value with the chevron, and the native select laid over the value. */
const SettingRow: React.FC<SettingRowProps> = ({ label, value, children }) => (
  <div className="flex items-center gap-[14px] px-[22px] py-[18px]">
    <span className="min-w-0 flex-1 text-[15px] text-[#1c1f23] dark:text-[#f2f3f5]">{label}</span>
    <span className="relative flex shrink-0 items-center">
      {children}
      <span className="pointer-events-none flex items-center gap-2 text-[15px] text-[#6b7280]">
        <span>{value}</span>
        <RowChevron />
      </span>
    </span>
  </div>
);

export interface WelcomeStepProps {
  timezone: string;
  onTimezoneChange: (timezone: string) => void;
}

const WelcomeStep: React.FC<WelcomeStepProps> = ({ timezone, onTimezoneChange }) => {
  const { selectThemeMode, isAppearanceChanging } = useSkin();
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => themeService.getTheme());
  const now = useMemo(() => new Date(), []);
  const timezones = useMemo(() => listTimezones(timezone), [timezone]);

  useEffect(() => {
    const handleThemeChanged = () => setThemeMode(themeService.getTheme());
    window.addEventListener(ThemeServiceEvent.DefaultChanged, handleThemeChanged);
    return () => window.removeEventListener(ThemeServiceEvent.DefaultChanged, handleThemeChanged);
  }, []);

  const handleThemeChange = useCallback(async (event: React.ChangeEvent<HTMLSelectElement>) => {
    const mode = event.target.value;
    if (!isThemeMode(mode)) return;
    setThemeMode(mode);
    try {
      const selection = await selectThemeMode(mode);
      setThemeMode(selection.mode);
    } catch (error) {
      console.error('[Onboarding] the appearance could not be changed:', error);
      setThemeMode(themeService.getTheme());
    }
  }, [selectThemeMode]);

  return (
    <div className="maties-ob-step flex w-full max-w-[820px] flex-col items-center">
      <Sphere size={SPHERE_SIZE} title="Maties" />

      <h1
        className="maties-headline text-center"
        style={{ fontSize: 'clamp(32px,3.8vw,46px)', letterSpacing: '-.016em', lineHeight: 1.14, marginTop: 'clamp(26px,4.5vh,42px)' }}
      >
        {i18nService.t('matiesOnboardingWelcomeTitle')}
      </h1>
      <p
        className="mt-4 max-w-[60ch] text-center text-[#4a4f57] dark:text-[#c9ccd2]"
        style={{ fontFamily: 'Newsreader, Georgia, serif', fontSize: 17.5, lineHeight: 1.6, textWrap: 'pretty' }}
      >
        {i18nService.t('matiesOnboardingWelcomeSentence')}
      </p>

      <div
        className="grid w-full max-w-[820px] grid-cols-1 sm:grid-cols-2"
        style={{
          columnGap: 'clamp(28px,5vw,64px)',
          rowGap: 'clamp(26px,4vh,40px)',
          marginTop: 'clamp(34px,6vh,58px)',
          padding: '0 clamp(0px,2vw,20px)',
        }}
      >
        {CARDS.map((card) => (
          <div key={card.titleKey} className="flex gap-[15px]">
            {card.icon}
            <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
              <span className="text-[15.5px] font-medium text-[#1c1f23] dark:text-[#f2f3f5]">{i18nService.t(card.titleKey)}</span>
              <span className="text-[14.5px] leading-[1.5] text-[#6b7280]" style={{ textWrap: 'pretty' }}>{i18nService.t(card.lineKey)}</span>
            </span>
          </div>
        ))}
      </div>

      <div
        className="maties-ob-panel w-full overflow-hidden rounded-[18px] border border-[rgba(16,22,35,.07)] bg-[#fbfbfc]"
        style={{ marginTop: 'clamp(38px,6vh,60px)', boxShadow: '0 1px 2px rgba(16,22,35,.03)' }}
      >
        <SettingRow label={i18nService.t('matiesOnboardingTimezone')} value={formatTimezoneLabel(timezone, now)}>
          <select
            className="maties-ob-row-select"
            aria-label={i18nService.t('matiesOnboardingTimezone')}
            value={timezone}
            onChange={(event) => onTimezoneChange(event.target.value)}
          >
            {timezones.map((zone) => (
              <option key={zone} value={zone}>{formatTimezoneOption(zone, now)}</option>
            ))}
          </select>
        </SettingRow>
        <div className="maties-ob-divider ml-[18px] h-px bg-[rgba(16,22,35,.06)]" />
        <SettingRow label={i18nService.t('appearance')} value={i18nService.t(THEME_MODE_LABEL_KEY[themeMode])}>
          <select
            className="maties-ob-row-select"
            aria-label={i18nService.t('appearance')}
            value={themeMode}
            disabled={isAppearanceChanging}
            onChange={(event) => void handleThemeChange(event)}
          >
            {THEME_MODES.map((mode) => (
              <option key={mode} value={mode}>{i18nService.t(THEME_MODE_LABEL_KEY[mode])}</option>
            ))}
          </select>
        </SettingRow>
      </div>
    </div>
  );
};

export default WelcomeStep;
