import SwiftUI
import SimeonCore

/**
 * What differs between the iPhone app and the Mac app (mac/README.md) where
 * their shared views meet it. The views in this folder are built into both;
 * what only one of them has stays behind `#if os(iOS)`, and on the Mac the
 * names of UIKit's types stand for AppKit's (mac/Simeon/UIKitOnMac.swift).
 */
enum AppPlatform {
  /** The app's own URL scheme: the confirm page of the browser's sign-in opens it. */
  static var urlScheme: String {
    #if os(macOS)
    SimeonConfig.macURLScheme
    #else
    SimeonConfig.urlScheme
    #endif
  }

  /** Where the pair is kept in the Keychain: one item per app, so the two apps' sign-ins stay apart. */
  static var keychainService: String {
    #if os(macOS)
    "com.simeonlabs.simeon.mac"
    #else
    "com.simeonlabs.simeon.ios"
    #endif
  }

  /** How the app names itself to the server (`x-simeon-client-version`), so the session row says which app it is. */
  static var clientPrefix: String {
    #if os(macOS)
    "mac"
    #else
    "ios"
    #endif
  }

  static var isMac: Bool {
    #if os(macOS)
    true
    #else
    false
    #endif
  }
}

extension ToolbarItemPlacement {
  /** A sheet's close: the top bar's left on the iPhone, the sheet's cancel on the Mac. */
  static var leadingBar: ToolbarItemPlacement {
    #if os(iOS)
    .topBarLeading
    #else
    .cancellationAction
    #endif
  }

  /** A sheet's Done or Save: the top bar's right on the iPhone, the sheet's confirm on the Mac. */
  static var trailingBar: ToolbarItemPlacement {
    #if os(iOS)
    .topBarTrailing
    #else
    .confirmationAction
    #endif
  }
}

extension View {
  /** The iPhone's small title in the bar; the Mac's windows and sheets have their own. */
  @ViewBuilder
  func inlineBarTitle() -> some View {
    #if os(iOS)
    navigationBarTitleDisplayMode(.inline)
    #else
    self
    #endif
  }

  /** An e-mail address field: the iPhone's e-mail keyboard, typed as it is. */
  @ViewBuilder
  func emailField() -> some View {
    #if os(iOS)
    keyboardType(.emailAddress).textInputAutocapitalization(.never)
    #else
    self
    #endif
  }

  /** A field typed as it is: no capital put in for you on the iPhone (the Mac puts none in). */
  @ViewBuilder
  func typedAsIs() -> some View {
    #if os(iOS)
    textInputAutocapitalization(.never)
    #else
    self
    #endif
  }
}
