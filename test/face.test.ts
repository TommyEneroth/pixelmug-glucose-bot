import { expect, test, describe } from "bun:test";
import { renderFaceGif, expressionForLevel, EXPRESSIONS } from "../src/face";
import { assertMugGif } from "../src/render";

describe("face GIFs", () => {
  for (const e of EXPRESSIONS) {
    test(`${e}: valid 32x16 GIF89a <=40KB`, () => {
      const info = assertMugGif(renderFaceGif(e)); // throws on any violation
      expect(info.w).toBe(32);
      expect(info.h).toBe(16);
      expect(info.header).toBe("GIF89a");
      expect(info.size).toBeLessThanOrEqual(40 * 1024);
    });
  }
});

describe("expressionForLevel mapping", () => {
  test("glucose level -> expression", () => {
    expect(expressionForLevel("urgentLow")).toBe("panic");
    expect(expressionForLevel("predLow")).toBe("worried");
    expect(expressionForLevel("ok")).toBe("happy");
    expect(expressionForLevel("predHigh")).toBe("queasy");
    expect(expressionForLevel("urgentHigh")).toBe("sick");
    expect(expressionForLevel("stale")).toBe("sleep");
    expect(expressionForLevel("unknown")).toBe("sleep");
  });
});
