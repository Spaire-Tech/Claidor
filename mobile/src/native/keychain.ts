/**
 * What the app keeps on the phone, in the Keychain (expo-secure-store): the
 * pair, the Expo push token this phone registered (to take it off the list
 * on sign-out), and whether the person was already asked about
 * notifications. `THIS_DEVICE_ONLY`: a pair never travels to another phone
 * through a backup; `AFTER_FIRST_UNLOCK`: it can be read when a tapped
 * notification launches the app while the phone is locked again.
 */
import * as SecureStore from "expo-secure-store";

import { parseSession, type SessionTokens } from "../core/tokens";

const TOKENS_KEY = "simeon.tokens";
const PUSH_TOKEN_KEY = "simeon.push-token";
const ASKED_KEY = "simeon.notifications-asked";

const OPTIONS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };

export async function readSession(nowMs: number): Promise<SessionTokens | null> {
  try { return parseSession(await SecureStore.getItemAsync(TOKENS_KEY, OPTIONS), nowMs); } catch { return null; }
}

export async function writeSession(session: SessionTokens): Promise<void> {
  await SecureStore.setItemAsync(TOKENS_KEY, JSON.stringify(session), OPTIONS);
}

export async function clearSession(): Promise<void> {
  try { await SecureStore.deleteItemAsync(TOKENS_KEY, OPTIONS); } catch { /* nothing kept */ }
}

export async function readPushToken(): Promise<string | null> {
  try { return await SecureStore.getItemAsync(PUSH_TOKEN_KEY, OPTIONS); } catch { return null; }
}

export async function writePushToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(PUSH_TOKEN_KEY, token, OPTIONS);
}

export async function clearPushToken(): Promise<void> {
  try { await SecureStore.deleteItemAsync(PUSH_TOKEN_KEY, OPTIONS); } catch { /* nothing kept */ }
}

export async function wasAskedAboutNotifications(): Promise<boolean> {
  try { return (await SecureStore.getItemAsync(ASKED_KEY, OPTIONS)) === "1"; } catch { return false; }
}

export async function rememberAskedAboutNotifications(): Promise<void> {
  try { await SecureStore.setItemAsync(ASKED_KEY, "1", OPTIONS); } catch { /* asked again next time */ }
}
