// The agent's hands on this PC, the rules: SimeonMacCore's LocalExecTests
// and LocalToolTests (ios/SimeonCore/Tests/SimeonMacCoreTests), ported, each
// of the Mac's cases with its Windows path beside it, and Windows' own
// (its letter case, its slashes, `%USERPROFILE%` and `$env:` forms, its
// AppData places). Where the Mac's test records a hole (a case it lets
// through), the Windows rule closes it, and says so; the Mac has since closed
// letter case, `;`, `>` and `${HOME}` the same way (3 November 2026).

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { LocalToolApprovals, readApproval } from '../src/main/hands/approvals'
import {
  TerminalFile,
  binaryRefusal,
  countLines,
  decodeText,
  readKind,
  readRange,
  resolveReadPath,
} from '../src/main/hands/files'
import { placesFrom, rootFrom } from '../src/main/hands/hands'
import { LineEnds, shellName } from '../src/main/hands/provider'
import {
  LocalToolSettings,
  capped,
  normalizePermission,
  rank,
} from '../src/main/hands/permission'
import {
  commandInput,
  commandScript,
  endMarker,
  findPowerShell,
  initScript,
  parseInitOutput,
  parseStateBody,
  shellArguments,
  shellEnvironment,
  startMarker,
  stateMarker,
} from '../src/main/hands/powershell'
import {
  LocalExec,
  type LocalToolApproval,
  type LocalToolRequest,
  type Permission,
  covers,
  describe as describeRequest,
  escapesRoot,
  refusal,
  resolveAgainst,
  workingDirectory,
} from '../src/main/hands/rules'
import {
  type SensitivePlaces,
  canonical,
  placeForPath,
  placeInCommand,
  sensitiveRefusal,
  shortNamePattern,
} from '../src/main/hands/sensitivePaths'
import { StateSplitter } from '../src/main/hands/shell'
import { SigningKey, readSigned, writeSigned } from '../src/main/hands/signed'
import { checkTarget, sameTarget } from '../src/main/hands/target'
import * as wire from '../src/main/hands/wire'

const windows: SensitivePlaces = {
  home: 'C:\\Users\\bass',
  appData: 'C:\\Users\\bass\\AppData\\Roaming',
  localAppData: 'C:\\Users\\bass\\AppData\\Local',
  systemRoot: 'C:\\Windows',
  dataFolder: 'C:\\Users\\bass\\AppData\\Roaming\\Simeon',
}

const shownOf = (action: string, target: string) => {
  const found = action === 'run-command' ? placeInCommand(target, windows) : placeForPath(target, windows)
  return found?.shown
}

