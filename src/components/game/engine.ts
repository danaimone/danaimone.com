import { createActors } from "./actors";
import { loadArt, type Art } from "./assets";
import { createDoomLauncher } from "./doom-launcher";
import { driveWithFinger } from "./finger";
import { listenForKeys } from "./keys";
import { createPageActivity } from "./page-activity";
import { createParallax } from "./parallax";
import { createParticles } from "./particles";
import { createPlane } from "./plane";
import type { ScreenCanvases } from "./room-screens";
import { createRoomView } from "./room-view";
import { CONTACT_FINALE, cameraAt, createSimulation, createStepClock, type Zone } from "./simulation";
import { createSky, skyAt } from "./sky";
import { createSteadyClock } from "./steady-clock";
import { measureViewport, sizeKey, type WalkSurface } from "./surface";
import { createTerminal } from "./terminal";
import { createToastLayer } from "./toast-layer";
import { FRACTION_PER_WORLD_PX, clamp, progressAt, type Destination } from "./track";
import { createWipe, irisAt } from "./wipe";

export { PARALLAX_LAYERS } from "./parallax";

const GEM_BURST_HEIGHT = 30;

export type WalkEvents = {
  zone(zone: Zone): void;
  inside(inside: boolean): void;
  collected(labels: string[]): void;
  toast(text: string, worldX: number, tone: "gem" | "level"): void;
  progress(progress: number): void;
  unavailable(): void;
  open(place: "resume" | "projects" | "pdf"): void;
};

// The walk is a stack of canvases at art resolution. `canvas` holds the sky. Each
// of `layers` holds one parallax layer, and `plane` holds everything fixed to the
// ground. Those are wider than the view: each is drawn at a whole art pixel and
// slid the rest of the way by the compositor, so the world moves in device pixels.
// `actors` holds Dan and Mishka, who stay put on screen. `room` is the cabin
// interior, under all of them, which the wipe opens a hole onto; `screens` are
// its two monitors, drawn over it at the display's own resolution.
export type WalkElements = {
  stage: HTMLElement;
  view: HTMLElement;
  canvas: HTMLCanvasElement;
  layers: HTMLCanvasElement[];
  plane: HTMLCanvasElement;
  actors: HTMLCanvasElement;
  room: HTMLCanvasElement;
  screens: ScreenCanvases;
};

