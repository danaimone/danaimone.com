import { DITHER_PERIOD, drawSun, mix, paintSky, rng, sunHalo } from "./art";
import { CLOUD_KINDS, type Art } from "./assets";
import { cutHole, fitCanvas, type Frame, type Sky, type Viewport, type WalkSurface } from "./surface";
import { clamp } from "./track";

const REVEAL = { from: 3380, to: 3930, summitAt: 0.56, baseBelowGround: 6, buriedTop: 70, drift: 34 };
const REVEAL_FADE = 0.4;
const SUN_ARC_OVERRUN = 0.14;
const MOON_DISC = { x: 12, y: 20, radius: 20.5 };
const CLOUD_MARGIN = 200;

type Star = { x: number; y: number; b: number; s: number };
type Cloud = { x: number; y: number; kind: number; facing: "left" | "right"; speed: number };

function tinted(img: HTMLImageElement, color: string, alpha: number) {
  const layer = document.createElement("canvas");
  layer.width = img.width;
  layer.height = img.height;
  const c = layer.getContext("2d")!;
  c.drawImage(img, 0, 0);
  c.globalCompositeOperation = "source-atop";
  c.globalAlpha = alpha;
  c.fillStyle = color;
  c.fillRect(0, 0, img.width, img.height);
  return layer;
}

