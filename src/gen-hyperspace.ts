/**
 * gen-hyperspace.ts — a one-off showpiece GIF for the mug: the jump to lightspeed
 * seen from inside the Millennium Falcon's cockpit. Stars streak radially out from
 * the vanishing point into blue-white lines, framed by a hint of the cockpit
 * window and a row of blinking console lights along the dash.
 *
 *   bun run src/gen-hyperspace.ts   ->  packs/extras/hyperspace.gif (32x16)
 *                                       docs/hyperspace.gif (10x preview)
 * Built for the black S1 Pro (glows on the dark screen).
 */
import { GIFEncoder } from "gifenc";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const W = 32, H = 16;
const CX = 15.5, CY = 7.5;      // vanishing point (screen centre)
const N = 14;                    // frames

// 0 space 1 white 2 blueWhite 3 blue 4 dimBlue 5 core 6 frame 7 frameEdge
// 8 conRed 9 conGreen 10 conAmber 11 faint 12 conBlue
const PALETTE: [number, number, number][] = [
  [6, 6, 14], [255, 255, 255], [206, 224, 255], [120, 170, 255], [60, 90, 170],
  [235, 244, 255], [12, 13, 22], [44, 48, 72], [230, 60, 50], [60, 210, 110],
  [255, 180, 60], [26, 34, 70], [90, 150, 255], [0, 0, 0], [0, 0, 0], [0, 0, 0],
];

type Frame = Uint8Array;
const blank = () => new Uint8Array(W * H).fill(0);
function px(f: Frame, x: number, y: number, c: number) {
  x = Math.round(x); y = Math.round(y);
  if (x >= 0 && x < W && y >= 0 && y < H) f[y * W + x] = c;
}

// star lanes: an angle + a loop phase, spread with the golden angle
const STARS = Array.from({ length: 34 }, (_, i) => ({
  ang: (i * 137.508 * Math.PI) / 180,
  ph: i / 34,
}));

// radius as a function of progress — accelerating outward (the warp)
const reach = (p: number) => 26 * Math.pow(Math.max(0, p), 1.8);

function streak(f: Frame, ang: number, prog: number) {
  const r1 = reach(prog);
  const r0 = reach(prog - 0.14);
  const ca = Math.cos(ang), sa = Math.sin(ang) * 0.5; // squash Y for the 2:1 screen
  const steps = Math.max(1, Math.round(r1 - r0));
  for (let s = 0; s <= steps; s++) {
    const r = r0 + ((r1 - r0) * s) / steps;
    const frac = s / steps;                 // 0 tail .. 1 leading tip
    const col = frac > 0.8 ? 1 : frac > 0.5 ? 2 : frac > 0.25 ? 3 : 4;
    px(f, CX + ca * r, CY + sa * r, col);
  }
}

function cockpit(f: Frame, t: number) {
  // rounded viewport: darken the four corners so it reads as a window
  const corners = [[0, 0], [1, 0], [0, 1], [W - 1, 0], [W - 2, 0], [W - 1, 1],
  [0, H - 1], [1, H - 1], [0, H - 2], [W - 1, H - 1], [W - 2, H - 1], [W - 1, H - 2]];
  for (const [x, y] of corners) px(f, x, y, 6);
  // thin frame edge top & the window mullion hints at the sides
  for (let x = 3; x < W - 3; x++) if (x % 6 !== 0) px(f, x, 0, 6);
  px(f, 0, 7, 7); px(f, 0, 8, 7); px(f, W - 1, 7, 7); px(f, W - 1, 8, 7);
  // dashboard: dark strip + blinking console lights along the bottom row
  for (let x = 0; x < W; x++) px(f, x, H - 1, 6);
  const lights: [number, number][] = [[3, 8], [6, 9], [9, 10], [12, 12], [19, 9], [22, 10], [25, 8], [28, 12]];
  lights.forEach(([x, c], i) => { if ((t + i) % 3 !== 0) px(f, x, H - 1, c); });
}

function frame(t: number): Frame {
  const f = blank(); f.fill(0);
  for (const st of STARS) {
    const prog = (st.ph + t / N) % 1;
    if (prog < 0.03) continue; // just born at the centre
    streak(f, st.ang, prog);
  }
  // bright vanishing-point core, gently pulsing
  const pulse = t % 4 < 2;
  px(f, CX, CY, 5); px(f, CX + 1, CY, 5); px(f, CX, CY + 1, 5); px(f, CX + 1, CY + 1, 5);
  if (pulse) { px(f, CX, CY, 1); px(f, CX + 1, CY + 1, 1); }
  cockpit(f, t);
  return f;
}

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

const frames = Array.from({ length: N }, (_, t) => frame(t));
const dir = join(import.meta.dir, "..", "packs", "extras");
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "hyperspace.gif"), encode(frames, 1, 70));
writeFileSync(join(import.meta.dir, "..", "docs", "hyperspace.gif"), encode(frames, 10, 70));
console.log("wrote packs/extras/hyperspace.gif  +  docs/hyperspace.gif");
