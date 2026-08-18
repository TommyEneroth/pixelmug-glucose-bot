#!/usr/bin/env bash
# Download the third-party Bubble/PixelMug SDK files into ./sdk.
# These are provided by jeejio and are NOT committed to this repo (see .gitignore).
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/sdk"
BASE="https://devstorage.jeejio.com/BubbleSDK"
mkdir -p "$DIR"

echo "Fetching Bubble SDK files into $DIR ..."
curl -fsSL -o "$DIR/DeviceSDK_PixelMug_0.1.ts" "$BASE/PixelMug/DeviceSDK_PixelMug_0.1.ts"
curl -fsSL -o "$DIR/Bot_0.2.js"                "$BASE/Bot/Bot_0.2.js"
curl -fsSL -o "$DIR/Text2Params.js"            "$BASE/Other/Text2Params.js"
echo "Done:"
ls -la "$DIR"
