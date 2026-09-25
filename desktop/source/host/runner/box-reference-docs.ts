import { rm } from "node:fs/promises";
import { join } from "node:path";
import { writeFileAtomic } from "../../shared/node/atomic-write.js";
import {
  ensureDataRootAlias,
  getSandRootDir,
  SAND_BOX_DATA_ROOT,
  SAND_BOX_MODEL_VISIBLE_DATA_ROOT,
} from "../host-paths.js";

export const SAND_BOX_REFERENCE_DIR = "/home/box/reference";
export const LEGACY_SAND_BOX_REFERENCE_DIR = "/home/box/sand-reference";
export const DEBUGGING_THE_BOX_FILE = "debugging-the-box.md";
export const SAND_APP_UI_FILE = "app-ui.md";
export const SAND_BOX_DEBUGGING_REFERENCE_PATH =
  `${SAND_BOX_REFERENCE_DIR}/${DEBUGGING_THE_BOX_FILE}`;
export const SAND_APP_UI_REFERENCE_PATH =
  `${SAND_BOX_REFERENCE_DIR}/${SAND_APP_UI_FILE}`;

export const SAND_BOX_DEBUGGING_REFERENCE_DOC = [
  "# Debugging the box",
  "",
  "When the box acts up (won't start, Shell or Screenshot calls fail, a computerUse subagent reports Computer failures, or the desktop won't render), diagnose it yourself before giving up, and keep the user posted with a plain status instead of going silent.",
  `- Is it up? If a Shell command returns output, the box is running and its daemon is healthy. If a box tool instead comes back saying the computer is still starting up (its image is downloading or it's booting), that's transient: wait a few seconds and retry, since a first boot or image pull can take minutes. If Shell isn't offered to you at all, the box substrate is down; in the local Docker setup that means Docker isn't running, which the user fixes from the app's "computer needs Docker" prompt.`,
  "- Run the self-check. The box ships a box-doctor health check that runs once at startup and on demand: run `box-doctor` over Shell to probe the live box, or read its last startup result at /tmp/box-doctor.log (its summary also lands in the box's startup log alongside the other /tmp logs). It verifies the handful of things that silently break the box (a valid /etc/machine-id, Chrome and its version, DNS/egress, the system clock, and the D-Bus session bus) and prints one `[box-doctor] PASS|FAIL <name>: <detail>` line per check plus a final `[box-doctor] SUMMARY`. When a page or login times out for no clear reason, run this first and report the failing check to the user instead of guessing.",
  "- Desktop not rendering? Have a computerUse subagent capture the real screen (or use Screenshot when you hold it), then use Shell only for read-only diagnostics. The primary desktop is display :1, so xdpyinfo -display :1 confirms the X server is up. The desktop comes up with no browser window, so no Chrome process is normal until a computerUse subagent opens it. Each desktop piece logs under /tmp on the box (start-desktop.log for the overall bringup, plus x11vnc:1.log and novnc:1.log), so tail those to see which one failed; a stale X or Chrome lock left over from a wake is a known cause. If Chrome itself will not start, launch it from Shell with the box's own `box-chrome` launcher (never a raw chrome binary), then inspect the resulting process and logs with Shell; don't drive GUI apps from Shell with input automation such as xdotool or Shell CDP.",
  "- Which runtime, and is it healthy? In Simeon the box is a local Docker container on the user's Mac named simeon-box (a cloud box is coming soon), behind Shell plus the Computer tool delegated to computerUse subagents. /.dockerenv is present from Shell. From ExternalShell on the user's computer you can inspect it with docker ps, docker logs simeon-box and docker inspect simeon-box; a stopped Docker Desktop is why the box won't come up, and the host's own log is /tmp/sand-host.log inside the container.",
  "- Commands failing? Check the basics over Shell: df -h /workspace for disk (your persistent scratch space) plus the command's own error text. Files and installed tools persist across turns, so a tool that went missing just needs reinstalling.",
  `- Next steps: retry first, since most failures are just a box still booting. You can't rebuild the box yourself, so if it's wedged, surface a clear status and tell the user to recover it from Settings → Updates → "Update Simeon's Computer" (its button says "Update"; it restarts the container and keeps files and logins), or, from a terminal, docker restart simeon-box. Quitting and reopening Simeon reconnects to the same box. request_box_help is for handing the user a manual step on a working desktop (a login or captcha), not a repair tool.`,
  "",
].join("\n");

