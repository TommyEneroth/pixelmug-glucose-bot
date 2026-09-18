/**
 * gen-synth.ts — "Synthwave": a retro sun over a neon perspective grid, where the
 * sun's height and colour and the grid's scroll speed ARE your glucose. The sun
 * rides high and hot-red when you're high, sits mid and warm in range, sinks and
 * cools when you fall/are low, and the whole scene goes to night when stale.
 * Same 6 expression keys as the face packs. Six frames.
 *
 *   bun run gen-synth   /   THEME=dark bun run gen-synth
 */
import { GIFEncoder } from "gifenc";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const W = 32, H = 16;
const DARK = process.env.THEME === "dark";

// 0 bg 1 skyTop 2 skyMid 3 skyLow 4 sunTop 5 sunMid 6 sunLow 7 grid 8 gridDim
// 9 horizon 10 coolTop 11 coolLow 12 white 13 red 14 star 15 nightSky
const PALETTE: [number, number, number][] = [
  [10, 8, 20], [46, 14, 66], [122, 32, 112], [226, 92, 124], [255, 232, 130],
  [255, 140, 60], [240, 62, 112], [255, 64, 184], [150, 32, 112], [255, 184, 150],
  [176, 200, 255], [120, 92, 220], [255, 255, 255], [255, 66, 66], [226, 226, 250], [16, 12, 30],
];
if (DARK) PALETTE[0] = [8, 6, 16];

type Frame = Uint8Array;
const HORIZON = 9;
const blank = () => new Uint8Array(W * H).fill(0);
const px = (f: Frame, x: number, y: number, c: number) => { if (x >= 0 && x < W && y >= 0 && y < H) f[y * W + x] = c; };

type Style = { sunY: number; r: number; top: number; mid: number; low: number; scroll: number; night?: boolean; dim?: boolean };

function sky(f: Frame, night: boolean) {
  for (let y = 0; y <= HORIZON; y++) {
    const c = night ? 15 : (y < 3 ? 1 : y < 6 ? 2 : 3);
    for (let x = 0; x < W; x++) f[y * W + x] = c;
  }
  if (night) { for (const [x, y] of [[4, 1], [9, 3], [15, 2], [21, 1], [26, 4], [29, 2], [12, 5]] as const) px(f, x, y, 14); }
}
function sun(f: Frame, s: Style) {
  for (let y = -s.r; y <= s.r; y++) for (let x = -s.r; x <= s.r; x++) {
    if (x * x + y * y > s.r * s.r) continue;
    const yy = s.sunY + y;
    if (yy > HORIZON) continue;                 // clipped at the horizon
    // scanline gaps in the lower half of the sun
    if (y > 0 && (y % 2 === 0)) continue;
    const lvl = (y + s.r) / (2 * s.r);          // 0 top .. 1 bottom
    const c = lvl < 0.4 ? s.top : lvl < 0.7 ? s.mid : s.low;
    px(f, 16 + x, yy, c);
  }
}
function grid(f: Frame, s: Style) {
  for (let x = 0; x < W; x++) f[HORIZON * W + x] = 9; // horizon glow line
  const scroll = Math.floor(s.scroll) % 2;
  for (let y = HORIZON + 1; y < H; y++) {
    const level = (y - HORIZON) / (H - HORIZON);
    // horizontal scan lines scrolling toward the viewer
    const on = ((y - HORIZON) + scroll) % 2 === 0;
    if (on) for (let x = 0; x < W; x++) f[y * W + x] = s.dim ? 8 : (level > 0.6 ? 7 : 8);
    // converging vertical lines
    for (const o of [-13, -8, -5, -3, -1, 1, 3, 5, 8, 13]) {
      const x = Math.round(16 + o * level);
      px(f, x, y, level > 0.5 ? 7 : 8);
    }
  }
}
function scene(s: Style): (t: number) => Frame {
  return (t: number) => {
    const f = blank(); sky(f, !!s.night);
    if (!s.night) sun(f, { ...s, scroll: s.scroll * t });
    grid(f, { ...s, scroll: s.scroll * t });
    return f;
  };
}

const STYLES: Record<string, Style> = {
  happy: { sunY: 6, r: 5, top: 4, mid: 5, low: 6, scroll: 1 },
  worried: { sunY: 8, r: 4, top: 10, mid: 11, low: 6, scroll: 1 },   // cooling, setting
  panic: { sunY: 10, r: 4, top: 10, mid: 11, low: 11, scroll: 1, dim: true }, // nearly set, cold
  queasy: { sunY: 5, r: 5, top: 4, mid: 5, low: 6, scroll: 2 },      // rising, warmer, faster grid
  sick: { sunY: 4, r: 6, top: 4, mid: 13, low: 13, scroll: 3 },      // high & hot, fast grid
  sleep: { sunY: 10, r: 0, top: 0, mid: 0, low: 0, scroll: 0, night: true, dim: true },
};
const DELAY: Record<string, number> = { happy: 180, worried: 200, panic: 220, queasy: 140, sick: 100, sleep: 320 };
const SCENES: Record<string, (t: number) => Frame> = Object.fromEntries(
  Object.keys(STYLES).map((k) => [k, scene(STYLES[k])])
);
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
const name = `synth${DARK ? "-dark" : ""}`;
const dir = join(import.meta.dir, "..", "packs", name);
mkdirSync(dir, { recursive: true });
for (const e of Object.keys(SCENES)) {
  const frames = Array.from({ length: FRAMES }, (_, t) => SCENES[e](t));
  const d = DELAY[e] ?? 160;
  writeFileSync(join(dir, `${e}.gif`), encode(frames, 1, d));
  writeFileSync(join(import.meta.dir, "..", "docs", `${name}_${e}.gif`), encode(frames, 10, d));
  console.log("wrote", `packs/${name}/${e}.gif`);
}
