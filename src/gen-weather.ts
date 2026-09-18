/**
 * gen-weather.ts — "Väder-i-muggen": the sky IS your glucose. Ambient, readable
 * from across the room, no numbers. Same 6 expression keys as the face packs, so
 * it plugs straight into the app's pack selector, previews and dark/light logic.
 *
 *   bun run gen-weather        ->  packs/weather/*.gif       (P1, light sky)
 *   THEME=dark bun run gen-weather -> packs/weather-dark/*.gif (S1 Pro, deep sky)
 *
 *   happy   = ☀️  sunshine        (in range)
 *   worried = 🌥️  clouds drift in (falling — snart lågt)
 *   panic   = ⛈️  thunder + bolt  (acute low)
 *   queasy  = ☁️  overcast churns (rising — snart högt)
 *   sick    = 🌨️  snowfall        (acute high)
 *   sleep   = 🌙  calm night      (stale / no data)
 *
 * Every scene is 6 frames for smooth motion. Original pixel art.
 */
import { GIFEncoder } from "gifenc";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const W = 32, H = 16;
const DARK = process.env.THEME === "dark";

// 0 sky 1 sunCore 2 sunBody 3 ray 4 cloudLight 5 cloudMid 6 cloudDark
// 7 cloudShadow 8 rain 9 bolt 10 snow 11 star 12 moon 13 nightSky 14 flash 15 grey
const PALETTE: [number, number, number][] = [
  [125, 185, 238], [255, 242, 170], [252, 206, 48], [255, 228, 96],
  [250, 250, 252], [198, 204, 216], [120, 128, 150], [78, 84, 104],
  [104, 158, 240], [255, 246, 150], [252, 252, 255], [232, 234, 255],
  [240, 234, 196], [20, 22, 42], [255, 255, 235], [150, 156, 172],
];
// On the black S1 Pro the day sky becomes a deep blue so sun/clouds glow.
if (DARK) PALETTE[0] = [16, 22, 48];
const SNOW_SKY = DARK ? 13 : 5; // overcast white on P1, deep grey-blue on S1 Pro

type Frame = Uint8Array;
const blank = () => new Uint8Array(W * H).fill(0);
function fill(f: Frame, c: number) { f.fill(c); }
function px(f: Frame, x: number, y: number, c: number) {
  x = Math.round(x); y = Math.round(y);
  if (x >= 0 && x < W && y >= 0 && y < H) f[y * W + x] = c;
}
function rect(f: Frame, x0: number, y0: number, x1: number, y1: number, c: number) {
  for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++)
    for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) f[y * W + x] = c;
}
function disc(f: Frame, cx: number, cy: number, r: number, c: number) {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
    if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) f[y * W + x] = c;
}
/** A fluffy cloud: three overlapping puffs + a flat base, in colour `c` (+shade). */
function cloud(f: Frame, cx: number, cy: number, s: number, c: number, shade: number) {
  disc(f, cx - 2 * s, cy + 1, 1.6 * s, c);
  disc(f, cx + 2 * s, cy + 1, 1.7 * s, c);
  disc(f, cx, cy - 0.6 * s, 2.1 * s, c);
  rect(f, Math.round(cx - 3.2 * s), Math.round(cy + 1), Math.round(cx + 3.2 * s), Math.round(cy + 2 * s), c);
  // soft underside shadow
  rect(f, Math.round(cx - 3 * s), Math.round(cy + 2 * s), Math.round(cx + 3 * s), Math.round(cy + 2 * s), shade);
}

// ---------- scenes (each: t -> frame) ----------

function sunny(t: number): Frame { // ☀️ pulsing rays + a small cloud drifting by
  const f = blank(); fill(f, 0);
  const cx = 23, cy = 4;
  // rays (twinkle: full spokes on even frames, half on odd), slow rotation
  const spokes = t % 2 === 0 ? 8 : 4;
  for (let k = 0; k < 8; k++) {
    if (spokes === 4 && k % 2 === 1) continue;
    const a = (k * Math.PI) / 4 + t * 0.12;
    const len = 3 + (t % 3 === 0 ? 1 : 0);
    for (let r = 4; r <= 4 + len; r++) px(f, cx + Math.cos(a) * r, cy + Math.sin(a) * r, 3);
  }
  disc(f, cx, cy, 3.1, 2);   // body
  disc(f, cx, cy, 1.6, 1);   // core
  // little cloud drifting across the low sky
  const dcx = ((t * 3 + 3) % 40) - 4;
  cloud(f, dcx, 12, 0.9, 4, 5);
  return f;
}

function clouding(t: number): Frame { // 🌥️ grey cloud slides in and eats the sun
  const f = blank(); fill(f, 0);
  const cx = 24, cy = 4;
  // a few sun rays still poking out early on
  if (t < 4) for (let k = 0; k < 8; k += 2) {
    const a = (k * Math.PI) / 4;
    px(f, cx + Math.cos(a) * 5, cy + Math.sin(a) * 5, 3);
  }
  disc(f, cx, cy, 3, 2); disc(f, cx, cy, 1.5, 1);
  // main grey cloud marching right toward the sun
  const gx = -4 + t * 6;
  cloud(f, gx, 5, 1.25, 5, 6);
  // a lower second cloud drifting the other pace
  cloud(f, 6 + t * 2, 12, 0.9, 4, 5);
  return f;
}

