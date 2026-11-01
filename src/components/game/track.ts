export const WALK_START = 90;
export const WALK_END = 4020;
const WALK_RANGE = WALK_END - WALK_START;
const WALK_SHARE = 0.88;
const KEY_WALK_SPEED = 2.15;

export const FRACTION_PER_WORLD_PX = WALK_SHARE / WALK_RANGE;
export const KEY_STEP = KEY_WALK_SPEED * FRACTION_PER_WORLD_PX;

export type Destination = { kind: "world"; x: number } | { kind: "cabin" };

export const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

export const worldAt = (fraction: number) => WALK_START + Math.min(fraction / WALK_SHARE, 1) * WALK_RANGE;

export const finaleAt = (fraction: number) => clamp((fraction - WALK_SHARE) / (1 - WALK_SHARE), 0, 1);

export const progressAt = (worldX: number) => clamp((worldX - WALK_START) / WALK_RANGE, 0, 1);

export function fractionOf(destination: Destination) {
  switch (destination.kind) {
    case "world":
      return progressAt(destination.x) * WALK_SHARE;
    case "cabin":
      return 1;
    default: {
      const _exhaustive: never = destination;
      return _exhaustive;
    }
  }
}
