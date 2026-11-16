#!/usr/bin/env python3
"""mug_s1.py — animated mockup of the black PixelMug S1 Pro playing a 32x16 GIF.

Modelled on the product photos: a matte-black cylinder with a brushed-steel rim and
base ring and a slim black handle. The LED matrix sits *behind* the black shell, so
unlit pixels vanish and lit ones shine through as soft squares that wrap around the
curve of the mug, bloom into the surrounding black and reflect on the table.

Output by extension: .webp (animated, full colour — what the README uses), .gif
(255 colours, larger) or .png (one still frame).

Usage
  python3 scripts/mug_s1.py packs/weather-dark docs/mug/weather.webp
      a pack folder: cycles the six glucose states, with a label row underneath
  python3 scripts/mug_s1.py docs/graph/mmol docs/mug/graph.webp
      any folder with happy/worried/panic/queasy/sick/sleep.gif works the same way
  python3 scripts/mug_s1.py packs/extras/hyperspace.gif docs/mug/hyperspace.webp
      one GIF: plays it on the mug
  python3 scripts/mug_s1.py packs/notman-dark/happy.gif docs/mug/face_happy.webp --closeup
      just the display, cropped tight (small tiles for tables)
  python3 scripts/mug_s1.py --grid docs/all_packs_overview.png packs/weather-dark packs/fire-dark ...
      a still overview: one row per pack, one column per state

Design for the black mug with the -dark packs: the mug shows exactly the pixels you
send, so a light background lights up as a glowing rectangle.
"""
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

GW, GH = 32, 16
W, H = 600, 480
SS = 2  # supersampling for the vector parts

STATES = ["happy", "worried", "panic", "queasy", "sick", "sleep"]
LABELS = {"happy": "in range", "worried": "falling", "panic": "low",
          "queasy": "rising", "sick": "high", "sleep": "no data"}
DOTS = {"happy": (80, 210, 120), "worried": (245, 180, 60), "panic": (240, 70, 60),
        "queasy": (245, 180, 60), "sick": (240, 110, 50), "sleep": (130, 130, 140)}

# ---- mug geometry (1x pixels) ----
# Proportions measured from PixelMug's own S1 Pro product photo, and consistent with the spec
# (32x16 LEDs, a 6.21" display that wraps slightly more than 180 degrees):
#   height = 1.26 x diameter, brushed-steel rim = 10 % of the height, black rounded foot,
#   LED pitch = 5.2 % of the diameter (~19 pitches across the front), display height = 0.84 x
#   diameter (16 rows, top ~19 % and bottom ~85 % down the mug), 32 columns over ~185 degrees,
#   so from the front the outermost columns turn edge-on around the sides.
#   Handle: rounded square from just under the rim to ~75 % down, reaching 0.32 x diameter out.
R = 138                    # cylinder radius
D = 2 * R
MUG_H = round(1.26 * D)    # rim top to foot
CX = 256                   # centre x (mug + handle sit centred in the frame)
E = 10                     # ellipse minor radius (camera roughly level with the rim)
YT = 44                    # centre of the rim's top ellipse
YB = YT + MUG_H            # centre of the foot ellipse
BAND = round(0.10 * MUG_H) # brushed-steel rim height
FOOT_R = round(0.06 * D)   # rounded bottom edge
TABLE_Y = 300              # where the wall meets the table
WRAP = np.radians(185)     # the 32 columns wrap slightly more than half the mug
DTH = WRAP / GW
THETA = WRAP / 2
PITCH = R * DTH            # vertical pixel pitch (same as horizontal at the front)
DISP_MID = 0.52            # display centre, as a fraction of the height from the rim top
FILL = 0.80                # LED square size relative to the pitch


def font(size, bold=False):
    for p in (["/System/Library/Fonts/Supplemental/Arial Bold.ttf"] if bold else []) + [
            "/System/Library/Fonts/Supplemental/Arial.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"]:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def arc_y(xs, yc, sign=1):
    """y of the front (sign=1) or back (sign=-1) arc of an ellipse centred at yc."""
    u = np.clip((xs - CX) / R, -1, 1)
    return yc + sign * E * np.sqrt(1 - u * u)


