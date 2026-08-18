/**
 * dryrun.ts — run the whole render pipeline WITHOUT a mug or a bot token.
 *
 *   bun run dryrun
 *
 * Uses real Dexcom data if DEXCOM_USERNAME/PASSWORD are set (.env), otherwise
 * synthetic curves. Writes mug-ready 32x16 GIFs + upscaled previews to ./out
 * and asserts each mug GIF meets the talPlayGif constraints.
 */
import { renderGlucoseGif, renderPreviewGif, assertMugGif, binToCols, zone } from "./render";
import { publishGif } from "./hosting";
import { DexcomShare, slopePerMin, type Reading } from "./dexcom";
import { syntheticSeries } from "./synthetic";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = join(import.meta.dir, "..", "out");

function fmt(bytes: Uint8Array) {
  const { size, w, h, header } = assertMugGif(bytes);
  return `${header} ${w}x${h} ${size} bytes (${((size / 40960) * 100).toFixed(0)}% of 40KB cap)`;
}

async function realSeries(): Promise<{ series: number[]; readings: Reading[] } | null> {
  const username = process.env.DEXCOM_USERNAME;
  const password = process.env.DEXCOM_PASSWORD;
  if (!username || !password) return null;
  const dex = new DexcomShare({ username, password, region: (process.env.DEXCOM_REGION as any) ?? "eu" });
  const readings = await dex.fetchSeries(6);
  return { series: readings.map((r) => r.mmol), readings };
}

async function main() {
  console.log("PixelMug P1 glucose-bot — dry run\n");

  const cases: { name: string; series: number[]; ageMin?: number }[] = [];

  const real = await realSeries().catch((e) => {
    console.log(`(Dexcom fetch skipped: ${e.message})\n`);
    return null;
  });
  if (real && real.series.length) {
    const last = real.readings[real.readings.length - 1];
    const ageMin = (Date.now() - last.ts) / 60000;
    const slope = slopePerMin(real.readings, 20);
    console.log(
      `Live Dexcom: ${real.readings.length} readings, newest ${last.mmol} mmol ` +
        `(${zone(last.mmol)}), age ${ageMin.toFixed(0)} min, slope ${slope.toFixed(3)} mmol/min\n`,
    );
    cases.push({ name: "live", series: real.series, ageMin });
  } else {
    console.log("No Dexcom creds — using synthetic curves.\n");
  }
  cases.push({ name: "calm", series: syntheticSeries("calm") });
  cases.push({ name: "dramatic", series: syntheticSeries("dramatic") });

  for (const c of cases) {
    const opts = { style: "bars" as const, band: true, emphasizeLast: true, ageMin: c.ageMin };
    const mug = renderGlucoseGif(c.series, opts);
    const info = fmt(mug); // throws if invalid
    const { path, url } = publishGif(mug, `glucose_${c.name}.gif`);

    const preview = renderPreviewGif(c.series, 16, opts);
    const previewPath = join(OUT, `preview_${c.name}.gif`);
    writeFileSync(previewPath, preview);

    const cols = binToCols(c.series);
    const newest = cols[cols.length - 1];
    console.log(`■ ${c.name.padEnd(9)} newest ${newest.toFixed(1)} mmol (${zone(newest)})`);
    console.log(`  mug gif : ${info}`);
    console.log(`  file    : ${path}${url ? `\n  url     : ${url}` : "  (set GIF_PUBLIC_BASE_URL for a live url)"}`);
    console.log(`  preview : ${previewPath}\n`);
  }

  console.log("✓ all mug GIFs passed the 32x16 / GIF89a / ≤40KB checks.");
}

main().catch((e) => {
  console.error("dry run failed:", e);
  process.exit(1);
});
