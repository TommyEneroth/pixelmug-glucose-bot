/**
 * gen-mumin.ts — a Moomin variety pack: a different Tove Jansson character per
 * mood, each drawn for the mug's LIGHT ceramic background (dark outline).
 *   bun run gen-mumin   ->  packs/mumin/*.gif  + docs/mumin_*.gif
 *
 *   happy=Moomintroll  worried=Sniff  panic=Little My
 *   queasy=Hemulen     sick=The Groke  sleep=Snufkin
 *
 * Original pixel art — a playful homage, not the real characters.
 */
import { GIFEncoder } from "gifenc";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const W = 32, H = 16;
// 0 bg,1 outline,2 white,3 whiteShade,4 red,5 redDark,6 brown,7 brownDark,
// 8 green,9 greenDark,10 grokeBlue,11 grokePale,12 tan,13 pink,14 gold,15 hatBlue
const PALETTE: [number, number, number][] = [
  [232, 229, 222], [22, 22, 26], [248, 248, 248], [212, 212, 216],
  [206, 66, 66], [150, 40, 40], [156, 108, 66], [112, 76, 46],
  [96, 162, 84], [58, 118, 56], [120, 122, 162], [176, 178, 210],
  [236, 206, 160], [226, 150, 162], [236, 200, 84], [96, 116, 176],
];
// THEME=dark -> dark background (black mug); characters glow, no outline.
const DARK = process.env.THEME === "dark";
if (DARK) PALETTE[0] = [10, 10, 14];
const blank = () => new Uint8Array(W * H).fill(0);

function ellipse(f: Uint8Array, cx: number, cy: number, rx: number, ry: number, c: number) {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
    if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) f[y * W + x] = c;
}
function rect(f: Uint8Array, x0: number, y0: number, x1: number, y1: number, c: number) {
  for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++)
    for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) f[y * W + x] = c;
}
function px(f: Uint8Array, x: number, y: number, c: number) {
  if (x >= 0 && x < W && y >= 0 && y < H) f[y * W + x] = c;
}
/** black outline around the whole silhouette (so it reads on light ceramic). */
function outline(f: Uint8Array) {
  if (DARK) return; // on the black mug the characters glow; no outline needed
  const add: number[] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (f[y * W + x] !== 0) continue;
    const nb = (xx: number, yy: number) => xx >= 0 && xx < W && yy >= 0 && yy < H && f[yy * W + xx] !== 0 && f[yy * W + xx] !== 1;
    if (nb(x - 1, y) || nb(x + 1, y) || nb(x, y - 1) || nb(x, y + 1)) add.push(y * W + x);
  }
  for (const i of add) f[i] = 1;
}

// ---- characters (each returns frames) ----
type Frame = Uint8Array;

function moomin(blink: boolean): Frame { // white troll with a big snout
  const f = blank();
  ellipse(f, 16, 7, 8, 5, 2);        // head
  ellipse(f, 16, 11, 6.5, 4, 2);     // big round snout
  ellipse(f, 10, 3, 2, 2, 2); ellipse(f, 22, 3, 2, 2, 2); // ears
  // eyes
  if (blink) { rect(f, 12, 7, 14, 7, 1); rect(f, 18, 7, 20, 7, 1); }
  else { rect(f, 12, 6, 13, 8, 1); rect(f, 19, 6, 20, 8, 1); }
  px(f, 14, 11, 1); px(f, 18, 11, 1); // nostrils
  rect(f, 14, 13, 18, 13, 1);         // smile
  outline(f);
  return f;
}

function sniff(sweat: number): Frame { // small worried creature, big ears + snout
  const f = blank();
  rect(f, 9, 1, 11, 6, 6); rect(f, 21, 1, 23, 6, 6);   // tall ears
  ellipse(f, 16, 9, 6, 5, 6);         // head
  ellipse(f, 20, 11, 4, 2.6, 12);     // snout (tan)
  rect(f, 13, 7, 14, 8, 1); rect(f, 18, 7, 19, 8, 1);  // wide worried eyes
  px(f, 22, 11, 1);                   // nose
  rect(f, 13, 12, 16, 12, 1);         // small frown
  rect(f, 26, sweat, 26, sweat + 1, 15); // sweat drop (blue-ish gold? use gold->change)
  outline(f);
  return f;
}

