/**
 * render.ts — turn a 6h glucose series into a 32x16 GIF for the PixelMug P1.
 *
 * The PixelMug talPlayGif contract requires: GIF87a/89a, EXACTLY 32x16, <= 40 KB.
 * We build an indexed frame with a tiny fixed palette and let gifenc encode it.
 *
 * Design mirrors the mockup: 6h binned to 32 columns (newest right), fixed
 * y-scale 3.0–13.0 mmol -> 16 rows, colour zones red<=4.5 / green<=12.5 / yellow,
 * dim green target band 4–8, brightest "now" column. Low glucose blinks (2 frames).
 */
import { GIFEncoder } from "gifenc";

export const W = 32;
export const H = 16;

// Fixed y-axis so the same bar height always means the same value.
export const Y_LO = 3.0;
export const Y_HI = 13.0;
const BAND_LO = 4.0;
const BAND_HI = 8.0;

// Colour thresholds — identical to GlukosRun / the mockup.
export function zone(mmol: number): "low" | "inrange" | "high" {
  if (mmol <= 4.5) return "low";
  if (mmol <= 12.5) return "inrange";
  return "high";
}

// Palette (index -> RGB). Keep small; GIF stays tiny.
const PALETTE: [number, number, number][] = [
  [10, 10, 14], //  0 bg
  [14, 46, 22], //  1 band (dim green)
  [255, 60, 60], //  2 low
  [120, 24, 24], //  3 low dim
  [60, 220, 90], //  4 inrange
  [24, 96, 40], //  5 inrange dim
  [250, 200, 40], //  6 high
  [120, 92, 16], //  7 high dim
  [255, 255, 255], //  8 white (now marker)
  [120, 120, 120], //  9 gray (stale)
  [70, 70, 70], // 10 gray dim
  [255, 149, 0], // 11 amber (predicted-high warning text)
];
const I = {
  bg: 0, band: 1, low: 2, lowDim: 3, inrange: 4, inrangeDim: 5,
  high: 6, highDim: 7, white: 8, gray: 9, grayDim: 10, amber: 11,
};

/** Palette index names — exported so tests can assert individual pixels. */
export const INDEX = I;

/**
 * Minimal 3x5 pixel font — the simplest digits that stay legible on the mug.
 * Each glyph is rows top→bottom; '1' = lit. '.' is a 1-wide glyph, the rest 3-wide.
 */
const FONT: Record<string, string[]> = {
  "0": ["111", "101", "101", "101", "111"],
  "1": ["010", "110", "010", "010", "111"],
  "2": ["111", "001", "111", "100", "111"],
  "3": ["111", "001", "111", "001", "111"],
  "4": ["101", "101", "111", "001", "001"],
  "5": ["111", "100", "111", "001", "111"],
  "6": ["111", "100", "111", "101", "111"],
  "7": ["111", "001", "010", "010", "010"],
  "8": ["111", "101", "111", "101", "111"],
  "9": ["111", "101", "111", "001", "111"],
  // uppercase letters (Å/Ä->A, Ö->O are normalised before drawing)
  A: ["010", "101", "111", "101", "101"],
  B: ["110", "101", "110", "101", "110"],
  C: ["011", "100", "100", "100", "011"],
  D: ["110", "101", "101", "101", "110"],
  E: ["111", "100", "110", "100", "111"],
  F: ["111", "100", "110", "100", "100"],
  G: ["011", "100", "101", "101", "011"],
  H: ["101", "101", "111", "101", "101"],
  I: ["111", "010", "010", "010", "111"],
  J: ["001", "001", "001", "101", "010"],
  K: ["101", "101", "110", "101", "101"],
  L: ["100", "100", "100", "100", "111"],
  M: ["101", "111", "111", "101", "101"],
  N: ["101", "111", "111", "111", "101"],
  O: ["010", "101", "101", "101", "010"],
  P: ["110", "101", "110", "100", "100"],
  Q: ["010", "101", "101", "111", "011"],
  R: ["110", "101", "110", "101", "101"],
  S: ["011", "100", "010", "001", "110"],
  T: ["111", "010", "010", "010", "010"],
  U: ["101", "101", "101", "101", "111"],
  V: ["101", "101", "101", "101", "010"],
  W: ["101", "101", "111", "111", "101"],
  X: ["101", "101", "010", "101", "101"],
  Y: ["101", "101", "010", "010", "010"],
  Z: ["111", "001", "010", "100", "111"],
  // punctuation
  "-": ["000", "000", "111", "000", "000"],
  ".": ["0", "0", "0", "0", "1"],
  "!": ["1", "1", "1", "0", "1"],
  ":": ["0", "1", "0", "1", "0"],
  "~": ["000", "010", "101", "000", "000"],
  " ": ["00", "00", "00", "00", "00"],
  // trend arrows: rising = "/", falling = "\", steady = "-"
  "↗": ["001", "001", "010", "100", "100"],
  "↘": ["100", "100", "010", "001", "001"],
  "→": ["000", "000", "111", "000", "000"],
};
const GLYPH_H = 5;

