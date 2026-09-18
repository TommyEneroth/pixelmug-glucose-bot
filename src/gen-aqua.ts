/**
 * gen-aqua.ts — "Akvariet": a little fish whose swimming and colour ARE your
 * glucose. Ambient, no numbers. Calm blue drift in range; the fish sinks as you
 * fall, rises as you climb, and turns a frantic red at the alarms. Same 6
 * expression keys as the face packs, so it plugs into the app's pack selector.
 *
 *   bun run gen-aqua            ->  packs/aqua/*.gif       (P1, bright water)
 *   THEME=dark bun run gen-aqua ->  packs/aqua-dark/*.gif  (S1 Pro, deep water)
 *
 *   happy   = 🐟 calm fish drifting to and fro (in range)
 *   worried = 🐟 fish sinks, water dims        (falling)
 *   panic   = 🐟 red fish darts at the bottom  (acute low)
 *   queasy  = 🐟 fish rises toward the surface (rising)
 *   sick    = 🐟 murky warm tank, fish gasps up top (acute high)
 *   sleep   = 🌙 dark tank, fish resting on the sand (stale)
 *
 * Six frames each. Original pixel art.
 */
import { GIFEncoder } from "gifenc";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const W = 32, H = 16;
const DARK = process.env.THEME === "dark";

// 0 water 1 waterDeep 2 fish 3 fin 4 belly 5 eye 6 alarmFish 7 bubble
// 8 weed 9 weedDark 10 sand 11 sandDark 12 surface 13 white 14 murk 15 alarmFin
const PALETTE: [number, number, number][] = [
  [46, 120, 182], [30, 88, 150], [246, 154, 40], [226, 96, 28],
  [255, 214, 130], [18, 20, 32], [232, 58, 42], [206, 236, 255],
  [64, 174, 96], [40, 122, 64], [222, 202, 140], [184, 162, 112],
  [150, 212, 236], [255, 255, 255], [110, 132, 70], [176, 40, 30],
];
if (DARK) { PALETTE[0] = [8, 22, 44]; PALETTE[1] = [5, 14, 30]; PALETTE[12] = [40, 90, 120]; PALETTE[14] = [34, 44, 22]; }

type Frame = Uint8Array;
const blank = () => new Uint8Array(W * H).fill(0);
function px(f: Frame, x: number, y: number, c: number) {
  x = Math.round(x); y = Math.round(y);
  if (x >= 0 && x < W && y >= 0 && y < H) f[y * W + x] = c;
}
function rect(f: Frame, x0: number, y0: number, x1: number, y1: number, c: number) {
  for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++)
    for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) f[y * W + x] = c;
}
function ellipse(f: Frame, cx: number, cy: number, rx: number, ry: number, c: number) {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
    if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) f[y * W + x] = c;
}

/** Water background with a bottom-deep gradient, a shimmering surface and sand. */
function tank(f: Frame, t: number, base = 0, murk = false) {
  f.fill(murk ? 14 : base);
  rect(f, 0, 10, W - 1, 13, murk ? 14 : 1);     // deeper water lower down (uniform when murky)
  // surface shimmer (top row, drifting)
  for (let x = (t % 2); x < W; x += 3) px(f, x, 0, 12);
  // sandy bed
  rect(f, 0, 14, W - 1, 15, 10);
  for (let x = (t * 2) % 3; x < W; x += 4) px(f, x, 14, 11);
}
/** Green weeds rising from the sand, swaying with the current. */
function weeds(f: Frame, t: number, lively = true) {
  for (const [rootx, hgt] of [[4, 6], [27, 7], [12, 4]] as const) {
    for (let k = 0; k < hgt; k++) {
      const y = 13 - k;
      const sway = lively ? Math.round(Math.sin(k * 0.6 + t * 0.5 + rootx) * 1.2) : 0;
      px(f, rootx + sway, y, k > hgt - 3 ? 8 : 9);
    }
  }
}
/** A small fish. dir=+1 faces right, -1 left. `flap` wags the tail. */
function fish(f: Frame, cx: number, cy: number, dir: number, body: number, fin: number, flap: number) {
  ellipse(f, cx, cy, 3, 2, body);               // body
  for (let x = cx - 1; x <= cx + 1; x++) px(f, x, cy + 1, 4); // pale belly
  px(f, cx, cy - 2, fin);                        // top fin
  // tail behind (opposite dir), flapping
  const tx = cx - dir * 3;
  px(f, tx, cy, fin);
  px(f, tx - dir, cy - 1 + flap, fin);
  px(f, tx - dir, cy + 1 - flap, fin);
  // eye near the front
  px(f, cx + dir * 2, cy - 1, 5);
}
/** Bubbles rising in columns (each with its own phase & speed). */
function bubbles(f: Frame, cols: [number, number][], t: number, speed: number) {
  for (const [x, ph] of cols) {
    const y = 13 - ((ph + t * speed) % 13);
    px(f, x + (Math.floor(y / 2) % 2), y, 7);
  }
}

