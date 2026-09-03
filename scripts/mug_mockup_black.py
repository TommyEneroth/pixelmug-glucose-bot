#!/usr/bin/env python3
"""Mockup on a BLACK mug (PixelMug S1 Pro). The display renders exactly the pixels
we send: lit pixels glow, near-black pixels blend into the dark screen/mug.

Usage:  python3 scripts/mug_mockup_black.py <gif> [out.png]
"""
import sys
from PIL import Image, ImageDraw, ImageFilter

GIF = sys.argv[1] if len(sys.argv) > 1 else "packs/snobben/happy.gif"
OUT = sys.argv[2] if len(sys.argv) > 2 else "docs/mug_black.png"

GW, GH = 32, 16
frame = Image.open(GIF).convert("RGB")
if frame.size != (GW, GH):
    frame = frame.resize((GW, GH), Image.NEAREST)
px = frame.load()

Wd, Hd = 720, 560
img = Image.new("RGB", (Wd, Hd), (26, 26, 30))
d = ImageDraw.Draw(img)

# black ceramic mug body + handle
bx0, by0, bx1, by1 = 120, 100, 540, 480
d.rounded_rectangle([bx0, by0, bx1, by1], radius=46, fill=(24, 24, 27), outline=(60, 60, 66), width=3)
d.arc([bx1 - 24, 190, bx1 + 116, 390], start=300, end=60, fill=(60, 60, 66), width=22)

# screen area (very dark)
sx0, sy0, sx1, sy1 = bx0 + 26, 150, bx1 - 26, 395
d.rounded_rectangle([sx0, sy0, sx1, sy1], radius=16, fill=(8, 8, 10))

cell = (sx1 - sx0 - 32) / GW
r = cell * 0.42
ox = sx0 + 16 + cell / 2
oy = sy0 + (sy1 - sy0 - GH * cell) / 2 + cell / 2

def lum(c): return max(c)

glow = Image.new("RGBA", (Wd, Hd), (0, 0, 0, 0))
dg = ImageDraw.Draw(glow)
for gy in range(GH):
    for gx in range(GW):
        c = px[gx, gy]
        if lum(c) > 60:
            cx = ox + gx * cell; cy = oy + gy * cell
            dg.ellipse([cx - r * 2, cy - r * 2, cx + r * 2, cy + r * 2], fill=(c[0], c[1], c[2], 80))
glow = glow.filter(ImageFilter.GaussianBlur(5))
img = Image.alpha_composite(img.convert("RGBA"), glow).convert("RGB")
d = ImageDraw.Draw(img)

for gy in range(GH):
    for gx in range(GW):
        c = px[gx, gy]
        cx = ox + gx * cell; cy = oy + gy * cell
        # render every pixel: bright ones as their colour, near-black as a faint dot
        col = c if lum(c) > 40 else (20, 20, 24)
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=col)

img.save(OUT)
print("wrote", OUT)