/** Uppercase and fold Swedish diacritics so the digit-era font can render them. */
function normalizeOverlay(s: string): string {
  return s.toUpperCase().replace(/[ÅÄ]/g, "A").replace(/Ö/g, "O").replace(/–/g, "-");
}

function textWidth(s: string): number {
  let w = 0;
  for (let i = 0; i < s.length; i++) {
    w += (FONT[s[i]]?.[0].length ?? 3) + (i < s.length - 1 ? 1 : 0);
  }
  return w;
}

/** Draw a string into an indexed frame at (x,y) with palette index `idx`. */
function drawText(frame: Uint8Array, x: number, y: number, s: string, idx: number) {
  let cx = x;
  for (const ch of s) {
    const g = FONT[ch];
    if (!g) { cx += 4; continue; }
    for (let r = 0; r < GLYPH_H; r++)
      for (let c = 0; c < g[r].length; c++)
        if (g[r][c] === "1") {
          const px = cx + c, py = y + r;
          if (px >= 0 && px < W && py >= 0 && py < H) frame[py * W + px] = idx;
        }
    cx += g[0].length + 1;
  }
}

/** Format an mmol value for the tiny display: one decimal, or "--" if unknown. */
function fmtValue(mmol: number): string {
  if (Number.isNaN(mmol) || mmol <= 0) return "--";
  return mmol.toFixed(1);
}

function fullIdx(z: string) {
  return z === "low" ? I.low : z === "high" ? I.high : I.inrange;
}
function dimIdx(z: string) {
  return z === "low" ? I.lowDim : z === "high" ? I.highDim : I.inrangeDim;
}

function yRow(mmol: number): number {
  let t = (mmol - Y_LO) / (Y_HI - Y_LO);
  t = Math.max(0, Math.min(1, t));
  return Math.round((1 - t) * (H - 1)); // 0 = top row, 15 = bottom
}

/** Average-bin a series of any length into exactly `cols` columns (oldest→newest). */
export function binToCols(series: number[], cols = W): number[] {
  if (series.length === 0) return new Array(cols).fill(NaN);
  const out: number[] = [];
  const per = series.length / cols;
  for (let c = 0; c < cols; c++) {
    const a = Math.floor(c * per);
    const b = Math.max(a + 1, Math.floor((c + 1) * per));
    const chunk = series.slice(a, b);
    out.push(chunk.reduce((s, v) => s + v, 0) / chunk.length);
  }
  return out;
}

export type RenderOpts = {
  style?: "bars" | "spark";
  band?: boolean;
  emphasizeLast?: boolean;
  /** Age of the newest reading in minutes; > 16 renders the last column gray. */
  ageMin?: number;
  /** Force a low-alarm blink even if not computed from data. */
  blinkLow?: boolean;
  /** Show the current value as a number, top-left (default true). */
  showValue?: boolean;
  /** The exact current value to print (defaults to the last binned column). */
  currentMmol?: number;
  /** If set, scroll this text over the graph (transparent) instead of the number. */
  overlayText?: string;
  /** Colour of the overlay text. */
  overlayColor?: "red" | "amber" | "white";
};

