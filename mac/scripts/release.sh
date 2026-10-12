#!/bin/bash
# A release of the Mac app (12 October 2026), on a Mac with Xcode 26:
#
#   mac/scripts/release.sh            # build it: mac/build/release/<version>/
#   mac/scripts/release.sh --publish  # build it, then put it on the website
#
# 1. The Release build for Apple silicon (the folder is darwin-arm64, as the
#    Electron app's was), archived with this checkout's version
#    (MARKETING_VERSION in project.yml) and build number (the commit count),
#    and Sparkle's public key from this Mac's Keychain.
# 2. Exported for Developer ID with the company's certificate, checked.
# 3. Sent to Apple to notarize, the ticket stapled, checked as Gatekeeper
#    will on another Mac.
# 4. The update zip, and a disk image (the app and an Applications link),
#    signed, notarized and stapled too.
# 5. Sparkle's signature of the zip, the feed (appcast.xml) and the record
#    (release.json, with each file's sha256 and size).
# With --publish, 6: the files to the release bucket, then appcast.xml and
# latest.json beside the folders. The website's Download button
# (api.simeonlabs.com/desktop/download/mac) serves the new disk image
# within five minutes, and installed apps see the update on their next
# daily check (server/simeon/desktop/releases.py).
#
# Once per Mac, before the first release (mac/README.md, "Releasing"):
#   - Xcode › Settings › Accounts: signed in to the team 496QXRMJXG, and a
#     "Developer ID Application" certificate in the Keychain;
#   - the notary key stored as a profile:
#       xcrun notarytool store-credentials simeon-notary \
#         --key AuthKey_XXXXXXXXXX.p8 --key-id XXXXXXXXXX --issuer <issuer id>
#   - for --publish, the aws command line signed in to an account that may
#     write to the release bucket.
# Sparkle's signing key is made in this Mac's Keychain the first time; keep
# the copy the script exports, as without it no update can be signed.
#
# Settings (environment), each with its default:
#   SIMEON_NOTARY_PROFILE  simeon-notary
#   SIMEON_RELEASES_S3     s3://simeonlabs-files-public/releases
#   SIMEON_RELEASES_URL    https://simeonlabs-files-public.s3.amazonaws.com/releases
set -euo pipefail
cd "$(dirname "$0")/.."
MAC=$(pwd)

TEAM="496QXRMJXG"
PLATFORM="darwin-arm64"
MINIMUM_MACOS="15.0"
PROFILE="${SIMEON_NOTARY_PROFILE:-simeon-notary}"
S3="${SIMEON_RELEASES_S3:-s3://simeonlabs-files-public/releases}"
URL="${SIMEON_RELEASES_URL:-https://simeonlabs-files-public.s3.amazonaws.com/releases}"
S3="${S3%/}"
URL="${URL%/}"

PUBLISH=0
REPLACE=0
for arg in "$@"; do
  case "$arg" in
    --publish) PUBLISH=1 ;;
    --replace) REPLACE=1 ;;
    *) echo "Unknown option: $arg (use --publish, and --replace to publish a version again)"; exit 2 ;;
  esac
done

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
fail() { printf '\n\033[31m%s\033[0m\n' "$*"; exit 1; }

# --- what this Mac needs ------------------------------------------------------

say "Checking this Mac"
[ "$(uname)" = "Darwin" ] || fail "A release is made on a Mac."
xcodebuild -version >/dev/null 2>&1 || fail "Xcode is needed (run mac/scripts/build.sh once: it sets Xcode up)."
major=$(xcodebuild -version | head -1 | sed -E 's/Xcode ([0-9]+).*/\1/')
[ "$major" -ge 26 ] || fail "Xcode 26 or later is needed (its SDK has Liquid Glass)."
command -v xcodegen >/dev/null 2>&1 || fail "XcodeGen is needed: brew install xcodegen"

if [ -n "$(git status --porcelain -- "$MAC" ../ios/SimeonCore ../ios/Simeon 2>/dev/null)" ]; then
  git status --short -- "$MAC" ../ios/SimeonCore ../ios/Simeon
  fail "The app's files have changes that are not committed. A release is made from committed code: commit or undo them (git checkout -- <file>), then run this again."
fi

