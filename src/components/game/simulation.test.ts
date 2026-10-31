import { describe, expect, test } from "bun:test";
import { createSimulation, type WalkEffect, type WalkInput } from "./simulation";
import { fractionOf } from "./track";
import { GEMS, PROMOTION_X, STOPS } from "./world";

const fractionFor = (x: number) => fractionOf({ kind: "world", x });

function walker({ reduced = false, viewWidth = 480 } = {}) {
  const simulation = createSimulation({ reduced });
  const seen: WalkEffect[] = [];
  let fraction = 0;
  const tick = (overrides: Partial<WalkInput> = {}) => {
    const effects = simulation.step({ fraction, walkDirection: 0, viewWidth, ...overrides });
    for (const effect of effects) if (effect.kind === "scroll") fraction = effect.fraction;
    seen.push(...effects);
    return effects;
  };
  const settle = (ticks = 400) => {
    for (let i = 0; i < ticks; i++) tick();
  };
  const scrollTo = (next: number) => {
    fraction = next;
  };
  const walkTo = (x: number) => {
    const target = fractionFor(x);
    while (Math.abs(fraction - target) > 1e-6) {
      fraction += Math.sign(target - fraction) * Math.min(0.0008, Math.abs(target - fraction));
      tick();
    }
    settle(60);
  };
  const kinds = (kind: WalkEffect["kind"]) => seen.filter((effect) => effect.kind === kind);
  return { simulation, tick, settle, scrollTo, walkTo, kinds };
}

describe("walking", () => {
  test("opens with Dan and Mishka walking in from off screen", () => {
    const walk = walker();
    walk.tick();
    expect(walk.simulation.view().dan.x).toBeLessThan(90);
    walk.settle();
    expect(Math.abs(walk.simulation.view().dan.x - 90)).toBeLessThan(1);
  });

  test("reduced motion skips the opening", () => {
    const walk = walker({ reduced: true });
    walk.tick();
    expect(walk.simulation.view().dan.x).toBe(90);
  });

  test("Mishka trails Dan and catches up", () => {
    const walk = walker();
    walk.walkTo(1000);
    walk.settle();
    const { dan, mishka } = walk.simulation.view();
    expect(mishka.x).toBeLessThan(dan.x);
    expect(Math.abs(dan.x - mishka.x - 46)).toBeLessThan(1);
  });

  test("jump lifts Dan first, then Mishka, and both land", () => {
    const walk = walker();
    walk.settle();
    walk.simulation.jump();
    walk.tick();
    expect(walk.simulation.view().dan.lift).toBeGreaterThan(0);
    expect(walk.simulation.view().mishka.lift).toBe(0);
    walk.settle(12);
    expect(walk.simulation.view().mishka.lift).toBeGreaterThan(0);
    walk.settle(80);
    expect(walk.simulation.view().dan.lift).toBe(0);
    expect(walk.simulation.view().mishka.lift).toBe(0);
  });

  test("held arrow keys scroll, and stop at both ends", () => {
    const walk = walker();
    walk.settle();
    expect(walk.tick({ walkDirection: -1 }).find((e) => e.kind === "scroll")).toEqual({ kind: "scroll", fraction: 0 });
    walk.scrollTo(1);
    expect(walk.tick({ walkDirection: 1 }).find((e) => e.kind === "scroll")).toEqual({ kind: "scroll", fraction: 1 });
  });
});

describe("fast scrolling", () => {
  test("Dan sprints to catch up and never skips", () => {
    const walk = walker();
    walk.settle();
    walk.scrollTo(fractionFor(3000));
    let previous = walk.simulation.view().dan.x;
    let longestStride = 0;
    let moves = 0;
    for (let i = 0; i < 420; i++) {
      walk.tick();
      const { x } = walk.simulation.view().dan;
      longestStride = Math.max(longestStride, x - previous);
      if (x > previous) moves += 1;
      previous = x;
    }
    expect(longestStride).toBeLessThanOrEqual(80);
    expect(moves).toBeGreaterThan(30);
    expect(Math.abs(previous - 3000)).toBeLessThan(1);
  });

  test("Mishka keeps up at a sprint", () => {
    const walk = walker();
    walk.settle();
    walk.scrollTo(fractionFor(3000));
    walk.settle(480);
    const { dan, mishka } = walk.simulation.view();
    expect(Math.abs(dan.x - mishka.x - 46)).toBeLessThan(1);
  });
});

