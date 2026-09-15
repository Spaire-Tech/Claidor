import { describe, expect, test } from 'vitest';

import { type Artifact, ArtifactTypeValue } from '../../types/artifact';
import { openFileTarget, sameFile } from './openFile';

const artifact = (id: string, filePath: string): Artifact => ({
  id,
  messageId: 'm1',
  sessionId: 's1',
  type: ArtifactTypeValue.Document,
  title: filePath,
  content: '',
  filePath,
  createdAt: 0,
});

describe('sameFile', () => {
  test('one side may be relative to the working folder', () => {
    expect(sameFile('/Users/bass/Work/report.docx', 'report.docx')).toBe(true);
    expect(sameFile('out/report.docx', '/Users/bass/Work/out/report.docx')).toBe(true);
  });

  test('a shared suffix is not the same file', () => {
    // `report.docx` is not `old-report.docx`; only a whole path segment matches.
    expect(sameFile('/Users/bass/Work/old-report.docx', 'report.docx')).toBe(false);
    expect(sameFile('', 'report.docx')).toBe(false);
  });
});

describe('openFileTarget', () => {
  const loaded = [artifact('a1', '/Users/bass/Work/report.docx')];
  const detected = [
    artifact('a1', 'report.docx'),
    artifact('a2', 'slides.pptx'),
  ];

  test('a file already in the panel is shown', () => {
    expect(openFileTarget('report.docx', loaded, detected))
      .toEqual({ kind: 'show', artifactId: 'a1' });
  });

  test('a file the detector saw but nobody loaded yet is loaded first', () => {
    expect(openFileTarget('/Users/bass/Work/slides.pptx', loaded, detected))
      .toEqual({ kind: 'load', artifact: detected[1] });
  });

  test('anything else goes to the operating system', () => {
    // A file the person attached, or a path nothing detected: there is no
    // artifact to draw, so the old behaviour is the right one.
    expect(openFileTarget('/Users/bass/Downloads/brief.pdf', loaded, detected))
      .toEqual({ kind: 'system' });
  });
});
