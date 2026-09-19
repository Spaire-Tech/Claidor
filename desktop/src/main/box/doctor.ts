/**
 * box-doctor: what is wrong with the agent's computer.
 *
 * Shaped by the spec (`sources/grok-bot-agent-computer.md` §5.4 and
 * `sources/grok-bot-debugging-the-box.md`), which is specific about three
 * things and we follow all three:
 *
 *  - **The check list** is canonical. Every probe below is one the spec names.
 *  - **The output shape** is `[box-doctor] PASS|FAIL <name>: <detail>` with a
 *    final `[box-doctor] SUMMARY`, and the run leaves its result at
 *    `/tmp/box-doctor.log`. That is not decoration: the spec has the agent run
 *    `box-doctor` over Shell and read that log itself, so the format is an
 *    interface, not our private business.
 *  - **Report the failing check, don't guess.** That is the whole reason it
 *    exists, and why each failure below carries what it will actually break.
 *
 * Two decisions of ours:
 *
 * **Every check runs in ONE call.** The measurement in this doc's Part Two §5
 * says the engine does not pipeline and cost is round trips times RTT; eleven
 * probes as eleven calls would be eleven times the latency for nothing.
 *
 * **The script decides PASS or FAIL in the box, not here.** It has to, or the
 * log it leaves behind would be empty of verdicts and the agent reading
 * `/tmp/box-doctor.log` would learn nothing. The one thing the box cannot know
 * by itself is what time it is *here*, so the host's clock is passed in.
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
  /** The name as it appears in the log line. */
  id: string;
  /** What a person reads. */
  label: string;
  /**
   * Shell that prints `PASS <detail>` or `FAIL <detail>` on one line.
   * It must never fail the script it is part of: a box too broken to answer is
   * exactly when this is worth running.
   */
  probe: string;
  /** Said when the check fails, in terms of what it breaks. */
  remedy?: string;
  /**
   * Turns a PASS into a warning when the detail says something worth knowing.
   * The log line stays PASS, because the spec's shape has only two states.
   */
  refine?: (detail: string) => { status: BoxCheckStatus; remedy?: string } | null;
};

export const BOX_DOCTOR_LOG = '/tmp/box-doctor.log';
const TAG = '[box-doctor]';
/** The spec's primary desktop. */
export const BOX_DISPLAY = ':1';

/** `printf` a verdict, from a value that may be empty. */
const verdictIfPresent = (command: string, ok: string, bad: string) => (
  `__v=$(${command} 2>/dev/null | tr '\\n' ' ' | head -c 300); `
  + `if [ -n "$__v" ]; then printf 'PASS ${ok}%s' "$__v"; else printf 'FAIL ${bad}'; fi`
);

/**
 * The canonical list. Order is the order a person reads it: is this a real
 * machine, can it browse, can it reach the world, does it agree what time it
 * is, and is there a desktop to watch.
 */