describe('the places that hold keys (testPlacesThatHoldKeys)', () => {
  it('are found by a path, the Mac’s cases on Windows', () => {
    const paths: [string, string, string | undefined][] = [
      ['read-file', '~/.ssh/id_rsa', '~\\.ssh'],
      ['read-file', '~\\.ssh\\id_rsa', '~\\.ssh'],
      // The Electron app's guard let these through (its probe's holes); Windows names don't care about case (nor do the Mac's now), and a file: address is read.
      ['read-file', 'file:///C:/Users/bass/.ssh/id_rsa', '~\\.ssh'],
      ['read-file', 'C:\\USERS\\bass\\.ssh\\id_rsa', '~\\.ssh'],
      ['read-file', 'C:\\Users\\bass\\.SSH\\id_rsa', '~\\.ssh'],
      ['read-file', '~/.ssh', '~\\.ssh'],
      ['read-file', '~/.ssh/', '~\\.ssh'],
      ['read-file', 'C:\\Users\\bass\\\\.ssh', '~\\.ssh'],
      ['read-file', '"~/.ssh/x"', '~\\.ssh'],
      ['read-file', '$HOME/.aws/credentials', '~\\.aws'],
      // `${HOME}` passed the Electron app's guard; not here (nor on the Mac now).
      ['read-file', '${HOME}/.aws/credentials', '~\\.aws'],
      ['read-file', 'C:\\Windows\\System32\\config\\SAM', '%SystemRoot%\\System32\\config'],
      ['read-file', '~/AppData/Roaming/Microsoft/Credentials', '%APPDATA%\\Microsoft\\Credentials'],
      ['read-file', '.docker/config.json', '~\\.docker'],
      // The whole of `.docker` here: its contexts hold keys too.
      ['read-file', '.docker/other.json', '~\\.docker'],
      ['read-file', '~/.simeon/settings.json', '~\\.simeon'],
      ['read-file', '~/Documents/../.gnupg/x', '~\\.gnupg'],
      ['list-directory', '~', undefined],
      ['list-directory', 'C:\\Users\\bass\\AppData', undefined],
      ['write-file', 'Downloads/x', undefined],
    ]
    for (const [action, target, entry] of paths) expect(shownOf(action, target), `${action} ${target}`).toBe(entry)
  })

  it('are found in Windows’ own spellings', () => {
    const paths: [string, string | undefined][] = [
      ['%USERPROFILE%\\.ssh\\id_rsa', '~\\.ssh'],
      ['$env:USERPROFILE\\.ssh\\id_rsa', '~\\.ssh'],
      ['${env:USERPROFILE}/.ssh', '~\\.ssh'],
      ['%HOMEDRIVE%%HOMEPATH%\\.kube\\config', '~\\.kube'],
      ['%APPDATA%\\Microsoft\\Protect\\S-1-5-21', '%APPDATA%\\Microsoft\\Protect'],
      ['$env:LOCALAPPDATA\\Google\\Chrome\\User Data\\Default\\Cookies', '%LOCALAPPDATA%\\Google\\Chrome'],
      ['C:\\Users\\bass\\AppData\\Local\\Microsoft\\Edge\\User Data', '%LOCALAPPDATA%\\Microsoft\\Edge'],
      ['C:\\Users\\bass\\AppData\\Local\\BraveSoftware\\Brave-Browser', '%LOCALAPPDATA%\\BraveSoftware'],
      ['%APPDATA%\\Mozilla\\Firefox\\Profiles\\x.default\\logins.json', '%APPDATA%\\Mozilla\\Firefox'],
      ['C:\\Users\\bass\\AppData\\Local\\Microsoft\\Credentials\\A1', '%LOCALAPPDATA%\\Microsoft\\Credentials'],
      ['C:\\Users\\bass\\AppData\\Roaming\\Microsoft\\Vault', '%APPDATA%\\Microsoft\\Vault'],
      ['C:\\Users\\bass\\AppData\\Roaming\\Microsoft\\Crypto\\RSA', '%APPDATA%\\Microsoft\\Crypto'],
      ['%SystemRoot%\\System32\\config\\SAM', '%SystemRoot%\\System32\\config'],
      ['C:\\Users\\bass\\AppData\\Roaming\\Simeon\\kept\\simeon.web.tokens.sealed', '%APPDATA%\\Simeon'],
      ['C:\\Users\\bass\\_netrc', '~\\_netrc'],
      // Sign-ins kept as plain text (the Mac's list too): git's, GitHub's command-line tool's (where Windows keeps it, and `.config`), 1Password's.
      ['~\\.git-credentials', '~\\.git-credentials'],
      ['C:\\Users\\bass\\.config\\gh\\hosts.yml', '~\\.config\\gh\\hosts.yml'],
      ['%APPDATA%\\GitHub CLI\\hosts.yml', '%APPDATA%\\GitHub CLI\\hosts.yml'],
      ['C:\\Users\\bass\\AppData\\Roaming\\github cli\\HOSTS.YML', '%APPDATA%\\GitHub CLI\\hosts.yml'],
      ['~/.config/op/config', '~\\.config\\op'],
      // The ways Windows reads the same folder.
      ['\\\\?\\C:\\Users\\bass\\.ssh\\id_rsa', '~\\.ssh'],
      ['\\\\localhost\\c$\\Users\\bass\\.ssh\\id_rsa', '~\\.ssh'],
      ['C:\\Users\\bass\\.ssh.\\id_rsa', '~\\.ssh'],
      ['C:\\Users\\bass\\.ssh \\id_rsa', '~\\.ssh'],
      ['C:\\Users\\bass\\.ssh::$INDEX_ALLOCATION\\id_rsa', '~\\.ssh'],
      ['\\Users\\bass\\.ssh\\id_rsa', '~\\.ssh'],
      ['C:/Users/bass/Documents/../.ssh/id_rsa', '~\\.ssh'],
      // Not one of them.
      ['C:\\Users\\bass\\.sshx\\a', undefined],
      ['%APPDATA%\\GitHub CLI\\config.yml', undefined],
      ['~\\.config\\opal', undefined],
      ['C:\\Users\\bass\\Documents\\.ssh-notes.txt', undefined],
      ['C:\\Users\\bass\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu', undefined],
      ['D:\\.ssh\\x', undefined],
      ['C:\\Users\\bass\\Documents\\report.docx', undefined],
    ]
    for (const [target, entry] of paths) expect(shownOf('read-file', target), target).toBe(entry)
  })

  it('are found in a command’s words, the Mac’s cases on Windows', () => {
    const commands: [string, string | undefined][] = [
      ['cat ~/.ssh/id_rsa', '~\\.ssh'],
      ['Get-Content ~\\.ssh\\id_rsa', '~\\.ssh'],
      ['type C:\\Users\\bass\\.ssh\\id_rsa', '~\\.ssh'],
      ['cd ~; Get-Content .ssh\\id_rsa', '~\\.ssh'],
      // A hole in the Electron app's guard (letter case); closed here and on the Mac.
      ['cat ~/.SSH/id_rsa', '~\\.ssh'],
      ['cat "$HOME/.ssh/id_rsa"', '~\\.ssh'],
      ['cat ${HOME}/.ssh/id_rsa', '~\\.ssh'],
      // The Electron app's guard let `cd ~/.ssh; cat id_rsa` through (";" ended no name there); here and on the Mac it doesn't.
      ['cd ~/.ssh; cat id_rsa', '~\\.ssh'],
      ["type 'C:\\Users\\bass\\AppData\\Local\\Google\\Chrome\\x'", '%LOCALAPPDATA%\\Google\\Chrome'],
      ['dir C:\\Windows\\System32\\config', '%SystemRoot%\\System32\\config'],
      // `>` ends a name here, as on the Mac now (the Electron app's guard let `echo x>/etc/shadow` through).
      ['echo x>C:\\Windows\\System32\\config\\SAM', '%SystemRoot%\\System32\\config'],
      ['cat ~/.sshfs', undefined],
      ['cat ~/.ssh', '~\\.ssh'],
      ['$f = "~\\.ssh\\id"; Get-Content $f', '~\\.ssh'],
    ]
    for (const [command, entry] of commands) expect(shownOf('run-command', command), command).toBe(entry)
  })

  it('are found in PowerShell’s and cmd’s own ways of writing a path', () => {
    const commands: [string, string | undefined][] = [
      ['Get-Content $env:USERPROFILE\\.ssh\\id_rsa', '~\\.ssh'],
      ['Get-Content $Env:UserProfile\\.ssh\\id_rsa', '~\\.ssh'],
      ['type %USERPROFILE%\\.ssh\\id_rsa', '~\\.ssh'],
      ['gc ${env:USERPROFILE}/.ssh/id_rsa', '~\\.ssh'],
      ['gc $HOME\\.aws\\credentials', '~\\.aws'],
      ['gc ~\\.s`sh\\id_rsa', '~\\.ssh'],
      ["gc ~/.s'sh'/id_rsa", '~\\.ssh'],
      ['Get-Content (Join-Path $HOME ".ssh\\id_rsa")', '~\\.ssh'],
      ['Copy-Item "$env:APPDATA\\Microsoft\\Credentials\\*" .', '%APPDATA%\\Microsoft\\Credentials'],
      ['cmd /c type %LOCALAPPDATA%\\Microsoft\\Edge\\User^ Data\\Default\\Cookies', '%LOCALAPPDATA%\\Microsoft\\Edge'],
      ['Get-Content FileSystem::C:\\Users\\bass\\.ssh\\id_rsa', '~\\.ssh'],
      ['Get-Content $env:APPDATA\\Simeon\\local-tool-approvals.json', '%APPDATA%\\Simeon'],
      ['type %USERPROFILE%\\.git-credentials', '~\\.git-credentials'],
      ['gc "$env:APPDATA\\GitHub CLI\\hosts.yml"', '%APPDATA%\\GitHub CLI\\hosts.yml'],
      ['dir ~\\.config\\op', '~\\.config\\op'],
      // A wildcard that would match one is not caught, as on the Mac (recorded as a gap).
      ['Get-ChildItem ~/.ss*', undefined],
      ['Get-ChildItem -Force ~', undefined],
      ['npm install && npm test', undefined],
      ['git log HEAD~1', undefined],
      ['echo .sshx', undefined],
    ]
    for (const [command, entry] of commands) expect(shownOf('run-command', command), command).toBe(entry)
  })

  it('refuse with the Mac’s words, saying this PC', () => {
    expect(sensitiveRefusal('send-input', 'cat ~/.ssh/id_rsa', windows)).toBeUndefined()
    expect(sensitiveRefusal('read-file', '~/.ssh/x', windows)).toBe(
      'Simeon does not read, write or run anything under ~\\.ssh on this PC: it holds keys or sign-ins. Ask the person to do that part themselves.',
    )
    expect(sensitiveRefusal('run-command', 'dir C:\\Windows\\System32\\config', windows)).toBe(
      'Simeon does not read, write or run anything under %SystemRoot%\\System32\\config on this PC: it holds keys or sign-ins. Ask the person to do that part themselves.',
    )
  })

  it('read a path the way Windows does', () => {
    expect(canonical('C:\\Users\\Bass\\.SSH.\\id')).toBe('c:/users/bass/.ssh/id')
    expect(canonical('\\\\?\\C:\\x\\..\\y')).toBe('c:/y')
    expect(canonical('\\\\server\\share\\x')).toBe('//server/share/x')
    expect(canonical('/root/.ssh/x')).toBe('/root/.ssh/x')
  })

  it('work out of this PC’s variables, and on Linux for the checks', () => {
    const here = placesFrom({ APPDATA: 'E:\\Roaming', SystemRoot: 'D:\\Win' }, 'C:\\Users\\x', 'E:\\Roaming\\Simeon', 'win32')
    expect(here).toEqual({
      home: 'C:\\Users\\x',
      appData: 'E:\\Roaming',
      localAppData: 'C:\\Users\\x\\AppData\\Local',
      systemRoot: 'D:\\Win',
      dataFolder: 'E:\\Roaming\\Simeon',
    })
    expect(placeForPath('E:\\Roaming\\Microsoft\\Protect\\x', here)?.shown).toBe('%APPDATA%\\Microsoft\\Protect')
    expect(placeForPath('E:\\Roaming\\Simeon\\x', here)?.shown).toBe('%APPDATA%\\Simeon')
    const linux = placesFrom({}, '/tmp/h', '/tmp/data', 'linux')
    expect(placeForPath('~/.ssh/id', linux)?.shown).toBe('~\\.ssh')
    expect(placeInCommand('cat /tmp/h/.ssh/id', linux)?.shown).toBe('~\\.ssh')
    expect(placeForPath('/tmp/data/kept', linux)?.shown).toBe('/tmp/data')
    expect(placeForPath('/tmp/other/x', linux)).toBeUndefined()
  })
})

