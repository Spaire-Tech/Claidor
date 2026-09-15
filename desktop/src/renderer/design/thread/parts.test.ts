import { describe, expect, test } from 'vitest';

import {
  basename,
  filePathFromTarget,
  type KnownFile,
  type MessagePart,
  PartKind,
  splitMessageParts,
  targetIsFile,
} from './parts';

const kinds = (parts: readonly MessagePart[]): string[] => parts.map(p => p.kind);
const texts = (parts: readonly MessagePart[]): string[] => parts.map(p => p.text);

describe('the canvas marker', () => {
  test('the canvas\'s own message splits into three runs', () => {
    // docs/product/design/canvas.html, Perrin's thread, verbatim.
    const parts = splitMessageParts(
      "A first glance found [[Mango 3y IS.xlsx]] on your Desktop — looks like it may be open, there's a lock file.",
    );
    expect(kinds(parts)).toEqual([PartKind.Text, PartKind.File, PartKind.Text]);
    expect(texts(parts)).toEqual([
      'A first glance found ',
      'Mango 3y IS.xlsx',
      " on your Desktop — looks like it may be open, there's a lock file.",
    ]);
  });

  test('a message that is only a file name is one chip', () => {
    expect(splitMessageParts('[[notes.md]]')).toEqual([
      { kind: PartKind.File, text: 'notes.md' },
    ]);
  });

  test('a chip with no known file has nowhere to go, and says so by omission', () => {
    const [chip] = splitMessageParts('[[nowhere.txt]]');
    expect(chip.target).toBeUndefined();
  });

  test('a chip finds its real file when the conversation produced one', () => {
    const files: KnownFile[] = [{ name: 'Mango 3y IS.xlsx', path: '/Users/bass/Desktop/Mango 3y IS.xlsx' }];
    const [, chip] = splitMessageParts('Found [[Mango 3y IS.xlsx]] there.', files);
    expect(chip).toEqual({
      kind: PartKind.File,
      text: 'Mango 3y IS.xlsx',
      target: '/Users/bass/Desktop/Mango 3y IS.xlsx',
    });
  });
});

describe('what an engine actually writes', () => {
  test('a markdown file link becomes the chip, labelled as written', () => {
    // This is the message the founder was shown as a bare string.
    const parts = splitMessageParts(
      'Saved it: [Gym Routine.docx](file:///Users/bass/Desktop/Gym%20Routine.docx)',
    );
    expect(parts).toEqual([
      { kind: PartKind.Text, text: 'Saved it: ' },
      {
        kind: PartKind.File,
        text: 'Gym Routine.docx',
        target: '/Users/bass/Desktop/Gym Routine.docx',
      },
    ]);
  });

  test('a bare file URL is chipped by its name, not shown as a URL', () => {
    const [chip] = splitMessageParts('file:///Users/bass/Desktop/Gym%20Routine.docx');
    expect(chip.text).toBe('Gym Routine.docx');
    expect(chip.target).toBe('/Users/bass/Desktop/Gym Routine.docx');
  });

  test('a full stop after a path is punctuation, not part of the path', () => {
    const parts = splitMessageParts('It is at /Users/bass/notes.md.');
    expect(kinds(parts)).toEqual([PartKind.Text, PartKind.File, PartKind.Text]);
    expect(parts[1].target).toBe('/Users/bass/notes.md');
    expect(parts[2].text).toBe('.');
  });

  test('a windows path is a file too', () => {
    const [chip] = splitMessageParts('C:\\Users\\bass\\Desktop\\deck.pptx');
    expect(chip.kind).toBe(PartKind.File);
    expect(chip.text).toBe('deck.pptx');
  });

  test('a web page is a link, not a file', () => {
    const parts = splitMessageParts('See https://ohada.org/texts for the source.');
    expect(kinds(parts)).toEqual([PartKind.Text, PartKind.Link, PartKind.Text]);
    expect(parts[1].target).toBe('https://ohada.org/texts');
  });

  test('a markdown link to a page keeps its label and its href', () => {
    const [link] = splitMessageParts('[the register](https://example.com/a)');
    expect(link).toEqual({
      kind: PartKind.Link,
      text: 'the register',
      target: 'https://example.com/a',
    });
  });

  test('a file link with a space in the path is still one chip', () => {
    const parts = splitMessageParts('Here: [Gym Routine.docx](/Users/bass/Gym Routine.docx)');
    expect(kinds(parts)).toEqual([PartKind.Text, PartKind.File]);
    expect(parts[1].text).toBe('Gym Routine.docx');
    expect(parts[1].target).toBe('/Users/bass/Gym Routine.docx');
  });

  test('a code span is the same chip, because it is the same idea', () => {
    const parts = splitMessageParts('Run `npm test` first.');
    expect(kinds(parts)).toEqual([PartKind.Text, PartKind.Code, PartKind.Text]);
    expect(parts[1].text).toBe('npm test');
  });

  test('bold is bold, and never asterisks', () => {
    const parts = splitMessageParts('That one is **already done**.');
    expect(texts(parts)).toEqual(['That one is ', 'already done', '.']);
    expect(parts[1].strong).toBe(true);
    expect(parts.some(p => p.text.includes('*'))).toBe(false);
  });

  test('a URL inside a markdown link is matched once', () => {
    const parts = splitMessageParts('[here](https://example.com/x)');
    expect(parts).toHaveLength(1);
  });
});