function blankFrame(band: boolean): Uint8Array {
  const f = new Uint8Array(W * H).fill(I.bg);
  if (band) {
    const rHi = yRow(BAND_HI), rLo = yRow(BAND_LO);
    for (let r = Math.min(rHi, rLo); r <= Math.max(rHi, rLo); r++)
      for (let c = 0; c < W; c++) f[r * W + c] = I.band;
  }
  return f;
}

/** Build one indexed frame. `nowLit` toggles the blink state of the newest column. */
function buildFrame(cols: number[], o: RenderOpts, nowLit: boolean): Uint8Array {
  const f = blankFrame(o.band ?? true);
  const stale = (o.ageMin ?? 0) > 16;

  if ((o.style ?? "bars") === "spark") {
    let prev: number | null = null;
    for (let c = 0; c < W; c++) {
      const v = cols[c];
      if (Number.isNaN(v)) continue;
      const r = yRow(v);
      const z = zone(v);
      if (prev !== null)
        for (let rr = Math.min(prev, r); rr <= Math.max(prev, r); rr++)
          f[rr * W + c] = dimIdx(z);
      f[r * W + c] = fullIdx(z);
      prev = r;
    }
  } else {
    for (let c = 0; c < W; c++) {
      const v = cols[c];
      if (Number.isNaN(v)) continue;
      const top = yRow(v);
      const z = zone(v);
      for (let r = top; r < H; r++)
        f[r * W + c] = r === top ? fullIdx(z) : dimIdx(z);
    }
  }

  // Newest column emphasis / stale / blink.
  const cLast = W - 1;
  const vLast = cols[cLast];
  if (!Number.isNaN(vLast)) {
    const top = yRow(vLast);
    const z = zone(vLast);
    const markIdx = stale ? I.gray : nowLit ? (o.style === "spark" ? I.white : fullIdx(z)) : dimIdx(z);
    if ((o.style ?? "bars") === "spark") {
      f[top * W + cLast] = stale ? I.gray : nowLit ? I.white : dimIdx(z);
    } else if (o.emphasizeLast ?? true) {
      for (let r = top; r < H; r++) f[r * W + cLast] = markIdx;
    }
    // stale warning dot, top-left (only when the number isn't shown there)
    if (stale && o.showValue === false) f[0 * W + 0] = I.gray;
  }

  // Current value as a number, top-left, drawn straight over the graph (no
  // backing) so the curve stays visible behind it. Colour signals the zone:
  // red = low, yellow = high, white = in range; gray = stale.
  if (o.showValue !== false) {
    const v = o.currentMmol ?? cols[W - 1];
    const numCol = stale
      ? I.gray
      : Number.isNaN(v) || v <= 0
        ? I.white
        : zone(v) === "low"
          ? I.low
          : zone(v) === "high"
            ? I.high
            : I.white;
    drawText(f, 1, 1, fmtValue(v), numCol);
  }
  return f;
}

function overlayColorIdx(c?: string): number {
  return c === "amber" ? I.amber : c === "white" ? I.white : I.low;
}

const SCROLL_STEP = 2; // px per frame — keeps the animation small enough for the 40KB cap

/** Frames that scroll `overlayText` across a static graph (graph shows behind). */
function scrollFrames(cols: number[], opts: RenderOpts): Uint8Array[] {
  const text = normalizeOverlay(opts.overlayText!);
  const col = overlayColorIdx(opts.overlayColor);
  const tw = textWidth(text);
  const y = 6; // graph stays visible above, below, and through the gaps in the text
  const graphOpts = { ...opts, showValue: false }; // the scrolling text carries the value
  const frames: Uint8Array[] = [];
  for (let x = W; x >= -tw; x -= SCROLL_STEP) {
    const f = buildFrame(cols, graphOpts, true);
    drawText(f, x, y, text, col);
    frames.push(f);
  }
  return frames;
}

/**
 * Render the glucose series to GIF bytes. Returns a valid 32x16 GIF89a.
 * With `overlayText`, scrolls that text over the graph. Otherwise a static graph
 * (or a 2-frame blink when the newest reading is low).
 */
