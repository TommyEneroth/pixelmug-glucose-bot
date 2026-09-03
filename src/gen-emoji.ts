/**
 * gen-emoji.ts — classic round emoji face pack (colour reinforces the level).
 *   bun run gen-emoji   ->  packs/emoji/*.gif  + docs/emoji_*.gif
 */
import { GIFEncoder } from "gifenc";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const W = 32, H = 16;
// 0 bg=LIGHT ceramic,1 yellow,2 yellow-shade,3 black,4 red,5 white,6 blue,7 green,8 green-shade,9 pink
const PALETTE: [number, number, number][] = [
  [232, 229, 222], [255, 205, 50], [226, 170, 28], [26, 22, 12], [210, 50, 50],
  [250, 250, 250], [70, 150, 240], [150, 205, 120], [110, 166, 86], [236, 120, 120],
];
// THEME=dark -> dark background (black mug); figures glow, no dark outline.
const DARK = process.env.THEME === "dark";
if (DARK) PALETTE[0] = [10, 10, 14];
const CH: Record<string, number> = { B: 3, W: 5, P: 3, R: 4, V: 6, C: 9 };
const blank = () => new Uint8Array(W * H).fill(0);

function head(green = false, dx = 0): Uint8Array {
  const f = blank();
  const base = green ? 7 : 1, shade = green ? 8 : 2, r = 6;
  const inside = (x: number, y: number) => {
    const px = x < r ? r : x > W - 1 - r ? W - 1 - r : x;
    const py = y < r ? r : y > H - 1 - r ? H - 1 - r : y;
    return (x - px) ** 2 + (y - py) ** 2 <= r * r + 0.5;
  };
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const sx = x - dx;
      if (sx < 0 || sx >= W || !inside(sx, y)) continue;
      f[y * W + x] = y >= 12 ? shade : base;
    }
  if (!DARK) { // 1px outline only needed on the light ceramic background
    const out: number[] = [];
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (f[y * W + x] !== 0) continue;
        const b = (xx: number, yy: number) => xx >= 0 && xx < W && yy >= 0 && yy < H && (f[yy * W + xx] === base || f[yy * W + xx] === shade);
        if (b(x - 1, y) || b(x + 1, y) || b(x, y - 1) || b(x, y + 1)) out.push(y * W + x);
      }
    for (const i of out) f[i] = 3;
  }
  return f;
}
function stamp(f: Uint8Array, x: number, y: number, s: string[], dx = 0) {
  for (let r = 0; r < s.length; r++) for (let c = 0; c < s[r].length; c++) {
    const ch = s[r][c]; if (ch === "." || ch === " ") continue;
    const idx = CH[ch]; if (idx === undefined) continue;
    const px = x + c + dx, py = y + r;
    if (px >= 0 && px < W && py >= 0 && py < H) f[py * W + px] = idx;
  }
}

const EYE = ["BB", "BB"];
const EYE_WIDE = ["WWW", "WPW", "WWW"];
const EYE_HAPPY = ["B.B", ".B."]; // ‿
const EYE_X = ["B.B", ".B.", "B.B"];
const EYE_SLEEP = ["BBB"];
const BROW = ["BBB"];
const SMILE = [".B.....B.", "B.......B", ".BBBBBBB."];
const SMILE2 = ["B.......B", ".BBBBBBB.", "..BBBBB.."];
const FROWN = [".BBBBB.", "B.....B"];
const O_BIG = ["..BBB..", ".BRRRB.", "BRRRRRB", ".BRRRB.", "..BBB.."];
const O_SMALL = ["..BBB..", ".BRRRB.", "..BBB.."];
const WAVY = ["BB..BB..BB", "..BB..BB.."];
const TONGUE = [".BBBBB.", "BRRRRRB", ".BRRB..", "..RR..."];
const SWEAT = ["V", "V"];

