import { expect, test, describe, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GIFEncoder } from "gifenc";
import { faceGif, faceSource } from "../src/facepack";
import { assertMugGif } from "../src/render";

const PAL: [number, number, number][] = [[0, 0, 0], [255, 0, 0]];

function gif(w: number, h: number): Uint8Array {
  const g = GIFEncoder();
  g.writeFrame(new Uint8Array(w * h).fill(1), w, h, { palette: PAL });
  g.finish();
  return g.bytes();
}

afterEach(() => {
  delete process.env.FACE_PACK;
});

describe("face packs", () => {
  test("no pack -> built-in face, valid mug GIF", () => {
    const bytes = faceGif("happy");
    expect(faceSource("happy")).toBe("built-in");
    expect(() => assertMugGif(bytes)).not.toThrow();
  });

  test("valid pack file is used over the built-in", () => {
    const dir = mkdtempSync(join(tmpdir(), "pack-"));
    const custom = gif(32, 16);
    writeFileSync(join(dir, "happy.gif"), custom);
    process.env.FACE_PACK = dir;
    expect(faceSource("happy")).toBe("pack");
    expect(faceGif("happy")).toEqual(custom);
    // a missing expression in the pack falls back to built-in
    expect(faceSource("sick")).toBe("built-in");
  });

  test("a pack GIF with wrong dimensions is rejected", () => {
    const dir = mkdtempSync(join(tmpdir(), "badpack-"));
    writeFileSync(join(dir, "happy.gif"), gif(16, 16)); // not 32x16
    process.env.FACE_PACK = dir;
    expect(() => faceGif("happy")).toThrow();
  });
});
