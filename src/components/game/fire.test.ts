import { describe, expect, test } from "bun:test";
import { createFire } from "./fire";
import { rng } from "./art";
import layouts from "./room-layouts.json";

describe("the cabin fire", () => {
  for (const name of ["wide", "tall"] as const) {
    const { fireBox, hearth } = layouts[name];
    const size = { width: fireBox.width, height: fireBox.height };
    const lit = (pixels: Uint8ClampedArray) => {
      const cells: number[] = [];
      for (let i = 3; i < pixels.length; i += 4) if (pixels[i]) cells.push((i - 3) / 4);
      return cells;
    };

    test(`${name}: flames rise from the logs and never cover them`, () => {
      const fire = createFire({ ...hearth, ...size }, rng(1));
      const pixels = new Uint8ClampedArray(size.width * size.height * 4);
      fire.paint(pixels);
      const cells = lit(pixels);
      expect(cells.length).toBeGreaterThan(200);
      for (const cell of cells) expect(Math.floor(cell / size.width)).toBeLessThan(hearth.floor[cell % size.width]);
    });

    test(`${name}: two visits do not see the same fire`, () => {
      const [first, second] = [rng(1), rng(2)].map((random) => {
        const pixels = new Uint8ClampedArray(size.width * size.height * 4);
        createFire({ ...hearth, ...size }, random).paint(pixels);
        return lit(pixels).join();
      });
      expect(first).not.toBe(second);
    });
  }
});
