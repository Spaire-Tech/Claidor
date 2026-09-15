import { describe, expect, test } from 'vitest';

import { attachmentFor, fileKindOf, isImagePath, peelAttachments, readableSize } from './attachment';
import { FileKind, Speaker, ThreadItemKind } from './types';

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

describe('the files a reply ends with', () => {
  const pack = [
    '[Q4 Board Deck.pdf](file:///Users/bass/Board/Q4%20Board%20Deck.pdf)',
    '[Q4 Model v3.xlsx](file:///Users/bass/Board/Q4%20Model%20v3.xlsx)',
    '[Q4 Board Memo.docx](file:///Users/bass/Board/Q4%20Board%20Memo.docx)',
  ];

  test('come off the end as one card each, after what was said', () => {
    // The founder: "send me the whole pack → all three."
    const peeled = peelAttachments(`Here it is — deck, model and the memo.\n${pack.join('\n')}`, meta);
    expect(peeled.text).toBe('Here it is — deck, model and the memo.');
    expect(peeled.attachments.map(one => one.name)).toEqual(['Q4 Board Deck.pdf', 'Q4 Model v3.xlsx', 'Q4 Board Memo.docx']);
    expect(peeled.attachments.map(one => one.file)).toEqual([FileKind.Pdf, FileKind.Excel, FileKind.Word]);
    expect(peeled.attachments.map(one => one.id)).toEqual(['m1:f0', 'm1:f1', 'm1:f2']);
    expect(peeled.attachments[0].path).toBe('/Users/bass/Board/Q4 Board Deck.pdf');
  });

  test('a bulleted list of files is the same three cards', () => {
    const peeled = peelAttachments(`Done.\n\n- ${pack[0]}\n- ${pack[1]}\n3. ${pack[2]}`, meta);
    expect(peeled.text).toBe('Done.');
    expect(peeled.attachments).toHaveLength(3);
  });

  test('a file named in the middle of a sentence is not a card', () => {
    const peeled = peelAttachments('The summary is in [report.docx](file:///tmp/report.docx), have a look.', meta);
    expect(peeled.attachments).toHaveLength(0);
    expect(peeled.text).toBe('The summary is in [report.docx](file:///tmp/report.docx), have a look.');
  });

  test('a file named but not found stops the peel', () => {
    const peeled = peelAttachments(`Here.\n[[mystery.docx]]\n${pack[0]}`, meta);
    expect(peeled.attachments).toHaveLength(1);
    expect(peeled.text).toBe('Here.\n[[mystery.docx]]');
  });

  test('a lone file keeps the message id, as it always has', () => {
    expect(peelAttachments(pack[0], meta).attachments[0].id).toBe('m1');
  });

  test('knows which icon a file gets', () => {
    expect(fileKindOf('/a/deck.PDF')).toBe(FileKind.Pdf);
    expect(fileKindOf('/a/memo.docx')).toBe(FileKind.Word);
    expect(fileKindOf('/a/model.xlsx')).toBe(FileKind.Excel);
    expect(fileKindOf('/a/talk.pptx')).toBe(FileKind.Slides);
    expect(fileKindOf('/a/notes.txt')).toBeUndefined();
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
