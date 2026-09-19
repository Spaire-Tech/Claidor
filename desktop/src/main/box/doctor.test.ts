import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, test } from 'vitest';

import {
  BOX_CHECKS,
  BOX_DISPLAY,
  BOX_DOCTOR_LOG,
  buildDoctorScript,
  parseDoctorOutput,
  summarizeDoctor,
  type BoxCheck,
} from './doctor';

const tmpFiles: string[] = [];

afterAll(() => {
  for (const f of tmpFiles) {
    try {
      fs.rmSync(f, { force: true });
    } catch {
      // best effort
    }
  }
});

/**
 * Run the script the way the box will: from a file, so the parent command line
 * is the script and not a shell that happens to quote it.
 */
function runScriptFromFile(script: string): string {
  const file = path.join(os.tmpdir(), `doctor-${Math.random().toString(36).slice(2)}.sh`);
  tmpFiles.push(file);
  fs.writeFileSync(file, script);
  return execFileSync('sh', [file], { encoding: 'utf8' });
}

describe('the check list', () => {
  /** Canonical, from sources/grok-bot-agent-computer.md §5.4. */
  test('is the one the spec names', () => {
    expect(BOX_CHECKS.map((c) => c.id)).toEqual([
      'machine-id',
      'chrome',
      'chrome-version',
      'chrome-fds',
      'dns',
      'clock',
      'dbus',
      'display',
      'x11vnc',
      'novnc',
      'compositor',
      'runtime',
    ]);
  });

  test('checks the spec’s primary desktop, not whatever DISPLAY happens to say', () => {
    expect(BOX_DISPLAY).toBe(':1');
    expect(BOX_CHECKS.find((c) => c.id === 'display')!.probe).toContain('xdpyinfo -display :1');
  });

  test('every failure says what it will break, not just that it failed', () => {
    for (const check of BOX_CHECKS) {
      // 'runtime' reports which substrate; it cannot fail.
      if (check.id !== 'runtime') {
        expect(check.remedy, check.id).toBeTruthy();
      }
    }
  });
});

describe('the output shape', () => {
  /**
   * The spec has the agent run box-doctor over Shell and read the log itself,
   * so this format is an interface, not our private business.
   */
  test('is [box-doctor] PASS|FAIL <name>: <detail>, one per check, then a SUMMARY', () => {
    const stdout = runScriptFromFile(buildDoctorScript());
    const lines = stdout.trim().split('\n');
    expect(lines).toHaveLength(BOX_CHECKS.length + 1);
    for (const [index, check] of BOX_CHECKS.entries()) {
      expect(lines[index]).toMatch(
        new RegExp(`^\\[box-doctor\\] (PASS|FAIL) ${check.id}: `),
      );
    }
    expect(lines.at(-1)).toMatch(/^\[box-doctor\] SUMMARY \d+ check\(s\) failed$/);
  });

  test('counts the failures it actually printed', () => {
    const stdout = runScriptFromFile(buildDoctorScript());
    const printed = stdout.split('\n').filter((l) => l.startsWith('[box-doctor] FAIL ')).length;
    const summary = Number(/SUMMARY (\d+)/.exec(stdout)![1]);
    expect(summary).toBe(printed);
  });

  test('leaves its result where the spec says the agent will look for it', () => {
    expect(BOX_DOCTOR_LOG).toBe('/tmp/box-doctor.log');
    expect(buildDoctorScript()).toContain(BOX_DOCTOR_LOG);
  });
});

describe('one round trip, not twelve', () => {
  /**
   * The engine does not pipeline and cost is round trips times RTT, so twelve
   * probes as twelve calls would be twelve times the latency for nothing.
   */
  test('every check goes up in a single script', () => {
    const script = buildDoctorScript();
    for (const check of BOX_CHECKS) {
      expect(script).toContain(`${check.id}: `);
    }
  });

  test('a probe that blows up does not take the other checks down with it', () => {
    const checks: BoxCheck[] = [
      { id: 'broken', label: 'Broken', probe: 'exit 3', remedy: 'x' },
      { id: 'after', label: 'After', probe: "printf 'PASS intact'" },
    ];
    const results = parseDoctorOutput(runScriptFromFile(buildDoctorScript(checks)), checks);
    expect(results[0].status).toBe('fail');
    expect(results[1]).toMatchObject({ status: 'ok', detail: 'intact' });
  });

  test('a chatty probe cannot spill into the next check', () => {
    const checks: BoxCheck[] = [
      { id: 'noisy', label: 'Noisy', probe: "printf 'PASS one\\ntwo\\nthree'" },
      { id: 'after', label: 'After', probe: "printf 'PASS intact'" },
    ];
    const results = parseDoctorOutput(runScriptFromFile(buildDoctorScript(checks)), checks);
    expect(results[1]).toMatchObject({ status: 'ok', detail: 'intact' });
  });
});

