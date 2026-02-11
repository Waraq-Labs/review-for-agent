#!/usr/bin/env bash
set -euo pipefail

# Required environment variables:
#   AC_USERNAME   - Apple ID email
#   AC_PASSWORD   - App-specific password from appleid.apple.com
#   AC_TEAM_ID    - Apple Developer Team ID

for var in AC_USERNAME AC_PASSWORD AC_TEAM_ID; do
  if [ -z "${!var:-}" ]; then
    echo "ERROR: $var is not set"
    exit 1
  fi
done

BINARY="review-for-agent"
DIST="dist-test"
rm -rf "$DIST"
mkdir -p "$DIST"

echo "==> Building binary..."
CGO_ENABLED=0 GOOS=darwin GOARCH=arm64 go build -o "$DIST/$BINARY" .

echo "==> Signing binary..."
codesign --force --options runtime --sign "Developer ID Application" "$DIST/$BINARY"

echo "==> Verifying signature..."
codesign -dv --verbose=2 "$DIST/$BINARY"

echo "==> Creating zip for notarization..."
ditto -c -k --keepParent "$DIST/$BINARY" "$DIST/$BINARY.zip"

echo "==> Submitting for notarization..."
xcrun notarytool submit "$DIST/$BINARY.zip" \
  --apple-id "$AC_USERNAME" \
  --password "$AC_PASSWORD" \
  --team-id "$AC_TEAM_ID" \
  --wait

echo "==> Stapling ticket..."
xcrun stapler staple "$DIST/$BINARY"

echo "==> Verifying notarization..."
spctl -a -v "$DIST/$BINARY"

echo "==> Done! Notarized binary at $DIST/$BINARY"
