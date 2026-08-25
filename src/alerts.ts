/**
 * alerts.ts — glucose warnings + 20-minute prediction for the PixelMug.
 *
 * Two kinds of warning, both surfaced as scrolling coloured text on the mug:
 *   - ACUTE   : you are already too low/high  ("UNDER 3 – ÄT NU!", "ÖVER 14!")
 *   - PREDICT : the 20-min projection will cross a limit ("SNART UNDER 3 …")
 *
 * Prediction = current + slope × window, where slope is the least-squares trend
 * over the last 20 min (not Dexcom's arrow, which lags real falls).
 */
import { slopePerMin, type Reading } from "./dexcom";

export const RED = "#ff2b2b";
export const AMBER = "#ff9500";

export type AlertThresholds = {
  lowUrgent: number; // at/below -> acute low
  highUrgent: number; // at/above -> acute high
  predWindowMin: number; // how far ahead to project
};

export const DEFAULT_THRESHOLDS: AlertThresholds = {
  lowUrgent: 3.0,
  highUrgent: 14.0,
  predWindowMin: 20,
};

export type Level =
  | "unknown"
  | "stale"
  | "urgentLow"
  | "predLow"
  | "ok"
  | "predHigh"
  | "urgentHigh";

export type Assessment = {
  current: number;
  ageMin: number;
  slope: number; // mmol/min
  predicted: number; // mmol projected `predWindowMin` ahead
  level: Level;
  warning: { text: string; color: string } | null;
};

export function assess(
  readings: Reading[],
  t: AlertThresholds = DEFAULT_THRESHOLDS,
  nowTs?: number,
): Assessment {
  const empty = (level: Level): Assessment => ({
    current: NaN,
    ageMin: NaN,
    slope: 0,
    predicted: NaN,
    level,
    warning: null,
  });

  if (!readings.length) return empty("unknown");
  const last = readings[readings.length - 1];
  const now = nowTs ?? last.ts;
  const current = last.mmol;
  const ageMin = (now - last.ts) / 60000;
  if (Number.isNaN(current) || current <= 0) return empty("unknown");

  const slope = slopePerMin(readings, 20);
  const predicted = Math.max(1, Math.min(30, current + slope * t.predWindowMin));

  // Stale data can't be trusted for a live warning.
  if (ageMin > 16) {
    return { current, ageMin, slope, predicted, level: "stale", warning: null };
  }

  let level: Level = "ok";
  let warning: Assessment["warning"] = null;
  const win = t.predWindowMin;

  if (current <= t.lowUrgent) {
    level = "urgentLow";
    warning = { text: `LÅGT ${current.toFixed(1)} – ÄT NU`, color: RED };
  } else if (current >= t.highUrgent) {
    level = "urgentHigh";
    warning = { text: `HÖGT ${current.toFixed(1)}!`, color: RED };
  } else if (slope < 0 && predicted <= t.lowUrgent) {
    level = "predLow";
    warning = { text: `SNART LÅGT – ~${predicted.toFixed(1)} om ${win} min`, color: RED };
  } else if (slope > 0 && predicted >= t.highUrgent) {
    level = "predHigh";
    warning = { text: `SNART HÖGT – ~${predicted.toFixed(1)} om ${win} min`, color: AMBER };
  }

  return { current, ageMin, slope, predicted, level, warning };
}
