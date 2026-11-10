import { createSteadyClock } from "./steady-clock";
import { clamp } from "./track";

const VELOCITY_WINDOW_MS = 35;
const SAMPLES_KEPT_MS = 200;
const HELD_STILL_MS = 70;
const GLIDE_FROM_SPEED = 0.1;
const MAX_RELEASE_SPEED = 3;
const GLIDE_DECAY_PER_MS = 0.998;
const GLIDE_STOP_SPEED = 0.06;
const MAX_GLIDE_MS = 1000;
const FINGER_DELAY_MS = 20;
const SAMPLE_CLOCK_SKEW_MS = 1000;

export type FingerSample = { y: number; at: number };
export type Glide = { speed: number; ms: number };
export type Take = { pinned: boolean; scrollY: number; drag: number; cardScrolls: boolean };

// Finger pixels per ms at the moment of lifting, positive for a swipe up; a finger that paused first has none.
export function releaseSpeed(samples: FingerSample[], liftedAt: number) {
  const last = samples.at(-1);
  if (!last || liftedAt - last.at > HELD_STILL_MS) return 0;
  const first = samples.find(({ at }) => last.at - at <= VELOCITY_WINDOW_MS)!;
  return last.at > first.at ? (first.y - last.y) / (last.at - first.at) : 0;
}

const decay = -Math.log(GLIDE_DECAY_PER_MS);

// Slows at UIScrollView's normal deceleration rate (0.998 per ms,
// https://developer.apple.com/documentation/uikit/uiscrollview/decelerationrate/normal),
// bent to reach zero speed by `ms` instead of creeping on for seconds.
export function glideFrom(speed: number): Glide | null {
  const fast = Math.min(Math.abs(speed), MAX_RELEASE_SPEED);
  if (fast < GLIDE_FROM_SPEED) return null;
  return { speed: Math.sign(speed) * fast, ms: Math.min(MAX_GLIDE_MS, Math.log(fast / GLIDE_STOP_SPEED) / decay) };
}

export function glideOffset({ speed, ms }: Glide, elapsedMs: number) {
  const t = clamp(elapsedMs, 0, ms);
  const floor = Math.exp(-decay * ms);
  return (speed / (1 - floor)) * ((1 - Math.exp(-decay * t)) / decay - t * floor);
}

// Where the finger was at `at`, between the samples around it. Touch events do
// not arrive once per frame, so reading the latest one makes uneven steps.
export function fingerAt(samples: FingerSample[], at: number) {
  const after = samples.findIndex((sample) => sample.at > at);
  if (after === -1) return samples.at(-1)!.y;
  if (after === 0) return samples[0].y;
  const a = samples[after - 1];
  const b = samples[after];
  return a.y + ((b.y - a.y) * (at - a.at)) / (b.at - a.at);
}

// Only a walk pinned on screen is driven; a card with its own overflow keeps its
// scroll, and pulling down at the very top stays the browser's refresh.
export const fingerTakes = ({ pinned, scrollY, drag, cardScrolls }: Take) =>
  pinned && !cardScrolls && !(scrollY <= 0 && drag > 0);

export type Lift = { at: number; glide: Glide | null };
type Drive = { startY: number; startScroll: number; ratio: number; samples: FingerSample[]; lift: Lift | null };

// How far the finger has dragged by `at`, and after it lifts, how far the glide has
// carried on from there. A lift is dated at the last place the finger was seen:
// touchend arrives a few ms later, and waiting out that gap would stall the walk
// for a frame before the glide.
export function travelAt({ startY, samples, lift }: Pick<Drive, "startY" | "samples" | "lift">, at: number) {
  if (!lift || at <= lift.at) return startY - fingerAt(samples, at);
  return startY - samples.at(-1)!.y + (lift.glide ? glideOffset(lift.glide, at - lift.at) : 0);
}

export const liftOff = (samples: FingerSample[], liftedAt: number, glides: boolean): Lift => ({
  at: samples.at(-1)!.at,
  glide: glides ? glideFrom(releaseSpeed(samples, liftedAt)) : null,
});

