/**
 * The computer's screen stream, made legible. The Computer panel shows a
 * spinner until noVNC inside the box's page reports a live connection, and
 * nothing in the shipped renderer times that out or names a reason. This
 * module is the shared vocabulary for the diagnostic the main process
 * writes (`electron-main/vnc/computer-stream-log.ts`), the lines the VNC
 * preload prints from inside the page, and the notice the window preload
 * paints over a spinner that never ends.
 */
export const COMPUTER_STREAM_CHANNEL = "sand:computer-stream";
export const COMPUTER_STREAM_LOG_FILE_NAME = "computer-stream.log";
/** Lines the VNC preload prints inside the box's page start with this. */
export const SCREEN_LINE_TAG = "[SimeonScreen]";

export interface ComputerStreamMessage {
  readonly line: string;
  readonly filePath?: string;
}

export function isComputerStreamMessage(value: unknown): value is ComputerStreamMessage {
  if (typeof value !== "object" || value == null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.line === "string" && (record.filePath === undefined || typeof record.filePath === "string");
}

/**
 * One sentence a person can act on, read off a log line; `null` when the
 * line says nothing about why the screen is not connecting, and `""` when
 * it says the screen connected, so a notice can clear.
 */
export function computerStreamReason(line: string): string | null {
  if (/\bstate=connected\b/.test(line) || /\bguest connected\b/.test(line) || /local docker: gateway ready/.test(line)) return "";
  const reach = /box reachability outcome=(\S+) method=(\S+) cause=(\S+)/.exec(line);
  if (reach != null) {
    const [, outcome, method, cause] = reach;
    if (outcome === "timeout") return `The computer's gateway did not answer "${method}" within the deadline.`;
    if (outcome === "network") return `The computer's gateway could not be reached for "${method}" (${cause}).`;
    if (outcome === "box_blocked") return "The computer is blocked or paused.";
    return `The computer's gateway failed "${method}": ${outcome} (${cause}).`;
  }
  const docker = /local docker FAILED: (.+)$/.exec(line);
  if (docker != null) return docker[1] ?? "The local Docker computer failed to start.";
  const failedLoad = /guest load FAILED code=(-?\d+) \(([^)]*)\)/.exec(line);
  if (failedLoad != null) return `The screen page did not load (${failedLoad[2]}, ${failedLoad[1]}).`;
  if (/guest preload FAILED/.test(line)) return "The screen page's helper script failed to load.";
  if (/renderer gone/.test(line)) return "The screen page crashed.";
  if (line.includes(SCREEN_LINE_TAG)) {
    if (/noVNC did not start/.test(line)) return "noVNC never started inside the screen page.";
    if (/dialog=noVNC_credentials_dlg/.test(line)) return "The desktop is asking for a password.";
    if (/dialog=noVNC_connect_dlg/.test(line)) return "noVNC is waiting for a Connect click: autoconnect did not fire.";
    if (/status="Failed to connect to server"/.test(line)) return "noVNC cannot reach the desktop's socket.";
    if (/status="Something went wrong, connection is closed"/.test(line)) return "The desktop closed the connection.";
    if (/status="Disconnected"/.test(line)) return "noVNC disconnected.";
    const pageError = /page error: (.+)$/.exec(line);
    if (pageError != null) return `Error inside the screen page: ${pageError[1]}`;
  }
  const consoleError = /guest console\[error\] (.+)$/.exec(line);
  if (consoleError != null) return `Error inside the screen page: ${consoleError[1]}`;
  return null;
}