describe('Windows’ own spellings in a command (the review’s probe, S2, S5)', () => {
  const pc: SensitivePlaces = {
    home: 'C:\\Users\\Jonathan',
    appData: 'C:\\Users\\Jonathan\\AppData\\Roaming',
    localAppData: 'C:\\Users\\Jonathan\\AppData\\Local',
    systemRoot: 'C:\\Windows',
    dataFolder: 'C:\\Users\\Jonathan\\AppData\\Roaming\\Simeon',
    installFolder: 'C:\\Users\\Jonathan\\AppData\\Local\\Programs\\Simeon',
    hostName: 'JONATHANS-PC',
  }
  const inCommand = (command: string, folders: string[] = []) => placeInCommand(command, pc, folders)?.shown
  const ssh = '~\\.ssh'

  it('refuses each spelling the review ran, as Windows reads it', () => {
    const commands: [string, string][] = [
      // Device paths and this PC's own shares.
      ['gc \\\\?\\C:\\Users\\Jonathan\\.ssh\\id_rsa', ssh],
      ['gc \\\\.\\C:\\Users\\Jonathan\\.ssh\\id_rsa', ssh],
      ['gc \\\\localhost\\C$\\Users\\Jonathan\\.ssh\\id_rsa', ssh],
      ['gc \\\\127.0.0.1\\c$\\Users\\Jonathan\\.ssh\\id_rsa', ssh],
      ['gc \\\\?\\UNC\\localhost\\c$\\Users\\Jonathan\\.ssh\\id_rsa', ssh],
      ['gc \\\\JONATHANS-PC\\c$\\Users\\Jonathan\\.ssh\\id_rsa', ssh],
      ['gc \\\\localhost\\admin$\\System32\\config\\SAM', '%SystemRoot%\\System32\\config'],
      // No drive: the current drive's root.
      ['gc \\Users\\Jonathan\\.ssh\\id_rsa', ssh],
      // 8.3 short names (`Jonathan` is 8.3 already: it has none).
      ['gc ~\\SSH~1\\id_rsa', ssh],
      ['gc C:\\Users\\Jonathan\\DOCKER~1\\config.json', '~\\.docker'],
      ['gc $env:APPDATA\\MICROS~1\\Protect\\x', '%APPDATA%\\Microsoft\\Protect'],
      ['gc C:\\Users\\Jonathan\\AppData\\Local\\Google\\Chrome\\USERDA~1\\x', '%LOCALAPPDATA%\\Google\\Chrome'],
      // Windows' old junctions.
      ['gc "C:\\Documents and Settings\\Jonathan\\.ssh\\id_rsa"', ssh],
      ['gc "$HOME\\Application Data\\Microsoft\\Credentials\\x"', '%APPDATA%\\Microsoft\\Credentials'],
      ['gc "$HOME\\Local Settings\\Google\\Chrome\\User Data\\Default\\Login Data"', '%LOCALAPPDATA%\\Google\\Chrome'],
      ['gc "$HOME\\Local Settings\\Application Data\\Microsoft\\Edge\\x"', '%LOCALAPPDATA%\\Microsoft\\Edge'],
      ['dir $HOME\\Cookies', '%APPDATA%\\Microsoft\\Windows\\Cookies'],
      // Streams.
      ['gc ~\\.netrc::$DATA', '~\\.netrc'],
      ['cd ~\\.ssh::$INDEX_ALLOCATION; gc id_rsa', ssh],
      ['gc ~\\.ssh:$I30:$INDEX_ALLOCATION\\id_rsa', ssh],
      // `..` worked out.
      ['gc ~\\Documents\\..\\.ssh\\id_rsa', ssh],
      ['gc $env:TEMP\\..\\..\\..\\.ssh\\id_rsa', ssh],
      ['gc $PROFILE\\..\\..\\..\\.ssh\\id_rsa', ssh],
      ['gc "$env:OneDrive\\..\\.ssh\\id_rsa"', ssh],
      // The home folder's parts as variables, PowerShell's and cmd's.
      ['gc ${env:HOMEDRIVE}${env:HOMEPATH}\\.ssh\\id_rsa', ssh],
      ['gc "$env:HOMEDRIVE\\$env:HOMEPATH\\.ssh\\id_rsa"', ssh],
      ['cmd /c type %USERPROFILE:~0%\\.ssh\\id_rsa', ssh],
      ['cmd /v:on /c type !USERPROFILE!\\.ssh\\id_rsa', ssh],
      ['cmd /c "type %userprofile%\\.ssh\\id_rsa"', ssh],
      // Named from a folder the command moves to.
      ['cd $env:LOCALAPPDATA; gc "Google\\Chrome\\User Data\\Local State"', '%LOCALAPPDATA%\\Google\\Chrome'],
      ['cd $env:APPDATA; sc Simeon\\local-tool-permission.json \'{"choice":"always"}\'', '%APPDATA%\\Simeon'],
      ['Set-Location $env:APPDATA\\Microsoft; gci Protect -Recurse', '%APPDATA%\\Microsoft\\Protect'],
      ['pushd C:\\Users; type Jonathan\\.ssh\\id_rsa', ssh],
      ['cd C:\\; type Users\\Jonathan\\.aws\\credentials', '~\\.aws'],
      // S5: the Mac's places still missing, translated.
      [
        'gc "$env:LOCALAPPDATA\\Packages\\TheBrowserCompany.Arc_ttt1ap7aakyb4\\LocalCache\\Local\\Arc\\User Data\\Default\\Cookies"',
        '%LOCALAPPDATA%\\Packages\\TheBrowserCompany.Arc_*',
      ],
      ['gci -Force $env:LOCALAPPDATA\\Microsoft\\Windows\\INetCookies', '%LOCALAPPDATA%\\Microsoft\\Windows\\INetCookies'],
      ['gc $env:APPDATA\\Microsoft\\Windows\\Cookies\\index.dat', '%APPDATA%\\Microsoft\\Windows\\Cookies'],
      // N6: the app as installed for this person.
      ['sc $env:LOCALAPPDATA\\Programs\\Simeon\\resources\\app.asar x', '%LOCALAPPDATA%\\Programs\\Simeon'],
      // And the review's plain ones still.
      ['gc ~/AppData/Local/Microsoft/Edge/User` Data/Default/Cookies', '%LOCALAPPDATA%\\Microsoft\\Edge'],
      ['gc ~\\Ap^pData\\Roaming\\Simeon\\x', '%APPDATA%\\Simeon'],
      ['gc ($HOME + "\\.ssh\\id_rsa")', ssh],
      ['gc K:\\.ssh\\id_rsa', ssh],
    ]
    for (const [command, shown] of commands) expect(inCommand(command), command).toBe(shown)
  })

  it('refuses a name read from the folder the command runs in (S2.8)', () => {
    expect(inCommand('sc Simeon\\local-tool-permission.json x', [pc.appData])).toBe('%APPDATA%\\Simeon')
    expect(inCommand('gci Protect', ['C:\\Users\\Jonathan\\AppData\\Roaming\\Microsoft'])).toBe(
      '%APPDATA%\\Microsoft\\Protect',
    )
    // A folder that is itself a place: the gate refuses the command whatever its words (rules.ts).
    const request = describeRequest('shellStreamArgs', { command: 'gc id_rsa' }, 'C:\\Users\\Jonathan\\terminals')
    const gate = (folders: string[]) =>
      refusal({ request, approvalId: undefined, permission: 'always', live: new Map(), terminalsFolder: 'C:\\t', places: pc, folders })
    expect(gate(['C:\\Users\\Jonathan\\.ssh'])).toBe(sensitiveRefusal('read-file', '~/.ssh', pc))
    expect(gate(['C:\\Users\\Jonathan\\SSH~1'])).toBe(sensitiveRefusal('read-file', '~/.ssh', pc))
    expect(gate(['C:\\Users\\Jonathan\\Documents'])).toBeUndefined()
  })

  it('reads a long name’s short form in the home folder too', () => {
    const long: SensitivePlaces = {
      home: 'C:\\Users\\Christopher',
      appData: 'C:\\Users\\Christopher\\AppData\\Roaming',
      localAppData: 'C:\\Users\\Christopher\\AppData\\Local',
      systemRoot: 'C:\\Windows',
      dataFolder: 'C:\\Users\\Christopher\\AppData\\Roaming\\Simeon',
    }
    expect(placeInCommand('gc C:\\Users\\CHRIST~1\\.ssh\\id_rsa', long)?.shown).toBe(ssh)
    expect(placeInCommand('gc C:\\Users\\CHRIST~1\\APPDATA\\Roaming\\MICROS~1\\Credentials', long)?.shown).toBe(
      '%APPDATA%\\Microsoft\\Credentials',
    )
    expect(placeForPath('C:\\Users\\CHRIST~1\\.ssh\\id_rsa', long)?.shown).toBe(ssh)
    expect(placeInCommand('gc C:\\Users\\CHRIST~1\\Documents\\x.txt', long)).toBeUndefined()
  })

  it('lets ordinary commands through', () => {
    for (const command of [
      'git log HEAD~1',
      'git rebase -i HEAD~3',
      'npm install && npm test',
      'echo .sshx',
      'cd ..; ls',
      'gc C:\\Users\\Jonathan\\Documents\\report.docx',
      'cd C:\\Users\\Jonathan\\Documents; gc notes.txt',
      'gci $env:APPDATA',
      'cd $env:APPDATA; gci',
      'gc $env:TEMP\\build.log',
      'Get-ChildItem C:\\PROGRA~1',
      'gc "C:\\Documents and Settings\\Public\\x.txt"',
    ])
      expect(inCommand(command), command).toBeUndefined()
  })

  it('cannot catch what is built while the command runs (said in the code and the record)', () => {
    for (const command of [
      'gc ([Environment]::GetEnvironmentVariable("USERPROFILE") + "\\.s" + "sh\\id_rsa")',
      'gc ~\\.s?h\\id_rsa',
      'gci ~ -Force -Recurse -Filter id_rsa | gc',
      'iex ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String("Z2Mgfi8uc3NoL2lkX3JzYQ==")))',
      'powershell -EncodedCommand ZwBjACAAfgAvAC4AcwBzAGgALwBpAGQAXwByAHMAYQA=',
      'cmdkey /list',
      'gci Cert:\\CurrentUser\\My',
    ])
      expect(inCommand(command), command).toBeUndefined()
  })

  it('reads the same spellings in a path', () => {
    const paths: [string, string | undefined][] = [
      ['\\\\JONATHANS-PC\\c$\\Users\\Jonathan\\.ssh\\id_rsa', ssh],
      ['\\\\[::1]\\c$\\Users\\Jonathan\\.ssh\\id_rsa', ssh],
      ['C:\\Users\\Jonathan\\SSH~1\\id_rsa', ssh],
      ['C:\\Users\\Jonathan\\AppData\\Roaming\\MICROS~1\\Protect\\x', '%APPDATA%\\Microsoft\\Protect'],
      ['C:\\Users\\Jonathan\\Application Data\\Microsoft\\Credentials\\x', '%APPDATA%\\Microsoft\\Credentials'],
      ['C:\\Documents and Settings\\Jonathan\\.ssh\\id_rsa', ssh],
      ['C:\\Users\\Jonathan\\.netrc::$DATA', '~\\.netrc'],
      ['file:///C:/Users/Jonathan/%2Essh/id_rsa', ssh],
      ['C:.ssh\\id_rsa', ssh],
      ['%APPDATA%\\Simeon\\local-tool-approvals.json', '%APPDATA%\\Simeon'],
      ['C:\\Users\\Jonathan\\AppData\\Local\\Packages\\TheBrowserCompany.Arc_x1\\LocalCache', '%LOCALAPPDATA%\\Packages\\TheBrowserCompany.Arc_*'],
      ['C:\\Users\\Jonathan\\AppData\\Local\\Packages\\Microsoft.WindowsTerminal_8wekyb3d8bbwe', undefined],
      ['C:\\Users\\Jonathan\\AppData\\Local\\Programs\\Simeon\\resources\\app.asar', '%LOCALAPPDATA%\\Programs\\Simeon'],
      ['D:\\Users\\Jonathan\\.ssh\\id_rsa', undefined],
    ]
    for (const [target, shown] of paths) expect(placeForPath(target, pc)?.shown, target).toBe(shown)
  })

  it('makes the short names Windows makes', () => {
    const matches = (name: string, short: string) => new RegExp(`^${shortNamePattern(name)}$`).test(short)
    expect(matches('.ssh', 'ssh~1')).toBe(true)
    expect(matches('microsoft', 'micros~1')).toBe(true)
    expect(matches('microsoft', 'micro~12')).toBe(true)
    expect(matches('microsoft', 'mi3f2a~1')).toBe(true)
    expect(matches('local-tool-permission.json', 'local-~1.jso')).toBe(true)
    // Not a name Windows would give it.
    expect(matches('.ssh', 's~1')).toBe(false)
    expect(matches('microsoft', 'm~1')).toBe(false)
    // An 8.3 name has none of its own.
    expect(shortNamePattern('appdata')).toBeUndefined()
    expect(shortNamePattern('_netrc')).toBeUndefined()
  })
})

