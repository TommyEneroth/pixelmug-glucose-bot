/**
 * gen-lava.ts — "Lavalampa": molten blobs whose height, colour and motion ARE
 * your glucose. Blobs sit low and cold-blue when you're low, bob gently green in
 * range, and boil red-hot up top when you're high. Same 6 expression keys as the
 * face packs. Metaballs, six frames.
 *
 *   bun run gen-lava   /   THEME=dark bun run gen-lava
 *
 *   happy=calm green bob  worried=sinking/cooling  panic=cold, pooled low
 *   queasy=rising/warming sick=boiling red up top   sleep=lamp off, one blob
 */
import { GIFEncoder } from "gifenc";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const W = 32, H = 16;
const DARK = process.env.THEME === "dark";

// 0 bg 1 glass 2 glassEdge 3 base 4 baseDark 5 blueCore 6 blue 7 greenCore
// 8 green 9 hotCore 10 orange 11 red 12 white 13 dim 14 cap 15 dimCore
const PALETTE: [number, number, number][] = [
  [232, 229, 222], [206, 214, 226], [150, 156, 172], [120, 124, 140],
  [78, 82, 100], [150, 226, 255], [56, 150, 232], [190, 255, 190],
  [70, 200, 120], [255, 244, 160], [255, 140, 40], [230, 60, 40],
  [255, 255, 255], [64, 70, 92], [166, 170, 186], [120, 130, 160],
];
if (DARK) { PALETTE[0] = [10, 10, 14]; PALETTE[1] = [24, 26, 40]; PALETTE[2] = [58, 62, 84]; PALETTE[13] = [30, 32, 46]; }

type Frame = Uint8Array;
type Blob = { x: number; y: number; r: number };
const blank = () => new Uint8Array(W * H).fill(0);
function rect(f: Frame, x0: number, y0: number, x1: number, y1: number, c: number) {
  for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++)
    for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) f[y * W + x] = c;
}
function px(f: Frame, x: number, y: number, c: number) {
  if (x >= 0 && x < W && y >= 0 && y < H) f[Math.round(y) * W + Math.round(x)] = c;
}

const IX0 = 8, IX1 = 23, IY0 = 1, IY1 = 12; // glass interior
function lamp(f: Frame, blobs: Blob[], core: number, mid: number, dim = false) {
  f.fill(0);
  // glass vessel
  rect(f, IX0, IY0, IX1, IY1, 1);
  rect(f, IX0 - 1, IY0 + 1, IX0 - 1, IY1, 2); rect(f, IX1 + 1, IY0 + 1, IX1 + 1, IY1, 2);
  rect(f, IX0, IY0 - 0, IX1, IY0, 2);        // top rim
  // base / cap
  rect(f, IX0 - 1, 13, IX1 + 1, 13, 14);
  rect(f, IX0, 14, IX1, 15, 3); rect(f, IX0, 15, IX1, 15, 4);
  // metaball field
  for (let y = IY0; y <= IY1; y++) for (let x = IX0; x <= IX1; x++) {
    let field = 0;
    for (const b of blobs) field += (b.r * b.r) / ((x - b.x) ** 2 + (y - b.y) ** 2 + 0.6);
    if (field >= 1) {
      f[y * W + x] = field >= 2.4 ? (dim ? 15 : core) : mid;
      if (field >= 4 && !dim) f[y * W + x] = 12; // bright highlight in dense centres
    }
  }
}

// blob choreography per scene ------------------------------------------------
const wob = (t: number, a: number, ph: number) => Math.sin(t * 0.9 + ph) * a;

function calm(t: number): Frame {   // green, gentle bob
  return withBlobs([
    { x: 13, y: 8 + wob(t, 2.2, 0), r: 3 },
    { x: 18, y: 7 + wob(t, 2.4, 2), r: 2.6 },
    { x: 16, y: 11 + wob(t, 1.2, 4), r: 2 },
  ], 7, 8);
}
function sinking(t: number): Frame { // cooling blue, drifting down
  const d = t * 0.7;
  return withBlobs([
    { x: 14, y: 6 + d, r: 2.8 }, { x: 18, y: 8 + d * 0.8, r: 2.4 }, { x: 16, y: 10 + d * 0.5, r: 2 },
  ], 5, 6);
}
function coldLow(t: number): Frame { // pooled cold at the bottom, dim, barely moving
  return withBlobs([
    { x: 13, y: 11 + wob(t, 0.4, 0), r: 3 }, { x: 18, y: 11.5 + wob(t, 0.4, 3), r: 3 }, { x: 16, y: 12, r: 2.4 },
  ], 5, 6, true);
}
function rising(t: number): Frame { // warming orange, drifting up
  const u = t * 0.7;
  return withBlobs([
    { x: 14, y: 11 - u, r: 2.8 }, { x: 18, y: 9 - u * 0.8, r: 2.4 }, { x: 16, y: 12 - u * 0.5, r: 2 },
  ], 9, 10);
}
function boiling(t: number): Frame { // hot red, chaotic, filling the vessel
  const j = (n: number) => wob(t, 2.6, n);
  return withBlobs([
    { x: 12 + j(0), y: 5 + j(1), r: 2.6 }, { x: 19 + j(2), y: 6 + j(3), r: 2.6 },
    { x: 15 + j(4), y: 9 + j(5), r: 2.8 }, { x: 20 + j(6), y: 10 + j(2), r: 2.2 },
    { x: 11 + j(3), y: 10 + j(1), r: 2.0 },
  ], 9, 11);
}
function off(t: number): Frame {     // lamp off — one settled blob, no motion
  return withBlobs([{ x: 16, y: 11.5, r: 3 }, { x: 13, y: 12, r: 1.8 }], 15, 13, true);
}
function withBlobs(b: Blob[], core: number, mid: number, dim = false): Frame {
  const f = blank(); lamp(f, b, core, mid, dim); return f;
}

const DELAY: Record<string, number> = { happy: 180, worried: 200, panic: 260, queasy: 200, sick: 120, sleep: 320 };
const SCENES: Record<string, (t: number) => Frame> = {
  happy: calm, worried: sinking, panic: coldLow, queasy: rising, sick: boiling, sleep: off,
};
const FRAMES = 6;

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
const name = `lava${DARK ? "-dark" : ""}`;
const dir = join(import.meta.dir, "..", "packs", name);
mkdirSync(dir, { recursive: true });
for (const e of Object.keys(SCENES)) {
  const frames = Array.from({ length: FRAMES }, (_, t) => SCENES[e](t));
  const d = DELAY[e] ?? 180;
  writeFileSync(join(dir, `${e}.gif`), encode(frames, 1, d));
  writeFileSync(join(import.meta.dir, "..", "docs", `${name}_${e}.gif`), encode(frames, 10, d));
  console.log("wrote", `packs/${name}/${e}.gif`);
}
