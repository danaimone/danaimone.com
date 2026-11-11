import { bayerThreshold } from "./math";
import { PROP_SHEET } from "./sheets";
import { WORLD_WIDTH } from "./world";

export const PATH_ROWS = 15;
const VERGE_ROWS = 3;
const LIP_ROW = 14;
export const BLEND_WIDTH = 96;
const FIRST_PROP_X = 260;

const pathNoise = (a: number, b = 0) => {
  const value = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return value - Math.floor(value);
};

const soilNoise = (n: number) => {
  const value = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
};

const pick = (colors: string[], noise: number) => colors[Math.floor(noise * colors.length)];

type Texel = (x: number, row: number) => string;
const kinds = (first: number, count: number) => Array.from({ length: count }, (_, i) => first + i);
const STEPPE_PLANTS = kinds(0, 8);
const SAGEBRUSH = [0, 1];
const BUNCHGRASS = [6, 7];
const SEATTLE_PLANTS = kinds(8, 8);
const FERNS = [8, 9];
const SNOWBERRY = [10, 11];
const OREGON_GRAPE = [12, 13];
const RHODODENDRONS = [14, 15];
const LUPINE = 16;
const BEARGRASS = 17;
const AVALANCHE_LILY = 18;
const PAINTBRUSH = 19;
const HUCKLEBERRY = 20;
const ASTER = 21;
const PASQUEFLOWER = 22;
const FIREWEED = 23;
const SUBALPINE_FLOWERS = [LUPINE, BEARGRASS, AVALANCHE_LILY, PAINTBRUSH, ASTER, PASQUEFLOWER];
const ROCK = 24;
const MUSHROOMS = 25;
const FIR_TREES = [0, 1, 2];
const YOUNG_FIRS = [3, 4];
const MAPLE = [5];
const COTTONWOODS = [6, 7];
const MADRONES = [8, 9];
const CEDARS = [10, 11];
const HEMLOCKS = [12, 13];

type Span = [least: number, most: number];
type Species = number[];

export type Ground = {
  name: string;
  until: number;
  tufts: string | null;
  props: number[];
  understory: number[];
  trees: Species[];
  stand: Span;
  standGap: Span;
  texel: Texel;
};

const sand: Texel = (x, row) => {
  if (row < VERGE_ROWS) return pick(["#a8a06a", "#9a9460", "#b3ab76"], pathNoise(x, row));
  if (row === LIP_ROW) return "#8f7250";
  const noise = pathNoise(Math.floor(x / 2), row);
  if ((row + Math.floor(x / 26)) % 5 === 0 && pathNoise(Math.floor(x / 9), row) > 0.55) return "#c9ab7c";
  if (noise > 0.94) return "#7f6547";
  return pick(["#c2a374", "#b89a6a", "#bd9e6f"], noise);
};

const DASH = { period: 48, length: 26, firstRow: 8, lastRow: 9 };
const ROAD = { from: 1180, to: 2080 };

export function hasCentreDash(x: number) {
  const start = x - (x % DASH.period);
  return x - start < DASH.length && start >= ROAD.from && start + DASH.length <= ROAD.to - BLEND_WIDTH;
}

const asphalt: Texel = (x, row) => {
  if (row < VERGE_ROWS) return row === 0 ? "#b4b2aa" : "#92908a";
  if (row === LIP_ROW) return "#34363b";
  if (row >= DASH.firstRow && row <= DASH.lastRow && hasCentreDash(x)) return "#e3bf45";
  const noise = pathNoise(x, row);
  if (noise > 0.93) return "#6a6c72";
  return pick(["#484a50", "#4e5056", "#44464c"], noise);
};

const sidewalk: Texel = (x, row) => {
  if (row < VERGE_ROWS) return row === 0 ? "#5f8d4c" : "#4f7b40";
  if (row === LIP_ROW) return "#77746e";
  const slab = Math.floor(x / 38);
  if (x % 38 === 0 || row === 8) return "#85827c";
  if (pathNoise(slab, 3) > 0.8 && Math.abs(x % 38 - 12 - row) < 1) return "#8e8b85";
  const noise = pathNoise(x, row);
  return noise > 0.9 ? "#b8b5ae" : pick(["#aaa79f", "#a5a29a"], pathNoise(slab, 7));
};

