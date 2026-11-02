// The places on the person's PC that Simeon does not touch, whatever the
// local-computer setting says (SimeonMacCore's SensitivePaths.swift; the
// engine's shared/sensitive-local-paths.ts): keys and sign-ins. The Mac's
// list translated for Windows: the same dot folders under the home folder,
// the browsers' profiles, Windows' own credential and key folders, and the
// app's own data folder. Windows' names don't care about letter case, and
// a path may be written with either slash, `~`, `%USERPROFILE%`,
// `$env:USERPROFILE` or `$HOME`, so all of those are matched; the Mac
// matches letter case as written.

/** Where this PC keeps things (`os.homedir()`, `%APPDATA%`, `%LOCALAPPDATA%`, `%SystemRoot%`, the app's data folder). */
export interface SensitivePlaces {
  home: string
  appData: string
  localAppData: string
  systemRoot?: string
  dataFolder: string
}

type Base = 'home' | 'appData' | 'localAppData' | 'systemRoot'

/** One place, under one of the bases. */
interface Entry {
  base: Base
  path: string
}

/**
 * Relative to their base (`SENSITIVE_LOCAL_PATHS`, translated). The Mac's
 * `Library/…` places are Windows' AppData ones; `.docker` is the whole
 * folder (its contexts' keys too); `_netrc` is the name curl reads on
 * Windows; `Vault` and `Crypto` hold the same kind of keys as `Credentials`
 * and `Protect`. `/etc/shadow` becomes the registry's hives in
 * `System32\config`. The app's data folder is added by `entries`.
 */
export const windowsEntries: readonly Entry[] = [
  { base: 'home', path: '.ssh' },
  { base: 'home', path: '.gnupg' },
  { base: 'home', path: '.aws' },
  { base: 'home', path: '.azure' },
  { base: 'home', path: '.config/gcloud' },
  { base: 'home', path: '.kube' },
  { base: 'home', path: '.docker' },
  { base: 'home', path: '.netrc' },
  { base: 'home', path: '_netrc' },
  { base: 'home', path: '.npmrc' },
  { base: 'home', path: '.pypirc' },
  { base: 'home', path: '.simeon' },
  // The data folder's earlier name.
  { base: 'home', path: '.caisra' },
  { base: 'home', path: '.cursor' },
  { base: 'appData', path: 'Microsoft/Credentials' },
  { base: 'appData', path: 'Microsoft/Protect' },
  { base: 'appData', path: 'Microsoft/Vault' },
  { base: 'appData', path: 'Microsoft/Crypto' },
  { base: 'appData', path: 'gcloud' },
  { base: 'appData', path: 'Mozilla/Firefox' },
  { base: 'localAppData', path: 'Microsoft/Credentials' },
  { base: 'localAppData', path: 'Microsoft/Vault' },
  { base: 'localAppData', path: 'Google/Chrome' },
  { base: 'localAppData', path: 'Microsoft/Edge' },
  { base: 'localAppData', path: 'BraveSoftware' },
  { base: 'systemRoot', path: 'System32/config' },
]

/** A place, worked out for this PC: where it is (forward slashes, lower case), how the agent is told it, and its path from the home folder when it is under it. */
export interface Place {
  absolute: string
  shown: string
  fromHome?: string
}

const variable: Record<Base, string> = {
  home: '~',
  appData: '%APPDATA%',
  localAppData: '%LOCALAPPDATA%',
  systemRoot: '%SystemRoot%',
}

/** `\` and `/` as `/`, repeated ones as one (a leading `//` kept: a share), no trailing one. */
export function normalizeSlashes(value: string): string {
  let out = value.replace(/\\/g, '/')
  const share = out.startsWith('//')
  out = out.replace(/\/{2,}/g, '/')
  if (share) out = `/${out}`
  if (out.length > 1 && out.endsWith('/') && !/^[a-z]:\/$/i.test(out)) out = out.slice(0, -1)
  return out
}

/**
 * A path as Windows reads it, for comparing: forward slashes, lower case,
 * `.` and `..` worked out, each name without the dots and spaces Windows
 * drops from its end or a stream after `:`; `\\?\` and `\\.\` taken off, a
 * share on this PC (`\\localhost\c$\…`) as its drive.
 */
