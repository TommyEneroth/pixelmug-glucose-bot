/**
 * face.ts — animated 32x16 "NOT-man"-style face whose expression IS the glucose
 * reading. No text, no graph. The face fills the whole 32x16 canvas edge-to-edge
 * (rounded-rect head), with shaded skin tones and an animated mouth per mood.
 *
 *   low / falling  -> worried, then panicked & sweating
 *   in range       -> happy grin (talks + blinks), pink cheeks
 *   high / rising   -> queasy, then sick (green, tongue out)
 *   stale / unknown -> asleep (breathing)
 *
 * Output is a valid 32x16 GIF89a (<= 40 KB) — the talPlayGif contract.
 */
import { GIFEncoder } from "gifenc";
import type { Level } from "./alerts";

const W = 32;
const H = 16;

// palette (index): 0 bg, 1 outline,
// skin hi/base/shade 2-4, pale 5-7, green 8-10,
// 11 white, 12 red, 13 red-dark, 14 sweat, 15 cheek
const PALETTE: [number, number, number][] = [
  [12, 12, 16],
  [15, 15, 15],
  [246, 221, 176], [232, 200, 148], [196, 160, 106],
  [226, 231, 241], [204, 210, 223], [168, 176, 196],
  [176, 222, 150], [150, 205, 120], [110, 166, 86],
  [246, 246, 246], [208, 46, 46], [138, 24, 24], [110, 178, 250], [236, 150, 140],
];
type Skin = { hi: number; base: number; shade: number };
const NORMAL: Skin = { hi: 2, base: 3, shade: 4 };
const PALE: Skin = { hi: 5, base: 6, shade: 7 };
const GREEN: Skin = { hi: 8, base: 9, shade: 10 };

const CH: Record<string, number> = {
  W: 11, P: 1, K: 1, R: 12, D: 13, T: 11, V: 14, C: 15,
};

function blank(): Uint8Array {
  return new Uint8Array(W * H).fill(0);
}

/** Full-frame rounded-rect head with a vertical skin gradient + 1px border. */
function head(skin: Skin, dx = 0): Uint8Array {
  const f = blank();
  const r = 4; // corner radius
  const inRounded = (x: number, y: number) => {
    const cxL = r, cxR = W - 1 - r, cyT = r, cyB = H - 1 - r;
    let px = x, py = y;
    if (x < cxL) px = cxL; else if (x > cxR) px = cxR;
    if (y < cyT) py = cyT; else if (y > cyB) py = cyB;
    const ddx = x - px, ddy = y - py;
    return ddx * ddx + ddy * ddy <= r * r + 0.5;
  };
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const sx = x - dx;
      if (sx < 0 || sx >= W || !inRounded(sx, y)) continue;
      f[y * W + x] = y <= 4 ? skin.hi : y <= 10 ? skin.base : skin.shade;
    }
  // 1px outline where skin meets background (the rounded border)
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (f[y * W + x] === 0) continue;
      const nb = (xx: number, yy: number) => xx < 0 || xx >= W || yy < 0 || yy >= H || f[yy * W + xx] === 0;
      if (nb(x - 1, y) || nb(x + 1, y) || nb(x, y - 1) || nb(x, y + 1)) f[y * W + x] = 1;
    }
  return f;
}

/** Stamp a sprite at (x,y). '.'/' ' transparent. */
function stamp(f: Uint8Array, x: number, y: number, sprite: string[], dx = 0) {
  for (let r = 0; r < sprite.length; r++)
    for (let c = 0; c < sprite[r].length; c++) {
      const ch = sprite[r][c];
      if (ch === "." || ch === " ") continue;
      const idx = CH[ch];
      if (idx === undefined) continue;
      const px = x + c + dx, py = y + r;
      if (px >= 0 && px < W && py >= 0 && py < H) f[py * W + px] = idx;
    }
}

// ---- features (sized for the full-frame face) ------------------------------
const EYE_OPEN = ["WWWW", "WPPW", "WPPW", "WWWW"];
const EYE_BLINK = ["....", "....", "KKKK", "...."];
const EYE_WIDE = ["WWWW", "WWWW", "WWPW", "WWWW"];
const EYE_DOWN = ["WWWW", "WWWW", "WWWW", "WPPW"];
const EYE_X = ["P..P", ".PP.", ".PP.", "P..P"];
const EYE_SLEEP = ["....", "KKKK", "KKKK", "...."];

