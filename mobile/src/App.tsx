/**
 * Simeon on the iPhone (8 October 2026): a native shell round the web
 * window. What a browser tab cannot do is here: signing in in the system's
 * sheet, the pair in the Keychain, notifications, and opening the agent a
 * notification is about.
 *
 *   starting ─▶ signed-out ─(Sign in)─▶ ask-notifications (once) ─▶ window
 *       └──────────(a pair in the Keychain)──────────────────────────▲
 *
 * The page says when the session is over (`simeon.signed-out`): the app
 * takes this phone off the notification list, ends the session on the
 * server when the person signed out, forgets the pair and shows its sign-in.
 */
import * as Notifications from "expo-notifications";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { resolveShellConfig } from "./core/config";
import type { PageMessage } from "./core/messages";
import { AgentOpenQueue } from "./core/notifications";
import type { SessionTokens } from "./core/tokens";
import { readSession, rememberAskedAboutNotifications, wasAskedAboutNotifications, writeSession } from "./native/keychain";
import { askForNotifications, clearBadge, notificationPermission, registerThisPhone } from "./native/push";
import { endSession, prepareSession, signIn } from "./native/session";
import { PlainScreen } from "./screens/Plain";
import { WindowScreen, type WindowHandle } from "./screens/WindowScreen";
import { usePalette } from "./theme";

// Read statically: Expo inlines EXPO_PUBLIC_ variables at build time, by name.
const CONFIG = resolveShellConfig({ api: process.env.EXPO_PUBLIC_SIMEON_API, app: process.env.EXPO_PUBLIC_SIMEON_APP });

type Phase =
  | { readonly kind: "starting" }
  | { readonly kind: "signed-out"; readonly message?: string | undefined }
  | { readonly kind: "signing-in" }
  | { readonly kind: "ask-notifications"; readonly session: SessionTokens }
  | { readonly kind: "window"; readonly session: SessionTokens };

