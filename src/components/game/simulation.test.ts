import { describe, expect, test } from "bun:test";
import { cameraAt, createSimulation, createStepClock, type WalkEffect, type WalkInput } from "./simulation";
import { fractionOf } from "./track";
import { GEMS, PROMOTION_X, STOPS } from "./world";

const fractionFor = (x: number) => fractionOf({ kind: "world", x });

function walker({ reduced = false, viewWidth = 480, cardSpan = 163, random = (): number => 1 } = {}) {
  const simulation = createSimulation({ reduced, random });
  const seen: WalkEffect[] = [];
  let fraction = 0;
  const tick = (overrides: Partial<WalkInput> = {}) => {
    const effects = simulation.step({ fraction, walkDirection: 0, viewWidth, cardSpan, ...overrides });
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
  const walkOne = (x: number) => {
    fraction = fractionFor(x);
    return [...tick(), ...tick(), ...tick(), ...tick()];
  };
  const kinds = (kind: WalkEffect["kind"]) => seen.filter((effect) => effect.kind === kind);
  return { simulation, tick, settle, scrollTo, walkTo, walkOne, kinds };
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

  test("Mishka stays beside Dan at the cabin door instead of walking through him", () => {
    const walk = walker();
    walk.settle();
    walk.scrollTo(fractionFor(3900));
    walk.settle(480);
    walk.scrollTo(0.95);
    walk.settle(240);
    const { dan, mishka } = walk.simulation.view();
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

describe("frame pacing", () => {
  const STEADY_SCROLL_PER_STEP = 0.0004;

  function frameMoves(frameMs: (frame: number) => number) {
    const walk = walker();
    const clock = createStepClock();
    let fraction = 0.05;
    const advance = (steps: number) => {
      for (let i = 0; i < steps; i++) {
        fraction += STEADY_SCROLL_PER_STEP;
        walk.scrollTo(fraction);
        walk.tick();
      }
    };
    advance(240);
    let last = 0;
    const moves = Array.from({ length: 240 }, (_, frame) => {
      const { steps, blend } = clock(frameMs(frame));
      advance(steps);
      const { x } = walk.simulation.view(blend).dan;
      const move = x - last;
      last = x;
      return move;
    });
    return moves.slice(1);
  }

  const spread = (moves: number[]) => Math.max(...moves) / Math.min(...moves);

  test("Dan moves on every frame of a 120 Hz screen, by an even amount", () => {
    expect(spread(frameMoves(() => 1000 / 120))).toBeLessThan(1.1);
  });

  test("a screen just faster than the step rate never drops a beat", () => {
    expect(spread(frameMoves(() => 16.5))).toBeLessThan(1.1);
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

  test("the frame after the move shows Dan there, not on the way", () => {
    const walk = walker();
    walk.settle();
    walk.simulation.teleport({ kind: "world", x: 2420 });
    for (let i = 0; i < 22; i++) walk.tick();
    expect(walk.simulation.view(0).dan.x).toBeCloseTo(2420);
    expect(walk.simulation.view(0).mishka.x).toBeCloseTo(2420 - 46);
  });

  test("a short teleport still snaps instead of walking", () => {
    const walk = walker();
    walk.settle();
    walk.simulation.teleport({ kind: "world", x: 300 });
    for (let i = 0; i < 22; i++) walk.tick();
    expect(walk.simulation.view().dan.x).toBeCloseTo(300);
  });

  test("a visitor who leaves the walk during the beam is not pulled back", () => {
    const walk = walker();
    walk.settle();
    walk.simulation.teleport({ kind: "world", x: 2420 });
    for (let i = 0; i < 5; i++) walk.tick();
    walk.scrollTo(1);
    const scrolls = Array.from({ length: 60 }, () => walk.tick({ pinned: false })).flat().filter((effect) => effect.kind === "scroll");
    expect(scrolls).toHaveLength(0);
    expect(walk.simulation.view().warpLevel).toBe(0);
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

  for (const [viewWidth, cardSpan] of [[480, 163], [854, 163]]) {
    test(`no card covers its landmark's focus at any step, ${viewWidth} wide`, () => {
      const walk = walker({ viewWidth, cardSpan });
      walk.settle();
      let zone = "";
      const overlaps: string[] = [];
      const checked = new Set<string>();
      for (let x = 100; x < 3900; x += 2) {
        for (const effect of walk.walkOne(x)) {
          if (effect.kind === "zone") zone = effect.zone;
        }
        const stop = STOPS.find((candidate) => candidate.id === zone);
        if (!stop) continue;
        checked.add(stop.id);
        const left = stop.landmark.x + stop.landmark.focus.x - cameraAt(walk.simulation.view().dan.x, viewWidth);
        const right = left + stop.landmark.focus.width;
        const covered = stop.cardSide === "left" ? right > 0 && left < cardSpan : left < viewWidth && right > viewWidth - cardSpan;
        if (covered) overlaps.push(`${stop.id} at ${x}`);
      }
      expect([...checked]).toEqual(STOPS.map((stop) => stop.id));
      expect(overlaps).toEqual([]);
    });
  }

  test("a full-width phone card stays up the whole stretch of its stop", () => {
    const walk = walker({ viewWidth: 293, cardSpan: 0 });
    walk.settle();
    walk.walkTo(1400);
    for (let x = 1402; x <= 1860; x += 2) walk.walkOne(x);
    const zones = walk.kinds("zone").flatMap((e) => (e.kind === "zone" ? [e.zone] : []));
    expect(zones.slice(-1)).toEqual(["chewy"]);
  });

  test("contact opens inside the cabin", () => {
    const walk = walker();
    walk.settle();
    walk.scrollTo(1);
    walk.settle(5);
    expect(walk.kinds("zone").at(-1)).toEqual({ kind: "zone", zone: "contact" });
  });
});

describe("following a finger", () => {
  const finger = { followsScroll: true };
  const midWalk = 700;

  function atRest(options = {}) {
    const walk = walker(options);
    walk.settle();
    walk.scrollTo(fractionFor(midWalk));
    walk.tick(finger);
    walk.settle(60);
    return walk;
  }

  test("Dan is where the finger put him on the same tick", () => {
    const walk = atRest();
    walk.scrollTo(fractionFor(midWalk + 300));
    walk.tick(finger);
    expect(walk.simulation.view().dan.x).toBeCloseTo(midWalk + 300, 5);
  });

  test("between ticks Dan is drawn where the page is now, so frames without a tick do not stall him", () => {
    const walk = atRest();
    walk.scrollTo(fractionFor(midWalk + 10));
    walk.tick(finger);
    expect(walk.simulation.view(0.5, fractionFor(midWalk + 19)).dan.x).toBeCloseTo(midWalk + 19, 5);
  });

  test("Dan stops walking within 100 ms of the scroll stopping", () => {
    const walk = atRest();
    walk.scrollTo(fractionFor(midWalk + 20));
    walk.tick(finger);
    expect(walk.simulation.view().dan.moving).toBe(true);
    for (let tick = 0; tick < 6; tick++) walk.tick(finger);
    expect(walk.simulation.view().dan.moving).toBe(false);
  });

  test("gaps between finger samples do not flicker Dan into standing", () => {
    const walk = atRest();
    for (let sample = 1; sample <= 8; sample++) {
      walk.scrollTo(fractionFor(midWalk + sample));
      walk.tick(finger);
      expect(walk.simulation.view().dan.moving).toBe(true);
      walk.tick(finger);
      expect(walk.simulation.view().dan.moving).toBe(true);
    }
  });

  test("Dan turns with the finger", () => {
    const walk = atRest();
    walk.scrollTo(fractionFor(midWalk - 10));
    walk.tick(finger);
    expect(walk.simulation.view().dan.facing).toBe("left");
  });

  test("Mishka stays on screen through a flick", () => {
    const walk = atRest({ viewWidth: 292 });
    for (let x = midWalk; x < midWalk + 800; x += 40) {
      walk.scrollTo(fractionFor(x));
      walk.tick(finger);
      const { dan, mishka } = walk.simulation.view();
      expect(dan.x - mishka.x).toBeLessThan(292 * 0.36);
    }
  });

  test("a mouse wheel still sprints instead of skipping", () => {
    const walk = atRest();
    walk.scrollTo(fractionFor(midWalk + 600));
    walk.tick();
    expect(walk.simulation.view().dan.x).toBeLessThan(midWalk + 300);
  });

  test("the opening still plays before the first drag", () => {
    const walk = walker();
    walk.tick(finger);
    expect(walk.simulation.view().dan.x).toBeLessThan(90);
  });

  test("a drag during the opening takes over at once", () => {
    const walk = walker();
    walk.tick(finger);
    walk.scrollTo(fractionFor(120));
    walk.tick(finger);
    expect(walk.simulation.view().dan.x).toBeCloseTo(120, 5);
  });
});

describe("Mishka's idle tricks", () => {
  const STILL_SECONDS = 10;
  const rolls = (...values: number[]) => {
    let next = 0;
    return () => values[Math.min(next++, values.length - 1)];
  };
  const circle = () => rolls(0, 0.1, 1);
  const bark = () => rolls(0, 0.9, 1);

  function stillBeside(random: () => number, options = {}) {
    let rolled = false;
    const walk = walker({
      random: () => {
        rolled = true;
        return random();
      },
      ...options,
    });
    for (let tick = 0; tick < 60 * STILL_SECONDS && !rolled; tick++) walk.tick();
    return walk;
  }
  const dog = (walk: ReturnType<typeof walker>) => walk.simulation.view().mishka;

  test("nothing happens while Dan has only just stopped", () => {
    const walk = walker({ random: () => 0 });
    walk.settle(150);
    expect(dog(walk).barking).toBe(false);
    expect(Math.abs(dog(walk).x - 44)).toBeLessThan(3);
  });

  test("with an unlucky roll she stays put", () => {
    const walk = stillBeside(() => 1);
    walk.settle(60 * 20);
    expect(dog(walk).frame).toBe(8);
  });

  test("a circle goes behind Dan, round to his far side, and back in front", () => {
    const walk = stillBeside(circle());
    const seen: { x: number; inFront: boolean }[] = [];
    for (let tick = 0; tick < 200; tick++) {
      walk.tick();
      seen.push(dog(walk));
    }
    const danX = walk.simulation.view().dan.x;
    const farSide = seen.findIndex(({ x }) => x > danX + 40);
    expect(farSide).toBeGreaterThan(0);
    expect(seen.slice(0, farSide - 20).some(({ inFront }) => inFront)).toBe(false);
    expect(seen.slice(farSide + 20).some(({ inFront }) => inFront)).toBe(true);
    expect(seen.at(-1)!.x).toBeCloseTo(danX - 46, 0);
    expect(seen.at(-1)!.inFront).toBe(false);
  });

  test("barks show open-mouth frames and the mark, then she settles", () => {
    const walk = stillBeside(bark());
    const seen = Array.from({ length: 120 }, () => {
      walk.tick();
      return dog(walk);
    });
    const barking = seen.filter((view) => view.barking);
    expect(barking.length).toBeGreaterThan(0);
    for (const view of barking) expect(view.frame).toBeGreaterThanOrEqual(10);
    expect(seen.at(-1)!.frame).toBe(8);
    expect(seen.at(-1)!.barking).toBe(false);
  });

  test("she barks in place, facing the way Dan faces", () => {
    const walk = stillBeside(bark());
    const before = dog(walk).x;
    for (let tick = 0; tick < 30; tick++) walk.tick();
    expect(dog(walk).x).toBe(before);
    expect(dog(walk).facing).toBe("right");
  });

  test("any movement cancels a trick on that tick", () => {
    const walk = stillBeside(circle());
    for (let tick = 0; tick < 60; tick++) walk.tick();
    const away = dog(walk).x;
    walk.scrollTo(fractionFor(120));
    walk.tick();
    expect(dog(walk).inFront).toBe(false);
    expect(dog(walk).depthRows).toBe(0);
    expect(dog(walk).x).not.toBeCloseTo(away + 2, 0);
    walk.settle(200);
    expect(dog(walk).x).toBeCloseTo(walk.simulation.view().dan.x - 46, 0);
  });

  test("a jump cancels a bark", () => {
    const walk = stillBeside(bark());
    for (let tick = 0; tick < 12; tick++) walk.tick();
    expect(dog(walk).barking).toBe(true);
    walk.simulation.jump();
    walk.tick();
    expect(dog(walk).barking).toBe(false);
  });

  test("she rests between tricks", () => {
    const walk = stillBeside(() => 0);
    let barks = 0;
    let wasDoing = false;
    for (let tick = 0; tick < 60 * 6; tick++) {
      walk.tick();
      const doing = dog(walk).barking || Math.abs(dog(walk).x - 44) > 3 || dog(walk).frame >= 10;
      if (doing && !wasDoing) barks += 1;
      wasDoing = doing;
    }
    expect(barks).toBeLessThanOrEqual(1);
  });

  test("reduced motion has no tricks", () => {
    const walk = walker({ reduced: true, random: () => 0 });
    walk.tick();
    const restingAt = dog(walk).x;
    for (let tick = 0; tick < 60 * 30; tick++) {
      walk.tick();
      expect(dog(walk).x).toBe(restingAt);
      expect(dog(walk).barking).toBe(false);
    }
  });

  test("no tricks inside the cabin", () => {
    const walk = walker({ random: () => 0 });
    walk.settle();
    walk.scrollTo(1);
    for (let tick = 0; tick < 60 * 30; tick++) {
      walk.tick();
      if (walk.simulation.view().finale > 0) expect(dog(walk).barking).toBe(false);
    }
  });
});