type Expr = "happy" | "worried" | "panic" | "queasy" | "sick" | "sleep";
const eyes = (f: Uint8Array, l: string[], r: string[], dx = 0) => { stamp(f, 9, 4, l, dx); stamp(f, 21, 4, r, dx); };
const brows = (f: Uint8Array, y: number) => { stamp(f, 9, y, BROW); stamp(f, 20, y, BROW); };

function frames(expr: Expr): Uint8Array[] {
  if (expr === "happy") {
    const a = head(); eyes(a, EYE, EYE); stamp(a, 2, 10, ["CC", "CC"]); stamp(a, 28, 10, ["CC", "CC"]); stamp(a, 11, 10, SMILE);
    const b = head(); eyes(b, EYE, EYE); stamp(b, 2, 10, ["CC", "CC"]); stamp(b, 28, 10, ["CC", "CC"]); stamp(b, 11, 9, SMILE2);
    return [a, a, b];
  }
  if (expr === "worried") {
    const mk = (sy: number) => { const f = head(); brows(f, 2); eyes(f, EYE, EYE); stamp(f, 12, 12, FROWN); stamp(f, 27, sy, SWEAT); return f; };
    return [mk(4), mk(7)];
  }
  if (expr === "panic") {
    const mk = (dx: number, m: string[], sy: number) => { const f = head(false, dx); brows(f, 1); eyes(f, EYE_WIDE, EYE_WIDE, dx); stamp(f, 12 + dx, 10, m); stamp(f, 3, sy, SWEAT); stamp(f, 28, sy, SWEAT); return f; };
    return [mk(0, O_BIG, 4), mk(1, O_SMALL, 7)];
  }
  if (expr === "queasy") {
    const mk = (l: string[], r: string[]) => { const f = head(true); eyes(f, l, r); stamp(f, 11, 12, WAVY); return f; };
    return [mk(EYE_SLEEP, EYE), mk(EYE, EYE_SLEEP)];
  }
  if (expr === "sick") {
    const mk = (dx: number) => { const f = head(true, dx); eyes(f, EYE_X, EYE_X, dx); stamp(f, 12 + dx, 11, TONGUE); return f; };
    return [mk(0), mk(1)];
  }
  const a = head(); eyes(a, EYE_SLEEP, EYE_SLEEP); stamp(a, 13, 12, ["BBBB"]); stamp(a, 25, 3, ["V"]);
  const b = head(); eyes(b, EYE_SLEEP, EYE_SLEEP); stamp(b, 13, 12, ["BBBB"]); stamp(b, 26, 2, ["V"]);
  return [a, b, a];
}

function upscale(f: Uint8Array, s: number): Uint8Array {
  const o = new Uint8Array(W * s * H * s);
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) { const v = f[r * W + c]; for (let dr = 0; dr < s; dr++) for (let dc = 0; dc < s; dc++) o[(r * s + dr) * (W * s) + (c * s + dc)] = v; }
  return o;
}
function encode(fr: Uint8Array[], scale: number, delay = 300): Uint8Array {
  const g = GIFEncoder();
  fr.forEach((f, i) => g.writeFrame(scale === 1 ? f : upscale(f, scale), W * scale, H * scale, { palette: PALETTE, delay, repeat: 0, first: i === 0 }));
  g.finish(); return g.bytes();
}

const EXPRS: Expr[] = ["happy", "worried", "panic", "queasy", "sick", "sleep"];
const name = `emoji${DARK ? "-dark" : ""}`;
const dir = join(import.meta.dir, "..", "packs", name);
mkdirSync(dir, { recursive: true });
for (const e of EXPRS) {
  writeFileSync(join(dir, `${e}.gif`), encode(frames(e), 1));
  writeFileSync(join(import.meta.dir, "..", "docs", `${name}_${e}.gif`), encode(frames(e), 10));
  console.log("wrote", `packs/${name}/${e}.gif`);
}
console.log(`\nUse it:  FACE_PACK=packs/${name} bun run bot`);
