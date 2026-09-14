import { describe, expect, test } from 'vitest';

import { detailsLabel, splitReply } from './details';

const fenced = (summary: string, body: string, after = ''): string =>
  `${summary}\n\n\`\`\`details\n${body}\n\`\`\`${after ? `\n\n${after}` : ''}`;

describe('what stays in the conversation, and what collapses', () => {
  test('the prose is the answer and the fence is the bulk', () => {
    const result = splitReply(fenced(
      'Sixteen invoices came in overnight, all under £500 except two.',
      'INV-1201  Acme        £412.00\nINV-1202  Bartok Ltd  £3,980.00',
    ));
    expect(result.summary).toBe('Sixteen invoices came in overnight, all under £500 except two.');
    expect(result.details).toBe('INV-1201  Acme        £412.00\nINV-1202  Bartok Ltd  £3,980.00');
  });

  test('a sentence after the fence belongs with the answer', () => {
    // Dropping it would lose a line the agent meant the person to read.
    const result = splitReply(fenced('The two big ones:', 'a\nb', 'Want me to flag them?'));
    expect(result.summary).toBe('The two big ones:\n\nWant me to flag them?');
    expect(result.details).toBe('a\nb');
  });

  test('`detail` singular works too, and so does odd spacing', () => {
    const result = splitReply('Here you go.\n\n```  detail  \nrow one\n```');
    expect(result.details).toBe('row one');
  });

  test('an ordinary reply is untouched', () => {
    expect(splitReply('All done — it is on your desktop.'))
      .toEqual({ summary: 'All done — it is on your desktop.' });
  });

  test('a code block is not a details block', () => {
    const content = 'Try this:\n\n```bash\nls -la\n```';
    expect(splitReply(content)).toEqual({ summary: content });
  });
});

describe('the ways a reply can be malformed', () => {
  test('a fence with nothing before it stays whole', () => {
    // The answer IS the detail. Collapsing it would hide the entire
    // reply behind a disclosure triangle.
    const content = '```details\neverything the agent had to say\n```';
    expect(splitReply(content)).toEqual({ summary: content });
  });

  test('an unclosed fence stays whole', () => {
    // A reply cut off mid-stream would otherwise vanish into a collapsed
    // block that says nothing about what is inside it.
    const content = 'Here is the list.\n\n```details\nrow one\nrow two';
    expect(splitReply(content)).toEqual({ summary: content });
  });

  test('an empty fence collapses to nothing rather than an empty toggle', () => {
    const result = splitReply('Nothing much to report.\n\n```details\n\n```');
    expect(result.summary).toBe('Nothing much to report.');
    expect(result.details).toBeUndefined();
  });
});

describe('what the toggle says about itself', () => {
  test('it counts the lines rather than saying "show more"', () => {
    // "Show more" is a gamble, not a choice: it says nothing about what
    // is behind it.
    expect(detailsLabel('a\nb\nc')).toBe('Show 3 more lines');
    expect(detailsLabel('just the one')).toBe('Show the detail');
  });

  test('blank lines are not lines', () => {
    expect(detailsLabel('a\n\n\nb')).toBe('Show 2 more lines');
  });
});
