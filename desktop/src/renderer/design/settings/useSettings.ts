import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';

import { type ProviderConfig, ProviderName } from '../../../shared/providers';
import {
  asExecPolicy,
  DEFAULT_EXEC_POLICY,
  type ExecPolicy,
} from '../../../shared/settings/constants';
import {
  ACCOUNT_MODELS,
  currentChoice,
  defaultModelIdFor,
  providersFor,
  storedKey,
} from '../../../shared/settings/models';
import type { SettingsInput } from '../../../shared/settings/rows';
import { authService } from '../../services/auth';
import { configService, ConfigServiceEvent } from '../../services/config';
import { coworkService } from '../../services/cowork';
import { providerModelsFromConfig } from '../../services/providerModels';
import { type RootState, store } from '../../store';
import { setAvailableModels, setDefaultSelectedModel } from '../../store/slices/modelSlice';
import { showToast } from '../../utils/localFileActions';
import { usageLine } from '../shell/account';

/**
 * Settings, connected.
 *
 * Every value here comes from somewhere real — the account, the app's own
 * config, the updater, the engine's approval policy — and every handler
 * writes somewhere real. Nothing on this screen is decoration, which is
 * the whole reason it has four tabs instead of the canvas's full set:
 * rows with nothing behind them are left out rather than mocked.
 */