export const BOX_CHECKS: readonly BoxCheck[] = [
  {
    id: 'machine-id',
    label: 'Machine identity',
    probe: verdictIfPresent(
      '{ cat /etc/machine-id || cat /var/lib/dbus/machine-id; }',
      '', 'no /etc/machine-id',
    ),
    remedy: 'The box has no stable identity; some apps refuse to run. Update the box.',
  },
  {
    id: 'chrome',
    label: 'Chrome',
    probe: verdictIfPresent(
      '{ command -v google-chrome || command -v chromium || command -v chromium-browser; }',
      '', 'not installed',
    ),
    remedy: 'The box cannot browse at all. Update the box.',
  },
  {
    id: 'chrome-version',
    label: 'Chrome version',
    probe: verdictIfPresent(
      '{ google-chrome --version || chromium --version || chromium-browser --version; }',
      '', 'will not report a version',
    ),
    remedy: 'Chrome is present but not runnable. Update the box.',
    refine: (detail) => {
      const major = Number(/(\d+)\./.exec(detail)?.[1] ?? 0);
      // Below this, sites start refusing it, and the agent reads as stupid
      // when it is actually being turned away at the door.
      return major > 0 && major < 120
        ? { status: 'warn', remedy: 'Old enough that some sites will refuse it. Update the box.' }
        : null;
    },
  },
  {
    id: 'chrome-fds',
    label: 'Chrome file descriptors',
    // Chrome dies in ways that look like the page's fault when it runs out of
    // descriptors, so the spec has the doctor watch the ceiling.
    probe:
      "__l=$(ulimit -n 2>/dev/null); case \"$__l\" in ''|*[!0-9]*) printf 'PASS limit %s' \"${__l:-unknown}\";; *) "
      + "if [ \"$__l\" -lt 1024 ]; then printf 'FAIL only %s available' \"$__l\"; "
      + "else printf 'PASS %s available' \"$__l\"; fi;; esac",
    remedy: 'Chrome will crash under load in ways that look like website faults. Update the box.',
  },
  {
    id: 'dns',
    label: 'DNS and egress',
    probe: verdictIfPresent(
      '{ getent hosts example.com || { nslookup example.com >/dev/null 2>&1 && echo resolved; }; }',
      '', 'cannot resolve example.com',
    ),
    remedy: 'The box cannot reach the internet. Update the box.',
  },
  {
    id: 'clock',
    label: 'Clock',
    // $1 is this Mac's epoch, passed in: the box cannot know it.
    probe:
      "__n=$(date -u +%s 2>/dev/null); case \"$__n\" in ''|*[!0-9]*) printf 'FAIL the box will not report the time';; *) "
      + "__d=$((__n - ${1:-0})); [ $__d -lt 0 ] && __d=$((-__d)); "
      + "if [ $__d -gt 300 ]; then printf 'FAIL %ss away from this Mac' \"$__d\"; "
      + "else printf 'PASS within %ss of this Mac' \"$__d\"; fi;; esac",
    // A clock this far out breaks TLS, and every sign-in then fails with a
    // certificate error that names nothing to do with the clock.
    remedy: 'Sign-ins will fail with certificate errors that do not mention the clock. Update the box.',
    refine: (detail) => {
      const drift = Number(/within (\d+)s/.exec(detail)?.[1] ?? 0);
      return drift > 30 ? { status: 'warn' } : null;
    },
  },
  {
    id: 'dbus',
    label: 'D-Bus',
    probe:
      "if pgrep -x dbus-daemon >/dev/null 2>&1; then printf 'PASS running'; "
      + "else printf 'FAIL not running'; fi",
    remedy: 'Chrome will misbehave in ways that look like website faults.',
  },
  {
    id: 'display',
    label: 'Screen',
    // The spec's own diagnostic, on the spec's own display.
    probe:
      `if xdpyinfo -display ${BOX_DISPLAY} >/dev/null 2>&1; then printf 'PASS ${BOX_DISPLAY} responds'; `
      + `else printf 'FAIL ${BOX_DISPLAY} does not respond'; fi`,
    remedy: 'Nothing graphical can run and there is nothing to watch. Update the box.',
  },
  {
    id: 'x11vnc',
    label: 'Screen sharing',
    probe:
      // '[x]11vnc' cannot match the literal 'x11vnc' in this script's own
      // command line, which pgrep -f would otherwise find and call a pass.
      "if pgrep -f '[x]11vnc' >/dev/null 2>&1; then printf 'PASS running'; "
      + "else printf 'FAIL not listening'; fi",
    remedy: 'You will not be able to watch the box work.',
  },
  {
    id: 'novnc',
    label: 'Screen sharing in the browser',
    probe:
      "if pgrep -f '[n]ovnc\\|[w]ebsockify' >/dev/null 2>&1; then printf 'PASS running'; "
      + "else printf 'FAIL not listening'; fi",
    remedy: 'You will not be able to watch the box from a browser.',
  },
  {
    id: 'compositor',
    label: 'Window manager',
    probe:
      "if pgrep -f '[m]utter\\|[o]penbox\\|[x]fwm\\|[i]3\\|[p]icom' >/dev/null 2>&1; then printf 'PASS running'; "
      + "else printf 'FAIL not running'; fi",
    remedy: 'Windows will have no frames and may not stack correctly.',
  },
  {
    id: 'runtime',
    label: 'Where the box runs',
    // The debugging doc leads with this one: it decides where to look next.
    probe:
      "if [ -f /.dockerenv ]; then printf 'PASS local Docker container'; "
      + "else printf 'PASS brokered pod'; fi",
  },
];

