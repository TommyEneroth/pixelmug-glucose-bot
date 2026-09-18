/**
 * gen-space.ts — "Rymd": a starfield whose drift direction, speed and colour ARE
 * your glucose. Stars drift up as you rise, down as you fall, gently twinkle in
 * range, blaze into a red warp when you're high, a cold blue warp when you're
 * low, and nearly freeze — dim — when the reading is stale. A little planet sits
 * in the corner. Same 6 expression keys as the face packs. Six frames.
 *
 *   bun run gen-space   /   THEME=dark bun run gen-space
 */
import { GIFEncoder } from "gifenc";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const W = 32, H = 16;
const DARK = process.env.THEME === "dark";

// 0 space 1 starDim 2 starMid 3 starBright 4 warmStar 5 warmBright 6 coolStar
// 7 coolBright 8 planet 9 planetLight 10 planetShade 11 ring 12 white 13 red 14 blue 15 dim
const PALETTE: [number, number, number][] = [
  [10, 10, 22], [90, 90, 120], [170, 170, 200], [240, 240, 255], [255, 180, 90],
  [255, 226, 150], [120, 170, 255], [190, 220, 255], [150, 96, 200], [200, 150, 240],
  [96, 56, 140], [150, 130, 190], [255, 255, 255], [255, 90, 60], [110, 170, 255], [60, 60, 84],
];
if (DARK) PALETTE[0] = [4, 4, 12]; // deep space on the black mug

type Frame = Uint8Array;
const blank = () => new Uint8Array(W * H).fill(0);
const px = (f: Frame, x: number, y: number, c: number) => { if (x >= 0 && x < W && y >= 0 && y < H) f[y * W + x] = c; };

// fixed star field (x, y, depth 0..2); depth drives brightness, speed & streak
const STARS: [number, number, number][] = [
  [2, 3, 2], [6, 11, 1], [10, 5, 2], [14, 13, 0], [18, 2, 1], [22, 9, 2],
  [26, 6, 1], [30, 12, 2], [4, 8, 0], [12, 1, 1], [20, 14, 2], [24, 4, 0],
  [8, 15, 1], [28, 1, 2], [16, 8, 1], [1, 13, 0], [15, 4, 0], [23, 13, 1],
];
type Style = { dir: number; speed: number; bright: number; mid: number; streak: boolean; twinkle?: boolean; dim?: boolean };

function planet(f: Frame) { // small ringed planet, lower-left
  const cx = 5, cy = 12, r = 3;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = (x - cx) ** 2 + (y - cy) ** 2;
    if (d <= r * r) f[y * W + x] = (x - cx) + (y - cy) < -1 ? 9 : (x - cx) + (y - cy) > 2 ? 10 : 8;
  }
  for (let x = cx - 5; x <= cx + 5; x++) px(f, x, cy - 1, 11); // ring hint
}

function field(s: Style, t: number): Frame {
  const f = blank(); f.fill(0);
  for (const [sx, sy, depth] of STARS) {
    const spd = s.speed * (depth + 1);
    let y = ((sy + s.dir * t * spd) % H + H) % H;
    let x = sx;
    const bright = depth >= 2 ? s.bright : depth >= 1 ? s.mid : 1;
    const b = s.dim ? 15 : bright;
    if (s.twinkle && (sx + t) % 3 === 0) continue; // gentle twinkle drop-outs
    px(f, x, y, b);
    if (s.streak) { // motion trail opposite the drift
      px(f, x, ((y - s.dir + H) % H), depth >= 1 ? s.mid : 15);
      if (depth >= 2) px(f, x, ((y - 2 * s.dir + H) % H), 15);
    }
  }
  return f;
}

const DRIFT: Record<string, Style> = {
  happy: { dir: -1, speed: 0.5, bright: 3, mid: 2, streak: false, twinkle: true },
  worried: { dir: 1, speed: 1, bright: 7, mid: 6, streak: true },   // cool, drifting down
  panic: { dir: 1, speed: 2, bright: 14, mid: 6, streak: true },     // cold blue warp
  queasy: { dir: -1, speed: 1, bright: 5, mid: 4, streak: true },    // warm, drifting up
  sick: { dir: -1, speed: 2, bright: 13, mid: 5, streak: true },     // red warp up
  sleep: { dir: -1, speed: 0, bright: 1, mid: 1, streak: false, dim: true },
};
const DELAY: Record<string, number> = { happy: 200, worried: 150, panic: 90, queasy: 150, sick: 80, sleep: 320 };
const SCENES: Record<string, (t: number) => Frame> = Object.fromEntries(
  Object.keys(DRIFT).map((k) => [k, (t: number) => { const f = field(DRIFT[k], t); planet(f); return f; }])
);
const FRAMES = 8;

function upscale(f: Frame, s: number): Frame {
  const o = new Uint8Array(W * s * H * s);
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) { const v = f[r * W + c]; for (let dr = 0; dr < s; dr++) for (let dc = 0; dc < s; dc++) o[(r * s + dr) * (W * s) + (c * s + dc)] = v; }
  return o;
}
function encode(frames: Frame[], scale: number, delay: number): Uint8Array {
  const g = GIFEncoder();
  frames.forEach((f, i) => g.writeFrame(scale === 1 ? f : upscale(f, scale), W * scale, H * scale, { palette: PALETTE, delay, repeat: 0, first: i === 0 }));
  g.finish(); return g.bytes();
}
const name = `space${DARK ? "-dark" : ""}`;
const dir = join(import.meta.dir, "..", "packs", name);
mkdirSync(dir, { recursive: true });
for (const e of Object.keys(SCENES)) {
  const frames = Array.from({ length: FRAMES }, (_, t) => SCENES[e](t));
  const d = DELAY[e] ?? 150;
  writeFileSync(join(dir, `${e}.gif`), encode(frames, 1, d));
  writeFileSync(join(import.meta.dir, "..", "docs", `${name}_${e}.gif`), encode(frames, 10, d));
  console.log("wrote", `packs/${name}/${e}.gif`);
}
