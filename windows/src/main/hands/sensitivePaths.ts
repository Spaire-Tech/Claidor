// The places on the person's PC that Simeon does not touch, whatever the
// local-computer setting says (SimeonMacCore's SensitivePaths.swift; the
// engine's shared/sensitive-local-paths.ts): keys and sign-ins. The Mac's
// list translated for Windows: the same dot folders under the home folder,
// the browsers' profiles, Windows' own credential, key and cookie folders,
// the app's own data folder and the app itself. Windows' names don't care
// about letter case, and a path has many spellings on Windows, so they are
// read as Windows reads them before matching: either slash; `~`, `$HOME`,
// `$env:…`, `${env:…}`, `%…%`, cmd's `%…:…%` and `!…!`; `\\?\`, `\\.\`
// and this PC's own shares (`\\localhost\c$\…`); a path with no drive;
// Windows' old junctions (`Documents and Settings`, `Application Data`,
// `Local Settings`, `Cookies`); 8.3 short names (`SSH~1`); trailing dots
// and spaces and streams (`::$DATA`); `..`; and, in a command, names
// relative to the folder it runs in or `cd`s into.
//
// No guard on a command's words can be complete, here or on the Mac: a
// name built while the command runs ("$HOME\.s" + "sh", `-join`, a
// variable set by an earlier command), code decoded or fetched while it
// runs (`Invoke-Expression`, `-EncodedCommand`, a script written then run),
// wildcards and searches (`~\.ss?`, `Get-ChildItem -Recurse`), links a
// command makes (a junction or a hard link), and secrets reached through
// Windows' own interfaces rather than paths (the Credential Manager,
// `cmdkey`, DPAPI, the certificate store, the registry) all pass it. It
// stops the plain spellings, and when in doubt it refuses; a folder change
// the words don't show (a function or alias defined earlier) passes it too.
// The files the hands read or write themselves are also checked where they
// really are (provider.ts).

/** Where this PC keeps things (`os.homedir()`, `%APPDATA%`, `%LOCALAPPDATA%`, `%SystemRoot%`, the app's data folder and its own folder). */
export interface SensitivePlaces {
  home: string
  appData: string
  localAppData: string
  systemRoot?: string
  dataFolder: string
  /** The app's own folder (an install for this person only can be written by any of their programs). */
  installFolder?: string
  /** This PC's name, for its own shares (`\\NAME\c$\…`). */
  hostName?: string
  /** `%TEMP%`, `%USERNAME%`, `%OneDrive%`, when this PC says them. */
  temp?: string
  userName?: string
  oneDrive?: string
}

type Base = 'home' | 'appData' | 'localAppData' | 'systemRoot'

/** One place, under one of the bases; a last name ending in `*` is any name that starts so. */
interface Entry {
  base: Base
  path: string
}

