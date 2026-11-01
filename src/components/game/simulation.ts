import type { StopId } from "../../data/resume";
import { GEMS, PROMOTION_X, STOPS, WORLD_WIDTH, type Gem } from "./world";
import { KEY_STEP, WALK_START, clamp, finaleAt, fractionOf, progressAt, worldAt, type Destination } from "./track";


const MAX_WALK_SPEED = 2.6;
const SPRINT_RATE = 0.06;
const SPRINT_LAG = 90;
const MAX_SPRINT_SPEED = 80;
const QUIET_SPEED = 12;
const OPENING_WALK_SPEED = 1.6;
const MAX_STRIDE_STEP = 2.4;
const LEAD_LENGTH = 46;
const CAMERA_ANCHOR = 0.36;
const INTRO_END = 400;
const STEP_MS = 1000 / 60;
const MAX_FRAME_MS = 100;
export const CONTACT_FINALE = 0.72;
const TELEPORT_TICKS = 43;
const DOG_JUMP_DELAY_TICKS = 9;
const RESTING_AFTER_TICKS = 72;
const GRAVITY = 0.32;
const JUMP_SPEED = 5.6;
const DOG_JUMP_SPEED = 4.8;

const MISHKA_FRAME = { walkCycle: 8, idle: 8, airborne: 9 };
const MISHKA_STRIDE_PER_FRAME = 11;
const DAN_FRAME = { walkCycle: 8, idle: 8, firstAirborne: 9, airborneFrames: 5 };
const DAN_STRIDE_PER_FRAME = 15;

const danAirborneFrame = (speed: number) => {
  const progress = (1 - speed / JUMP_SPEED) / 2;
  const frame = Math.floor(progress * DAN_FRAME.airborneFrames);
  return DAN_FRAME.firstAirborne + Math.min(Math.max(frame, 0), DAN_FRAME.airborneFrames - 1);
};

export type Facing = "left" | "right";
export type Zone = "intro" | "between" | "contact" | StopId;
export type WalkDirection = -1 | 0 | 1;

export type WalkInput = {
  fraction: number;
  walkDirection: WalkDirection;
  viewWidth: number;
  cardSpan: number;
};

export type WalkEffect =
  | { kind: "zone"; zone: Zone }
  | { kind: "collected"; labels: string[] }
  | { kind: "gem"; gem: Gem }
  | { kind: "promoted"; x: number }
  | { kind: "progress"; progress: number }
  | { kind: "scroll"; fraction: number };

export const cameraAt = (x: number, viewWidth: number) =>
  clamp(x - viewWidth * CAMERA_ANCHOR, 0, WORLD_WIDTH - viewWidth);

const sprintSpeed = (distance: number) =>
  clamp((Math.abs(distance) - SPRINT_LAG) * SPRINT_RATE, MAX_WALK_SPEED, MAX_SPRINT_SPEED);

type Walker = { x: number; facing: Facing; stride: number; jumpHeight: number; jumpSpeed: number };

function fall(height: number, speed: number) {
  const nextHeight = height + speed;
  return nextHeight <= 0 ? { height: 0, speed: 0 } : { height: nextHeight, speed: speed - GRAVITY };
}

export function createStepClock() {
  let pendingMs = 0;
  return (elapsedMs: number) => {
    pendingMs += Math.min(elapsedMs, MAX_FRAME_MS);
    const steps = Math.floor(pendingMs / STEP_MS);
    pendingMs -= steps * STEP_MS;
    return { steps, blend: pendingMs / STEP_MS };
  };
}

