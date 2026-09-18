/**
 * gen-matrix.ts — "Matrix": digital rain whose colour, speed and density ARE your
 * glucose. Green and steady in range; blue and glitchy when low; red and racing
 * when high; amber climbing, teal falling; a dim idle drizzle when stale.
 * Same 6 expression keys as the face packs. Six frames.
 *
 *   bun run gen-matrix   /   THEME=dark bun run gen-matrix
 */
import { GIFEncoder } from "gifenc";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const W = 32, H = 16;
const DARK = process.env.THEME === "dark";

// 0 bg  1 head(white-ish)  2 c1 3 c2 4 c3 (tail fade)  5 glitch
const PALETTE: [number, number, number][] = [
  [232, 229, 222], [235, 255, 235], [120, 240, 140], [60, 170, 80], [30, 96, 48],
  [230, 60, 40], [235, 255, 255], [120, 200, 240], [56, 132, 200], [28, 74, 120],
  [255, 220, 120], [220, 150, 30], [255, 120, 60], [210, 60, 40], [120, 30, 24], [235, 235, 245],
];
if (DARK) PALETTE[0] = [8, 10, 10];

type Frame = Uint8Array;
const blank = () => new Uint8Array(W * H).fill(0);
const px = (f: Frame, x: number, y: number, c: number) => { if (x >= 0 && x < W && y >= 0 && y < H) f[y * W + x] = c; };

// Each scene picks a head colour + 3 tail-fade colours, a fall speed and density.
type Style = { head: number; tail: [number, number, number]; speed: number; density: number; glitch?: boolean; slow?: boolean };
const GREEN: Style = { head: 1, tail: [2, 3, 4], speed: 1, density: 7 };
const TEAL: Style = { head: 6, tail: [7, 8, 9], speed: 1, density: 5 };
const BLUE: Style = { head: 6, tail: [7, 8, 9], speed: 2, density: 6, glitch: true };
const AMBER: Style = { head: 10, tail: [10, 11, 4], speed: 2, density: 6 };
const RED: Style = { head: 15, tail: [12, 13, 14], speed: 3, density: 9 };
const IDLE: Style = { head: 2, tail: [3, 4, 4], speed: 1, density: 3, slow: true };

function rain(s: Style, t: number): Frame {
  const f = blank();
  const tt = s.slow ? Math.floor(t / 2) : t;
  for (let x = 0; x < W; x++) {
    if (((x * 13 + 5) % 10) >= s.density) continue; // inactive column
    const seed = (x * 5 + 3) % 21;
    const head = ((seed + tt * s.speed) % 21) - 3;  // travels down, off-screen at top
    px(f, x, head, s.head);
    px(f, x, head - 1, s.tail[0]);
    px(f, x, head - 2, s.tail[1]);
    px(f, x, head - 3, s.tail[2]);
    if (s.glitch && (x * 7 + t) % 17 === 0) px(f, x, (head + 4) % 16, 5); // red glitch fleck
  }
  return f;
}

const DELAY: Record<string, number> = { happy: 120, worried: 130, panic: 90, queasy: 110, sick: 70, sleep: 220 };
const SCENES: Record<string, (t: number) => Frame> = {
  happy: (t) => rain(GREEN, t), worried: (t) => rain(TEAL, t), panic: (t) => rain(BLUE, t),
  queasy: (t) => rain(AMBER, t), sick: (t) => rain(RED, t), sleep: (t) => rain(IDLE, t),
};
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
const name = `matrix${DARK ? "-dark" : ""}`;
const dir = join(import.meta.dir, "..", "packs", name);
mkdirSync(dir, { recursive: true });
for (const e of Object.keys(SCENES)) {
  const frames = Array.from({ length: FRAMES }, (_, t) => SCENES[e](t));
  const d = DELAY[e] ?? 120;
  writeFileSync(join(dir, `${e}.gif`), encode(frames, 1, d));
  writeFileSync(join(import.meta.dir, "..", "docs", `${name}_${e}.gif`), encode(frames, 10, d));
  console.log("wrote", `packs/${name}/${e}.gif`);
}