def shade_cols(xs):
    """Per-column lighting terms across the cylinder: lambert, specular, rim."""
    u = np.clip((xs - CX) / R, -0.9999, 0.9999)
    th = np.arcsin(u)
    lam = np.clip(np.cos(th + np.radians(38)), 0, 1)          # key light upper-left
    spec = np.exp(-((th + np.radians(30)) / 0.16) ** 2)          # soft highlight stripe
    rim = np.exp(-((th - np.radians(78)) / 0.10) ** 2)            # cool rim light right
    return lam, spec, rim


# ------------------------------------------------------------------ static scene
def build_base():
    ys, xs = np.mgrid[0:H, 0:W].astype(np.float32)
    img = np.zeros((H, W, 3), np.float32)

    # wall: dark charcoal, a soft pool of light behind the mug
    wall = 15 + 15 * np.exp(-(((xs - CX) / 250) ** 2 + ((ys - 170) / 200) ** 2))
    img[:] = np.stack([wall, wall, wall * 1.08], -1)
    # table: slightly warmer, darkening toward the viewer, a faint edge highlight
    t = ys >= TABLE_Y
    tab = 26 - 12 * np.clip((ys - TABLE_Y) / (H - TABLE_Y), 0, 1)
    img[t] = np.stack([tab, tab * 0.97, tab * 0.94], -1)[t]
    img[(ys >= TABLE_Y) & (ys < TABLE_Y + 1)] += 10

    # contact shadow under the mug
    sh = np.exp(-(((xs - CX - 10) / (R * 1.15)) ** 2 + ((ys - YB - E * 0.6) / (E * 1.3)) ** 2))
    img *= (1 - 0.65 * sh)[..., None]

    # handle (drawn before the body, which covers its roots)
    hl = Image.new("L", (W * SS, H * SS), 0)
    d = ImageDraw.Draw(hl)
    x0, x1 = CX + R - 30, CX + R + round(0.32 * D)
    y0, y1, th = YT + round(0.14 * MUG_H), YT + round(0.75 * MUG_H), round(0.056 * D)
    d.rounded_rectangle([x0 * SS, y0 * SS, x1 * SS, y1 * SS], radius=30 * SS, fill=255)
    d.rounded_rectangle([x0 * SS, (y0 + th) * SS, (x1 - th) * SS, (y1 - th) * SS],
                        radius=16 * SS, fill=0)
    hmask = np.asarray(hl.resize((W, H), Image.LANCZOS), np.float32) / 255
    hshade = 20 + 10 * np.clip((ys - y0) / (y1 - y0), 0, 1) * -1
    hshade = hshade + 34 * np.exp(-((xs - (x1 - 2.5)) / 2.2) ** 2)     # rim light, outer edge
    hshade = hshade + 16 * np.exp(-((ys - (y0 + 2.5)) / 2.2) ** 2)      # top edge catches the key light
    hshade = hshade + 10 * np.exp(-((xs - (x1 - th + 2)) / 2.0) ** 2)   # inner edge
    hcol = np.stack([hshade, hshade, hshade * 1.08], -1)
    img = img * (1 - hmask[..., None]) + hcol * hmask[..., None]

    # cylinder masks (front arcs)
    top_front = arc_y(xs, YT)
    bot_front = arc_y(xs, YB)
    # silhouette: straight sides, rounded into the foot
    dy = np.clip(ys - (YB - FOOT_R), 0, FOOT_R)
    half = R - FOOT_R + np.sqrt(np.maximum(FOOT_R ** 2 - dy ** 2, 0))
    inside = np.abs(xs - CX) <= half
    body = inside & (ys >= top_front + BAND) & (ys <= bot_front)
    band = inside & (ys >= arc_y(xs, YT, -1)) & (ys < top_front + BAND)

    lam, spec, rim = shade_cols(xs)
    # matte black shell
    k = 12 + 14 * lam + 10 * spec + 20 * rim
    shell = np.stack([k, k, k * 1.06], -1)
    # the foot curves away from the light: darker toward the bottom, a thin table-lit edge
    foot = np.clip((ys - (bot_front - 26)) / 26, 0, 1)
    shell = shell * (1 - 0.45 * foot[..., None])
    shell += (10 * np.exp(-((ys - (bot_front - 1.5)) / 1.4) ** 2))[..., None]
    img[body] = shell[body]
    # brushed steel: strong highlight, dark falloff, fine horizontal brushing
    rng = np.random.default_rng(7)
    brush = rng.normal(0, 5, (H, 1)).astype(np.float32)
    s = 70 + 110 * lam + 120 * spec + 40 * rim + brush
    steel = np.stack([s, s * 1.01, s * 1.04], -1)
    img[band] = steel[band]
    # thin dark seam where steel meets the black shell
    seam = inside & (np.abs(ys - (top_front + BAND)) < 1.0)
    img[seam] *= 0.45

    # the opening: lip ellipse, then the dark steel interior with a lit back wall
    ell = ((xs - CX) / R) ** 2 + ((ys - YT) / E) ** 2
    lip = ell <= 1
    inner = ((xs - CX) / (R - 7)) ** 2 + ((ys - YT - 1) / (E - 2.5)) ** 2 <= 1
    lipc = 150 + 70 * lam
    img[lip] = np.stack([lipc, lipc, lipc * 1.03], -1)[lip]
    depth = np.clip((ys - (YT - E)) / (2 * E), 0, 1)
    ic = 58 - 40 * depth + 10 * lam
    img[inner] = np.stack([ic, ic, ic * 1.05], -1)[inner]

    # soft anti-aliased silhouette edge on the body sides
    edge = inside & (np.abs(np.abs(xs - CX) - half) < 1.2) & (ys > arc_y(xs, YT, -1)) & (ys <= bot_front)
    img[edge] *= 0.6

    masks = {"shell": body, "mug": inside & (ys >= arc_y(xs, YT, -1)) & (ys <= bot_front),
             "bottom": bot_front}
    return img, masks


