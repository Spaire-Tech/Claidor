import { describe, expect, test } from 'vitest';

import { usageLine } from './account';

describe('the usage line', () => {
  test('says nothing rather than zero when there is no quota yet', () => {
    // A missing quota is not "0% used". Drawing an empty bar for it would
    // tell somebody their account is fine before anybody has asked.
    expect(usageLine(null).value).toBe('');
    expect(usageLine(null).fraction).toBeUndefined();
    expect(usageLine(undefined).fraction).toBeUndefined();
    expect(usageLine({ planName: 'Pro' }).value).toBe('');
  });

  test('a limit of zero is not a division', () => {
    expect(usageLine({ creditsLimit: 0, creditsUsed: 0 }).fraction).toBeUndefined();
  });

  test('reads as a percentage in the ordinary case', () => {
    const line = usageLine({ creditsLimit: 100, creditsUsed: 74 });
    expect(line.value).toBe('74%');
    expect(line.fraction).toBeCloseTo(0.74);
    expect(line.spent).toBe(false);
  });

  test('never rounds up to 100% while something is left', () => {
    // 99.6% used is not "all used", and somebody about to be cut off
    // should not be told they already have been.
    const line = usageLine({ creditsLimit: 1000, creditsUsed: 996 });
    expect(line.value).toBe('99%');
    expect(line.spent).toBe(false);
  });

  test('says so plainly once it is gone', () => {
    // The plan's audit: quota at 100% is undrawn in the canvas.
    const line = usageLine({ creditsLimit: 100, creditsUsed: 100 });
    expect(line.value).toBe('All used');
    expect(line.spent).toBe(true);
    expect(line.fraction).toBe(1);
  });

  test('an overdrawn account does not draw past the end of the bar', () => {
    const line = usageLine({ creditsLimit: 100, creditsUsed: 140 });
    expect(line.fraction).toBe(1);
    expect(line.spent).toBe(true);
  });

  test('uses the plan name when the server sent one', () => {
    expect(usageLine({ planName: 'Pro', creditsLimit: 10, creditsUsed: 1 }).title).toBe('Pro');
    expect(usageLine({ creditsLimit: 10, creditsUsed: 1 }).title).toBe('Usage');
  });
});
