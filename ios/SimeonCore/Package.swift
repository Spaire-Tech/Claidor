// swift-tools-version: 6.2
// Simeon on the iPhone, the part with no screens: signing in, the pair,
// Simeon Labs' server, the person's cloud computer, the agents and their
// chats, the demo's agents. The app (../Simeon) draws it.
//
// No dependencies, and nothing here needs UIKit or SwiftUI, so
// `swift test` runs it on Linux too (ios/README.md).
import PackageDescription

let package = Package(
  name: "SimeonCore",
  platforms: [.iOS(.v26), .macOS(.v15)],
  products: [.library(name: "SimeonCore", targets: ["SimeonCore"])],
  targets: [
    .target(name: "SimeonCore", swiftSettings: [.swiftLanguageMode(.v5)]),
    .testTarget(name: "SimeonCoreTests", dependencies: ["SimeonCore"], swiftSettings: [.swiftLanguageMode(.v5)]),
  ]
)
