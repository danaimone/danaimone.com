import { bayerThreshold, smoothstep } from "./math";
import { PATH_ROWS } from "./path";

type Ctx = CanvasRenderingContext2D;

// Accepts "#rrggbb" or the "rgb(r,g,b)" strings mix() returns.
function hex(c: string) {
  if (c[0] !== "#") return c.match(/\d+/g)!.slice(0, 3).map(Number);
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function mix(a: string, b: string, t: number) {
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
export function paintSky(img: ImageData, sky: ReturnType<typeof skyAt>, horizon: number) {
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

function hash(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function rect(ctx: Ctx, color: string, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

const SUN_HALO = { inner: 16, outer: 56, strength: 0.34 };

export function sunHalo(color: string) {
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
export function drawSun(ctx: Ctx, { halo, warmHalo, sprite, warm }: SunArt, cx: number, cy: number, evening: number) {
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

const PUFF_RADII = [2, 3, 4, 5, 6, 7];
const PUFF_CELL = 18;
const PUFF_LOBES = [[0, 0, 1], [-0.65, 0.3, 0.68], [0.65, 0.25, 0.72], [0.1, -0.55, 0.7]];
const PUFF_LIGHT = "#e4e6f4";
const PUFF_BODY = "#b8bcd8";
const PUFF_SHADE = "#7c80a8";
const PUFF_ALPHA = 0.62;

export function smokePuffs() {
  const atlas = document.createElement("canvas");
  atlas.width = PUFF_CELL;
  atlas.height = PUFF_CELL * PUFF_RADII.length;
  const c = atlas.getContext("2d")!;
  PUFF_RADII.forEach((radius, row) => {
    for (let y = 0; y < PUFF_CELL; y++) {
      for (let x = 0; x < PUFF_CELL; x++) {
        const dx = x - PUFF_CELL / 2 + 0.5;
        const dy = y - PUFF_CELL / 2 + 0.5;
        const reach = Math.max(...PUFF_LOBES.map(([lx, ly, size]) => 1 - Math.hypot(dx - lx * radius * 0.6, dy - ly * radius * 0.6) / (radius * size)));
        if (reach <= 0) continue;
        const lit = (-dx - dy) / radius;
        c.fillStyle = lit > 0.5 ? PUFF_LIGHT : lit < -0.45 ? PUFF_SHADE : PUFF_BODY;
        c.fillRect(x, row * PUFF_CELL + y, 1, 1);
      }
    }
  });
  return atlas;
}

export function drawPuff(ctx: Ctx, puffs: HTMLCanvasElement, x: number, y: number, age: number) {
  const row = Math.min(PUFF_RADII.length - 1, Math.floor(age * 1.15 * PUFF_RADII.length));
  ctx.globalAlpha = PUFF_ALPHA * (1 - age) ** 0.7;
  ctx.drawImage(puffs, 0, row * PUFF_CELL, PUFF_CELL, PUFF_CELL, Math.round(x - PUFF_CELL / 2), Math.round(y - PUFF_CELL / 2), PUFF_CELL, PUFF_CELL);
}

type TurningTiles = { before: HTMLImageElement; turn: HTMLImageElement; after: HTMLImageElement };

export function tileThroughTurn(ctx: Ctx, { before, turn, after }: TurningTiles, turnX: number, width: number, baseY: number) {
  for (let x = turnX - before.width; x > -before.width; x -= before.width) ctx.drawImage(before, x, baseY - before.height);
  ctx.drawImage(turn, turnX, baseY - turn.height);
  for (let x = turnX + turn.width; x < width; x += after.width) ctx.drawImage(after, x, baseY - after.height);
}

export const GROUND_DEPTH = 40;
// Rows of soil under the path; the timeline sits here.
export const SOIL_DEPTH = 25;

const SOIL_FLECK = { from: 0.6, to: 0.615, topRow: 19, rows: 14 };

export function soilFlecks(worldWidth: number) {
  const flecks: { x: number; row: number }[] = [];
  for (let x = 0; x < worldWidth; x++) {
    const n = hash(x);
    if (n > SOIL_FLECK.from && n < SOIL_FLECK.to) flecks.push({ x, row: SOIL_FLECK.topRow + Math.floor(hash(x + 3) * SOIL_FLECK.rows) });
  }
  return flecks;
}

export function paintGround(ctx: Ctx, path: HTMLCanvasElement, flecks: ReturnType<typeof soilFlecks>, camX: number, viewW: number, ground: number, viewH: number) {
  rect(ctx, "#3d2f27", 0, ground + PATH_ROWS, viewW, viewH - ground - PATH_ROWS);
  const left = Math.floor(camX);
  ctx.drawImage(path, left, 0, viewW + 1, path.height, left - camX, ground - 2, viewW + 1, path.height);
  ctx.fillStyle = "#2f241e";
  for (const { x, row } of flecks) {
    if (x >= left && x <= left + viewW) ctx.fillRect(x - camX, ground + row, 2, 1);
  }
}

export function drawGem(ctx: Ctx, x: number, y: number, color: string) {
  const p = 2;
  const px = (dx: number, dy: number, w: number, h: number, c = color) => rect(ctx, c, x + dx * p, y + dy * p, w * p, h * p);
  px(-1, -3, 3, 1);
  px(-2, -2, 5, 2);
  px(-1, 0, 3, 1);
  px(0, 1, 1, 1);
  px(-1, -2, 1, 1, "#ffffff");
}