describe('what a request is about (testWhatARequestIsAbout)', () => {
  const terminals = 'C:\\Users\\bass\\terminals'

  it('describes each kind', () => {
    expect(describeRequest('shellStreamArgs', { command: 'ls' }, terminals)).toEqual({
      action: 'run-command',
      target: 'ls',
      resourcePath: terminals,
      outlivesScope: false,
    })
    expect(describeRequest('shellStreamArgs', { command: 'ls', isBackground: true }, terminals)).toEqual({
      action: 'run-command',
      target: 'ls',
      resourcePath: terminals,
      outlivesScope: true,
    })
    // The computer names a terminal file `<folder>/<id>.txt`, with a forward slash.
    expect(describeRequest('readArgs', { path: `${terminals}/1234.txt` }, terminals)).toEqual({
      action: 'read-file',
      target: `${terminals}/1234.txt`,
      attachToResourcePath: terminals,
    })
    expect(describeRequest('readArgs', { path: 'C:\\Users\\bass\\x.txt' }, terminals)).toEqual({
      action: 'read-file',
      target: 'C:\\Users\\bass\\x.txt',
    })
    expect(describeRequest('lsArgs', { path: 'C:\\Users\\bass' }, terminals)).toEqual({
      action: 'list-directory',
      target: 'C:\\Users\\bass',
    })
    expect(describeRequest('writeShellStdinArgs', { chars: 'y\n' }, terminals)).toEqual({
      action: 'send-input',
      target: 'y\n',
    })
    expect(describeRequest('grepArgs', {}, terminals)).toBeUndefined()
  })

  it('covers a command’s terminal file, not with a trailing slash on one side', () => {
    const read: LocalToolRequest = {
      action: 'read-file',
      target: `${terminals}/1234.txt`,
      attachToResourcePath: terminals,
    }
    expect(covers({ action: 'run-command', target: 'ls', resourcePath: terminals }, read)).toBe(true)
    expect(covers({ action: 'run-command', target: 'ls', resourcePath: `${terminals}\\` }, read)).toBe(false)
  })
})

describe('the gate in its order (testTheGateInItsOrder)', () => {
  const terminals = 'C:\\Users\\bass\\terminals'
  const run: LocalToolRequest = { action: 'run-command', target: 'ls', resourcePath: terminals }
  const secret: LocalToolRequest = { action: 'read-file', target: '~/.ssh/id_rsa' }
  const approved = new Map<string, LocalToolApproval>([['q1', { id: 'q1', action: 'run-command', target: 'ls' }]])
  const gate = (
    request: LocalToolRequest | undefined,
    id: string | undefined,
    permission: Permission,
    live: Map<string, LocalToolApproval> = new Map(),
    folders?: string[],
  ) => refusal({ request, approvalId: id, permission, live, terminalsFolder: terminals, places: windows, folders })

  it('refuses keys first, whatever the setting, then Never, then what wasn’t allowed', () => {
    expect(gate(secret, undefined, 'always')?.startsWith('Simeon does not read')).toBe(true)
    expect(gate(run, undefined, 'never')).toBe(LocalExec.disabled)
    expect(gate(run, undefined, 'always')).toBeUndefined()
    expect(gate(undefined, undefined, 'always')).toBeUndefined()
    expect(gate(run, undefined, 'ask')).toBe(LocalExec.unapproved)
    expect(gate(run, '', 'ask', approved)).toBe(LocalExec.unapproved)
    expect(gate(undefined, 'q1', 'ask', approved)).toBe(LocalExec.unapproved)
    expect(gate(run, 'q2', 'ask', approved)).toBe(LocalExec.unapproved)
    expect(gate(run, 'q1', 'ask', approved)).toBeUndefined()
    expect(gate({ action: 'run-command', target: 'ls -la', resourcePath: terminals }, 'q1', 'ask', approved)).toBe(
      LocalExec.unapproved,
    )
    // The command's approval reads its own terminal file (AwaitExternalShell).
    expect(
      gate({ action: 'read-file', target: `${terminals}/42.txt`, attachToResourcePath: terminals }, 'q1', 'ask', approved),
    ).toBeUndefined()
  })

  it('refuses a command to run in a place that holds keys (as the Mac does)', () => {
    expect(gate(run, undefined, 'always', new Map(), ['C:\\Users\\bass\\.ssh'])?.startsWith('Simeon does not read')).toBe(true)
    expect(gate(run, undefined, 'always', new Map(), ['C:\\Users\\bass\\Documents'])).toBeUndefined()
    expect(gate(run, undefined, 'never', new Map(), ['C:\\Users\\bass\\.aws'])).toContain('~\\.aws')
  })
})

