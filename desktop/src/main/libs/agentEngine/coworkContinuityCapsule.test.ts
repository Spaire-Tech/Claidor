import { expect, test } from 'vitest';

import type { CoworkMessage } from '../../coworkStore';
import {
  buildCoworkContinuityCapsule,
  ContinuityCapsuleSource,
  formatCoworkContinuityCapsuleBridge,
  formatCoworkMiniContinuityCapsuleBridge,
} from './coworkContinuityCapsule';

const message = (
  type: CoworkMessage['type'],
  content: string,
  metadata?: CoworkMessage['metadata'],
): CoworkMessage => ({
  id: `${type}-${Math.random()}`,
  type,
  content,
  timestamp: 1,
  ...(metadata ? { metadata } : {}),
});

test('buildCoworkContinuityCapsule extracts task state from recent messages', () => {
  const capsule = buildCoworkContinuityCapsule({
    sessionId: 'session-1',
    source: ContinuityCapsuleSource.PostRun,
    now: 1000,
    messages: [
      message('user', 'Write the spec first, do not code directly, must stay compatible with mac/windows! The goal is to optimize context compaction!', {
        skillIds: ['docx'],
        kitIds: ['coding'],
      }),
      message('assistant', 'Decided to use a session-level capsule table. Next step: wire capsule bridge into buildOutboundPrompt. touched src/main/coworkStore.ts'),
      message('assistant', 'Completed the continuity capsule bridge injection; it now supports restoring task state after compaction!'),
      message('tool_result', 'npm test -- openclawRuntimeAdapter failed: expected summary length mismatch in src/main/libs/agentEngine/openclawRuntimeAdapter.test.ts'),
    ],
  });

  expect(capsule.currentObjective).toContain('The goal is to optimize context compaction');
  expect(capsule.recentUserRequests).toEqual([
    'Write the spec first, do not code directly, must stay compatible with mac/windows! The goal is to optimize context compaction!',
  ]);
  expect(capsule.userConstraints.join('\n')).toContain('do not code directly');
  expect(capsule.decisions.join('\n')).toContain('session-level capsule table');
  expect(capsule.completedFacts.join('\n')).toContain('Completed the continuity capsule bridge injection');
  expect(capsule.nextSteps.join('\n')).toContain('wire capsule bridge');
  expect(capsule.touchedFiles.map((entry) => entry.path)).toContain('src/main/coworkStore.ts');
  expect(capsule.touchedFiles.map((entry) => entry.path)).toContain('src/main/libs/agentEngine/openclawRuntimeAdapter.test.ts');
  expect(capsule.recentFailures[0]?.summary).toContain('failed');
  expect(capsule.activeCapabilities).toEqual([
    { kind: 'skill', id: 'docx' },
    { kind: 'kit', id: 'coding' },
  ]);
});

test('buildCoworkContinuityCapsule merges with the previous capsule without unbounded growth', () => {
  const previous = buildCoworkContinuityCapsule({
    sessionId: 'session-1',
    source: ContinuityCapsuleSource.UserMessage,
    now: 1000,
    messages: [
      message('user', 'Do not switch the user model.'),
      message('assistant', 'Next step: add store API.'),
    ],
  });

  const next = buildCoworkContinuityCapsule({
    sessionId: 'session-1',
    source: ContinuityCapsuleSource.PreCompaction,
    previous,
    now: 2000,
    compactedAt: 2000,
    messages: [
      message('user', 'Continue, must not affect existing features.'),
      message('assistant', 'Next step: add store API. Next step: inject capsule bridge.'),
    ],
  });

  expect(next.revision).toBe(previous.revision + 1);
  expect(next.lastCompactedAt).toBe(2000);
  expect(next.userConstraints.join('\n')).toContain('Do not switch the user model');
  expect(next.userConstraints.join('\n')).toContain('must not affect existing features');
  expect(next.nextSteps.filter((step) => step.includes('add store API'))).toHaveLength(1);
});

