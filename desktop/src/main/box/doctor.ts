/**
 * box-doctor: what is wrong with the agent's computer, in one round trip.
 *
 * Every check is a shell probe that runs **inside the box**, so the naive
 * shape is one broker call per check. The measurement in
 * `docs/product/agent-computer-plan.md` §5 says the engine does not pipeline
 * and cost is round trips times RTT — ten checks would be ten times the
 * latency for no reason. So all of them go up as one script and come back as
 * one framed answer.
 *
 * A check never throws. A box that is too broken to answer is exactly when
 * this is worth running, so a probe that fails reports a failure rather than
 * taking the report down with it.
 */

export type BoxCheckStatus = 'ok' | 'warn' | 'fail';

export type BoxCheckResult = {
  id: string;
  label: string;
  status: BoxCheckStatus;
  detail: string;
  /** What a person can do about it, when there is something. */
  remedy?: string;
};

export type BoxCheck = {
  id: string;
  label: string;
  /**
   * A shell snippet that prints one line. It must not fail the whole script:
   * every probe ends with `|| true` or an explicit fallback.
   */
  probe: string;
  interpret: (raw: string) => { status: BoxCheckStatus; detail: string; remedy?: string };
};

/** Separates the fields of one probe's answer. ASCII unit separator: not in any path. */
const FIELD = '\u001f';
/** Marks the start of a probe's answer, so stray output cannot be mistaken for one. */
const MARK = '__boxdoctor__';

const missing = (what: string, remedy: string) => (raw: string) => (
  raw.trim()
    ? { status: 'ok' as const, detail: raw.trim() }
    : { status: 'fail' as const, detail: `${what} not found`, remedy }
);

/**
 * The checks, in the order a person reads them: is this a real machine, can it
 * browse, can it reach the world, does it agree what time it is, and is there
 * a desktop to watch.
 */
export const BOX_CHECKS: readonly BoxCheck[] = [
  {
    id: 'machine-id',
    label: 'Machine identity',
    probe: 'cat /etc/machine-id 2>/dev/null || cat /var/lib/dbus/machine-id 2>/dev/null || true',
    interpret: missing(
      'machine-id',
      'The box has no stable identity; some apps refuse to run. Reset the box.',
    ),
  },
  {
    id: 'chrome',
    label: 'Chrome',
    probe:
      '{ command -v google-chrome || command -v chromium || command -v chromium-browser; } 2>/dev/null || true',
    interpret: missing('Chrome', 'The box cannot browse. Update the box to a current template.'),
  },
  {
    id: 'chrome-version',
    label: 'Chrome version',
    probe:
      '{ google-chrome --version || chromium --version || chromium-browser --version; } 2>/dev/null || true',
    interpret: (raw) => {
      const text = raw.trim();
      if (!text) {
        return {
          status: 'fail',
          detail: 'Chrome will not report its version',
          remedy: 'Chrome is present but not runnable. Update the box.',
        };
      }
      const major = Number(/(\d+)\./.exec(text)?.[1] ?? 0);
      // A Chrome this old fails on sites that matter and takes the agent's
      // browsing down with it.
      if (major > 0 && major < 120) {
        return {
          status: 'warn',
          detail: text,
          remedy: 'This Chrome is old enough that some sites will refuse it. Update the box.',
        };
      }
      return { status: 'ok', detail: text };
    },
  },
  {
    id: 'dns',
    label: 'DNS',
    probe:
      '{ getent hosts example.com || nslookup example.com >/dev/null 2>&1 && echo resolved; } 2>/dev/null || true',
    interpret: (raw) => (
      raw.trim()
        ? { status: 'ok', detail: raw.trim().split('\n')[0] }
        : {
            status: 'fail',
            detail: 'cannot resolve example.com',
            remedy: 'The box cannot reach the internet. Reset the box.',
          }
    ),
  },
  {
    id: 'clock',
    label: 'Clock',
    probe: 'date -u +%s 2>/dev/null || true',
    interpret: (raw) => {
      const seconds = Number(raw.trim());
      if (!Number.isFinite(seconds) || seconds <= 0) {
        return { status: 'fail', detail: 'the box will not report the time' };
      }
      const driftSeconds = Math.abs(Math.floor(Date.now() / 1000) - seconds);
      if (driftSeconds > 300) {
        return {
          status: 'fail',
          // A clock this far out breaks TLS, so every sign-in fails with a
          // certificate error that names nothing to do with the clock.
          detail: `${driftSeconds}s away from this Mac`,
          remedy: 'Sign-ins will fail with certificate errors. Reset the box.',
        };
      }
      if (driftSeconds > 30) {
        return { status: 'warn', detail: `${driftSeconds}s away from this Mac` };
      }
      return { status: 'ok', detail: `within ${driftSeconds}s of this Mac` };
    },
  },
  {
    id: 'dbus',
    label: 'D-Bus',
    probe: '{ pgrep -x dbus-daemon >/dev/null 2>&1 && echo running; } || true',
    interpret: (raw) => (
      raw.trim()
        ? { status: 'ok', detail: 'running' }
        : {
            status: 'warn',
            detail: 'not running',
            // Chrome starts without it and then fails in ways that read as a
            // website problem, so it is worth naming here rather than later.
            remedy: 'Chrome may misbehave in ways that look like website faults.',
          }
    ),
  },
  {
    id: 'display',
    label: 'Screen',
    probe: '{ [ -n "$DISPLAY" ] && echo "$DISPLAY"; } || true',
    interpret: (raw) => (
      raw.trim()
        ? { status: 'ok', detail: raw.trim() }
        : {
            status: 'fail',
            detail: 'no DISPLAY',
            remedy: 'Nothing graphical can run and there is nothing to watch. Reset the box.',
          }
    ),
  },
  {
    id: 'vnc',
    label: 'Screen sharing',
    probe: '{ pgrep -f "vnc" >/dev/null 2>&1 && echo running; } || true',
    interpret: (raw) => (
      raw.trim()
        ? { status: 'ok', detail: 'running' }
        : { status: 'warn', detail: 'not running', remedy: 'You will not be able to watch the box.' }
    ),
  },
  {
    id: 'novnc',
    label: 'Screen sharing in the browser',
    probe: '{ pgrep -f "novnc\\|websockify" >/dev/null 2>&1 && echo running; } || true',
    interpret: (raw) => (
      raw.trim()
        ? { status: 'ok', detail: 'running' }
        : { status: 'warn', detail: 'not running', remedy: 'You will not be able to watch the box.' }
    ),
  },
  {
    id: 'compositor',
    label: 'Window manager',
    probe: '{ pgrep -f "mutter\\|openbox\\|i3\\|xfwm" >/dev/null 2>&1 && echo running; } || true',
    interpret: (raw) => (
      raw.trim()
        ? { status: 'ok', detail: 'running' }
        : {
            status: 'warn',
            detail: 'not running',
            remedy: 'Windows will have no frames and may not stack correctly.',
          }
    ),
  },
];

