/**
 * dryrun.ts (face-emoji branch) — render the glucose FACE without a mug or token.
 *
 *   bun run dryrun
 *
 * Renders every expression to ./out and, if Dexcom creds are in .env, the face
 * that matches your live level. Each mug GIF is validated against the talPlayGif
 * constraints (32x16, GIF89a, <=40KB).
 */
import { renderFacePreviewGif, expressionForLevel, EXPRESSIONS } from "./face";
import { faceGif, faceSource } from "./facepack";
import { assertMugGif } from "./render";
import { publishGif } from "./hosting";
import { DexcomShare } from "./dexcom";
import { assess, DEFAULT_THRESHOLDS } from "./alerts";
import { syntheticReadings } from "./synthetic";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = join(import.meta.dir, "..", "out");

async function liveExpression() {
  const username = process.env.DEXCOM_USERNAME;
  const password = process.env.DEXCOM_PASSWORD;
  if (!username || !password) return null;
  const dex = new DexcomShare({ username, password, region: (process.env.DEXCOM_REGION as any) ?? "eu" });
  const readings = await dex.fetchSeries(6);
  if (!readings.length) return null;
  const a = assess(readings, DEFAULT_THRESHOLDS, Date.now());
  return { level: a.level, mmol: readings[readings.length - 1].mmol, expr: expressionForLevel(a.level) };
}

async function main() {
  console.log("PixelMug P1 glucose FACE — dry run\n");

  const live = await liveExpression().catch((e) => {
    console.log(`(Dexcom fetch skipped: ${e.message})\n`);
    return null;
  });
  if (live) {
    console.log(`Live Dexcom: ${live.mmol.toFixed(1)} mmol (${live.level}) -> face:${live.expr}\n`);
  } else {
    const a = assess(syntheticReadings("calm"), DEFAULT_THRESHOLDS, Date.now());
    console.log(`No Dexcom creds — synthetic level ${a.level} -> face:${expressionForLevel(a.level)}\n`);
  }

  const pack = process.env.FACE_PACK;
  console.log(pack ? `Using face pack: ${pack} (missing files fall back to built-in)\n` : "Using built-in NOT-man faces\n");

  for (const e of EXPRESSIONS) {
    const mug = faceGif(e); // pack GIF if present & valid, else built-in
    const info = assertMugGif(mug); // throws if invalid
    const src = faceSource(e);
    const { path } = publishGif(mug, `face_${e}.gif`);
    if (src === "built-in") writeFileSync(join(OUT, `preview_face_${e}.gif`), renderFacePreviewGif(e, 12));
    const mark = live && live.expr === e ? "  <- your level now" : "";
    console.log(`■ ${e.padEnd(8)} ${src.padEnd(8)} ${info.header} ${info.w}x${info.h} ${String(info.size).padStart(5)}B${mark}`);
    console.log(`  mug : ${path}`);
  }

  console.log("\n✓ all face GIFs passed the 32x16 / GIF89a / <=40KB checks.");
}

main().catch((e) => {
  console.error("dry run failed:", e);
  process.exit(1);
});
