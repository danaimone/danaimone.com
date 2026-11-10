import { describe, expect, test } from "bun:test";
import { PROP_SHEET } from "./assets";
import { BLEND_WIDTH, SURFACES, hasCentreDash, placeProps, plantStands, surfaceAt, surfaceIndexAt } from "./path";

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

describe("tree stands", () => {
  const TREE_WIDTH = 112;
  const speciesOf = (kind: number, x: number) => surfaceAt(x).trees.findIndex((species) => species.includes(kind));
  const standsOf = (seed: number) => {
    const stands: { species: number; x: number }[][] = [];
    for (const tree of plantStands(seeded(seed), 340, 4000, TREE_WIDTH, surfaceAt)) {
      const last = stands.at(-1)?.at(-1);
      const member = { species: speciesOf(tree.kind, tree.x), x: tree.x };
      if (last && tree.x - last.x <= TREE_WIDTH * 0.7) stands.at(-1)!.push(member);
      else stands.push([member]);
    }
    return stands;
  };

  test("every tree is a species of the stretch it grows in", () => {
    for (const seed of [1, 9, 77, 12345]) {
      for (const tree of plantStands(seeded(seed), 340, 4000, TREE_WIDTH, surfaceAt)) expect(speciesOf(tree.kind, tree.x)).toBeGreaterThanOrEqual(0);
    }
  });

  test("a stand that stays inside one stretch is one species", () => {
    for (const seed of [1, 9, 77, 12345]) {
      for (const stand of standsOf(seed)) {
        expect(new Set(stand.map(({ species }) => species)).size).toBe(1);
      }
    }
  });

  test("trees in a stand overlap less than two thirds, so none hides another", () => {
    for (const seed of [1, 9, 77]) {
      const trees = plantStands(seeded(seed), 340, 4000, TREE_WIDTH, surfaceAt);
      for (let i = 1; i < trees.length; i++) expect(trees[i].x - trees[i - 1].x).toBeGreaterThan(TREE_WIDTH / 3);
    }
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
