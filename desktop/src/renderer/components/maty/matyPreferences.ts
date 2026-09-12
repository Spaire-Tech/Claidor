/**
 * The two small things the app remembers about cloud work, both of them the
 * person's own view and neither of them Claidor's business:
 *
 * - **where the next piece of work runs**, on this computer or in the cloud;
 * - **which finished jobs have been put away**, so the strip above the
 *   composer empties itself instead of growing forever. Nothing is deleted on
 *   Claidor; the app only stops drawing it.
 *
 * Both live in `localStorage`, both are read through a parser that treats
 * anything unexpected as the safe default, and a change is announced on the
 * window so every composer on screen agrees at once.
 */

import { MatyWorkPlace } from '@shared/maty/constants';

const WORK_PLACE_KEY = 'maties.maty.workPlace';
const PUT_AWAY_KEY = 'maties.maty.putAway';

/** Both composers listen for this, so the chip never disagrees with itself. */
export const MATY_PREFERENCES_CHANGED_EVENT = 'maties:maty-preferences-changed';

/** How many put-away ids are kept; the oldest fall off. */
export const MATY_PUT_AWAY_LIMIT = 100;

/** Pure: read the stored choice. Anything unexpected runs here, as always. */
export const parseMatyWorkPlace = (raw: unknown): MatyWorkPlace => (
  raw === MatyWorkPlace.Cloud ? MatyWorkPlace.Cloud : MatyWorkPlace.Here
);

/** Pure: read the stored put-away ids, dropping anything that is not one. */
export const parseMatyPutAway = (raw: unknown): string[] => {
  if (typeof raw !== 'string' || !raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const ids = parsed.filter((id): id is string => typeof id === 'string' && id.length > 0);
  return ids.slice(-MATY_PUT_AWAY_LIMIT);
};

/** Pure: the list after one more job is put away, newest last and capped. */
export const withMatyJobPutAway = (ids: readonly string[], jobId: string): string[] => (
  [...ids.filter((id) => id !== jobId), jobId].slice(-MATY_PUT_AWAY_LIMIT)
);

const readItem = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeItem = (key: string, value: string): void => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // A browser that refuses storage still runs the app; the choice simply
    // does not survive a restart.
  }
  window.dispatchEvent(new CustomEvent(MATY_PREFERENCES_CHANGED_EVENT));
};

export const getMatyWorkPlace = (): MatyWorkPlace => parseMatyWorkPlace(readItem(WORK_PLACE_KEY));

export const setMatyWorkPlace = (place: MatyWorkPlace): void => {
  writeItem(WORK_PLACE_KEY, place);
};

export const getMatyPutAway = (): string[] => parseMatyPutAway(readItem(PUT_AWAY_KEY));

export const putMatyJobAway = (jobId: string): void => {
  writeItem(PUT_AWAY_KEY, JSON.stringify(withMatyJobPutAway(getMatyPutAway(), jobId)));
};

export const onMatyPreferencesChanged = (callback: () => void): (() => void) => {
  window.addEventListener(MATY_PREFERENCES_CHANGED_EVENT, callback);
  return () => window.removeEventListener(MATY_PREFERENCES_CHANGED_EVENT, callback);
};
