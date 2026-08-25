#!/usr/bin/env python3
"""Render a realistic PixelMug mockup: a white ceramic mug whose display shows the
32x16 GIF. Off/background pixels render as the light ceramic (as on the real mug);
lit pixels are drawn in colour (bright ones glow a little), dark pixels show dark.

Usage:  python3 scripts/mug_mockup.py <gif> [out.png]
"""
import sys
from PIL import Image, ImageDraw, ImageFilter

GIF = sys.argv[1] if len(sys.argv) > 1 else "packs/snobben/happy.gif"
OUT = sys.argv[2] if len(sys.argv) > 2 else "docs/mug_mockup.png"

GW, GH = 32, 16
frame = Image.open(GIF).convert("RGB")
if frame.size != (GW, GH):
    frame = frame.resize((GW, GH), Image.NEAREST)
px = frame.load()
BG = px[0, 0]  # the design's background colour = "off" = show ceramic


def is_off(c):
    return abs(c[0] - BG[0]) + abs(c[1] - BG[1]) + abs(c[2] - BG[2]) < 24


Wd, Hd = 760, 600
CERAMIC = (240, 238, 232)
img = Image.new("RGB", (Wd, Hd), (224, 219, 212))
d = ImageDraw.Draw(img)

# ---- ceramic mug body + handle ----
bx0, by0, bx1, by1 = 130, 110, 560, 500
d.rounded_rectangle([bx0, by0, bx1, by1], radius=48, fill=CERAMIC, outline=(198, 194, 186), width=3)
d.arc([bx1 - 26, 200, bx1 + 120, 400], start=300, end=60, fill=(198, 194, 186), width=24)
# gentle right-side shading
sh = Image.new("RGBA", (Wd, Hd), (0, 0, 0, 0))
ImageDraw.Draw(sh).rounded_rectangle([bx1 - 120, by0, bx1, by1], radius=48, fill=(150, 146, 140, 45))
img = Image.alpha_composite(img.convert("RGBA"), sh).convert("RGB")
d = ImageDraw.Draw(img)

# ---- display area (same ceramic; pixels are printed onto it) ----
cell = 10.6
gap = 1.4
mw, mh = GW * cell, GH * cell
ox = (Wd - mw) / 2
oy = by0 + 70

# glow overlay for bright pixels
glow = Image.new("RGBA", (Wd, Hd), (0, 0, 0, 0))
dg = ImageDraw.Draw(glow)
for gy in range(GH):
    for gx in range(GW):
        c = px[gx, gy]
        if is_off(c):
            continue
        if max(c) > 150:  # bright -> bloom
            cx = ox + gx * cell + cell / 2
            cy = oy + gy * cell + cell / 2
            dg.ellipse([cx - cell, cy - cell, cx + cell, cy + cell],
                       fill=(c[0], c[1], c[2], 70))
glow = glow.filter(ImageFilter.GaussianBlur(5))
img = Image.alpha_composite(img.convert("RGBA"), glow).convert("RGB")
d = ImageDraw.Draw(img)

# draw the pixels as rounded squares (off = leave ceramic)
for gy in range(GH):
    for gx in range(GW):
        c = px[gx, gy]
        if is_off(c):
            continue
        x0 = ox + gx * cell + gap
        y0 = oy + gy * cell + gap
        x1 = ox + (gx + 1) * cell - gap
        y1 = oy + (gy + 1) * cell - gap
        d.rounded_rectangle([x0, y0, x1, y1], radius=2, fill=c)

img.save(OUT)
print("wrote", OUT, img.size, "bg(off)=", BG)
