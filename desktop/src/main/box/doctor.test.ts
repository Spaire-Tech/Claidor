import { execFileSync } from 'node:child_process';

import { describe, expect, test } from 'vitest';

import {
  BOX_CHECKS,
  buildDoctorScript,
  parseDoctorOutput,
  summarizeDoctor,
  type BoxCheck,
} from './doctor';

const FIELD = '\u001f';
const MARK = '__boxdoctor__';
const line = (id: string, value: string) => `${MARK}${id}${FIELD}${value}`;

describe('the checks themselves', () => {
  test('cover everything worth knowing about the box', () => {
    expect(BOX_CHECKS.map((c) => c.id)).toEqual([
      'machine-id',
      'chrome',
      'chrome-version',
      'dns',
      'clock',
      'dbus',
      'display',
      'vnc',
      'novnc',
      'compositor',
    ]);
  });

  /**
   * A box too broken to answer is exactly when this is worth running, so no
   * probe may fail the script it is part of.
   */
  test('every probe swallows its own failure', () => {
    for (const check of BOX_CHECKS) {
      expect(check.probe, check.id).toMatch(/\|\| true|&& echo|2>\/dev\/null/);
    }
  });
});

describe('one round trip, not ten', () => {
  /**
   * The measurement says the engine does not pipeline and cost is round trips
   * times RTT. Ten checks as ten calls would be ten times the latency for
   * nothing.
   */
  test('all the checks go up as a single script', () => {
    const script = buildDoctorScript();
    for (const check of BOX_CHECKS) {
      expect(script).toContain(check.id);
    }
  });

  test('the real script runs in a real shell and every check answers', () => {
    const stdout = execFileSync('sh', ['-c', buildDoctorScript()], { encoding: 'utf8' });
    const results = parseDoctorOutput(stdout);
    expect(results).toHaveLength(BOX_CHECKS.length);
    // Not one of them may come back as "the box did not answer".
    for (const result of results) {
      expect(result.detail, result.id).not.toBe('the box did not answer this check');
    }
  });

  test('a chatty probe cannot spill into the next check', () => {
    const noisy: BoxCheck[] = [
      {
        id: 'noisy',
        label: 'Noisy',
        probe: 'printf "one\\ntwo\\nthree\\n"',
        interpret: (raw) => ({ status: 'ok', detail: raw.trim() }),
      },
      {
        id: 'after',
        label: 'After',
        probe: 'echo intact',
        interpret: (raw) => ({ status: 'ok', detail: raw.trim() }),
      },
    ];
    const stdout = execFileSync('sh', ['-c', buildDoctorScript(noisy)], { encoding: 'utf8' });
    const results = parseDoctorOutput(stdout, noisy);
    expect(results[0].detail).toBe('one two three');
    expect(results[1].detail).toBe('intact');
  });
});

describe('reading the answers', () => {
  test('a check the box never answered is a failure, not a silent pass', () => {
    const results = parseDoctorOutput('', BOX_CHECKS);
    expect(results.every((r) => r.status === 'fail')).toBe(true);
    expect(results[0].detail).toBe('the box did not answer this check');
  });

  test('output that is not an answer is ignored', () => {
    const stdout = ['some stray warning', line('machine-id', 'abc123'), ''].join('\n');
    const result = parseDoctorOutput(stdout, [BOX_CHECKS[0]])[0];
    expect(result.status).toBe('ok');
    expect(result.detail).toBe('abc123');
  });

  test('an empty answer for a thing that must exist is a failure with a remedy', () => {
    const result = parseDoctorOutput(line('chrome', ''), [BOX_CHECKS[1]])[0];
    expect(result.status).toBe('fail');
    expect(result.remedy).toMatch(/Update the box/);
  });
});

describe('the clock', () => {
  const clockCheck = BOX_CHECKS.find((c) => c.id === 'clock')!;
  const at = (offsetSeconds: number) => String(Math.floor(Date.now() / 1000) + offsetSeconds);

  test('agreeing with this Mac is fine', () => {
    expect(clockCheck.interpret(at(0)).status).toBe('ok');
  });

  test('a small drift is worth knowing but not a problem', () => {
    expect(clockCheck.interpret(at(60)).status).toBe('warn');
  });

  /**
   * A clock this far out breaks TLS, and every sign-in then fails with a
   * certificate error that names nothing to do with the clock. Saying so here
   * is the whole point of the check.
   */
  test('a large drift is a failure that names what it will break', () => {
    const verdict = clockCheck.interpret(at(-3600));
    expect(verdict.status).toBe('fail');
    expect(verdict.remedy).toMatch(/certificate/i);
  });

  test('a box that will not say the time is a failure', () => {
    expect(clockCheck.interpret('').status).toBe('fail');
    expect(clockCheck.interpret('not a number').status).toBe('fail');
  });
});

describe('the Chrome version', () => {
  const versionCheck = BOX_CHECKS.find((c) => c.id === 'chrome-version')!;

  test('a current Chrome is fine', () => {
    expect(versionCheck.interpret('Google Chrome 141.0.7390.54').status).toBe('ok');
  });

  test('an old Chrome warns, because sites will refuse it', () => {
    const verdict = versionCheck.interpret('Chromium 98.0.4758.102');
    expect(verdict.status).toBe('warn');
    expect(verdict.remedy).toMatch(/Update the box/);
  });

  test('a Chrome that will not report its version is a failure', () => {
    expect(versionCheck.interpret('  ').status).toBe('fail');
  });
});

describe('the verdict a person reads first', () => {
  const result = (status: 'ok' | 'warn' | 'fail', label: string) => ({
    id: label, label, status, detail: '',
  });

  test('says it plainly when everything works', () => {
    expect(summarizeDoctor([result('ok', 'Chrome')])).toEqual({
      status: 'ok',
      summary: 'The box is healthy.',
    });
  });

  test('names the failures, and a failure outranks a warning', () => {
    const verdict = summarizeDoctor([result('warn', 'Screen sharing'), result('fail', 'DNS')]);
    expect(verdict.status).toBe('fail');
    expect(verdict.summary).toContain('DNS');
    expect(verdict.summary).not.toContain('Screen sharing');
  });

  test('names what to know when nothing is broken but something is off', () => {
    const verdict = summarizeDoctor([result('warn', 'Screen sharing')]);
    expect(verdict.status).toBe('warn');
    expect(verdict.summary).toContain('Screen sharing');
  });

  test('counts in the singular when there is one', () => {
    expect(summarizeDoctor([result('fail', 'DNS')]).summary).toMatch(/1 problem:/);
  });
});
