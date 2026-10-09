/**
 * The window: the web version of the Simeon window (`desktop/web/`) in a
 * full-screen WKWebView, between the status bar and the home indicator, on
 * the page's own ground.
 *
 * - The pair goes in before the page's first script
 *   (`injectedJavaScriptBeforeContentLoaded`, `tokensInjection`), and the
 *   newest one the page posts back is what the next load gets.
 * - Every top-level navigation is decided by `core/routing.ts`; nothing but
 *   the window's own pages loads here.
 * - A tapped notification's agent opens through the bridge
 *   (`__simeonNative.openAgent`) once the page says it listens.
 * - The page root does not bounce or pull to refresh; the keyboard pushes
 *   the web view up (KeyboardAvoidingView) so the composer stays above it,
 *   and iOS adds no insets of its own on top of the safe area. The keyboard
 *   comes up when the person taps a field, not when the window focuses one
 *   (opening an agent would otherwise cover half the screen), without the
 *   form bar above it.
 * - The composer's + is the page's `<input type=file>`: WKWebView offers
 *   the photo library, the camera and Files (the Info.plist strings are in
 *   app.config.ts). No microphone in this version: the page is refused it.
 */
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import type { ShouldStartLoadRequest, WebViewOpenWindowEvent } from "react-native-webview/lib/WebViewTypes";

import type { ShellConfig } from "../core/config";
import { SIGN_IN_RETURN_URL } from "../core/config";
import { parsePageMessage, type PageMessage } from "../core/messages";
import { openAgentScript } from "../core/notifications";
import { routeNavigation, routeNewWindow, type NavigationDecision } from "../core/routing";
import { tokensInjection, type SessionTokens } from "../core/tokens";
import type { Palette } from "../theme";
import { PlainScreen } from "./Plain";

export interface WindowHandle {
  /** Opens an agent in the window (a tapped notification). */
  openAgent(agentId: string): void;
}

/**
 * After the page has loaded: the viewport stops zooming. A focused field
 * with text under 16 px makes WKWebView zoom the page in, and a pinch zooms
 * the whole window; neither belongs in an app. The window's layout is the
 * page's own; this only stops the zoom.
 */
const AFTER_LOAD = `(function () {
  var meta = document.querySelector('meta[name="viewport"]');
  if (!meta) { meta = document.createElement("meta"); meta.name = "viewport"; document.head.appendChild(meta); }
  meta.setAttribute("content", "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no");
})();
true;`;