const pavers: Texel = (x, row) => {
  if (row < VERGE_ROWS) return row === 0 ? "#6c7a52" : "#5a5f46";
  if (row === LIP_ROW) return "#4f3128";
  const course = Math.floor((row - VERGE_ROWS) / 3);
  const shifted = x + (course % 2) * 5;
  if ((row - VERGE_ROWS) % 3 === 2 || shifted % 10 === 0) return "#6b4436";
  const shade = pathNoise(Math.floor(shifted / 10), course);
  return pick(["#a8634b", "#98553f", "#b16f55", "#8f4e3a"], shade);
};

const trail: Texel = (x, row) => {
  if (row < VERGE_ROWS) return pick(["#3f6b3a", "#35602f", "#4b7a42"], pathNoise(x, row));
  if (row === LIP_ROW) return "#3f2c1f";
  const noise = pathNoise(x, row);
  if (noise > 0.9) return "#a06a34";
  if (noise < 0.1) return "#4f3827";
  return pick(["#6e4e36", "#664730", "#74533a"], noise);
};

const boardwalk: Texel = (x, row) => {
  if (row < VERGE_ROWS) return row === 0 ? "#3f6b3a" : "#3a2a1e";
  if (row === LIP_ROW) return "#2f2118";
  const plank = Math.floor(x / 14);
  if (x % 14 === 0) return "#3a2a1e";
  if (x % 14 === 2 && (row === 5 || row === 11)) return "#2a1d14";
  const grain = pathNoise(Math.floor(x / 5), plank * 3 + row);
  return pick(["#9c7044", "#8d633b", "#a67a4c"], pathNoise(plank, 5) * 0.7 + grain * 0.3);
};

export const GROUNDS: Ground[] = [
  { name: "sand", until: ROAD.from, tufts: "#8c8a55", props: [...STEPPE_PLANTS, ROCK], understory: [...SAGEBRUSH, ...BUNCHGRASS], trees: [COTTONWOODS], stand: [1, 2], standGap: [260, 520], texel: sand },
  { name: "asphalt", until: ROAD.to, tufts: null, props: [], understory: [...SNOWBERRY, ...OREGON_GRAPE], trees: [MAPLE, MADRONES, YOUNG_FIRS], stand: [1, 3], standGap: [110, 260], texel: asphalt },
  { name: "sidewalk", until: 2800, tufts: "#466f3b", props: SEATTLE_PLANTS, understory: [...RHODODENDRONS, ...OREGON_GRAPE, ...SNOWBERRY], trees: [MADRONES, MAPLE, CEDARS, FIR_TREES], stand: [1, 3], standGap: [100, 240], texel: sidewalk },
  { name: "pavers", until: 3420, tufts: null, props: [...FERNS, ...OREGON_GRAPE, HUCKLEBERRY, FIREWEED], understory: [...FERNS, FIREWEED, HUCKLEBERRY, ...OREGON_GRAPE, ...SNOWBERRY], trees: [[...FIR_TREES, ...YOUNG_FIRS], CEDARS], stand: [2, 4], standGap: [50, 130], texel: pavers },
  { name: "trail", until: 3860, tufts: "#2f5a2b", props: [...FERNS, HUCKLEBERRY, FIREWEED, LUPINE, ROCK, MUSHROOMS], understory: [...FERNS, HUCKLEBERRY, LUPINE, FIREWEED], trees: [CEDARS, [...FIR_TREES, ...YOUNG_FIRS], HEMLOCKS], stand: [3, 5], standGap: [30, 80], texel: trail },
  { name: "boardwalk", until: Infinity, tufts: null, props: SUBALPINE_FLOWERS, understory: SUBALPINE_FLOWERS, trees: [HEMLOCKS, YOUNG_FIRS], stand: [2, 3], standGap: [60, 150], texel: boardwalk },
];

export const groundAt = (x: number) => GROUNDS[groundIndexAt(x)];

export function groundIndexAt(x: number) {
  return GROUNDS.findIndex((ground) => x < ground.until);
}

function blendedGround(x: number, row: number) {
  const index = groundIndexAt(x);
  const next = GROUNDS[index + 1];
  if (!next) return GROUNDS[index];
  const reach = (GROUNDS[index].until - x) / BLEND_WIDTH;
  if (reach >= 1) return GROUNDS[index];
  return 1 - reach > bayerThreshold(x, row) ? next : GROUNDS[index];
}

const between = ([least, most]: Span, random: () => number) => least + random() * (most - least);
export const STAND_SPACING: Span = [0.42, 0.7];
const UNDERSTORY_GAP: Span = [34, 100];

type Tree = { x: number; kind: number; flipped: boolean };