describe('where things may be (testWhereThingsMayBe)', () => {
  it('keeps to the root, on Windows’ terms', () => {
    const w = path.win32
    expect(escapesRoot('C:\\Users\\bass', 'C:\\Users\\bass', w)).toBe(false)
    expect(escapesRoot('C:\\Users\\bass', 'C:\\Users\\bass\\x\\y', w)).toBe(false)
    expect(escapesRoot('C:\\Users\\bass', 'c:\\users\\BASS\\x', w)).toBe(false)
    expect(escapesRoot('C:\\Users\\bass', 'C:\\Users\\other', w)).toBe(true)
    expect(escapesRoot('C:\\Users\\bass', 'C:\\Windows\\win.ini', w)).toBe(true)
    expect(escapesRoot('C:\\Users\\bass', 'D:\\bass', w)).toBe(true)
    expect(escapesRoot('C:\\Users\\bass', 'C:\\Users\\bass\\..foo', w)).toBe(true)
    expect(resolveAgainst('Downloads\\..\\x', 'C:\\Users\\bass', w)).toBe('C:\\Users\\bass\\x')
    expect(resolveAgainst('C:/tmp/./a/', 'C:\\Users\\bass', w)).toBe('C:\\tmp\\a')
  })

  it('keeps to the root, on the Mac’s', () => {
    const p = path.posix
    expect(escapesRoot('/Users/bass', '/Users/bass', p)).toBe(false)
    expect(escapesRoot('/Users/bass', '/Users/bass/x/y', p)).toBe(false)
    expect(escapesRoot('/Users/bass', '/Users/other', p)).toBe(true)
    expect(escapesRoot('/Users/bass', '/etc/hosts', p)).toBe(true)
    expect(escapesRoot('/Users/bass', '/Users/bass/..foo', p)).toBe(true)
    expect(resolveAgainst('Downloads/../x', '/Users/bass', p)).toBe('/Users/bass/x')
    expect(resolveAgainst('/tmp/./a/', '/Users/bass', p)).toBe('/tmp/a')
  })

  it('runs a command in the folder asked for, or says why not', () => {
    const w = path.win32
    const folder = workingDirectory('nowhere', 'C:\\Users\\bass', () => false, w)
    expect(folder.path).toBe('C:\\Users\\bass')
    expect(folder.notice).toBe(
      'working directory nowhere does not exist on this machine; running in C:\\Users\\bass instead\n',
    )
    expect(workingDirectory('  ', 'C:\\Users\\bass', () => true, w).path).toBe('')
    expect(workingDirectory('app', 'C:\\Users\\bass', (one) => one === 'C:\\Users\\bass\\app', w).path).toBe(
      'C:\\Users\\bass\\app',
    )
  })

  it('works from the root the environment names, else the home folder', () => {
    expect(rootFrom({}, 'C:\\Users\\bass')).toBe('C:\\Users\\bass')
    expect(rootFrom({ SIMEON_LOCAL_EXEC_ROOT: '  ', SAND_AGENT_PROJECT_DIR: '/srv/p' }, '/h')).toBe(path.resolve('/srv/p'))
  })
})

describe('the limits and the words (testLimitsAndWords)', () => {
  it('are the Mac’s', () => {
    expect(LocalExec.uploadFrameCap).toBe(139_875_670)
    expect(LocalExec.describe(200 * 1024 * 1024)).toBe('200.0 MiB')
    expect(LocalExec.fileTooLarge(200 * 1024 * 1024).startsWith("File is 200.0 MiB, which exceeds Simeon's 100.0 MiB limit")).toBe(true)
    expect([1, 2, 3, 4, 5, 6, 7].map((n) => LocalExec.backoffSeconds(n))).toEqual([1, 2, 4, 8, 10, 10, 10])
    expect(LocalExec.answerRetrySeconds.reduce((a, b) => a + b, 0)).toBe(120)
    expect([0, 502, 503, 401, 429, 400, 404, 413].map((s) => LocalExec.answerRetried(s))).toEqual([
      true, true, true, true, true, false, false, false,
    ])
    expect(LocalExec.blockMs({ timeout: 0, isBackground: false, timeoutBehaviorBackground: true, hardTimeout: 86_400_000 })).toBe(0)
    expect(LocalExec.blockMs({ timeout: 0, isBackground: false, timeoutBehaviorBackground: false })).toBe(30_000)
    expect(LocalExec.blockMs({ timeout: 5_000, isBackground: true, timeoutBehaviorBackground: true })).toBe(5_000)
  })
})

describe('the request stream (testTheRequestStream)', () => {
  const bytes = (text: string) => Buffer.from(text, 'utf8')

  it('reads blank-line blocks, data lines joined, pings and retry skipped', () => {
    const parser = new wire.EventParser()
    expect(parser.feed(bytes('retry: 1000\n\ndata: {"kind":"welcome","providerId":"p1"}\n\n:ping\n\n'))).toEqual([
      { kind: 'frame', json: { kind: 'welcome', providerId: 'p1' } },
    ])
    // A frame cut between two reads, then one that is not JSON.
    expect(parser.feed(bytes('data: {"requestId":"r1","kind":"ca'))).toEqual([])
    expect(parser.feed(bytes('ncel"}\n\ndata: {nope\n\n'))).toEqual([
      { kind: 'frame', json: { requestId: 'r1', kind: 'cancel' } },
      { kind: 'unreadable' },
    ])
    // The blank line itself cut between two reads.
    expect(parser.feed(bytes('data: {"kind":"welcome"}\n'))).toEqual([])
    expect(parser.feed(bytes('\ndata: {"kind":"x"}\n\n'))).toEqual([
      { kind: 'frame', json: { kind: 'welcome' } },
      { kind: 'frame', json: { kind: 'x' } },
    ])
  })

  it('finds the command a request carries', () => {
    const request = wire.readRequest({ requestId: 'r2', kind: 'exec', approvalId: 'a', serverMessage: { id: 7, readArgs: { path: '/x' } } })
    expect(request && wire.request.approvalId(request)).toBe('a')
    const command = wire.command(request ? (wire.request.serverMessage(request) ?? {}) : {})
    expect(command.kind).toBe('readArgs')
    expect(command.value).toEqual({ path: '/x' })
  })

  it('answers a block over the cap “too large” by the id near its start, the rest of it dropped', () => {
    const small = new wire.EventParser(64)
    expect(small.feed(bytes(`data: {"requestId":"big","kind":"upload","bytesBase64":"${'A'.repeat(100)}`))).toEqual([
      { kind: 'tooLarge', requestId: 'big' },
    ])
    expect(small.feed(bytes(`${'A'.repeat(50)}"}\n\ndata: {"kind":"welcome"}\n\n`))).toEqual([
      { kind: 'frame', json: { kind: 'welcome' } },
    ])
  })
})

