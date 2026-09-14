import { describe, expect, test } from 'vitest';

import { extractUserMessageFileAttachments } from '../../utils/userMessageFileAttachments';
import { attachmentLines, basenameOf, looksLikeFolder } from './attach';

const labels = { file: 'Input Files', folder: 'Input Folder' };

describe('attachmentLines', () => {
  test('one line per file, in the order they were added', () => {
    expect(attachmentLines(['/a/one.txt', '/a/two.txt'], labels)).toEqual([
      'Input Files: /a/one.txt',
      'Input Files: /a/two.txt',
    ]);
  });

  test('a folder is labelled as one', () => {
    expect(attachmentLines(['/Users/bass/Reports'], labels))
      .toEqual(['Input Folder: /Users/bass/Reports']);
  });

  test('nothing attached is no lines, not an empty label', () => {
    expect(attachmentLines([], labels)).toEqual([]);
    expect(attachmentLines(['  '], labels)).toEqual([]);
  });

  test('the app reads back exactly what this writes', () => {
    // The whole point of reusing the convention. If these two ever stop
    // agreeing, a person's attachment shows up as raw text in their own
    // message — which is the bug this shell already shipped once.
    const message = ['have a look at this', ...attachmentLines(['/a/Mango 3y IS.xlsx'], labels)].join('\n');
    const read = extractUserMessageFileAttachments(message);
    expect(read.text).toBe('have a look at this');
    expect(read.attachments).toEqual([
      { path: '/a/Mango 3y IS.xlsx', name: 'Mango 3y IS.xlsx', isDirectory: false },
    ]);
  });

  test('a path with spaces survives the round trip', () => {
    const message = attachmentLines(['/Users/bass/Desktop/Q4 board deck.pptx'], labels).join('\n');
    expect(extractUserMessageFileAttachments(message).attachments[0]?.path)
      .toBe('/Users/bass/Desktop/Q4 board deck.pptx');
  });
});

describe('the small pieces', () => {
  test('basenameOf works on either kind of computer', () => {
    expect(basenameOf('/a/b/c.txt')).toBe('c.txt');
    expect(basenameOf('C:\\a\\b\\c.txt')).toBe('c.txt');
    expect(basenameOf('/a/b/')).toBe('b');
  });

  test('a name with no extension reads as a folder', () => {
    expect(looksLikeFolder('/Users/bass/Reports')).toBe(true);
    expect(looksLikeFolder('/Users/bass/Reports/')).toBe(true);
    expect(looksLikeFolder('/Users/bass/a.txt')).toBe(false);
  });
});
