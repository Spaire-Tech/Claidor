import React, { useCallback, useEffect } from 'react';

import type { AssistantVoice } from '../../../shared/onboarding/constants';
import { i18nService } from '../../services/i18n';
import VoiceOrb, { useGrainUrl } from './VoiceOrb';
import { getVoiceDefinition, speakVoiceSample, stopVoiceSample, VOICES, wrapVoiceIndex } from './voices';

/**
 * Screen 3, « Choose a voice. »: five orbs in a ring, the chosen one in
 * the middle and largest, its neighbours smaller and dimmer with their
 * captions under them, the chosen name and line under the middle with the
 * arrows. The play disc reads a sample sentence with the computer's own
 * speech.
 */

const ORB_OFFSETS = [-2, -1, 0, 1, 2] as const;
const ORB_SIZE_BY_DISTANCE = ['clamp(168px,19vw,246px)', 'clamp(112px,13vw,168px)', 'clamp(78px,9vw,116px)'] as const;
const ORB_OPACITY_BY_DISTANCE = [1, 0.9, 0.4] as const;

const ChevronLeft: React.FC = () => (
  <svg width="8" height="14" viewBox="0 0 9 15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="7.5,1.5 1.5,7.5 7.5,13.5" />
  </svg>
);

const ChevronRight: React.FC = () => (
  <svg width="8" height="14" viewBox="0 0 9 15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="1.5,1.5 7.5,7.5 1.5,13.5" />
  </svg>
);

export interface VoiceStepProps {
  assistantName: string;
  voice: AssistantVoice;
  onVoiceChange: (voice: AssistantVoice) => void;
}

const VoiceStep: React.FC<VoiceStepProps> = ({ assistantName, voice, onVoiceChange }) => {
  const grain = useGrainUrl();
  const selectedIndex = Math.max(0, VOICES.findIndex((candidate) => candidate.id === voice));
  const selected = getVoiceDefinition(voice);

  useEffect(() => () => stopVoiceSample(), []);

  const pick = useCallback((index: number) => {
    stopVoiceSample();
    onVoiceChange(VOICES[index].id);
  }, [onVoiceChange]);

  const play = useCallback(() => {
    speakVoiceSample(selected, i18nService.t(selected.sampleKey));
  }, [selected]);

  const orbs = ORB_OFFSETS.map((offset) => {
    const index = wrapVoiceIndex(selectedIndex, offset);
    const distance = Math.abs(offset);
    return {
      key: offset,
      index,
      voice: VOICES[index],
      size: ORB_SIZE_BY_DISTANCE[distance],
      opacity: ORB_OPACITY_BY_DISTANCE[distance],
      distance,
    };
  });

  return (
    <div className="maties-ob-step flex w-full flex-col items-center">
      <h1 className="maties-headline text-center" style={{ fontSize: 'clamp(26px,3vw,36px)', letterSpacing: '-.016em' }}>
        {i18nService.t('matiesOnboardingVoiceTitle')}
      </h1>
      <p
        className="mt-[10px] text-center text-[#4a4f57] dark:text-[#c9ccd2]"
        style={{ fontFamily: 'Newsreader, Georgia, serif', fontSize: 16.5, lineHeight: 1.55 }}
      >
        {i18nService.t('matiesOnboardingVoiceLine').replace('{name}', assistantName)}
      </p>

      <div className="w-full overflow-hidden" style={{ marginTop: 'clamp(20px,3.2vh,34px)', padding: 'clamp(26px,4.5vh,44px) 0 clamp(24px,3vh,34px)' }}>
        <div className="flex items-center justify-center" style={{ width: '132%', marginLeft: '-16%', gap: 'clamp(14px,2.6vw,38px)' }}>
          {orbs.map((orb) => (
            <VoiceOrb
              key={orb.key}
              voice={orb.voice}
              size={orb.size}
              opacity={orb.opacity}
              selected={orb.distance === 0}
              label={i18nService.t(orb.voice.nameKey)}
              playLabel={i18nService.t('matiesOnboardingVoicePlay').replace('{voice}', i18nService.t(orb.voice.nameKey))}
              grainUrl={grain}
              onSelect={() => pick(orb.index)}
              onPlay={play}
            />
          ))}
        </div>

        <div className="flex items-start justify-center" style={{ width: '132%', marginLeft: '-16%', gap: 'clamp(14px,2.6vw,38px)', marginTop: 'clamp(22px,3.2vh,34px)' }}>
          {orbs.map((orb) => (
            <div key={orb.key} className="relative h-px shrink-0" style={{ width: orb.size }}>
              {orb.distance === 1 && (
                <div className="absolute left-1/2 top-0 flex -translate-x-1/2 flex-col items-center gap-[5px] text-center" style={{ width: 'min(210px,23vw)' }}>
                  <span className="text-[15px] text-[#4a4f57] dark:text-[#c9ccd2]">{i18nService.t(orb.voice.nameKey)}</span>
                  <span className="text-[13.5px] leading-[1.45] text-[#6b7280]" style={{ textWrap: 'pretty' }}>
                    {i18nService.t(orb.voice.lineKey)}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="flex items-start justify-center" style={{ gap: 'clamp(10px,2vw,26px)', marginTop: 'clamp(78px,9vh,104px)' }}>
          <button
            type="button"
            aria-label={i18nService.t('matiesOnboardingVoicePrevious')}
            title={i18nService.t('matiesOnboardingVoicePrevious')}
            onClick={() => pick(wrapVoiceIndex(selectedIndex, -1))}
            className="maties-ob-ghost-arrow mt-1 flex h-[30px] w-[30px] shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent"
          >
            <ChevronLeft />
          </button>
          <div className="flex shrink-0 flex-col items-center gap-[6px] text-center" style={{ width: 'min(280px,32vw)' }}>
            <span className="text-[16px] font-medium text-[#1c1f23] dark:text-[#f2f3f5]">{i18nService.t(selected.nameKey)}</span>
            <span className="text-[14px] leading-[1.5] text-[#4a4f57] dark:text-[#c9ccd2]" style={{ textWrap: 'pretty' }}>
              {i18nService.t(selected.lineKey)}
            </span>
          </div>
          <button
            type="button"
            aria-label={i18nService.t('matiesOnboardingVoiceNext')}
            title={i18nService.t('matiesOnboardingVoiceNext')}
            onClick={() => pick(wrapVoiceIndex(selectedIndex, 1))}
            className="maties-ob-ghost-arrow mt-1 flex h-[30px] w-[30px] shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent"
          >
            <ChevronRight />
          </button>
        </div>
      </div>
    </div>
  );
};

export default VoiceStep;