/**
 * One script for every check, emitting the spec's own log shape and leaving it
 * at `/tmp/box-doctor.log` so the agent can read the last run itself.
 *
 * `hostEpochSeconds` is this Mac's clock, which the box has no way to know.
 */
export function buildDoctorScript(
  checks: readonly BoxCheck[] = BOX_CHECKS,
  hostEpochSeconds: number = Math.floor(Date.now() / 1000),
): string {
  const epoch = Math.floor(hostEpochSeconds);
  // Per-process scratch. A fixed name is a race: two doctors running at once
  // — a startup check and a person pressing the button — append to and count
  // each other's lines, and both reports come out wrong.
  const run = '/tmp/.box-doctor-run.$$';
  const lines = checks.map((check) => (
    // A subshell per probe, so one probe's variables or exit cannot touch the
    // next, and `$1` carries this Mac's clock for the one check that needs it.
    // The status and detail are split and reprinted here rather than matched
    // with sed: `[box-doctor]` is a character class to a regex, not a literal,
    // and a pattern that silently matches nothing loses every check.
    `( set -- ${epoch}; `
    + `__o=$({ ${check.probe} ; } 2>/dev/null || printf 'FAIL the probe did not run'); `
    + '__s=${__o%% *}; '
    + 'case "$__s" in PASS|FAIL) __d=${__o#* }; [ "$__d" = "$__o" ] && __d=""; ;; '
    + '*) __d=$__o; __s=FAIL; ;; esac; '
    + `printf '${TAG} %s ${check.id}: %s\\n' "$__s" "$__d" )`
  ));
  // Written to a scratch file first, so the SUMMARY can count the failures
  // that came before it, then copied to the log the spec says the agent reads.
  return [
    '{',
    lines.join('\n'),
    `} > ${run} 2>/dev/null`,
    `__fails=$(grep -c '^\\${'['}box-doctor\\] FAIL ' ${run} 2>/dev/null || true)`,
    `printf '${TAG} SUMMARY %s check(s) failed\\n' "\${__fails:-0}" >> ${run}`,
    `cp ${run} ${BOX_DOCTOR_LOG} 2>/dev/null || true`,
    `cat ${run}`,
    `rm -f ${run} 2>/dev/null || true`,
  ].join('\n');
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
  const answers = new Map<string, { passed: boolean; detail: string }>();
  const line = new RegExp(`^\\${'['}box-doctor\\] (PASS|FAIL) ([^:]+): ?(.*)$`);
  for (const raw of stdout.split('\n')) {
    const match = line.exec(raw.trim());
    if (match) {
      answers.set(match[2].trim(), { passed: match[1] === 'PASS', detail: match[3].trim() });
    }
  }

  return checks.map((check) => {
    const answer = answers.get(check.id);
    if (!answer) {
      return {
        id: check.id,
        label: check.label,
        status: 'fail' as const,
        detail: 'the box did not answer this check',
        ...(check.remedy ? { remedy: check.remedy } : {}),
      };
    }
    if (!answer.passed) {
      return {
        id: check.id,
        label: check.label,
        status: 'fail' as const,
        detail: answer.detail || 'failed',
        ...(check.remedy ? { remedy: check.remedy } : {}),
      };
    }
    const refined = check.refine?.(answer.detail) ?? null;
    return {
      id: check.id,
      label: check.label,
      status: refined?.status ?? 'ok',
      detail: answer.detail,
      ...(refined?.remedy ? { remedy: refined.remedy } : {}),
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
