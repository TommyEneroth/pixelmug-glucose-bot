#!/usr/bin/env bash
# release.sh — build the signed APK and publish it as a GitHub Release.
#   bash scripts/release.sh            (uses versionName from android/app/build.gradle.kts)
# Needs android/keystore.properties (gitignored) pointing at the release key, and gh logged in.
# Bump versionCode + versionName first; the tag is v<versionName>.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f android/keystore.properties ] || { echo "android/keystore.properties missing (release key)"; exit 1; }
VER=$(sed -n 's/.*versionName = "\(.*\)"/\1/p' android/app/build.gradle.kts)
(cd android && ./gradlew -q :app:testDebugUnitTest :app:assembleRelease)
OUT=out/release; mkdir -p "$OUT"
APK="$OUT/PixelMugGlucoseFace-$VER.apk"
cp android/app/build/outputs/apk/release/app-release.apk "$APK"
SIGNER=$(ls -d "$HOME"/Library/Android/sdk/build-tools/*/apksigner 2>/dev/null | sort -V | tail -1)
[ -n "$SIGNER" ] && "$SIGNER" verify --print-certs "$APK" | grep SHA-256
(cd "$OUT" && shasum -a 256 "$(basename "$APK")" > "$(basename "$APK").sha256")
echo "built $APK"
[ "${1:-}" = "--no-publish" ] && exit 0
gh release create "v$VER" "$APK" "$APK.sha256" --title "v$VER" --notes-file "${NOTES:-/dev/stdin}"