// iOS momentum cannot be shortened, only never started: the first touchmove has
// to be cancelled, so a drag inside the pinned walk scrolls the page from here.
// The caller runs frame() at the top of each animation frame.
export function driveWithFinger(
  surface: HTMLElement,
  { pinned, glides, dragRatio }: { pinned: () => boolean; glides: boolean; dragRatio: () => number },
) {
  let state: "idle" | "touched" | "driving" | "native" = "idle";
  let drive: Drive | null = null;
  let stoppedGlide = false;
  let touched = false;
  let driven: { exact: number; reported: number } | null = null;
  let sampleClock = createSteadyClock();

  const sampledAt = (event: TouchEvent) => {
    const now = performance.now();
    return Math.abs(event.timeStamp - now) < SAMPLE_CLOCK_SKEW_MS ? event.timeStamp : now;
  };

  // The page rounds the scroll it was given. Until something else moves the page,
  // the position the walk asked for (a drag, a teleport, an arrow key) is the true one: taking the rounded value
  // when the finger lifts, or when it lands again, would step the walk backwards.
  function exactScroll() {
    if (driven && window.scrollY !== driven.reported) driven = null;
    return driven?.exact ?? null;
  }

  function scrollTo(exact: number) {
    window.scrollTo(0, exact);
    driven = { exact, reported: window.scrollY };
  }

  function frame(now: number) {
    if (!drive || state === "touched") return;
    const at = now - FINGER_DELAY_MS;
    scrollTo(drive.startScroll + travelAt(drive, at) * drive.ratio);
    const { lift } = drive;
    if (lift && at >= lift.at + (lift.glide?.ms ?? 0)) drive = null;
  }

  function onStart(event: TouchEvent) {
    touched = true;
    stoppedGlide = drive?.lift?.glide != null;
    drive = null;
    if (event.touches.length !== 1) {
      state = "native";
      return;
    }
    state = "touched";
    const y = event.touches[0].clientY;
    sampleClock = createSteadyClock();
    drive = { startY: y, startScroll: exactScroll() ?? window.scrollY, ratio: dragRatio(), samples: [{ y, at: sampleClock(sampledAt(event)) }], lift: null };
  }

  function onMove(event: TouchEvent) {
    if (state === "idle" || state === "native" || !drive) return;
    if (event.touches.length !== 1 || !event.cancelable) {
      state = "native";
      drive = null;
      return;
    }
    const y = event.touches[0].clientY;
    if (state === "touched") {
      const card = event.target instanceof Element ? event.target.closest<HTMLElement>(".walk-card") : null;
      const cardScrolls = card !== null && card.scrollHeight > card.clientHeight;
      state = fingerTakes({ pinned: pinned(), scrollY: window.scrollY, drag: y - drive.startY, cardScrolls }) ? "driving" : "native";
      if (state === "native") {
        drive = null;
        return;
      }
    }
    event.preventDefault();
    const at = sampleClock(sampledAt(event));
    drive.samples.push({ y, at });
    drive.samples = drive.samples.filter((sample) => at - sample.at <= SAMPLES_KEPT_MS);
  }

  function onEnd(event: TouchEvent) {
    if (event.touches.length > 0) return;
    if (state === "touched" && stoppedGlide && event.cancelable) event.preventDefault();
    if (state === "driving" && drive) {
      drive.lift = liftOff(drive.samples, sampledAt(event), glides);
    } else {
      drive = null;
    }
    state = "idle";
  }

  function onCancel() {
    if (drive && !drive.lift) drive.lift = liftOff(drive.samples, Infinity, false);
    state = "idle";
  }

  const listening = { passive: false };
  surface.addEventListener("touchstart", onStart, { passive: true });
  surface.addEventListener("touchmove", onMove, listening);
  surface.addEventListener("touchend", onEnd, listening);
  surface.addEventListener("touchcancel", onCancel);

  return {
    frame,
    touched: () => touched,
    scroll: exactScroll,
    scrollTo,
    touchAge: (now: number) => (state === "driving" && drive ? now - drive.samples.at(-1)!.at : null),
    gliding: () => drive?.lift != null,
    stop() {
      drive = null;
      surface.removeEventListener("touchstart", onStart);
      surface.removeEventListener("touchmove", onMove);
      surface.removeEventListener("touchend", onEnd);
      surface.removeEventListener("touchcancel", onCancel);
    },
  };
}
