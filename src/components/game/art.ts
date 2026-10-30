// Scenery for the career walk: sky, mountains, hills, trees, clouds, and the
// path. Characters and landmarks are pixel-art sprites in /public/game (see
// scripts/art-prompts and scripts/pixelize.py); everything here is drawn in
// code at the canvas's logical resolution.

type Ctx = CanvasRenderingContext2D;

// ---------------------------------------------------------------- colour

// Accepts "#rrggbb" or the "rgb(r,g,b)" strings mix() returns.
export function hex(c: string) {
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
type Sky = {
  at: number;
  top: string;
  mid: string;
  low: string;
  tint: string;
  tintAlpha: number;
  stars: number;
  lights: number;
};

const SKIES: Sky[] = [
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
  const s = t * t * (3 - 2 * t);
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

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

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
      const c = frac > BAYER[(y & 3) * 4 + (x & 3)] ? bands[k + 1] : bands[k];
      const o = (y * w + x) * 4;
      data[o] = c[0];
      data[o + 1] = c[1];
      data[o + 2] = c[2];
      data[o + 3] = 255;
    }
  }
}

// ---------------------------------------------------------------- noise

export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

// ---------------------------------------------------------------- shapes

function rect(ctx: Ctx, color: string, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

export function disc(ctx: Ctx, cx: number, cy: number, r: number, color: string) {
  ctx.fillStyle = color;
  for (let y = -r; y <= r; y++) {
    const w = Math.round(Math.sqrt(r * r - y * y + r * 0.6));
    ctx.fillRect(cx - w, cy + y, w * 2 + 1, 1);
  }
}

export function crescent(ctx: Ctx, cx: number, cy: number, r: number, color: string) {
  ctx.fillStyle = color;
  const ox = Math.round(r * 0.55);
  const oy = -Math.round(r * 0.35);
  for (let y = -r; y <= r; y++)
    for (let x = -r; x <= r; x++) {
      const inA = x * x + y * y <= r * r + r * 0.6;
      const inB = (x - ox) ** 2 + (y - oy) ** 2 <= r * r * 0.82;
      if (inA && !inB) ctx.fillRect(cx + x, cy + y, 1, 1);
    }
}

// ---------------------------------------------------------------- layers

export function tileAcross(ctx: Ctx, tile: HTMLImageElement, width: number, baseY: number) {
  for (let x = 0; x < width; x += tile.width) ctx.drawImage(tile, x, baseY - tile.height);
}

// ---------------------------------------------------------------- ground

export const GROUND_DEPTH = 40;
// Rows of soil under the path; the timeline sits here.
export const SOIL_DEPTH = 25;

export function paintGround(ctx: Ctx, camX: number, viewW: number, ground: number, viewH: number) {
  rect(ctx, "#5b8a4a", 0, ground, viewW, 3);
  rect(ctx, "#8a6a4c", 0, ground + 3, viewW, 11);
  rect(ctx, "#6e523a", 0, ground + 14, viewW, 1);
  rect(ctx, "#3d2f27", 0, ground + 15, viewW, viewH - ground - 15);
  const start = Math.floor(camX);
  for (let wx = start; wx < start + viewW + 1; wx++) {
    const n = hash(wx);
    const x = wx - camX;
    if (n < 0.2) rect(ctx, "#466f3b", x, ground - 1 - (n < 0.06 ? 1 : 0), 1, 1 + (n < 0.06 ? 1 : 0));
    if (n > 0.93) rect(ctx, "#6e523a", x, ground + 5 + Math.floor(hash(wx + 9) * 7), 1 + (n > 0.98 ? 1 : 0), 1);
    if (n > 0.6 && n < 0.615) rect(ctx, "#2f241e", x, ground + 19 + Math.floor(hash(wx + 3) * 14), 2, 1);
  }
}

// Skill gems: a cut stone that bobs above the path, drawn at 2x.
export function drawGem(ctx: Ctx, x: number, y: number, color: string) {
  const p = 2;
  const px = (dx: number, dy: number, w: number, h: number, c = color) => rect(ctx, c, x + dx * p, y + dy * p, w * p, h * p);
  px(-1, -3, 3, 1);
  px(-2, -2, 5, 2);
  px(-1, 0, 3, 1);
  px(0, 1, 1, 1);
  px(-1, -2, 1, 1, "#ffffff");
}
