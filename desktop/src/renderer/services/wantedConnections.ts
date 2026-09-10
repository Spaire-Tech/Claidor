/**
 * The connections a person asked to be told about (« Tell me when » on a
 * card that is not wired yet), kept as a list of catalogue ids under
 * `connections.wanted` in the kv store.
 */
import { OnboardingStoreKey } from '@shared/onboarding/constants';

const toIdList = (value: unknown): string[] => (
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
);

export const readWantedConnections = async (): Promise<string[]> => {
  try {
    return toIdList(await window.electron.store.get(OnboardingStoreKey.WantedConnections));
  } catch (error) {
    console.warn('[Connections] Could not read the wanted list', error);
    return [];
  }
};

/** Remembers the wish; returns the list as stored afterwards. */
export const addWantedConnection = async (id: string): Promise<string[]> => {
  const current = await readWantedConnections();
  if (current.includes(id)) return current;
  const next = [...current, id];
  await window.electron.store.set(OnboardingStoreKey.WantedConnections, next);
  return next;
};
