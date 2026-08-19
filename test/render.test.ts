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

  test("value number: fresh is white, stale is gray (top-left glyph pixel)", () => {
    // '6' glyph top-left pixel sits at (1,1)
    const fresh = renderFrameIndexed(flat(6.5), { showValue: true, currentMmol: 6.5, ageMin: 2 }, true);
    expect(pixelAt(fresh, 1, 1)).toBe(INDEX.white);
    const stale = renderFrameIndexed(flat(6.5), { showValue: true, currentMmol: 6.5, ageMin: 30 }, true);
    expect(pixelAt(stale, 1, 1)).toBe(INDEX.gray);
  });

  test("unknown value (0) prints '--' instead of a number", () => {
    const f = renderFrameIndexed([], { showValue: true, currentMmol: 0 }, true);
    // '-' glyph is a middle bar; row 3 (y=1+2) col 1 is lit for the first dash
    expect(pixelAt(f, 1, 3)).toBe(INDEX.white);
  });

  test("target band is shaded when enabled", () => {
    const f = renderFrameIndexed([], { band: true }, true);
    // some pixel in the band rows is the dim-green band colour
    expect(Array.from(f).some((v) => v === INDEX.band)).toBe(true);
  });
});