# ------------------------------------------------------------------ LED placement
def cell_rects():
    """For each (gx, gy): rect in SS pixels + a viewing-angle brightness factor."""
    y0 = YT + E + DISP_MID * MUG_H - GH * PITCH / 2   # top of the display at the front
    rects = []
    for gy in range(GH):
        row = []
        for gx in range(GW):
            th = -THETA + (gx + 0.5) * DTH
            if abs(th) > np.radians(87):      # round the back: hidden from the front
                row.append(None)
                continue
            x = CX + R * np.sin(th)
            w = R * np.cos(th) * DTH * FILL
            h = PITCH * FILL
            y = y0 + (gy + 0.5) * PITCH + E * (np.cos(th) - 1)
            row.append(((x - w / 2) * SS, (y - h / 2) * SS, (x + w / 2) * SS, (y + h / 2) * SS,
                        0.62 + 0.38 * np.cos(th)))
        rects.append(row)
    return rects


RECTS = cell_rects()


def led_layer(frame):
    """frame: (16, 32, 3) uint8 -> float (H, W, 3) image of the lit LED squares."""
    im = Image.new("RGB", (W * SS, H * SS))
    d = ImageDraw.Draw(im)
    for gy in range(GH):
        for gx in range(GW):
            c = frame[gy, gx].astype(np.float32)
            if c.max() < 26 or RECTS[gy][gx] is None:   # off, or round the back
                continue
            x0, y0, x1, y1, a = RECTS[gy][gx]
            c = c * a
            m = c.max() / 255
            c = np.clip(c + 0.08 * c.max() * m * m, 0, 255)   # bright LEDs read a touch hotter
            d.rounded_rectangle([x0, y0, x1, y1], radius=min(SS * 1.4, (x1 - x0) / 2), fill=tuple(int(v) for v in c))
    return np.asarray(im.resize((W, H), Image.BOX), np.float32)


