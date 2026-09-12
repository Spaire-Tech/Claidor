import { ipcMain } from 'electron';

import {
  MATY_PROMPT_MAX_LENGTH,
  type MatyActionResult,
  MatyIpc,
  MatyOutcome,
  type MatyState,
} from '../../../shared/maty/constants';
import type { MatyService } from '../../libs/maty/matyService';

export interface MatyHandlerDeps {
  getService: () => MatyService;
}

/** Job ids come from the renderer, so they are checked here. */
const requireJobId = (value: unknown): string => {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || text.length > 200) {
    throw new Error('Invalid job id.');
  }
  return text;
};

const requirePrompt = (value: unknown): string => {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) {
    throw new Error('There is nothing to send.');
  }
  if (text.length > MATY_PROMPT_MAX_LENGTH) {
    throw new Error('That is too long to send to the cloud.');
  }
  return text;
};

const failed = (service: MatyService, error: unknown): MatyActionResult => ({
  outcome: MatyOutcome.Failed,
  state: service.getState(),
  error: error instanceof Error ? error.message : String(error),
});

export function registerMatyIpcHandlers({ getService }: MatyHandlerDeps): void {
  ipcMain.handle(MatyIpc.GetState, (): MatyState => getService().getState());

  ipcMain.handle(MatyIpc.Refresh, async (): Promise<MatyState> => {
    const service = getService();
    try {
      return await service.refresh();
    } catch (error) {
      console.error('[Maty] could not read the cloud work:', error);
      return service.getState();
    }
  });

  ipcMain.handle(MatyIpc.Send, async (_event, prompt: unknown) => {
    const service = getService();
    try {
      return await service.send(requirePrompt(prompt));
    } catch (error) {
      console.error('[Maty] the work could not be sent:', error);
      return failed(service, error);
    }
  });

  ipcMain.handle(MatyIpc.GetJob, async (_event, jobId: unknown) => {
    const service = getService();
    try {
      return await service.getJob(requireJobId(jobId));
    } catch (error) {
      console.error('[Maty] the work could not be read:', error);
      return failed(service, error);
    }
  });

  ipcMain.handle(MatyIpc.Cancel, async (_event, jobId: unknown) => {
    const service = getService();
    try {
      return await service.cancel(requireJobId(jobId));
    } catch (error) {
      console.error('[Maty] the work could not be taken back:', error);
      return failed(service, error);
    }
  });
}
