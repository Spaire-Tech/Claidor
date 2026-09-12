import { app } from 'electron';
import fs from 'fs';
import path from 'path';

import { ComputerUseSkillId } from '../../shared/computerUse/constants';
import type { SqliteStore } from '../sqliteStore';

const SKILLS_DIR_NAME = 'SKILLs';
const SKILL_STATE_KEY = 'skills_state';

type SkillStateMap = Record<string, { enabled: boolean }>;

// Computer Use is switched off: its Windows runtime zip and its bundle are
// hosted on NetEase's CDN, and Maties must not fetch binaries from there.
// Restore the platform check below once Claidor hosts the files:
//   return process.platform === ComputerUseRuntime.Platform
//     && process.arch === ComputerUseRuntime.Arch;
export function isComputerUseKitSupportedPlatform(): boolean {
  return false;
}

/**
 * Whether the Computer Use tools may run. It used to depend on an installed
 * Kit; Kits are gone and the feature is off on every platform, so this is the
 * platform check alone.
 */
export function isComputerUseKitInstalled(): boolean {
  return isComputerUseKitSupportedPlatform();
}

function getUserComputerUseSkillDir(): string {
  return path.join(app.getPath('userData'), SKILLS_DIR_NAME, ComputerUseSkillId.BuiltIn);
}

export function removeComputerUseSkillArtifacts(store: SqliteStore): void {
  fs.rmSync(getUserComputerUseSkillDir(), { recursive: true, force: true });
  const stateMap = store.get<SkillStateMap>(SKILL_STATE_KEY) ?? {};
  delete stateMap[ComputerUseSkillId.BuiltIn];
  store.set(SKILL_STATE_KEY, stateMap);
}