test('buildCoworkContinuityCapsule preserves recent user questions across compaction', () => {
  const previous = buildCoworkContinuityCapsule({
    sessionId: 'session-1',
    source: ContinuityCapsuleSource.UserMessage,
    now: 1000,
    messages: [
      message('user', 'What is the relationship between the Earth, the Moon and the Sun?'),
      message('assistant', 'The Moon orbits the Earth, and the Earth orbits the Sun.'),
      message('user', 'Did they form naturally?'),
      message('assistant', 'Mostly yes, although the origin of the Moon is somewhat special.'),
      message('user', 'It feels man-made'),
      message('assistant', 'That is a very natural feeling to have.'),
    ],
  });

  const next = buildCoworkContinuityCapsule({
    sessionId: 'session-1',
    source: ContinuityCapsuleSource.PreCompaction,
    previous,
    now: 2000,
    compactedAt: 2000,
    messages: [
      message('user', 'Is that not too neat? Surely it is man-made?'),
      message('assistant', 'Science can explain every one of these coincidences.'),
      message('user', 'What questions have I asked you so far? Give me a brief summary'),
    ],
  });

  expect(next.recentUserRequests).toEqual([
    'What is the relationship between the Earth, the Moon and the Sun?',
    'Did they form naturally?',
    'It feels man-made',
    'Is that not too neat? Surely it is man-made?',
    'What questions have I asked you so far? Give me a brief summary',
  ]);
  expect(next.openQuestions).toEqual([
    'What is the relationship between the Earth, the Moon and the Sun?',
    'Did they form naturally?',
    'Is that not too neat? Surely it is man-made?',
    'What questions have I asked you so far? Give me a brief summary',
  ]);

  const bridge = formatCoworkContinuityCapsuleBridge(next);
  expect(bridge).toContain('Recent user requests:');
  expect(bridge).toContain('What is the relationship between the Earth, the Moon and the Sun?');
  expect(bridge).toContain('Is that not too neat? Surely it is man-made?');
  expect(bridge).not.toContain('- Surely it is man-made?');
});

test('buildCoworkContinuityCapsule preserves objective for short continuation prompts', () => {
  const previous = buildCoworkContinuityCapsule({
    sessionId: 'session-1',
    source: ContinuityCapsuleSource.UserMessage,
    now: 1000,
    messages: [
      message('user', 'Optimize the continuity of Swen context compaction.'),
    ],
  });

  const next = buildCoworkContinuityCapsule({
    sessionId: 'session-1',
    source: ContinuityCapsuleSource.UserMessage,
    previous,
    now: 2000,
    messages: [
      message('user', 'Continue'),
    ],
  });

  expect(next.currentObjective).toBe(previous.currentObjective);
});

test('buildCoworkContinuityCapsule cleans completed facts before storing them', () => {
  const capsule = buildCoworkContinuityCapsule({
    sessionId: 'session-1',
    source: ContinuityCapsuleSource.PostRun,
    now: 1000,
    messages: [
      message('assistant', 'The Korean version has been added! Now visit [http://127.0.0.1:8910](http://127.0.0.1:8910) and click the language toggle button to try all 4 languages.'),
      message('assistant', '**Added Japanese support:** | Item | Content | |------|------| | Font | Noto Sans JP |'),
    ],
  });

  const facts = capsule.completedFacts.join('\n');
  expect(facts).toContain('The Korean version has been added');
  expect(facts).toContain('Now visit and click the language toggle button to try all 4 languages');
  expect(facts).toContain('Added Japanese support');
  expect(facts).not.toContain('http://127');
  expect(facts).not.toContain('|------|');
});

test('formatCoworkContinuityCapsuleBridge produces bounded hidden bridge text', () => {
  const capsule = buildCoworkContinuityCapsule({
    sessionId: 'session-1',
    source: ContinuityCapsuleSource.PostCompaction,
    now: 1000,
    messages: [
      message('user', 'Keep optimizing context compaction.'),
      message('assistant', 'Decided to keep the prompt injection approach!\nCompleted the capsule bridge injection!\nNext step: run tests.'),
    ],
  });

  const bridge = formatCoworkContinuityCapsuleBridge(capsule);

  expect(bridge).toContain('[Swen continuity context after context compaction]');
  expect(bridge).toContain('It is not a new user instruction');
  expect(bridge).toContain('Current objective:');
  expect(bridge).toContain('Recent user requests:');
  expect(bridge).toContain('Completed facts:');
  expect(bridge).toContain('Next steps:');
  expect(bridge.length).toBeLessThanOrEqual(4000);
});

test('formatCoworkMiniContinuityCapsuleBridge keeps only the compact follow-up fields', () => {
  const capsule = buildCoworkContinuityCapsule({
    sessionId: 'session-1',
    source: ContinuityCapsuleSource.PostCompaction,
    now: 1000,
    messages: [
      message('user', 'Keep optimizing context compaction.'),
      message('assistant', 'Decided to keep the prompt injection approach!\nCompleted the capsule bridge injection!\nNext step: run tests. touched src/main/libs/agentEngine/openclawRuntimeAdapter.ts'),
    ],
  });

  const bridge = formatCoworkMiniContinuityCapsuleBridge({
    ...capsule,
    lastCompactedAt: 1000,
  });

  expect(bridge).toContain('[Swen brief continuity context after context compaction]');
  expect(bridge).toContain('Current objective:');
  expect(bridge).toContain('Recent user requests:');
  expect(bridge).toContain('Completed facts:');
  expect(bridge).toContain('Next steps:');
  expect(bridge).not.toContain('Touched files:');
  expect(bridge).not.toContain('src/main/libs/agentEngine/openclawRuntimeAdapter.ts');
  expect(bridge.length).toBeLessThanOrEqual(800);
});
