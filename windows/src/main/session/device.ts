// This PC's maker and model for a report (the Mac's `hw.model`, the core's
// `DeviceFacts.modelIdentifier`): Windows keeps them in its registry
// (`HKLM\HARDWARE\DESCRIPTION\System\BIOS`, readable by any account),
// read once with Windows' own `reg.exe`. Elsewhere, and when Windows says
// nothing, the processor's kind (`os.machine()`, "x86_64", "arm64").

import { execFile } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'

const biosKey = 'HKLM\\HARDWARE\\DESCRIPTION\\System\\BIOS'

/** A value of `reg query`'s answer: the text after `REG_SZ` on the line naming it. */
export function registryValue(answer: string, name: string): string | undefined {
  for (const line of answer.split(/\r?\n/)) {
    const found = /^\s*(\S+)\s+REG_SZ\s+(.*?)\s*$/.exec(line)
    if (found && found[1] === name && found[2]) return found[2]
  }
  return undefined
}

/** The maker and the model, the maker left out when the model already names it ("LENOVO 21HM", "Microsoft Corporation Surface Laptop 5"). */
export function modelName(maker: string | undefined, model: string | undefined): string {
  const named = (model ?? '').trim()
  const by = (maker ?? '').trim()
  if (!named) return by
  if (!by || named.toLowerCase().startsWith(by.toLowerCase())) return named
  return `${by} ${named}`
}

/** Windows' own `reg.exe`, by its full path (never one found on `PATH`). */
function regTool(): string {
  return path.win32.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'reg.exe')
}

function readBIOS(): Promise<string> {
  return new Promise((done) => {
    execFile(
      regTool(),
      ['query', biosKey],
      { timeout: 3_000, windowsHide: true, maxBuffer: 256 * 1024 },
      (error, stdout) => done(error ? '' : String(stdout)),
    )
  })
}

let known: Promise<string> | undefined

export function deviceModel(platform: string = process.platform): Promise<string> {
  known ??= (async () => {
    if (platform === 'win32') {
      const answer = await readBIOS()
      const name = modelName(
        registryValue(answer, 'SystemManufacturer'),
        registryValue(answer, 'SystemProductName'),
      )
      if (name) return name.slice(0, 120)
    }
    return os.machine()
  })()
  return known
}
