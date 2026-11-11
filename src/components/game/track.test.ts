import { describe, expect, test } from "bun:test";
import { WALK_END, WALK_START, finaleAt, fractionOf, progressAt, scrollKeepingPlace, worldAt } from "./track";
import { TIMELINE } from "./world";

describe("scroll track", () => {
  test("the walk starts at the trailhead and reaches the cabin before the page ends", () => {
    expect(worldAt(0)).toBe(WALK_START);
    expect(fractionOf({ kind: "world", x: WALK_END })).toBeLessThan(1);
  });

  test("a world position survives the round trip through scroll", () => {
    for (const x of [WALK_START, 770, 1640, 2420, 3270, WALK_END]) {
      expect(worldAt(fractionOf({ kind: "world", x }))).toBeCloseTo(x);
    }
  });

  test("the finale plays only after the walk has finished", () => {
    const arrival = fractionOf({ kind: "world", x: WALK_END });
    expect(finaleAt(arrival)).toBe(0);
    expect(finaleAt(fractionOf({ kind: "cabin" }))).toBe(1);
  });

  test("the cabin stop goes all the way inside", () => {
    expect(fractionOf({ kind: "cabin" })).toBe(1);
  });

  test("timeline marks land where the walk shows them", () => {
    for (const mark of TIMELINE) {
      expect(progressAt(worldAt(fractionOf(mark.destination)))).toBeCloseTo(mark.at);
    }
  });
});

describe("keeping the visitor's place when the walk changes length", () => {
  const portrait = { top: 0, travel: 4980 };
  const landscape = { top: 0, travel: 2301 };

  test("a visitor in the walk stays at the same fraction of it, ends included", () => {
    for (const fraction of [0, 0.35, 0.5, 1]) {
      const kept = scrollKeepingPlace(fraction * portrait.travel, portrait, landscape)!;
      expect(kept / landscape.travel).toBeCloseTo(fraction);
      expect(scrollKeepingPlace(kept, landscape, portrait)! / portrait.travel).toBeCloseTo(fraction);
    }
  });

  test("the page is not scrolled for a reader above or below the walk", () => {
    expect(scrollKeepingPlace(-40, portrait, landscape)).toBeNull();
    expect(scrollKeepingPlace(portrait.travel + 900, portrait, landscape)).toBeNull();
  });

  test("the page is not scrolled when the walk keeps its length", () => {
    expect(scrollKeepingPlace(1743, portrait, { ...portrait })).toBeNull();
  });
});
