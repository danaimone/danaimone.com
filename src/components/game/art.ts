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