def blur(a, r):
    im = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    return np.asarray(im.filter(ImageFilter.GaussianBlur(r)), np.float32)


def render(frame, base, masks):
    led = led_layer(frame)
    glow = 0.5 * blur(led, 3) + 0.6 * blur(led, 11) + 0.45 * blur(led, 28)
    out = base.copy()
    # light on the shell (inside the mug outline) + a little spill into the air
    out += glow * np.where(masks["mug"], 0.5, 0.22)[..., None]
    # the LED squares are screened on top, so pale colours keep their tint instead of clipping
    a, b = np.clip(out, 0, 255) / 255, led / 255
    out = 255 * (1 - (1 - a) * (1 - b))
    # reflection on the table: mirror the display about the mug's foot (squashed 2x),
    # blurred and faded with distance — only where the table is not hidden by the mug
    ys = np.arange(H)
    foot = int(YB + E)
    m = np.zeros_like(out)
    under = ys > foot - 2
    m[under] = (led + glow * 0.5)[np.clip(foot - (ys[under] - foot) * 2, 0, H - 1)]
    m = blur(m, 4) * 0.32
    fade = np.clip(1 - (ys - foot) / 60, 0, 1)[:, None, None]
    out += m * fade * (~masks["mug"])[..., None]
    return out


# ------------------------------------------------------------------ inputs
def read_gif(path):
    src = Image.open(path)
    frames, durs = [], []
    i = 0
    while True:
        try:
            src.seek(i)
        except EOFError:
            break
        f = src.convert("RGB")
        if f.size != (GW, GH):
            f = f.resize((GW, GH), Image.NEAREST)
        frames.append(np.asarray(f, np.uint8))
        durs.append(max(20, src.info.get("duration", 150) or 150))
        i += 1
    return frames, durs


def labels_row(img, active):
    pil = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))
    d = ImageDraw.Draw(pil)
    f_on, f_off = font(15, True), font(15)
    slot = W / len(STATES)
    y = H - 30
    for i, s in enumerate(STATES):
        on = s == active
        f = f_on if on else f_off
        txt = LABELS[s]
        tw = d.textlength(txt, font=f)
        x = slot * i + (slot - tw - 14) / 2
        col = DOTS[s] if on else (62, 62, 68)
        d.ellipse([x, y + 4, x + 8, y + 12], fill=col)
        d.text((x + 14, y), txt, font=f, fill=(236, 236, 240) if on else (92, 92, 100))
        if on:
            d.rounded_rectangle([x - 8, y - 6, x + 14 + tw + 8, y + 22], radius=13,
                                outline=(70, 70, 78), width=1)
    return np.asarray(pil, np.float32)


def display_box(pad=14):
    cells = [r for row in RECTS for r in row if r is not None]
    xs = [r[0] / SS for r in cells] + [r[2] / SS for r in cells]
    ys = [r[1] / SS for r in cells] + [r[3] / SS for r in cells]
    return (int(min(xs) - pad), int(min(ys) - pad), int(max(xs) + pad), int(max(ys) + pad))


