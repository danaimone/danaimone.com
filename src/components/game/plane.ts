import type { Art } from "./assets";
import { rng } from "./math";
import { PROP_SHEET } from "./sheets";
import { buildPath, paintGround, placeProps, soilFlecks } from "./path";
import { cutHole, fitCanvas, slideInDevicePixels, tintOver, type Frame, type Viewport, type WalkSurface } from "./surface";
import { clamp } from "./track";
import { BEACON, DOOR, GEMS, WORLD_WIDTH, spriteTop } from "./world";

const PROP_ROOT_ROW = 2;
const DOOR_OPEN_BY_FINALE = 0.12;
const GEM_FLOAT_HEIGHT = 28;

function drawGem(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  const p = 2;
  const px = (dx: number, dy: number, w: number, h: number, c = color) => {
    ctx.fillStyle = c;
    ctx.fillRect(x + dx * p, y + dy * p, w * p, h * p);
  };
  px(-1, -3, 3, 1);
  px(-2, -2, 5, 2);
  px(-1, 0, 3, 1);
  px(0, 1, 1, 1);
  px(-1, -2, 1, 1, "#ffffff");
}

export function createPlane({ canvas, art, reduced }: { canvas: HTMLCanvasElement; art: Art; reduced: boolean }): WalkSurface {
  const ctx = canvas.getContext("2d")!;
  const path = buildPath();
  const flecks = soilFlecks(WORLD_WIDTH);
  let viewport: Viewport;
  let props: { x: number; kind: number }[] = [];
  let slid = -1;
  let painted = "";

  return {
    elements: [canvas],
    resize(next) {
      viewport = next;
      fitCanvas(canvas, viewport.width + 1, viewport.height, viewport.scale);
      slid = -1;
      painted = "";
      props = placeProps(rng(9));
    },
    paint({ t, camera, sky, walk }: Frame) {
      const { height, ground, scale } = viewport;
      const width = viewport.width + 1;
      const left = Math.floor(camera);
      slid = slideInDevicePixels(canvas, camera - left, scale, slid);

      const beaconOn = Math.sin(t * 3) > 0.2;
      const doorOpen = clamp(walk.finale / DOOR_OPEN_BY_FINALE, 0, 1);
      const gems = GEMS.filter((gem) => !walk.collected.has(gem.label) && gem.x - left >= -10 && gem.x - left <= width + 10).map((gem) => ({
        ...gem,
        bob: reduced ? 0 : Math.round(Math.sin(t * 3 + gem.x) * 2),
      }));
      const scene = `${left} ${sky.tint} ${sky.tintAlpha} ${sky.lights} ${beaconOn} ${doorOpen} ${gems.map((gem) => `${gem.label}:${gem.bob}`)}`;
      if (scene === painted) return;
      painted = scene;

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
        if (sx < -size || sx > width) continue;
        ctx.drawImage(logo, sx, sy, size, size);
      }
      if (beaconOn) {
        ctx.fillStyle = "#ff5a4f";
        ctx.fillRect(BEACON.x - left - 1, ground + BEACON.y, 3, 2);
      }

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

      for (const gem of gems) drawGem(ctx, gem.x - left, ground - GEM_FLOAT_HEIGHT + gem.bob, gem.color);
    },
    cut(hole) {
      cutHole(ctx, hole.x + (hole.camera - Math.floor(hole.camera)), hole.y, hole.radius);
      painted = "";
    },
  };
}
