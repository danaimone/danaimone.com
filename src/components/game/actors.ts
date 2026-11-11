import type { Art } from "./assets";
import { DAN_SHEET, MISHKA_SHEET } from "./sheets";
import type { Particles } from "./particles";
import { cutHole, fitCanvas, type Frame, type Viewport, type WalkSurface } from "./surface";
import { clamp } from "./track";
import { spriteTop } from "./world";

const FOOT_DROP = 3;
const BARK_MARK = { fromSide: 38, top: -14, width: 3, height: 7, gap: 2, color: "#fab387", ink: "#11111b" };

function slice(image: HTMLImageElement, width: number, height: number) {
  const frames = (flip: boolean) =>
    Array.from({ length: Math.round(image.width / width) }, (_, i) => {
      const frame = document.createElement("canvas");
      frame.width = width;
      frame.height = height;
      const c = frame.getContext("2d")!;
      if (flip) {
        c.translate(width, 0);
        c.scale(-1, 1);
      }
      c.drawImage(image, i * width, 0, width, height, 0, 0, width, height);
      return frame;
    });
  return { right: frames(false), left: frames(true) };
}

// The actors canvas: Dan and Mishka with their shadows, the teleport beam, and the
// particles. The walkers stay put on screen while the world slides under them.
export function createActors({ canvas, art, particles }: { canvas: HTMLCanvasElement; art: Art; particles: Particles }): WalkSurface {
  const ctx = canvas.getContext("2d")!;
  const dan = slice(art.dan, DAN_SHEET.width, DAN_SHEET.height);
  const dog = slice(art.mishka, MISHKA_SHEET.width, MISHKA_SHEET.height);
  let viewport: Viewport;
  let painted = "";

  function drawContactShadow(x: number, y: number, halfWidth: number, lift: number, presence: number) {
    const shrink = clamp(1 - lift / 60, 0.4, 1);
    const half = Math.round(halfWidth * shrink);
    ctx.fillStyle = "#1a1014";
    ctx.globalAlpha = 0.34 * presence;
    ctx.fillRect(Math.round(x) - half, y - 1, half * 2, 2);
    ctx.fillRect(Math.round(x) - half + 3, y + 1, half * 2 - 6, 1);
    ctx.globalAlpha = 1;
  }

  return {
    elements: [canvas],
    resize(next) {
      viewport = next;
      fitCanvas(canvas, viewport.width, viewport.height, viewport.scale);
      painted = "";
    },
    paint({ camera, camX, walk: { dan: walker, mishka, warpLevel } }: Frame) {
      const { width, height, ground } = viewport;
      const scene = particles.showsIn(camX, width)
        ? ""
        : `${camera} ${warpLevel} ${walker.x} ${walker.facing} ${walker.lift} ${walker.frame} ${mishka.x} ${mishka.facing} ${mishka.lift} ${mishka.frame} ${mishka.depthRows} ${mishka.inFront} ${mishka.barking}`;
      if (scene && scene === painted) return;
      painted = scene;
      ctx.clearRect(0, 0, width, height);
      if (warpLevel > 0) {
        for (const wx of [walker.x, mishka.x]) {
          const beamX = Math.round(wx - camX);
          ctx.globalAlpha = warpLevel * 0.35;
          ctx.fillStyle = "#cba6f7";
          ctx.fillRect(beamX - 16, 0, 32, ground + 2);
          ctx.globalAlpha = warpLevel * 0.8;
          ctx.fillStyle = "#fde3cf";
          ctx.fillRect(beamX - 6, 0, 12, ground + 2);
        }
        ctx.globalAlpha = 1;
      }

      // The beam fades both walkers out at one place and in at the next.
      const presence = 1 - warpLevel;
      const mishkaLeft = Math.round(mishka.x - camera - MISHKA_SHEET.width / 2);
      const mishkaTop = Math.round(ground + FOOT_DROP + spriteTop(MISHKA_SHEET) - mishka.lift) + mishka.depthRows;
      const danLeft = Math.round(walker.x - camera - DAN_SHEET.width / 2);
      const danTop = Math.round(ground + FOOT_DROP + spriteTop(DAN_SHEET) - walker.lift);
      const drawMishka = () => {
        drawContactShadow(mishka.x - camera, ground + FOOT_DROP + 2 + mishka.depthRows, 19, mishka.lift, presence);
        ctx.globalAlpha = presence;
        ctx.drawImage(dog[mishka.facing][mishka.frame], mishkaLeft, mishkaTop);
        if (mishka.barking) {
          const headX = mishkaLeft + (mishka.facing === "right" ? BARK_MARK.fromSide : MISHKA_SHEET.width - BARK_MARK.fromSide - BARK_MARK.width);
          const { top, width: markWidth, height: markHeight, gap, color, ink } = BARK_MARK;
          const stroke = (fill: string, grow: number) => {
            ctx.fillStyle = fill;
            ctx.fillRect(headX - grow, mishkaTop + top - grow, markWidth + grow * 2, markHeight + grow * 2);
            ctx.fillRect(headX - grow, mishkaTop + top + markHeight + gap - grow, markWidth + grow * 2, markWidth + grow * 2);
          };
          stroke(ink, 1);
          stroke(color, 0);
        }
      };
      const drawDan = () => {
        drawContactShadow(walker.x - camera, ground + FOOT_DROP + 2, 15, walker.lift, presence);
        ctx.globalAlpha = presence;
        ctx.drawImage(dan[walker.facing][walker.frame], danLeft, danTop);
      };
      if (mishka.inFront) {
        drawDan();
        drawMishka();
      } else {
        drawMishka();
        drawDan();
      }
      ctx.globalAlpha = 1;

      particles.draw(ctx, camX);
    },
    cut(hole) {
      cutHole(ctx, hole.x, hole.y, hole.radius);
      painted = "";
    },
  };
}
