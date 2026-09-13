/**
 * Work sent to the cloud engine, from the renderer's side
 * (docs/maties/cloud.md). The requests and the watching belong to the main
 * process; this is only the wire to it.
 */
import {
  EMPTY_MATY_STATE,
  type MatyActionResult,
  MatyOutcome,
  type MatyState,
} from '@shared/maty/constants';

const failure = (state: MatyState, error: unknown): MatyActionResult => ({
  outcome: MatyOutcome.Failed,
  state,
  error: error instanceof Error ? error.message : String(error),
});

export const matyService = {
  /** The last thing Claidor said, without asking it again. */
  async getState(): Promise<MatyState> {
    try {
      return await window.electron.maty.getState();
    } catch (error) {
      console.warn('[Maty] Could not read the cloud work', error);
      return EMPTY_MATY_STATE;
    }
  },

  async refresh(): Promise<MatyState> {
    try {
      return await window.electron.maty.refresh();
    } catch (error) {
      console.warn('[Maty] Could not reach Claidor for the cloud work', error);
      return EMPTY_MATY_STATE;
    }
  },

  async send(prompt: string): Promise<MatyActionResult> {
    try {
      return await window.electron.maty.send(prompt);
    } catch (error) {
      console.error('[Maty] The work could not be sent', error);
      return failure(EMPTY_MATY_STATE, error);
    }
  },

  async cancel(jobId: string): Promise<MatyActionResult> {
    try {
      return await window.electron.maty.cancel(jobId);
    } catch (error) {
      console.error('[Maty] The work could not be taken back', error);
      return failure(EMPTY_MATY_STATE, error);
    }
  },

  onChanged(callback: (state: MatyState) => void): () => void {
    return window.electron.maty.onChanged(callback);
  },
};
