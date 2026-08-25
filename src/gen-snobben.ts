/**
 * gen-snobben.ts — generate a "Snobben" (Snoopy-style beagle) face pack.
 *
 *   bun run gen-snobben
 *
 * Writes six 32x16 GIFs to packs/snobben/ (happy/worried/panic/queasy/sick/sleep)
 * plus upscaled previews to docs/. Original pixel art — a playful homage, not the
 * real character; for personal use on your own mug.
 */
import { GIFEncoder } from "gifenc";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const W = 32, H = 16;
// 0 bg, 1 white, 2 black, 3 white-shade, 4 red, 5 green, 6 green-shade, 7 sweat
const PALETTE: [number, number, number][] = [
  [10, 10, 14], [245, 245, 245], [20, 20, 20], [206, 206, 212],
  [210, 50, 50], [200, 230, 190], [168, 202, 158], [110, 178, 250],
];
const CH: Record<string, number> = { B: 2, W: 1, R: 4, V: 7 };

const blank = () => new Uint8Array(W * H).fill(0);

/** Rounded-rect head, white (or green when sick), with a soft bottom shade. */
function head(green = false, dx = 0): Uint8Array {
  const f = blank();
  const base = green ? 5 : 1, shade = green ? 6 : 3, r = 5;
  const inRounded = (x: number, y: number) => {
    const cxL = r, cxR = W - 1 - r, cyT = r, cyB = H - 1 - r;
    const px = x < cxL ? cxL : x > cxR ? cxR : x;
    const py = y < cyT ? cyT : y > cyB ? cyB : y;
    const ddx = x - px, ddy = y - py;
    return ddx * ddx + ddy * ddy <= r * r + 0.5;
  };
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const sx = x - dx;
      if (sx < 0 || sx >= W || !inRounded(sx, y)) continue;
      f[y * W + x] = y >= 12 ? shade : base;
    }
  return f;
}

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

// Snoopy's long floppy black ear, hanging on the left
const EAR = [
  "BBB...", "BBBB..", "BBBB..", "BBBB..", "BBBB..",
  "BBBB..", ".BBBB.", ".BBBB.", "..BBB.", "..BB..",
];
const EAR_UP = [ // flying up (panic)
  "....BB", "..BBBB", ".BBBB.", "BBBB..", "BBB...",
  "BBB...", "BBBB..", "BBBB..", ".BBB..", "..BB..",
];

// big black nose (snout)
const NOSE = [".BBBB.", "BBBBBB", "BBBBBB", ".BBBB."];

// eyes (black) — variants
const EYE = ["B", "B", "B"];           // normal oval
const EYE_HAPPY = ["B.B", ".B."];      // content ‿
const EYE_WIDE = ["BB", "BB", "BB"];   // shocked
const EYE_X = ["B.B", ".B.", "B.B"];   // sick
const EYE_SLEEP = ["BBB"];             // closed line

const MOUTH_SMILE = ["B....B", ".BBBB."];
const MOUTH_FLAT = ["BBBBBB"];
const MOUTH_OPEN = [".BB.", "BRRB", ".BB."];
const MOUTH_TONGUE = ["BBBB", "BRRB", ".RR."];
const SWEAT = ["V", "V"];

type Expr = "happy" | "worried" | "panic" | "queasy" | "sick" | "sleep";

function eyes(f: Uint8Array, l: string[], r: string[], dx = 0) {
  stamp(f, 13, 4, l, dx);
  stamp(f, 20, 4, r, dx);
}

function frames(expr: Expr): Uint8Array[] {
  const nose = (f: Uint8Array, dx = 0) => stamp(f, 13, 9, NOSE, dx);
  const ear = (f: Uint8Array, up = false, dx = 0) => stamp(f, 1, 2, up ? EAR_UP : EAR, dx);

  if (expr === "happy") {
    const a = head(); ear(a); eyes(a, EYE_HAPPY, EYE_HAPPY); nose(a); stamp(a, 12, 13, MOUTH_SMILE);
    const b = head(); ear(b); eyes(b, EYE, EYE); nose(b); stamp(b, 12, 13, MOUTH_SMILE);
    return [a, a, b]; // content, occasional open-eye
  }
  if (expr === "worried") {
    const mk = (sy: number) => { const f = head(); ear(f); eyes(f, EYE_WIDE, EYE_WIDE); nose(f); stamp(f, 13, 13, MOUTH_FLAT); stamp(f, 28, sy, SWEAT); return f; };
    return [mk(4), mk(7)];
  }
  if (expr === "panic") {
    const mk = (dx: number, sy: number) => { const f = head(false, dx); ear(f, true, dx); eyes(f, EYE_WIDE, EYE_WIDE, dx); nose(f, dx); stamp(f, 14 + dx, 12, MOUTH_OPEN); stamp(f, 2, sy, SWEAT); stamp(f, 29, sy, SWEAT); return f; };
    return [mk(0, 4), mk(1, 7)];
  }
  if (expr === "queasy") {
    const mk = (l: string[], r: string[]) => { const f = head(true); ear(f); eyes(f, l, r); nose(f); stamp(f, 12, 13, MOUTH_FLAT); return f; };
    return [mk(EYE_SLEEP, EYE), mk(EYE, EYE_SLEEP)];
  }
  if (expr === "sick") {
    const mk = (dx: number) => { const f = head(true, dx); ear(f, false, dx); eyes(f, EYE_X, EYE_X, dx); nose(f, dx); stamp(f, 13 + dx, 12, MOUTH_TONGUE); return f; };
    return [mk(0), mk(1)];
  }
  // sleep
  const a = head(); ear(a); eyes(a, EYE_SLEEP, EYE_SLEEP); nose(a); stamp(a, 13, 13, MOUTH_FLAT); stamp(a, 25, 3, ["V"]);
  const b = head(); ear(b); eyes(b, EYE_SLEEP, EYE_SLEEP); nose(b); stamp(b, 13, 13, MOUTH_FLAT); stamp(b, 26, 2, ["V"]);
  return [a, b, a];
}

function upscale(f: Uint8Array, s: number): Uint8Array {
  const out = new Uint8Array(W * s * H * s);
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    const v = f[r * W + c];
    for (let dr = 0; dr < s; dr++) for (let dc = 0; dc < s; dc++) out[(r * s + dr) * (W * s) + (c * s + dc)] = v;
  }
  return out;
}

function encode(fr: Uint8Array[], scale: number, delay = 300): Uint8Array {
  const gif = GIFEncoder();
  fr.forEach((f, i) => gif.writeFrame(scale === 1 ? f : upscale(f, scale), W * scale, H * scale, { palette: PALETTE, delay, repeat: 0, first: i === 0 }));
  gif.finish();
  return gif.bytes();
}

const EXPRS: Expr[] = ["happy", "worried", "panic", "queasy", "sick", "sleep"];
const packDir = join(import.meta.dir, "..", "packs", "snobben");
mkdirSync(packDir, { recursive: true });
mkdirSync(join(import.meta.dir, "..", "docs"), { recursive: true });
for (const e of EXPRS) {
  writeFileSync(join(packDir, `${e}.gif`), encode(frames(e), 1));
  writeFileSync(join(import.meta.dir, "..", "docs", `snobben_${e}.gif`), encode(frames(e), 10));
  console.log("wrote", `packs/snobben/${e}.gif`);
}
console.log(`\nUse it:  FACE_PACK=packs/snobben bun run bot`);