def save_gif(frames, durs, out, base=None):
    """One shared palette for every frame, so the static scene is byte-identical frame to
    frame and the GIF only stores what changes. The palette is split: ~88 entries fitted to
    the static scene (smooth dark gradients, steel) and the rest to the LED colours."""
    imgs = [Image.fromarray(np.clip(f, 0, 255).astype(np.uint8)) for f in frames]
    w, h = imgs[0].size
    step = max(1, len(imgs) // 24)
    sample = imgs[::step]
    sheet = Image.new("RGB", (w, h * len(sample)))
    for i, im in enumerate(sample):
        sheet.paste(im, (0, i * h))
    led_pal = sheet.quantize(colors=161, method=Image.Quantize.MEDIANCUT).getpalette()[:161 * 3]
    scene = imgs[0] if base is None else Image.fromarray(np.clip(base, 0, 255).astype(np.uint8))
    scene_pal = scene.quantize(colors=88, method=Image.Quantize.MEDIANCUT).getpalette()[:88 * 3]
    pal = Image.new("P", (1, 1))
    ui = [v for c in DOTS.values() for v in c]          # label dots keep their exact colour
    pal.putpalette(scene_pal + led_pal + ui)
    q = [im.quantize(palette=pal, dither=Image.Dither.NONE) for im in imgs]
    q[0].save(out, save_all=True, append_images=q[1:], duration=durs, loop=0,
              optimize=False, disposal=1)


def state_frames(pack):
    seq = []
    for s in STATES:
        p = os.path.join(pack, f"{s}.gif")
        if not os.path.exists(p):
            continue
        fr, du = read_gif(p)
        if len(fr) == 1:                  # a still (e.g. a plain graph): hold it
            du = [2200]
        loops = max(1, round(2200 / sum(du)))
        seq.append((s, fr * loops, du * loops))
    return seq


def main(argv):
    closeup = "--closeup" in argv
    argv = [a for a in argv if a != "--closeup"]
    base, masks = build_base()

    if argv and argv[0] == "--grid":
        out, packs = argv[1], argv[2:]
        bx0, by0, bx1, by1 = display_box(10)
        tw, th = (bx1 - bx0) // 2 * 2, (by1 - by0) // 2 * 2
        scale = 0.62
        tw2, th2 = int(tw * scale), int(th * scale)
        lw, hh, gap = 92, 26, 6
        sheet = Image.new("RGB", (lw + len(STATES) * (tw2 + gap), hh + len(packs) * (th2 + gap)), (14, 14, 17))
        d = ImageDraw.Draw(sheet)
        for i, s in enumerate(STATES):
            d.text((lw + i * (tw2 + gap) + 4, 5), LABELS[s], font=font(13, True), fill=DOTS[s])
        for r, pack in enumerate(packs):
            name = os.path.basename(pack.rstrip("/")).replace("-dark", "")
            d.text((8, hh + r * (th2 + gap) + th2 / 2 - 8), name, font=font(14, True), fill=(210, 210, 216))
            for c, s in enumerate(STATES):
                fr, _ = read_gif(os.path.join(pack, f"{s}.gif"))
                img = render(fr[len(fr) // 2], base, masks)
                tile = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).crop((bx0, by0, bx0 + tw, by0 + th))
                sheet.paste(tile.resize((tw2, th2), Image.LANCZOS), (lw + c * (tw2 + gap), hh + r * (th2 + gap)))
        sheet.save(out, optimize=True)
        print("wrote", out, sheet.size)
        return

    src, out = argv[0], argv[1]
    frames, durs = [], []
    if os.path.isdir(src):
        for s, fr, du in state_frames(src):
            for f, d in zip(fr, du):
                img = render(f, base, masks)
                frames.append(img if closeup else labels_row(img, s))
                durs.append(d)
    else:
        fr, du = read_gif(src)
        loops = max(1, round(1500 / sum(du))) if len(fr) > 1 else 1
        for f, d in zip(fr * loops, du * loops):
            frames.append(render(f, base, masks))
            durs.append(d)
    if closeup:
        bx0, by0, bx1, by1 = display_box()
        frames = [f[by0:by1, bx0:bx1] for f in frames]
    if out.endswith(".webp"):
        imgs = [Image.fromarray(np.clip(f, 0, 255).astype(np.uint8)) for f in frames]
        imgs[0].save(out, save_all=True, append_images=imgs[1:], duration=durs, loop=0,
                     quality=82, method=6)
    elif out.endswith(".png"):
        Image.fromarray(np.clip(frames[len(frames) // 2], 0, 255).astype(np.uint8)).save(out)
    else:
        save_gif(frames, durs, out, None if closeup else base)
    print("wrote", out, f"{len(frames)} frames", f"{os.path.getsize(out) // 1024} KB")


if __name__ == "__main__":
    main(sys.argv[1:])
