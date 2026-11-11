import { smoothstep } from "./math";
import type { PageActivity } from "./page-activity";
import type { Viewport, WalkSurface } from "./surface";
import { clamp } from "./track";
import { DOOR } from "./world";

export const IRIS_FROM_FINALE = 0.34;
const IRIS_FINALE_SPAN = 0.5;
const OPEN_IRIS_DIAGONALS = 1.15;
const IRIS_HOLE_MARGIN = 1.3;
const WIPE_WALK_REPAINT_EVERY = 2;

export const irisAt = (finale: number) => clamp((finale - IRIS_FROM_FINALE) / IRIS_FINALE_SPAN, 0, 1);

export type WipePlan = "room-only" | "widen-hole" | "repaint-walk";

export type Bounds = { left: number; top: number; right: number; bottom: number };

// The walk canvases cut a hole onto the room beneath them, because a clip-path on
// the room rebuilds a full-screen mask every frame.
export function createWipe({ view, page, surfaces }: { view: HTMLElement; page: PageActivity; surfaces: readonly WalkSurface[] }) {
  let viewport: Viewport;
  let covered = false;
  let paintedIris = 0;
  let paintedCamX = 0;
  let widenedFrames = 0;

  const cssRadius = (iris: number) => smoothstep(iris) * Math.hypot(view.clientWidth, view.clientHeight) * OPEN_IRIS_DIAGONALS;
  const radius = (iris: number) => cssRadius(iris) / viewport.scale;
  const centre = (camera: number) => ({ x: DOOR.x + DOOR.width / 2 - camera, y: viewport.ground + DOOR.y + DOOR.height / 2 });

  function coversView(iris: number, camX: number) {
    if (iris === 0) return false;
    const { x, y } = centre(camX);
    return Math.hypot(Math.max(x, viewport.width - x), Math.max(y, viewport.height - y)) < radius(iris);
  }

  return {
    resize(next: Viewport) {
      viewport = next;
    },
    // While the wipe grows the walk behind it hardly moves, so on most frames it
    // only needs the hole cut wider. Shrinking has to repaint what it uncovers.
    plan(iris: number, camX: number): WipePlan {
      const coversNow = coversView(iris, camX);
      if (coversNow !== covered) {
        covered = coversNow;
        for (const surface of surfaces) for (const element of surface.elements) element.style.visibility = covered ? "hidden" : "";
        page.markRestyled();
      }
      if (covered) return "room-only";
      const growing = iris > 0 && iris >= paintedIris && camX === paintedCamX;
      paintedIris = iris;
      paintedCamX = camX;
      return growing && (page.restyled() || ++widenedFrames % WIPE_WALK_REPAINT_EVERY) ? "widen-hole" : "repaint-walk";
    },
    open(iris: number, camera: number) {
      const hole = { ...centre(camera), radius: radius(iris), camera };
      for (const surface of surfaces) surface.cut(hole);
    },
    paintedHoleCssBounds(iris: number): Bounds {
      const { x, y } = centre(paintedCamX);
      const { scale } = viewport;
      const reach = (cssRadius(iris) * IRIS_HOLE_MARGIN) / scale;
      return { left: (x - reach) * scale, top: (y - reach) * scale, right: (x + reach) * scale, bottom: (y + reach) * scale };
    },
  };
}