export function startWalk({ stage, view, canvas, layers, plane, actors, room, screens }: WalkElements, on: WalkEvents) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const simulation = createSimulation({ reduced });
  let probe: ReturnType<typeof import("./probe").startProbe> | null = null;
  if (new URLSearchParams(window.location.search).has("probe")) import("./probe").then(({ startProbe }) => (probe = startProbe(view)));
  const doom = createDoomLauncher(view, (line) => terminal.print(line));
  const terminal = createTerminal((action) => {
    switch (action) {
      case "doom":
        doom.launch();
        break;
      case "stoke":
        stokeFire();
        break;
      case "resume":
      case "projects":
      case "pdf":
        on.open(action);
        break;
      default: {
        const _exhaustive: never = action;
        return _exhaustive;
      }
    }
  });
  let cancelled = false;
  let cleanup = () => {};
  let stokeFire = () => {};

  loadArt().then(
    (art) => {
      if (!cancelled) cleanup = start(art);
    },
    () => on.unavailable(),
  );

  function start(art: Art) {
    const page = createPageActivity();
    const particles = createParticles(reduced);
    const surfaces: WalkSurface[] = [
      createSky({ canvas, stage, art, reduced }),
      createParallax(layers, art),
      createPlane({ canvas: plane, art, reduced }),
      createActors({ canvas: actors, art, particles }),
    ];
    const wipe = createWipe({ view, page, surfaces });
    const roomView = createRoomView({
      canvas: room,
      screens,
      view,
      terminal,
      gameScreen: () => doom.running()?.screen(),
      reduced,
      page,
      holeBounds: wipe.paintedBounds,
      unavailable: on.unavailable,
    });
    stokeFire = roomView.stokeFire;
    const toasts = createToastLayer(view);
    let viewport = measureViewport(view);
    let inside = false;
    let request = 0;
    let visible = true;

    function applyViewport() {
      for (const surface of surfaces) surface.resize(viewport);
      wipe.resize(viewport);
      view.style.setProperty("--scale", `${viewport.scale}`);
      view.classList.add("is-laid-out");
    }

    function layout() {
      if (sizeKey(view) === viewport.key) return;
      viewport = measureViewport(view);
      applyViewport();
    }

    // The page reports its scroll in whole pixels. While a finger drives it, the
    // finger's own position is exact, and the walk follows that.
    function measureTrack() {
      const rect = stage.getBoundingClientRect();
      const pinnedHeight = view.offsetHeight;
      const travel = stage.offsetHeight - pinnedHeight;
      const top = rect.top + window.scrollY;
      return {
        fraction: clamp(((finger.scroll() ?? window.scrollY) - top) / Math.max(1, travel), 0, 1),
        pinned: rect.top <= 1 && rect.bottom >= pinnedHeight - 1,
        top,
        travel,
      };
    }

    const atDesk = () => simulation.view().finale >= CONTACT_FINALE;

    function simulate(now: number) {
      const { ground, width, cardSpan } = viewport;
      const { fraction, pinned, top, travel } = measureTrack();
      const effects = simulation.step({ fraction, walkDirection: keys.direction(pinned), followsScroll: finger.touched(), pinned, viewWidth: width, cardSpan });
      for (const effect of effects) {
        switch (effect.kind) {
          case "scroll":
            finger.scrollTo(top + effect.fraction * travel);
            break;
          case "zone":
            on.zone(effect.zone);
            page.markRestyled();
            break;
          case "collected":
            on.collected(effect.labels);
            break;
          case "progress":
            on.progress(effect.progress);
            break;
          case "gem":
            particles.burst(effect.gem.x, ground - GEM_BURST_HEIGHT, [effect.gem.color, "#ffffff"], 16, 2.2);
            on.toast(effect.gem.label, effect.gem.x, "gem");
            break;
          case "promoted":
            particles.burst(effect.x, ground - 60, ["#ffac42", "#ffe1a0", "#ffffff", "#e96b54"], 40, 3.2);
            on.toast("Promoted to Engineer 2", effect.x, "level");
            break;
          default: {
            const _exhaustive: never = effect;
            return _exhaustive;
          }
        }
      }
      const walk = simulation.view();
      if (walk.finale >= CONTACT_FINALE && !reduced && !page.scrolling() && !doom.requested()) terminal.tick();
      if (walk.warpLevel > 0) particles.beamSparks([walk.dan.x, walk.mishka.x], ground);
      particles.step(now, ground);
    }

    function draw(now: number, blend: number) {
      const t = now / 1000;
      page.observe(now);
      const walk = simulation.view(blend, measureTrack().fraction);
      const camera = cameraAt(walk.dan.x, viewport.width);
      const camX = Math.round(camera);
      const iris = irisAt(walk.finale);
      if (iris > 0 !== inside) {
        inside = iris > 0;
        on.inside(inside);
        page.markRestyled();
      }
      toasts.follow(camera, viewport.scale, page.scrolling());
      probe?.frame(now, camera * viewport.scale * window.devicePixelRatio, finger.touchAge(now), finger.gliding());
      roomView.follow(walk.finale, t);
      const plan = wipe.plan(iris, camX);
      if (plan === "widen") wipe.open(iris, camera);
      if (plan !== "full") return roomView.paint(iris, t);
      const tod = progressAt(walk.dan.x);
      const frame = { t, camera, camX, tod, sky: skyAt(tod), walk };
      for (const surface of surfaces) surface.paint(frame);
      if (iris > 0) wipe.open(iris, camera);
      roomView.paint(iris, t);
    }

    let lastFrame = performance.now();
    const stepClock = createStepClock();
    const frameClock = createSteadyClock();

    function loop(reported: number) {
      const now = frameClock(reported);
      request = 0;
      finger.frame(now);
      const { steps, blend } = stepClock(now - lastFrame);
      lastFrame = now;
      const fullscreen = doom.running()?.fullscreen() ?? false;
      if (!fullscreen) for (let step = 0; step < steps; step++) simulate(now);
      const game = doom.running();
      if (game) {
        if (fullscreen || (measureTrack().pinned && atDesk())) game.pump(now);
        else game.end("quit");
      }
      draw(now, blend);
      if (visible) request = requestAnimationFrame(loop);
    }

    const keys = listenForKeys({
      doom: doom.running,
      atDesk,
      pinned: () => measureTrack().pinned,
      type: (key) => terminal.press(key),
      jump: () => simulation.jump(),
    });
    const finger = driveWithFinger(view, {
      pinned: () => !doom.running() && measureTrack().pinned,
      glides: !reduced,
      dragRatio: () => (measureTrack().travel * FRACTION_PER_WORLD_PX) / viewport.scale,
    });
    const resized = new ResizeObserver(layout);
    resized.observe(view);
    applyViewport();
    const onScreen = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible && !request) request = requestAnimationFrame(loop);
    });
    onScreen.observe(stage);
    request = requestAnimationFrame(loop);
    return () => {
      finger.stop();
      keys.stop();
      resized.disconnect();
      onScreen.disconnect();
      cancelAnimationFrame(request);
    };
  }

  return {
    jump: () => simulation.jump(),
    teleport(destination: Destination) {
      simulation.teleport(destination);
    },
    stop() {
      cancelled = true;
      doom.stop();
      cleanup();
    },
  };
}
