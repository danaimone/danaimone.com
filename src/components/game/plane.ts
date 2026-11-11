import { drawGem, paintGround, soilFlecks } from "./art";
import type { Art } from "./assets";
import { rng } from "./math";
import { PROP_SHEET } from "./sheets";
import { buildPath, placeProps } from "./path";
import { cutHole, fitCanvas, tintOver, type Frame, type Viewport, type WalkSurface } from "./surface";
import { clamp } from "./track";
import { BEACON, DOOR, GEMS, WORLD_WIDTH, spriteTop } from "./world";

const PROP_ROOT_ROW = 2;

// The ground plane: the path, props, landmarks with their lights and signs, the
// cabin door and the gems. Everything here is fixed to the world and slides as
// one. The canvas is one art pixel wider than the view: it is drawn at a whole
// art pixel and slid the rest of the way by the compositor.
export function createPlane({ canvas, art, reduced }: { canvas: HTMLCanvasElement; art: Art; reduced: boolean }): WalkSurface {
  const ctx = canvas.getContext("2d")!;
  const path = buildPath();
  const flecks = soilFlecks(WORLD_WIDTH);
  let viewport: Viewport;
  let props: { x: number; kind: number }[] = [];
  let slid = -1;

  return {
    elements: [canvas],
    resize(next) {
      viewport = next;
      fitCanvas(canvas, viewport.width + 1, viewport.height, viewport.scale);
      slid = -1;
      props = placeProps(rng(9));
    },
    paint({ t, camera, sky, walk }: Frame) {
      const { height, ground, scale } = viewport;
      const width = viewport.width + 1;
      const left = Math.floor(camera);
      const slide = Math.round((camera - left) * scale * window.devicePixelRatio);
      if (slide !== slid) {
        slid = slide;
        canvas.style.transform = `translate3d(${-slide / window.devicePixelRatio}px, 0, 0)`;
      }

      ctx.clearRect(0, 0, width, height);
      paintGround(ctx, path, flecks, left, width, ground, height);
      for (const prop of props) {
        const sx = prop.x - left;
        if (sx > -PROP_SHEET.width && sx < width) {
          ctx.drawImage(art.props, prop.kind * PROP_SHEET.width, 0, PROP_SHEET.width, PROP_SHEET.height, sx, ground + PROP_ROOT_ROW - PROP_SHEET.height, PROP_SHEET.width, PROP_SHEET.height);
        }
      }
      for (const { landmark, sprite } of art.landmarks) {
        const sx = landmark.x - left;
        if (sx > -landmark.width && sx < width) ctx.drawImage(sprite, sx, ground + spriteTop(landmark));
      }
      if (sky.tintAlpha > 0.005) tintOver(ctx, sky.tint, sky.tintAlpha, width, height);

      // Light sources sit on top of the tint.
      for (const { landmark, lights } of art.landmarks) {
        if (!lights || !landmark.lights) continue;
        const sx = landmark.x - left;
        const alpha = Math.max(sky.lights, landmark.lights.daylight);
        if (alpha < 0.02 || sx < -landmark.width || sx > width) continue;
        ctx.globalAlpha = alpha;
        ctx.drawImage(lights, sx, ground + spriteTop(landmark));
      }
      ctx.globalAlpha = 1;
      ctx.imageSmoothingEnabled = false;
      for (const { landmark, logo } of art.landmarks) {
        if (!logo || !landmark.sign) continue;
        const { size } = landmark.sign;
        const sx = landmark.x - left + landmark.sign.x;
        const sy = ground + spriteTop(landmark) + landmark.sign.y;
        if (sx < -40 || sx > width) continue;
        ctx.drawImage(logo, sx, sy, size, size);
      }
      if (Math.sin(t * 3) > 0.2) {
        ctx.fillStyle = "#ff5a4f";
        ctx.fillRect(BEACON.x - left - 1, ground + BEACON.y, 3, 2);
      }

      const doorOpen = clamp(walk.finale / 0.12, 0, 1);
      if (doorOpen > 0) {
        const doorX = DOOR.x - left;
        const doorY = ground + DOOR.y;
        ctx.globalAlpha = doorOpen;
        ctx.fillStyle = "#ffbe5c";
        ctx.fillRect(doorX, doorY, DOOR.width, DOOR.height);
        ctx.fillStyle = "#ffe9b0";
        ctx.fillRect(doorX + 3, doorY + 2, DOOR.width - 6, DOOR.height - 2);
        ctx.globalAlpha = 1;
      }

      for (const gem of GEMS) {
        if (walk.collected.has(gem.label)) continue;
        const sx = gem.x - left;
        if (sx < -10 || sx > width + 10) continue;
        const bob = reduced ? 0 : Math.round(Math.sin(t * 3 + gem.x) * 2);
        drawGem(ctx, sx, ground - 28 + bob, gem.color);
      }
    },
    cut(hole) {
      cutHole(ctx, hole.x + (hole.camera - Math.floor(hole.camera)), hole.y, hole.radius);
    },
  };
}
