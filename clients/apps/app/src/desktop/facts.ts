// What the Windows app says of itself and this PC: in About (the Mac's
// `AboutSimeon.versionInfo`, Account.swift's About) and in a report (the
// Mac's `MacFeedback.facts`, the core's `DeviceFacts.current`), from the
// facts the app hands the page and its main process.

import type { DeviceFacts } from '../core/feedback'
import type { Desktop, DesktopFacts } from './desktop'

/** The app's version as the Mac's report says it: "0.1.0 (7)", the version and the build. */
export function reportVersion(facts: DesktopFacts): string {
  return `${facts.version} (${facts.build})`
}

/**
 * The system and its version, as the Mac's "macOS 26.1": Windows' name from
 * its build (22000 and later is Windows 11, which still says 10.0), then the
 * version Windows gives (`os.release()`); Linux in the checks.
 */
export function systemVersion(platform: string, release: string): string {
  if (platform === 'win32') {
    const [major, , build] = release.split('.').map(Number)
    const name =
      major === 10 && (build ?? 0) >= 22_000
        ? 'Windows 11'
        : major === 10
          ? 'Windows 10'
          : 'Windows'
    return `${name} (${release})`
  }
  if (platform === 'linux') return `Linux ${release}`
  if (platform === 'darwin') return `Darwin ${release}`
  return `${platform} ${release}`
}

/** A report's facts in the Windows app: the app "Windows", its version and build, this PC's model, Windows' version, the language and the zone. */
export async function desktopDeviceFacts(
  desktop: Desktop,
  language: string,
  timeZone: string,
): Promise<DeviceFacts> {
  let device = ''
  try {
    device = await desktop.call('deviceModel')
  } catch {
    // Said as unknown: the report goes all the same.
  }
  return {
    platform: 'Windows',
    appVersion: reportVersion(desktop.facts),
    device: device.slice(0, 120),
    osVersion: systemVersion(
      desktop.facts.platform,
      desktop.facts.osVersion,
    ).slice(0, 64),
    language,
    timeZone,
  }
}

/** The logs the app keeps in its folder, for a report's diagnostics; none when the app doesn't answer. */
export async function desktopLogs(
  desktop: Desktop,
): Promise<{ name: string; text: string }[]> {
  try {
    return await desktop.call('readLogs')
  } catch {
    return []
  }
}

/** About's three lines in the Windows app: its version, its track and its system, in the Mac's words ("win32", as the Mac's "darwin"). */
export function aboutFacts(desktop: Desktop): {
  version: string
  track: string
  os: string
} {
  return {
    version: desktop.facts.version,
    track: desktop.facts.track,
    os: desktop.facts.platform,
  }
}
