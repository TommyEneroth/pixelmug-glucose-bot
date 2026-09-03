/**
 * gen-snobben.ts — "Snobben" (Snoopy-style beagle) face pack.
 *   bun run gen-snobben   ->  packs/snobben/*.gif  + docs/snobben_*.gif
 *
 * A right-facing profile: round white head + a snout that juts to the right with
 * the big black nose at the tip, one long floppy black ear at the back, small
 * eyes. Original pixel art — a playful homage, not the real character.
 */
import { GIFEncoder } from "gifenc";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const W = 32, H = 16;
// 0 bg,1 white,2 black,3 white-shade,4 red,5 green,6 green-shade,7 sweat,8 ear-gray
// NOTE: on the mug's LED screen "black" = OFF pixels (invisible on the black
// background). Black is fine INSIDE the lit white head (eyes/nose read as holes),
// but the ear sits on the background, so it uses a lit dark-gray ('E') instead.
// index 0 = background: LIGHT ceramic, because the mug shows the pixels you send
// (a dark bg would make a dark screen). Figures use a black outline to read on it.
const PALETTE: [number, number, number][] = [
  [232, 229, 222], [248, 248, 248], [20, 20, 20], [205, 205, 210],
  [210, 50, 50], [150, 205, 120], [110, 166, 86], [70, 150, 240], [162, 166, 188],
];
// THEME=dark -> dark background (black mug): body glows, ear becomes lit grey, no outline.
const DARK = process.env.THEME === "dark";
if (DARK) PALETTE[0] = [10, 10, 14];
// ear: black on the light mug (index 2), lit grey on the black mug (index 8)
const CH: Record<string, number> = { B: 2, W: 1, R: 4, V: 7, E: DARK ? 8 : 2 };
const blank = () => new Uint8Array(W * H).fill(0);

