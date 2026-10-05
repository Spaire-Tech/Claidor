import type { WindowShortcut } from "./window-shortcuts.js";

export const HELP_CENTER_URL = "https://simeonlabs.com";

export type ApplicationMenuRole =
  | "close"
  | "editMenu"
  | "help"
  | "hide"
  | "hideOthers"
  | "quit"
  | "services"
  | "togglefullscreen"
  | "unhide"
  | "windowMenu";

export interface ApplicationMenuItem {
  readonly label?: string;
  readonly enabled?: boolean;
  readonly role?: ApplicationMenuRole;
  readonly type?: "separator";
  readonly accelerator?: string;
  readonly click?: () => void;
  readonly submenu?: readonly ApplicationMenuItem[];
}

export interface ApplicationMenuElectronPort {
  readonly appName: string;
  readonly buildFromTemplate: (template: readonly ApplicationMenuItem[]) => unknown;
  readonly setApplicationMenu: (menu: unknown) => void;
  readonly openExternal: (url: string) => Promise<unknown>;
}

/** Agent › Call <name>: the agent open in the window, or a disabled "Call Agent" when none is. */
export interface ApplicationMenuVoiceCall {
  readonly label: string;
  readonly enabled: boolean;
  readonly start: () => void;
}

export interface ApplicationMenuOptions {
  readonly applyWindowShortcut: (shortcut: WindowShortcut) => void;
  readonly canUseDevTools: () => boolean;
  readonly emitOpenAbout: () => void;
  readonly emitOpenFeedback: () => void;
  /** Voice calls (30 September 2026); null or absent when calls are switched off. */
  readonly voiceCall?: ApplicationMenuVoiceCall | null;
  readonly platform?: NodeJS.Platform;
}

export function buildApplicationMenuTemplate(
  options: ApplicationMenuOptions,
  electron: Pick<ApplicationMenuElectronPort, "appName" | "openExternal">,
): ApplicationMenuItem[] {
  const isMac = (options.platform ?? process.platform) === "darwin";
  const template: ApplicationMenuItem[] = [];
  if (isMac) {
    template.push({
      label: electron.appName,
      submenu: [
        { label: `About ${electron.appName}`, click: () => options.emitOpenAbout() },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    });
  }
  template.push({
    label: "File",
    submenu: [isMac ? { role: "close" } : { role: "quit" }],
  });
  template.push({ role: "editMenu" });
  const viewSubmenu: ApplicationMenuItem[] = [
    {
      label: "Reload",
      accelerator: "CmdOrCtrl+R",
      click: () => options.applyWindowShortcut("reload"),
    },
  ];
  if (options.canUseDevTools()) {
    viewSubmenu.push(
      { type: "separator" },
      {
        label: "Toggle Developer Tools",
        accelerator: isMac ? "Cmd+Alt+I" : "Ctrl+Shift+I",
        click: () => options.applyWindowShortcut("toggledevtools"),
      },
    );
  }
  viewSubmenu.push(
    { type: "separator" },
    isMac
      ? { role: "togglefullscreen" }
      : {
          label: "Toggle Full Screen",
          accelerator: "F11",
          click: () => options.applyWindowShortcut("fullscreen"),
        },
  );
  template.push({ label: "View", submenu: viewSubmenu });
  const voiceCall = options.voiceCall;
  if (voiceCall != null) {
    template.push({
      label: "Agent",
      submenu: [{ label: voiceCall.label, enabled: voiceCall.enabled, click: () => voiceCall.start() }],
    });
  }
  template.push({ role: "windowMenu" });
  // No Help menu for now (4 October 2026, the founder: "hide help center until
  // i figure that out. same for send feedback"). It held Help Center, which
  // opened HELP_CENTER_URL (Simeon Labs' site; until 24 September 2026 the
  // upstream app's own help), and Send Feedback (`options.emitOpenFeedback`).
  // The window's account menu hides the same two items (the renderer patch).
  return template;
}

export function installApplicationMenu(
  options: ApplicationMenuOptions,
  electron: ApplicationMenuElectronPort,
): void {
  const template = buildApplicationMenuTemplate(options, electron);
  electron.setApplicationMenu(electron.buildFromTemplate(template));
}
