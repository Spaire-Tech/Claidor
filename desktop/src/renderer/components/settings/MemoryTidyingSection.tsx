import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { i18nService } from '../../services/i18n';
import Switch from '../design/Switch';
import ThemedSelect from '../ui/ThemedSelect';

interface MemoryTidyingSectionProps {
  enabled: boolean;
  frequency: string;
  onEnabledChange: (value: boolean) => void;
  onFrequencyChange: (value: string) => void;
}

/**
 * « When it tidies up » — the second half of Settings → Memory.
 *
 * The behaviour underneath is the background sweep that used to be called
 * Dreaming: on its own clock it reads the day's notes, keeps what matters and
 * drops the rest. The founder kept the behaviour and retired the name, the
 * mascot, the sleep phases and the separate tab; what is left is the switch,
 * the clock, and one plain line saying what it kept.
 */

const FREQUENCY_PRESETS = [
  { value: '0 3 * * *', labelKey: 'coworkMemoryDreamingFreqNightly3am' },
  { value: '0 0 * * *', labelKey: 'coworkMemoryDreamingFreqMidnight' },
  { value: '0 0,12 * * *', labelKey: 'coworkMemoryDreamingFreqTwiceDaily' },
  { value: '0 */6 * * *', labelKey: 'coworkMemoryDreamingFreqEvery6h' },
  { value: '0 3 * * 0', labelKey: 'coworkMemoryDreamingFreqWeekly' },
] as const;

const CUSTOM_VALUE = '__custom__';

const MemoryTidyingSection: React.FC<MemoryTidyingSectionProps> = ({
  enabled,
  frequency,
  onEnabledChange,
  onFrequencyChange,
}) => {
  const isPreset = useMemo(
    () => FREQUENCY_PRESETS.some((preset) => preset.value === frequency),
    [frequency],
  );
  const [customMode, setCustomMode] = useState(!isPreset);
  const [keptToday, setKeptToday] = useState<number | null>(null);

  useEffect(() => {
    setCustomMode(!isPreset);
  }, [isPreset]);

  const loadStatus = useCallback(async () => {
    try {
      const result = await window.electron.cowork.getDreamingStatus();
      if (result?.success && result.data) setKeptToday(result.data.promotedToday);
    } catch (error) {
      // The line under the switch is a nicety; the switch itself still works.
      console.debug('[Memory] could not read what the last tidy-up kept:', error);
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setKeptToday(null);
      return;
    }
    void loadStatus();
  }, [enabled, loadStatus]);

  const handleSelect = (value: string) => {
    if (value === CUSTOM_VALUE) {
      setCustomMode(true);
      return;
    }
    setCustomMode(false);
    onFrequencyChange(value);
  };

  return (
    <div className="maties-card-row space-y-4 px-5 py-4">
      <div className="flex items-center justify-between gap-6">
        <div className="min-w-0">
          <div className="maties-row-title">{i18nService.t('memoryTidyingTitle')}</div>
          <div className="maties-row-desc">{i18nService.t('memoryTidyingDescription')}</div>
        </div>
        <Switch
          checked={enabled}
          label={i18nService.t('memoryTidyingTitle')}
          onChange={() => onEnabledChange(!enabled)}
        />
      </div>

      {enabled && (
        <div className="maties-hairline-top space-y-4 pt-4">
          <div>
            <label className="maties-label mb-1.5 block" htmlFor="memory-tidying-when">
              {i18nService.t('memoryTidyingWhen')}
            </label>
            <ThemedSelect
              id="memory-tidying-when"
              value={customMode ? CUSTOM_VALUE : frequency}
              onChange={handleSelect}
              options={[
                ...FREQUENCY_PRESETS.map((preset) => ({
                  value: preset.value,
                  label: i18nService.t(preset.labelKey),
                })),
                { value: CUSTOM_VALUE, label: i18nService.t('coworkMemoryDreamingFreqCustom') },
              ]}
            />
          </div>

          {customMode && (
            <div>
              <label className="maties-label mb-1.5 block" htmlFor="memory-tidying-custom">
                {i18nService.t('coworkMemoryDreamingFreqCustom')}
              </label>
              <input
                id="memory-tidying-custom"
                type="text"
                value={frequency}
                onChange={(event) => onFrequencyChange(event.target.value)}
                placeholder={i18nService.t('coworkMemoryDreamingFreqCustomPlaceholder')}
                className="maties-input maties-mono"
              />
            </div>
          )}

          {keptToday !== null && (
            <p className="maties-caption">
              {i18nService.t('memoryTidyingKeptToday').replace('{count}', String(keptToday))}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default MemoryTidyingSection;
