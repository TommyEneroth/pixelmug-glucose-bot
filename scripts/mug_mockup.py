#!/usr/bin/env python3
"""Render an ANIMATED PixelMug mockup: a white ceramic mug whose display plays the
32x16 GIF. Off/background pixels render as the light ceramic (as on the real mug);
other pixels are drawn crisply in colour.

Usage:  python3 scripts/mug_mockup.py <gif> [out.gif]
"""
import sys
from PIL import Image, ImageDraw

GIF = sys.argv[1] if len(sys.argv) > 1 else "packs/snobben/happy.gif"
OUT = sys.argv[2] if len(sys.argv) > 2 else "docs/mug_mockup.gif"

GW, GH = 32, 16
src = Image.open(GIF)

# collect frames (RGB, 32x16) and their durations
frames_rgb, durations = [], []
try:
    i = 0
    while True:
        src.seek(i)
        f = src.convert("RGB")
        if f.size != (GW, GH):
            f = f.resize((GW, GH), Image.NEAREST)
        frames_rgb.append(f)
        durations.append(src.info.get("duration", 300))
        i += 1
except EOFError:
    pass

BG = frames_rgb[0].getpixel((0, 0))  # design background = "off" = ceramic


def is_off(c):
    return abs(c[0] - BG[0]) + abs(c[1] - BG[1]) + abs(c[2] - BG[2]) < 28


Wd, Hd = 720, 560
CERAMIC = (240, 238, 232)

# ---- static mug base (drawn once) ----
base = Image.new("RGB", (Wd, Hd), (223, 218, 211))
d = ImageDraw.Draw(base)
bx0, by0, bx1, by1 = 120, 100, 540, 480
d.rounded_rectangle([bx0, by0, bx1, by1], radius=46, fill=CERAMIC, outline=(198, 194, 186), width=3)
d.rounded_rectangle([bx1 - 96, by0 + 3, bx1 - 3, by1 - 3], radius=44, fill=(230, 227, 220))  # soft right shade
d.arc([bx1 - 24, 190, bx1 + 116, 390], start=300, end=60, fill=(198, 194, 186), width=22)

cell = 10.0
gap = 1.3
ox = (Wd - GW * cell) / 2
oy = by0 + 66

out_frames = []
for fr in frames_rgb:
    img = base.copy()
    dd = ImageDraw.Draw(img)
    p = fr.load()
    for gy in range(GH):
        for gx in range(GW):
            c = p[gx, gy]
            if is_off(c):
                continue
            x0 = ox + gx * cell + gap
            y0 = oy + gy * cell + gap
            dd.rounded_rectangle([x0, y0, ox + (gx + 1) * cell - gap, oy + (gy + 1) * cell - gap],
                                 radius=2, fill=c)
    out_frames.append(img.convert("P", palette=Image.ADAPTIVE, colors=128))

out_frames[0].save(OUT, save_all=True, append_images=out_frames[1:],
                   duration=durations, loop=0, disposal=1, optimize=True)
print("wrote", OUT, f"{len(out_frames)} frames")
