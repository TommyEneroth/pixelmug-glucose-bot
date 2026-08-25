#!/usr/bin/env python3
"""Render a PixelMug mockup: a ceramic mug with the 32x16 GIF shown as a glowing
LED matrix on its front. Shows how a pack GIF actually looks on the device
(off pixels = dark, lit pixels glow).

Usage:  python3 scripts/mug_mockup.py <gif> [out.png]
"""
import sys
from PIL import Image, ImageDraw, ImageFilter

GIF = sys.argv[1] if len(sys.argv) > 1 else "packs/snobben/happy.gif"
OUT = sys.argv[2] if len(sys.argv) > 2 else "docs/mug_mockup.png"

GW, GH = 32, 16
frame = Image.open(GIF).convert("RGB")
# collapse to the mug's native 32x16 (previews may be upscaled)
if frame.size != (GW, GH):
    frame = frame.resize((GW, GH), Image.NEAREST)
px = frame.load()

# ---- canvas ----
Wd, Hd = 760, 560
img = Image.new("RGB", (Wd, Hd), (28, 29, 34))
d = ImageDraw.Draw(img)

# ---- ceramic mug body ----
bx0, by0, bx1, by1 = 120, 90, 560, 470
d.rounded_rectangle([bx0, by0, bx1, by1], radius=46, fill=(238, 235, 228), outline=(120, 118, 112), width=4)
# soft right-side shading
sh = Image.new("RGBA", (Wd, Hd), (0, 0, 0, 0))
ds = ImageDraw.Draw(sh)
ds.rounded_rectangle([bx1 - 90, by0, bx1, by1], radius=46, fill=(90, 88, 84, 60))
img = Image.alpha_composite(img.convert("RGBA"), sh).convert("RGB")
d = ImageDraw.Draw(img)
# handle
d.arc([bx1 - 30, 175, bx1 + 120, 375], start=300, end=60, fill=(120, 118, 112), width=22)

# ---- LED screen inset ----
pad = 26
sx0, sy0, sx1, sy1 = bx0 + pad, 165, bx1 - pad, 395
d.rounded_rectangle([sx0, sy0, sx1, sy1], radius=18, fill=(8, 8, 11), outline=(60, 60, 66), width=3)

# LED matrix geometry
mpad = 16
cell = (sx1 - sx0 - 2 * mpad) / GW
r = cell * 0.40
ox = sx0 + mpad + cell / 2
oy = sy0 + (sy1 - sy0 - GH * cell) / 2 + cell / 2

glow = Image.new("RGBA", (Wd, Hd), (0, 0, 0, 0))
dg = ImageDraw.Draw(glow)


def lit(c):
    return max(c) > 40  # off/near-black pixels are treated as unlit


for gy in range(GH):
    for gx in range(GW):
        c = px[gx, gy]
        cxp = ox + gx * cell
        cyp = oy + gy * cell
        if lit(c):
            dg.ellipse([cxp - r * 2.1, cyp - r * 2.1, cxp + r * 2.1, cyp + r * 2.1],
                       fill=(c[0], c[1], c[2], 90))  # bloom
        else:
            d.ellipse([cxp - r * 0.5, cyp - r * 0.5, cxp + r * 0.5, cyp + r * 0.5],
                      fill=(24, 24, 28))  # dim off-LED

glow = glow.filter(ImageFilter.GaussianBlur(6))
img = Image.alpha_composite(img.convert("RGBA"), glow).convert("RGB")
d = ImageDraw.Draw(img)

for gy in range(GH):
    for gx in range(GW):
        c = px[gx, gy]
        if not lit(c):
            continue
        cxp = ox + gx * cell
        cyp = oy + gy * cell
        d.ellipse([cxp - r, cyp - r, cxp + r, cyp + r], fill=c)

img.save(OUT)
print("wrote", OUT, img.size)
