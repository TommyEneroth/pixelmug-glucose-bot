/**
 * facepack.ts — pick the GIF for an expression, from a swappable "face pack".
 *
 * A face pack is just a folder of six 32x16 GIFs named by expression:
 *   happy.gif  worried.gif  panic.gif  queasy.gif  sick.gif  sleep.gif
 *
 * Set FACE_PACK=<folder> to use it. Any file that's missing (or the whole pack,
 * if FACE_PACK is unset) falls back to the built-in NOT-man face. Every pack GIF
 * is validated against the mug's talPlayGif rules (32x16, GIF87a/89a, <=40 KB).
 */
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { renderFaceGif, type Expr } from "./face";
import { assertMugGif } from "./render";

/** Absolute path to the pack file for `expr`, or null if no pack is configured. */
export function packFile(expr: Expr): string | null {
  const pack = process.env.FACE_PACK;
  if (!pack) return null;
  const dir = isAbsolute(pack) ? pack : join(process.cwd(), pack);
  return join(dir, `${expr}.gif`);
}

/** The GIF bytes to show for `expr`: the pack file if present & valid, else built-in. */
export function faceGif(expr: Expr): Uint8Array {
  const file = packFile(expr);
  if (file && existsSync(file)) {
    const bytes = new Uint8Array(readFileSync(file));
    assertMugGif(bytes); // throws a clear error if the pack GIF breaks the mug's rules
    return bytes;
  }
  return renderFaceGif(expr);
}

/** Where each expression's GIF is coming from — for logging / dry-run output. */
export function faceSource(expr: Expr): "pack" | "built-in" {
  const file = packFile(expr);
  return file && existsSync(file) ? "pack" : "built-in";
}
