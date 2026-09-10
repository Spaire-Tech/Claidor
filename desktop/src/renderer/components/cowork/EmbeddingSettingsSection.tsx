import React, { useState } from 'react';

import { i18nService } from '../../services/i18n';
import Switch from '../design/Switch';

interface EmbeddingSettingsSectionProps {
  embeddingEnabled: boolean;
  embeddingProvider: string;
  embeddingModel: string;
  embeddingVectorWeight: number;
  embeddingRemoteBaseUrl: string;
  embeddingRemoteApiKey: string;
  onEmbeddingEnabledChange: (value: boolean) => void;
  onEmbeddingProviderChange: (value: string) => void;
  onEmbeddingModelChange: (value: string) => void;
  onEmbeddingVectorWeightChange: (value: number) => void;
  onEmbeddingRemoteBaseUrlChange: (value: string) => void;
  onEmbeddingRemoteApiKeyChange: (value: string) => void;
}

const Field: React.FC<{ label: string; hint: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <div>
    <label className="maties-label mb-1.5 block">{label}</label>
    {children}
    <div className="maties-caption mt-1.5">{hint}</div>
  </div>
);

const EmbeddingSettingsSection: React.FC<EmbeddingSettingsSectionProps> = ({
  embeddingEnabled,
  embeddingProvider,
  embeddingModel,
  embeddingVectorWeight,
  embeddingRemoteBaseUrl,
  embeddingRemoteApiKey,
  onEmbeddingEnabledChange,
  onEmbeddingProviderChange,
  onEmbeddingModelChange,
  onEmbeddingVectorWeightChange,
  onEmbeddingRemoteBaseUrlChange,
  onEmbeddingRemoteApiKeyChange,
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <div className="maties-card-row space-y-4 px-5 py-4">
      <div className="flex items-center justify-between gap-6">
        <div className="min-w-0">
          <div className="maties-row-title">
            {i18nService.t('coworkMemoryEmbeddingEnabled')}
          </div>
          <div className="maties-row-desc">
            {i18nService.t('coworkMemoryEmbeddingEnabledHint')}
          </div>
        </div>
        <Switch
          checked={embeddingEnabled}
          label={i18nService.t('coworkMemoryEmbeddingEnabled')}
          onChange={() => onEmbeddingEnabledChange(!embeddingEnabled)}
        />
      </div>

      {embeddingEnabled && (
        <div className="maties-hairline-top space-y-4 pt-4">
          <Field
            label={i18nService.t('coworkMemoryEmbeddingProvider')}
            hint={i18nService.t('coworkMemoryEmbeddingProviderHint')}
          >
            <select
              value={embeddingProvider}
              onChange={(e) => onEmbeddingProviderChange(e.target.value)}
              className="maties-input"
            >
              <option value="openai">{i18nService.t('coworkMemoryEmbeddingProviderOpenai')}</option>
              <option value="gemini">{i18nService.t('coworkMemoryEmbeddingProviderGemini')}</option>
              <option value="voyage">{i18nService.t('coworkMemoryEmbeddingProviderVoyage')}</option>
              <option value="mistral">{i18nService.t('coworkMemoryEmbeddingProviderMistral')}</option>
              <option value="ollama">{i18nService.t('coworkMemoryEmbeddingProviderOllama')}</option>
            </select>
          </Field>

          <Field
            label={i18nService.t('coworkMemoryEmbeddingModel')}
            hint={i18nService.t('coworkMemoryEmbeddingModelHint')}
          >
            <input
              type="text"
              value={embeddingModel}
              onChange={(e) => onEmbeddingModelChange(e.target.value)}
              placeholder="text-embedding-3-large"
              className="maties-input maties-mono text-[13px]"
            />
          </Field>

          <Field
            label={i18nService.t('coworkMemoryEmbeddingRemoteBaseUrl')}
            hint={i18nService.t('coworkMemoryEmbeddingRemoteBaseUrlHint')}
          >
            <input
              type="text"
              value={embeddingRemoteBaseUrl}
              onChange={(e) => onEmbeddingRemoteBaseUrlChange(e.target.value)}
              placeholder="https://api.openai.com/v1"
              className="maties-input maties-mono text-[13px]"
            />
          </Field>

          <Field
            label={i18nService.t('coworkMemoryEmbeddingRemoteApiKey')}
            hint={i18nService.t('coworkMemoryEmbeddingRemoteApiKeyHint')}
          >
            <input
              type="password"
              value={embeddingRemoteApiKey}
              onChange={(e) => onEmbeddingRemoteApiKeyChange(e.target.value)}
              className="maties-input maties-mono text-[13px]"
            />
          </Field>

          <button
            type="button"
            onClick={() => setShowAdvanced((prev) => !prev)}
            className="maties-pill-sm is-link -ml-2"
          >
            {showAdvanced
              ? i18nService.t('coworkMemoryAdvancedHide')
              : i18nService.t('coworkMemoryAdvancedShow')}
          </button>

          {showAdvanced && (
            <Field
              label={`${i18nService.t('coworkMemoryEmbeddingWeight')}: ${embeddingVectorWeight.toFixed(2)}`}
              hint={i18nService.t('coworkMemoryEmbeddingWeightHint')}
            >
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={embeddingVectorWeight}
                onChange={(e) => onEmbeddingVectorWeightChange(Number(e.target.value))}
                className="w-full accent-[#0060d0]"
              />
            </Field>
          )}
        </div>
      )}
    </div>
  );
};

export default EmbeddingSettingsSection;