export const WindowScreen = forwardRef<WindowHandle, {
  readonly config: ShellConfig;
  readonly session: SessionTokens;
  readonly palette: Palette;
  readonly onMessage: (message: PageMessage) => void;
  readonly onSignInNeeded: () => void;
  readonly onWindowGone: () => void;
}>(function WindowScreen(props, ref) {
  const { config, session, palette } = props;
  const web = useRef<WebView>(null);
  const [failed, setFailed] = useState(false);
  const [generation, setGeneration] = useState(0);
  const authSessionOpen = useRef(false);

  useImperativeHandle(ref, () => ({
    openAgent: (agentId: string) => web.current?.injectJavaScript(openAgentScript(agentId)),
  }), []);

  const routing = useMemo(() => ({ app: config.app, api: config.api }), [config.app, config.api]);
  const source = useMemo(() => ({ uri: config.pageUrl }), [config.pageUrl]);
  // A new pair (the page refreshed) replaces the script for the next load
  // without reloading this one (react-native-webview re-adds its user scripts).
  const beforeLoad = useMemo(() => tokensInjection(session, config.appOrigin), [session, config.appOrigin]);

  const follow = useCallback((decision: NavigationDecision) => {
    switch (decision.kind) {
      case "load":
      case "block":
        return;
      case "sign-in":
        props.onSignInNeeded();
        return;
      case "auth-session":
        // One sheet at a time; it shares Safari's cookies, which the page at
        // /app/connected.html uses to hand the box a connected app's code.
        if (authSessionOpen.current) return;
        authSessionOpen.current = true;
        void WebBrowser.openAuthSessionAsync(decision.url, SIGN_IN_RETURN_URL)
          .catch((error: unknown) => console.warn(`[simeon] sign-in sheet failed: ${error instanceof Error ? error.message : String(error)}`))
          .finally(() => { authSessionOpen.current = false; });
        return;
      case "browser":
        void WebBrowser.openBrowserAsync(decision.url, { dismissButtonStyle: "done", presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET })
          .catch((error: unknown) => console.warn(`[simeon] link failed: ${error instanceof Error ? error.message : String(error)}`));
        return;
      case "system":
        void Linking.openURL(decision.url).catch(() => undefined);
        return;
    }
  }, [props.onSignInNeeded]);

  const onShouldStartLoadWithRequest = useCallback((request: ShouldStartLoadRequest): boolean => {
    const decision = routeNavigation({ url: request.url, isTopFrame: request.isTopFrame }, routing);
    if (decision.kind === "load") return true;
    follow(decision);
    return false;
  }, [routing, follow]);

  const onOpenWindow = useCallback((event: WebViewOpenWindowEvent) => {
    follow(routeNewWindow({ url: event.nativeEvent.targetUrl }, routing));
  }, [routing, follow]);

  const onMessage = useCallback((event: WebViewMessageEvent) => {
    const message = parsePageMessage(event.nativeEvent.data, Date.now());
    if (message == null) return;
    if (message.type === "simeon.open") { follow(routeNewWindow({ url: message.url, purpose: message.purpose }, routing)); return; }
    if (message.type === "simeon.mcp-auth") {
      // The box has the connected app's credential: the sheet it was signed in from can go.
      if (authSessionOpen.current) { try { WebBrowser.dismissAuthSession(); } catch { /* already closed */ } }
      return;
    }
    props.onMessage(message);
  }, [routing, follow, props.onMessage]);

  const retry = useCallback(() => { setFailed(false); props.onWindowGone(); setGeneration((value) => value + 1); }, [props.onWindowGone]);

  if (failed) {
    return (
      <PlainScreen
        palette={palette}
        title="Can't reach Simeon"
        body="Check that your iPhone is online, then try again."
        actions={[{ label: "Try again", onPress: retry }]}
      />
    );
  }

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: palette.ground }]} edges={["top", "bottom", "left", "right"]}>
      <KeyboardAvoidingView style={styles.fill} behavior="padding">
        <WebView
          key={generation}
          ref={web}
          source={source}
          style={[styles.fill, { backgroundColor: palette.ground }]}
          containerStyle={{ backgroundColor: palette.ground }}
          injectedJavaScriptBeforeContentLoaded={beforeLoad}
          injectedJavaScriptBeforeContentLoadedForMainFrameOnly
          injectedJavaScript={AFTER_LOAD}
          onMessage={onMessage}
          onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
          onOpenWindow={onOpenWindow}
          onError={(event) => { console.warn(`[simeon] the window failed to load: ${event.nativeEvent.description}`); props.onWindowGone(); setFailed(true); }}
          onHttpError={(event) => { if (event.nativeEvent.statusCode >= 500) { console.warn(`[simeon] the window answered ${event.nativeEvent.statusCode}`); props.onWindowGone(); setFailed(true); } }}
          onContentProcessDidTerminate={() => { props.onWindowGone(); web.current?.reload(); }}
          startInLoadingState
          renderLoading={() => <View style={[styles.loading, { backgroundColor: palette.ground }]}><ActivityIndicator color={palette.quiet} /></View>}
          bounces={false}
          pullToRefreshEnabled={false}
          contentInsetAdjustmentBehavior="never"
          automaticallyAdjustContentInsets={false}
          allowsBackForwardNavigationGestures={false}
          allowsLinkPreview={false}
          allowsInlineMediaPlayback
          hideKeyboardAccessoryView
          dataDetectorTypes="none"
          mediaCapturePermissionGrantType="deny"
          sharedCookiesEnabled={false}
          setSupportMultipleWindows
          javaScriptCanOpenWindowsAutomatically
          applicationNameForUserAgent="SimeonIOS"
          webviewDebuggingEnabled={__DEV__}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
});

const styles = StyleSheet.create({
  fill: { flex: 1 },
  loading: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center", justifyContent: "center" },
});
