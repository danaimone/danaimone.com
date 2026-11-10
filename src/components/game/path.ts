import { PROP_SHEET } from "./assets";
import { WORLD_WIDTH } from "./world";

export const PATH_ROWS = 15;
const VERGE_ROWS = 3;
const LIP_ROW = 14;
export const BLEND_WIDTH = 96;
const FIRST_PROP_X = 260;

const hash = (a: number, b = 0) => {
  const value = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
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

// What grows along a stretch of the walk, east to west across Washington: the
// shrub-steppe around Richland, the Puget lowland, the Cascade forest, and the
// subalpine meadows under Rainier. `props` stand on the path's verge, `understory`
// grows in the bank behind it, and `trees` lists species, each with its variants:
// a stand is one species.
export type Surface = {
  name: string;
  until: number;
  tufts: string | null;
  props: number[];
  understory: number[];
  trees: number[][];
  stand: Span;
  standGap: Span;
  texel: Texel;
};

const sand: Texel = (x, row) => {
  if (row < VERGE_ROWS) return pick(["#a8a06a", "#9a9460", "#b3ab76"], hash(x, row));
  if (row === LIP_ROW) return "#8f7250";
  const noise = hash(Math.floor(x / 2), row);
  if ((row + Math.floor(x / 26)) % 5 === 0 && hash(Math.floor(x / 9), row) > 0.55) return "#c9ab7c";
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
  const noise = hash(x, row);
  if (noise > 0.93) return "#6a6c72";
  return pick(["#484a50", "#4e5056", "#44464c"], noise);
};

const sidewalk: Texel = (x, row) => {
  if (row < VERGE_ROWS) return row === 0 ? "#5f8d4c" : "#4f7b40";
  if (row === LIP_ROW) return "#77746e";
  const slab = Math.floor(x / 38);
  if (x % 38 === 0 || row === 8) return "#85827c";
  if (hash(slab, 3) > 0.8 && Math.abs(x % 38 - 12 - row) < 1) return "#8e8b85";
  const noise = hash(x, row);
  return noise > 0.9 ? "#b8b5ae" : pick(["#aaa79f", "#a5a29a"], hash(slab, 7));
};

const pavers: Texel = (x, row) => {
  if (row < VERGE_ROWS) return row === 0 ? "#6c7a52" : "#5a5f46";
  if (row === LIP_ROW) return "#4f3128";
  const course = Math.floor((row - VERGE_ROWS) / 3);
  const shifted = x + (course % 2) * 5;
  if ((row - VERGE_ROWS) % 3 === 2 || shifted % 10 === 0) return "#6b4436";
  const shade = hash(Math.floor(shifted / 10), course);
  return pick(["#a8634b", "#98553f", "#b16f55", "#8f4e3a"], shade);
};

const trail: Texel = (x, row) => {
  if (row < VERGE_ROWS) return pick(["#3f6b3a", "#35602f", "#4b7a42"], hash(x, row));
  if (row === LIP_ROW) return "#3f2c1f";
  const noise = hash(x, row);
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
  const grain = hash(Math.floor(x / 5), plank * 3 + row);
  return pick(["#9c7044", "#8d633b", "#a67a4c"], hash(plank, 5) * 0.7 + grain * 0.3);
};

export const SURFACES: Surface[] = [
  { name: "sand", until: ROAD.from, tufts: "#8c8a55", props: [...STEPPE_PLANTS, ROCK], understory: [...SAGEBRUSH, ...BUNCHGRASS], trees: [COTTONWOODS], stand: [1, 2], standGap: [260, 520], texel: sand },
  { name: "asphalt", until: ROAD.to, tufts: null, props: [], understory: [...SNOWBERRY, ...OREGON_GRAPE], trees: [MAPLE, MADRONES, YOUNG_FIRS], stand: [1, 3], standGap: [110, 260], texel: asphalt },
  { name: "sidewalk", until: 2800, tufts: "#466f3b", props: SEATTLE_PLANTS, understory: [...RHODODENDRONS, ...OREGON_GRAPE, ...SNOWBERRY], trees: [MADRONES, MAPLE, CEDARS, FIR_TREES], stand: [1, 3], standGap: [100, 240], texel: sidewalk },
  { name: "pavers", until: 3420, tufts: null, props: [...FERNS, ...OREGON_GRAPE, HUCKLEBERRY, FIREWEED], understory: [...FERNS, FIREWEED, HUCKLEBERRY, ...OREGON_GRAPE, ...SNOWBERRY], trees: [[...FIR_TREES, ...YOUNG_FIRS], CEDARS], stand: [2, 4], standGap: [50, 130], texel: pavers },
  { name: "trail", until: 3860, tufts: "#2f5a2b", props: [...FERNS, HUCKLEBERRY, FIREWEED, LUPINE, ROCK, MUSHROOMS], understory: [...FERNS, HUCKLEBERRY, LUPINE, FIREWEED], trees: [CEDARS, [...FIR_TREES, ...YOUNG_FIRS], HEMLOCKS], stand: [3, 5], standGap: [30, 80], texel: trail },
  { name: "boardwalk", until: Infinity, tufts: null, props: SUBALPINE_FLOWERS, understory: SUBALPINE_FLOWERS, trees: [HEMLOCKS, YOUNG_FIRS], stand: [2, 3], standGap: [60, 150], texel: boardwalk },
];

export const surfaceAt = (x: number) => SURFACES[surfaceIndexAt(x)];

export function surfaceIndexAt(x: number) {
  return SURFACES.findIndex((surface) => x < surface.until);
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((value) => (value + 0.5) / 16);

function blendedSurface(x: number, row: number) {
  const index = surfaceIndexAt(x);
  const next = SURFACES[index + 1];
  if (!next) return SURFACES[index];
  const reach = (SURFACES[index].until - x) / BLEND_WIDTH;
  if (reach >= 1) return SURFACES[index];
  return 1 - reach > BAYER[(row & 3) * 4 + (x & 3)] ? next : SURFACES[index];
}

const between = ([least, most]: Span, random: () => number) => least + random() * (most - least);
const STAND_SPACING: Span = [0.42, 0.7];
const UNDERSTORY_GAP: Span = [34, 100];

export type Tree = { x: number; kind: number; flipped: boolean };

// Trees along a parallax layer `width` wide, where `surfaceAtLayerX` says what
// grows at a layer position. A stand is one species in its variants, set close
// enough to read as a stand without piling up, and the next stand is a different
// species when the stretch has more than one. Trees are mirrored at random, and
// two of the same variant side by side always face opposite ways.
export function plantStands(random: () => number, from: number, width: number, treeWidth: number, surfaceAtLayerX: (x: number) => Surface) {
  const trees: Tree[] = [];
  let previous: number[] = [];
  let x = from;
  while (x < width) {
    const surface = surfaceAtLayerX(x);
    const choices = surface.trees.length > 1 ? surface.trees.filter((species) => species !== previous) : surface.trees;
    const species = choices[Math.floor(random() * choices.length)];
    previous = species;
    const count = Math.round(between(surface.stand, random));
    let last = null as Tree | null;
    for (let i = 0; i < count && x < width && surfaceAtLayerX(x) === surface; i++) {
      const kind: number = species[Math.floor(random() * species.length)];
      const flipped: boolean = kind === last?.kind ? !last.flipped : random() < 0.5;
      last = { x: Math.round(x), kind, flipped };
      trees.push(last);
      x += treeWidth * between(STAND_SPACING, random);
    }
    x += between(surface.standGap, random);
  }
  return trees;
}

// Plants dotted through the bank behind the path, in layer positions.
export function plantUnderstory(random: () => number, width: number, surfaceAtLayerX: (x: number) => Surface) {
  const plants: { x: number; kind: number; depth: number; flipped: boolean }[] = [];
  for (let x = between(UNDERSTORY_GAP, random); x < width; x += between(UNDERSTORY_GAP, random)) {
    const { understory } = surfaceAtLayerX(x);
    plants.push({ x: Math.round(x), kind: understory[Math.floor(random() * understory.length)], depth: random(), flipped: random() < 0.5 });
  }
  return plants;
}

export function placeProps(random: () => number) {
  const props: { x: number; kind: number }[] = [];
  for (let x = FIRST_PROP_X; x < WORLD_WIDTH; x += 70 + random() * 170) {
    const roll = random();
    const surface = SURFACES[surfaceIndexAt(x)];
    const clearOfBlend = x + PROP_SHEET.width < surface.until - BLEND_WIDTH;
    if (surface.props.length && clearOfBlend) {
      props.push({ x: Math.round(x), kind: surface.props[Math.floor(roll * surface.props.length)] });
    }
  }
  return props;
}

export function buildPath() {
  const canvas = document.createElement("canvas");
  canvas.width = WORLD_WIDTH;
  canvas.height = PATH_ROWS + 2;
  const ctx = canvas.getContext("2d")!;
  for (let x = 0; x < WORLD_WIDTH; x++) {
    for (let row = 0; row < PATH_ROWS; row++) {
      ctx.fillStyle = blendedSurface(x, row).texel(x, row);
      ctx.fillRect(x, row + 2, 1, 1);
    }
    const tuft = SURFACES[surfaceIndexAt(x)].tufts;
    const noise = hash(x, 11);
    if (tuft && noise < 0.2) {
      ctx.fillStyle = tuft;
      const height = noise < 0.06 ? 2 : 1;
      ctx.fillRect(x, 2 - height, 1, height);
    }
  }
  return canvas;
}
