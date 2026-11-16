#!/usr/bin/env bash
# Re-render every README preview on the black S1 Pro mockup (needs python3 + Pillow + numpy).
#   bash scripts/render_previews.sh
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p docs/mug
PACKS=(notman emoji pacman snobben mumin weather fire aqua lava matrix space synth)
for p in "${PACKS[@]}"; do
  python3 scripts/mug_s1.py "packs/$p-dark" "docs/mug/$p.webp"
done
for e in hyperspace notes; do
  python3 scripts/mug_s1.py "packs/extras/$e.gif" "docs/mug/$e.webp"
done
# Graph mode: the GIFs come from the app's own renderer (android GraphExamplesTest);
# refresh them with  (cd android && ./gradlew :app:testDebugUnitTest)  before running this.
for u in mmol mgdl; do
  if [ -d "android/app/build/graph-examples/$u" ]; then
    mkdir -p "docs/graph/$u" && cp android/app/build/graph-examples/$u/*.gif "docs/graph/$u/"
  fi
done
python3 scripts/mug_s1.py docs/graph/mmol docs/mug/graph.webp
python3 scripts/mug_s1.py docs/graph/mgdl docs/mug/graph_mgdl.webp
for s in happy worried panic queasy sick sleep; do
  python3 scripts/mug_s1.py "packs/notman-dark/$s.gif" "docs/mug/face_$s.webp" --closeup
done
python3 scripts/mug_s1.py --grid docs/all_packs_overview.png $(printf 'packs/%s-dark ' "${PACKS[@]}")