export function renderGlucoseGif(series: number[], opts: RenderOpts = {}): Uint8Array {
  const cols = binToCols(series, W);

  if (opts.overlayText) {
    const gif = GIFEncoder();
    const frames = scrollFrames(cols, opts);
    frames.forEach((fr, i) =>
      gif.writeFrame(fr, W, H, { palette: PALETTE, delay: 80, repeat: 0, first: i === 0 }));
    gif.finish();
    return gif.bytes();
  }

  const newest = cols[W - 1];
  const isLow = opts.blinkLow || (!Number.isNaN(newest) && zone(newest) === "low");

  const gif = GIFEncoder();
  const palette = PALETTE;

  if (isLow) {
    // two-frame slow blink of the newest column
    gif.writeFrame(buildFrame(cols, opts, true), W, H, { palette, delay: 600, repeat: 0, first: true });
    gif.writeFrame(buildFrame(cols, opts, false), W, H, { palette, delay: 600 });
  } else {
    gif.writeFrame(buildFrame(cols, opts, true), W, H, { palette, delay: 0, repeat: 0, first: true });
  }
  gif.finish();
  return gif.bytes();
}

/** Build the first indexed frame for a series (exposed for tests). */
export function renderFrameIndexed(series: number[], opts: RenderOpts = {}, nowLit = true): Uint8Array {
  return buildFrame(binToCols(series, W), opts, nowLit);
}

/** Read the palette index at (col, row) of an indexed frame. */
export function pixelAt(frame: Uint8Array, col: number, row: number): number {
  return frame[row * W + col];
}

/** Nearest-neighbour upscale one indexed frame by `s`x (for human preview only). */
function upscale(frame: Uint8Array, s: number): Uint8Array {
  const out = new Uint8Array(W * s * H * s);
  for (let r = 0; r < H; r++)
    for (let c = 0; c < W; c++) {
      const idx = frame[r * W + c];
      for (let dr = 0; dr < s; dr++)
        for (let dc = 0; dc < s; dc++)
          out[(r * s + dr) * (W * s) + (c * s + dc)] = idx;
    }
  return out;
}

/**
 * Human-viewable preview GIF, upscaled `scale`x. NOT for the mug (wrong size on
 * purpose) — just so a person can see what the 32x16 frame looks like.
 */
export function renderPreviewGif(series: number[], scale = 16, opts: RenderOpts = {}): Uint8Array {
  const cols = binToCols(series, W);
  const bigW = W * scale, bigH = H * scale;

  if (opts.overlayText) {
    const gif = GIFEncoder();
    const frames = scrollFrames(cols, opts);
    frames.forEach((fr, i) =>
      gif.writeFrame(upscale(fr, scale), bigW, bigH, { palette: PALETTE, delay: 80, repeat: 0, first: i === 0 }));
    gif.finish();
    return gif.bytes();
  }

  const newest = cols[W - 1];
  const isLow = opts.blinkLow || (!Number.isNaN(newest) && zone(newest) === "low");
  const gif = GIFEncoder();
  if (isLow) {
    gif.writeFrame(upscale(buildFrame(cols, opts, true), scale), bigW, bigH, { palette: PALETTE, delay: 600, repeat: 0, first: true });
    gif.writeFrame(upscale(buildFrame(cols, opts, false), scale), bigW, bigH, { palette: PALETTE, delay: 600 });
  } else {
    gif.writeFrame(upscale(buildFrame(cols, opts, true), scale), bigW, bigH, { palette: PALETTE, delay: 0, repeat: 0, first: true });
  }
  gif.finish();
  return gif.bytes();
}

/** Validate a GIF against the PixelMug talPlayGif constraints. Throws on violation. */
export function assertMugGif(bytes: Uint8Array): { size: number; w: number; h: number; header: string } {
  const header = String.fromCharCode(...bytes.slice(0, 6));
  if (header !== "GIF87a" && header !== "GIF89a") throw new Error(`bad GIF header: ${header}`);
  const w = bytes[6] | (bytes[7] << 8);
  const h = bytes[8] | (bytes[9] << 8);
  if (w !== W || h !== H) throw new Error(`bad dimensions ${w}x${h}, need ${W}x${H}`);
  if (bytes.length > 40 * 1024) throw new Error(`too large: ${bytes.length} bytes (max 40960)`);
  return { size: bytes.length, w, h, header };
}
