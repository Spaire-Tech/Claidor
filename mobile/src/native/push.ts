/**
 * Notifications, the phone's half (8 October 2026). The server and the box
 * send them (written alongside); the app asks once, registers this phone's
 * Expo push token with the server after every sign-in and launch, takes it
 * off on sign-out, keeps them quiet while the app is open, and opens the
 * agent a tapped one is about (`AgentOpenQueue`, `core/notifications.ts`).
 */
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";

import { registerDeviceRequest, unregisterDeviceRequest } from "../core/notifications";
import { clearPushToken, readPushToken, writePushToken } from "./keychain";

/**
 * While Simeon is open the person is already looking at it: no banner, no
 * list entry, no sound. Called once, at launch (`index.ts`).
 */
export function keepNotificationsQuietInTheForeground(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: false }),
  });
}

/**
 * The EAS project the push token is attributed to: `extra.eas.projectId`
 * (app.config.ts, from `EXPO_PUBLIC_EAS_PROJECT_ID`), which `eas init`
 * creates. Without it there are no notifications, and the app says so in
 * the log instead of failing.
 */
export function easProjectId(): string | null {
  const fromConfig = (Constants.expoConfig?.extra as { eas?: { projectId?: unknown } } | undefined)?.eas?.projectId ?? Constants.easConfig?.projectId;
  const id = typeof fromConfig === "string" && fromConfig.length > 0 ? fromConfig : process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
  return id != null && id.length > 0 ? id : null;
}

export type NotificationPermission = "granted" | "denied" | "undetermined";

export async function notificationPermission(): Promise<NotificationPermission> {
  const status = await Notifications.getPermissionsAsync();
  if (status.granted) return "granted";
  return status.canAskAgain ? "undetermined" : "denied";
}

export async function askForNotifications(): Promise<boolean> {
  const status = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: true, allowSound: true } });
  return status.granted;
}

/** This phone's Expo push token, or null (the Simulator, no permission, no EAS project). */
export async function expoPushToken(): Promise<string | null> {
  if (!Device.isDevice) { console.info("[simeon] no push token: notifications need a real iPhone"); return null; }
  if ((await notificationPermission()) !== "granted") return null;
  const projectId = easProjectId();
  if (projectId == null) { console.warn("[simeon] no push token: set the EAS project id (`eas init`, then EXPO_PUBLIC_EAS_PROJECT_ID; mobile/README.md)"); return null; }
  try {
    return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch (error) {
    console.warn(`[simeon] no push token: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/** Registers this phone for the signed-in account. Best effort: a failure is retried at the next launch. */
export async function registerThisPhone(api: string, accessToken: string): Promise<boolean> {
  const token = await expoPushToken();
  if (token == null) return false;
  const request = registerDeviceRequest(api, accessToken, token);
  try {
    const response = await fetch(request.url, request.init);
    if (!response.ok) { console.warn(`[simeon] push-devices register answered ${response.status}`); return false; }
    await writePushToken(token);
    return true;
  } catch (error) {
    console.warn(`[simeon] push-devices register failed: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

/** Takes this phone off the account's list, with a pair that is still live (sign-out calls this before the session ends). */
export async function unregisterThisPhone(api: string, accessToken: string | null): Promise<void> {
  const token = await readPushToken();
  if (token == null) return;
  if (accessToken != null) {
    const request = unregisterDeviceRequest(api, accessToken, token);
    try {
      const response = await fetch(request.url, request.init);
      if (!response.ok) console.warn(`[simeon] push-devices unregister answered ${response.status}`);
    } catch (error) {
      console.warn(`[simeon] push-devices unregister failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  await clearPushToken();
}

export async function clearBadge(): Promise<void> {
  try { await Notifications.setBadgeCountAsync(0); } catch { /* no badge to clear */ }
}
