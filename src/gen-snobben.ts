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
const PALETTE: [number, number, number][] = [
  [10, 10, 14], [245, 245, 245], [20, 20, 20], [206, 206, 212],
  [210, 50, 50], [200, 230, 190], [168, 202, 158], [110, 178, 250], [118, 120, 132],
];
const CH: Record<string, number> = { B: 2, W: 1, R: 4, V: 7, E: 8 };
const blank = () => new Uint8Array(W * H).fill(0);

function ellipse(f: Uint8Array, cx: number, cy: number, rx: number, ry: number, color: number, dx = 0) {
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const sx = x - dx;
      if (((sx - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) f[y * W + x] = color;
    }
}

/** Head (round) + snout (juts right), white or green, shaded along the bottom. */
function head(green = false, dx = 0): Uint8Array {
  const f = blank();
  const base = green ? 5 : 1, sh = green ? 6 : 3;
  ellipse(f, 12, 7, 9, 6, base, dx); // skull
  ellipse(f, 23, 10, 7, 4, base, dx); // snout
  for (let y = 12; y < H; y++)
    for (let x = 0; x < W; x++) if (f[y * W + x] === base) f[y * W + x] = sh;
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

// long floppy ear at the back (left). Uses 'E' (lit dark-gray) so it shows on the
// mug's LED screen instead of vanishing into the black background.
const EAR = ["EEE..", "EEEE.", "EEEE.", "EEEEE", "EEEEE", ".EEEE", ".EEEE", ".EEE.", "..EE.", "..E.."];
const EAR_UP = ["...EE", "..EEEE", ".EEEEE", "EEEEE.", "EEEE..", "EEE...", ".EE...", ".EE..."];

const EYE = ["B", "B"];
const EYE_HAPPY = ["BB"];      // content squint
const EYE_WIDE = ["BB", "BB"]; // shocked
const EYE_X = ["B.B", ".B.", "B.B"];
const EYE_SLEEP = ["BB"];
const MOUTH = ["B...", ".BBB"];       // little smile under the snout
const MOUTH_FLAT = ["BBBB"];
const MOUTH_OPEN = [".BB.", "BRRB", ".BB."];
const MOUTH_TONGUE = ["BBB", "BRB", ".R."];
const SWEAT = ["V", "V"];

type Expr = "happy" | "worried" | "panic" | "queasy" | "sick" | "sleep";
const nose = (f: Uint8Array, dx = 0) => ellipse(f, 27, 9, 3, 2.6, 2, dx);
const ear = (f: Uint8Array, up = false, dx = 0) => stamp(f, 0, up ? 0 : 1, up ? EAR_UP : EAR, dx);
const eyes = (f: Uint8Array, l: string[], r: string[], dx = 0) => { stamp(f, 11, 4, l, dx); stamp(f, 15, 4, r, dx); };

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
const dir = join(import.meta.dir, "..", "packs", "snobben");
mkdirSync(dir, { recursive: true });
for (const e of EXPRS) {
  writeFileSync(join(dir, `${e}.gif`), encode(frames(e), 1));
  writeFileSync(join(import.meta.dir, "..", "docs", `snobben_${e}.gif`), encode(frames(e), 10));
  console.log("wrote", `packs/snobben/${e}.gif`);
}
console.log(`\nUse it:  FACE_PACK=packs/snobben bun run bot`);
