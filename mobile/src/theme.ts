/**
 * The app's own few screens (sign-in, notifications, can't reach Simeon)
 * and the ground behind the web view. The grounds are the window's own:
 * the chat's background in the web window, measured in Chromium on
 * 8 October 2026 (#fcfcfc light, #070707 dark), so the status bar and the
 * home indicator sit on the same colour as the page between them. The
 * screens are plain on purpose: the founder designs them later.
 */
import { useColorScheme } from "react-native";

export interface Palette {
  readonly scheme: "light" | "dark";
  readonly ground: string;
  readonly ink: string;
  readonly quiet: string;
  readonly button: string;
  readonly buttonInk: string;
}

export const LIGHT: Palette = { scheme: "light", ground: "#fcfcfc", ink: "#1d1d1f", quiet: "#6e6e73", button: "#000000", buttonInk: "#ffffff" };
export const DARK: Palette = { scheme: "dark", ground: "#070707", ink: "#f5f5f7", quiet: "#98989d", button: "#f5f5f7", buttonInk: "#000000" };

/** The page's own choice when it has said (`simeon.theme`), else the phone's. */
export function usePalette(pageTheme: "light" | "dark" | null = null): Palette {
  const system = useColorScheme();
  const scheme = pageTheme ?? (system === "dark" ? "dark" : "light");
  return scheme === "dark" ? DARK : LIGHT;
}
