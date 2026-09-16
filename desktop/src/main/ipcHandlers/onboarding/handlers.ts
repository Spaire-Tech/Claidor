import { ipcMain } from 'electron';

import {
  OnboardingIpc,
  type OnboardingRunResult,
  type OnboardingStatus,
  OnboardingTask,
} from '../../../shared/onboarding/constants';
import {
  type MacTaskDeps,
  onboardingStatus,
  openOnboardingResult,
  runOnboardingTask,
} from '../../onboarding/macTasks';

/**
 * The bridge for the first step of onboarding. Three calls: what this
 * computer can do, do the one thing the person allowed, open what came
 * of it. Everything that decides anything is in `onboarding/macTasks.ts`.
 */

const isTask = (value: unknown): value is OnboardingTask => (
  typeof value === 'string' && (Object.values(OnboardingTask) as string[]).includes(value)
);

export function registerOnboardingIpcHandlers(deps: MacTaskDeps = {}): void {
  ipcMain.handle(OnboardingIpc.Status, async (): Promise<OnboardingStatus> => onboardingStatus(deps));

  ipcMain.handle(OnboardingIpc.RunTask, async (_event, task: unknown): Promise<OnboardingRunResult> => {
    if (!isTask(task)) return { ok: false, task: OnboardingTask.Notes, reason: 'No such task.' };
    return runOnboardingTask(task, deps);
  });

  ipcMain.handle(OnboardingIpc.OpenResult, async (_event, task: unknown, ref: unknown): Promise<void> => {
    if (!isTask(task)) return;
    try {
      await openOnboardingResult(task, typeof ref === 'string' ? ref : '', deps);
    } catch (error) {
      console.warn('[Onboarding] open result failed:', error instanceof Error ? error.message : error);
    }
  });
}
