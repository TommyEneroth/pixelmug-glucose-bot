import { expect, test, describe } from "bun:test";
import { slopePerMin } from "../src/dexcom";
import { syntheticReadings } from "../src/synthetic";

describe("slopePerMin", () => {
  const now = Date.now();
  const mk = (mmols: number[]) =>
    mmols.map((mmol, i) => ({
      mmol,
      mgdl: Math.round(mmol * 18.0182),
      trend: "Flat",
      ts: now - (mmols.length - 1 - i) * 5 * 60 * 1000,
    }));

  test("rising series -> positive slope", () => {
    expect(slopePerMin(mk([5.0, 5.5, 6.0, 6.5, 7.0]), 60)).toBeGreaterThan(0);
  });

  test("falling series -> negative slope", () => {
    expect(slopePerMin(mk([7.0, 6.5, 6.0, 5.5, 5.0]), 60)).toBeLessThan(0);
  });

  test("flat series -> ~zero slope", () => {
    expect(Math.abs(slopePerMin(mk([6, 6, 6, 6, 6]), 60))).toBeLessThan(1e-9);
  });

  test("fewer than two points -> zero", () => {
    expect(slopePerMin([], 60)).toBe(0);
    expect(slopePerMin(mk([6]), 60)).toBe(0);
  });
});

describe("synthetic data", () => {
  test("dramatic curve visits a hypo and a hyper", () => {
    const r = syntheticReadings("dramatic");
    const mmols = r.map((x) => x.mmol);
    expect(Math.min(...mmols)).toBeLessThanOrEqual(4.5); // reaches low
    expect(Math.max(...mmols)).toBeGreaterThan(12.5); // reaches high
  });

  test("readings are chronological, newest last", () => {
    const r = syntheticReadings("calm");
    for (let i = 1; i < r.length; i++) expect(r[i].ts).toBeGreaterThan(r[i - 1].ts);
  });
});
