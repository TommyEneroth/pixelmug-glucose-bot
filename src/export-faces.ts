/**
 * export-faces.ts — write the six built-in NOT-man faces to a folder as
 * editable 32x16 GIFs, so you can start a new face pack from them.
 *
 *   bun run export-faces            # -> ./faces/<expr>.gif
 *   bun run export-faces my-theme   # -> ./my-theme/<expr>.gif
 *
 * Edit / replace those files (keep them 32x16, GIF, <=40 KB), then run the bot
 * with FACE_PACK=<folder>. See the README "Making a face pack" section.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { EXPRESSIONS, renderFaceGif } from "./face";

const dir = process.argv[2] ?? "faces";
mkdirSync(dir, { recursive: true });
for (const e of EXPRESSIONS) {
  const path = join(dir, `${e}.gif`);
  writeFileSync(path, renderFaceGif(e));
  console.log("wrote", path);
}
console.log(`\nEdit these, then run:  FACE_PACK=${dir} bun run bot`);