/**
 * Relative to their base (`SENSITIVE_LOCAL_PATHS`, translated). The Mac's
 * `Library/…` places are Windows' AppData ones; `Library/Cookies` is
 * Windows' cookie stores (`INetCookies`, and the older `Cookies`); Arc is a
 * Store app on Windows, in its package's folder; `.docker` is the whole
 * folder (its contexts' keys too); `_netrc` is the name curl reads on
 * Windows; `Vault` and `Crypto` hold the same kind of keys as
 * `Credentials` and `Protect`. `/etc/shadow` becomes the registry's hives
 * in `System32\config`. GitHub's command-line tool keeps its sign-ins in
 * `%APPDATA%\GitHub CLI` on Windows, and in `.config/gh` where
 * `XDG_CONFIG_HOME` says so. The app's data folder and its install folder
 * are added by `places`.
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
  // Sign-ins kept as plain text: git's (`credential.helper store`, in either of its places), GitHub's command-line tool's, 1Password's.
  { base: 'home', path: '.git-credentials' },
  { base: 'home', path: '.config/git/credentials' },
  { base: 'home', path: '.config/gh/hosts.yml' },
  { base: 'appData', path: 'GitHub CLI/hosts.yml' },
  { base: 'home', path: '.config/op' },
  // The Mac's data folder (the Mac's earlier one is left out: no Windows app ever kept one).
  { base: 'home', path: '.simeon' },
  { base: 'home', path: '.cursor' },
  { base: 'appData', path: 'Microsoft/Credentials' },
  { base: 'appData', path: 'Microsoft/Protect' },
  { base: 'appData', path: 'Microsoft/Vault' },
  { base: 'appData', path: 'Microsoft/Crypto' },
  { base: 'appData', path: 'Microsoft/Windows/Cookies' },
  { base: 'appData', path: 'gcloud' },
  { base: 'appData', path: 'Mozilla/Firefox' },
  { base: 'localAppData', path: 'Microsoft/Credentials' },
  { base: 'localAppData', path: 'Microsoft/Vault' },
  { base: 'localAppData', path: 'Microsoft/Windows/INetCookies' },
  { base: 'localAppData', path: 'Google/Chrome' },
  { base: 'localAppData', path: 'Microsoft/Edge' },
  { base: 'localAppData', path: 'BraveSoftware' },
  { base: 'localAppData', path: 'Packages/TheBrowserCompany.Arc_*' },
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

/** The names this PC answers to for its own shares. */
function hostNames(of: SensitivePlaces): string {
  const names = ['localhost', '127\\.0\\.0\\.1', '\\[::1\\]', '::1', '\\.', '\\?']
  if (of.hostName) names.push(escapeRegExp(of.hostName.toLowerCase()))
  return names.join('|')
}

/**
 * Windows' device and share spellings read as plain paths, in lower-case
 * text with forward slashes, where a path starts (`edge` is what may come
 * before one): `//?/unc/…` as `//…`, `//?/` and `//./` taken off, this PC's
 * own shares (`//localhost/c$/…`, `//NAME/admin$/…`) as the drive or the
 * Windows folder they are.
 */
function deviceForms(text: string, of: SensitivePlaces, edge: string): string {
  const hosts = hostNames(of)
  const system = of.systemRoot ? canonicalNames(of.systemRoot) : undefined
  let out = text.replace(new RegExp(`(${edge})//[?.]/unc/`, 'g'), '$1//')
  out = out.replace(new RegExp(`(${edge})//[?.]/(?=[a-z]:)`, 'g'), '$1')
  out = out.replace(new RegExp(`(${edge})//(?:${hosts})/([a-z])\\$(?=/|$|[^a-z0-9_$])`, 'g'), '$1$2:')
  if (system) out = out.replace(new RegExp(`(${edge})//(?:${hosts})/admin\\$(?=/|$|[^a-z0-9_$])`, 'g'), `$1${system}`)
  return out
}

