// swift-tools-version: 6.2
// Simeon on the iPhone and the Mac, the part with no screens: signing in,
// the pair, Simeon Labs' server, the person's cloud computer, the agents and
// their chats, the demo's agents. The apps (../Simeon, ../../mac/Simeon)
// draw it; SimeonMacCore holds what only the Mac does.
//
// No dependencies, and nothing here needs UIKit or SwiftUI, so
// `swift test` runs it on Linux too (ios/README.md).
import PackageDescription

let package = Package(
  name: "SimeonCore",
  platforms: [.iOS(.v26), .macOS(.v15)],
  products: [
    .library(name: "SimeonCore", targets: ["SimeonCore"]),
    // What only the Mac app needs and has no screen (mac/README.md): the iPhone does not link it.
    .library(name: "SimeonMacCore", targets: ["SimeonMacCore"]),
  ],
  targets: [
    // The Mac window's emoji list (emojibase, MIT; Resources/EMOJIBASE-LICENSE.txt), made by ios/scripts/make-emoji.mjs.
    .target(name: "SimeonCore", resources: [.copy("Resources/emoji.json"), .copy("Resources/EMOJIBASE-LICENSE.txt")], swiftSettings: [.swiftLanguageMode(.v5)]),
    .target(name: "SimeonMacCore", dependencies: ["SimeonCore"], swiftSettings: [.swiftLanguageMode(.v5)]),
    // Fixtures/: what the shipped window's own code answered, to check the ports against (the tests say which).
    .testTarget(name: "SimeonCoreTests", dependencies: ["SimeonCore"], resources: [.copy("Fixtures")], swiftSettings: [.swiftLanguageMode(.v5)]),
    .testTarget(name: "SimeonMacCoreTests", dependencies: ["SimeonMacCore"], resources: [.copy("Fixtures")], swiftSettings: [.swiftLanguageMode(.v5)]),
  ]
)
