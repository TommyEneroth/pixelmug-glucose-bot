/**
 * gen-fire.ts — "Lägereld": the flame IS your glucose. Ambient, no numbers.
 * A calm campfire breathes in range; it sinks to glowing embers when you're low
 * and roars into a wild blaze when you're high. Same 6 expression keys as the
 * face packs, so it plugs straight into the app's pack selector & previews.
 *
 *   bun run gen-fire            ->  packs/fire/*.gif        (P1, on light ceramic)
 *   THEME=dark bun run gen-fire ->  packs/fire-dark/*.gif   (S1 Pro, glows on black)
 *
 *   happy   = 🔥 calm campfire        (in range)
 *   worried = 🔥 flame shrinks, dims  (falling — snart lågt)
 *   panic   = 🌡️ dying embers + smoke (acute low)
 *   queasy  = 🔥 flame grows, oranger (rising — snart högt)
 *   sick    = 🔥🔥 roaring blaze+sparks(acute high)
 *   sleep   = 🪵 cold hearth, last glow(stale / no data)
 *
 * Six frames each, with real flicker. Original pixel art.
 */
import { GIFEncoder } from "gifenc";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const W = 32, H = 16;
const DARK = process.env.THEME === "dark";

// 0 bg 1 outline 2 emberDark 3 red 4 orange 5 amber 6 yellow 7 core
// 8 logBrown 9 logDark 10 emberGlow 11 smoke 12 smokeDark 13 spark 14 ash 15 groundGlow
const PALETTE: [number, number, number][] = [
  [232, 229, 222], [22, 22, 26], [120, 20, 10], [214, 44, 30],
  [246, 120, 24], [255, 170, 40], [255, 214, 70], [255, 248, 200],
  [128, 78, 42], [82, 48, 26], [255, 120, 42], [156, 156, 168],
  [96, 96, 108], [255, 232, 120], [72, 62, 62], [70, 30, 14],
];
if (DARK) PALETTE[0] = [10, 10, 14]; // on the black S1 Pro the fire glows

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

/** A flickering teardrop flame layer: wide at the base, swaying tip. */
function teardrop(f: Frame, cx: number, baseY: number, h: number, w: number, c: number, phase: number, sway: number) {
  for (let yy = 0; yy <= h; yy++) {
    const level = yy / h;                 // 0 base .. 1 tip
    const bulge = 1 + 0.55 * Math.sin(level * Math.PI);
    const halfw = w * (1 - level) * bulge;
    if (halfw < 0.2 && level < 0.98) continue;
    const cxr = cx + Math.sin(level * 2.4 + phase) * sway * level;
    const y = baseY - yy;
    for (let x = Math.round(cxr - halfw); x <= Math.round(cxr + halfw); x++) px(f, x, y, c);
  }
}
/** A full flame = four nested teardrops, red→core, each swaying a touch differently. */
function flame(f: Frame, cx: number, baseY: number, h: number, w: number, t: number, hot = true) {
  const s = 0.9 + h * 0.06;
  teardrop(f, cx, baseY, h, w, 3, t * 0.9, s);            // red shell
  teardrop(f, cx, baseY, h - 1, w * 0.66, 4, t * 1.05, s * 1.1); // orange
  teardrop(f, cx, baseY, h - 2, w * 0.44, hot ? 6 : 5, t * 1.2, s * 1.25); // yellow/amber
  if (hot) teardrop(f, cx, baseY - 0, Math.max(2, h * 0.5), w * 0.24, 7, t * 1.35, s * 1.35); // white core
}
/** Two crossed logs with a few glowing embers on top. */
function logs(f: Frame, t: number, embers = true) {
  rect(f, 3, 14, 28, 15, 8);
  rect(f, 3, 15, 28, 15, 9);
  // log ends + grain
  for (let x = 4; x <= 27; x += 5) px(f, x, 14, 9);
  px(f, 3, 14, 9); px(f, 28, 14, 9);
  if (embers) for (const [x, ph] of [[8, 0], [13, 2], [18, 1], [23, 3]] as const)
    if ((t + ph) % 4 !== 0) px(f, x, 13, 10);
}
/** Warm glow pool cast on the ground/dark screen (dark theme only). */
function groundGlow(f: Frame, x0: number, x1: number) {
  if (!DARK) return;
  for (let x = x0; x <= x1; x++) { if (f[12 * W + x] === 0) f[12 * W + x] = 15; if (f[13 * W + x] === 0) f[13 * W + x] = 15; }
}
/** A curl of smoke rising, swaying with height. */
function smoke(f: Frame, cx: number, topY: number, t: number, thick = false) {
  for (let y = 12; y >= topY; y--) {
    const x = cx + Math.round(Math.sin((13 - y) * 0.7 + t * 0.8) * 2);
    const c = y < topY + 3 ? 12 : 11;
    px(f, x, y, c); if (thick) px(f, x + 1, y, 12);
  }
}
/** Sparks flying upward (deterministic drift). */
function sparks(f: Frame, t: number, n: number) {
  for (let i = 0; i < n; i++) {
    const seed = i * 5 + 1;
    const x = ((seed * 3) % W) + Math.round(Math.sin(i + t) * 2);
    const y = 11 - ((seed + t * 3) % 11);
    px(f, x, y, i % 2 ? 13 : 5);
  }
}