IDENTITY=$(security find-identity -v -p codesigning | grep "Developer ID Application" | grep "($TEAM)" | head -1 | awk '{print $2}' || true)
[ -n "$IDENTITY" ] || fail "No \"Developer ID Application\" certificate for the team $TEAM in the Keychain. In Xcode › Settings › Accounts › the team › Manage Certificates, add one with +, then run this again."
echo "Signing as: $(security find-identity -v -p codesigning | grep "$IDENTITY" | sed -E 's/^ *[0-9]+\) [0-9A-F]+ //')"

xcrun notarytool history --keychain-profile "$PROFILE" >/dev/null 2>&1 || fail "The notary profile \"$PROFILE\" is missing or refused. Store it once:
  xcrun notarytool store-credentials $PROFILE --key AuthKey_XXXXXXXXXX.p8 --key-id XXXXXXXXXX --issuer <issuer id>
(App Store Connect › Users and Access › Integrations › App Store Connect API: the key, its Key ID and the Issuer ID.)"

if [ "$PUBLISH" = 1 ]; then
  command -v aws >/dev/null 2>&1 || fail "--publish needs the aws command line: brew install awscli, then aws configure (or set AWS_PROFILE)."
  aws sts get-caller-identity >/dev/null 2>&1 || fail "The aws command line is not signed in: aws configure (or set AWS_PROFILE), then run this again."
fi

VERSION=$(sed -nE 's/^[[:space:]]*MARKETING_VERSION:[[:space:]]*"?([0-9][0-9A-Za-z.-]*)"?.*/\1/p' project.yml | head -1)
[ -n "$VERSION" ] || fail "MARKETING_VERSION was not found in mac/project.yml."
BUILD=$(git rev-list --count HEAD)
echo "Simeon $VERSION (build $BUILD), commit $(git rev-parse --short HEAD)"

if [ "$PUBLISH" = 1 ] && [ "$REPLACE" = 0 ] && aws s3 ls "$S3/$PLATFORM/$VERSION/" >/dev/null 2>&1; then
  fail "Version $VERSION is already published. Raise MARKETING_VERSION in mac/project.yml (and commit it), or pass --replace to publish it again."
fi

OUT="$MAC/build/release/$VERSION"
WORK="$MAC/build/release/work"
PACKAGES="$MAC/build/release/packages"
rm -rf "$OUT" "$WORK"
mkdir -p "$OUT" "$WORK" "$PACKAGES"
DMG="$OUT/Simeon-$VERSION-$PLATFORM.dmg"
ZIP="$OUT/Simeon-$VERSION-$PLATFORM.zip"

# --- 1. the build -------------------------------------------------------------

say "Making the Xcode project and fetching the packages"
xcodegen generate --quiet
xcodebuild -resolvePackageDependencies -project SimeonMac.xcodeproj -scheme Simeon \
  -clonedSourcePackagesDirPath "$PACKAGES" > "$WORK/resolve.log" 2>&1 || { tail -30 "$WORK/resolve.log"; fail "The packages could not be fetched."; }

SPARKLE_BIN=$(dirname "$(find "$PACKAGES/artifacts" -type f -name sign_update -perm -u+x 2>/dev/null | head -1)")
[ -x "$SPARKLE_BIN/sign_update" ] || fail "Sparkle's tools were not found under $PACKAGES/artifacts."

say "Sparkle's signing key"
if ! KEY=$("$SPARKLE_BIN/generate_keys" -p 2>/dev/null); then
  echo "No Sparkle key in this Mac's Keychain yet: making one."
  "$SPARKLE_BIN/generate_keys" >/dev/null
  KEY=$("$SPARKLE_BIN/generate_keys" -p)
  BACKUP="$HOME/Desktop/simeon-sparkle-private-key.txt"
  "$SPARKLE_BIN/generate_keys" -x "$BACKUP"
  echo
  echo "The private key is in the Keychain, and a copy is at $BACKUP."
  echo "Put that copy in your password manager, then delete the file: without the key, no update can be signed for the apps people have."
fi
KEY=$(echo "$KEY" | tr -d '[:space:]')
[ -n "$KEY" ] || fail "Sparkle's public key could not be read."
echo "Public key: $KEY"

