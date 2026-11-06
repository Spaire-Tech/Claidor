// The system and the shell of the person's computer, as its local-exec
// provider says them in its hello. The Windows app's says them
// (windows/src/main/hands/provider.ts: `platform: "win32"`, `shell`:
// "powershell" or "pwsh", `shellVersion`, `osVersion`); the Mac's says
// none, and an engine that hears none goes on taking the computer for a
// Mac, as it always has. What the agent is told of it, and the paths it is
// given, follow from here.

/** What a hello says of the computer's system and shell; each field only when it said it. */
export interface LocalExecPlatform {
  /** `process.platform` on that computer: `win32` on Windows. */
  readonly platform?: string;
  /** `powershell` (Windows PowerShell 5.1) or `pwsh` (PowerShell 7). */
  readonly shell?: string;
  /** `$PSVersionTable.PSVersion`, e.g. `5.1.22621.4391` or `7.5.4`. */
  readonly shellVersion?: string;
  /** e.g. "Windows 11 Pro 10.0.26100". */
  readonly osVersion?: string;
}

function plain(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  // One short line: nothing a provider says reaches the agent's instructions as more than that.
  return text.length > 0 && text.length <= max && !/[\u0000-\u001f\u007f`]/.test(text) ? text : undefined;
}

/** The platform fields of a hello frame, each a short plain line or left out. */
export function localExecPlatformOf(frame: Readonly<Record<string, unknown>>): LocalExecPlatform {
  const platform = plain(frame.platform, 16);
  const shell = plain(frame.shell, 16);
  const shellVersion = plain(frame.shellVersion, 32);
  const osVersion = plain(frame.osVersion, 96);
  return {
    ...(platform === undefined ? {} : { platform }),
    ...(shell === undefined ? {} : { shell }),
    ...(shellVersion === undefined ? {} : { shellVersion }),
    ...(osVersion === undefined ? {} : { osVersion }),
  };
}

/** Whether the computer said it is a Windows PC. */
export function isWindowsComputer(info: LocalExecPlatform | undefined): boolean {
  return info?.platform === "win32";
}

/** The shell as the person's computer named it: "PowerShell 7.5.4", "Windows PowerShell 5.1.22621.4391". */
function shellNamed(info: LocalExecPlatform): string | undefined {
  const version = info.shellVersion === undefined ? "" : ` ${info.shellVersion}`;
  if (info.shell === "pwsh") return `PowerShell${version}`;
  if (info.shell === "powershell") return `Windows PowerShell${version}`;
  return undefined;
}

/**
 * The section of the agent's instructions about the person's computer, when
 * it is a Windows PC; null otherwise (a Mac's instructions are unchanged).
 */
export function userComputerSection(info: LocalExecPlatform | undefined): string | null {
  if (info === undefined || !isWindowsComputer(info)) return null;
  const system = info.osVersion === undefined ? "Windows" : `Windows (${info.osVersion})`;
  const shell = shellNamed(info);
  return [
    `The user's computer is a Windows PC: ${system}.`,
    "- ExternalShell there runs Windows PowerShell 5.1 (or PowerShell 7): write PowerShell and Windows paths, not bash or POSIX paths." +
      (shell === undefined ? "" : ` This one is ${shell}.`),
    "- Separate commands with `;` (Windows PowerShell 5.1 has no `&&` or `||`); read and set variables as `$env:NAME`; use `Get-ChildItem`, `Get-Content`, `Select-String`, `Copy-Item`, `Remove-Item -Recurse -Force`.",
    "- Paths look like `C:\\Users\\<name>\\Documents\\report.pdf` (`~` is their home folder); give ExternalRead, CopyToBox and CopyFromBox the same Windows paths.",
    "- When you ask the user to do something on their computer themselves (a refused place such as `~\\.ssh`, a sign-in, a step only they can take), call it their PC, never their Mac, and give PowerShell for them to run (`Get-Content $env:USERPROFILE\\.ssh\\id_ed25519.pub`), never Terminal, bash or `cat`.",
  ].join("\n");
}