// ---------- scenes ----------
const FL = [0, 1, 0, 2, 1, 0]; // per-frame flame-height flicker

function calm(t: number): Frame {   // 🔥 happy — steady campfire
  const f = blank(); fill(f, 0);
  groundGlow(f, 8, 24);
  flame(f, 16, 13, 7 + FL[t], 4, t, true);
  logs(f, t, true);
  return f;
}
function shrink(t: number): Frame { // 🔥 worried — smaller, dimmer flame (falling)
  const f = blank(); fill(f, 0);
  groundGlow(f, 11, 21);
  flame(f, 16, 13, 4 + (FL[t] > 0 ? 1 : 0), 3, t, false); // amber-topped, no white core
  smoke(f, 17, 6, t);
  logs(f, t, true);
  return f;
}
function embers(t: number): Frame { // 🌡️ panic — nearly out, just glowing coals + smoke
  const f = blank(); fill(f, 0);
  groundGlow(f, 12, 20);
  // a stub of low flame that gutters
  if (t % 2 === 0) { px(f, 16, 13, 5); px(f, 16, 12, 4); px(f, 15, 13, 3); px(f, 17, 13, 3); }
  smoke(f, 16, 3, t, true);
  logs(f, t, false);
  // pulsing coals
  for (const [x, ph] of [[7, 0], [11, 1], [15, 2], [19, 3], [23, 1], [26, 2]] as const) {
    const on = (t + ph) % 3;
    px(f, x, 13, on === 0 ? 10 : on === 1 ? 3 : 2);
  }
  return f;
}
function grow(t: number): Frame {   // 🔥 queasy — taller, oranger flame (rising)
  const f = blank(); fill(f, 0);
  groundGlow(f, 7, 25);
  flame(f, 16, 13, 9 + FL[t], 5, t, true);
  if (t % 3 === 0) sparks(f, t, 2);
  logs(f, t, true);
  return f;
}
function blaze(t: number): Frame {  // 🔥🔥 sick — roaring inferno + sparks
  const f = blank(); fill(f, 0);
  groundGlow(f, 3, 29);
  // three overlapping flames filling the canvas
  flame(f, 16, 14, 13 + FL[t], 6, t, true);
  flame(f, 9, 14, 8 + FL[(t + 2) % 6], 4, t * 1.3, true);
  flame(f, 23, 14, 9 + FL[(t + 4) % 6], 4, t * 0.8, true);
  sparks(f, t, 6);
  logs(f, t, true);
  return f;
}
function cold(t: number): Frame {   // 🪵 sleep — cold hearth, one last ember, thin smoke
  const f = blank(); fill(f, 0);
  logs(f, t, false);
  // a single faint ember that barely pulses
  if (t % 3 !== 2) px(f, 16, 13, t % 3 === 0 ? 10 : 2);
  smoke(f, 16, 6, t);
  return f;
}

const DELAY: Record<string, number> = {
  happy: 120, worried: 140, panic: 200, queasy: 110, sick: 90, sleep: 260,
};
const SCENES: Record<string, (t: number) => Frame> = {
  happy: calm, worried: shrink, panic: embers, queasy: grow, sick: blaze, sleep: cold,
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

const name = `fire${DARK ? "-dark" : ""}`;
const dir = join(import.meta.dir, "..", "packs", name);
mkdirSync(dir, { recursive: true });
for (const e of Object.keys(SCENES)) {
  const frames = Array.from({ length: FRAMES }, (_, t) => SCENES[e](t));
  const d = DELAY[e] ?? 120;
  writeFileSync(join(dir, `${e}.gif`), encode(frames, 1, d));
  writeFileSync(join(import.meta.dir, "..", "docs", `${name}_${e}.gif`), encode(frames, 10, d));
  console.log("wrote", `packs/${name}/${e}.gif`);
}
console.log(`\nUse it:  FACE_PACK=packs/${name} bun run bot`);
