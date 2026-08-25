import { expect, test, describe } from "bun:test";
import {
  renderGlucoseGif,
  assertMugGif,
  binToCols,
  zone,
  renderFrameIndexed,
  pixelAt,
  INDEX,
  W,
  H,
} from "../src/render";

const flat = (v: number, n = 72) => new Array(n).fill(v);
const has = (f: Uint8Array, idx: number) => Array.from(f).includes(idx);

describe("zone thresholds", () => {
  test("boundaries", () => {
    expect(zone(4.5)).toBe("low");
    expect(zone(4.6)).toBe("inrange");
    expect(zone(12.5)).toBe("inrange");
    expect(zone(12.6)).toBe("high");
    expect(zone(0)).toBe("low");
    expect(zone(25)).toBe("high");
  });
});

describe("binToCols", () => {
  test("always returns exactly W columns", () => {
    expect(binToCols(flat(6), 32).length).toBe(32);
    expect(binToCols([6.0], 32).length).toBe(32); // shorter than cols
    expect(binToCols(new Array(300).fill(6), 32).length).toBe(32); // longer
  });
  test("empty series -> all NaN", () => {
    const cols = binToCols([], 32);
    expect(cols.length).toBe(32);
    expect(cols.every((v) => Number.isNaN(v))).toBe(true);
  });
  test("a spike in recent readings pulls the last column up (averaged, by design)", () => {
    const s = flat(6);
    s[s.length - 1] = 11; // newest reading spikes
    const cols = binToCols(s, 32);
    // last column is the MEAN of the final bin, so it rises above 6 but is
    // diluted by its neighbours — it is not the instantaneous value.
    expect(cols[31]).toBeGreaterThan(6);
    expect(cols[31]).toBeLessThan(11);
  });
});

describe("renderGlucoseGif — mug constraints", () => {
  for (const [name, series] of [
    ["in-range", flat(6.5)],
    ["hypo", flat(3.5)],
    ["hyper", flat(14)],
    ["empty", []] as [string, number[]],
    ["single reading", [7.2]],
  ] as [string, number[]][]) {
    test(`${name}: valid 32x16 GIF89a <=40KB`, () => {
      const bytes = renderGlucoseGif(series, { ageMin: 0 });
      const info = assertMugGif(bytes); // throws on any violation
      expect(info.w).toBe(W);
      expect(info.h).toBe(H);
      expect(info.header).toBe("GIF89a");
      expect(info.size).toBeLessThanOrEqual(40 * 1024);
    });
  }
});

describe("frame semantics", () => {
  test("hypo lights the low colour on the newest column", () => {
    const f = renderFrameIndexed(flat(3.5), { emphasizeLast: true }, true);
    expect(pixelAt(f, W - 1, H - 1)).toBe(INDEX.low); // bottom of newest bar
  });

  test("hyper lights the high colour", () => {
    const f = renderFrameIndexed(flat(14), { emphasizeLast: true }, true);
    expect(pixelAt(f, W - 1, H - 1)).toBe(INDEX.high);
  });

  test("stale (>16 min) paints the newest column gray, never green", () => {
    const f = renderFrameIndexed(flat(6.5), { emphasizeLast: true, ageMin: 30, showValue: false }, true);
    expect(pixelAt(f, W - 1, H - 1)).toBe(INDEX.gray);
    expect(pixelAt(f, 0, 0)).toBe(INDEX.gray); // stale warning dot when no number shown
  });

  test("fresh in-range is green", () => {
    const f = renderFrameIndexed(flat(6.5), { emphasizeLast: true, ageMin: 2, showValue: false }, true);
    expect(pixelAt(f, W - 1, H - 1)).toBe(INDEX.inrange);
  });

  test("value number colour: fresh white, stale gray", () => {
    const fresh = renderFrameIndexed([], { showValue: true, currentMmol: 6.5, ageMin: 2, band: false }, true);
    expect(has(fresh, INDEX.white)).toBe(true);
    expect(has(fresh, INDEX.gray)).toBe(false);
    const stale = renderFrameIndexed([], { showValue: true, currentMmol: 6.5, ageMin: 30, band: false }, true);
    expect(has(stale, INDEX.gray)).toBe(true);
    expect(has(stale, INDEX.white)).toBe(false);
  });

  test("value number is coloured by zone: low=red, high=yellow", () => {
    const low = renderFrameIndexed([], { showValue: true, currentMmol: 3.5, ageMin: 2, band: false }, true);
    expect(has(low, INDEX.low)).toBe(true);
    expect(has(low, INDEX.high)).toBe(false);
    const high = renderFrameIndexed([], { showValue: true, currentMmol: 15, ageMin: 2, band: false }, true);
    expect(has(high, INDEX.high)).toBe(true);
    expect(has(high, INDEX.low)).toBe(false);
  });

  test("unknown value (0) prints '--' (white)", () => {
    const f = renderFrameIndexed([], { showValue: true, currentMmol: 0, band: false }, true);
    expect(has(f, INDEX.white)).toBe(true);
  });

  test("target band is shaded when enabled", () => {
    const f = renderFrameIndexed([], { band: true }, true);
    // some pixel in the band rows is the dim-green band colour
    expect(Array.from(f).some((v) => v === INDEX.band)).toBe(true);
  });
});