function littlemy(dx: number): Frame { // tiny, huge round hair bun
  const f = blank();
  ellipse(f, 16, 5 + 0, 5, 4.5, 5);   // big hair bun (dark red)
  ellipse(f, 16, 5, 4, 3.5, 4);       // bun highlight
  ellipse(f, 16, 10, 2.6, 2, 12);     // face
  // angry eyes
  px(f, 15, 10, 1); px(f, 17, 10, 1);
  rect(f, 15, 12, 17, 12, 1);         // straight mouth
  // triangular red dress
  for (let y = 12; y <= 15; y++) rect(f, 16 - (y - 11), y, 16 + (y - 11), y, 4);
  outline(f);
  return f;
}

function hemulen(blink: boolean): Frame { // tall, long nose, wide hat
  const f = blank();
  rect(f, 7, 2, 25, 3, 15); rect(f, 12, 0, 20, 2, 15); // wide hat + crown
  ellipse(f, 16, 8, 5, 5, 12);        // face (tan)
  ellipse(f, 16, 12, 3, 3.5, 12);     // long nose pointing down
  if (blink) { rect(f, 13, 7, 14, 7, 1); rect(f, 18, 7, 19, 7, 1); }
  else { rect(f, 13, 6, 14, 8, 1); rect(f, 18, 6, 19, 8, 1); }
  rect(f, 13, 14, 15, 14, 1);         // glum mouth
  outline(f);
  return f;
}

function groke(dx: number): Frame { // cold blue-grey mound, big eyes, teeth
  const f = blank();
  ellipse(f, 16, 11, 10, 5, 10);      // wide bell base
  ellipse(f, 16, 6, 6, 5, 10);        // top
  // big glowing eyes
  ellipse(f, 12 + dx, 6, 2.2, 2.2, 11); ellipse(f, 20 + dx, 6, 2.2, 2.2, 11);
  px(f, 12 + dx, 6, 1); px(f, 20 + dx, 6, 1);
  // cold toothy grin
  rect(f, 11, 10, 21, 11, 2);
  for (let x = 11; x <= 21; x += 2) px(f, x, 11, 10);
  outline(f);
  return f;
}

function snufkin(blink: boolean): Frame { // green pointed hat, calm face
  const f = blank();
  // floppy pointed green hat
  for (let y = 0; y <= 5; y++) rect(f, 16 - (6 - y), y, 16 + (6 - y), y, 8);
  rect(f, 9, 5, 23, 6, 8);            // brim
  ellipse(f, 16, 10, 5, 4, 12);       // face
  rect(f, 10, 13, 22, 15, 6);         // brown collar
  // calm closed eyes
  rect(f, 13, 9, 14, 9, 1); rect(f, 18, 9, 19, 9, 1);
  rect(f, 15, 11, 17, 11, 1);         // small mouth
  outline(f);
  return f;
}

const CHARS: Record<string, (t: number) => Frame> = {
  happy: (t) => moomin(t === 1),
  worried: (t) => sniff(6 + t * 2),
  panic: (t) => littlemy(t),
  queasy: (t) => hemulen(t === 1),
  sick: (t) => groke(t),
  sleep: (t) => snufkin(t === 1),
};

function upscale(f: Uint8Array, s: number): Uint8Array {
  const o = new Uint8Array(W * s * H * s);
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) { const v = f[r * W + c]; for (let dr = 0; dr < s; dr++) for (let dc = 0; dc < s; dc++) o[(r * s + dr) * (W * s) + (c * s + dc)] = v; }
  return o;
}
function encode(frames: Frame[], scale: number, delay = 320): Uint8Array {
  const g = GIFEncoder();
  frames.forEach((f, i) => g.writeFrame(scale === 1 ? f : upscale(f, scale), W * scale, H * scale, { palette: PALETTE, delay, repeat: 0, first: i === 0 }));
  g.finish(); return g.bytes();
}

const EXPRS = ["happy", "worried", "panic", "queasy", "sick", "sleep"];
const name = `mumin${DARK ? "-dark" : ""}`;
const dir = join(import.meta.dir, "..", "packs", name);
mkdirSync(dir, { recursive: true });
for (const e of EXPRS) {
  const frames = [CHARS[e](0), CHARS[e](1)];
  writeFileSync(join(dir, `${e}.gif`), encode(frames, 1));
  writeFileSync(join(import.meta.dir, "..", "docs", `${name}_${e}.gif`), encode(frames, 10));
  console.log("wrote", `packs/${name}/${e}.gif`);
}
console.log(`\nUse it:  FACE_PACK=packs/${name} bun run bot`);
