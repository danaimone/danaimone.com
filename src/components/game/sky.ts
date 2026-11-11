import type { Art } from "./assets";
import { DITHER_PERIOD, bayerThreshold, rng, smoothstep } from "./math";
import { CLOUD_KINDS } from "./sheets";
import { cutHole, fitCanvas, type Frame, type Sky, type Viewport, type WalkSurface } from "./surface";
import { clamp } from "./track";

const REVEAL = { from: 3380, to: 3930, summitAt: 0.56, baseBelowGround: 6, buriedTop: 70, drift: 34 };
const REVEAL_FADE = 0.4;
const ALPENGLOW = { pace: 1.15, alpha: 0.75 };
const MOONLIT = { from: 0.55, over: 0.45, alpha: 0.6 };
const SKY_REPAINT_STEPS = 300;
const HORIZON_ABOVE_GROUND = 10;
const SUN_ARC = { from: 0.02, over: 0.76, left: 0.12, across: 0.8, aboveGround: 14, rise: 0.72 };
const SUN_ARC_OVERRUN = 0.14;
const SUN_EVENING = { from: 0.6, over: 0.4 };
const MOON = { risesFrom: 0.9, risesOver: 0.1, x: 0.18, lowY: 0.42, climb: 0.22 };
const MOON_DISC = { x: 12, y: 20, radius: 20.5 };
const STARS = { areaPerStar: 700, skyShare: 0.62, minBrightness: 0.4, brightnessSpread: 0.6 };
const TWINKLE = { base: 0.6, depth: 0.4, rate: 1.7 };
const CLOUDS = { parallax: 0.08, drift: 2, appearFrom: 0.06, appearOver: 0.06 };
const CLOUD_SPAWN = { gap: 150, gapSpread: 170, top: 0.04, topSpread: 0.34, speed: 0.6, speedSpread: 0.8 };
const CLOUD_MARGIN = 200;

type Ctx = CanvasRenderingContext2D;

type Star = { x: number; y: number; brightness: number; phase: number };
type Cloud = { x: number; y: number; kind: number; facing: "left" | "right"; speed: number };

