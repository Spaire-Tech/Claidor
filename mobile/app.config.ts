/**
 * Simeon on the iPhone (8 October 2026). iPhone only, portrait, for now:
 * the founder's friends first, through TestFlight (mobile/README.md).
 *
 * The bundle id and the scheme are the phone's own: the Mac app is
 * `com.simeonlabs.simeon` with the scheme `simeon`, and the phone must not
 * answer the Mac's sign-in link.
 */
import type { ConfigContext, ExpoConfig } from "expo/config";

/**
 * TODO(founder): run `npx eas-cli@latest init` once in mobile/. It creates
 * the project on expo.dev and prints its id ("Add the following to your
 * config: extra.eas.projectId …", since this config is a .ts file). Paste
 * that id between the quotes below (or set EXPO_PUBLIC_EAS_PROJECT_ID);
 * README, "One-time setup". Builds and push notifications need it: without
 * it the app runs and registers for no notifications.
 */
const EAS_PROJECT_ID = process.env.EXPO_PUBLIC_EAS_PROJECT_ID ?? "";

/** The window's own grounds (`src/theme.ts`), so the launch screen hands over to the page without a flash. */
const GROUND_LIGHT = "#fcfcfc";
const GROUND_DARK = "#070707";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Simeon",
  slug: "simeon",
  scheme: "simeon-ios",
  version: "0.1.0",
  platforms: ["ios"],
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "automatic",
  ios: {
    bundleIdentifier: "com.simeonlabs.simeon.ios",
    supportsTablet: false,
    config: { usesNonExemptEncryption: false },
    infoPlist: {
      // The composer's + is the page's file picker: the photo library, the camera, Files.
      NSPhotoLibraryUsageDescription: "Simeon attaches the photos you choose to your messages to your agents.",
      NSCameraUsageDescription: "Simeon attaches the photos you take to your messages to your agents.",
      // No microphone: voice calls and dictation are not in this version.
      // Loopback and the local network stay reachable over http, for a
      // development build pointed at the stand-in server on the Mac.
      NSAppTransportSecurity: { NSAllowsArbitraryLoads: false, NSAllowsLocalNetworking: true },
    },
  },
  plugins: [
    ["expo-secure-store", { faceIDPermission: false }],
    "expo-web-browser",
    [
      "expo-splash-screen",
      {
        image: "./assets/splash-icon.png",
        imageWidth: 88,
        resizeMode: "contain",
        backgroundColor: GROUND_LIGHT,
        dark: { image: "./assets/splash-icon-dark.png", backgroundColor: GROUND_DARK },
      },
    ],
    "expo-notifications",
  ],
  extra: {
    ...(EAS_PROJECT_ID.length > 0 ? { eas: { projectId: EAS_PROJECT_ID } } : {}),
  },
});