export function createSimulation({ reduced }: { reduced: boolean }) {
  const dan: Walker & { vx: number } = { x: WALK_START, vx: 0, facing: "right", stride: 0, jumpHeight: 0, jumpSpeed: 0 };
  const mishka: Walker = { x: WALK_START - LEAD_LENGTH, facing: "right", stride: 0, jumpHeight: 0, jumpSpeed: 0 };
  let danFrom = dan.x;
  let mishkaFrom = mishka.x;
  const collected = new Set<string>();
  const collectedView: ReadonlySet<string> = collected;
  let finale = 0;
  let warpLevel = 0;
  let warp: { tick: number; fraction: number; moved: boolean } | null = null;
  let pendingScroll: number | null = null;
  let snapNext = false;
  let first = true;
  let promoted = false;
  let zone: Zone | null = null;
  let lastProgress = -1;
  let idleTicks = 0;
  let dogJumpIn = 0;

  function moveDan(target: number, canAnimate: boolean, effects: WalkEffect[]) {
    const opening = first && !reduced && target <= WALK_START + 1;
    if (opening) {
      dan.x = WALK_START - 130;
      mishka.x = WALK_START - 190;
    }
    const distance = target - dan.x;
    const snap = !canAnimate || (first && !opening) || snapNext;
    first = false;
    snapNext = false;
    if (snap) {
      dan.x = target;
      mishka.x = target - LEAD_LENGTH;
      dan.vx = 0;
      danFrom = target;
    } else {
      danFrom = dan.x;
      const topSpeed = sprintSpeed(distance);
      dan.vx = Math.abs(distance) < 0.3 ? 0 : clamp(distance * 0.12, -topSpeed, topSpeed);
      if (dan.x < WALK_START) dan.vx = Math.min(dan.vx, OPENING_WALK_SPEED);
      dan.x += dan.vx;
    }
    if (dan.vx > 0.05) dan.facing = "right";
    else if (dan.vx < -0.05) dan.facing = "left";
    if (Math.abs(dan.vx) > 0.05) {
      idleTicks = 0;
      dan.stride += Math.min(Math.abs(dan.vx), MAX_STRIDE_STEP);
    } else idleTicks += 1;
    collect(!snap && Math.abs(dan.vx) <= QUIET_SPEED, effects);
  }

  function moveMishka() {
    mishkaFrom = mishka.x;
    const lead = dan.facing === "right" ? -LEAD_LENGTH : LEAD_LENGTH;
    const distance = dan.x + lead - mishka.x;
    const topSpeed = sprintSpeed(distance) + 0.5;
    const speed = clamp(distance * 0.075, -topSpeed, topSpeed);
    if (Math.abs(distance) > 0.4) {
      mishka.x += speed;
      mishka.stride += Math.min(Math.abs(speed), MAX_STRIDE_STEP);
      if (Math.abs(speed) > 0.1) mishka.facing = speed > 0 ? "right" : "left";
    } else mishka.facing = dan.facing;
    if (dogJumpIn > 0) {
      dogJumpIn -= 1;
      if (dogJumpIn === 0) mishka.jumpSpeed = DOG_JUMP_SPEED;
    }
  }

  function collect(announce: boolean, effects: WalkEffect[]) {
    for (const gem of GEMS) {
      if (collected.has(gem.label) || dan.x < gem.x) continue;
      collected.add(gem.label);
      effects.push({ kind: "collected", labels: GEMS.filter((g) => collected.has(g.label)).map((g) => g.label) });
      if (announce) effects.push({ kind: "gem", gem });
    }
    if (!promoted && dan.x >= PROMOTION_X) {
      promoted = true;
      if (announce) effects.push({ kind: "promoted", x: dan.x });
    }
  }

  // A span of 0 means the card sits above the scene, clear of every landmark.
  function cardCoversFocus({ cardSide, landmark }: (typeof STOPS)[number], { viewWidth, cardSpan }: WalkInput) {
    if (cardSpan === 0) return false;
    const left = landmark.x + landmark.focus.x - cameraAt(dan.x, viewWidth);
    const right = left + landmark.focus.width;
    return cardSide === "left" ? right > 0 && left < cardSpan : left < viewWidth && right > viewWidth - cardSpan;
  }

  function updateZone(input: WalkInput, effects: WalkEffect[]) {
    const stop = dan.x < INTRO_END ? undefined : STOPS.find(({ zone: z }) => dan.x >= z.from && dan.x <= z.to);
    const shown = stop && !cardCoversFocus(stop, input) ? stop : undefined;
    const next: Zone = finale > CONTACT_FINALE ? "contact" : dan.x < INTRO_END ? "intro" : shown?.id ?? "between";
    if (next !== zone) {
      zone = next;
      effects.push({ kind: "zone", zone: next });
    }
  }

  function step(input: WalkInput) {
    const { fraction, walkDirection } = input;
    const effects: WalkEffect[] = [];
    let scrolled = fraction;
    const scrollTo = (next: number) => {
      scrolled = next;
      effects.push({ kind: "scroll", fraction: next });
    };

    if (pendingScroll !== null) {
      scrollTo(pendingScroll);
      pendingScroll = null;
    }
    if (walkDirection !== 0 && !warp) scrollTo(clamp(scrolled + walkDirection * KEY_STEP, 0, 1));

    warpLevel = 0;
    if (warp) {
      warp.tick += 1;
      const progress = warp.tick / TELEPORT_TICKS;
      warpLevel = clamp(Math.sin(Math.min(progress, 1) * Math.PI), 0, 1);
      if (progress >= 0.5 && !warp.moved) {
        scrollTo(warp.fraction);
        warp.moved = true;
        snapNext = true;
      }
      if (progress >= 1) warp = null;
    }

    finale = finaleAt(scrolled);
    moveDan(worldAt(scrolled), !reduced, effects);
    const danFall = fall(dan.jumpHeight, dan.jumpSpeed);
    dan.jumpHeight = danFall.height;
    dan.jumpSpeed = danFall.speed;
    moveMishka();
    const dogFall = fall(mishka.jumpHeight, mishka.jumpSpeed);
    mishka.jumpHeight = dogFall.height;
    mishka.jumpSpeed = dogFall.speed;

    updateZone(input, effects);
    const progress = Math.round(progressAt(dan.x) * 1000) / 1000;
    if (progress !== lastProgress) {
      lastProgress = progress;
      effects.push({ kind: "progress", progress });
    }
    return effects;
  }

  return {
    step,
    jump() {
      if (dan.jumpHeight > 0.5) return;
      dan.jumpSpeed = JUMP_SPEED;
      dogJumpIn = DOG_JUMP_DELAY_TICKS;
    },
    teleport(destination: Destination) {
      const fraction = fractionOf(destination);
      if (reduced) pendingScroll = fraction;
      else warp = { tick: 0, fraction, moved: false };
    },
    view(blend = 1) {
      const moving = Math.abs(dan.vx) > 0.05;
      const lead = dan.facing === "right" ? -LEAD_LENGTH : LEAD_LENGTH;
      const resting = finale === 0 && idleTicks > RESTING_AFTER_TICKS && Math.abs(mishka.x - (dan.x + lead)) < 2;
      return {
        dan: {
          x: danFrom + (dan.x - danFrom) * blend,
          facing: dan.facing,
          lift: dan.jumpHeight,
          moving,
          frame: dan.jumpHeight > 0 ? danAirborneFrame(dan.jumpSpeed) : moving ? Math.floor(dan.stride / DAN_STRIDE_PER_FRAME) % DAN_FRAME.walkCycle : DAN_FRAME.idle,
        },
        mishka: {
          x: mishkaFrom + (mishka.x - mishkaFrom) * blend,
          facing: mishka.facing,
          lift: mishka.jumpHeight,
          frame: mishka.jumpHeight > 0 ? MISHKA_FRAME.airborne : resting ? MISHKA_FRAME.idle : Math.floor(mishka.stride / MISHKA_STRIDE_PER_FRAME) % MISHKA_FRAME.walkCycle,
        },
        collected: collectedView,
        finale,
        warpLevel,
      };
    },
  };
}