export function canonical(value: string): string {
  let out = normalizeSlashes(value).toLowerCase()
  out = out.replace(/^\/\/[?.]\/unc\//, '//')
  out = out.replace(/^\/\/[?.]\//, '')
  out = out.replace(/^\/\/(?:localhost|127\.0\.0\.1|\.|\?)\/([a-z])\$(?=\/|$)/, '$1:')
  const drive = /^([a-z]:)(.*)$/.exec(out)
  const share = out.startsWith('//')
  const head = drive ? drive[1] : share ? '/' : out.startsWith('/') ? '' : undefined
  const rest = drive ? (drive[2] ?? '') : out
  const names: string[] = []
  for (const raw of rest.split('/')) {
    if (raw === '' || raw === '.') continue
    if (raw === '..') {
      names.pop()
      continue
    }
    // A stream (`name:stream`) is the file's; Windows drops trailing dots and spaces.
    const name = raw.replace(/:.*$/, '').replace(/[. ]+$/, '')
    if (name === '' || name === '.') continue
    names.push(name)
  }
  if (head === undefined) return names.join('/')
  return `${head}/${names.join('/')}`
}

/** The drive a path is on (`c:`), or nothing (a Linux path in the checks). */
function driveOf(value: string): string {
  return /^([a-z]:)/i.exec(value)?.[1]?.toLowerCase() ?? ''
}

function isAbsolute(value: string): boolean {
  return /^[a-z]:\//i.test(value) || value.startsWith('/')
}

function under(target: string, root: string): boolean {
  if (root === '') return false
  return target === root || target.startsWith(root.endsWith('/') ? root : `${root}/`)
}

/** Every place on this PC, the app's data folder last. */
export function places(of: SensitivePlaces): Place[] {
  const home = canonical(of.home)
  const bases: Record<Base, string | undefined> = {
    home: of.home,
    appData: of.appData,
    localAppData: of.localAppData,
    systemRoot: of.systemRoot,
  }
  const out: Place[] = []
  const add = (absolute: string, shown: string) => {
    const fromHome = under(absolute, home) && absolute !== home ? absolute.slice(home.length + 1) : undefined
    out.push({ absolute, shown, fromHome })
  }
  for (const entry of windowsEntries) {
    const base = bases[entry.base]
    if (!base) continue
    const absolute = canonical(`${base}/${entry.path}`)
    add(absolute, `${variable[entry.base]}\\${entry.path.replace(/\//g, '\\')}`)
  }
  // The app's data folder: `%APPDATA%\Simeon` as Windows names it, else where it is (a check's own folder).
  const data = canonical(of.dataFolder)
  const appData = canonical(of.appData)
  let shownData = of.dataFolder
  if (under(data, appData) && data !== appData) {
    const names = normalizeSlashes(of.dataFolder).split('/')
    const depth = data.split('/').length - appData.split('/').length
    shownData = `%APPDATA%\\${names.slice(-depth).join('\\')}`
  }
  add(data, shownData)
  return out
}

/** A word that starts at `index` (nothing of a name just before it). */
function startsWord(value: string, index: number, word: string): boolean {
  if (value.slice(index, index + word.length).toLowerCase() !== word.toLowerCase()) return false
  const after = value[index + word.length]
  return after === undefined || !/[A-Za-z0-9_]/.test(after)
}

/**
 * The forms of a base folder a path or a command may name it by, each with
 * the folder it means: `~`, `$HOME`, `${HOME}`, `$env:USERPROFILE`,
 * `${env:USERPROFILE}`, `%USERPROFILE%`, `%HOMEDRIVE%%HOMEPATH%`, and the
 * same for `APPDATA`, `LOCALAPPDATA`, `SystemRoot` and `windir`.
 */
function forms(of: SensitivePlaces): { form: string; folder: string }[] {
  const out: { form: string; folder: string }[] = []
  const named = (name: string, folder: string | undefined) => {
    if (!folder) return
    out.push(
      { form: `%${name}%`, folder },
      { form: `\${env:${name}}`, folder },
      { form: `$env:${name}`, folder },
    )
  }
  out.push(
    { form: '%HOMEDRIVE%%HOMEPATH%', folder: of.home },
    { form: '$env:HOMEDRIVE$env:HOMEPATH', folder: of.home },
    { form: '${HOME}', folder: of.home },
    { form: '$HOME', folder: of.home },
  )
  named('USERPROFILE', of.home)
  named('HOME', of.home)
  named('LOCALAPPDATA', of.localAppData)
  named('APPDATA', of.appData)
  named('SystemRoot', of.systemRoot)
  named('windir', of.systemRoot)
  // Longest first, so `$env:HOMEDRIVE$env:HOMEPATH` is not read as `$HOME…`.
  return out.sort((a, b) => b.form.length - a.form.length)
}

/** Each named form of a folder in `text` as the folder itself; `~` too, where it starts a path. */
export function expandForms(text: string, of: SensitivePlaces): string {
  const all = forms(of)
  let out = ''
  let index = 0
  while (index < text.length) {
    let taken = false
    for (const { form, folder } of all) {
      const ends = form.endsWith('}') || form.endsWith('%')
      if (ends ? text.slice(index, index + form.length).toLowerCase() === form.toLowerCase() : startsWord(text, index, form)) {
        out += folder
        index += form.length
        taken = true
        break
      }
    }
    if (taken) continue
    const char = text[index] ?? ''
    const before = index === 0 ? '' : (text[index - 1] ?? '')
    const after = text[index + 1]
    if (char === '~' && (before === '' || /[\s"'=(,;|&<>]/.test(before)) && (after === undefined || after === '/' || after === '\\' || /[\s"');,|&<>]/.test(after))) {
      out += of.home
      index += 1
      continue
    }
    out += char
    index += 1
  }
  return out
}

/** A path written by the agent, as the place it names (`expandLocalPath`): its folder forms worked out, a `file:` address read, anything relative taken from the home folder. */
export function expandPath(target: string, of: SensitivePlaces): string {
  let value = target.trim()
  if (value.startsWith('"') || value.startsWith("'")) value = value.slice(1)
  if (value.endsWith('"') || value.endsWith("'")) value = value.slice(0, -1)
  if (/^file:/i.test(value)) {
    value = decodeURIComponentSafely(value.replace(/^file:(\/\/(localhost)?)?/i, ''))
    if (/^\/[a-z]:/i.test(value)) value = value.slice(1)
  }
  value = expandForms(value, of)
  const normalized = normalizeSlashes(value)
  if (isAbsolute(normalized)) {
    // `\x` is the root of the home folder's drive.
    if (normalized.startsWith('/') && !normalized.startsWith('//')) return `${driveOf(of.home)}${normalized}`
    return normalized
  }
  // `c:x` is relative to that drive's folder: read, as anything relative, from the home folder.
  const relative = normalized.replace(/^[a-z]:/i, '')
  return `${normalizeSlashes(of.home)}/${relative}`
}

function decodeURIComponentSafely(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/** The place a path lands in, `..` worked out first (`sensitiveLocalPathEntry`). */
export function placeForPath(target: string, of: SensitivePlaces): Place | undefined {
  const resolved = canonical(expandPath(target, of))
  return places(of).find((place) => under(resolved, place.absolute))
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** A command's words as the matching reads them: the folder forms worked out, slashes as `/`, lower case. */
function commandTexts(command: string, of: SensitivePlaces): string[] {
  // PowerShell's escape (`) and cmd's (^) taken out; then once more without quotes, which join words (`.s'sh'`).
  const plain = command.replace(/[`^]/g, '')
  const unquoted = plain.replace(/["']/g, '')
  return [plain, unquoted].map((one) => normalizeSlashes(expandForms(one, of)).toLowerCase())
}

const before = `(?:^|[\\s"'=(,;|&<>:])`
const after = `[. ]*(?:[/\\s"'),;|&<>*?]|$)`

/** The place a shell command names as a path (`sensitiveLocalPathInCommand`): written whole, or from the home folder. */
export function placeInCommand(command: string, of: SensitivePlaces): Place | undefined {
  const texts = commandTexts(command, of)
  for (const place of places(of)) {
    const spelled = (value: string) =>
      value
        .split('/')
        .map((name) => escapeRegExp(name))
        .join('/+')
    const whole = new RegExp(`${before}${spelled(place.absolute)}${after}`)
    const relative = place.fromHome
      ? new RegExp(`${before}/?${spelled(place.fromHome)}${after}`)
      : undefined
    if (texts.some((one) => whole.test(one) || (relative?.test(one) ?? false))) return place
  }
  return undefined
}

/** Why Simeon will not do it, for a run, a read, a write or a listing (`sensitiveLocalPathReason`), with "this PC" for the Mac's "this Mac". */
export function sensitiveRefusal(action: string, target: string, of: SensitivePlaces): string | undefined {
  let found: Place | undefined
  switch (action) {
    case 'run-command':
      found = placeInCommand(target, of)
      break
    case 'read-file':
    case 'write-file':
    case 'list-directory':
      found = placeForPath(target, of)
      break
    default:
      found = undefined
  }
  if (!found) return undefined
  return refusalWords(found.shown)
}

export function refusalWords(shown: string): string {
  return `Simeon does not read, write or run anything under ${shown} on this PC: it holds keys or sign-ins. Ask the person to do that part themselves.`
}
