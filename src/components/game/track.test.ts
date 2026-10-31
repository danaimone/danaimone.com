import { describe, expect, test } from "bun:test";
import { KEY_STEP, WALK_END, WALK_START, finaleAt, fractionOf, progressAt, worldAt } from "./track";
import { TIMELINE } from "./world";

describe("scroll track", () => {
  test("the walk starts at the trailhead and reaches the cabin before the page ends", () => {
    expect(worldAt(0)).toBe(WALK_START);
    expect(worldAt(fractionOf({ kind: "world", x: WALK_END }))).toBeCloseTo(WALK_END);
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

  test("a key step covers the declared walking speed", () => {
    expect(worldAt(KEY_STEP) - worldAt(0)).toBeCloseTo(2.15);
  });
});
