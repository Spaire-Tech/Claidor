import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, test } from 'vitest';

import {
  AgentLegacyIdentityCleanupSkipReason,
  AgentLegacyIdentityCleanupStatus,
} from '../../shared/agent/constants';
import {
  cleanupLegacyAgentsMdIdentityBlockInWorkspace,
  removeLegacyAgentsMdIdentityBlock,
} from './openclawAgentsMdIdentityMigration';

const MARKER = '<!-- Swen managed: do not edit below this line -->';
// Byte-for-byte legacy heading older releases wrote ("## Identity (must follow)"); mirrors LEGACY_IDENTITY_TITLE in the product code.
const LEGACY_IDENTITY_TITLE = '## Identity\uff08\u5fc5\u987b\u9075\u5b88\uff09';

const buildLegacyAgentsMd = (legacyBody = 'Your name is "Little Translator".'): string => [
  '# AGENTS.md - Your Workspace',
  '',
  LEGACY_IDENTITY_TITLE,
  '',
  legacyBody,
  '',
  '---',
  '',
  'This folder is home. Treat it that way.',
  '',
  MARKER,
  '',
  '## System Prompt',
  '',
  'Be direct.',
  '',
].join('\n');

let tmpDirs: string[] = [];

afterEach(() => {
  for (const dir of tmpDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tmpDirs = [];
});

const makeTempWorkspace = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'swen-agents-md-migration-'));
  tmpDirs.push(dir);
  return dir;
};

describe('removeLegacyAgentsMdIdentityBlock', () => {
  test('removes the high-confidence legacy identity block and preserves managed content', () => {
    const result = removeLegacyAgentsMdIdentityBlock(buildLegacyAgentsMd());

    expect(result.changed).toBe(true);
    expect(result.nextContent).toContain('# AGENTS.md - Your Workspace');
    expect(result.nextContent).toContain('This folder is home. Treat it that way.');
    expect(result.nextContent).toContain(MARKER);
    expect(result.nextContent).toContain('## System Prompt');
    expect(result.nextContent).not.toContain(LEGACY_IDENTITY_TITLE);
    expect(result.nextContent).not.toContain('Little Translator');
  });

  test('removes the legacy block when there is no managed marker', () => {
    const result = removeLegacyAgentsMdIdentityBlock([
      '# AGENTS.md - Your Workspace',
      '',
      LEGACY_IDENTITY_TITLE,
      '',
      'legacy identity',
      '',
      '---',
      '',
      '## Session Startup',
      '',
      'Use runtime-provided startup context first.',
      '',
    ].join('\n'));

    expect(result.changed).toBe(true);
    expect(result.nextContent).toContain('## Session Startup');
    expect(result.nextContent).not.toContain('legacy identity');
  });

  test('keeps user-authored identity content that does not match the legacy template', () => {
    const content = [
      '# Project Rules',
      '',
      '## Identity',
      '',
      'This project calls the default branch trunk.',
      '',
    ].join('\n');
    const result = removeLegacyAgentsMdIdentityBlock(content);

    expect(result.changed).toBe(false);
    if (result.changed) {
      throw new Error('expected cleanup to be skipped');
    }
    expect(result.reason).toBe(AgentLegacyIdentityCleanupSkipReason.NoLegacyBlock);
    expect(result.nextContent).toBe(content);
  });

  test('does not remove a legacy title without a separator', () => {
    const content = [
      '# AGENTS.md - Your Workspace',
      '',
      LEGACY_IDENTITY_TITLE,
      '',
      'legacy identity',
      '',
      'This folder is home. Treat it that way.',
      '',
    ].join('\n');
    const result = removeLegacyAgentsMdIdentityBlock(content);

    expect(result.changed).toBe(false);
    if (result.changed) {
      throw new Error('expected cleanup to be skipped');
    }
    expect(result.reason).toBe(AgentLegacyIdentityCleanupSkipReason.LowConfidence);
    expect(result.nextContent).toBe(content);
  });

  test('does not remove a block when the separator is not followed by a known template anchor', () => {
    const content = [
      '# AGENTS.md - Your Workspace',
      '',
      LEGACY_IDENTITY_TITLE,
      '',
      'legacy identity',
      '',
      '---',
      '',
      'Keep this hand-written rule.',
      '',
    ].join('\n');
    const result = removeLegacyAgentsMdIdentityBlock(content);

    expect(result.changed).toBe(false);
    if (result.changed) {
      throw new Error('expected cleanup to be skipped');
    }
    expect(result.reason).toBe(AgentLegacyIdentityCleanupSkipReason.LowConfidence);
    expect(result.nextContent).toBe(content);
  });

  test('handles BOM, leading blank lines, and CRLF line endings', () => {
    const content = `\uFEFF\r\n\r\n${buildLegacyAgentsMd().replace(/\n/g, '\r\n')}`;
    const result = removeLegacyAgentsMdIdentityBlock(content);

    expect(result.changed).toBe(true);
    expect(result.nextContent).toContain('\r\n');
    expect(result.nextContent).not.toContain(LEGACY_IDENTITY_TITLE);
  });

  test('is idempotent after cleanup', () => {
    const first = removeLegacyAgentsMdIdentityBlock(buildLegacyAgentsMd());
    expect(first.changed).toBe(true);

    const second = removeLegacyAgentsMdIdentityBlock(first.nextContent);
    expect(second.changed).toBe(false);
    if (second.changed) {
      throw new Error('expected cleanup to be skipped');
    }
    expect(second.reason).toBe(AgentLegacyIdentityCleanupSkipReason.NoLegacyBlock);
  });

  test('does not remove an oversized legacy block', () => {
    const result = removeLegacyAgentsMdIdentityBlock(buildLegacyAgentsMd('x'.repeat(20_001)));

    expect(result.changed).toBe(false);
    if (result.changed) {
      throw new Error('expected cleanup to be skipped');
    }
    expect(result.reason).toBe(AgentLegacyIdentityCleanupSkipReason.LowConfidence);
  });
});

describe('cleanupLegacyAgentsMdIdentityBlockInWorkspace', () => {
  test('backs up the original AGENTS.md before writing the cleaned file', () => {
    const workspaceDir = makeTempWorkspace();
    const agentsMdPath = path.join(workspaceDir, 'AGENTS.md');
    const original = buildLegacyAgentsMd();
    fs.writeFileSync(agentsMdPath, original, 'utf8');

    const result = cleanupLegacyAgentsMdIdentityBlockInWorkspace(
      workspaceDir,
      new Date('2026-07-05T12:00:00.000Z'),
    );

    expect(result.status).toBe(AgentLegacyIdentityCleanupStatus.Cleaned);
    if (result.status !== AgentLegacyIdentityCleanupStatus.Cleaned) {
      throw new Error('expected cleanup to be cleaned');
    }
    expect(fs.readFileSync(agentsMdPath, 'utf8')).not.toContain(LEGACY_IDENTITY_TITLE);
    expect(fs.readFileSync(result.backupPath, 'utf8')).toBe(original);
    expect(result.backupPath).toContain(path.join('.swen', 'migrations'));
  });

  test('skips when AGENTS.md does not exist', () => {
    const result = cleanupLegacyAgentsMdIdentityBlockInWorkspace(makeTempWorkspace());

    expect(result).toEqual({
      status: AgentLegacyIdentityCleanupStatus.Skipped,
      reason: AgentLegacyIdentityCleanupSkipReason.NoAgentsMd,
    });
  });
});