say "Building Simeon $VERSION for release (a few minutes)"
xcodebuild -project SimeonMac.xcodeproj -scheme Simeon -configuration Release \
  -destination 'generic/platform=macOS' \
  -archivePath "$WORK/Simeon.xcarchive" -clonedSourcePackagesDirPath "$PACKAGES" \
  -allowProvisioningUpdates \
  MARKETING_VERSION="$VERSION" CURRENT_PROJECT_VERSION="$BUILD" SPARKLE_PUBLIC_KEY="$KEY" \
  ARCHS=arm64 ONLY_ACTIVE_ARCH=NO \
  archive > "$WORK/archive.log" 2>&1 || {
  grep -E -A6 "^/.*: error:" "$WORK/archive.log" | sed -E "s#$(cd .. && pwd)/##g" > "$WORK/errors.txt" || true
  [ -s "$WORK/errors.txt" ] || tail -40 "$WORK/archive.log" > "$WORK/errors.txt"
  pbcopy < "$WORK/errors.txt"
  cat "$WORK/errors.txt"
  fail "The release build failed. The errors are above, copied to the clipboard, and in mac/build/release/work/errors.txt."
}

# --- 2. Developer ID ----------------------------------------------------------

say "Signing it for Developer ID"
cat > "$WORK/ExportOptions.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>developer-id</string>
  <key>teamID</key><string>$TEAM</string>
  <key>signingStyle</key><string>automatic</string>
</dict>
</plist>
PLIST
xcodebuild -exportArchive -archivePath "$WORK/Simeon.xcarchive" -exportPath "$WORK/export" \
  -exportOptionsPlist "$WORK/ExportOptions.plist" -allowProvisioningUpdates > "$WORK/export.log" 2>&1 || {
  tail -30 "$WORK/export.log"
  fail "Exporting for Developer ID failed (above). Is the Developer ID Application certificate in this Mac's Keychain?"
}
APP="$WORK/export/Simeon.app"
[ -d "$APP" ] || fail "The export has no Simeon.app."
codesign --verify --deep --strict --verbose=2 "$APP"
codesign -dvv "$APP" 2>&1 | grep -q "Authority=Developer ID Application" || fail "Simeon.app is not signed with a Developer ID Application certificate."
shown=$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$APP/Contents/Info.plist")
[ "$shown" = "$VERSION" ] || fail "The app says version $shown, not $VERSION."
[ "$(/usr/libexec/PlistBuddy -c "Print :SUPublicEDKey" "$APP/Contents/Info.plist")" = "$KEY" ] || fail "The app does not carry Sparkle's public key."

# --- 3. notarized -------------------------------------------------------------

notarize() {
  local file="$1" result status id
  result="$WORK/notary-$(basename "$1").json"
  xcrun notarytool submit "$file" --keychain-profile "$PROFILE" --wait --output-format json > "$result" || true
  status=$(plutil -extract status raw -o - "$result" 2>/dev/null || echo "unknown")
  id=$(plutil -extract id raw -o - "$result" 2>/dev/null || echo "")
  if [ "$status" != "Accepted" ]; then
    cat "$result"
    [ -n "$id" ] && xcrun notarytool log "$id" --keychain-profile "$PROFILE" || true
    fail "Apple did not notarize $(basename "$file") (status: $status). Apple's log is above."
  fi
  echo "Notarized: $(basename "$file") ($id)"
}

say "Sending the app to Apple to notarize (a few minutes)"
ditto -c -k --sequesterRsrc --keepParent "$APP" "$WORK/notarize.zip"
notarize "$WORK/notarize.zip"
xcrun stapler staple "$APP"
spctl --assess --type execute --verbose=2 "$APP"

# --- 4. the update zip and the disk image ------------------------------------

say "Packing the update and the disk image"
ditto -c -k --sequesterRsrc --keepParent "$APP" "$ZIP"
mkdir -p "$WORK/dmg"
ditto "$APP" "$WORK/dmg/Simeon.app"
ln -s /Applications "$WORK/dmg/Applications"
hdiutil create -volname "Simeon" -srcfolder "$WORK/dmg" -ov -format UDZO "$DMG" > /dev/null
codesign --sign "$IDENTITY" --timestamp "$DMG"
notarize "$DMG"
xcrun stapler staple "$DMG"
spctl --assess --type open --context context:primary-signature --verbose=2 "$DMG"

# --- 5. Sparkle's signature, the feed and the record -------------------------