function ellipse(f: Uint8Array, cx: number, cy: number, rx: number, ry: number, color: number, dx = 0) {
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const sx = x - dx;
      if (((sx - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) f[y * W + x] = color;
    }
}

/** Head (round) + snout (juts right), white or green, with a black outline so it
 * reads on the mug's LIGHT ceramic background (off pixels = ceramic, not black). */
function head(green = false, dx = 0): Uint8Array {
  const f = blank();
  const base = green ? 5 : 1, sh = green ? 6 : 3;
  ellipse(f, 12, 7, 9, 6, base, dx); // skull
  ellipse(f, 24, 10, 8.5, 4, base, dx); // snout (extended right so the nose gets a white ring)
  for (let y = 12; y < H; y++)
    for (let x = 0; x < W; x++) if (f[y * W + x] === base) f[y * W + x] = sh;
  if (!DARK) { // 1px black outline around the body — only needed on the light mug
    const body = (i: number) => f[i] === base || f[i] === sh;
    const out: number[] = [];
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (f[y * W + x] !== 0) continue;
        const nb = (xx: number, yy: number) => xx >= 0 && xx < W && yy >= 0 && yy < H && body(yy * W + xx);
        if (nb(x - 1, y) || nb(x + 1, y) || nb(x, y - 1) || nb(x, y + 1)) out.push(y * W + x);
      }
    for (const i of out) f[i] = 2;
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

// long floppy BLACK ear at the back — Snoopy's signature: wide rounded top,
// narrowing to a rounded tip, hanging well below the head.
const EAR = [
  ".EEEEE.", "EEEEEEE", "EEEEEEE", "EEEEEEE", ".EEEEEE",
  ".EEEEEE", ".EEEEE.", "..EEEE.", "..EEEE.", "..EEE..", "..EEE..", "...EE..",
];
const EAR_UP = [
  "...EEEEE", "..EEEEEEE", "EEEEEEEE.", "EEEEEEE..", "EEEEEE...",
  ".EEEEE...", ".EEEE....", "..EEE....", "..EEE....",
];

const EYE = ["BB", "BB"];       // small oval
const EYE_HAPPY = [".BB.", "B..B"]; // happy upward curve ‿
const EYE_WIDE = ["BBB", "BBB", "BBB"]; // shocked
const EYE_X = ["B.B", ".B.", "B.B"];
const EYE_SLEEP = ["BBBB"];
const MOUTH = ["B...", ".BBB"];       // little smile under the snout
const MOUTH_FLAT = ["BBBB"];
const MOUTH_OPEN = [".BB.", "BRRB", ".BB."];
const MOUTH_TONGUE = ["BBB", "BRB", ".R."];
const SWEAT = ["V", "V"];

type Expr = "happy" | "worried" | "panic" | "queasy" | "sick" | "sleep";
const nose = (f: Uint8Array, dx = 0) => ellipse(f, 25.5, 10, 4, 3.1, 2, dx); // big snout nose
const ear = (f: Uint8Array, up = false, dx = 0) => stamp(f, 1, up ? 0 : 1, up ? EAR_UP : EAR, dx);
const eyes = (f: Uint8Array, l: string[], r: string[], dx = 0) => { stamp(f, 12, 4, l, dx); stamp(f, 16, 4, r, dx); };

function frames(expr: Expr): Uint8Array[] {
  if (expr === "happy") {
    const a = head(); ear(a); eyes(a, EYE_HAPPY, EYE_HAPPY); nose(a); stamp(a, 17, 12, MOUTH);
    const b = head(); ear(b); eyes(b, EYE, EYE); nose(b); stamp(b, 17, 12, MOUTH);
    return [a, a, b];
  }
  if (expr === "worried") {
    const mk = (sy: number) => { const f = head(); ear(f); eyes(f, EYE_WIDE, EYE_WIDE); nose(f); stamp(f, 17, 12, MOUTH_FLAT); stamp(f, 8, sy, SWEAT); return f; };
    return [mk(9), mk(12)];
  }
  if (expr === "panic") {
    const mk = (dx: number, sy: number) => { const f = head(false, dx); ear(f, true, dx); eyes(f, EYE_WIDE, EYE_WIDE, dx); nose(f, dx); stamp(f, 18 + dx, 12, MOUTH_OPEN); stamp(f, 8, sy, SWEAT); return f; };
    return [mk(0, 9), mk(1, 12)];
  }
  if (expr === "queasy") {
    const mk = (l: string[], r: string[]) => { const f = head(true); ear(f); eyes(f, l, r); nose(f); stamp(f, 17, 12, MOUTH_FLAT); return f; };
    return [mk(EYE_SLEEP, EYE), mk(EYE, EYE_SLEEP)];
  }
  if (expr === "sick") {
    const mk = (dx: number) => { const f = head(true, dx); ear(f, false, dx); eyes(f, EYE_X, EYE_X, dx); nose(f, dx); stamp(f, 19 + dx, 12, MOUTH_TONGUE); return f; };
    return [mk(0), mk(1)];
  }
  // sleep
  const a = head(); ear(a); eyes(a, EYE_SLEEP, EYE_SLEEP); nose(a); stamp(a, 17, 12, MOUTH_FLAT); stamp(a, 6, 2, ["V"]);
  const b = head(); ear(b); eyes(b, EYE_SLEEP, EYE_SLEEP); nose(b); stamp(b, 17, 12, MOUTH_FLAT); stamp(b, 7, 1, ["V"]);
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
const name = `snobben${DARK ? "-dark" : ""}`;
const dir = join(import.meta.dir, "..", "packs", name);
mkdirSync(dir, { recursive: true });
for (const e of EXPRS) {
  writeFileSync(join(dir, `${e}.gif`), encode(frames(e), 1));
  writeFileSync(join(import.meta.dir, "..", "docs", `${name}_${e}.gif`), encode(frames(e), 10));
  console.log("wrote", `packs/${name}/${e}.gif`);
}
console.log(`\nUse it:  FACE_PACK=packs/${name} bun run bot`);