const BROW_FLAT = ["KKKKK"];
const BROW_UP_L = ["...KK", "KKK.."]; // inner-up (left)
const BROW_UP_R = ["KK...", "..KKK"]; // inner-up (right)
const BROW_ANGRY_L = ["KKK..", "...KK"]; // inner-down (left)
const BROW_ANGRY_R = ["..KKK", "KK..."]; // inner-down (right)

// crooked lopsided moustache with a philtrum gap
const MOUSTACHE = ["KK.........K..", "KKKKKKK.KKKKKK", "K...........KK"];
const CHEEK = ["CC", "CC"];

// mouths (14-ish wide) — two frames each for animation
const GRIN_OPEN = [".KKKKKKKKKKK.", "KRRRRRRRRRRRK", "KTKTKTKTKTKTK", "KRRRRRRRRRRRK", ".KKKKKKKKKKK."];
const GRIN_WIDE = ["KKKKKKKKKKKKK", "KRRRRRRRRRRRK", "TKTKTKTKTKTKT", "KRRRRRRRRRRRK", "KKKKKKKKKKKKK"];
const FROWN_A = [".KKKKKKKKK.", "K.........K"];
const FROWN_B = ["..KKKKKKK..", ".K.......K."];
const O_BIG = ["..KKKKKK..", ".KRRRRRRK.", "KRRDDDDRRK", "KRRDDDDRRK", ".KRRRRRRK.", "..KKKKKK.."];
const O_SMALL = ["...KKKK...", "..KRRRRK..", "..KRRRRK..", "...KKKK..."];
const WAVY_A = ["KK..KK..KK..K", "..KK..KK..KK."];
const WAVY_B = ["..KK..KK..KK.", "KK..KK..KK..K"];
const TONGUE_A = ["KKKKKKKK", "KRRRRRRK", "KDDDDDDK", ".KRRRRK.", "..RRRR.."];
const TONGUE_B = ["KKKKKKKK", "KRRRRRRK", "KDDDDDDK", ".KRRRRK.", "...RR..."];
const SLEEP_MOUTH_A = [".KKKK.", "K....K"];
const SLEEP_MOUTH_B = [".KKKK.", ".K..K."];
const SWEAT = ["V", "V"];

type Expr = "happy" | "worried" | "panic" | "queasy" | "sick" | "sleep";

export function expressionForLevel(level: Level): Expr {
  switch (level) {
    case "urgentLow": return "panic";
    case "predLow": return "worried";
    case "predHigh": return "queasy";
    case "urgentHigh": return "sick";
    case "stale":
    case "unknown": return "sleep";
    default: return "happy";
  }
}

// feature placement helpers
function eyes(f: Uint8Array, l: string[], r: string[], dx = 0) {
  stamp(f, 6, 3, l, dx);
  stamp(f, 22, 3, r, dx);
}
function brows(f: Uint8Array, l: string[], r: string[], y: number, dx = 0) {
  stamp(f, 6, y, l, dx);
  stamp(f, 21, y, r, dx);
}
function stache(f: Uint8Array, dx = 0) {
  stamp(f, 9, 8, MOUSTACHE, dx);
}