say "Writing the feed and the record"
SIGNATURE=$("$SPARKLE_BIN/sign_update" "$ZIP")
# `sparkle:edSignature="…" length="…"`, as sign_update prints it.
echo "$SIGNATURE" | grep -q 'sparkle:edSignature=' || fail "Sparkle could not sign the update: $SIGNATURE"
PUB_DATE=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
RSS_DATE=$(LC_ALL=C date -u +"%a, %d %b %Y %H:%M:%S +0000")
FOLDER_URL="$URL/$PLATFORM/$VERSION"
size_of() { stat -f%z "$1"; }
sha_of() { shasum -a 256 "$1" | awk '{print $1}'; }

cat > "$OUT/appcast.xml" <<XML
<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle">
  <channel>
    <title>Simeon</title>
    <item>
      <title>Simeon $VERSION</title>
      <pubDate>$RSS_DATE</pubDate>
      <sparkle:version>$BUILD</sparkle:version>
      <sparkle:shortVersionString>$VERSION</sparkle:shortVersionString>
      <sparkle:minimumSystemVersion>$MINIMUM_MACOS</sparkle:minimumSystemVersion>
      <enclosure url="$FOLDER_URL/$(basename "$ZIP")" type="application/octet-stream" $SIGNATURE />
    </item>
  </channel>
</rss>
XML

cat > "$OUT/release.json" <<JSON
{
  "version": "$VERSION",
  "build": "$BUILD",
  "commit": "$(git rev-parse HEAD)",
  "platform": "$PLATFORM",
  "minimum_macos": "$MINIMUM_MACOS",
  "pub_date": "$PUB_DATE",
  "dmg": {"url": "$FOLDER_URL/$(basename "$DMG")", "sha256": "$(sha_of "$DMG")", "size": $(size_of "$DMG")},
  "zip": {"url": "$FOLDER_URL/$(basename "$ZIP")", "sha256": "$(sha_of "$ZIP")", "size": $(size_of "$ZIP")}
}
JSON
xmllint --noout "$OUT/appcast.xml" || fail "appcast.xml is not well-formed XML."
python3 -m json.tool "$OUT/release.json" > /dev/null || fail "release.json is not valid JSON."
rm -rf "$WORK/dmg" "$WORK/notarize.zip"

echo
echo "Release $VERSION (build $BUILD) is ready in mac/build/release/$VERSION/:"
ls -lh "$OUT" | awk 'NR>1 {print "  " $5 "  " $9}'

if [ "$PUBLISH" = 0 ]; then
  echo
  echo "Try the disk image on another Mac (or another user on this one): open it, drag Simeon to Applications, open it, sign in."
  echo "Then put it on the website: mac/scripts/release.sh --publish"
  exit 0
fi

# --- 6. on the website --------------------------------------------------------

say "Uploading to $S3/$PLATFORM/$VERSION/"
aws s3 cp "$DMG" "$S3/$PLATFORM/$VERSION/$(basename "$DMG")" --content-type application/x-apple-diskimage
aws s3 cp "$ZIP" "$S3/$PLATFORM/$VERSION/$(basename "$ZIP")" --content-type application/zip
aws s3 cp "$OUT/release.json" "$S3/$PLATFORM/$VERSION/release.json" --content-type application/json
aws s3 cp "$OUT/appcast.xml" "$S3/$PLATFORM/$VERSION/appcast.xml" --content-type application/xml

for file in "$DMG" "$ZIP"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -I "$FOLDER_URL/$(basename "$file")")
  [ "$code" = "200" ] || fail "$FOLDER_URL/$(basename "$file") answers $code, not 200: the files are uploaded but not public. Nothing points at them yet."
done

# Last, the two files that point at the new folder: the feed, then the index the Download button reads.
aws s3 cp "$OUT/appcast.xml" "$S3/$PLATFORM/appcast.xml" --content-type application/xml --cache-control no-cache
aws s3 cp "$OUT/release.json" "$S3/$PLATFORM/latest.json" --content-type application/json --cache-control no-cache

echo
echo "Published Simeon $VERSION."
echo "  Download:  https://api.simeonlabs.com/desktop/download/mac (serves it within five minutes)"
echo "  Check:     curl -s https://api.simeonlabs.com/desktop/download/mac/latest"
echo "  Updates:   installed apps find it on their next daily check, or Simeon › Check for Updates…"
