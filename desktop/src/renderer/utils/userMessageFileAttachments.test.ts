import { describe, expect, test } from 'vitest';

import { extractUserMessageFileAttachments } from './userMessageFileAttachments';

// ─── Passthrough ────────────────────────────────────────────

describe('passthrough (no attachment lines)', () => {
  test('empty string', () => {
    const result = extractUserMessageFileAttachments('');
    expect(result.text).toBe('');
    expect(result.attachments).toEqual([]);
  });

  test('plain text unchanged', () => {
    const result = extractUserMessageFileAttachments('Summarize this document for me');
    expect(result.text).toBe('Summarize this document for me');
    expect(result.attachments).toEqual([]);
  });

  test('label with relative path is not extracted', () => {
    const content = 'Input Files: docs/readme.md';
    const result = extractUserMessageFileAttachments(content);
    expect(result.text).toBe(content);
    expect(result.attachments).toEqual([]);
  });

  test('label mentioned mid-sentence is not extracted', () => {
    const content = 'Mind the encoding of Input Files: /tmp/a.txt before reading';
    const result = extractUserMessageFileAttachments(content);
    // The trailing prose keeps this line matching as one long "path"; a path
    // like that fails the reveal stat-check gracefully. But a mid-line label
    // preceded by text must never match.
    expect(result.attachments).toEqual([]);
    expect(result.text).toBe(content);
  });

  test('markdown content unchanged', () => {
    const md = '## Plan\n\n- Step one\n- Step two';
    const result = extractUserMessageFileAttachments(md);
    expect(result.text).toBe(md);
    expect(result.attachments).toEqual([]);
  });
});

// ─── Extraction ─────────────────────────────────────────────

describe('file attachment extraction', () => {
  test('file line appended after prompt', () => {
    const result = extractUserMessageFileAttachments(
      'See what is wrong in this log\n\nInput Files: /Users/me/logs/swen-logs-20260810.txt',
    );
    expect(result.text).toBe('See what is wrong in this log');
    expect(result.attachments).toEqual([
      {
        path: '/Users/me/logs/swen-logs-20260810.txt',
        name: 'swen-logs-20260810.txt',
        isDirectory: false,
      },
    ]);
  });

  test('en labels', () => {
    const result = extractUserMessageFileAttachments(
      'Summarize these\n\nInput Files: /Users/me/report.pdf\nInput Folder: /Users/me/project',
    );
    expect(result.text).toBe('Summarize these');
    expect(result.attachments).toEqual([
      { path: '/Users/me/report.pdf', name: 'report.pdf', isDirectory: false },
      { path: '/Users/me/project', name: 'project', isDirectory: true },
    ]);
  });

  test('folder label wins over its file-label prefix', () => {
    const result = extractUserMessageFileAttachments('Input Folder: /Users/me/project');
    expect(result.text).toBe('');
    expect(result.attachments).toEqual([
      { path: '/Users/me/project', name: 'project', isDirectory: true },
    ]);
  });

  test('attachment-only message leaves empty text', () => {
    const result = extractUserMessageFileAttachments('Input Files: /tmp/a.csv\nInput Files: /tmp/b.csv');
    expect(result.text).toBe('');
    expect(result.attachments.map(a => a.name)).toEqual(['a.csv', 'b.csv']);
  });

  test('windows drive and UNC paths', () => {
    const result = extractUserMessageFileAttachments(
      String.raw`Input Files: C:\Users\me\Data Report.xlsx` + '\n' + String.raw`Input Files: \\server\share\a.docx`,
    );
    expect(result.attachments).toEqual([
      { path: String.raw`C:\Users\me\Data Report.xlsx`, name: 'Data Report.xlsx', isDirectory: false },
      { path: String.raw`\\server\share\a.docx`, name: 'a.docx', isDirectory: false },
    ]);
  });

  test('path with spaces is kept intact', () => {
    const result = extractUserMessageFileAttachments('Input Files: /Users/me/My Documents/final report.pdf');
    expect(result.attachments).toEqual([
      { path: '/Users/me/My Documents/final report.pdf', name: 'final report.pdf', isDirectory: false },
    ]);
  });

  test('Windows paths are deduped case-insensitively while POSIX paths preserve case', () => {
    const result = extractUserMessageFileAttachments(
      String.raw`Input Files: C:\tmp\a.txt` + '\n'
        + String.raw`Input Files: c:\TMP\A.TXT` + '\n'
        + 'Input Files: /tmp/a.txt\nInput Files: /TMP/A.TXT',
    );
    expect(result.attachments.map(attachment => attachment.path)).toEqual([
      String.raw`C:\tmp\a.txt`,
      '/tmp/a.txt',
      '/TMP/A.TXT',
    ]);
  });

  test('only strips the trailing generated block', () => {
    const result = extractUserMessageFileAttachments(
      'First paragraph\n\nSecond paragraph\n\nInput Files: /tmp/a.txt',
    );
    expect(result.text).toBe('First paragraph\n\nSecond paragraph');
    expect(result.attachments).toHaveLength(1);
  });

  test('attachment-looking lines in the body or a quote are preserved', () => {
    const content = 'Input Files: /tmp/a.txt\n\n> Input Files: /tmp/quoted.txt\n\nAnswer in French';
    const result = extractUserMessageFileAttachments(content);
    expect(result.text).toBe(content);
    expect(result.attachments).toEqual([]);
  });
});