describe('files the conversation produced', () => {
  const files: KnownFile[] = [
    { name: 'Gym Routine.docx', path: '/Users/bass/Desktop/Gym Routine.docx' },
    { name: 'Q4 board deck.pptx', path: '/Users/bass/Docs/Q4 board deck.pptx' },
  ];

  test('a file named in plain prose becomes a chip that opens it', () => {
    const parts = splitMessageParts('I saved Gym Routine.docx to your Desktop.', files);
    expect(kinds(parts)).toEqual([PartKind.Text, PartKind.File, PartKind.Text]);
    expect(parts[1].target).toBe('/Users/bass/Desktop/Gym Routine.docx');
  });

  test('the name is shown as the message wrote it', () => {
    const [, chip] = splitMessageParts('Saved gym routine.docx.', files);
    expect(chip.text).toBe('gym routine.docx');
    expect(chip.target).toBe('/Users/bass/Desktop/Gym Routine.docx');
  });

  test('two files in one sentence are two chips', () => {
    const parts = splitMessageParts('Gym Routine.docx and Q4 board deck.pptx are done.', files);
    expect(kinds(parts)).toEqual([PartKind.File, PartKind.Text, PartKind.File, PartKind.Text]);
  });

  test('prose with no known file in it is left entirely alone', () => {
    const parts = splitMessageParts('Nothing to report yet.', files);
    expect(parts).toEqual([{ kind: PartKind.Text, text: 'Nothing to report yet.' }]);
  });

  test('a known name inside an already-made chip is not chipped twice', () => {
    const parts = splitMessageParts('[[Gym Routine.docx]]', files);
    expect(parts).toHaveLength(1);
    expect(parts[0].kind).toBe(PartKind.File);
  });

  test('a short name is ignored, because a word is not a file', () => {
    const parts = splitMessageParts('That is a.b for now.', [{ name: 'a.b', path: '/tmp/a.b' }]);
    expect(kinds(parts)).toEqual([PartKind.Text]);
  });
});

describe('plain text', () => {
  test('a sentence with nothing in it is one run', () => {
    expect(splitMessageParts('Cleared the promotional threads.')).toEqual([
      { kind: PartKind.Text, text: 'Cleared the promotional threads.' },
    ]);
  });

  test('empty runs are dropped, as the canvas drops them', () => {
    expect(splitMessageParts('')).toEqual([]);
    expect(splitMessageParts('[[a.txt]][[b.txt]]')).toHaveLength(2);
  });
});

describe('the small pieces', () => {
  test('a file URL becomes a path a computer can open', () => {
    expect(filePathFromTarget('file:///Users/bass/a%20b.txt')).toBe('/Users/bass/a b.txt');
    expect(filePathFromTarget('file://localhost/tmp/x.txt')).toBe('/tmp/x.txt');
  });

  test('a lone stray percent does not lose the path', () => {
    expect(filePathFromTarget('file:///tmp/100%.txt')).toBe('/tmp/100%.txt');
  });

  test('basename works on either kind of computer', () => {
    expect(basename('/a/b/c.txt')).toBe('c.txt');
    expect(basename('C:\\a\\b\\c.txt')).toBe('c.txt');
    expect(basename('c.txt')).toBe('c.txt');
  });

  test('a file is a file and a page is not', () => {
    expect(targetIsFile('file:///a/b.txt')).toBe(true);
    expect(targetIsFile('/a/b.txt')).toBe(true);
    expect(targetIsFile('https://example.com/a')).toBe(false);
    expect(targetIsFile('https://example.com/a.pdf')).toBe(false);
  });
});

describe('links that point back into the app', () => {
  // `grok-bot-chat.md` §9: a deep-link pill to a settings row, and a
  // reference chip back to an earlier message. Ordinary markdown links
  // with our own scheme, so nothing new had to be invented in the parser
  // and an older build shows the label rather than punctuation.
  test('a settings pill knows which row it opens', () => {
    const parts = splitMessageParts(
      'You can change that in [Running things on this computer](faiser://settings/exec-policy).',
    );
    const pill = parts.find(one => one.kind === PartKind.Setting);
    expect(pill?.text).toBe('Running things on this computer');
    expect(pill?.app).toEqual({ kind: 'settings', id: 'exec-policy' });
    // The sentence carries on around it.
    expect(parts[parts.length - 1].text).toBe('.');
  });

  test('a pill to a row this build does not have is prose, not a dead pill', () => {
    // Somebody clicks a dead pill once and stops trusting the next one.
    // Checked against the same settingsFor() that draws the screen.
    const parts = splitMessageParts('Try [Hardware acceleration](faiser://settings/hardware-accel).');
    expect(parts.some(one => one.kind === PartKind.Setting)).toBe(false);
    expect(parts.map(one => one.text).join('')).toBe('Try Hardware acceleration.');
  });

  test('a reference chip jumps back to a message', () => {
    const parts = splitMessageParts('Like [the folder you named earlier](faiser://message/m-42).');
    const ref = parts.find(one => one.kind === PartKind.Ref);
    expect(ref?.text).toBe('the folder you named earlier');
    expect(ref?.app).toEqual({ kind: 'message', id: 'm-42' });
  });

  test('a bare app link falls back to its id as the label', () => {
    const parts = splitMessageParts('[](faiser://settings/memory)');
    expect(parts[0]).toMatchObject({ kind: PartKind.Setting, text: 'memory' });
  });

  test('it is not confused with a file or a web link', () => {
    const parts = splitMessageParts(
      '[a page](https://example.com) and [a file](file:///tmp/x.txt) and [a row](faiser://settings/memory)',
    );
    expect(parts.filter(one => one.kind === PartKind.Link)).toHaveLength(1);
    expect(parts.filter(one => one.kind === PartKind.File)).toHaveLength(1);
    expect(parts.filter(one => one.kind === PartKind.Setting)).toHaveLength(1);
  });
});