describe('the answers’ shape (testTheAnswersShape)', () => {
  it('is protobuf’s JSON, as the shipped classes wrote it', () => {
    expect(wire.clientMessage(1, 'shellStream', wire.shellStart, 2)).toEqual({
      id: 1,
      shellStream: { start: { sandboxPolicy: { type: 'TYPE_INSECURE_NONE' } } },
      localExecutionTimeMs: 2,
    })
    expect(wire.shellOutput('stdout', 'total 8\n')).toEqual({ stdout: { data: 'total 8\n' } })
    expect(wire.shellExit({ code: 0, cwd: 'C:\\Users\\bass', aborted: false, localMs: 38 })).toEqual({
      exit: { cwd: 'C:\\Users\\bass', localExecutionTimeMs: 38 },
    })
    expect(
      wire.shellExit({ code: -1, cwd: 'C:\\Users\\bass', aborted: true, abortReason: 'SHELL_ABORT_REASON_USER_ABORT' }),
    ).toEqual({
      exit: { code: 4294967295, cwd: 'C:\\Users\\bass', aborted: true, abortReason: 'SHELL_ABORT_REASON_USER_ABORT' },
    })
    expect(
      wire.shellBackgrounded({ shellId: 482913, command: 'sleep 100', workingDirectory: '/Users/bass', pid: 4242, msToWait: 30000 }),
    ).toEqual({
      backgrounded: {
        shellId: 482913,
        command: 'sleep 100',
        workingDirectory: '/Users/bass',
        pid: 4242,
        msToWait: 30000,
        reason: 'SHELL_BACKGROUND_REASON_TIMEOUT',
      },
    })
    expect(
      wire.readText({ path: '/Users/bass/notes.txt', content: 'hello\nworld', totalLines: 2, fileSize: 11, truncated: false, rangeApplied: false }),
    ).toEqual({ success: { path: '/Users/bass/notes.txt', content: 'hello\nworld', totalLines: 2, fileSize: '11' } })
    expect(wire.readFailure('fileNotFound', '/x')).toEqual({ fileNotFound: { path: '/x' } })
    expect(wire.spawnSuccess({ shellId: 12345, command: 'npm run dev', workingDirectory: '/Users/bass/app', pid: 999 })).toEqual({
      success: { shellId: 12345, command: 'npm run dev', workingDirectory: '/Users/bass/app', pid: 999 },
    })
    expect(wire.thrown(0, 'no')).toEqual({ throw: { error: 'no' } })
    expect(wire.streamClose(1)).toEqual({ streamClose: { id: 1 } })
    expect(wire.heartbeat(1)).toEqual({ heartbeat: { id: 1 } })
    expect(wire.batch(undefined, [])).toEqual({ frames: [] })
  })
})

describe('reading a file (testReadingAFile)', () => {
  it('tells text, pictures and other files apart, and reads text as the Mac', () => {
    expect(readKind(Buffer.from('hello\n'))).toBe('text')
    expect(readKind(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0]))).toBe('image')
    expect(readKind(new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 0, 1, 2]))).toBe('binary')
    expect(readKind(Buffer.from('h\0i\0!\0\n\0', 'latin1'))).toBe('text')
    expect(decodeText(Buffer.from('a\r\nb\r\n'))).toBe('a\nb\n')
    expect(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, ...Buffer.from('x')]))).toBe('x')
    expect(decodeText(new Uint8Array([0x63, 0x61, 0x66, 0xe9]))).toBe('café')
    // Windows' older Notepad files: UTF-16 with its mark. The Mac's line-end rule counts bytes, so their CRLF stays (recorded).
    expect(decodeText(new Uint8Array([0xff, 0xfe, ...Buffer.from('hi\r\n', 'utf16le')]))).toBe('hi\r\n')
    expect(countLines('')).toBe(1)
    expect(countLines('a\nb\n')).toBe(3)
    const text = '1\n2\n3\n4\n5'
    expect(readRange(text, 5, 2, 2).content).toBe('2\n3')
    expect(readRange(text, 5, -2, undefined).content).toBe('4\n5')
    expect(readRange(text, 5, 9, undefined).applied).toBe(false)
    expect(readRange(text, 5, undefined, undefined).applied).toBe(false)
    expect(binaryRefusal('/a/b.ZIP')).toBe('Binary files of type .zip are not supported by the read executor')
    expect(binaryRefusal('C:\\a\\b')).toBe('Binary files without an extension are not supported by the read executor')
  })

  it('reads a path as written: file: addresses, ~, relative to the root', () => {
    const p = path.posix
    expect(resolveReadPath('file:///Users/bass/a', '/Users/bass', '/Users/bass', p)).toBe('/Users/bass/a')
    expect(resolveReadPath('~/a/../b', '/r', '/Users/bass', p)).toBe('/Users/bass/b')
    expect(resolveReadPath('x', '/r', '/Users/bass', p)).toBe('/r/x')
    const w = path.win32
    expect(resolveReadPath('file:///C:/Users/bass/a', 'C:\\Users\\bass', 'C:\\Users\\bass', w)).toBe('C:\\Users\\bass\\a')
    expect(resolveReadPath('~\\a\\..\\b', 'C:\\r', 'C:\\Users\\bass', w)).toBe('C:\\Users\\bass\\b')
    expect(resolveReadPath('x', 'C:\\r', 'C:\\Users\\bass', w)).toBe('C:\\r\\x')
  })
})

describe('the terminal file (testTheTerminalFile)', () => {
  it('is what the computer’s await tool reads', () => {
    const started = new Date(1_760_000_000_500)
    const head = TerminalFile.head({
      pid: 4242,
      cwd: 'C:\\Users\\bass',
      command: 'echo "hi"\tthere',
      title: '  ',
      status: 'running',
      startedAt: started,
      runningForMs: 1500,
    })
    expect(head).toBe(
      '---\npid: 4242\ncwd: "C:\\\\Users\\\\bass"\ncommand: "echo \\"hi\\"\\tthere"\nstatus: running  \nstarted_at: 2025-10-09T08:53:20.500Z\nrunning_for_ms: 1500     \n---\n',
    )
    expect(head.length).toBe(
      TerminalFile.head({ pid: 4242, cwd: 'C:\\Users\\bass', command: 'echo "hi"\tthere', status: 'succeeded', startedAt: started, runningForMs: 98765 }).length,
    )
    const file = `${head}hi\n${TerminalFile.foot({ exitCode: 0, elapsedMs: 1520, endedAt: new Date(started.getTime() + 1520) })}`
    const footer = /\n---\n([\s\S]*?)\n---\s*$/.exec(file)
    expect(footer?.[0]).toContain('exit_code: 0\nelapsed_ms: 1520\nended_at: ')
    expect(/running_for_ms:\s*(\d+)/.test(head)).toBe(true)
    expect(TerminalFile.foot({ exitCode: null, elapsedMs: 1, endedAt: started })).toContain('exit_code: unknown')
  })
})