export function plantStands(random: () => number, from: number, width: number, treeWidth: number, groundAtLayerX: (x: number) => Ground) {
  const trees: Tree[] = [];
  let previous: Species = [];
  let x = from;
  while (x < width) {
    const ground = groundAtLayerX(x);
    const choices = ground.trees.length > 1 ? ground.trees.filter((species) => species !== previous) : ground.trees;
    const species = choices[Math.floor(random() * choices.length)];
    previous = species;
    const count = Math.round(between(ground.stand, random));
    let last = null as Tree | null;
    for (let i = 0; i < count && x < width && groundAtLayerX(x) === ground; i++) {
      const kind: number = species[Math.floor(random() * species.length)];
      const flipped: boolean = kind === last?.kind ? !last.flipped : random() < 0.5;
      last = { x: Math.round(x), kind, flipped };
      trees.push(last);
      x += treeWidth * between(STAND_SPACING, random);
    }
    x += between(ground.standGap, random);
  }
  return trees;
}

export function plantUnderstory(random: () => number, width: number, groundAtLayerX: (x: number) => Ground) {
  const plants: { x: number; kind: number; depth: number; flipped: boolean }[] = [];
  for (let x = between(UNDERSTORY_GAP, random); x < width; x += between(UNDERSTORY_GAP, random)) {
    const { understory } = groundAtLayerX(x);
    plants.push({ x: Math.round(x), kind: understory[Math.floor(random() * understory.length)], depth: random(), flipped: random() < 0.5 });
  }
  return plants;
}

export function placeProps(random: () => number) {
  const props: { x: number; kind: number }[] = [];
  for (let x = FIRST_PROP_X; x < WORLD_WIDTH; x += 70 + random() * 170) {
    const roll = random();
    const ground = groundAt(x);
    const clearOfBlend = x + PROP_SHEET.width < ground.until - BLEND_WIDTH;
    if (ground.props.length && clearOfBlend) {
      props.push({ x: Math.round(x), kind: ground.props[Math.floor(roll * ground.props.length)] });
    }
  }
  return props;
}

export function buildPath() {
  const canvas = document.createElement("canvas");
  canvas.width = WORLD_WIDTH;
  canvas.height = PATH_ROWS + 2;
  const ctx = canvas.getContext("2d")!;
  const pixels = ctx.createImageData(canvas.width, canvas.height);
  const put = (x: number, y: number, color: string) => {
    const rgb = parseInt(color.slice(1), 16);
    const at = (y * canvas.width + x) * 4;
    pixels.data[at] = rgb >> 16;
    pixels.data[at + 1] = (rgb >> 8) & 255;
    pixels.data[at + 2] = rgb & 255;
    pixels.data[at + 3] = 255;
  };
  for (let x = 0; x < WORLD_WIDTH; x++) {
    for (let row = 0; row < PATH_ROWS; row++) put(x, row + 2, blendedGround(x, row).texel(x, row));
    const tuft = groundAt(x).tufts;
    const noise = pathNoise(x, 11);
    if (tuft && noise < 0.2) {
      put(x, 1, tuft);
      if (noise < 0.06) put(x, 0, tuft);
    }
  }
  ctx.putImageData(pixels, 0, 0);
  return canvas;
}

const SOIL_FLECK = { from: 0.6, to: 0.615, topRow: 19, rows: 14 };

export function soilFlecks(worldWidth: number) {
  const flecks: { x: number; row: number }[] = [];
  for (let x = 0; x < worldWidth; x++) {
    const n = soilNoise(x);
    if (n > SOIL_FLECK.from && n < SOIL_FLECK.to) flecks.push({ x, row: SOIL_FLECK.topRow + Math.floor(soilNoise(x + 3) * SOIL_FLECK.rows) });
  }
  return flecks;
}

export function paintGround(ctx: CanvasRenderingContext2D, path: HTMLCanvasElement, flecks: ReturnType<typeof soilFlecks>, left: number, viewW: number, ground: number, viewH: number) {
  ctx.fillStyle = "#3d2f27";
  ctx.fillRect(0, ground + PATH_ROWS, viewW, viewH - ground - PATH_ROWS);
  ctx.drawImage(path, left, 0, viewW + 1, path.height, 0, ground - 2, viewW + 1, path.height);
  ctx.fillStyle = "#2f241e";
  for (const { x, row } of flecks) {
    if (x >= left && x <= left + viewW) ctx.fillRect(x - left, ground + row, 2, 1);
  }
}
