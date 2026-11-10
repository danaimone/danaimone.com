import { describe, expect, test } from "bun:test";
import { createSteadyClock } from "./steady-clock";

const gaps = (times: number[]) => times.slice(1).map((time, i) => time - times[i]);

describe("a clock behind whole-millisecond timestamps", () => {
  for (const hz of [60, 120]) {
    test(`a ${hz} Hz beat reported in whole ms comes back even`, () => {
      const clock = createSteadyClock();
      const steadied = Array.from({ length: 400 }, (_, i) => clock(Math.round(5000.3 + (i * 1000) / hz)));
      for (const gap of gaps(steadied.slice(-100))) expect(Math.abs(gap - 1000 / hz)).toBeLessThan(0.2);
    });
  }

  test("it stays within a millisecond of the time it was given", () => {
    const clock = createSteadyClock();
    for (let i = 0; i < 400; i++) {
      const raw = Math.round(5000.3 + (i * 1000) / 60);
      expect(Math.abs(clock(raw) - raw)).toBeLessThan(1);
    }
  });

  test("a time that is off the beat is kept exactly", () => {
    const clock = createSteadyClock();
    for (let i = 0; i < 60; i++) clock(Math.round((i * 1000) / 60));
    expect(clock(1000 + 107)).toBe(1107);
  });

  test("a dropped frame still lands on the beat", () => {
    const clock = createSteadyClock();
    let last = 0;
    for (let i = 0; i < 200; i++) last = clock(Math.round((i * 1000) / 60));
    expect(clock(Math.round((201 * 1000) / 60)) - last).toBeCloseTo(2000 / 60, 0);
  });
});