export const SAND_APP_UI_REFERENCE_DOC = [
  "# The Simeon app UI (real paths — never invent others)",
  "",
  `A compact map of Simeon's real interface so you can guide the user or self-recover. Use only what's listed here; for anything else, follow "Never fabricate data" and say you're unsure rather than inventing a path.`,
  `- Opening settings: the sidebar account button at the bottom-left (avatar + account name), the Cmd+, shortcut, or the command palette's "Open settings". There's no gear icon or macOS Preferences menu item.`,
  `- Deleting an agent: the user does this from the sidebar — right-click the agent's row and choose "Delete" (a permanent delete that removes the agent and its transcript, with a confirm). It's not in Settings; there's no archive or hide, just this permanent delete.`,
  "- Settings has three tabs: General, Usage & Billing, Updates. (Plugins, connectors and MCP servers live in the plus menu of the composer and in the connect cards you draw, not in Settings.)",
  '- General: the account card ("Sign In" / "Sign Out").',
  '- Plugins are installed from the composer\'s plus menu ("Add connector") or through the connect cards you send; an installed connector shows its live status there, with a one-click Authenticate when sign-in is needed. There is no Plugins tab in Settings.',
  "- Usage & Billing: the month's model spend against the allowance.",
  `- Updates: box recovery is "Update Simeon's Computer" (its button says "Update"; data-preserving — it moves the box to a fresh instance while keeping files and logins), a two-click confirm ("Click Again to Confirm"). The "Reset Simeon's Computer" row (button "Reset") is the destructive recovery of last resort: it restores from the last saved snapshot and can lose recent unsynced work, so steer users to Update instead. Updates also has "Update Track" (Stable / Nightly) and "Check for Updates", which update the Simeon app itself, distinct from "Update Simeon's Computer" (which recreates the box).`,
  `- Per-agent info pane (separate from the global Settings): open it by clicking the agent's name in the chat header (or Cmd+Shift+I), close it with the "X" in the pane's own header. It shows a live preview of that agent's computer (click it to open the full screen view) over its Routines list, plus Channels when a channel connector is available to connect or one is already connected, and Members in group chats. The gear beside the "X" opens a per-agent Settings subpage (avatar, name, title, description, and per-assistant notifications).`,
  "",
].join("\n");

export const SAND_BOX_REFERENCE_DOCS = [
  { fileName: DEBUGGING_THE_BOX_FILE, contents: SAND_BOX_DEBUGGING_REFERENCE_DOC },
  { fileName: SAND_APP_UI_FILE, contents: SAND_APP_UI_REFERENCE_DOC },
] as const;

export async function writeSandBoxReferenceDocs(
  referenceDir = SAND_BOX_REFERENCE_DIR,
): Promise<string[]> {
  const encoder = new TextEncoder();
  const written: string[] = [];
  for (const doc of SAND_BOX_REFERENCE_DOCS) {
    const path = join(referenceDir, doc.fileName);
    await writeFileAtomic(path, encoder.encode(doc.contents));
    written.push(path);
  }
  return written;
}

export async function provisionSandBoxPromptArtifacts(): Promise<void> {
  const outcomes = await Promise.allSettled([
    getSandRootDir() === SAND_BOX_DATA_ROOT
      ? ensureDataRootAlias({
        dataRoot: SAND_BOX_DATA_ROOT,
        aliasPath: SAND_BOX_MODEL_VISIBLE_DATA_ROOT,
      })
      : Promise.resolve(),
    writeSandBoxReferenceDocs(),
    rm(LEGACY_SAND_BOX_REFERENCE_DIR, { recursive: true, force: true }),
  ]);
  const failed = outcomes.find((outcome) => outcome.status === "rejected");
  if (failed != null) throw failed.reason;
}
