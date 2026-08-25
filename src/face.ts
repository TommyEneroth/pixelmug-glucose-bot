/**
 * face.ts — animated 32x16 "NOT-man"-style face whose expression IS the glucose
 * reading. No text, no graph: just the face reacting to blood sugar.
 *
 *   low / falling  -> worried, then panicked & sweating
 *   in range       -> happy grin (blinks)
 *   high / rising   -> queasy, then sick (green, tongue out)
 *   stale / unknown -> asleep
 *
 * Output is a valid 32x16 GIF89a (<= 40 KB), the same contract talPlayGif needs.
 */
import { GIFEncoder } from "gifenc";
import type { Level } from "./alerts";

const W = 32;
const H = 16;

// palette: 0 bg, 1 outline, 2 skin, 3 pale skin, 4 green skin, 5 white, 6 red, 7 sweat
const PALETTE: [number, number, number][] = [
  [12, 12, 16],
  [15, 15, 15],
  [235, 205, 150],
  [206, 212, 224],
  [150, 205, 120],
  [245, 245, 245],
  [205, 45, 45],
  [95, 165, 245],
];
const SKIN = 2, PALE = 3, GREEN = 4, OUT = 1;

// sprite char -> palette index ('.'/' ' = transparent, keep what's underneath)
const CH: Record<string, number> = { "#": 1, W: 5, P: 1, R: 6, T: 5, V: 7 };

function blank(): Uint8Array {
  return new Uint8Array(W * H).fill(0);
}

/** Filled skin head with a clean 1px outline, optionally shifted by dx (shake). */
function head(skin: number, dx = 0): Uint8Array {
  const f = blank();
  const cx = 15.5 + dx, cy = 8.2, rx = 12, ry = 7.4;
  const inside = (x: number, y: number) => {
    const nx = (x - cx) / rx, ny = (y - cy) / ry;
    return nx * nx + ny * ny <= 1.0;
  };
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) if (inside(x, y)) f[y * W + x] = skin;
  // outline: any skin pixel touching background (or the border)
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (f[y * W + x] !== skin) continue;
      const edge =
        x === 0 || x === W - 1 || y === 0 || y === H - 1 ||
        f[y * W + x - 1] === 0 || f[y * W + x + 1] === 0 ||
        f[(y - 1) * W + x] === 0 || f[(y + 1) * W + x] === 0;
      if (edge) f[y * W + x] = OUT;
    }
  return f;
}

/** Stamp a small sprite at (x,y). '.'/' ' are transparent. */
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

// ---- feature sprites -------------------------------------------------------
const EYE_OPEN = ["WWW", "WPW", "WWW"];
const EYE_BLINK = ["...", "PPP", "..."];
const EYE_DOWN = ["WWW", "WWW", "WPW"]; // pupil low = worried glance
const EYE_WIDE = ["WWWW", "WWWW", "WPWW", "WWWW"]; // scared
const EYE_X = ["P.P", ".P.", "P.P"];
const EYE_SLEEP = ["...", "PPP", "..."];

const MOUTH_GRIN = [" ##### ", "#RRRRR#", "#T#T#T#", " ##### "];
const MOUTH_FROWN = [".####.", "#....#"]; // small ∩
const MOUTH_O = [".####.", "#RRRR#", "#RRRR#", ".####."];
const MOUTH_WAVY = ["##..##..#", "..##..##."];
const MOUTH_TONGUE = ["######", "#RRRR#", "#RRRR#", "..RR.."];
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

/** Build the animation frames for an expression. */
function frames(expr: Expr): Uint8Array[] {
  const eyes = (f: Uint8Array, l: string[], r: string[], dx = 0) => {
    stamp(f, 9, 5, l, dx);
    stamp(f, 19, 5, r, dx);
  };

  if (expr === "happy") {
    const a = head(SKIN); eyes(a, EYE_OPEN, EYE_OPEN); stamp(a, 12, 10, MOUTH_GRIN);
    const b = head(SKIN); eyes(b, EYE_BLINK, EYE_BLINK); stamp(b, 12, 10, MOUTH_GRIN);
    return [a, a, a, b]; // mostly open, quick blink
  }

  if (expr === "worried") {
    const a = head(PALE); eyes(a, EYE_DOWN, EYE_DOWN); stamp(a, 13, 12, MOUTH_FROWN); stamp(a, 25, 5, SWEAT);
    const b = head(PALE); eyes(b, EYE_DOWN, EYE_DOWN); stamp(b, 13, 12, MOUTH_FROWN); stamp(b, 25, 8, SWEAT);
    return [a, b];
  }

  if (expr === "panic") {
    const a = head(PALE, 0); eyes(a, EYE_WIDE, EYE_WIDE, 0); stamp(a, 13, 9, MOUTH_O);
    stamp(a, 5, 5, SWEAT); stamp(a, 26, 5, SWEAT);
    const b = head(PALE, 1); eyes(b, EYE_WIDE, EYE_WIDE, 1); stamp(b, 14, 9, MOUTH_O);
    stamp(b, 5, 8, SWEAT); stamp(b, 26, 8, SWEAT);
    return [a, b]; // shake + sweat
  }

  if (expr === "queasy") {
    const a = head(GREEN); eyes(a, EYE_BLINK, EYE_DOWN); stamp(a, 11, 12, MOUTH_WAVY);
    const b = head(GREEN); eyes(b, EYE_DOWN, EYE_BLINK); stamp(b, 11, 12, MOUTH_WAVY);
    return [a, b];
  }

  if (expr === "sick") {
    const a = head(GREEN, 0); eyes(a, EYE_X, EYE_X); stamp(a, 13, 10, MOUTH_TONGUE);
    const b = head(GREEN, 1); eyes(b, EYE_X, EYE_X, 1); stamp(b, 14, 10, MOUTH_TONGUE);
    return [a, b];
  }

  // sleep
  const a = head(SKIN); eyes(a, EYE_SLEEP, EYE_SLEEP); stamp(a, 13, 12, MOUTH_FROWN);
  return [a];
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

/** Mug-ready 32x16 animated face GIF for the given expression. */
export function renderFaceGif(expr: Expr): Uint8Array {
  return encode(frames(expr), 1, expr === "happy" ? 250 : 350);
}

/** Upscaled face GIF for human preview / docs. */
export function renderFacePreviewGif(expr: Expr, scale = 12): Uint8Array {
  return encode(frames(expr), scale, expr === "happy" ? 250 : 350);
}

export const EXPRESSIONS: Expr[] = ["happy", "worried", "panic", "queasy", "sick", "sleep"];