/** The names of a path, lower case, `.` and `..` worked out, without what Windows drops from a name's end or a stream after `:`. */
function canonicalNames(value: string): string {
  let out = normalizeSlashes(value).toLowerCase()
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

/**
 * A path as Windows reads it, for comparing: forward slashes, lower case,
 * `.` and `..` worked out, each name without the dots and spaces Windows
 * drops from its end or a stream after `:`; `\\?\` and `\\.\` taken off, a
 * share on this PC (`\\localhost\c$\…`) as its drive.
 */
export function canonical(value: string, of?: SensitivePlaces): string {
  const text = normalizeSlashes(value).toLowerCase()
  const plain = deviceForms(text, of ?? { home: '', appData: '', localAppData: '', dataFolder: '' }, '^')
  return canonicalNames(plain)
}

/** The drive a path is on (`c:`), or nothing (a Linux path in the checks). */
function driveOf(value: string): string {
  return /^([a-z]:)/i.exec(value)?.[1]?.toLowerCase() ?? ''
}

function withoutDrive(value: string): string {
  return value.replace(/^[a-z]:/i, '')
}

function isAbsolute(value: string): boolean {
  return /^[a-z]:\//i.test(value) || value.startsWith('/')
}

function under(target: string, root: string): boolean {
  if (root === '') return false
  return target === root || target.startsWith(root.endsWith('/') ? root : `${root}/`)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** How the agent is told a folder: from `%APPDATA%`, `%LOCALAPPDATA%` or `~` when it is under one, else where it is. */
function shownFolder(folder: string, of: SensitivePlaces): string {
  const at = canonical(folder, of)
  const original = normalizeSlashes(folder).split('/')
  for (const [base, name] of [
    [of.appData, '%APPDATA%'],
    [of.localAppData, '%LOCALAPPDATA%'],
    [of.home, '~'],
  ] as const) {
    const root = canonical(base, of)
    if (base && under(at, root) && at !== root) {
      const depth = at.split('/').length - root.split('/').length
      return `${name}\\${original.slice(-depth).join('\\')}`
    }
  }
  return folder
}

/** Every place on this PC, the app's own folders last. */
export function places(of: SensitivePlaces): Place[] {
  const home = canonical(of.home, of)
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
    add(canonical(`${base}/${entry.path}`, of), `${variable[entry.base]}\\${entry.path.replace(/\//g, '\\')}`)
  }
  add(canonical(of.dataFolder, of), shownFolder(of.dataFolder, of))
  if (of.installFolder) add(canonical(of.installFolder, of), shownFolder(of.installFolder, of))
  return out
}

/**
 * A name's 8.3 short form, as Windows makes one for a long name (`.ssh` is
 * `SSH~1`, `Microsoft` `MICROS~1`, `local-tool-permission.json`
 * `LOCAL-~1.JSO`): its first letters, as many as fit in eight with `~` and
 * the number (six for `~1` to `~9`, five for `~10`…), or two letters and
 * four hex digits once there are many; then the first three of its
 * extension. None for a name already 8.3.
 */
export function shortNamePattern(name: string): string | undefined {
  if (name.includes('*')) return undefined
  if (/^[^. +,;=[\]]{1,8}(?:\.[^. +,;=[\]]{1,3})?$/.test(name)) return undefined
  let base = name.replace(/ /g, '').replace(/^\.+/, '')
  let ext = ''
  const dot = base.lastIndexOf('.')
  if (dot > 0) {
    ext = base.slice(dot + 1)
    base = base.slice(0, dot)
  }
  base = base.replace(/\./g, '').replace(/[+,;=[\]]/g, '_')
  ext = ext.replace(/\./g, '').replace(/[+,;=[\]]/g, '_').slice(0, 3)
  if (base === '') return undefined
  const stems = new Set<string>()
  for (let digits = 1; digits <= 6; digits += 1)
    stems.add(`${escapeRegExp(base.slice(0, Math.min(base.length, 7 - digits)))}~\\d{${digits}}`)
  stems.add(`${escapeRegExp(base.slice(0, 2))}[0-9a-f]{4}~\\d`)
  return `(?:${[...stems].join('|')})${ext ? `\\.${escapeRegExp(ext)}` : ''}`
}

/** One name as it may be written: itself or its short form (a `*` at its end, any name that starts so). */
function namePattern(name: string, gap: string): string {
  const exact = name.endsWith('*') ? `${escapeRegExp(name.slice(0, -1))}${gap}` : escapeRegExp(name)
  const short = shortNamePattern(name)
  return short ? `(?:${exact}|${short})` : exact
}

/** A path's names as a pattern: each name or its short form; between them, a name's dropped dots and spaces, a stream, more slashes. */
function spelled(value: string, between: string, gap: string): string {
  const drive = /^([a-z]:)(.*)$/.exec(value)
  const head = drive ? escapeRegExp(drive[1] ?? '') : ''
  const names = (drive ? (drive[2] ?? '') : value).split('/')
  return head + names.map((name) => (name === '' ? '' : namePattern(name, gap))).join(between)
}

/**
 * Windows' old junctions in every profile, read as the folders they lead
 * to: `C:\Documents and Settings` is `C:\Users`; in the home folder,
 * `Application Data` is `%APPDATA%`, `Local Settings` (and its own
 * `Application Data`) is `%LOCALAPPDATA%`, `Cookies` is the older cookie
 * store. In lower-case text with forward slashes; the home folder with or
 * without its drive.
 */
function junctionForms(text: string, of: SensitivePlaces): string {
  const home = canonical(of.home, of)
  let out = text.replace(/\/documents and settings(?=[/\s"'),;|&<>:]|$)/g, '/users')
  if (!home) return out
  const drive = driveOf(home)
  const at = `(?:${escapeRegExp(drive)})?${escapeRegExp(withoutDrive(home))}`
  const swap = (from: string, to: string) => {
    out = out.replace(new RegExp(`${at}/${from}(?=[/\\s"'),;|&<>:.]|$)`, 'g'), to)
  }
  const appData = canonical(of.appData, of)
  const localAppData = canonical(of.localAppData, of)
  swap('local settings/application data', localAppData)
  swap('local settings', localAppData)
  swap('application data', appData)
  swap('cookies', `${appData}/microsoft/windows/cookies`)
  return out
}

/** The place a path lands in (`sensitiveLocalPathEntry`): read as Windows reads it, then matched name by name. */
export function placeForPath(target: string, of: SensitivePlaces): Place | undefined {
  const resolved = junctionForms(canonical(expandPath(target, of), of), of)
  return places(of).find((place) => new RegExp(`^${spelled(place.absolute, '/', '[^/]*')}(?:/|$)`).test(resolved))
}

/** The variables a path or a command may name a folder by, each with the folder it is. */
function variables(of: SensitivePlaces): Map<string, string> {
  const named = new Map<string, string>()
  const set = (name: string, value: string | undefined) => {
    if (value) named.set(name.toLowerCase(), value)
  }
  const home = normalizeSlashes(of.home)
  set('USERPROFILE', of.home)
  set('HOME', of.home)
  set('HOMEDRIVE', driveOf(home).toUpperCase() || undefined)
  set('HOMEPATH', driveOf(home) ? withoutDrive(home) : undefined)
  set('APPDATA', of.appData)
  set('LOCALAPPDATA', of.localAppData)
  set('SystemRoot', of.systemRoot)
  set('windir', of.systemRoot)
  set('TEMP', of.temp ?? `${normalizeSlashes(of.localAppData)}/Temp`)
  set('TMP', of.temp ?? `${normalizeSlashes(of.localAppData)}/Temp`)
  set('OneDrive', of.oneDrive ?? `${home}/OneDrive`)
  set('USERNAME', of.userName ?? home.split('/').pop())
  return named
}

/**
 * Each named form of a folder in `text` as the folder itself: PowerShell's
 * `$env:NAME`, `${env:NAME}`, `$HOME`, `${HOME}` and `$PROFILE`; cmd's
 * `%NAME%` (with its `:~…` and `:a=b` changes read as the whole value) and
 * `!NAME!`; `~` where it starts a path. A name this PC doesn't say is left
 * as it is.
 */
export function expandForms(text: string, of: SensitivePlaces): string {
  const named = variables(of)
  const value = (name: string, whole: string) => named.get(name.toLowerCase()) ?? whole
  let out = text
  out = out.replace(/\$\{env:([A-Za-z_][\w]*)\}/gi, (whole, name: string) => value(name, whole))
  out = out.replace(/\$env:([A-Za-z_][\w]*)/gi, (whole, name: string) => value(name, whole))
  out = out.replace(/%([A-Za-z_][\w]*)(?::[^%]*)?%/g, (whole, name: string) => value(name, whole))
  out = out.replace(/!([A-Za-z_][\w]*)(?::[^!]*)?!/g, (whole, name: string) => value(name, whole))
  out = out.replace(/\$\{home\}/gi, of.home)
  out = out.replace(/\$home(?![\w:])/gi, of.home)
  // `$PROFILE` is a file three folders down in the home folder, whichever PowerShell: enough for `..` to be worked out.
  out = out.replace(/\$profile(?![\w:])/gi, `${normalizeSlashes(of.home)}/Documents/PowerShell/Microsoft.PowerShell_profile.ps1`)
  out = out.replace(/(^|[\s"'=(,;|&<>])~(?=$|[/\\\s"');,|&<>])/g, (_whole, edge: string) => `${edge}${of.home}`)
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

/** What may come just before a path in a command's words (an `@` too, before a file curl sends), and just after a name (a `(` too, as after the Mac's: `~/.netrc(.)`). */
const edge = `^|[\\s"'=(,;|&<>:{@]`
const before = `(?:${edge})`
const between = `[. ]*(?::[^/\\s"']*)?/+`
const after = `[. ]*(?:[:/\\s"'),;|&<>*?}(]|$)`
const gap = `[^/\\s"',;|&<>]*`

/** `x/..` worked out in a command's words, as often as it comes, also at a word's start (`x/../y` is `y`, the Mac's `workedOut`); `/./` as `/`. */
function workedOut(text: string): string {
  let out = text.replace(/\/\.(?=\/)/g, '')
  const step = /\/(?!\.\.(?:\/|$))[^/\s"'(),;|&<>]+\/\.\.(?=[/\s"'(),;|&<>]|$)/
  // At a word's start, `.` is no folder to come back out of (`./../x` is `../x`).
  const first = /(^|[\s"'=(,;|&<>:{])(?!\.{1,2}(?:\/|$))[^/\s"'(),;|&<>:]+\/\.\.\//
  for (let i = 0; i < 64; i += 1) {
    if (step.test(out)) out = out.replace(step, '')
    else if (first.test(out)) out = out.replace(first, '$1')
    else break
  }
  return out
}

/**
 * A command's words as the matching reads them: PowerShell's `` ` `` and
 * cmd's `^` taken out (and again without quotes, which join words:
 * `.s'sh'`); the folder forms worked out; slashes as `/`, this PC's device
 * and share spellings as plain paths, repeated slashes as one; Windows' old
 * junctions as their folders; `..` worked out; lower case.
 */
function commandTexts(command: string, of: SensitivePlaces): string[] {
  const plain = command.replace(/[`^]/g, '')
  const unquoted = plain.replace(/["']/g, '')
  return [plain, unquoted].map((one) => {
    let text = expandForms(one, of).replace(/\\/g, '/').toLowerCase()
    text = deviceForms(text, of, edge).replace(/\/{2,}/g, '/')
    return workedOut(junctionForms(text, of))
  })
}

/** The folders a command moves to with `cd`, `Set-Location`, `pushd`…, read from where it starts. */
function foldersMovedTo(text: string, from: string): string[] {
  const out: string[] = []
  const moves =
    /(?:^|[;&|\n{(])\s*(?:cd|chdir|sl|set-location|pushd|push-location)\s+(?:-(?:literalpath|path|lp)\s+)?(?:"([^"]*)"|'([^']*)'|([^\s;|&)}]+))/g
  let at = from
  for (const match of text.matchAll(moves)) {
    const target = (match[1] ?? match[2] ?? match[3] ?? '').trim()
    if (target === '' || target === '-' || target === '+') continue
    const absolute = isAbsolute(target) ? target : at ? `${at}/${target}` : target
    at = canonicalNames(absolute)
    out.push(at)
  }
  return out
}

/**
 * The command's `cd`s (`Set-Location`, `pushd`…, a quote before one, a
 * `${…}` in its folder too), each where it moves to, read from `from` on
 * (`foldersMovedTo` on the command as written).
 */
function movesIn(plain: string, of: SensitivePlaces, from: string): string[] {
  const out: string[] = []
  const moves =
    /(?:^|[;&|\n{("'])\s*(?:cd|chdir|sl|set-location|pushd|push-location)\s+(?:-(?:literalpath|path|lp)\s+)?(?:"([^"]*)"|'([^']*)'|((?:\$\{[^}]*\}|[^\s;|&)}"'])+))/gi
  let at = from
  for (const match of plain.matchAll(moves)) {
    const target = (match[1] ?? match[2] ?? match[3] ?? '').trim()
    if (target === '' || target === '-' || target === '+') continue
    at = folderOf(target, of, at)
    out.push(at)
  }
  return out
}

/** A cd's folder as the matching reads it: its forms worked out, from `at` when relative. */
function folderOf(target: string, of: SensitivePlaces, at: string): string {
  let written = expandForms(target, of).replace(/\\/g, '/').toLowerCase()
  written = junctionForms(deviceForms(written, of, '^').replace(/\/{2,}/g, '/'), of)
  return canonicalNames(isAbsolute(written) ? written : at ? `${at}/${written}` : written)
}

/**
 * Where a command goes before anything else, when nothing it then does can
 * be where the shell was (the Mac's `onlyFolder`): its first step is
 * `cd X &&` (`Set-Location`, `pushd`…), `X` written plainly (no `$`, `%`,
 * `!`, quote, wildcard, `-`, `±N`, `~-` or `~+`); no other `cd`, `chdir`,
 * `sl`, `Set-Location`, `pushd`, `Push-Location`, `popd` or `Pop-Location`
 * anywhere, quoted or not; no `~-`, `~+`, `OLDPWD`, `eval`, `iex`,
 * `Invoke-Expression`, `-c` or cmd's `/c` and `/k`; and nothing runs after a
 * failed `cd` (no `;`, `||`, `&` or new line outside plain quotes). Then the
 * folders it was in are not read from: only `X` (and those above it). Else
 * undefined, and every folder is.
 */
function onlyFolder(command: string, of: SensitivePlaces, from: string): string | undefined {
  const first = /^\s*(?:cd|chdir|sl|set-location|pushd|push-location)\s+([A-Za-z0-9._\\/+@,:=~-]+)\s*&&/i.exec(command)
  const target = first?.[1]
  if (target == null || /^(?:[-+][0-9]*|~[-+].*|~[^\\/].*)$/.test(target)) return undefined
  const moves = command.match(/\b(?:cd|chdir|sl|set-location|pushd|push-location|popd|pop-location)\b/gi) ?? []
  if (moves.length !== 1) return undefined
  const lower = command.toLowerCase()
  if (['~-', '~+', 'oldpwd', 'eval', 'iex', 'invoke-expression', '-c', '/c', '/k'].some((one) => lower.includes(one))) return undefined
  // Quotes are taken out only when they are plain: no escape (`` ` ``, `^`) or `$(…)` that could nest them, and balanced.
  let outside = command
  if (!/[`^]|\$\(/.test(command)) {
    const stripped = command.replace(/'[^']*'|"[^"]*"/g, "''")
    if (!/["']/.test(stripped.replace(/''/g, ''))) outside = stripped
  }
  if (/;|\n|\|\||(?<![&>|])&(?![&>])/.test(outside)) return undefined
  return folderOf(target, of, from)
}

/**
 * Whether a name written bare (no `/` in it) is a path where it is,
 * `prefix` before it and `next` after it (the Mac's `bareNameIsPath`):
 * always but as a command's own name, and that too when a `/` follows. A
 * name glued to what comes before (`$f=hosts.yml`, `@hosts.yml`,
 * `"hosts.yml"`) is one.
 */
function bareNameIsPath(prefix: string, next: string | undefined): boolean {
  if (next === '/') return true
  const edgeChar = prefix.at(-1)
  if (edgeChar == null) return false
  if (!(/\s/.test(edgeChar) || ';&|\n'.includes(edgeChar) || (edgeChar === '(' && prefix.at(-2) !== '=')))
    return true
  const cut = Math.max(...[';', '&', '|', '\n', '(', '{'].map((one) => prefix.lastIndexOf(one)))
  const words = prefix
    .slice(cut + 1)
    .split(/\s+/)
    .filter((one) => one !== '')
  while (words.length > 0 && /^[a-z_]\w*=/i.test(words[0] ?? '')) words.shift()
  return words.length > 0
}

/** A folder (canonical) and each one above it, with how many levels up: `c:/a/b`, `c:/a`, `c:/`. */
function foldersUp(folder: string): { folder: string; up: number }[] {
  const out = [{ folder, up: 0 }]
  let at = folder
  for (let up = 1; up < 256 && at !== '/' && !/^[a-z]:\/$/.test(at); up += 1) {
    const cut = at.replace(/\/[^/]*$/, '')
    at = cut === '' ? '/' : /^[a-z]:$/.test(cut) ? `${cut}/` : cut
    out.push({ folder: at, up })
  }
  return out
}

/**
 * The place a shell command names as a path (`sensitiveLocalPathInCommand`):
 * written whole (its drive left out too, when it is the home folder's), from
 * the home folder, or from a folder the command runs in (`folders`: where
 * the shell is, or the one asked for) or moves to, or from a folder above
 * one of those, `../` (or `..\`) as many times as it is above, any number
 * once at the drive's root (the Mac's `SensitivePaths.entry(inCommand:)`);
 * the folders it runs in left out only as `onlyFolder` says. A name written
 * bare from one of those folders counts as `bareNameIsPath` says.
 */
export function placeInCommand(
  command: string,
  of: SensitivePlaces,
  folders: readonly string[] = [],
): Place | undefined {
  const texts = commandTexts(command, of)
  const homeDrive = driveOf(canonical(of.home, of))
  const starts = folders.filter((one) => one.trim() !== '').map((one) => canonical(one, of))
  const from = starts[0] ?? canonical(of.home, of)
  const plain = command.replace(/[`^]/g, '')
  const only = onlyFolder(command, of, from)
  const contexts = new Set(only != null ? [only] : starts)
  if (only == null) {
    for (const text of texts) for (const one of foldersMovedTo(text, from)) contexts.add(one)
    for (const one of movesIn(plain, of, from)) contexts.add(one)
  }
  for (const place of places(of)) {
    const patterns: RegExp[] = []
    const bare: RegExp[] = []
    const drive = driveOf(place.absolute)
    const whole =
      drive && drive === homeDrive
        ? `(?:${escapeRegExp(drive)})?${spelled(withoutDrive(place.absolute), between, gap)}`
        : spelled(place.absolute, between, gap)
    patterns.push(new RegExp(`${before}${whole}${after}`))
    if (place.fromHome) patterns.push(new RegExp(`${before}/?${spelled(place.fromHome, between, gap)}${after}`))
    for (const start of contexts)
      for (const { folder: context, up } of foldersUp(start)) {
        if (!under(place.absolute, context) || place.absolute === context) continue
        const relative = place.absolute.slice(context.length + (context.endsWith('/') ? 0 : 1))
        const name = spelled(relative, between, gap)
        if (up === 0 && !relative.includes('/')) {
          patterns.push(new RegExp(`${before}(?:\\./+)+${name}${after}`))
          bare.push(new RegExp(`(?:${edge})(${name})(?=${after})`, 'g'))
          continue
        }
        const step = '\\.\\./+(?:\\./+)*'
        const climb = context === '/' || /^[a-z]:\/$/.test(context) ? `(?:${step}){${up},}` : step.repeat(up)
        patterns.push(new RegExp(`${before}(?:\\./+)*${climb}${name}${after}`))
      }
    if (texts.some((one) => patterns.some((pattern) => pattern.test(one)))) return place
    for (const text of texts)
      for (const pattern of bare)
        for (const match of text.matchAll(pattern)) {
          const end = (match.index ?? 0) + match[0].length
          if (bareNameIsPath(text.slice(0, end - (match[1] ?? '').length), text[end])) return place
        }
  }
  return undefined
}

/**
 * Why Simeon will not do it, for a run, a read, a write or a listing
 * (`sensitiveLocalPathReason`), with "this PC" for the Mac's "this Mac". A
 * command's `folders` are where it would run (names in its words are also
 * read from there).
 */
export function sensitiveRefusal(
  action: string,
  target: string,
  of: SensitivePlaces,
  folders: readonly string[] = [],
): string | undefined {
  let found: Place | undefined
  switch (action) {
    case 'run-command':
      found = placeInCommand(target, of, folders)
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