/** Build the animation frames for an expression. */
function frames(expr: Expr): Uint8Array[] {
  if (expr === "happy") {
    const mk = (eye: string[], mouth: string[]) => {
      const f = head(NORMAL);
      brows(f, BROW_FLAT, BROW_UP_R, 1);
      eyes(f, eye, eye);
      stamp(f, 2, 11, CHEEK); stamp(f, 28, 11, CHEEK); // pink cheeks
      stache(f);
      stamp(f, 9, 11, mouth);
      return f;
    };
    // talk (wide/open) + occasional blink
    return [mk(EYE_OPEN, GRIN_WIDE), mk(EYE_OPEN, GRIN_OPEN), mk(EYE_OPEN, GRIN_WIDE), mk(EYE_BLINK, GRIN_OPEN)];
  }

  if (expr === "worried") {
    const mk = (mouth: string[], sy: number) => {
      const f = head(PALE);
      brows(f, BROW_UP_L, BROW_UP_R, 0);
      eyes(f, EYE_DOWN, EYE_DOWN);
      stache(f);
      stamp(f, 10, 12, mouth);
      stamp(f, 27, 5, SWEAT.slice(0, 1)); stamp(f, 27, sy, SWEAT); // dripping
      return f;
    };
    return [mk(FROWN_A, 6), mk(FROWN_B, 9), mk(FROWN_A, 12)];
  }

  if (expr === "panic") {
    const mk = (dx: number, mouth: string[], sy: number) => {
      const f = head(PALE, dx);
      brows(f, BROW_FLAT, BROW_FLAT, 0, dx);
      eyes(f, EYE_WIDE, EYE_WIDE, dx);
      stache(f, dx);
      stamp(f, 11 + dx, mouth === O_BIG ? 9 : 10, mouth);
      stamp(f, 3, sy, SWEAT); stamp(f, 28, sy, SWEAT);
      return f;
    };
    return [mk(0, O_BIG, 5), mk(1, O_SMALL, 8), mk(0, O_BIG, 6), mk(1, O_SMALL, 9)];
  }

  if (expr === "queasy") {
    const mk = (l: string[], r: string[], mouth: string[]) => {
      const f = head(GREEN);
      brows(f, BROW_ANGRY_L, BROW_ANGRY_R, 2);
      eyes(f, l, r);
      stache(f);
      stamp(f, 9, 12, mouth);
      return f;
    };
    return [mk(EYE_BLINK, EYE_DOWN, WAVY_A), mk(EYE_DOWN, EYE_BLINK, WAVY_B)];
  }

  if (expr === "sick") {
    const mk = (dx: number, mouth: string[]) => {
      const f = head(GREEN, dx);
      brows(f, BROW_ANGRY_L, BROW_ANGRY_R, 1, dx);
      eyes(f, EYE_X, EYE_X, dx);
      stache(f, dx);
      stamp(f, 12 + dx, 10, mouth);
      return f;
    };
    return [mk(0, TONGUE_A), mk(1, TONGUE_B), mk(0, TONGUE_A)];
  }

  // sleep — closed eyes, moustache, gentle breathing mouth + snore bubble
  const mk = (mouth: string[], bubble: boolean) => {
    const f = head(NORMAL);
    eyes(f, EYE_SLEEP, EYE_SLEEP);
    stache(f);
    stamp(f, 13, 12, mouth);
    if (bubble) stamp(f, 24, 6, ["V"]); // tiny snore bubble by the nose
    return f;
  };
  return [mk(SLEEP_MOUTH_A, false), mk(SLEEP_MOUTH_B, true), mk(SLEEP_MOUTH_A, true), mk(SLEEP_MOUTH_B, false)];
}

function upscale(f: Uint8Array, s: number): Uint8Array {
  const out = new Uint8Array(W * s * H * s);
  for (let r = 0; r < H; r++)
    for (let c = 0; c < W; c++) {
      const v = f[r * W + c];
      for (let dr = 0; dr < s; dr++)
        for (let dc = 0; dc < s; dc++) out[(r * s + dr) * (W * s) + (c * s + dc)] = v;
    }
  return out;
}

function encode(fr: Uint8Array[], scale: number, delay: number): Uint8Array {
  const gif = GIFEncoder();
  const bw = W * scale, bh = H * scale;
  fr.forEach((f, i) => {
    const out = scale === 1 ? f : upscale(f, scale);
    gif.writeFrame(out, bw, bh, { palette: PALETTE, delay, repeat: 0, first: i === 0 });
  });
  gif.finish();
  return gif.bytes();
}

/** Mug-ready 32x16 animated face GIF for the given expression. */
export function renderFaceGif(expr: Expr): Uint8Array {
  return encode(frames(expr), 1, 280);
}

/** Upscaled face GIF for human preview / docs. */
export function renderFacePreviewGif(expr: Expr, scale = 12): Uint8Array {
  return encode(frames(expr), scale, 280);
}

export const EXPRESSIONS: Expr[] = ["happy", "worried", "panic", "queasy", "sick", "sleep"];