describe('processes the doctor looks for', () => {
  /**
   * `pgrep -f` scans whole command lines, and the doctor script's own command
   * line names every process it hunts for. A naive pattern matches the doctor
   * itself, and x11vnc, noVNC and the compositor all report "running" on a box
   * where none of them is. The bracketed first letter is what stops that.
   */
  test('are not found by the doctor matching itself', () => {
    const stdout = runScriptFromFile(buildDoctorScript());
    // Nothing graphical runs in a test runner, so all three must say so.
    for (const id of ['x11vnc', 'novnc', 'compositor']) {
      expect(stdout, id).toMatch(new RegExp(`\\[box-doctor\\] FAIL ${id}: `));
    }
  });

  test('use a pattern that cannot match the script that contains it', () => {
    for (const id of ['x11vnc', 'novnc', 'compositor']) {
      const probe = BOX_CHECKS.find((c) => c.id === id)!.probe;
      expect(probe, id).toMatch(/pgrep -f '\[/);
    }
  });
});

describe('reading the answers', () => {
  test('a check the box never answered is a failure, not a silent pass', () => {
    const results = parseDoctorOutput('', BOX_CHECKS);
    expect(results.every((r) => r.status === 'fail')).toBe(true);
    expect(results[0].detail).toBe('the box did not answer this check');
  });

  test('output that is not an answer is ignored', () => {
    const stdout = 'some stray warning\n[box-doctor] PASS machine-id: abc123\n';
    expect(parseDoctorOutput(stdout, [BOX_CHECKS[0]])[0])
      .toMatchObject({ status: 'ok', detail: 'abc123' });
  });

  test('a failure carries the remedy from its check', () => {
    const result = parseDoctorOutput('[box-doctor] FAIL chrome: not installed', [BOX_CHECKS[1]])[0];
    expect(result.status).toBe('fail');
    expect(result.remedy).toMatch(/cannot browse/);
  });
});

describe('the two checks with a middle ground', () => {
  /**
   * The spec's log shape has only PASS and FAIL. A Chrome that is old, or a
   * clock that is slightly out, is neither — so the line stays PASS and the
   * report carries the warning.
   */
  test('an old Chrome passes the log line and warns in the report', () => {
    const result = parseDoctorOutput(
      '[box-doctor] PASS chrome-version: Chromium 98.0.4758.102',
      [BOX_CHECKS[2]],
    )[0];
    expect(result.status).toBe('warn');
    expect(result.remedy).toMatch(/refuse it/);
  });

  test('a current Chrome is simply fine', () => {
    expect(parseDoctorOutput(
      '[box-doctor] PASS chrome-version: Google Chrome 141.0.7390.54',
      [BOX_CHECKS[2]],
    )[0].status).toBe('ok');
  });

  test('a small clock drift warns; agreement does not', () => {
    const at = (s: string) => parseDoctorOutput(
      `[box-doctor] PASS clock: within ${s}s of this Mac`,
      [BOX_CHECKS.find((c) => c.id === 'clock')!],
    )[0].status;
    expect(at('0')).toBe('ok');
    expect(at('60')).toBe('warn');
  });

  /**
   * A clock this far out breaks TLS, and every sign-in then fails with a
   * certificate error that names nothing to do with the clock.
   */
  test('a large clock drift is a failure that names what it breaks', () => {
    const result = parseDoctorOutput(
      '[box-doctor] FAIL clock: 3600s away from this Mac',
      [BOX_CHECKS.find((c) => c.id === 'clock')!],
    )[0];
    expect(result.status).toBe('fail');
    expect(result.remedy).toMatch(/certificate/i);
  });

  test('the clock is measured against this Mac, which the box cannot know', () => {
    const stdout = runScriptFromFile(buildDoctorScript(BOX_CHECKS, 1_000_000_000));
    // A host clock set to 2001 must read as a very large drift, not agreement.
    expect(stdout).toMatch(/\[box-doctor\] FAIL clock: \d+s away from this Mac/);
  });
});

describe('the verdict a person reads first', () => {
  const result = (status: 'ok' | 'warn' | 'fail', label: string) => ({
    id: label, label, status, detail: '',
  });

  test('says it plainly when everything works', () => {
    expect(summarizeDoctor([result('ok', 'Chrome')]))
      .toEqual({ status: 'ok', summary: 'The box is healthy.' });
  });

  test('names the failures, and a failure outranks a warning', () => {
    const verdict = summarizeDoctor([result('warn', 'Screen sharing'), result('fail', 'DNS')]);
    expect(verdict.status).toBe('fail');
    expect(verdict.summary).toContain('DNS');
    expect(verdict.summary).not.toContain('Screen sharing');
  });

  test('counts in the singular when there is one', () => {
    expect(summarizeDoctor([result('fail', 'DNS')]).summary).toMatch(/1 problem:/);
  });
});
