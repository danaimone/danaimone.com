import { describe, expect, test } from "bun:test";
import { PROP_SHEET } from "./assets";
import { BLEND_WIDTH, SURFACES, hasCentreDash, placeProps, surfaceIndexAt } from "./path";

const seeded = (start: number) => {
  let value = start;
  return () => {
    value = (value * 16807) % 2147483647;
    return value / 2147483647;
  };
};

describe("path props", () => {
  test("nothing grows out of a paved surface, at any seed", () => {
    for (const seed of [1, 9, 77, 12345]) {
      for (const prop of placeProps(seeded(seed))) {
        const left = SURFACES[surfaceIndexAt(prop.x)];
        const right = SURFACES[surfaceIndexAt(prop.x + PROP_SHEET.width)];
        expect(left.props).toContain(prop.kind);
        expect(right.props).toContain(prop.kind);
      }
    }
  });

  test("no prop touches a surface change or the dithered blend before it, across many walks", () => {
    const seams = SURFACES.filter((surface) => surface.until !== Infinity).map((surface) => surface.until);
    for (let seed = 1; seed <= 500; seed++) {
      for (const prop of placeProps(seeded(seed))) {
        const touched = seams.filter((seam) => prop.x + PROP_SHEET.width > seam - BLEND_WIDTH && prop.x < seam);
        expect({ prop, touched }).toEqual({ prop, touched: [] });
      }
    }
  });

  test("natural ground still gets props", () => {
    expect(placeProps(seeded(9)).length).toBeGreaterThan(3);
  });
});

describe("road markings", () => {
  test("centre dashes run on full asphalt only and stop before each dithered blend", () => {
    const road = SURFACES.findIndex((surface) => surface.name === "asphalt");
    const from = SURFACES[road - 1].until;
    const to = SURFACES[road].until;
    const dashed = Array.from({ length: to + 200 }, (_, x) => x).filter(hasCentreDash);
    expect(dashed.length).toBeGreaterThan(100);
    expect(Math.min(...dashed)).toBeGreaterThanOrEqual(from);
    expect(Math.max(...dashed)).toBeLessThan(to - BLEND_WIDTH);
  });
});
