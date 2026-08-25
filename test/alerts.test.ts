import { expect, test, describe } from "bun:test";
import { assess, RED, AMBER, DEFAULT_THRESHOLDS } from "../src/alerts";
import type { Reading } from "../src/dexcom";

const NOW = 1_700_000_000_000;

/** Build 12 readings 5 min apart ending `lastMmol` with a known slope (mmol/min). */
function ramp(lastMmol: number, slope: number, nowTs = NOW, n = 12, stepMin = 5): Reading[] {
  const out: Reading[] = [];
  for (let i = 0; i < n; i++) {
    const minutesAgo = (n - 1 - i) * stepMin;
    const mmol = lastMmol - slope * minutesAgo;
    out.push({ mmol, mgdl: Math.round(mmol * 18.0182), trend: "Flat", ts: nowTs - minutesAgo * 60000 });
  }
  return out;
}

describe("assess — acute warnings", () => {
  test("below 3 -> urgent low, red, value + arrow + 'ÄT NU'", () => {
    const a = assess(ramp(2.8, 0), DEFAULT_THRESHOLDS, NOW);
    expect(a.level).toBe("urgentLow");
    expect(a.warning?.color).toBe(RED);
    expect(a.warning?.text).toBe("LÅGT 2.8 → – ÄT NU"); // flat slope -> →
  });

  test("above 14 -> urgent high, red, value + arrow", () => {
    const a = assess(ramp(15.2, 0), DEFAULT_THRESHOLDS, NOW);
    expect(a.level).toBe("urgentHigh");
    expect(a.warning?.color).toBe(RED);
    expect(a.warning?.text).toBe("HÖGT 15.2 →!");
  });
});

describe("assess — 20-min prediction", () => {
  test("falling fast so predicted <= 3 -> predLow (red) before actually low", () => {
    // current 6.0, slope -0.2/min -> predicted 6.0 - 4.0 = 2.0
    const a = assess(ramp(6.0, -0.2), DEFAULT_THRESHOLDS, NOW);
    expect(a.level).toBe("predLow");
    expect(a.warning?.color).toBe(RED);
    expect(a.current).toBeGreaterThan(3); // not yet low
    expect(a.predicted).toBeLessThanOrEqual(3);
    // includes current value, falling arrow, and the prediction
    expect(a.warning?.text).toBe("SNART LÅGT 6.0 ↘ ~2.0 om 20 min");
  });

  test("rising fast so predicted >= 14 -> predHigh (amber), value + arrow", () => {
    // current 11, slope +0.2/min -> predicted 15
    const a = assess(ramp(11.0, 0.2), DEFAULT_THRESHOLDS, NOW);
    expect(a.level).toBe("predHigh");
    expect(a.warning?.color).toBe(AMBER);
    expect(a.predicted).toBeGreaterThanOrEqual(14);
    expect(a.warning?.text).toBe("SNART HÖGT 11.0 ↗ ~15.0 om 20 min");
  });

  test("mild fall that stays in range -> ok, no warning", () => {
    // current 8, slope -0.1/min -> predicted 6.0
    const a = assess(ramp(8.0, -0.1), DEFAULT_THRESHOLDS, NOW);
    expect(a.level).toBe("ok");
    expect(a.warning).toBeNull();
  });

  test("stable in range -> ok", () => {
    const a = assess(ramp(6.5, 0), DEFAULT_THRESHOLDS, NOW);
    expect(a.level).toBe("ok");
    expect(a.warning).toBeNull();
  });
});

describe("assess — safety edges", () => {
  test("stale data (>16 min old) raises no live warning", () => {
    const a = assess(ramp(2.5, 0), DEFAULT_THRESHOLDS, NOW + 30 * 60000); // now is 30 min after newest
    expect(a.level).toBe("stale");
    expect(a.warning).toBeNull();
  });

  test("no readings -> unknown", () => {
    expect(assess([], DEFAULT_THRESHOLDS, NOW).level).toBe("unknown");
  });

  test("prediction is exposed even when ok", () => {
    const a = assess(ramp(7.0, -0.05), DEFAULT_THRESHOLDS, NOW);
    expect(a.predicted).toBeCloseTo(6.0, 1); // 7 - 0.05*20
  });
});
