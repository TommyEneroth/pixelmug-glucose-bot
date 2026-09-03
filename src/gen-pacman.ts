/**
 * gen-pacman.ts — Pac-Man face pack. A chomping yellow disc eating pellets;
 * a ghost turns up when things go low.
 *   bun run gen-pacman   ->  packs/pacman/*.gif  + docs/pacman_*.gif
 */
import { GIFEncoder } from "gifenc";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const W = 32, H = 16;
// 0 bg=LIGHT,1 yellow,2 yellow-shade,3 black,4 white,5 red,6 blue,7 green,8 green-shade,9 pellet
const PALETTE: [number, number, number][] = [
  [232, 229, 222], [255, 214, 60], [226, 182, 30], [20, 18, 10], [250, 250, 250],
  [220, 50, 50], [70, 150, 240], [150, 205, 120], [110, 166, 86], [92, 86, 98],
];
// THEME=dark -> dark background (black mug); glowing disc, light pellets, no outline.
const DARK = process.env.THEME === "dark";
if (DARK) { PALETTE[0] = [10, 10, 14]; PALETTE[9] = [232, 232, 238]; }
const CH: Record<string, number> = { B: 3, W: 4, R: 5, V: 6, P: 3, o: 9 };
const blank = () => new Uint8Array(W * H).fill(0);

const CX = 8, CY = 8, R = 7;

/** Draw the Pac-Man disc with a wedge mouth of half-angle `mouth` degrees. */
function pac(f: Uint8Array, green: boolean, mouth: number, dx = 0) {
  const base = green ? 7 : 1, shade = green ? 8 : 2;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const sx = x - dx - CX, sy = y - CY;
      if (sx * sx + sy * sy > R * R + 0.5) continue;
      const ang = Math.abs((Math.atan2(sy, sx) * 180) / Math.PI); // 0 = facing right
      if (ang <= mouth) continue; // carve the mouth wedge
      f[y * W + x] = y >= CY + 3 ? shade : base;
    }
  if (!DARK) { // outline only needed on the light ceramic
    const out: number[] = [];
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (f[y * W + x] !== 0) continue;
        const b = (xx: number, yy: number) => xx >= 0 && xx < W && yy >= 0 && yy < H && (f[yy * W + xx] === base || f[yy * W + xx] === shade)
        if (b(x - 1, y) || b(x + 1, y) || b(x, y - 1) || b(x, y + 1)) out.push(y * W + x)
      }
    for (const i of out) f[i] = 3
  }
}
function stamp(f: Uint8Array, x: number, y: number, s: string[], dx = 0) {
  for (let r = 0; r < s.length; r++) for (let c = 0; c < s[r].length; c++) {
    const ch = s[r][c]; if (ch === "." || ch === " ") continue;
    const idx = CH[ch]; if (idx === undefined) continue;
    const px = x + c + dx, py = y + r;
    if (px >= 0 && px < W && py >= 0 && py < H) f[py * W + px] = idx;
  }
}

const EYE = ["BB"];
const EYE_WIDE = ["WW", "BB"];
const EYE_X = ["B.B", ".B.", "B.B"];
const PELLET = ["oo", "oo"]; // dark pellet (white would vanish on the light ceramic)
const GHOST = [
  "..RRRR..", ".RRRRRR.", "RWWRRWWR", "RWBRRWBR", "RRRRRRRR", "RRRRRRRR", "R.RR.RR.",
];
const SWEAT = ["V", "V"];

type Expr = "happy" | "worried" | "panic" | "queasy" | "sick" | "sleep";
// eye sits forward (toward the mouth) and near the top, like the arcade sprite
const eye = (f: Uint8Array, s: string[], dx = 0) => stamp(f, CX + 1, CY - 5, s, dx);
const pellets = (f: Uint8Array, xs: number[]) => xs.forEach((x) => stamp(f, x, CY - 1, PELLET));

function frames(expr: Expr): Uint8Array[] {
  if (expr === "happy") {
    const a = blank(); pac(a, false, 40); eye(a, EYE); pellets(a, [19, 24, 29]);
    const b = blank(); pac(b, false, 6); eye(b, EYE); pellets(b, [19, 24, 29]);
    const c = blank(); pac(c, false, 40); eye(c, EYE); pellets(c, [24, 29]); // pellet eaten
    return [a, b, c, b];
  }
  if (expr === "worried") {
    const mk = (m: number, sy: number) => { const f = blank(); pac(f, false, m); eye(f, EYE_WIDE); pellets(f, [24, 29]); stamp(f, 30, sy, SWEAT); return f; };
    return [mk(38, 3), mk(8, 6)];
  }
  if (expr === "panic") {
    const mk = (dx: number, m: number, gx: number, sy: number) => {
      const f = blank(); pac(f, false, m, dx); eye(f, EYE_WIDE, dx);
      stamp(f, gx, 5, GHOST); stamp(f, 2, sy, SWEAT); return f; // ghost closing in
    };
    return [mk(0, 46, 24, 4), mk(1, 30, 22, 7)];
  }
  if (expr === "queasy") {
    const mk = (m: number) => { const f = blank(); pac(f, true, m); eye(f, EYE); return f; };
    return [mk(34), mk(10)];
  }
  if (expr === "sick") {
    const mk = (dx: number) => { const f = blank(); pac(f, true, 44, dx); eye(f, EYE_X, dx); return f; };
    return [mk(0), mk(1)];
  }
  // sleep — full disc (mouth shut), closed eye, snore bubble
  const a = blank(); pac(a, false, 0); eye(a, ["BB"]); stamp(a, 22, 3, ["V"]);
  const b = blank(); pac(b, false, 3); eye(b, ["BB"]); stamp(b, 23, 2, ["V"]);
  return [a, b, a];
}

function upscale(f: Uint8Array, s: number): Uint8Array {
  const o = new Uint8Array(W * s * H * s);
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) { const v = f[r * W + c]; for (let dr = 0; dr < s; dr++) for (let dc = 0; dc < s; dc++) o[(r * s + dr) * (W * s) + (c * s + dc)] = v; }
  return o;
}
function encode(fr: Uint8Array[], scale: number, delay = 250): Uint8Array {
  const g = GIFEncoder();
  fr.forEach((f, i) => g.writeFrame(scale === 1 ? f : upscale(f, scale), W * scale, H * scale, { palette: PALETTE, delay, repeat: 0, first: i === 0 }));
  g.finish(); return g.bytes();
}

const EXPRS: Expr[] = ["happy", "worried", "panic", "queasy", "sick", "sleep"];
const name = `pacman${DARK ? "-dark" : ""}`;
const dir = join(import.meta.dir, "..", "packs", name);
mkdirSync(dir, { recursive: true });
for (const e of EXPRS) {
  writeFileSync(join(dir, `${e}.gif`), encode(frames(e), 1));
  writeFileSync(join(import.meta.dir, "..", "docs", `${name}_${e}.gif`), encode(frames(e), 10));
  console.log("wrote", `packs/${name}/${e}.gif`);
}
console.log(`\nUse it:  FACE_PACK=packs/${name} bun run bot`);
