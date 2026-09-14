import { describe, expect, test } from 'vitest';

import { attachmentFor, isImagePath, readableSize } from './attachment';
import { Speaker, ThreadItemKind } from './types';

const meta = { id: 'm1', from: Speaker.Agent, at: 0 };
const files = [{ name: 'report.docx', path: '/Users/bass/Work/report.docx' }];

describe('when a message is a file rather than a sentence about one', () => {
  test('a bare link becomes an attachment', () => {
    const item = attachmentFor('[report.docx](file:///Users/bass/Work/report.docx)', meta);
    expect(item?.kind).toBe(ThreadItemKind.Attachment);
    expect(item?.name).toBe('report.docx');
    expect(item?.path).toBe('/Users/bass/Work/report.docx');
  });

  test('a trailing full stop does not make it a sentence', () => {
    // A model writes "[report.docx](…)." every time. Treating that as
    // prose would mean the card almost never appears.
    expect(attachmentFor('[report.docx](file:///Users/bass/Work/report.docx).', meta))
      .toBeTruthy();
    expect(attachmentFor('  [report.docx](file:///Users/bass/Work/report.docx) — ', meta))
      .toBeTruthy();
  });

  test('a file named in passing stays a sentence', () => {
    // The canvas's chip mechanism is not being replaced. Most messages
    // that mention a file have something to say about it.
    expect(attachmentFor(
      'The summary is in [report.docx](file:///Users/bass/Work/report.docx), have a look.',
      meta,
    )).toBeUndefined();
  });

  test('two files are a sentence, not one attachment', () => {
    expect(attachmentFor(
      '[a.txt](file:///tmp/a.txt) [b.txt](file:///tmp/b.txt)',
      meta,
    )).toBeUndefined();
  });

  test('a name the conversation knows resolves to its real path', () => {
    const item = attachmentFor('report.docx', meta, files);
    expect(item?.path).toBe('/Users/bass/Work/report.docx');
  });

  test('a file the conversation cannot find stays a sentence', () => {
    // Otherwise the card offers to open something that is not there.
    expect(attachmentFor('[[mystery.docx]]', meta)).toBeUndefined();
  });

  test('an image is marked so it can be shown rather than named', () => {
    expect(attachmentFor('[chart.png](file:///tmp/chart.png)', meta)?.image).toBe(true);
    expect(attachmentFor('[notes.txt](file:///tmp/notes.txt)', meta)?.image).toBeUndefined();
  });

  test('the sender comes through, for a group thread', () => {
    const item = attachmentFor('[a.txt](file:///tmp/a.txt)', {
      ...meta, agentId: 'design-lead', agentName: 'Perrin',
    });
    expect(item?.agentId).toBe('design-lead');
    expect(item?.agentName).toBe('Perrin');
  });

  test('an ordinary message is not an attachment', () => {
    expect(attachmentFor('Done — anything else?', meta)).toBeUndefined();
    expect(attachmentFor('', meta)).toBeUndefined();
  });
});

describe('isImagePath', () => {
  test('knows the ones worth looking at', () => {
    for (const path of ['/a/b.png', '/a/b.JPG', '/a/b.webp', '/a/b.svg']) {
      expect(isImagePath(path), path).toBe(true);
    }
    for (const path of ['/a/b.pdf', '/a/b.docx', '/a/pngfile']) {
      expect(isImagePath(path), path).toBe(false);
    }
  });
});

describe('readableSize', () => {
  test('reads like a person wrote it', () => {
    expect(readableSize(512)).toBe('512 B');
    expect(readableSize(1_468_006)).toBe('1.5 MB');
    expect(readableSize(23_400_000)).toBe('23 MB');
  });

  test('says nothing rather than claiming a file is empty', () => {
    // A card reading "0 B" next to a real document is worse than a card
    // that does not mention size.
    expect(readableSize(undefined)).toBeUndefined();
    expect(readableSize(Number.NaN)).toBeUndefined();
    expect(readableSize(-1)).toBeUndefined();
  });
});
