/**
 * The cloud's state, for anything on screen that shows it. One subscription to
 * the main process per component; the main process is the only thing that asks
 * Claidor, so several of these cost nothing.
 */

import { EMPTY_MATY_STATE, type MatyState, MatyWorkPlace } from '@shared/maty/constants';
import { useEffect, useState } from 'react';

import { matyService } from '../../services/maty';
import { getMatyWorkPlace, onMatyPreferencesChanged } from './matyPreferences';

export const useMatyState = (): MatyState => {
  const [state, setState] = useState<MatyState>(EMPTY_MATY_STATE);

  useEffect(() => {
    let cancelled = false;
    const stop = matyService.onChanged((next) => {
      if (!cancelled) setState(next);
    });
    void matyService.getState().then((next) => {
      if (!cancelled) setState(next);
    });
    // One round to Claidor when the screen appears, so a job that finished
    // while the app was shut is already there.
    void matyService.refresh().then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
      stop();
    };
  }, []);

  return state;
};

/** Where the next piece of work runs, kept in step across every composer. */
export const useMatyWorkPlace = (): MatyWorkPlace => {
  const [place, setPlace] = useState<MatyWorkPlace>(() => getMatyWorkPlace());
  useEffect(() => onMatyPreferencesChanged(() => setPlace(getMatyWorkPlace())), []);
  return place;
};
