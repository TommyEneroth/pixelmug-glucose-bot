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

// eyebrows (black). Position + tilt carry the emotion.
const BROW_FLAT = ["###"];
const BROW_UP_L = [".##", "#.."]; // outer-up (left)  \
const BROW_UP_R = ["##.", "..#"]; // outer-up (right) /
const BROW_ANGRY_L = ["#..", ".##"]; // inner-down (left)  /
const BROW_ANGRY_R = ["..#", "##."]; // inner-down (right) \

// crooked NOT-man moustache (black), lopsided — left tip up, right tip low
const MOUSTACHE = ["##......#.", "#####.####"];

const MOUTH_GRIN = [" ####### ", "#RRRRRRR#", "#T#T#T#T#", " ##RRR## "]; // big toothy grin
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
    stamp(f, 9, 4, l, dx);
    stamp(f, 19, 4, r, dx);
  };
  const brows = (f: Uint8Array, l: string[], r: string[], y = 2, dx = 0) => {
    stamp(f, 9, y, l, dx);
    stamp(f, 20, y, r, dx);
  };
  const stache = (f: Uint8Array, dx = 0) => stamp(f, 11, 8, MOUSTACHE, dx);

  if (expr === "happy") {
    // crooked brow (one raised) + moustache + big toothy grin = NOT-man
    const a = head(SKIN); brows(a, BROW_FLAT, BROW_UP_R, 2); eyes(a, EYE_OPEN, EYE_OPEN); stache(a); stamp(a, 11, 10, MOUTH_GRIN);
    const b = head(SKIN); brows(b, BROW_FLAT, BROW_UP_R, 2); eyes(b, EYE_BLINK, EYE_BLINK); stache(b); stamp(b, 11, 10, MOUTH_GRIN);
    return [a, a, a, b]; // mostly open, quick blink
  }

  if (expr === "worried") {
    const mk = (sy: number) => {
      const f = head(PALE); brows(f, BROW_UP_L, BROW_UP_R, 1); eyes(f, EYE_DOWN, EYE_DOWN);
      stache(f); stamp(f, 13, 12, MOUTH_FROWN); stamp(f, 25, sy, SWEAT); return f;
    };
    return [mk(5), mk(8)]; // sweat drips
  }

  if (expr === "panic") {
    const mk = (dx: number, sy: number) => {
      const f = head(PALE, dx); brows(f, BROW_FLAT, BROW_FLAT, 1, dx); eyes(f, EYE_WIDE, EYE_WIDE, dx);
      stache(f, dx); stamp(f, 13 + dx, 10, MOUTH_O); stamp(f, 5, sy, SWEAT); stamp(f, 26, sy, SWEAT); return f;
    };
    return [mk(0, 5), mk(1, 8)]; // shake + sweat
  }

  if (expr === "queasy") {
    const mk = (l: string[], r: string[]) => {
      const f = head(GREEN); brows(f, BROW_ANGRY_L, BROW_ANGRY_R, 3); eyes(f, l, r);
      stache(f); stamp(f, 11, 12, MOUTH_WAVY); return f;
    };
    return [mk(EYE_BLINK, EYE_DOWN), mk(EYE_DOWN, EYE_BLINK)];
  }

  if (expr === "sick") {
    const mk = (dx: number) => {
      const f = head(GREEN, dx); brows(f, BROW_ANGRY_L, BROW_ANGRY_R, 2, dx); eyes(f, EYE_X, EYE_X, dx);
      stache(f, dx); stamp(f, 13 + dx, 10, MOUTH_TONGUE); return f;
    };
    return [mk(0), mk(1)]; // wobble
  }

  // sleep — closed eyes, moustache, no brows
  const s = head(SKIN); eyes(s, EYE_SLEEP, EYE_SLEEP); stache(s); stamp(s, 13, 12, MOUTH_FROWN);
  return [s];
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
