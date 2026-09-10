import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { useCallback, useEffect, useRef, useState } from 'react';

import { i18nService } from '../../services/i18n';
import { SchemaForm } from '../im/SchemaForm';

interface PluginConfigPageProps {
  pluginId: string;
  onBack: () => void;
  initialConfig?: Record<string, unknown>;
  onConfigChange: (pluginId: string, config: Record<string, unknown>) => void;
  onConfigLoaded: (pluginId: string, config: Record<string, unknown>) => void;
}

interface ConfigSchemaData {
  configSchema: Record<string, unknown>;
  uiHints: Record<string, {
    label?: string;
    help?: string;
    sensitive?: boolean;
    advanced?: boolean;
    placeholder?: string;
    order?: number;
  }>;
}

/** Deep-set a value in nested object by dot path, returning a new object */
function deepSet(obj: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const keys = path.split('.');
  const result = { ...obj };
  let current: Record<string, unknown> = result;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    const existing = current[key];
    current[key] = existing && typeof existing === 'object' && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
    current = current[key] as Record<string, unknown>;
  }

  const lastKey = keys[keys.length - 1];
  if (value === '' || value === undefined) {
    delete current[lastKey];
  } else {
    current[lastKey] = value;
  }

  return result;
}

export default function PluginConfigPage({ pluginId, onBack, initialConfig, onConfigChange, onConfigLoaded }: PluginConfigPageProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [schema, setSchema] = useState<ConfigSchemaData | null>(null);
  const [configValue, setConfigValue] = useState<Record<string, unknown>>(initialConfig ?? {});
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  // The parent echoes every local edit through initialConfig. Only its mount-time
  // presence decides whether the backend value should initialize this editor.
  const hasPendingConfigOnMountRef = useRef(initialConfig !== undefined);

  const loadSchema = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.electron?.plugins.getConfigSchema(pluginId);
      if (result?.success && result.schema) {
        setSchema(result.schema);
        const loadedConfig = result.config ?? {};
        // If parent already has a pending config for this plugin, use that instead
        if (!hasPendingConfigOnMountRef.current) {
          setConfigValue(loadedConfig);
        }
        // Notify parent about the initial config from backend
        onConfigLoaded(pluginId, loadedConfig);
      } else {
        setError(result?.error || i18nService.t('pluginsConfigLoadError'));
      }
    } catch {
      setError(i18nService.t('pluginsConfigLoadError'));
    }
    setLoading(false);
  }, [pluginId, onConfigLoaded]);

  useEffect(() => {
    loadSchema();
  }, [loadSchema]);

  const handleChange = (path: string, value: unknown) => {
    const next = deepSet(configValue, path, value);
    setConfigValue(next);
    onConfigChange(pluginId, next);
  };

  const handleToggleSecret = (path: string) => {
    setShowSecrets(prev => ({ ...prev, [path]: !prev[path] }));
  };

  return (
    <div className="space-y-6 px-1">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="maties-icon-button"
        >
          <ArrowLeftIcon className="h-5 w-5" />
        </button>
        <div>
          <h3 className="maties-row-title text-[15.5px]">
            {i18nService.t('pluginsConfigTitle')}
          </h3>
          <p className="maties-mono maties-caption">{pluginId}</p>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="maties-subtitle py-8 text-center">Loading...</div>
      ) : error ? (
        <div className="maties-caption maties-status-wrong maties-raised-2 rounded-[12px] p-4">
          {error}
        </div>
      ) : !schema ? (
        <div className="maties-subtitle py-8 text-center">
          {i18nService.t('pluginsConfigNoSchema')}
        </div>
      ) : (
        <div className="maties-card-row px-5 py-4">
          <SchemaForm
            schema={schema.configSchema}
            hints={schema.uiHints as Record<string, import('../im/SchemaForm').UiHint>}
            value={configValue}
            onChange={handleChange}
            showSecrets={showSecrets}
            onToggleSecret={handleToggleSecret}
          />
        </div>
      )}
    </div>
  );
}