// ---------- scenes ----------
function calm(t: number): Frame {   // 🐟 happy — leisurely to-and-fro
  const f = blank(); tank(f, t);
  weeds(f, t);
  // swim across: position follows a slow triangle, direction flips at the ends
  const path = [8, 12, 16, 20, 16, 12];
  const cx = path[t], dir = t < 3 ? 1 : -1;
  fish(f, cx, 6, dir, 2, 3, t % 2);
  bubbles(f, [[6, 0], [22, 4], [14, 8]], t, 1);
  return f;
}
function sink(t: number): Frame {   // 🐟 worried — fish descends (falling)
  const f = blank(); tank(f, t);
  weeds(f, t);
  const cy = 4 + t;                 // sinks from y4 to y9
  fish(f, 16, Math.min(11, cy), -1, 2, 3, t % 2);
  bubbles(f, [[10, 2], [20, 5]], t, 1);
  return f;
}
function alarmLow(t: number): Frame { // 🐟 panic — red fish darting at the bottom
  const f = blank(); tank(f, t);
  weeds(f, t);
  const jitter = [0, 3, -2, 4, -3, 1][t];
  const dir = t % 2 ? 1 : -1;
  fish(f, 16 + jitter, 11, dir, 6, 15, t % 2); // alarm colours, low in the tank
  bubbles(f, [[8, 0], [13, 1], [18, 2], [23, 3], [16, 4]], t, 2); // frantic bubbles
  return f;
}
function rise(t: number): Frame {   // 🐟 queasy — fish climbs toward the surface
  const f = blank(); tank(f, t);
  weeds(f, t);
  const cy = 11 - t;                // rises from y11 to y6
  fish(f, 16, Math.max(4, cy), 1, 2, 3, t % 2);
  bubbles(f, [[9, 0], [15, 2], [21, 4], [12, 6]], t, 2);
  return f;
}
function overheat(t: number): Frame { // 🐟 sick — murky warm tank, fish gasps up top
  const f = blank(); tank(f, t, 0, true);
  weeds(f, t);
  const gasp = t % 2;               // bobbing at the surface
  fish(f, 15 + [0, 1, -1, 2, 0, 1][t], 3 + gasp, 1, 6, 15, t % 2);
  // lots of bubbles from an over-aerated warm tank
  bubbles(f, [[6, 0], [10, 2], [14, 1], [18, 3], [22, 2], [26, 4], [16, 5]], t, 2);
  return f;
}
function asleep(t: number): Frame { // 🌙 sleep — dark tank, fish resting on the sand
  const f = blank(); tank(f, t);
  weeds(f, t, false);
  fish(f, 15, 12, -1, 2, 3, 0);     // still, on the bottom
  px(f, 17, 11, 5);                  // (closed-ish eye already drawn; keep calm)
  if (t % 3 === 0) px(f, 9, 13 - (t % 4), 7); // one lazy bubble now and then
  // a faint moon glow through the surface
  for (let x = 20; x <= 24; x++) if (t % 4 < 2) px(f, x, 0, 12);
  return f;
}

const DELAY: Record<string, number> = {
  happy: 200, worried: 200, panic: 110, queasy: 150, sick: 130, sleep: 300,
};
const SCENES: Record<string, (t: number) => Frame> = {
  happy: calm, worried: sink, panic: alarmLow, queasy: rise, sick: overheat, sleep: asleep,
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

const name = `aqua${DARK ? "-dark" : ""}`;
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