describe('the shell’s state (testTheShellsState, PowerShell’s)', () => {
  const body = (state: unknown) => `${Buffer.from(JSON.stringify(state)).toString('base64')}${endMarker}\n`

  it('reads the state said after a marker, whole and with an absolute folder only', () => {
    const said = { cwd: 'C:\\Users\\bass\\app', env: [{ n: 'A', v: '1' }], functions: { n: 'Hi', v: "'hi'" }, aliases: [] }
    const parsed = parseStateBody(body(said))
    expect(parsed?.cwd).toBe('C:\\Users\\bass\\app')
    // PowerShell 5.1 writes a list of one as the one.
    expect(parsed?.state).toEqual({ env: [{ n: 'A', v: '1' }], functions: [{ n: 'Hi', v: "'hi'" }], aliases: [] })
    expect(parseStateBody(body({ ...said, cwd: '/Users/bass' }))?.cwd).toBe('/Users/bass')
    expect(parseStateBody(body({ ...said, cwd: 'relative' }))).toBeUndefined()
    expect(parseStateBody('half a dump')).toBeUndefined()
    expect(parseInitOutput(`Welcome!\n${stateMarker}\n${startMarker}${body(said)}`)?.cwd).toBe('C:\\Users\\bass\\app')
    expect(parseInitOutput(`${stateMarker}\nno state`)).toBeUndefined()
  })

  it('carries the command and the state on its input, never on its command line', () => {
    const line = commandInput('__M__', 'Get-Content secret.txt', { env: [], functions: [], aliases: [] })
    expect(line.endsWith('\n')).toBe(true)
    expect(JSON.parse(Buffer.from(line.trim(), 'base64').toString('utf8'))).toEqual({
      marker: '__M__',
      command: 'Get-Content secret.txt',
      env: [],
      functions: [],
      aliases: [],
    })
    const args = shellArguments('command')
    expect(args.slice(0, 5)).toEqual(['-NoProfile', '-NoLogo', '-NonInteractive', '-OutputFormat', 'Text'])
    expect(args.join(' ')).not.toContain('secret')
    // The person's profile only for the first state.
    expect(shellArguments('init')).not.toContain('-NoProfile')
    expect(Buffer.from(args.at(-1) ?? '', 'base64').toString('utf16le')).toBe(commandScript)
    expect(commandScript).toContain('. $__simeonBlock | Out-Default')
    expect(commandScript).toContain("'$global:__simeonOk = $?'")
    expect(initScript).toContain(stateMarker)
  })

  it('gives every command the Mac’s environment, and Windows’ own folders first when missing', () => {
    const env = shellEnvironment({ Path: 'C:\\Tools', ELECTRON_RUN_AS_NODE: '1', SystemRoot: 'C:\\Windows' }, 'C:\\Users\\bass', 'win32')
    expect(env.ELECTRON_RUN_AS_NODE).toBeUndefined()
    expect(env.SIMEON_AGENT).toBe('1')
    expect(env.TERM).toBe('dumb')
    expect(env.NO_COLOR).toBe('1')
    expect(env.AGENT_TRANSCRIPTS).toBe('C:\\Users\\bass\\agent-transcripts')
    expect(env.Path?.split(';')).toEqual([
      'C:\\Windows\\System32',
      'C:\\Windows',
      'C:\\Windows\\System32\\Wbem',
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0',
      'C:\\Tools',
    ])
    expect(env.PATH).toBeUndefined()
    const kept = shellEnvironment({ PATH: 'C:\\Windows\\System32;C:\\Windows;C:\\Windows\\System32\\Wbem;C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\' }, 'C:\\r', 'win32')
    expect(kept.PATH?.split(';')).toHaveLength(4)
    expect(shellEnvironment({ PATH: '/usr/bin' }, '/r', 'linux').PATH).toBe('/usr/bin')
  })

  it('finds PowerShell 7 first, else Windows PowerShell, by full paths only', () => {
    const have = (files: string[]) => (file: string) => files.includes(file)
    expect(findPowerShell({ PATH: 'C:\\Tools;.;relative' }, 'win32', have(['C:\\Tools\\pwsh.exe']))).toBe('C:\\Tools\\pwsh.exe')
    expect(findPowerShell({ PATH: '.' }, 'win32', have(['pwsh.exe']))).toBe(undefined)
    expect(findPowerShell({ ProgramFiles: 'C:\\Program Files' }, 'win32', have(['C:\\Program Files\\PowerShell\\7\\pwsh.exe']))).toBe(
      'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
    )
    expect(findPowerShell({ SystemRoot: 'C:\\Windows' }, 'win32', have(['C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe']))).toBe(
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
    )
    expect(findPowerShell({ PATH: '/opt/pwsh:/usr/bin' }, 'linux', have(['/opt/pwsh/pwsh']))).toBe('/opt/pwsh/pwsh')
  })

  it('takes the state off the output, even cut between two reads', () => {
    const out: string[] = []
    const splitter = new StateSplitter(Buffer.from('__MARK__'), (data) => out.push(data.toString()))
    splitter.push(Buffer.from('hello __MA'))
    expect(out.join('')).toBe('hello ')
    splitter.push(Buffer.from('RK__state'))
    splitter.push(Buffer.from(' more'))
    splitter.end()
    expect(out.join('')).toBe('hello ')
    expect(splitter.stateText).toBe('state more')
    const plain: string[] = []
    const other = new StateSplitter(Buffer.from('__MARK__'), (data) => plain.push(data.toString()))
    other.push(Buffer.from('ends with __M'))
    other.end()
    expect(plain.join('')).toBe('ends with __M')
    expect(other.stateText).toBeUndefined()
  })

  it('takes the state after the marker’s last time, the earlier ones as output (S3)', () => {
    const out: string[] = []
    const splitter = new StateSplitter(Buffer.from('__MARK__'), (data) => out.push(data.toString()))
    splitter.push(Buffer.from('a __MARK__ printed by the command, then __MA'))
    splitter.push(Buffer.from('RK__the state'))
    splitter.end()
    expect(out.join('')).toBe('a __MARK__ printed by the command, then ')
    expect(splitter.stateText).toBe('the state')
  })

  it('holds no more than its cap after the marker, then gives it as output (S3)', () => {
    const out: Buffer[] = []
    const logs: string[] = []
    const splitter = new StateSplitter(Buffer.from('__MARK__'), (data) => out.push(data), (line) => logs.push(line), 1_000)
    splitter.push(Buffer.from('__MARK__'))
    for (let i = 0; i < 10; i += 1) splitter.push(Buffer.alloc(300, 120))
    // Over the cap: what was held went out as output, the next marker is looked for again.
    expect(Buffer.concat(out).length).toBeGreaterThan(1_000)
    splitter.push(Buffer.from('__MARK__real state'))
    splitter.end()
    expect(splitter.stateText).toBe('real state')
    expect(logs.some((line) => line.includes('passed its cap'))).toBe(true)
    expect(logs.join('\n')).not.toContain('xxx')
  })

  it('keeps the run’s marker out of every variable a command can list (S3)', () => {
    // Only a closure holds it: the line is read in a scope of its own, then let go.
    expect(commandScript).not.toMatch(/\$__simeonRun\.marker/)
    expect(commandScript).toContain('.GetNewClosure()')
    expect(commandScript).toContain('Remove-Variable run, item')
    expect(commandScript).toContain('Remove-Variable __simeonRun')
  })
})

describe('the stream’s words to the agent', () => {
  it('makes Windows’ line ends the Mac’s, across pieces (N9)', () => {
    const lines = new LineEnds()
    const out = [lines.write(Buffer.from('one\r\ntwo\r')), lines.write(Buffer.from('\nthree\r')), lines.end()].join('')
    expect(out).toBe('one\ntwo\nthree\r')
    const split = new LineEnds()
    const euro = Buffer.from('€\r\n')
    expect(split.write(euro.subarray(0, 1)) + split.write(euro.subarray(1)) + split.end()).toBe('€\n')
  })

  it('names the shell by its program', () => {
    expect(shellName('C:\\Program Files\\PowerShell\\7\\pwsh.exe')).toBe('pwsh')
    expect(shellName('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe')).toBe('powershell')
    expect(shellName('/usr/bin/pwsh')).toBe('pwsh')
  })
})

describe('the setting (LocalToolPermissionTests)', () => {
  let folder: string | undefined
  afterEach(() => {
    if (folder) rmSync(folder, { recursive: true, force: true })
    folder = undefined
  })

  it('reads anything else as the default, and the ceiling lowers it', () => {
    expect(normalizePermission('always')).toBe('always')
    expect(normalizePermission('Always')).toBe('ask')
    expect(normalizePermission(undefined)).toBe('ask')
    const all: Permission[] = ['always', 'ask', 'never']
    for (const choice of all) {
      expect(capped(choice, undefined)).toBe(choice)
      for (const ceiling of all) expect(capped(choice, ceiling)).toBe(rank(choice) <= rank(ceiling) ? choice : ceiling)
    }
    expect(capped('always', 'never')).toBe('never')
  })

  it('keeps each account’s own (testEachAccountKeepsItsOwn)', () => {
    folder = mkdtempSync(path.join(os.tmpdir(), 'simeon-hands-'))
    const settings = new LocalToolSettings(folder)
    expect(settings.effective).toBe('ask')
    settings.scope('a@x.co')
    settings.choice = 'always'
    settings.ceiling = 'ask'
    expect(settings.effective).toBe('ask')
    settings.ceiling = undefined
    expect(settings.effective).toBe('always')
    settings.scope('a@x.co')
    expect(settings.choice).toBe('always')
    settings.ceiling = 'never'
    settings.scope('b@x.co')
    expect(settings.choice).toBe('ask')
    expect(settings.ceiling).toBeUndefined()
    settings.choice = 'never'
    settings.clearScope()
    expect(settings.choice).toBe('ask')
    // A damaged file is the default, never more.
    writeFileSync(settings.file, '{"choice":"always"')
    expect(new LocalToolSettings(folder).effective).toBe('ask')
  })

  it('reads an edited file as “Ask every time” with no ceiling, and holds what it read (tamper-evident)', () => {
    folder = mkdtempSync(path.join(os.tmpdir(), 'simeon-hands-'))
    const key = SigningKey.forThisRun()
    const settings = new LocalToolSettings(folder, key)
    settings.scope('a@x.co')
    settings.choice = 'never'
    settings.ceiling = 'never'
    // Read again with its key: what was kept.
    expect(new LocalToolSettings(folder, key).now()).toEqual({ choice: 'never', ceiling: 'never', effective: 'never' })
    // A command that writes the file plainly: not read at the next start; the running app holds what it had.
    writeFileSync(settings.file, JSON.stringify({ account: 'a@x.co', choice: 'always' }))
    expect(settings.effective).toBe('never')
    expect(new LocalToolSettings(folder, key).now()).toEqual({ choice: 'ask', ceiling: null, effective: 'ask' })
    // A body changed under a signature, or another key's: the same.
    settings.choice = 'never'
    const signed = JSON.parse(readFileSync(settings.file, 'utf8')) as { body: string }
    writeFileSync(settings.file, JSON.stringify({ ...signed, body: signed.body.replace('never', 'always') }))
    expect(new LocalToolSettings(folder, key).effective).toBe('ask')
    settings.choice = 'always'
    expect(new LocalToolSettings(folder, SigningKey.forThisRun()).effective).toBe('ask')
    // Nor is the answers' file taken for the setting's.
    const approvals = new LocalToolApprovals(folder, key)
    approvals.record({ id: 'q', action: 'run-command', target: 'ls' })
    writeFileSync(settings.file, readFileSync(approvals.approvalsFile))
    expect(new LocalToolSettings(folder, key).effective).toBe('ask')
  })

  it('keeps its key sealed, and starts again from Ask when the key does not open', () => {
    folder = mkdtempSync(path.join(os.tmpdir(), 'simeon-hands-'))
    const file = path.join(folder, 'local-tool-key.sealed')
    // A stand-in for Windows' protection: reversible, never the key as written.
    const sealer = {
      available: () => true,
      seal: (text: string) => Buffer.from(text.split('').reverse().join(''), 'utf8'),
      open: (sealed: Buffer) => sealed.toString('utf8').split('').reverse().join(''),
    }
    const logs: string[] = []
    const first = new SigningKey(file, sealer, (line) => logs.push(line))
    expect(writeSigned(path.join(folder, 'x.json'), first, 'x', { choice: 'always' })).toBe(true)
    expect(readFileSync(file, 'utf8')).not.toContain(first.value.toString('hex'))
    expect(readSigned(path.join(folder, 'x.json'), new SigningKey(file, sealer), 'x')).toEqual({ choice: 'always' })
    writeFileSync(file, 'damaged')
    expect(readSigned(path.join(folder, 'x.json'), new SigningKey(file, sealer, (line) => logs.push(line)), 'x')).toBeUndefined()
    expect(logs.join('\n')).toContain('did not open')
    expect(logs.join('\n')).not.toMatch(/[0-9a-f]{64}/)
  })
})

describe('“Allow once” (LocalToolApprovalsTests)', () => {
  let folder: string | undefined
  afterEach(() => {
    if (folder) rmSync(folder, { recursive: true, force: true })
    folder = undefined
  })

  it('records, retires and clears', () => {
    folder = mkdtempSync(path.join(os.tmpdir(), 'simeon-approvals-'))
    const approvals = new LocalToolApprovals(folder)
    expect(approvals.all().size).toBe(0)
    approvals.record({ id: 'q1', action: 'run-command', target: 'ls -la' })
    approvals.record({ id: 'q2', action: 'read-file', target: 'C:\\tmp\\a', resourcePath: 'C:\\tmp\\a' })
    expect(approvals.all().get('q2')?.resourcePath).toBe('C:\\tmp\\a')
    const written = JSON.parse(readFileSync(approvals.approvalsFile, 'utf8')) as { body: string }
    expect((JSON.parse(written.body) as { approvals: unknown[] }).approvals).toHaveLength(2)
    approvals.retire('q1')
    expect([...approvals.live().keys()]).toEqual(['q2'])
    expect([...approvals.all().keys()].sort()).toEqual(['q1', 'q2'])
    approvals.clear()
    expect(approvals.all().size).toBe(0)
    // A row the Electron app would not read is not read here either.
    expect(readApproval({ id: 'x', action: 'delete-everything', target: '/' })).toBeUndefined()
    expect(readApproval({ id: '', action: 'run-command', target: 'ls' })).toBeUndefined()
  })

  it('takes no answer from a file it did not sign, and keeps the retired ones with them (tamper-evident)', () => {
    folder = mkdtempSync(path.join(os.tmpdir(), 'simeon-approvals-'))
    const key = SigningKey.forThisRun()
    const approvals = new LocalToolApprovals(folder, key)
    approvals.record({ id: 'q1', action: 'run-command', target: 'ls' })
    approvals.retire('q1')
    approvals.record({ id: 'q2', action: 'run-command', target: 'dir' })
    // Read again (the next start): the same, the retired one still retired.
    expect([...new LocalToolApprovals(folder, key).live().keys()]).toEqual(['q2'])
    // An answer a command writes for itself counts for nothing, now or at the next start.
    writeFileSync(
      approvals.approvalsFile,
      JSON.stringify({ approvals: [{ id: 'forged', action: 'run-command', target: 'gc secret' }] }),
    )
    expect(approvals.live().has('forged')).toBe(false)
    expect(new LocalToolApprovals(folder, key).live().size).toBe(0)
  })
})

describe('the computer’s address from the page', () => {
  const api = 'https://api.simeonlabs.com'

  it('is Simeon Labs’ own, the app’s server, or this computer; with the gateway’s headers only', () => {
    expect(
      checkTarget({ baseURL: 'https://api.simeonlabs.com/sand-box/b1/p/8790/', headers: { Authorization: 'Bearer t' } }, api),
    ).toEqual({ baseURL: 'https://api.simeonlabs.com/sand-box/b1/p/8790', headers: { authorization: 'Bearer t' } })
    expect(checkTarget({ baseURL: 'https://box1-8790.simeonlabs.com', headers: {} }, api).baseURL).toBe(
      'https://box1-8790.simeonlabs.com',
    )
    expect(
      checkTarget({ baseURL: 'http://127.0.0.1:4100/box', headers: { 'x-anyrun-network-token': 'n' } }, 'http://127.0.0.1:9000')
        .baseURL,
    ).toBe('http://127.0.0.1:4100/box')
    // This computer only for a server on this computer (a developer's build, the checks), never with Simeon Labs' (N2).
    expect(() => checkTarget({ baseURL: 'http://127.0.0.1:4100/box', headers: {} }, api)).toThrow()
    expect(() => checkTarget({ baseURL: 'http://localhost:4100/box', headers: {} }, api)).toThrow()
    expect(checkTarget({ baseURL: 'http://10.0.0.2:4100/box', headers: {} }, 'http://10.0.0.2:4100').baseURL).toBe(
      'http://10.0.0.2:4100/box',
    )
    for (const bad of [
      { baseURL: 'http://api.simeonlabs.com/box', headers: {} },
      { baseURL: 'https://evil.example/box', headers: {} },
      { baseURL: 'https://simeonlabs.com.evil.example/box', headers: {} },
      { baseURL: 'https://user:pw@api.simeonlabs.com/box', headers: {} },
      { baseURL: 'https://api.simeonlabs.com/box?x=1', headers: {} },
      { baseURL: 'file:///etc/passwd', headers: {} },
      { baseURL: 'https://api.simeonlabs.com/box', headers: { cookie: 'a' } },
      { baseURL: 'https://api.simeonlabs.com/box', headers: { authorization: 'a\r\nx: y' } },
      { baseURL: 'https://api.simeonlabs.com/box', headers: [] },
      'https://api.simeonlabs.com/box',
      null,
    ])
      expect(() => checkTarget(bad, api), JSON.stringify(bad)).toThrow()
  })

  it('never says what it held when it refuses', () => {
    try {
      checkTarget({ baseURL: 'https://api.simeonlabs.com/box', headers: { authorization: 'Bearer secret-token\n' } }, api)
    } catch (error) {
      expect(String(error)).not.toContain('secret-token')
    }
    expect(sameTarget({ baseURL: 'a', headers: { authorization: 'x' } }, { baseURL: 'a', headers: { authorization: 'x' } })).toBe(true)
    expect(sameTarget({ baseURL: 'a', headers: { authorization: 'x' } }, { baseURL: 'a', headers: { authorization: 'y' } })).toBe(false)
  })
})