function storm(t: number): Frame { // ⛈️ dark clouds, rain, flashing bolt
  const f = blank(); fill(f, 13);
  const flash = t === 1 || t === 4;
  if (flash) { // brief whole-sky flash tint behind the storm (deterministic sparkle)
    for (let i = 0; i < f.length; i++) if ((i * 7 + t) % 9 === 0) f[i] = 14;
  }
  // heavy cloud band across the top
  cloud(f, 9, 4, 1.5, 6, 7);
  cloud(f, 22, 4, 1.6, 6, 7);
  rect(f, 0, 0, W - 1, 5, 6); rect(f, 0, 5, W - 1, 6, 7);
  // rain streaks falling (phase shifts each frame)
  for (let x = 2; x < W; x += 4) {
    const y = 8 + ((x / 4 + t * 2) % 6);
    px(f, x, y, 8); px(f, x, y + 1, 8);
  }
  // lightning bolt on flash frames
  if (flash) {
    const zig = [[15, 6], [14, 8], [16, 9], [15, 11], [17, 12], [16, 14]];
    for (const [x, y] of zig) { px(f, x, y, 9); px(f, x + 1, y, 9); }
  }
  return f;
}

function overcast(t: number): Frame { // ☁️ heavy grey ceiling churns downward + flurries
  const f = blank(); fill(f, 0);
  // a lumpy grey cloud ceiling filling most of the sky, with a wavy underside
  // that rolls sideways each frame = the sky "closing up".
  for (let x = 0; x < W; x++) {
    const wave = Math.sin((x + t * 2) / 3) + 0.5 * Math.sin((x - t) / 2);
    const h = Math.round(9 + wave * 1.8);          // ceiling depth for this column
    for (let y = 0; y <= h; y++) {
      // darker lumps where the cloud bulges, lighter grey elsewhere → texture
      f[y * W + x] = (wave > 0.6 && y > h - 3) ? 6 : 5;
    }
    f[h * W + x] = 7;                                // shaded underside edge
    if (h - 1 >= 0) if (wave > 0.9) f[(h - 1) * W + x] = 6;
  }
  // a few flurries drifting out of the underside
  for (const [sx, seed] of [[5, 0], [12, 3], [19, 1], [26, 4], [30, 2]] as const) {
    const y = 11 + ((seed + t * 2) % 5);
    px(f, sx + (t % 2), y, 10);
  }
  return f;
}

function snowfall(t: number): Frame { // 🌨️ steady snow + settling drift
  const f = blank(); fill(f, SNOW_SKY);
  // soft overcast lumps up top
  cloud(f, 8, 3, 1.2, 4, 5); cloud(f, 22, 3, 1.3, 4, 5);
  rect(f, 0, 0, W - 1, 3, 4);
  // falling flakes (each column has a phase + gentle sway)
  const cols = [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31];
  cols.forEach((x, i) => {
    const y = 4 + ((i * 2 + t * 2) % 11);
    px(f, x + (Math.floor((y + i) / 2) % 2), y, 10);
    if (i % 2 === 0) px(f, x, (y + 3) % 15 + 1, 10); // a second, offset flake
  });
  // accumulated snow along the bottom
  rect(f, 0, 15, W - 1, 15, 10);
  for (let x = (t % 2); x < W; x += 3) px(f, x, 14, 10);
  return f;
}

function night(t: number): Frame { // 🌙 crescent moon + twinkling stars
  const f = blank(); fill(f, 13);
  // twinkling stars (subset per frame)
  const stars: [number, number][] = [
    [3, 3], [8, 6], [5, 11], [12, 2], [11, 9], [16, 5],
    [19, 11], [2, 8], [14, 13], [7, 2], [10, 14], [21, 8],
  ];
  stars.forEach(([x, y], i) => { if ((i + t) % 3 !== 0) px(f, x, y, 11); });
  // crescent moon upper-right
  disc(f, 25, 4, 3, 12);
  disc(f, 27, 3, 3, 13); // carve to a crescent
  return f;
}

const DELAY: Record<string, number> = {
  happy: 200, worried: 180, panic: 130, queasy: 180, sick: 150, sleep: 260,
};
const SCENES: Record<string, (t: number) => Frame> = {
  happy: sunny, worried: clouding, panic: storm, queasy: overcast, sick: snowfall, sleep: night,
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

const name = `weather${DARK ? "-dark" : ""}`;
const dir = join(import.meta.dir, "..", "packs", name);
mkdirSync(dir, { recursive: true });
for (const e of Object.keys(SCENES)) {
  const frames = Array.from({ length: FRAMES }, (_, t) => SCENES[e](t));
  const d = DELAY[e] ?? 180;
  writeFileSync(join(dir, `${e}.gif`), encode(frames, 1, d));
  writeFileSync(join(import.meta.dir, "..", "docs", `${name}_${e}.gif`), encode(frames, 10, d));
  console.log("wrote", `packs/${name}/${e}.gif`);
}
console.log(`\nUse it:  FACE_PACK=packs/${name} bun run bot`);
