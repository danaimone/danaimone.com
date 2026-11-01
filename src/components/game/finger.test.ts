import { describe, expect, test } from "bun:test";
import { fingerAt, fingerTakes, glideFrom, glideOffset, releaseSpeed } from "./finger";

const swipe = (pxPerMs: number, ms = 200, stepMs = 16) =>
  Array.from({ length: Math.floor(ms / stepMs) + 1 }, (_, i) => ({ y: 700 - i * stepMs * pxPerMs, at: 1000 + i * stepMs }));

describe("releasing the finger", () => {
  test("a swipe up carries its speed as forward scroll", () => {
    const samples = swipe(2);
    expect(releaseSpeed(samples, samples.at(-1)!.at + 8)).toBeCloseTo(2, 5);
  });

  test("a finger that paused before lifting has no speed", () => {
    const samples = swipe(2);
    expect(releaseSpeed(samples, samples.at(-1)!.at + 200)).toBe(0);
  });

  test("a slow drag stops where the finger left it", () => {
    expect(glideFrom(0.15)).toBeNull();
    expect(glideFrom(-0.15)).toBeNull();
  });

  test("every flick ends inside the 1.2 s budget, however hard", () => {
    for (const speed of [0.5, 1, 3, 12, 60]) expect(glideFrom(speed)!.ms).toBeLessThan(1200);
  });

  test("a harder flick travels further, up to the same limit", () => {
    const distance = (speed: number) => {
      const glide = glideFrom(speed)!;
      return glideOffset(glide, glide.ms);
    };
    expect(distance(2)).toBeGreaterThan(distance(1));
    expect(distance(40)).toBe(distance(400));
  });

  test("a glide keeps the direction of the flick", () => {
    const glide = glideFrom(-2)!;
    expect(glideOffset(glide, glide.ms)).toBeLessThan(0);
  });

  test("a glide starts at the finger's speed so the hand-off has no jolt", () => {
    const glide = glideFrom(2)!;
    expect(glideOffset(glide, 1)).toBeCloseTo(2, 1);
  });

  test("a glide comes to rest without a jolt and stays there", () => {
    const glide = glideFrom(2)!;
    const end = glideOffset(glide, glide.ms);
    expect(end - glideOffset(glide, glide.ms - 1)).toBeLessThan(0.01);
    expect(glideOffset(glide, glide.ms + 500)).toBe(end);
  });

  test("a glide coasts instead of braking hard: a quarter of its speed is left halfway", () => {
    const glide = glideFrom(3)!;
    const half = glide.ms / 2;
    expect(glideOffset(glide, half + 1) - glideOffset(glide, half)).toBeGreaterThan(0.75);
  });
});

describe("following the finger between touch events", () => {
  test("a steady finger read once per frame moves the same distance every frame, however its events fall", () => {
    const arrivals = [0, 9, 31, 40, 66, 70, 99, 118, 133, 150];
    const samples = arrivals.map((at) => ({ y: 800 - at * 0.6, at }));
    const steps = [0, 1, 2, 3, 4, 5].map((frame) => fingerAt(samples, 40 + (frame * 1000) / 60));
    for (let i = 1; i < steps.length; i++) expect(steps[i - 1] - steps[i]).toBeCloseTo(10, 5);
  });

  test("past the last event the finger stays where it was last seen", () => {
    const samples = [{ y: 500, at: 0 }, { y: 480, at: 16 }];
    expect(fingerAt(samples, 200)).toBe(480);
  });
});

describe("taking a drag from the browser", () => {
  const drag = { pinned: true, scrollY: 900, drag: -12, cardScrolls: false };

  test("a drag in the pinned walk is driven", () => {
    expect(fingerTakes(drag)).toBe(true);
  });

  test("past the walk the page scrolls natively, so the résumé stays reachable", () => {
    expect(fingerTakes({ ...drag, pinned: false })).toBe(false);
  });

  test("pull to refresh still works at the top", () => {
    expect(fingerTakes({ ...drag, scrollY: 0, drag: 12 })).toBe(false);
    expect(fingerTakes({ ...drag, scrollY: 0, drag: -12 })).toBe(true);
  });

  test("a card that overflows keeps its own scroll", () => {
    expect(fingerTakes({ ...drag, cardScrolls: true })).toBe(false);
  });
});