/**
 * One script for every check.
 *
 * Each probe's output is collapsed to a single line and printed behind a
 * marker, so output a probe did not mean to produce cannot be read as an
 * answer. `2>/dev/null` everywhere: a probe's complaint is not a result.
 */
export function buildDoctorScript(checks: readonly BoxCheck[] = BOX_CHECKS): string {
  return checks
    .map((check) => {
      // tr + head keeps a chatty probe from spilling into the next answer.
      const oneLine = `{ ${check.probe} ; } 2>/dev/null | tr '\\n' ' ' | head -c 400`;
      return `printf '%s' "${MARK}${check.id}${FIELD}"; ${oneLine}; printf '\\n'`;
    })
    .join('\n');
}

/**
 * Read the answers back.
 *
 * A check with no line at all is a failure, not a silent pass: the probe not
 * running is itself the finding.
 */
export function parseDoctorOutput(
  stdout: string,
  checks: readonly BoxCheck[] = BOX_CHECKS,
): BoxCheckResult[] {
  const answers = new Map<string, string>();
  for (const line of stdout.split('\n')) {
    if (!line.startsWith(MARK)) {
      continue;
    }
    const body = line.slice(MARK.length);
    const at = body.indexOf(FIELD);
    if (at === -1) {
      continue;
    }
    answers.set(body.slice(0, at), body.slice(at + 1));
  }

  return checks.map((check) => {
    const raw = answers.get(check.id);
    if (raw === undefined) {
      return {
        id: check.id,
        label: check.label,
        status: 'fail' as const,
        detail: 'the box did not answer this check',
      };
    }
    const verdict = check.interpret(raw);
    return {
      id: check.id,
      label: check.label,
      status: verdict.status,
      detail: verdict.detail,
      ...(verdict.remedy ? { remedy: verdict.remedy } : {}),
    };
  });
}

/** The one-line verdict a person reads first. */
export function summarizeDoctor(results: readonly BoxCheckResult[]): {
  status: BoxCheckStatus;
  summary: string;
} {
  const failed = results.filter((r) => r.status === 'fail');
  const warned = results.filter((r) => r.status === 'warn');
  if (failed.length > 0) {
    return {
      status: 'fail',
      summary: `${failed.length} problem${failed.length === 1 ? '' : 's'}: ${
        failed.map((r) => r.label).join(', ')
      }`,
    };
  }
  if (warned.length > 0) {
    return {
      status: 'warn',
      summary: `Working, with ${warned.length} thing${warned.length === 1 ? '' : 's'} to know: ${
        warned.map((r) => r.label).join(', ')
      }`,
    };
  }
  return { status: 'ok', summary: 'The box is healthy.' };
}