export default function App() {
  const [phase, setPhase] = useState<Phase>({ kind: "starting" });
  const [pageTheme, setPageTheme] = useState<{ preference: string; resolved: "light" | "dark" } | null>(null);
  const palette = usePalette(pageTheme == null || pageTheme.preference === "system" ? null : pageTheme.resolved);
  const windowRef = useRef<WindowHandle>(null);
  /** The newest pair: the one the page last posted, else the Keychain's. Sign-out needs it after the page has dropped its own. */
  const latest = useRef<SessionTokens | null>(null);
  const ending = useRef(false);
  const queue = useMemo(() => new AgentOpenQueue((agentId) => windowRef.current?.openAgent(agentId)), []);

  // Into the window, registering this phone for notifications on the way;
  // the first time, the app asks first (once: "Not now" is remembered).
  const openWindow = useCallback(async (session: SessionTokens) => {
    latest.current = session;
    const permission = await notificationPermission().catch(() => "denied" as const);
    if (permission === "undetermined" && !(await wasAskedAboutNotifications())) {
      setPhase({ kind: "ask-notifications", session });
      return;
    }
    setPhase({ kind: "window", session });
    if (permission === "granted") void registerThisPhone(CONFIG.api, session.accessToken);
  }, []);

  // Launch: the Keychain's pair, refreshed if the hour is nearly up.
  useEffect(() => {
    void (async () => {
      const stored = await readSession(Date.now());
      if (stored == null) { setPhase({ kind: "signed-out" }); return; }
      const prepared = await prepareSession(CONFIG.api, stored);
      if (prepared.kind === "signed-out") { setPhase({ kind: "signed-out", message: prepared.message }); return; }
      await openWindow(prepared.session);
    })();
  }, [openWindow]);

  // Taps: the one that launched the app, and any later one. The launch tap
  // is cleared once read, so the next launch without one opens nothing.
  useEffect(() => {
    const launch = Notifications.getLastNotificationResponse();
    if (launch != null) {
      queue.tapped(launch.notification.request.identifier, launch.notification.request.content.data);
      try { Notifications.clearLastNotificationResponse(); } catch { /* read once anyway */ }
    }
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      queue.tapped(response.notification.request.identifier, response.notification.request.content.data);
    });
    return () => subscription.remove();
  }, [queue]);

  // Opening the app clears its badge.
  useEffect(() => {
    void clearBadge();
    const subscription = AppState.addEventListener("change", (state) => { if (state === "active") void clearBadge(); });
    return () => subscription.remove();
  }, []);

  const startSignIn = useCallback(async () => {
    setPhase({ kind: "signing-in" });
    const result = await signIn(CONFIG.api);
    if (result.kind === "signed-in") { ending.current = false; await openWindow(result.session); return; }
    setPhase({ kind: "signed-out", message: result.kind === "failed" ? result.message : undefined });
  }, [openWindow]);

  const finishAsking = useCallback(async (session: SessionTokens, ask: boolean) => {
    await rememberAskedAboutNotifications();
    const granted = ask ? await askForNotifications().catch(() => false) : false;
    setPhase({ kind: "window", session });
    if (granted) void registerThisPhone(CONFIG.api, (latest.current ?? session).accessToken);
  }, []);

  const signedOut = useCallback(async (reason: "logout" | "expired" | "no-session") => {
    if (ending.current) return;
    ending.current = true;
    queue.windowGone();
    setPageTheme(null);
    await endSession(CONFIG.api, latest.current, { revoke: reason === "logout" });
    latest.current = null;
    setPhase({ kind: "signed-out", message: reason === "expired" ? "Your Simeon sign-in ended. Sign in again." : undefined });
  }, [queue]);

  const onPageMessage = useCallback((message: PageMessage) => {
    switch (message.type) {
      case "simeon.tokens":
        // The page refreshed: the old refresh token is spent, so the Keychain
        // and the next load must have this one.
        latest.current = message.tokens;
        void writeSession(message.tokens).catch((error: unknown) => console.warn(`[simeon] keeping the refreshed pair failed: ${error instanceof Error ? error.message : String(error)}`));
        setPhase((current) => current.kind === "window" ? { kind: "window", session: message.tokens } : current);
        return;
      case "simeon.signed-out":
        void signedOut(message.reason);
        return;
      case "simeon.theme":
        setPageTheme({ preference: message.preference, resolved: message.resolved });
        return;
      case "simeon.ready":
        queue.windowReady();
        return;
      default:
        return;
    }
  }, [queue, signedOut]);

  let screen: React.ReactNode;
  switch (phase.kind) {
    case "starting":
      screen = <PlainScreen palette={palette} title="Simeon" busy />;
      break;
    case "signed-out":
      screen = <PlainScreen palette={palette} title="Simeon" body="Your agents, on your phone." note={phase.message} actions={[{ label: "Sign in", onPress: () => { void startSignIn(); } }]} />;
      break;
    case "signing-in":
      screen = <PlainScreen palette={palette} title="Simeon" body="Finish signing in on the page that opened." busy />;
      break;
    case "ask-notifications": {
      const { session } = phase;
      screen = (
        <PlainScreen
          palette={palette}
          title="Notifications"
          body="Simeon can tell you when an agent has finished, or needs you to answer."
          actions={[{ label: "Turn on notifications", onPress: () => { void finishAsking(session, true); } }, { label: "Not now", quiet: true, onPress: () => { void finishAsking(session, false); } }]}
        />
      );
      break;
    }
    case "window":
      screen = (
        <WindowScreen
          ref={windowRef}
          config={CONFIG}
          session={phase.session}
          palette={palette}
          onMessage={onPageMessage}
          onSignInNeeded={() => { void signedOut("no-session"); }}
          onWindowGone={() => queue.windowGone()}
        />
      );
      break;
  }

  return (
    <SafeAreaProvider>
      <StatusBar style={palette.scheme === "dark" ? "light" : "dark"} />
      {screen}
    </SafeAreaProvider>
  );
}
