"""
social_card.py — the 1280x640 social preview (GitHub "Social preview", link cards on
Reddit / Mastodon / Bluesky / Slack). Two black S1 Pro mugs from mug_s1.py, one with a
face, one in graph mode, on a shared wall and table, with the title on the left.

  python3 scripts/social_card.py                      -> docs/social_preview.png
  python3 scripts/social_card.py out.png face.gif graph.gif

Only uses the project's own packs (no fan-homage packs), so the card is safe to share.
Upload it under the repo's Settings -> General -> Social preview.
"""
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(__file__))
import mug_s1 as M  # noqa: E402

CW, CH = 1280, 640
SCALE = 0.84
OY = 64                       # scene y -> card y offset (before scaling about the table line)
MUGS = [700, 1015]            # card x of each mug's centre
TEXT_X = 64

AVENIR = "/System/Library/Fonts/Avenir Next.ttc"


def avenir(size, style="Regular"):
    if os.path.exists(AVENIR):
        for i in range(16):
            try:
                f = ImageFont.truetype(AVENIR, size, index=i)
            except OSError:
                break
            if f.getname()[1] == style:
                return f
    return M.font(size, bold=style in ("Bold", "Demi Bold", "Heavy"))


def scene_background():
    """The wall + table of a mug_s1 scene with no mug: what render() starts from."""
    ys, xs = np.mgrid[0:M.H, 0:M.W].astype(np.float32)
    return wall_table(xs, ys, [M.CX], M.TABLE_Y, 1.0)


def wall_table(xs, ys, centres, table_y, s):
    wall = np.zeros_like(xs)
    for cx in centres:
        wall = np.maximum(wall, np.exp(-(((xs - cx) / (250 * s)) ** 2 + ((ys - table_y + 130 * s) / (200 * s)) ** 2)))
    wall = 15 + 15 * wall
    img = np.stack([wall, wall, wall * 1.08], -1)
    t = ys >= table_y
    depth = (M.H - M.TABLE_Y) * s
    tab = 26 - 12 * np.clip((ys - table_y) / depth, 0, 1)
    img[t] = np.stack([tab, tab * 0.97, tab * 0.94], -1)[t]
    img[(ys >= table_y) & (ys < table_y + 1)] += 10
    return img


def resize(a, w, h):
    return np.stack([np.asarray(Image.fromarray(np.ascontiguousarray(a[..., c], np.float32)).resize((w, h), Image.LANCZOS))
                     for c in range(3)], -1)


def first_frame(path):
    frames, _ = M.read_gif(path)
    return frames[0]


def main(argv):
    out = argv[0] if argv else "docs/social_preview.png"
    face = argv[1] if len(argv) > 1 else "packs/emoji-dark/happy.gif"
    graph = argv[2] if len(argv) > 2 else "docs/graph/mmol/happy.gif"

    base, masks = M.build_base()
    bg = scene_background()
    sw, sh = round(M.W * SCALE), round(M.H * SCALE)
    table_y = OY + M.TABLE_Y * SCALE

    ys, xs = np.mgrid[0:CH, 0:CW].astype(np.float32)
    card = wall_table(xs, ys, MUGS, table_y, SCALE)

    # add each mug as the difference from an empty scene: the mug, its glow, shadow
    # and reflection all carry over, and the shared wall stays seamless
    for cx, gif in zip(MUGS, [face, graph]):
        delta = resize(M.render(first_frame(gif), base, masks) - bg, sw, sh)
        x0, y0 = round(cx - M.CX * SCALE), OY
        x1, y1 = min(CW, x0 + sw), min(CH, y0 + sh)
        card[y0:y1, x0:x1] += delta[: y1 - y0, : x1 - x0]

    img = Image.fromarray(np.clip(card, 0, 255).astype(np.uint8))
    d = ImageDraw.Draw(img)
    grey, dim, white = (150, 150, 160), (105, 105, 115), (244, 244, 246)
    green = M.DOTS["happy"]

    y = 150
    d.text((TEXT_X, y), "OPEN SOURCE  ·  ANDROID  ·  DEXCOM SHARE", font=avenir(17, "Demi Bold"), fill=green)
    y += 40
    d.text((TEXT_X, y), "PixelMug", font=avenir(76, "Bold"), fill=white)
    y += 84
    d.text((TEXT_X, y), "Glucose Face", font=avenir(76, "Bold"), fill=white)
    y += 112
    for line in ["Your coffee mug shows your glucose:",
                 "animated pixel faces or a 6-hour graph",
                 "on the PixelMug S1 Pro and P1."]:
        d.text((TEXT_X, y), line, font=avenir(24), fill=grey)
        y += 34
    d.text((TEXT_X, 560), "github.com/TommyEneroth/pixelmug-glucose-bot",
           font=avenir(17, "Medium"), fill=dim)
    d.text((TEXT_X, 586), "Unofficial · not a medical device", font=avenir(15), fill=dim)

    img.save(out, optimize=True)
    print("wrote", out, img.size, f"{os.path.getsize(out) // 1024} KB")


if __name__ == "__main__":
    main(sys.argv[1:])
