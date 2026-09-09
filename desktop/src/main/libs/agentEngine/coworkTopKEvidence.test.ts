import { expect, test } from 'vitest';

import type { CoworkMessage } from '../../coworkStore';
import { ContinuityCapsuleSource, type CoworkContinuityCapsule } from './coworkContinuityCapsule';
import {
  buildCoworkTopKEvidenceBridge,
  buildCoworkTopKEvidenceBridgeResult,
} from './coworkTopKEvidence';

const message = (
  type: CoworkMessage['type'],
  content: string,
  timestamp: number,
  metadata?: CoworkMessage['metadata'],
): CoworkMessage => ({
  id: `${type}-${timestamp}`,
  type,
  content,
  timestamp,
  ...(metadata ? { metadata } : {}),
});

const makeCapsule = (overrides: Partial<CoworkContinuityCapsule> = {}): CoworkContinuityCapsule => ({
  version: 1,
  sessionId: 'session-1',
  revision: 1,
  updatedAt: 100,
  lastSource: ContinuityCapsuleSource.PostCompaction,
  lastCompactedAt: 100,
  currentObjective: 'Fix the failing bakery page test.',
  recentUserRequests: [],
  userConstraints: [],
  decisions: [],
  completedFacts: [],
  recentActions: [],
  touchedFiles: [{ path: 'src/pages/Bakery.tsx' }],
  keySymbols: [],
  verification: [],
  nextSteps: ['Investigate npm test failure.'],
  recentFailures: [],
  activeCapabilities: [],
  openQuestions: [],
  ...overrides,
});

test('top-k evidence bridge is skipped before compaction', () => {
  const bridge = buildCoworkTopKEvidenceBridge({
    sessionId: 'session-1',
    prompt: 'Continue with src/pages/Bakery.tsx',
    capsule: makeCapsule({ lastCompactedAt: undefined }),
    messages: [
      message('user', 'The test for src/pages/Bakery.tsx failed.', 1),
    ],
  });

  expect(bridge).toBe('');
});

test('top-k evidence bridge retrieves bounded matching historical evidence', () => {
  const result = buildCoworkTopKEvidenceBridgeResult({
    sessionId: 'session-1',
    prompt: 'Continue with the npm test failed in src/pages/Bakery.tsx',
    capsule: makeCapsule(),
    messages: [
      message('user', 'The user wants the bakery page to support switching between English and Japanese.', 1),
      message('tool_result', 'npm test failed in src/pages/Bakery.tsx: expected ja copy to be visible.', 2, {
        toolName: 'shell',
      }),
      message('assistant', 'Next step: fix the ja translation branch in src/pages/Bakery.tsx.', 3),
      message('user', 'Continue with the npm test failed in src/pages/Bakery.tsx', 101),
    ],
  });
  const bridge = result.bridge;

  expect(bridge).toContain('[Swen retrieved evidence after context compaction]');
  expect(bridge).toContain('tool result: shell');
  expect(bridge).toContain('src/pages/Bakery.tsx');
  expect(bridge).toContain('expected ja copy');
  expect(bridge).not.toContain('timestamp');
  expect(bridge.length).toBeLessThanOrEqual(2000);
  expect(result.diagnostics.candidateCount).toBe(3);
  expect(result.diagnostics.injectedCount).toBeGreaterThan(0);
  expect(result.diagnostics.bridgeLength).toBe(bridge.length);
});

test('top-k evidence bridge redacts sensitive-looking lines', () => {
  const bridge = buildCoworkTopKEvidenceBridge({
    sessionId: 'session-1',
    prompt: 'Continue with the api key error in src/pages/Bakery.tsx',
    capsule: makeCapsule(),
    messages: [
      message('tool_result', 'src/pages/Bakery.tsx failed\napiKey=super-secret-value\nerror: invalid config', 2, {
        toolName: 'shell',
      }),
    ],
  });

  expect(bridge).toContain('[redacted sensitive line]');
  expect(bridge).not.toContain('super-secret-value');
});

// Chinese fixtures kept on purpose (as \uXXXX escapes): this case proves the CJK
// n-gram tokeniser in coworkTopKEvidence still retrieves evidence for short
// Chinese follow-ups. Question: "Which company is on my English resume?";
// fact: "Trilingual switching works; resume/index.html supports zh/ja/EN".
const CJK_FOLLOW_UP_QUESTION = '\u6211\u82f1\u6587\u7248\u7b80\u5386\u7684\u516c\u53f8\u662f\u54ea\u5bb6\uff1f';
const CJK_COMPLETED_FACT = '\u4e09\u8bed\u5207\u6362\u5168\u90e8\u6b63\u5e38\uff0cresume/index.html \u652f\u6301\u4e2d\u6587\u3001\u65e5\u672c\u8a9e\u3001EN\uff0c\u82f1\u6587\u5185\u5bb9\u5728\u540c\u4e00\u4e2a\u6587\u4ef6\u4e2d\u3002';
const CJK_INTERIM_ANSWER = '\u4e09\u4e2a\u6309\u94ae\u90fd\u5728\uff0c\u9ed8\u8ba4\u4e2d\u6587\u3002\u70b9 EN \u6d4b\u8bd5\uff1a';
const CJK_FINAL_ANSWER = '\u4e09\u8bed\u5207\u6362\u5168\u90e8\u6b63\u5e38\u3002\u73b0\u5728 resume/index.html \u652f\u6301\u4e09\u79cd\u8bed\u8a00\uff1a\u4e2d\u6587\u3001\u65e5\u672c\u8a9e\u3001EN\u3002\u53f3\u4e0a\u89d2\u70b9\u51fb\u5373\u65f6\u5207\u6362\uff0c\u6240\u6709\u5185\u5bb9\u5168\u91cf\u66ff\u6362\u3002';
const CJK_FACT_KEY_PHRASE = '\u4e09\u8bed\u5207\u6362\u5168\u90e8\u6b63\u5e38';

test('top-k evidence bridge retrieves completed facts for short Chinese follow-up questions', () => {
  const result = buildCoworkTopKEvidenceBridgeResult({
    sessionId: 'session-1',
    prompt: CJK_FOLLOW_UP_QUESTION,
    capsule: makeCapsule({
      currentObjective: CJK_FOLLOW_UP_QUESTION,
      completedFacts: [
        CJK_COMPLETED_FACT,
      ],
      touchedFiles: [{ path: 'resume/index.html' }],
    }),
    messages: [
      message('assistant', CJK_INTERIM_ANSWER, 1),
      message('assistant', CJK_FINAL_ANSWER, 2),
      message('tool_result', 'total 56\n-rw-r--r-- 1 admin staff 28310 index.html', 3),
      message('user', CJK_FOLLOW_UP_QUESTION, 101),
    ],
  });

  expect(result.bridge).toContain(CJK_FACT_KEY_PHRASE);
  expect(result.bridge).toContain('EN');
  expect(result.bridge).toContain('resume/index.html');
  expect(result.diagnostics.injectedCount).toBeGreaterThan(0);
});