describe("gems and the promotion", () => {
  test("walking the whole path announces each gem once and the promotion once", () => {
    const walk = walker();
    walk.settle();
    walk.walkTo(3900);
    expect(walk.kinds("gem")).toHaveLength(GEMS.length);
    expect(walk.kinds("promoted")).toHaveLength(1);
  });

  test("a fast scroll collects gems quietly at a sprint", () => {
    const walk = walker();
    walk.settle();
    walk.scrollTo(fractionFor(3000));
    walk.settle(200);
    expect(walk.simulation.view().collected.size).toBe(GEMS.filter((gem) => gem.x <= 3000).length);
    expect(walk.kinds("gem")).toHaveLength(0);
    expect(walk.kinds("promoted")).toHaveLength(0);
  });

  test("reduced motion never announces, even on a short scroll", () => {
    const walk = walker({ reduced: true });
    walk.tick();
    walk.scrollTo(fractionFor(PROMOTION_X + 10));
    walk.tick();
    expect(walk.simulation.view().dan.x).toBeCloseTo(PROMOTION_X + 10);
    walk.scrollTo(fractionFor(PROMOTION_X + 400));
    walk.settle(200);
    expect(walk.simulation.view().collected.size).toBeGreaterThan(0);
    expect(walk.kinds("gem")).toHaveLength(0);
    expect(walk.kinds("promoted")).toHaveLength(0);
  });
});

describe("teleport", () => {
  test("hides the move: Dan changes place at the peak of the beam, without toasts", () => {
    const walk = walker();
    walk.settle();
    walk.simulation.teleport({ kind: "world", x: 2420 });
    let peak = 0;
    for (let i = 0; i < 21; i++) {
      walk.tick();
      peak = Math.max(peak, walk.simulation.view().warpLevel);
    }
    expect(walk.simulation.view().dan.x).toBeLessThan(100);
    walk.tick();
    expect(walk.simulation.view().dan.x).toBeCloseTo(2420);
    expect(peak).toBeGreaterThan(0.9);
    walk.settle(40);
    expect(walk.simulation.view().warpLevel).toBe(0);
    expect(walk.kinds("gem")).toHaveLength(0);
    expect(walk.kinds("promoted")).toHaveLength(0);
  });

  test("a short teleport still snaps instead of walking", () => {
    const walk = walker();
    walk.settle();
    walk.simulation.teleport({ kind: "world", x: 300 });
    for (let i = 0; i < 22; i++) walk.tick();
    expect(walk.simulation.view().dan.x).toBeCloseTo(300);
  });

  test("arrow keys are ignored during the beam", () => {
    const walk = walker();
    walk.settle();
    walk.simulation.teleport({ kind: "world", x: 2420 });
    const scrolls = walk.tick({ walkDirection: 1 }).filter((e) => e.kind === "scroll");
    expect(scrolls).toHaveLength(0);
  });

  test("reduced motion jumps straight there", () => {
    const walk = walker({ reduced: true });
    walk.tick();
    walk.simulation.teleport({ kind: "cabin" });
    walk.tick();
    expect(walk.simulation.view().warpLevel).toBe(0);
    expect(walk.simulation.view().finale).toBe(1);
  });
});

describe("zones", () => {
  test("each stop opens its own zone, in career order", () => {
    const walk = walker();
    walk.settle();
    walk.walkTo(3900);
    const zones = walk.kinds("zone").flatMap((e) => (e.kind === "zone" ? [e.zone] : []));
    expect(zones.filter((z) => z !== "between")).toEqual(["intro", ...STOPS.map((stop) => stop.id)]);
  });

  test("the card sits on the side away from the building", () => {
    const walk = walker({ viewWidth: 480 });
    walk.settle();
    walk.walkTo(600);
    const zone = walk.kinds("zone").at(-1);
    expect(zone).toEqual({ kind: "zone", zone: "pnnl", side: "left" });
  });

  test("contact opens inside the cabin", () => {
    const walk = walker();
    walk.settle();
    walk.scrollTo(1);
    walk.settle(5);
    expect(walk.kinds("zone").at(-1)).toEqual({ kind: "zone", zone: "contact", side: "left" });
  });
});
