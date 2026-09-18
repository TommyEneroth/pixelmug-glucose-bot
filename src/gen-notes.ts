/**
 * gen-notes.ts — a showpiece GIF for the mug: colourful notes dancing on a music
 * staff that scrolls past a treble clef, barlines rolling by, each note bobbing to
 * its own beat. Seamless loop. Built dark for the black S1 Pro.
 *
 *   bun run src/gen-notes.ts  ->  packs/extras/notes.gif (32x16) + docs/notes.gif (10x)
 */
import { GIFEncoder } from "gifenc";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const W = 32, H = 16;
const N = 24;          // frames
const P = 48;          // pattern width (scrolls one P per loop -> seamless)
const LINES = [2, 5, 8, 11, 14]; // five staff lines

// 0 bg 1 staff 2 barline 3 white 4 blue 5 stem 6 clef 7 clefDim 8 pink 9 green 10 spark 11 amber
const PALETTE: [number, number, number][] = [
  [8, 8, 16], [72, 82, 112], [40, 46, 70], [236, 240, 255], [120, 200, 255],
  [176, 196, 236], [255, 186, 74], [206, 132, 42], [244, 120, 184], [120, 222, 150],
  [255, 255, 255], [255, 200, 90], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0],
];

type Frame = Uint8Array;
const blank = () => new Uint8Array(W * H).fill(0);
function px(f: Frame, x: number, y: number, c: number) {
  x = Math.round(x); y = Math.round(y);
  if (x >= 0 && x < W && y >= 0 && y < H) f[y * W + x] = c;
}
function vline(f: Frame, x: number, y0: number, y1: number, c: number) {
  for (let y = y0; y <= y1; y++) px(f, x, y, c);
}

// the melody: pattern-x, pitch (staff y), colour; beamed in consecutive pairs
const NOTES: { x: number; y: number; c: number }[] = [
  { x: 8, y: 11, c: 3 }, { x: 14, y: 8, c: 4 },
  { x: 20, y: 6, c: 8 }, { x: 26, y: 8, c: 9 },
  { x: 32, y: 5, c: 3 }, { x: 38, y: 8, c: 4 },
  { x: 44, y: 11, c: 8 }, { x: 50, y: 9, c: 9 },
];

function bassClef(f: Frame) {
  // a compact stylised bass (F) clef — the cello's clef — with the head on the
  // F line (2nd from the top, y=5) and the two dots straddling it.
  const g = 6;
  // filled head/curl top-left
  px(f, 2, 3, g); px(f, 3, 3, g); px(f, 4, 3, g);
  px(f, 1, 4, g); px(f, 2, 4, g); px(f, 4, 4, g); px(f, 5, 4, g);
  px(f, 2, 5, g); px(f, 5, 5, g);           // curl opening
  px(f, 2, 6, g); px(f, 4, 6, g);
  // tail sweeping down to the left
  px(f, 3, 7, g); px(f, 2, 8, g); px(f, 2, 9, g); px(f, 1, 10, g);
  // the two F-clef dots to the right, straddling the F line (y=5)
  px(f, 7, 4, 11); px(f, 7, 6, 11);
}

function noteHead(f: Frame, cx: number, cy: number, c: number) {
  px(f, cx - 1, cy, c); px(f, cx, cy, c); px(f, cx + 1, cy, c);
  px(f, cx - 1, cy - 1, c); px(f, cx, cy - 1, c);
  px(f, cx + 1, cy, 4); // tiny blue glint on the head
}

function frame(t: number): Frame {
  const f = blank(); f.fill(0);
  // staff lines (full width)
  for (const y of LINES) for (let x = 0; x < W; x++) px(f, x, y, 1);
  const off = (P * t) / N;

  // rolling barlines (every 24 of pattern)
  for (const bx of [0, 24, 48, 72]) {
    const x = bx - off;
    if (x > 5 && x < W) vline(f, x, LINES[0], LINES[4], 2);
    const x2 = x + P;
    if (x2 > 5 && x2 < W) vline(f, x2, LINES[0], LINES[4], 2);
  }

  // dancing notes (two copies P apart for the seamless wrap)
  NOTES.forEach((n, i) => {
    for (const shift of [0, P]) {
      const cx = n.x - off + shift;
      if (cx < 4 || cx > W + 2) continue;
      const bob = Math.round(Math.sin((2 * Math.PI * t) / N + i * 0.8) * 1.4);
      const cy = n.y + bob;
      // stem up + beam to the paired neighbour
      const stemX = cx + 1, topY = cy - 5;
      vline(f, stemX, topY, cy - 1, 5);
      if (i % 2 === 0) {
        const m = NOTES[i + 1];
        const mcx = m.x - off + shift;
        const mbob = Math.round(Math.sin((2 * Math.PI * t) / N + (i + 1) * 0.8) * 1.4);
        const mtop = m.y + mbob - 5;
        // beam line between the two stem tops
        const x0 = Math.min(stemX, mcx + 1), x1 = Math.max(stemX, mcx + 1);
        for (let x = x0; x <= x1; x++) { px(f, x, topY, n.c); px(f, x, topY + 1, n.c); }
        void mtop;
      }
      noteHead(f, cx, cy, n.c);
      // sparkle above a note now and then
      if ((i + t) % 5 === 0) px(f, cx, topY - 1, 10);
    }
  });

  bassClef(f);
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
writeFileSync(join(dir, "notes.gif"), encode(frames, 1, 90));
writeFileSync(join(import.meta.dir, "..", "docs", "notes.gif"), encode(frames, 10, 90));
console.log("wrote packs/extras/notes.gif + docs/notes.gif");