export function useSettings(open: boolean): Omit<SettingsInput, never> {
  const user = useSelector((state: RootState) => state.auth.user);
  const quota = useSelector((state: RootState) => state.auth.quota);

  // The app's own config is already in the store — `coworkService.init()`
  // loads it at startup — so this reads it rather than asking again.
  const config = useSelector((state: RootState) => state.cowork.config);

  const [execPolicy, setExecPolicy] = useState<ExecPolicy>(DEFAULT_EXEC_POLICY);
  const [computerName, setComputerName] = useState<string>();
  const [version, setVersion] = useState<string>();
  const [updateNote, setUpdateNote] = useState<string>();
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  // The providers live in the app config rather than the cowork one, and
  // `configService` holds it in memory after startup. Kept in state so the
  // row redraws on a write; re-read on the service's own event so a change
  // made anywhere else does not leave this screen showing the old answer.
  const [providers, setProviders] = useState<Record<string, ProviderConfig>>(
    () => configService.getConfig().providers ?? {},
  );

  // Read once each time the screen opens rather than on a timer: these
  // are settings, and a settings screen that changes under somebody's
  // hand is worse than one that is a few seconds stale.
  useEffect(() => {
    if (!open) return undefined;
    let current = true;

    void window.electron?.settings?.getExecPolicy?.()
      .then(value => { if (current) setExecPolicy(asExecPolicy(value)); })
      .catch(() => { /* the default is the safe one */ });

    void window.electron?.appInfo?.getComputerName?.()
      .then(name => { if (current && name) setComputerName(name); })
      .catch(() => { /* the row is left out */ });

    void window.electron?.appInfo?.getVersion?.()
      .then(value => { if (current && value) setVersion(value); })
      .catch(() => { /* the row says "Version" */ });

    return () => { current = false; };
  }, [open]);

  // A provider picked but not yet given a key is a choice nobody can read
  // back out of the config — `currentChoice` sees no enabled key and
  // answers "the account", which would snap the select back under the
  // person's hand and hide the field they were about to type into. So the
  // pick is held here until the key lands, and dropped when the screen
  // closes.
  const [picked, setPicked] = useState<string>();
  useEffect(() => { if (!open) setPicked(undefined); }, [open]);

  // The Composio key lives beside the provider keys and is read the same
  // way, for the same reason.
  const [composioApiKey, setComposioApiKey] = useState<string>(
    () => configService.getConfig().composioApiKey ?? '',
  );

  useEffect(() => {
    const reread = () => {
      setProviders(configService.getConfig().providers ?? {});
      setComposioApiKey(configService.getConfig().composioApiKey ?? '');
    };
    reread();
    window.addEventListener(ConfigServiceEvent.Updated, reread);
    return () => window.removeEventListener(ConfigServiceEvent.Updated, reread);
  }, [open]);

  const onComposioApiKey = useCallback((apiKey: string) => {
    const next = apiKey.trim();
    setComposioApiKey(next);
    void configService.updateConfig({ composioApiKey: next }).catch(() => {
      setComposioApiKey(configService.getConfig().composioApiKey ?? '');
      showToast('That could not be saved.');
    });
  }, []);

  const modelChoice = picked ?? currentChoice(providers);
  const modelApiKey = modelChoice === ACCOUNT_MODELS ? '' : storedKey(providers, modelChoice);

  /**
   * A choice, written all the way down to the engine.
   *
   * Three writes, and all three are needed. The providers map says a key
   * exists. `model.defaultModel` and `defaultModelProvider` are what the
   * config sync actually resolves the engine's provider from
   * (`claudeSettings.ts:resolveMatchedProvider`) — it answers with the
   * account's server plan the moment that field still says
   * `lobsterai-server`, so without them the key would be stored, synced,
   * and never used. And the store is told, because `App.tsx` writes its
   * selected model back into the same config when it changes; leaving the
   * two out of step means the next thing that touches the picker undoes
   * this silently.
   */
  const writeProviders = useCallback((choice: string, apiKey: string) => {
    const current = configService.getConfig();
    const next = providersFor(current.providers, choice, apiKey);
    const modelId = defaultModelIdFor(next, choice);

    // Back on the account: the server plan's models are not in this config
    // — they arrive from the account — so the one already selected is the
    // one to name. With none loaded, leaving the fields alone is right:
    // `resolveMatchedProvider` falls back to the server plan on its own.
    const accountModel = store.getState().model.availableModels
      .find(one => one.isServerModel || one.providerKey === ProviderName.LobsteraiServer);
    const model = choice === ACCOUNT_MODELS
      ? (accountModel
        ? { defaultModel: accountModel.id, defaultModelProvider: ProviderName.LobsteraiServer }
        : undefined)
      : (modelId ? { defaultModel: modelId, defaultModelProvider: choice } : undefined);

    setProviders(next);
    void configService.updateConfig({
      providers: next,
      ...(model ? { model: { ...current.model, ...model } } : {}),
    }).then(() => {
      const listed = providerModelsFromConfig(next);
      store.dispatch(setAvailableModels(listed));
      const picked = choice === ACCOUNT_MODELS
        ? accountModel
        : listed.find(one => one.providerKey === choice && one.id === modelId);
      if (picked) store.dispatch(setDefaultSelectedModel(picked));
    }).catch(() => {
      setProviders(configService.getConfig().providers ?? {});
      showToast('That could not be saved.');
    });
  }, []);

  const onModelChoice = useCallback((choice: string) => {
    setPicked(choice === ACCOUNT_MODELS ? undefined : choice);
    // A provider with a key already stored takes effect on the pick alone.
    // One without gets an entry that is off until a key arrives, which is
    // what makes the field below it appear.
    writeProviders(choice, storedKey(configService.getConfig().providers, choice));
  }, [writeProviders]);

  const onModelApiKey = useCallback((apiKey: string) => {
    if (modelChoice === ACCOUNT_MODELS) return;
    writeProviders(modelChoice, apiKey);
  }, [modelChoice, writeProviders]);

  const onExecPolicy = useCallback((policy: ExecPolicy) => {
    // Optimistic, then corrected: the write re-runs the engine config
    // sync, which is the slow part, and a select that lags behind the
    // click reads as broken.
    setExecPolicy(policy);
    void window.electron?.settings?.setExecPolicy?.(policy)
      .then(result => {
        if (result?.success) return;
        setExecPolicy(asExecPolicy(result?.policy));
        showToast('That could not be saved. The engine still has the previous setting.');
      })
      .catch(() => {
        showToast('That could not be saved. The engine still has the previous setting.');
      });
  }, []);

  const onMemory = useCallback((enabled: boolean) => {
    void coworkService.updateConfig({ memoryEnabled: enabled }).then(ok => {
      if (!ok) showToast('That could not be saved.');
    });
  }, []);

  const onWorkingDirectory = useCallback(() => {
    void (async () => {
      const picked = await window.electron?.dialog?.selectDirectory?.();
      if (!picked?.success || !picked.path) return;
      const ok = await coworkService.updateConfig({ workingDirectory: picked.path });
      if (!ok) showToast('That folder could not be saved.');
    })();
  }, []);

  const onRefreshUsage = useCallback(() => {
    void authService.refreshQuota();
  }, []);

  const onCheckUpdates = useCallback(() => {
    setCheckingUpdate(true);
    void window.electron?.appUpdate?.checkNow?.({ manual: true })
      .then(result => {
        setUpdateNote(
          !result?.success
            ? (result?.error || 'That check did not go through.')
            : result.updateFound
              ? 'An update is ready to install.'
              : "You're up to date.",
        );
      })
      .catch(() => setUpdateNote('That check did not go through.'))
      .finally(() => setCheckingUpdate(false));
  }, []);

  const usage = useMemo(() => {
    const line = usageLine(quota);
    if (line.fraction === undefined) return undefined;
    return {
      fraction: line.fraction,
      value: line.value,
      desc: line.title,
    };
  }, [quota]);

  return {
    accountName: user?.nickname?.trim() || 'Account',
    // No address: the profile the server returns carries a nickname and
    // identifiers and no email (`authSlice.ts`). The canvas shows one; an
    // empty second line under somebody's name would be worse than none.
    ...(computerName ? { computerName } : {}),
    ...(config.workingDirectory ? { workingDirectory: config.workingDirectory } : {}),
    execPolicy,
    memoryEnabled: config.memoryEnabled,
    modelChoice,
    modelApiKey,
    composioApiKey,
    ...(usage ? { usage } : {}),
    ...(version ? { version } : {}),
    ...(updateNote ? { updateNote } : {}),
    checkingUpdate,
    onSignOut: () => { void authService.logout(); },
    onAddAccount: () => { void authService.login(); },
    onExecPolicy,
    onMemory,
    onModelChoice,
    onModelApiKey,
    onComposioApiKey,
    onWorkingDirectory,
    onRefreshUsage,
    onCheckUpdates,
  };
}