// Accepts "#rrggbb" or the "rgb(r,g,b)" strings mix() returns.
function hex(c: string) {
  if (c[0] !== "#") return c.match(/\d+/g)!.slice(0, 3).map(Number);
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a: string, b: string, t: number) {
  const x = hex(a);
  const y = hex(b);
  const c = x.map((v, i) => Math.round(v + (y[i] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

// Time of day along the walk: dawn at the start, the avatar's own violet
// dusk in the present, night at the cabin.
type SkyKey = {
  at: number;
  top: string;
  mid: string;
  low: string;
  tint: string;
  tintAlpha: number;
  stars: number;
  lights: number;
};

const SKIES: SkyKey[] = [
  { at: 0, top: "#2c3a72", mid: "#9a7fbf", low: "#ffb98a", tint: "#6a4f8e", tintAlpha: 0.24, stars: 0.22, lights: 0.4 },
  { at: 0.14, top: "#4677c2", mid: "#8bb2e3", low: "#f4dcc6", tint: "#ff9d6e", tintAlpha: 0.06, stars: 0, lights: 0 },
  { at: 0.42, top: "#3c71c2", mid: "#83ade2", low: "#dfeaf3", tint: "#ffffff", tintAlpha: 0, stars: 0, lights: 0 },
  { at: 0.62, top: "#46579f", mid: "#d6897c", low: "#ffc871", tint: "#ff7f3f", tintAlpha: 0.14, stars: 0, lights: 0.3 },
  { at: 0.8, top: "#231f4c", mid: "#7268c3", low: "#ff9a5c", tint: "#3a2f6a", tintAlpha: 0.34, stars: 0.5, lights: 0.85 },
  { at: 0.93, top: "#0c0b1a", mid: "#211c42", low: "#4b3566", tint: "#121029", tintAlpha: 0.56, stars: 1, lights: 1 },
  { at: 1, top: "#0c0b1a", mid: "#211c42", low: "#4b3566", tint: "#121029", tintAlpha: 0.56, stars: 1, lights: 1 },
];

export function skyAt(p: number) {
  let i = 0;
  while (i < SKIES.length - 2 && p > SKIES[i + 1].at) i++;
  const a = SKIES[i];
  const b = SKIES[i + 1];
  const t = Math.min(1, Math.max(0, (p - a.at) / (b.at - a.at)));
  const s = smoothstep(t);
  return {
    top: mix(a.top, b.top, s),
    mid: mix(a.mid, b.mid, s),
    low: mix(a.low, b.low, s),
    tint: mix(a.tint, b.tint, s),
    tintAlpha: a.tintAlpha + (b.tintAlpha - a.tintAlpha) * s,
    stars: a.stars + (b.stars - a.stars) * s,
    lights: a.lights + (b.lights - a.lights) * s,
  };
}

// Banded, ordered-dithered sky: the gradient is quantised into steps and the
// boundaries are dithered, the way a pixel artist would paint it.
function paintSky(img: ImageData, sky: ReturnType<typeof skyAt>, horizon: number) {
  const { width: w, height: h, data } = img;
  const top = hex(sky.top);
  const mid = hex(sky.mid);
  const low = hex(sky.low);
  const BANDS = 18;
  const band = (k: number) => {
    const t = k / (BANDS - 1);
    const [a, b, u] = t < 0.62 ? [top, mid, t / 0.62] : [mid, low, (t - 0.62) / 0.38];
    return a.map((v, i) => Math.round(v + (b[i] - v) * u));
  };
  const bands = Array.from({ length: BANDS }, (_, k) => band(k));
  for (let y = 0; y < h; y++) {
    const f = Math.min(1, y / horizon) * (BANDS - 1);
    const k = Math.min(BANDS - 2, Math.floor(f));
    const frac = f - k;
    for (let x = 0; x < w; x++) {
      const c = frac > bayerThreshold(x, y) ? bands[k + 1] : bands[k];
      const o = (y * w + x) * 4;
      data[o] = c[0];
      data[o + 1] = c[1];
      data[o + 2] = c[2];
      data[o + 3] = 255;
    }
  }
}

const SUN_HALO = { inner: 16, outer: 56, strength: 0.34 };

function sunHalo(color: string) {
  const size = SUN_HALO.outer * 2;
  const halo = document.createElement("canvas");
  halo.width = size;
  halo.height = size;
  const c = halo.getContext("2d")!;
  const [r, g, b] = hex(color);
  const glow = c.createRadialGradient(SUN_HALO.outer, SUN_HALO.outer, SUN_HALO.inner, SUN_HALO.outer, SUN_HALO.outer, SUN_HALO.outer);
  for (let stop = 0; stop <= 8; stop++) {
    const fade = 1 - stop / 8;
    glow.addColorStop(stop / 8, `rgba(${r},${g},${b},${fade * fade * SUN_HALO.strength})`);
  }
  c.fillStyle = glow;
  c.fillRect(0, 0, size, size);
  return halo;
}

type SunArt = { halo: HTMLCanvasElement; warmHalo: HTMLCanvasElement; sprite: HTMLImageElement; warm: HTMLCanvasElement };

// One sprite along the whole arc; only the warm overlay grows with the evening.
function drawSun(ctx: Ctx, { halo, warmHalo, sprite, warm }: SunArt, cx: number, cy: number, evening: number) {
  if (evening < 1) {
    ctx.globalAlpha = 1 - evening;
    ctx.drawImage(halo, cx - SUN_HALO.outer, cy - SUN_HALO.outer);
  }
  if (evening > 0) {
    ctx.globalAlpha = evening;
    ctx.drawImage(warmHalo, cx - SUN_HALO.outer, cy - SUN_HALO.outer);
  }
  const left = cx - Math.floor(sprite.width / 2);
  const top = cy - Math.floor(sprite.height / 2);
  ctx.globalAlpha = 1;
  ctx.drawImage(sprite, left, top);
  if (evening > 0) {
    ctx.globalAlpha = evening;
    ctx.drawImage(warm, left, top);
  }
  ctx.globalAlpha = 1;
}

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
  const bandedCtx = banded.getContext("2d")!;
  const tile = document.createElement("canvas");
  tile.width = DITHER_PERIOD;
  const tileCtx = tile.getContext("2d")!;
  let tilePixels: ImageData | null = null;
  let paintedStep = "";
  let painted = "";
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
    let cx = (cloud.x - camera * CLOUDS.parallax + drift * cloud.speed) % span;
    if (cx < 0) cx += span;
    return Math.round(cx - CLOUD_MARGIN);
  }

  // The banded sky is repainted only when the time of day crosses a step.
  function paintBands(tod: number, sky: Sky) {
    const step = `${Math.round(tod * SKY_REPAINT_STEPS)}`;
    if (step === paintedStep || !tilePixels) return;
    const { width, height, ground } = viewport;
    paintSky(tilePixels, sky, ground - HORIZON_ABOVE_GROUND);
    tileCtx.putImageData(tilePixels, 0, 0);
    bandedCtx.fillStyle = bandedCtx.createPattern(tile, "repeat")!;
    bandedCtx.fillRect(0, 0, width, height);
    tintClouds(sky);
    stage.style.backgroundColor = mix("#3d2f27", sky.tint, sky.tintAlpha);
    paintedStep = step;
  }

  function paintRainier(reveal: number) {
    const { width, ground } = viewport;
    const eased = smoothstep(reveal);
    const restTop = ground + REVEAL.baseBelowGround - rainier.height;
    const buried = ground - REVEAL.buriedTop;
    const mountainX = Math.round(width * REVEAL.summitAt - rainier.width / 2 - eased * REVEAL.drift);
    const mountainY = Math.round(buried + (restTop - buried) * eased);
    ctx.globalAlpha = clamp(reveal / REVEAL_FADE, 0, 1);
    ctx.drawImage(rainier, mountainX, mountainY);
    ctx.globalAlpha = clamp((reveal - REVEAL_FADE) / REVEAL_FADE, 0, 1) * Math.sin(Math.PI * Math.min(reveal * ALPENGLOW.pace, 1)) * ALPENGLOW.alpha;
    ctx.drawImage(alpenglow, mountainX, mountainY);
    ctx.globalAlpha = clamp((reveal - MOONLIT.from) / MOONLIT.over, 0, 1) * MOONLIT.alpha;
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
      tile.height = height;
      tilePixels = tileCtx.createImageData(DITHER_PERIOD, height);
      paintedStep = "";
      painted = "";
      const r = rng(3);
      clouds = [];
      for (let cx = 0; cx < width + CLOUD_MARGIN * 2; cx += CLOUD_SPAWN.gap + r() * CLOUD_SPAWN.gapSpread) {
        clouds.push({
          x: cx,
          y: Math.round(ground * (CLOUD_SPAWN.top + r() * CLOUD_SPAWN.topSpread)),
          kind: Math.floor(r() * CLOUD_KINDS),
          facing: r() < 0.5 ? "right" : "left",
          speed: CLOUD_SPAWN.speed + r() * CLOUD_SPAWN.speedSpread,
        });
      }
      stars = Array.from({ length: Math.round((width * ground) / STARS.areaPerStar) }, () => ({
        x: Math.floor(r() * width),
        y: Math.floor(r() * ground * STARS.skyShare),
        brightness: STARS.minBrightness + r() * STARS.brightnessSpread,
        phase: r() * 6,
      }));
    },
    paint({ t, camera, tod, sky, walk }: Frame) {
      const { width, ground } = viewport;
      const reveal = clamp((walk.dan.x - REVEAL.from) / (REVEAL.to - REVEAL.from), 0, 1);
      const cloudAlpha = clamp((tod - CLOUDS.appearFrom) / CLOUDS.appearOver, 0, 1) * (1 - clamp(reveal / REVEAL_FADE, 0, 1));
      const drift = reduced ? 0 : t * CLOUDS.drift;
      const cloudLefts = cloudAlpha > 0 ? clouds.map((c) => cloudLeft(c, camera, drift)) : [];
      const scene = !reduced && sky.stars > 0.02 ? "" : `${tod} ${walk.dan.x} ${cloudLefts}`;
      if (scene && scene === painted) return;
      painted = scene;
      paintBands(tod, sky);
      ctx.drawImage(banded, 0, 0, width, ground, 0, 0, width, ground);

      const moonRise = clamp((tod - MOON.risesFrom) / MOON.risesOver, 0, 1);
      const moonLeft = Math.round(width * MOON.x) - art.moon.width / 2;
      const moonTop = Math.round(ground * (MOON.lowY - moonRise * MOON.climb)) - art.moon.height / 2;
      if (sky.stars > 0.02) {
        ctx.fillStyle = "#fff7e6";
        for (const s of stars) {
          const tw = reduced ? 1 : TWINKLE.base + TWINKLE.depth * Math.sin(t * TWINKLE.rate + s.phase);
          const behindMoon = moonRise > 0 && Math.hypot(s.x - moonLeft - MOON_DISC.x, s.y - moonTop - MOON_DISC.y) < MOON_DISC.radius;
          ctx.globalAlpha = clamp(sky.stars * s.brightness * tw * (behindMoon ? 1 - moonRise : 1), 0, 1);
          ctx.fillRect(s.x, s.y, 1, 1);
        }
        ctx.globalAlpha = 1;
      }
      if (moonRise > 0) {
        ctx.globalAlpha = moonRise;
        ctx.drawImage(art.moon, moonLeft, moonTop);
        ctx.globalAlpha = 1;
      }

      // The sun's arc runs on past the horizon, so the world hides it at both ends.
      const sunT = (tod - SUN_ARC.from) / SUN_ARC.over;
      if (sunT > -SUN_ARC_OVERRUN && sunT < 1 + SUN_ARC_OVERRUN) {
        const sx = Math.round(width * (SUN_ARC.left + sunT * SUN_ARC.across));
        const sy = Math.round(ground - SUN_ARC.aboveGround - Math.sin(sunT * Math.PI) * (ground * SUN_ARC.rise));
        drawSun(ctx, sunArt, sx, sy, clamp((sunT - SUN_EVENING.from) / SUN_EVENING.over, 0, 1));
      }

      ctx.globalAlpha = cloudAlpha;
      const { height } = art.clouds;
      cloudLefts.forEach((left, i) => {
        const c = clouds[i];
        const column = c.facing === "right" ? c.kind : CLOUD_KINDS - 1 - c.kind;
        const row = c.facing === "right" ? 0 : height;
        ctx.drawImage(tintedClouds, column * cloudWidth, row, cloudWidth, height, left, c.y, cloudWidth, height);
      });
      ctx.globalAlpha = 1;

      if (reveal > 0) paintRainier(reveal);
    },
    cut(hole) {
      cutHole(ctx, hole.x, hole.y, hole.radius);
      painted = "";
    },
  };
}
