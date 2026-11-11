import { PATH_ROWS } from "./path";

type Ctx = CanvasRenderingContext2D;

function hash(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function rect(ctx: Ctx, color: string, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
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
