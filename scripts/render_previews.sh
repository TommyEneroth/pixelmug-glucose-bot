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
for s in happy worried panic queasy sick sleep; do
  python3 scripts/mug_s1.py "packs/notman-dark/$s.gif" "docs/mug/face_$s.webp" --closeup
done
python3 scripts/mug_s1.py --grid docs/all_packs_overview.png $(printf 'packs/%s-dark ' "${PACKS[@]}")