// The sky canvas: the banded sky, stars, moon, sun and clouds, and Rainier rising
// out of the ground at the end of the walk.
export function createSky({ canvas, stage, art, reduced }: { canvas: HTMLCanvasElement; stage: HTMLElement; art: Art; reduced: boolean }): WalkSurface {
  const ctx = canvas.getContext("2d")!;
  const { rainier } = art;
  const alpenglow = tinted(rainier, "#ff8a78", 0.5);
  const moonlit = tinted(rainier, "#1f2350", 0.62);
  const sunArt = {
    halo: sunHalo("#fff3b8"),
    warmHalo: sunHalo("#ff9d5c"),
    sprite: art.sun,
    warm: tinted(art.sun, "#ff6a2c", 0.45),
  };
  const cloudWidth = art.clouds.width / CLOUD_KINDS;
  const tintedClouds = document.createElement("canvas");
  tintedClouds.width = art.clouds.width;
  tintedClouds.height = art.clouds.height * 2;
  const tintedCloudsCtx = tintedClouds.getContext("2d")!;
  const banded = document.createElement("canvas");
  let bandedCtx = banded.getContext("2d")!;
  const tile = document.createElement("canvas");
  tile.width = DITHER_PERIOD;
  let tileCtx = tile.getContext("2d")!;
  let tilePixels: ImageData | null = null;
  let paintedStep = "";
  let viewport: Viewport;
  let stars: Star[] = [];
  let clouds: Cloud[] = [];

  function tintClouds(sky: Sky) {
    const { width, height } = art.clouds;
    const c = tintedCloudsCtx;
    c.globalCompositeOperation = "source-over";
    c.clearRect(0, 0, width, height * 2);
    c.drawImage(art.clouds, 0, 0);
    c.setTransform(-1, 0, 0, 1, width, 0);
    c.drawImage(art.clouds, 0, height);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = "source-atop";
    c.globalAlpha = Math.min(0.8, sky.tintAlpha * 2.2);
    c.fillStyle = mix(sky.low, sky.tint, 0.5);
    c.fillRect(0, 0, width, height * 2);
    c.globalAlpha = 1;
  }

  function cloudLeft(cloud: Cloud, camera: number, drift: number) {
    const span = viewport.width + CLOUD_MARGIN * 2;
    let cx = (cloud.x - camera * 0.08 + drift * cloud.speed) % span;
    if (cx < 0) cx += span;
    return Math.round(cx - CLOUD_MARGIN);
  }

  // The banded sky is repainted only when the time of day crosses a step.
  function paintBands(tod: number, sky: Sky) {
    const step = `${Math.round(tod * 300)}`;
    if (step === paintedStep || !tilePixels) return;
    const { width, height, ground } = viewport;
    paintSky(tilePixels, sky, ground - 10);
    tileCtx.putImageData(tilePixels, 0, 0);
    bandedCtx.fillStyle = bandedCtx.createPattern(tile, "repeat")!;
    bandedCtx.fillRect(0, 0, width, height);
    tintClouds(sky);
    stage.style.backgroundColor = mix("#3d2f27", sky.tint, sky.tintAlpha);
    paintedStep = step;
  }

  function paintRainier(reveal: number) {
    const { width, ground } = viewport;
    const eased = reveal * reveal * (3 - 2 * reveal);
    const restTop = ground + REVEAL.baseBelowGround - rainier.height;
    const buried = ground - REVEAL.buriedTop;
    const mountainX = Math.round(width * REVEAL.summitAt - rainier.width / 2 - eased * REVEAL.drift);
    const mountainY = Math.round(buried + (restTop - buried) * eased);
    ctx.globalAlpha = clamp(reveal / REVEAL_FADE, 0, 1);
    ctx.drawImage(rainier, mountainX, mountainY);
    ctx.globalAlpha = clamp((reveal - REVEAL_FADE) / REVEAL_FADE, 0, 1) * Math.sin(Math.PI * Math.min(reveal * 1.15, 1)) * 0.75;
    ctx.drawImage(alpenglow, mountainX, mountainY);
    ctx.globalAlpha = clamp((reveal - 0.55) / 0.45, 0, 1) * 0.6;
    ctx.drawImage(moonlit, mountainX, mountainY);
    ctx.globalAlpha = 1;
  }

  return {
    elements: [canvas],
    resize(next) {
      viewport = next;
      const { width, height, ground, scale } = viewport;
      fitCanvas(canvas, width, height, scale);
      banded.width = width;
      banded.height = height;
      bandedCtx = banded.getContext("2d")!;
      tile.height = height;
      tileCtx = tile.getContext("2d")!;
      tilePixels = tileCtx.createImageData(DITHER_PERIOD, height);
      paintedStep = "";
      const r = rng(3);
      clouds = [];
      for (let cx = 0; cx < width + CLOUD_MARGIN * 2; cx += 150 + r() * 170) {
        clouds.push({
          x: cx,
          y: Math.round(ground * (0.04 + r() * 0.34)),
          kind: Math.floor(r() * CLOUD_KINDS),
          facing: r() < 0.5 ? "right" : "left",
          speed: 0.6 + r() * 0.8,
        });
      }
      stars = Array.from({ length: Math.round((width * ground) / 700) }, () => ({
        x: Math.floor(r() * width),
        y: Math.floor(r() * ground * 0.62),
        b: 0.4 + r() * 0.6,
        s: r() * 6,
      }));
    },
    paint({ t, camera, tod, sky, walk }: Frame) {
      const { width, ground } = viewport;
      paintBands(tod, sky);
      ctx.drawImage(banded, 0, 0, width, ground, 0, 0, width, ground);

      const moonRise = clamp((tod - 0.9) / 0.1, 0, 1);
      const moonLeft = Math.round(width * 0.18) - art.moon.width / 2;
      const moonTop = Math.round(ground * (0.42 - moonRise * 0.22)) - art.moon.height / 2;
      if (sky.stars > 0.02) {
        ctx.fillStyle = "#fff7e6";
        for (const s of stars) {
          const tw = reduced ? 1 : 0.6 + 0.4 * Math.sin(t * 1.7 + s.s);
          const behindMoon = moonRise > 0 && Math.hypot(s.x - moonLeft - MOON_DISC.x, s.y - moonTop - MOON_DISC.y) < MOON_DISC.radius;
          ctx.globalAlpha = clamp(sky.stars * s.b * tw * (behindMoon ? 1 - moonRise : 1), 0, 1);
          ctx.fillRect(s.x, s.y, 1, 1);
        }
        ctx.globalAlpha = 1;
      }
      const reveal = clamp((walk.dan.x - REVEAL.from) / (REVEAL.to - REVEAL.from), 0, 1);
      if (moonRise > 0) {
        ctx.globalAlpha = moonRise;
        ctx.drawImage(art.moon, moonLeft, moonTop);
        ctx.globalAlpha = 1;
      }

      // The sun's arc runs on past the horizon, so the world hides it at both ends.
      const sunT = (tod - 0.02) / 0.76;
      if (sunT > -SUN_ARC_OVERRUN && sunT < 1 + SUN_ARC_OVERRUN) {
        const sx = Math.round(width * (0.12 + sunT * 0.8));
        const sy = Math.round(ground - 14 - Math.sin(sunT * Math.PI) * (ground * 0.72));
        drawSun(ctx, sunArt, sx, sy, clamp((sunT - 0.6) / 0.4, 0, 1));
      }

      const cloudAlpha = clamp((tod - 0.06) / 0.06, 0, 1) * (1 - clamp(reveal / REVEAL_FADE, 0, 1));
      ctx.globalAlpha = cloudAlpha;
      if (cloudAlpha > 0) {
        const drift = reduced ? 0 : t * 2;
        const { height } = art.clouds;
        for (const c of clouds) {
          const column = c.facing === "right" ? c.kind : CLOUD_KINDS - 1 - c.kind;
          const row = c.facing === "right" ? 0 : height;
          ctx.drawImage(tintedClouds, column * cloudWidth, row, cloudWidth, height, cloudLeft(c, camera, drift), c.y, cloudWidth, height);
        }
      }
      ctx.globalAlpha = 1;

      if (reveal > 0) paintRainier(reveal);
    },
    cut(hole) {
      cutHole(ctx, hole.x, hole.y, hole.radius);
    },
  };
}
