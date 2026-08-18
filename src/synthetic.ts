/**
 * synthetic.ts — a realistic 6h glucose curve for testing without Dexcom.
 * Deterministic (seedable) so renders are reproducible.
 */
import type { Reading } from "./dexcom";

export function syntheticSeries(kind: "calm" | "dramatic" = "calm", n = 72): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const h = (i / (n - 1)) * 6.0;
    let g: number;
    if (kind === "dramatic") {
      g = 7.0;
      g += 5.6 * Math.exp(-((h - 1.6) ** 2) / 0.45); // hyper spike -> yellow
      g -= 4.2 * Math.exp(-((h - 4.6) ** 2) / 0.5); // hypo -> red
      g += 0.2 * Math.sin(h * 5.0);
    } else {
      g = 6.2;
      g += 2.6 * Math.exp(-((h - 1.4) ** 2) / 0.5);
      g += 1.1 * Math.exp(-((h - 3.9) ** 2) / 0.8);
      g -= 1.9 * Math.exp(-((h - 5.2) ** 2) / 0.4);
      g += 0.18 * Math.sin(h * 5.0);
    }
    out.push(Math.round(g * 100) / 100);
  }
  return out;
}

export function syntheticReadings(kind: "calm" | "dramatic" = "calm"): Reading[] {
  const series = syntheticSeries(kind);
  const now = Date.now();
  const n = series.length;
  return series.map((mmol, i) => ({
    mmol,
    mgdl: Math.round(mmol * 18.0182),
    trend: "Flat",
    ts: now - (n - 1 - i) * 5 * 60 * 1000,
  }));
}
