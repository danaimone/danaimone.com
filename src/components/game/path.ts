import { WORLD_WIDTH } from "./world";

export const PATH_ROWS = 15;
const VERGE_ROWS = 3;
const LIP_ROW = 14;
const BLEND_WIDTH = 96;

const hash = (a: number, b = 0) => {
  const value = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return value - Math.floor(value);
};

const pick = (colors: string[], noise: number) => colors[Math.floor(noise * colors.length)];

type Texel = (x: number, row: number) => string;
export type Surface = { name: string; until: number; tufts: string | null; texel: Texel };

const sand: Texel = (x, row) => {
  if (row < VERGE_ROWS) return pick(["#a8a06a", "#9a9460", "#b3ab76"], hash(x, row));
  if (row === LIP_ROW) return "#8f7250";
  const noise = hash(Math.floor(x / 2), row);
  if ((row + Math.floor(x / 26)) % 5 === 0 && hash(Math.floor(x / 9), row) > 0.55) return "#c9ab7c";
  if (noise > 0.94) return "#7f6547";
  return pick(["#c2a374", "#b89a6a", "#bd9e6f"], noise);
};

const asphalt: Texel = (x, row) => {
  if (row < VERGE_ROWS) return row === 0 ? "#b4b2aa" : "#92908a";
  if (row === LIP_ROW) return "#34363b";
  if ((row === 8 || row === 9) && x % 48 < 26) return "#e3bf45";
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
  const stone = hash(Math.floor(x / 15), Math.floor(row / 4));
  if (stone > 0.9 && (x % 15) > 4 && (x % 15) < 12) return row % 4 === 0 ? "#a9a49a" : "#86827a";
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
  { name: "sand", until: 1180, tufts: "#8c8a55", texel: sand },
  { name: "asphalt", until: 2080, tufts: null, texel: asphalt },
  { name: "sidewalk", until: 2800, tufts: "#466f3b", texel: sidewalk },
  { name: "pavers", until: 3420, tufts: null, texel: pavers },
  { name: "trail", until: 3860, tufts: "#2f5a2b", texel: trail },
  { name: "boardwalk", until: Infinity, tufts: null, texel: boardwalk },
];

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
