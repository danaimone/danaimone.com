import { describe, expect, test } from "bun:test";
import { rng } from "./art";
import { PROP_SHEET, TREE_SHEET } from "./sheets";
import { BLEND_WIDTH, GROUNDS, STAND_SPACING, hasCentreDash, placeProps, plantStands, groundAt, groundIndexAt } from "./path";
import { WORLD_WIDTH } from "./world";

describe("path props", () => {
  test("nothing grows out of paved ground, at any seed", () => {
    for (const seed of [1, 9, 77, 12345]) {
      for (const prop of placeProps(rng(seed))) {
        const left = GROUNDS[groundIndexAt(prop.x)];
        const right = GROUNDS[groundIndexAt(prop.x + PROP_SHEET.width)];
        expect(left.props).toContain(prop.kind);
        expect(right.props).toContain(prop.kind);
      }
    }
  });

  test("no prop touches a change of ground or the dithered blend before it, across many walks", () => {
    const seams = GROUNDS.filter((ground) => ground.until !== Infinity).map((ground) => ground.until);
    for (let seed = 1; seed <= 500; seed++) {
      for (const prop of placeProps(rng(seed))) {
        const touched = seams.filter((seam) => prop.x + PROP_SHEET.width > seam - BLEND_WIDTH && prop.x < seam);
        expect({ prop, touched }).toEqual({ prop, touched: [] });
      }
    }
  });

  test("natural ground still gets props", () => {
    expect(placeProps(rng(9)).length).toBeGreaterThan(3);
  });
});

describe("tree stands", () => {
  const TREE_WIDTH = TREE_SHEET.width;
  const plant = (seed: number) => plantStands(rng(seed), 0, WORLD_WIDTH, TREE_WIDTH, groundAt);
  const speciesOf = (kind: number, x: number) => groundAt(x).trees.findIndex((species) => species.includes(kind));
  const standsOf = (seed: number) => {
    const stands: { species: number; x: number }[][] = [];
    for (const tree of plant(seed)) {
      const last = stands.at(-1)?.at(-1);
      const member = { species: speciesOf(tree.kind, tree.x), x: tree.x };
      if (last && tree.x - last.x <= TREE_WIDTH * STAND_SPACING[1]) stands.at(-1)!.push(member);
      else stands.push([member]);
    }
    return stands;
  };

  test("every tree is a species of the stretch it grows in", () => {
    for (const seed of [1, 9, 77, 12345]) {
      for (const tree of plant(seed)) expect(speciesOf(tree.kind, tree.x)).toBeGreaterThanOrEqual(0);
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
      const trees = plant(seed);
      for (let i = 1; i < trees.length; i++) expect(trees[i].x - trees[i - 1].x).toBeGreaterThan(TREE_WIDTH / 3);
    }
  });
});

describe("road markings", () => {
  test("centre dashes run on full asphalt only and stop before each dithered blend", () => {
    const road = GROUNDS.findIndex((ground) => ground.name === "asphalt");
    const from = GROUNDS[road - 1].until;
    const to = GROUNDS[road].until;
    const dashed = Array.from({ length: to + 200 }, (_, x) => x).filter(hasCentreDash);
    expect(dashed.length).toBeGreaterThan(100);
    expect(Math.min(...dashed)).toBeGreaterThanOrEqual(from);
    expect(Math.max(...dashed)).toBeLessThan(to - BLEND_WIDTH);
  });
});
