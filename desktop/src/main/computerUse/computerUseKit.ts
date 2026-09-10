import { app } from 'electron';
import fs from 'fs';
import path from 'path';

import {
  ComputerUseKitBundle,
  ComputerUseKitBundleIntegrity,
  ComputerUseKitId,
  ComputerUseKitMetadata,
  ComputerUseSkillId,
} from '../../shared/computerUse/constants';
import {
  type InstalledKitRecord,
  type InstalledKitSkills,
  type KitSkillMetadata,
  KitStoreKey,
} from '../../shared/kit/constants';
import type { SqliteStore } from '../sqliteStore';
import { ComputerUseRuntime } from './computerUseRuntime';

const SKILLS_DIR_NAME = 'SKILLs';
const SKILL_STATE_KEY = 'skills_state';
const COMPUTER_USE_KIT_ICON_URL = '';
const COMPUTER_USE_MCP_REF = {
  id: ComputerUseKitId.BuiltIn,
  name: 'Computer Use',
  description: 'Built-in local Windows desktop control MCP server.',
};

type InstalledKitsMap = Record<string, InstalledKitRecord>;
type SkillStateMap = Record<string, { enabled: boolean }>;

// The Computer Use kit is switched off: its Windows runtime zip and its kit
// bundle are hosted on NetEase's CDN, and Maties must not fetch binaries from
// there. Restore the platform check below once Claidor hosts the files:
//   return process.platform === ComputerUseRuntime.Platform
//     && process.arch === ComputerUseRuntime.Arch;
export function isComputerUseKitSupportedPlatform(): boolean {
  return false;
}

export function buildComputerUseMarketplaceKit(): Record<string, unknown> {
  return {
    id: ComputerUseKitId.BuiltIn,
    name: ComputerUseKitMetadata.Name,
    description: ComputerUseKitMetadata.Description,
    icon: COMPUTER_USE_KIT_ICON_URL,
    author: 'Maties',
    version: ComputerUseRuntime.Version,
    tryAsking: [
      {
        en: 'Open Notepad and type a short note',
      },
      {
        en: 'List the desktop applications I can control',
      },
    ],
    skills: {
      bundle: ComputerUseKitBundle.BuiltIn,
      bundleSha256: ComputerUseKitBundleIntegrity.Sha256,
      bundleSizeBytes: ComputerUseKitBundleIntegrity.SizeBytes,
      list: [
        {
          id: ComputerUseSkillId.BuiltIn,
          name: ComputerUseKitMetadata.SkillName,
          description: ComputerUseKitMetadata.SkillDescription,
        },
      ],
    },
    mcpServers: [COMPUTER_USE_MCP_REF],
    connectors: [],
  };
}

export function getInstalledKitsMap(store: SqliteStore): InstalledKitsMap {
  return store.get<InstalledKitsMap>(KitStoreKey.Installed) ?? {};
}

export function isComputerUseKitInstalled(store: SqliteStore): boolean {
  return isComputerUseKitSupportedPlatform()
    && Boolean(getInstalledKitsMap(store)[ComputerUseKitId.BuiltIn]);
}

export function buildInstalledComputerUseKitRecord(
  skillIds: string[],
  metadata: Record<string, KitSkillMetadata>,
): InstalledKitRecord {
  const skills: InstalledKitSkills = {
    skillIds,
    ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
  };
  return {
    id: ComputerUseKitId.BuiltIn,
    version: ComputerUseRuntime.Version,
    installedAt: Date.now(),
    skills,
    mcpServers: [COMPUTER_USE_MCP_REF],
    connectors: [],
  };
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
